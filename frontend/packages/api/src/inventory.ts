import { newIdempotencyKey, toQuery, type HttpClient } from './http';
import type { CursorPage, ListParams } from './customers';

export type ResourceType =
  | 'hosting_node' | 'hosting_account' | 'server' | 'cloud_resource' | 'domain' | 'mail_service'
  | 'ssl_certificate' | 'cdn_zone' | 'bulk_email_account' | 'dns_zone' | 'saas_instance'
  | 'database' | 'storage' | 'license' | 'other';
export type ResourceStatus = 'active' | 'suspended' | 'stopped' | 'terminated' | 'not_found';
export type ServerTenancy = 'dedicated' | 'shared';
export type HostingNodeKind = 'reseller' | 'own_vps';
export type HostingNodePanel = 'whm' | 'plesk' | 'other';
export type HostingNodeStatus = 'active' | 'migrating_out' | 'retired';
export type HostingAccountStatus = 'active' | 'suspended' | 'terminated' | 'not_found';
type Ref = { id: string; name?: string | null; type?: string; hostname?: string; label?: string; status?: string } | null;

export interface Resource {
  id: string;
  type: ResourceType;
  provider_account_id: string | null;
  external_id: string | null;
  name: string;
  status: ResourceStatus;
  specs: Record<string, unknown>;
  cost_minor: number | null;
  cost_currency: string | null;
  renewal_date: string | null;
  sync_mode: 'api' | 'manual';
  last_synced_at: string | null;
  not_found_at: string | null;
  custom: Record<string, unknown>;
  version: number;
  created_at: string;
  updated_at: string;
  provider_account?: Ref;
}

export interface Server {
  id: string;
  resource_id: string;
  hostname: string;
  os: string | null;
  public_ip: string | null;
  private_ip: string | null;
  cpu: number | null;
  ram_mb: number | null;
  disk_gb: number | null;
  region: string | null;
  tenancy: ServerTenancy;
  custom: Record<string, unknown>;
  version: number;
  created_at: string;
  updated_at: string;
  resource?: Ref;
}

export interface HostingNode {
  id: string;
  resource_id: string;
  kind: HostingNodeKind;
  server_id: string | null;
  panel: HostingNodePanel;
  hostname: string;
  ip: string | null;
  disk_quota_mb: number | null;
  disk_used_mb: number | null;
  accounts_limit: number | null;
  accounts_used: number | null;
  status: HostingNodeStatus;
  last_synced_at: string | null;
  accepts_new_accounts: boolean;
  capacity_thresholds: number[] | null;
  cpanel_license_tier: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  resource?: Ref;
  server?: Ref;
}

export interface HostingAccount {
  id: string;
  hosting_node_id: string;
  resource_id: string | null;
  username: string;
  primary_domain: string;
  disk_quota_mb: number | null;
  disk_used_mb: number | null;
  service_id: string | null;
  customer_id: string | null;
  status: HostingAccountStatus;
  last_synced_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  hosting_node?: Ref;
  service?: Ref;
  customer?: Ref;
}

export type ResourceInput = {
  type: ResourceType;
  name: string;
  provider_account_id?: string | null;
  external_id?: string | null;
  status?: Exclude<ResourceStatus, 'not_found'>;
  specs?: Record<string, unknown>;
  cost_minor?: number | null;
  cost_currency?: string | null;
  renewal_date?: string | null;
  sync_mode?: 'api' | 'manual';
  custom?: Record<string, unknown>;
};
export type ServerInput = {
  resource_id: string;
  hostname: string;
  os?: string | null;
  public_ip?: string | null;
  private_ip?: string | null;
  cpu?: number | null;
  ram_mb?: number | null;
  disk_gb?: number | null;
  region?: string | null;
  tenancy?: ServerTenancy;
  custom?: Record<string, unknown>;
};
export type HostingNodeInput = {
  resource_id: string;
  kind: HostingNodeKind;
  server_id?: string | null;
  panel?: HostingNodePanel;
  hostname: string;
  ip?: string | null;
  disk_quota_mb?: number | null;
  disk_used_mb?: number | null;
  accounts_limit?: number | null;
  accounts_used?: number | null;
  status?: HostingNodeStatus;
  accepts_new_accounts?: boolean;
  capacity_thresholds?: number[] | null;
  cpanel_license_tier?: string | null;
};
export type HostingAccountInput = {
  hosting_node_id: string;
  resource_id?: string | null;
  username: string;
  primary_domain: string;
  disk_quota_mb?: number | null;
  disk_used_mb?: number | null;
  service_id?: string | null;
  customer_id?: string | null;
  status?: Exclude<HostingAccountStatus, 'not_found'>;
};

export interface ResourceFilters { type?: ResourceType | ''; status?: ResourceStatus | ''; provider_account_id?: string }
export interface HostingNodeFilters { kind?: HostingNodeKind | ''; status?: HostingNodeStatus | ''; panel?: HostingNodePanel | '' }
export interface HostingAccountFilters { hosting_node_id?: string; status?: HostingAccountStatus | ''; service_id?: string }

interface Envelope<T> { data: T }
const enc = encodeURIComponent;

export function createInventoryApi(http: HttpClient) {
  const B = '/api/v1/admin';
  const unwrap = <T>(r: Envelope<T>) => r.data;
  const crud = <TRow, TInput>(path: string) => ({
    list: (params: ListParams & { filter?: Record<string, unknown> } = {}) =>
      http.get<CursorPage<TRow>>(`${B}/${path}${toQuery({ q: params.q, sort: params.sort, page: { size: params.size, cursor: params.cursor ?? undefined }, filter: params.filter })}`),
    get: (id: string) => http.get<Envelope<TRow>>(`${B}/${path}/${enc(id)}`).then(unwrap),
    create: (input: TInput, idempotencyKey = newIdempotencyKey()) => http.post<Envelope<TRow>>(`${B}/${path}`, input, { idempotencyKey }).then(unwrap),
    update: (id: string, version: number, input: Partial<TInput>) => http.patch<Envelope<TRow>>(`${B}/${path}/${enc(id)}`, { ...input, version }).then(unwrap),
    remove: (id: string, version: number) => http.delete<void>(`${B}/${path}/${enc(id)}`, { version }),
  });
  return {
    resources: crud<Resource, ResourceInput>('resources'),
    servers: crud<Server, ServerInput>('servers'),
    hostingNodes: crud<HostingNode, HostingNodeInput>('hosting-nodes'),
    hostingAccounts: crud<HostingAccount, HostingAccountInput>('hosting-accounts'),
  };
}
