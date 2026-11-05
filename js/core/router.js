// Router por hash (#/ruta) — funciona en GitHub Pages sin configurar el servidor.
// Las vistas con keepAlive conservan su DOM y scroll al volver (feed infinito).
import { bus, state } from './store.js';

const routes = [];
let outlet = null;
let current = null;         // { entry, key, el, instance }
const alive = new Map();    // key -> { el, instance, scrollY }

function compile(pattern) {
  const keys = [];
  const re = pattern.replace(/\/:([a-zA-Z]+)/g, (_, k) => { keys.push(k); return '/([^/]+)'; });
  return { regex: new RegExp(`^${re}/?$`), keys };
}

/**
 * Registra una ruta.
 * loader: () => import('...') ; el módulo exporta render(el, ctx) que puede devolver
 * una función de limpieza o { destroy, onShow, onHide }.
 */
export function route(pattern, loader, opts = {}) {
  routes.push({ pattern, loader, opts, ...compile(pattern) });
}

export function parseHash() {
  const h = location.hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = h.split('?');
  return { path: path || '/', query: Object.fromEntries(new URLSearchParams(qs)) };
}

export function navigate(path, { replace = false } = {}) {
  const target = '#' + (path.startsWith('/') ? path : '/' + path);
  if (replace) history.replaceState(null, '', target);
  else if (location.hash === target) { handle(); return; } else location.hash = target;
  if (replace) handle();
}

export function back(fallback = '/') {
  if (history.length > 1) history.back(); else navigate(fallback);
}

function normalizeInstance(result) {
  if (!result) return {};
  if (typeof result === 'function') return { destroy: result };
  return result;
}

let token = 0;

async function handle() {
  const { path, query } = parseHash();
  let match = null, params = {};
  for (const r of routes) {
    const m = path.match(r.regex);
    if (m) { match = r; r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); }); break; }
  }
  if (!match) { navigate('/', { replace: true }); return; }

  const key = match.opts.keepAlive ? `${match.pattern}|${JSON.stringify(params)}|${JSON.stringify(query)}` : null;
  const myToken = ++token;
  const ctx = { path, params, query, pattern: match.pattern };
  state.route = ctx;

  // Ocultar / destruir la vista actual
  if (current) {
    if (current.key && alive.has(current.key)) {
      const a = alive.get(current.key);
      a.scrollY = window.scrollY;
      a.instance.onHide?.();
      a.el.hidden = true;
    } else {
      try { current.instance.destroy?.(); } catch (e) { console.error(e); }
      current.el.remove();
    }
    current = null;
  }
  document.body.dataset.route = match.opts.name || match.pattern;
  bus.emit('route', ctx);

  // Reutilizar vista viva
  if (key && alive.has(key)) {
    const a = alive.get(key);
    a.el.hidden = false;
    current = { entry: match, key, el: a.el, instance: a.instance };
    a.instance.onShow?.();
    requestAnimationFrame(() => window.scrollTo(0, a.scrollY || 0));
    return;
  }

  const el = document.createElement('section');
  el.className = `view ${match.opts.className || ''}`;
  outlet.appendChild(el);
  window.scrollTo(0, 0);
  try {
    const mod = await match.loader();
    if (myToken !== token) { el.remove(); return; }
    const instance = normalizeInstance(await mod.render(el, ctx));
    if (myToken !== token) { instance.destroy?.(); el.remove(); return; }
    current = { entry: match, key, el, instance };
    if (key) {
      alive.set(key, { el, instance, scrollY: 0 });
      // Limitar vistas vivas: conservamos las 4 más recientes.
      if (alive.size > 4) {
        const [oldKey, old] = alive.entries().next().value;
        if (oldKey !== key) { old.instance.destroy?.(); old.el.remove(); alive.delete(oldKey); }
      }
    }
  } catch (err) {
    console.error('[router]', err);
    el.innerHTML = `<div class="empty"><div class="empty-icon">⚠️</div><h3>No se pudo cargar esta sección</h3><p class="muted">${String(err?.message || err).replace(/[<>&]/g, '')}</p><a class="btn btn-secondary" href="#/">Volver al inicio</a></div>`;
    current = { entry: match, key: null, el, instance: {} };
  }
}

/** Invalida vistas vivas (p. ej. al cambiar de usuario o de modo). */
export function resetAlive() {
  for (const [k, a] of alive) {
    if (current?.key === k) continue;
    try { a.instance.destroy?.(); } catch { /* ignore */ }
    a.el.remove();
    alive.delete(k);
  }
}

export function refreshCurrent() {
  if (current?.key) {
    const a = alive.get(current.key);
    try { a?.instance.destroy?.(); } catch { /* ignore */ }
    a?.el.remove();
    alive.delete(current.key);
    current = null;
  }
  handle();
}

export function startRouter(el) {
  outlet = el;
  history.scrollRestoration = 'manual';
  window.addEventListener('hashchange', handle);
  handle();
}
