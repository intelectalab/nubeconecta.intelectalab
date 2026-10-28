import { toQuery, type HttpClient } from './http';
import type { CursorPage, ListParams } from './customers';

/** M-SAL: CRM básico (/api/v1/admin/leads) y «Convertir en prospecto» de la bandeja de solicitudes web. */
export type LeadStatus = 'open' | 'won' | 'lost';
export type StageOutcome = 'open' | 'won' | 'lost';
export type LeadActivityType = 'call' | 'whatsapp' | 'email' | 'meeting' | 'note' | 'follow_up';
export type StageChangeSource = 'board_drag' | 'form' | 'created' | 'conversion' | 'automation' | 'api';

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = { open: 'Abierto', won: 'Ganado', lost: 'Perdido' };
export const LEAD_ACTIVITY_LABELS: Record<LeadActivityType, string> = {
  call: 'Llamada',
  whatsapp: 'WhatsApp',
  email: 'Correo',
  meeting: 'Reunión',
  note: 'Nota',
  follow_up: 'Seguimiento',
};

export interface PipelineStage {
  id: string;
  code: string;
  name: string;
  outcome: StageOutcome;
  sort_order: number;
  probability: number | null;
}

export interface Lead {
  id: string;
  code: string;
  name: string;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  brand_id: string;
  brand_name: string | null;
  lead_channel_id: string;
  channel_code: string | null;
  channel_name: string | null;
  pipeline_stage_id: string;
  stage_name: string | null;
  stage_outcome: StageOutcome | null;
  status: LeadStatus;
  lost_reason: string | null;
  owner_id: string | null;
  owner_name: string | null;
  customer_id: string | null;
  customer_code: string | null;
  customer_name: string | null;
  estimated_amount_minor: number | null;
  currency: 'PEN' | 'USD' | null;
  /** page_url, form_code, UTM (source, medium, campaign…) y web_form_submission_id. */
  attribution: Record<string, string> | unknown[];
  marketing_consent: boolean;
  converted_at: string | null;
  last_activity_at: string | null;
  next_follow_up_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface LeadActivity {
  id: string;
  lead_id: string;
  type: LeadActivityType;
  subject: string | null;
  notes: string | null;
  due_at: string | null;
  completed_at: string | null;
  assigned_to: string | null;
  version: number;
  created_at: string;
}

export interface LeadStageChange {
  id: string;
  source: StageChangeSource;
  note: string | null;
  created_at: string;
  from_stage: string | null;
  to_stage: string;
  changed_by_name: string | null;
}

export interface LeadDetail extends Lead {
  activities: LeadActivity[];
  stage_changes: LeadStageChange[];
  /** Solo en la respuesta de convertir. */
  customer_created?: boolean;
}

export interface LeadBoardColumn extends PipelineStage {
  leads: Lead[];
  /** Valor estimado de la columna por moneda, en unidades menores. */
  totals: Record<string, number>;
}

export interface LeadOptions {
  stages: PipelineStage[];
  channels: { id: string; code: string; name: string; kind: string }[];
  brands: { id: string; name: string }[];
  owners: { id: string; name: string }[];
}

export interface LeadFilters {
  status?: string;
  stage_id?: string;
  owner_id?: string;
  channel_id?: string;
  brand_id?: string;
}

export interface LeadInput {
  name: string;
  company_name?: string | null;
  email?: string | null;
  phone?: string | null;
  brand_id: string;
  lead_channel_id?: string | null;
  owner_id?: string | null;
  estimated_amount_minor?: number | null;
  currency?: 'PEN' | 'USD' | null;
  next_follow_up_at?: string | null;
  marketing_consent?: boolean;
}

export interface ConvertLeadInput {
  version: number;
  customer_id?: string | null;
  type?: 'company' | 'individual';
  legal_name?: string;
  tax_id_type?: string | null;
  tax_id?: string | null;
}

interface Envelope<T> {
  data: T;
}

const enc = encodeURIComponent;

export function createSalesApi(http: HttpClient) {
  const base = '/api/v1/admin/leads';
  const unwrap = <T>(r: Envelope<T>) => r.data;
  return {
    leads: {
      list: (params: ListParams & { filter?: LeadFilters } = {}) =>
        http.get<CursorPage<Lead>>(`${base}${toQuery({ q: params.q, sort: params.sort, page: { size: params.size, cursor: params.cursor ?? undefined }, filter: params.filter })}`),
      board: (filter: { owner_id?: string } = {}) => http.get<Envelope<LeadBoardColumn[]>>(`${base}/board${toQuery({ filter })}`).then(unwrap),
      options: () => http.get<Envelope<LeadOptions>>(`${base}/options`).then(unwrap),
      get: (id: string) => http.get<Envelope<LeadDetail>>(`${base}/${enc(id)}`).then(unwrap),
      create: (input: LeadInput) => http.post<Envelope<LeadDetail>>(base, input).then(unwrap),
      update: (id: string, version: number, input: Partial<LeadInput> & { clear_amount?: boolean }) => http.patch<Envelope<LeadDetail>>(`${base}/${enc(id)}`, { version, ...input }).then(unwrap),
      move: (id: string, version: number, stageId: string, source: 'board_drag' | 'form' = 'form') => http.post<Envelope<LeadDetail>>(`${base}/${enc(id)}/move-stage`, { version, stage_id: stageId, source }).then(unwrap),
      lose: (id: string, version: number, reason: string, source: 'board_drag' | 'form' = 'form') => http.post<Envelope<LeadDetail>>(`${base}/${enc(id)}/lose`, { version, reason, source }).then(unwrap),
      convert: (id: string, input: ConvertLeadInput) => http.post<Envelope<LeadDetail>>(`${base}/${enc(id)}/convert`, input).then(unwrap),
      addActivity: (id: string, input: { type: LeadActivityType; subject?: string | null; notes?: string | null; due_at?: string | null }) =>
        http.post<Envelope<LeadDetail>>(`${base}/${enc(id)}/activities`, input).then(unwrap),
      completeActivity: (activityId: string, version: number, completed: boolean) =>
        http.patch<Envelope<LeadDetail>>(`/api/v1/admin/lead-activities/${enc(activityId)}`, { version, completed }).then(unwrap),
      /** «Convertir en prospecto» desde la bandeja de solicitudes web; idempotente. */
      fromSubmission: (submissionId: string) =>
        http.post<Envelope<{ lead_id: string; code: string; created: boolean }>>(`/api/v1/admin/web-connector/form-submissions/${enc(submissionId)}/lead`, {}).then(unwrap),
    },
  };
}
