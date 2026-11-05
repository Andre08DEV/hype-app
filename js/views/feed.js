// Inicio: feed con pestañas, filtros y scroll infinito.
import { html, toElement, $, $$ } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { state, bus, isFilteredOut } from '../core/store.js';
import { api } from '../data/api.js';
import { renderPost, hydratePosts } from '../components/post-card.js';
import { createInfiniteList, endOfFeed } from '../components/infinite.js';
import { openComposer, openShortComposer } from '../components/composer.js';
import { avatar } from '../components/common.js';
import { emptyState } from '../core/ui.js';
import { pickFiles } from '../core/utils.js';

const TABS = [
  { id: 'foryou', label: 'Para ti' },
  { id: 'following', label: 'Siguiendo' },
  { id: 'recent', label: 'Recientes' },
  { id: 'top', label: 'Top 🔥' },
];

export const KINDS = [
  { id: 'all', label: 'Todo' },
  { id: 'text', label: '📝 Texto' },
  { id: 'image', label: '🖼️ Imágenes' },
  { id: 'video', label: '🎬 Vídeos' },
  { id: 'gif', label: 'GIFs' },
  { id: 'poll', label: '📊 Encuestas' },
  { id: 'thread', label: '🧵 Hilos' },
  { id: 'code', label: '💻 Código' },
  { id: 'project', label: '🚀 Proyectos' },
  { id: 'game', label: '🎮 Juegos' },
];

const PERIODS = [{ id: 'all', label: 'Siempre' }, { id: 'day', label: 'Hoy' }, { id: 'week', label: 'Semana' }, { id: 'month', label: 'Mes' }];

export function render(el) {
  const st = { tab: state.settings.defaultFeed || 'foryou', kind: 'all', period: 'all', showFilters: false, pending: [] };
  const me = state.user;

  el.innerHTML = String(html`
    <div class="view-header no-mobile"><h1>Inicio</h1><span class="spacer"></span>
      <button class="icon-btn" data-toggle-filters title="Filtros" aria-label="Filtros">${icon('sliders')}</button></div>
    <div class="feed-tabs">
      <div class="tabs" role="tablist">${TABS.map((t) => html`<button class="tab ${t.id === st.tab ? 'active' : ''}" role="tab" data-tab="${t.id}">${t.label}</button>`)}</div>
    </div>
    ${me ? html`<div class="composer-prompt">
      ${avatar(me, 'md', { link: true })}
      <button class="fake-input" data-compose>¿Qué está pasando, ${me.displayName.split(' ')[0]}?</button>
      <div class="quick">
        <button class="icon-btn" data-quick="image" title="Imagen" aria-label="Publicar imagen">${icon('image')}</button>
        <button class="icon-btn" data-quick="poll" title="Encuesta" aria-label="Crear encuesta">${icon('poll')}</button>
        <button class="icon-btn" data-quick="short" title="Short" aria-label="Subir short">${icon('film')}</button>
      </div>
    </div>` : html`<div class="notice" style="margin:12px var(--pad)">${icon('sparkles')}<span>Estás explorando sin cuenta. <a href="#/bienvenida" class="bold" style="color:var(--accent-text)">Únete</a> para publicar, dar hype y guardar posts.</span></div>`}
    <div class="filter-bar">
      <div class="chips" data-kinds>${KINDS.map((k) => html`<button class="chip ${k.id === st.kind ? 'active' : ''}" data-kind="${k.id}">${k.label}</button>`)}</div>
      <button class="icon-btn sm" data-toggle-filters title="Más filtros" aria-label="Más filtros">${icon('sliders', { size: 18 })}</button>
    </div>
    <div class="filter-panel hidden" data-panel>
      <div class="col" style="gap:6px"><span class="flabel">Período</span><div class="segmented" data-periods>${PERIODS.map((p) => html`<button data-period="${p.id}" class="${p.id === st.period ? 'active' : ''}">${p.label}</button>`)}</div></div>
      <div class="row small muted" style="gap:8px;flex-wrap:wrap">${icon('filter', { size: 16 })}
        <span data-muted-summary></span>
        <a href="#/ajustes/contenido" style="color:var(--accent-text);font-weight:700">Editar filtros de contenido →</a></div>
    </div>
    <div data-new></div>
    <div data-list></div>`);

  const listHost = $('[data-list]', el);
  let list = null;

  const paintMuted = () => {
    const s = state.settings;
    const n = s.mutedWords.length, u = s.mutedUsers.length, k = s.hiddenKinds.length;
    $('[data-muted-summary]', el).textContent = n || u || k ? `Ocultando: ${n} palabras, ${u} usuarios, ${k} tipos de contenido` : 'Sin filtros de contenido activos';
  };

  function emptyFor() {
    if (st.tab === 'following') return emptyState({ emoji: '👀', title: 'Aún no sigues a nadie', text: 'Sigue a gente interesante y sus posts aparecerán aquí.', action: html`<a class="btn btn-primary" href="#/explore">Descubrir gente</a>` });
    if (st.kind !== 'all' || st.period !== 'all') return emptyState({ emoji: '🔎', title: 'Nada con estos filtros', text: 'Prueba con otro tipo de contenido o período.' });
    return emptyState({ emoji: '✨', title: 'Todavía no hay posts', text: '¡Sé la primera persona en publicar algo!', action: html`<button class="btn btn-primary" data-compose>Crear post</button>` });
  }

  function build() {
    list?.destroy();
    st.pending = [];
    $('[data-new]', el).innerHTML = '';
    list = createInfiniteList({
      container: listHost,
      load: (offset, limit) => api.feed({ tab: st.tab, kind: st.kind, period: st.period, offset, limit }),
      render: (p) => renderPost(p),
      keep: (p) => !isFilteredOut(p),
      empty: emptyFor(),
      end: endOfFeed(),
      afterRender: (root) => hydratePosts(root),
    });
    list.next();
  }

  const showPending = () => {
    const box = $('[data-new]', el);
    if (!st.pending.length) { box.innerHTML = ''; return; }
    box.innerHTML = String(html`<button class="new-posts-pill" data-show-new>${icon('arrowUp', { size: 16 })} ${st.pending.length === 1 ? '1 post nuevo' : `${st.pending.length} posts nuevos`}</button>`);
  };

  el.addEventListener('click', async (e) => {
    const t = e.target;
    const tab = t.closest('[data-tab]');
    if (tab) { st.tab = tab.dataset.tab; $$('[data-tab]', el).forEach((b) => b.classList.toggle('active', b === tab)); build(); return; }
    const kind = t.closest('[data-kind]');
    if (kind) { st.kind = kind.dataset.kind; $$('[data-kind]', el).forEach((b) => b.classList.toggle('active', b === kind)); build(); return; }
    const period = t.closest('[data-period]');
    if (period) { st.period = period.dataset.period; $$('[data-period]', el).forEach((b) => b.classList.toggle('active', b === period)); build(); return; }
    if (t.closest('[data-toggle-filters]')) { st.showFilters = !st.showFilters; $('[data-panel]', el).classList.toggle('hidden', !st.showFilters); paintMuted(); return; }
    if (t.closest('[data-compose]')) { openComposer(); return; }
    const q = t.closest('[data-quick]')?.dataset.quick;
    if (q === 'image') { const files = await pickFiles({ accept: 'image/*,video/*', multiple: true }); if (files.length) openComposer({ files }); return; }
    if (q === 'poll') { openComposer({ poll: true }); return; }
    if (q === 'short') { openShortComposer(); return; }
    if (t.closest('[data-show-new]')) {
      const items = st.pending.splice(0);
      items.reverse().forEach((p) => { const nodes = list.prepend(p); if (nodes) hydratePosts(listHost); });
      showPending();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  const offs = [
    bus.on('post:created', (post) => {
      if (post.kind === 'short') return;
      const nodes = list.prepend(post);
      const card = nodes?.find((n) => n.nodeType === 1);
      if (card) { hydratePosts(listHost); card.classList.add('focused'); setTimeout(() => card.classList.remove('focused'), 2500); }
    }),
    bus.on('post:new', (post) => {
      if (!post || post.authorId === state.user?.id || isFilteredOut(post) || post.kind === 'short') return;
      if (st.pending.some((p) => p.id === post.id)) return;
      st.pending.push(post);
      showPending();
    }),
    bus.on('filters:change', () => build()),
  ];

  build();
  return { destroy() { offs.forEach((o) => o()); list?.destroy(); } };
}
