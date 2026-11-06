// Ajustes avanzados.
import { html, $, $$ } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { state, bus, updateSettings, resetSettings, ACCENTS, AI_MODELS } from '../core/store.js';
import { api, cloudConfig } from '../data/api.js';
import { formatBytes, downloadFile } from '../core/utils.js';
import { toast, toastError, confirmDialog, promptDialog, setLoading, switchHtml } from '../core/ui.js';
import { navigate } from '../core/router.js';
import { avatar } from '../components/common.js';
import { KINDS } from './feed.js';
import { storageEstimate } from '../data/media-store.js';
import { showShortcutsInline } from './settings-shortcuts.js';

export const APP_VERSION = '2.0.0';

const SECTIONS = [
  { id: 'cuenta', label: 'Cuenta', icon: 'user' },
  { id: 'apariencia', label: 'Apariencia', icon: 'palette' },
  { id: 'contenido', label: 'Feed y filtros', icon: 'filter' },
  { id: 'privacidad', label: 'Privacidad', icon: 'shield' },
  { id: 'notificaciones', label: 'Notificaciones', icon: 'bell' },
  { id: 'ia', label: 'Hype IA', icon: 'sparkles' },
  { id: 'nube', label: 'Nube (Supabase)', icon: 'cloud' },
  { id: 'integraciones', label: 'Integraciones', icon: 'layers' },
  { id: 'accesibilidad', label: 'Accesibilidad', icon: 'eye' },
  { id: 'datos', label: 'Datos', icon: 'database' },
  { id: 'atajos', label: 'Atajos', icon: 'keyboard' },
  { id: 'avanzado', label: 'Avanzado', icon: 'code' },
];

const get = (path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), state.settings);
const patchFor = (path, value) => path.split('.').reverse().reduce((acc, k) => ({ [k]: acc }), value);

const toggle = (path, title, desc = '') => html`<label class="set-row" style="cursor:pointer"><span class="meta"><b>${title}</b>${desc ? html`<span>${desc}</span>` : ''}</span>${switchHtml(path, !!get(path), `data-set="${path}" data-type="bool"`)}</label>`;
const seg = (path, title, desc, options) => html`<div class="set-row stack-mobile"><span class="meta"><b>${title}</b>${desc ? html`<span>${desc}</span>` : ''}</span><div class="segmented">${options.map(([v, l]) => html`<button type="button" class="${String(get(path)) === String(v) ? 'active' : ''}" data-seg="${path}" data-value="${v}">${l}</button>`)}</div></div>`;
const group = (title, rows) => html`<section class="set-group">${title ? html`<div class="set-title">${title}</div>` : ''}${rows}</section>`;

function tagInput(path, placeholder) {
  const items = get(path) || [];
  return html`<div class="tag-input" data-tags="${path}">${items.map((w, i) => html`<span class="chip active">${w}<button type="button" class="x" data-tag-del="${i}" aria-label="Quitar ${w}">${icon('x', { size: 12 })}</button></span>`)}<input placeholder="${placeholder}" data-tag-add aria-label="${placeholder}"></div>`;
}

// ---------------- Secciones ----------------
function secCuenta() {
  const u = state.user;
  const cloud = api.mode === 'cloud';
  return html`<h2>Cuenta</h2>
    ${u ? group('', html`<div class="set-row">${avatar(u, 'lg')}<span class="meta"><b>${u.displayName}</b><span>@${u.username}${cloud && api.session?.user?.email ? ` · ${api.session.user.email}` : ''}</span></span><button class="btn btn-secondary btn-sm" data-edit-profile>${icon('edit', { size: 14 })} Editar perfil</button></div>
      <div class="set-row"><span class="meta"><b>Modo</b><span>${cloud ? `☁️ Nube · ${api.host}` : '💾 Demo local: tus datos viven en este navegador'}</span></span><a class="btn btn-ghost btn-sm" href="#/ajustes/nube">Cambiar</a></div>`)
      : group('', html`<div class="set-row"><span class="meta"><b>No has iniciado sesión</b><span>Crea tu perfil para publicar, dar hype y guardar.</span></span><a class="btn btn-primary btn-sm" href="#/bienvenida">Entrar</a></div>`)}
    ${u && cloud ? group('Seguridad', html`<form class="set-block" data-password><b class="small">Cambiar contraseña</b><div class="row"><input class="input" name="pw" type="password" minlength="6" placeholder="Nueva contraseña (mín. 6)" autocomplete="new-password"><button class="btn btn-secondary" type="submit">Actualizar</button></div></form>`) : ''}
    ${u ? group('Sesión', html`<div class="set-row"><span class="meta"><b>Cerrar sesión</b><span>${cloud ? 'Saldrás en este dispositivo.' : 'Tu perfil local seguirá guardado para volver a entrar.'}</span></span><button class="btn btn-secondary btn-sm" data-signout>${icon('logout', { size: 14 })} Salir</button></div>
      <div class="set-row"><span class="meta"><b style="color:var(--danger)">Eliminar cuenta</b><span>${cloud ? 'Borra tu cuenta y todo tu contenido de forma permanente.' : 'Borra el perfil y todos los datos locales de la demo.'}</span></span><button class="btn btn-danger btn-sm" data-delete-account>Eliminar</button></div>`) : ''}`;
}

function secApariencia() {
  const s = state.settings;
  const themes = [['dark', 'Oscuro', '#10131d', '#eef1fa'], ['light', 'Claro', '#ffffff', '#0f1222'], ['amoled', 'AMOLED', '#000000', '#f4f4f7'], ['system', 'Sistema', 'linear-gradient(90deg,#fff 50%,#10131d 50%)', '#888']];
  return html`<h2>Apariencia</h2>
    ${group('Tema', html`<div class="set-block"><div class="theme-cards">${themes.map(([id, name, bg, fg]) => html`<button type="button" class="theme-card ${s.theme === id ? 'active' : ''}" data-seg="theme" data-value="${id}"><div class="preview" style="background:${bg}"><i style="background:${fg};opacity:.8;width:60%"></i><i style="background:${fg};opacity:.4"></i><i style="background:var(--accent-grad);width:40%"></i></div><div class="name">${id === 'dark' ? icon('moon', { size: 14 }) : id === 'light' ? icon('sun', { size: 14 }) : id === 'system' ? icon('monitor', { size: 14 }) : '⚫'} ${name}</div></button>`)}</div></div>`)}
    ${group('Color de acento', html`<div class="set-block"><div class="swatches">${Object.entries(ACCENTS).map(([id, a]) => html`<button type="button" class="swatch ${s.accent === id ? 'active' : ''}" data-seg="accent" data-value="${id}" style="--s1:${a.colors[0]};--s2:${a.colors[1]}" title="${a.name}" aria-label="${a.name}"></button>`)}
      <button type="button" class="swatch ${s.accent === 'custom' ? 'active' : ''}" data-seg="accent" data-value="custom" style="--s1:${s.customAccent[0]};--s2:${s.customAccent[1]}" title="Personalizado" aria-label="Personalizado"></button></div>
      <div class="row small" style="gap:10px">Personalizado: <input type="color" data-custom="0" value="${s.customAccent[0]}" aria-label="Color 1"><input type="color" data-custom="1" value="${s.customAccent[1]}" aria-label="Color 2"></div></div>`)}
    ${group('Texto y forma', html`<div class="set-block"><div class="row" style="justify-content:space-between"><b class="small">Tamaño del texto</b><span class="small dim" data-fs-label>${Math.round(s.fontScale * 100)}%</span></div><input type="range" min="0.85" max="1.3" step="0.05" value="${s.fontScale}" data-range="fontScale" aria-label="Tamaño del texto"></div>
      ${seg('radiusScale', 'Esquinas', '', [[0.35, 'Rectas'], [0.7, 'Suaves'], [1, 'Redondas'], [1.4, 'Extra']])}
      ${seg('density', 'Densidad', 'Compacta muestra más contenido en pantalla.', [['comfortable', 'Cómoda'], ['compact', 'Compacta']])}`)}
    ${group('Vista previa', html`<div class="set-block"><div class="card card-pad col" style="gap:8px"><div class="row" style="gap:10px">${avatar(state.user || { username: 'hype', avatarEmoji: '⚡' }, 'md')}<b>Así se ven tus posts</b></div><p class="md">Texto con **negrita**, *cursiva* y \`código\`.</p><div class="row"><button class="btn btn-primary btn-sm">Botón</button><span class="pill accent">Etiqueta</span><span class="pill hype">🔥 128</span></div></div></div>`)}`;
}

function secContenido() {
  const s = state.settings;
  return html`<h2>Feed y filtros</h2>
    ${group('Feed', html`${seg('defaultFeed', 'Pestaña inicial', '', [['foryou', 'Para ti'], ['following', 'Siguiendo'], ['recent', 'Recientes'], ['top', 'Top']])}
      ${toggle('showHypeCounts', 'Mostrar el hype de mis posts', 'Desactívalo si prefieres no ver los números de tus publicaciones.')}`)}
    ${group('Vídeo y datos', html`${toggle('autoplayVideos', 'Reproducir vídeos automáticamente', 'En el feed, al aparecer en pantalla (en silencio).')}
      ${toggle('muteVideos', 'Vídeos silenciados por defecto')}
      ${toggle('dataSaver', 'Ahorro de datos', 'Sin autoplay e imágenes subidas más ligeras.')}
      ${toggle('hdUploads', 'Subir imágenes en HD', 'Hasta 2560 px. Si lo desactivas, 1600 px.')}`)}
    ${group('Filtros de contenido', html`${toggle('blurSensitive', 'Difuminar contenido sensible', 'Los posts marcados como sensibles se muestran borrosos hasta que los toques.')}
      <div class="set-block"><b class="small">Palabras silenciadas</b><span class="hint">Los posts que las contengan no aparecerán en tu feed.</span>${tagInput('mutedWords', 'Añadir palabra y pulsar Enter')}</div>
      <div class="set-block"><b class="small">Ocultar tipos de contenido</b><div class="chips" style="flex-wrap:wrap">${KINDS.filter((k) => k.id !== 'all').map((k) => html`<button type="button" class="chip ${s.hiddenKinds.includes(k.id) ? 'active' : ''}" data-kind-toggle="${k.id}">${s.hiddenKinds.includes(k.id) ? '🚫 ' : ''}${k.label}</button>`)}</div></div>
      <div class="set-block"><b class="small">Usuarios silenciados</b>${s.mutedUsers.length ? html`<div class="row-wrap">${s.mutedUsers.map((u) => html`<span class="chip active">@${u}<button type="button" class="x" data-unmute="${u}" aria-label="Dejar de silenciar">${icon('x', { size: 12 })}</button></span>`)}</div>` : html`<span class="hint">No has silenciado a nadie. Hazlo desde el menú ⋯ de cualquier post.</span>`}</div>
      <div class="set-row"><span class="meta"><b>Posts ocultos («No me interesa»)</b><span>${s.hiddenPosts.length} ocultos</span></span><button class="btn btn-ghost btn-sm" data-reset-hidden ${s.hiddenPosts.length ? '' : 'disabled'}>Restablecer</button></div>`)}`;
}

function secPrivacidad() {
  return html`<h2>Privacidad y seguridad</h2>
    ${group('Publicaciones', html`${seg('defaultVisibility', 'Audiencia por defecto', 'Puedes cambiarla en cada post.', [['public', '🌐 Público'], ['followers', '🔒 Seguidores']])}`)}
    ${group('Mensajes', html`${seg('dmPolicy', '¿Quién puede escribirte?', '', [['everyone', 'Todo el mundo'], ['followers', 'Gente que sigo'], ['nobody', 'Nadie']])}`)}
    ${group('Tus datos', html`<div class="set-block"><div class="notice">${icon('lock')}<span><b>Tus marcadores y carpetas son 100% privados.</b> ${api.mode === 'cloud' ? 'Las políticas RLS de Supabase impiden que nadie más los lea.' : 'En modo demo nunca salen de tu navegador.'}</span></div>
      <div class="notice">${icon('shield')}<span>Los votos de las encuestas son anónimos: solo se muestran los totales.</span></div></div>`)}`;
}

function secNotificaciones() {
  const supported = 'Notification' in window;
  return html`<h2>Notificaciones</h2>
    ${group('Avisarme cuando…', html`${toggle('notify.hype', '🔥 Alguien da hype a mis posts')}${toggle('notify.comment', '💬 Comentan mis posts')}${toggle('notify.mention', '📣 Me mencionan')}${toggle('notify.follow', '👋 Alguien me sigue')}${toggle('notify.project', '🚀 Actividad en mis proyectos')}${toggle('notify.group', '👥 Actividad en mis grupos')}${toggle('notify.message', '✉️ Mensajes nuevos')}`)}
    ${group('Cómo', html`${toggle('notify.browser', 'Avisos del navegador', supported ? `Permiso actual: ${Notification.permission === 'granted' ? 'concedido ✅' : Notification.permission === 'denied' ? 'bloqueado ❌ (cámbialo en el candado de la barra de direcciones)' : 'sin decidir'}` : 'Tu navegador no los soporta.')}
      ${toggle('notify.sound', 'Sonido al recibir avisos')}`)}`;
}

function secIA() {
  const s = state.settings.ai;
  const models = AI_MODELS.some((m) => m.id === (s.model || 'gemini-3.8-flash')) ? AI_MODELS : [...AI_MODELS, { id: s.model, name: s.model, note: '' }];
  const cloud = api.mode === 'cloud';
  return html`<h2>Hype IA ✨</h2>
    <div class="notice" data-ai-status>${icon('sparkles')}<span data-ai-status-text>Comprobando…</span></div>
    ${group('General', html`${toggle('ai.enabled', 'Activar Hype IA', 'Asistente, herramientas del editor, resúmenes y reviews de proyectos.')}
      ${toggle('ai.composerTools', 'Botón ✨ en el editor de posts')}`)}
    ${group('Tu API key de Gemini', html`<div class="set-block">
      <span class="hint">${cloud ? 'Opcional en modo nube: si la dejas vacía se usa la Edge Function «hype-ai» del proyecto (recomendado).' : 'Necesaria en modo demo. Se guarda solo en este navegador y se envía directamente a Google.'}</span>
      <div class="row"><input class="input" type="password" data-ai-key value="${s.apiKey}" placeholder="AIza…" autocomplete="off" aria-label="API key de Gemini"><button type="button" class="btn btn-secondary" data-ai-key-toggle aria-label="Mostrar">${icon('eye', { size: 16 })}</button></div>
      <div class="row-wrap"><button type="button" class="btn btn-primary btn-sm" data-ai-save>Guardar y probar</button>${s.apiKey ? html`<button type="button" class="btn btn-ghost btn-sm" data-ai-remove>Quitar key</button>` : ''}<a class="btn btn-ghost btn-sm" href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">${icon('external', { size: 14 })} Conseguir una gratis</a></div>
      <div class="notice warn">${icon('alert')}<span>No compartas tu key ni la pongas en <code>config.js</code> si publicas la web: cualquiera podría usarla. Para producción usa la Edge Function.</span></div>
    </div>`)}
    ${group('Modelo y estilo', html`<div class="set-row stack-mobile"><span class="meta"><b>Modelo</b><span>Por defecto: gemini-3.8-flash.</span></span>
        <select class="select" data-ai-model style="width:auto;min-width:240px">${models.map((m) => html`<option value="${m.id}" ${(s.model || 'gemini-3.8-flash') === m.id && !s.customModel ? 'selected' : ''}>${m.name}${m.note ? ` — ${m.note}` : ''}</option>`)}<option value="__custom" ${s.customModel ? 'selected' : ''}>Otro (escribir ID)…</option></select></div>
      ${s.customModel ? html`<div class="set-block"><input class="input" data-ai-custom value="${s.customModel}" placeholder="ID del modelo, ej. gemini-4-argon"></div>` : ''}
      ${seg('ai.thinking', 'Razonamiento', 'Bajo = más rápido. Alto = respuestas más elaboradas.', [['auto', 'Auto'], ['low', 'Bajo'], ['high', 'Alto']])}
      ${seg('ai.persona', 'Personalidad', '', [['amigable', '😊 Amigable'], ['profesional', '💼 Profesional'], ['divertido', '😂 Divertido'], ['tecnico', '🤓 Técnico']])}
      <div class="set-row"><span class="meta"><b>Idioma de las respuestas</b></span><select class="select" data-ai-lang style="width:auto">${[['es', 'Español'], ['en', 'Inglés'], ['pt', 'Portugués'], ['fr', 'Francés'], ['it', 'Italiano'], ['de', 'Alemán']].map(([v, l]) => html`<option value="${v}" ${s.language === v ? 'selected' : ''}>${l}</option>`)}</select></div>`)}
    ${group('Despliegue en la nube', html`<div class="set-block"><span class="hint">Para que toda tu comunidad use Hype IA sin exponer tu key, despliega la Edge Function incluida:</span><div class="code-snippet">supabase secrets set GEMINI_API_KEY=tu_key\nsupabase functions deploy hype-ai</div><span class="hint">Incluye un límite diario por usuario (AI_DAILY_LIMIT, por defecto 100).</span></div>`)}`;
}

function secNube() {
  const cfg = cloudConfig();
  const cloud = api.mode === 'cloud';
  return html`<h2>Nube (Supabase)</h2>
    ${group('Estado', html`<div class="set-row"><span class="status-dot ${cloud ? 'ok' : 'warn'}"></span><span class="meta"><b>${cloud ? `Conectado a ${api.host}` : 'Modo demo local'}</b><span>${cloud ? (state.user ? `Sesión: @${state.user.username}` : 'Sin sesión iniciada') : 'Los datos se guardan en este navegador. Conecta Supabase para cuentas reales, sincronización y tiempo real.'}</span></span></div>
      ${state.cloudError ? html`<div class="set-block"><div class="notice danger">${icon('alert')}<span>Último error al conectar: ${state.cloudError}</span></div></div>` : ''}`)}
    ${group('Conexión', html`<form class="set-block" data-cloud-form>
      <div class="field"><label for="sb-url">Project URL</label><input class="input" id="sb-url" name="url" value="${state.settings.cloud.url || cfg.url}" placeholder="https://abcdefgh.supabase.co" autocomplete="off"></div>
      <div class="field"><label for="sb-key">Clave pública (anon / publishable)</label><input class="input" id="sb-key" name="key" value="${state.settings.cloud.anonKey || cfg.key}" placeholder="eyJhbGciOi… o sb_publishable_…" autocomplete="off"><span class="hint">Es pública por diseño (la protege RLS). <b>Nunca</b> pegues aquí la service_role/secret key.</span></div>
      <div class="row-wrap"><button type="button" class="btn btn-secondary" data-cloud-test>${icon('activity', { size: 16 })} Probar conexión</button><button type="submit" class="btn btn-primary">${icon('cloud', { size: 16 })} Conectar y recargar</button>
      ${cloud || cfg.configured ? html`<button type="button" class="btn btn-ghost" data-cloud-local>Usar modo local</button>` : ''}</div>
      ${cfg.source === 'config.js' ? html`<div class="notice">${icon('check')}<span>Conexión fijada en <code>config.js</code>: funciona en cualquier navegador, perfil de Chrome, dispositivo o cuenta.</span></div>` : ''}
      ${cfg.source === 'ajustes' ? html`<div class="notice warn">${icon('alert')}<span><b>Esta conexión está guardada solo en este navegador.</b> En otro navegador, perfil de Chrome, dispositivo o en incógnito no estará y la app abrirá en modo demo. Para que sea permanente, pon la URL y la clave dentro de las comillas en <code>config.js</code>.</span></div>` : ''}
      <div data-cloud-result></div>
    </form>`)}
    ${group('Guía rápida', html`<div class="set-block small muted" style="line-height:1.7">
      <b style="color:var(--text)">1.</b> Crea un proyecto gratis en supabase.com.<br>
      <b style="color:var(--text)">2.</b> SQL Editor → pega y ejecuta <code>supabase/schema.sql</code> (crea tablas, RLS, triggers, storage y realtime).<br>
      <b style="color:var(--text)">3.</b> Authentication → URL Configuration: añade la URL de tu web en <i>Site URL</i> y <i>Redirect URLs</i>.<br>
      <b style="color:var(--text)">4.</b> (Opcional) Activa Google/GitHub en Authentication → Providers.<br>
      <b style="color:var(--text)">5.</b> Copia Project URL y la anon/publishable key aquí o en <code>config.js</code>.<br>
      <b style="color:var(--text)">6.</b> (Opcional) Despliega la Edge Function <code>hype-ai</code> para Hype IA.
    </div>`)}`;
}

function secIntegraciones() {
  return html`<h2>Integraciones</h2>
    ${group('GIPHY', html`<div class="set-block"><span class="hint">Activa la búsqueda de millones de GIFs en el editor. Consigue una key gratis en developers.giphy.com (sin key se usan los GIFs incluidos).</span>
      <div class="row"><input class="input" data-giphy value="${state.settings.giphyKey}" placeholder="API key de GIPHY" autocomplete="off"><button type="button" class="btn btn-primary" data-giphy-save>Guardar</button></div>
      <span class="hint">Nota: la API de Tenor cerró en junio de 2026, por eso Hype usa GIPHY.</span></div>`)}`;
}

function secAccesibilidad() {
  return html`<h2>Accesibilidad</h2>
    ${group('Movimiento y contraste', html`${toggle('reduceMotion', 'Reducir animaciones', 'Desactiva transiciones, explosiones de hype y efectos.')}${toggle('highContrast', 'Alto contraste', 'Textos y bordes más marcados.')}`)}
    ${group('Contenido', html`${toggle('requireAltText', 'Exigir texto alternativo en imágenes', 'No podrás publicar imágenes sin descripción (ALT).')}`)}
    ${group('Teclado', html`${toggle('keyboardShortcuts', 'Atajos de teclado', 'N para publicar, J/K para navegar, L para dar hype…')}${toggle('enterToSend', 'Enter envía en mensajes', 'Shift+Enter para salto de línea.')}`)}`;
}

function secDatos() {
  return html`<h2>Datos y almacenamiento</h2>
    ${group('Tus datos', html`<div class="set-row"><span class="meta"><b>Exportar mis datos</b><span>Descarga un JSON con tu perfil, posts, comentarios, marcadores, proyectos y récords.</span></span><button class="btn btn-secondary btn-sm" data-export>${icon('download', { size: 14 })} Exportar</button></div>
      ${api.mode === 'local' ? html`<div class="set-row"><span class="meta"><b>Almacenamiento usado</b><span data-storage>Calculando…</span></span></div>` : ''}`)}
    ${group('Restablecer', html`<div class="set-row"><span class="meta"><b>Restablecer ajustes</b><span>Vuelve a los valores por defecto (no borra tus datos ni tu API key de IA).</span></span><button class="btn btn-ghost btn-sm" data-reset-settings>Restablecer</button></div>
      ${api.mode === 'local' ? html`<div class="set-row"><span class="meta"><b style="color:var(--danger)">Borrar datos de la demo</b><span>Elimina tu perfil local, posts, fotos y vídeos guardados, y recarga el contenido de ejemplo.</span></span><button class="btn btn-danger btn-sm" data-reset-demo>Borrar</button></div>` : ''}`)}`;
}

function secAvanzado() {
  return html`<h2>Avanzado</h2>
    ${group('Demo', html`${toggle('simulateActivity', 'Simular actividad en modo demo', 'Usuarios de ejemplo reaccionan a tus posts, votan encuestas y publican de vez en cuando.')}`)}
    ${group('Desarrollo', html`${toggle('developer', 'Modo desarrollador', 'Muestra información de diagnóstico aquí abajo.')}
      ${state.settings.developer ? html`<div class="set-block"><div class="code-snippet" data-diag></div></div>` : ''}`)}
    ${group('Acerca de', html`<div class="set-row"><img src="assets/icon.svg" alt="" width="40" height="40" style="border-radius:12px"><span class="meta"><b>Hype ${APP_VERSION}</b><span>Red social para creadores · ${api.mode === 'cloud' ? 'Supabase' : 'demo local'} · Gemini</span></span></div>`)}`;
}

const RENDER = { cuenta: secCuenta, apariencia: secApariencia, contenido: secContenido, privacidad: secPrivacidad, notificaciones: secNotificaciones, ia: secIA, nube: secNube, integraciones: secIntegraciones, accesibilidad: secAccesibilidad, datos: secDatos, atajos: showShortcutsInline, avanzado: secAvanzado };

export function render(el, ctx) {
  let section = RENDER[ctx.params.section] ? ctx.params.section : (state.user ? 'cuenta' : 'apariencia');
  el.innerHTML = String(html`<div class="view-header"><h1>Ajustes</h1></div>
    <div class="settings-layout"><nav class="settings-nav" aria-label="Secciones de ajustes">${SECTIONS.map((s) => html`<a href="#/ajustes/${s.id}" class="${s.id === section ? 'active' : ''}" data-sec="${s.id}">${icon(s.icon, { size: 18 })} ${s.label}</a>`)}</nav><div class="settings-body" data-body></div></div>`);
  const body = $('[data-body]', el);

  const paint = () => {
    body.innerHTML = String(RENDER[section]());
    afterPaint();
  };

  const afterPaint = async () => {
    if (section === 'ia') {
      const { aiStatus, currentModel } = await import('../ai/gemini.js');
      const st = aiStatus();
      const box = $('[data-ai-status-text]', body);
      if (box) box.innerHTML = String(st.available ? html`<b>Activa</b> · ${st.label} · modelo <code>${currentModel()}</code>` : html`<b>No disponible:</b> ${st.message}`);
      $('[data-ai-status]', body)?.classList.toggle('warn', !st.available);
    }
    if (section === 'datos' && api.mode === 'local') {
      const est = await storageEstimate();
      const s = $('[data-storage]', body);
      if (s) s.textContent = est ? `${formatBytes(est.usage || 0)} de ${formatBytes(est.quota || 0)} disponibles en este navegador` : 'No disponible en este navegador';
    }
    if (section === 'avanzado' && state.settings.developer) {
      const d = $('[data-diag]', body);
      if (d) d.textContent = JSON.stringify({ version: APP_VERSION, mode: api.mode, host: api.host || null, user: state.user ? { id: state.user.id, username: state.user.username } : null, route: state.route?.path, theme: document.documentElement.dataset.theme, ua: navigator.userAgent, online: navigator.onLine, settings: { ...state.settings, ai: { ...state.settings.ai, apiKey: state.settings.ai.apiKey ? '••••' : '' } } }, null, 2);
    }
  };

  const set = (path, value) => {
    updateSettings(patchFor(path, value));
    if (['mutedWords', 'mutedUsers', 'hiddenKinds', 'hiddenPosts'].some((k) => path.startsWith(k))) bus.emit('filters:change');
  };

  el.addEventListener('click', async (e) => {
    const t = e.target;
    const sec = t.closest('[data-sec]');
    if (sec) { e.preventDefault(); section = sec.dataset.sec; history.replaceState(null, '', `#/ajustes/${section}`); $$('[data-sec]', el).forEach((a) => a.classList.toggle('active', a === sec)); paint(); return; }
    const sg = t.closest('[data-seg]');
    if (sg) {
      const path = sg.dataset.seg;
      let v = sg.dataset.value;
      if (path === 'radiusScale') v = Number(v);
      set(path, v);
      if (path === 'dmPolicy' && state.user) api.updateProfile({ dmPolicy: v }).catch(toastError);
      paint();
      return;
    }
    const kt = t.closest('[data-kind-toggle]');
    if (kt) { const k = kt.dataset.kindToggle; const cur = state.settings.hiddenKinds; set('hiddenKinds', cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]); paint(); return; }
    const um = t.closest('[data-unmute]');
    if (um) { set('mutedUsers', state.settings.mutedUsers.filter((u) => u !== um.dataset.unmute)); paint(); toast(`@${um.dataset.unmute} ya no está silenciado`); return; }
    const td = t.closest('[data-tag-del]');
    if (td) { const path = td.closest('[data-tags]').dataset.tags; const list = [...get(path)]; list.splice(Number(td.dataset.tagDel), 1); set(path, list); paint(); return; }
    if (t.closest('[data-reset-hidden]')) { set('hiddenPosts', []); paint(); toast('Posts ocultos restablecidos'); return; }
    if (t.closest('[data-edit-profile]')) { (await import('./profile.js')).openEditProfile(); return; }
    if (t.closest('[data-signout]')) {
      await api.signOut();
      sessionStorage.removeItem('hype:guest');
      (await import('../core/store.js')).setUser(null);
      toast('Sesión cerrada');
      navigate('/bienvenida', { replace: true });
      return;
    }
    if (t.closest('[data-delete-account]')) {
      const word = await promptDialog({ title: 'Eliminar cuenta', label: 'Escribe ELIMINAR para confirmar. Esta acción es permanente.', placeholder: 'ELIMINAR', confirmText: 'Eliminar para siempre' });
      if (word !== 'ELIMINAR') { if (word !== null) toast('No coincide: no se eliminó nada'); return; }
      try { await api.deleteAccount(); localStorage.removeItem('hype:draft'); location.hash = '#/bienvenida'; location.reload(); } catch (err) { toastError(err); }
      return;
    }
    if (t.closest('[data-ai-key-toggle]')) { const i = $('[data-ai-key]', body); i.type = i.type === 'password' ? 'text' : 'password'; return; }
    const aiSave = t.closest('[data-ai-save]');
    if (aiSave) {
      set('ai.apiKey', $('[data-ai-key]', body).value.trim());
      setLoading(aiSave, true);
      try { const { testAIKey } = await import('../ai/gemini.js'); const r = await testAIKey(); toast(r.slice(0, 80) || 'Hype IA responde ✨', { type: 'success' }); } catch (err) { toastError(err); }
      setLoading(aiSave, false);
      paint();
      return;
    }
    if (t.closest('[data-ai-remove]')) { set('ai.apiKey', ''); paint(); toast('API key eliminada de este navegador'); return; }
    if (t.closest('[data-giphy-save]')) { set('giphyKey', $('[data-giphy]', body).value.trim()); toast('Key de GIPHY guardada', { type: 'success' }); return; }
    const test = t.closest('[data-cloud-test]');
    if (test) {
      const form = $('[data-cloud-form]', body);
      const out = $('[data-cloud-result]', body);
      setLoading(test, true);
      try {
        const { SupabaseBackend } = await import('../data/supabase.js');
        const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm');
        const client = createClient(form.url.value.trim(), form.key.value.trim(), { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
        const { error } = await client.from('profiles').select('id', { head: true, count: 'exact' }).limit(1);
        if (error) throw new SupabaseBackend({ url: form.url.value.trim(), key: '' })._err(error);
        out.innerHTML = String(html`<div class="notice">${icon('check')}<span><b>¡Conexión correcta!</b> El esquema de Hype está instalado. Pulsa «Conectar y recargar».</span></div>`);
      } catch (err) {
        out.innerHTML = String(html`<div class="notice danger">${icon('alert')}<span>${err.message || 'No se pudo conectar. Revisa la URL y la clave.'}</span></div>`);
      }
      setLoading(test, false);
      return;
    }
    if (t.closest('[data-cloud-local]')) {
      if (!(await confirmDialog({ title: 'Volver al modo local', message: 'La app usará los datos guardados en este navegador. Tu cuenta en la nube no se borra.', confirmText: 'Usar modo local' }))) return;
      updateSettings({ cloud: { forceLocal: true } });
      location.hash = '#/';
      location.reload();
      return;
    }
    if (t.closest('[data-export]')) {
      try { const data = await api.exportData(); downloadFile(`hype-export-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2)); toast('Exportación descargada', { type: 'success' }); } catch (err) { toastError(err); }
      return;
    }
    if (t.closest('[data-reset-settings]')) {
      if (!(await confirmDialog({ title: 'Restablecer ajustes', message: 'Tema, filtros, notificaciones y preferencias volverán a sus valores por defecto.', confirmText: 'Restablecer' }))) return;
      const keep = { ai: { apiKey: state.settings.ai.apiKey }, cloud: state.settings.cloud, giphyKey: state.settings.giphyKey };
      resetSettings();
      updateSettings(keep);
      paint();
      toast('Ajustes restablecidos');
      return;
    }
    if (t.closest('[data-reset-demo]')) {
      if (!(await confirmDialog({ title: 'Borrar datos de la demo', message: 'Se eliminarán tu perfil local, tus posts, fotos, vídeos, marcadores y mensajes. No se puede deshacer.', confirmText: 'Borrar todo', danger: true }))) return;
      await api.resetAll();
      localStorage.removeItem('hype:draft');
      localStorage.removeItem('hype:ai:chats');
      location.hash = '#/bienvenida';
      location.reload();
    }
  });

  el.addEventListener('change', async (e) => {
    const t = e.target;
    if (t.matches('[data-set]')) {
      const path = t.dataset.set;
      const v = t.dataset.type === 'bool' ? t.checked : t.value;
      set(path, v);
      if (path === 'notify.browser' && v && 'Notification' in window && Notification.permission === 'default') {
        const p = await Notification.requestPermission();
        toast(p === 'granted' ? 'Avisos del navegador activados 🔔' : 'El navegador no concedió permiso');
        paint();
      }
      if (path === 'developer' || path === 'ai.enabled') paint();
      return;
    }
    if (t.matches('[data-ai-model]')) {
      if (t.value === '__custom') { const id = await promptDialog({ title: 'Modelo personalizado', label: 'ID del modelo de Gemini', placeholder: 'gemini-…', value: state.settings.ai.customModel }); set('ai.customModel', (id || '').trim()); }
      else { set('ai.model', t.value); set('ai.customModel', ''); }
      paint();
      return;
    }
    if (t.matches('[data-ai-custom]')) { set('ai.customModel', t.value.trim()); return; }
    if (t.matches('[data-ai-lang]')) { set('ai.language', t.value); return; }
    if (t.matches('[data-custom]')) {
      const c = [...state.settings.customAccent];
      c[Number(t.dataset.custom)] = t.value;
      updateSettings({ customAccent: c, accent: 'custom' });
      paint();
    }
  });

  el.addEventListener('input', (e) => {
    if (e.target.matches('[data-range="fontScale"]')) {
      set('fontScale', Number(e.target.value));
      const l = $('[data-fs-label]', body);
      if (l) l.textContent = `${Math.round(Number(e.target.value) * 100)}%`;
    }
  });

  el.addEventListener('keydown', (e) => {
    if (e.target.matches('[data-tag-add]') && e.key === 'Enter') {
      e.preventDefault();
      const w = e.target.value.trim().toLowerCase();
      const path = e.target.closest('[data-tags]').dataset.tags;
      if (w && !get(path).includes(w)) { set(path, [...get(path), w]); paint(); setTimeout(() => $(`[data-tags="${path}"] input`, body)?.focus(), 10); }
    }
  });

  el.addEventListener('submit', async (e) => {
    if (e.target.matches('[data-password]')) {
      e.preventDefault();
      try { await api.updatePassword(e.target.pw.value); e.target.reset(); toast('Contraseña actualizada', { type: 'success' }); } catch (err) { toastError(err); }
    }
    if (e.target.matches('[data-cloud-form]')) {
      e.preventDefault();
      const url = e.target.url.value.trim().replace(/\/+$/, '');
      const key = e.target.key.value.trim();
      if (!/^https:\/\/.+/.test(url) || key.length < 20) { toast('Revisa la URL (https://…) y la clave'); return; }
      if (/service_role|sb_secret_/.test(key) || (() => { try { return JSON.parse(atob(key.split('.')[1] || '')).role === 'service_role'; } catch { return false; } })()) {
        toast('⚠️ Esa es una clave secreta (service_role). Usa la anon/publishable.', { type: 'error', duration: 7000 });
        return;
      }
      updateSettings({ cloud: { url, anonKey: key, forceLocal: false } });
      toast('Conectando con la nube…');
      location.hash = '#/bienvenida';
      setTimeout(() => location.reload(), 300);
    }
  });

  paint();
}
