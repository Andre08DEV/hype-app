// Catálogo de mini-juegos "playables" (originales). Cada juego vive en ./<id>.js
export const GAMES = [
  { id: 'dodge', title: 'Esquiva Orbital', emoji: '🛸', colors: ['#7c3aed', '#0ea5e9'], tagline: 'Esquiva meteoritos y recoge energía', unit: 'pts', how: 'Mueve la nave con el dedo, el ratón o las flechas ← →. Recoge ⚡ para sumar puntos extra. La velocidad sube con el tiempo.' },
  { id: 'reflex', title: 'Reflejo Neón', emoji: '⚡', colors: ['#10b981', '#7c3aed'], tagline: '¿Qué tan rápido reaccionas?', unit: 'pts', how: 'Toca en cuanto la pantalla se ponga verde. Son 5 rondas: si te adelantas, la ronda cuenta como 1 segundo.' },
  { id: 'memory', title: 'Memoria Hype', emoji: '🧠', colors: ['#db2777', '#f59e0b'], tagline: 'Encuentra las 8 parejas', unit: 'pts', how: 'Voltea dos cartas a la vez. Menos movimientos y menos tiempo = más puntos.' },
  { id: 'typing', title: 'Code Sprint', emoji: '⌨️', colors: ['#0ea5e9', '#22c55e'], tagline: 'Teclea código a toda velocidad', unit: 'ppm', how: 'Escribe los fragmentos de código tal cual aparecen durante 30 segundos. Tu puntuación son las palabras por minuto ajustadas por precisión.' },
  { id: 'colors', title: 'Choque de Colores', emoji: '🎨', colors: ['#f43f5e', '#8b5cf6'], tagline: 'Elige el color, no la palabra', unit: 'pts', how: 'Toca el color de la TINTA, no lo que dice la palabra. 30 segundos. Las rachas multiplican tus puntos.' },
];

export const gameById = (id) => GAMES.find((g) => g.id === id) || null;
export const loadGame = (id) => import(`./${id}.js`);
