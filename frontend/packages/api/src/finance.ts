import { newIdempotencyKey, toQuery, type HttpClient } from './http';
import type { CursorPage, ListParams } from './customers';

export type CostKind = 'provider_recurring' | 'provider_one_time' | 'license' | 'payment_fee' | 'other';
export type CostAllocationMethod = 'resources' | 'percentage' | 'usage' | 'manual' | 'none';

export interface Cost {
  id: string;
  kind: CostKind;
  resource_id: string | null;
  provider_account_id: string | null;
  provider_bill_id: string | null;
  payment_id: string | null;
  period_month: string;
  amount_minor: number;
  cost_currency: string;
  allocation_method: CostAllocationMethod;
  description: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  resource?: { id: string; name: string } | null;
  provider_account?: { id: string; label: string } | null;
  allocations?: CostAllocation[];
}

export interface CostAllocation {
  id: string;
  cost_id: string;
  service_id: string;
  saas_instance_id: string | null;
  share_percent: string | number | null;
  amount_minor: number;
  cost_currency: string;
  basis: Record<string, unknown>;
  version: number;
  created_at: string;
  updated_at: string;
  service?: { id: string; name?: string; label?: string; status?: string } | null;
}

export interface ProfitabilityRow { service_id: string; service_name: string | null; currency: string; revenue_minor: number; allocated_cost_minor: number; margin_minor: number; margin_pct: number | null }
export interface ProfitabilityTotal { currency: string; revenue_minor: number; allocated_cost_minor: number; margin_minor: number; margin_pct: number | null }
export interface ProfitabilityReport { data: ProfitabilityRow[]; totals: ProfitabilityTotal[] }

export type CostInput = {
  kind: CostKind;
  period_month: string;
  amount_minor: number;
  cost_currency: string;
  allocation_method?: CostAllocationMethod;
  resource_id?: string | null;
  provider_account_id?: string | null;
  description?: string | null;
};
export type CostUpdateInput = Partial<CostInput>;
export type CostAllocationInput = {
  cost_id: string;
  service_id: string;
  amount_minor: number;
  cost_currency: string;
  share_percent?: number | null;
  saas_instance_id?: string | null;
  basis?: Record<string, unknown>;
};
export type CostAllocationUpdateInput = Partial<CostAllocationInput>;

export interface CostFilters { kind?: CostKind | ''; period_month?: string; resource_id?: string }

interface Envelope<T> { data: T }
const enc = encodeURIComponent;

export function createFinanceApi(http: HttpClient) {
  const B = '/api/v1/admin';
  const unwrap = <T>(r: Envelope<T>) => r.data;
  return {
    listCosts: (params: ListParams & { filter?: CostFilters } = {}) =>
      http.get<CursorPage<Cost>>(`${B}/costs${toQuery({ q: params.q, sort: params.sort, page: { size: params.size, cursor: params.cursor ?? undefined }, filter: params.filter })}`),
    getCost: (id: string) => http.get<Envelope<Cost>>(`${B}/costs/${enc(id)}`).then(unwrap),
    createCost: (input: CostInput, idempotencyKey = newIdempotencyKey()) => http.post<Envelope<Cost>>(`${B}/costs`, input, { idempotencyKey }).then(unwrap),
    updateCost: (id: string, version: number, input: CostUpdateInput) => http.patch<Envelope<Cost>>(`${B}/costs/${enc(id)}`, { ...input, version }).then(unwrap),
    removeCost: (id: string, version: number) => http.delete<void>(`${B}/costs/${enc(id)}`, { version }),

    listAllocations: (params: ListParams & { filter?: { cost_id?: string; service_id?: string } } = {}) =>
      http.get<CursorPage<CostAllocation>>(`${B}/cost-allocations${toQuery({ q: params.q, sort: params.sort, page: { size: params.size, cursor: params.cursor ?? undefined }, filter: params.filter })}`),
    createAllocation: (input: CostAllocationInput, idempotencyKey = newIdempotencyKey()) => http.post<Envelope<CostAllocation>>(`${B}/cost-allocations`, input, { idempotencyKey }).then(unwrap),
    updateAllocation: (id: string, version: number, input: CostAllocationUpdateInput) => http.patch<Envelope<CostAllocation>>(`${B}/cost-allocations/${enc(id)}`, { ...input, version }).then(unwrap),
    removeAllocation: (id: string, version: number) => http.delete<void>(`${B}/cost-allocations/${enc(id)}`, { version }),

    profitability: (periodMonth: string) => http.get<ProfitabilityReport>(`${B}/finance/profitability${toQuery({ period_month: periodMonth })}`),
  };
}
