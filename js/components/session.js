// Control de acceso para acciones que requieren cuenta.
import { html } from '../core/dom.js';
import { state } from '../core/store.js';
import { openModal } from '../core/ui.js';
import { navigate } from '../core/router.js';

export function requireUser(action = 'hacer esto') {
  if (state.user) return true;
  const m = openModal({
    title: 'Únete a Hype',
    size: 'sm',
    content: html`<div class="col" style="text-align:center;align-items:center">
      <div style="font-size:44px">⚡</div>
      <p class="muted">Necesitas una cuenta para ${action}. Es gratis y tarda 20 segundos.</p>
      <button class="btn btn-primary btn-block" data-go>Crear cuenta o entrar</button>
    </div>`,
  });
  m.body.querySelector('[data-go]').onclick = () => { m.close(); navigate('/bienvenida'); };
  return false;
}
