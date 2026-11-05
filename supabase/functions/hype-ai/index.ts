// Supabase Edge Function: hype-ai
// Proxy seguro hacia la API de Gemini. La API key vive como secreto del servidor
// (GEMINI_API_KEY) y nunca llega al navegador.
//
// Despliegue:
//   supabase secrets set GEMINI_API_KEY=tu_api_key
//   supabase functions deploy hype-ai
// Opcional:
//   supabase secrets set GEMINI_MODEL=gemini-3.8-flash AI_DAILY_LIMIT=100
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ALLOWED_MODELS = new Set(['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-flash-latest', 'gemini-3.1-flash-lite']);
const MAX_CHARS = 60_000;
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

type Part = { text?: string; inlineData?: { mimeType: string; data: string } };
type Content = { role: 'user' | 'model'; parts: Part[] };

function sanitizeContents(input: unknown): Content[] {
  if (!Array.isArray(input)) throw new Error('contents debe ser un array');
  let chars = 0;
  const out: Content[] = [];
  for (const c of input.slice(-30)) {
    const role = c?.role === 'model' ? 'model' : 'user';
    const parts: Part[] = [];
    for (const p of Array.isArray(c?.parts) ? c.parts.slice(0, 6) : []) {
      if (typeof p?.text === 'string') {
        chars += p.text.length;
        parts.push({ text: p.text });
      } else if (p?.inlineData && typeof p.inlineData.data === 'string' && /^image\/(png|jpeg|webp|gif)$/.test(p.inlineData.mimeType)) {
        if (p.inlineData.data.length * 0.75 > MAX_IMAGE_BYTES) throw new Error('Imagen demasiado grande');
        parts.push({ inlineData: { mimeType: p.inlineData.mimeType, data: p.inlineData.data } });
      }
    }
    if (parts.length) out.push({ role, parts });
  }
  if (chars > MAX_CHARS) throw new Error('Mensaje demasiado largo');
  if (!out.length) throw new Error('Mensaje vacío');
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  try {
    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) return json({ error: 'Falta el secreto GEMINI_API_KEY en la Edge Function' }, 500);

    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY');
    if (!serviceKey) return json({ error: 'Falta SUPABASE_SERVICE_ROLE_KEY' }, 500);
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

    // 1. Usuario autenticado
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: auth, error: authError } = await admin.auth.getUser(token);
    if (authError || !auth?.user) return json({ error: 'Inicia sesión para usar Hype IA' }, 401);
    const userId = auth.user.id;

    // 2. Límite diario por usuario
    const limit = Number(Deno.env.get('AI_DAILY_LIMIT') ?? '100');
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { count } = await admin.from('ai_requests').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', since);
    if ((count ?? 0) >= limit) return json({ error: `Alcanzaste el límite diario de Hype IA (${limit}). Vuelve mañana ✨` }, 429);

    // 3. Petición
    const body = await req.json();
    const contents = sanitizeContents(body?.contents);
    const systemText = typeof body?.systemInstruction === 'string' ? body.systemInstruction.slice(0, 8000) : '';
    const model = ALLOWED_MODELS.has(body?.model) ? body.model : (Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.8-flash');
    const stream = body?.stream !== false;
    const generationConfig: Record<string, unknown> = {};
    if (body?.json === true) generationConfig.responseMimeType = 'application/json';
    if (body?.thinking === 'low' || body?.thinking === 'high') generationConfig.thinkingConfig = { thinkingLevel: body.thinking };

    await admin.from('ai_requests').insert({ user_id: userId, task: String(body?.task ?? 'chat').slice(0, 40) });

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:${stream ? 'streamGenerateContent?alt=sse' : 'generateContent'}`;
    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents,
        ...(systemText ? { systemInstruction: { parts: [{ text: systemText }] } } : {}),
        ...(Object.keys(generationConfig).length ? { generationConfig } : {}),
      }),
    });

    if (!upstream.ok) {
      const detail = await upstream.text();
      let message = `Gemini respondió ${upstream.status}`;
      try { message = JSON.parse(detail)?.error?.message ?? message; } catch { /* texto plano */ }
      return json({ error: message, status: upstream.status }, upstream.status === 429 ? 429 : 502);
    }

    return new Response(upstream.body, {
      headers: { ...CORS, 'Content-Type': stream ? 'text/event-stream' : 'application/json', 'Cache-Control': 'no-cache' },
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});
