// Compositor de posts: hilos, Markdown, imágenes con filtros, GIFs, vídeo HD,
// encuestas, audiencia/grupos, borradores y herramientas de Hype IA.
import { html, toElement, $, $$, esc } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { state, bus } from '../core/store.js';
import { uuid, debounce, pickFiles, formatBytes, formatDuration, formatNumber } from '../core/utils.js';
import { openModal, openMenu, toast, toastError, confirmDialog } from '../core/ui.js';
import { renderMarkdown } from '../core/markdown.js';
import { navigate } from '../core/router.js';
import { api } from '../data/api.js';
import { avatar, colorVars, coverBox, stagePill } from './common.js';
import { FILTERS, filterClass, processImage, videoMeta, isHD, LIMITS } from './media.js';
import { createEditor } from './editor.js';
import { openGifPicker, openEmojiMenu } from './pickers.js';
import { requireUser } from './session.js';
import { gameById } from '../games/registry.js';

export const POST_LIMIT = 1000;
const MAX_PARTS = 25;
const DRAFT_KEY = 'hype:draft';

/** División automática (sin IA) en partes de ≤ max caracteres. */
export function splitIntoThread(text, max = 480) {
  const raw = String(text || '').trim();
  if (!raw) return [];
  // Agrupa bloques de código para no partirlos
  const blocks = [];
  let fence = null;
  for (const b of raw.split(/\n{2,}/)) {
    if (fence !== null) { fence += '\n\n' + b; if ((b.match(/```/g) || []).length % 2 === 1) { blocks.push(fence); fence = null; } continue; }
    if ((b.match(/```/g) || []).length % 2 === 1) { fence = b; continue; }
    blocks.push(b);
  }
  if (fence !== null) blocks.push(fence);
  const out = [];
  let cur = '';
  const push = () => { if (cur.trim()) out.push(cur.trim()); cur = ''; };
  for (const b of blocks) {
    const joined = cur ? `${cur}\n\n${b}` : b;
    if (joined.length <= max) { cur = joined; continue; }
    push();
    if (b.length <= max || b.startsWith('```')) { cur = b; continue; }
    const sentences = b.match(/[^.!?…\n]+[.!?…]*\s*|\n/g) || [b];
    for (const s of sentences) {
      if ((cur + s).length <= max) { cur += s; continue; }
      push();
      if (s.length <= max) { cur = s; continue; }
      for (const w of s.split(/(\s+)/)) { if ((cur + w).length > max) push(); cur += w; }
    }
  }
  push();
  return out;
}

function loadDraft() { try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch { return null; } }
function clearDraft() { try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ } }

/**
 * Abre el compositor.
 * opts: { groupId, kind, game, projectId, project, text, parts: [string], poll: true, files: [File] }
 */
export function openComposer(opts = {}) {
  if (!requireUser('publicar')) return null;
  const me = state.user;
  const st = {
    parts: [],
    visibility: opts.groupId ? 'public' : (state.settings.defaultVisibility || 'public'),
    groupId: opts.groupId || null,
    groupName: opts.groupName || '',
    sensitive: false,
    kind: opts.kind || 'post',
    game: opts.game || null,
    projectId: opts.projectId || null,
    project: opts.project || null,
    publishing: false,
  };
  const hasInitial = !!(opts.text || opts.parts?.length || opts.game || opts.projectId || opts.files?.length || opts.poll);

  const root = toElement(html`<div class="composer">
    <div class="composer-head">
      <button type="button" class="btn btn-ghost btn-sm" data-cancel>Cancelar</button>
      <span class="spacer"></span>
      <span class="tiny dim" data-draft></span>
      <button type="button" class="btn btn-primary btn-sm" data-publish>Publicar</button>
    </div>
    <div class="composer-scroll">
      <div class="row" style="margin:0 0 12px 52px;gap:8px;flex-wrap:wrap">
        <button type="button" class="audience-btn" data-audience></button>
      </div>
      <div data-parts></div>
      <button type="button" class="add-part" data-add-part><span class="plus">${icon('plus', { size: 18 })}</span>Añadir al hilo</button>
      <div data-embed style="margin-left:52px"></div>
    </div>
    <div class="composer-foot">
      <label class="row small" style="gap:8px;cursor:pointer"><span class="switch"><input type="checkbox" data-sensitive><span class="track"></span><span class="thumb"></span></span>Contenido sensible</label>
      <span class="spacer"></span>
      <span class="tiny dim">Markdown · Ctrl+Enter para publicar</span>
    </div>
  </div>`);

  const partsEl = $('[data-parts]', root);
  const publishBtn = $('[data-publish]', root);
  const modal = openModal({ content: root, size: 'lg', className: 'full-mobile', bare: true, hideHeader: true, dismissible: true, onClose: () => { st.parts.forEach((p) => p.media.forEach((m) => m.preview && URL.revokeObjectURL(m.preview))); } });

  // ---------- Borrador ----------
  const saveDraft = debounce(() => {
    if (st.publishing) return;
    const data = { parts: st.parts.map((p) => ({ body: p.editor.value, poll: p.poll })), visibility: st.visibility, groupId: st.groupId, groupName: st.groupName, savedAt: Date.now() };
    const empty = data.parts.every((p) => !p.body.trim() && !p.poll);
    try { if (empty) clearDraft(); else localStorage.setItem(DRAFT_KEY, JSON.stringify(data)); } catch { /* cuota */ }
    $('[data-draft]', root).textContent = empty ? '' : 'Borrador guardado';
  }, 600);

  // ---------- Partes ----------
  function newPart(body = '', poll = null) {
    const part = { id: uuid(), media: [], poll, editor: null, el: null };
    part.editor = createEditor({
      value: body,
      placeholder: st.parts.length === 0 ? (st.kind === 'game' ? 'Reta a la comunidad…' : '¿Qué está pasando? Usa **Markdown**, @menciones y #hashtags') : 'Continúa el hilo…',
      borderless: true,
      rows: 3,
      onChange: () => { updateRing(part); updatePublish(); saveDraft(); },
      onSubmit: publish,
      mentionSearch: (q) => api.searchProfiles(q, 5),
    });
    part.el = toElement(html`<div class="composer-part" data-part="${part.id}">
      <div class="post-gutter">${avatar(me, 'md')}<div class="thread-line"></div></div>
      <div class="part-body">
        <div class="row" style="justify-content:space-between;min-height:20px"><span class="part-index" data-index></span><button type="button" class="icon-btn sm" data-remove-part title="Quitar del hilo" aria-label="Quitar del hilo">${icon('x', { size: 16 })}</button></div>
        <div data-editor></div>
        <div class="media-tray" data-tray></div>
        <div data-pollbox></div>
        <div class="row" style="gap:4px">
          <div class="part-tools">
            <button type="button" class="icon-btn sm" data-tool="image" title="Imágenes" aria-label="Añadir imágenes">${icon('image', { size: 19 })}</button>
            <button type="button" class="icon-btn sm" data-tool="video" title="Vídeo HD" aria-label="Añadir vídeo">${icon('video', { size: 19 })}</button>
            <button type="button" class="icon-btn sm" data-tool="gif" title="GIF" aria-label="Añadir GIF"><span class="gif-text">GIF</span></button>
            <button type="button" class="icon-btn sm" data-tool="poll" title="Encuesta" aria-label="Añadir encuesta">${icon('poll', { size: 19 })}</button>
            <button type="button" class="icon-btn sm" data-tool="emoji" title="Emoji" aria-label="Emoji">${icon('smile', { size: 19 })}</button>
            ${state.settings.ai?.composerTools !== false ? html`<button type="button" class="icon-btn sm" data-tool="ai" title="Hype IA" aria-label="Hype IA">${icon('sparkles', { size: 19 })}</button>` : ''}
          </div>
          <span class="spacer"></span>
          <span class="ring" data-ring title="Caracteres"><span></span></span>
        </div>
      </div>
    </div>`);
    $('[data-editor]', part.el).appendChild(part.editor.el);
    part.editor.textarea.addEventListener('paste', (e) => {
      const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/') || f.type.startsWith('video/'));
      if (files.length) { e.preventDefault(); addFiles(part, files); }
    });
    return part;
  }

  function addPart(body = '', poll = null, { focus = true } = {}) {
    if (st.parts.length >= MAX_PARTS) { toast(`Un hilo admite hasta ${MAX_PARTS} posts`); return null; }
    const part = newPart(body, poll);
    st.parts.push(part);
    partsEl.appendChild(part.el);
    renderPoll(part);
    renderTray(part);
    refreshParts();
    if (focus) setTimeout(() => part.editor.focus(), 30);
    return part;
  }

  function removePart(part) {
    if (st.parts.length === 1) { part.editor.setValue(''); part.media = []; part.poll = null; renderTray(part); renderPoll(part); updatePublish(); return; }
    st.parts = st.parts.filter((p) => p !== part);
    part.el.remove();
    refreshParts();
    saveDraft();
  }

  function setParts(texts) {
    st.parts.forEach((p) => p.el.remove());
    st.parts = [];
    texts.forEach((t, i) => addPart(t, null, { focus: i === texts.length - 1 }));
    saveDraft();
  }

  function refreshParts() {
    const n = st.parts.length;
    st.parts.forEach((p, i) => {
      $('[data-index]', p.el).textContent = n > 1 ? `${i + 1}/${n}` : '';
      $('.thread-line', p.el).style.visibility = i < n - 1 ? 'visible' : 'hidden';
      $('[data-remove-part]', p.el).style.visibility = n > 1 || p.editor.value || p.media.length || p.poll ? 'visible' : 'hidden';
      updateRing(p);
    });
    $('[data-add-part]', root).classList.toggle('hidden', n >= MAX_PARTS);
    updatePublish();
  }

  function updateRing(part) {
    const len = part.editor.value.length;
    const ring = $('[data-ring]', part.el);
    ring.style.setProperty('--p', Math.min(100, (len / POST_LIMIT) * 100));
    ring.classList.toggle('warn', len > POST_LIMIT * 0.9 && len <= POST_LIMIT);
    ring.classList.toggle('over', len > POST_LIMIT);
    ring.querySelector('span').textContent = len > POST_LIMIT * 0.9 ? String(POST_LIMIT - len) : '';
    ring.title = `${formatNumber(len)} / ${formatNumber(POST_LIMIT)}`;
  }

  function hasContent(p) { return p.editor.value.trim() || p.media.length || p.poll; }

  function updatePublish() {
    const n = st.parts.filter(hasContent).length;
    const over = st.parts.some((p) => p.editor.value.length > POST_LIMIT);
    publishBtn.disabled = st.publishing || over || (!n && !st.game && !st.projectId);
    publishBtn.textContent = n > 1 ? `Publicar hilo (${n})` : 'Publicar';
  }

  // ---------- Medios ----------
  async function addFiles(part, files) {
    for (const file of files) {
      const isVideo = file.type.startsWith('video/');
      const isGif = file.type === 'image/gif';
      if (!isVideo && !file.type.startsWith('image/')) { toastError(new Error(`${file.name}: formato no soportado`)); continue; }
      if (isVideo && part.media.length) { toast('Un vídeo debe ir solo en su post. Añade otro post al hilo para más contenido.'); continue; }
      if (!isVideo && part.media.some((m) => m.type === 'video')) { toast('Este post ya tiene un vídeo'); continue; }
      if (!isVideo && part.media.length >= LIMITS.images) { toast(`Máximo ${LIMITS.images} imágenes por post`); break; }
      const maxMB = isVideo ? (api.mode === 'cloud' ? LIMITS.videoCloudMB : LIMITS.videoLocalMB) : isGif ? LIMITS.gifMB : 40;
      if (file.size > maxMB * 1024 * 1024) { toastError(new Error(`${file.name} pesa ${formatBytes(file.size)} (máx. ${maxMB} MB)`)); continue; }
      const item = { id: uuid(), type: isVideo ? 'video' : isGif ? 'gif' : 'image', file, alt: '', filter: 'none', width: 0, height: 0, duration: 0, poster: null, preview: URL.createObjectURL(file), processing: true };
      part.media.push(item);
      renderTray(part);
      try {
        if (isVideo) Object.assign(item, await videoMeta(file));
        else { const r = await processImage(file); item.file = r.file; item.width = r.width; item.height = r.height; }
      } catch (err) {
        part.media = part.media.filter((m) => m !== item);
        toastError(err);
      }
      item.processing = false;
      renderTray(part);
    }
    refreshParts();
  }

  function renderTray(part) {
    const tray = $('[data-tray]', part.el);
    tray.innerHTML = String(html`${part.media.map((m) => html`<div class="tray-item" data-media="${m.id}">
      ${m.type === 'video'
        ? html`<video src="${esc(m.preview)}" class="${filterClass(m.filter)}" muted playsinline preload="metadata" loop></video>`
        : html`<img src="${esc(m.preview || m.url)}" class="${filterClass(m.filter)}" alt="${m.alt}">`}
      <button type="button" class="remove" data-remove-media aria-label="Quitar">${icon('x', { size: 14 })}</button>
      ${m.type === 'gif' ? html`<span class="media-tag" style="top:6px;left:6px;bottom:auto">GIF</span>` : ''}
      ${m.type === 'video' ? html`<span class="media-tag" style="top:6px;left:6px;bottom:auto">${isHD(m) ? 'HD · ' : ''}${formatDuration(m.duration)}</span>` : ''}
      <div class="tray-actions">
        ${m.type !== 'gif' ? html`<button type="button" class="tray-btn" data-filter>${icon('wand', { size: 12 })} Filtro</button>` : ''}
        <button type="button" class="tray-btn" data-alt style="${m.alt ? 'background:var(--accent)' : ''}">ALT</button>
      </div>
      ${m.processing ? html`<div class="progress" style="width:40%;opacity:.6"></div>` : html`<div class="progress" data-progress style="width:0"></div>`}
    </div>`)}`);
    tray.style.display = part.media.length ? '' : 'none';
    tray.querySelectorAll('video').forEach((v) => { v.addEventListener('mouseenter', () => v.play().catch(() => {})); v.addEventListener('mouseleave', () => v.pause()); });
  }

  async function editFilter(part, m) {
    const content = toElement(html`<div class="col">
      <div style="border-radius:16px;overflow:hidden;background:#000;display:grid;place-items:center;max-height:52vh">
        ${m.type === 'video' ? html`<video src="${esc(m.preview)}" class="${filterClass(m.filter)}" autoplay muted loop playsinline style="max-height:52vh"></video>` : html`<img src="${esc(m.preview)}" class="${filterClass(m.filter)}" alt="" style="max-height:52vh;object-fit:contain">`}
      </div>
      <div class="filter-strip">${FILTERS.map((f) => html`<button type="button" class="filter-swatch ${m.filter === f.id ? 'active' : ''}" data-f="${f.id}"><span class="thumb">${m.type === 'video' ? html`<span style="display:grid;place-items:center;height:100%;font-size:22px" class="${filterClass(f.id)}">🎬</span>` : html`<img src="${esc(m.preview)}" class="${filterClass(f.id)}" alt="">`}</span>${f.name}</button>`)}</div>
    </div>`);
    const footer = toElement(html`<div class="row" style="justify-content:flex-end;width:100%"><button class="btn btn-primary" data-ok>Aplicar</button></div>`);
    let chosen = m.filter;
    const md = openModal({ title: 'Filtros', content, footer, size: 'lg' });
    content.addEventListener('click', (e) => {
      const b = e.target.closest('[data-f]');
      if (!b) return;
      chosen = b.dataset.f;
      content.querySelectorAll('.filter-swatch').forEach((x) => x.classList.toggle('active', x === b));
      const main = content.querySelector('img, video');
      main.className = filterClass(chosen);
    });
    footer.querySelector('[data-ok]').onclick = () => { m.filter = chosen; renderTray(part); md.close(); };
  }

  async function editAlt(part, m) {
    const content = toElement(html`<div class="col">
      <div class="row" style="align-items:flex-start;gap:14px">
        ${m.type === 'video' ? html`<video src="${esc(m.preview)}" muted style="width:120px;height:120px;object-fit:cover;border-radius:12px"></video>` : html`<img src="${esc(m.preview || m.url)}" alt="" style="width:120px;height:120px;object-fit:cover;border-radius:12px" class="${filterClass(m.filter)}">`}
        <div class="field" style="flex:1"><label for="alt-t">Texto alternativo</label><textarea id="alt-t" class="textarea" maxlength="1000" placeholder="Describe la imagen para personas con discapacidad visual">${m.alt}</textarea><span class="hint">Ayuda a que todo el mundo disfrute tu post.</span></div>
      </div>
      ${m.type !== 'video' ? html`<button type="button" class="btn btn-secondary btn-sm" data-ai style="align-self:flex-start">${icon('sparkles', { size: 16 })} Generar con Hype IA</button>` : ''}
    </div>`);
    const footer = toElement(html`<div class="row" style="justify-content:flex-end;width:100%"><button class="btn btn-primary" data-ok>Guardar</button></div>`);
    const md = openModal({ title: 'Descripción (ALT)', content, footer, size: 'md' });
    const ta = content.querySelector('textarea');
    content.querySelector('[data-ai]')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const { hypeAI, aiStatus } = await import('../ai/gemini.js');
      if (!aiStatus().available) { toast(aiStatus().message); return; }
      btn.classList.add('loading'); btn.disabled = true;
      try { ta.value = await hypeAI.altText(m.file || m.url); } catch (err) { toastError(err); }
      btn.classList.remove('loading'); btn.disabled = false;
    });
    footer.querySelector('[data-ok]').onclick = () => { m.alt = ta.value.trim(); renderTray(part); md.close(); };
  }

  // ---------- Encuesta ----------
  function renderPoll(part) {
    const box = $('[data-pollbox]', part.el);
    if (!part.poll) { box.innerHTML = ''; return; }
    const p = part.poll;
    box.innerHTML = String(html`<div class="poll-builder">
      <div class="row"><b class="small">${icon('poll', { size: 16 })} Encuesta</b><span class="spacer"></span><button type="button" class="icon-btn sm" data-poll-remove aria-label="Quitar encuesta">${icon('x', { size: 16 })}</button></div>
      <p class="tiny dim" style="margin-top:-4px">La pregunta es el texto del post.</p>
      ${p.options.map((o, i) => html`<div class="opt"><input class="input" data-opt="${i}" maxlength="80" placeholder="Opción ${i + 1}" value="${o}">${p.options.length > 2 ? html`<button type="button" class="icon-btn sm" data-opt-remove="${i}" aria-label="Quitar opción">${icon('minus', { size: 16 })}</button>` : ''}</div>`)}
      ${p.options.length < 6 ? html`<button type="button" class="btn btn-ghost btn-sm" data-opt-add style="justify-self:start">${icon('plus', { size: 16 })} Añadir opción</button>` : ''}
      <div class="row-wrap" style="gap:14px">
        <label class="row small" style="gap:8px">Duración
          <select class="select" data-duration style="width:auto;padding:6px 32px 6px 10px">
            ${[[1, '1 hora'], [6, '6 horas'], [24, '1 día'], [72, '3 días'], [168, '7 días']].map(([h, l]) => html`<option value="${h}" ${p.durationHours === h ? 'selected' : ''}>${l}</option>`)}
          </select></label>
        <label class="row small" style="gap:8px;cursor:pointer"><span class="switch"><input type="checkbox" data-multiple ${p.multiple ? 'checked' : ''}><span class="track"></span><span class="thumb"></span></span>Opción múltiple</label>
      </div>
    </div>`);
  }

  // ---------- Audiencia ----------
  function paintAudience() {
    const b = $('[data-audience]', root);
    b.innerHTML = String(st.groupId
      ? html`${icon('users', { size: 15 })} ${st.groupName || 'Grupo'} ${icon('chevronDown', { size: 14 })}`
      : st.visibility === 'followers' ? html`${icon('lock', { size: 15 })} Solo seguidores ${icon('chevronDown', { size: 14 })}` : html`${icon('globe', { size: 15 })} Público ${icon('chevronDown', { size: 14 })}`);
  }

  async function audienceMenu(anchor) {
    let groups = [];
    try { groups = (await api.listGroups({ mine: true })).items.filter((g) => g.myStatus === 'active'); } catch { /* sin grupos */ }
    openMenu(anchor, [
      { header: '¿Quién puede verlo?' },
      { label: 'Público', icon: 'globe', checked: !st.groupId && st.visibility === 'public', onClick: () => { st.groupId = null; st.visibility = 'public'; paintAudience(); saveDraft(); } },
      { label: 'Solo seguidores', icon: 'lock', checked: !st.groupId && st.visibility === 'followers', onClick: () => { st.groupId = null; st.visibility = 'followers'; paintAudience(); saveDraft(); } },
      ...(groups.length ? [{ divider: true }, { header: 'Publicar en un grupo' }] : []),
      ...groups.map((g) => ({ label: g.name, emoji: g.emoji, checked: st.groupId === g.id, onClick: () => { st.groupId = g.id; st.groupName = g.name; st.visibility = 'public'; paintAudience(); saveDraft(); } })),
    ], { align: 'left' });
  }

  // ---------- Hype IA ----------
  async function aiMenu(part, anchor) {
    const { hypeAI, aiStatus } = await import('../ai/gemini.js');
    const st2 = aiStatus();
    const text = () => part.editor.value.trim();
    const need = (fn) => async () => {
      if (!st2.available) {
        toast(st2.message, { action: { label: 'Configurar', onClick: () => { modal.close(); navigate('/ajustes/ia'); } } });
        return;
      }
      try { await fn(); } catch (err) { if (err.name !== 'AbortError') toastError(err); }
    };
    const needText = (fn) => need(async () => { if (!text()) { toast('Escribe algo primero ✍️'); return; } await fn(); });
    openMenu(anchor, [
      { header: 'Hype IA ✨' },
      { label: 'Mejorar redacción', icon: 'wand', onClick: needText(() => preview(part, 'Mejorar redacción', (o) => hypeAI.improve(text(), o))) },
      { label: 'Acortar', icon: 'minus', onClick: needText(() => preview(part, 'Versión corta', (o) => hypeAI.shorten(text(), 280, o))) },
      { label: 'Tono épico 🔥', icon: 'flame', onClick: needText(() => preview(part, 'Tono épico', (o) => hypeAI.tone(text(), 'épico y entusiasta, que genere hype', o))) },
      { label: 'Tono profesional', icon: 'shield', onClick: needText(() => preview(part, 'Tono profesional', (o) => hypeAI.tone(text(), 'profesional y claro', o))) },
      { label: 'Tono divertido', icon: 'smile', onClick: needText(() => preview(part, 'Tono divertido', (o) => hypeAI.tone(text(), 'divertido y cercano', o))) },
      { label: 'Traducir al inglés', icon: 'globe', onClick: needText(() => preview(part, 'Traducción', (o) => hypeAI.translate(text(), 'inglés', o))) },
      { label: 'Continuar escribiendo', icon: 'edit', onClick: needText(() => preview(part, 'Continuación', (o) => hypeAI.continueText(text(), o), 'append')) },
      { divider: true },
      { label: 'Sugerir hashtags', icon: 'hash', onClick: needText(async () => { const tags = await hypeAI.hashtags(text()); if (tags.length) { part.editor.append(tags.map((t) => '#' + t).join(' ')); toast('Hashtags añadidos', { type: 'success' }); } }) },
      { label: 'Convertir en hilo (IA)', icon: 'thread', onClick: needText(async () => { toast('Hype IA está creando tu hilo… 🧵'); const posts = await hypeAI.thread(st.parts.map((p) => p.editor.value).join('\n\n')); setParts(posts); toast(`Hilo de ${posts.length} posts listo`, { type: 'success' }); }) },
      { label: 'Crear encuesta con IA', icon: 'poll', onClick: need(async () => { const r = await hypeAI.poll(text() || 'tema libre para una red social creativa'); if (!text() && r.question) part.editor.setValue(r.question); part.poll = { options: r.options, durationHours: 24, multiple: false }; renderPoll(part); refreshParts(); }) },
      { divider: true },
      { label: 'Dividir en hilo (automático)', icon: 'layers', onClick: () => { const all = st.parts.map((p) => p.editor.value).join('\n\n'); const pieces = splitIntoThread(all); if (pieces.length < 2) { toast('El texto es corto: no hace falta dividirlo'); return; } setParts(pieces); toast(`Dividido en ${pieces.length} posts`, { type: 'success' }); } },
    ], { align: 'left' });
  }

  function preview(part, title, run, mode = 'replace') {
    return new Promise((resolve) => {
      const out = toElement(html`<div class="ai-menu-preview md cursor-blink"><p class="dim">Hype IA está escribiendo…</p></div>`);
      const footer = toElement(html`<div class="row" style="justify-content:flex-end;width:100%;flex-wrap:wrap">
        <button class="btn btn-ghost" data-c>Descartar</button>
        <button class="btn btn-secondary" data-retry disabled>${icon('refresh', { size: 16 })} Otra versión</button>
        <button class="btn btn-primary" data-ok disabled>${mode === 'append' ? 'Añadir' : 'Usar este texto'}</button></div>`);
      let ctrl = new AbortController();
      let result = '';
      const md = openModal({ title: `✨ ${title}`, content: out, footer, size: 'lg', onClose: () => { ctrl.abort(); resolve(); } });
      const go = async () => {
        ctrl.abort(); ctrl = new AbortController();
        footer.querySelectorAll('[data-ok],[data-retry]').forEach((b) => { b.disabled = true; });
        out.classList.add('cursor-blink');
        out.innerHTML = '<p class="dim">Hype IA está escribiendo…</p>';
        try {
          result = await run({ onToken: (full) => { out.innerHTML = String(renderMarkdown(full)); }, signal: ctrl.signal });
          result = result.trim();
          out.innerHTML = String(renderMarkdown(result));
          footer.querySelectorAll('[data-ok],[data-retry]').forEach((b) => { b.disabled = false; });
        } catch (err) {
          if (err.name === 'AbortError') return;
          out.innerHTML = String(html`<div class="notice danger">${icon('alert')}<span>${err.message}</span></div>`);
          footer.querySelector('[data-retry]').disabled = false;
        }
        out.classList.remove('cursor-blink');
      };
      footer.querySelector('[data-c]').onclick = () => md.close();
      footer.querySelector('[data-retry]').onclick = go;
      footer.querySelector('[data-ok]').onclick = () => {
        if (mode === 'append') part.editor.setValue(part.editor.value.replace(/\s*$/, '') + ' ' + result);
        else part.editor.setValue(result);
        md.close();
      };
      go();
    });
  }

  // ---------- Publicar ----------
  async function publish() {
    if (st.publishing || publishBtn.disabled) return;
    const parts = st.parts.filter(hasContent);
    if (!parts.length && !st.game && !st.projectId) return;
    for (const [i, p] of parts.entries()) {
      if (p.editor.value.length > POST_LIMIT) { toast(`El post ${i + 1} supera ${POST_LIMIT} caracteres`); return; }
      if (p.poll && p.poll.options.map((o) => o.trim()).filter(Boolean).length < 2) { toast('La encuesta necesita al menos 2 opciones'); return; }
      if (p.media.some((m) => m.processing)) { toast('Espera a que terminen de procesarse los archivos'); return; }
      if (state.settings.requireAltText && p.media.some((m) => m.type !== 'video' && !m.alt)) { toast('Añade texto alternativo (ALT) a todas las imágenes (Ajustes → Accesibilidad)'); return; }
    }
    st.publishing = true;
    updatePublish();
    publishBtn.classList.add('loading');
    const payload = (parts.length ? parts : [st.parts[0]]).map((p) => ({
      body: p.editor.value,
      media: p.media.map((m) => ({ _id: m.id, type: m.type, file: m.file || null, url: m.url || '', poster: m.poster || '', alt: m.alt, filter: m.filter, width: m.width, height: m.height, duration: m.duration })),
      poll: p.poll ? { options: p.poll.options.map((o) => o.trim()).filter(Boolean), multiple: p.poll.multiple, durationHours: p.poll.durationHours } : null,
    }));
    try {
      const post = await api.createPost({ parts: payload, kind: st.kind, visibility: st.visibility, groupId: st.groupId, sensitive: st.sensitive, projectId: st.projectId, game: st.game }, {
        onProgress: (m, p) => { const bar = root.querySelector(`[data-media="${CSS.escape(m._id)}"] [data-progress]`); if (bar) bar.style.width = Math.round(p * 100) + '%'; },
      });
      clearDraft();
      st.publishing = false;
      modal.close();
      bus.emit('post:created', post);
      toast(payload.length > 1 ? `Hilo publicado 🧵 (${payload.length} posts)` : 'Publicado 🚀', { type: 'success', action: { label: 'Ver', onClick: () => navigate(`/post/${post.id}`) } });
    } catch (err) {
      st.publishing = false;
      publishBtn.classList.remove('loading');
      updatePublish();
      toastError(err);
    }
  }

  // ---------- Eventos ----------
  root.addEventListener('click', async (e) => {
    const t = e.target;
    if (t.closest('[data-cancel]')) { cancel(); return; }
    if (t.closest('[data-publish]')) { publish(); return; }
    if (t.closest('[data-add-part]')) { addPart(); return; }
    if (t.closest('[data-audience]')) { audienceMenu(t.closest('[data-audience]')); return; }
    const partEl = t.closest('[data-part]');
    const part = partEl && st.parts.find((p) => p.id === partEl.dataset.part);
    if (!part) return;
    if (t.closest('[data-remove-part]')) { removePart(part); return; }
    const tool = t.closest('[data-tool]')?.dataset.tool;
    if (tool === 'image') { addFiles(part, await pickFiles({ accept: 'image/*', multiple: true })); return; }
    if (tool === 'video') { addFiles(part, await pickFiles({ accept: 'video/mp4,video/webm,video/quicktime,video/*' })); return; }
    if (tool === 'gif') {
      if (part.media.length >= LIMITS.images || part.media.some((m) => m.type === 'video')) { toast('No caben más archivos en este post'); return; }
      const g = await openGifPicker();
      if (g?.file) addFiles(part, [g.file]);
      else if (g?.url) { part.media.push({ id: uuid(), type: 'gif', url: g.url, preview: '', alt: g.alt || 'GIF', filter: 'none', width: g.width, height: g.height }); renderTray(part); refreshParts(); }
      return;
    }
    if (tool === 'poll') {
      if (part.poll) { part.poll = null; } else part.poll = { options: ['', ''], durationHours: 24, multiple: false };
      renderPoll(part); refreshParts(); saveDraft();
      if (part.poll) setTimeout(() => part.el.querySelector('[data-opt="0"]')?.focus(), 30);
      return;
    }
    if (tool === 'emoji') { openEmojiMenu(t.closest('[data-tool]'), (emo) => part.editor.insert(emo)); return; }
    if (tool === 'ai') { aiMenu(part, t.closest('[data-tool]')); return; }
    const mediaEl = t.closest('[data-media]');
    const m = mediaEl && part.media.find((x) => x.id === mediaEl.dataset.media);
    if (m && t.closest('[data-remove-media]')) { if (m.preview) URL.revokeObjectURL(m.preview); part.media = part.media.filter((x) => x !== m); renderTray(part); refreshParts(); return; }
    if (m && t.closest('[data-filter]')) { editFilter(part, m); return; }
    if (m && t.closest('[data-alt]')) { editAlt(part, m); return; }
    if (t.closest('[data-poll-remove]')) { part.poll = null; renderPoll(part); refreshParts(); saveDraft(); return; }
    if (t.closest('[data-opt-add]')) { part.poll.options.push(''); renderPoll(part); part.el.querySelector(`[data-opt="${part.poll.options.length - 1}"]`)?.focus(); return; }
    const rm = t.closest('[data-opt-remove]');
    if (rm) { part.poll.options.splice(Number(rm.dataset.optRemove), 1); renderPoll(part); saveDraft(); }
  });

  root.addEventListener('input', (e) => {
    const partEl = e.target.closest('[data-part]');
    const part = partEl && st.parts.find((p) => p.id === partEl.dataset.part);
    if (!part?.poll) return;
    if (e.target.matches('[data-opt]')) { part.poll.options[Number(e.target.dataset.opt)] = e.target.value; saveDraft(); }
  });
  root.addEventListener('change', (e) => {
    if (e.target.matches('[data-sensitive]')) { st.sensitive = e.target.checked; return; }
    const partEl = e.target.closest('[data-part]');
    const part = partEl && st.parts.find((p) => p.id === partEl.dataset.part);
    if (!part?.poll) return;
    if (e.target.matches('[data-duration]')) part.poll.durationHours = Number(e.target.value);
    if (e.target.matches('[data-multiple]')) part.poll.multiple = e.target.checked;
    saveDraft();
  });

  // Arrastrar y soltar archivos
  root.addEventListener('dragover', (e) => { if (e.dataTransfer?.types?.includes('Files')) e.preventDefault(); });
  root.addEventListener('drop', (e) => {
    const files = [...(e.dataTransfer?.files || [])];
    if (!files.length) return;
    e.preventDefault();
    const partEl = e.target.closest('[data-part]');
    const part = (partEl && st.parts.find((p) => p.id === partEl.dataset.part)) || st.parts[st.parts.length - 1];
    addFiles(part, files);
  });

  async function cancel() {
    const dirty = st.parts.some(hasContent);
    if (dirty && !(await confirmDialog({ title: '¿Descartar?', message: 'El texto queda guardado como borrador; las imágenes y vídeos no.', confirmText: 'Salir', cancelText: 'Seguir editando' }))) return;
    modal.close();
  }

  // ---------- Estado inicial ----------
  const draft = !hasInitial ? loadDraft() : null;
  if (draft?.parts?.length && draft.parts.some((p) => p.body?.trim() || p.poll)) {
    st.visibility = draft.visibility || st.visibility;
    if (!opts.groupId && draft.groupId) { st.groupId = draft.groupId; st.groupName = draft.groupName; }
    draft.parts.forEach((p, i) => addPart(p.body || '', p.poll || null, { focus: i === draft.parts.length - 1 }));
    toast('Borrador recuperado ✍️', { action: { label: 'Descartar', onClick: () => { clearDraft(); setParts(['']); } } });
  } else if (opts.parts?.length) {
    opts.parts.forEach((t, i) => addPart(t, null, { focus: i === opts.parts.length - 1 }));
  } else {
    const part = addPart(opts.text || '', opts.poll ? { options: ['', ''], durationHours: 24, multiple: false } : null);
    if (opts.files?.length && part) addFiles(part, opts.files);
  }

  // Embed de juego o proyecto
  const embed = $('[data-embed]', root);
  if (st.game) {
    const g = gameById(st.game.gameId);
    embed.innerHTML = String(html`<div class="game-embed" style="${colorVars(g?.colors)};margin-top:8px"><div class="game-emoji">${g?.emoji}</div><div class="meta"><div class="tiny bold" style="opacity:.75">PLAYABLE · ${g?.title}</div><div class="score">${formatNumber(st.game.score)} ${g?.unit}</div></div></div>`);
  } else if (st.project) {
    const p = st.project;
    embed.innerHTML = String(html`<div class="embed" style="margin-top:8px">${coverBox(p)}<span class="meta"><span class="title">${p.name}</span><br><span class="small muted">${p.tagline}</span><span class="row small" style="margin-top:4px">${stagePill(p.stage)}</span></span></div>`);
  }
  paintAudience();
  refreshParts();
  return modal;
}

// ---------------- Shorts ----------------
export async function openShortComposer() {
  if (!requireUser('subir shorts')) return;
  const st = { file: null, preview: '', meta: null, filter: 'none', sensitive: false, publishing: false };
  const root = toElement(html`<div class="composer">
    <div class="composer-head"><button type="button" class="btn btn-ghost btn-sm" data-cancel>Cancelar</button><b style="flex:1;text-align:center">Nuevo short 🎬</b><button type="button" class="btn btn-primary btn-sm" data-publish disabled>Publicar</button></div>
    <div class="composer-scroll">
      <div class="row" style="align-items:flex-start;gap:18px;flex-wrap:wrap">
        <div data-stage style="width:min(100%, 240px);aspect-ratio:9/16;border-radius:20px;overflow:hidden;background:var(--surface-2);display:grid;place-items:center;border:2px dashed var(--border-strong);flex-shrink:0;margin:0 auto">
          <button type="button" class="col" data-pick style="align-items:center;gap:8px;color:var(--text-2);padding:16px;text-align:center">${icon('video', { size: 34 })}<b>Elige un vídeo</b><span class="tiny">Vertical 9:16 · HD · hasta ${api.mode === 'cloud' ? LIMITS.videoCloudMB : LIMITS.videoLocalMB} MB</span></button>
        </div>
        <div class="col" style="flex:1;min-width:240px">
          <div data-editor></div>
          <div><div class="flabel" style="margin-bottom:6px">Filtro</div><div class="filter-strip" data-filters></div></div>
          <label class="row small" style="gap:8px;cursor:pointer"><span class="switch"><input type="checkbox" data-sensitive><span class="track"></span><span class="thumb"></span></span>Contenido sensible</label>
          <p class="tiny dim" data-info></p>
        </div>
      </div>
    </div>
  </div>`);
  const editor = createEditor({ placeholder: 'Escribe una descripción con #hashtags…', rows: 3, toolbar: false, mentionSearch: (q) => api.searchProfiles(q, 5) });
  $('[data-editor]', root).appendChild(editor.el);
  const modal = openModal({ content: root, size: 'lg', className: 'full-mobile', bare: true, hideHeader: true, onClose: () => st.preview && URL.revokeObjectURL(st.preview) });
  const stage = $('[data-stage]', root);
  const publishBtn = $('[data-publish]', root);
  const paintFilters = () => {
    $('[data-filters]', root).innerHTML = String(html`${FILTERS.map((f) => html`<button type="button" class="filter-swatch ${st.filter === f.id ? 'active' : ''}" data-f="${f.id}"><span class="thumb">${st.meta?.poster ? html`<img src="${esc(st.posterUrl)}" class="${filterClass(f.id)}" alt="">` : html`<span class="${filterClass(f.id)}" style="display:grid;place-items:center;height:100%;font-size:22px;background:linear-gradient(135deg,#7c3aed,#db2777)">🎬</span>`}</span>${f.name}</button>`)}`);
  };
  paintFilters();
  const pick = async () => {
    const [file] = await pickFiles({ accept: 'video/mp4,video/webm,video/quicktime,video/*' });
    if (!file) return;
    const maxMB = api.mode === 'cloud' ? LIMITS.videoCloudMB : LIMITS.videoLocalMB;
    if (file.size > maxMB * 1024 * 1024) { toastError(new Error(`El vídeo pesa ${formatBytes(file.size)} (máx. ${maxMB} MB)`)); return; }
    try {
      st.meta = await videoMeta(file);
      st.file = file;
      if (st.preview) URL.revokeObjectURL(st.preview);
      st.preview = URL.createObjectURL(file);
      st.posterUrl = st.meta.poster ? URL.createObjectURL(st.meta.poster) : '';
      stage.style.border = '0';
      stage.innerHTML = String(html`<video src="${esc(st.preview)}" class="${filterClass(st.filter)}" autoplay muted loop playsinline style="width:100%;height:100%;object-fit:cover"></video>`);
      $('[data-info]', root).textContent = `${st.meta.width}×${st.meta.height}${isHD(st.meta) ? ' · HD' : ''} · ${formatDuration(st.meta.duration)} · ${formatBytes(file.size)}${st.meta.height < st.meta.width ? ' · Consejo: los shorts se ven mejor en vertical' : ''}`;
      publishBtn.disabled = false;
      paintFilters();
    } catch (err) { toastError(err); }
  };
  root.addEventListener('click', async (e) => {
    if (e.target.closest('[data-pick]')) pick();
    if (e.target.closest('[data-cancel]')) modal.close();
    const f = e.target.closest('[data-f]');
    if (f) { st.filter = f.dataset.f; paintFilters(); const v = stage.querySelector('video'); if (v) v.className = filterClass(st.filter); }
    if (e.target.closest('[data-publish]') && st.file && !st.publishing) {
      st.publishing = true;
      publishBtn.classList.add('loading');
      publishBtn.disabled = true;
      try {
        const post = await api.createPost({ kind: 'short', sensitive: !!$('[data-sensitive]', root).checked, parts: [{ body: editor.value, media: [{ type: 'video', file: st.file, poster: st.meta.poster, filter: st.filter, width: st.meta.width, height: st.meta.height, duration: st.meta.duration, alt: '' }] }] }, {
          onProgress: (_m, p) => { publishBtn.textContent = `Subiendo ${Math.round(p * 100)}%`; },
        });
        modal.close();
        bus.emit('short:created', post);
        toast('Short publicado 🎬', { type: 'success', action: { label: 'Ver', onClick: () => navigate(`/shorts?id=${post.id}`) } });
      } catch (err) {
        st.publishing = false;
        publishBtn.classList.remove('loading');
        publishBtn.disabled = false;
        publishBtn.textContent = 'Publicar';
        toastError(err);
      }
    }
  });
  pick();
}

/** Menú "Crear" (botón +). */
export function openCreateMenu(anchor) {
  if (!requireUser('crear')) return;
  openMenu(anchor, [
    { header: 'Crear' },
    { label: 'Post o hilo', icon: 'edit', hint: 'N', onClick: () => openComposer() },
    { label: 'Encuesta', icon: 'poll', onClick: () => openComposer({ poll: true }) },
    { label: 'Short (vídeo vertical)', icon: 'film', onClick: () => openShortComposer() },
    { label: 'Proyecto', icon: 'rocket', onClick: () => import('../views/projects.js').then((m) => m.openProjectForm()) },
    { label: 'Grupo', icon: 'users', onClick: () => import('../views/groups.js').then((m) => m.openGroupForm()) },
  ]);
}

