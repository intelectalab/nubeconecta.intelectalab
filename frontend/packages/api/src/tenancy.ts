/**
 * Multitenancy Fase 1 — gestión de la plataforma SaaS por el operador.
 * /api/v1/admin/tenancy/{tenants,plans}. Requiere la organización operadora
 * (middleware `operator`) y los permisos `tenancy.*` (solo superadministrador).
 */
import { newIdempotencyKey, toQuery, type HttpClient } from './http';
import type { CursorPage, Currency, ListParams } from './customers';

export type SaasPlanStatus = 'active' | 'archived';

export interface SaasPlan {
  id: string;
  code: string;
  name: string;
  price_minor: number;
  currency: Currency;
  max_staff_users: number | null;
  max_customers: number | null;
  max_services: number | null;
  status: SaasPlanStatus;
  version: number;
}

export interface SaasPlanInput {
  code: string;
  name: string;
  price_minor: number;
  currency: Currency;
  max_staff_users?: number | null;
  max_customers?: number | null;
  max_services?: number | null;
  status?: SaasPlanStatus;
}

export type TenantStatus = 'active' | 'suspended';
export type SaasStatus = 'trial' | 'active' | 'suspended' | 'cancelled';

export interface PlanLimits {
  staff_users: number | null;
  customers: number | null;
  services: number | null;
}
export interface PlanUsage {
  staff_users: number;
  customers: number;
  services: number;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  subdomain: string | null;
  country: string;
  status: TenantStatus;
  is_operator: boolean;
  saas_status: SaasStatus | null;
  saas_renewal_date: string | null;
  /** Días hasta la renovación (negativo = vencido); null si no tiene fecha. */
  renewal_in_days: number | null;
  plan: { id: string; code: string; name: string; limits: PlanLimits } | null;
  /** Topes del plan (null = ilimitado / sin plan). */
  limits: PlanLimits;
  /** Uso actual del inquilino (lista y detalle); null si no se calculó. */
  usage: PlanUsage | null;
  version: number;
  created_at: string | null;
}

export interface TenantInput {
  name: string;
  slug: string;
  subdomain?: string | null;
  country?: string;
  saas_plan_id?: string | null;
  saas_renewal_date?: string | null;
  admin_name: string;
  admin_email: string;
}

/** Alta de inquilino: el inquilino creado + su primer admin y la contraseña temporal (se muestra UNA vez). */
export interface TenantCreated {
  tenant: Tenant;
  admin: { id: string; email: string };
  temporary_password: string;
}

interface Envelope<T> {
  data: T;
}
interface CreatedEnvelope {
  data: Tenant;
  meta: { admin: { id: string; email: string }; temporary_password: string };
}

export function createTenancyApi(http: HttpClient) {
  const enc = encodeURIComponent;
  const unwrap = <T>(r: Envelope<T>) => r.data;
  const tenants = '/api/v1/admin/tenancy/tenants';
  const plans = '/api/v1/admin/tenancy/plans';

  return {
    listTenants: (params: ListParams = {}) =>
      http.get<CursorPage<Tenant>>(`${tenants}${toQuery({ q: params.q, sort: params.sort, page: { size: params.size, cursor: params.cursor ?? undefined } })}`),
    getTenant: (id: string) => http.get<Envelope<Tenant>>(`${tenants}/${enc(id)}`).then(unwrap),
    createTenant: (input: TenantInput, idempotencyKey = newIdempotencyKey()): Promise<TenantCreated> =>
      http
        .post<CreatedEnvelope>(tenants, input, { idempotencyKey })
        .then((r) => ({ tenant: r.data, admin: r.meta.admin, temporary_password: r.meta.temporary_password })),
    suspendTenant: (id: string) => http.post<Envelope<Tenant>>(`${tenants}/${enc(id)}/suspend`, {}).then(unwrap),
    reactivateTenant: (id: string) => http.post<Envelope<Tenant>>(`${tenants}/${enc(id)}/reactivate`, {}).then(unwrap),
    changeTenantPlan: (id: string, planId: string) => http.patch<Envelope<Tenant>>(`${tenants}/${enc(id)}/plan`, { saas_plan_id: planId }).then(unwrap),
    renewTenant: (id: string, renewalDate: string) => http.post<Envelope<Tenant>>(`${tenants}/${enc(id)}/renew`, { saas_renewal_date: renewalDate }).then(unwrap),

    listPlans: () => http.get<Envelope<SaasPlan[]>>(plans).then(unwrap),
    createPlan: (input: SaasPlanInput) => http.post<Envelope<SaasPlan>>(plans, input).then(unwrap),
    updatePlan: (id: string, input: SaasPlanInput) => http.patch<Envelope<SaasPlan>>(`${plans}/${enc(id)}`, input).then(unwrap),
    archivePlan: (id: string) => http.post<Envelope<SaasPlan>>(`${plans}/${enc(id)}/archive`, {}).then(unwrap),
  };
}
