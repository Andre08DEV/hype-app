// Mensajes privados (1 a 1) con tiempo real.
import { html, toElement, $ } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { state, bus } from '../core/store.js';
import { api } from '../data/api.js';
import { renderMarkdown } from '../core/markdown.js';
import { timeAgo, formatDateTime, debounce, pickFiles, formatDuration } from '../core/utils.js';
import { emptyState, toastError, openModal, openMenu, toast } from '../core/ui.js';
import { navigate, back } from '../core/router.js';
import { avatar, verified } from '../components/common.js';
import { processImage } from '../components/media.js';
import { openGifPicker } from '../components/pickers.js';
import { renderDmMedia, resolveDmPaths, bindDmMedia, canRecordVoice, startVoiceRecording, micErrorMessage, MAX_VOICE_SEC } from '../components/dm-media.js';

const DM_IMAGE_MAX_MB = 15;

function openNewMessage() {
  const content = toElement(html`<div class="col">
    <div class="input-group">${icon('search', { size: 18 })}<input class="input search-input" data-q placeholder="Buscar personas…" autofocus></div>
    <div data-res style="margin:0 -18px"></div></div>`);
  const m = openModal({ title: 'Nuevo mensaje', content, size: 'sm' });
  const res = $('[data-res]', content);
  const search = debounce(async (q) => {
    const people = (await api.searchProfiles(q, 12).catch(() => [])).filter((p) => p.id !== state.user?.id);
    res.innerHTML = String(html`${people.map((p) => html`<button class="user-row" data-user="${p.id}" style="width:100%;text-align:left">${avatar(p, 'md')}<span class="meta"><b>${p.displayName}</b>${verified(p)}<br><span class="dim small">@${p.username}</span></span></button>`)}`);
  }, 250);
  search('');
  $('[data-q]', content).addEventListener('input', (e) => search(e.target.value.trim()));
  res.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-user]');
    if (!b) return;
    try { const cid = await api.openConversation(b.dataset.user); m.close(); navigate(`/mensajes/${cid}`); } catch (err) { toastError(err); }
  });
}

async function renderList(el) {
  el.innerHTML = String(html`<div class="view-header"><h1>Mensajes</h1><span class="spacer"></span><button class="btn btn-primary btn-sm" data-new>${icon('edit', { size: 16 })} Nuevo</button></div><div data-list><div class="spinner"></div></div>`);
  const box = $('[data-list]', el);
  const load = async () => {
    try {
      const convs = await api.listConversations();
      box.innerHTML = convs.length ? String(html`${convs.map((c) => html`<a class="user-row" href="#/mensajes/${c.id}" style="${c.unread ? 'background:var(--accent-softer)' : ''}">
        ${avatar(c.other, 'lg')}<span class="meta"><span class="row" style="gap:6px"><b>${c.other?.displayName}</b><span class="dim small">@${c.other?.username}</span><span class="spacer"></span><span class="tiny dim">${c.lastMessageAt ? timeAgo(c.lastMessageAt) : ''}</span></span>
        <div class="bio" style="${c.unread ? 'color:var(--text);font-weight:700' : ''}">${c.lastMessage || 'Nueva conversación'}</div></span>${c.unread ? html`<span class="status-dot ok"></span>` : ''}</a>`)}`)
        : String(emptyState({ emoji: '💬', title: 'Tu bandeja está vacía', text: 'Escribe a alguien desde su perfil o con «Nuevo».', action: html`<button class="btn btn-primary" data-new>Nuevo mensaje</button>` }));
    } catch (err) { box.innerHTML = String(html`<div class="notice danger" style="margin:16px">${err.message}</div>`); }
  };
  el.addEventListener('click', (e) => { if (e.target.closest('[data-new]')) openNewMessage(); });
  const off = bus.on('message', load);
  load();
  return off;
}

function bubble(m, mine) {
  const media = m.media?.type ? m.media : null;
  return html`<div class="bubble-row ${mine ? 'me' : ''}" data-msg="${m.id}"><div>
    ${media ? html`<div class="msg-bubble media ${media.type}">${renderDmMedia(media, m.id)}</div>` : ''}
    ${m.body ? html`<div class="msg-bubble md">${renderMarkdown(m.body, { compact: true })}</div>` : ''}
    <div class="msg-time" title="${formatDateTime(m.createdAt)}">${timeAgo(m.createdAt)}</div></div></div>`;
}

const pendingBubble = (label) => html`<div class="bubble-row me pending" data-pending><div><div class="msg-bubble"><span class="row small" style="gap:8px"><span class="spinner sm"></span>${label}</span><span class="upload-bar"><span data-progress></span></span></div></div></div>`;

async function renderChat(el, id) {
  el.innerHTML = String(html`<div class="dm-layout"><div class="view-header"><button class="icon-btn" data-back aria-label="Volver">${icon('arrowLeft')}</button><span data-head class="row" style="gap:10px;min-width:0"><b>Chat</b></span><span class="spacer"></span>
      <button class="icon-btn" data-call="audio" title="Llamada de voz" aria-label="Llamada de voz">${icon('phone')}</button>
      <button class="icon-btn" data-call="video" title="Videollamada" aria-label="Videollamada">${icon('video')}</button></div>
    <div class="dm-list" data-msgs><div class="spinner"></div></div>
    <form class="dm-input" data-form>
      <button type="button" class="icon-btn" data-attach title="Adjuntar foto o GIF" aria-label="Adjuntar foto o GIF">${icon('paperclip', { size: 20 })}</button>
      <textarea class="textarea" name="body" rows="1" maxlength="4000" placeholder="Escribe un mensaje…" aria-label="Mensaje"></textarea>
      <button type="button" class="btn btn-secondary dm-mic" data-mic title="Grabar nota de voz" aria-label="Grabar nota de voz">${icon('mic', { size: 18 })}</button>
      <button class="btn btn-primary dm-send" type="submit" aria-label="Enviar">${icon('send', { size: 18 })}</button>
      <div class="dm-rec hidden" data-rec role="group" aria-label="Grabando nota de voz">
        <button type="button" class="icon-btn" data-rec-cancel title="Descartar" aria-label="Descartar nota de voz">${icon('trash', { size: 19 })}</button>
        <span class="rec-dot" aria-hidden="true"></span><span class="rec-time" data-rec-time>0:00</span>
        <div class="rec-wave" data-rec-wave aria-hidden="true"></div>
        <span class="tiny dim rec-max">máx. ${formatDuration(MAX_VOICE_SEC)}</span>
        <button type="button" class="btn btn-primary" data-rec-send aria-label="Enviar nota de voz">${icon('send', { size: 18 })}</button>
      </div>
    </form></div>`);
  el.querySelector('[data-back]').onclick = () => back('/mensajes');
  let conv;
  try { conv = await api.getConversation(id); } catch (err) { $('[data-msgs]', el).innerHTML = String(emptyState({ emoji: '🫥', title: 'Conversación no encontrada', text: err.message })); return; }
  $('[data-head]', el).innerHTML = String(html`<a href="#/u/${encodeURIComponent(conv.other?.username || '')}" class="row" style="gap:10px">${avatar(conv.other, 'sm')}<span style="line-height:1.2"><b>${conv.other?.displayName}</b>${verified(conv.other)}<br><span class="tiny dim">@${conv.other?.username}</span></span></a>`);
  const box = $('[data-msgs]', el);
  const seen = new Set();
  const scroll = () => { box.scrollTop = box.scrollHeight; };
  const add = (m) => {
    if (seen.has(m.id)) return;
    seen.add(m.id);
    box.querySelector('[data-typing]')?.remove();
    box.querySelector('.empty')?.remove();
    const row = toElement(bubble(m, m.senderId === state.user?.id));
    const pending = box.querySelector('[data-pending]');
    if (pending && m.senderId !== state.user?.id) box.insertBefore(row, pending); else box.appendChild(row);
    if (m.media?.path) resolveDmPaths(row);
    // Las fotos cambian de alto al cargar: volvemos a bajar al final
    row.querySelectorAll('img').forEach((img) => img.addEventListener('load', scroll, { once: true }));
    scroll();
  };
  bindDmMedia(box);
  try {
    const msgs = await api.listMessages(id);
    box.innerHTML = msgs.length ? '' : String(emptyState({ emoji: '👋', title: 'Saluda', text: `Envía el primer mensaje a @${conv.other?.username}.` }));
    msgs.forEach(add);
    api.markConversationRead(id).catch(() => {});
  } catch (err) { box.innerHTML = String(html`<div class="notice danger">${err.message}</div>`); }

  const form = $('[data-form]', el);
  const ta = form.body;
  const syncButtons = () => form.classList.toggle('has-text', !!ta.value.trim() || !canRecordVoice());
  ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 140) + 'px'; syncButtons(); });
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && state.settings.enterToSend) { e.preventDefault(); form.requestSubmit(); }
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = ta.value.trim();
    if (!text) return;
    ta.value = '';
    ta.style.height = '';
    syncButtons();
    try { add(await api.sendMessage(id, text)); } catch (err) { toastError(err); ta.value = text; syncButtons(); }
  });
  syncButtons();
  setTimeout(() => ta.focus(), 50);

  // ---------- Adjuntos ----------
  /** Sube (si hace falta) y envía un adjunto mostrando una burbuja de "enviando". */
  const sendMedia = async (label, makeMedia) => {
    const tmp = toElement(pendingBubble(label));
    box.querySelector('.empty')?.remove();
    box.appendChild(tmp);
    scroll();
    const bar = tmp.querySelector('[data-progress]');
    try {
      const media = await makeMedia((p) => { if (bar) bar.style.width = Math.round(p * 100) + '%'; });
      const msg = await api.sendMessage(id, '', media);
      tmp.remove();
      add(msg);
    } catch (err) { tmp.remove(); toastError(err); }
  };
  const upload = async (blob, onProgress) => api.uploadDmMedia(id, blob, { onProgress });

  const sendPhoto = async () => {
    const [file] = await pickFiles({ accept: 'image/*' });
    if (!file) return;
    if (!file.type.startsWith('image/')) { toastError(new Error('Elige una imagen')); return; }
    if (file.size > DM_IMAGE_MAX_MB * 1024 * 1024) { toastError(new Error(`La imagen supera ${DM_IMAGE_MAX_MB} MB`)); return; }
    sendMedia('Enviando foto…', async (onProgress) => {
      const img = await processImage(file, { hd: false });
      const ref = await upload(img.file, onProgress);
      return { type: file.type === 'image/gif' ? 'gif' : 'image', ...ref, width: img.width, height: img.height };
    });
  };
  const sendGif = async () => {
    const gif = await openGifPicker();
    if (!gif) return;
    sendMedia('Enviando GIF…', async (onProgress) => {
      if (gif.file) {
        const img = await processImage(gif.file);
        return { type: 'gif', ...(await upload(gif.file, onProgress)), width: img.width, height: img.height };
      }
      return { type: 'gif', url: gif.url, alt: gif.alt || 'GIF', width: gif.width || 0, height: gif.height || 0 };
    });
  };
  $('[data-attach]', form).addEventListener('click', (e) => {
    openMenu(e.currentTarget, [
      { label: 'Foto', icon: 'image', onClick: sendPhoto },
      { label: 'GIF', icon: 'film', onClick: sendGif },
    ], { align: 'left' });
  });

  // ---------- Notas de voz ----------
  const recBox = $('[data-rec]', form);
  const recWave = $('[data-rec-wave]', form);
  let rec = null;
  const endRecUI = () => { form.classList.remove('recording'); recBox.classList.add('hidden'); recWave.innerHTML = ''; rec = null; };
  const finishRecording = async () => {
    if (!rec) return;
    const r = rec;
    rec = null;
    const result = await r.stop();
    endRecUI();
    if (!result || result.duration < 0.8 || !result.blob.size) { toast('Nota de voz demasiado corta 🎤'); return; }
    sendMedia('Enviando nota de voz…', async (onProgress) => ({ type: 'audio', ...(await upload(result.blob, onProgress)), duration: result.duration, wave: result.wave }));
  };
  $('[data-mic]', form).addEventListener('click', async () => {
    if (rec) return;
    if (!canRecordVoice()) { toast('Tu navegador no permite grabar audio'); return; }
    if (document.body.classList.contains('call-open')) { toast('Termina la llamada para grabar una nota de voz'); return; }
    try {
      form.classList.add('recording');
      recBox.classList.remove('hidden');
      $('[data-rec-time]', form).textContent = '0:00';
      rec = await startVoiceRecording({
        onTick: (sec, level) => {
          $('[data-rec-time]', form).textContent = formatDuration(sec);
          const bar = document.createElement('i');
          bar.style.height = `${Math.max(10, Math.round(level * 100))}%`;
          recWave.appendChild(bar);
          while (recWave.childElementCount > 60) recWave.firstElementChild.remove();
        },
        onLimit: () => finishRecording(),
      });
    } catch (err) {
      endRecUI();
      toastError(new Error(micErrorMessage(err)));
    }
  });
  $('[data-rec-send]', form).addEventListener('click', finishRecording);
  $('[data-rec-cancel]', form).addEventListener('click', () => { rec?.cancel(); endRecUI(); toast('Nota de voz descartada'); });
  el.querySelectorAll('[data-call]').forEach((b) => b.addEventListener('click', async () => {
    const { startCall } = await import('../calls/ui.js');
    startCall(conv.other, { conversationId: id, kind: b.dataset.call });
  }));

  const offs = [
    bus.on('message', ({ conversationId, message }) => { if (conversationId === id) { add(message); api.markConversationRead(id).catch(() => {}); } }),
    bus.on('typing', ({ conversationId, typing }) => {
      if (conversationId !== id) return;
      box.querySelector('[data-typing]')?.remove();
      if (typing) { box.appendChild(toElement(html`<div class="bubble-row" data-typing><div class="msg-bubble"><span class="typing-dots"><i></i><i></i><i></i></span></div></div>`)); scroll(); }
    }),
  ];
  return () => { offs.forEach((o) => o()); rec?.cancel(); box.querySelectorAll('audio').forEach((a) => a.pause()); };
}

export function render(el, ctx) {
  if (!state.user) { navigate('/bienvenida', { replace: true }); return null; }
  return ctx.params.id ? renderChat(el, ctx.params.id) : renderList(el);
}
