import { newIdempotencyKey, toQuery, type HttpClient } from './http';
import type { CursorPage, ListParams } from './customers';

export type NotificationChannel = 'email' | 'portal' | 'whatsapp';
export type NotificationCategory = 'notice' | 'canned_reply' | 'complaint_response' | 'form_confirmation';
export type NotificationContentFormat = 'html' | 'plain';

/** Resource de notification_templates. */
export interface NotificationTemplate {
  id: string;
  code: string;
  channel: NotificationChannel;
  brand_id: string | null;
  locale: string;
  country: string | null;
  subject: string | null;
  body: string;
  whatsapp_template_name: string | null;
  variables: string[];
  is_active: boolean;
  category: NotificationCategory;
  content_format: NotificationContentFormat;
  version: number;
  created_at: string;
  updated_at: string;
}

/** Resource de notification_deliveries (recipient_address se oculta intencionalmente). */
export interface NotificationDelivery {
  id: string;
  notification_template_id: string | null;
  customer_id: string | null;
  event: string;
  channel: NotificationChannel;
  status: string;
  provider: string | null;
  provider_message_id: string | null;
  is_manual: boolean;
  created_at: string;
  events?: { id: string; status: string; detail: string | null; occurred_at: string; provider_message_id: string | null }[];
}

export interface NotificationTemplateInput {
  code: string;
  channel: NotificationChannel;
  brand_id?: string | null;
  locale?: string;
  country?: string | null;
  subject?: string | null;
  body: string;
  variables?: string[];
  is_active?: boolean;
  category?: NotificationCategory;
  content_format?: NotificationContentFormat;
}
export type NotificationTemplateUpdateInput = Partial<NotificationTemplateInput>;
export interface NotificationTemplateFilters {
  channel?: NotificationChannel | '';
  category?: NotificationCategory | '';
  is_active?: boolean | '';
}
export interface NotificationDeliveryFilters {
  event?: string;
  channel?: NotificationChannel | '';
  customer_id?: string;
}
export interface NotificationTestInput { template_code: string; to: string }

interface Envelope<T> { data: T }
const enc = encodeURIComponent;

export function createNotificationsApi(http: HttpClient) {
  const templates = '/api/v1/admin/notification-templates';
  const deliveries = '/api/v1/admin/notification-deliveries';
  const unwrap = <T>(r: Envelope<T>) => r.data;
  const page = (params: ListParams) => ({ q: params.q, sort: params.sort, page: { size: params.size, cursor: params.cursor ?? undefined } });
  return {
    templates: {
      list: (params: ListParams & { filter?: NotificationTemplateFilters } = {}) =>
        http.get<CursorPage<NotificationTemplate>>(`${templates}${toQuery({ ...page(params), filter: params.filter })}`),
      get: (id: string) => http.get<Envelope<NotificationTemplate>>(`${templates}/${enc(id)}`).then(unwrap),
      create: (input: NotificationTemplateInput, idempotencyKey = newIdempotencyKey()) =>
        http.post<Envelope<NotificationTemplate>>(templates, input, { idempotencyKey }).then(unwrap),
      update: (id: string, version: number, input: NotificationTemplateUpdateInput) =>
        http.patch<Envelope<NotificationTemplate>>(`${templates}/${enc(id)}`, { ...input, version }).then(unwrap),
      remove: (id: string, version: number) => http.delete<void>(`${templates}/${enc(id)}`, { version }),
    },
    deliveries: {
      list: (params: ListParams & { filter?: NotificationDeliveryFilters } = {}) =>
        http.get<CursorPage<NotificationDelivery>>(`${deliveries}${toQuery({ ...page(params), filter: params.filter })}`),
      get: (id: string) => http.get<Envelope<NotificationDelivery>>(`${deliveries}/${enc(id)}`).then(unwrap),
    },
    test: (input: NotificationTestInput) =>
      http.post<Envelope<NotificationDelivery>>('/api/v1/admin/notifications/test', input, { idempotencyKey: newIdempotencyKey() }).then(unwrap),
  };
}

export type NotificationsApi = ReturnType<typeof createNotificationsApi>;
