import { toQuery, type HttpClient } from './http';
import type { Currency } from './customers';

/** KPIs del panel de inicio (GET /api/v1/admin/dashboard). Cada clave llega solo
 * si el usuario tiene el permiso que la gobierna; por eso todas son opcionales. */
export interface DashboardMrr {
  currency: Currency;
  amount_minor: number;
}
export interface DashboardReceivable {
  currency: Currency;
  total_minor: number;
  overdue_minor: number;
}
export interface DashboardTickets {
  open: number;
  overdue_sla: number;
  unassigned: number;
}
export interface DashboardSummary {
  mrr?: DashboardMrr[];
  receivable?: DashboardReceivable[];
  services_due_30?: number;
  tickets?: DashboardTickets;
}

/** Contadores de "Atención hoy" (GET /api/v1/admin/attention); cada clave se omite sin el permiso. */
export interface Attention {
  payments_to_validate?: number;
  invoices_due_today?: number;
  domains_expiring_7d?: number;
  tickets_overdue_sla?: number;
  sales_followups_today?: number;
}

interface Envelope<T> {
  data: T;
}

export function createDashboardApi(http: HttpClient) {
  return {
    /** `brandId` opcional acota mrr, services_due_30 y tickets (receivable es de toda la organización). */
    summary: (brandId?: string) =>
      http.get<Envelope<DashboardSummary>>(`/api/v1/admin/dashboard${toQuery({ brand_id: brandId || undefined })}`).then((r) => r.data),
    attention: () => http.get<Envelope<Attention>>('/api/v1/admin/attention').then((r) => r.data),
    /** Valores REALES de un subconjunto de indicadores (GET /api/v1/admin/kpis), por id de KPI; cada clave se omite sin el permiso de su fuente. */
    kpis: () => http.get<Envelope<KpiValues>>('/api/v1/admin/kpis').then((r) => r.data),
    /** Serie mensual REAL (12 meses) de un KPI de flujo (GET /api/v1/admin/kpis/series); 404 `no_series` si es de stock o la moneda no es PEN. */
    kpiSeries: (id: string) => http.get<Envelope<KpiSeries>>(`/api/v1/admin/kpis/series${toQuery({ id })}`).then((r) => r.data),
  };
}

/** Valores reales de KPIs indexados por el id del front (data/kpi.ts). */
export interface KpiValues {
  [id: string]: { value: number; as_of: string };
}

export interface KpiSeries {
  id: string;
  currency?: string;
  points: { month: string; value: number }[];
}
