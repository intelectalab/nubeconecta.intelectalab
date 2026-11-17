import { newIdempotencyKey, toQuery, type HttpClient } from './http';
import type { CursorPage } from './customers';

/**
 * Módulo Cloud (#cloud): cuentas, proyectos, recursos y presupuestos cloud por cliente.
 * MVP manual. Todos los montos vienen en unidades menores (céntimos) e íntegros;
 * la vista divide entre 100 para mostrar. Endpoints bajo /api/v1/admin/cloud.
 */

export type CloudPlatform = 'aws' | 'azure' | 'gcp' | 'ibm' | 'oracle' | 'other';
export type CloudEnvironment = 'production' | 'staging' | 'development' | 'shared' | 'other';

export interface MoneyByCurrency {
  currency: string;
  monthly_minor: number;
}

export interface CloudSummary {
  accounts_total: number;
  accounts_active: number;
  projects_total: number;
  projects_hidden: number;
  resources_total: number;
  resources_unassigned: number;
  monthly_cost_by_currency: MoneyByCurrency[];
  budget_month: string;
  budget_by_currency: { currency: string; budget_minor: number; actual_minor: number; over_budget: number }[];
  over_budget_projects: number;
}

export interface CloudAccount {
  id: string;
  platform: string;
  external_account_id: string | null;
  owner: string;
  modality: string;
  status: string;
  tagging_status: string;
  provider_account_id: string | null;
  provider_account: { id: string; label: string; provider_name: string | null } | null;
  customer_id: string | null;
  customer: { id: string; code: string; name: string } | null;
  authorization_file_id: string | null;
  access_reference: string | null;
  period_start: string | null;
  period_end: string | null;
  access_revoked_at: string | null;
  projects_count: number | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface CloudProjectBudget {
  id: string;
  period_month: string;
  amount_minor: number;
  actual_minor: number;
  currency: string;
  consumption_pct: number;
}

export interface CloudProject {
  id: string;
  name: string;
  external_id: string | null;
  environment: string;
  region: string | null;
  visible_to_customer: boolean;
  is_shared: boolean;
  tags: Record<string, unknown>;
  cloud_account_id: string | null;
  account: { id: string; platform: string; external_account_id: string | null; owner: string; status: string } | null;
  customer_id: string | null;
  customer: { id: string; code: string; name: string } | null;
  resources_count: number | null;
  cost: { monthly_minor: number; currency: string } | null;
  budget: CloudProjectBudget | null;
  /** Proyección lineal del gasto del mes en curso (unidades menores). */
  forecast_minor: number | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface CloudResource {
  id: string;
  cloud_project_id: string;
  project: { id: string; name: string } | null;
  parent_id: string | null;
  resource_type: string;
  kind: string | null;
  external_id: string | null;
  name: string | null;
  region: string | null;
  tags: Record<string, unknown>;
  status: string;
  is_shared: boolean;
  assignment_status: string;
  assigned_customer_id: string | null;
  customer: { id: string; code: string; name: string } | null;
  monthly_cost_minor: number | null;
  cost_currency: string | null;
  last_synced_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface CloudBudget {
  id: string;
  cloud_project_id: string;
  project: { id: string; name: string; customer_id: string | null } | null;
  period_month: string;
  amount_minor: number;
  cost_currency: string;
  actual_minor: number;
  consumption_pct: number;
  last_alerted_pct: number | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface CloudProjectFilters {
  search?: string;
  customer_id?: string;
  cloud_account_id?: string;
  environment?: CloudEnvironment | '';
  platform?: CloudPlatform | '';
  visible_to_customer?: boolean;
}

export interface CloudProjectListParams {
  filter?: CloudProjectFilters;
  sort?: string;
  cursor?: string | null;
  size?: number;
}

export interface CloudAccountListParams {
  search?: string;
  customer_id?: string;
  platform?: CloudPlatform | '';
  sort?: string;
  cursor?: string | null;
  size?: number;
}

export interface CloudResourceListParams {
  cloud_project_id?: string;
  assignment_status?: string;
  sort?: string;
  cursor?: string | null;
  size?: number;
}

export interface CloudBudgetListParams {
  cloud_project_id?: string;
  period_month?: string;
  sort?: string;
  cursor?: string | null;
  size?: number;
}

export interface CloudProjectInput {
  name: string;
  cloud_account_id: string;
  environment?: CloudEnvironment;
  region?: string | null;
  external_id?: string | null;
  customer_id?: string | null;
  visible_to_customer?: boolean;
  is_shared?: boolean;
}
export type CloudProjectUpdateInput = Partial<CloudProjectInput>;

export interface CloudBudgetInput {
  cloud_project_id: string;
  period_month: string;
  amount_minor: number;
  cost_currency: string;
}
export type CloudBudgetUpdateInput = Partial<Omit<CloudBudgetInput, 'cloud_project_id' | 'period_month'>>;

interface Envelope<T> { data: T }
const enc = encodeURIComponent;

export function createCloudApi(http: HttpClient) {
  const base = '/api/v1/admin/cloud';
  const unwrap = <T>(r: Envelope<T>) => r.data;
  const page = (size?: number, cursor?: string | null) => ({ size, cursor: cursor ?? undefined });
  return {
    summary: () => http.get<Envelope<CloudSummary>>(`${base}/summary`).then(unwrap),
    projects: {
      list: (p: CloudProjectListParams = {}) =>
        http.get<CursorPage<CloudProject>>(
          `${base}/projects${toQuery({ ...p.filter, visible_to_customer: p.filter?.visible_to_customer === undefined ? undefined : p.filter.visible_to_customer ? '1' : '0', sort: p.sort, page: page(p.size, p.cursor) })}`,
        ),
      get: (id: string) => http.get<Envelope<CloudProject>>(`${base}/projects/${enc(id)}`).then(unwrap),
      create: (input: CloudProjectInput, idempotencyKey = newIdempotencyKey()) => http.post<Envelope<CloudProject>>(`${base}/projects`, input, { idempotencyKey }).then(unwrap),
      update: (id: string, version: number, input: CloudProjectUpdateInput) => http.patch<Envelope<CloudProject>>(`${base}/projects/${enc(id)}`, { ...input, version }).then(unwrap),
      remove: (id: string) => http.delete<void>(`${base}/projects/${enc(id)}`),
    },
    accounts: {
      list: (p: CloudAccountListParams = {}) =>
        http.get<CursorPage<CloudAccount>>(`${base}/accounts${toQuery({ search: p.search, customer_id: p.customer_id, platform: p.platform, sort: p.sort, page: page(p.size, p.cursor) })}`),
      get: (id: string) => http.get<Envelope<CloudAccount>>(`${base}/accounts/${enc(id)}`).then(unwrap),
      remove: (id: string) => http.delete<void>(`${base}/accounts/${enc(id)}`),
    },
    resources: {
      list: (p: CloudResourceListParams = {}) =>
        http.get<CursorPage<CloudResource>>(`${base}/resources${toQuery({ cloud_project_id: p.cloud_project_id, assignment_status: p.assignment_status, sort: p.sort, page: page(p.size, p.cursor) })}`),
      get: (id: string) => http.get<Envelope<CloudResource>>(`${base}/resources/${enc(id)}`).then(unwrap),
    },
    budgets: {
      list: (p: CloudBudgetListParams = {}) =>
        http.get<CursorPage<CloudBudget>>(`${base}/budgets${toQuery({ cloud_project_id: p.cloud_project_id, period_month: p.period_month, sort: p.sort, page: page(p.size, p.cursor) })}`),
      get: (id: string) => http.get<Envelope<CloudBudget>>(`${base}/budgets/${enc(id)}`).then(unwrap),
      create: (input: CloudBudgetInput, idempotencyKey = newIdempotencyKey()) => http.post<Envelope<CloudBudget>>(`${base}/budgets`, input, { idempotencyKey }).then(unwrap),
      update: (id: string, version: number, input: CloudBudgetUpdateInput) => http.patch<Envelope<CloudBudget>>(`${base}/budgets/${enc(id)}`, { ...input, version }).then(unwrap),
      remove: (id: string) => http.delete<void>(`${base}/budgets/${enc(id)}`),
    },
  };
}
