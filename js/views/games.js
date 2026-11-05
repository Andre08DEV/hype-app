// Juegos "playables": hub, página de juego con ranking y runner reutilizable.
import { html, toElement, $ } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { state } from '../core/store.js';
import { api } from '../data/api.js';
import { formatNumber } from '../core/utils.js';
import { openModal, toastError } from '../core/ui.js';
import { navigate, back } from '../core/router.js';
import { avatar, colorVars } from '../components/common.js';
import { GAMES, gameById, loadGame } from '../games/registry.js';
import { openComposer } from '../components/composer.js';

function leaderboardHtml(rows, meta) {
  if (!rows.length) return html`<p class="small dim">Nadie ha jugado aún. ¡Sé la primera persona del ranking!</p>`;
  const medals = ['🥇', '🥈', '🥉'];
  return html`<div class="leaderboard">${rows.map((r, i) => html`<a class="lb-row ${r.user?.id === state.user?.id ? 'me' : ''}" href="#/u/${encodeURIComponent(r.user?.username || '')}">
    <span class="rank">${medals[i] || i + 1}</span>${avatar(r.user, 'sm')}<span style="min-width:0"><b class="ellipsis" style="display:block">${r.user?.displayName}</b><span class="tiny dim">@${r.user?.username}</span></span>
    <span class="pts">${formatNumber(r.score)} <span class="tiny dim">${meta.unit}</span></span></a>`)}</div>`;
}

/**
 * Monta un juego con intro, HUD y pantalla final.
 * host: contenedor; opts: { fullscreen, onExit, autostart }
 */
export async function runGame(host, gameId, { fullscreen = false, onExit = null, autostart = false, onFinish = null } = {}) {
  const meta = gameById(gameId);
  if (!meta) { host.innerHTML = '<p class="notice danger">Juego no encontrado</p>'; return { destroy() {} }; }
  const mod = await loadGame(gameId);
  let best = 0;
  try { best = (await api.myBestScores())[gameId] || 0; } catch { best = 0; }
  host.innerHTML = String(html`<div class="game-stage ${fullscreen ? 'fullscreen' : ''}" style="${colorVars(meta.colors)}">
    <div class="game-hud">
      ${onExit ? html`<button class="icon-btn sm" data-exit style="color:#fff" aria-label="Salir">${icon('x', { size: 18 })}</button>` : ''}
      <span>${meta.emoji} ${meta.title}</span><span class="spacer"></span>
      <span class="score" data-score>0</span><span class="tiny" style="opacity:.7" data-best>Récord ${formatNumber(best)}</span>
    </div>
    <div class="game-area" data-area></div>
  </div>`);
  const stage = $('.game-stage', host);
  const area = $('[data-area]', host);
  const scoreEl = $('[data-score]', host);
  let instance = null;
  let destroyed = false;

  const overlay = (content) => {
    area.querySelector('.game-overlay')?.remove();
    const el = toElement(html`<div class="game-overlay">${content}</div>`);
    area.appendChild(el);
    return el;
  };

  const intro = () => {
    const el = overlay(html`<div class="game-emoji">${meta.emoji}</div><h2>${meta.title}</h2><p>${meta.how}</p>
      <button class="btn btn-white btn-lg" data-start>${icon('play', { size: 18 })} Jugar</button>
      ${best ? html`<span class="tiny" style="opacity:.7">Tu récord: ${formatNumber(best)} ${meta.unit}</span>` : ''}`);
    el.querySelector('[data-start]').onclick = start;
  };

  const start = () => {
    area.querySelector('.game-overlay')?.remove();
    instance?.destroy?.();
    scoreEl.textContent = '0';
    instance = mod.start(area, {
      onScore: (s) => { scoreEl.textContent = formatNumber(Math.round(s)); },
      onEnd: (score, extra = {}) => end(Math.round(score), extra),
    });
  };

  const end = async (score, extra) => {
    if (destroyed) return;
    let result = { best: Math.max(best, score), isRecord: score > best };
    if (state.user) { try { result = await api.submitScore(gameId, score); } catch (err) { toastError(err); } }
    best = Math.max(best, score);
    $('[data-best]', host).textContent = `Récord ${formatNumber(best)}`;
    onFinish?.(score);
    const el = overlay(html`<div class="tiny bold" style="opacity:.7;letter-spacing:.1em">FIN DE LA PARTIDA</div>
      <div class="big-score">${formatNumber(score)}</div><div class="small" style="opacity:.8">${meta.unit}${extra.detail ? html` · ${extra.detail}` : ''}</div>
      ${result.isRecord && score > 0 ? html`<div class="record">🏆 ¡Nuevo récord personal!</div>` : html`<div class="tiny" style="opacity:.7">Tu récord: ${formatNumber(result.best)}</div>`}
      <div class="row-wrap" style="justify-content:center">
        <button class="btn btn-white" data-again>${icon('refresh', { size: 16 })} Otra vez</button>
        ${state.user ? html`<button class="btn btn-hype" data-share>${icon('flame', { size: 16 })} Retar a la comunidad</button>` : html`<a class="btn btn-secondary" href="#/bienvenida">Crea cuenta para guardar récords</a>`}
      </div>`);
    el.querySelector('[data-again]').onclick = start;
    el.querySelector('[data-share]')?.addEventListener('click', () => {
      openComposer({ kind: 'game', game: { gameId, score }, text: `Acabo de hacer **${formatNumber(score)} ${meta.unit}** en ${meta.title} ${meta.emoji} ¿Quién me supera? #juegos #reto` });
    });
  };

  host.querySelector('[data-exit]')?.addEventListener('click', () => api_destroy());
  const api_destroy = () => { destroyed = true; instance?.destroy?.(); host.innerHTML = ''; onExit?.(); };
  if (autostart) start(); else intro();
  return { destroy: () => { destroyed = true; instance?.destroy?.(); }, stage };
}

export function openGameModal(gameId) {
  const meta = gameById(gameId);
  if (!meta) return;
  const host = document.createElement('div');
  let game = null;
  const m = openModal({ title: html`${meta.emoji} ${meta.title}`, content: host, size: 'lg', className: 'full-mobile', onClose: () => game?.destroy() });
  m.body.style.padding = '0';
  host.style.height = '100%';
  runGame(host, gameId).then((g) => { game = g; });
}

async function renderHub(el) {
  el.innerHTML = String(html`<div class="view-header"><h1>Juegos</h1><span class="sub">Playables · juega al instante y reta a la comunidad</span></div>
    <div class="view-body col" style="gap:20px">
      <div class="games-grid">${GAMES.map((g) => html`<a class="game-card" href="#/juegos/${g.id}" style="${colorVars(g.colors)}">
        <span class="game-emoji">${g.emoji}</span><span class="pill" style="align-self:flex-start;background:rgba(255,255,255,.14);color:#fff;border-color:transparent">PLAYABLE</span>
        <h3>${g.title}</h3><p>${g.tagline}</p><span class="best" data-best="${g.id}"></span></a>`)}</div>
      <div class="card card-pad"><div class="card-title">${icon('trophy', { size: 18 })} Líderes de la semana</div><div class="cards-grid" data-boards></div></div>
    </div>`);
  try {
    const mine = await api.myBestScores();
    Object.entries(mine).forEach(([id, s]) => { const b = el.querySelector(`[data-best="${id}"]`); if (b) b.textContent = `🏆 Tu récord: ${formatNumber(s)} ${gameById(id)?.unit || ''}`; });
  } catch { /* sin sesión */ }
  const boards = el.querySelector('[data-boards]');
  const rows = await Promise.all(GAMES.map((g) => api.leaderboard(g.id, 3).catch(() => [])));
  boards.innerHTML = String(html`${GAMES.map((g, i) => html`<div><div class="row small bold" style="margin-bottom:6px">${g.emoji} ${g.title}</div>${leaderboardHtml(rows[i], g)}</div>`)}`);
}

async function renderGame(el, id) {
  const meta = gameById(id);
  if (!meta) { navigate('/juegos', { replace: true }); return null; }
  el.innerHTML = String(html`<div class="view-header"><button class="icon-btn" data-back aria-label="Volver">${icon('arrowLeft')}</button><h1>${meta.emoji} ${meta.title}</h1></div>
    <div class="view-body col" style="gap:16px">
      <div data-host></div>
      <div class="card card-pad"><div class="card-title">${icon('trophy', { size: 18 })} Ranking</div><div data-board><div class="spinner"></div></div></div>
      <div class="card card-pad"><div class="card-title">${icon('info', { size: 18 })} Cómo se juega</div><p class="muted small">${meta.how}</p></div>
    </div>`);
  el.querySelector('[data-back]').onclick = () => back('/juegos');
  const loadBoard = async () => { el.querySelector('[data-board]').innerHTML = String(leaderboardHtml(await api.leaderboard(id, 10).catch(() => []), meta)); };
  loadBoard();
  const game = await runGame(el.querySelector('[data-host]'), id, { onFinish: loadBoard });
  return () => game.destroy();
}

export function render(el, ctx) {
  if (ctx.params.id) return renderGame(el, ctx.params.id);
  return renderHub(el);
}
