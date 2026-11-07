// Perfil: cabecera, estadísticas, pestañas y edición.
import { html, toElement, $, $$, safeUrl } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { state, bus } from '../core/store.js';
import { api } from '../data/api.js';
import { renderMarkdown } from '../core/markdown.js';
import { formatCount, formatDate, pickFiles, formatNumber } from '../core/utils.js';
import { openModal, toast, toastError, emptyState, setLoading } from '../core/ui.js';
import { navigate, back } from '../core/router.js';
import { avatar, verified, followBtn, srcAttr, EMOJIS, INTERESTS, coverBox, stagePill } from '../components/common.js';
import { renderPost, hydratePosts } from '../components/post-card.js';
import { createInfiniteList, endOfFeed } from '../components/infinite.js';
import { squareCrop, processImage, filterClass } from '../components/media.js';
import { GAMES } from '../games/registry.js';
import { gradientFor } from '../core/utils.js';

export function openEditProfile() {
  const u = state.user;
  if (!u) return;
  const st = { avatarFile: null, bannerFile: null, avatarEmoji: u.avatarEmoji || '😎', avatarUrl: u.avatarUrl, bannerUrl: u.bannerUrl, interests: [...(u.interests || [])], links: [...(u.links || [])] };
  const form = toElement(html`<form class="col">
    <div class="profile-banner" data-banner style="height:120px;border-radius:var(--r);cursor:pointer;position:relative;--a1:${gradientFor(u.id)[0]};--a2:${gradientFor(u.id)[1]}">${st.bannerUrl ? html`<img ${srcAttr(st.bannerUrl)} alt="">` : ''}<span class="pill" style="position:absolute;right:10px;bottom:10px">${icon('image', { size: 12 })} Cambiar portada</span></div>
    <div class="row" style="gap:14px;margin-top:-40px;padding-left:12px">
      <button type="button" data-avatar style="border-radius:50%;box-shadow:0 0 0 4px var(--surface)" title="Cambiar foto">${avatar(u, 'xl')}</button>
      <div class="col" style="gap:6px;margin-top:40px"><button type="button" class="btn btn-secondary btn-sm" data-upload-avatar>${icon('upload', { size: 14 })} Subir foto</button>${st.avatarUrl ? html`<button type="button" class="btn btn-ghost btn-sm" data-remove-avatar>Usar emoji</button>` : ''}</div>
    </div>
    <div class="field"><label>Avatar emoji</label><div class="emoji-picker">${EMOJIS.slice(0, 24).map((e) => html`<button type="button" data-emoji="${e}" class="${e === st.avatarEmoji && !st.avatarUrl ? 'active' : ''}">${e}</button>`)}</div></div>
    <div class="row-wrap" style="gap:12px">
      <div class="field" style="flex:1;min-width:200px"><label for="ep-name">Nombre</label><input class="input" id="ep-name" name="displayName" maxlength="60" value="${u.displayName}"></div>
      <div class="field" style="flex:1;min-width:200px"><label for="ep-user">Usuario</label><input class="input" id="ep-user" name="username" maxlength="24" pattern="[a-zA-Z0-9_.]{3,24}" value="${u.username}"><span class="hint" data-uhint></span></div>
    </div>
    <div class="field"><label for="ep-bio">Bio <span class="dim">(Markdown)</span></label><textarea class="textarea" id="ep-bio" name="bio" maxlength="500" placeholder="Cuéntale al mundo quién eres">${u.bio}</textarea>
      <button type="button" class="btn btn-ghost btn-sm" data-ai-bio style="align-self:flex-start">${icon('sparkles', { size: 14 })} Escribir con Hype IA</button></div>
    <div class="field"><label>Enlaces</label><div class="col" data-links style="gap:8px"></div><button type="button" class="btn btn-ghost btn-sm" data-add-link style="align-self:flex-start">${icon('plus', { size: 14 })} Añadir enlace</button></div>
    <div class="field"><label>Intereses</label><div class="interest-grid">${INTERESTS.map((i) => html`<button type="button" class="chip ${st.interests.includes(i) ? 'active' : ''}" data-interest="${i}">${i}</button>`)}</div></div>
  </form>`);
  const paintLinks = () => {
    $('[data-links]', form).innerHTML = String(html`${st.links.map((l, i) => html`<div class="row" style="gap:6px"><input class="input" data-link-label="${i}" maxlength="30" placeholder="Nombre" value="${l.label}" style="max-width:140px"><input class="input" data-link-url="${i}" maxlength="300" placeholder="https://" value="${l.url}"><button type="button" class="icon-btn sm" data-del-link="${i}" aria-label="Quitar enlace">${icon('x', { size: 14 })}</button></div>`)}`);
    $('[data-add-link]', form).classList.toggle('hidden', st.links.length >= 3);
  };
  paintLinks();
  const footer = toElement(html`<div class="row" style="justify-content:flex-end;width:100%"><button class="btn btn-ghost" data-cancel>Cancelar</button><button class="btn btn-primary" data-save>Guardar</button></div>`);
  const m = openModal({ title: 'Editar perfil', content: form, footer, size: 'lg' });
  const paintAvatar = () => {
    const preview = { ...u, avatarUrl: st.avatarFile ? URL.createObjectURL(st.avatarFile) : st.avatarUrl, avatarEmoji: st.avatarEmoji };
    $('[data-avatar]', form).innerHTML = String(avatar(preview, 'xl'));
  };
  form.addEventListener('click', async (e) => {
    const em = e.target.closest('[data-emoji]');
    if (em) { st.avatarEmoji = em.dataset.emoji; st.avatarUrl = ''; st.avatarFile = null; $$('[data-emoji]', form).forEach((b) => b.classList.toggle('active', b === em)); paintAvatar(); }
    if (e.target.closest('[data-upload-avatar], [data-avatar]')) { const [f] = await pickFiles({ accept: 'image/*' }); if (f) { st.avatarFile = await squareCrop(f, 512); paintAvatar(); } }
    if (e.target.closest('[data-remove-avatar]')) { st.avatarUrl = ''; st.avatarFile = null; paintAvatar(); }
    if (e.target.closest('[data-banner]')) {
      const [f] = await pickFiles({ accept: 'image/*' });
      if (f) { st.bannerFile = (await processImage(f, { hd: false })).file; $('[data-banner]', form).innerHTML = String(html`<img src="${URL.createObjectURL(st.bannerFile)}" alt="">`); }
    }
    const it = e.target.closest('[data-interest]');
    if (it) { it.classList.toggle('active'); st.interests = $$('[data-interest].active', form).map((b) => b.dataset.interest); }
    if (e.target.closest('[data-add-link]')) { st.links.push({ label: '', url: '' }); paintLinks(); }
    const dl = e.target.closest('[data-del-link]');
    if (dl) { st.links.splice(Number(dl.dataset.delLink), 1); paintLinks(); }
    const aiBtn = e.target.closest('[data-ai-bio]');
    if (aiBtn) {
      const { hypeAI, aiStatus } = await import('../ai/gemini.js');
      if (!aiStatus().available) { toast(aiStatus().message); return; }
      setLoading(aiBtn, true);
      try { form.bio.value = (await hypeAI.bio({ ...u, interests: st.interests, bio: form.bio.value })).trim().slice(0, 500); } catch (err) { toastError(err); }
      setLoading(aiBtn, false);
    }
  });
  form.addEventListener('input', (e) => {
    const li = e.target.dataset.linkLabel ?? e.target.dataset.linkUrl;
    if (li !== undefined) { const i = Number(li); if (e.target.dataset.linkLabel !== undefined) st.links[i].label = e.target.value; else st.links[i].url = e.target.value; }
  });
  form.username.addEventListener('input', async () => {
    form.username.value = form.username.value.toLowerCase().replace(/[^a-z0-9_.]/g, '');
    const hint = $('[data-uhint]', form);
    if (form.username.value === u.username) { hint.textContent = ''; return; }
    const ok = await api.isUsernameAvailable(form.username.value).catch(() => true);
    hint.textContent = ok ? '✓ Disponible' : '✗ No disponible';
    hint.style.color = ok ? 'var(--success)' : 'var(--danger)';
  });
  footer.querySelector('[data-cancel]').onclick = () => m.close();
  footer.querySelector('[data-save]').onclick = async (e) => {
    const btn = e.currentTarget;
    setLoading(btn, true);
    try {
      const links = st.links.map((l) => ({ label: l.label.trim().slice(0, 30) || 'Enlace', url: safeUrl(l.url.trim()) })).filter((l) => /^https?:\/\//.test(l.url));
      const updated = await api.updateProfile({
        displayName: form.displayName.value.trim() || u.username, username: form.username.value.trim(), bio: form.bio.value.trim(), links, interests: st.interests,
        avatarEmoji: st.avatarEmoji, ...(st.avatarFile ? { avatarFile: st.avatarFile } : { avatarUrl: st.avatarUrl || '' }), ...(st.bannerFile ? { bannerFile: st.bannerFile } : {}),
      });
      m.close();
      toast('Perfil actualizado ✨', { type: 'success' });
      navigate(`/u/${encodeURIComponent(updated.username)}`, { replace: true });
    } catch (err) { toastError(err); setLoading(btn, false); }
  };
}

async function openFollowList(user, kind) {
  const content = toElement(html`<div class="col" style="margin:-18px"><div class="spinner"></div></div>`);
  openModal({ title: kind === 'followers' ? `Seguidores de @${user.username}` : `@${user.username} sigue a`, content, size: 'sm' });
  try {
    const people = kind === 'followers' ? await api.listFollowers(user.id) : await api.listFollowing(user.id);
    content.innerHTML = people.length ? String(html`${people.map((p) => html`<div class="user-row">${avatar(p, 'md', { link: true })}<a class="meta" href="#/u/${encodeURIComponent(p.username)}"><b>${p.displayName}</b>${verified(p)}<br><span class="dim small">@${p.username}</span></a></div>`)}`) : String(emptyState({ emoji: '👥', title: 'Nadie por aquí todavía' }));
  } catch (err) { content.innerHTML = String(html`<p class="notice danger" style="margin:16px">${err.message}</p>`); }
}

export async function render(el, ctx) {
  el.innerHTML = String(html`<div class="view-header"><button class="icon-btn" data-back aria-label="Volver">${icon('arrowLeft')}</button><h1>Perfil</h1></div><div data-body><div class="spinner"></div></div>`);
  el.querySelector('[data-back]').onclick = () => back();
  let u;
  try { u = await api.getProfile(ctx.params.username); } catch (err) {
    $('[data-body]', el).innerHTML = String(emptyState({ emoji: '🔎', title: `@${ctx.params.username} no existe`, text: 'Quizá cambió su nombre de usuario.', action: html`<a class="btn btn-secondary" href="#/explore">Buscar gente</a>` }));
    return;
  }
  const me = u.isMe || u.id === state.user?.id;
  let tab = ctx.query.tab || 'posts';
  let list = null;
  const [a1, a2] = gradientFor(u.id);
  el.querySelector('.view-header h1').innerHTML = String(html`${u.displayName} <span class="sub" style="font-weight:600">· ${formatCount(u.postsCount)} posts</span>`);
  $('[data-body]', el).innerHTML = String(html`
    <div class="profile-banner" style="--a1:${a1};--a2:${a2}">${u.bannerUrl ? html`<img ${srcAttr(u.bannerUrl)} alt="">` : ''}</div>
    <div class="profile-head">
      <div class="top">${avatar(u, 'xxl')}<div class="row" style="gap:8px">
        ${me ? html`<button class="btn btn-outline" data-edit>${icon('edit', { size: 16 })} Editar perfil</button>` : html`${state.user ? html`<button class="icon-btn" data-call-user title="Videollamada" aria-label="Videollamada" style="border:1px solid var(--border-strong)">${icon('video', { size: 18 })}</button><button class="icon-btn" data-dm title="Mensaje" aria-label="Enviar mensaje" style="border:1px solid var(--border-strong)">${icon('mail', { size: 18 })}</button>` : ''}${followBtn(u, { size: 'md' })}`}
      </div></div>
      <div><h1>${u.displayName}${verified(u)}</h1><div class="row" style="gap:8px"><span class="dim">@${u.username}</span>${u.followsYou ? html`<span class="follows-you">Te sigue</span>` : ''}</div></div>
      ${u.bio ? html`<div class="md">${renderMarkdown(u.bio, { compact: true })}</div>` : me ? html`<button class="btn btn-ghost btn-sm" data-edit style="align-self:flex-start">${icon('plus', { size: 14 })} Añade una bio</button>` : ''}
      <div class="profile-links">
        ${u.links.map((l) => html`<a href="${safeUrl(l.url)}" target="_blank" rel="noopener noreferrer">${icon('link', { size: 14 })} ${l.label}</a>`)}
        <span>${icon('calendar', { size: 14 })} Se unió en ${formatDate(u.createdAt, { month: 'long', year: 'numeric' })}</span>
      </div>
      ${u.interests.length ? html`<div class="row-wrap">${u.interests.map((i) => html`<a class="pill" href="#/explore?tag=${encodeURIComponent(i)}">#${i}</a>`)}</div>` : ''}
      <div class="profile-stats">
        <button data-list="following"><b>${formatCount(u.following)}</b> siguiendo</button>
        <button data-list="followers"><b data-followers>${formatCount(u.followers)}</b> seguidores</button>
        <span>🔥 <b>${formatCount(u.hypeReceived)}</b> hype recibido</span>
      </div>
    </div>
    <div class="tabs">${[['posts', 'Posts'], ['shorts', 'Shorts'], ['proyectos', 'Proyectos'], ['juegos', 'Juegos'], ...(me ? [['hype', '🔥 Hype dado']] : [])].map(([k, l]) => html`<button class="tab ${tab === k ? 'active' : ''}" data-tab="${k}">${l}</button>`)}</div>
    <div data-tabbody></div>`);

  const paintTab = async () => {
    list?.destroy();
    list = null;
    const body = $('[data-tabbody]', el);
    body.innerHTML = '';
    if (tab === 'posts' || tab === 'hype') {
      list = createInfiniteList({
        container: body,
        load: (offset, limit) => (tab === 'hype' ? api.hypedPosts(u.id, { offset, limit }) : api.feed({ tab: 'recent', authorId: u.id, offset, limit })),
        render: (p) => renderPost(p),
        empty: emptyState({ emoji: tab === 'hype' ? '🔥' : '📝', title: tab === 'hype' ? 'Aún no has dado hype' : me ? 'Aún no publicas nada' : 'Sin posts todavía', text: me && tab === 'posts' ? 'Tu primer post está a un clic.' : '' }),
        end: endOfFeed('No hay más posts.'),
        afterRender: (root) => hydratePosts(root),
      });
      list.next();
    } else if (tab === 'shorts') {
      body.innerHTML = '<div class="spinner"></div>';
      const { items } = await api.shorts({ authorId: u.id, limit: 30 }).catch(() => ({ items: [] }));
      body.innerHTML = items.length ? String(html`<div class="shorts-grid">${items.map((p) => html`<a href="#/shorts?id=${p.id}"><video ${srcAttr(p.media[0]?.url)} ${srcAttr(p.media[0]?.poster, 'poster')} class="${filterClass(p.media[0]?.filter)}" muted preload="metadata" playsinline></video><span class="views">🔥 ${formatCount(p.hypeCount)}</span></a>`)}</div>`) : String(emptyState({ emoji: '🎬', title: 'Sin shorts todavía' }));
    } else if (tab === 'proyectos') {
      body.innerHTML = '<div class="spinner"></div>';
      const { items } = await api.listProjects({ ownerId: u.id, sort: 'new', limit: 50 }).catch(() => ({ items: [] }));
      body.innerHTML = items.length ? String(html`${items.map((p) => html`<a class="project-row" href="#/p/${p.id}">${coverBox(p)}<span class="meta"><h3>${p.name}</h3><span class="tagline">${p.tagline}</span><span class="row" style="gap:6px">${stagePill(p.stage)}<span class="tiny dim">🔥 ${formatCount(p.hypeCount)}</span></span></span></a>`)}`) : String(emptyState({ emoji: '🚀', title: 'Sin proyectos todavía', action: me ? html`<a class="btn btn-primary" href="#/proyectos">Subir proyecto</a>` : '' }));
    } else if (tab === 'juegos') {
      const best = await api.userBestScores(u.id).catch(() => ({}));
      body.innerHTML = String(html`<div class="view-body"><div class="games-grid">${GAMES.map((g) => html`<a class="game-card" href="#/juegos/${g.id}" style="--c1:${g.colors[0]};--c2:${g.colors[1]};min-height:150px"><span class="game-emoji" style="font-size:40px">${g.emoji}</span><h3>${g.title}</h3><span class="best">${best[g.id] ? html`🏆 ${formatNumber(best[g.id])} ${g.unit}` : 'Sin partidas'}</span></a>`)}</div></div>`);
    }
  };

  el.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-tab]');
    if (t) { tab = t.dataset.tab; $$('[data-tab]', el).forEach((b) => b.classList.toggle('active', b === t)); paintTab(); return; }
    if (e.target.closest('[data-edit]')) { openEditProfile(); return; }
    const l = e.target.closest('[data-list]');
    if (l) { openFollowList(u, l.dataset.list); return; }
    if (e.target.closest('[data-call-user]')) {
      try {
        const cid = await api.openConversation(u.id);
        const { startCall } = await import('../calls/ui.js');
        startCall(u, { conversationId: cid, kind: 'video' });
      } catch (err) { toastError(err); }
      return;
    }
    if (e.target.closest('[data-dm]')) {
      try { const cid = await api.openConversation(u.id); navigate(`/mensajes/${cid}`); } catch (err) { toastError(err); }
    }
  });
  const off = bus.on('follow:change', ({ userId, following }) => {
    if (userId !== u.id) return;
    u.followers += following ? 1 : -1;
    const f = $('[data-followers]', el);
    if (f) f.textContent = formatCount(u.followers);
  });
  paintTab();
  return () => { off(); list?.destroy(); };
}
