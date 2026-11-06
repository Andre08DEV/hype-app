// Elige el backend: nube (Supabase) si hay credenciales, si no, modo demo local.
import { state } from '../core/store.js';
import { LocalBackend } from './local.js';

export let api = null;

export function cloudConfig() {
  const cfg = window.HYPE_CONFIG || {};
  const s = state.settings.cloud || {};
  const url = (s.url || cfg.supabaseUrl || '').trim();
  const key = (s.anonKey || cfg.supabaseAnonKey || '').trim();
  const norm = (u) => String(u || '').trim().replace(/\/+$/, '');
  const fromConfig = !!cfg.supabaseUrl && (!s.url || norm(s.url) === norm(cfg.supabaseUrl));
  const source = fromConfig ? 'config.js' : s.url ? 'ajustes' : null;
  return { url, key, configured: !!(url && key), forceLocal: !!s.forceLocal, source };
}

export async function initApi() {
  const cfg = cloudConfig();
  if (cfg.configured && !cfg.forceLocal) {
    try {
      const { SupabaseBackend } = await import('./supabase.js');
      const backend = new SupabaseBackend({ url: cfg.url, key: cfg.key });
      await backend.init();
      api = backend;
      state.mode = 'cloud';
      return api;
    } catch (err) {
      console.error('[api] No se pudo conectar con Supabase, uso modo local', err);
      state.cloudError = err?.message || String(err);
    }
  }
  api = new LocalBackend();
  await api.init();
  state.mode = 'local';
  return api;
}
