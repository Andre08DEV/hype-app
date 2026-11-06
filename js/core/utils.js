// Utilidades generales (fechas, números, texto, archivos).

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function uuid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

export function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function debounce(fn, ms = 250) {
  let t;
  const d = (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  d.cancel = () => clearTimeout(t);
  return d;
}

export function throttle(fn, ms = 200) {
  let last = 0, t;
  return (...args) => {
    const now = Date.now();
    const run = () => { last = Date.now(); fn(...args); };
    clearTimeout(t);
    if (now - last >= ms) run(); else t = setTimeout(run, ms - (now - last));
  };
}

const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
const nf = new Intl.NumberFormat('es');
const cnf = new Intl.NumberFormat('es', { notation: 'compact', maximumFractionDigits: 1 });

/** Tiempo relativo compacto: "ahora", "5 min", "3 h", "2 d", "12 oct". */
export function timeAgo(date) {
  const d = new Date(date);
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 45) return 'ahora';
  if (s < 3600) return `${Math.round(s / 60)} min`;
  if (s < 86400) return `${Math.round(s / 3600)} h`;
  if (s < 86400 * 7) return `${Math.round(s / 86400)} d`;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('es', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
}

export function relativeTime(date) {
  const diff = (new Date(date).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), 'second');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  return rtf.format(Math.round(diff / 86400), 'day');
}

/** "quedan 2 h", "quedan 3 d" */
export function timeLeft(date) {
  const s = (new Date(date).getTime() - Date.now()) / 1000;
  if (s <= 0) return 'Finalizada';
  if (s < 3600) return `Quedan ${Math.max(1, Math.round(s / 60))} min`;
  if (s < 86400) return `Quedan ${Math.round(s / 3600)} h`;
  return `Quedan ${Math.round(s / 86400)} d`;
}

export function formatDate(date, opts = { day: 'numeric', month: 'long', year: 'numeric' }) {
  return new Date(date).toLocaleDateString('es', opts);
}

export function formatDateTime(date) {
  return new Date(date).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export const formatNumber = (n) => nf.format(n || 0);
export const formatCount = (n) => (Math.abs(n || 0) < 10000 ? nf.format(n || 0) : cnf.format(n));

export function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i ? 1 : 0)} ${u[i]}`;
}

export function formatDuration(sec) {
  if (!Number.isFinite(sec)) return '';
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export const plural = (n, one, many) => `${formatNumber(n)} ${n === 1 ? one : many}`;

export function slugify(str) {
  return String(str || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

const TAG_RE = /(^|[^\p{L}\p{N}_&#/])#([\p{L}\p{N}_]{2,40})/gu;
const MENTION_RE = /(^|[^\p{L}\p{N}_@.])@([a-zA-Z0-9_.]{3,24})/gu;

export function extractTags(text) {
  const out = new Set();
  for (const m of String(text || '').matchAll(TAG_RE)) out.add(m[2].toLowerCase());
  return [...out].slice(0, 12);
}

export function extractMentions(text) {
  const out = new Set();
  for (const m of String(text || '').matchAll(MENTION_RE)) out.add(m[2].replace(/\.+$/, '').toLowerCase());
  return [...out].slice(0, 10);
}

/** Clave de día local AAAA-MM-DD */
export function dayKey(date = new Date()) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function daysBetween(keyA, keyB) {
  const [a1, a2, a3] = keyA.split('-').map(Number);
  const [b1, b2, b3] = keyB.split('-').map(Number);
  return Math.round((Date.UTC(b1, b2 - 1, b3) - Date.UTC(a1, a2 - 1, a3)) / 86400000);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* ignore */ }
    ta.remove();
    return ok;
  }
}

export function downloadFile(filename, content, type = 'application/json') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function readAsDataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export function pickFiles({ accept = '*/*', multiple = false } = {}) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.style.display = 'none';
    input.addEventListener('change', () => { resolve([...input.files]); input.remove(); }, { once: true });
    document.body.appendChild(input);
    input.click();
  });
}

export const isTouch = () => matchMedia('(pointer: coarse)').matches;
export const isMobile = () => matchMedia('(max-width: 720px)').matches;

/** Paleta determinista a partir de un texto (avatares, portadas). */
export function gradientFor(seed) {
  const h = hashString(String(seed || 'hype'));
  const h1 = h % 360;
  const h2 = (h1 + 40 + ((h >> 9) % 80)) % 360;
  return [`hsl(${h1} 78% 58%)`, `hsl(${h2} 82% 56%)`];
}

export function excerpt(text, max = 140) {
  const s = String(text || '').replace(/```[\s\S]*?```/g, ' [código] ').replace(/[*_~`>#|]/g, '').replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s;
}

export function normalize(str) {
  return String(str || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function vibrate(ms = 10) {
  try { navigator.vibrate?.(ms); } catch { /* ignore */ }
}
