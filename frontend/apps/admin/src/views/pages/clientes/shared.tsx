/**
 * Utilidades comunes de las vistas de clientes conectadas al backend (M-CUS).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { isProblem, type BrandSummary, type ContactRole, type Customer, type CustomerStatus, type CustomerType, type TaxIdType } from '@hub/api';
import { useSession } from '../../../auth/session';
import { hub, DEMO_MODE } from '../../../auth/client';

export const customersApi = hub.customers;

/** true cuando las vistas de clientes usan el backend real (no el modo demo). */
export const LIVE = !DEMO_MODE;

export const isUuid = (s: string | null | undefined): s is string => !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

/** Permisos efectivos de /me. */
export function useCan(): (perm: string) => boolean {
  const { user } = useSession();
  return useCallback((perm: string) => user.permissions.includes(perm), [user.permissions]);
}

export const STATUS_LABEL: Record<CustomerStatus, string> = { active: 'Activo', inactive: 'Inactivo' };
export const TYPE_LABEL: Record<CustomerType, string> = { company: 'Empresa', individual: 'Persona natural' };
export const TAX_LABEL: Record<TaxIdType, string> = { ruc: 'RUC', dni: 'DNI', ce: 'Carné de extranjería', passport: 'Pasaporte', foreign_tax_id: 'ID fiscal extranjero', other: 'Otro' };
export const ROLE_LABEL: Record<ContactRole, string> = { billing: 'Facturación', administrative: 'Administrativo', technical: 'Técnico', authorized: 'Autorizado' };

/** Países frecuentes (ISO 3166-1 alfa-2). El backend acepta cualquier código de 2 letras. */
export const COUNTRY_OPTIONS: [string, string][] = [
  ['PE', 'Perú'],
  ['CL', 'Chile'],
  ['CO', 'Colombia'],
  ['EC', 'Ecuador'],
  ['BO', 'Bolivia'],
  ['AR', 'Argentina'],
  ['MX', 'México'],
  ['US', 'Estados Unidos'],
  ['ES', 'España'],
];
export const countryName = (code: string) => COUNTRY_OPTIONS.find((c) => c[0] === code)?.[1] ?? code;

export const docOf = (c: Pick<Customer, 'tax_id_type' | 'tax_id'>) => (c.tax_id ? `${c.tax_id_type ? TAX_LABEL[c.tax_id_type] : 'Doc.'} ${c.tax_id}` : '—');
export const displayName = (c: Pick<Customer, 'trade_name' | 'legal_name'>) => c.trade_name || c.legal_name;

const MONEY: Record<string, Intl.NumberFormat> = {
  PEN: new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }),
  USD: new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'USD' }),
};
/** Importe en unidades menores (céntimos) → texto. */
export const moneyMinor = (minor: number, cur: string) => (MONEY[cur] ?? MONEY.PEN).format(minor / 100);

const DT = new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short' });
const D = new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium' });
export const fDateTime = (iso: string | null | undefined) => (iso ? DT.format(new Date(iso)) : '—');
export const fDate = (iso: string | null | undefined) => (iso ? D.format(new Date(iso)) : '—');

/** Etiquetas en español de las acciones de auditoría que se muestran en el historial (resto: entidad + verbo). */
const AUDIT_ENTITY: Record<string, string> = {
  customer: 'Cliente', contact: 'Contacto', customer_note: 'Nota', communication_consent: 'Consentimiento', order: 'Pedido', service: 'Servicio',
  invoice: 'Comprobante', payment: 'Pago', payment_checkout: 'Pago con tarjeta', subscription: 'Suscripción',
};
const AUDIT_VERB: Record<string, string> = {
  created: 'creado', updated: 'actualizado', deleted: 'eliminado', restored: 'restaurado', merged: 'fusionado', exported: 'exportado',
  approved: 'aprobado', cancelled: 'anulado', activated: 'activado', suspended: 'suspendido', reactivated: 'reactivado', renewed: 'renovado',
  drafted: 'en borrador', issued: 'emitido', voided: 'anulado', discarded: 'descartado', paid: 'pagado', reported: 'reportado', validated: 'validado',
  rejected: 'rechazado', recorded: 'registrado', balance_updated: 'saldo actualizado', einvoice_accepted: 'aceptado por SUNAT', einvoice_rejected: 'rechazado por SUNAT',
  portal_access_granted: 'acceso al portal concedido', portal_access_revoked: 'acceso al portal retirado', portal_invitation_resent: 'invitación reenviada',
  personal_data_exported: 'datos personales exportados', personal_data_erased: 'datos personales eliminados', cancel_skipped: 'no se pudo anular',
};
export const auditActionLabel = (action: string) => {
  const i = action.indexOf('.');
  if (i < 0) return action;
  const entity = AUDIT_ENTITY[action.slice(0, i)];
  const verb = AUDIT_VERB[action.slice(i + 1)];
  return entity && verb ? `${entity} ${verb}` : action;
};
export const ACTOR_LABELS: Record<string, string> = { user: 'Usuario', system: 'Sistema', connector: 'Conector', plugin: 'Plugin', customer: 'Cliente' };

/** Mensaje legible para un error de la API (RFC 9457) o de red. */
export function errorText(e: unknown): string {
  if (isProblem(e)) {
    if (e.code === 'version_conflict') return 'Otra persona modificó este registro. Recargue para ver la versión actual.';
    if (e.status === 403) return 'No tiene permiso para esta acción.';
    return e.userMessage;
  }
  return 'Ocurrió un error inesperado.';
}

/** Errores de validación 422 por campo (`errors` de RFC 9457). */
export function fieldErrors(e: unknown): Record<string, string> {
  if (!isProblem(e)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(e.errors)) if (v[0]) out[k] = v[0];
  return out;
}

export interface Loadable<T> {
  data: T | null;
  error: unknown;
  loading: boolean;
  reload: () => void;
  setData: (d: T) => void;
}

/** Carga asíncrona con cancelación al desmontar o cambiar `deps`. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]): Loadable<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fnRef.current().then(
      (d) => {
        if (alive) {
          setData(d);
          setLoading(false);
        }
      },
      (e: unknown) => {
        if (alive) {
          setError(e);
          setLoading(false);
        }
      },
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { data, error, loading, reload: () => setTick((t) => t + 1), setData };
}

/** Marcas y responsables para selectores; si falta el permiso, listas vacías. */
export function useLookups(): { brands: BrandSummary[]; staff: { id: string; name: string }[] } {
  const can = useCan();
  const canBrands = can('brands.brand.view');
  const canUsers = can('identity.user.view');
  const brands = useLoad(() => (canBrands ? customersApi.brands() : Promise.resolve([])), [canBrands]);
  const staff = useLoad(() => (canUsers ? customersApi.staff() : Promise.resolve([])), [canUsers]);
  return { brands: brands.data ?? [], staff: staff.data ?? [] };
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
