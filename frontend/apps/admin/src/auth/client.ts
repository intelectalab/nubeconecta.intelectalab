/**
 * Cliente de la API para el panel. Un 401 en cualquier llamada avisa a los
 * suscriptores (AuthGate vuelve a la pantalla de acceso).
 */
import { createHubApi } from '@hub/api';

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
