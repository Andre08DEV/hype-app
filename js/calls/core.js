// Núcleo de llamadas: WebRTC 1 a 1 + medios + protocolo de señalización.
// No depende de la interfaz ni del backend: recibe un "signal" con
// { send(msg), onMessage(fn), close() } (Supabase Realtime, BroadcastChannel…).

const DEFAULT_ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];

export function iceServers() {
  const extra = window.HYPE_CONFIG?.iceServers;
  return Array.isArray(extra) && extra.length ? [...DEFAULT_ICE, ...extra] : DEFAULT_ICE;
}

export function mediaErrorMessage(err) {
  const n = err?.name || '';
  if (n === 'NotAllowedError' || n === 'SecurityError') return 'Permiso de cámara o micrófono denegado. Actívalo en el candado de la barra de direcciones.';
  if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'No se encontró cámara o micrófono en este dispositivo.';
  if (n === 'NotReadableError') return 'La cámara o el micrófono están siendo usados por otra app.';
  if (!window.isSecureContext) return 'Las llamadas necesitan HTTPS (o localhost).';
  return err?.message || 'No se pudo acceder a la cámara o al micrófono.';
}

/** Pide cámara/micrófono con alternativas: vídeo+audio → solo audio → solo vídeo → nada. */
export async function openMedia({ video = true, audio = true, facingMode = 'user' } = {}) {
  const md = navigator.mediaDevices;
  if (!md?.getUserMedia) return { stream: new MediaStream(), hasVideo: false, hasAudio: false, error: 'Tu navegador no permite llamadas (getUserMedia no disponible).' };
  const vc = video ? { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } } : false;
  const ac = audio ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true } : false;
  let firstError = null;
  const attempts = [[vc, ac], [false, ac], [vc, false]].filter(([v, a]) => v || a);
  for (const [v, a] of attempts) {
    try {
      const stream = await md.getUserMedia({ video: v, audio: a });
      return { stream, hasVideo: stream.getVideoTracks().length > 0, hasAudio: stream.getAudioTracks().length > 0, error: firstError ? mediaErrorMessage(firstError) : null };
    } catch (err) {
      firstError ||= err;
      if (err?.name === 'NotAllowedError' && v && a) continue;
    }
  }
  return { stream: new MediaStream(), hasVideo: false, hasAudio: false, error: mediaErrorMessage(firstError) };
}

/**
 * Sesión de llamada.
 *   role: 'caller' | 'callee'
 *   kind: 'video' | 'audio'
 *   signal: { send, onMessage, close }
 * Eventos (on): state, remote-stream, remote-state, local-stream, error, connected, ended
 */
export class CallSession {
  constructor({ role, kind = 'video', signal, ice = iceServers(), startMuted = false, startCameraOff = false }) {
    this.role = role;
    this.kind = kind;
    this.signal = signal;
    this.ice = ice;
    this.state = 'idle';
    this.pc = null;
    this.localStream = new MediaStream();
    this.remoteStream = new MediaStream();
    this.micOn = !startMuted;
    this.camOn = kind === 'video' && !startCameraOff;
    this.hasVideo = false;
    this.hasAudio = false;
    this.facingMode = 'user';
    this.screenTrack = null;
    this.pendingIce = [];
    this.handlers = {};
    this.readyTimer = null;
    this.gotOffer = false;
    this.iceRestarted = false;
    this.startedAt = 0;
    this.offSignal = signal.onMessage((m) => this._onSignal(m).catch((err) => this._emit('error', err)));
  }

  on(event, fn) { (this.handlers[event] ||= []).push(fn); return this; }
  _emit(event, payload) { (this.handlers[event] || []).forEach((fn) => { try { fn(payload); } catch (err) { console.error(err); } }); }
  _setState(s) { if (this.state === s || this.state === 'ended') return; this.state = s; this._emit('state', s); }

  async prepareMedia() {
    const res = await openMedia({ video: this.kind === 'video', audio: true, facingMode: this.facingMode });
    this.localStream = res.stream;
    this.hasVideo = res.hasVideo;
    this.hasAudio = res.hasAudio;
    if (!this.hasVideo) this.camOn = false;
    this.localStream.getAudioTracks().forEach((t) => { t.enabled = this.micOn; });
    this.localStream.getVideoTracks().forEach((t) => { t.enabled = this.camOn; });
    if (res.error) this._emit('error', new Error(res.error));
    this._emit('local-stream', this.localStream);
    return res;
  }

  _createPeer() {
    const pc = new RTCPeerConnection({ iceServers: this.ice });
    this.pc = pc;
    const tracks = this.localStream.getTracks();
    tracks.forEach((t) => pc.addTrack(t, this.localStream));
    // Recibir aunque no enviemos (sin cámara/micrófono, o llamada de voz)
    if (!this.hasAudio) pc.addTransceiver('audio', { direction: 'recvonly' });
    if (this.kind === 'video' && !this.hasVideo) pc.addTransceiver('video', { direction: 'recvonly' });
    pc.ontrack = (e) => {
      const stream = e.streams[0];
      (stream ? stream.getTracks() : [e.track]).forEach((t) => { if (!this.remoteStream.getTracks().includes(t)) this.remoteStream.addTrack(t); });
      this._emit('remote-stream', this.remoteStream);
    };
    pc.onicecandidate = (e) => { if (e.candidate) this.signal.send({ type: 'ice', candidate: e.candidate.toJSON() }); };
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === 'connected') {
        if (!this.startedAt) this.startedAt = Date.now();
        this._setState('connected');
        this._emit('connected');
        this._sendState();
      } else if (s === 'disconnected') this._setState('reconnecting');
      else if (s === 'failed') {
        if (this.role === 'caller' && !this.iceRestarted) { this.iceRestarted = true; this._setState('reconnecting'); this._offer({ iceRestart: true }); }
        else this.end('failed');
      }
    };
    return pc;
  }

  // ---- caller ----
  async startAsCaller() {
    await this.prepareMedia();
    this._createPeer();
    this._setState('ringing');
  }

  async _offer(opts = {}) {
    const offer = await this.pc.createOffer(opts);
    await this.pc.setLocalDescription(offer);
    this.signal.send({ type: 'offer', sdp: this.pc.localDescription.toJSON() });
  }

  // ---- callee ----
  async accept() {
    await this.prepareMedia();
    this._createPeer();
    this._setState('connecting');
    let tries = 0;
    const ping = () => {
      if (this.gotOffer || this.state === 'ended') return;
      this.signal.send({ type: 'ready', kind: this.kind });
      if (++tries < 15) this.readyTimer = setTimeout(ping, 1500);
    };
    ping();
  }

  async _onSignal(m) {
    if (!m || this.state === 'ended') return;
    switch (m.type) {
      case 'ready':
        if (this.role !== 'caller' || !this.pc) return;
        this._setState('connecting');
        if (this.pc.localDescription && this.pc.signalingState === 'have-local-offer') this.signal.send({ type: 'offer', sdp: this.pc.localDescription.toJSON() });
        else if (!this.pc.localDescription) await this._offer();
        return;
      case 'offer': {
        if (this.role !== 'callee' || !this.pc) return;
        const sdpText = m.sdp?.sdp || '';
        if (sdpText && sdpText === this.lastOfferSdp) return; // oferta repetida
        this.lastOfferSdp = sdpText;
        this.gotOffer = true;
        clearTimeout(this.readyTimer);
        await this.pc.setRemoteDescription(m.sdp);
        await this._flushIce();
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        this.signal.send({ type: 'answer', sdp: this.pc.localDescription.toJSON() });
        return;
      }
      case 'answer':
        if (this.role !== 'caller' || !this.pc || this.pc.signalingState !== 'have-local-offer') return;
        await this.pc.setRemoteDescription(m.sdp);
        await this._flushIce();
        return;
      case 'ice':
        if (!m.candidate) return;
        if (this.pc?.remoteDescription) await this.pc.addIceCandidate(m.candidate).catch(() => {});
        else this.pendingIce.push(m.candidate);
        return;
      case 'state':
        this._emit('remote-state', { mic: m.mic !== false, cam: m.cam !== false, screen: !!m.screen });
        return;
      case 'hangup':
        this.end('remote');
        return;
      case 'decline':
        this.end('declined');
        return;
      default:
    }
  }

  async _flushIce() {
    const list = this.pendingIce.splice(0);
    for (const c of list) await this.pc.addIceCandidate(c).catch(() => {});
  }

  _sendState() { this.signal.send({ type: 'state', mic: this.micOn, cam: this.camOn || !!this.screenTrack, screen: !!this.screenTrack }); }

  // ---- controles ----
  setMic(on) {
    this.micOn = on && this.hasAudio;
    this.localStream.getAudioTracks().forEach((t) => { t.enabled = this.micOn; });
    this._sendState();
    return this.micOn;
  }

  setCam(on) {
    this.camOn = on && this.hasVideo;
    this.localStream.getVideoTracks().forEach((t) => { t.enabled = this.camOn; });
    this._sendState();
    return this.camOn;
  }

  _videoSender() { return this.pc?.getSenders().find((s) => s.track?.kind === 'video') || null; }

  async flipCamera() {
    if (!this.hasVideo || this.screenTrack) return false;
    const next = this.facingMode === 'user' ? 'environment' : 'user';
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { exact: next } }, audio: false });
      const track = s.getVideoTracks()[0];
      track.enabled = this.camOn;
      await this._videoSender()?.replaceTrack(track);
      this.localStream.getVideoTracks().forEach((t) => { t.stop(); this.localStream.removeTrack(t); });
      this.localStream.addTrack(track);
      this.facingMode = next;
      this._emit('local-stream', this.localStream);
      return true;
    } catch { return false; }
  }

  async toggleScreen() {
    const sender = this._videoSender();
    if (!sender) throw new Error('Para compartir pantalla, la llamada debe ser de vídeo con cámara activa.');
    if (this.screenTrack) {
      const cam = this.localStream.getVideoTracks()[0] || null;
      await sender.replaceTrack(cam);
      this.screenTrack.stop();
      this.screenTrack = null;
      this._sendState();
      this._emit('local-stream', this.localStream);
      return false;
    }
    const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    const track = display.getVideoTracks()[0];
    this.screenTrack = track;
    await sender.replaceTrack(track);
    track.onended = () => { if (this.screenTrack === track) this.toggleScreen().catch(() => {}); };
    this._sendState();
    this._emit('local-stream', new MediaStream([track]));
    return true;
  }

  duration() { return this.startedAt ? Math.round((Date.now() - this.startedAt) / 1000) : 0; }

  hangup() { if (this.state !== 'ended') { try { this.signal.send({ type: 'hangup' }); } catch { /* ignore */ } } this.end('local'); }

  end(reason = 'local') {
    if (this.state === 'ended') return;
    const duration = this.duration();
    this.state = 'ended';
    clearTimeout(this.readyTimer);
    this.offSignal?.();
    this.localStream.getTracks().forEach((t) => t.stop());
    this.screenTrack?.stop();
    try { this.pc?.close(); } catch { /* ignore */ }
    setTimeout(() => { try { this.signal.close(); } catch { /* ignore */ } }, 400);
    this._emit('ended', { reason, duration });
  }
}

/** Señalización por BroadcastChannel (misma máquina/navegador: pruebas y pestañas). */
export function broadcastSignal(name) {
  const ch = new BroadcastChannel(`hype-call-${name}`);
  const me = Math.random().toString(36).slice(2);
  const fns = new Set();
  ch.onmessage = (e) => { if (e.data?.from !== me) fns.forEach((fn) => fn(e.data.msg)); };
  return {
    send: (msg) => ch.postMessage({ from: me, msg }),
    onMessage: (fn) => { fns.add(fn); return () => fns.delete(fn); },
    close: () => ch.close(),
  };
}

/** Pista de vídeo animada (llamadas de demostración con usuarios de ejemplo). */
export function demoStream({ emoji = '🤖', name = 'Hype', colors = ['#7c3aed', '#db2777'] } = {}) {
  const c = document.createElement('canvas');
  c.width = 640; c.height = 480;
  const ctx = c.getContext('2d');
  let raf = 0;
  const t0 = performance.now();
  const draw = (now) => {
    const t = (now - t0) / 1000;
    const g = ctx.createLinearGradient(0, 0, 640, 480);
    g.addColorStop(0, colors[0]);
    g.addColorStop(1, colors[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 640, 480);
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.05 + i * 0.012})`;
      ctx.beginPath();
      ctx.arc(320 + Math.cos(t * 0.6 + i) * 220, 240 + Math.sin(t * 0.8 + i * 2) * 160, 40 + i * 12, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.font = '150px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, 320, 225 + Math.sin(t * 2.2) * 14);
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,.92)';
    ctx.fillText(name, 320, 360);
    ctx.font = '18px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,.7)';
    ctx.fillText('Llamada de demostración', 320, 395);
    raf = requestAnimationFrame(draw);
  };
  raf = requestAnimationFrame(draw);
  const stream = c.captureStream(24);
  stream.stopDemo = () => { cancelAnimationFrame(raf); stream.getTracks().forEach((t) => t.stop()); };
  return stream;
}

/** Señalización que acumula mensajes hasta conectarse al canal real (attach). */
export function deferredSignal() {
  let real = null;
  const queue = [];
  const fns = new Set();
  const offs = [];
  return {
    attach(signal) {
      real = signal;
      fns.forEach((fn) => offs.push(signal.onMessage(fn)));
      queue.splice(0).forEach((m) => signal.send(m));
    },
    send: (msg) => { if (real) real.send(msg); else queue.push(msg); },
    onMessage(fn) {
      fns.add(fn);
      if (real) offs.push(real.onMessage(fn));
      return () => { fns.delete(fn); offs.splice(0).forEach((o) => o()); };
    },
    close: () => { offs.splice(0).forEach((o) => o()); real?.close(); },
  };
}

const nullSignal = () => ({ send() {}, onMessage() { return () => {}; }, close() {} });

/** Llamada simulada con usuarios de ejemplo (modo demo): mismos controles, sin red. */
export class DemoSession extends CallSession {
  constructor({ kind, other, startMuted, startCameraOff, answerAfter = 2200 }) {
    super({ role: 'caller', kind, signal: nullSignal(), startMuted, startCameraOff });
    this.other = other;
    this.answerAfter = answerAfter;
    this.timer = null;
  }

  async startAsCaller() {
    await this.prepareMedia();
    this._setState('ringing');
    this.timer = setTimeout(() => this._connect(), this.answerAfter);
  }

  async accept() {
    await this.prepareMedia();
    this._setState('connecting');
    this.timer = setTimeout(() => this._connect(), 700);
  }

  _connect() {
    if (this.state === 'ended') return;
    if (this.kind === 'video') {
      this.demo = demoStream({ emoji: this.other?.avatarEmoji || '🤖', name: this.other?.displayName || 'Hype' });
      this.remoteStream = this.demo;
      this._emit('remote-stream', this.remoteStream);
    }
    this.startedAt = Date.now();
    this._setState('connected');
    this._emit('connected');
    this._emit('remote-state', { mic: true, cam: this.kind === 'video', screen: false });
  }

  _sendState() {}

  async toggleScreen() {
    if (this.screenTrack) {
      this.screenTrack.stop();
      this.screenTrack = null;
      this._emit('local-stream', this.localStream);
      return false;
    }
    const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    this.screenTrack = display.getVideoTracks()[0];
    this.screenTrack.onended = () => { this.screenTrack = null; this._emit('local-stream', this.localStream); };
    this._emit('local-stream', display);
    return true;
  }

  end(reason) {
    clearTimeout(this.timer);
    this.demo?.stopDemo?.();
    super.end(reason);
  }
}
