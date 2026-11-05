// Selectores: GIFs (GIPHY o integrados) y emojis.
import { html, toElement, esc, safeUrl } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { state } from '../core/store.js';
import { openModal, openMenu, toastError, promptDialog } from '../core/ui.js';
import { debounce, normalize, pickFiles } from '../core/utils.js';
import { DEMO_GIFS } from '../data/seed.js';

export const giphyKey = () => (state.settings.giphyKey || window.HYPE_CONFIG?.giphyApiKey || '').trim();

async function giphy(q) {
  const key = giphyKey();
  const base = q ? 'https://api.giphy.com/v1/gifs/search' : 'https://api.giphy.com/v1/gifs/trending';
  const params = new URLSearchParams({ api_key: key, limit: '24', rating: 'pg-13', ...(q ? { q, lang: 'es' } : {}) });
  const r = await fetch(`${base}?${params}`);
  if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? 'La API key de GIPHY no es válida' : 'No se pudo buscar en GIPHY');
  const j = await r.json();
  return (j.data || []).map((g) => {
    const big = g.images?.downsized_medium || g.images?.original || {};
    return { url: big.url, preview: g.images?.fixed_width?.url || big.url, title: g.title || 'GIF', width: Number(big.width) || 0, height: Number(big.height) || 0 };
  }).filter((g) => g.url);
}

/** Abre el selector. Resuelve con { url, alt, width, height } o { file } o null. */
export function openGifPicker() {
  return new Promise((resolve) => {
    let result = null;
    const hasKey = !!giphyKey();
    const content = toElement(html`<div class="col">
      <div class="input-group">${icon('search', { size: 18 })}<input class="input search-input" placeholder="${hasKey ? 'Buscar en GIPHY…' : 'Buscar GIFs…'}" data-q autofocus></div>
      <div class="gif-grid" data-grid></div>
      <div class="row-wrap">
        <button class="btn btn-secondary btn-sm" data-upload>${icon('upload', { size: 16 })} Subir GIF</button>
        <button class="btn btn-ghost btn-sm" data-url>${icon('link', { size: 16 })} Pegar URL</button>
        <span class="spacer"></span>
        ${hasKey ? html`<span class="tiny dim">Con tecnología de GIPHY</span>` : html`<a class="tiny dim" href="#/ajustes/integraciones" data-settings>Activa la búsqueda con GIPHY →</a>`}
      </div>
    </div>`);
    const m = openModal({ title: 'Añadir GIF', content, size: 'lg', onClose: () => resolve(result) });
    const grid = content.querySelector('[data-grid]');
    let items = [];
    const paint = (list) => {
      items = list;
      grid.innerHTML = list.length
        ? list.map((g, i) => String(html`<button type="button" data-i="${i}" title="${g.title}"><img src="${esc(safeUrl(g.preview || g.url))}" alt="${g.title}" loading="lazy"></button>`)).join('')
        : '<p class="dim small" style="padding:20px;text-align:center">Sin resultados</p>';
    };
    const search = debounce(async (q) => {
      if (hasKey) {
        grid.innerHTML = '<div class="spinner"></div>';
        try { paint(await giphy(q)); } catch (err) { grid.innerHTML = `<div class="notice danger">${esc(err.message)}</div>`; }
      } else {
        const n = normalize(q);
        paint(DEMO_GIFS.filter((g) => !n || normalize(`${g.title} ${g.tags}`).includes(n)).map((g) => ({ ...g, preview: g.url })));
      }
    }, 300);
    search('');
    content.querySelector('[data-q]').addEventListener('input', (e) => search(e.target.value.trim()));
    grid.addEventListener('click', (e) => {
      const b = e.target.closest('[data-i]');
      if (!b) return;
      const g = items[Number(b.dataset.i)];
      result = { url: g.url, alt: g.title, width: g.width || 0, height: g.height || 0 };
      m.close();
    });
    content.querySelector('[data-upload]').addEventListener('click', async () => {
      const [file] = await pickFiles({ accept: 'image/gif' });
      if (!file) return;
      if (file.type !== 'image/gif') { toastError(new Error('El archivo debe ser un .gif')); return; }
      if (file.size > 15 * 1024 * 1024) { toastError(new Error('El GIF supera 15 MB')); return; }
      result = { file };
      m.close();
    });
    content.querySelector('[data-url]').addEventListener('click', async () => {
      const url = await promptDialog({ title: 'GIF desde URL', label: 'Pega la dirección del GIF', placeholder: 'https://…/animacion.gif', confirmText: 'Añadir', maxLength: 800 });
      const u = safeUrl(url || '');
      if (!u || !/^https:\/\//.test(u)) { if (url) toastError(new Error('URL no válida (debe empezar por https://)')); return; }
      result = { url: u, alt: 'GIF', width: 0, height: 0 };
      m.close();
    });
    content.querySelector('[data-settings]')?.addEventListener('click', () => m.close());
  });
}

const QUICK_EMOJIS = ['🔥', '⚡', '🚀', '✨', '😂', '😍', '🥹', '😎', '🤯', '🙌', '👏', '💯', '❤️', '💜', '🎉', '👀', '🤔', '🙏', '💪', '🧵', '👇', '✅', '❌', '⭐', '🎮', '🎨', '🎧', '💻', '🍳', '☕', '🌙', '🌈'];

export function openEmojiMenu(anchor, onPick) {
  const el = openMenu(anchor, [{ header: 'Emojis' }]);
  const grid = document.createElement('div');
  grid.className = 'emoji-picker';
  grid.style.padding = '4px';
  grid.innerHTML = QUICK_EMOJIS.map((e) => `<button type="button" data-e="${e}">${e}</button>`).join('');
  el.appendChild(grid);
  grid.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-e]');
    if (b) { onPick(b.dataset.e); }
  });
}
