# ⚡ Hype — red social para creadores

Hype es una red social para publicar, compartir y **darle hype** (el "like" de Hype 🔥) a lo que te inspira. Incluye posts enriquecidos con Markdown, hilos nativos, shorts con scroll infinito, proyectos, grupos, mini-juegos y **Hype IA** (con Gemini).

Funciona **sin instalar nada**: son archivos estáticos (HTML + CSS + módulos JS), así que puedes publicarlo en GitHub Pages.

- **Modo demo local** (por defecto): todo se guarda en tu navegador, con contenido y usuarios de ejemplo que reaccionan a lo que publicas.
- **Modo nube (Supabase)**: cuentas reales, base de datos con seguridad RLS, subida de archivos y tiempo real.

---

## ✨ Funciones

| Área | Qué incluye |
|---|---|
| **Posts enriquecidos** | Texto con Markdown, hasta 4 imágenes con **filtros** (Vívido, Noir, Retro, Neón…) y texto alternativo, **GIFs** (GIPHY o integrados), **vídeo HD** con miniatura automática, **encuestas en vivo** (1 h a 7 días, opción única o múltiple), contenido sensible difuminado, audiencia (pública, seguidores o grupo). |
| **Hilos nativos** | Encadena hasta 25 posts antes de publicar ("Añadir al hilo"). Se publican juntos en una sola transacción. En el feed se expanden en línea y tienen vista de hilo completo. También se pueden dividir automáticamente (o con IA). |
| **Editor Markdown** | Barra de formato: negrita, cursiva, tachado, `código`, bloques de código con resaltado, enlaces, citas, listas, títulos y `\|\|spoilers\|\|`. Atajos Ctrl+B / I / E / K, vista previa, autocompletado de @menciones y borradores automáticos. |
| **Hype** | Botón 🔥 con animación en posts, shorts (doble toque) y proyectos. |
| **Marcadores privados** | Guarda posts en carpetas ("Recetas", "Trabajo"…), muévelos, renómbralas y cámbiales el icono. Solo tú los ves (en la nube lo garantiza RLS). |
| **Feed y filtros** | Pestañas Para ti / Siguiendo / Recientes / Top, filtros por tipo (texto, imágenes, vídeos, GIFs, encuestas, hilos, código, proyectos, juegos) y por período, scroll infinito y aviso de "posts nuevos". Palabras y usuarios silenciados, y opción "No me interesa". |
| **Shorts** | Vídeos verticales a pantalla completa con scroll infinito, reproducción automática, doble toque para dar hype, comentarios, guardar y compartir. Cada pocos vídeos aparece un **playable** que se juega ahí mismo. |
| **Juegos (playables)** | 5 mini-juegos originales: *Esquiva Orbital*, *Reflejo Neón*, *Memoria Hype*, *Code Sprint* y *Choque de Colores*. Tienen récords, ranking y "Retar a la comunidad" (publica tu puntuación como post jugable). |
| **Proyectos** | Vitrina con ranking por hype (tendencia, nuevos, más hype), etapas (idea → lanzado), enlaces a demo y código, feedback, **review de Hype IA** y generación de la ficha con IA. |
| **Grupos** | Públicos o privados (con solicitudes que aprueba el admin), feed propio, miembros y publicación directa en el grupo. |
| **Hype IA (Gemini)** | Chat con streaming e imágenes, ideas de posts, "¿Qué me perdí?". En el editor: mejorar, acortar, cambiar tono, traducir, hashtags, convertir en hilo y crear encuestas. También resume y explica posts, genera texto alternativo y sugiere respuestas. |
| **Social** | Perfiles con portada, bio en Markdown, enlaces e intereses; seguidores; **mensajes privados** en tiempo real; notificaciones; explorar y buscar; tendencias. |
| **Historias (24 h)** | Barra de historias en el inicio. Puedes subir una foto (con filtros), un vídeo o un texto sobre un fondo de color. El visor es a pantalla completa: avanza solo, tocas a la derecha o a la izquierda para pasar, mantienes pulsado para pausar y deslizas hacia abajo para cerrar. Puedes responder o mandar 🔥 por mensaje privado. En las tuyas ves quién las vio y puedes borrarlas. |
| **Repostear y citar** | Botón 🔁 en cada post: repostea (aparece en tu perfil y en los feeds Siguiendo y Recientes) o cita el post con tu comentario. El autor recibe un aviso. |
| **Post fijado** | Fija uno de tus posts arriba del todo en tu perfil, desde el menú «⋯» del post. |
| **Logros** | 13 insignias en el perfil, como primer post, 100 de hype, seguidores, proyectos, récords en los juegos o racha de 7 días. La pestaña «Logros» muestra tu progreso. |
| **Notas de voz y fotos en mensajes** | En los chats puedes grabar notas de voz (hasta 2 min, con forma de onda y velocidad 1×/1,5×/2×) y mandar fotos y GIFs. En la nube van a un bucket **privado**: solo las personas del chat pueden abrirlas, mediante enlaces firmados que caducan. |
| **Videollamadas** | Llamadas de vídeo y de voz 1 a 1 desde un chat o un perfil. Permiten silenciar el micrófono, apagar la cámara, cambiar de cámara en el móvil, compartir pantalla en el ordenador y minimizar la llamada para seguir navegando. Incluyen aviso de llamada entrante con tono y vibración, y registro de la llamada en el chat. En modo demo puedes llamar a los usuarios de ejemplo. |
| **Ajustes avanzados** | Tema (oscuro, claro, AMOLED, sistema), 9 colores de acento + uno personalizado, tamaño de texto, esquinas, densidad, autoplay, ahorro de datos, filtros de contenido, privacidad de mensajes, notificaciones (incluidas las del navegador), modelo y personalidad de la IA, conexión a la nube, accesibilidad, exportar datos y modo desarrollador. |
| **Extras** | Racha diaria 🔥 (conserva la de la versión anterior), atajos de teclado (`?` para verlos), PWA instalable y diseño adaptado a móvil y escritorio. |

---

## 🚀 Empezar (modo demo, 1 minuto)

Los navegadores no cargan módulos JS desde `file://`, así que hay que abrirlo con un servidor:

```bash
npx serve .
```

o bien:

```bash
python3 -m http.server 8080
```

Luego abre la dirección que te indique (p. ej. http://localhost:8080) y pulsa **Crear mi perfil**.

### Publicar en GitHub Pages

1. En GitHub: **Settings → Pages → Build and deployment → Deploy from a branch**.
2. Elige la rama y la carpeta `/ (root)` y guarda.
3. Tu web quedará en `https://<usuario>.github.io/hype-app/`.

---

## ☁️ Activar la nube (Supabase)

1. Crea un proyecto gratis en [supabase.com](https://supabase.com).
2. **SQL Editor → New query**: pega todo el contenido de [`supabase/schema.sql`](supabase/schema.sql) y pulsa **Run**. Crea tablas, políticas RLS, triggers (contadores y notificaciones), funciones, el bucket `media` y el tiempo real. Puedes volver a ejecutarlo para actualizar.
   - ⚠️ Si tu proyecto tiene tablas de una versión anterior de Hype (`profiles`, `posts`, `messages`, `friendships`…) con otra estructura, ejecuta antes [`supabase/reset.sql`](supabase/reset.sql). **Ese script borra esos datos.**
3. **Authentication → URL Configuration**: pon la URL de tu web en *Site URL* y añádela en *Redirect URLs* (también `http://localhost:8080` si pruebas en local).
4. (Opcional) **Authentication → Providers**: activa Google y/o GitHub.
5. Copia la **Project URL** y la clave **anon / publishable** (Project Settings → API). Pégalas en [`config.js`](config.js) o en la app, en **Ajustes → Nube → Conectar**.

> La clave anon/publishable es pública por diseño: la protegen las políticas RLS. **Nunca** pongas la `service_role` / secret key en el frontend; la app la detecta y la rechaza.

Límites: en el plan gratuito de Supabase cada archivo puede pesar hasta 50 MB (el bucket ya está configurado así).

---

## 🤖 Activar Hype IA (Gemini)

Por defecto usa **`gemini-3.8-flash`**. Puedes elegir otro modelo en **Ajustes → Hype IA**.

**Opción A — Tu propia API key (ideal para la demo):** consigue una gratis en [Google AI Studio](https://aistudio.google.com/apikey) y pégala en **Ajustes → Hype IA**. Se guarda solo en tu navegador.

**Opción B — Edge Function (recomendada si publicas la web):** la key vive en el servidor y cada usuario tiene un límite diario.

```bash
supabase login
```

```bash
supabase link --project-ref TU_PROJECT_REF
```

```bash
supabase secrets set GEMINI_API_KEY=tu_api_key
```

```bash
supabase functions deploy hype-ai
```

Opcional: `supabase secrets set GEMINI_MODEL=gemini-3.8-flash AI_DAILY_LIMIT=100`. Con la nube activa y la sesión iniciada, Hype IA usa la función automáticamente.

---

## 🆕 Actualizar la base de datos (historias, reposts, notas de voz…)

Si ya tenías Hype en Supabase, vuelve a ejecutar [`supabase/schema.sql`](supabase/schema.sql) en el **SQL Editor**. Es seguro, no borra datos. Añade:

- Las tablas `stories` y `story_views`. Las historias caducan a las 24 h y solo el autor ve quién las vio.
- Los reposts y las citas (`repost_of`, `quote_of`, `repost_count`) y el post fijado (`pinned_post_id`).
- Los adjuntos en mensajes (`messages.media`) y el bucket privado `dm-media`.

Hasta que lo ejecutes, la web sigue funcionando como antes. Las funciones nuevas muestran el aviso «vuelve a ejecutar supabase/schema.sql».

## 📹 Videollamadas

Las llamadas usan **WebRTC**: el audio y el vídeo viajan directamente entre los dos navegadores, cifrados de extremo a extremo, y Supabase Realtime solo sirve para conectarlos. No hace falta otro servidor.

1. Vuelve a ejecutar [`supabase/schema.sql`](supabase/schema.sql) en el SQL Editor. Es seguro: no borra datos, solo añade la tabla `calls` con sus políticas RLS y la activa en tiempo real.
2. Llama desde un chat (iconos 📞 y 📹) o desde el botón 📹 del perfil de alguien.

Cosas a tener en cuenta:

- La otra persona tiene que tener Hype abierto (en cualquier pestaña) para recibir la llamada.
- Solo puedes llamar a alguien con quien ya tienes un chat. Se respeta su ajuste de "¿Quién puede escribirte?".
- En **Ajustes → Llamadas** puedes desactivar las llamadas entrantes, entrar con el micrófono o la cámara apagados y probar tu cámara y micrófono.
- Para casi todas las conexiones bastan los servidores STUN públicos que ya vienen configurados. En redes muy restrictivas (algunas empresas o datos móviles con NAT estricto) puede hacer falta un servidor **TURN**: añádelo en `config.js` así:

```js
iceServers: [{ urls: 'turn:tu-servidor:3478', username: 'usuario', credential: 'clave' }],
```

## 🎞️ GIFs

Sin configurar nada tienes 8 GIFs integrados (originales de Hype). Para buscar en millones de GIFs, crea una key gratis en [developers.giphy.com](https://developers.giphy.com) y pégala en **Ajustes → Integraciones** o en `config.js` (`giphyApiKey`). La API de Tenor cerró en junio de 2026, por eso se usa GIPHY.

---

## 🗂️ Estructura

```
index.html            Punto de entrada (sin paso de compilación)
config.js             Configuración pública (Supabase, GIPHY, modelo IA)
css/app.css           Sistema de diseño (tokens, temas, componentes)
js/main.js            Armazón, rutas, atajos, racha y avisos
js/core/              DOM seguro, router, estado/ajustes, Markdown, iconos, UI
js/data/              Backend local (demo) y backend Supabase con la misma API
js/ai/gemini.js       Cliente de Gemini (streaming, tareas de IA)
js/components/        Post, editor de posts/hilos, editor Markdown, medios, selectores,
                      historias (stories.js), adjuntos de mensajes (dm-media.js), logros
js/views/             Feed, shorts, juegos, grupos, proyectos, perfil, ajustes…
js/games/             Los 5 mini-juegos
js/calls/             Videollamadas: WebRTC (core.js) e interfaz (ui.js)
supabase/schema.sql   Base de datos completa con RLS
supabase/reset.sql    Limpieza de esquemas antiguos (destructivo)
supabase/functions/hype-ai/  Edge Function proxy de Gemini
```

## 🔒 Seguridad

- Todo el texto de usuario se escapa antes de renderizarse. El Markdown se aplica sobre texto ya escapado y solo permite enlaces `http(s)`/`mailto`.
- RLS en todas las tablas:
  - Marcadores, notificaciones y mensajes solo los ven sus dueños.
  - Las notas de voz y fotos de los mensajes van a un bucket privado que solo pueden leer las personas del chat.
  - Las listas de quién vio una historia solo las ve su autor.
  - Los posts de grupos privados solo los ven sus miembros.
  - Los contadores (hype, comentarios, seguidores) solo los cambian triggers del servidor.
  - Los votos de encuestas son anónimos.
- La API key de Gemini nunca va en el código: queda en tu navegador (opción A) o en el servidor (opción B).
- Las puntuaciones de los juegos se calculan en el navegador, así que no son a prueba de trampas.

## Créditos

- Vídeos de ejemplo: [Mixkit](https://mixkit.co) (licencia gratuita) y MDN (CC0).
- Fotos de ejemplo: [Unsplash](https://unsplash.com) vía [Picsum](https://picsum.photos).
- GIFs, iconos y juegos: creados para Hype.
