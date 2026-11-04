import { newIdempotencyKey, toQuery, type HttpClient } from './http';
import type { CursorPage, ListParams } from './customers';

export type TicketType = 'incident' | 'request' | 'question' | 'billing' | 'complaint' | 'security';
export type TicketStatus = 'new' | 'open' | 'in_progress' | 'waiting_customer' | 'waiting_provider' | 'escalated' | 'resolved' | 'closed' | 'reopened';
export type TicketPriority = 'critical' | 'high' | 'medium' | 'low';
export type TicketChannel = 'email' | 'portal' | 'whatsapp' | 'phone' | 'internal' | 'monitoring' | 'assistant' | 'web_form';
export type TicketMessageChannel = 'email' | 'portal' | 'whatsapp' | 'phone' | 'internal';

export interface TicketMessage {
  id: string; ticket_id: string; author_type: string; author_user_id: string | null; author_contact_id: string | null;
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
  return {
    tickets,
    messages: { add: (ticketId: string, input: TicketMessageInput) => http.post<Envelope<TicketMessage>>(`/api/v1/admin/tickets/${enc(ticketId)}/messages`, input).then((r) => r.data) },
  };
}
