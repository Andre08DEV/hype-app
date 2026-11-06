// Proyectos: vitrina tipo lanzamientos con ranking por hype, detalle y feedback.
import { html, toElement, $, $$, safeUrl } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { state } from '../core/store.js';
import { api } from '../data/api.js';
import { renderMarkdown } from '../core/markdown.js';
import { formatCount, timeAgo, copyText, pickFiles } from '../core/utils.js';
import { openModal, toast, toastError, confirmDialog, emptyState, hypeBurst, setLoading } from '../core/ui.js';
import { navigate, back } from '../core/router.js';
import { avatar, coverBox, colorVars, stagePill, STAGES, srcAttr, verified } from '../components/common.js';
import { createEditor } from '../components/editor.js';
import { renderComment } from '../components/comments.js';
import { openComposer } from '../components/composer.js';
import { requireUser } from '../components/session.js';
import { createInfiniteList } from '../components/infinite.js';
import { processImage } from '../components/media.js';

const COLOR_PRESETS = [['#8b5cf6', '#ec4899'], ['#22c55e', '#06b6d4'], ['#f97316', '#facc15'], ['#0ea5e9', '#6366f1'], ['#ec4899', '#f43f5e'], ['#10b981', '#84cc16'], ['#64748b', '#0f172a']];
const projCache = new Map();

function hypeButton(p, big = false) {
  return html`<button type="button" class="hype-vote ${big ? 'big' : ''} ${p.hyped ? 'on' : ''}" data-project-hype="${p.id}" aria-pressed="${p.hyped ? 'true' : 'false'}" aria-label="Dar hype al proyecto">${icon('flame', { size: big ? 24 : 20 })}<span data-n>${formatCount(p.hypeCount)}</span></button>`;
}

function row(p, rank) {
  projCache.set(p.id, p);
  return html`<div class="project-row" data-project="${p.id}">
    <span class="rank">${rank}</span>
    <a href="#/p/${p.id}">${coverBox(p)}</a>
    <a class="meta" href="#/p/${p.id}">
      <h3>${p.name}</h3><span class="tagline">${p.tagline}</span>
      <span class="row-wrap" style="gap:6px">${stagePill(p.stage)}${p.tags.slice(0, 3).map((t) => html`<span class="pill">#${t}</span>`)}<span class="tiny dim">· ${icon('message', { size: 12 })} ${p.commentCount} · por @${p.owner?.username}</span></span>
    </a>
    ${hypeButton(p)}
  </div>`;
}

async function toggleProjectHype(btn) {
  if (!requireUser('dar hype')) return;
  const id = btn.dataset.projectHype;
  const p = projCache.get(id);
  if (!p) return;
  const was = p.hyped;
  p.hyped = !was;
  p.hypeCount += was ? -1 : 1;
  const paint = () => $$(`[data-project-hype="${CSS.escape(id)}"]`).forEach((b) => { b.classList.toggle('on', p.hyped); b.setAttribute('aria-pressed', String(p.hyped)); b.querySelector('[data-n]').textContent = formatCount(p.hypeCount); });
  paint();
  if (!was) hypeBurst(btn);
  try { const r = was ? await api.unhypeProject(id) : await api.hypeProject(id); p.hypeCount = r.hypeCount; p.hyped = r.hyped; paint(); }
  catch (err) { p.hyped = was; p.hypeCount += was ? 1 : -1; paint(); toastError(err); }
}

document.addEventListener('click', (e) => {
  const b = e.target instanceof Element && e.target.closest('[data-project-hype]');
  if (b) { e.preventDefault(); toggleProjectHype(b); }
});

// ---------------- Formulario ----------------
export function openProjectForm(project = null) {
  if (!requireUser('subir proyectos')) return;
  const p = project || { name: '', tagline: '', description: '', emoji: '🚀', color: COLOR_PRESETS[0], demoUrl: '', repoUrl: '', tags: [], stage: 'building', coverUrl: '' };
  let color = p.color || COLOR_PRESETS[0];
  let coverFile = null;
  let coverPreview = p.coverUrl;
  const editor = createEditor({ value: p.description, placeholder: 'Cuenta qué es, para quién y qué lo hace especial. Markdown permitido.', rows: 6 });
  const form = toElement(html`<form class="col" data-form>
    <div class="notice">${icon('sparkles')}<div class="col" style="gap:8px;flex:1"><span><b>¿Solo tienes una idea?</b> Descríbela y Hype IA rellena la ficha por ti.</span>
      <div class="row"><input class="input" data-idea placeholder="Ej. app para compartir recetas por ingredientes"><button type="button" class="btn btn-secondary btn-sm" data-ai>✨ Generar</button></div></div></div>
    <div class="row" style="gap:14px;align-items:flex-start">
      <button type="button" class="embed-cover" data-cover style="width:86px;height:86px;font-size:40px;${colorVars(color, p.id)}" title="Portada">${coverPreview ? html`<img ${srcAttr(coverPreview)} alt="">` : p.emoji}</button>
      <div class="col" style="flex:1;gap:8px">
        <div class="field"><label for="pj-name">Nombre</label><input class="input" id="pj-name" name="name" required maxlength="80" value="${p.name}" placeholder="Nombre del proyecto"></div>
        <div class="row-wrap" data-colors>${COLOR_PRESETS.map((c, i) => html`<button type="button" class="swatch ${c[0] === color[0] ? 'active' : ''}" data-color="${i}" style="--s1:${c[0]};--s2:${c[1]};width:28px;height:28px" aria-label="Color ${i + 1}"></button>`)}
          <input class="input" name="emoji" maxlength="4" value="${p.emoji}" style="width:64px;text-align:center" aria-label="Emoji"></div>
      </div>
    </div>
    <div class="field"><label for="pj-tag">Eslogan</label><input class="input" id="pj-tag" name="tagline" maxlength="140" value="${p.tagline}" placeholder="Una frase que lo explique todo"></div>
    <div class="field"><label>Descripción</label><div data-editor></div></div>
    <div class="row-wrap" style="gap:12px">
      <div class="field" style="flex:1;min-width:200px"><label for="pj-demo">Demo / web</label><input class="input" id="pj-demo" name="demoUrl" type="url" value="${p.demoUrl}" placeholder="https://"></div>
      <div class="field" style="flex:1;min-width:200px"><label for="pj-repo">Código</label><input class="input" id="pj-repo" name="repoUrl" type="url" value="${p.repoUrl}" placeholder="https://github.com/…"></div>
    </div>
    <div class="row-wrap" style="gap:12px">
      <div class="field" style="flex:1;min-width:200px"><label for="pj-tags">Etiquetas</label><input class="input" id="pj-tags" name="tags" value="${p.tags.join(', ')}" placeholder="ia, productividad, open-source"></div>
      <div class="field"><label for="pj-stage">Etapa</label><select class="select" id="pj-stage" name="stage">${Object.entries(STAGES).map(([k, v]) => html`<option value="${k}" ${p.stage === k ? 'selected' : ''}>${v}</option>`)}</select></div>
    </div>
  </form>`);
  $('[data-editor]', form).appendChild(editor.el);
  const footer = toElement(html`<div class="row" style="justify-content:flex-end;width:100%"><button class="btn btn-ghost" data-cancel>Cancelar</button><button class="btn btn-primary" data-save>${project ? 'Guardar cambios' : '🚀 Lanzar proyecto'}</button></div>`);
  const m = openModal({ title: project ? 'Editar proyecto' : 'Subir proyecto', content: form, footer, size: 'lg' });
  const coverBtn = $('[data-cover]', form);
  const paintCover = () => { coverBtn.setAttribute('style', `width:86px;height:86px;font-size:40px;${colorVars(color, p.id)}`); coverBtn.innerHTML = coverPreview ? String(html`<img ${srcAttr(coverPreview)} alt="">`) : (form.emoji.value || '🚀').replace(/[<>&"]/g, ''); };
  form.addEventListener('click', async (e) => {
    const c = e.target.closest('[data-color]');
    if (c) { color = COLOR_PRESETS[Number(c.dataset.color)]; $$('[data-color]', form).forEach((b) => b.classList.toggle('active', b === c)); paintCover(); }
    if (e.target.closest('[data-cover]')) {
      const [file] = await pickFiles({ accept: 'image/*' });
      if (file) { const r = await processImage(file); coverFile = r.file; coverPreview = URL.createObjectURL(r.file); paintCover(); }
    }
    const aiBtn = e.target.closest('[data-ai]');
    if (aiBtn) {
      const idea = $('[data-idea]', form).value.trim() || form.name.value.trim();
      if (!idea) { toast('Describe tu idea primero'); return; }
      const { hypeAI, aiStatus } = await import('../ai/gemini.js');
      if (!aiStatus().available) { toast(aiStatus().message, { action: { label: 'Configurar', onClick: () => { m.close(); navigate('/ajustes/ia'); } } }); return; }
      setLoading(aiBtn, true);
      try {
        const r = await hypeAI.projectPitch(idea);
        if (r.name && !form.name.value) form.name.value = r.name;
        form.tagline.value = r.tagline || form.tagline.value;
        editor.setValue(r.description || editor.value);
        if (r.tags?.length) form.tags.value = r.tags.join(', ');
        if (r.emoji) { form.emoji.value = r.emoji; paintCover(); }
        toast('Ficha generada ✨ Revísala antes de publicar', { type: 'success' });
      } catch (err) { toastError(err); }
      setLoading(aiBtn, false);
    }
  });
  form.emoji.addEventListener('input', paintCover);
  footer.querySelector('[data-cancel]').onclick = () => m.close();
  footer.querySelector('[data-save]').onclick = async (e) => {
    const btn = e.currentTarget;
    if (!form.name.value.trim()) { form.name.focus(); toast('Ponle nombre al proyecto'); return; }
    const data = {
      name: form.name.value.trim(), tagline: form.tagline.value.trim(), description: editor.value, emoji: form.emoji.value.trim() || '🚀', color,
      demoUrl: safeUrl(form.demoUrl.value.trim()) || '', repoUrl: safeUrl(form.repoUrl.value.trim()) || '', stage: form.stage.value,
      tags: form.tags.value.split(/[,#\s]+/).map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 8), coverFile,
    };
    setLoading(btn, true);
    try {
      const saved = project ? await api.updateProject(project.id, data) : await api.createProject(data);
      m.close();
      toast(project ? 'Proyecto actualizado' : '¡Proyecto lanzado! 🚀', { type: 'success', action: !project ? { label: 'Compartir en el feed', onClick: () => openComposer({ kind: 'project', projectId: saved.id, project: saved, text: `¡Acabo de lanzar **${saved.name}**! ${saved.tagline} 🚀` }) } : null });
      navigate(`/p/${saved.id}`);
    } catch (err) { toastError(err); setLoading(btn, false); }
  };
}

// ---------------- Lista ----------------
async function renderList(el, ctx) {
  let sort = ctx.query.orden || 'hot';
  let tag = ctx.query.tag || '';
  el.innerHTML = String(html`<div class="view-header"><h1>Proyectos</h1><span class="sub">Lanza lo que construyes y dale hype a lo que te inspira</span><span class="spacer"></span><button class="btn btn-primary btn-sm" data-new>${icon('plus', { size: 16 })} Subir</button></div>
    <div class="tabs">${[['hot', '🔥 En tendencia'], ['new', '✨ Nuevos'], ['top', '🏆 Más hype']].map(([k, l]) => html`<button class="tab ${k === sort ? 'active' : ''}" data-sort="${k}">${l}</button>`)}</div>
    <div class="filter-bar"><div class="chips" data-tags></div></div>
    <div data-list></div>`);
  let list = null;
  let rank = 0;
  const allTags = new Set();
  const paintTags = () => { $('[data-tags]', el).innerHTML = String(html`<button class="chip ${!tag ? 'active' : ''}" data-tag="">Todos</button>${[...allTags].slice(0, 14).map((t) => html`<button class="chip ${t === tag ? 'active' : ''}" data-tag="${t}">#${t}</button>`)}`); };
  const build = () => {
    list?.destroy();
    rank = 0;
    list = createInfiniteList({
      container: $('[data-list]', el),
      skeleton: false,
      load: async (offset, limit) => { const r = await api.listProjects({ sort, tag, offset, limit }); r.items.forEach((p) => p.tags.forEach((t) => allTags.add(t))); paintTags(); return r; },
      render: (p) => row(p, ++rank),
      empty: emptyState({ emoji: '🚀', title: 'Aún no hay proyectos', text: 'Sube el primero y empieza a recibir hype y feedback.', action: html`<button class="btn btn-primary" data-new>Subir proyecto</button>` }),
    });
    list.next();
  };
  el.addEventListener('click', (e) => {
    const s = e.target.closest('[data-sort]');
    if (s) { sort = s.dataset.sort; $$('[data-sort]', el).forEach((b) => b.classList.toggle('active', b === s)); build(); }
    const t = e.target.closest('[data-tag]');
    if (t) { tag = t.dataset.tag; paintTags(); build(); }
    if (e.target.closest('[data-new]')) openProjectForm();
  });
  paintTags();
  build();
  return () => list?.destroy();
}

// ---------------- Detalle ----------------
async function renderDetail(el, id) {
  el.innerHTML = String(html`<div class="view-header"><button class="icon-btn" data-back aria-label="Volver">${icon('arrowLeft')}</button><h1>Proyecto</h1></div><div data-body><div class="spinner"></div></div>`);
  el.querySelector('[data-back]').onclick = () => back('/proyectos');
  let p;
  try { p = await api.getProject(id); projCache.set(p.id, p); } catch (err) { $('[data-body]', el).innerHTML = String(emptyState({ emoji: '🫥', title: 'Proyecto no encontrado', text: err.message })); return; }
  const mine = p.ownerId === state.user?.id;
  $('[data-body]', el).innerHTML = String(html`
    <div class="project-hero">
      <div class="project-cover-lg" style="${colorVars(p.color, p.id)}">${p.coverUrl ? html`<img ${srcAttr(p.coverUrl)} alt="">` : p.emoji}</div>
      <div class="view-body col" style="gap:12px">
        <div class="row" style="align-items:flex-start;gap:14px">
          <div class="col" style="gap:6px;flex:1;min-width:0"><h1 style="font-size:1.7rem;font-weight:900">${p.name}</h1><p class="muted" style="font-size:1.02rem">${p.tagline}</p>
            <div class="row-wrap">${stagePill(p.stage)}${p.tags.map((t) => html`<a class="pill" href="#/proyectos?tag=${encodeURIComponent(t)}">#${t}</a>`)}</div></div>
          ${hypeButton(p, true)}
        </div>
        <a class="row small" href="#/u/${encodeURIComponent(p.owner?.username || '')}" style="gap:8px">${avatar(p.owner, 'sm')}<span>por <b>${p.owner?.displayName}</b>${verified(p.owner)} · ${timeAgo(p.createdAt)}</span></a>
        <div class="row-wrap">
          ${p.demoUrl ? html`<a class="btn btn-primary btn-sm" href="${safeUrl(p.demoUrl)}" target="_blank" rel="noopener noreferrer">${icon('external', { size: 16 })} Ver demo</a>` : ''}
          ${p.repoUrl ? html`<a class="btn btn-secondary btn-sm" href="${safeUrl(p.repoUrl)}" target="_blank" rel="noopener noreferrer">${icon('code', { size: 16 })} Código</a>` : ''}
          <button class="btn btn-secondary btn-sm" data-share-feed>${icon('share', { size: 16 })} Compartir en el feed</button>
          <button class="btn btn-secondary btn-sm" data-review>${icon('sparkles', { size: 16 })} Review de Hype IA</button>
          <button class="icon-btn" data-copy title="Copiar enlace" aria-label="Copiar enlace">${icon('link', { size: 18 })}</button>
          ${mine ? html`<button class="btn btn-ghost btn-sm" data-edit>${icon('edit', { size: 16 })} Editar</button><button class="btn btn-ghost btn-sm" data-delete style="color:var(--danger)">${icon('trash', { size: 16 })}</button>` : ''}
        </div>
        <div data-review-box></div>
        <div class="card card-pad"><div class="md">${p.description ? renderMarkdown(p.description) : html`<p class="dim">Sin descripción.</p>`}</div></div>
        <div class="section-title" style="margin-top:8px">Feedback · <span data-count>${p.commentCount}</span></div>
      </div>
    </div>
    ${state.user ? html`<form class="comment-form" data-form>${avatar(state.user, 'sm')}<textarea class="textarea" name="body" rows="1" maxlength="2000" placeholder="Deja feedback constructivo… 💡" aria-label="Feedback"></textarea><button class="btn btn-primary btn-sm" type="submit">Enviar</button></form>` : ''}
    <div data-comments><div class="spinner"></div></div>`);

  const comments = $('[data-comments]', el);
  const load = async () => {
    const list = await api.listProjectComments(p.id).catch(() => []);
    comments.innerHTML = list.length ? String(html`${list.map((c) => renderComment(c, p.ownerId))}`) : String(emptyState({ emoji: '💡', title: 'Sin feedback todavía', text: 'Sé la primera persona en opinar.' }));
  };
  load();

  el.addEventListener('click', async (e) => {
    if (e.target.closest('[data-share-feed]')) openComposer({ kind: 'project', projectId: p.id, project: p, text: mine ? `¡Mirad lo que estoy construyendo! **${p.name}** — ${p.tagline} 🚀` : `Este proyecto merece hype 🔥 **${p.name}** de @${p.owner?.username}` });
    if (e.target.closest('[data-copy]')) { if (await copyText(`${location.origin}${location.pathname}#/p/${p.id}`)) toast('Enlace copiado', { type: 'success' }); }
    if (e.target.closest('[data-edit]')) openProjectForm(p);
    if (e.target.closest('[data-delete]') && await confirmDialog({ title: 'Eliminar proyecto', message: 'Se perderán su hype y su feedback.', confirmText: 'Eliminar', danger: true })) {
      try { await api.deleteProject(p.id); toast('Proyecto eliminado'); navigate('/proyectos'); } catch (err) { toastError(err); }
    }
    const rb = e.target.closest('[data-review]');
    if (rb) {
      const { hypeAI, aiStatus } = await import('../ai/gemini.js');
      if (!aiStatus().available) { toast(aiStatus().message, { action: { label: 'Configurar', onClick: () => navigate('/ajustes/ia') } }); return; }
      const box = $('[data-review-box]', el);
      box.innerHTML = String(html`<div class="ai-review"><div class="card-title">${icon('sparkles', { size: 18 })} Review de Hype IA</div><div class="md cursor-blink" data-out><p class="dim">Analizando tu proyecto…</p></div></div>`);
      const out = box.querySelector('[data-out]');
      rb.disabled = true;
      try { await hypeAI.projectReview(p, { onToken: (full) => { out.innerHTML = String(renderMarkdown(full)); } }); }
      catch (err) { out.innerHTML = String(html`<div class="notice danger">${err.message}</div>`); }
      out.classList.remove('cursor-blink');
      rb.disabled = false;
    }
    const del = e.target.closest('[data-del-comment]');
    if (del) { try { await api.deleteComment(del.dataset.delComment); del.closest('.comment').remove(); } catch (err) { toastError(err); } }
  });
  $('[data-form]', el)?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const ta = e.target.body;
    if (!ta.value.trim()) return;
    try {
      const c = await api.addProjectComment(p.id, ta.value);
      ta.value = '';
      comments.querySelector('.empty')?.remove();
      comments.appendChild(toElement(renderComment(c, p.ownerId)));
      p.commentCount++;
      $('[data-count]', el).textContent = p.commentCount;
    } catch (err) { toastError(err); }
  });
}

export function render(el, ctx) {
  if (ctx.params.id) return renderDetail(el, ctx.params.id);
  return renderList(el, ctx);
}
