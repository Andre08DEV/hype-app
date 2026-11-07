// Adjuntos de mensajes privados: notas de voz, fotos y GIFs.
// En la nube los archivos van a un bucket PRIVADO (dm-media) y se leen con enlaces firmados.
import { html, raw, esc } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { api } from '../data/api.js';
import { formatDuration, hashString } from '../core/utils.js';
import { openLightbox } from '../core/ui.js';
import { srcAttr } from './common.js';

export const MAX_VOICE_SEC = 120;
const BARS = 36;

/** Forma de onda decorativa si la nota no trae la suya. */
function fakeWave(seed) {
  let h = hashString(seed || 'x');
  return Array.from({ length: BARS }, () => { h = (Math.imul(h, 1103515245) + 12345) >>> 0; return 25 + (h % 70); });
}

function normWave(wave, seed) {
  if (!Array.isArray(wave) || wave.length < 4) return fakeWave(seed);
  const out = [];
  for (let i = 0; i < BARS; i++) {
    const v = Number(wave[Math.floor((i * wave.length) / BARS)]) || 0;
    out.push(Math.max(12, Math.min(100, Math.round(v))));
  }
  return out;
}

/** Atributo de origen: URL directa (idb:/https) o ruta privada que se firma después. */
function mediaSrc(m) {
  if (m.path) return raw(`data-dm-path="${esc(m.path)}"`);
  return srcAttr(m.url);
}

export function renderDmMedia(m, id = '') {
  if (!m?.type) return '';
  if (m.type === 'audio') {
    const wave = normWave(m.wave, id);
    return html`<div class="voice-note" data-voice data-dur="${Number(m.duration) || 0}">
      <button type="button" class="vn-play" data-vn-play aria-label="Reproducir nota de voz">${icon('play', { size: 18 })}</button>
      <div class="vn-wave" data-vn-seek aria-hidden="true">${raw(wave.map((v) => `<i style="height:${v}%"></i>`).join(''))}</div>
      <span class="vn-time" data-vn-time>${formatDuration(Number(m.duration) || 0) || '0:00'}</span>
      <button type="button" class="vn-speed" data-vn-speed aria-label="Velocidad de reproducción">1×</button>
      <audio preload="metadata" ${mediaSrc(m)}></audio>
    </div>`;
  }
  const ratio = m.width && m.height ? `aspect-ratio:${m.width}/${m.height}` : '';
  return html`<button type="button" class="dm-photo ${m.type === 'gif' ? 'gif' : ''}" data-dm-photo aria-label="${m.type === 'gif' ? 'GIF' : 'Ver foto'}"><img ${mediaSrc(m)} alt="${m.alt || ''}" loading="lazy" style="${ratio}">${m.type === 'gif' ? html`<span class="gif-badge">GIF</span>` : ''}</button>`;
}

/** Firma las rutas privadas pendientes dentro de root. */
export async function resolveDmPaths(root) {
  const els = [...root.querySelectorAll('[data-dm-path]:not([data-dm-done])')];
  if (!els.length) return;
  els.forEach((el) => { el.dataset.dmDone = '1'; });
  try {
    const urls = await api.resolveDmMedia(els.map((el) => el.dataset.dmPath));
    els.forEach((el) => { const u = urls[el.dataset.dmPath]; if (u) el.src = u; else el.closest('.dm-photo, .voice-note')?.classList.add('broken'); });
  } catch (err) {
    els.forEach((el) => el.closest('.dm-photo, .voice-note')?.classList.add('broken'));
    console.warn('[mensajes] adjuntos', err.message);
  }
}

// ---------------- Reproductor ----------------
let playing = null;

function paintProgress(note, audio) {
  const dur = Number(note.dataset.dur) || audio.duration || 0;
  const p = dur && Number.isFinite(dur) ? Math.min(1, audio.currentTime / dur) : 0;
  const bars = note.querySelectorAll('.vn-wave i');
  const on = Math.round(p * bars.length);
  bars.forEach((b, i) => b.classList.toggle('on', i < on));
  note.querySelector('[data-vn-time]').textContent = formatDuration(audio.paused && !audio.currentTime ? dur : audio.currentTime) || '0:00';
}

function wire(note) {
  const audio = note.querySelector('audio');
  if (audio.dataset.wired) return audio;
  audio.dataset.wired = '1';
  const btn = note.querySelector('[data-vn-play]');
  const setIcon = (isPlaying) => { btn.innerHTML = String(icon(isPlaying ? 'pause' : 'play', { size: 18 })); btn.setAttribute('aria-label', isPlaying ? 'Pausar' : 'Reproducir nota de voz'); note.classList.toggle('playing', isPlaying); };
  audio.addEventListener('play', () => setIcon(true));
  audio.addEventListener('pause', () => setIcon(false));
  audio.addEventListener('timeupdate', () => paintProgress(note, audio));
  audio.addEventListener('ended', () => { setIcon(false); audio.currentTime = 0; paintProgress(note, audio); if (playing === audio) playing = null; });
  return audio;
}

/** Delegación de eventos del reproductor y del visor de fotos. */
export function bindDmMedia(root) {
  root.addEventListener('click', async (e) => {
    const play = e.target.closest('[data-vn-play]');
    if (play) {
      const note = play.closest('[data-voice]');
      const audio = wire(note);
      if (note.classList.contains('broken')) return;
      if (!audio.paused) { audio.pause(); return; }
      if (playing && playing !== audio) playing.pause();
      playing = audio;
      if (!audio.src && audio.dataset.dmPath) await resolveDmPaths(note);
      audio.play().catch(() => note.classList.add('broken'));
      return;
    }
    const speed = e.target.closest('[data-vn-speed]');
    if (speed) {
      const audio = wire(speed.closest('[data-voice]'));
      const next = { 1: 1.5, 1.5: 2, 2: 1 }[audio.playbackRate] || 1;
      audio.playbackRate = next;
      speed.textContent = `${next}×`;
      return;
    }
    const seek = e.target.closest('[data-vn-seek]');
    if (seek) {
      const note = seek.closest('[data-voice]');
      const audio = wire(note);
      const dur = Number(note.dataset.dur) || audio.duration;
      if (!dur || !Number.isFinite(dur)) return;
      const r = seek.getBoundingClientRect();
      try { audio.currentTime = Math.max(0, Math.min(dur, ((e.clientX - r.left) / r.width) * dur)); paintProgress(note, audio); } catch { /* el archivo no permite saltar */ }
      return;
    }
    const photo = e.target.closest('[data-dm-photo]');
    if (photo && !photo.classList.contains('gif')) {
      const img = photo.querySelector('img');
      const url = img?.currentSrc || img?.src;
      if (url) openLightbox([{ type: 'image', url, alt: img.alt }], 0);
    }
  });
}

// ---------------- Grabadora ----------------
const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/aac'];

export const canRecordVoice = () => typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

export function micErrorMessage(err) {
  const n = err?.name || '';
  if (n === 'NotAllowedError' || n === 'SecurityError') return 'Permiso de micrófono denegado. Actívalo en el candado de la barra de direcciones.';
  if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'No se encontró ningún micrófono en este dispositivo.';
  if (n === 'NotReadableError') return 'El micrófono está siendo usado por otra app.';
  if (!window.isSecureContext) return 'Para grabar notas de voz la web tiene que abrirse con HTTPS.';
  return err?.message || 'No se pudo usar el micrófono.';
}

/**
 * Empieza a grabar. Devuelve { stop(): Promise<{ blob, duration, wave }>, cancel(), onTick(fn) }.
 * onTick recibe (segundos, nivel 0-1) unas 10 veces por segundo.
 */
export async function startVoiceRecording({ onTick, onLimit } = {}) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  const mimeType = MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported?.(t)) || '';
  const rec = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 48000 });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
  let ctx = null, analyser = null, buf = null;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(analyser);
    buf = new Uint8Array(analyser.fftSize);
  } catch { analyser = null; }
  const levels = [];
  const started = performance.now();
  rec.start(250);
  const level = () => {
    if (!analyser) return 0.3 + Math.random() * 0.3;
    analyser.getByteTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
    return Math.min(1, Math.sqrt(sum / buf.length) * 4);
  };
  let done = false;
  const timer = setInterval(() => {
    const sec = (performance.now() - started) / 1000;
    const l = level();
    levels.push(l);
    onTick?.(sec, l);
    if (sec >= MAX_VOICE_SEC) onLimit?.();
  }, 100);
  const cleanup = () => {
    done = true;
    clearInterval(timer);
    stream.getTracks().forEach((t) => t.stop());
    ctx?.close().catch(() => {});
  };
  return {
    mimeType: rec.mimeType || mimeType || 'audio/webm',
    stop() {
      return new Promise((resolve) => {
        if (done) { resolve(null); return; }
        const duration = Math.min(MAX_VOICE_SEC, (performance.now() - started) / 1000);
        rec.onstop = () => {
          cleanup();
          const type = (rec.mimeType || mimeType || 'audio/webm').split(';')[0];
          const blob = new Blob(chunks, { type });
          // Reducimos los niveles a BARS barras (0-100) para dibujar la onda real
          const wave = [];
          for (let i = 0; i < BARS; i++) {
            const a = Math.floor((i * levels.length) / BARS), b = Math.max(a + 1, Math.floor(((i + 1) * levels.length) / BARS));
            const slice = levels.slice(a, b);
            wave.push(slice.reduce((x, y) => Math.max(x, y), 0) || 0);
          }
          // Normalizamos respecto al pico para que una grabación bajita también tenga forma
          const peak = Math.max(...wave, 0.001);
          const shaped = wave.map((v) => Math.round(15 + (v / peak) * 85));
          resolve({ blob, duration: Math.round(duration * 10) / 10, wave: shaped });
        };
        try { rec.stop(); } catch { cleanup(); resolve(null); }
      });
    },
    cancel() {
      if (done) return;
      rec.onstop = null;
      try { rec.stop(); } catch { /* ya parado */ }
      cleanup();
    },
  };
}
