// Sección de atajos de teclado (ajustes).
import { html } from '../core/dom.js';

const ROWS = [
  ['N', 'Nuevo post'], ['/', 'Buscar'], ['J / K', 'Siguiente / anterior post'], ['L', 'Dar hype al post enfocado'], ['B', 'Guardar el post enfocado'],
  ['O · Enter', 'Abrir el post enfocado'], ['G → H', 'Inicio'], ['G → S', 'Shorts'], ['G → J', 'Juegos'], ['G → P', 'Proyectos'], ['G → G', 'Grupos'],
  ['G → I', 'Hype IA'], ['G → N', 'Notificaciones'], ['G → M', 'Mensajes'], ['G → A', 'Ajustes'], ['?', 'Ayuda de atajos'], ['Esc', 'Cerrar ventanas'],
  ['Ctrl/⌘ + Enter', 'Publicar desde el editor'], ['Ctrl/⌘ + B · I · E · K', 'Negrita · cursiva · código · enlace'],
  ['↑ / ↓ · Espacio · M', 'Shorts: navegar · pausa · sonido'],
];

export function showShortcutsInline() {
  return html`<h2>Atajos de teclado</h2>
    <section class="set-group">${ROWS.map(([k, d]) => html`<div class="set-row"><span class="meta"><b>${d}</b></span><span class="kbd">${k}</span></div>`)}</section>
    <p class="hint">Puedes desactivarlos en Ajustes → Accesibilidad.</p>`;
}
