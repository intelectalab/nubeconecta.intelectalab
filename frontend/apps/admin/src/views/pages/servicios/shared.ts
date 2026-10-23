/** Utilidades de las vistas de servicios conectadas al backend (M-SRV, franja MVP). */
import type { ServiceAction, ServiceStatus } from '@hub/api';
import type { ChipKind } from '../../../components/ui';
import { hub } from '../../../auth/client';

export const servicesApi = hub.services;

export const SERVICE_CHIP: Record<ServiceStatus, ChipKind> = {
  pending: 'info',
  active: 'ok',
  suspended: 'warn',
  terminated: '',
  cancelled: '',
  handed_over: 'outline',
};

/** Estados que la franja MVP maneja (terminated y handed_over quedan fuera). */
export const MVP_SERVICE_STATUSES: ServiceStatus[] = ['pending', 'active', 'suspended', 'cancelled'];

/** Transiciones manuales: estado de origen, permiso y si exige motivo (igual que ServiceLifecycle::TRANSITIONS). */
export const SERVICE_ACTIONS: { action: ServiceAction; label: string; from: ServiceStatus[]; perm: string; reason: boolean; danger?: boolean }[] = [
  { action: 'activate', label: 'Activar', from: ['pending'], perm: 'services.service.update', reason: false },
  { action: 'suspend', label: 'Suspender', from: ['active'], perm: 'services.service.suspend', reason: true },
  { action: 'reactivate', label: 'Reactivar', from: ['suspended'], perm: 'services.service.suspend', reason: true },
  { action: 'cancel', label: 'Cancelar servicio', from: ['pending', 'active', 'suspended'], perm: 'services.service.delete', reason: true, danger: true },
];

export const CYCLE_LABEL: Record<string, string> = {
  monthly: 'Mensual',
  quarterly: 'Trimestral',
  semiannual: 'Semestral',
  annual: 'Anual',
  biennial: 'Bienal',
  triennial: 'Trienal',
  one_time: 'Pago único',
  hourly: 'Por hora',
};
export const cycleLabel = (c: string | null | undefined) => (c ? (CYCLE_LABEL[c] ?? c) : '—');
