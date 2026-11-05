import { newIdempotencyKey, toQuery, type HttpClient } from './http';
import type { CursorPage, ListParams } from './customers';

export type ProviderType =
  | 'hosting' | 'server' | 'cloud' | 'registrar' | 'email' | 'ssl' | 'cdn'
  | 'bulk_email' | 'payment' | 'einvoice' | 'saas' | 'dns' | 'ai' | 'other';
export type ProviderOrigin = 'company' | 'customer';
export type ProviderStatus = 'active' | 'inactive';
export type ProviderAccountOwner = 'company' | 'customer';
export type ProviderAccountStatus = 'active' | 'suspended' | 'closed';

export interface Provider {
  id: string;
  code: string;
  name: string;
  type: ProviderType;
  origin: ProviderOrigin;
  portal_url: string | null;
  cost_currency: string;
  connector: string | null;
  status: ProviderStatus;
  notes_internal: string | null;
  sla_notes: string | null;
  customer_id: string | null;
  custom: Record<string, unknown>;
  version: number;
  created_at: string;
  updated_at: string;
  customer?: { id: string; code: string; name: string } | null;
  accounts?: ProviderAccount[];
}

export interface ProviderAccount {
  id: string;
  provider_id: string;
  label: string;
  external_account_id: string | null;
  owner: ProviderAccountOwner;
  customer_id: string | null;
  connector: string | null;
  connector_enabled: boolean;
  write_enabled: boolean;
  capabilities: Record<string, unknown>;
  renewal_date: string | null;
  cost_minor: number | null;
  cost_currency: string | null;
  billing_cycle: string | null;
  status: ProviderAccountStatus;
  last_synced_at: string | null;
  last_tested_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  provider?: { id: string; code: string; name: string } | null;
}

export type ProviderInput = {
  code: string;
  name: string;
  type: ProviderType;
  origin?: ProviderOrigin;
  portal_url?: string | null;
  cost_currency?: string;
  connector?: string | null;
  status?: ProviderStatus;
  notes_internal?: string | null;
  sla_notes?: string | null;
  customer_id?: string | null;
  custom?: Record<string, unknown>;
};
export type ProviderUpdateInput = Partial<ProviderInput>;

export type ProviderAccountInput = {
  label: string;
  external_account_id?: string | null;
  owner?: ProviderAccountOwner;
  customer_id?: string | null;
  connector?: string | null;
  connector_enabled?: boolean;
  write_enabled?: boolean;
  renewal_date?: string | null;
  cost_minor?: number | null;
  cost_currency?: string | null;
  billing_cycle?: string | null;
  status?: ProviderAccountStatus;
  custom?: Record<string, unknown>;
};
export type ProviderAccountUpdateInput = Partial<ProviderAccountInput>;

export interface ProviderFilters {
  type?: ProviderType | '';
  status?: ProviderStatus | '';
  origin?: ProviderOrigin | '';
  customer_id?: string;
}

interface Envelope<T> { data: T }
const enc = encodeURIComponent;

export function createProvidersApi(http: HttpClient) {
  const base = '/api/v1/admin/providers';
  const unwrap = <T>(r: Envelope<T>) => r.data;
  return {
    list: (params: ListParams & { filter?: ProviderFilters } = {}) =>
      http.get<CursorPage<Provider>>(`${base}${toQuery({ q: params.q, sort: params.sort, page: { size: params.size, cursor: params.cursor ?? undefined }, filter: params.filter })}`),
    get: (id: string) => http.get<Envelope<Provider>>(`${base}/${enc(id)}`).then(unwrap),
    create: (input: ProviderInput, idempotencyKey = newIdempotencyKey()) => http.post<Envelope<Provider>>(base, input, { idempotencyKey }).then(unwrap),
    update: (id: string, version: number, input: ProviderUpdateInput) => http.patch<Envelope<Provider>>(`${base}/${enc(id)}`, { ...input, version }).then(unwrap),
    remove: (id: string, version: number) => http.delete<void>(`${base}/${enc(id)}`, { version }),
    // Cuentas del proveedor
    accounts: (providerId: string, params: ListParams = {}) =>
      http.get<CursorPage<ProviderAccount>>(`${base}/${enc(providerId)}/accounts${toQuery({ q: params.q, sort: params.sort, page: { size: params.size, cursor: params.cursor ?? undefined } })}`),
    getAccount: (id: string) => http.get<Envelope<ProviderAccount>>(`/api/v1/admin/provider-accounts/${enc(id)}`).then(unwrap),
    createAccount: (providerId: string, input: ProviderAccountInput, idempotencyKey = newIdempotencyKey()) =>
      http.post<Envelope<ProviderAccount>>(`${base}/${enc(providerId)}/accounts`, input, { idempotencyKey }).then(unwrap),
    updateAccount: (id: string, version: number, input: ProviderAccountUpdateInput) =>
      http.patch<Envelope<ProviderAccount>>(`/api/v1/admin/provider-accounts/${enc(id)}`, { ...input, version }).then(unwrap),
    removeAccount: (id: string, version: number) => http.delete<void>(`/api/v1/admin/provider-accounts/${enc(id)}`, { version }),
  };
}
