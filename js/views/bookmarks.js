// Guardados: marcadores privados organizados en carpetas.
import { html, $ } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { state, bus } from '../core/store.js';
import { api } from '../data/api.js';
import { renderPost, hydratePosts } from '../components/post-card.js';
import { createInfiniteList, endOfFeed } from '../components/infinite.js';
import { emptyState, toast, toastError, promptDialog, confirmDialog, openMenu } from '../core/ui.js';
import { navigate } from '../core/router.js';

const FOLDER_EMOJIS = ['📁', '🍳', '💼', '✨', '💡', '📚', '🎨', '💻', '🎮', '🎧', '🚀', '❤️', '🧠', '🛠️', '📸', '🌱'];

export async function render(el, ctx) {
  if (!state.user) { navigate('/bienvenida', { replace: true }); return; }
  let current = ctx.query.carpeta || 'all';
  let data = { folders: [], total: 0, unfiled: 0 };
  let list = null;

  el.innerHTML = String(html`<div class="view-header"><h1>Guardados</h1><span class="pill">${icon('lock', { size: 12 })} Privado</span><span class="spacer"></span>
      <button class="btn btn-secondary btn-sm" data-new>${icon('folderPlus', { size: 16 })} Nueva carpeta</button></div>
    <div class="bm-layout">
      <nav class="bm-folders" data-folders aria-label="Carpetas"></nav>
      <section class="bm-posts"><div class="bm-head" data-head></div><div data-list></div></section>
    </div>`);

  const paintFolders = () => {
    const btn = (id, emo, name, count) => html`<button class="folder-btn ${current === id ? 'active' : ''}" data-folder="${id}"><span class="emo">${emo}</span><span class="ellipsis">${name}</span><span class="count">${count}</span></button>`;
    $('[data-folders]', el).innerHTML = String(html`<div class="section-title" style="padding:0 10px">Carpetas</div>
      ${btn('all', '🔖', 'Todos', data.total)}${btn('none', '📥', 'Sin carpeta', data.unfiled)}
      ${data.folders.map((f) => btn(f.id, f.emoji, f.name, f.count))}`);
  };

  const paintHead = () => {
    const f = data.folders.find((x) => x.id === current);
    const title = current === 'all' ? '🔖 Todos los guardados' : current === 'none' ? '📥 Sin carpeta' : `${f?.emoji || '📁'} ${f?.name || 'Carpeta'}`;
    $('[data-head]', el).innerHTML = String(html`<h2>${title}</h2>${f ? html`<button class="icon-btn" data-folder-menu aria-label="Opciones de carpeta">${icon('more')}</button>` : ''}`);
  };

  const loadList = () => {
    list?.destroy();
    paintHead();
    list = createInfiniteList({
      container: $('[data-list]', el),
      load: (offset, limit) => api.listBookmarks({ folderId: current, offset, limit }),
      render: (p) => renderPost(p),
      empty: emptyState({ emoji: '🔖', title: current === 'all' ? 'Aún no guardas nada' : 'Carpeta vacía', text: 'Toca el marcador 🔖 en cualquier post para guardarlo aquí. Solo tú puedes ver tus guardados.' }),
      end: endOfFeed('Eso es todo en esta carpeta.'),
      afterRender: (root) => hydratePosts(root),
    });
    list.next();
  };

  const refresh = async () => {
    try { data = await api.listFolders(); } catch (err) { toastError(err); }
    if (current !== 'all' && current !== 'none' && !data.folders.some((f) => f.id === current)) current = 'all';
    paintFolders();
    paintHead();
  };

  const newFolder = async () => {
    const name = await promptDialog({ title: 'Nueva carpeta', label: 'Nombre', placeholder: 'Ej. Recetas, Trabajo, Inspiración', confirmText: 'Crear', maxLength: 40 });
    if (!name) return;
    try { const f = await api.createFolder({ name, emoji: FOLDER_EMOJIS[data.folders.length % FOLDER_EMOJIS.length] }); current = f.id; await refresh(); loadList(); toast(`Carpeta ${f.emoji} ${f.name} creada`, { type: 'success' }); } catch (err) { toastError(err); }
  };

  el.addEventListener('click', async (e) => {
    const f = e.target.closest('[data-folder]');
    if (f) { current = f.dataset.folder; paintFolders(); loadList(); return; }
    if (e.target.closest('[data-new]')) { newFolder(); return; }
    const menuBtn = e.target.closest('[data-folder-menu]');
    if (menuBtn) {
      const folder = data.folders.find((x) => x.id === current);
      openMenu(menuBtn, [
        { label: 'Renombrar', icon: 'edit', onClick: async () => { const n = await promptDialog({ title: 'Renombrar carpeta', value: folder.name, maxLength: 40 }); if (n) { await api.updateFolder(folder.id, { name: n }).catch(toastError); await refresh(); } } },
        { header: 'Icono' },
        ...FOLDER_EMOJIS.slice(0, 8).map((emo) => ({ label: `Usar ${emo}`, emoji: emo, checked: folder.emoji === emo, onClick: async () => { await api.updateFolder(folder.id, { emoji: emo }).catch(toastError); await refresh(); } })),
        { divider: true },
        { label: 'Eliminar carpeta', icon: 'trash', danger: true, onClick: async () => { if (await confirmDialog({ title: `Eliminar «${folder.name}»`, message: 'Los posts guardados pasarán a «Sin carpeta». No se borran.', confirmText: 'Eliminar', danger: true })) { await api.deleteFolder(folder.id).catch(toastError); current = 'all'; await refresh(); loadList(); } } },
      ]);
    }
  });

  const off = bus.on('bookmarks:change', () => { refresh(); });
  await refresh();
  loadList();
  return () => { off(); list?.destroy(); };
}

