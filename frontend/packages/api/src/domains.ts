import { newIdempotencyKey, toQuery, type HttpClient } from './http';
import type { CursorPage } from './customers';

export type DomainStatus = 'active' | 'expired' | 'redemption' | 'pending_transfer' | 'transferred_out' | 'not_found';
export type DomainHolder = 'company' | 'customer';
export type DomainContactRole = 'registrant' | 'admin' | 'tech' | 'billing';
export const DOMAIN_CONTACT_ROLES: DomainContactRole[] = ['registrant', 'admin', 'tech', 'billing'];

export interface DomainContactAddress {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
}

export interface DomainContact {
  id: string;
  domain_id: string;
  role: DomainContactRole;
  name: string;
  company: string | null;
  email: string;
  phone: string | null;
  address: DomainContactAddress;
  synced_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface Domain {
  id: string;
  name: string;
  tld: string;
  status: DomainStatus;
  sync_mode: string;
  holder: DomainHolder;
  provider_account_id: string | null;
  registrar: { id: string; name: string; account_label: string } | null;
  customer_id: string | null;
  customer: { id: string; code: string; name: string } | null;
  service_id: string | null;
  service: { id: string; code: string; label: string; status: string } | null;
  registered_at: string | null;
  registry_expires_at: string | null;
  /** Vencimiento comercial (del servicio). */
  commercial_due_date: string | null;
  /** Días hasta el vencimiento real (negativo si ya pasó). */
  days_remaining: number | null;
  auto_renew: boolean;
  lock: boolean;
  dnssec: boolean;
  privacy: boolean;
  nameservers: string[];
  transfer_locked_until: string | null;
  last_synced_at: string | null;
  last_transfer_at: string | null;
  /** Solo en el detalle y únicamente si el usuario puede ver contactos. */
  contacts?: DomainContact[];
  version: number;
  created_at: string;
  updated_at: string;
}

export interface DomainSummary {
  total: number;
  expiring_30d: number;
  expired: number;
  holder_company: number;
  no_auto_renew: number;
}

export interface DomainFilters {
  search?: string;
  provider_account_id?: string;
  customer_id?: string;
  holder?: DomainHolder | '';
  status?: DomainStatus | '';
  expiring_30d?: boolean;
}

export interface DomainListParams {
  filter?: DomainFilters;
  sort?: string;
  cursor?: string | null;
  size?: number;
}

export interface DomainInput {
  name: string;
  holder: DomainHolder;
  tld?: string;
  provider_account_id?: string | null;
  customer_id?: string | null;
  service_id?: string | null;
  registered_at?: string | null;
  registry_expires_at?: string | null;
  transfer_locked_until?: string | null;
  auto_renew?: boolean;
  lock?: boolean;
  dnssec?: boolean;
  privacy?: boolean;
  nameservers?: string[];
  status?: DomainStatus;
}
export type DomainUpdateInput = Partial<DomainInput>;

export interface DomainContactInput {
  role: DomainContactRole;
  name: string;
  email: string;
  company?: string | null;
  phone?: string | null;
  address?: DomainContactAddress;
}
export type DomainContactUpdateInput = Partial<DomainContactInput>;

/** Dominio en el portal del cliente (solo lectura, sin datos de registrador/proveedor). */
export interface PortalDomain {
  id: string;
  name: string;
  tld: string;
  status: DomainStatus;
  registered_at: string | null;
  registry_expires_at: string | null;
  commercial_due_date: string | null;
  days_remaining: number | null;
  auto_renew: boolean;
  nameservers: string[];
  service: { code: string; label: string; status: string } | null;
}

interface Envelope<T> { data: T }
const enc = encodeURIComponent;

export function createDomainsApi(http: HttpClient) {
  const base = '/api/v1/admin/domains';
  const unwrap = <T>(r: Envelope<T>) => r.data;
  return {
    list: (p: DomainListParams = {}) =>
      http.get<CursorPage<Domain>>(`${base}${toQuery({ ...p.filter, sort: p.sort, page: { size: p.size, cursor: p.cursor ?? undefined }, expiring_30d: p.filter?.expiring_30d ? '1' : undefined })}`),
    summary: () => http.get<Envelope<DomainSummary>>(`${base}/summary`).then(unwrap),
    get: (id: string) => http.get<Envelope<Domain>>(`${base}/${enc(id)}`).then(unwrap),
    create: (input: DomainInput, idempotencyKey = newIdempotencyKey()) => http.post<Envelope<Domain>>(base, input, { idempotencyKey }).then(unwrap),
    /** PATCH con control de versión: 409 `version_conflict` si `version` quedó vieja. */
    update: (id: string, version: number, input: DomainUpdateInput) => http.patch<Envelope<Domain>>(`${base}/${enc(id)}`, { ...input, version }).then(unwrap),
    remove: (id: string) => http.delete<void>(`${base}/${enc(id)}`),
    renew: (id: string, years: number, version: number) => http.post<Envelope<Domain>>(`${base}/${enc(id)}/renew`, { years, version }).then(unwrap),
    contacts: (id: string) => http.get<Envelope<DomainContact[]>>(`${base}/${enc(id)}/contacts`).then(unwrap),
    createContact: (id: string, input: DomainContactInput) => http.post<Envelope<DomainContact>>(`${base}/${enc(id)}/contacts`, input).then(unwrap),
    updateContact: (id: string, contactId: string, version: number, input: DomainContactUpdateInput) =>
      http.patch<Envelope<DomainContact>>(`${base}/${enc(id)}/contacts/${enc(contactId)}`, { ...input, version }).then(unwrap),
    removeContact: (id: string, contactId: string) => http.delete<void>(`${base}/${enc(id)}/contacts/${enc(contactId)}`),

    /** Portal del cliente: sus propios dominios (solo lectura). */
    portalList: (p: { size?: number; cursor?: string | null; sort?: string } = {}) =>
      http.get<CursorPage<PortalDomain>>(`/api/v1/portal/domains${toQuery({ sort: p.sort, page: { size: p.size, cursor: p.cursor ?? undefined } })}`),
    portalGet: (id: string) => http.get<Envelope<PortalDomain>>(`/api/v1/portal/domains/${enc(id)}`).then(unwrap),
  };
}
