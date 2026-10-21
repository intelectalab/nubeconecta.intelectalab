import { createContext, useContext } from 'react';
import type { Me } from '@hub/api';

export interface Session {
  user: Me;
  /** true en modo demo (VITE_DEMO=1): no hay backend ni sesión real. */
  demo: boolean;
  logout: () => Promise<void>;
  /**
   * Para errores de la API en las vistas: si es 403 `mfa_required` y el usuario
   * no tiene segundo factor, abre el alta de TOTP. Devuelve true si lo atendió.
   */
  handleApiError: (e: unknown) => boolean;
}

export const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const s = useContext(SessionContext);
  if (!s) throw new Error('useSession() fuera de <AuthGate>');
  return s;
}

export function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  const s = (p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '');
  return (s || '?').toUpperCase();
}
