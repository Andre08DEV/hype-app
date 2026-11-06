/*
 * Configuración pública de Hype.
 *
 * Sin rellenar nada, la app funciona en MODO DEMO LOCAL: todo se guarda en tu
 * navegador (localStorage + IndexedDB) con contenido de ejemplo.
 *
 * Para activar la NUBE (Supabase):
 *   1. Crea un proyecto en https://supabase.com
 *   2. Ejecuta supabase/schema.sql en el SQL Editor del proyecto.
 *   3. Copia aquí la "Project URL" y la clave pública (anon / publishable).
 *
 * La clave anon/publishable es pública por diseño: la seguridad la ponen las
 * políticas RLS de schema.sql.
 *
 * ⚠️ NUNCA pongas aquí la service_role/secret key ni tu API key de Gemini.
 *    La key de Gemini va como secreto de la Edge Function (ver README).
 *
 * También puedes configurar la nube desde la app: Ajustes → Nube.
 */
window.HYPE_CONFIG = {
  supabaseUrl: '',       // ej. 'https://abcdefgh.supabase.co'
  supabaseAnonKey: '',   // ej. 'eyJhbGciOi...' o 'sb_publishable_...'
  giphyApiKey: '',       // opcional: búsqueda de GIFs (https://developers.giphy.com)
  aiModel: 'gemini-3.8-flash',
};
