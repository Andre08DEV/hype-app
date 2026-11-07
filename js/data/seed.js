// Contenido de demostración para el modo local. Las fechas son relativas a "ahora"
// para que la demo siempre se vea fresca.

const H = 3600e3, D = 24 * H, M = 60e3;

export const BOTS = [
  { id: 'u-hype', username: 'hype', displayName: 'Hype', avatarEmoji: '⚡', bio: 'Cuenta oficial de **Hype**. Novedades, trucos y retos semanales. Dale 🔥 a lo que te inspira.', verified: true, interests: ['novedades', 'comunidad'], links: [{ label: 'Guía', url: 'https://github.com' }] },
  { id: 'u-sofia', username: 'sofia.dev', displayName: 'Sofía Ramírez', avatarEmoji: '👩‍💻', bio: 'Frontend dev · CSS nerd · comparto un tip al día 💡\n`npm run café`', interests: ['dev', 'css', 'javascript'], links: [{ label: 'Portfolio', url: 'https://example.com' }] },
  { id: 'u-leo', username: 'leo_beats', displayName: 'Leo Martín', avatarEmoji: '🎧', bio: 'Productor musical. Beats lo-fi para programar y estudiar.', interests: ['música', 'shorts'] },
  { id: 'u-maria', username: 'maria.cocina', displayName: 'María Torres', avatarEmoji: '👩‍🍳', bio: 'Recetas rápidas para gente ocupada 🍳 Menos de 20 minutos, siempre.', interests: ['recetas', 'cocina'] },
  { id: 'u-kai', username: 'kai.games', displayName: 'Kai Nakamura', avatarEmoji: '🎮', bio: 'Game dev indie · speedrunner de mini-juegos · si me ganas en Esquiva Orbital te invito un café.', interests: ['juegos', 'gamedev'] },
  { id: 'u-valen', username: 'valen.design', displayName: 'Valentina Cruz', avatarEmoji: '🎨', bio: 'Diseñadora UI/UX. Colores, tipografías y sistemas de diseño ✨', interests: ['diseño', 'ui'] },
  { id: 'u-diego', username: 'diego.startup', displayName: 'Diego Fernández', avatarEmoji: '🚀', bio: 'Founder en serie. Construyendo en público. 3 startups, 2 fracasos, 1 lección: lanza antes.', interests: ['startups', 'proyectos'] },
  { id: 'u-ana', username: 'ana.ia', displayName: 'Ana López', avatarEmoji: '🤖', bio: 'Investigo IA aplicada. Explico papers sin humo.', interests: ['ia', 'ml'] },
];

const pic = (seed, w = 1200, h = 800) => `https://picsum.photos/seed/${seed}/${w}/${h}`;
const mix = (id) => ({ url: `https://assets.mixkit.co/videos/${id}/${id}-360.mp4`, poster: `https://assets.mixkit.co/videos/${id}/${id}-thumb-360-0.jpg` });

export const DEMO_GIFS = [
  { id: 'hype', url: 'assets/gifs/hype.gif', title: 'HYPE', tags: 'hype fuego fire' },
  { id: 'wow', url: 'assets/gifs/wow.gif', title: 'WOW', tags: 'wow sorpresa' },
  { id: 'gg', url: 'assets/gifs/gg.gif', title: 'GG', tags: 'gg juego ganar' },
  { id: 'ship', url: 'assets/gifs/ship-it.gif', title: 'SHIP IT', tags: 'ship lanzar deploy' },
  { id: 'lol', url: 'assets/gifs/lol.gif', title: 'LOL', tags: 'lol risa jaja' },
  { id: 'party', url: 'assets/gifs/party.gif', title: 'Fiesta', tags: 'fiesta party confeti celebrar' },
  { id: 'love', url: 'assets/gifs/love.gif', title: 'Amor', tags: 'amor love corazon' },
  { id: 'think', url: 'assets/gifs/thinking.gif', title: 'Pensando', tags: 'pensando hmm cargando' },
];

export const SHORT_VIDEOS = [
  { ...mix(1170), body: 'Atardecer entre palmeras 🌴 el mejor fondo de pantalla en movimiento. #atardecer #relax', author: 'u-valen' },
  { ...mix(51500), body: 'Olas turquesa desde el dron 🌊 sonido recomendado: lo-fi de @leo_beats #playa', author: 'u-leo' },
  { ...mix(1280), body: 'Luz bajo el agua. Me ayuda a concentrarme antes de programar 💙 #focus', author: 'u-sofia' },
  { ...mix(1186), body: 'Primavera en 15 segundos 🌸 ¿Qué paleta sacarías de aquí? #diseño #color', author: 'u-valen' },
  { ...mix(51506), body: 'Cuando el deploy sale a la primera 🌊💥 #devlife', author: 'u-diego' },
  { ...mix(1968), body: 'Humo y negro: estoy probando esta textura para la intro del nuevo juego 👀 #gamedev', author: 'u-kai' },
  { ...mix(1197), body: 'Muelle al amanecer. 5 minutos de calma para hoy ☀️', author: 'u-ana' },
  { ...mix(1173), body: 'Árbol de flores amarillas 💛 inspiración para el branding de mi próxima receta', author: 'u-maria' },
  { ...mix(51501), body: 'Volando sobre el manglar 🛩️ ¿adivinan el país? #viajes', author: 'u-diego' },
  { ...mix(1183), body: 'Sol sobre las colinas. Nuevo beat lo-fi en camino 🎧 #música', author: 'u-leo' },
];

export const GROUPS = [
  { id: 'g-devs', slug: 'devs-hispanos', name: 'Devs Hispanos', emoji: '💻', color: ['#6366f1', '#06b6d4'], description: 'Comunidad para programadores de habla hispana: dudas, code reviews, empleo y memes de producción.', tags: ['dev', 'javascript', 'python'], ownerId: 'u-sofia', members: ['u-sofia', 'u-diego', 'u-ana', 'u-kai'] },
  { id: 'g-recetas', slug: 'recetas-rapidas', name: 'Recetas Rápidas', emoji: '🍳', color: ['#f97316', '#facc15'], description: 'Recetas de menos de 20 minutos. Foto o no pasó.', tags: ['recetas', 'cocina'], ownerId: 'u-maria', members: ['u-maria', 'u-valen', 'u-leo'] },
  { id: 'g-indie', slug: 'indie-games', name: 'Indie Games', emoji: '🎮', color: ['#8b5cf6', '#ec4899'], description: 'Devlogs, playtests y retos de los mini-juegos de Hype. Comparte tu récord.', tags: ['juegos', 'gamedev'], ownerId: 'u-kai', members: ['u-kai', 'u-sofia', 'u-leo'] },
  { id: 'g-diseno', slug: 'diseno-ui', name: 'Diseño UI/UX', emoji: '🎨', color: ['#ec4899', '#f43f5e'], description: 'Críticas constructivas, recursos, tipografías y paletas.', tags: ['diseño', 'ui', 'ux'], ownerId: 'u-valen', members: ['u-valen', 'u-sofia'] },
  { id: 'g-ia', slug: 'ia-y-futuro', name: 'IA & Futuro', emoji: '🤖', color: ['#10b981', '#3b82f6'], description: 'Papers explicados, herramientas y debates sobre IA responsable.', tags: ['ia', 'ml', 'gemini'], ownerId: 'u-ana', members: ['u-ana', 'u-diego', 'u-sofia'] },
  { id: 'g-founders', slug: 'founders-club', name: 'Founders Club', emoji: '🔒', color: ['#f59e0b', '#ef4444'], description: 'Grupo privado para fundadores: métricas reales, inversión y salud mental. Se entra por solicitud.', tags: ['startups'], ownerId: 'u-diego', members: ['u-diego', 'u-ana'], isPrivate: true },
];

export const PROJECTS = [
  { id: 'p-taskflow', ownerId: 'u-diego', name: 'TaskFlow', emoji: '✅', color: ['#22c55e', '#06b6d4'], tagline: 'Gestor de tareas que prioriza por ti con IA', stage: 'beta', tags: ['productividad', 'ia', 'saas'], demoUrl: 'https://example.com', repoUrl: '', hype: 128, age: 5 * H,
    description: '## ¿Qué es?\nTaskFlow lee tus tareas y te propone **qué hacer primero** según urgencia, energía y contexto.\n\n### Funciones\n- Priorización automática\n- Bloques de foco con temporizador\n- Integración con calendario\n\n> Buscamos 50 beta testers. ¡Comenta y te invito!' },
  { id: 'p-pixel', ownerId: 'u-kai', name: 'PixelForge', emoji: '👾', color: ['#8b5cf6', '#ec4899'], tagline: 'Editor de sprites en el navegador, con animación por capas', stage: 'launched', tags: ['gamedev', 'herramientas', 'open-source'], demoUrl: 'https://example.com', repoUrl: 'https://github.com', hype: 241, age: 2 * D,
    description: 'Editor de **pixel art** 100% web: capas, paletas, onion skinning y exportación a GIF/PNG.\n\n```js\nconst sprite = forge.create(32, 32);\nsprite.layer(\'base\').fill(\'#7c5cff\');\nsprite.export(\'gif\');\n```' },
  { id: 'p-recetario', ownerId: 'u-maria', name: 'Recetario Express', emoji: '🥘', color: ['#f97316', '#facc15'], tagline: 'Recetas de 15 minutos con lo que tienes en la nevera', stage: 'building', tags: ['cocina', 'app', 'pwa'], demoUrl: '', repoUrl: '', hype: 87, age: 9 * H,
    description: 'Escribe 3 ingredientes y te propone recetas rápidas. Funciona **sin conexión** como PWA.' },
  { id: 'p-codesnap', ownerId: 'u-sofia', name: 'CodeSnap', emoji: '📸', color: ['#0ea5e9', '#6366f1'], tagline: 'Capturas de código bonitas listas para redes', stage: 'launched', tags: ['dev', 'herramientas', 'diseño'], demoUrl: 'https://example.com', repoUrl: 'https://github.com', hype: 176, age: 3 * D,
    description: 'Pega tu código, elige tema y fondo, exporta en 2x. Soporta **40 lenguajes** y marcos de ventana estilo macOS.' },
  { id: 'p-melodia', ownerId: 'u-leo', name: 'MelodIA', emoji: '🎹', color: ['#ec4899', '#8b5cf6'], tagline: 'Genera bases lo-fi a partir de tu estado de ánimo', stage: 'idea', tags: ['música', 'ia'], demoUrl: '', repoUrl: '', hype: 54, age: 20 * H,
    description: 'Idea en fase temprana: eliges un mood (🌧️ lluvioso, ☕ café, 🌙 noche) y genera un loop de 2 minutos. ¿Lo usarían?' },
  { id: 'p-ecoruta', ownerId: 'u-ana', name: 'EcoRuta', emoji: '🚲', color: ['#10b981', '#84cc16'], tagline: 'Rutas en bici más seguras con datos abiertos', stage: 'beta', tags: ['movilidad', 'open-data', 'mapas'], demoUrl: 'https://example.com', repoUrl: 'https://github.com', hype: 99, age: 6 * D,
    description: 'Calcula rutas priorizando **ciclovías**, calles tranquilas y menos pendiente. Usa datos abiertos municipales.' },
];

/** Posts de demo. `ago` en ms. Los hilos usan `thread: [...]`. */
export const POSTS = [
  { id: 'post-welcome', author: 'u-hype', ago: 25 * M, hype: 342, body: '# Bienvenido a Hype ⚡\n\nAquí puedes:\n- Publicar con **Markdown** (negrita, *cursiva*, `código`)\n- Crear **hilos** encadenando posts\n- Subir **shorts**, fotos, GIFs y vídeos HD\n- Lanzar **encuestas en vivo**\n- Darle 🔥 **hype** a posts y proyectos\n- Guardar posts en **carpetas privadas**\n\nY si te atascas, pregúntale a **Hype IA** ✨ #bienvenida' },
  { id: 'post-css', author: 'u-sofia', ago: 48 * M, hype: 87, comments: [['u-valen', '¡Me salvaste el día! 🙌'], ['u-kai', 'No sabía lo de `dvh`, gracias']], body: 'Tip de CSS del día 💡 Centrar *cualquier cosa* en 2 líneas:\n\n```css\n.contenedor {\n  display: grid;\n  place-items: center;\n}\n```\n\nY para alturas en móvil usa `100dvh` en vez de `100vh` para evitar saltos con la barra del navegador. #css #frontend' },
  { id: 'post-poll-lang', author: 'u-ana', ago: 2 * H, hype: 64, poll: { options: ['Python 🐍', 'JavaScript ⚡', 'Rust 🦀', 'Go 🐹'], counts: [412, 388, 201, 97], hoursLeft: 30 }, body: '¿Con qué lenguaje empezarías a aprender IA aplicada **hoy**? 🤖 #ia #encuesta' },
  { id: 'post-thread-launch', author: 'u-diego', ago: 3 * H, hype: 156, thread: [
    '🧵 Cómo lancé mi tercera startup en **30 días** (y qué haría distinto). Hilo 👇',
    '**Semana 1 — Problema, no solución.** Hablé con 20 personas antes de escribir una línea de código. 14 tenían el mismo dolor: demasiadas tareas, cero prioridad.',
    '**Semana 2 — MVP feo pero útil.** Una sola pantalla. Sin login. Sin pagos. Solo la función estrella:\n\n```py\ndef priorizar(tareas):\n    return sorted(tareas, key=lambda t: (t.urgencia, -t.esfuerzo))\n```',
    '**Semana 3 — Construir en público.** Publiqué el progreso cada día aquí en Hype. Los comentarios me ahorraron 2 semanas de errores.',
    '**Semana 4 — Lanzamiento.** 312 registros el primer día. La lección: *lanza antes de sentirte listo*. Si les sirve, el proyecto está en la pestaña Proyectos → **TaskFlow** 🚀 #startups #buildinpublic',
  ] },
  { id: 'post-ramen', author: 'u-maria', ago: 4 * H, hype: 203, group: 'g-recetas', media: [{ type: 'image', url: pic('ramen-bowl'), alt: 'Bol de ramen con huevo marinado y cebollino', filter: 'warm' }], comments: [['u-leo', 'Esto es arte 😍'], ['u-sofia', 'Receta guardada en mi carpeta 🍜']], body: 'Ramen express en **15 minutos** 🍜\n\n1. Caldo: miso + ajo + jengibre\n2. Fideos 3 min\n3. Huevo marinado (la noche anterior)\n4. Cebollino y sésamo\n\n¿Lo prueban este finde? #recetas #ramen' },
  { id: 'post-gif-ship', author: 'u-sofia', ago: 5 * H, hype: 58, media: [{ type: 'gif', url: 'assets/gifs/ship-it.gif', alt: 'GIF animado con el texto SHIP IT' }], body: 'Viernes, 17:59. Último deploy de la semana. ||Sí, sin tests|| 🙈 #devlife' },
  { id: 'post-design', author: 'u-valen', ago: 6 * H, hype: 131, group: 'g-diseno', media: [
    { type: 'image', url: pic('palette-ui-1', 900, 900), alt: 'Interfaz con tonos violeta', filter: 'vivid' },
    { type: 'image', url: pic('palette-ui-2', 900, 900), alt: 'Detalle de tipografía', filter: 'none' },
    { type: 'image', url: pic('palette-ui-3', 900, 900), alt: 'Paleta en tonos cálidos', filter: 'retro' },
    { type: 'image', url: pic('palette-ui-4', 900, 900), alt: 'Composición minimalista', filter: 'noir' },
  ], body: 'Moodboard para el rediseño de una app de finanzas 🎨\n\n**Regla 60-30-10:** 60% neutro, 30% secundario, 10% acento. ¿Cuál de las 4 les gusta más? #diseño #ui' },
  { id: 'post-game-score', author: 'u-kai', ago: 7 * H, hype: 77, kind: 'game', game: { gameId: 'dodge', score: 2840 }, body: 'Nuevo récord en **Esquiva Orbital** 🛸 2.840 puntos. El que me supere elige el tema del próximo devlog. ¿Aceptan el reto? #juegos #reto' },
  { id: 'post-video-flower', author: 'u-valen', ago: 9 * H, hype: 95, media: [{ type: 'video', url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4', poster: '', alt: 'Flor abriéndose a cámara lenta', width: 1280, height: 720 }], body: 'Timelapse de una flor abriéndose 🌼 en HD. Lo usaré como referencia de *easing* para animaciones: lento-rápido-lento. #motion #diseño' },
  { id: 'post-ia-explain', author: 'u-ana', ago: 11 * H, hype: 189, group: 'g-ia', body: '¿Qué es un **embedding**? Explicado en 3 líneas 🧠\n\n> Es convertir texto (o imágenes) en una lista de números, de forma que cosas *parecidas* queden *cerca*.\n\nAsí funcionan los buscadores semánticos y las recomendaciones. Pregúntale a **Hype IA** si quieres un ejemplo con código. #ia #ml' },
  { id: 'post-project-share', author: 'u-kai', ago: 14 * H, hype: 66, kind: 'project', project: 'p-pixel', body: '¡Por fin lancé **PixelForge**! 👾 Editor de pixel art en el navegador, gratis y open source. Feedback bienvenido.' },
  { id: 'post-poll-food', author: 'u-maria', ago: 16 * H, hype: 41, poll: { options: ['Dulce 🍰', 'Salado 🧀'], counts: [133, 171], hoursLeft: -2 }, body: 'Encuesta eterna: ¿desayuno dulce o salado? ☕ #recetas' },
  { id: 'post-lofi', author: 'u-leo', ago: 18 * H, hype: 112, media: [{ type: 'image', url: pic('lofi-studio'), alt: 'Estudio de música con luces de neón', filter: 'neon' }], body: 'Nuevo beat lo-fi para programar: **"Commit de medianoche"** 🌙🎧\n\nBPM 72 · Do menor · vinilo + lluvia. ¿Quieren que suba la sesión completa como short? #música #lofi' },
  { id: 'post-gif-party', author: 'u-hype', ago: 20 * H, hype: 220, media: [{ type: 'gif', url: 'assets/gifs/party.gif', alt: 'GIF de confeti' }], body: '¡Ya somos **10.000** en Hype! 🎉 Gracias por cada post, cada hilo y cada 🔥.\n\nReto de la semana: comparte tu **proyecto** con la etiqueta #semanadehype y los 3 con más hype salen destacados.' },
  { id: 'post-js-tip', author: 'u-sofia', ago: 26 * H, hype: 143, group: 'g-devs', body: '`structuredClone()` ya está en todos los navegadores modernos 🎉 Adiós a `JSON.parse(JSON.stringify(obj))`:\n\n```js\nconst copia = structuredClone(original);\n// ✅ Fechas, Map, Set y referencias circulares\n```\n\n~~lodash.cloneDeep~~ ya no hace falta para esto. #javascript' },
  { id: 'post-thread-ui', author: 'u-valen', ago: 30 * H, hype: 98, thread: [
    '5 errores de UI que veo en casi todos los portfolios 🧵',
    '1. **Contraste bajo.** Gris claro sobre blanco se ve elegante… y nadie lo puede leer. Mínimo 4.5:1 para texto.',
    '2. **Demasiadas fuentes.** Una familia con 2-3 pesos es suficiente.',
    '3. **Botones que no parecen botones.** Si hay que adivinar, ya perdiste.\n4. **Sin estados vacíos.** ¿Qué ve alguien nuevo?\n5. **Animaciones eternas.** Más de 300 ms se siente lento. #diseño #ux',
  ] },
  { id: 'post-salad', author: 'u-maria', ago: 34 * H, hype: 71, media: [{ type: 'image', url: pic('fresh-salad'), alt: 'Ensalada de colores', filter: 'vivid' }, { type: 'image', url: pic('fresh-bowl'), alt: 'Bowl con quinoa', filter: 'fade' }], body: 'Bowl de quinoa, mango y aguacate 🥗 Listo en 10 min. Aliño: lima + miel + chile. #recetas #saludable' },
  { id: 'post-gif-gg', author: 'u-kai', ago: 40 * H, hype: 39, media: [{ type: 'gif', url: 'assets/gifs/gg.gif', alt: 'GIF con el texto GG' }], body: 'Cuando por fin pasas el nivel 30 de Memoria Hype sin fallar 🧠 #juegos' },
  { id: 'post-founders', author: 'u-diego', ago: 44 * H, hype: 22, group: 'g-founders', body: 'Métricas reales de este mes (solo para el grupo): MRR $4.2k, churn 3.1%, CAC $18. Pregunten lo que quieran 👇' },
  { id: 'post-sql', author: 'u-ana', ago: 52 * H, hype: 57, group: 'g-devs', body: 'Si usas **Supabase**, activa siempre RLS. Ejemplo de política para que cada quien vea solo sus marcadores:\n\n```sql\ncreate policy "solo mis marcadores"\non bookmarks for select\nusing (auth.uid() = user_id);\n```\n#supabase #seguridad' },
];

/** Historias de demo (se regeneran en modo local para que siempre haya alguna activa). */
export const DEMO_STORIES = [
  { author: 'u-hype', caption: '¡Nuevo! Ya puedes subir historias de 24 h ✨ Toca «Tu historia» para crear la tuya', bg: ['#8b5cf6', '#ec4899'] },
  { author: 'u-maria', media: { type: 'image', url: pic('story-pancakes', 720, 1280) }, caption: 'Desayuno de domingo 🥞 receta mañana en mi perfil' },
  { author: 'u-sofia', caption: 'Hoy publiqué mi primer componente open source 🎉 ¡gracias por el hype!', bg: ['#6366f1', '#06b6d4'] },
  { author: 'u-kai', media: { type: 'image', url: pic('story-setup', 720, 1280) }, caption: 'Mi setup para el devlog de esta semana 🎮' },
  { author: 'u-valen', media: { type: 'image', url: pic('story-sunset', 720, 1280) }, caption: 'Paleta de hoy: atardecer 🌅' },
  { author: 'u-leo', media: { type: 'video', ...mix(1170) }, caption: 'Beat nuevo en camino 🎧' },
  { author: 'u-diego', caption: 'Día 13 construyendo en público: ¡1.000 usuarios! 🚀', bg: ['#f97316', '#ef4444'] },
  { author: 'u-kai', media: { type: 'image', url: pic('story-arcade', 720, 1280) }, caption: '¿Alguien me supera en Esquiva Orbital? 🛸' },
];
