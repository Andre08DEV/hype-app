// Comentarios: render y hoja (sheet) reutilizable.
import { html, toElement } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { state, bus } from '../core/store.js';
import { renderMarkdown } from '../core/markdown.js';
import { timeAgo, formatDateTime } from '../core/utils.js';
import { openModal, toastError, emptyState } from '../core/ui.js';
import { api } from '../data/api.js';
import { avatar, verified } from './common.js';
import { requireUser } from './session.js';
import { refreshPostEls } from './post-card.js';

export function renderComment(c, ownerId) {
  const canDelete = state.user && (c.authorId === state.user.id || ownerId === state.user.id);
  return html`<div class="comment" data-comment="${c.id}">
    ${avatar(c.author, 'sm', { link: true })}
    <div class="bubble">
      <div class="post-head"><a class="name" href="#/u/${encodeURIComponent(c.author?.username || '')}">${c.author?.displayName}</a>${verified(c.author)}<span class="handle">@${c.author?.username}</span><span class="dot">·</span><span class="time" title="${formatDateTime(c.createdAt)}">${timeAgo(c.createdAt)}</span>
        ${canDelete ? html`<button type="button" class="icon-btn sm menu-btn" data-del-comment="${c.id}" title="Eliminar" aria-label="Eliminar comentario">${icon('trash', { size: 15 })}</button>` : ''}</div>
      <div class="md" style="font-size:.92rem">${renderMarkdown(c.body, { compact: true })}</div>
    </div>
  </div>`;
}

/** Hoja de comentarios para un post (usada en Shorts). */
export async function openCommentsSheet(post) {
  const content = toElement(html`<div class="col" style="gap:0;margin:-18px">
    <div data-list style="max-height:55dvh;overflow-y:auto"><div class="spinner"></div></div>
    ${state.user ? html`<form class="comment-form" data-form style="border-top:1px solid var(--border);border-bottom:0">${avatar(state.user, 'sm')}<textarea class="textarea" name="body" rows="1" maxlength="2000" placeholder="Añade un comentario…" aria-label="Comentario"></textarea><button class="btn btn-primary btn-sm" type="submit">${icon('send', { size: 16 })}</button></form>`
      : html`<div class="comment-form"><a class="btn btn-secondary btn-sm" href="#/bienvenida">Inicia sesión para comentar</a></div>`}
  </div>`);
  const m = openModal({ title: `Comentarios · ${post.commentCount || 0}`, content, size: 'md' });
  const list = content.querySelector('[data-list]');
  const load = async () => {
    try {
      const comments = await api.listComments(post.id);
      list.innerHTML = comments.length ? String(html`${comments.map((c) => renderComment(c, post.authorId))}`) : String(emptyState({ emoji: '💬', title: 'Sé el primero en comentar' }));
    } catch (err) { list.innerHTML = String(html`<p class="notice danger" style="margin:16px">${err.message}</p>`); }
  };
  load();
  const form = content.querySelector('[data-form]');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!requireUser('comentar')) return;
    const ta = form.body;
    if (!ta.value.trim()) return;
    try {
      const c = await api.addComment(post.id, ta.value);
      ta.value = '';
      if (api.mode === 'cloud') { post.commentCount++; refreshPostEls(post); }
      list.querySelector('.empty')?.remove();
      list.appendChild(toElement(renderComment(c, post.authorId)));
      list.scrollTop = list.scrollHeight;
    } catch (err) { toastError(err); }
  });
  list.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-del-comment]');
    if (!b) return;
    try { await api.deleteComment(b.dataset.delComment); b.closest('.comment').remove(); } catch (err) { toastError(err); }
  });
  const off = bus.on('comment:new', (c) => { if (c.postId === post.id && document.contains(list)) { list.querySelector('.empty')?.remove(); list.appendChild(toElement(renderComment(c, post.authorId))); } });
  const obs = new MutationObserver(() => { if (!document.contains(content)) { off(); obs.disconnect(); } });
  obs.observe(document.getElementById('modal-root'), { childList: true });
  return m;
}
