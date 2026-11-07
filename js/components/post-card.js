// Tarjeta de post + acciones globales (delegación a nivel de documento).
import { html, toElement, $$ } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { state, bus, updateSettings } from '../core/store.js';
import { renderMarkdown, stripMarkdown } from '../core/markdown.js';
import { timeAgo, formatCount, formatNumber, plural, timeLeft, formatDateTime, copyText, vibrate, excerpt } from '../core/utils.js';
import { toast, toastError, openMenu, openModal, confirmDialog, openLightbox, hypeBurst, promptDialog } from '../core/ui.js';
import { navigate } from '../core/router.js';
import { api } from '../data/api.js';
import { avatar, verified, colorVars, coverBox, stagePill, srcAttr } from './common.js';
import { renderMedia, observeVideos, filterClass } from './media.js';
import { gameById } from '../games/registry.js';
import { requireUser } from './session.js';

export const postCache = new Map();
export const cachePost = (p) => { if (p?.id) postCache.set(p.id, p); return p; };

const CLAMP_CHARS = 700;
const CLAMP_LINES = 14;

export function postUrl(id) { return `${location.origin}${location.pathname}#/post/${id}`; }

// ---------------- Render ----------------
export function renderPoll(post) {
  const p = post.poll;
  if (!p) return '';
  const voted = p.myVotes?.length > 0;
  const mine = post.authorId === state.user?.id;
  const showResults = voted || p.closed || mine || !state.user;
  const total = p.multiple ? Math.max(p.voters, 1) : Math.max(p.counts.reduce((a, b) => a + b, 0), 1);
  const max = Math.max(...p.counts);
  return html`<div class="poll" data-poll>
    ${p.options.map((opt, i) => {
      const pct = Math.round(((p.counts[i] || 0) * 100) / total);
      if (showResults) {
        return html`<div class="poll-option ${p.myVotes?.includes(i) ? 'mine' : ''} ${p.closed && p.counts[i] === max && max > 0 ? 'winner' : ''}">
          <span class="bar" data-w="${pct}"></span><span>${opt}</span>${p.myVotes?.includes(i) ? icon('check', { size: 16 }) : ''}<span class="pct">${pct}%</span></div>`;
      }
      return html`<button type="button" class="poll-option ${p.multiple ? 'multi' : ''}" data-action="vote" data-index="${i}"><span class="check">${icon('check', { size: 12, stroke: 3 })}</span><span>${opt}</span></button>`;
    })}
    ${!showResults && p.multiple ? html`<button type="button" class="btn btn-primary btn-sm" data-action="vote-submit" disabled style="align-self:flex-start">Votar</button>` : ''}
    <div class="poll-meta"><span>${plural(p.voters, 'voto', 'votos')}</span><span>·</span><span>${p.closed ? 'Encuesta finalizada' : timeLeft(p.closesAt)}</span>${!p.closed ? html`<span>·</span><span class="poll-live">En vivo</span>` : ''}${p.multiple ? html`<span>· Opción múltiple</span>` : ''}</div>
  </div>`;
}

function renderGameEmbed(post) {
  const g = gameById(post.game?.gameId);
  if (!g) return '';
  return html`<div class="game-embed" style="${colorVars(g.colors)}">
    <div class="game-emoji">${g.emoji}</div>
    <div class="meta"><div class="tiny bold" style="opacity:.75;letter-spacing:.08em">PLAYABLE · ${g.title.toUpperCase()}</div>
      <div class="score">${formatNumber(post.game.score)} <span style="font-size:.9rem">${g.unit}</span></div>
      <div class="small" style="opacity:.8">¿Puedes superarlo?</div></div>
    <button type="button" class="btn btn-white btn-sm" data-action="play-game" data-game="${g.id}">${icon('play', { size: 16 })} Jugar</button>
  </div>`;
}

function renderProjectEmbed(p) {
  if (!p) return '';
  return html`<a class="embed" href="#/p/${p.id}">${coverBox(p)}<span class="meta"><span class="title">${p.name}</span><br><span class="small muted">${p.tagline}</span><span class="row small" style="gap:8px;margin-top:4px">${stagePill(p.stage)}<span class="dim">🔥 ${formatCount(p.hypeCount)}</span></span></span>${icon('chevronRight', { cls: 'dim' })}</a>`;
}

/** Tarjeta compacta de un post citado ({ id, kind, body, media, createdAt, author }). */
export function renderQuoteCard(q, { link = true } = {}) {
  const a = q.author || {};
  const m = q.media?.[0];
  const thumb = m ? (m.type === 'video' ? m.poster : m.url) : '';
  const text = excerpt(stripMarkdown(q.body || ''), 240);
  const fallback = q.kind === 'game' ? '🎮 Reto de juego' : q.kind === 'project' ? '🚀 Proyecto' : '📊 Encuesta';
  const inner = html`<span class="quote-head">${avatar(a, 'xs')}<b class="truncate">${a.displayName || a.username}</b>${verified(a)}<span class="dim truncate">@${a.username} · ${timeAgo(q.createdAt)}</span></span>
    <span class="quote-main">
      ${text ? html`<span class="quote-text">${text}</span>` : ''}
      ${thumb ? html`<span class="quote-thumb ${m.type === 'video' ? 'is-video' : ''}"><img ${srcAttr(thumb)} class="${filterClass(m.filter)}" alt="${m.alt || ''}" loading="lazy">${m.type === 'video' ? html`<i>${icon('play', { size: 14 })}</i>` : ''}</span>` : ''}
      ${!text && !thumb ? html`<span class="quote-text dim">${fallback}</span>` : ''}
    </span>`;
  return link
    ? html`<a class="quote-card" href="#/post/${q.id}" aria-label="Post citado de ${a.displayName || a.username}">${inner}</a>`
    : html`<div class="quote-card">${inner}</div>`;
}

/** Post citado dentro de otro post (cita). */
function renderQuote(post) {
  if (!post.quoted) return html`<div class="quote-card unavailable">${icon('eyeOff', { size: 16 })}<span>Este post ya no está disponible</span></div>`;
  return renderQuoteCard(post.quoted);
}

/** Un repost se muestra como el post original con la línea "X reposteó". */
function renderRepost(row, opts) {
  const by = row.author || {};
  if (row.original) return renderPost(row.original, { ...opts, repostBy: by, repostId: row.id });
  return html`<article class="post repost-stub" data-repost-id="${row.id}" data-reposter="${by.id || ''}">
    <div class="post-gutter"><span class="repost-stub-icon">${icon('repeat', { size: 18 })}</span></div>
    <div class="post-main"><p class="small muted"><a class="bold" href="#/u/${encodeURIComponent(by.username || '')}">${by.displayName || by.username}</a> reposteó un post que ya no está disponible.</p></div>
  </article>`;
}

function shouldClamp(body) {
  return body.length > CLAMP_CHARS || body.split('\n').length > CLAMP_LINES;
}

export function renderPost(post, opts = {}) {
  if (post?.kind === 'repost') return renderRepost(post, opts);
  const { variant = 'feed', threadLine = false, focused = false, repostBy = null, repostId = '', pinned = false } = opts;
  cachePost(post);
  const a = post.author || {};
  const s = state.settings;
  const clamp = variant === 'feed' && shouldClamp(post.body || '');
  const isThreadRoot = (post.threadCount || 1) > 1 && post.threadIndex === 0;
  const isPart = post.threadIndex > 0;
  const line = threadLine || (variant === 'feed' && isThreadRoot);
  const meId = state.user?.id;
  return html`<article class="post ${variant !== 'detail' ? 'clickable' : ''} ${focused ? 'focused' : ''} ${isPart ? 'thread-part' : ''}" data-post-id="${post.id}" data-variant="${variant}" ${repostId ? html`data-repost-id="${repostId}" data-reposter="${repostBy?.id || ''}"` : ''} ${pinned ? 'data-pinned' : ''} tabindex="-1">
    ${repostBy || pinned ? html`<div class="post-top-context">
      ${pinned ? html`<span class="pinned-label">${icon('pin', { size: 14 })} Fijado</span>` : ''}
      ${repostBy ? html`<a href="#/u/${encodeURIComponent(repostBy.username || '')}" class="repost-label">${icon('repeat', { size: 14 })} ${repostBy.id === meId ? 'Reposteaste' : `${repostBy.displayName || repostBy.username} reposteó`}</a>` : ''}
    </div>` : ''}
    <div class="post-gutter">${avatar(a, 'md', { link: true })}${line ? html`<div class="thread-line"></div>` : ''}</div>
    <div class="post-main">
      ${post.group || isThreadRoot ? html`<div class="post-context">
        ${post.group ? html`<a href="#/g/${encodeURIComponent(post.group.slug)}">${post.group.emoji} ${post.group.name}</a>` : ''}
        ${isThreadRoot ? html`<span class="thread-badge">${icon('thread', { size: 12 })} Hilo · ${post.threadCount}</span>` : ''}
      </div>` : ''}
      <div class="post-head">
        <a class="name" href="#/u/${encodeURIComponent(a.username || '')}">${a.displayName || a.username}</a>${verified(a)}
        <span class="handle">@${a.username}</span><span class="dot">·</span>
        <a class="time" href="#/post/${post.threadRootId && isPart ? post.threadRootId : post.id}" title="${formatDateTime(post.createdAt)}">${timeAgo(post.createdAt)}</a>
        ${post.visibility === 'followers' ? html`<span class="dim" title="Solo seguidores">${icon('lock', { size: 13 })}</span>` : ''}
        ${post.editedAt ? html`<span class="dim tiny" title="Editado">· editado</span>` : ''}
        ${isPart ? html`<span class="dim tiny">· ${post.threadIndex + 1}/${postCache.get(post.threadRootId)?.threadCount || '…'}</span>` : ''}
        <button type="button" class="icon-btn sm menu-btn" data-action="post-menu" aria-label="Opciones del post">${icon('more', { size: 18 })}</button>
      </div>
      ${post.body ? html`<div class="post-body md ${clamp ? 'clamped' : ''}">${renderMarkdown(post.body)}</div>${clamp ? html`<button type="button" class="show-more" data-action="expand">Mostrar más</button>` : ''}` : ''}
      ${renderMedia(post)}
      ${post.poll ? renderPoll(post) : ''}
      ${post.kind === 'project' ? renderProjectEmbed(post.project) : ''}
      ${post.kind === 'game' ? renderGameEmbed(post) : ''}
      ${post.quoteOf || post.quoted ? renderQuote(post) : ''}
      <div class="post-actions">
        <button type="button" class="action hype ${post.hyped ? 'on' : ''}" data-action="hype" aria-pressed="${post.hyped ? 'true' : 'false'}" aria-label="Dar hype" title="Hype">${icon('flame', { size: 19 })}<span class="count">${s.showHypeCounts || post.authorId !== state.user?.id ? formatCount(post.hypeCount) : ''}</span></button>
        <button type="button" class="action comment" data-action="comment" aria-label="Comentar" title="Comentar">${icon('message', { size: 19 })}<span class="count">${post.commentCount ? formatCount(post.commentCount) : ''}</span></button>
        <button type="button" class="action repost ${post.reposted ? 'on' : ''}" data-action="repost" aria-pressed="${post.reposted ? 'true' : 'false'}" aria-label="Repostear o citar" title="Repostear o citar">${icon('repeat', { size: 19 })}<span class="count">${post.repostCount ? formatCount(post.repostCount) : ''}</span></button>
        <button type="button" class="action share" data-action="share" aria-label="Compartir" title="Compartir">${icon('share', { size: 19 })}</button>
        <button type="button" class="action save ${post.bookmarked ? 'on' : ''}" data-action="bookmark" aria-pressed="${post.bookmarked ? 'true' : 'false'}" aria-label="Guardar" title="Guardar en carpeta">${icon('bookmark', { size: 19 })}</button>
        <button type="button" class="action ai" data-action="ai" aria-label="Hype IA" title="Hype IA">${icon('sparkles', { size: 19 })}</button>
      </div>
    </div>
  </article>
  ${variant === 'feed' && isThreadRoot ? html`<button type="button" class="thread-expand" data-action="thread-expand" data-root="${post.id}">${icon('thread', { size: 16 })} Mostrar hilo completo · ${post.threadCount - 1} ${post.threadCount - 1 === 1 ? 'post más' : 'posts más'}</button>` : ''}`;
}

/** Activa animaciones y autoplay tras insertar posts en el DOM. */
export function hydratePosts(root) {
  requestAnimationFrame(() => {
    $$('.poll .bar[data-w]', root).forEach((b) => { b.style.width = b.dataset.w + '%'; });
  });
  observeVideos(root);
}

// ---------------- Actualizaciones en vivo ----------------
function mergePost(patch) {
  const cur = postCache.get(patch.id);
  if (!cur) return null;
  const { poll, ...rest } = patch;
  Object.entries(rest).forEach(([k, v]) => { if (v !== undefined && k !== 'author') cur[k] = v; });
  if (poll && cur.poll) Object.entries(poll).forEach(([k, v]) => { if (v !== undefined && v !== null) cur.poll[k] = v; });
  return cur;
}

export function refreshPostEls(post) {
  $$(`[data-post-id="${CSS.escape(post.id)}"]`).forEach((el) => {
    const hype = el.querySelector('[data-action="hype"]');
    if (hype) {
      hype.classList.toggle('on', !!post.hyped);
      hype.setAttribute('aria-pressed', post.hyped ? 'true' : 'false');
      const c = hype.querySelector('.count');
      if (c && (state.settings.showHypeCounts || post.authorId !== state.user?.id)) c.textContent = formatCount(post.hypeCount);
    }
    const com = el.querySelector('[data-action="comment"] .count');
    if (com) com.textContent = post.commentCount ? formatCount(post.commentCount) : '';
    const rp = el.querySelector('[data-action="repost"]');
    if (rp) {
      rp.classList.toggle('on', !!post.reposted);
      rp.setAttribute('aria-pressed', post.reposted ? 'true' : 'false');
      const c = rp.querySelector('.count');
      if (c) c.textContent = post.repostCount ? formatCount(post.repostCount) : '';
    }
    el.querySelectorAll('[data-action="bookmark"]').forEach((b) => { b.classList.toggle('on', !!post.bookmarked); b.setAttribute('aria-pressed', post.bookmarked ? 'true' : 'false'); });
    const poll = el.querySelector('[data-poll]');
    if (poll && post.poll && !poll.querySelector('.poll-option.selected')) {
      const fresh = toElement(renderPoll(post));
      // Mantener las barras en su ancho actual para animar el cambio
      poll.replaceWith(fresh);
      requestAnimationFrame(() => fresh.querySelectorAll('.bar[data-w]').forEach((b) => { b.style.width = b.dataset.w + '%'; }));
    }
    // Shorts
    const sh = el.querySelector('[data-short-hype]');
    if (sh) { sh.classList.toggle('on', !!post.hyped); const n = sh.querySelector('.n'); if (n) n.textContent = formatCount(post.hypeCount); }
    const sc = el.querySelector('[data-short-comments] .n');
    if (sc) sc.textContent = formatCount(post.commentCount);
    const sb = el.querySelector('[data-short-save]');
    if (sb) sb.classList.toggle('saved', !!post.bookmarked);
  });
}

bus.on('post:update', (patch) => { const p = mergePost(patch); if (p) refreshPostEls(p); });
bus.on('post:delete', ({ id }) => {
  postCache.delete(id);
  $$(`[data-repost-id="${CSS.escape(id)}"]`).forEach((el) => el.remove());
  $$(`[data-post-id="${CSS.escape(id)}"]`).forEach((el) => {
    const next = el.nextElementSibling;
    if (next?.matches('.thread-expand, .thread-parts')) next.remove();
    el.remove();
  });
});

// ---------------- Acciones ----------------
export async function toggleHype(post, btn) {
  if (!requireUser('dar hype')) return;
  const was = post.hyped;
  post.hyped = !was;
  post.hypeCount = Math.max(0, post.hypeCount + (was ? -1 : 1));
  refreshPostEls(post);
  if (!was && btn) { hypeBurst(btn); vibrate(12); btn.classList.remove('pop'); void btn.offsetWidth; btn.classList.add('pop'); }
  try {
    const r = was ? await api.unhypePost(post.id) : await api.hypePost(post.id);
    post.hypeCount = r.hypeCount;
    post.hyped = r.hyped;
    refreshPostEls(post);
  } catch (err) {
    post.hyped = was;
    post.hypeCount = Math.max(0, post.hypeCount + (was ? 1 : -1));
    refreshPostEls(post);
    toastError(err);
  }
}

export async function openFolderPicker(post) {
  if (!requireUser('guardar posts')) return;
  let data;
  try { data = await api.listFolders(); } catch (err) { toastError(err); return; }
  const content = toElement(html`<div class="col" style="gap:6px">
    <p class="small muted">Tus marcadores son privados: solo tú los ves.</p>
    <button type="button" class="folder-btn ${post.bookmarked && !post.folderId ? 'active' : ''}" data-folder=""><span class="emo">🔖</span>Sin carpeta</button>
    ${data.folders.map((f) => html`<button type="button" class="folder-btn ${post.bookmarked && post.folderId === f.id ? 'active' : ''}" data-folder="${f.id}"><span class="emo">${f.emoji}</span>${f.name}<span class="count">${f.count}</span></button>`)}
    <form class="row" data-new style="margin-top:6px"><input class="input" name="name" maxlength="40" placeholder="Nueva carpeta (ej. Recetas)"><button class="btn btn-secondary" type="submit">${icon('folderPlus', { size: 18 })}</button></form>
    ${post.bookmarked ? html`<button type="button" class="btn btn-danger" data-remove style="margin-top:8px">${icon('trash', { size: 16 })} Quitar de guardados</button>` : ''}
  </div>`);
  const m = openModal({ title: post.bookmarked ? 'Mover a carpeta' : 'Guardar en…', content, size: 'sm' });
  const save = async (folderId) => {
    try {
      await api.saveBookmark(post.id, folderId || null);
      post.bookmarked = true;
      post.folderId = folderId || null;
      updateSettings({ lastFolder: folderId || null });
      refreshPostEls(post);
      const f = data.folders.find((x) => x.id === folderId);
      toast(f ? `Guardado en ${f.emoji} ${f.name}` : 'Guardado en marcadores', { type: 'success' });
      bus.emit('bookmarks:change');
      m.close();
    } catch (err) { toastError(err); }
  };
  content.addEventListener('click', (e) => {
    const b = e.target.closest('[data-folder]');
    if (b) save(b.dataset.folder);
    if (e.target.closest('[data-remove]')) {
      api.removeBookmark(post.id).then(() => { post.bookmarked = false; post.folderId = null; refreshPostEls(post); bus.emit('bookmarks:change'); toast('Quitado de guardados'); m.close(); }).catch(toastError);
    }
  });
  content.querySelector('[data-new]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = e.target.name.value.trim();
    if (!name) return;
    try { const f = await api.createFolder({ name, emoji: '📁' }); data.folders.push(f); await save(f.id); } catch (err) { toastError(err); }
  });
}

async function quickBookmark(post) {
  if (!requireUser('guardar posts')) return;
  if (post.bookmarked) { openFolderPicker(post); return; }
  const last = state.settings.lastFolder || null;
  post.bookmarked = true;
  post.folderId = last;
  refreshPostEls(post);
  try {
    await api.saveBookmark(post.id, last).catch(async (err) => { if (last) { updateSettings({ lastFolder: null }); return api.saveBookmark(post.id, null); } throw err; });
    bus.emit('bookmarks:change');
    toast('Guardado en marcadores 🔖', { type: 'success', action: { label: 'Elegir carpeta', onClick: () => openFolderPicker(post) } });
  } catch (err) { post.bookmarked = false; refreshPostEls(post); toastError(err); }
}

const canRepost = (post) => post.visibility !== 'followers' && !post.group?.isPrivate && post.kind !== 'repost';

export async function toggleRepost(post, btn) {
  if (!requireUser('repostear')) return;
  const was = !!post.reposted;
  post.reposted = !was;
  post.repostCount = Math.max(0, (post.repostCount || 0) + (was ? -1 : 1));
  refreshPostEls(post);
  if (!was && btn) { btn.classList.remove('pop'); void btn.offsetWidth; btn.classList.add('pop'); vibrate(10); }
  try {
    const r = was ? await api.unrepost(post.id) : await api.repost(post.id);
    post.repostCount = r.repostCount;
    post.reposted = r.reposted;
    refreshPostEls(post);
    if (was) {
      // Quita mis filas de repost de este post (en el feed o en mi perfil).
      $$(`[data-reposter="${CSS.escape(state.user.id)}"][data-post-id="${CSS.escape(post.id)}"]`).forEach((el) => el.remove());
      toast('Repost eliminado');
    } else {
      toast('Reposteado 🔁 Aparecerá en tu perfil', { type: 'success', action: { label: 'Citar', onClick: () => quotePost(post) } });
      bus.emit('repost:created', { postId: post.id });
    }
  } catch (err) {
    post.reposted = was;
    post.repostCount = Math.max(0, (post.repostCount || 0) + (was ? 1 : -1));
    refreshPostEls(post);
    toastError(err);
  }
}

export async function quotePost(post) {
  if (!requireUser('citar posts')) return;
  const { openComposer } = await import('./composer.js');
  openComposer({ quote: post });
}

function repostMenu(post, anchor) {
  if (!requireUser('repostear')) return;
  if (!canRepost(post)) { toast('Solo se pueden repostear y citar posts públicos'); return; }
  openMenu(anchor, [
    { label: post.reposted ? 'Deshacer repost' : 'Repostear', icon: 'repeat', danger: !!post.reposted, onClick: () => toggleRepost(post, anchor) },
    { label: 'Citar', icon: 'quote', onClick: () => quotePost(post) },
  ], { align: 'left' });
}

async function togglePin(post) {
  const pinned = state.user?.pinnedPostId === post.id;
  try {
    await api.pinPost(pinned ? null : post.id);
    if (state.user) state.user.pinnedPostId = pinned ? null : post.id;
    bus.emit('pin:change', { postId: pinned ? null : post.id });
    toast(pinned ? 'Post desfijado' : 'Post fijado en tu perfil 📌', { type: 'success' });
  } catch (err) { toastError(err); }
}

export async function sharePost(post) {
  const url = postUrl(post.threadRootId && post.threadIndex > 0 ? post.threadRootId : post.id);
  const text = stripMarkdown(post.body).slice(0, 120);
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    try { await navigator.share({ title: `Post de @${post.author?.username} en Hype`, text, url }); return; } catch { /* cancelado */ }
  }
  if (await copyText(url)) toast('Enlace copiado 📋', { type: 'success' });
}

async function editPost(post) {
  const { createEditor } = await import('./editor.js');
  const editor = createEditor({ value: post.body, rows: 5 });
  const footer = toElement(html`<div class="row" style="justify-content:flex-end;width:100%"><button class="btn btn-ghost" data-c>Cancelar</button><button class="btn btn-primary" data-s>Guardar</button></div>`);
  const m = openModal({ title: 'Editar post', content: editor.el, footer, size: 'lg' });
  footer.querySelector('[data-c]').onclick = () => m.close();
  footer.querySelector('[data-s]').onclick = async () => {
    try {
      const updated = await api.updatePost(post.id, { body: editor.value });
      Object.assign(post, { body: updated.body, editedAt: updated.editedAt, tags: updated.tags });
      $$(`[data-post-id="${CSS.escape(post.id)}"]`).forEach((el) => {
        const fresh = toElement(renderPost(post, { variant: el.dataset.variant || 'feed' }));
        el.replaceWith(fresh);
        hydratePosts(fresh.parentElement || document);
      });
      toast('Post actualizado', { type: 'success' });
      m.close();
    } catch (err) { toastError(err); }
  };
}

function postMenu(post, anchor) {
  const mine = post.authorId === state.user?.id;
  const items = [
    { label: 'Copiar enlace', icon: 'link', onClick: async () => { if (await copyText(postUrl(post.id))) toast('Enlace copiado', { type: 'success' }); } },
    ...((post.threadCount || 1) > 1 || post.threadRootId ? [{ label: 'Ver hilo completo', icon: 'thread', onClick: () => navigate(`/post/${post.threadRootId || post.id}`) }] : []),
    { label: post.bookmarked ? 'Mover a otra carpeta' : 'Guardar en carpeta…', icon: 'folder', onClick: () => openFolderPicker(post) },
    { divider: true },
  ];
  if (mine) {
    if (post.kind !== 'repost' && !(post.threadIndex > 0)) {
      const pinned = state.user?.pinnedPostId === post.id;
      items.push({ label: pinned ? 'Desfijar del perfil' : 'Fijar en tu perfil', icon: 'pin', onClick: () => togglePin(post) });
    }
    items.push({ label: 'Editar', icon: 'edit', onClick: () => editPost(post) });
    items.push({
      label: 'Eliminar', icon: 'trash', danger: true,
      onClick: async () => {
        if (await confirmDialog({ title: 'Eliminar post', message: (post.threadCount || 1) > 1 ? 'Se eliminará el hilo completo. Esta acción no se puede deshacer.' : 'Esta acción no se puede deshacer.', confirmText: 'Eliminar', danger: true })) {
          try { await api.deletePost(post.id); bus.emit('post:delete', { id: post.id }); toast('Post eliminado'); } catch (err) { toastError(err); }
        }
      },
    });
  } else {
    items.push({ label: 'No me interesa', icon: 'eyeOff', onClick: () => { updateSettings({ hiddenPosts: [...state.settings.hiddenPosts, post.id].slice(-500) }); bus.emit('post:delete', { id: post.id }); toast('Verás menos posts como este', { action: { label: 'Deshacer', onClick: () => { updateSettings({ hiddenPosts: state.settings.hiddenPosts.filter((x) => x !== post.id) }); toast('Recarga para verlo de nuevo'); } } }); } });
    items.push({ label: `Silenciar a @${post.author?.username}`, icon: 'volumeX', onClick: () => { updateSettings({ mutedUsers: [...new Set([...state.settings.mutedUsers, post.author.username])] }); toast(`Silenciaste a @${post.author.username}. Puedes revertirlo en Ajustes → Contenido.`); bus.emit('filters:change'); } });
    items.push({ label: 'Reportar', icon: 'alert', danger: true, onClick: () => toast('Gracias. Revisaremos este post 🙏') });
  }
  openMenu(anchor, items);
}

async function aiOnPost(post, anchor) {
  const { hypeAI, aiStatus } = await import('../ai/gemini.js');
  const st = aiStatus();
  const run = async (title, fn) => {
    if (!st.available) {
      const m = openModal({ title: 'Hype IA', size: 'sm', content: html`<div class="col"><p class="muted">${st.message}</p><a class="btn btn-primary" href="#/ajustes/ia">Configurar Hype IA</a></div>` });
      m.body.querySelector('a').addEventListener('click', () => m.close());
      return;
    }
    const out = toElement(html`<div class="md cursor-blink" style="min-height:60px"><p class="dim">Pensando…</p></div>`);
    const m = openModal({ title: html`${icon('sparkles', { size: 18 })} ${title}`, content: out, size: 'lg' });
    const ctrl = new AbortController();
    const prev = m.backdrop;
    const obs = new MutationObserver(() => { if (!document.contains(prev)) { ctrl.abort(); obs.disconnect(); } });
    obs.observe(document.getElementById('modal-root'), { childList: true });
    try {
      await fn((full) => { out.innerHTML = String(renderMarkdown(full)); }, ctrl.signal);
      out.classList.remove('cursor-blink');
    } catch (err) {
      out.classList.remove('cursor-blink');
      if (err.name !== 'AbortError') out.innerHTML = String(html`<div class="notice danger">${icon('alert')}<span>${err.message}</span></div>`);
    }
  };
  const threadText = async () => {
    if ((post.threadCount || 1) > 1) {
      const parts = await api.getThread(post.threadRootId || post.id);
      return parts.map((p) => p.body).join('\n\n');
    }
    return post.body;
  };
  openMenu(anchor, [
    { header: 'Hype IA ✨' },
    { label: (post.threadCount || 1) > 1 ? 'Resumir el hilo' : 'Resumir', icon: 'list', onClick: () => run('Resumen', async (onToken, signal) => hypeAI.summarize(await threadText(), { onToken, signal })) },
    { label: /```/.test(post.body) ? 'Explicar el código' : 'Explícamelo fácil', icon: 'code', onClick: () => run('Explicación', (onToken, signal) => hypeAI.explain(post.body, { onToken, signal })) },
    { label: 'Ideas para responder', icon: 'message', onClick: () => replyIdeas(post) },
    ...(post.media?.some((m) => m.type === 'image') ? [{ label: 'Describir la imagen', icon: 'image', onClick: () => run('Descripción', (onToken, signal) => hypeAI.describeImage(post.media.find((m) => m.type === 'image').url).then((t) => { onToken(t); return t; })) }] : []),
  ]);
}

async function replyIdeas(post) {
  const { hypeAI, aiStatus } = await import('../ai/gemini.js');
  if (!aiStatus().available) { toast(aiStatus().message, { action: { label: 'Configurar', onClick: () => navigate('/ajustes/ia') } }); return; }
  const content = toElement(html`<div class="col"><div class="spinner"></div></div>`);
  const m = openModal({ title: 'Ideas para responder ✨', content, size: 'sm' });
  try {
    const replies = await hypeAI.replies(post.body);
    content.innerHTML = String(html`${replies.map((r) => html`<button type="button" class="ai-suggestion" data-r="${r}">${r}</button>`)}<p class="tiny dim">Toca una para comentarla.</p>`);
    content.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-r]');
      if (!b || !requireUser('comentar')) return;
      try { await api.addComment(post.id, b.dataset.r); post.commentCount++; refreshPostEls(post); toast('Comentario publicado', { type: 'success' }); m.close(); bus.emit('comment:added', { postId: post.id }); } catch (err) { toastError(err); }
    });
  } catch (err) { content.innerHTML = String(html`<div class="notice danger">${icon('alert')}<span>${err.message}</span></div>`); }
}

async function vote(post, indexes, el) {
  if (!requireUser('votar')) return;
  try {
    const poll = await api.votePoll(post.id, indexes);
    post.poll = { ...post.poll, ...poll, myVotes: poll.myVotes || indexes };
    const pollEl = el.closest('[data-poll]');
    const fresh = toElement(renderPoll(post));
    pollEl.replaceWith(fresh);
    requestAnimationFrame(() => fresh.querySelectorAll('.bar[data-w]').forEach((b) => { b.style.width = b.dataset.w + '%'; }));
    refreshPostEls(post);
    vibrate(8);
  } catch (err) { toastError(err); }
}

async function expandThread(btn) {
  const rootId = btn.dataset.root;
  const next = btn.nextElementSibling;
  if (next?.classList.contains('thread-parts')) {
    next.remove();
    btn.innerHTML = String(html`${icon('thread', { size: 16 })} Mostrar hilo completo`);
    return;
  }
  btn.disabled = true;
  try {
    const parts = (await api.getThread(rootId)).filter((p) => p.threadIndex > 0);
    const wrap = toElement(html`<div class="thread-parts">${parts.map((p, i) => renderPost(p, { variant: 'thread', threadLine: i < parts.length - 1 }))}</div>`);
    btn.after(wrap);
    hydratePosts(wrap);
    btn.innerHTML = String(html`${icon('chevronUp', { size: 16 })} Ocultar hilo`);
  } catch (err) { toastError(err); }
  btn.disabled = false;
}

export async function playGame(gameId) {
  const { openGameModal } = await import('../views/games.js');
  openGameModal(gameId);
}

let actionsReady = false;
export function initPostActions() {
  if (actionsReady) return;
  actionsReady = true;
  document.addEventListener('click', async (e) => {
    const target = e.target instanceof Element ? e.target : null;
    if (!target) return;
    const actionEl = target.closest('[data-action]');
    const card = target.closest('[data-post-id]');
    const post = card ? postCache.get(card.dataset.postId) : null;

    if (actionEl) {
      const action = actionEl.dataset.action;
      // Acciones que no dependen del post
      if (action === 'copy-code') {
        e.preventDefault();
        const code = actionEl.closest('.code-block')?.querySelector('pre')?.innerText || '';
        if (await copyText(code)) { actionEl.textContent = '¡Copiado!'; setTimeout(() => { actionEl.textContent = 'Copiar'; }, 1500); }
        return;
      }
      if (action === 'spoiler') { actionEl.classList.toggle('revealed'); e.preventDefault(); return; }
      if (action === 'play-game') { e.preventDefault(); playGame(actionEl.dataset.game); return; }
      if (action === 'thread-expand') { e.preventDefault(); expandThread(actionEl); return; }
      if (!post) return;
      switch (action) {
        case 'hype': e.preventDefault(); toggleHype(post, actionEl); return;
        case 'bookmark': e.preventDefault(); quickBookmark(post); return;
        case 'comment': e.preventDefault(); navigate(`/post/${post.threadRootId && post.threadIndex > 0 ? post.threadRootId : post.id}?reply=1`); return;
        case 'share': e.preventDefault(); sharePost(post); return;
        case 'repost': e.preventDefault(); repostMenu(post, actionEl); return;
        case 'post-menu': e.preventDefault(); postMenu(post, actionEl); return;
        case 'ai': e.preventDefault(); aiOnPost(post, actionEl); return;
        case 'expand': e.preventDefault(); card.querySelector('.post-body')?.classList.remove('clamped'); actionEl.remove(); return;
        case 'reveal-sensitive': e.preventDefault(); actionEl.remove(); return;
        case 'open-media': {
          e.preventDefault();
          const media = post.media.filter((m) => m.type !== 'video');
          const idx = Number(actionEl.dataset.index || 0);
          openLightbox(media, Math.max(0, media.indexOf(post.media[idx])));
          return;
        }
        case 'vote': {
          e.preventDefault();
          if (post.poll.multiple) {
            actionEl.classList.toggle('selected');
            const submit = actionEl.closest('[data-poll]').querySelector('[data-action="vote-submit"]');
            if (submit) submit.disabled = !actionEl.closest('[data-poll]').querySelector('.poll-option.selected');
          } else vote(post, [Number(actionEl.dataset.index)], actionEl);
          return;
        }
        case 'vote-submit': {
          e.preventDefault();
          const sel = $$('.poll-option.selected', actionEl.closest('[data-poll]')).map((b) => Number(b.dataset.index));
          if (sel.length) vote(post, sel, actionEl);
          return;
        }
        default: return;
      }
    }

    // Clic en la tarjeta → detalle del post
    if (card && post && card.classList.contains('clickable') && !target.closest('a, button, input, textarea, video, label, .media-item, .code-block, .spoiler')) {
      if (window.getSelection()?.toString()) return;
      navigate(`/post/${post.threadRootId && post.threadIndex > 0 ? post.threadRootId : post.id}`);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches?.('.sensitive-cover')) e.target.click();
  });
}

