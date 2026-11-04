/**
 * Pedidos (M-ORD, franja MVP) del panel: /api/v1/admin/orders.
 * Tipos tomados de OrderResource: columnas de `orders` + `customer` (resumen), `items`
 * con `amount_minor` y los derivados `subtotal_minor`, `tax_minor`, `tax_rate_percent`.
 * Crear, aprobar y anular exigen Idempotency-Key: se renueva tras una respuesta 4xx.
 */
import { newIdempotencyKey, toQuery, type HttpClient } from './http';
import type { Currency, CursorPage, ListParams } from './customers';

export type OrderStatus = 'draft' | 'approved' | 'payment_validated' | 'provisioning' | 'testing' | 'active' | 'manual_review' | 'failed' | 'cancelled';

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  draft: 'Borrador',
  approved: 'Aprobado',
  payment_validated: 'Pago validado',
  provisioning: 'Aprovisionando',
  testing: 'En pruebas',
  active: 'Activo',
  manual_review: 'Revisión manual',
  failed: 'Fallido',
  cancelled: 'Anulado',
};

export interface OrderItem {
  id: string;
  product_id: string;
  plan_id: string | null;
  service_id: string | null;
  description: string;
  quantity: string;
  unit_price_minor: number;
  currency: Currency;
  amount_minor: number;
  config: Record<string, unknown> & { cycle?: string; tax?: { treatment: 'taxed' | 'export'; rate_percent: string } };
}

export interface Order {
  id: string;
  number: string;
  customer_id: string;
  brand_id: string;
  status: OrderStatus;
  channel: 'sales' | 'online';
  currency: Currency;
  total_minor: number;
  subtotal_minor: number;
  tax_minor: number;
  tax_rate_percent: string | null;
  requested_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  notes: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  customer: { id: string; code: string; legal_name: string; trade_name: string | null } | null;
  items: OrderItem[];
}

export interface OrderInput {
  customer_id: string;
  brand_id?: string | null;
  currency?: Currency | null;
  notes?: string | null;
  items: { plan_id: string; quantity?: number; description?: string | null }[];
}

export interface OrderPreviewLine {
  product_id: string;
  plan_id: string;
  description: string;
  quantity: string;
  unit_price_minor: number;
  amount_minor: number;
  config?: Record<string, unknown>;
  taxed?: boolean;
}

export interface OrderPreview {
  currency: Currency;
  tax_rate_percent: string;
  subtotal_minor: number;
  taxable_minor: number;
  tax_minor: number;
  total_minor: number;
  items: OrderPreviewLine[];
}

export interface OrderFilters {
  status?: OrderStatus | '';
  customer_id?: string;
  brand_id?: string;
  currency?: Currency | '';
  created_from?: string;
  created_to?: string;
}

interface Envelope<T> {
  data: T;
}

const enc = encodeURIComponent;

export function createOrdersApi(http: HttpClient) {
  const base = '/api/v1/admin/orders';
  const unwrap = <T>(r: Envelope<T>) => r.data;
  return {
    list: (params: ListParams & { filter?: OrderFilters } = {}) =>
      http.get<CursorPage<Order>>(`${base}${toQuery({ q: params.q, sort: params.sort, page: { size: params.size, cursor: params.cursor ?? undefined }, filter: params.filter })}`),
    get: (id: string) => http.get<Envelope<Order>>(`${base}/${enc(id)}`).then(unwrap),
    preview: (input: OrderInput) => http.post<Envelope<OrderPreview>>(`${base}/totals-preview`, input).then(unwrap),
    create: (input: OrderInput, idempotencyKey = newIdempotencyKey()) => http.post<Envelope<Order>>(base, input, { idempotencyKey }).then(unwrap),
    update: (id: string, version: number, input: OrderInput) => http.patch<Envelope<Order>>(`${base}/${enc(id)}`, { ...input, version }).then(unwrap),
    approve: (id: string, version?: number, idempotencyKey = newIdempotencyKey()) =>
      http.post<Envelope<Order>>(`${base}/${enc(id)}/approve`, version === undefined ? {} : { version }, { idempotencyKey }).then(unwrap),
    cancel: (id: string, reason: string, version?: number, idempotencyKey = newIdempotencyKey()) =>
      http.post<Envelope<Order>>(`${base}/${enc(id)}/cancel`, { reason, version }, { idempotencyKey }).then(unwrap),
  };
}
