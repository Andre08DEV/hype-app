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
js/components/        Post, editor de posts/hilos, editor Markdown, medios, selectores
js/views/             Feed, shorts, juegos, grupos, proyectos, perfil, ajustes…
js/games/             Los 5 mini-juegos
supabase/schema.sql   Base de datos completa con RLS
supabase/reset.sql    Limpieza de esquemas antiguos (destructivo)
supabase/functions/hype-ai/  Edge Function proxy de Gemini
```

## 🔒 Seguridad

- Todo el texto de usuario se escapa antes de renderizarse. El Markdown se aplica sobre texto ya escapado y solo permite enlaces `http(s)`/`mailto`.
- RLS en todas las tablas:
  - Marcadores, notificaciones y mensajes solo los ven sus dueños.
  - Los posts de grupos privados solo los ven sus miembros.
  - Los contadores (hype, comentarios, seguidores) solo los cambian triggers del servidor.
  - Los votos de encuestas son anónimos.
- La API key de Gemini nunca va en el código: queda en tu navegador (opción A) o en el servidor (opción B).
- Las puntuaciones de los juegos se calculan en el navegador, así que no son a prueba de trampas.

## Créditos

- Vídeos de ejemplo: [Mixkit](https://mixkit.co) (licencia gratuita) y MDN (CC0).
- Fotos de ejemplo: [Unsplash](https://unsplash.com) vía [Picsum](https://picsum.photos).
- GIFs, iconos y juegos: creados para Hype.
