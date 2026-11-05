import { newIdempotencyKey, toQuery, type HttpClient } from './http';
import type { CursorPage, ListParams } from './customers';

export type TicketType = 'incident' | 'request' | 'question' | 'billing' | 'complaint' | 'security';
export type TicketStatus = 'new' | 'open' | 'in_progress' | 'waiting_customer' | 'waiting_provider' | 'escalated' | 'resolved' | 'closed' | 'reopened';
export type TicketPriority = 'critical' | 'high' | 'medium' | 'low';
export type TicketChannel = 'email' | 'portal' | 'whatsapp' | 'phone' | 'internal' | 'monitoring' | 'assistant' | 'web_form';
export type TicketMessageChannel = 'email' | 'portal' | 'whatsapp' | 'phone' | 'internal';

export interface TicketMessage {
  id: string; ticket_id: string; author_type: string; author_user_id: string | null; author_contact_id: string | null; author_name: string | null;
  channel: TicketMessageChannel; body: string; is_internal: boolean; created_at: string; version: number;
}
export interface Ticket {
  id: string; number: string; customer_id: string | null; contact_id: string | null; brand_id: string | null;
  type: TicketType; status: TicketStatus; priority: TicketPriority; channel: TicketChannel; subject: string;
  assignee_id: string | null; first_response_due_at: string | null; first_responded_at: string | null;
  resolution_due_at: string | null; sla_breached: boolean; resolved_at: string | null; closed_at: string | null;
  department: string | null; category: string | null; level: number; version: number; created_at: string;
  messages: TicketMessage[];
}
export interface TicketInput {
  customer_id?: string | null; contact_id?: string | null; brand_id?: string | null; type?: TicketType;
  status?: TicketStatus; priority?: TicketPriority; channel?: TicketChannel; subject?: string; assignee_id?: string | null;
  department?: string | null; category?: string | null; level?: number; custom?: Record<string, unknown>; resolution_due_at?: string | null;
}
export interface TicketMessageInput {
  author_type?: 'staff'; channel: TicketMessageChannel; body: string; is_internal?: boolean; in_reply_to?: string | null;
}
export interface TicketFilters { status?: TicketStatus | ''; priority?: TicketPriority | ''; assignee_id?: string; }

/** Representación segura para el cliente del portal. */
export type PortalTicketType = 'incident' | 'request' | 'question' | 'billing';
export type PortalTicketStatus = 'new' | 'open' | 'in_progress' | 'waiting_customer' | 'waiting_provider' | 'escalated' | 'resolved' | 'closed' | 'reopened';
export type PortalTicketPriority = 'critical' | 'high' | 'medium' | 'low';
export interface PortalTicketMessage {
  id: string;
  body: string;
  created_at: string;
  author: 'Tú' | 'Soporte';
}
export interface PortalTicket {
  id: string;
  number: string;
  type: PortalTicketType;
  status: PortalTicketStatus;
  priority: PortalTicketPriority;
  subject: string;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  closed_at: string | null;
  messages: PortalTicketMessage[];
}
export interface PortalTicketInput {
  subject: string;
  type?: PortalTicketType;
  priority?: PortalTicketPriority;
  body?: string;
}
export interface PortalTicketFilters { status?: PortalTicketStatus | ''; }
export type ComplaintType = 'claim' | 'grievance';
export type ComplaintDocumentType = 'dni' | 'ce' | 'passport' | 'ruc';
export type ComplaintStatus = 'received' | 'in_progress' | 'answered' | 'closed';
export type ComplaintCurrency = 'PEN' | 'USD';
export interface ComplaintResponse {
  id: string; complaint_id: string; body: string; template_id: string | null; previewed_at: string;
  responded_by: string | null; sent_to_email: string; sent_at: string; file_id: string | null; is_final: boolean;
}
export interface Complaint {
  id: string; brand_id: string; number: number; code: string; complaint_type: ComplaintType;
  consumer_name: string; consumer_document_type: ComplaintDocumentType; consumer_document_number: string;
  consumer_address: string; consumer_email: string; consumer_phone: string | null; is_minor: boolean;
  guardian_name: string | null; customer_id: string | null; service_id: string | null; service_description: string;
  amount_minor: number | null; currency: ComplaintCurrency | null; detail: string; consumer_request: string;
  status: ComplaintStatus; received_at: string; response_days: number; due_at: string; ticket_id: string;
  answered_at: string | null; closed_at: string | null; is_test: boolean; test_reason: string | null;
  version: number; responses: ComplaintResponse[];
}
export interface ComplaintInput {
  brand_id: string; wp_site_id?: string | null; complaint_type: ComplaintType; consumer_name: string;
  consumer_document_type: ComplaintDocumentType; consumer_document_number: string; consumer_address: string;
  consumer_email: string; consumer_phone?: string | null; is_minor?: boolean; guardian_name?: string | null;
  customer_id?: string | null; service_id?: string | null; service_description: string; amount_minor?: number | null;
  currency?: ComplaintCurrency | null; detail: string; consumer_request: string; response_days: number;
  is_test?: boolean; test_reason?: string | null;
}
export interface ComplaintResponseInput {
  body: string; body_html: string; previewed_at: string; template_id?: string | null; file_id?: string | null; is_final?: boolean;
}
export interface ComplaintFilters { status?: ComplaintStatus | ''; brand_id?: string; }
interface Envelope<T> { data: T }
const enc = encodeURIComponent;

function crud<T, I>(http: HttpClient) {
  const base = '/api/v1/admin/tickets';
  const unwrap = <R>(r: Envelope<R>) => r.data;
  return {
    list: (params: ListParams & { filter?: TicketFilters } = {}) => {
      const f = params.filter;
      return http.get<CursorPage<T>>(`${base}${toQuery({ q: params.q, sort: params.sort, page: { size: params.size, cursor: params.cursor ?? undefined }, status: f?.status || undefined, priority: f?.priority || undefined, assignee_id: f?.assignee_id })}`);
    },
    get: (id: string) => http.get<Envelope<T>>(`${base}/${enc(id)}`).then(unwrap),
    create: (input: I, idempotencyKey = newIdempotencyKey()) => http.post<Envelope<T>>(base, input, { idempotencyKey }).then(unwrap),
    update: (id: string, version: number, input: I) => http.patch<Envelope<T>>(`${base}/${enc(id)}`, { ...input, version }).then(unwrap),
    remove: (id: string) => http.delete<void>(`${base}/${enc(id)}`),
  };
}

export function createSupportApi(http: HttpClient) {
  const tickets = crud<Ticket, TicketInput>(http);
  const portalBase = '/api/v1/portal/tickets';
  const complaints = {
    list: (params: ListParams & { filter?: ComplaintFilters } = {}) => {
      const f = params.filter;
      return http.get<CursorPage<Complaint>>(`/api/v1/admin/complaints${toQuery({ q: params.q, sort: params.sort, page: { size: params.size, cursor: params.cursor ?? undefined }, status: f?.status || undefined, brand_id: f?.brand_id || undefined })}`);
    },
    get: (id: string) => http.get<Envelope<Complaint>>(`/api/v1/admin/complaints/${enc(id)}`).then((r) => r.data),
    create: (input: ComplaintInput) => http.post<Envelope<Complaint>>('/api/v1/admin/complaints', input).then((r) => r.data),
    update: (id: string, version: number, input: Partial<Pick<Complaint, 'status' | 'is_test' | 'test_reason'>>) => http.patch<Envelope<Complaint>>(`/api/v1/admin/complaints/${enc(id)}`, { ...input, version }).then((r) => r.data),
    remove: (id: string, version: number) => http.delete<void>(`/api/v1/admin/complaints/${enc(id)}`, { version }),
    responses: { add: (complaintId: string, input: ComplaintResponseInput) => http.post<Envelope<ComplaintResponse>>(`/api/v1/admin/complaints/${enc(complaintId)}/responses`, input).then((r) => r.data) },
  };
  return {
    tickets,
    complaints,
    messages: { add: (ticketId: string, input: TicketMessageInput) => http.post<Envelope<TicketMessage>>(`/api/v1/admin/tickets/${enc(ticketId)}/messages`, input).then((r) => r.data) },
    portalTickets: {
      list: (params: ListParams & { status?: PortalTicketStatus | '' } = {}) =>
        http.get<CursorPage<PortalTicket>>(`${portalBase}${toQuery({ q: params.q, sort: params.sort, page: { size: params.size, cursor: params.cursor ?? undefined }, status: params.status || undefined })}`),
      get: (id: string) => http.get<Envelope<PortalTicket>>(`${portalBase}/${enc(id)}`).then((r) => r.data),
      create: (input: PortalTicketInput, idempotencyKey = newIdempotencyKey()) =>
        http.post<Envelope<PortalTicket>>(portalBase, input, { idempotencyKey }).then((r) => r.data),
      addMessage: (id: string, input: { body: string }, idempotencyKey = newIdempotencyKey()) =>
        http.post<Envelope<PortalTicketMessage>>(`${portalBase}/${enc(id)}/messages`, input, { idempotencyKey }).then((r) => r.data),
    },
  };
}
