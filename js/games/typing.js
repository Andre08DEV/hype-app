// Code Sprint: teclea fragmentos de código durante 30 segundos.
const SNIPPETS = [
  'const hype = posts.filter(p => p.hype > 100);',
  'function saludar(nombre) { return `Hola, ${nombre}!`; }',
  'for (let i = 0; i < 10; i++) console.log(i);',
  'def es_par(n): return n % 2 == 0',
  'SELECT * FROM posts ORDER BY hype DESC;',
  'git commit -m "feat: hilos nativos"',
  "await fetch('/api/posts').then(r => r.json());",
  'print([x * 2 for x in range(5)])',
  'export default function App() { return null; }',
  'npm install && npm run dev',
  'let total = carrito.reduce((a, b) => a + b.precio, 0);',
  'if (usuario.activo) mostrarFeed();',
  'const [likes, setLikes] = useState(0);',
  'body { display: grid; place-items: center; }',
];
const DURATION = 30;
const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function start(area, { onScore, onEnd }) {
  const order = SNIPPETS.slice().sort(() => Math.random() - 0.5);
  const box = document.createElement('div');
  box.className = 'typing-box';
  box.innerHTML = `<div class="row" style="justify-content:space-between"><span class="tiny" style="opacity:.75">Escribe exactamente el código ⌨️</span><b data-time>${DURATION} s</b></div>
    <div class="typing-text" data-text></div>
    <input class="typing-input" data-input autocapitalize="off" autocomplete="off" autocorrect="off" spellcheck="false" aria-label="Escribe aquí">
    <button class="btn btn-white btn-sm" data-focus style="justify-self:center">⌨️ Toca aquí para escribir</button>
    <div class="tiny" style="opacity:.7;text-align:center" data-stats>0 ppm · 100% precisión</div>`;
  area.prepend(box);
  const textEl = box.querySelector('[data-text]');
  const input = box.querySelector('[data-input]');
  const timeEl = box.querySelector('[data-time]');
  const statsEl = box.querySelector('[data-stats]');
  let idx = 0, doneChars = 0, keystrokes = 0, correctStrokes = 0, startedAt = 0, timer = null, finished = false, prev = '';

  const target = () => order[idx % order.length];
  const correctPrefix = (v) => { const t = target(); let n = 0; while (n < v.length && v[n] === t[n]) n++; return n; };
  const paint = () => {
    const t = target(), v = input.value, ok = correctPrefix(v);
    const bad = v.slice(ok);
    textEl.innerHTML = `<span class="ok">${escapeHtml(t.slice(0, ok))}</span>${bad ? `<span class="bad">${escapeHtml(t.slice(ok, ok + bad.length) || ' ')}</span>` : ''}<span class="cur"></span><span class="todo">${escapeHtml(t.slice(ok + bad.length))}</span>`;
  };
  const metrics = () => {
    const mins = Math.max(1 / 60, ((startedAt ? performance.now() - startedAt : 0) / 60000));
    const chars = doneChars + correctPrefix(input.value);
    const wpm = Math.round(chars / 5 / mins);
    const acc = keystrokes ? correctStrokes / keystrokes : 1;
    return { wpm, acc, score: Math.round(wpm * acc) };
  };
  const tick = () => {
    const left = Math.max(0, DURATION - Math.floor((performance.now() - startedAt) / 1000));
    timeEl.textContent = `${left} s`;
    const m = metrics();
    statsEl.textContent = `${m.wpm} ppm · ${Math.round(m.acc * 100)}% precisión`;
    onScore(m.score);
    if (left <= 0) finish();
  };
  const finish = () => {
    if (finished) return;
    finished = true;
    clearInterval(timer);
    input.disabled = true;
    const m = metrics();
    onEnd(m.score, { detail: `${m.wpm} ppm · ${Math.round(m.acc * 100)}% precisión` });
  };
  input.addEventListener('input', () => {
    if (finished) return;
    if (!startedAt) { startedAt = performance.now(); timer = setInterval(tick, 250); }
    const v = input.value;
    if (v.length > prev.length) {
      const added = v.slice(prev.length);
      for (let i = 0; i < added.length; i++) { keystrokes++; if (added[i] === target()[prev.length + i]) correctStrokes++; }
    }
    prev = v;
    if (v === target()) { doneChars += v.length; idx++; input.value = ''; prev = ''; }
    paint();
  });
  const focus = () => input.focus();
  box.querySelector('[data-focus]').addEventListener('click', focus);
  textEl.addEventListener('click', focus);
  paint();
  setTimeout(focus, 50);
  return { destroy() { finished = true; clearInterval(timer); box.remove(); } };
}
