// Editor Markdown con barra de herramientas, atajos y vista previa.
import { html, toElement, autoGrow, esc } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { renderMarkdown } from '../core/markdown.js';
import { debounce } from '../core/utils.js';
import { avatar } from './common.js';

const TOOLS = [
  { id: 'bold', icon: 'bold', title: 'Negrita (Ctrl+B)' },
  { id: 'italic', icon: 'italic', title: 'Cursiva (Ctrl+I)' },
  { id: 'strike', icon: 'strike', title: 'Tachado' },
  { id: 'code', icon: 'code', title: 'Código en línea (Ctrl+E)' },
  { id: 'codeblock', icon: 'codeBlock', title: 'Bloque de código' },
  { sep: true },
  { id: 'link', icon: 'link', title: 'Enlace (Ctrl+K)' },
  { id: 'quote', icon: 'quote', title: 'Cita' },
  { id: 'ul', icon: 'list', title: 'Lista' },
  { id: 'ol', icon: 'listOrdered', title: 'Lista numerada' },
  { id: 'heading', icon: 'heading', title: 'Título' },
  { id: 'spoiler', icon: 'eyeOff', title: 'Spoiler ||texto||' },
];

/**
 * createEditor({ value, placeholder, borderless, rows, maxHeight, onChange, onSubmit, mentionSearch })
 * → { el, textarea, value, setValue, focus, insert, destroy }
 */
export function createEditor({ value = '', placeholder = '¿Qué está pasando?', borderless = false, rows = 3, maxHeight = 420, onChange, onSubmit, mentionSearch = null, toolbar = true, label = 'Texto del post' } = {}) {
  const el = toElement(html`<div class="md-editor ${borderless ? 'borderless' : ''}">
    ${toolbar ? html`<div class="md-toolbar" role="toolbar" aria-label="Formato">
      ${TOOLS.map((t) => (t.sep ? html`<span class="sep"></span>` : html`<button type="button" data-tool="${t.id}" title="${t.title}" aria-label="${t.title}">${icon(t.icon, { size: 17 })}</button>`))}
      <div class="mode" role="tablist"><button type="button" class="active" data-mode="write">Escribir</button><button type="button" data-mode="preview">Vista previa</button></div>
    </div>` : ''}
    <textarea rows="${rows}" placeholder="${placeholder}" aria-label="${label}" spellcheck="true"></textarea>
    <div class="md-preview md hidden"></div>
  </div>`);
  const ta = el.querySelector('textarea');
  const preview = el.querySelector('.md-preview');
  ta.value = value;
  const grow = () => autoGrow(ta, maxHeight);
  const changed = () => { grow(); onChange?.(ta.value); };

  function replaceRange(start, end, text, selStart, selEnd) {
    ta.focus();
    ta.setSelectionRange(start, end);
    let ok = false;
    try { ok = document.execCommand('insertText', false, text); } catch { ok = false; }
    if (!ok || ta.value.slice(start, start + text.length) !== text) ta.setRangeText(text, start, end, 'end');
    ta.setSelectionRange(selStart ?? start + text.length, selEnd ?? selStart ?? start + text.length);
    changed();
  }

  function wrap(before, after = before, placeholderText = 'texto') {
    const { selectionStart: s, selectionEnd: e, value: v } = ta;
    const sel = v.slice(s, e);
    if (sel && v.slice(s - before.length, s) === before && v.slice(e, e + after.length) === after) {
      replaceRange(s - before.length, e + after.length, sel, s - before.length, s - before.length + sel.length); // quitar formato
      return;
    }
    const inner = sel || placeholderText;
    replaceRange(s, e, before + inner + after, s + before.length, s + before.length + inner.length);
  }

  function prefixLines(prefixFn) {
    const { selectionStart: s, selectionEnd: e, value: v } = ta;
    const lineStart = v.lastIndexOf('\n', s - 1) + 1;
    let lineEnd = v.indexOf('\n', e);
    if (lineEnd === -1) lineEnd = v.length;
    const lines = v.slice(lineStart, lineEnd).split('\n');
    const out = lines.map((l, i) => prefixFn(l, i)).join('\n');
    replaceRange(lineStart, lineEnd, out, lineStart, lineStart + out.length);
  }

  const actions = {
    bold: () => wrap('**', '**', 'negrita'),
    italic: () => wrap('*', '*', 'cursiva'),
    strike: () => wrap('~~', '~~', 'tachado'),
    code: () => wrap('`', '`', 'código'),
    spoiler: () => wrap('||', '||', 'spoiler'),
    codeblock: () => {
      const { selectionStart: s, selectionEnd: e, value: v } = ta;
      const sel = v.slice(s, e) || 'console.log("¡Hype!");';
      const pre = s > 0 && v[s - 1] !== '\n' ? '\n' : '';
      const text = `${pre}\`\`\`js\n${sel}\n\`\`\`\n`;
      replaceRange(s, e, text, s + pre.length + 6, s + pre.length + 6 + sel.length);
    },
    link: () => {
      const { selectionStart: s, selectionEnd: e, value: v } = ta;
      const sel = v.slice(s, e);
      if (/^https?:\/\//.test(sel)) { const t = `[texto](${sel})`; replaceRange(s, e, t, s + 1, s + 6); }
      else { const label = sel || 'texto'; const t = `[${label}](https://)`; replaceRange(s, e, t, s + label.length + 3, s + label.length + 11); }
    },
    quote: () => prefixLines((l) => (l.startsWith('> ') ? l.slice(2) : `> ${l}`)),
    ul: () => prefixLines((l) => (/^- /.test(l) ? l.slice(2) : `- ${l}`)),
    ol: () => prefixLines((l, i) => (/^\d+\. /.test(l) ? l.replace(/^\d+\. /, '') : `${i + 1}. ${l}`)),
    heading: () => prefixLines((l) => (l.startsWith('## ') ? l.slice(3) : l.startsWith('# ') ? `#${l}` : `# ${l}`)),
  };

  el.addEventListener('click', (e) => {
    const tool = e.target.closest('[data-tool]');
    if (tool) { e.preventDefault(); actions[tool.dataset.tool]?.(); return; }
    const mode = e.target.closest('[data-mode]');
    if (mode) {
      const isPreview = mode.dataset.mode === 'preview';
      el.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('active', b === mode));
      ta.classList.toggle('hidden', isPreview);
      preview.classList.toggle('hidden', !isPreview);
      el.querySelectorAll('[data-tool]').forEach((b) => { b.disabled = isPreview; });
      if (isPreview) preview.innerHTML = ta.value.trim() ? String(renderMarkdown(ta.value)) : '<p class="dim">Nada que previsualizar todavía.</p>';
      else ta.focus();
    }
  });

  ta.addEventListener('keydown', (e) => {
    if (menu && handleMenuKey(e)) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key === 'Enter') { e.preventDefault(); onSubmit?.(); return; }
    if (!mod) {
      // Continuar listas al pulsar Enter
      if (e.key === 'Enter' && !e.shiftKey) {
        const { selectionStart: s, value: v } = ta;
        const lineStart = v.lastIndexOf('\n', s - 1) + 1;
        const line = v.slice(lineStart, s);
        const m = line.match(/^(\s*)([-*+] (\[[ xX]\] )?|(\d+)\. )/);
        if (m && ta.selectionStart === ta.selectionEnd) {
          e.preventDefault();
          if (line.trim() === m[0].trim()) { replaceRange(lineStart, s, ''); return; }
          const next = m[4] ? `${m[1]}${Number(m[4]) + 1}. ` : `${m[1]}${m[2].replace(/\[[xX]\]/, '[ ]')}`;
          replaceRange(s, s, '\n' + next);
        }
      }
      return;
    }
    const k = e.key.toLowerCase();
    const map = { b: 'bold', i: 'italic', e: 'code', k: 'link' };
    if (map[k]) { e.preventDefault(); actions[map[k]](); }
  });

  ta.addEventListener('input', () => { changed(); if (mentionSearch) checkMention(); });
  ta.addEventListener('paste', () => setTimeout(grow));

  // ---- Autocompletado de @menciones ----
  let menu = null, menuItems = [], menuIndex = 0, menuRange = null;
  const closeMention = () => { menu?.remove(); menu = null; menuItems = []; };
  const pickMention = (user) => {
    if (!menuRange) return;
    const text = `@${user.username} `;
    const r = menuRange;
    closeMention();
    replaceRange(r.start, r.end, text);
  };
  function handleMenuKey(e) {
    if (!menuItems.length) return false;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); menuIndex = (menuIndex + (e.key === 'ArrowDown' ? 1 : -1) + menuItems.length) % menuItems.length; paintMenu(); return true; }
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickMention(menuItems[menuIndex]); return true; }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMention(); return true; }
    return false;
  }
  function paintMenu() {
    if (!menu) return;
    menu.innerHTML = menuItems.map((u, i) => String(html`<button type="button" class="menu-item" data-i="${i}" style="${i === menuIndex ? 'background:var(--surface-2)' : ''}">${avatar(u, 'xs')}<span style="flex:1"><b>${u.displayName}</b> <span class="dim">@${u.username}</span></span></button>`)).join('');
  }
  const checkMention = debounce(async () => {
    const s = ta.selectionStart;
    const before = ta.value.slice(0, s);
    const m = before.match(/(?:^|[^\w@])@([a-zA-Z0-9_.]{1,24})$/);
    if (!m) { closeMention(); return; }
    menuRange = { start: s - m[1].length - 1, end: s };
    const users = (await mentionSearch(m[1]).catch(() => [])).slice(0, 5);
    if (!users.length) { closeMention(); return; }
    menuItems = users; menuIndex = 0;
    if (!menu) {
      menu = document.createElement('div');
      menu.className = 'menu';
      menu.style.position = 'absolute';
      menu.addEventListener('mousedown', (ev) => { const b = ev.target.closest('[data-i]'); if (b) { ev.preventDefault(); pickMention(menuItems[Number(b.dataset.i)]); } });
      el.style.position = 'relative';
      el.appendChild(menu);
    }
    menu.style.left = '8px';
    menu.style.top = Math.min(ta.offsetTop + ta.offsetHeight, ta.offsetTop + 120) + 'px';
    paintMenu();
  }, 150);
  ta.addEventListener('blur', () => setTimeout(closeMention, 150));

  requestAnimationFrame(grow);

  return {
    el,
    textarea: ta,
    get value() { return ta.value; },
    setValue(v) { ta.value = v; changed(); },
    insert(text) { const { selectionStart: s, selectionEnd: e } = ta; replaceRange(s, e, text); },
    append(text) { ta.value = ta.value.replace(/\s*$/, '') + (ta.value.trim() ? '\n\n' : '') + text; changed(); },
    focus() { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); },
    destroy() { closeMention(); el.remove(); },
  };
}

export const escapeForAttr = esc;
