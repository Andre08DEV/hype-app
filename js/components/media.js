// Medios: filtros, compresión de imágenes, metadatos y miniatura de vídeo, y render.
import { html } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { state } from '../core/store.js';
import { formatDuration } from '../core/utils.js';
import { srcAttr } from './common.js';

export const FILTERS = [
  { id: 'none', name: 'Original' }, { id: 'vivid', name: 'Vívido' }, { id: 'noir', name: 'Noir' }, { id: 'retro', name: 'Retro' },
  { id: 'cold', name: 'Frío' }, { id: 'warm', name: 'Cálido' }, { id: 'neon', name: 'Neón' }, { id: 'dream', name: 'Sueño' },
  { id: 'fade', name: 'Suave' }, { id: 'drama', name: 'Drama' }, { id: 'cyber', name: 'Cyber' },
];
const FILTER_IDS = new Set(FILTERS.map((f) => f.id));
export const filterClass = (f) => (f && f !== 'none' && FILTER_IDS.has(f) ? `f-${f}` : '');

export const LIMITS = { images: 4, videoLocalMB: 250, videoCloudMB: 50, gifMB: 15 };

function loadImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')); };
    img.src = url;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** Redimensiona/comprime imágenes grandes (no toca GIFs para no perder la animación). */
export async function processImage(file, { hd = state.settings.hdUploads && !state.settings.dataSaver } = {}) {
  const { img, url } = await loadImage(file);
  const width = img.naturalWidth, height = img.naturalHeight;
  try {
    if (file.type === 'image/gif') return { file, width, height };
    const max = hd ? 2560 : 1600;
    const scale = Math.min(1, max / Math.max(width, height));
    if (scale === 1 && file.size < 1.5 * 1024 * 1024) return { file, width, height };
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    let blob = await canvasToBlob(canvas, 'image/webp', hd ? 0.9 : 0.82);
    if (!blob || blob.type !== 'image/webp') blob = await canvasToBlob(canvas, 'image/jpeg', hd ? 0.9 : 0.82);
    if (!blob || blob.size >= file.size) return { file, width, height };
    return { file: blob, width: canvas.width, height: canvas.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Recorte cuadrado (avatares). */
export async function squareCrop(file, size = 512) {
  const { img, url } = await loadImage(file);
  try {
    const s = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    canvas.getContext('2d').drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, size, size);
    return (await canvasToBlob(canvas, 'image/webp', 0.9)) || (await canvasToBlob(canvas, 'image/jpeg', 0.9));
  } finally { URL.revokeObjectURL(url); }
}

/** Duración, resolución y una miniatura (poster) de un vídeo local. */
export function videoMeta(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    let done = false;
    const finish = (res) => { if (done) return; done = true; URL.revokeObjectURL(url); res ? resolve(res) : reject(new Error('No se pudo leer el vídeo (¿formato compatible? usa MP4/H.264 o WebM)')); };
    const timer = setTimeout(() => finish(v.videoWidth ? { width: v.videoWidth, height: v.videoHeight, duration: v.duration || 0, poster: null } : null), 8000);
    v.onerror = () => { clearTimeout(timer); finish(null); };
    v.onloadedmetadata = () => {
      const t = Math.min(1, (v.duration || 2) / 3);
      try { v.currentTime = t; } catch { /* ignore */ }
    };
    v.onseeked = async () => {
      clearTimeout(timer);
      let poster = null;
      try {
        const scale = Math.min(1, 720 / Math.max(v.videoWidth, v.videoHeight));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(v.videoWidth * scale));
        c.height = Math.max(1, Math.round(v.videoHeight * scale));
        c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
        poster = await canvasToBlob(c, 'image/jpeg', 0.8);
      } catch { poster = null; }
      finish({ width: v.videoWidth, height: v.videoHeight, duration: v.duration || 0, poster });
    };
    v.src = url;
  });
}

export const isHD = (m) => Math.min(m.width || 0, m.height || 0) >= 720 || Math.max(m.width || 0, m.height || 0) >= 1280;

/** Render de la galería de un post. */
export function renderMedia(post, { autoplay = true } = {}) {
  const media = (post.media || []).slice(0, 4);
  if (!media.length) return '';
  const s = state.settings;
  const blur = post.sensitive && s.blurSensitive;
  const items = media.map((m, i) => {
    const f = filterClass(m.filter);
    if (m.type === 'video') {
      const ar = m.width && m.height ? `${m.width} / ${m.height}` : '16 / 9';
      return html`<div class="media-item video" style="--ar:${ar}">
        <video ${srcAttr(m.url)} ${srcAttr(m.poster, 'poster')} class="${f}" controls playsinline preload="metadata" ${s.muteVideos ? 'muted' : ''} ${autoplay && s.autoplayVideos && !s.dataSaver ? 'data-autoplay' : ''} loop aria-label="${m.alt || 'Vídeo'}"></video>
        ${isHD(m) ? html`<span class="media-tag hd right" style="top:8px;bottom:auto">HD</span>` : ''}
        ${m.duration ? html`<span class="media-tag" style="top:8px;bottom:auto">${formatDuration(m.duration)}</span>` : ''}
      </div>`;
    }
    return html`<button type="button" class="media-item" data-action="open-media" data-index="${i}" aria-label="Ver imagen ${i + 1}">
      <img ${srcAttr(m.url)} class="${f}" alt="${m.alt || ''}" loading="lazy" decoding="async">
      ${m.type === 'gif' ? html`<span class="media-tag">GIF</span>` : ''}
      ${m.alt ? html`<span class="alt-badge" title="${m.alt}">ALT</span>` : ''}
    </button>`;
  });
  return html`<div class="media-grid n${media.length}">${items}${blur ? html`<div class="sensitive-cover" data-action="reveal-sensitive" role="button" tabindex="0">${icon('eyeOff', { size: 26 })}<span>Contenido sensible</span><span class="btn btn-white btn-sm">Ver</span></div>` : ''}</div>`;
}

// ---- Autoplay de vídeos visibles (feed) ----
let videoObserver = null;
export function observeVideos(root = document) {
  if (!videoObserver) {
    videoObserver = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const v = e.target;
        if (e.isIntersecting && e.intersectionRatio >= 0.6 && state.settings.autoplayVideos && !state.settings.dataSaver) {
          v.muted = state.settings.muteVideos || v.muted;
          v.play().catch(() => {});
        } else if (!v.paused) v.pause();
      }
    }, { threshold: [0, 0.6] });
  }
  root.querySelectorAll('video[data-autoplay]:not([data-observed])').forEach((v) => { v.dataset.observed = '1'; videoObserver.observe(v); });
}
