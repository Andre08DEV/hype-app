// Piezas visuales compartidas: avatares, enlaces de usuario, portadas, etiquetas.
import { html, raw, esc, safeUrl } from '../core/dom.js';
import { gradientFor } from '../core/utils.js';
import { icon } from '../core/icons.js';
import { isIdb } from '../data/media-store.js';
import { state } from '../core/store.js';

/** Atributo src/poster que entiende URLs locales (idb:) y remotas. */
export function srcAttr(url, attr = 'src') {
  if (!url) return raw('');
  if (isIdb(url)) return raw(`data-idb${attr === 'poster' ? '-poster' : ''}="${esc(url.slice(4))}"`);
  const u = safeUrl(url, { allowData: true });
  return u ? raw(`${attr}="${esc(u)}"`) : raw('');
}

const COLOR_RE = /^(#[0-9a-f]{3,8}|hsla?\([\d\s.,%deg]+\)|rgba?\([\d\s.,%]+\))$/i;
export const safeColor = (c, fallback = '#8b5cf6') => (COLOR_RE.test(String(c || '').trim()) ? String(c).trim() : fallback);

export function colorVars(colors, seed = '') {
  const [d1, d2] = gradientFor(seed);
  const c = Array.isArray(colors) ? colors : [];
  return `--c1:${safeColor(c[0], d1)};--c2:${safeColor(c[1], d2)}`;
}

export function avatar(p, size = 'md', { ring = false, link = false } = {}) {
  const [a1, a2] = gradientFor(p?.id || p?.username || 'x');
  const name = (p?.displayName || p?.username || '?').trim();
  const initials = name.split(/\s+/).slice(0, 2).map((w) => [...w][0] || '').join('').toUpperCase() || '?';
  const emoji = !p?.avatarUrl && p?.avatarEmoji;
  const inner = p?.avatarUrl ? html`<img ${srcAttr(p.avatarUrl)} alt="" loading="lazy" decoding="async">` : (emoji || initials);
  const el = html`<span class="avatar ${size} ${emoji ? 'emoji' : ''} ${ring ? 'ring' : ''}" style="--a1:${a1};--a2:${a2}" aria-hidden="true">${inner}</span>`;
  if (link && p?.username) return html`<a href="#/u/${encodeURIComponent(p.username)}" aria-label="Perfil de ${name}" class="avatar-link">${el}</a>`;
  return el;
}

export const verified = (p) => (p?.verified ? html`<span class="verified" title="Cuenta verificada">${icon('verified', { size: 16 })}</span>` : '');

export function userLine(p, { time = '', timeHref = '' } = {}) {
  return html`<a class="name" href="#/u/${encodeURIComponent(p?.username || '')}">${p?.displayName || p?.username}</a>${verified(p)}<span class="handle">@${p?.username}</span>${time ? html`<span class="dot">·</span>${timeHref ? html`<a class="time" href="${timeHref}">${time}</a>` : html`<span class="time">${time}</span>`}` : ''}`;
}

export const STAGES = { idea: 'Idea', building: 'En desarrollo', beta: 'Beta', launched: 'Lanzado' };
export const stagePill = (s) => html`<span class="stage stage-${STAGES[s] ? s : 'building'}">${STAGES[s] || 'En desarrollo'}</span>`;

export function coverBox(item, cls = 'embed-cover') {
  const style = colorVars(item?.color, item?.id || item?.name);
  return html`<span class="${cls}" style="${style}">${item?.coverUrl ? html`<img ${srcAttr(item.coverUrl)} alt="" loading="lazy">` : (item?.emoji || '🚀')}</span>`;
}

export const EMOJIS = ['😎', '🔥', '⚡', '🚀', '🎨', '🎮', '🎧', '📸', '💻', '🤖', '🍳', '🌱', '🦊', '🐼', '🐙', '🦄', '🌈', '🌙', '☕', '🎯', '🧠', '💜', '🏀', '🎸', '📚', '✈️', '🧪', '🛸', '🦖', '🍕', '🌊', '👾'];
export const INTERESTS = ['dev', 'diseño', 'ia', 'juegos', 'música', 'recetas', 'startups', 'fotografía', 'ciencia', 'deportes', 'libros', 'cine', 'viajes', 'productividad', 'shorts', 'proyectos'];

export function chipList(items, active = [], attr = 'data-value') {
  return items.map((it) => html`<button type="button" class="chip ${active.includes(it) ? 'active' : ''}" ${raw(attr)}="${it}">${it}</button>`);
}

export function followBtn(p, { size = 'sm' } = {}) {
  if (!p?.id || p.id === state.user?.id) return '';
  return html`<button type="button" class="btn ${p.isFollowing ? 'btn-outline' : 'btn-primary'} btn-${size}" data-follow="${p.id}" data-following="${p.isFollowing ? '1' : '0'}">${p.isFollowing ? 'Siguiendo' : 'Seguir'}</button>`;
}
