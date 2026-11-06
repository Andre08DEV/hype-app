// Grupos: descubrir, crear, unirse (públicos y privados con solicitud) y feed del grupo.
import { html, toElement, $, $$ } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { state, bus } from '../core/store.js';
import { api } from '../data/api.js';
import { renderMarkdown } from '../core/markdown.js';
import { formatCount, debounce, formatDate } from '../core/utils.js';
import { openModal, toast, toastError, confirmDialog, emptyState, setLoading } from '../core/ui.js';
import { navigate, back } from '../core/router.js';
import { avatar, colorVars } from '../components/common.js';
import { renderPost, hydratePosts } from '../components/post-card.js';
import { createInfiniteList, endOfFeed } from '../components/infinite.js';
import { openComposer } from '../components/composer.js';
import { requireUser } from '../components/session.js';

const GROUP_EMOJIS = ['👥', '💻', '🍳', '🎮', '🎨', '🤖', '🚀', '📚', '🎧', '📸', '⚽', '🌱', '🧪', '💼', '🎬', '✈️'];
const COLOR_PRESETS = [['#8b5cf6', '#ec4899'], ['#6366f1', '#06b6d4'], ['#f97316', '#facc15'], ['#10b981', '#3b82f6'], ['#ec4899', '#f43f5e'], ['#f59e0b', '#ef4444'], ['#0ea5e9', '#22c55e']];

function joinButton(g) {
  if (!state.user) return html`<a class="btn btn-primary btn-sm" href="#/bienvenida">Unirme</a>`;
  if (g.myRole === 'owner') return html`<span class="pill accent">👑 Creador</span>`;
  if (g.myStatus === 'active') return html`<button class="btn btn-outline btn-sm" data-leave="${g.id}">Miembro ✓</button>`;
  if (g.myStatus === 'pending') return html`<button class="btn btn-secondary btn-sm" data-leave="${g.id}">Solicitud enviada</button>`;
  return html`<button class="btn btn-primary btn-sm" data-join="${g.id}">${g.isPrivate ? 'Solicitar' : 'Unirme'}</button>`;
}

function card(g) {
  return html`<div class="group-card" data-group="${g.id}">
    <a href="#/g/${encodeURIComponent(g.slug)}" class="group-cover" style="${colorVars(g.color, g.id)}"></a>
    <a href="#/g/${encodeURIComponent(g.slug)}" class="group-emoji">${g.emoji}</a>
    <div class="body">
      <a href="#/g/${encodeURIComponent(g.slug)}"><h3>${g.name} ${g.isPrivate ? icon('lock', { size: 14 }) : ''}</h3></a>
      <p>${g.description}</p>
      <div class="foot"><span class="tiny dim">${formatCount(g.memberCount)} miembros · ${formatCount(g.postCount)} posts</span>${joinButton(g)}</div>
    </div>
  </div>`;
}

async function handleJoinLeave(e, onChange) {
  const j = e.target.closest('[data-join]');
  const l = e.target.closest('[data-leave]');
  if (!j && !l) return false;
  e.preventDefault();
  if (!requireUser('unirte a grupos')) return true;
  const btn = j || l;
  setLoading(btn, true);
  try {
    if (j) {
      const g = await api.joinGroup(j.dataset.join);
      toast(g.myStatus === 'pending' ? 'Solicitud enviada. Te avisaremos cuando te acepten 🙋' : `Te uniste a ${g.name} 🎉`, { type: 'success' });
      onChange?.(g);
    } else {
      if (!(await confirmDialog({ title: '¿Salir del grupo?', message: 'Puedes volver a unirte cuando quieras (en grupos privados tendrás que pedirlo de nuevo).', confirmText: 'Salir' }))) { setLoading(btn, false); return true; }
      const g = await api.leaveGroup(l.dataset.leave);
      toast('Saliste del grupo');
      onChange?.(g);
    }
  } catch (err) { toastError(err); setLoading(btn, false); }
  return true;
}

export function openGroupForm(group = null) {
  if (!requireUser('crear grupos')) return;
  const g = group || { name: '', description: '', emoji: '👥', color: COLOR_PRESETS[0], isPrivate: false, tags: [] };
  let emoji = g.emoji, color = g.color;
  const form = toElement(html`<form class="col">
    <div class="group-card" style="pointer-events:none"><div class="group-cover" data-pcover style="${colorVars(color)}"></div><div class="group-emoji" data-pemoji>${emoji}</div><div class="body"><h3 data-pname>${g.name || 'Nombre del grupo'}</h3></div></div>
    <div class="field"><label for="gf-name">Nombre</label><input class="input" id="gf-name" name="name" required minlength="3" maxlength="60" value="${g.name}" placeholder="Ej. Fotografía Nocturna"></div>
    <div class="field"><label for="gf-desc">Descripción</label><textarea class="textarea" id="gf-desc" name="description" maxlength="500" placeholder="¿De qué va el grupo? ¿Qué normas tiene?">${g.description}</textarea></div>
    <div class="field"><label>Icono</label><div class="emoji-picker">${GROUP_EMOJIS.map((e) => html`<button type="button" data-emoji="${e}" class="${e === emoji ? 'active' : ''}">${e}</button>`)}</div></div>
    <div class="field"><label>Color</label><div class="swatches">${COLOR_PRESETS.map((c, i) => html`<button type="button" class="swatch ${c[0] === color[0] ? 'active' : ''}" data-color="${i}" style="--s1:${c[0]};--s2:${c[1]}" aria-label="Color ${i + 1}"></button>`)}</div></div>
    <div class="field"><label for="gf-tags">Etiquetas</label><input class="input" id="gf-tags" name="tags" value="${(g.tags || []).join(', ')}" placeholder="fotografía, noche, tips"></div>
    <label class="set-row" style="padding:12px;border:1px solid var(--border);border-radius:var(--r);cursor:pointer"><span class="meta"><b>${icon('lock', { size: 14 })} Grupo privado</b><span>Solo los miembros ven los posts. Para entrar hay que solicitarlo.</span></span><span class="switch"><input type="checkbox" name="isPrivate" ${g.isPrivate ? 'checked' : ''}><span class="track"></span><span class="thumb"></span></span></label>
  </form>`);
  const footer = toElement(html`<div class="row" style="justify-content:flex-end;width:100%"><button class="btn btn-ghost" data-cancel>Cancelar</button><button class="btn btn-primary" data-save>${group ? 'Guardar' : 'Crear grupo'}</button></div>`);
  const m = openModal({ title: group ? 'Editar grupo' : 'Crear grupo', content: form, footer, size: 'md' });
  form.addEventListener('click', (e) => {
    const em = e.target.closest('[data-emoji]');
    if (em) { emoji = em.dataset.emoji; $$('[data-emoji]', form).forEach((b) => b.classList.toggle('active', b === em)); $('[data-pemoji]', form).textContent = emoji; }
    const c = e.target.closest('[data-color]');
    if (c) { color = COLOR_PRESETS[Number(c.dataset.color)]; $$('[data-color]', form).forEach((b) => b.classList.toggle('active', b === c)); $('[data-pcover]', form).setAttribute('style', colorVars(color)); }
  });
  form.name.addEventListener('input', () => { $('[data-pname]', form).textContent = form.name.value || 'Nombre del grupo'; });
  footer.querySelector('[data-cancel]').onclick = () => m.close();
  footer.querySelector('[data-save]').onclick = async (e) => {
    const btn = e.currentTarget;
    if (form.name.value.trim().length < 3) { toast('El nombre debe tener al menos 3 caracteres'); form.name.focus(); return; }
    const data = { name: form.name.value.trim(), description: form.description.value.trim(), emoji, color, isPrivate: form.isPrivate.checked, tags: form.tags.value.split(/[,#\s]+/).map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 8) };
    setLoading(btn, true);
    try {
      const saved = group ? await api.updateGroup(group.id, data) : await api.createGroup(data);
      m.close();
      toast(group ? 'Grupo actualizado' : `Grupo ${saved.emoji} ${saved.name} creado`, { type: 'success' });
      navigate(`/g/${encodeURIComponent(saved.slug)}`);
    } catch (err) { toastError(err); setLoading(btn, false); }
  };
}

async function renderList(el, ctx) {
  let tab = ctx.query.tab === 'mios' ? 'mine' : 'discover';
  let q = '';
  el.innerHTML = String(html`<div class="view-header"><h1>Grupos</h1><span class="spacer"></span><button class="btn btn-primary btn-sm" data-new>${icon('plus', { size: 16 })} Crear grupo</button></div>
    <div class="tabs"><button class="tab ${tab === 'discover' ? 'active' : ''}" data-tab="discover">Descubrir</button>${state.user ? html`<button class="tab ${tab === 'mine' ? 'active' : ''}" data-tab="mine">Mis grupos</button>` : ''}</div>
    <div class="view-body col">
      <div class="input-group">${icon('search', { size: 18 })}<input class="input search-input" data-q placeholder="Buscar grupos por tema…"></div>
      <div class="cards-grid" data-grid></div>
    </div>`);
  const grid = $('[data-grid]', el);
  const load = async () => {
    grid.innerHTML = '<div class="spinner"></div>';
    try {
      const { items } = await api.listGroups({ q, mine: tab === 'mine' });
      grid.innerHTML = items.length ? String(html`${items.map(card)}`) : String(emptyState({ emoji: '👥', title: tab === 'mine' ? 'Aún no estás en ningún grupo' : 'No hay grupos con ese nombre', text: 'Crea uno sobre lo que te apasiona.', action: html`<button class="btn btn-primary" data-new>Crear grupo</button>` }));
    } catch (err) { grid.innerHTML = String(html`<div class="notice danger">${err.message}</div>`); }
  };
  el.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-tab]');
    if (t) { tab = t.dataset.tab; $$('[data-tab]', el).forEach((b) => b.classList.toggle('active', b === t)); load(); return; }
    if (e.target.closest('[data-new]')) { openGroupForm(); return; }
    await handleJoinLeave(e, (g) => { const c = el.querySelector(`[data-group="${CSS.escape(g.id)}"]`); if (c) c.replaceWith(toElement(card(g))); });
  });
  $('[data-q]', el).addEventListener('input', debounce((e) => { q = e.target.value.trim(); load(); }, 300));
  load();
}

async function renderGroup(el, ctx) {
  el.innerHTML = String(html`<div class="view-header"><button class="icon-btn" data-back aria-label="Volver">${icon('arrowLeft')}</button><h1>Grupo</h1></div><div data-body><div class="spinner"></div></div>`);
  el.querySelector('[data-back]').onclick = () => back('/grupos');
  let g;
  try { g = await api.getGroup(ctx.params.slug); } catch (err) { $('[data-body]', el).innerHTML = String(emptyState({ emoji: '🫥', title: 'Grupo no encontrado', text: err.message })); return; }
  let tab = ctx.query.tab === 'solicitudes' ? 'requests' : ctx.query.tab === 'miembros' ? 'members' : 'posts';
  let list = null;
  const isAdmin = ['owner', 'admin'].includes(g.myRole) && g.myStatus === 'active';
  const canSee = !g.isPrivate || g.myStatus === 'active';

  const paint = () => {
    el.querySelector('.view-header h1').textContent = g.name;
    $('[data-body]', el).innerHTML = String(html`<div class="group-hero">
      <div class="group-cover" style="${colorVars(g.color, g.id)}"></div>
      <div class="group-emoji">${g.emoji}</div>
      <div class="info">
        <div class="row" style="justify-content:space-between;align-items:flex-start;gap:12px"><h1>${g.name}</h1><div class="row">${joinButton(g)}${isAdmin ? html`<button class="icon-btn" data-edit aria-label="Editar grupo" title="Editar">${icon('settings', { size: 18 })}</button>` : ''}</div></div>
        <div class="row-wrap small muted"><span>${g.isPrivate ? html`${icon('lock', { size: 14 })} Privado` : html`${icon('globe', { size: 14 })} Público`}</span><span>· ${formatCount(g.memberCount)} miembros</span><span>· creado ${formatDate(g.createdAt, { month: 'short', year: 'numeric' })}</span></div>
        ${g.description ? html`<div class="md">${renderMarkdown(g.description, { compact: true })}</div>` : ''}
        <div class="row-wrap">${g.tags.map((t) => html`<a class="pill" href="#/explore?tag=${encodeURIComponent(t)}">#${t}</a>`)}</div>
      </div>
    </div>
    <div class="tabs">
      <button class="tab ${tab === 'posts' ? 'active' : ''}" data-tab="posts">Posts</button>
      <button class="tab ${tab === 'members' ? 'active' : ''}" data-tab="members">Miembros</button>
      ${isAdmin && g.isPrivate ? html`<button class="tab ${tab === 'requests' ? 'active' : ''}" data-tab="requests">Solicitudes</button>` : ''}
    </div>
    <div data-tabbody></div>`);
    paintTab();
  };

  const paintTab = async () => {
    list?.destroy();
    const body = $('[data-tabbody]', el);
    if (!canSee && tab !== 'members') {
      body.innerHTML = String(html`<div class="locked"><div style="font-size:48px">🔒</div><h3>Grupo privado</h3><p>Solo los miembros pueden ver los posts. ${g.myStatus === 'pending' ? 'Tu solicitud está pendiente.' : 'Solicita unirte para participar.'}</p>${g.myStatus ? '' : joinButton(g)}</div>`);
      return;
    }
    if (tab === 'posts') {
      body.innerHTML = String(html`${g.myStatus === 'active' ? html`<div class="composer-prompt">${avatar(state.user, 'md')}<button class="fake-input" data-compose>Publica algo en ${g.name}…</button></div>` : ''}<div data-list></div>`);
      list = createInfiniteList({
        container: $('[data-list]', body),
        load: (offset, limit) => api.feed({ tab: 'recent', groupId: g.id, offset, limit }),
        render: (p) => renderPost(p),
        empty: emptyState({ emoji: g.emoji, title: 'Aún no hay posts', text: g.myStatus === 'active' ? '¡Rompe el hielo con el primer post!' : 'Únete para publicar.' }),
        end: endOfFeed('Has visto todos los posts del grupo.'),
        afterRender: (root) => hydratePosts(root),
      });
      list.next();
    } else {
      body.innerHTML = '<div class="spinner"></div>';
      const status = tab === 'requests' ? 'pending' : 'active';
      try {
        const members = await api.groupMembers(g.id, { status });
        body.innerHTML = members.length ? String(html`${members.map((m) => html`<div class="user-row">${avatar(m.user, 'md', { link: true })}<a class="meta" href="#/u/${encodeURIComponent(m.user.username)}"><b>${m.user.displayName}</b> ${m.role === 'owner' ? html`<span class="pill accent">👑 Creador</span>` : m.role === 'admin' ? html`<span class="pill">Admin</span>` : ''}<br><span class="dim small">@${m.user.username}</span></a>
          ${isAdmin && status === 'pending' ? html`<button class="btn btn-primary btn-sm" data-approve="${m.user.id}">Aceptar</button><button class="btn btn-ghost btn-sm" data-reject="${m.user.id}">Rechazar</button>` : ''}
          ${isAdmin && status === 'active' && m.role === 'member' ? html`<button class="btn btn-ghost btn-sm" data-reject="${m.user.id}" title="Expulsar">${icon('x', { size: 16 })}</button>` : ''}</div>`)}`)
          : String(emptyState({ emoji: status === 'pending' ? '📭' : '👥', title: status === 'pending' ? 'No hay solicitudes pendientes' : 'Sin miembros visibles' }));
      } catch (err) { body.innerHTML = String(html`<div class="notice danger" style="margin:16px">${err.message}</div>`); }
    }
  };

  el.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-tab]');
    if (t) { tab = t.dataset.tab; $$('[data-tab]', el).forEach((b) => b.classList.toggle('active', b === t)); paintTab(); return; }
    if (e.target.closest('[data-compose]')) { openComposer({ groupId: g.id, groupName: g.name }); return; }
    if (e.target.closest('[data-edit]')) {
      const { openMenu } = await import('../core/ui.js');
      openMenu(e.target.closest('[data-edit]'), [
        { label: 'Editar grupo', icon: 'edit', onClick: () => openGroupForm(g) },
        ...(g.myRole === 'owner' ? [{ label: 'Eliminar grupo', icon: 'trash', danger: true, onClick: async () => { if (await confirmDialog({ title: `Eliminar ${g.name}`, message: 'Se borrarán el grupo y todos sus posts. No se puede deshacer.', confirmText: 'Eliminar', danger: true })) { try { await api.deleteGroup(g.id); toast('Grupo eliminado'); navigate('/grupos'); } catch (err) { toastError(err); } } } }] : []),
      ]);
      return;
    }
    const ap = e.target.closest('[data-approve]');
    if (ap) { try { await api.approveMember(g.id, ap.dataset.approve); ap.closest('.user-row').remove(); toast('Miembro aceptado ✅'); g.memberCount++; } catch (err) { toastError(err); } return; }
    const rj = e.target.closest('[data-reject]');
    if (rj) { try { await api.removeMember(g.id, rj.dataset.reject); rj.closest('.user-row').remove(); } catch (err) { toastError(err); } return; }
    await handleJoinLeave(e, (ng) => { if (ng) { g = ng; navigate(`/g/${encodeURIComponent(g.slug)}`, { replace: true }); } });
  });
  const off = bus.on('post:created', (p) => { if (p.groupId === g.id && list) { list.prepend(p); hydratePosts(el); } });
  paint();
  return () => { off(); list?.destroy(); };
}

export function render(el, ctx) {
  if (ctx.params.slug) return renderGroup(el, ctx);
  return renderList(el, ctx);
}
