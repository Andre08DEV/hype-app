// Arranque de Hype: armazón, rutas, atajos, racha y avisos en vivo.
import { html, mount, $, $$, toElement } from './core/dom.js';
import { icon, SVG_DEFS } from './core/icons.js';
import { state, bus, setUser, setUnread, applySettings, updateSettings } from './core/store.js';
import { route, startRouter, navigate, resetAlive, parseHash } from './core/router.js';
import { toast, toastError, openModal, closeAllModals, hasOpenModal, emptyState } from './core/ui.js';
import { dayKey, daysBetween, formatCount } from './core/utils.js';
import { initApi, api } from './data/api.js';
import { observeMedia } from './data/media-store.js';
import { initPostActions, postCache, toggleHype, openFolderPicker } from './components/post-card.js';
import { avatar, coverBox, followBtn } from './components/common.js';
import { openComposer, openCreateMenu } from './components/composer.js';
import { describeNotification } from './components/notify.js';
import { initCalls } from './calls/ui.js';

const NAV = [
  { path: '/', label: 'Inicio', icon: 'home', name: 'feed' },
  { path: '/explore', label: 'Explorar', icon: 'compass', name: 'explore' },
  { path: '/shorts', label: 'Shorts', icon: 'film', name: 'shorts' },
  { path: '/juegos', label: 'Juegos', icon: 'gamepad', name: 'games' },
  { path: '/grupos', label: 'Grupos', icon: 'users', name: 'groups' },
  { path: '/proyectos', label: 'Proyectos', icon: 'rocket', name: 'projects' },
  { path: '/ia', label: 'Hype IA', icon: 'sparkles', name: 'ai' },
  { path: '/notificaciones', label: 'Notificaciones', icon: 'bell', name: 'notifications', badge: 'notifications', auth: true },
  { path: '/mensajes', label: 'Mensajes', icon: 'mail', name: 'messages', badge: 'messages', auth: true },
  { path: '/guardados', label: 'Guardados', icon: 'bookmark', name: 'bookmarks', auth: true },
  { path: '/perfil', label: 'Perfil', icon: 'user', name: 'profile', auth: true },
  { path: '/ajustes', label: 'Ajustes', icon: 'settings', name: 'settings' },
];

// ---------------- Racha diaria ----------------
function updateStreak() {
  const today = dayKey();
  let data;
  try { data = JSON.parse(localStorage.getItem('hype:streak') || 'null'); } catch { data = null; }
  if (!data) {
    // Migrar la racha de la versión anterior de la app
    const oldLast = localStorage.getItem('hype_last_visit');
    const oldCount = parseInt(localStorage.getItem('hype_streak') || '0', 10);
    data = oldLast && !Number.isNaN(Date.parse(oldLast)) ? { last: dayKey(new Date(oldLast)), count: oldCount || 1 } : { last: today, count: 1 };
  }
  const diff = daysBetween(data.last, today);
  if (diff === 1) data.count += 1;
  else if (diff > 1) data.count = 1;
  data.last = today;
  try { localStorage.setItem('hype:streak', JSON.stringify(data)); } catch { /* ignore */ }
  state.streak = data.count;
  return data.count;
}

// ---------------- Armazón ----------------
const navHref = (n) => (n.name === 'profile' ? (state.user ? `#/u/${encodeURIComponent(state.user.username)}` : '#/bienvenida') : `#${n.path}`);

function sidebar() {
  const u = state.user;
  return html`<nav class="sidebar" aria-label="Navegación principal">
    <a class="brand" href="#/"><img src="assets/icon.svg" alt=""><span class="word">HYPE</span></a>
    ${NAV.filter((n) => !n.auth || u).map((n) => html`<a class="nav-link" href="${navHref(n)}" data-nav="${n.name}">${icon(n.icon, { size: 22 })}<span class="label">${n.label}</span>${n.badge ? html`<span class="badge hidden" data-badge="${n.badge}"></span>` : ''}</a>`)}
    <button class="btn btn-primary btn-lg compose-btn" data-create aria-label="Crear">${icon('plus', { size: 20 })}<span class="label">Crear</span></button>
    <div class="sidebar-footer">
      <span class="streak" title="Racha de días seguidos visitando Hype">🔥 <span data-streak>${state.streak}</span> <span class="label">${state.streak === 1 ? 'día' : 'días'}</span></span>
      ${u ? html`<a class="me-card" href="#/u/${encodeURIComponent(u.username)}" data-me>${avatar(u, 'md')}<span class="meta"><b class="ellipsis" style="display:block;max-width:150px">${u.displayName}</b><span class="dim small">@${u.username}</span></span></a>`
        : html`<a class="btn btn-secondary" href="#/bienvenida">${icon('user', { size: 18 })}<span class="label">Entrar</span></a>`}
      <span class="tiny dim" style="padding:0 10px" data-mode-label>${state.mode === 'cloud' ? `☁️ Nube · ${api.host}` : '💾 Modo demo local'}</span>
    </div>
  </nav>`;
}

function topbar() {
  const u = state.user;
  return html`<header class="topbar">
    <a class="brand" href="#/"><img src="assets/icon.svg" alt=""><span class="word grad-text">HYPE</span></a>
    <span class="streak">🔥 <span data-streak>${state.streak}</span></span>
    <span class="spacer"></span>
    <a class="icon-btn" href="#/explore" aria-label="Buscar">${icon('search')}</a>
    <a class="icon-btn" href="#/ia" aria-label="Hype IA">${icon('sparkles')}</a>
    ${u ? html`<a class="icon-btn" href="#/notificaciones" aria-label="Notificaciones">${icon('bell')}<span class="badge hidden" data-badge="notifications"></span></a>
      <a href="#/u/${encodeURIComponent(u.username)}" aria-label="Mi perfil" style="margin-left:4px">${avatar(u, 'sm')}</a>`
      : html`<a class="btn btn-primary btn-sm" href="#/bienvenida">Entrar</a>`}
  </header>`;
}

function bottombar() {
  return html`<nav class="bottombar" aria-label="Navegación">
    <a class="tab-link" href="#/" data-nav="feed">${icon('home', { size: 23 })}Inicio</a>
    <a class="tab-link" href="#/shorts" data-nav="shorts">${icon('film', { size: 23 })}Shorts</a>
    <button class="tab-create" data-create aria-label="Crear">${icon('plus', { size: 24, stroke: 2.5 })}</button>
    <a class="tab-link" href="#/juegos" data-nav="games">${icon('gamepad', { size: 23 })}Juegos</a>
    <button class="tab-link" data-drawer>${icon('menu', { size: 23 })}Más<span class="badge hidden" data-badge="messages"></span></button>
  </nav>`;
}

function railSkeleton() {
  return html`<aside class="rail" aria-label="Tendencias">
    <a class="input-group" href="#/explore" style="display:flex">${icon('search', { size: 18 })}<span class="input search-input" style="padding-left:40px;color:var(--text-3)">Buscar en Hype</span></a>
    <section class="card ai-card"><div class="card-title">${icon('sparkles', { size: 18 })} Hype IA</div><p class="small muted" style="margin-bottom:12px">Tu copiloto creativo: ideas, hilos, encuestas y feedback de proyectos con Gemini.</p><a class="btn btn-primary btn-sm" href="#/ia">Probar Hype IA</a></section>
    <section class="card" data-rail-trends><div class="card-title">${icon('trendingUp', { size: 18 })} Tendencias</div><div class="skeleton sk-line"></div></section>
    <section class="card" data-rail-projects><div class="card-title">${icon('rocket', { size: 18 })} Proyectos en llamas</div><div class="skeleton sk-line"></div></section>
    <section class="card" data-rail-people><div class="card-title">${icon('userPlus', { size: 18 })} A quién seguir</div><div class="skeleton sk-line"></div></section>
    <div class="rail-foot">Hype · ${state.mode === 'cloud' ? 'Nube Supabase' : 'Modo demo local'} · <a href="#/ajustes">Ajustes</a> · <a href="#/ajustes/atajos">Atajos</a><br>Hecho con 🔥 para creadores.</div>
  </aside>`;
}

async function loadRail() {
  const rail = $('.rail');
  if (!rail || getComputedStyle(rail).display === 'none') return;
  const [tags, projects, people] = await Promise.all([
    api.trendingTags(6).catch(() => []),
    api.listProjects({ sort: 'hot', limit: 3 }).then((r) => r.items).catch(() => []),
    state.user ? api.suggestedProfiles(3).catch(() => []) : Promise.resolve([]),
  ]);
  const t = $('[data-rail-trends]', rail);
  if (t) t.innerHTML = String(html`<div class="card-title">${icon('trendingUp', { size: 18 })} Tendencias</div>${tags.length ? tags.map((x, i) => html`<a class="trend" href="#/explore?tag=${encodeURIComponent(x.tag)}"><span><span class="tiny dim">${i + 1} · Tendencia</span><br><span class="tag">#${x.tag}</span></span><span class="tiny dim">${formatCount(x.count)} posts</span></a>`) : html`<p class="small dim">Aún no hay tendencias.</p>`}`);
  const pr = $('[data-rail-projects]', rail);
  if (pr) pr.innerHTML = String(html`<div class="card-title">${icon('rocket', { size: 18 })} Proyectos en llamas</div>${projects.map((p) => html`<a class="mini-project" href="#/p/${p.id}">${coverBox(p)}<span style="min-width:0;flex:1"><b class="ellipsis" style="display:block">${p.name}</b><span class="tiny dim ellipsis" style="display:block">${p.tagline}</span></span><span class="pill hype">🔥 ${formatCount(p.hypeCount)}</span></a>`)}<a class="btn btn-ghost btn-sm" href="#/proyectos" style="margin-top:6px">Ver ranking →</a>`);
  const pe = $('[data-rail-people]', rail);
  if (pe) {
    if (!people.length) pe.remove();
    else pe.innerHTML = String(html`<div class="card-title">${icon('userPlus', { size: 18 })} A quién seguir</div>${people.map((p) => html`<div class="list-item">${avatar(p, 'md', { link: true })}<a class="meta" href="#/u/${encodeURIComponent(p.username)}"><b class="ellipsis" style="display:block">${p.displayName}</b><span class="tiny dim">@${p.username}</span></a>${followBtn(p)}</div>`)}`);
  }
}

function renderShell() {
  const app = document.getElementById('app');
  mount(app, html`${SVG_DEFS}<div class="shell">${sidebar()}<main class="main" id="main">${topbar()}<div id="outlet"></div></main>${railSkeleton()}</div>${bottombar()}`);
  paintBadges();
  loadRail();
}

function paintBadges() {
  $$('[data-badge]').forEach((b) => {
    const n = state.unread[b.dataset.badge] || 0;
    b.textContent = n > 99 ? '99+' : String(n);
    b.classList.toggle('hidden', !n);
  });
}

function markActiveNav(ctx) {
  const name = document.body.dataset.route;
  const isMine = name === 'profile' && state.user && ctx?.params?.username?.toLowerCase() === state.user.username.toLowerCase();
  $$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === name && (name !== 'profile' || isMine)));
}

function openDrawer() {
  const u = state.user;
  const content = toElement(html`<div class="col">
    ${u ? html`<a class="me-card" href="#/u/${encodeURIComponent(u.username)}" data-close-drawer>${avatar(u, 'lg')}<span class="meta"><b>${u.displayName}</b><br><span class="dim small">@${u.username}</span></span></a>` : html`<a class="btn btn-primary" href="#/bienvenida" data-close-drawer>Entrar o crear cuenta</a>`}
    <div class="drawer-grid">${NAV.filter((n) => !n.auth || u).map((n) => html`<a href="${navHref(n)}" data-close-drawer>${icon(n.icon, { size: 22 })}${n.label}${n.badge ? html`<span class="badge hidden" data-badge="${n.badge}"></span>` : ''}</a>`)}</div>
    <div class="row" style="justify-content:space-between"><span class="streak">🔥 ${state.streak} ${state.streak === 1 ? 'día' : 'días'} de racha</span><span class="tiny dim">${state.mode === 'cloud' ? '☁️ Nube' : '💾 Demo local'}</span></div>
  </div>`);
  const m = openModal({ title: 'Menú', content, size: 'sm' });
  paintBadges();
  content.addEventListener('click', (e) => { if (e.target.closest('[data-close-drawer]')) m.close(); });
}

// ---------------- Atajos de teclado ----------------
let gPending = false;
function focusPost(dir) {
  const posts = $$('#outlet .view:not([hidden]) article.post');
  if (!posts.length) return;
  let i = posts.findIndex((p) => p.classList.contains('kb-focus'));
  posts[i]?.classList.remove('kb-focus', 'focused');
  i = Math.max(0, Math.min(posts.length - 1, i + dir));
  posts[i].classList.add('kb-focus', 'focused');
  posts[i].scrollIntoView({ block: 'center', behavior: state.settings.reduceMotion ? 'auto' : 'smooth' });
}

export function showShortcuts() {
  const rows = [['N', 'Nuevo post'], ['/', 'Buscar'], ['J / K', 'Siguiente / anterior post'], ['L', 'Dar hype al post enfocado'], ['B', 'Guardar post enfocado'], ['O / Enter', 'Abrir post enfocado'], ['G luego H', 'Ir a Inicio'], ['G luego S', 'Ir a Shorts'], ['G luego J', 'Ir a Juegos'], ['G luego P', 'Ir a Proyectos'], ['G luego I', 'Ir a Hype IA'], ['G luego N', 'Notificaciones'], ['G luego A', 'Ajustes'], ['?', 'Ver esta ayuda'], ['Esc', 'Cerrar ventanas']];
  openModal({ title: 'Atajos de teclado', size: 'sm', content: html`<div class="col" style="gap:8px">${rows.map(([k, d]) => html`<div class="row" style="justify-content:space-between"><span class="muted small">${d}</span><span class="kbd">${k}</span></div>`)}</div>` });
}

function onKey(e) {
  if (!state.settings.keyboardShortcuts || e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target;
  if (t.closest?.('input, textarea, select, [contenteditable="true"]') || hasOpenModal() || document.body.classList.contains('call-open')) return;
  if (document.body.dataset.route === 'shorts' || document.body.dataset.route === 'game') return;
  const k = e.key.toLowerCase();
  if (gPending) {
    gPending = false;
    const map = { h: '/', s: '/shorts', j: '/juegos', p: '/proyectos', i: '/ia', n: '/notificaciones', a: '/ajustes', m: '/mensajes', g: '/grupos', e: '/explore' };
    if (map[k]) { e.preventDefault(); navigate(map[k]); }
    return;
  }
  if (k === 'g') { gPending = true; setTimeout(() => { gPending = false; }, 1200); return; }
  if (k === 'n') { e.preventDefault(); openComposer(); return; }
  if (e.key === '/') { e.preventDefault(); navigate('/explore'); setTimeout(() => $('[data-search]')?.focus(), 150); return; }
  if (e.key === '?') { e.preventDefault(); showShortcuts(); return; }
  if (k === 'j') { e.preventDefault(); focusPost(1); return; }
  if (k === 'k') { e.preventDefault(); focusPost(-1); return; }
  const focused = $('#outlet .view:not([hidden]) article.post.kb-focus');
  const post = focused && postCache.get(focused.dataset.postId);
  if (!post) return;
  if (k === 'l') { e.preventDefault(); toggleHype(post, focused.querySelector('[data-action="hype"]')); }
  if (k === 'b') { e.preventDefault(); openFolderPicker(post); }
  if (k === 'o' || e.key === 'Enter') { e.preventDefault(); navigate(`/post/${post.threadRootId || post.id}`); }
}

// ---------------- Avisos en vivo ----------------
function onNotification(n) {
  const d = describeNotification(n);
  const prefs = state.settings.notify || {};
  if (document.hidden && prefs.browser && 'Notification' in window && Notification.permission === 'granted') {
    try { new Notification('Hype', { body: `${d.emoji} ${d.text}`, icon: 'assets/icon.svg', tag: n.id }); } catch { /* ignore */ }
  } else if (document.body.dataset.route !== 'notifications') {
    toast(`${d.emoji} ${d.text}`, { action: d.href ? { label: 'Ver', onClick: () => { location.hash = d.href; } } : null });
  }
  if (prefs.sound) { try { const a = new AudioContext(); const o = a.createOscillator(); const g = a.createGain(); o.frequency.value = 880; g.gain.value = 0.04; o.connect(g).connect(a.destination); o.start(); o.stop(a.currentTime + 0.12); } catch { /* ignore */ } }
}

async function refreshUnread() {
  if (!state.user) { setUnread({ notifications: 0, messages: 0 }); return; }
  try { setUnread(await api.unreadCounts()); } catch { /* ignore */ }
}

function installBotHook() {
  api.botReplyHook = async (bot, history) => {
    const { aiStatus, hypeAI } = await import('./ai/gemini.js');
    if (!aiStatus().available) return null;
    return (await hypeAI.botReply(bot, history)).trim().slice(0, 600);
  };
}

// ---------------- Rutas ----------------
function registerRoutes() {
  route('/', () => import('./views/feed.js'), { name: 'feed', keepAlive: true });
  route('/explore', () => import('./views/explore.js'), { name: 'explore' });
  route('/shorts', () => import('./views/shorts.js'), { name: 'shorts', className: 'view-shorts' });
  route('/juegos', () => import('./views/games.js'), { name: 'games' });
  route('/juegos/:id', () => import('./views/games.js'), { name: 'game' });
  route('/grupos', () => import('./views/groups.js'), { name: 'groups' });
  route('/g/:slug', () => import('./views/groups.js'), { name: 'group' });
  route('/proyectos', () => import('./views/projects.js'), { name: 'projects' });
  route('/p/:id', () => import('./views/projects.js'), { name: 'project' });
  route('/ia', () => import('./views/ai.js'), { name: 'ai' });
  route('/guardados', () => import('./views/bookmarks.js'), { name: 'bookmarks' });
  route('/notificaciones', () => import('./views/notifications.js'), { name: 'notifications' });
  route('/mensajes', () => import('./views/messages.js'), { name: 'messages' });
  route('/mensajes/:id', () => import('./views/messages.js'), { name: 'messages' });
  route('/u/:username', () => import('./views/profile.js'), { name: 'profile' });
  route('/perfil', () => ({ render: () => navigate(state.user ? `/u/${encodeURIComponent(state.user.username)}` : '/bienvenida', { replace: true }) }), { name: 'profile' });
  route('/post/:id', () => import('./views/post.js'), { name: 'post' });
  route('/ajustes', () => import('./views/settings.js'), { name: 'settings' });
  route('/ajustes/:section', () => import('./views/settings.js'), { name: 'settings' });
  route('/bienvenida', () => import('./views/auth.js'), { name: 'auth' });
}

// ---------------- Arranque ----------------
async function boot() {
  applySettings();
  updateStreak();
  try {
    await initApi();
  } catch (err) {
    console.error(err);
    mount(document.getElementById('app'), emptyState({ emoji: '⚠️', title: 'No se pudo iniciar Hype', text: err.message }));
    return;
  }
  setUser(api.currentUser);
  installBotHook();
  renderShell();
  observeMedia(document.body);
  initPostActions();
  initCalls();
  registerRoutes();

  // Primera visita sin cuenta → bienvenida
  const { path } = parseHash();
  const needsOnboarding = state.mode === 'cloud' && state.user && !state.user.onboarded;
  if ((needsOnboarding || (!state.user && !sessionStorage.getItem('hype:guest'))) && !path.startsWith('/ajustes') && path !== '/bienvenida') {
    history.replaceState(null, '', '#/bienvenida');
  }
  startRouter(document.getElementById('outlet'));
  refreshUnread();

  // Eventos globales
  bus.on('route', (ctx) => { closeAllModals(); requestAnimationFrame(() => markActiveNav(ctx)); });
  bus.on('unread', paintBadges);
  bus.on('unread:update', (c) => setUnread(c));
  bus.on('notification', onNotification);
  bus.on('message', () => refreshUnread());
  bus.on('user', () => { renderShellKeepOutlet(); refreshUnread(); });
  bus.on('profile:update', (p) => { if (p) setUser(p); });
  bus.on('auth:change', (user) => {
    setUser(user);
    resetAlive();
    if (user && !user.onboarded) navigate('/bienvenida', { replace: true });
    else if (user) { toast(`Hola, ${user.displayName} 👋`); navigate('/', { replace: true }); }
    else navigate('/bienvenida', { replace: true });
  });
  bus.on('storage:full', () => toast('El almacenamiento local está lleno. Exporta tus datos o libera espacio en Ajustes → Datos.', { type: 'error' }));
  document.addEventListener('keydown', onKey);
  document.addEventListener('click', onGlobalClick);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshUnread(); });
  setInterval(refreshUnread, 60000);
  setInterval(loadRail, 5 * 60000);

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

// Re-render del armazón sin perder la vista actual
function renderShellKeepOutlet() {
  const outlet = document.getElementById('outlet');
  if (!outlet) return;
  const sb = $('.sidebar'), tb = $('.topbar'), bb = $('.bottombar');
  sb?.replaceWith(toElement(sidebar()));
  tb?.replaceWith(toElement(topbar()));
  bb?.replaceWith(toElement(bottombar()));
  paintBadges();
  markActiveNav(state.route);
}

async function onGlobalClick(e) {
  const t = e.target instanceof Element ? e.target : null;
  if (!t) return;
  const create = t.closest('[data-create]');
  if (create) { e.preventDefault(); openCreateMenu(create); return; }
  if (t.closest('[data-drawer]')) { e.preventDefault(); openDrawer(); return; }
  const fb = t.closest('[data-follow]');
  if (fb) {
    e.preventDefault();
    if (!state.user) { navigate('/bienvenida'); return; }
    const following = fb.dataset.following === '1';
    fb.disabled = true;
    try {
      if (following) await api.unfollow(fb.dataset.follow); else await api.follow(fb.dataset.follow);
      $$(`[data-follow="${CSS.escape(fb.dataset.follow)}"]`).forEach((b) => {
        b.dataset.following = following ? '0' : '1';
        b.textContent = following ? 'Seguir' : 'Siguiendo';
        b.classList.toggle('btn-primary', following);
        b.classList.toggle('btn-outline', !following);
      });
      bus.emit('follow:change', { userId: fb.dataset.follow, following: !following });
    } catch (err) { toastError(err); }
    fb.disabled = false;
  }
}

boot();
