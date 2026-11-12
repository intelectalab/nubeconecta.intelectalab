/** Utilidades de las vistas de dominios conectadas al backend (M-DOM). */
import { useEffect, useState } from 'react';
import type { DomainContactRole, DomainHolder, DomainStatus } from '@hub/api';
import { hub } from '../../../auth/client';

export const domainsApi = hub.domains;

export const HOLDER_LABEL: Record<DomainHolder, string> = { company: 'Empresa', customer: 'Cliente' };
export const DOMAIN_STATUS_LABEL: Record<DomainStatus, string> = {
  active: 'Activo', expired: 'Vencido', redemption: 'En redención', pending_transfer: 'Transferencia pendiente', transferred_out: 'Transferido', not_found: 'No encontrado',
};
export const CONTACT_ROLE_LABEL: Record<DomainContactRole, string> = { registrant: 'Titular (registrant)', admin: 'Administrativo', tech: 'Técnico', billing: 'Facturación' };

export interface RegistrarOption { id: string; label: string }

/** Cuentas de proveedores de tipo registrador (para selectores). `denied` = sin permiso o sin endpoint accesible. */
export function useRegistrarAccounts(): { options: RegistrarOption[]; loading: boolean; denied: boolean } {
  const [state, setState] = useState<{ options: RegistrarOption[]; loading: boolean; denied: boolean }>({ options: [], loading: true, denied: false });
  useEffect(() => {
    let alive = true;
    hub.providers
      .list({ filter: { type: 'registrar' }, size: 100 })
      .then(async (page) => {
        const groups = await Promise.all(page.data.map((p) => hub.providers.accounts(p.id, { size: 100 }).then((a) => a.data.map((acc): RegistrarOption => ({ id: acc.id, label: `${p.name} · ${acc.label}` })))));
        if (alive) setState({ options: groups.flat(), loading: false, denied: false });
      })
      .catch(() => {
        if (alive) setState({ options: [], loading: false, denied: true });
      });
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

const DAY = new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium' });
/** Fecha YYYY-MM-DD → texto local (sin desfase de zona horaria). */
export const fDay = (s: string | null | undefined): string => {
  if (!s) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? DAY.format(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : s;
};
