// Bienvenida, registro, inicio de sesión y onboarding.
import { html, $, $$ } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { state, setUser } from '../core/store.js';
import { api } from '../data/api.js';
import { navigate } from '../core/router.js';
import { toast, toastError, setLoading } from '../core/ui.js';
import { EMOJIS, INTERESTS, avatar } from '../components/common.js';

const FEATURES = [
  ['📝', 'Posts con Markdown y código'], ['🧵', 'Hilos nativos'], ['🎬', 'Shorts con scroll infinito'], ['🔥', 'Dale hype a todo'],
  ['🚀', 'Vitrina de proyectos'], ['🎮', 'Mini-juegos playables'], ['👥', 'Grupos y comunidades'], ['✨', 'Hype IA con Gemini'],
];

function hero() {
  return html`<section class="auth-hero">
    <div class="brand" style="padding:0"><img src="assets/icon.svg" alt=""><span style="color:#fff">HYPE</span></div>
    <div>
      <h1>Crea. Comparte.<br>Dale <span style="background:linear-gradient(90deg,#ffd166,#ff7a2f);-webkit-background-clip:text;background-clip:text;color:transparent">hype</span>.</h1>
      <p>La red social para gente que construye cosas: posts enriquecidos, hilos, shorts, proyectos, grupos, juegos y una IA que te ayuda a crear.</p>
    </div>
    <div class="auth-features">${FEATURES.map(([e, t]) => html`<div class="auth-feature"><span>${e}</span>${t}</div>`)}</div>
  </section>`;
}

function onboardingStep(el, { cloud }) {
  const u = state.user;
  const data = { username: u?.username || '', displayName: u?.displayName || '', avatarEmoji: u?.avatarEmoji || '😎', interests: u?.interests || [] };
  el.innerHTML = String(html`<div class="auth-screen">${hero()}<section class="auth-panel"><form class="auth-card" data-onb>
    <div class="steps"><i class="on"></i><i class="on"></i><i></i></div>
    <h2>Crea tu perfil</h2>
    <p class="muted small">${cloud ? 'Elige cómo te verá la comunidad.' : 'Modo demo local: tu perfil y tus datos se guardan solo en este navegador.'}</p>
    <div class="row" style="gap:14px"><span data-preview>${avatar({ ...data, id: 'preview' }, 'lg')}</span><div class="col" style="gap:2px"><b data-pname>${data.displayName || 'Tu nombre'}</b><span class="dim small" data-puser>@${data.username || 'usuario'}</span></div></div>
    <div class="field"><label>Elige un avatar</label><div class="emoji-picker" data-emojis>${EMOJIS.slice(0, 16).map((e) => html`<button type="button" data-emoji="${e}" class="${e === data.avatarEmoji ? 'active' : ''}">${e}</button>`)}</div></div>
    <div class="field"><label for="dn">Nombre</label><input class="input" id="dn" name="displayName" maxlength="60" required value="${data.displayName}" placeholder="Ej. Andrea Gómez"></div>
    <div class="field"><label for="un">Nombre de usuario</label>
      <div class="input-group"><span class="icon" style="left:14px;font-weight:700">@</span><input class="input" id="un" name="username" maxlength="24" required pattern="[a-zA-Z0-9_.]{3,24}" value="${data.username}" placeholder="andrea.dev" autocomplete="username"></div>
      <span class="hint" data-uhint>3-24 caracteres: letras, números, _ y .</span></div>
    <div class="field"><label>¿Qué te interesa? <span class="dim">(personaliza tu feed)</span></label><div class="interest-grid" data-interests>${INTERESTS.map((i) => html`<button type="button" class="chip ${data.interests.includes(i) ? 'active' : ''}" data-interest="${i}">${i}</button>`)}</div></div>
    <button class="btn btn-primary btn-lg btn-block" type="submit">Entrar a Hype ${icon('arrowRight', { size: 18 })}</button>
    ${!cloud ? html`<p class="tiny dim" style="text-align:center">¿Quieres sincronizar en la nube? Configura Supabase luego en Ajustes → Nube.</p>` : ''}
  </form></section></div>`);
  const form = $('[data-onb]', el);
  const un = form.username, dn = form.displayName;
  const paint = () => {
    $('[data-preview]', el).innerHTML = String(avatar({ ...data, id: 'preview' }, 'lg'));
    $('[data-pname]', el).textContent = dn.value || 'Tu nombre';
    $('[data-puser]', el).textContent = '@' + (un.value || 'usuario');
  };
  let check = 0;
  un.addEventListener('input', async () => {
    un.value = un.value.toLowerCase().replace(/[^a-z0-9_.]/g, '');
    paint();
    const my = ++check;
    const hint = $('[data-uhint]', el);
    if (un.value.length < 3) { hint.textContent = '3-24 caracteres: letras, números, _ y .'; hint.style.color = ''; return; }
    const ok = await api.isUsernameAvailable(un.value).catch(() => true);
    if (my !== check) return;
    hint.textContent = ok ? '✓ Disponible' : '✗ Ya está en uso';
    hint.style.color = ok ? 'var(--success)' : 'var(--danger)';
  });
  dn.addEventListener('input', () => {
    paint();
    if (!un.dataset.touched && !u?.username) { un.value = dn.value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '.').replace(/[^a-z0-9_.]/g, '').slice(0, 24); paint(); }
  });
  un.addEventListener('keydown', () => { un.dataset.touched = '1'; });
  form.addEventListener('click', (e) => {
    const em = e.target.closest('[data-emoji]');
    if (em) { data.avatarEmoji = em.dataset.emoji; $$('[data-emoji]', el).forEach((b) => b.classList.toggle('active', b === em)); paint(); }
    const it = e.target.closest('[data-interest]');
    if (it) { it.classList.toggle('active'); data.interests = $$('[data-interest].active', el).map((b) => b.dataset.interest); }
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('[type="submit"]');
    setLoading(btn, true);
    try {
      const payload = { username: un.value.trim().toLowerCase(), displayName: dn.value.trim(), avatarEmoji: data.avatarEmoji, interests: data.interests };
      const user = cloud ? await api.completeOnboarding(payload) : await api.createLocalAccount(payload);
      setUser(user);
      toast(`¡Bienvenido, ${user.displayName}! 🎉`, { type: 'success' });
      navigate('/', { replace: true });
    } catch (err) { toastError(err); setLoading(btn, false); }
  });
  setTimeout(() => dn.focus(), 50);
}

function localWelcome(el) {
  const existing = api.localAccount?.();
  el.innerHTML = String(html`<div class="auth-screen">${hero()}<section class="auth-panel"><div class="auth-card">
    <div class="steps"><i class="on"></i><i></i><i></i></div>
    <h2>Bienvenido a Hype ⚡</h2>
    <p class="muted">Estás en <b>modo demo local</b>: puedes probarlo todo ya mismo. Tus datos se guardan en este navegador.</p>
    ${existing ? html`<button class="btn btn-primary btn-lg btn-block" data-resume>${avatar(existing, 'xs')} Continuar como @${existing.username}</button>` : html`<button class="btn btn-primary btn-lg btn-block" data-start>Crear mi perfil</button>`}
    <button class="btn btn-secondary btn-block" data-guest>Explorar sin cuenta</button>
    <div class="divider">o</div>
    <a class="btn btn-ghost btn-block" href="#/ajustes/nube">${icon('cloud', { size: 18 })} Conectar con la nube (Supabase)</a>
    ${state.cloudError ? html`<div class="notice warn">${icon('alert')}<span>No se pudo conectar con Supabase: ${state.cloudError}</span></div>` : ''}
  </div></section></div>`);
  el.querySelector('[data-start]')?.addEventListener('click', () => onboardingStep(el, { cloud: false }));
  el.querySelector('[data-resume]')?.addEventListener('click', async () => { setUser(await api.resumeLocalAccount()); navigate('/', { replace: true }); });
  el.querySelector('[data-guest]').addEventListener('click', () => { sessionStorage.setItem('hype:guest', '1'); navigate('/', { replace: true }); });
}

function cloudAuth(el, mode = 'login') {
  const signup = mode === 'signup';
  el.innerHTML = String(html`<div class="auth-screen">${hero()}<section class="auth-panel"><div class="auth-card">
    <h2>${signup ? 'Crea tu cuenta' : 'Inicia sesión'}</h2>
    <p class="muted small">Conectado a la nube: <b>${api.host}</b></p>
    <button class="btn btn-white btn-block" data-oauth="google" style="border:1px solid var(--border)">
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.85z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>
      Continuar con Google</button>
    <button class="btn btn-secondary btn-block" data-oauth="github">${icon('code', { size: 18 })} Continuar con GitHub</button>
    <div class="divider">o con tu correo</div>
    <form class="col" data-form>
      ${signup ? html`<div class="field"><label for="su-name">Nombre</label><input class="input" id="su-name" name="displayName" maxlength="60" required placeholder="Tu nombre"></div>` : ''}
      <div class="field"><label for="em">Correo</label><input class="input" id="em" name="email" type="email" required autocomplete="email" placeholder="tu@correo.com"></div>
      <div class="field"><label for="pw">Contraseña</label><input class="input" id="pw" name="password" type="password" minlength="6" ${signup ? 'required' : ''} autocomplete="${signup ? 'new-password' : 'current-password'}" placeholder="${signup ? 'Mínimo 6 caracteres' : 'Tu contraseña (o déjala vacía para recibir un enlace)'}"></div>
      <button class="btn btn-primary btn-lg btn-block" type="submit">${signup ? 'Crear cuenta' : 'Entrar'}</button>
      ${!signup ? html`<div class="row" style="justify-content:space-between"><button type="button" class="btn btn-ghost btn-sm" data-magic>${icon('mail', { size: 16 })} Enviarme un enlace mágico</button><button type="button" class="btn btn-ghost btn-sm" data-forgot>¿Olvidaste tu contraseña?</button></div>` : ''}
    </form>
    <p class="small muted" style="text-align:center">${signup ? html`¿Ya tienes cuenta? <a href="#/bienvenida" class="bold" style="color:var(--accent-text)">Inicia sesión</a>` : html`¿Nuevo en Hype? <a href="#/bienvenida?modo=registro" class="bold" style="color:var(--accent-text)">Crea una cuenta</a>`}</p>
    <button class="btn btn-ghost btn-sm" data-guest>Explorar sin cuenta →</button>
  </div></section></div>`);
  const form = $('[data-form]', el);
  el.querySelectorAll('[data-oauth]').forEach((b) => b.addEventListener('click', async () => {
    setLoading(b, true);
    try { await api.signInWithProvider(b.dataset.oauth); } catch (err) { toastError(err); setLoading(b, false); }
  }));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('[type="submit"]');
    const email = form.email.value.trim(), password = form.password.value;
    setLoading(btn, true);
    try {
      if (signup) {
        const r = await api.signUp({ email, password, displayName: form.displayName.value.trim(), username: email.split('@')[0] });
        if (r.needsConfirmation) { toast('Revisa tu correo para confirmar la cuenta 📬', { duration: 8000 }); setLoading(btn, false); return; }
      } else if (!password) {
        await api.signInWithOtp(email);
        toast('Te enviamos un enlace mágico. Ábrelo en este navegador 📬', { duration: 8000 });
        setLoading(btn, false);
        return;
      } else {
        await api.signIn({ email, password });
      }
      // onAuthStateChange actualizará el usuario y redirigirá
    } catch (err) { toastError(err); setLoading(btn, false); }
  });
  el.querySelector('[data-magic]')?.addEventListener('click', async () => {
    const email = form.email.value.trim();
    if (!email) { form.email.focus(); toast('Escribe tu correo'); return; }
    try { await api.signInWithOtp(email); toast('Enlace enviado. Revisa tu correo 📬', { duration: 8000 }); } catch (err) { toastError(err); }
  });
  el.querySelector('[data-forgot]')?.addEventListener('click', async () => {
    const email = form.email.value.trim();
    if (!email) { form.email.focus(); toast('Escribe tu correo'); return; }
    try { await api.resetPassword(email); toast('Te enviamos un enlace para cambiar la contraseña 📬', { duration: 8000 }); } catch (err) { toastError(err); }
  });
  el.querySelector('[data-guest]').addEventListener('click', () => { sessionStorage.setItem('hype:guest', '1'); navigate('/', { replace: true }); });
}

export function render(el, ctx) {
  const cloud = api.mode === 'cloud';
  if (state.user && (!cloud || state.user.onboarded)) { navigate('/', { replace: true }); return; }
  if (cloud && state.user && !state.user.onboarded) { onboardingStep(el, { cloud: true }); return; }
  if (cloud && !api.schemaReady) {
    el.innerHTML = String(html`<div class="auth-screen">${hero()}<section class="auth-panel"><div class="auth-card">
      <h2>Falta configurar la base de datos</h2>
      <div class="notice warn">${icon('database')}<span>Tu proyecto <b>${api.host}</b> no tiene las tablas de Hype. Abre Supabase → SQL Editor y ejecuta el archivo <code>supabase/schema.sql</code>. Luego recarga esta página.</span></div>
      <button class="btn btn-primary" onclick="location.reload()">Ya lo ejecuté, recargar</button>
      <a class="btn btn-ghost" href="#/ajustes/nube">Volver al modo local</a>
    </div></section></div>`);
    return;
  }
  if (cloud) cloudAuth(el, ctx.query.modo === 'registro' ? 'signup' : 'login');
  else localWelcome(el);
}
