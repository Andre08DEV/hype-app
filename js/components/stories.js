// Historias de 24 h: barra, visor a pantalla completa y creador.
import { html, toElement, $, $$, esc } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { state, bus } from '../core/store.js';
import { api } from '../data/api.js';
import { timeAgo, excerpt, pickFiles, formatBytes } from '../core/utils.js';
import { openModal, toast, toastError, confirmDialog, hypeBurst, setLoading, hasOpenModal } from '../core/ui.js';
import { avatar, srcAttr, safeColor } from './common.js';
import { FILTERS, filterClass, processImage, videoMeta, LIMITS } from './media.js';
import { requireUser } from './session.js';

const IMAGE_MS = 5000;
const MAX_VIDEO_MS = 30000;
export const STORY_BACKGROUNDS = [['#8b5cf6', '#ec4899'], ['#6366f1', '#06b6d4'], ['#f97316', '#ef4444'], ['#10b981', '#3b82f6'], ['#f59e0b', '#f97316'], ['#0f172a', '#334155'], ['#ec4899', '#f43f5e'], ['#22c55e', '#84cc16']];

const bgVars = (bg) => `--c1:${safeColor(bg?.[0], '#8b5cf6')};--c2:${safeColor(bg?.[1], '#ec4899')}`;

// ---------------- Barra ----------------
export function mountStoriesBar(host) {
  let groups = [];
  const paint = () => {
    const me = state.user;
    const mine = groups.find((g) => g.isMe);
    const others = groups.filter((g) => !g.isMe);
    if (!me && !others.length) { host.innerHTML = ''; return; }
    host.innerHTML = String(html`<div class="stories-bar no-scrollbar" role="list" aria-label="Historias">
      ${me ? html`<div class="story-item" role="listitem">
        <button type="button" class="story-ring ${mine ? 'mine' : 'add'}" data-story-me aria-label="${mine ? 'Ver tu historia' : 'Crear historia'}">${avatar(me, 'lg')}</button>
        <button type="button" class="story-plus" data-story-new aria-label="Crear historia" title="Crear historia">+</button>
        <span class="story-name">Tu historia</span></div>` : ''}
      ${others.map((g) => html`<div class="story-item" role="listitem"><button type="button" class="story-ring ${g.allSeen ? 'seen' : ''}" data-story-user="${g.user.id}" aria-label="Historias de ${g.user.displayName}">${avatar(g.user, 'lg')}</button><span class="story-name">${g.user.username}</span></div>`)}
    </div>`);
  };
  const load = async () => {
    try { groups = await api.storiesFeed(); } catch (err) { groups = []; if (err.code !== 'SCHEMA_V2') console.warn('[historias]', err.message); }
    paint();
  };
  host.addEventListener('click', (e) => {
    if (e.target.closest('[data-story-new]')) { openStoryCreator(); return; }
    const meBtn = e.target.closest('[data-story-me]');
    if (meBtn) {
      const gi = groups.findIndex((g) => g.isMe);
      if (gi >= 0) openStoryViewer(groups, gi, { onClose: load }); else openStoryCreator();
      return;
    }
    const u = e.target.closest('[data-story-user]');
    if (u) {
      const gi = groups.findIndex((g) => g.user.id === u.dataset.storyUser);
      const viewable = groups.filter((g) => !g.isMe);
      openStoryViewer(viewable, viewable.indexOf(groups[gi]), { onClose: load });
    }
  });
  const offs = [bus.on('story:created', load), bus.on('story:deleted', load), bus.on('user', load)];
  load();
  return { reload: load, destroy: () => offs.forEach((o) => o()) };
}

// ---------------- Visor ----------------
export function openStoryViewer(groups, startGroup = 0, { onClose } = {}) {
  if (!groups.length || startGroup < 0) return;
  let gi = startGroup;
  let si = Math.max(0, groups[gi].stories.findIndex((s) => !s.seen));
  if (groups[gi].isMe) si = 0;
  let raf = 0, startedAt = 0, elapsed = 0, duration = IMAGE_MS, paused = false, closed = false;

  const el = toElement(html`<div class="story-viewer" role="dialog" aria-modal="true" aria-label="Historias">
    <div class="sv-frame" data-frame>
      <div class="sv-progress" data-progress></div>
      <div class="sv-head" data-head></div>
      <div class="sv-media" data-media></div>
      <div class="sv-caption hidden" data-caption></div>
      <button type="button" class="sv-tap prev" data-prev aria-label="Anterior"></button>
      <button type="button" class="sv-tap next" data-next aria-label="Siguiente"></button>
      <div class="sv-foot" data-foot></div>
    </div>
  </div>`);
  document.body.appendChild(el);
  document.body.classList.add('modal-open');
  const $p = $('[data-progress]', el), $head = $('[data-head]', el), $media = $('[data-media]', el), $cap = $('[data-caption]', el), $foot = $('[data-foot]', el);

  const current = () => groups[gi]?.stories[si];
  const stop = () => cancelAnimationFrame(raf);

  const tick = () => {
    if (closed) return;
    if (!paused) {
      const now = performance.now();
      elapsed += now - startedAt;
      startedAt = now;
    } else startedAt = performance.now();
    const bar = $p.children[si]?.firstElementChild;
    if (bar) bar.style.width = Math.min(100, (elapsed / duration) * 100) + '%';
    if (elapsed >= duration) { next(); return; }
    raf = requestAnimationFrame(tick);
  };

  const show = () => {
    stop();
    const g = groups[gi];
    const s = current();
    if (!g || !s) { close(); return; }
    elapsed = 0;
    paused = false;
    duration = IMAGE_MS;
    $p.innerHTML = g.stories.map((_, i) => `<i><b style="width:${i < si ? 100 : 0}%"></b></i>`).join('');
    $head.innerHTML = String(html`<a href="#/u/${encodeURIComponent(g.user.username)}" data-close-link class="row" style="gap:8px;color:#fff">${avatar(g.user, 'sm')}<b>${g.user.displayName}</b></a><span class="sv-time">${timeAgo(s.createdAt)}</span><span class="spacer"></span>
      ${s.media?.type === 'video' ? html`<button type="button" class="sv-btn" data-mute aria-label="Sonido">${icon(state.settings.muteVideos ? 'volumeX' : 'volume', { size: 18 })}</button>` : ''}
      ${g.isMe ? html`<button type="button" class="sv-btn" data-delete aria-label="Eliminar historia" title="Eliminar">${icon('trash', { size: 18 })}</button>` : ''}
      <button type="button" class="sv-btn" data-close aria-label="Cerrar">${icon('x', { size: 20 })}</button>`);
    if (s.media) {
      const f = filterClass(s.media.filter);
      $media.innerHTML = s.media.type === 'video'
        ? String(html`<video ${srcAttr(s.media.url)} ${srcAttr(s.media.poster, 'poster')} class="${f}" playsinline autoplay ${state.settings.muteVideos ? 'muted' : ''}></video>`)
        : String(html`<img ${srcAttr(s.media.url)} class="sv-bg ${f}" alt="" aria-hidden="true"><img ${srcAttr(s.media.url)} class="sv-main ${f}" alt="${s.caption || 'Historia'}">`);
      $cap.textContent = s.caption || '';
      $cap.classList.toggle('hidden', !s.caption);
    } else {
      $media.innerHTML = String(html`<div class="sv-text" style="${bgVars(s.bg)}">${s.caption}</div>`);
      $cap.classList.add('hidden');
    }
    $foot.innerHTML = String(g.isMe
      ? html`<button type="button" class="btn btn-sm sv-viewers" data-viewers>${icon('eye', { size: 16 })} Ver quién la vio</button><span class="spacer"></span><button type="button" class="btn btn-sm sv-viewers" data-new-story>${icon('plus', { size: 16 })} Otra historia</button>`
      : state.user ? html`<form class="row" data-reply style="flex:1;gap:8px"><input data-reply-input placeholder="Responder a ${g.user.displayName.split(' ')[0]}…" maxlength="500" aria-label="Responder"><button type="submit" class="sv-btn" aria-label="Enviar">${icon('send', { size: 18 })}</button></form><button type="button" class="sv-btn hype" data-react aria-label="Dar hype">🔥</button>`
        : html`<a class="btn btn-sm sv-viewers" href="#/bienvenida" data-close-link>Únete para responder</a>`);
    const video = $media.querySelector('video');
    if (video) {
      video.addEventListener('loadedmetadata', () => { duration = Math.min(MAX_VIDEO_MS, (video.duration || 5) * 1000); });
      video.addEventListener('error', () => { duration = IMAGE_MS; });
      video.play().catch(() => { video.muted = true; video.play().catch(() => {}); });
    }
    if (!g.isMe && !s.seen) { s.seen = true; g.allSeen = g.stories.every((x) => x.seen); api.markStorySeen(s.id).catch(() => {}); }
    startedAt = performance.now();
    raf = requestAnimationFrame(tick);
  };

  const next = () => {
    const g = groups[gi];
    if (si < g.stories.length - 1) si++;
    else if (gi < groups.length - 1) { gi++; si = Math.max(0, groups[gi].stories.findIndex((s) => !s.seen)); }
    else { close(); return; }
    show();
  };
  const prev = () => {
    if (si > 0) si--;
    else if (gi > 0) { gi--; si = groups[gi].stories.length - 1; }
    else elapsed = 0;
    show();
  };
  const setPaused = (p) => { paused = p; const v = $media.querySelector('video'); if (v) { if (p) v.pause(); else v.play().catch(() => {}); } };

  function close() {
    if (closed) return;
    closed = true;
    stop();
    $media.querySelector('video')?.pause();
    el.remove();
    if (!document.querySelector('.modal-backdrop')) document.body.classList.remove('modal-open');
    window.removeEventListener('keydown', onKey, true);
    onClose?.();
  }

  const onKey = (e) => {
    if (hasOpenModal()) return;
    if (e.target.matches?.('input')) { if (e.key === 'Escape') e.target.blur(); return; }
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight') next();
    else if (e.key === 'ArrowLeft') prev();
    else if (e.key === ' ') { e.preventDefault(); setPaused(!paused); }
  };
  window.addEventListener('keydown', onKey, true); // fase de captura: antes que el Escape de los modales

  // Mantener pulsado = pausa; deslizar hacia abajo = cerrar
  let downAt = 0, downY = 0, longPress = false, pressTimer = null;
  el.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('.sv-tap, [data-media]')) return;
    downAt = Date.now(); downY = e.clientY; longPress = false;
    pressTimer = setTimeout(() => { longPress = true; setPaused(true); }, 220);
  });
  el.addEventListener('pointerup', (e) => {
    clearTimeout(pressTimer);
    if (downAt && e.clientY - downY > 90) { close(); downAt = 0; return; }
    if (longPress) { setPaused(false); downAt = 0; }
  });
  el.addEventListener('pointercancel', () => {
    clearTimeout(pressTimer);
    if (longPress) { setPaused(false); longPress = false; }
    downAt = 0;
  });
  // Mantener pulsado no debe abrir el menú de "guardar imagen" del móvil
  el.addEventListener('contextmenu', (e) => { if (e.target.closest('[data-media], .sv-tap')) e.preventDefault(); });

  el.addEventListener('click', async (e) => {
    const t = e.target;
    if (t === el) { close(); return; }
    if (t.closest('[data-close]')) { close(); return; }
    if (t.closest('[data-close-link]')) { close(); return; }
    if (t.closest('[data-prev]')) { if (!longPress) prev(); longPress = false; return; }
    if (t.closest('[data-next]')) { if (!longPress) next(); longPress = false; return; }
    const g = groups[gi], s = current();
    if (t.closest('[data-mute]')) {
      const v = $media.querySelector('video');
      if (v) { v.muted = !v.muted; t.closest('[data-mute]').innerHTML = String(icon(v.muted ? 'volumeX' : 'volume', { size: 18 })); }
      return;
    }
    if (t.closest('[data-react]')) {
      hypeBurst(t.closest('[data-react]'));
      try { const cid = await api.openConversation(g.user.id); await api.sendMessage(cid, `🔥 Le dio hype a tu historia «${excerpt(s.caption || (s.media?.type === 'video' ? '🎬' : '📷'), 50)}»`); toast('Hype enviado 🔥'); } catch (err) { toastError(err); }
      return;
    }
    if (t.closest('[data-viewers]')) {
      setPaused(true);
      const viewers = await api.storyViewers(s.id).catch(() => []);
      const content = toElement(html`<div class="col" style="margin:-18px">${viewers.length ? viewers.map((v) => html`<a class="user-row" href="#/u/${encodeURIComponent(v.username)}" data-close-link>${avatar(v, 'md')}<span class="meta"><b>${v.displayName}</b><br><span class="dim small">@${v.username}</span></span></a>`) : html`<p class="dim" style="padding:20px;text-align:center">Nadie la ha visto todavía.</p>`}</div>`);
      const m = openModal({ title: `👁 ${viewers.length} ${viewers.length === 1 ? 'vista' : 'vistas'}`, content, size: 'sm', onClose: () => setPaused(false) });
      content.addEventListener('click', (ev) => { if (ev.target.closest('[data-close-link]')) { m.close(); close(); } });
      return;
    }
    if (t.closest('[data-new-story]')) { close(); openStoryCreator(); return; }
    if (t.closest('[data-delete]')) {
      setPaused(true);
      if (!(await confirmDialog({ title: 'Eliminar historia', message: 'Desaparecerá para todo el mundo.', confirmText: 'Eliminar', danger: true }))) { setPaused(false); return; }
      try {
        await api.deleteStory(s.id);
        g.stories.splice(si, 1);
        if (!g.stories.length) { groups.splice(gi, 1); if (gi >= groups.length) { close(); return; } si = 0; }
        else if (si >= g.stories.length) si = g.stories.length - 1;
        show();
        toast('Historia eliminada');
      } catch (err) { toastError(err); setPaused(false); }
    }
  });
  el.addEventListener('focusin', (e) => { if (e.target.matches('[data-reply-input]')) setPaused(true); });
  el.addEventListener('focusout', (e) => { if (e.target.matches('[data-reply-input]')) setPaused(false); });
  el.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = e.target.querySelector('[data-reply-input]');
    const text = input?.value.trim();
    if (!text) return;
    const g = groups[gi], s = current();
    input.value = '';
    try {
      const cid = await api.openConversation(g.user.id);
      await api.sendMessage(cid, `💬 Sobre tu historia «${excerpt(s.caption || (s.media?.type === 'video' ? '🎬 vídeo' : '📷 foto'), 50)}»:\n${text}`);
      toast('Respuesta enviada por mensaje privado ✉️', { type: 'success' });
    } catch (err) { toastError(err); }
    input.blur();
  });
  show();
}

// ---------------- Creador ----------------
export function openStoryCreator() {
  if (!requireUser('crear historias')) return;
  const st = { mode: 'text', bg: STORY_BACKGROUNDS[0], file: null, preview: '', mediaType: 'image', filter: 'none', poster: null, width: 0, height: 0, duration: 0 };
  const content = toElement(html`<div class="col story-creator">
    <div class="segmented" style="align-self:center"><button type="button" class="active" data-mode="text">Aa Texto</button><button type="button" data-mode="media">${icon('image', { size: 15 })} Foto o vídeo</button></div>
    <div class="story-canvas" data-canvas style="${bgVars(st.bg)}"></div>
    <div data-tools></div>
  </div>`);
  const footer = toElement(html`<div class="row" style="justify-content:space-between;width:100%"><span class="tiny dim">Desaparece en 24 h</span><button class="btn btn-primary" data-publish>Publicar historia</button></div>`);
  const m = openModal({ title: 'Nueva historia', content, footer, size: 'md', onClose: () => st.preview && URL.revokeObjectURL(st.preview) });
  const canvas = $('[data-canvas]', content);
  const tools = $('[data-tools]', content);
  let caption = '';

  const paint = () => {
    $$('[data-mode]', content).forEach((b) => b.classList.toggle('active', b.dataset.mode === st.mode));
    if (st.mode === 'text') {
      canvas.setAttribute('style', bgVars(st.bg));
      canvas.innerHTML = String(html`<textarea class="story-text-input" data-text maxlength="300" placeholder="Escribe algo…" aria-label="Texto de la historia">${caption}</textarea>`);
      tools.innerHTML = String(html`<div class="flabel" style="margin-bottom:6px">Fondo</div><div class="swatches">${STORY_BACKGROUNDS.map((b, i) => html`<button type="button" class="swatch ${b[0] === st.bg[0] && b[1] === st.bg[1] ? 'active' : ''}" data-bg="${i}" style="--s1:${b[0]};--s2:${b[1]}" aria-label="Fondo ${i + 1}"></button>`)}</div>`);
      setTimeout(() => canvas.querySelector('textarea')?.focus(), 30);
    } else {
      canvas.removeAttribute('style');
      canvas.innerHTML = st.file
        ? String(st.mediaType === 'video' ? html`<video src="${esc(st.preview)}" class="${filterClass(st.filter)}" autoplay muted loop playsinline></video>` : html`<img src="${esc(st.preview)}" class="${filterClass(st.filter)}" alt="">`)
        : String(html`<button type="button" class="col" data-pick style="align-items:center;gap:8px;color:#fff;padding:20px;text-align:center">${icon('upload', { size: 30 })}<b>Elegir foto o vídeo</b><span class="tiny" style="opacity:.8">Vertical se ve mejor · vídeo hasta ${api.mode === 'cloud' ? LIMITS.videoCloudMB : LIMITS.videoLocalMB} MB</span></button>`);
      tools.innerHTML = String(html`${st.file ? html`<div class="filter-strip">${FILTERS.map((f) => html`<button type="button" class="filter-swatch ${st.filter === f.id ? 'active' : ''}" data-f="${f.id}"><span class="thumb">${st.mediaType === 'video' ? html`<span class="${filterClass(f.id)}" style="display:grid;place-items:center;height:100%;font-size:22px;background:linear-gradient(135deg,#7c3aed,#db2777)">🎬</span>` : html`<img src="${esc(st.preview)}" class="${filterClass(f.id)}" alt="">`}</span>${f.name}</button>`)}</div>
        <div class="row"><input class="input" data-caption maxlength="300" placeholder="Añade un texto (opcional)" value="${caption}"><button type="button" class="btn btn-ghost btn-sm" data-pick>Cambiar</button></div>` : ''}`);
    }
  };

  const pick = async () => {
    const [file] = await pickFiles({ accept: 'image/*,video/mp4,video/webm,video/quicktime' });
    if (!file) return;
    try {
      if (file.type.startsWith('video/')) {
        const maxMB = api.mode === 'cloud' ? LIMITS.videoCloudMB : LIMITS.videoLocalMB;
        if (file.size > maxMB * 1024 * 1024) throw new Error(`El vídeo pesa ${formatBytes(file.size)} (máx. ${maxMB} MB)`);
        const meta = await videoMeta(file);
        Object.assign(st, { file, mediaType: 'video', poster: meta.poster, width: meta.width, height: meta.height, duration: meta.duration });
      } else {
        const r = await processImage(file);
        Object.assign(st, { file: r.file, mediaType: file.type === 'image/gif' ? 'gif' : 'image', width: r.width, height: r.height, poster: null, duration: 0 });
      }
      if (st.preview) URL.revokeObjectURL(st.preview);
      st.preview = URL.createObjectURL(st.file);
      st.mode = 'media';
      paint();
    } catch (err) { toastError(err); }
  };

  content.addEventListener('click', (e) => {
    const md = e.target.closest('[data-mode]');
    if (md) { st.mode = md.dataset.mode; paint(); if (st.mode === 'media' && !st.file) pick(); return; }
    if (e.target.closest('[data-pick]')) { pick(); return; }
    const b = e.target.closest('[data-bg]');
    if (b) { st.bg = STORY_BACKGROUNDS[Number(b.dataset.bg)]; $$('[data-bg]', content).forEach((x) => x.classList.toggle('active', x === b)); canvas.setAttribute('style', bgVars(st.bg)); return; }
    const f = e.target.closest('[data-f]');
    if (f) { st.filter = f.dataset.f; paint(); }
  });
  content.addEventListener('input', (e) => { if (e.target.matches('[data-text], [data-caption]')) caption = e.target.value; });

  footer.querySelector('[data-publish]').onclick = async (e) => {
    const btn = e.currentTarget;
    if (st.mode === 'text' && !caption.trim()) { toast('Escribe algo para tu historia ✍️'); return; }
    if (st.mode === 'media' && !st.file) { pick(); return; }
    setLoading(btn, true);
    try {
      await api.createStory(st.mode === 'text'
        ? { caption, bg: st.bg }
        : { file: st.file, mediaType: st.mediaType === 'gif' ? 'image' : st.mediaType, caption, filter: st.filter, poster: st.poster, width: st.width, height: st.height, duration: st.duration });
      m.close();
      toast('Historia publicada ✨ Desaparece en 24 h', { type: 'success' });
    } catch (err) { toastError(err); setLoading(btn, false); }
  };
  paint();
}
