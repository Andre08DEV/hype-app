// Notificaciones: hype, comentarios, menciones, seguidores, grupos y proyectos.
import { html, $, $$, toFragment } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { state, bus } from '../core/store.js';
import { api } from '../data/api.js';
import { timeAgo } from '../core/utils.js';
import { emptyState, toast } from '../core/ui.js';
import { navigate } from '../core/router.js';
import { avatar } from '../components/common.js';
import { createInfiniteList } from '../components/infinite.js';
import { describeNotification } from '../components/notify.js';

function renderNotif(n) {
  const d = describeNotification(n);
  return html`<a class="notif ${n.readAt ? '' : 'unread'}" href="${d.href || '#/notificaciones'}" data-notif="${n.id}">
    <span class="n-icon ${d.cls}">${d.emoji}</span>
    <span class="meta">
      <span class="row" style="gap:8px">${n.actor ? avatar(n.actor, 'sm') : ''}<span class="tiny dim">${timeAgo(n.createdAt)}</span></span>
      <span><b>${d.text}</b></span>
      ${n.post?.excerpt || n.body ? html`<span class="excerpt">${n.body || n.post.excerpt}</span>` : ''}
    </span>
  </a>`;
}

export function render(el, ctx) {
  if (!state.user) { navigate('/bienvenida', { replace: true }); return; }
  let type = ctx.query.tipo || 'all';
  el.innerHTML = String(html`<div class="view-header"><h1>Notificaciones</h1><span class="spacer"></span><button class="btn btn-ghost btn-sm" data-read>${icon('check', { size: 16 })} Marcar todo como leído</button></div>
    <div class="tabs">${[['all', 'Todas'], ['mentions', 'Menciones y comentarios'], ['hype', '🔥 Hype']].map(([k, l]) => html`<button class="tab ${k === type ? 'active' : ''}" data-type="${k}">${l}</button>`)}</div>
    ${state.settings.notify?.browser && 'Notification' in window && Notification.permission === 'default' ? html`<div class="notice" style="margin:12px var(--pad)">${icon('bell')}<span style="flex:1">Activa los avisos del navegador para enterarte aunque Hype esté en segundo plano.</span><button class="btn btn-primary btn-sm" data-perm>Activar</button></div>` : ''}
    <div data-list></div>`);
  let list = null;
  const build = () => {
    list?.destroy();
    list = createInfiniteList({
      container: $('[data-list]', el),
      skeleton: false,
      pageSize: 20,
      load: (offset, limit) => api.listNotifications({ offset, limit, type }),
      render: renderNotif,
      empty: emptyState({ emoji: '🔔', title: 'Todo tranquilo por aquí', text: 'Cuando alguien te dé hype, comente o te siga, lo verás aquí.' }),
    });
    list.next();
  };
  el.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-type]');
    if (t) { type = t.dataset.type; $$('[data-type]', el).forEach((b) => b.classList.toggle('active', b === t)); build(); return; }
    if (e.target.closest('[data-read]')) { await api.markNotificationsRead(); $$('.notif.unread', el).forEach((n) => n.classList.remove('unread')); toast('Todo leído ✓'); return; }
    if (e.target.closest('[data-perm]')) { const p = await Notification.requestPermission(); e.target.closest('.notice')?.remove(); toast(p === 'granted' ? 'Avisos activados 🔔' : 'Permiso denegado'); }
  });
  const off = bus.on('notification', (n) => {
    const node = toFragment(renderNotif(n));
    $('[data-list] > div', el)?.prepend(node);
    $('[data-list] .empty', el)?.remove();
  });
  build();
  const timer = setTimeout(() => api.markNotificationsRead().catch(() => {}), 2500);
  return () => { off(); clearTimeout(timer); list?.destroy(); };
}
