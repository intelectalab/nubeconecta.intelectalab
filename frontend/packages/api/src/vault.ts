/**
 * Bóveda (M-VLT): secretos cifrados, concesiones, bitácora y enlaces de un solo
 * uso. El valor solo llega por `reveal` (nunca en listado/vista) y exige MFA
 * reciente (step-up) + concesión vigente.
 */
import { newIdempotencyKey, toQuery, type HttpClient } from './http';
import type { CursorPage, ListParams } from './customers';

export type SecretKind = 'ssh' | 'sftp' | 'ftp' | 'cpanel' | 'whm' | 'plesk' | 'panel' | 'cloud' | 'registrar' | 'database' | 'app_admin' | 'api_token' | 'private_key' | 'other';
export type SecretOwnerType = 'provider_account' | 'server' | 'hosting_account' | 'cloud_account' | 'domain' | 'resource' | 'saas_instance' | 'service' | 'customer' | 'webhook_endpoint' | 'wp_site';

export interface Secret {
  id: string;
  kind: SecretKind;
  name: string;
  owner_type: SecretOwnerType;
  owner_id: string;
  customer_id: string | null;
  customer: { id: string; code: string; name: string } | null;
  is_connector_credential: boolean;
  username: string | null;
  host: string | null;
  port: number | null;
  metadata: Record<string, unknown>;
  rotates_at: string | null;
  last_rotated_at: string | null;
  expires_at: string | null;
  version: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface SecretInput {
  kind: SecretKind;
  name: string;
  owner_type: SecretOwnerType;
  owner_id: string;
  value: string;
  customer_id?: string | null;
  username?: string | null;
  host?: string | null;
  port?: number | null;
  metadata?: Record<string, unknown>;
  rotates_at?: string | null;
  expires_at?: string | null;
}

export interface SecretGrant {
  id: string;
  secret_id: string;
  user: { id: string; name: string } | null;
  role: { id: string; code: string; name: string } | null;
  reason: string | null;
  starts_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  active: boolean;
  version: number;
}

export interface SecretAccessLog {
  id: string;
  secret_id: string;
  user: { id: string; name: string } | null;
  action: 'reveal' | 'copy' | 'connector_use' | 'reveal_denied' | 'one_time_link';
  reason: string | null;
  ip: string | null;
  created_at: string | null;
}

export type OneTimeLinkPurpose = 'credential_delivery' | 'domain_auth_code' | 'welcome_access' | 'account_handover';

export interface OneTimeLink {
  id: string;
  purpose: OneTimeLinkPurpose;
  secret_id: string | null;
  recipient_email: string | null;
  max_views: number;
  views_count: number;
  expires_at: string | null;
  consumed_at: string | null;
  revoked_at: string | null;
  usable: boolean;
  created_at: string | null;
}

export interface OneTimeLinkInput {
  purpose: OneTimeLinkPurpose;
  secret_id?: string | null;
  payload?: string | null;
  recipient_email?: string | null;
  contact_id?: string | null;
  max_views?: number;
  expires_in_minutes?: number;
}

export interface OneTimeLinkCreated {
  link: OneTimeLink;
  token: string;
  consume_path: string;
}

interface Envelope<T> { data: T }

export function createVaultApi(http: HttpClient) {
  const enc = encodeURIComponent;
  const unwrap = <T>(r: Envelope<T>) => r.data;
  const base = '/api/v1/admin/vault';

  return {
    list: (params: ListParams & { filter?: Partial<Record<'kind' | 'owner_type' | 'owner_id' | 'customer_id', string>> } = {}) =>
      http.get<CursorPage<Secret>>(`${base}/secrets${toQuery({ q: params.q, sort: params.sort, page: { size: params.size, cursor: params.cursor ?? undefined }, filter: params.filter })}`),
    get: (id: string) => http.get<Envelope<Secret>>(`${base}/secrets/${enc(id)}`).then(unwrap),
    create: (input: SecretInput, idempotencyKey = newIdempotencyKey()) => http.post<Envelope<Secret>>(`${base}/secrets`, input, { idempotencyKey }).then(unwrap),
    update: (id: string, version: number, input: Partial<SecretInput>) => http.patch<Envelope<Secret>>(`${base}/secrets/${enc(id)}`, { ...input, version }).then(unwrap),
    remove: (id: string) => http.delete<void>(`${base}/secrets/${enc(id)}`),
    /** Devuelve el valor UNA vez; exige MFA reciente (step-up) y concesión vigente. */
    reveal: (id: string, reason: string) => http.post<Envelope<{ value: string }>>(`${base}/secrets/${enc(id)}/reveal`, { reason }).then((r) => r.data.value),

    grants: (id: string) => http.get<Envelope<SecretGrant[]>>(`${base}/secrets/${enc(id)}/grants`).then(unwrap),
    createGrant: (id: string, input: { user_id?: string; role_id?: string; reason?: string; expires_at?: string | null }) =>
      http.post<Envelope<SecretGrant>>(`${base}/secrets/${enc(id)}/grants`, input).then(unwrap),
    revokeGrant: (id: string, grantId: string) => http.delete<void>(`${base}/secrets/${enc(id)}/grants/${enc(grantId)}`),

    accessLogs: (id: string, params: ListParams = {}) =>
      http.get<CursorPage<SecretAccessLog>>(`${base}/secrets/${enc(id)}/access-logs${toQuery({ sort: params.sort, page: { size: params.size, cursor: params.cursor ?? undefined } })}`),

    oneTimeLinks: (secretId?: string) => http.get<Envelope<OneTimeLink[]>>(`${base}/one-time-links${toQuery({ secret_id: secretId || undefined })}`).then(unwrap),
    createOneTimeLink: (input: OneTimeLinkInput): Promise<OneTimeLinkCreated> =>
      http.post<Envelope<OneTimeLink> & { meta: { token: string; consume_path: string } }>(`${base}/one-time-links`, input)
        .then((r) => ({ link: r.data, token: r.meta.token, consume_path: r.meta.consume_path })),
    revokeOneTimeLink: (id: string) => http.delete<void>(`${base}/one-time-links/${enc(id)}`),
  };
}
