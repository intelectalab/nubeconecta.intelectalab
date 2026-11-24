import { newIdempotencyKey, toQuery, type HttpClient } from './http';
import type { CursorPage, ListParams } from './customers';

export type ContractStatus = 'draft' | 'in_review' | 'approved' | 'sent' | 'signed_active' | 'expired' | 'terminated';
export type ContractKind = 'contract' | 'terms';
export type ContractCurrency = 'PEN' | 'USD';

export interface ContractVersion {
  id: string;
  version_number: number;
  kind: 'original' | 'addendum';
  body: string;
  change_summary: string | null;
  clause_ids: string[];
  locked_at: string | null;
  created_at: string;
}

export interface Contract {
  id: string;
  number: string;
  customer_id: string;
  brand_id: string;
  contract_template_id: string | null;
  quote_id: string | null;
  status: ContractStatus;
  current_version: number;
  starts_on: string | null;
  ends_on: string | null;
  currency: ContractCurrency;
  management_fee_percent: string | number | null;
  management_fee_min_minor: number | null;
  included_hours: string | number | null;
  approved_at: string | null;
  sent_at: string | null;
  signed_at: string | null;
  terminated_at: string | null;
  termination_reason: string | null;
  kind: ContractKind;
  version: number;
  created_at: string;
  updated_at: string;
  customer?: { id: string; code: string; name: string } | null;
  brand?: { id: string; name: string } | null;
  approver?: { id: string; name: string } | null;
  quote?: { id: string; number: string } | null;
  current_version_data?: ContractVersion | null;
}

export type ContractInput = {
  customer_id: string;
  brand_id: string;
  quote_id?: string | null;
  currency: ContractCurrency;
  starts_on?: string | null;
  ends_on?: string | null;
  management_fee_percent?: number | null;
  management_fee_min_minor?: number | null;
  included_hours?: number | null;
  kind?: ContractKind;
  body: string;
  clause_ids?: string[];
  variables?: Record<string, unknown>;
};
export type ContractUpdateInput = Partial<ContractInput> & { change_summary?: string | null };
export interface AddendumInput { body: string; change_summary?: string | null }
export interface ContractFilters {
  status?: ContractStatus | '';
  customer_id?: string;
  brand_id?: string;
  currency?: ContractCurrency | '';
}

/** Contrato en el portal del cliente (solo lectura; condiciones comerciales propias). */
export interface PortalContract {
  id: string;
  kind: ContractKind;
  status: ContractStatus;
  starts_on: string | null;
  ends_on: string | null;
  currency: string;
  management_fee_percent: number | null;
  management_fee_min_minor: number | null;
  included_hours: number | null;
  current_version: number;
  brand: { name: string } | null;
  created_at: string | null;
}

interface Envelope<T> { data: T }
const enc = encodeURIComponent;

export function createContractsApi(http: HttpClient) {
  const base = '/api/v1/admin/contracts';
  const unwrap = <T>(r: Envelope<T>) => r.data;
  return {
    list: (params: ListParams & { filter?: ContractFilters } = {}) =>
      http.get<CursorPage<Contract>>(`${base}${toQuery({ q: params.q, sort: params.sort, page: { size: params.size, cursor: params.cursor ?? undefined }, filter: params.filter })}`),
    get: (id: string) => http.get<Envelope<Contract>>(`${base}/${enc(id)}`).then(unwrap),
    create: (input: ContractInput, idempotencyKey = newIdempotencyKey()) => http.post<Envelope<Contract>>(base, input, { idempotencyKey }).then(unwrap),
    update: (id: string, version: number, input: ContractUpdateInput) => http.patch<Envelope<Contract>>(`${base}/${enc(id)}`, { ...input, version }).then(unwrap),
    submit: (id: string, version: number) => http.post<Envelope<Contract>>(`${base}/${enc(id)}/submit`, { version }).then(unwrap),
    approve: (id: string, version: number) => http.post<Envelope<Contract>>(`${base}/${enc(id)}/approve`, { version }).then(unwrap),
    send: (id: string, version: number) => http.post<Envelope<Contract>>(`${base}/${enc(id)}/send`, { version }).then(unwrap),
    sign: (id: string, version: number) => http.post<Envelope<Contract>>(`${base}/${enc(id)}/sign`, { version }).then(unwrap),
    terminate: (id: string, version: number, reason: string) => http.post<Envelope<Contract>>(`${base}/${enc(id)}/terminate`, { version, reason }).then(unwrap),
    expire: (id: string, version: number) => http.post<Envelope<Contract>>(`${base}/${enc(id)}/expire`, { version }).then(unwrap),
    addendum: (id: string, version: number, input: AddendumInput) => http.post<Envelope<Contract>>(`${base}/${enc(id)}/addenda`, { ...input, version }).then(unwrap),
    remove: (id: string, version: number) => http.delete<void>(`${base}/${enc(id)}`, { version }),

    /** Portal del cliente: sus propios contratos (solo lectura; sin borradores internos). */
    portalList: (params: ListParams = {}) =>
      http.get<CursorPage<PortalContract>>(`/api/v1/portal/contracts${toQuery({ sort: params.sort, page: { size: params.size, cursor: params.cursor ?? undefined } })}`),
    portalGet: (id: string) => http.get<Envelope<PortalContract>>(`/api/v1/portal/contracts/${enc(id)}`).then(unwrap),
  };
}
