// Reflejo Neón: mide tu tiempo de reacción en 5 rondas.
const ROUNDS = 5;

export function start(area, { onScore, onEnd }) {
  area.insertAdjacentHTML('afterbegin', '<div class="reflex-pad wait" data-pad role="button" tabindex="0" aria-live="polite"></div>');
  const pad = area.querySelector('[data-pad]');
  let round = 0, phase = 'wait', timer = null, t0 = 0;
  const times = [];
  const avg = () => times.reduce((a, b) => a + b, 0) / Math.max(1, times.length);
  const score = () => (times.length ? Math.max(0, Math.round(200000 / avg())) : 0);
  const show = (cls, main, sub = '') => { pad.className = `reflex-pad ${cls}`; pad.innerHTML = `<div>${main}</div>${sub ? `<div class="sub">${sub}</div>` : ''}`; };

  const next = () => {
    phase = 'wait';
    show('wait', 'Espera el verde…', `Ronda ${round + 1} de ${ROUNDS}`);
    timer = setTimeout(() => { phase = 'go'; t0 = performance.now(); show('go', '¡YA! 👆'); }, 1100 + Math.random() * 2600);
  };
  const advance = () => {
    round++;
    if (round >= ROUNDS) { phase = 'done'; show('wait', `${Math.round(avg())} ms de media`, 'Calculando…'); onEnd(score(), { detail: `media ${Math.round(avg())} ms` }); }
    else next();
  };
  const tap = (e) => {
    e.preventDefault();
    if (phase === 'wait') {
      clearTimeout(timer);
      times.push(1000);
      phase = 'pause';
      show('early', '¡Demasiado pronto! 😅', '+1000 ms de penalización');
      onScore(score());
      timer = setTimeout(advance, 1000);
    } else if (phase === 'go') {
      const ms = Math.round(performance.now() - t0);
      times.push(ms);
      phase = 'pause';
      show('wait', `${ms} ms`, ms < 230 ? '¡Rapidísimo! ⚡' : ms < 320 ? '¡Muy bien! 🔥' : 'Puedes mejorar 💪');
      onScore(score());
      timer = setTimeout(advance, 1000);
    }
  };
  const key = (e) => { if (e.code === 'Space' || e.key === 'Enter') tap(e); };
  pad.addEventListener('pointerdown', tap);
  document.addEventListener('keydown', key);
  next();
  return { destroy() { clearTimeout(timer); document.removeEventListener('keydown', key); pad.remove(); } };
}
