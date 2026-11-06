// Hype IA: chat con Gemini (streaming), historial local, imágenes y atajos a publicar.
import { html, toElement, $, autoGrow } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { state, updateSettings } from '../core/store.js';
import { api } from '../data/api.js';
import { renderMarkdown } from '../core/markdown.js';
import { copyText, uuid, pickFiles, excerpt } from '../core/utils.js';
import { toast, toastError, openMenu, confirmDialog } from '../core/ui.js';
import { hypeAI, aiStatus, currentModel, imageToInline, testAIKey } from '../ai/gemini.js';
import { openComposer, splitIntoThread } from '../components/composer.js';
import { avatar } from '../components/common.js';

const KEY = 'hype:ai:chats';
const loadChats = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
const saveChats = (chats) => { try { localStorage.setItem(KEY, JSON.stringify(chats.slice(0, 30))); } catch { /* cuota */ } };

const SUGGESTIONS = [
  { t: '💡 Ideas para mi próximo post', p: 'Dame 5 ideas de posts para hoy según mis intereses, con un primer párrafo listo para copiar.' },
  { t: '🧵 Escríbeme un hilo', p: 'Escribe un hilo de 5 posts (cada uno de menos de 400 caracteres) explicando de forma sencilla qué es la IA generativa y cómo usarla para crear contenido.' },
  { t: '📊 Una encuesta que enganche', p: 'Propón 3 encuestas divertidas para una red social de creadores, cada una con 4 opciones con emoji.' },
  { t: '🚀 Pitch de proyecto', p: 'Ayúdame a escribir el pitch de un proyecto: una app que conecta a gente que quiere aprender a programar con mentores voluntarios. Dame nombre, eslogan y descripción.' },
  { t: '💻 Explícame un código', p: 'Explícame paso a paso qué hace este código y cómo mejorarlo:\n\n```js\nconst unique = [...new Set(items.map(i => i.id))];\n```' },
  { t: '🔥 ¿Qué me perdí hoy?', p: '__catchup__' },
];

export function render(el) {
  let chats = loadChats();
  let chat = chats[0] && !chats[0].messages.length ? chats[0] : null;
  let busy = false, ctrl = null, attachment = null;

  el.innerHTML = String(html`<div class="ai-layout">
    <div class="view-header"><h1>${icon('sparkles', { size: 20 })} Hype IA</h1><span class="pill accent" data-model></span><span class="spacer"></span>
      <button class="icon-btn" data-history title="Historial" aria-label="Historial">${icon('clock')}</button>
      <button class="btn btn-secondary btn-sm" data-new>${icon('plus', { size: 16 })} Nuevo chat</button></div>
    <div class="ai-thread" data-thread></div>
    <div class="ai-input">
      <div class="attach-preview" data-attach></div>
      <form class="box" data-form>
        <button type="button" class="icon-btn sm" data-image title="Adjuntar imagen" aria-label="Adjuntar imagen">${icon('image', { size: 19 })}</button>
        <textarea rows="1" name="q" placeholder="Pregúntale a Hype IA… (Shift+Enter = salto de línea)" aria-label="Mensaje para Hype IA"></textarea>
        <button type="submit" class="btn btn-primary btn-sm" data-send aria-label="Enviar">${icon('send', { size: 16 })}</button>
      </form>
      <p class="tiny dim" style="text-align:center;margin-top:6px">Hype IA usa Gemini y puede equivocarse. Revisa la información importante.</p>
    </div>
  </div>`);
  const thread = $('[data-thread]', el);
  const form = $('[data-form]', el);
  const ta = form.q;
  $('[data-model]', el).textContent = currentModel();

  const setupCard = () => {
    const st = aiStatus();
    if (st.available) return '';
    return html`<div class="card card-pad col" style="max-width:560px;width:100%;text-align:left">
      <div class="card-title">${icon('key', { size: 18 })} Activa Hype IA</div>
      ${st.reason === 'disabled' ? html`<p class="small muted">Hype IA está desactivada.</p><button class="btn btn-primary btn-sm" data-enable>Activar</button>`
        : html`<p class="small muted">${api.mode === 'cloud' ? 'En la nube, Hype IA usa la Edge Function «hype-ai» de tu proyecto (la key queda en el servidor). Inicia sesión o, si prefieres, usa tu propia key:' : 'Pega tu API key de Gemini. Se guarda solo en este navegador. Puedes crear una gratis en Google AI Studio.'}</p>
        <form class="row" data-keyform><input class="input" name="key" type="password" placeholder="AIza…" autocomplete="off" aria-label="API key de Gemini"><button class="btn btn-primary" type="submit">Guardar</button></form>
        <a class="small" href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" style="color:var(--accent-text);font-weight:700">Conseguir una API key gratis →</a>`}
    </div>`;
  };

  const msgHtml = (m) => {
    if (m.role === 'user') return html`<div class="ai-msg user">${avatar(state.user || { username: 'tú' }, 'sm')}<div class="content">${m.image ? html`<img src="data:${m.image.mimeType};base64,${m.image.data}" alt="Imagen adjunta" style="max-width:220px;border-radius:12px;margin-bottom:8px">` : ''}<div class="md">${renderMarkdown(m.text, { compact: true, mentions: false })}</div></div></div>`;
    return html`<div class="ai-msg" data-msg="${m.id}"><span class="ai-avatar">${icon('sparkles', { size: 18 })}</span><div class="content">
      <div class="md ${m.streaming ? 'cursor-blink' : ''}" data-body>${m.error ? html`<div class="notice danger">${icon('alert')}<span>${m.text}</span></div>` : m.text ? renderMarkdown(m.text, { mentions: false }) : html`<p class="dim">Pensando…</p>`}</div>
      ${!m.streaming && !m.error && m.text ? html`<div class="tools">
        <button class="btn btn-ghost btn-sm" data-copy="${m.id}">${icon('copy', { size: 14 })} Copiar</button>
        <button class="btn btn-ghost btn-sm" data-post="${m.id}">${icon('edit', { size: 14 })} Publicar como post</button>
        <button class="btn btn-ghost btn-sm" data-thread-it="${m.id}">${icon('thread', { size: 14 })} Convertir en hilo</button>
      </div>` : ''}
    </div></div>`;
  };

  const paint = () => {
    if (!chat || !chat.messages.length) {
      thread.innerHTML = String(html`<div class="ai-hero">
        <div class="ai-orb">${icon('sparkles', { size: 40 })}</div>
        <h2 style="font-size:1.5rem;font-weight:900">Hola${state.user ? `, ${state.user.displayName.split(' ')[0]}` : ''} 👋 Soy Hype IA</h2>
        <p class="muted" style="max-width:460px">Tu copiloto creativo: escribo hilos, mejoro posts, creo encuestas, explico código y te doy feedback de proyectos.</p>
        ${setupCard()}
        <div class="ai-suggestions">${SUGGESTIONS.map((s, i) => html`<button class="ai-suggestion" data-sug="${i}"><b>${s.t}</b>${s.p === '__catchup__' ? 'Resumen de lo más hypeado del momento' : excerpt(s.p, 70)}</button>`)}</div>
      </div>`);
      return;
    }
    thread.innerHTML = String(html`${chat.messages.map(msgHtml)}`);
    thread.scrollTop = thread.scrollHeight;
  };

  const persist = () => {
    if (!chat) return;
    chat.updatedAt = Date.now();
    chats = [chat, ...chats.filter((c) => c.id !== chat.id)];
    saveChats(chats);
  };

  const ask = async (text, image = null) => {
    if (busy) return;
    const st = aiStatus();
    if (!st.available) { paint(); toast(st.message); return; }
    if (!chat) chat = { id: uuid(), title: excerpt(text, 48), messages: [], createdAt: Date.now() };
    chat.messages.push({ id: uuid(), role: 'user', text, image });
    const reply = { id: uuid(), role: 'model', text: '', streaming: true };
    chat.messages.push(reply);
    paint();
    busy = true;
    $('[data-send]', el).innerHTML = String(icon('stop', { size: 16 }));
    ctrl = new AbortController();
    const bodyEl = () => thread.querySelector(`[data-msg="${CSS.escape(reply.id)}"] [data-body]`);
    try {
      let catchupPosts = null;
      if (text === SUGGESTIONS[5].p || /qu[eé] me perd[ií]/i.test(text)) {
        catchupPosts = (await api.feed({ tab: 'top', period: 'week', limit: 12 })).items;
      }
      const onToken = (full) => { reply.text = full; const b = bodyEl(); if (b) { b.innerHTML = String(renderMarkdown(full, { mentions: false })); thread.scrollTop = thread.scrollHeight; } };
      if (catchupPosts) await hypeAI.catchUp(catchupPosts, { onToken, signal: ctrl.signal });
      else {
        const history = chat.messages.filter((m) => m !== reply && !m.error).slice(-16).map((m) => ({ role: m.role, text: m.text, images: m.image ? [m.image] : [] }));
        await hypeAI.chat(history, { onToken, signal: ctrl.signal });
      }
    } catch (err) {
      if (err.name !== 'AbortError') { reply.error = true; reply.text = err.message; }
    }
    reply.streaming = false;
    if (!reply.text) { reply.text = 'Respuesta cancelada.'; reply.error = true; }
    busy = false;
    $('[data-send]', el).innerHTML = String(icon('send', { size: 16 }));
    persist();
    paint();
  };

  const send = () => {
    if (busy) { ctrl?.abort(); return; }
    const text = ta.value.trim();
    if (!text && !attachment) return;
    const img = attachment;
    ta.value = '';
    autoGrow(ta, 180);
    attachment = null;
    $('[data-attach]', el).innerHTML = '';
    ask(text || '¿Qué ves en esta imagen?', img);
  };

  form.addEventListener('submit', (e) => { e.preventDefault(); send(); });
  ta.addEventListener('input', () => autoGrow(ta, 180));
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });

  el.addEventListener('submit', async (e) => {
    if (!e.target.matches('[data-keyform]')) return;
    e.preventDefault();
    const key = e.target.key.value.trim();
    if (!key) return;
    updateSettings({ ai: { apiKey: key, enabled: true } });
    const btn = e.target.querySelector('button');
    btn.classList.add('loading');
    try { await testAIKey(); toast('¡Hype IA lista! ✨', { type: 'success' }); } catch (err) { toastError(err); }
    btn.classList.remove('loading');
    paint();
  });

  el.addEventListener('click', async (e) => {
    const t = e.target;
    const sug = t.closest('[data-sug]');
    if (sug) { ask(SUGGESTIONS[Number(sug.dataset.sug)].p === '__catchup__' ? '¿Qué me perdí hoy en Hype?' : SUGGESTIONS[Number(sug.dataset.sug)].p); return; }
    if (t.closest('[data-enable]')) { updateSettings({ ai: { enabled: true } }); paint(); return; }
    if (t.closest('[data-new]')) { if (busy) ctrl?.abort(); chat = null; paint(); ta.focus(); return; }
    if (t.closest('[data-image]')) {
      const [file] = await pickFiles({ accept: 'image/*' });
      if (!file) return;
      try {
        attachment = await imageToInline(file);
        $('[data-attach]', el).innerHTML = String(html`<img src="data:${attachment.mimeType};base64,${attachment.data}" alt="Adjunto"><button class="icon-btn sm" data-unattach aria-label="Quitar">${icon('x', { size: 14 })}</button>`);
      } catch (err) { toastError(err); }
      return;
    }
    if (t.closest('[data-unattach]')) { attachment = null; $('[data-attach]', el).innerHTML = ''; return; }
    const findMsg = (id) => chat?.messages.find((m) => m.id === id);
    const cp = t.closest('[data-copy]');
    if (cp) { if (await copyText(findMsg(cp.dataset.copy)?.text || '')) toast('Copiado', { type: 'success' }); return; }
    const po = t.closest('[data-post]');
    if (po) { openComposer({ text: findMsg(po.dataset.post)?.text.slice(0, 1000) }); return; }
    const th = t.closest('[data-thread-it]');
    if (th) { const parts = splitIntoThread(findMsg(th.dataset.threadIt)?.text || ''); openComposer({ parts: parts.length ? parts : [''] }); return; }
    const hist = t.closest('[data-history]');
    if (hist) {
      const items = chats.filter((c) => c.messages.length).slice(0, 12);
      openMenu(hist, [
        { header: 'Chats recientes' },
        ...(items.length ? items.map((c) => ({ label: c.title || 'Chat', icon: 'message', checked: chat?.id === c.id, onClick: () => { chat = c; paint(); } })) : [{ label: 'Sin historial', disabled: true }]),
        { divider: true },
        { label: 'Borrar historial', icon: 'trash', danger: true, onClick: async () => { if (await confirmDialog({ title: 'Borrar historial de Hype IA', message: 'Se borrarán todos los chats guardados en este navegador.', confirmText: 'Borrar', danger: true })) { chats = []; saveChats(chats); chat = null; paint(); } } },
      ]);
    }
  });

  paint();
  if (aiStatus().available) setTimeout(() => ta.focus(), 50);
  return () => ctrl?.abort();
}

