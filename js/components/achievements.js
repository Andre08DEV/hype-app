// Logros e insignias del perfil (se calculan con las estadísticas públicas).
import { html } from '../core/dom.js';
import { state } from '../core/store.js';
import { api } from '../data/api.js';
import { formatNumber } from '../core/utils.js';
import { GAMES } from '../games/registry.js';

/** Cada logro: valor actual (v) frente a la meta (goal). */
const DEFS = [
  { id: 'first-post', emoji: '✍️', name: 'Primer post', desc: 'Publica tu primer post', goal: 1, v: (s) => s.posts },
  { id: 'posts-10', emoji: '📝', name: 'Constancia', desc: 'Publica 10 posts', goal: 10, v: (s) => s.posts },
  { id: 'posts-50', emoji: '📚', name: 'Prolífico', desc: 'Publica 50 posts', goal: 50, v: (s) => s.posts },
  { id: 'hype-100', emoji: '🔥', name: 'En llamas', desc: 'Recibe 100 de hype', goal: 100, v: (s) => s.hype },
  { id: 'hype-1000', emoji: '🌋', name: 'Leyenda del hype', desc: 'Recibe 1.000 de hype', goal: 1000, v: (s) => s.hype },
  { id: 'followers-10', emoji: '👥', name: 'Comunidad', desc: 'Llega a 10 seguidores', goal: 10, v: (s) => s.followers },
  { id: 'followers-100', emoji: '🌟', name: 'Referente', desc: 'Llega a 100 seguidores', goal: 100, v: (s) => s.followers },
  { id: 'following-10', emoji: '🧭', name: 'Explorador', desc: 'Sigue a 10 personas', goal: 10, v: (s) => s.following },
  { id: 'maker', emoji: '🚀', name: 'Maker', desc: 'Sube un proyecto', goal: 1, v: (s) => s.projects, extra: true },
  { id: 'director', emoji: '🎬', name: 'Director', desc: 'Sube un short', goal: 1, v: (s) => s.shorts, extra: true },
  { id: 'gamer', emoji: '🎮', name: 'Jugón', desc: 'Consigue un récord en un juego', goal: 1, v: (s) => s.games, extra: true },
  { id: 'all-games', emoji: '🏆', name: 'Maestro de los juegos', desc: `Consigue récord en los ${GAMES.length} juegos`, goal: GAMES.length, v: (s) => s.games, extra: true },
  { id: 'streak-7', emoji: '⚡', name: 'Racha de 7 días', desc: 'Entra 7 días seguidos', goal: 7, v: (s) => s.streak, mineOnly: true },
];

const baseStats = (u) => ({
  posts: u.postsCount || 0, hype: u.hypeReceived || 0, followers: u.followers || 0, following: u.following || 0,
  projects: 0, shorts: 0, games: 0, streak: u.isMe || u.id === state.user?.id ? state.streak || 0 : 0,
});

/** Carga lo que no viene en el perfil (proyectos, shorts, récords). */
export async function loadAchievementStats(u) {
  const s = baseStats(u);
  const [projects, shorts, best] = await Promise.all([
    api.listProjects({ ownerId: u.id, sort: 'new', limit: 50 }).catch(() => ({ items: [] })),
    api.shorts({ authorId: u.id, limit: 30, recycle: false }).catch(() => ({ items: [] })),
    api.userBestScores(u.id).catch(() => ({})),
  ]);
  s.projects = projects.items?.length || 0;
  s.shorts = shorts.items?.length || 0;
  s.games = GAMES.filter((g) => best[g.id] > 0).length;
  return s;
}

export function computeAchievements(u, stats = null) {
  const s = stats || baseStats(u);
  const mine = u.isMe || u.id === state.user?.id;
  return DEFS.filter((d) => !d.mineOnly || mine).map((d) => {
    const value = Math.max(0, d.v(s) || 0);
    return { ...d, value, unlocked: value >= d.goal, progress: Math.min(1, value / d.goal), pending: d.extra && !stats };
  });
}

/** Fila compacta de insignias desbloqueadas (cabecera del perfil). */
export function badgeRow(list, { max = 6 } = {}) {
  const got = list.filter((a) => a.unlocked);
  if (!got.length) return '';
  const shown = got.slice(0, max);
  return html`<button type="button" class="badge-row" data-tab="logros" title="Ver logros" aria-label="${got.length} logros desbloqueados. Ver todos">
    ${shown.map((a) => html`<span class="badge" title="${a.name} · ${a.desc}">${a.emoji}</span>`)}
    ${got.length > max ? html`<span class="badge more">+${got.length - max}</span>` : ''}
    <span class="badge-count">${got.length}/${list.length} logros</span>
  </button>`;
}

/** Cuadrícula completa con progreso (pestaña Logros). */
export function achievementsGrid(list) {
  const got = list.filter((a) => a.unlocked).length;
  return html`<div class="view-body">
    <div class="ach-summary"><span><b>${got}</b> de ${list.length} logros desbloqueados</span><div class="progress"><span style="width:${Math.round((got / list.length) * 100)}%"></span></div></div>
    <div class="ach-grid">${list.map((a) => html`<div class="ach ${a.unlocked ? 'on' : ''}">
      <span class="ach-emoji" aria-hidden="true">${a.emoji}</span>
      <span class="ach-meta"><b>${a.name}</b><span class="small muted">${a.desc}</span>
        ${a.unlocked ? html`<span class="tiny ach-done">✓ Desbloqueado</span>` : html`<span class="progress sm"><span style="width:${Math.round(a.progress * 100)}%"></span></span><span class="tiny dim">${formatNumber(Math.min(a.value, a.goal))} / ${formatNumber(a.goal)}</span>`}
      </span>
    </div>`)}</div>
  </div>`;
}
