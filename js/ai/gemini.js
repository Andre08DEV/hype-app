// Hype IA — cliente de Gemini.
// Dos caminos: (1) la API key del usuario guardada solo en su navegador (Ajustes),
// o (2) la Edge Function "hype-ai" de Supabase, que guarda la key en el servidor.
import { state } from '../core/store.js';
import { api } from '../data/api.js';
import { stripMarkdown } from '../core/markdown.js';
import { readAsDataURL } from '../core/utils.js';
import { getBlob } from '../data/media-store.js';

const GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models';
export const DEFAULT_MODEL = 'gemini-3.8-flash';

const LANGS = { es: 'español', en: 'inglés', pt: 'portugués', fr: 'francés', it: 'italiano', de: 'alemán' };
const PERSONAS = {
  amigable: 'Tu tono es cercano, positivo y claro. Usas algún emoji con moderación.',
  profesional: 'Tu tono es profesional, preciso y conciso. Evitas emojis salvo que aporten.',
  divertido: 'Tu tono es ingenioso y divertido, con humor ligero y emojis, sin perder utilidad.',
  tecnico: 'Tu tono es el de un experto técnico: preciso y con ejemplos de código cuando aporten.',
};

export function currentModel() {
  const s = state.settings.ai || {};
  return (s.customModel || s.model || window.HYPE_CONFIG?.aiModel || DEFAULT_MODEL).trim();
}

export function aiStatus() {
  const s = state.settings.ai || {};
  if (!s.enabled) return { available: false, reason: 'disabled', message: 'Hype IA está desactivada en Ajustes.' };
  if (s.apiKey) return { available: true, provider: 'key', label: 'Tu API key de Gemini' };
  if (api?.mode === 'cloud' && api.uid) return { available: true, provider: 'cloud', label: `Edge Function en ${api.host}` };
  if (api?.mode === 'cloud') return { available: false, reason: 'login', message: 'Inicia sesión para usar Hype IA.' };
  return { available: false, reason: 'nokey', message: 'Añade tu API key de Gemini en Ajustes → Hype IA (es gratis en Google AI Studio).' };
}

function systemPrompt(extra = '') {
  const s = state.settings.ai || {};
  const u = state.user;
  return [
    'Eres Hype IA ✨, el asistente creativo integrado en Hype: una red social para publicar posts con Markdown, hilos, shorts, proyectos, grupos y mini-juegos. En Hype el "like" se llama "hype" 🔥.',
    PERSONAS[s.persona] || PERSONAS.amigable,
    `Responde en ${LANGS[s.language] || 'español'} salvo que te pidan otro idioma.`,
    'Puedes usar Markdown: **negrita**, *cursiva*, listas, `código` y bloques ```lenguaje.',
    u ? `Hablas con @${u.username} (${u.displayName}). Intereses: ${(u.interests || []).join(', ') || 'sin indicar'}.` : '',
    'No inventes datos sobre personas reales; si no sabes algo, dilo.',
    extra,
  ].filter(Boolean).join('\n');
}

class AIError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}

function friendlyError(status, message = '', model = '') {
  if (status === 400 && /api key|API_KEY/i.test(message)) return new AIError('La API key de Gemini no es válida. Revísala en Ajustes → Hype IA.', 'key');
  if (status === 401) return new AIError(message || 'Inicia sesión para usar Hype IA.', 'auth');
  if (status === 403) return new AIError('La API key no tiene permiso para usar Gemini (¿API habilitada en tu proyecto de Google?).', 'key');
  if (status === 404) return new AIError(model && /model/i.test(message) ? `El modelo "${model}" no está disponible. Elige otro en Ajustes → Hype IA.` : 'No se encontró la función hype-ai. Despliégala (ver README) o usa tu propia API key.', 'notfound');
  if (status === 429) return new AIError(message && !/quota|exhausted/i.test(message) ? message : 'Límite de uso de Gemini alcanzado. Espera un poco e inténtalo de nuevo.', 'rate');
  if (status >= 500) return new AIError('Gemini no está respondiendo ahora mismo. Inténtalo en un momento.', 'server');
  return new AIError(message || `Error ${status} de Hype IA`, 'other');
}

function chunkText(data) {
  if (data?.error) throw new AIError(data.error.message || 'Error de Gemini', 'other');
  if (data?.promptFeedback?.blockReason) throw new AIError('Gemini bloqueó esta petición por seguridad. Prueba a reformularla.', 'blocked');
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts.filter((p) => typeof p.text === 'string' && !p.thought).map((p) => p.text).join('');
}

async function readSSE(res, onData) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  const flush = (block) => {
    const data = block.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart()).join('\n');
    if (data && data !== '[DONE]') onData(JSON.parse(data));
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let m;
    while ((m = /\r?\n\r?\n/.exec(buf))) {
      const block = buf.slice(0, m.index);
      buf = buf.slice(m.index + m[0].length);
      flush(block);
    }
  }
  if (buf.trim()) flush(buf);
}

/**
 * Llamada genérica.
 * messages: [{ role: 'user'|'model', text, images?: [{ mimeType, data }] }]
 */
export async function generate({ task = 'chat', messages, system = '', json = false, stream = !json, onToken, signal } = {}) {
  const status = aiStatus();
  if (!status.available) throw new AIError(status.message, status.reason);
  const model = currentModel();
  const thinking = state.settings.ai?.thinking;
  const contents = [];
  for (const m of messages) {
    const role = m.role === 'model' ? 'model' : 'user';
    const parts = [...(m.images || []).map((img) => ({ inlineData: { mimeType: img.mimeType, data: img.data } })), ...(m.text ? [{ text: m.text }] : [])];
    if (!parts.length) continue;
    const last = contents[contents.length - 1];
    if (last && last.role === role) last.parts.push(...parts); // Gemini espera turnos alternos
    else contents.push({ role, parts });
  }
  if (contents[0]?.role === 'model') contents.unshift({ role: 'user', parts: [{ text: '(inicio de la conversación)' }] });
  const sys = systemPrompt(system);

  let res;
  if (status.provider === 'key') {
    const generationConfig = {};
    if (json) generationConfig.responseMimeType = 'application/json';
    if (thinking === 'low' || thinking === 'high') generationConfig.thinkingConfig = { thinkingLevel: thinking };
    res = await fetch(`${GEMINI}/${encodeURIComponent(model)}:${stream ? 'streamGenerateContent?alt=sse' : 'generateContent'}`, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': state.settings.ai.apiKey.trim() },
      body: JSON.stringify({ contents, systemInstruction: { parts: [{ text: sys }] }, ...(Object.keys(generationConfig).length ? { generationConfig } : {}) }),
    }).catch((err) => { if (err.name === 'AbortError') throw err; throw new AIError('Sin conexión con Gemini. Revisa tu red.', 'network'); });
  } else {
    const token = await api._token();
    res = await fetch(`${api.url}/functions/v1/hype-ai`, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: api.key },
      body: JSON.stringify({ task, contents, systemInstruction: sys, model, stream, json, thinking }),
    }).catch((err) => { if (err.name === 'AbortError') throw err; throw new AIError('No se pudo contactar con la función hype-ai.', 'network'); });
  }

  if (!res.ok) {
    let message = '';
    try { const j = await res.json(); message = j?.error?.message || j?.error || j?.message || ''; } catch { /* sin cuerpo */ }
    throw friendlyError(res.status, typeof message === 'string' ? message : JSON.stringify(message), model);
  }

  let full = '';
  if (stream) {
    await readSSE(res, (data) => {
      const delta = chunkText(data);
      if (delta) { full += delta; onToken?.(full, delta); }
    });
  } else {
    full = chunkText(await res.json());
    onToken?.(full, full);
  }
  if (!full.trim()) throw new AIError('Hype IA no devolvió respuesta. Prueba otra vez.', 'empty');
  return full;
}

export function parseJSON(text) {
  const t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(t); } catch { /* buscar bloque */ }
  const m = t.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (m) { try { return JSON.parse(m[1]); } catch { /* nada */ } }
  throw new AIError('Hype IA devolvió un formato inesperado. Prueba otra vez.', 'format');
}

const ask = (prompt, opts = {}) => generate({ messages: [{ role: 'user', text: prompt }], ...opts });
const askJSON = async (prompt, opts = {}) => parseJSON(await generate({ messages: [{ role: 'user', text: prompt }], json: true, ...opts }));
const clip = (s, n = 6000) => String(s || '').slice(0, n);

// ---------- Imágenes → base64 (reducidas a 1024px) ----------
async function blobFromUrl(url) {
  if (url.startsWith('idb:')) return getBlob(url.slice(4));
  const r = await fetch(url, { mode: 'cors' });
  if (!r.ok) throw new Error('No se pudo leer la imagen');
  return r.blob();
}

export async function imageToInline(source) {
  const blob = source instanceof Blob ? source : await blobFromUrl(source);
  if (!blob) throw new AIError('No se encontró la imagen', 'image');
  try {
    const bmp = await createImageBitmap(blob);
    const scale = Math.min(1, 1024 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const dataUrl = c.toDataURL('image/jpeg', 0.85);
    return { mimeType: 'image/jpeg', data: dataUrl.split(',')[1] };
  } catch {
    const dataUrl = await readAsDataURL(blob);
    return { mimeType: blob.type || 'image/jpeg', data: String(dataUrl).split(',')[1] };
  }
}

// ---------- Tareas ----------
const ONLY = 'Devuelve SOLO el resultado, sin comillas, sin explicaciones ni preámbulos.';

export const hypeAI = {
  chat: (messages, opts) => generate({ task: 'chat', messages, ...opts }),

  improve: (text, opts) => ask(`Mejora este post para una red social: más claro, atractivo y fácil de leer. Conserva el idioma, el sentido, las @menciones, los #hashtags y el formato Markdown. Máximo 1000 caracteres. ${ONLY}\n\nPOST:\n${clip(text)}`, { task: 'improve', ...opts }),

  shorten: (text, max = 280, opts) => ask(`Resume este post en menos de ${max} caracteres manteniendo la idea principal, el tono y los #hashtags importantes. ${ONLY}\n\nPOST:\n${clip(text)}`, { task: 'shorten', ...opts }),

  tone: (text, tone, opts) => ask(`Reescribe este post con un tono ${tone}. Conserva el idioma, las @menciones, los #hashtags y el Markdown. ${ONLY}\n\nPOST:\n${clip(text)}`, { task: 'tone', ...opts }),

  translate: (text, lang, opts) => ask(`Traduce este post al ${lang}. Conserva Markdown, emojis, @menciones y #hashtags. ${ONLY}\n\nPOST:\n${clip(text)}`, { task: 'translate', ...opts }),

  continueText: (text, opts) => ask(`Continúa este borrador de post con 1-3 frases naturales en el mismo tono e idioma. Devuelve SOLO la continuación.\n\nBORRADOR:\n${clip(text)}`, { task: 'continue', ...opts }),

  hashtags: async (text) => {
    const r = await askJSON(`Sugiere entre 3 y 6 hashtags relevantes (en el idioma del texto, en minúsculas, sin tildes, sin espacios) para este post. Responde en JSON: {"hashtags": ["ejemplo"]}\n\nPOST:\n${clip(text, 3000)}`, { task: 'hashtags' });
    return (r.hashtags || r || []).map((t) => String(t).replace(/^#/, '').replace(/\s+/g, '').toLowerCase()).filter(Boolean).slice(0, 6);
  },

  thread: async (text, maxLen = 500) => {
    const r = await askJSON(`Convierte este texto en un HILO de posts para una red social. Cada post debe tener menos de ${maxLen} caracteres, sonar natural, y el primero debe enganchar (puede terminar con "🧵👇"). Conserva el Markdown y los bloques de código completos dentro de un mismo post. Entre 2 y 12 posts. Responde en JSON: {"posts": ["…", "…"]}\n\nTEXTO:\n${clip(text, 12000)}`, { task: 'thread' });
    const posts = (r.posts || r || []).map((p) => String(p).trim()).filter(Boolean);
    if (posts.length < 2) throw new AIError('No se pudo dividir en hilo. Escribe un texto más largo.', 'format');
    return posts.slice(0, 25);
  },

  poll: async (topic) => {
    const r = await askJSON(`Crea una encuesta divertida y relevante para una red social sobre este tema o borrador. Pregunta corta (máx. 120 caracteres) y entre 2 y 4 opciones (máx. 40 caracteres cada una, pueden llevar un emoji). Responde en JSON: {"question": "…", "options": ["…", "…"]}\n\nTEMA:\n${clip(topic, 2000)}`, { task: 'poll' });
    const options = (r.options || []).map((o) => String(o).slice(0, 80)).filter(Boolean).slice(0, 4);
    if (options.length < 2) throw new AIError('No se pudo generar la encuesta.', 'format');
    return { question: String(r.question || '').slice(0, 300), options };
  },

  summarize: (text, opts) => ask(`Haz un TL;DR de este contenido en 2-4 viñetas cortas en Markdown. Empieza directamente con las viñetas.\n\nCONTENIDO:\n${clip(text, 15000)}`, { task: 'summarize', ...opts }),

  explain: (text, opts) => ask(`Explica de forma sencilla este post (si tiene código, explica qué hace, paso a paso, y menciona posibles mejoras). Usa Markdown y sé breve.\n\nPOST:\n${clip(text, 12000)}`, { task: 'explain', ...opts }),

  replies: async (text) => {
    const r = await askJSON(`Sugiere 3 respuestas cortas (máx. 120 caracteres), variadas (una curiosa, una de apoyo, una con humor) a este post. Responde en JSON: {"replies": ["…"]}\n\nPOST:\n${clip(text, 3000)}`, { task: 'replies' });
    return (r.replies || []).map(String).slice(0, 3);
  },

  projectReview: (p, opts) => ask(`Eres mentor de lanzamientos de productos. Analiza este proyecto y da feedback honesto y accionable en Markdown con estas secciones: "### ✅ Puntos fuertes", "### 🛠️ Qué mejorar", "### 🚀 Ideas para el lanzamiento" y termina con "**Hype score: X/10**" y una frase de ánimo.\n\nNombre: ${p.name}\nEslogan: ${p.tagline}\nEtapa: ${p.stage}\nTags: ${(p.tags || []).join(', ')}\nDescripción:\n${clip(p.description, 6000)}`, { task: 'project_review', ...opts }),

  projectPitch: async (idea) => {
    const r = await askJSON(`A partir de esta idea, crea la ficha de un proyecto para una vitrina tipo "lanzamientos". Responde en JSON: {"name": "máx 40 caracteres", "tagline": "máx 100 caracteres", "description": "Markdown de 3-6 párrafos/viñetas con qué es, para quién y funciones clave", "tags": ["3-5 tags en minúsculas"], "emoji": "un emoji representativo"}\n\nIDEA:\n${clip(idea, 3000)}`, { task: 'project_pitch' });
    return { name: String(r.name || '').slice(0, 80), tagline: String(r.tagline || '').slice(0, 140), description: String(r.description || ''), tags: (r.tags || []).map((t) => String(t).toLowerCase().replace(/^#/, '')).slice(0, 6), emoji: String(r.emoji || '🚀').slice(0, 4) };
  },

  altText: async (image) => {
    const img = await imageToInline(image);
    const text = await generate({ task: 'alt_text', messages: [{ role: 'user', images: [img], text: `Escribe un texto alternativo (alt) para personas con discapacidad visual que describa esta imagen en una frase de máximo 140 caracteres. ${ONLY}` }], stream: false });
    return stripMarkdown(text).replace(/^["']|["']$/g, '').slice(0, 300);
  },

  describeImage: (image, question = '¿Qué ves en esta imagen?') => imageToInline(image).then((img) => generate({ task: 'vision', messages: [{ role: 'user', images: [img], text: question }] })),

  bio: (profile, opts) => ask(`Escribe una bio corta y con personalidad (máx. 160 caracteres, 1-2 emojis) para el perfil de @${profile.username} en una red social. Intereses: ${(profile.interests || []).join(', ') || 'variados'}. Bio actual: "${clip(profile.bio, 300)}". ${ONLY}`, { task: 'bio', ...opts }),

  catchUp: (posts, opts) => ask(`Estos son los posts con más hype ahora mismo en Hype. Haz un resumen "¿Qué me perdí?" en Markdown: 3-6 viñetas con lo más interesante (cita a los autores con @usuario) y termina con una sugerencia de post para unirme a la conversación.\n\n${posts.map((p, i) => `${i + 1}. @${p.author?.username} (🔥${p.hypeCount}): ${clip(stripMarkdown(p.body), 400)}`).join('\n')}`, { task: 'catch_up', ...opts }),

  ideas: (opts) => ask('Dame 5 ideas concretas de posts que podría publicar hoy según mis intereses. Para cada una: un título en negrita y el primer párrafo listo para copiar. Incluye al menos una idea de hilo y una de encuesta.', { task: 'ideas', ...opts }),

  botReply: (bot, history) => generate({
    task: 'bot_reply', stream: false,
    system: `En esta conversación interpretas a @${bot.username} (${bot.displayName}), un usuario de la comunidad Hype. Su bio: "${bot.bio}". Responde como esa persona, en 1-3 frases, natural y amable, sin decir que eres una IA salvo que te lo pregunten directamente.`,
    messages: history.map((h) => ({ role: h.fromMe ? 'user' : 'model', text: h.body })),
  }),
};

export async function testAIKey() {
  const text = await generate({ task: 'test', messages: [{ role: 'user', text: 'Responde exactamente: ¡Hype IA lista! ✨' }], stream: false });
  return text.trim();
}
