// Memoria Hype: encuentra las 8 parejas con pocos movimientos.
const POOL = ['🚀', '🔥', '⚡', '🎮', '🎧', '🎨', '🍕', '🦄', '🌈', '👾', '🧠', '💎', '🌙', '🍩', '🐙', '🎯'];

const shuffle = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

export function start(area, { onScore, onEnd }) {
  const symbols = shuffle(POOL).slice(0, 8);
  const cards = shuffle([...symbols, ...symbols]);
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:grid;justify-items:center;gap:6px;width:100%';
  wrap.innerHTML = `<div class="memory-grid">${cards.map((s, i) => `<div class="mem-card" data-i="${i}" role="button" aria-label="Carta"><div class="front"></div><div class="back">${s}</div></div>`).join('')}</div><div class="tiny" style="opacity:.75" data-info>Movimientos: 0</div>`;
  area.prepend(wrap);
  const grid = wrap.querySelector('.memory-grid');
  const info = wrap.querySelector('[data-info]');
  let first = null, lock = false, moves = 0, matched = 0, done = false;
  const t0 = performance.now();
  const secs = () => Math.round((performance.now() - t0) / 1000);
  const score = () => Math.max(100, Math.round(2000 - moves * 30 - secs() * 8));
  const update = () => { info.textContent = `Movimientos: ${moves} · ${secs()} s`; onScore(score()); };
  const timer = setInterval(() => { if (!done) update(); }, 500);

  grid.addEventListener('click', (e) => {
    const c = e.target.closest('.mem-card');
    if (!c || lock || done || c.classList.contains('flipped') || c.classList.contains('matched')) return;
    c.classList.add('flipped');
    if (!first) { first = c; return; }
    moves++;
    update();
    if (cards[first.dataset.i] === cards[c.dataset.i]) {
      first.classList.add('matched');
      c.classList.add('matched');
      first = null;
      matched++;
      if (matched === symbols.length) { done = true; clearInterval(timer); const s = score(); setTimeout(() => onEnd(s, { detail: `${moves} movimientos · ${secs()} s` }), 600); }
    } else {
      lock = true;
      const f = first;
      first = null;
      setTimeout(() => { f.classList.remove('flipped'); c.classList.remove('flipped'); lock = false; }, 750);
    }
  });
  update();
  return { destroy() { done = true; clearInterval(timer); wrap.remove(); } };
}
