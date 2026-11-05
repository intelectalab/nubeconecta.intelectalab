import type { TaskPriority, TaskStatus } from '@hub/api';
import type { ChipKind } from '../../../components/ui';
import { hub } from '../../../auth/client';

export const workApi = hub.work;
export const TASK_STATUS_LABEL: Record<TaskStatus, string> = { todo: 'Por hacer', in_progress: 'En curso', blocked: 'Bloqueada', in_review: 'En revisión', done: 'Hecha', cancelled: 'Cancelada' };
export const TASK_STATUS_CHIP: Record<TaskStatus, ChipKind> = { todo: 'info', in_progress: 'warn', blocked: 'danger', in_review: 'warn', done: 'ok', cancelled: '' };
export const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = { critical: 'Crítica', high: 'Alta', medium: 'Media', low: 'Baja' };
export const TASK_PRIORITY_CHIP: Record<TaskPriority, ChipKind> = { critical: 'danger', high: 'warn', medium: 'info', low: '' };
