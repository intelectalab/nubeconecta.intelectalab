import { newIdempotencyKey, toQuery, type HttpClient } from './http';
import type { Currency, CursorPage, ListParams } from './customers';

/** M-BIL (franja MVP): /api/v1/admin/invoices y /api/v1/portal/invoices. */
export type InvoiceType = 'invoice' | 'receipt' | 'credit_note' | 'debit_note';
export type InvoiceStatus = 'draft' | 'issued' | 'partially_paid' | 'paid' | 'overdue' | 'void';
export type FiscalStatus = 'not_applicable' | 'pending' | 'accepted' | 'rejected' | 'voided';

export const INVOICE_TYPE_LABELS: Record<InvoiceType, string> = {
  invoice: 'Factura',
  receipt: 'Boleta',
  credit_note: 'Nota de crédito',
  debit_note: 'Nota de débito',
};

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: 'Borrador',
  issued: 'Emitido',
  partially_paid: 'Pagado parcialmente',
  paid: 'Pagado',
  overdue: 'Vencido',
  void: 'Anulado',
};

export const FISCAL_STATUS_LABELS: Record<FiscalStatus, string> = {
  not_applicable: 'Sin envío',
  pending: 'Pendiente de envío',
  accepted: 'Aceptado por SUNAT',
  rejected: 'Rechazado',
  voided: 'Dado de baja',
};

export interface InvoiceItem {
  id: string;
  kind: string;
  service_id: string | null;
  product_id: string | null;
  description: string;
  period_start: string | null;
  period_end: string | null;
  quantity: string;
  unit_price_minor: number;
  subtotal_minor: number;
  tax_minor: number;
  total_minor: number;
}

export interface Invoice {
  id: string;
  type: InvoiceType;
  status: InvoiceStatus;
  fiscal_status: FiscalStatus;
  tax_treatment: 'taxed' | 'export';
  series: string | null;
  /** "F001-00000123" o null en borrador. */
  number: string | null;
  correlative: number | null;
  customer_id: string;
  brand_id: string;
  legal_entity_id: string;
  currency: Currency;
  issue_date: string | null;
  due_date: string | null;
  subtotal_minor: number;
  discount_minor: number;
  tax_minor: number;
  total_minor: number;
  /** Saldo pendiente en céntimos. */
  balance_minor: number;
  tax_rate_percent: string | null;
  /** simulated = true: CDR ficticio del conector de prueba (sin validez ante SUNAT). */
  einvoice: { provider: string; reference: string | null; code: string | null; message: string; simulated: boolean; cdr: Record<string, unknown> | null } | null;
  items: InvoiceItem[] | null;
  issued_at: string | null;
  voided_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  /** Pagos aplicados (solo en el detalle). */
  payments?: InvoicePaymentLine[] | null;
  paid_at?: string | null;
  /** Solo en el panel. */
  customer?: { id: string; code: string; legal_name: string; trade_name: string | null } | null;
  origin?: { type: 'order' | 'renewal' | null; order_id: string | null; subscription_id: string | null };
  void_reason?: string | null;
  /** Solo en el portal: pago con tarjeta (Mercado Pago) disponible para este comprobante. */
  card_payment?: { available: boolean; provider: 'mercadopago' };
}

export type CardCheckoutStatus = 'created' | 'pending' | 'approved' | 'declined' | 'expired' | 'cancelled';

/** Intento de pago con tarjeta (Mercado Pago Checkout Pro). */
export interface CardCheckout {
  id: string;
  invoice_id: string | null;
  status: CardCheckoutStatus;
  provider: 'mercadopago';
  amount_minor: number;
  surcharge_minor: number;
  currency: Currency;
  payment_id: string | null;
  /** Motivo de rechazo en español. */
  message: string | null;
  expires_at: string | null;
  completed_at: string | null;
  /** Solo al crear: URL del formulario alojado de Mercado Pago. */
  redirect_url?: string;
}

export interface InvoiceFilters {
  status?: InvoiceStatus | '';
  fiscal_status?: FiscalStatus | '';
  type?: InvoiceType | '';
  currency?: Currency | '';
  customer_id?: string;
  brand_id?: string;
  issued_from?: string;
  issued_to?: string;
  has_balance?: 'true' | 'false';
  /** Comprobante generado al aprobar ese pedido (solo panel). */
  order_id?: string;
}

export interface InvoicePaymentLine {
  payment_id: string;
  amount_minor: number;
  status: PaymentStatus;
  voided: boolean;
  method: string | null;
  external_id: string | null;
  received_at: string | null;
}

/* ---------- Pagos, vouchers y cobranza (M-BIL franja MVP) ---------- */

export type PaymentStatus = 'reported' | 'validated' | 'rejected' | 'refunded' | 'charged_back';

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  reported: 'En revisión',
  validated: 'Validado',
  rejected: 'Rechazado',
  refunded: 'Reembolsado',
  charged_back: 'Contracargo',
};

/** Etiqueta del pago considerando la anulación (validado y luego anulado). */
export const paymentStatusLabel = (p: { status: PaymentStatus; voided: boolean }) => (p.voided ? 'Anulado' : PAYMENT_STATUS_LABELS[p.status]);

export interface PaymentMethodOption {
  id: string;
  code: string;
  name: string;
  kind: 'bank_transfer' | 'paypal' | 'global66' | 'card_gateway' | 'other';
  requires_proof: boolean;
  available_in_portal: boolean;
  instructions: Record<string, unknown>;
}

export interface PaymentAllocationLine {
  invoice_id: string;
  invoice_number: string | null;
  amount_minor: number;
  invoice_balance_minor: number | null;
  invoice_status: InvoiceStatus | null;
}

export interface Payment {
  id: string;
  customer_id: string;
  status: PaymentStatus;
  voided: boolean;
  payment_method: { id: string; code: string; name: string; kind: string } | null;
  amount_minor: number;
  currency: Currency;
  allocated_minor: number;
  external_id: string | null;
  reported_via: 'portal' | 'sales' | 'finance' | 'webhook' | 'import';
  received_at: string | null;
  validated_at: string | null;
  rejection_reason: string | null;
  has_proof: boolean;
  allocations: PaymentAllocationLine[];
  created_at: string | null;
  updated_at: string | null;
  version: number;
  /** Solo en el panel. */
  customer?: { id: string; code: string; legal_name: string; trade_name: string | null } | null;
  reported_by?: string | null;
  validated_by?: string | null;
  notes?: string | null;
  proof?: { id: string; original_name: string; mime_type: string; size_bytes: number; scan_status: string } | null;
}

export interface PaymentFilters {
  status?: PaymentStatus | '';
  reported_via?: string;
  currency?: Currency | '';
  customer_id?: string;
  payment_method_id?: string;
  invoice_id?: string;
}

export interface AllocationInput {
  invoice_id: string;
  amount_minor: number;
}

export interface PaymentInput {
  customer_id: string;
  payment_method_id: string;
  amount_minor: number;
  currency: Currency;
  received_at?: string;
  external_id?: string;
  notes?: string;
  /** Guardar y validar (billing.payment.validate). */
  validate?: boolean;
  allocations?: AllocationInput[];
}

export interface VoucherInput {
  payment_method_id: string;
  amount_minor: number;
  received_at?: string;
  external_id?: string;
  notes?: string;
  file: File;
}

export type AgingBucket = 'current' | 'd1_30' | 'd31_60' | 'd61_90' | 'd90_plus';

export const AGING_LABELS: Record<AgingBucket, string> = {
  current: 'Al día',
  d1_30: '1-30 días',
  d31_60: '31-60 días',
  d61_90: '61-90 días',
  d90_plus: 'Más de 90',
};

export interface DebtAgingRow {
  customer_id: string;
  customer: { id: string; code: string; legal_name: string; trade_name: string | null } | null;
  currency: Currency;
  buckets: Record<AgingBucket, number>;
  total_minor: number;
  overdue_minor: number;
  invoices: number;
  oldest_due_date: string | null;
  last_payment_at: string | null;
}

export interface DebtAging {
  data: DebtAgingRow[];
  meta: { as_of: string; totals: { currency: Currency; buckets: Record<AgingBucket, number>; total_minor: number; overdue_minor: number }[] };
}

export interface DunningEvent {
  id: string;
  invoice_id: string;
  invoice_number: string | null;
  customer_id: string;
  customer_name: string;
  action: string;
  status: string;
  scheduled_for: string;
  executed_at: string | null;
  detail: { offset_days?: number; channels?: string[]; recipient?: string | null; delivery?: string; template?: string | null };
}

export interface PortalSummary {
  services: { active: number; suspended: number; pending: number };
  debt: { currency: Currency; balance_minor: number; overdue_minor: number; invoices: number }[];
  upcoming_invoices: { id: string; number: string | null; type: InvoiceType; status: InvoiceStatus; currency: Currency; due_date: string | null; total_minor: number; balance_minor: number }[];
  pending_vouchers: number;
  as_of: string;
}

/** Flujo de caja del panel de inicio (GET /api/v1/admin/billing/cashflow). */
export interface CashflowSeries {
  currency: string;
  /** Exactamente 12 puntos, alineados con `months`. */
  points: { month: string; amount_minor: number }[];
}
export interface CashflowMethod {
  kind: 'bank_transfer' | 'paypal' | 'global66' | 'card_gateway' | 'other';
  name: string;
  currency: string;
  amount_minor: number;
}
export interface Cashflow {
  /** 12 'YYYY-MM' cronológicos; el mes actual va al final. */
  months: string[];
  billed: CashflowSeries[];
  collected: CashflowSeries[];
  /** Pagos validados del mes actual, una fila por método y moneda. */
  methods: CashflowMethod[];
}

interface Envelope<T> {
  data: T;
}

const enc = encodeURIComponent;

export function createBillingApi(http: HttpClient) {
  const unwrap = <T>(r: Envelope<T>) => r.data;
  const list =
    (base: string) =>
    (params: ListParams & { filter?: InvoiceFilters } = {}) =>
      http.get<CursorPage<Invoice>>(`${base}${toQuery({ q: params.q, sort: params.sort, page: { size: params.size, cursor: params.cursor ?? undefined }, filter: params.filter })}`);
  const admin = '/api/v1/admin/invoices';
  const portal = '/api/v1/portal/invoices';
  return {
    cashflow: () => http.get<Envelope<Cashflow>>('/api/v1/admin/billing/cashflow').then(unwrap),
    list: list(admin),
    get: (id: string) => http.get<Envelope<Invoice>>(`${admin}/${enc(id)}`).then(unwrap),
    issue: (id: string, version?: number, idempotencyKey = newIdempotencyKey()) =>
      http.post<Envelope<Invoice>>(`${admin}/${enc(id)}/issue`, version === undefined ? {} : { version }, { idempotencyKey }).then(unwrap),
    void: (id: string, reason: string, version?: number, idempotencyKey = newIdempotencyKey()) =>
      http.post<Envelope<Invoice>>(`${admin}/${enc(id)}/void`, { reason, version }, { idempotencyKey }).then(unwrap),
    /** Ruta de la representación impresa (HTML); download = adjunto. */
    documentPath: (id: string, download = false) => `${admin}/${enc(id)}/document${download ? '?download=1' : ''}`,
    /** Representación impresa (HTML) como archivo, con la sesión actual. */
    document: (id: string) => http.getBlob(`${admin}/${enc(id)}/document?download=1`),
    portalList: list(portal),
    portalGet: (id: string) => http.get<Envelope<Invoice>>(`${portal}/${enc(id)}`).then(unwrap),
    portalDocumentPath: (id: string, download = false) => `${portal}/${enc(id)}/document${download ? '?download=1' : ''}`,
    portalDocument: (id: string) => http.getBlob(`${portal}/${enc(id)}/document?download=1`),
    ...createPaymentsApi(http),
  };
}

const formOf = (fields: Record<string, string | number | boolean | File | undefined | null>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null || v === '') continue;
    f.append(k, v instanceof File ? v : typeof v === 'boolean' ? (v ? '1' : '0') : String(v));
  }
  return f;
};

/** Pagos (/admin/payments), cobranza (/admin/collections) y portal (/portal/payments, vouchers, resumen). */
function createPaymentsApi(http: HttpClient) {
  const unwrap = <T>(r: Envelope<T>) => r.data;
  const admin = '/api/v1/admin/payments';
  const pagePayments =
    (base: string) =>
    (params: ListParams & { filter?: PaymentFilters; q?: string } = {}) =>
      http.get<CursorPage<Payment>>(`${base}${toQuery({ sort: params.sort, page: { size: params.size, cursor: params.cursor ?? undefined }, filter: params.filter, q: params.q || undefined })}`);
  return {
    paymentMethods: () => http.get<Envelope<PaymentMethodOption[]>>('/api/v1/admin/payment-methods').then(unwrap),
    payments: pagePayments(admin),
    payment: (id: string) => http.get<Envelope<Payment>>(`${admin}/${enc(id)}`).then(unwrap),
    /** Con `proof` se envía multipart; si no, JSON. */
    createPayment: (input: PaymentInput, proof?: File | null, idempotencyKey = newIdempotencyKey()) => {
      if (!proof) return http.post<Envelope<Payment>>(admin, input, { idempotencyKey }).then(unwrap);
      const { allocations = [], ...rest } = input;
      const form = formOf({ ...rest, proof });
      allocations.forEach((a, i) => {
        form.append(`allocations[${i}][invoice_id]`, a.invoice_id);
        form.append(`allocations[${i}][amount_minor]`, String(a.amount_minor));
      });
      return http.post<Envelope<Payment>>(admin, form, { idempotencyKey }).then(unwrap);
    },
    validatePayment: (id: string, version?: number, allocations?: AllocationInput[], idempotencyKey = newIdempotencyKey()) =>
      http.post<Envelope<Payment>>(`${admin}/${enc(id)}/validate`, { version, allocations }, { idempotencyKey }).then(unwrap),
    rejectPayment: (id: string, reason: string, version?: number, idempotencyKey = newIdempotencyKey()) =>
      http.post<Envelope<Payment>>(`${admin}/${enc(id)}/reject`, { reason, version }, { idempotencyKey }).then(unwrap),
    voidPayment: (id: string, reason: string, version?: number, idempotencyKey = newIdempotencyKey()) =>
      http.post<Envelope<Payment>>(`${admin}/${enc(id)}/void`, { reason, version }, { idempotencyKey }).then(unwrap),
    paymentProof: (id: string) => http.getBlob(`${admin}/${enc(id)}/proof`, '*/*'),
    aging: (filter: { customer_id?: string; currency?: Currency | '' } = {}) => http.get<DebtAging>(`/api/v1/admin/collections/aging${toQuery({ filter })}`),
    dunningEvents: (filter: { invoice_id?: string; status?: string } = {}) => http.get<Envelope<DunningEvent[]>>(`/api/v1/admin/collections/dunning-events${toQuery({ filter })}`).then(unwrap),

    portalSummary: () => http.get<Envelope<PortalSummary>>('/api/v1/portal/summary').then(unwrap),
    portalPaymentMethods: () => http.get<Envelope<PaymentMethodOption[]>>('/api/v1/portal/payment-methods').then(unwrap),
    portalPayments: pagePayments('/api/v1/portal/payments'),
    portalPayment: (id: string) => http.get<Envelope<Payment>>(`/api/v1/portal/payments/${enc(id)}`).then(unwrap),
    portalPaymentProof: (id: string) => http.getBlob(`/api/v1/portal/payments/${enc(id)}/proof`, '*/*'),
    portalSubmitVoucher: (invoiceId: string, input: VoucherInput, idempotencyKey = newIdempotencyKey(), onUploadProgress?: (fraction: number) => void) =>
      http.post<Envelope<Payment>>(`/api/v1/portal/invoices/${enc(invoiceId)}/vouchers`, formOf({ ...input }), { idempotencyKey, onUploadProgress }).then(unwrap),
    /** Crea el intento y devuelve redirect_url (Mercado Pago). */
    portalStartCardPayment: (invoiceId: string, idempotencyKey = newIdempotencyKey()) =>
      http.post<Envelope<CardCheckout>>(`/api/v1/portal/invoices/${enc(invoiceId)}/card-payment`, {}, { idempotencyKey }).then(unwrap),
    portalCardPayment: (checkoutId: string) => http.get<Envelope<CardCheckout>>(`/api/v1/portal/card-payments/${enc(checkoutId)}`).then(unwrap),
    /** Retorno desde Mercado Pago: el backend consulta el pago a MP (no confía en la URL). */
    portalConfirmCardPayment: (checkoutId: string, paymentId?: string | null) =>
      http.post<Envelope<CardCheckout>>(`/api/v1/portal/card-payments/${enc(checkoutId)}/confirm`, paymentId ? { payment_id: paymentId } : {}).then(unwrap),
  };
}
