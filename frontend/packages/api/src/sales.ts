import { newIdempotencyKey, toQuery, type HttpClient } from './http';
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

export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired';
export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: 'Borrador', sent: 'Enviada', accepted: 'Aceptada', rejected: 'Rechazada', expired: 'Vencida',
};
export type QuoteCycle = 'monthly' | 'quarterly' | 'semiannual' | 'annual' | 'biennial' | 'triennial';
export interface QuoteItem {
  id: string;
  product_id: string | null;
  plan_id: string | null;
  description: string;
  charge_type: 'one_time' | 'recurring';
  cycle: QuoteCycle | null;
  quantity: string;
  unit_price_minor: number;
  discount_minor: number;
  total_minor: number;
  currency: 'PEN' | 'USD';
  sort_order: number;
}
export interface QuoteVersion {
  id: string;
  version_number: number;
  locale: string;
  currency: 'PEN' | 'USD';
  valid_until: string | null;
  one_time_total_minor: number;
  recurring_total_minor: number;
  tax_minor: number;
  terms: string | null;
  change_note: string | null;
  pdf_file_id: string | null;
  created_at: string;
  items: QuoteItem[];
}
export interface Quote {
  id: string;
  number: string;
  brand_id: string;
  customer_id: string | null;
  lead_id: string | null;
  owner_id: string | null;
  status: QuoteStatus;
  current_version: number;
  currency: 'PEN' | 'USD';
  valid_until: string | null;
  sent_at: string | null;
  accepted_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  customer?: { id: string; code: string; name: string } | null;
  lead?: { id: string; name: string } | null;
  brand?: { id: string; name: string } | null;
  owner?: { id: string; name: string } | null;
  current_version_data?: QuoteVersion | null;
}
export interface QuoteItemInput {
  description: string;
  charge_type: 'one_time' | 'recurring';
  cycle?: QuoteCycle | null;
  quantity: number;
  unit_price_minor: number;
  discount_minor?: number;
  product_id?: string | null;
  plan_id?: string | null;
}
export interface QuoteInput {
  brand_id: string;
  customer_id?: string | null;
  lead_id?: string | null;
  owner_id?: string | null;
  currency: 'PEN' | 'USD';
  valid_until?: string | null;
  locale?: string;
  terms?: string | null;
  items: QuoteItemInput[];
}
export type QuoteUpdateInput = Partial<QuoteInput> & { change_note?: string | null };
export interface QuoteFilters {
  status?: QuoteStatus | '';
  customer_id?: string;
  brand_id?: string;
  currency?: 'PEN' | 'USD' | '';
}

interface Envelope<T> {
  data: T;
}

const enc = encodeURIComponent;

export function createSalesApi(http: HttpClient) {
  const base = '/api/v1/admin/leads';
  const quotesBase = '/api/v1/admin/quotes';
  const unwrap = <T>(r: Envelope<T>) => r.data;
  return {
    leads: {
      list: (params: ListParams & { filter?: LeadFilters } = {}) =>
        http.get<CursorPage<Lead>>(`${base}${toQuery({ q: params.q, sort: params.sort, page: { size: params.size, cursor: params.cursor ?? undefined }, filter: params.filter })}`),
      board: (filter: { owner_id?: string; q?: string } = {}) => http.get<Envelope<LeadBoardColumn[]>>(`${base}/board${toQuery({ filter: { owner_id: filter.owner_id }, q: filter.q || undefined })}`).then(unwrap),
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
    quotes: {
      list: (params: ListParams & { filter?: QuoteFilters } = {}) =>
        http.get<CursorPage<Quote>>(`${quotesBase}${toQuery({ q: params.q, sort: params.sort, page: { size: params.size, cursor: params.cursor ?? undefined }, filter: params.filter })}`),
      get: (id: string) => http.get<Envelope<Quote>>(`${quotesBase}/${enc(id)}`).then(unwrap),
      create: (input: QuoteInput, idempotencyKey = newIdempotencyKey()) => http.post<Envelope<Quote>>(quotesBase, input, { idempotencyKey }).then(unwrap),
      update: (id: string, version: number, input: QuoteUpdateInput) => http.patch<Envelope<Quote>>(`${quotesBase}/${enc(id)}`, { ...input, version }).then(unwrap),
      send: (id: string, version: number) => http.post<Envelope<Quote>>(`${quotesBase}/${enc(id)}/send`, { version }).then(unwrap),
      accept: (id: string, version: number) => http.post<Envelope<Quote>>(`${quotesBase}/${enc(id)}/accept`, { version }).then(unwrap),
      reject: (id: string, version: number, reason: string) => http.post<Envelope<Quote>>(`${quotesBase}/${enc(id)}/reject`, { version, reason }).then(unwrap),
      expire: (id: string, version: number) => http.post<Envelope<Quote>>(`${quotesBase}/${enc(id)}/expire`, { version }).then(unwrap),
      remove: (id: string, version: number) => http.delete<void>(`${quotesBase}/${enc(id)}`, { version }),
    },
  };
}
