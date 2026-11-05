// Lista con scroll infinito (IntersectionObserver), deduplicación y estados.
import { html, toFragment, raw } from '../core/dom.js';
import { skeletonPosts } from '../core/ui.js';

/**
 * createInfiniteList({ container, load(offset) → {items, hasMore}, render(item) → SafeHTML,
 *   pageSize, empty: SafeHTML, end: SafeHTML, skeleton, afterRender(frag) , keep(item) })
 */
export function createInfiniteList({ container, load, render, pageSize = 10, empty = '', end = '', skeleton = true, afterRender, keep = () => true, key = (it) => it.id }) {
  const list = document.createElement('div');
  const sentinel = document.createElement('div');
  sentinel.className = 'loader-row';
  container.append(list, sentinel);
  let offset = 0, hasMore = true, loading = false, token = 0, count = 0;
  const seen = new Set();

  async function next() {
    if (loading || !hasMore) return;
    loading = true;
    const my = token;
    sentinel.innerHTML = count === 0 && skeleton ? String(skeletonPosts(3)) : '<div class="spinner"></div>';
    try {
      const res = await load(offset, pageSize);
      if (my !== token) return;
      offset += res.items.length || pageSize;
      hasMore = !!res.hasMore && res.items.length > 0;
      const fresh = res.items.filter((it) => { const k = key(it); if (seen.has(k)) return false; seen.add(k); return keep(it); });
      if (fresh.length) {
        const frag = toFragment(html`${fresh.map((it) => render(it))}`);
        const nodes = [...frag.childNodes];
        list.appendChild(frag);
        count += fresh.length;
        afterRender?.(list, nodes);
      }
      if (!hasMore) sentinel.innerHTML = count ? String(end || '') : String(empty || '');
      else sentinel.innerHTML = '';
      // Si la página quedó corta (todo filtrado), seguimos cargando
      if (hasMore && sentinel.getBoundingClientRect().top < innerHeight + 600) requestAnimationFrame(() => { loading = false; next(); });
    } catch (err) {
      if (my !== token) return;
      sentinel.innerHTML = String(html`<div class="notice danger" style="margin:16px">⚠️ <span>${err.message}</span> <button class="btn btn-sm btn-secondary" data-retry>Reintentar</button></div>`);
      sentinel.querySelector('[data-retry]')?.addEventListener('click', () => next());
    } finally {
      if (my === token) loading = false;
    }
  }

  const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) next(); }, { rootMargin: '800px 0px' });
  io.observe(sentinel);

  return {
    el: list,
    reset() { token++; offset = 0; hasMore = true; loading = false; count = 0; seen.clear(); list.innerHTML = ''; sentinel.innerHTML = ''; next(); },
    prepend(item) {
      const k = key(item);
      if (seen.has(k)) return null;
      seen.add(k);
      const frag = toFragment(render(item));
      const nodes = [...frag.childNodes];
      list.prepend(frag);
      count++;
      if (!hasMore && count === 1) sentinel.innerHTML = String(end || '');
      afterRender?.(list, nodes);
      return nodes;
    },
    get count() { return count; },
    destroy() { token++; io.disconnect(); list.remove(); sentinel.remove(); },
    next,
  };
}

export const endOfFeed = (text = 'Has llegado al final. ¡Crea algo nuevo! ✨') => raw(`<div class="end-of-feed"><span style="font-size:26px">🎉</span><span>${text}</span></div>`);
