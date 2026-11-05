// Utilidades DOM con escape automático (anti-XSS).
// Uso: html`<p>${textoDeUsuario}</p>` → el texto se escapa siempre,
// salvo que venga envuelto en raw()/SafeHTML (HTML ya saneado por nosotros).

const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
const UNESC_MAP = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&#96;': '`' };

export function esc(value) {
  return String(value ?? '').replace(/[&<>"'`]/g, (c) => ESC_MAP[c]);
}

export function unesc(value) {
  return String(value ?? '').replace(/&(amp|lt|gt|quot|#39|#96);/g, (m) => UNESC_MAP[m]);
}

export class SafeHTML {
  constructor(value) { this.value = value; }
  toString() { return this.value; }
}

export const raw = (value) => (value instanceof SafeHTML ? value : new SafeHTML(String(value ?? '')));

function serialize(value) {
  if (value == null || value === false || value === true) return '';
  if (value instanceof SafeHTML) return value.value;
  if (Array.isArray(value)) return value.map(serialize).join('');
  return esc(value);
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += serialize(values[i]) + strings[i + 1];
  return new SafeHTML(out);
}

/** Devuelve la URL si es segura (http/https/mailto/blob/relativa) o '' si no. */
export function safeUrl(url, { allowData = false } = {}) {
  // Los navegadores ignoran tabs/saltos/controles en URLs: los quitamos antes de validar.
  const s = String(url ?? '').replace(/[\u0000-\u001F\u007F\s]+/g, '');
  if (!s) return '';
  if (/^(https?:|mailto:|blob:)/i.test(s)) return s;
  if (allowData && /^data:(image|video)\/[a-z0-9.+-]+;base64,/i.test(s)) return s;
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return ''; // otro esquema (javascript:, data:, vbscript:…)
  if (s.startsWith('//')) return 'https:' + s;
  return s; // relativa
}

export function toFragment(content) {
  const t = document.createElement('template');
  t.innerHTML = serialize(content);
  return t.content;
}

export function toElement(content) {
  return toFragment(content).firstElementChild;
}

export function mount(target, content) {
  target.innerHTML = serialize(content);
  return target;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Delegación de eventos: handler(event, matchedElement). Devuelve función para desuscribir. */
export function delegate(root, type, selector, handler, options) {
  const fn = (event) => {
    const target = event.target instanceof Element ? event.target.closest(selector) : null;
    if (target && root.contains(target)) handler(event, target);
  };
  root.addEventListener(type, fn, options);
  return () => root.removeEventListener(type, fn, options);
}

export const cls = (...parts) => parts.flat().filter(Boolean).join(' ');

/** Ajusta la altura de un textarea a su contenido. */
export function autoGrow(textarea, max = 520) {
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight + 2, max) + 'px';
}
