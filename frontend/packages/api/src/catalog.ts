/**
 * Catálogo (M-CAT, franja MVP) del panel: /api/v1/admin/{product-categories,products,plans,plan-prices,product-listings}.
 * Tipos tomados de los modelos reales (ModelResource): columnas de la tabla más relaciones cargadas.
 * `cost_minor`/`cost_currency` solo llegan con el permiso finance.cost.view.
 */
import { newIdempotencyKey, toQuery, isProblem, type HttpClient } from './http';
import type { Currency, CursorPage, ListParams } from './customers';

export type BillingType = 'recurring' | 'one_time';
export type PlanCycle = 'monthly' | 'quarterly' | 'semiannual' | 'annual' | 'biennial' | 'triennial' | 'one_time';

export const PLAN_CYCLES: PlanCycle[] = ['monthly', 'quarterly', 'semiannual', 'annual', 'biennial', 'triennial', 'one_time'];

/** Etiquetas en español; `one_time` con `limits.billing_unit = 'hour'` se muestra "Por hora". */
export const CYCLE_LABELS: Record<PlanCycle, string> = {
  monthly: 'Mensual',
  quarterly: 'Trimestral',
  semiannual: 'Semestral',
  annual: 'Anual',
  biennial: 'Bienal',
  triennial: 'Trienal',
  one_time: 'Único',
};

export const cycleLabel = (plan: Pick<Plan, 'cycle' | 'limits'>): string =>
  plan.cycle === 'one_time' && plan.limits?.billing_unit === 'hour' ? 'Por hora' : CYCLE_LABELS[plan.cycle];

interface Audit {
  version: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface ProductCategory extends Audit {
  id: string;
  parent_id: string | null;
  code: string;
  name: string;
  kind: string;
  shortcode_type: string | null;
  is_system: boolean;
  sort_order: number;
}

export interface PlanPrice extends Audit {
  id: string;
  plan_id: string;
  currency: Currency;
  price_minor: number;
  setup_fee_minor: number;
  effective_from: string;
  effective_to: string | null;
}

export interface Plan extends Audit {
  id: string;
  product_id: string;
  code: string;
  name: string;
  cycle: PlanCycle;
  cost_minor?: number | null;
  cost_currency?: string | null;
  tax_code: string | null;
  limits: Record<string, unknown> & { billing_unit?: 'hour' };
  is_active: boolean;
  prices?: PlanPrice[];
}

export interface ProductListing extends Audit {
  id: string;
  product_id: string;
  brand_id: string;
  display_name: Record<string, string>;
  tagline: Record<string, string>;
  highlights: unknown[];
  sellable_online: boolean;
  is_featured: boolean;
  sort_order: number;
  visible_from: string | null;
  visible_until: string | null;
}

/** Complemento asociado a un producto. La relación incluye el producto para mostrar su nombre. */
export interface ProductAddon {
  id: string;
  addon_product_id: string;
  is_required: boolean;
  version: number;
  addon_product?: Pick<Product, 'id' | 'code' | 'name'>;
}

/** Plan componente asociado a un plan paquete. */
export interface BundleItem {
  id: string;
  item_plan_id: string;
  quantity: number;
  version: number;
  item_plan?: Pick<Plan, 'id' | 'code' | 'name'>;
}

export interface BundleItemInput {
  item_plan_id: string;
  quantity: number;
}

export interface HostingPackageSpec {
  id: string; product_id: string;
  disk_mb: number | null; bandwidth_mb: number | null; email_accounts: number | null;
  databases: number | null; websites: number | null; whm_package: string;
  preferred_node_id: string | null; extra_resources: Record<string, unknown>; version: number;
}
export interface HostingSpecInput {
  disk_mb?: number | null; bandwidth_mb?: number | null; email_accounts?: number | null;
  databases?: number | null; websites?: number | null; whm_package: string;
  preferred_node_id?: string | null; version?: number;
}
export interface VpsPlanSpec {
  id: string; product_id: string;
  vcpu: number; ram_mb: number; disk_gb: number; transfer_gb: number | null;
  os_options: string[]; is_managed: boolean; location: string | null; cpu_model: string | null;
  disk_type: 'ssd' | 'nvme' | 'hdd' | null; provider_id: string; provider_plan_ref: string; version: number;
}
export interface VpsSpecInput {
  vcpu: number; ram_mb: number; disk_gb: number; transfer_gb?: number | null;
  os_options?: string[]; is_managed?: boolean; location?: string | null; cpu_model?: string | null;
  disk_type?: 'ssd' | 'nvme' | 'hdd' | null; provider_id: string; provider_plan_ref: string; version?: number;
}

export interface Product extends Audit {
  id: string;
  code: string;
  category_id: string;
  brand_id: string | null;
  name: string;
  description: string | null;
  billing_type: BillingType;
  provisioning_rule: 'manual' | 'automatic';
  requires_contract: boolean;
  export_eligible: boolean;
  tax_code: string | null;
  is_active: boolean;
  /** true: venta en línea; false: por cotización. */
  sellable_online: boolean;
  custom: Record<string, unknown>;
  category?: Pick<ProductCategory, 'id' | 'code' | 'name' | 'kind'>;
  plans?: Plan[];
  listings?: ProductListing[];
}

export type ProductInput = Partial<Pick<Product, 'code' | 'category_id' | 'brand_id' | 'name' | 'description' | 'billing_type' | 'requires_contract' | 'export_eligible' | 'is_active' | 'sellable_online' | 'custom'>>;
export type PlanInput = Partial<Pick<Plan, 'product_id' | 'code' | 'name' | 'cycle' | 'cost_minor' | 'cost_currency' | 'limits' | 'is_active'>>;
export type PlanPriceInput = Partial<Pick<PlanPrice, 'plan_id' | 'currency' | 'price_minor' | 'setup_fee_minor' | 'effective_from' | 'effective_to'>>;
export type ProductCategoryInput = Partial<Pick<ProductCategory, 'code' | 'name' | 'kind' | 'parent_id' | 'shortcode_type' | 'sort_order'>>;
export type ProductListingInput = Partial<Pick<ProductListing, 'product_id' | 'brand_id' | 'display_name' | 'tagline' | 'sellable_online' | 'is_featured' | 'sort_order' | 'visible_from' | 'visible_until'>>;
export interface ProductAddonInput {
  addon_product_id: string;
  is_required: boolean;
}

export interface ProductFilters {
  category_id?: string;
  brand_id?: string;
  is_active?: boolean;
  sellable_online?: boolean;
  billing_type?: BillingType | '';
}

/** Precio vigente hoy de un plan en una moneda (mismo criterio que el backend). */
export function currentPrice(plan: Plan, currency: Currency, today = new Date().toISOString().slice(0, 10)): PlanPrice | undefined {
  return (plan.prices ?? [])
    .filter((p) => p.currency === currency && p.effective_from <= today && (p.effective_to === null || p.effective_to > today))
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0];
}

interface Envelope<T> {
  data: T;
}

const enc = encodeURIComponent;
const bool = (v: boolean | undefined) => (v === undefined ? undefined : v ? 'true' : 'false');

function crud<T, I>(http: HttpClient, path: string) {
  const base = `/api/v1/admin/${path}`;
  const unwrap = <R>(r: Envelope<R>) => r.data;
  return {
    list: (params: ListParams & { filter?: Record<string, unknown> } = {}) =>
      http.get<CursorPage<T>>(`${base}${toQuery({ q: params.q, sort: params.sort, page: { size: params.size, cursor: params.cursor ?? undefined }, filter: params.filter })}`),
    get: (id: string) => http.get<Envelope<T>>(`${base}/${enc(id)}`).then(unwrap),
    create: (input: I, idempotencyKey = newIdempotencyKey()) => http.post<Envelope<T>>(base, input, { idempotencyKey }).then(unwrap),
    update: (id: string, version: number, input: I) => http.patch<Envelope<T>>(`${base}/${enc(id)}`, { ...input, version }).then(unwrap),
    remove: (id: string) => http.delete<void>(`${base}/${enc(id)}`),
  };
}

/* ───────────────────────── Tipos de servicio (constructor sin código) ───────────────────────── */

export type I18nText = Record<string, string>;
export type ServiceTypeStatus = 'draft' | 'active' | 'archived';
export type ServiceTypeSaleMode = 'online' | 'quote_only';
export type ServiceComponentKind =
  | 'server' | 'hosting' | 'domain' | 'dns' | 'cdn' | 'email' | 'bulk_email' | 'ssl_certificate'
  | 'database' | 'storage' | 'wordpress_site' | 'custom_system' | 'moodle_platform' | 'license' | 'other';
export type FieldType = 'text' | 'number' | 'select' | 'date' | 'file' | 'checkbox';
export type FilledBy = 'customer' | 'staff';

export interface DeliveryTask {
  title: I18nText;
  role?: string | null;
  due_days?: number | null;
  checklist?: string[];
}
export interface FieldOption {
  value: string;
  label: I18nText;
}
export interface ServiceTypeField {
  id: string; service_type_id: string; key: string; label: I18nText; help_text: I18nText;
  field_type: FieldType; options: FieldOption[]; validation: Record<string, unknown>;
  is_required: boolean; filled_by: FilledBy; position: number; is_active: boolean; version: number;
}
export interface ServiceType {
  id: string; code: string; name: I18nText; description: I18nText; icon: string | null;
  category_id: string; brand_ids: string[]; status: ServiceTypeStatus; sale_mode: ServiceTypeSaleMode;
  requires_contract: boolean; default_provider_id: string | null; component_kind: ServiceComponentKind | null;
  delivery_tasks: DeliveryTask[]; portal_fields: string[]; activated_at: string | null; archived_at: string | null;
  version: number; fields?: ServiceTypeField[];
}
export interface ServiceTypeInput {
  code?: string; name?: I18nText; description?: I18nText; icon?: string | null;
  category_id?: string; brand_ids?: string[]; sale_mode?: ServiceTypeSaleMode; requires_contract?: boolean;
  default_provider_id?: string | null; component_kind?: ServiceComponentKind | null;
  delivery_tasks?: DeliveryTask[]; portal_fields?: string[];
}
export interface ServiceTypeFieldInput {
  key?: string; label?: I18nText; help_text?: I18nText; field_type?: FieldType;
  options?: FieldOption[]; validation?: Record<string, unknown>; is_required?: boolean;
  filled_by?: FilledBy; position?: number; is_active?: boolean;
}
export interface ServiceTypeFilters {
  [key: string]: string | undefined;
  status?: ServiceTypeStatus | '';
  category_id?: string;
}

export function createCatalogApi(http: HttpClient) {
  const products = crud<Product, ProductInput>(http, 'products');
  const plans = crud<Plan, PlanInput>(http, 'plans');
  const serviceTypes = crud<ServiceType, ServiceTypeInput>(http, 'service-types');
  const encServiceType = (id: string) => `/api/v1/admin/service-types/${enc(id)}`;
  const encProduct = (productId: string) => `/api/v1/admin/products/${enc(productId)}/addons`;
  const encHostingSpec = (productId: string) => `/api/v1/admin/products/${enc(productId)}/hosting-spec`;
  const encVpsSpec = (productId: string) => `/api/v1/admin/products/${enc(productId)}/vps-spec`;
  const encBundleItems = (planId: string) => `/api/v1/admin/plans/${enc(planId)}/bundle-items`;
  return {
    categories: crud<ProductCategory, ProductCategoryInput>(http, 'product-categories'),
    products: {
      ...products,
      list: (params: ListParams & { filter?: ProductFilters } = {}) =>
        products.list({ ...params, filter: { ...params.filter, is_active: bool(params.filter?.is_active), sellable_online: bool(params.filter?.sellable_online) } }),
      addons: {
        list: (productId: string) => http.get<Envelope<ProductAddon[]>>(encProduct(productId)).then((r) => r.data),
        attach: (productId: string, input: ProductAddonInput) => http.post<Envelope<ProductAddon>>(encProduct(productId), input).then((r) => r.data),
        update: (productId: string, addonId: string, input: Pick<ProductAddon, 'is_required' | 'version'>) =>
          http.patch<Envelope<ProductAddon>>(`${encProduct(productId)}/${enc(addonId)}`, input).then((r) => r.data),
        remove: (productId: string, addonId: string) => http.delete<void>(`${encProduct(productId)}/${enc(addonId)}`),
      },
      hostingSpec: {
        get: (productId: string) =>
          http.get<Envelope<HostingPackageSpec>>(encHostingSpec(productId)).then((r) => r.data).catch((e) => {
            if (isProblem(e) && e.status === 404) return null; throw e;
          }),
        upsert: (productId: string, input: HostingSpecInput) =>
          http.put<Envelope<HostingPackageSpec>>(encHostingSpec(productId), input).then((r) => r.data),
        remove: (productId: string) => http.delete<void>(encHostingSpec(productId)),
      },
      vpsSpec: {
        get: (productId: string) =>
          http.get<Envelope<VpsPlanSpec>>(encVpsSpec(productId)).then((r) => r.data).catch((e) => {
            if (isProblem(e) && e.status === 404) return null; throw e;
          }),
        upsert: (productId: string, input: VpsSpecInput) =>
          http.put<Envelope<VpsPlanSpec>>(encVpsSpec(productId), input).then((r) => r.data),
        remove: (productId: string) => http.delete<void>(encVpsSpec(productId)),
      },
    },
    plans: {
      ...plans,
      bundleItems: {
        list: (planId: string) => http.get<Envelope<BundleItem[]>>(encBundleItems(planId)).then((r) => r.data),
        attach: (planId: string, input: BundleItemInput) => http.post<Envelope<BundleItem>>(encBundleItems(planId), input).then((r) => r.data),
        update: (planId: string, itemId: string, input: Pick<BundleItem, 'quantity' | 'version'>) =>
          http.patch<Envelope<BundleItem>>(`${encBundleItems(planId)}/${enc(itemId)}`, input).then((r) => r.data),
        remove: (planId: string, itemId: string) => http.delete<void>(`${encBundleItems(planId)}/${enc(itemId)}`),
      },
    },
    serviceTypes: {
      ...serviceTypes,
      activate: (id: string, version: number) =>
        http.post<Envelope<ServiceType>>(`${encServiceType(id)}/activate`, { version }).then((r) => r.data),
      archive: (id: string, version: number) =>
        http.post<Envelope<ServiceType>>(`${encServiceType(id)}/archive`, { version }).then((r) => r.data),
      fields: {
        list: (id: string) => http.get<Envelope<ServiceTypeField[]>>(`${encServiceType(id)}/fields`).then((r) => r.data),
        create: (id: string, input: ServiceTypeFieldInput) =>
          http.post<Envelope<ServiceTypeField>>(`${encServiceType(id)}/fields`, input).then((r) => r.data),
        update: (id: string, fieldId: string, version: number, input: ServiceTypeFieldInput) =>
          http.patch<Envelope<ServiceTypeField>>(`${encServiceType(id)}/fields/${enc(fieldId)}`, { ...input, version }).then((r) => r.data),
        remove: (id: string, fieldId: string) => http.delete<void>(`${encServiceType(id)}/fields/${enc(fieldId)}`),
      },
    },
    prices: crud<PlanPrice, PlanPriceInput>(http, 'plan-prices'),
    listings: crud<ProductListing, ProductListingInput>(http, 'product-listings'),
  };
}
