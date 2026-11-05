import { newIdempotencyKey, toQuery, type HttpClient } from './http';
import type { CursorPage, ListParams } from './customers';

export type MonitorType =
  | 'http' | 'keyword' | 'ping' | 'port' | 'dns' | 'ssl' | 'heartbeat' | 'mail_reputation' | 'external';
export type MonitorStatus = 'up' | 'down' | 'degraded' | 'paused' | 'unknown';
export type IncidentKind = 'availability' | 'performance' | 'security' | 'data' | 'other';
export type IncidentSeverity = 'critical' | 'high' | 'medium' | 'low';
export type IncidentStatus = 'open' | 'monitoring' | 'resolved';

export interface Monitor {
  id: string;
  name: string;
  type: MonitorType;
  target: string;
  interval_seconds: number;
  external_reference: string | null;
  resource_id: string | null;
  project_component_id: string | null;
  service_id: string | null;
  status: MonitorStatus;
  last_checked_at: string | null;
  is_active: boolean;
  authorized_by: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  service?: { id: string; label: string } | null;
  resource?: { id: string; name: string | null } | null;
  authorized_by_user?: { id: string; name: string } | null;
}

export interface Incident {
  id: string;
  number: string;
  title: string;
  kind: IncidentKind;
  severity: IncidentSeverity;
  status: IncidentStatus;
  started_at: string;
  resolved_at: string | null;
  is_public: boolean;
  public_summary: string | null;
  root_cause: string | null;
  problem_id: string | null;
  owner_id: string | null;
  notes_internal: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  owner?: { id: string; name: string } | null;
}

export type MonitorInput = {
  name: string;
  type: MonitorType;
  target: string;
  interval_seconds: number;
  resource_id?: string | null;
  project_component_id?: string | null;
  service_id?: string | null;
  is_active?: boolean;
  authorized_by?: string | null;
};
export type MonitorUpdateInput = Partial<MonitorInput>;

export type IncidentInput = {
  title: string;
  severity: IncidentSeverity;
  started_at: string;
  kind?: IncidentKind;
  is_public?: boolean;
  public_summary?: string | null;
  root_cause?: string | null;
  owner_id?: string | null;
  notes_internal?: string | null;
};
export type IncidentUpdateInput = Partial<IncidentInput>;

export interface MonitorFilters {
  type?: MonitorType | '';
  status?: MonitorStatus | '';
  is_active?: boolean | '';
}
export interface IncidentFilters {
  status?: IncidentStatus | '';
  severity?: IncidentSeverity | '';
  kind?: IncidentKind | '';
  owner_id?: string;
}

interface Envelope<T> { data: T }
const enc = encodeURIComponent;

export function createMonitoringApi(http: HttpClient) {
  const monitors = '/api/v1/admin/monitors';
  const incidents = '/api/v1/admin/incidents';
  const unwrap = <T>(r: Envelope<T>) => r.data;
  return {
    listMonitors: (params: ListParams & { filter?: MonitorFilters } = {}) =>
      http.get<CursorPage<Monitor>>(`${monitors}${toQuery({ q: params.q, sort: params.sort, page: { size: params.size, cursor: params.cursor ?? undefined }, filter: params.filter })}`),
    getMonitor: (id: string) => http.get<Envelope<Monitor>>(`${monitors}/${enc(id)}`).then(unwrap),
    createMonitor: (input: MonitorInput, idempotencyKey = newIdempotencyKey()) => http.post<Envelope<Monitor>>(monitors, input, { idempotencyKey }).then(unwrap),
    updateMonitor: (id: string, version: number, input: MonitorUpdateInput) => http.patch<Envelope<Monitor>>(`${monitors}/${enc(id)}`, { ...input, version }).then(unwrap),
    activateMonitor: (id: string, version: number) => http.post<Envelope<Monitor>>(`${monitors}/${enc(id)}/activate`, { version }).then(unwrap),
    pauseMonitor: (id: string, version: number) => http.post<Envelope<Monitor>>(`${monitors}/${enc(id)}/pause`, { version }).then(unwrap),
    removeMonitor: (id: string, version: number) => http.delete<void>(`${monitors}/${enc(id)}`, { version }),

    listIncidents: (params: ListParams & { filter?: IncidentFilters } = {}) =>
      http.get<CursorPage<Incident>>(`${incidents}${toQuery({ q: params.q, sort: params.sort, page: { size: params.size, cursor: params.cursor ?? undefined }, filter: params.filter })}`),
    getIncident: (id: string) => http.get<Envelope<Incident>>(`${incidents}/${enc(id)}`).then(unwrap),
    createIncident: (input: IncidentInput, idempotencyKey = newIdempotencyKey()) => http.post<Envelope<Incident>>(incidents, input, { idempotencyKey }).then(unwrap),
    updateIncident: (id: string, version: number, input: IncidentUpdateInput) => http.patch<Envelope<Incident>>(`${incidents}/${enc(id)}`, { ...input, version }).then(unwrap),
    changeIncidentStatus: (id: string, version: number, status: IncidentStatus) => http.post<Envelope<Incident>>(`${incidents}/${enc(id)}/status`, { status, version }).then(unwrap),
    removeIncident: (id: string, version: number) => http.delete<void>(`${incidents}/${enc(id)}`, { version }),
  };
}
