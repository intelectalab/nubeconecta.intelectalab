import { newIdempotencyKey, toQuery, type HttpClient } from './http';
import type { Currency, CursorPage, ListParams } from './customers';

/** M-SRV (franja MVP): /api/v1/admin/services y /api/v1/portal/services. */
export type ServiceStatus = 'pending' | 'active' | 'suspended' | 'terminated' | 'cancelled' | 'handed_over';

export const SERVICE_STATUS_LABELS: Record<ServiceStatus, string> = {
  pending: 'Pendiente de aprovisionar',
  active: 'Activo',
  suspended: 'Suspendido',
  terminated: 'Dado de baja',
  cancelled: 'Cancelado',
  handed_over: 'Entregado',
};

export interface Subscription {
  id: string;
  status: 'active' | 'paused' | 'cancelled';
  cycle: string;
  quantity: string;
  price_minor: number;
  currency: Currency;
  starts_on: string;
  next_invoice_date: string;
}

export interface Service {
  id: string;
  code: string;
  label: string;
  status: ServiceStatus;
  customer_id: string;
  brand_id: string;
  product_id: string;
  plan_id: string | null;
  product: { id: string; code: string; name: string } | null;
  plan: { id: string; code: string; name: string; cycle: string } | null;
  cycle: string | null;
  /** Precio congelado en céntimos (suscripción o línea del pedido). */
  price: { unit_price_minor: number | null; quantity: string; currency: Currency | null };
  starts_on: string | null;
  commercial_due_date: string | null;
  auto_renew: boolean;
  /** Acceso del cliente al servicio (URL del panel + guía). Null si no se configuró. */
  access: { url?: string; label?: string; notes?: string } | null;
  activated_at: string | null;
  suspended_at: string | null;
  cancelled_at: string | null;
  subscription: Subscription | null;
  history?: { from_status: ServiceStatus | null; to_status: ServiceStatus; reason?: string | null; trigger_source?: string; occurred_at: string }[];
  version: number;
  created_at: string;
  updated_at: string;
  /** Solo en el panel. */
  order_id?: string | null;
  customer?: { id: string; code: string; legal_name: string; trade_name: string | null } | null;
}

export interface ServiceFilters {
  status?: ServiceStatus | '';
  customer_id?: string;
  brand_id?: string;
  product_id?: string;
  due_from?: string;
  due_to?: string;
  /** Servicios creados al aprobar ese pedido (solo panel). */
  order_id?: string;
}

export type ServiceAction = 'activate' | 'suspend' | 'reactivate' | 'cancel';

interface Envelope<T> {
  data: T;
}

const enc = encodeURIComponent;

export function createServicesApi(http: HttpClient) {
  const unwrap = <T>(r: Envelope<T>) => r.data;
  const list =
    (base: string) =>
    (params: ListParams & { filter?: ServiceFilters } = {}) =>
      http.get<CursorPage<Service>>(`${base}${toQuery({ q: params.q, sort: params.sort, page: { size: params.size, cursor: params.cursor ?? undefined }, filter: params.filter })}`);
  const admin = '/api/v1/admin/services';
  const portal = '/api/v1/portal/services';
  return {
    list: list(admin),
    get: (id: string) => http.get<Envelope<Service>>(`${admin}/${enc(id)}`).then(unwrap),
    /** suspend, reactivate y cancel exigen motivo. */
    transition: (id: string, action: ServiceAction, reason?: string, version?: number, idempotencyKey = newIdempotencyKey()) =>
      http.post<Envelope<Service>>(`${admin}/${enc(id)}/${action}`, { reason, version }, { idempotencyKey }).then(unwrap),
    /** Define el acceso del cliente (URL del panel + guía). */
    setAccess: (id: string, input: { url?: string | null; label?: string | null; notes?: string | null }, version?: number) =>
      http.patch<Envelope<Service>>(`${admin}/${enc(id)}/access`, { ...input, version }).then(unwrap),
    portalList: list(portal),
    portalGet: (id: string) => http.get<Envelope<Service>>(`${portal}/${enc(id)}`).then(unwrap),
  };
}
