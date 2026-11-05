// Detalle de un post: hilo completo + comentarios.
import { html, toElement, $ } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { state, bus } from '../core/store.js';
import { api } from '../data/api.js';
import { renderPost, hydratePosts, cachePost, refreshPostEls, postCache } from '../components/post-card.js';
import { avatar } from '../components/common.js';
import { renderComment } from '../components/comments.js';
import { back } from '../core/router.js';
import { emptyState, toastError, confirmDialog, toast } from '../core/ui.js';
import { requireUser } from '../components/session.js';

export async function render(el, ctx) {
  el.innerHTML = String(html`<div class="view-header"><button class="icon-btn" data-back aria-label="Volver">${icon('arrowLeft')}</button><h1>Post</h1></div><div data-body><div class="spinner"></div></div>`);
  el.querySelector('[data-back]').onclick = () => back();
  const body = $('[data-body]', el);
  let post;
  try { post = cachePost(await api.getPost(ctx.params.id)); } catch (err) {
    body.innerHTML = String(emptyState({ emoji: '🫥', title: 'Post no disponible', text: err.message, action: html`<a class="btn btn-secondary" href="#/">Ir al inicio</a>` }));
    return;
  }
  const rootId = post.threadRootId || post.id;
  if (post.threadRootId && post.id !== post.threadRootId) { try { post = cachePost(await api.getPost(rootId)); } catch { /* sigue con la parte */ } }
  let parts = [];
  if ((post.threadCount || 1) > 1) { try { parts = (await api.getThread(rootId)).filter((p) => p.threadIndex > 0); } catch { parts = []; } }
  const all = [post, ...parts];

  body.innerHTML = String(html`
    <div data-thread>${all.map((p, i) => renderPost(p, { variant: 'detail', threadLine: i < all.length - 1 }))}</div>
    ${parts.length ? html`<div class="notice" style="margin:12px var(--pad)">${icon('thread')}<span>Hilo de <b>${all.length}</b> posts de @${post.author?.username}. ¿Mucho texto? Toca ✨ y pide un resumen a Hype IA.</span></div>` : ''}
    <div class="section-title" style="padding:14px var(--pad) 0">Comentarios</div>
    ${state.user ? html`<form class="comment-form" data-form>
      ${avatar(state.user, 'sm')}
      <textarea class="textarea" name="body" rows="1" maxlength="2000" placeholder="Escribe un comentario… (Markdown, @menciones)" aria-label="Comentario"></textarea>
      <button class="btn btn-primary btn-sm" type="submit">Comentar</button>
    </form>` : html`<div class="comment-form"><a class="btn btn-secondary btn-sm" href="#/bienvenida">Inicia sesión para comentar</a></div>`}
    <div data-comments><div class="spinner"></div></div>`);
  hydratePosts(body);

  const list = $('[data-comments]', body);
  const loadComments = async () => {
    try {
      const comments = await api.listComments(post.id);
      list.innerHTML = comments.length ? String(html`${comments.map((c) => renderComment(c, post.authorId))}`) : String(emptyState({ emoji: '💬', title: 'Sin comentarios aún', text: 'Rompe el hielo con el primer comentario.' }));
    } catch (err) { list.innerHTML = String(html`<div class="notice danger" style="margin:16px">${err.message}</div>`); }
  };
  loadComments();

  const form = $('[data-form]', body);
  if (form) {
    const ta = form.querySelector('textarea');
    ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 220) + 'px'; });
    ta.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') form.requestSubmit(); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!requireUser('comentar')) return;
      const text = ta.value.trim();
      if (!text) return;
      const btn = form.querySelector('button');
      btn.disabled = true;
      try {
        const c = await api.addComment(post.id, text);
        ta.value = '';
        ta.style.height = '';
        const p = postCache.get(post.id);
        if (p && api.mode === 'cloud') { p.commentCount++; refreshPostEls(p); }
        const empty = list.querySelector('.empty');
        if (empty) list.innerHTML = '';
        list.appendChild(toElement(renderComment(c, post.authorId)));
      } catch (err) { toastError(err); }
      btn.disabled = false;
    });
    if (ctx.query.reply) setTimeout(() => { ta.focus(); ta.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 200);
  }

  list.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-del-comment]');
    if (!b) return;
    if (!(await confirmDialog({ title: 'Eliminar comentario', message: '¿Seguro?', confirmText: 'Eliminar', danger: true }))) return;
    try {
      await api.deleteComment(b.dataset.delComment);
      b.closest('.comment').remove();
      const p = postCache.get(post.id);
      if (p && api.mode === 'cloud') { p.commentCount = Math.max(0, p.commentCount - 1); refreshPostEls(p); }
      toast('Comentario eliminado');
    } catch (err) { toastError(err); }
  });

  const offs = [
    bus.on('comment:new', (c) => { if (c.postId === post.id) { list.querySelector('.empty')?.remove(); list.appendChild(toElement(renderComment(c, post.authorId))); } }),
    bus.on('comment:added', ({ postId }) => { if (postId === post.id) loadComments(); }),
  ];
  return () => offs.forEach((o) => o());
}
