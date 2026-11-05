import { newIdempotencyKey, toQuery, type HttpClient } from './http';
import type { CursorPage, ListParams } from './customers';

export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'in_review' | 'done' | 'cancelled';
export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';

export interface Task {
  id: string;
  number: string;
  title: string;
  description: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  assignee_id: string | null;
  due_at: string | null;
  customer_id: string | null;
  service_id: string | null;
  is_billable: boolean;
  parent_id: string | null;
  requires_approval: boolean;
  is_sensitive: boolean;
  approved_by: string | null;
  approved_at: string | null;
  completed_at: string | null;
  source_type: string | null;
  source_id: string | null;
  custom: Record<string, unknown>;
  version: number;
  created_at: string;
  updated_at: string;
  assignee?: { id: string; name: string } | null;
}

export type TaskInput = {
  title: string;
  description?: string | null;
  priority?: TaskPriority;
  assignee_id?: string | null;
  due_at?: string | null;
  customer_id?: string | null;
  service_id?: string | null;
  is_billable?: boolean;
  parent_id?: string | null;
  requires_approval?: boolean;
  is_sensitive?: boolean;
  custom?: Record<string, unknown>;
};
export type TaskUpdateInput = Partial<TaskInput>;

export interface TaskFilters {
  status?: TaskStatus | '';
  priority?: TaskPriority | '';
  assignee_id?: string;
  customer_id?: string;
}

interface Envelope<T> { data: T }
const enc = encodeURIComponent;

export function createWorkApi(http: HttpClient) {
  const base = '/api/v1/admin/tasks';
  const unwrap = <T>(r: Envelope<T>) => r.data;
  return {
    list: (params: ListParams & { filter?: TaskFilters } = {}) =>
      http.get<CursorPage<Task>>(`${base}${toQuery({ q: params.q, sort: params.sort, page: { size: params.size, cursor: params.cursor ?? undefined }, filter: params.filter })}`),
    get: (id: string) => http.get<Envelope<Task>>(`${base}/${enc(id)}`).then(unwrap),
    create: (input: TaskInput, idempotencyKey = newIdempotencyKey()) => http.post<Envelope<Task>>(base, input, { idempotencyKey }).then(unwrap),
    update: (id: string, version: number, input: TaskUpdateInput) => http.patch<Envelope<Task>>(`${base}/${enc(id)}`, { ...input, version }).then(unwrap),
    changeStatus: (id: string, version: number, status: TaskStatus) => http.post<Envelope<Task>>(`${base}/${enc(id)}/status`, { status, version }).then(unwrap),
    assign: (id: string, version: number, assigneeId: string | null) => http.post<Envelope<Task>>(`${base}/${enc(id)}/assign`, { assignee_id: assigneeId, version }).then(unwrap),
    approve: (id: string, version: number) => http.post<Envelope<Task>>(`${base}/${enc(id)}/approve`, { version }).then(unwrap),
    remove: (id: string, version: number) => http.delete<void>(`${base}/${enc(id)}`, { version }),
  };
}
