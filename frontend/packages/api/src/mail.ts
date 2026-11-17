import { newIdempotencyKey, toQuery, type HttpClient } from './http';
import type { CursorPage } from './customers';

/**
 * Módulo Mail (#correo): servicios de correo (buzones/licencias por dominio) y
 * certificados SSL, en modo manual. Montos en unidades menores (céntimos).
 * Endpoints bajo /api/v1/admin/mail.
 */

export type MailProviderKind = 'cpanel' | 'google_workspace' | 'microsoft_365' | 'other';

export interface MailSummary {
  mail: { total: number; with_difference: number; under_billed: number; renewing_30d: number };
  ssl: { total: number; expiring_30d: number; expired: number; manual_renewal: number };
}

export interface MailService {
  id: string;
  provider_kind: MailProviderKind;
  status: string;
  sync_mode: string;
  domain_id: string | null;
  domain: { id: string; name: string } | null;
  customer_id: string | null;
  customer: { id: string; code: string; name: string } | null;
  service_id: string | null;
  service: { id: string; code: string; label: string; status: string } | null;
  provider_account_id: string | null;
  provider_account: { id: string; name: string | null; account_label: string } | null;
  hosting_account_id: string | null;
  tenant_id: string | null;
  plan: string | null;
  account_owner: string;
  seats_purchased: number | null;
  seats_used: number | null;
  seats_billed: number | null;
  /** seats_used − seats_billed (positivo: sin facturar). */
  seats_difference: number | null;
  mailboxes_count: number | null;
  storage_used_mb: number | null;
  renewal_date: string | null;
  /** Días hasta la renovación (negativo si ya pasó). */
  days_to_renewal: number | null;
  last_synced_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface MailDnsCheck {
  id: string;
  mail_service_id: string;
  record_type: string;
  expected: string | null;
  observed: string | null;
  result: string;
  checked_at: string | null;
}

export interface SslCertificate {
  id: string;
  common_name: string;
  covered_names: string[];
  is_wildcard: boolean;
  issuer: string | null;
  kind: string;
  status: string;
  renewal_mode: string;
  auto_renew: boolean;
  is_published: boolean;
  domain_id: string | null;
  domain: { id: string; name: string } | null;
  customer_id: string | null;
  customer: { id: string; code: string; name: string } | null;
  service_id: string | null;
  service: { id: string; code: string; label: string; status: string } | null;
  purchase_provider_account_id: string | null;
  cost_minor: number | null;
  cost_currency: string | null;
  price_minor: number | null;
  currency: string | null;
  issued_at: string | null;
  expires_at: string | null;
  /** Días hasta el vencimiento (negativo si ya venció). */
  days_remaining: number | null;
  installed_on_type: string | null;
  installed_on_id: string | null;
  responsible_user_id: string | null;
  last_checked_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface MailServiceFilters {
  search?: string;
  domain_id?: string;
  service_id?: string;
  customer_id?: string;
  provider_kind?: MailProviderKind | '';
  status?: string;
  account_owner?: string;
  with_difference?: boolean;
  renewing_30d?: boolean;
}

export interface SslFilters {
  search?: string;
  domain_id?: string;
  service_id?: string;
  customer_id?: string;
  kind?: string;
  status?: string;
  renewal_mode?: string;
  expiring_30d?: boolean;
}

export interface MailListParams<F> {
  filter?: F;
  sort?: string;
  cursor?: string | null;
  size?: number;
}

export type MailServiceInput = Partial<Omit<MailService, 'id' | 'domain' | 'customer' | 'service' | 'provider_account' | 'seats_difference' | 'days_to_renewal' | 'last_synced_at' | 'version' | 'created_at' | 'updated_at'>>;
export type SslCertificateInput = Partial<Omit<SslCertificate, 'id' | 'domain' | 'customer' | 'service' | 'auto_renew' | 'days_remaining' | 'last_checked_at' | 'version' | 'created_at' | 'updated_at'>>;

interface Envelope<T> { data: T }
const enc = encodeURIComponent;
const bool = (v: boolean | undefined) => (v ? '1' : undefined);

export function createMailApi(http: HttpClient) {
  const base = '/api/v1/admin/mail';
  const unwrap = <T>(r: Envelope<T>) => r.data;
  const page = (size?: number, cursor?: string | null) => ({ size, cursor: cursor ?? undefined });
  return {
    summary: () => http.get<Envelope<MailSummary>>(`${base}/summary`).then(unwrap),
    services: {
      list: (p: MailListParams<MailServiceFilters> = {}) =>
        http.get<CursorPage<MailService>>(
          `${base}/services${toQuery({ ...p.filter, with_difference: bool(p.filter?.with_difference), renewing_30d: bool(p.filter?.renewing_30d), sort: p.sort, page: page(p.size, p.cursor) })}`,
        ),
      get: (id: string) => http.get<Envelope<MailService>>(`${base}/services/${enc(id)}`).then(unwrap),
      create: (input: MailServiceInput, idempotencyKey = newIdempotencyKey()) => http.post<Envelope<MailService>>(`${base}/services`, input, { idempotencyKey }).then(unwrap),
      update: (id: string, version: number, input: MailServiceInput) => http.patch<Envelope<MailService>>(`${base}/services/${enc(id)}`, { ...input, version }).then(unwrap),
      remove: (id: string) => http.delete<void>(`${base}/services/${enc(id)}`),
      dnsChecks: (id: string) => http.get<Envelope<MailDnsCheck[]>>(`${base}/services/${enc(id)}/dns-checks`).then(unwrap),
    },
    ssl: {
      list: (p: MailListParams<SslFilters> = {}) =>
        http.get<CursorPage<SslCertificate>>(
          `${base}/ssl-certificates${toQuery({ ...p.filter, expiring_30d: bool(p.filter?.expiring_30d), sort: p.sort, page: page(p.size, p.cursor) })}`,
        ),
      get: (id: string) => http.get<Envelope<SslCertificate>>(`${base}/ssl-certificates/${enc(id)}`).then(unwrap),
      create: (input: SslCertificateInput, idempotencyKey = newIdempotencyKey()) => http.post<Envelope<SslCertificate>>(`${base}/ssl-certificates`, input, { idempotencyKey }).then(unwrap),
      update: (id: string, version: number, input: SslCertificateInput) => http.patch<Envelope<SslCertificate>>(`${base}/ssl-certificates/${enc(id)}`, { ...input, version }).then(unwrap),
      remove: (id: string) => http.delete<void>(`${base}/ssl-certificates/${enc(id)}`),
      /** Renueva: cuenta `days` desde hoy (por defecto según el tipo). Requiere `version`. */
      renew: (id: string, version: number, days?: number) => http.post<Envelope<SslCertificate>>(`${base}/ssl-certificates/${enc(id)}/renew`, { version, days }).then(unwrap),
    },
  };
}
