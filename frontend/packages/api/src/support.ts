import { newIdempotencyKey, toQuery, type HttpClient } from './http';
import type { CursorPage, ListParams } from './customers';
import type { FileAttachment } from './files';

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
  assignee_id: string | null; assignee?: { id: string; name: string } | null; customer?: { id: string; name: string } | null; first_response_due_at: string | null; first_responded_at: string | null;
  resolution_due_at: string | null; sla_breached: boolean; resolved_at: string | null; closed_at: string | null;
  department: string | null; category: string | null; level: number; version: number; created_at: string;
  messages: TicketMessage[];
  /** Adjuntos ligados al ticket (solo presente en el detalle). */
  attachments?: FileAttachment[];
}
export interface TicketInput {
  customer_id?: string | null; contact_id?: string | null; brand_id?: string | null; type?: TicketType;
  status?: TicketStatus; priority?: TicketPriority; channel?: TicketChannel; subject?: string; assignee_id?: string | null;
  department?: string | null; category?: string | null; level?: number; custom?: Record<string, unknown>; resolution_due_at?: string | null;
}
export interface TicketMessageInput {
  author_type?: 'staff'; channel: TicketMessageChannel; body: string; is_internal?: boolean; in_reply_to?: string | null;
}
export interface TicketFilters { status?: TicketStatus | ''; priority?: TicketPriority | ''; assignee_id?: string; customer_id?: string; brand_id?: string; }

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
/** Adjunto del ticket visible para el cliente (sin campos internos). */
export interface PortalTicketAttachment {
  id: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
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
  /** Adjuntos del cliente (solo presente en el detalle). */
  attachments?: PortalTicketAttachment[];
}
export interface PortalTicketInput {
  subject: string;
  type?: PortalTicketType;
  priority?: PortalTicketPriority;
  body?: string;
}
export interface PortalTicketFilters { status?: PortalTicketStatus | ''; }
export type PortalComplaintType = 'claim' | 'grievance';
export type PortalComplaintStatus = 'received' | 'in_progress' | 'answered' | 'closed';
export type PortalComplaintCurrency = 'PEN' | 'USD';
export interface PortalComplaintResponse {
  body: string;
  sent_at: string;
  is_final: boolean;
}
export interface PortalComplaint {
  id: string;
  code: string;
  complaint_type: PortalComplaintType;
  status: PortalComplaintStatus;
  received_at: string;
  due_at: string;
  response_days: number;
  consumer_name: string;
  consumer_email: string;
  service_description: string;
  detail: string;
  consumer_request: string;
  amount_minor: number | null;
  currency: PortalComplaintCurrency | null;
  answered_at: string | null;
  closed_at: string | null;
  responses: PortalComplaintResponse[];
}
export interface PortalComplaintInput {
  complaint_type: PortalComplaintType;
  service_id?: string;
  service_description?: string;
  amount_minor?: number;
  currency?: PortalComplaintCurrency;
  detail: string;
  consumer_request: string;
}
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

/* ---------- Base de conocimientos / centro de ayuda (KB) ---------- */
export type KbVisibility = 'public' | 'internal';
export type KbStatus = 'draft' | 'published' | 'archived';
export interface KbCategory {
  id: string; organization_id: string; parent_id: string | null; name: string; slug: string;
  visibility: KbVisibility; sort_order: number; version: number; created_at: string; updated_at: string;
}
export interface KbCategoryInput { name: string; slug: string; visibility?: KbVisibility; parent_id?: string | null; sort_order?: number; }
export interface KbCategoryFilters { visibility?: KbVisibility | ''; }
export interface KbArticle {
  id: string; organization_id: string; kb_category_id: string | null; brand_id: string | null; locale: string;
  title: string; slug: string; body: string; visibility: KbVisibility; status: KbStatus; published_at: string | null;
  version: number; created_at: string; updated_at: string;
  category?: { id: string; name: string; slug: string } | null;
  brand?: { id: string; name: string } | null;
}
export interface KbArticleInput { kb_category_id?: string | null; brand_id?: string | null; locale?: string; title: string; slug: string; body: string; visibility?: KbVisibility; status?: KbStatus; }
export interface KbArticleFilters { visibility?: KbVisibility | ''; status?: KbStatus | ''; kb_category_id?: string; brand_id?: string; }
export interface PortalKbArticle {
  id: string; title: string; slug: string; locale: string; body?: string;
  category: { id: string; name: string; slug: string } | null; published_at: string | null; updated_at: string | null;
}

interface Envelope<T> { data: T }
const enc = encodeURIComponent;

function crud<T, I>(http: HttpClient) {
  const base = '/api/v1/admin/tickets';
  const unwrap = <R>(r: Envelope<R>) => r.data;
  return {
    list: (params: ListParams & { filter?: TicketFilters } = {}) => {
      const f = params.filter;
      return http.get<CursorPage<T>>(`${base}${toQuery({ q: params.q, sort: params.sort, page: { size: params.size, cursor: params.cursor ?? undefined }, status: f?.status || undefined, priority: f?.priority || undefined, assignee_id: f?.assignee_id, customer_id: f?.customer_id || undefined, brand_id: f?.brand_id || undefined })}`);
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
    portalComplaints: {
      list: (params: ListParams = {}) =>
        http.get<CursorPage<PortalComplaint>>(`/api/v1/portal/complaints${toQuery({ q: params.q, sort: params.sort, page: { size: params.size, cursor: params.cursor ?? undefined } })}`),
      get: (id: string) => http.get<Envelope<PortalComplaint>>(`/api/v1/portal/complaints/${enc(id)}`).then((r) => r.data),
      create: (input: PortalComplaintInput, idempotencyKey = newIdempotencyKey()) =>
        http.post<Envelope<PortalComplaint>>('/api/v1/portal/complaints', input, { idempotencyKey }).then((r) => r.data),
    },
    kb: {
      categories: {
        list: (params: ListParams & { filter?: KbCategoryFilters } = {}) =>
          http.get<CursorPage<KbCategory>>(`/api/v1/admin/kb-categories${toQuery({ q: params.q, sort: params.sort, page: { size: params.size, cursor: params.cursor ?? undefined }, 'filter[visibility]': params.filter?.visibility || undefined })}`),
        get: (id: string) => http.get<Envelope<KbCategory>>(`/api/v1/admin/kb-categories/${enc(id)}`).then((r) => r.data),
        create: (input: KbCategoryInput) => http.post<Envelope<KbCategory>>('/api/v1/admin/kb-categories', input).then((r) => r.data),
        update: (id: string, version: number, input: Partial<KbCategoryInput>) => http.patch<Envelope<KbCategory>>(`/api/v1/admin/kb-categories/${enc(id)}`, { ...input, version }).then((r) => r.data),
        remove: (id: string, version: number) => http.delete<void>(`/api/v1/admin/kb-categories/${enc(id)}`, { version }),
      },
      articles: {
        list: (params: ListParams & { filter?: KbArticleFilters } = {}) => {
          const f = params.filter;
          return http.get<CursorPage<KbArticle>>(`/api/v1/admin/kb-articles${toQuery({ q: params.q, sort: params.sort, page: { size: params.size, cursor: params.cursor ?? undefined }, 'filter[visibility]': f?.visibility || undefined, 'filter[status]': f?.status || undefined, 'filter[kb_category_id]': f?.kb_category_id || undefined, 'filter[brand_id]': f?.brand_id || undefined })}`);
        },
        get: (id: string) => http.get<Envelope<KbArticle>>(`/api/v1/admin/kb-articles/${enc(id)}`).then((r) => r.data),
        create: (input: KbArticleInput) => http.post<Envelope<KbArticle>>('/api/v1/admin/kb-articles', input).then((r) => r.data),
        update: (id: string, version: number, input: Partial<KbArticleInput>) => http.patch<Envelope<KbArticle>>(`/api/v1/admin/kb-articles/${enc(id)}`, { ...input, version }).then((r) => r.data),
        remove: (id: string, version: number) => http.delete<void>(`/api/v1/admin/kb-articles/${enc(id)}`, { version }),
      },
    },
    portalKb: {
      list: (params: ListParams = {}) =>
        http.get<CursorPage<PortalKbArticle>>(`/api/v1/portal/kb-articles${toQuery({ q: params.q, sort: params.sort, page: { size: params.size, cursor: params.cursor ?? undefined } })}`),
      get: (id: string) => http.get<Envelope<PortalKbArticle>>(`/api/v1/portal/kb-articles/${enc(id)}`).then((r) => r.data),
    },
  };
}
