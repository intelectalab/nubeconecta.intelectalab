/**
 * Módulo Clientes (M-CUS) del panel: /api/v1/admin/customers, contactos y notas.
 *
 * Tipos tomados de los Resources reales del backend:
 *  - CustomerResource  → columnas de `customers` + `tags` (+ derivados del listado)
 *  - ContactResource   → columnas de `contacts` + portal_role, mfa_enabled, last_login_at, consent
 *                        (en el portal no llegan user_id, mfa_enabled ni last_login_at)
 *  - ModelResource     → notas (`customer_notes`) e historial (`audit_events`)
 */
import { newIdempotencyKey, toQuery, type HttpClient } from './http';

export type CustomerType = 'company' | 'individual';
export type CustomerStatus = 'active' | 'inactive';
export type TaxIdType = 'ruc' | 'dni' | 'ce' | 'passport' | 'foreign_tax_id' | 'other';
export type Currency = 'PEN' | 'USD';
export type ContactRole = 'billing' | 'administrative' | 'technical' | 'authorized';
export type PortalRole = 'customer_admin' | 'customer_user';

export const TAX_ID_TYPES: TaxIdType[] = ['ruc', 'dni', 'ce', 'passport', 'foreign_tax_id', 'other'];
export const CONTACT_ROLES: ContactRole[] = ['billing', 'administrative', 'technical', 'authorized'];

export interface CustomerTag {
  id: string;
  name: string;
  slug: string;
  color: string | null;
}

export interface Customer {
  id: string;
  organization_id: string;
  code: string;
  type: CustomerType;
  legal_name: string;
  trade_name: string | null;
  normalized_name: string;
  tax_id_type: TaxIdType | null;
  tax_id: string | null;
  country: string;
  currency: Currency;
  locale: string;
  timezone: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  status: CustomerStatus;
  tax_treatment: 'taxed' | 'export';
  is_withholding_agent: boolean;
  invoice_consolidation: 'consolidated' | 'per_service';
  origin_brand_id: string;
  account_manager_id: string | null;
  custom: Record<string, unknown>;
  merged_into_id: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  tags: CustomerTag[];
  /** Solo en el listado (x-derived). */
  active_services_count?: number;
  /** Solo en el listado (x-derived), en unidades menores. */
  overdue_balance_minor?: number;
}

/** Campos editables (CustomerService::rules). */
export interface CustomerInput {
  type?: CustomerType;
  legal_name?: string;
  trade_name?: string | null;
  tax_id_type?: TaxIdType | null;
  tax_id?: string | null;
  country?: string;
  currency?: Currency;
  locale?: 'es' | 'en';
  timezone?: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  status?: CustomerStatus;
  tax_treatment?: 'taxed' | 'export';
  is_withholding_agent?: boolean;
  invoice_consolidation?: 'consolidated' | 'per_service';
  origin_brand_id?: string;
  account_manager_id?: string | null;
  custom?: Record<string, unknown>;
  tag_ids?: string[];
  /** Crear aunque haya clientes parecidos (409 possible_duplicate). */
  confirm_duplicates?: boolean;
}

export interface ConsentSummary {
  marketing_allowed_channels: string[];
  last_opt_out_at: string | null;
  last_recorded_at: string | null;
}

export interface Contact {
  id: string;
  customer_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  roles: ContactRole[];
  is_primary: boolean;
  locale: string | null;
  user_id: string | null;
  custom?: Record<string, unknown>;
  version: number;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
  updated_by?: string | null;
  portal_role: PortalRole | null;
  /** Solo en el panel. */
  mfa_enabled?: boolean;
  /** Solo en el panel. */
  last_login_at?: string | null;
  consent: ConsentSummary;
}

export interface ContactInput {
  name?: string;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  roles?: ContactRole[];
  is_primary?: boolean;
  locale?: 'es' | 'en' | null;
}

export interface CustomerNote {
  id: string;
  customer_id: string;
  body: string;
  is_pinned: boolean;
  version: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface AuditEvent {
  id: string;
  chain_seq: number;
  occurred_at: string;
  actor_type: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  customer_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
}

export interface CustomerOverview {
  customer: Customer;
  suspension_exempt: boolean;
  /** Saldo abierto por moneda, en unidades menores. */
  balance_minor: Partial<Record<Currency, number>>;
  counts: Record<string, number>;
  billing_contact_missing: boolean;
  /** Solo con finance.cost.view (cálculo pendiente de FIN). */
  profitability?: null;
}

/** Posible duplicado (extensión `duplicates` de los 409). */
export interface DuplicateMatch {
  id: string;
  code: string;
  legal_name: string;
  tax_id_type: TaxIdType | null;
  tax_id: string | null;
  email: string | null;
  matches: ('tax_id' | 'email' | 'name')[];
}

export interface CursorMeta {
  next_cursor: string | null;
  prev_cursor: string | null;
  has_more: boolean;
  page_size: number;
}

export interface CursorPage<T> {
  data: T[];
  meta: CursorMeta;
  links: { next: string | null; prev: string | null };
}

export interface CustomerFilters {
  status?: CustomerStatus | '';
  type?: CustomerType | '';
  country?: string;
  currency?: Currency | '';
  origin_brand_id?: string;
  account_manager_id?: string;
  has_overdue_debt?: boolean;
  tag?: string;
}

export interface ListParams {
  q?: string;
  sort?: string;
  cursor?: string | null;
  size?: number;
}

export interface BrandSummary {
  id: string;
  code: string;
  name: string;
  status?: string;
}

interface Envelope<T> {
  data: T;
}

const enc = encodeURIComponent;

export function createCustomersApi(http: HttpClient) {
  const base = '/api/v1/admin';
  const page = (p: ListParams) => ({ q: p.q, sort: p.sort, page: { size: p.size, cursor: p.cursor ?? undefined } });
  const unwrap = <T>(r: Envelope<T>) => r.data;

  return {
    list: (params: ListParams & { filter?: CustomerFilters } = {}) =>
      http.get<CursorPage<Customer>>(`${base}/customers${toQuery({ ...page(params), filter: { ...params.filter, has_overdue_debt: params.filter?.has_overdue_debt ? '1' : undefined } })}`),
    get: (id: string) => http.get<Envelope<Customer>>(`${base}/customers/${enc(id)}`).then(unwrap),
    overview: (id: string) => http.get<Envelope<CustomerOverview>>(`${base}/customers/${enc(id)}/overview`).then(unwrap),
    create: (input: CustomerInput, idempotencyKey = newIdempotencyKey()) =>
      http.post<Envelope<Customer>>(`${base}/customers`, input, { idempotencyKey }).then(unwrap),
    /** PATCH con control de versión: 409 `version_conflict` si `version` quedó vieja. */
    update: (id: string, version: number, input: CustomerInput) => http.patch<Envelope<Customer>>(`${base}/customers/${enc(id)}`, { ...input, version }).then(unwrap),
    remove: (id: string) => http.delete<void>(`${base}/customers/${enc(id)}`),
    history: (id: string, params: ListParams & { action?: string } = {}) =>
      http.get<CursorPage<AuditEvent>>(`${base}/customers/${enc(id)}/history${toQuery({ ...page(params), filter: { action: params.action } })}`),
    duplicates: (q: { tax_id_type?: TaxIdType; tax_id?: string; email?: string; legal_name?: string; except_id?: string }) =>
      http.get<Envelope<DuplicateMatch[]>>(`${base}/customers/duplicates${toQuery(q)}`).then(unwrap),
    taxIdLookup: (tax_id_type: TaxIdType, tax_id: string, country?: string) =>
      http.get<Envelope<{ tax_id_type: TaxIdType; tax_id: string; valid: boolean; lookup: Record<string, unknown> | null }>>(`${base}/customers/tax-id-lookup${toQuery({ tax_id_type, tax_id, country })}`).then(unwrap),
    /** CSV del listado filtrado (customers.customer.export), hasta 10 000 filas. */
    exportCsv: (params: { q?: string; filter?: CustomerFilters } = {}) =>
      http.postBlob(`${base}/customers/exports${toQuery({ q: params.q, filter: { ...params.filter, has_overdue_debt: params.filter?.has_overdue_debt ? '1' : undefined } })}`),

    contacts: {
      list: (customerId: string, params: ListParams & { role?: ContactRole } = {}) =>
        http.get<CursorPage<Contact>>(`${base}/customers/${enc(customerId)}/contacts${toQuery({ ...page(params), filter: { role: params.role } })}`),
      create: (customerId: string, input: ContactInput, idempotencyKey = newIdempotencyKey()) =>
        http.post<Envelope<Contact>>(`${base}/customers/${enc(customerId)}/contacts`, input, { idempotencyKey }).then(unwrap),
      update: (id: string, version: number, input: ContactInput) => http.patch<Envelope<Contact>>(`${base}/contacts/${enc(id)}`, { ...input, version }).then(unwrap),
      remove: (id: string) => http.delete<void>(`${base}/contacts/${enc(id)}`),
      grantPortal: (id: string, role: PortalRole) => http.post<Envelope<Contact>>(`${base}/contacts/${enc(id)}/portal-access`, { role }).then(unwrap),
      revokePortal: (id: string) => http.delete<unknown>(`${base}/contacts/${enc(id)}/portal-access`),
      resendInvitation: (id: string) => http.post<unknown>(`${base}/contacts/${enc(id)}/portal-invitation`),
    },

    /** Vista "ver como cliente": solo lectura sobre la sesión del staff, auditada. */
    impersonation: {
      start: (customerId: string) =>
        http.post<Envelope<{ customer_id: string; portal_url: string; expires_at: number }>>(`${base}/customers/${enc(customerId)}/impersonation`).then(unwrap),
      stop: () => http.delete<void>(`${base}/customers/impersonation`),
    },

    notes: {
      list: (customerId: string, params: ListParams = {}) => http.get<CursorPage<CustomerNote>>(`${base}/customers/${enc(customerId)}/notes${toQuery(page(params))}`),
      create: (customerId: string, body: string, is_pinned = false) => http.post<Envelope<CustomerNote>>(`${base}/customers/${enc(customerId)}/notes`, { body, is_pinned }).then(unwrap),
      update: (id: string, version: number, input: { body?: string; is_pinned?: boolean }) => http.patch<Envelope<CustomerNote>>(`${base}/customer-notes/${enc(id)}`, { ...input, version }).then(unwrap),
      remove: (id: string) => http.delete<void>(`${base}/customer-notes/${enc(id)}`),
    },

    /** Usuarios internos activos para «Responsable» (identity.user.view). */
    staff: () =>
      http.get<CursorPage<{ id: string; name: string; email: string }>>(`${base}/users${toQuery({ filter: { type: 'staff', status: 'active' }, page: { size: 100 } })}`).then((r) => r.data),
    /** Marcas para el selector de alta (M-BRD, brands.brand.view). */
    brands: () => http.get<CursorPage<BrandSummary>>(`${base}/brands${toQuery({ page: { size: 100 } })}`).then((r) => r.data),
  };
}

export type CustomersApi = ReturnType<typeof createCustomersApi>;
