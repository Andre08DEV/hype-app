// Componentes de interfaz: toasts, modales, menús, diálogos, lightbox, animaciones.
import { html, raw, toElement, $, esc, safeUrl } from './dom.js';
import { icon } from './icons.js';
import { state } from './store.js';

// ---------- Toasts ----------
export function toast(message, { type = 'info', action = null, duration = 3600 } = {}) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const ico = type === 'success' ? icon('check', { size: 18 }) : type === 'error' ? icon('alert', { size: 18 }) : '';
  const el = toElement(html`<div class="toast ${type}" role="status">${ico}<span style="flex:1">${message}</span>${action ? html`<button type="button">${action.label}</button>` : ''}</div>`);
  const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 250); };
  if (action) el.querySelector('button').addEventListener('click', () => { close(); action.onClick?.(); });
  root.appendChild(el);
  while (root.children.length > 3) root.firstElementChild.remove();
  setTimeout(close, duration);
  return close;
}

export const toastError = (err, fallback = 'Algo salió mal') => toast(err?.message || fallback, { type: 'error', duration: 5200 });

// ---------- Modales ----------
const openModals = [];

export function openModal({ title = '', content = '', size = '', footer = null, onClose = null, className = '', dismissible = true, bare = false, hideHeader = false } = {}) {
  const root = document.getElementById('modal-root');
  const backdrop = toElement(html`
    <div class="modal-backdrop">
      <div class="modal ${size} ${className} ${bare ? 'bare' : ''}" role="dialog" aria-modal="true" aria-label="${typeof title === 'string' && title ? title : 'Diálogo'}">
        ${hideHeader ? '' : html`<div class="modal-head"><h2>${title}</h2><button type="button" class="icon-btn" data-close aria-label="Cerrar">${icon('x')}</button></div>`}
        <div class="modal-body"></div>
        ${footer ? html`<div class="modal-foot"></div>` : ''}
      </div>
    </div>`);
  const modal = backdrop.querySelector('.modal');
  const body = backdrop.querySelector('.modal-body');
  const foot = backdrop.querySelector('.modal-foot');
  if (content instanceof Node) body.appendChild(content); else body.innerHTML = String(content);
  if (footer) { if (footer instanceof Node) foot.appendChild(footer); else foot.innerHTML = String(footer); }

  const prevFocus = document.activeElement;
  let closed = false;
  const close = (reason) => {
    if (closed) return;
    closed = true;
    backdrop.remove();
    const i = openModals.indexOf(api);
    if (i >= 0) openModals.splice(i, 1);
    if (!openModals.length) document.body.classList.remove('modal-open');
    onClose?.(reason);
    if (prevFocus && document.contains(prevFocus)) prevFocus.focus?.({ preventScroll: true });
  };
  const api = { el: modal, body, foot, backdrop, close, dismissible };

  backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop && dismissible) api._downOnBackdrop = true; });
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop && dismissible && api._downOnBackdrop) close('backdrop');
    api._downOnBackdrop = false;
  });
  backdrop.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => close('button')));

  root.appendChild(backdrop);
  openModals.push(api);
  document.body.classList.add('modal-open');
  requestAnimationFrame(() => {
    const f = modal.querySelector('[autofocus], textarea, input:not([type="hidden"]):not([type="file"]), select');
    (f || modal).focus?.({ preventScroll: true });
  });
  return api;
}

export function closeAllModals() { [...openModals].reverse().forEach((m) => m.close('route')); }
export const hasOpenModal = () => openModals.length > 0;

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (closeMenu()) return;
    const top = openModals[openModals.length - 1];
    if (top && top.dismissible) { e.preventDefault(); top.close('escape'); }
  }
});

export function confirmDialog({ title = '¿Seguro?', message = '', confirmText = 'Confirmar', cancelText = 'Cancelar', danger = false } = {}) {
  return new Promise((resolve) => {
    let result = false;
    const footer = toElement(html`<div class="row" style="justify-content:flex-end;width:100%"><button class="btn btn-ghost" data-act="cancel">${cancelText}</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-act="ok">${confirmText}</button></div>`);
    const m = openModal({ title, content: html`<p class="muted">${message}</p>`, size: 'sm', footer, onClose: () => resolve(result) });
    footer.querySelector('[data-act="cancel"]').onclick = () => m.close();
    footer.querySelector('[data-act="ok"]').onclick = () => { result = true; m.close(); };
    setTimeout(() => footer.querySelector('[data-act="ok"]').focus(), 30);
  });
}

export function promptDialog({ title = '', label = '', value = '', placeholder = '', confirmText = 'Guardar', maxLength = 80, multiline = false } = {}) {
  return new Promise((resolve) => {
    let result = null;
    const content = toElement(html`<form class="field">
      ${label ? html`<label>${label}</label>` : ''}
      ${multiline ? html`<textarea class="textarea" maxlength="${maxLength}" placeholder="${placeholder}">${value}</textarea>` : html`<input class="input" maxlength="${maxLength}" placeholder="${placeholder}" value="${value}">`}
    </form>`);
    const footer = toElement(html`<div class="row" style="justify-content:flex-end;width:100%"><button class="btn btn-ghost" type="button" data-act="cancel">Cancelar</button><button class="btn btn-primary" type="button" data-act="ok">${confirmText}</button></div>`);
    const m = openModal({ title, content, size: 'sm', footer, onClose: () => resolve(result) });
    const input = content.querySelector('input, textarea');
    const submit = () => { result = input.value.trim(); m.close(); };
    content.addEventListener('submit', (e) => { e.preventDefault(); submit(); });
    footer.querySelector('[data-act="cancel"]').onclick = () => m.close();
    footer.querySelector('[data-act="ok"]').onclick = submit;
    setTimeout(() => { input.focus(); input.select?.(); }, 30);
  });
}

// ---------- Menús contextuales ----------
let activeMenu = null;

export function closeMenu() {
  if (!activeMenu) return false;
  activeMenu.el.remove();
  document.removeEventListener('pointerdown', activeMenu.outside, true);
  window.removeEventListener('scroll', activeMenu.onScroll, true);
  activeMenu = null;
  return true;
}

/**
 * items: [{ label, icon, onClick, danger, checked, divider, header, disabled }]
 */
export function openMenu(anchor, items, { align = 'right' } = {}) {
  closeMenu();
  const el = toElement(html`<div class="menu" role="menu">${items.map((it, i) => {
    if (it.divider) return html`<div class="menu-sep"></div>`;
    if (it.header) return html`<div class="menu-label">${it.header}</div>`;
    return html`<button type="button" class="menu-item ${it.danger ? 'danger' : ''}" role="menuitem" data-i="${i}" ${it.disabled ? 'disabled' : ''}>
      ${it.emoji ? html`<span style="width:20px;text-align:center">${it.emoji}</span>` : it.icon ? icon(it.icon, { size: 18 }) : ''}
      <span style="flex:1">${it.label}</span>${it.checked ? html`<span class="check">${icon('check', { size: 16 })}</span>` : ''}${it.hint ? html`<span class="dim tiny">${it.hint}</span>` : ''}
    </button>`;
  })}</div>`);
  document.body.appendChild(el);
  const r = anchor.getBoundingClientRect();
  const w = el.offsetWidth, h = el.offsetHeight;
  let left = align === 'right' ? r.right - w : r.left;
  let top = r.bottom + 6;
  if (top + h > innerHeight - 8) top = Math.max(8, r.top - h - 6);
  left = Math.max(8, Math.min(left, innerWidth - w - 8));
  el.style.left = left + 'px';
  el.style.top = top + 'px';
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-i]');
    if (!b) return;
    const it = items[Number(b.dataset.i)];
    closeMenu();
    it?.onClick?.();
  });
  const outside = (e) => { if (!el.contains(e.target) && !anchor.contains(e.target)) closeMenu(); };
  const onScroll = (e) => { if (!el.contains(e.target)) closeMenu(); };
  setTimeout(() => {
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('scroll', onScroll, true);
  });
  activeMenu = { el, outside, onScroll };
  el.querySelector('.menu-item')?.focus({ preventScroll: true });
  return el;
}

// ---------- Lightbox ----------
export function openLightbox(media, start = 0) {
  let i = start;
  const el = toElement(html`<div class="lightbox" role="dialog" aria-label="Visor multimedia">
    <button class="icon-btn lb-close" aria-label="Cerrar">${icon('x')}</button>
    ${media.length > 1 ? html`<button class="icon-btn lb-nav lb-prev" aria-label="Anterior">${icon('chevronLeft')}</button><button class="icon-btn lb-nav lb-next" aria-label="Siguiente">${icon('chevronRight')}</button>` : ''}
    <div class="lb-stage"></div><div class="lb-alt hidden"></div>
  </div>`);
  const stage = el.querySelector('.lb-stage');
  const alt = el.querySelector('.lb-alt');
  const show = () => {
    const m = media[i];
    const filter = m.filter && m.filter !== 'none' ? `f-${m.filter}` : '';
    const src = m.url?.startsWith('idb:') ? `data-idb="${esc(m.url.slice(4))}"` : `src="${esc(safeUrl(m.url))}"`;
    stage.innerHTML = m.type === 'video'
      ? `<video ${src} class="${filter}" controls autoplay playsinline></video>`
      : `<img ${src} class="${filter}" alt="${esc(m.alt || '')}">`;
    alt.textContent = m.alt || '';
    alt.classList.toggle('hidden', !m.alt);
  };
  const close = () => { el.remove(); document.removeEventListener('keydown', onKey); };
  const go = (d) => { i = (i + d + media.length) % media.length; show(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1); };
  el.addEventListener('click', (e) => {
    if (e.target === el || e.target.closest('.lb-close')) close();
    else if (e.target.closest('.lb-prev')) go(-1);
    else if (e.target.closest('.lb-next')) go(1);
  });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(el);
  show();
}

// ---------- Animación de Hype ----------
const BURST_COLORS = ['#ff3d6e', '#ff7a2f', '#ffc23d', '#ff5a36', '#ffd166', '#f472b6'];
export function hypeBurst(target, { emoji = true } = {}) {
  if (state.settings.reduceMotion) return;
  const r = target.getBoundingClientRect();
  const b = document.createElement('div');
  b.className = 'burst';
  b.style.left = r.left + r.width / 2 + 'px';
  b.style.top = r.top + r.height / 2 + 'px';
  let inner = '';
  for (let k = 0; k < 12; k++) {
    const a = (Math.PI * 2 * k) / 12 + Math.random() * 0.4;
    const d = 22 + Math.random() * 22;
    inner += `<i style="--c:${BURST_COLORS[k % BURST_COLORS.length]};--x:${Math.cos(a) * d}px;--y:${Math.sin(a) * d}px"></i>`;
  }
  if (emoji) inner += `<b style="--x:${(Math.random() - 0.5) * 30}px;--y:-34px">🔥</b>`;
  b.innerHTML = inner;
  document.body.appendChild(b);
  setTimeout(() => b.remove(), 900);
}

export function bigFlame(container, x, y) {
  if (state.settings.reduceMotion) return;
  const f = document.createElement('div');
  f.className = 'big-flame';
  f.textContent = '🔥';
  f.style.left = x + 'px';
  f.style.top = y + 'px';
  container.appendChild(f);
  setTimeout(() => f.remove(), 950);
}

// ---------- Plantillas reutilizables ----------
export function emptyState({ emoji = '✨', title = '', text = '', action = '' } = {}) {
  return html`<div class="empty"><div class="empty-icon">${emoji}</div><h3>${title}</h3>${text ? html`<p>${text}</p>` : ''}${action}</div>`;
}

export function skeletonPosts(n = 3) {
  return raw(Array.from({ length: n }, () => `<div class="sk-post"><div class="skeleton" style="width:44px;height:44px;border-radius:50%"></div><div class="sk-lines"><div class="skeleton sk-line" style="width:40%"></div><div class="skeleton sk-line" style="width:92%"></div><div class="skeleton sk-line" style="width:76%"></div><div class="skeleton" style="height:140px;border-radius:14px;margin-top:6px"></div></div></div>`).join(''));
}

export function spinner() { return raw('<div class="spinner" role="status" aria-label="Cargando"></div>'); }

export function setLoading(btn, loading, text) {
  if (!btn) return;
  if (loading) { btn.dataset.label = btn.innerHTML; btn.classList.add('loading'); btn.disabled = true; if (text) btn.textContent = text; }
  else { btn.classList.remove('loading'); btn.disabled = false; if (btn.dataset.label) btn.innerHTML = btn.dataset.label; }
}

export function switchHtml(name, checked, attrs = '') {
  return html`<label class="switch"><input type="checkbox" name="${name}" ${checked ? 'checked' : ''} ${raw(attrs)}><span class="track"></span><span class="thumb"></span></label>`;
}

export function $modal(sel) { const top = openModals[openModals.length - 1]; return top ? $(sel, top.el) : null; }
