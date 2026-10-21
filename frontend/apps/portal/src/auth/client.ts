/**
 * Cliente de la API para el portal. Un 401 en cualquier llamada avisa a los
 * suscriptores (App vuelve a la pantalla de acceso).
 */
import { createHubApi } from '@hub/api';
import type { Me } from '@hub/api';

const listeners = new Set<() => void>();

export const hub = createHubApi({
  locale: 'es',
  onUnauthenticated: () => listeners.forEach((fn) => fn()),
});

export function onUnauthenticated(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export const DEMO_MODE = import.meta.env.VITE_DEMO === '1';

/** Usuario de demostración (VITE_DEMO=1): no hay backend ni sesión real. */
export const DEMO_USER: Me = {
  id: 'demo',
  type: 'customer',
  name: 'Lucía Quispe Mamani',
  email: 'lucia.quispe@andestravel.pe',
  status: 'active',
  locale: 'es',
  timezone: 'America/Lima',
  mfa_enabled: true,
  mfa_method: 'totp',
  must_change_password: false,
  locked_until: null,
  last_login_at: null,
  disabled_at: null,
  roles: [{ id: 'demo', code: 'customer_admin', name: 'Administrador', expires_at: null }],
  version: 1,
  created_at: null,
  updated_at: null,
  permissions: [],
  mfa: { enabled: true, method: 'totp', required: false, enrollment_required: false },
  password: { change_required: false },
};

export function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  const s = (p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '');
  return (s || '?').toUpperCase();
}
