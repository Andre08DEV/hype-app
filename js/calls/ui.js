// Interfaz de llamadas: saliente, entrante y en curso (pantalla completa o mini).
import { html, toElement, $ } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { state, bus } from '../core/store.js';
import { api } from '../data/api.js';
import { toast, toastError } from '../core/ui.js';
import { formatDuration, vibrate } from '../core/utils.js';
import { avatar } from '../components/common.js';
import { requireUser } from '../components/session.js';
import { CallSession, DemoSession, deferredSignal } from './core.js';

const RING_MS = 35000;
let active = null;    // { el, session, expand }
let incoming = null;  // { call, close }

const isTouch = () => matchMedia('(pointer: coarse)').matches;
const prefs = () => state.settings.calls || {};

// ---------- Sonidos ----------
function playPattern(pattern, every) {
  if (prefs().ringtone === false) return () => {};
  let ctx;
  try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return () => {}; }
  const beep = (freq, start, dur) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    const t = ctx.currentTime + start;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.07, t + 0.02);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.05);
  };
  const play = () => { try { pattern.forEach(([f, s, d]) => beep(f, s, d)); } catch { /* ignore */ } };
  play();
  const timer = setInterval(play, every);
  return () => { clearInterval(timer); ctx.close().catch(() => {}); };
}
const ringtone = () => playPattern([[880, 0, 0.16], [660, 0.2, 0.16], [880, 0.55, 0.16], [660, 0.75, 0.16]], 2600);
const ringback = () => playPattern([[425, 0, 0.9]], 3500);

// ---------- Pantalla de llamada ----------
function openCallScreen({ other, kind, session, role, demo }) {
  const name = other?.displayName || other?.username || 'Usuario';
  const el = toElement(html`<div class="call ${kind}" role="dialog" aria-modal="true" aria-label="Llamada con ${name}">
    <div class="call-stage">
      <video class="call-remote hidden" data-remote autoplay playsinline muted></video>
      <audio data-remote-audio autoplay></audio>
      <div class="call-center" data-center>
        <div class="call-avatar">${avatar(other, 'xxl')}</div>
        <h2>${name}</h2>
        <p class="call-status" data-status>${role === 'caller' ? 'Preparando…' : 'Conectando…'}</p>
      </div>
      <div class="call-top">
        <span class="pill call-pill">${demo ? '🎭 Llamada demo' : kind === 'video' ? '📹 Videollamada' : '📞 Llamada de voz'}</span>
        <span class="call-timer" data-timer></span>
        <span class="spacer"></span>
        <button type="button" class="call-icon" data-c="mini" aria-label="Minimizar" title="Minimizar (sigue navegando)">${icon('minimize', { size: 18 })}</button>
      </div>
      <div class="call-flags" data-flags></div>
      <video class="call-local mirror hidden" data-local autoplay playsinline muted></video>
    </div>
    <div class="call-controls">
      <button type="button" class="call-btn" data-c="mic" aria-label="Micrófono">${icon('mic', { size: 22 })}</button>
      ${kind === 'video' ? html`<button type="button" class="call-btn" data-c="cam" aria-label="Cámara">${icon('video', { size: 22 })}</button>` : ''}
      ${kind === 'video' && isTouch() ? html`<button type="button" class="call-btn" data-c="flip" aria-label="Cambiar de cámara">${icon('refresh', { size: 22 })}</button>` : ''}
      ${kind === 'video' && !isTouch() && navigator.mediaDevices?.getDisplayMedia ? html`<button type="button" class="call-btn" data-c="screen" aria-label="Compartir pantalla" title="Compartir pantalla">${icon('monitor', { size: 22 })}</button>` : ''}
      <button type="button" class="call-btn hangup" data-c="hangup" aria-label="Colgar">${icon('phoneOff', { size: 24 })}</button>
    </div>
  </div>`);
  document.body.appendChild(el);
  document.body.classList.add('call-open');

  const $remote = $('[data-remote]', el);
  const $audio = $('[data-remote-audio]', el);
  const $local = $('[data-local]', el);
  const $center = $('[data-center]', el);
  const $status = $('[data-status]', el);
  const $timer = $('[data-timer]', el);
  const $flags = $('[data-flags]', el);
  let remoteCam = kind === 'video';
  let connected = false;
  let timer = null;
  let errShown = false;

  const paintLocal = (stream) => {
    $local.srcObject = stream || session.localStream;
    const showing = kind === 'video' && (!!session.screenTrack || (session.hasVideo && session.camOn));
    $local.classList.toggle('hidden', !showing);
    $local.classList.toggle('mirror', !session.screenTrack && session.facingMode === 'user');
  };
  const paintRemote = () => {
    const hasRemoteVideo = session.remoteStream.getVideoTracks().some((t) => t.readyState === 'live');
    const showVideo = connected && kind === 'video' && remoteCam && hasRemoteVideo;
    $remote.classList.toggle('hidden', !showVideo);
    $center.classList.toggle('hidden', showVideo);
    el.classList.toggle('has-video', showVideo);
    el.classList.toggle('connected', connected);
  };
  const paintButtons = () => {
    const mic = $('[data-c="mic"]', el);
    mic.classList.toggle('off', !session.micOn);
    mic.innerHTML = String(icon(session.micOn ? 'mic' : 'micOff', { size: 22 }));
    mic.disabled = !session.hasAudio;
    mic.setAttribute('aria-pressed', String(!session.micOn));
    const cam = $('[data-c="cam"]', el);
    if (cam) {
      cam.classList.toggle('off', !session.camOn);
      cam.innerHTML = String(icon(session.camOn ? 'video' : 'videoOff', { size: 22 }));
      cam.disabled = !session.hasVideo;
      cam.setAttribute('aria-pressed', String(!session.camOn));
    }
    $('[data-c="screen"]', el)?.classList.toggle('on', !!session.screenTrack);
  };
  const startTimer = () => {
    const tick = () => { $timer.textContent = formatDuration(session.duration()); };
    tick();
    clearInterval(timer);
    timer = setInterval(tick, 1000);
  };
  const expand = () => { el.classList.remove('mini'); document.body.classList.add('call-open'); };

  session.on('local-stream', (s) => { paintLocal(s); paintButtons(); });
  session.on('remote-stream', (s) => {
    $remote.srcObject = s;
    $audio.srcObject = s;
    $audio.play().catch(() => {});
    $remote.play().catch(() => {});
    s.getVideoTracks().forEach((t) => { t.onunmute = paintRemote; t.onended = paintRemote; });
    paintRemote();
  });
  session.on('remote-state', ({ mic, cam }) => {
    remoteCam = cam;
    $flags.innerHTML = mic ? '' : String(html`<span class="pill call-pill">${icon('micOff', { size: 13 })} ${name.split(' ')[0]} silenció su micrófono</span>`);
    paintRemote();
  });
  session.on('state', (s) => {
    const texts = { ringing: role === 'caller' ? 'Llamando…' : 'Sonando…', connecting: 'Conectando…', reconnecting: 'Reconectando…' };
    if (s === 'connected') { connected = true; $status.textContent = ''; startTimer(); }
    else if (texts[s]) $status.textContent = texts[s];
    paintRemote();
  });
  session.on('error', (err) => {
    if (errShown) return;
    errShown = true;
    toast(err.message, { type: 'error', duration: 6500 });
  });
  session.on('ended', ({ reason, duration }) => {
    clearInterval(timer);
    const texts = { declined: 'Llamada rechazada', busy: 'Está en otra llamada', missed: 'No contestó', failed: 'No se pudo conectar' };
    $status.textContent = duration ? `Llamada finalizada · ${formatDuration(duration)}` : (texts[reason] || 'Llamada finalizada');
    connected = false;
    paintRemote();
    el.classList.add('ended');
    el.classList.remove('mini');
    document.body.classList.remove('call-open');
    setTimeout(() => { el.remove(); if (active?.el === el) active = null; }, 1800);
  });

  el.addEventListener('click', async (e) => {
    const c = e.target.closest('[data-c]')?.dataset.c;
    if (el.classList.contains('mini') && c !== 'hangup' && c !== 'mini') { expand(); return; }
    if (c === 'mini') { const mini = el.classList.toggle('mini'); document.body.classList.toggle('call-open', !mini); return; }
    if (c === 'mic') { session.setMic(!session.micOn); paintButtons(); }
    if (c === 'cam') { session.setCam(!session.camOn); paintLocal(); paintButtons(); }
    if (c === 'flip' && !(await session.flipCamera())) toast('No se pudo cambiar de cámara');
    if (c === 'screen') {
      try { await session.toggleScreen(); paintLocal(session.screenTrack ? new MediaStream([session.screenTrack]) : null); paintButtons(); }
      catch (err) { if (err?.name !== 'NotAllowedError') toastError(err); }
    }
    if (c === 'hangup') session.hangup();
  });

  paintLocal();
  paintButtons();
  paintRemote();
  return { el, session, expand };
}

function logLabel(kind) { return kind === 'video' ? '📹 Videollamada' : '📞 Llamada de voz'; }

// ---------- Llamada saliente ----------
export async function startCall(other, { conversationId = null, kind = 'video' } = {}) {
  if (!requireUser('hacer llamadas')) return;
  if (active) { toast('Ya tienes una llamada en curso'); active.expand(); return; }
  if (!other?.id || other.id === state.user.id) return;
  if (!window.isSecureContext) { toastError(new Error('Las llamadas necesitan HTTPS (o localhost).')); return; }
  const demo = api.mode !== 'cloud';
  try {
    if (!conversationId) conversationId = await api.openConversation(other.id);
  } catch (err) { toastError(err); return; }

  const p = prefs();
  const signal = demo ? null : deferredSignal();
  const session = demo
    ? new DemoSession({ kind, other, startMuted: p.startMuted, startCameraOff: p.startCameraOff })
    : new CallSession({ role: 'caller', kind, signal, startMuted: p.startMuted, startCameraOff: p.startCameraOff });
  const ui = openCallScreen({ other, kind, session, role: 'caller', demo });
  active = ui;
  let call = null;
  let stopRing = () => {};
  let ringTimer = null;

  const offUpdate = bus.on('call:update', (c) => {
    if (!call || c.id !== call.id) return;
    if (c.status === 'declined' || c.status === 'busy') session.end(c.status);
    else if (['canceled', 'ended', 'missed'].includes(c.status)) session.end('remote');
  });
  const offSignalError = bus.on('call:signal-error', ({ callId }) => {
    if (call && callId === call.id && session.state !== 'connected') {
      toast('No se pudo abrir el canal de la llamada (Supabase Realtime).', { type: 'error' });
      session.end('failed');
    }
  });

  session.on('state', (s) => {
    if (s === 'ringing') stopRing = ringback();
    else stopRing();
  });
  session.on('ended', ({ reason, duration }) => {
    stopRing();
    clearTimeout(ringTimer);
    offUpdate();
    offSignalError();
    if (!call && !demo) return; // no llegó a sonar
    if (call && !demo) {
      const status = duration ? 'ended' : ({ missed: 'missed', declined: 'declined', busy: 'busy' })[reason] || 'canceled';
      if (reason !== 'declined' && reason !== 'busy') api.updateCall(call.id, { status }).catch(() => {});
    }
    const label = logLabel(kind);
    const text = duration ? `${label} · ${formatDuration(duration)}`
      : reason === 'declined' ? `${label} rechazada`
        : reason === 'busy' ? `${label}: estaba ocupado`
          : reason === 'failed' ? `${label}: no se pudo conectar`
            : reason === 'local' ? `${label} cancelada`
              : `${label} sin respuesta`;
    api.sendMessage(conversationId, text).catch(() => {});
  });

  try {
    await session.startAsCaller();
    if (session.state === 'ended') return;
    if (!demo) {
      call = await api.startCall({ conversationId, calleeId: other.id, kind });
      signal.attach(api.callSignal(call.id));
    }
    ringTimer = setTimeout(() => { if (!session.startedAt) session.end('missed'); }, RING_MS);
  } catch (err) {
    toastError(err);
    session.end('failed');
  }
}

// ---------- Llamada entrante ----------
async function acceptCall(call, other, kind) {
  const p = prefs();
  const demo = !!call.simulated;
  let signal = null;
  if (!demo) {
    api.updateCall(call.id, { status: 'accepted' }).catch(() => {});
    signal = api.callSignal(call.id);
  }
  const session = demo
    ? new DemoSession({ kind, other, startMuted: p.startMuted, startCameraOff: p.startCameraOff })
    : new CallSession({ role: 'callee', kind, signal, startMuted: p.startMuted, startCameraOff: p.startCameraOff });
  active = openCallScreen({ other, kind, session, role: 'callee', demo });
  const offUpdate = bus.on('call:update', (c) => { if (c.id === call.id && ['canceled', 'ended', 'missed'].includes(c.status)) session.end('remote'); });
  const connTimer = setTimeout(() => { if (!session.startedAt) session.end('failed'); }, 25000);
  session.on('connected', () => clearTimeout(connTimer));
  session.on('ended', ({ duration }) => {
    offUpdate();
    clearTimeout(connTimer);
    if (!demo && duration) api.updateCall(call.id, { status: 'ended' }).catch(() => {});
    if (demo) api.sendMessage(call.conversationId, duration ? `${logLabel(kind)} · ${formatDuration(duration)}` : `${logLabel(kind)} sin conectar`).catch(() => {});
  });
  try { await session.accept(); } catch (err) { toastError(err); session.end('failed'); }
}

function showIncoming(call) {
  const other = call.other || { id: call.callerId, username: 'alguien', displayName: 'Alguien' };
  const name = other.displayName || other.username;
  const el = toElement(html`<div class="call-incoming" role="alertdialog" aria-label="Llamada entrante de ${name}">
    <div class="ci-avatar">${avatar(other, 'lg')}</div>
    <div class="ci-meta"><b class="ellipsis">${name}</b><span>${call.kind === 'video' ? '📹 Videollamada entrante' : '📞 Llamada de voz entrante'}${call.simulated ? ' · demo' : ''}</span></div>
    <div class="ci-actions">
      <button type="button" class="call-btn hangup" data-decline aria-label="Rechazar" title="Rechazar">${icon('phoneOff', { size: 20 })}</button>
      ${call.kind === 'video' ? html`<button type="button" class="call-btn accept-audio" data-accept="audio" aria-label="Contestar solo con audio" title="Solo audio">${icon('phone', { size: 20 })}</button>` : ''}
      <button type="button" class="call-btn accept" data-accept="${call.kind}" aria-label="Contestar" title="Contestar">${icon(call.kind === 'video' ? 'video' : 'phone', { size: 20 })}</button>
    </div>
  </div>`);
  document.body.appendChild(el);
  const stopRing = ringtone();
  vibrate([300, 200, 300]);
  const vib = setInterval(() => vibrate([300, 200, 300]), 2600);
  if (document.hidden && state.settings.notify?.browser && 'Notification' in window && Notification.permission === 'granted') {
    try { new Notification('Hype', { body: `${call.kind === 'video' ? '📹' : '📞'} ${name} te está llamando`, icon: 'assets/icon.svg', tag: `call-${call.id}`, requireInteraction: true }); } catch { /* ignore */ }
  }
  let accepted = false;
  const close = () => {
    clearTimeout(timeout);
    clearInterval(vib);
    stopRing();
    offUpdate();
    el.remove();
    if (incoming?.el === el) incoming = null;
  };
  const timeout = setTimeout(close, RING_MS + 5000);
  const offUpdate = bus.on('call:update', (c) => { if (c.id === call.id && c.status !== 'ringing' && !accepted) close(); });
  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-decline]')) {
      close();
      if (!call.simulated) api.updateCall(call.id, { status: 'declined' }).catch(() => {});
      return;
    }
    const acc = e.target.closest('[data-accept]');
    if (acc) { accepted = true; close(); acceptCall(call, other, acc.dataset.accept); }
  });
  incoming = { el, call, close };
}

let ready = false;
export function initCalls() {
  if (ready) return;
  ready = true;
  bus.on('call:incoming', (call) => {
    if (!state.user || !call) return;
    const decline = (status) => { if (!call.simulated) api.updateCall(call.id, { status }).catch(() => {}); };
    if (prefs().allowIncoming === false) { decline('declined'); return; }
    if (active || incoming) { decline('busy'); return; }
    if (Date.now() - new Date(call.createdAt).getTime() > RING_MS + 5000) return;
    showIncoming(call);
  });
  window.addEventListener('beforeunload', () => { if (active && active.session.state !== 'ended') active.session.hangup(); });
}

export const inCall = () => !!active;
