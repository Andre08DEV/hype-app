// Almacén de archivos para el modo local (IndexedDB). Las URLs locales tienen la forma
// "idb:<clave>" y se convierten en object URLs al pintarse (atributo data-idb).

const DB_NAME = 'hype-media';
const STORE = 'blobs';
let dbPromise = null;

function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function tx(mode, fn) {
  return db().then((d) => new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    const req = fn(store);
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Transacción abortada'));
  }));
}

export const putBlob = (key, blob) => tx('readwrite', (s) => s.put(blob, key));
export const getBlob = (key) => tx('readonly', (s) => s.get(key));
export const deleteBlob = (key) => tx('readwrite', (s) => s.delete(key));
export const clearBlobs = () => tx('readwrite', (s) => s.clear());

const urlCache = new Map();

export async function resolveIdb(key) {
  if (urlCache.has(key)) return urlCache.get(key);
  const blob = await getBlob(key).catch(() => null);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urlCache.set(key, url);
  return url;
}

/** Atributos src/poster para una URL que puede ser local (idb:) o remota. */
export function isIdb(url) { return typeof url === 'string' && url.startsWith('idb:'); }

async function hydrateEl(el) {
  if (el.dataset.idb && !el.dataset.idbDone) {
    el.dataset.idbDone = '1';
    const url = await resolveIdb(el.dataset.idb);
    if (url) el.src = url;
  }
  if (el.dataset.idbPoster && !el.dataset.idbPosterDone) {
    el.dataset.idbPosterDone = '1';
    const url = await resolveIdb(el.dataset.idbPoster);
    if (url) el.poster = url;
  }
}

export function hydrateMedia(root = document) {
  if (root instanceof Element && (root.dataset.idb || root.dataset.idbPoster)) hydrateEl(root);
  root.querySelectorAll?.('[data-idb],[data-idb-poster]').forEach(hydrateEl);
}

let observer = null;
export function observeMedia(root = document.body) {
  if (observer) return;
  observer = new MutationObserver((muts) => {
    for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1) hydrateMedia(n);
  });
  observer.observe(root, { childList: true, subtree: true });
}

export async function storageEstimate() {
  try { return await navigator.storage?.estimate?.(); } catch { return null; }
}
