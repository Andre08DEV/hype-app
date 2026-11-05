// Markdown seguro para posts: el texto se escapa SIEMPRE antes de aplicar formato,
// así que el HTML que escriba un usuario nunca se ejecuta.
// Soporta: **negrita**, *cursiva*, ~~tachado~~, ||spoiler||, `código`, ```bloques```,
// # títulos, > citas, listas (- / 1. / - [x]), ---, [enlaces](https://…), URLs,
// @menciones y #hashtags.
import { esc, unesc, raw, safeUrl } from './dom.js';

// ---------------- Resaltado de código ----------------
const KW = {
  js: 'const let var function return if else for while do switch case break continue new class extends super this import export from default async await try catch finally throw typeof instanceof in of yield delete void null undefined true false static get set interface type enum implements readonly as',
  py: 'def return if elif else for while in not and or is import from as class try except finally raise with lambda yield pass break continue None True False global nonlocal async await self print',
  sql: 'select from where and or not insert into values update set delete create table alter drop index join left right inner outer full on group by order having limit offset as distinct union all returning primary key references default null is in like ilike between exists case when then else end begin commit grant revoke policy function returns language security definer trigger for each row execute procedure using with check enable level schema extension if replace',
  bash: 'if then else elif fi for do done while until case esac function in echo export cd ls git npm npx pnpm yarn node sudo cat grep curl source alias',
  rust: 'fn let mut pub struct enum impl trait use mod match if else for while loop return self Self crate where as async await move ref true false const static dyn',
  go: 'func package import var const type struct interface map chan go defer return if else for range switch case break continue select nil true false',
  c: 'int char float double void bool return if else for while do switch case break continue struct typedef static const unsigned long short sizeof true false class public private protected new delete this namespace using template virtual override final abstract extends implements package import interface fun val var when object companion data suspend func let guard nil self protocol extension echo function',
  css: 'important',
};
const ALIAS = {
  javascript: 'js', jsx: 'js', ts: 'js', tsx: 'js', typescript: 'js', mjs: 'js', json: 'js', node: 'js',
  python: 'py', py3: 'py',
  sh: 'bash', shell: 'bash', zsh: 'bash', console: 'bash', terminal: 'bash',
  postgres: 'sql', postgresql: 'sql', plpgsql: 'sql', mysql: 'sql', sqlite: 'sql',
  rs: 'rust', golang: 'go',
  java: 'c', cpp: 'c', 'c++': 'c', cs: 'c', csharp: 'c', 'c#': 'c', kotlin: 'c', kt: 'c', swift: 'c', php: 'c', dart: 'c', h: 'c',
  scss: 'css', sass: 'css', less: 'css',
  html: 'html', xml: 'html', svg: 'html', vue: 'html', svelte: 'html',
};
const kwCache = {};
const kwSet = (lang) => (kwCache[lang] ||= new Set((KW[lang] || '').split(' ')));

function commentRe(lang) {
  if (lang === 'py' || lang === 'bash') return '#[^\\n]*';
  if (lang === 'sql') return '--[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/';
  if (lang === 'css') return '\\/\\*[\\s\\S]*?\\*\\/';
  return '\\/\\*[\\s\\S]*?\\*\\/|\\/\\/[^\\n]*';
}

const span = (cls, s) => `<span class="tok-${cls}">${esc(s)}</span>`;

function highlightHtml(code) {
  const re = /(<!--[\s\S]*?-->)|(<\/?)([\w:-]+)|([\w:-]+)(=)|("[^"]*"|'[^']*')|(\/?>)/g;
  let out = '', last = 0, m;
  while ((m = re.exec(code))) {
    out += esc(code.slice(last, m.index));
    if (m[1]) out += span('com', m[1]);
    else if (m[2]) out += span('punc', m[2]) + span('tag', m[3]);
    else if (m[4]) out += span('attr', m[4]) + span('punc', m[5]);
    else if (m[6]) out += span('str', m[6]);
    else if (m[7]) out += span('punc', m[7]);
    last = re.lastIndex;
  }
  return out + esc(code.slice(last));
}

export function highlight(code, langRaw = '') {
  const lang = ALIAS[langRaw] || (KW[langRaw] !== undefined ? langRaw : langRaw === 'html' ? 'html' : 'js');
  if (lang === 'html') return highlightHtml(code);
  const re = new RegExp(`(${commentRe(lang)})|("(?:\\\\.|[^"\\\\\\n])*"|'(?:\\\\.|[^'\\\\\\n])*'|\`(?:\\\\.|[^\`\\\\])*\`)|(\\b\\d[\\d_]*(?:\\.\\d+)?(?:e[+-]?\\d+)?\\b|#[0-9a-fA-F]{3,8}\\b)|([A-Za-z_$][\\w$]*)(?=\\s*\\()|([A-Za-z_$@][\\w$-]*)|([{}()[\\];,.<>+\\-*/=!&|?:%^~]+)`, 'g');
  const kws = kwSet(lang);
  const caseless = lang === 'sql';
  let out = '', last = 0, m;
  while ((m = re.exec(code))) {
    if (m.index === re.lastIndex) { re.lastIndex++; continue; }
    out += esc(code.slice(last, m.index));
    const [tok, com, str, num, fn, word, punc] = m;
    if (com) out += span('com', com);
    else if (str) out += span('str', str);
    else if (num) out += span('num', num);
    else if (fn) out += kws.has(caseless ? fn.toLowerCase() : fn) ? span('kw', fn) : span('fn', fn);
    else if (word) {
      const w = caseless ? word.toLowerCase() : word;
      if (kws.has(w)) out += span('kw', word);
      else if (/^[A-Z][a-zA-Z0-9]*$/.test(word) && lang !== 'sql') out += span('type', word);
      else out += esc(word);
    } else if (punc) out += span('punc', punc);
    else out += esc(tok);
    last = re.lastIndex;
  }
  return out + esc(code.slice(last));
}

// ---------------- Inline ----------------
const LINK_ATTRS = 'target="_blank" rel="noopener noreferrer nofollow ugc"';

function emphasis(s) {
  return s
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>')
    .replace(/__(?=\S)([\s\S]*?\S)__/g, '<strong>$1</strong>')
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>')
    .replace(/\|\|(?=\S)([\s\S]*?\S)\|\|/g, '<span class="spoiler" data-action="spoiler" title="Spoiler: toca para ver">$1</span>')
    .replace(/(^|[^\w*])\*(?=\S)([^*\n]*?\S)\*(?![\w*])/g, '$1<em>$2</em>')
    .replace(/(^|[^\w])_(?=\S)([^_\n]*?\S)_(?!\w)/g, '$1<em>$2</em>');
}

function inlineText(text, opts) {
  const tokens = [];
  const put = (h) => `\u0000${tokens.push(h) - 1}\u0000`;
  let s = esc(text);

  // Escapes de Markdown: \* \_ \# …
  s = s.replace(/\\([*_~|#@[\]()\\!-])/g, (m, c) => put(esc(c)));

  // [texto](url)
  s = s.replace(/\[([^\]\n]{1,200})\]\(([^)\s]{1,600})\)/g, (m, label, url) => {
    const u = safeUrl(unesc(url));
    if (!u) return m;
    return put(`<a href="${esc(u)}" ${LINK_ATTRS}>${emphasis(label)}</a>`);
  });

  // URLs sueltas
  s = s.replace(/https?:\/\/(?:[^\s&\u0000]|&amp;)+/g, (m) => {
    let url = m, trail = '';
    while (/[.,!?;:'"]$/.test(url) || (url.endsWith(')') && !url.includes('('))) { trail = url.slice(-1) + trail; url = url.slice(0, -1); }
    const real = unesc(url);
    const u = safeUrl(real);
    if (!u) return m;
    const shown = real.replace(/^https?:\/\/(www\.)?/, '');
    return put(`<a href="${esc(u)}" ${LINK_ATTRS}>${esc(shown.length > 52 ? shown.slice(0, 50) + '…' : shown)}</a>`) + trail;
  });

  if (opts.mentions !== false) {
    s = s.replace(/(^|[^\p{L}\p{N}_@.])@([a-zA-Z0-9_.]{3,24})/gu, (m, pre, name) => {
      const clean = name.replace(/\.+$/, '');
      const rest = name.slice(clean.length);
      if (clean.length < 3) return m;
      return pre + put(`<a class="mention" href="#/u/${encodeURIComponent(clean.toLowerCase())}">@${esc(clean)}</a>`) + rest;
    });
    s = s.replace(/(^|[^\p{L}\p{N}_&#/\u0000])#(?=[\p{N}_]*\p{L})([\p{L}\p{N}_]{2,40})/gu, (m, pre, tag) =>
      pre + put(`<a class="hashtag" href="#/explore?tag=${encodeURIComponent(tag.toLowerCase())}">#${esc(tag)}</a>`));
  }

  s = emphasis(s);
  return s.replace(/\u0000(\d+)\u0000/g, (_, n) => tokens[Number(n)]);
}

function inline(text, opts) {
  return String(text).split(/(`[^`\n]+`)/g).map((part, i) => (i % 2 ? `<code>${esc(part.slice(1, -1))}</code>` : inlineText(part, opts))).join('');
}

const withBreaks = (htmlStr) => htmlStr.replace(/\n/g, '<br>');

// ---------------- Bloques ----------------
const RE_FENCE = /^\s*```\s*([\w+#.-]*)\s*$/;
const RE_FENCE_END = /^\s*```\s*$/;
const RE_HEADING = /^(#{1,3})\s+(.+)$/;
const RE_HR = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/;
const RE_QUOTE = /^\s*&gt;|^\s*>/;
const RE_UL = /^\s*[-*+]\s+/;
const RE_OL = /^\s*(\d{1,4})[.)]\s+/;

function isBlockStart(line, compact) {
  return RE_FENCE.test(line) || (!compact && RE_HEADING.test(line)) || RE_HR.test(line) || /^\s*>/.test(line) || RE_UL.test(line) || RE_OL.test(line);
}

function codeBlock(code, lang) {
  return `<div class="code-block"><div class="code-head"><span class="row" style="gap:0"><span class="dots"><i></i><i></i><i></i></span>${esc(lang || 'código')}</span><button type="button" class="copy-code" data-action="copy-code">Copiar</button></div><pre><code>${highlight(code, lang)}</code></pre></div>`;
}

/**
 * Convierte Markdown a HTML seguro (SafeHTML).
 * opts.compact → sin títulos (comentarios y mensajes). opts.mentions=false → sin @/#.
 */
export function renderMarkdown(src, opts = {}) {
  const text = String(src ?? '').replace(/\u0000/g, '').replace(/\r\n?/g, '\n');
  const lines = text.split('\n');
  const out = [];
  const compact = !!opts.compact;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const fence = line.match(RE_FENCE);
    if (fence) {
      const buf = [];
      i++;
      while (i < lines.length && !RE_FENCE_END.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push(codeBlock(buf.join('\n'), fence[1].toLowerCase()));
      continue;
    }
    if (!line.trim()) { i++; continue; }
    const h = !compact && line.match(RE_HEADING);
    if (h) { out.push(`<h${h[1].length + 2}>${inline(h[2], opts)}</h${h[1].length + 2}>`); i++; continue; }
    if (RE_HR.test(line)) { out.push('<hr>'); i++; continue; }
    if (/^\s*>/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ''));
      out.push(`<blockquote>${withBreaks(inline(buf.join('\n'), opts))}</blockquote>`);
      continue;
    }
    if (RE_UL.test(line)) {
      const items = [];
      while (i < lines.length && RE_UL.test(lines[i])) items.push(lines[i++].replace(RE_UL, ''));
      out.push(`<ul>${items.map((it) => {
        const task = it.match(/^\[([ xX])\]\s+(.*)$/);
        if (task) return `<li class="task"><input type="checkbox" disabled ${task[1] !== ' ' ? 'checked' : ''}><span>${inline(task[2], opts)}</span></li>`;
        return `<li>${inline(it, opts)}</li>`;
      }).join('')}</ul>`);
      continue;
    }
    const ol = line.match(RE_OL);
    if (ol) {
      const items = [];
      while (i < lines.length && RE_OL.test(lines[i])) items.push(lines[i++].replace(RE_OL, ''));
      const start = Number(ol[1]);
      out.push(`<ol${start !== 1 ? ` start="${start}"` : ''}>${items.map((it) => `<li>${inline(it, opts)}</li>`).join('')}</ol>`);
      continue;
    }
    const buf = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i], compact)) buf.push(lines[i++]);
    out.push(`<p>${withBreaks(inline(buf.join('\n'), opts))}</p>`);
  }
  return raw(out.join(''));
}

/** Texto plano sin Markdown (para avisos, vistas previas y contexto de IA). */
export function stripMarkdown(src) {
  return String(src ?? '')
    .replace(/```[\w+#.-]*\n?([\s\S]*?)```/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/(\*\*|__|~~|\|\|)(.*?)\1/g, '$2')
    .replace(/(^|\s)[*_](\S.*?\S|\S)[*_](?=\s|$)/g, '$1$2')
    .replace(/^#{1,3}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .trim();
}
