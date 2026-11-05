// Shorts: vídeos verticales a pantalla completa con scroll infinito y playables.
import { html, toFragment, $, $$ } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { state, bus, updateSettings, isFilteredOut } from '../core/store.js';
import { api } from '../data/api.js';
import { renderMarkdown } from '../core/markdown.js';
import { formatCount, vibrate } from '../core/utils.js';
import { bigFlame, toastError, emptyState } from '../core/ui.js';
import { avatar, colorVars, srcAttr } from '../components/common.js';
import { filterClass } from '../components/media.js';
import { cachePost, postCache, toggleHype, openFolderPicker, sharePost } from '../components/post-card.js';
import { openCommentsSheet } from '../components/comments.js';
import { openShortComposer } from '../components/composer.js';
import { GAMES } from '../games/registry.js';

const PLAYABLE_EVERY = 5;

function renderShort(p, idx) {
  cachePost(p);
  const v = p.media?.[0] || {};
  const a = p.author || {};
  const blur = p.sensitive && state.settings.blurSensitive;
  return html`<section class="short" data-post-id="${p.id}" data-idx="${idx}">
    <div class="short-bg" style="${colorVars(null, p.id)}"></div>
    <video ${srcAttr(v.url)} ${srcAttr(v.poster, 'poster')} class="${filterClass(v.filter)}" style="position:relative;${blur ? 'filter:blur(28px)' : ''}" loop playsinline muted preload="${idx < 2 ? 'auto' : 'metadata'}" aria-label="${v.alt || 'Short'}"></video>
    <div class="shade"></div>
    <div class="short-info">
      <div class="who">${avatar(a, 'md', { link: true })}<a href="#/u/${encodeURIComponent(a.username || '')}">@${a.username}</a></div>
      ${p.body ? html`<div class="caption md" data-caption>${renderMarkdown(p.body, { compact: true })}</div>` : ''}
    </div>
    <div class="short-rail">
      <button type="button" data-short-hype class="${p.hyped ? 'on' : ''}" aria-label="Dar hype"><span class="ico">${icon('flame', { size: 24 })}</span><span class="n">${formatCount(p.hypeCount)}</span></button>
      <button type="button" data-short-comments aria-label="Comentarios"><span class="ico">${icon('message', { size: 24 })}</span><span class="n">${formatCount(p.commentCount)}</span></button>
      <button type="button" data-short-save class="${p.bookmarked ? 'saved' : ''}" aria-label="Guardar"><span class="ico">${icon('bookmark', { size: 24 })}</span><span>Guardar</span></button>
      <button type="button" data-short-share aria-label="Compartir"><span class="ico">${icon('share', { size: 24 })}</span><span>Compartir</span></button>
    </div>
    ${blur ? html`<div class="sensitive-cover" data-unblur>${icon('eyeOff', { size: 28 })}<span>Contenido sensible</span><span class="btn btn-white btn-sm">Ver</span></div>` : ''}
    <div class="short-progress"><i></i></div>
  </section>`;
}

function renderPlayable(game, idx) {
  return html`<section class="short" data-playable="${game.id}" data-idx="${idx}" style="${colorVars(game.colors)}">
    <div class="short-bg"></div>
    <div class="short-playable">
      <span class="pill" style="background:rgba(255,255,255,.15);color:#fff;border-color:transparent">🎮 PLAYABLE</span>
      <div class="game-emoji">${game.emoji}</div>
      <h2>${game.title}</h2>
      <p style="opacity:.85;max-width:300px">${game.tagline}. Juega sin salir de Shorts.</p>
      <button type="button" class="btn btn-white btn-lg" data-play-inline>${icon('play', { size: 18 })} Jugar aquí</button>
      <a class="small" href="#/juegos/${game.id}" style="opacity:.8;text-decoration:underline">Ver ranking</a>
    </div>
    <div class="game-host hidden" data-host></div>
  </section>`;
}

export async function render(el, ctx) {
  el.innerHTML = String(html`<div class="shorts-wrap">
    <div class="short-top"><h1>Shorts</h1><span class="spacer"></span>
      <button class="icon-btn" data-upload aria-label="Subir short" title="Subir short">${icon('plus')}</button>
      <button class="icon-btn" data-mute aria-label="Silenciar/activar sonido">${icon(state.settings.muteVideos ? 'volumeX' : 'volume')}</button>
    </div>
    <div class="shorts" data-feed tabindex="0"></div>
  </div>`);
  const feed = $('[data-feed]', el);
  let offset = 0, loading = false, hasMore = true, idx = 0, active = null, playableTurn = 0;
  let muted = state.settings.muteVideos;
  let activeGame = null;

  async function loadMore(first = false) {
    if (loading || !hasMore) return;
    loading = true;
    try {
      const items = [];
      if (first && ctx.query.id) { try { items.push(await api.getPost(ctx.query.id)); } catch { /* ignore */ } }
      const res = await api.shorts({ offset, limit: 6 });
      offset += res.items.length;
      hasMore = res.hasMore;
      items.push(...res.items.filter((p) => !isFilteredOut(p) && p.id !== ctx.query.id));
      if (!items.length && idx === 0) {
        feed.innerHTML = String(html`<section class="short"><div class="short-bg"></div><div class="short-end" style="position:relative;z-index:2">${emptyState({ emoji: '🎬', title: 'Aún no hay shorts', text: 'Sube el primero: un vídeo vertical corto.', action: html`<button class="btn btn-white" data-upload>Subir short</button>` })}</div></section>`);
        return;
      }
      const parts = [];
      for (const p of items) {
        parts.push(renderShort(p, idx++));
        if (idx % PLAYABLE_EVERY === PLAYABLE_EVERY - 1) parts.push(renderPlayable(GAMES[playableTurn++ % GAMES.length], idx++));
      }
      const frag = toFragment(html`${parts}`);
      const nodes = [...frag.children];
      feed.appendChild(frag);
      nodes.forEach((n) => io.observe(n));
      if (!hasMore) feed.appendChild(toFragment(html`<section class="short"><div class="short-bg"></div><div class="short-end" style="position:relative;z-index:2"><div style="font-size:42px">🎉</div><h2>¡Lo viste todo!</h2><p style="opacity:.8">Vuelve más tarde o sube tu propio short.</p><button class="btn btn-white" data-upload>Subir short</button></div></section>`));
    } catch (err) { toastError(err); }
    finally { loading = false; }
  }

  function setActive(section) {
    if (active === section) return;
    if (active) {
      const v = active.querySelector('video');
      if (v) v.pause();
      if (activeGame && active.contains(activeGame.host)) { activeGame.destroy(); activeGame = null; }
    }
    active = section;
    const v = section.querySelector('video');
    if (v) {
      v.muted = muted;
      if (!state.settings.dataSaver) v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
      const next = section.nextElementSibling?.querySelector('video');
      if (next) next.preload = 'auto';
    }
    const i = Number(section.dataset.idx || 0);
    if (i >= idx - 3) loadMore();
  }

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting && e.intersectionRatio >= 0.65) setActive(e.target);
  }, { root: feed, threshold: [0.65] });

  // Progreso
  feed.addEventListener('timeupdate', (e) => {
    const v = e.target;
    if (v.tagName !== 'VIDEO' || !v.duration) return;
    const bar = v.closest('.short')?.querySelector('.short-progress i');
    if (bar) bar.style.width = (v.currentTime / v.duration) * 100 + '%';
  }, true);
  feed.addEventListener('error', (e) => {
    if (e.target.tagName === 'VIDEO') e.target.style.visibility = 'hidden';
  }, true);

  // Tap / doble tap
  let lastTap = 0, tapTimer = null;
  feed.addEventListener('click', async (e) => {
    const t = e.target;
    const section = t.closest('.short');
    if (!section) return;
    const post = postCache.get(section.dataset.postId);
    if (t.closest('[data-short-hype]')) { if (post) toggleHype(post, t.closest('[data-short-hype]')); return; }
    if (t.closest('[data-short-comments]')) { if (post) openCommentsSheet(post); return; }
    if (t.closest('[data-short-save]')) { if (post) openFolderPicker(post); return; }
    if (t.closest('[data-short-share]')) { if (post) sharePost(post); return; }
    if (t.closest('[data-unblur]')) { t.closest('[data-unblur]').remove(); section.querySelector('video').style.filter = ''; return; }
    if (t.closest('[data-caption]')) { t.closest('[data-caption]').classList.toggle('open'); return; }
    if (t.closest('[data-play-inline]')) { playInline(section); return; }
    if (t.closest('a, button, .game-host')) return;
    const v = section.querySelector('video');
    if (!v) return;
    const now = Date.now();
    if (now - lastTap < 300) {
      clearTimeout(tapTimer);
      lastTap = 0;
      if (post && !post.hyped) toggleHype(post, section.querySelector('[data-short-hype]'));
      const r = section.getBoundingClientRect();
      bigFlame(section, e.clientX - r.left, e.clientY - r.top);
      vibrate(15);
      return;
    }
    lastTap = now;
    tapTimer = setTimeout(() => {
      if (v.paused) { v.play().catch(() => {}); section.querySelector('.short-paused')?.remove(); }
      else { v.pause(); section.insertAdjacentHTML('beforeend', String(html`<div class="short-paused">${icon('play', { size: 34 })}</div>`)); }
    }, 280);
  });

  async function playInline(section) {
    const host = section.querySelector('[data-host]');
    host.classList.remove('hidden');
    const { runGame } = await import('./games.js');
    activeGame = await runGame(host, section.dataset.playable, { fullscreen: true, onExit: () => { host.classList.add('hidden'); host.innerHTML = ''; activeGame = null; } });
    activeGame.host = host;
  }

  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-upload]')) openShortComposer();
    const mb = e.target.closest('[data-mute]');
    if (mb) {
      muted = !muted;
      updateSettings({ muteVideos: muted });
      mb.innerHTML = String(icon(muted ? 'volumeX' : 'volume'));
      const v = active?.querySelector('video');
      if (v) { v.muted = muted; v.play().catch(() => {}); }
    }
  });

  const onKey = (e) => {
    if (e.target.closest?.('input, textarea') || document.body.classList.contains('modal-open')) return;
    if (activeGame) return;
    if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); feed.scrollBy({ top: feed.clientHeight, behavior: 'smooth' }); }
    if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); feed.scrollBy({ top: -feed.clientHeight, behavior: 'smooth' }); }
    if (e.key === ' ') { e.preventDefault(); const v = active?.querySelector('video'); if (v) v.paused ? v.play() : v.pause(); }
    if (e.key === 'm') el.querySelector('[data-mute]').click();
    if (e.key === 'l') { const p = active && postCache.get(active.dataset.postId); if (p) toggleHype(p, active.querySelector('[data-short-hype]')); }
  };
  document.addEventListener('keydown', onKey);
  const off = bus.on('short:created', (post) => {
    const frag = toFragment(renderShort(post, idx++));
    const node = frag.firstElementChild;
    feed.prepend(frag);
    io.observe(node);
    feed.scrollTo({ top: 0 });
  });

  await loadMore(true);

  return {
    destroy() {
      io.disconnect();
      document.removeEventListener('keydown', onKey);
      off();
      activeGame?.destroy();
      $$('video', feed).forEach((v) => { v.pause(); v.removeAttribute('src'); v.load(); });
    },
  };
}

