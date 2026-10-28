import { toQuery, type HttpClient } from './http';
import type { CursorPage, ListParams } from './customers';

/** M-WCN: bandeja «Solicitudes web» (/api/v1/admin/web-connector/form-submissions). */
export type WebSubmissionStatus = 'received' | 'routed' | 'failed' | 'spam';

export const WEB_SUBMISSION_STATUS_LABELS: Record<WebSubmissionStatus, string> = {
  received: 'Nueva',
  routed: 'Derivada',
  failed: 'Falló la derivación',
  spam: 'Spam',
};

export interface WebSubmissionPayload {
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  message?: string;
  source?: string;
  [k: string]: unknown;
}

export interface WebSubmission {
  id: string;
  web_form_id: string;
  form_code: string | null;
  form_name: string | null;
  brand_id: string;
  brand_name: string | null;
  wp_site_id: string | null;
  payload: WebSubmissionPayload;
  file_ids: string[];
  consent_given: boolean;
  consent_text: string | null;
  captcha_verified_at: string | null;
  page_url: string | null;
  /** UTM: source, medium, campaign, term, content. */
  attribution: Record<string, string> | unknown[];
  status: WebSubmissionStatus;
  lead_id: string | null;
  ticket_id: string | null;
  emailed_at: string | null;
  routed_at: string | null;
  last_error: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface WebSubmissionFilters {
  /** Uno o varios estados separados por coma; vacío = todo menos spam. */
  status?: string;
  form_code?: string;
  brand_id?: string;
}

export type WebSubmissionSummary = Record<WebSubmissionStatus, number>;

export interface WebSubmissionChange {
  status: 'received' | 'spam' | 'routed';
  version: number;
  lead_id?: string | null;
  ticket_id?: string | null;
}

interface Envelope<T> {
  data: T;
}

const enc = encodeURIComponent;

export function createWebConnectorApi(http: HttpClient) {
  const base = '/api/v1/admin/web-connector/form-submissions';
  const unwrap = <T>(r: Envelope<T>) => r.data;
  return {
    submissions: {
      list: (params: ListParams & { filter?: WebSubmissionFilters } = {}) =>
        http.get<CursorPage<WebSubmission>>(`${base}${toQuery({ q: params.q, sort: params.sort, page: { size: params.size, cursor: params.cursor ?? undefined }, filter: params.filter })}`),
      summary: () => http.get<Envelope<WebSubmissionSummary>>(`${base}/summary`).then(unwrap),
      get: (id: string) => http.get<Envelope<WebSubmission>>(`${base}/${enc(id)}`).then(unwrap),
      update: (id: string, change: WebSubmissionChange) => http.patch<Envelope<WebSubmission>>(`${base}/${enc(id)}`, change).then(unwrap),
    },
  };
}
