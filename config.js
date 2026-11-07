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
 * También puedes configurar la nube desde la app (Ajustes → Nube), pero eso
 * se guarda SOLO en ese navegador. Lo que pongas aquí vale para todo el mundo,
 * en cualquier navegador, perfil de Chrome, dispositivo o cuenta.
 *
 * ✏️ El valor va DENTRO de las comillas: supabaseUrl: 'https://…',
 *    lo que escribas después de // es un comentario y se ignora.
 */
window.HYPE_CONFIG = {
  supabaseUrl: 'https://vqxfczrtjgwpszdvksuy.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZxeGZjenJ0amd3cHN6ZHZrc3V5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc1MjgxNDYsImV4cCI6MjEwMzEwNDE0Nn0.CwfcwVVxq0rkvM6A_7j5wJDEP9HH8weIimsJGpC6iuk',
  giphyApiKey: 'OJbOJ6CVqu6KKSQ1MrcNFIO8NHXEkZ5s',       // pega aquí tu key de GIPHY (32 caracteres) entre las comillas
  aiModel: 'gemini-3.8-flash',
  iceServers: [],        // opcional: servidor TURN para videollamadas en redes estrictas (ver README → Videollamadas)
};
