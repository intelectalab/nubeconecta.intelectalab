import { toQuery, type HttpClient } from './http';

export type SettingScope = 'global' | 'brand' | 'product' | 'customer' | 'contract';
export type SettingValue = string | number | boolean | null | unknown[] | Record<string, unknown>;
export interface SettingDefinition {
  key: string; group: string; description: string; type: string; unit: string | null;
  enum_values: string[] | null; default: SettingValue; requires_definition: boolean;
  levels: SettingScope[]; edit_permission: string; notes: string | null; effective: SettingValue;
}
export interface SettingOverride { id: string; key: string; scope_type: SettingScope; scope_id: string | null; value: SettingValue; version: number; }
export interface SettingDetail extends SettingDefinition { values?: SettingOverride[]; }
export interface SettingPutInput { scope_type: SettingScope; scope_id?: string; value: SettingValue; version?: number; reason?: string; }
export interface SettingScopes { brand_id?: string; product_id?: string; customer_id?: string; contract_id?: string; }
export interface SettingChange { id: string; key: string; scope_type: SettingScope; scope_id: string | null; before: SettingValue; after: SettingValue; reason: string | null; created_at: string; }
export interface Holiday { id: string; country: string; date: string; name: string; recurring: boolean; version: number; }
export type HolidayInput = Pick<Holiday, 'country' | 'date' | 'name' | 'recurring'>;
export interface BusinessHourInterval { id?: string; weekday: number; opens_at: string; closes_at: string; }
export interface BusinessHours { calendar: string; timezone: string | null; version: number; intervals: BusinessHourInterval[]; }
export interface BusinessHoursInput { version: number; timezone: string; intervals: BusinessHourInterval[]; }
interface Envelope<T> { data: T; }
const enc = encodeURIComponent;
const unwrap = <T>(r: Envelope<T>) => r.data;

export function createSettingsApi(http: HttpClient) {
  const base = '/api/v1/admin';
  return {
    settings: {
      list: (group?: string) => http.get<{ data: SettingDefinition[]; meta: { total: number } }>(`${base}/settings${toQuery({ filter: { group } })}`),
      get: (key: string) => http.get<Envelope<SettingDetail>>(`${base}/settings/${enc(key)}`).then(unwrap),
      resolve: (key: string, scopes: SettingScopes = {}) => http.get<Envelope<SettingValue>>(`${base}/settings/${enc(key)}/resolve${toQuery({ ...scopes })}`).then(unwrap),
      put: (key: string, input: SettingPutInput) => http.put<Envelope<SettingValue & { change_id?: string }>>(`${base}/settings/${enc(key)}`, input).then(unwrap),
      remove: (key: string, scope_type: SettingScope, scope_id: string | undefined, version: number, reason?: string) => http.delete<void>(`${base}/settings/${enc(key)}`, { scope_type, scope_id, version, reason }),
    },
    changes: {
      list: (params: Record<string, unknown> = {}) => http.get<{ data: SettingChange[]; meta: Record<string, unknown>; links?: Record<string, unknown> }>(`${base}/setting-changes${toQuery(params)}`),
      revert: (id: string, reason?: string) => http.post<Envelope<SettingChange>>(`${base}/setting-changes/${enc(id)}/revert`, { reason }).then(unwrap),
    },
    holidays: {
      list: () => http.get<{ data: Holiday[]; meta?: Record<string, unknown> }>(`${base}/holidays${toQuery({ sort: 'date', page: { size: 100 } })}`),
      create: (input: HolidayInput) => http.post<Envelope<Holiday>>(`${base}/holidays`, input).then(unwrap),
      get: (id: string) => http.get<Envelope<Holiday>>(`${base}/holidays/${enc(id)}`).then(unwrap),
      update: (id: string, version: number, input: Partial<HolidayInput>) => http.patch<Envelope<Holiday>>(`${base}/holidays/${enc(id)}`, { ...input, version }).then(unwrap),
      remove: (id: string) => http.delete<void>(`${base}/holidays/${enc(id)}`),
    },
    businessHours: {
      get: (calendar = 'default') => http.get<Envelope<BusinessHours>>(`${base}/business-hours/${enc(calendar)}`).then(unwrap),
      put: (calendar: string, payload: BusinessHoursInput) => http.put<Envelope<BusinessHours>>(`${base}/business-hours/${enc(calendar)}`, payload).then(unwrap),
    },
  };
}
