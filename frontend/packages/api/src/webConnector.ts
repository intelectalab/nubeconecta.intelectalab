import { newIdempotencyKey, toQuery, type HttpClient } from './http';
import type { CursorPage, ListParams } from './customers';

/** M-WCN: bandeja «Solicitudes web» (/api/v1/admin/web-connector/form-submissions). */
export type WebSubmissionStatus = 'received' | 'routed' | 'failed' | 'spam';

export const WEB_SUBMISSION_STATUS_LABELS: Record<WebSubmissionStatus, string> = {
  received: 'Nueva',
  routed: 'Derivada',
  failed: 'Falló la derivación',
  spam: 'Spam',
};

export interface WebSubmissionPayload {
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  message?: string;
  source?: string;
  [k: string]: unknown;
}

export interface WebSubmission {
  id: string;
  web_form_id: string;
  form_code: string | null;
  form_name: string | null;
  brand_id: string;
  brand_name: string | null;
  wp_site_id: string | null;
  payload: WebSubmissionPayload;
  file_ids: string[];
  consent_given: boolean;
  consent_text: string | null;
  captcha_verified_at: string | null;
  page_url: string | null;
  /** UTM: source, medium, campaign, term, content. */
  attribution: Record<string, string> | unknown[];
  status: WebSubmissionStatus;
  lead_id: string | null;
  ticket_id: string | null;
  emailed_at: string | null;
  routed_at: string | null;
  last_error: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface WebSubmissionFilters {
  /** Uno o varios estados separados por coma; vacío = todo menos spam. */
  status?: string;
  form_code?: string;
  brand_id?: string;
}

export type WebSubmissionSummary = Record<WebSubmissionStatus, number>;

export interface WebSubmissionChange {
  status: 'received' | 'spam' | 'routed';
  version: number;
  lead_id?: string | null;
  ticket_id?: string | null;
}

export type WpSiteStatus = 'pending' | 'active' | 'disabled';
/** `wordpress` = plugin Hub Connector; `embed` = web a medida con hub-embed.js (docs/15). */
export type WpSiteKind = 'wordpress' | 'embed';
export type WpTokenScope = 'read' | 'embed';
export interface WpSite {
  id: string; organization_id: string; brand_id: string; name: string; base_url: string; kind: WpSiteKind;
  network_site_id: number | null; webhook_url: string | null; allowed_origins: string[];
  thank_you_url: string | null; status: WpSiteStatus; webhook_secret_id?: string;
  plugin_version: string | null; wordpress_version: string | null; disabled_reason: string | null;
  has_webhook_secret: boolean; last_seen_at: string | null; last_invalidation_at: string | null;
  version: number; created_at: string; updated_at: string; created_by: string | null; updated_by: string | null;
}
export interface WpSiteInput {
  brand_id: string; name: string; base_url: string; kind?: WpSiteKind; network_site_id?: number | null;
  webhook_url?: string | null; allowed_origins?: string[]; thank_you_url?: string | null;
}
export interface WpSiteFilters { brand_id?: string; status?: WpSiteStatus; }
export interface WpSiteToken {
  id: string; organization_id: string; wp_site_id: string; name: string; scope: WpTokenScope;
  token_last_four: string; expires_at: string | null; last_used_at: string | null; revoked_at: string | null;
  revoked_by: string | null; revoke_reason: string | null; version: number; created_at: string; updated_at: string;
  created_by: string | null; updated_by: string | null; token?: string;
}
export interface WpSiteTokenInput { name: string; scope?: WpTokenScope; }
export interface WpCacheInvalidation {
  id: string; organization_id: string; wp_site_id: string; event_id: string;
  scope: string; keys: string[]; trigger_event: string | null; status: 'pending' | 'delivered' | 'failed';
  attempts: number; response_status: number | null; last_error: string | null;
  next_retry_at: string | null; delivered_at: string | null; requested_by: string | null;
  version: number; created_at: string; updated_at: string; created_by: string | null; updated_by: string | null;
}
export interface WpCacheInvalidationFilters { wp_site_id?: string; status?: 'pending' | 'delivered' | 'failed'; scope?: string; }
export type WpCacheInvalidationInput = { scope: string; keys?: string[] } & ({ wp_site_id: string; brand_id?: never } | { brand_id: string; wp_site_id?: never });
export interface WpWebhookSecret { webhook_secret: string; previous_secret_valid_until: string | null; }

interface Envelope<T> {
  data: T;
}

const enc = encodeURIComponent;

export type WebFormStatus = 'draft' | 'active' | 'inactive';
export type WebFormDestination = 'lead' | 'ticket' | 'email';
export type WebFieldType = 'text' | 'textarea' | 'email' | 'phone' | 'select' | 'checkboxes' | 'file';
export type WebFieldMapsTo = 'name' | 'email' | 'phone' | 'company' | 'subject' | 'message';

export interface WebFormFieldDef {
  id?: string;
  key: string;
  label: Record<string, string>;
  help_text?: Record<string, string>;
  field_type: WebFieldType;
  is_required?: boolean;
  options?: { value: string; label: Record<string, string> }[];
  validation?: Record<string, unknown>;
  maps_to?: WebFieldMapsTo | null;
}

export interface WebForm {
  id: string;
  brand_id: string;
  code: string;
  name: string;
  status: WebFormStatus;
  destination: WebFormDestination;
  lead_channel_id: string | null;
  ticket_type: string | null;
  ticket_department: string | null;
  notify_email: string | null;
  owner_user_id: string | null;
  consent_required: boolean;
  consent_purpose: 'marketing' | 'privacy' | null;
  consent_text: Record<string, string>;
  captcha_required: boolean;
  success_message: Record<string, string>;
  redirect_url: string | null;
  fields_count?: number;
  fields?: WebFormFieldDef[];
  version: number;
}

export interface WebFormInput {
  brand_id: string;
  code: string;
  name: string;
  status?: WebFormStatus;
  destination: WebFormDestination;
  notify_email?: string | null;
  consent_required?: boolean;
  consent_purpose?: 'marketing' | 'privacy' | null;
  consent_text?: Record<string, string>;
  success_message?: Record<string, string>;
  redirect_url?: string | null;
  fields: WebFormFieldDef[];
}

export type LegalKind = 'terms' | 'privacy' | 'refunds' | 'sla' | 'acceptable_use' | 'legal_notice';
export type LegalVersionStatus = 'draft' | 'published' | 'superseded';

export interface LegalVersion {
  id: string;
  version_number: number;
  version_label: string;
  body: string;
  change_summary: string | null;
  legal_reviewed_by: string | null;
  legal_reviewed_at: string | null;
  effective_at: string | null;
  status: LegalVersionStatus;
  published_at: string | null;
  superseded_at: string | null;
  version: number;
}

export interface LegalDocument {
  id: string;
  brand_id: string;
  kind: LegalKind;
  product_category_id: string | null;
  locale: string;
  title: string;
  slug: string;
  published_version_id: string | null;
  published_label?: string | null;
  effective_at?: string | null;
  versions_count?: number;
  versions?: LegalVersion[];
  version: number;
}

export interface LegalDocumentInput {
  brand_id: string;
  kind: LegalKind;
  locale?: string;
  title: string;
  slug: string;
  version_label: string;
  body: string;
  change_summary?: string | null;
}

export interface LegalVersionInput {
  version_label: string;
  body: string;
  change_summary?: string | null;
}

/** Documento legal vigente de la marca del cliente, visto desde el portal. */
export interface PortalLegalDoc {
  slug: string;
  kind: string;
  title: string;
  version_id: string;
  version_label: string;
  effective_at: string | null;
  accepted: boolean;
}

export function createWebConnectorApi(http: HttpClient) {
  const base = '/api/v1/admin/web-connector/form-submissions';
  const sitesBase = '/api/v1/admin/web-connector/sites';
  const cacheBase = '/api/v1/admin/web-connector/cache-invalidations';
  const unwrap = <T>(r: Envelope<T>) => r.data;
  return {
    submissions: {
      list: (params: ListParams & { filter?: WebSubmissionFilters } = {}) =>
        http.get<CursorPage<WebSubmission>>(`${base}${toQuery({ q: params.q, sort: params.sort, page: { size: params.size, cursor: params.cursor ?? undefined }, filter: params.filter })}`),
      summary: () => http.get<Envelope<WebSubmissionSummary>>(`${base}/summary`).then(unwrap),
      get: (id: string) => http.get<Envelope<WebSubmission>>(`${base}/${enc(id)}`).then(unwrap),
      update: (id: string, change: WebSubmissionChange) => http.patch<Envelope<WebSubmission>>(`${base}/${enc(id)}`, change).then(unwrap),
    },
    sites: {
      list: (params: ListParams & { filter?: WpSiteFilters } = {}) => http.get<CursorPage<WpSite>>(`${sitesBase}${toQuery({ q: params.q, sort: params.sort, page: { size: params.size, cursor: params.cursor ?? undefined }, filter: params.filter })}`),
      create: (input: WpSiteInput) => http.post<Envelope<WpSite>>(sitesBase, input, { idempotencyKey: newIdempotencyKey() }).then(unwrap),
      get: (id: string) => http.get<Envelope<WpSite>>(`${sitesBase}/${enc(id)}`).then(unwrap),
      update: (id: string, version: number, input: Partial<WpSiteInput>) => http.patch<Envelope<WpSite>>(`${sitesBase}/${enc(id)}`, { ...input, version }).then(unwrap),
      remove: (id: string) => http.delete<void>(`${sitesBase}/${enc(id)}`),
      rotateSecret: (id: string) => http.post<Envelope<WpWebhookSecret>>(`${sitesBase}/${enc(id)}/webhook-secret`).then(unwrap),
      testWebhook: (id: string) => http.post<Envelope<WpCacheInvalidation>>(`${sitesBase}/${enc(id)}/test-webhook`).then(unwrap),
      activate: (id: string, version: number) => http.post<Envelope<WpSite>>(`${sitesBase}/${enc(id)}/activate`, { version }, { idempotencyKey: newIdempotencyKey() }).then(unwrap),
      disable: (id: string, version: number, reason: string) => http.post<Envelope<WpSite>>(`${sitesBase}/${enc(id)}/disable`, { version, reason }, { idempotencyKey: newIdempotencyKey() }).then(unwrap),
    },
    tokens: {
      list: (siteId: string, params: ListParams = {}) => http.get<CursorPage<WpSiteToken>>(`${sitesBase}/${enc(siteId)}/tokens${toQuery({ q: params.q, sort: params.sort, page: { size: params.size, cursor: params.cursor ?? undefined } })}`),
      create: (siteId: string, input: WpSiteTokenInput) => http.post<Envelope<WpSiteToken>>(`${sitesBase}/${enc(siteId)}/tokens`, input).then(unwrap),
      remove: (siteId: string, tokenId: string, reason: string) => http.delete<void>(`${sitesBase}/${enc(siteId)}/tokens/${enc(tokenId)}`, { reason }),
    },
    cacheInvalidations: {
      list: (params: ListParams & { filter?: WpCacheInvalidationFilters } = {}) => http.get<CursorPage<WpCacheInvalidation>>(`${cacheBase}${toQuery({ q: params.q, sort: params.sort, page: { size: params.size, cursor: params.cursor ?? undefined }, filter: params.filter })}`),
      create: (input: WpCacheInvalidationInput) => http.post<Envelope<WpCacheInvalidation[]>>(cacheBase, input, { idempotencyKey: newIdempotencyKey() }).then(unwrap),
      retry: (id: string) => http.post<Envelope<WpCacheInvalidation>>(`${cacheBase}/${enc(id)}/retry`, {}, { idempotencyKey: newIdempotencyKey() }).then(unwrap),
    },
    forms: {
      list: (brandId?: string) => http.get<CursorPage<WebForm>>(`/api/v1/admin/web-connector/forms${toQuery({ filter: brandId ? { brand_id: brandId } : undefined, page: { size: 100 } })}`),
      get: (id: string) => http.get<Envelope<WebForm>>(`/api/v1/admin/web-connector/forms/${enc(id)}`).then(unwrap),
      create: (input: WebFormInput) => http.post<Envelope<WebForm>>('/api/v1/admin/web-connector/forms', input, { idempotencyKey: newIdempotencyKey() }).then(unwrap),
      update: (id: string, version: number, input: Partial<WebFormInput>) => http.patch<Envelope<WebForm>>(`/api/v1/admin/web-connector/forms/${enc(id)}`, { ...input, version }).then(unwrap),
      remove: (id: string) => http.delete<void>(`/api/v1/admin/web-connector/forms/${enc(id)}`),
    },
    legalDocuments: {
      list: (brandId?: string) => http.get<CursorPage<LegalDocument>>(`/api/v1/admin/web-connector/legal-documents${toQuery({ filter: brandId ? { brand_id: brandId } : undefined, page: { size: 100 } })}`),
      get: (id: string) => http.get<Envelope<LegalDocument>>(`/api/v1/admin/web-connector/legal-documents/${enc(id)}`).then(unwrap),
      create: (input: LegalDocumentInput) => http.post<Envelope<LegalDocument>>('/api/v1/admin/web-connector/legal-documents', input, { idempotencyKey: newIdempotencyKey() }).then(unwrap),
      update: (id: string, version: number, input: { title?: string; slug?: string }) => http.patch<Envelope<LegalDocument>>(`/api/v1/admin/web-connector/legal-documents/${enc(id)}`, { ...input, version }).then(unwrap),
      remove: (id: string) => http.delete<void>(`/api/v1/admin/web-connector/legal-documents/${enc(id)}`),
      createVersion: (id: string, input: LegalVersionInput) => http.post<Envelope<LegalDocument> & { meta: { version_id: string } }>(`/api/v1/admin/web-connector/legal-documents/${enc(id)}/versions`, input, { idempotencyKey: newIdempotencyKey() }),
      updateVersion: (id: string, vid: string, version: number, input: Partial<LegalVersionInput> & { legal_reviewed_by?: string | null }) => http.patch<Envelope<LegalDocument>>(`/api/v1/admin/web-connector/legal-documents/${enc(id)}/versions/${enc(vid)}`, { ...input, version }).then(unwrap),
      removeVersion: (id: string, vid: string) => http.delete<void>(`/api/v1/admin/web-connector/legal-documents/${enc(id)}/versions/${enc(vid)}`),
      publishVersion: (id: string, vid: string, version: number, input: { legal_reviewed_by: string; effective_at: string }) => http.post<Envelope<LegalDocument>>(`/api/v1/admin/web-connector/legal-documents/${enc(id)}/versions/${enc(vid)}/publish`, { ...input, version }, { idempotencyKey: newIdempotencyKey() }).then(unwrap),
    },
    /** Portal del cliente: documentos legales vigentes de su marca y su aceptación. */
    portalLegal: {
      list: () => http.get<Envelope<PortalLegalDoc[]>>('/api/v1/portal/legal-documents').then(unwrap),
      accept: (versionId: string) => http.post<Envelope<{ accepted: boolean }>>('/api/v1/portal/legal-acceptances', { version_id: versionId }).then(unwrap),
    },
  };
}
