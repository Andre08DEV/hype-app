// Choque de Colores: toca el color de la tinta, no el de la palabra.
const COLORS = [
  { name: 'ROJO', hex: '#ef4444' },
  { name: 'AZUL', hex: '#3b82f6' },
  { name: 'VERDE', hex: '#22c55e' },
  { name: 'AMARILLO', hex: '#eab308' },
];
const DURATION = 30;

export function start(area, { onScore, onEnd }) {
  const box = document.createElement('div');
  box.style.cssText = 'display:grid;justify-items:center;gap:22px;width:100%;padding:16px 0';
  box.innerHTML = `<div class="row" style="gap:16px"><b data-time>${DURATION} s</b><span class="combo bold" data-combo></span></div>
    <div class="stroop-word" data-word aria-live="polite"></div>
    <div class="stroop-btns">${COLORS.map((c, i) => `<button type="button" data-c="${i}" style="background:${c.hex}">${i + 1} · ${c.name}</button>`).join('')}</div>
    <div class="tiny" style="opacity:.6">Atajo: teclas 1-4</div>`;
  area.prepend(box);
  const wordEl = box.querySelector('[data-word]');
  const timeEl = box.querySelector('[data-time]');
  const comboEl = box.querySelector('[data-combo]');
  let score = 0, streak = 0, best = 0, ink = 0, finished = false;
  const endAt = performance.now() + DURATION * 1000;
  const mult = () => Math.min(4, 1 + Math.floor(streak / 5));

  const next = () => {
    const word = Math.floor(Math.random() * COLORS.length);
    ink = Math.random() < 0.75 ? (word + 1 + Math.floor(Math.random() * (COLORS.length - 1))) % COLORS.length : word;
    wordEl.textContent = COLORS[word].name;
    wordEl.style.color = COLORS[ink].hex;
  };
  const answer = (i) => {
    if (finished) return;
    if (i === ink) { streak++; best = Math.max(best, streak); score += mult(); box.classList.remove('flash-bad'); box.classList.add('flash-good'); }
    else { streak = 0; score = Math.max(0, score - 1); box.classList.remove('flash-good'); box.classList.add('flash-bad'); }
    setTimeout(() => box.classList.remove('flash-good', 'flash-bad'), 300);
    comboEl.textContent = mult() > 1 ? `x${mult()} 🔥` : '';
    onScore(score);
    next();
  };
  const timer = setInterval(() => {
    const left = Math.max(0, Math.ceil((endAt - performance.now()) / 1000));
    timeEl.textContent = `${left} s`;
    if (left <= 0 && !finished) { finished = true; clearInterval(timer); box.querySelectorAll('button').forEach((b) => { b.disabled = true; }); onEnd(score, { detail: `racha máxima ${best}` }); }
  }, 200);
  box.addEventListener('pointerdown', (e) => { const b = e.target.closest('[data-c]'); if (b) { e.preventDefault(); answer(Number(b.dataset.c)); } });
  const key = (e) => { const n = Number(e.key); if (n >= 1 && n <= 4) answer(n - 1); };
  document.addEventListener('keydown', key);
  next();
  return { destroy() { finished = true; clearInterval(timer); document.removeEventListener('keydown', key); box.remove(); } };
}
