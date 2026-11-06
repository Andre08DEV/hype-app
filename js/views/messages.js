// Mensajes privados (1 a 1) con tiempo real.
import { html, toElement, $ } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { state, bus } from '../core/store.js';
import { api } from '../data/api.js';
import { renderMarkdown } from '../core/markdown.js';
import { timeAgo, formatDateTime, debounce } from '../core/utils.js';
import { emptyState, toastError, openModal } from '../core/ui.js';
import { navigate, back } from '../core/router.js';
import { avatar, verified } from '../components/common.js';

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
  return html`<div class="bubble-row ${mine ? 'me' : ''}" data-msg="${m.id}"><div><div class="msg-bubble md">${renderMarkdown(m.body, { compact: true })}</div><div class="msg-time" title="${formatDateTime(m.createdAt)}">${timeAgo(m.createdAt)}</div></div></div>`;
}

async function renderChat(el, id) {
  el.innerHTML = String(html`<div class="dm-layout"><div class="view-header"><button class="icon-btn" data-back aria-label="Volver">${icon('arrowLeft')}</button><span data-head class="row" style="gap:10px;min-width:0"><b>Chat</b></span></div>
    <div class="dm-list" data-msgs><div class="spinner"></div></div>
    <form class="dm-input" data-form><textarea class="textarea" name="body" rows="1" maxlength="4000" placeholder="Escribe un mensaje…" aria-label="Mensaje"></textarea><button class="btn btn-primary" type="submit" aria-label="Enviar">${icon('send', { size: 18 })}</button></form></div>`);
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
    box.appendChild(toElement(bubble(m, m.senderId === state.user?.id)));
    scroll();
  };
  try {
    const msgs = await api.listMessages(id);
    box.innerHTML = msgs.length ? '' : String(emptyState({ emoji: '👋', title: 'Saluda', text: `Envía el primer mensaje a @${conv.other?.username}.` }));
    msgs.forEach(add);
    api.markConversationRead(id).catch(() => {});
  } catch (err) { box.innerHTML = String(html`<div class="notice danger">${err.message}</div>`); }

  const form = $('[data-form]', el);
  const ta = form.body;
  ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 140) + 'px'; });
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && state.settings.enterToSend) { e.preventDefault(); form.requestSubmit(); }
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = ta.value.trim();
    if (!text) return;
    ta.value = '';
    ta.style.height = '';
    try { add(await api.sendMessage(id, text)); } catch (err) { toastError(err); ta.value = text; }
  });
  setTimeout(() => ta.focus(), 50);

  const offs = [
    bus.on('message', ({ conversationId, message }) => { if (conversationId === id) { add(message); api.markConversationRead(id).catch(() => {}); } }),
    bus.on('typing', ({ conversationId, typing }) => {
      if (conversationId !== id) return;
      box.querySelector('[data-typing]')?.remove();
      if (typing) { box.appendChild(toElement(html`<div class="bubble-row" data-typing><div class="msg-bubble"><span class="typing-dots"><i></i><i></i><i></i></span></div></div>`)); scroll(); }
    }),
  ];
  return () => offs.forEach((o) => o());
}

export function render(el, ctx) {
  if (!state.user) { navigate('/bienvenida', { replace: true }); return null; }
  return ctx.params.id ? renderChat(el, ctx.params.id) : renderList(el);
}
