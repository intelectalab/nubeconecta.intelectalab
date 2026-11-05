import type { IncidentSeverity, IncidentStatus, MonitorStatus } from '@hub/api';
import type { ChipKind } from '../../../components/ui';
import { hub } from '../../../auth/client';

export const monitoringApi = hub.monitoring;
export const MONITOR_STATUS_CHIP: Record<MonitorStatus, ChipKind> = { up: 'ok', down: 'danger', degraded: 'warn', paused: '', unknown: 'info' };
export const INCIDENT_STATUS_CHIP: Record<IncidentStatus, ChipKind> = { open: 'danger', monitoring: 'warn', resolved: 'ok' };
export const INCIDENT_SEVERITY_CHIP: Record<IncidentSeverity, ChipKind> = { critical: 'danger', high: 'warn', medium: 'info', low: '' };
