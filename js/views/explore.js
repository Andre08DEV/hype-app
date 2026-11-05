// Explorar: búsqueda, hashtags, tendencias y "¿Qué me perdí?" con Hype IA.
import { html, $ } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { state, isFilteredOut } from '../core/store.js';
import { api } from '../data/api.js';
import { renderMarkdown, stripMarkdown } from '../core/markdown.js';
import { debounce, formatCount } from '../core/utils.js';
import { emptyState, toast } from '../core/ui.js';
import { navigate } from '../core/router.js';
import { avatar, verified, followBtn, coverBox, colorVars, stagePill } from '../components/common.js';
import { renderPost, hydratePosts } from '../components/post-card.js';
import { createInfiniteList, endOfFeed } from '../components/infinite.js';

const userRow = (p) => html`<div class="user-row">${avatar(p, 'md', { link: true })}<a class="meta" href="#/u/${encodeURIComponent(p.username)}"><b>${p.displayName}</b>${verified(p)} <span class="dim small">@${p.username}</span>${p.bio ? html`<div class="bio">${stripMarkdown(p.bio)}</div>` : ''}</a>${followBtn(p)}</div>`;

export function render(el, ctx) {
  const tag = (ctx.query.tag || '').toLowerCase();
  let q = ctx.query.q || '';
  let tab = 'posts';
  let list = null;

  el.innerHTML = String(html`<div class="view-header"><h1>${tag ? html`#${tag}` : 'Explorar'}</h1></div>
    <div class="explore-hero">
      <div class="input-group">${icon('search', { size: 18 })}<input class="input search-input" data-search placeholder="Buscar posts, personas, grupos o proyectos" value="${q}" aria-label="Buscar"></div>
      ${!tag ? html`<div class="tag-cloud" data-trends></div>` : ''}
    </div>
    <div data-tabs></div>
    <div data-results></div>`);
  const results = $('[data-results]', el);

  const showTag = () => {
    list = createInfiniteList({
      container: results,
      load: (offset, limit) => api.feed({ tab: 'recent', tag, offset, limit }),
      render: (p) => renderPost(p), keep: (p) => !isFilteredOut(p),
      empty: emptyState({ emoji: '#️⃣', title: `Nadie ha usado #${tag} todavía`, text: '¡Estrena la etiqueta con tu post!' }),
      end: endOfFeed(), afterRender: (root) => hydratePosts(root),
    });
    list.next();
  };

  const showSearch = async () => {
    list?.destroy();
    list = null;
    $('[data-tabs]', el).innerHTML = String(html`<div class="tabs">${[['posts', 'Posts'], ['people', 'Personas'], ['groups', 'Grupos'], ['projects', 'Proyectos']].map(([k, l]) => html`<button class="tab ${k === tab ? 'active' : ''}" data-tab="${k}">${l}</button>`)}</div>`);
    results.innerHTML = '';
    if (tab === 'posts') {
      list = createInfiniteList({
        container: results,
        load: (offset, limit) => api.feed({ tab: 'top', q, offset, limit }),
        render: (p) => renderPost(p), keep: (p) => !isFilteredOut(p),
        empty: emptyState({ emoji: '🔎', title: `Sin resultados para «${q}»`, text: 'Prueba con otras palabras.' }),
        end: endOfFeed('No hay más resultados.'), afterRender: (root) => hydratePosts(root),
      });
      list.next();
      return;
    }
    results.innerHTML = '<div class="spinner"></div>';
    try {
      if (tab === 'people') {
        const people = await api.searchProfiles(q, 30);
        results.innerHTML = people.length ? String(html`${people.map(userRow)}`) : String(emptyState({ emoji: '👤', title: 'Nadie con ese nombre' }));
      } else if (tab === 'groups') {
        const { items } = await api.listGroups({ q });
        results.innerHTML = items.length ? String(html`${items.map((g) => html`<a class="user-row" href="#/g/${encodeURIComponent(g.slug)}"><span class="group-emoji" style="margin:0;width:44px;height:44px;font-size:22px;border-radius:14px;${colorVars(g.color, g.id)}">${g.emoji}</span><span class="meta"><b>${g.name}</b> ${g.isPrivate ? icon('lock', { size: 12 }) : ''}<div class="bio">${g.description}</div><span class="tiny dim">${formatCount(g.memberCount)} miembros</span></span></a>`)}`) : String(emptyState({ emoji: '👥', title: 'Sin grupos con ese nombre' }));
      } else {
        const { items } = await api.listProjects({ q, sort: 'top' });
        results.innerHTML = items.length ? String(html`${items.map((p) => html`<a class="project-row" href="#/p/${p.id}">${coverBox(p)}<span class="meta"><h3>${p.name}</h3><span class="tagline">${p.tagline}</span><span class="row" style="gap:6px">${stagePill(p.stage)}<span class="tiny dim">🔥 ${formatCount(p.hypeCount)}</span></span></span></a>`)}`) : String(emptyState({ emoji: '🚀', title: 'Sin proyectos con ese nombre' }));
      }
    } catch (err) { results.innerHTML = String(html`<div class="notice danger" style="margin:16px">${err.message}</div>`); }
  };

  const showDiscover = async () => {
    list?.destroy();
    list = null;
    $('[data-tabs]', el).innerHTML = '';
    results.innerHTML = String(html`<div class="view-body col" style="gap:16px">
      <section class="card card-pad ai-card"><div class="card-title">${icon('sparkles', { size: 18 })} ¿Qué me perdí?</div><p class="small muted" style="margin-bottom:10px">Hype IA resume lo más comentado del momento en 30 segundos.</p><div data-catchup></div><button class="btn btn-primary btn-sm" data-catchup-btn>${icon('sparkles', { size: 16 })} Resúmeme lo de hoy</button></section>
      ${state.user ? html`<section class="card card-pad"><div class="card-title">${icon('userPlus', { size: 18 })} Gente que te puede gustar</div><div data-people><div class="spinner"></div></div></section>` : ''}
      <section class="card card-pad"><div class="card-title">${icon('trendingUp', { size: 18 })} Top de la semana</div></section>
    </div><div data-top></div>`);
    if (state.user) api.suggestedProfiles(5).then((people) => { const box = $('[data-people]', el); if (box) box.innerHTML = people.length ? String(html`${people.map(userRow)}`) : '<p class="small dim">Ya sigues a todo el mundo 😄</p>'; }).catch(() => {});
    list = createInfiniteList({
      container: $('[data-top]', el),
      load: (offset, limit) => api.feed({ tab: 'top', period: 'week', offset, limit }),
      render: (p) => renderPost(p), keep: (p) => !isFilteredOut(p),
      empty: emptyState({ emoji: '📈', title: 'Aún no hay tendencias esta semana' }),
      end: endOfFeed(), afterRender: (root) => hydratePosts(root),
    });
    list.next();
  };

  const paintTrends = async () => {
    const box = $('[data-trends]', el);
    if (!box) return;
    const tags = await api.trendingTags(12).catch(() => []);
    box.innerHTML = String(html`${tags.map((t) => html`<a class="chip" href="#/explore?tag=${encodeURIComponent(t.tag)}">#${t.tag} <span class="dim tiny">${formatCount(t.count)}</span></a>`)}`);
  };

  const run = () => { if (tag) showTag(); else if (q.trim()) showSearch(); else showDiscover(); };

  $('[data-search]', el).addEventListener('input', debounce((e) => {
    q = e.target.value.trim();
    if (tag && q) { navigate(`/explore?q=${encodeURIComponent(q)}`); return; }
    history.replaceState(null, '', q ? `#/explore?q=${encodeURIComponent(q)}` : '#/explore');
    run();
  }, 350));

  el.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-tab]');
    if (t) { tab = t.dataset.tab; showSearch(); return; }
    const cb = e.target.closest('[data-catchup-btn]');
    if (cb) {
      const { hypeAI, aiStatus } = await import('../ai/gemini.js');
      if (!aiStatus().available) { toast(aiStatus().message, { action: { label: 'Configurar', onClick: () => navigate('/ajustes/ia') } }); return; }
      const out = $('[data-catchup]', el);
      out.innerHTML = '<div class="md cursor-blink"><p class="dim">Leyendo el feed…</p></div>';
      cb.disabled = true;
      try {
        const { items } = await api.feed({ tab: 'top', period: 'week', limit: 12 });
        await hypeAI.catchUp(items, { onToken: (full) => { out.innerHTML = `<div class="md" style="margin-bottom:10px">${renderMarkdown(full)}</div>`; } });
      } catch (err) { out.innerHTML = String(html`<div class="notice danger">${err.message}</div>`); }
      cb.disabled = false;
    }
  });

  paintTrends();
  run();
  if (!q && !tag) setTimeout(() => { if (matchMedia('(pointer: fine)').matches) $('[data-search]', el)?.focus(); }, 100);
  return () => list?.destroy();
}

