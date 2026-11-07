// Estado global, ajustes persistentes y bus de eventos.

const SETTINGS_KEY = 'hype:settings';

export const ACCENTS = {
  hype: { name: 'Hype', colors: ['#8b5cf6', '#ec4899'] },
  azul: { name: 'Azul', colors: ['#3b82f6', '#06b6d4'] },
  fuego: { name: 'Fuego', colors: ['#f97316', '#ef4444'] },
  menta: { name: 'Menta', colors: ['#10b981', '#06b6d4'] },
  lima: { name: 'Lima', colors: ['#65a30d', '#22c55e'] },
  sol: { name: 'Sol', colors: ['#f59e0b', '#f97316'] },
  rosa: { name: 'Rosa', colors: ['#ec4899', '#f43f5e'] },
  indigo: { name: 'Índigo', colors: ['#6366f1', '#8b5cf6'] },
  oceano: { name: 'Océano', colors: ['#0ea5e9', '#6366f1'] },
};

export const AI_MODELS = [
  { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash', note: 'Recomendado · rápido y capaz' },
  { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash-Lite', note: 'El más rápido y económico' },
  { id: 'gemini-flash-latest', name: 'Gemini Flash (latest)', note: 'Alias: siempre el Flash más nuevo' },
];

export const DEFAULT_SETTINGS = {
  theme: 'dark',              // dark | light | amoled | system
  accent: 'hype',             // clave de ACCENTS o 'custom'
  customAccent: ['#8b5cf6', '#ec4899'],
  accentColors: ['#8b5cf6', '#ec4899'],
  fontScale: 1,
  radiusScale: 1,
  density: 'comfortable',     // comfortable | compact
  reduceMotion: false,
  highContrast: false,

  defaultFeed: 'foryou',      // foryou | following | recent | top
  autoplayVideos: true,
  muteVideos: true,
  dataSaver: false,
  hdUploads: true,
  blurSensitive: true,
  showHypeCounts: true,
  mutedWords: [],
  mutedUsers: [],
  hiddenKinds: [],
  hiddenPosts: [],

  defaultVisibility: 'public', // public | followers
  dmPolicy: 'everyone',
  requireAltText: false,

  notify: { hype: true, comment: true, follow: true, mention: true, group: true, project: true, message: true, browser: false, sound: false },

  ai: {
    enabled: true,
    apiKey: '',
    model: '',
    customModel: '',
    persona: 'amigable',      // amigable | profesional | divertido | tecnico
    language: 'es',
    thinking: 'auto',         // auto | low | high
    composerTools: true,
  },

  calls: { allowIncoming: true, startMuted: false, startCameraOff: false, ringtone: true },

  cloud: { url: '', anonKey: '', forceLocal: false },
  giphyKey: '',

  enterToSend: true,
  keyboardShortcuts: true,
  simulateActivity: true,
  developer: false,
};

function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }

function deepMerge(base, patch) {
  const out = { ...base };
  for (const [k, v] of Object.entries(patch || {})) {
    out[k] = isObj(v) && isObj(base[k]) ? deepMerge(base[k], v) : v;
  }
  return out;
}

function loadSettings() {
  try {
    return deepMerge(DEFAULT_SETTINGS, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'));
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

// ---- Bus de eventos ----
const listeners = new Map();
export const bus = {
  on(event, fn) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(fn);
    return () => listeners.get(event)?.delete(fn);
  },
  emit(event, payload) {
    listeners.get(event)?.forEach((fn) => {
      try { fn(payload); } catch (err) { console.error(`[bus:${event}]`, err); }
    });
  },
};

export const state = {
  user: null,
  mode: 'local',
  settings: loadSettings(),
  unread: { notifications: 0, messages: 0 },
  route: null,
};

export function setUser(user) {
  state.user = user;
  bus.emit('user', user);
}

export function setUnread(patch) {
  Object.assign(state.unread, patch);
  bus.emit('unread', state.unread);
}

export function updateSettings(patch) {
  const next = deepMerge(state.settings, patch);
  if (patch.accent || patch.customAccent) {
    next.accentColors = next.accent === 'custom' ? next.customAccent : (ACCENTS[next.accent]?.colors || ACCENTS.hype.colors);
  }
  state.settings = next;
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch { /* cuota llena */ }
  applySettings();
  bus.emit('settings', next);
  return next;
}

export function resetSettings() {
  try { localStorage.removeItem(SETTINGS_KEY); } catch { /* ignore */ }
  state.settings = structuredClone(DEFAULT_SETTINGS);
  applySettings();
  bus.emit('settings', state.settings);
}

const systemDark = matchMedia('(prefers-color-scheme: dark)');
systemDark.addEventListener?.('change', () => { if (state.settings.theme === 'system') applySettings(); });

export function resolvedTheme() {
  const t = state.settings.theme;
  if (t === 'system') return systemDark.matches ? 'dark' : 'light';
  return t;
}

export function applySettings() {
  const s = state.settings;
  const root = document.documentElement;
  root.dataset.theme = resolvedTheme();
  const [a1, a2] = s.accent === 'custom' ? s.customAccent : (ACCENTS[s.accent]?.colors || ACCENTS.hype.colors);
  root.style.setProperty('--accent', a1);
  root.style.setProperty('--accent-2', a2);
  root.style.setProperty('--font-scale', String(s.fontScale || 1));
  root.style.setProperty('--radius-scale', String(s.radiusScale ?? 1));
  root.dataset.density = s.density;
  if (s.reduceMotion) root.dataset.reduceMotion = ''; else delete root.dataset.reduceMotion;
  if (s.highContrast) root.dataset.contrast = 'high'; else delete root.dataset.contrast;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = getComputedStyle(root).getPropertyValue('--bg').trim() || '#07080d';
}

/** Filtro de contenido según ajustes: palabras/usuarios silenciados, tipos ocultos. */
export function isFilteredOut(post) {
  const s = state.settings;
  if (!post) return true;
  if (s.hiddenPosts.includes(post.id)) return true;
  if (post.author && s.mutedUsers.includes(post.author.username)) return true;
  if (s.mutedWords.length) {
    const text = (post.body || '').toLowerCase();
    if (s.mutedWords.some((w) => w && text.includes(String(w).toLowerCase()))) return true;
  }
  if (s.hiddenKinds.length) {
    const k = postKinds(post);
    if (k.some((x) => s.hiddenKinds.includes(x))) return true;
  }
  return false;
}

/** Tipos de contenido de un post (para filtros). */
export function postKinds(post) {
  const kinds = [];
  const media = post.media || [];
  if (media.some((m) => m.type === 'image')) kinds.push('image');
  if (media.some((m) => m.type === 'video')) kinds.push('video');
  if (media.some((m) => m.type === 'gif')) kinds.push('gif');
  if (post.poll) kinds.push('poll');
  if ((post.threadCount || 1) > 1) kinds.push('thread');
  if (post.kind === 'project') kinds.push('project');
  if (post.kind === 'game') kinds.push('game');
  if (/```/.test(post.body || '')) kinds.push('code');
  if (!media.length && !post.poll && post.kind === 'post') kinds.push('text');
  return kinds;
}
