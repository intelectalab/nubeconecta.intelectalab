/** Cliente de marcas y temas de marca (M-BRD), según BrandController y
 * BrandThemeController: los recursos administrativos usan `{ data }`. */
import { newIdempotencyKey, toQuery, type HttpClient } from './http';
import type { CursorPage, ListParams } from './customers';

export interface Brand {
  id: string; organization_id: string; code: string; name: string;
  domain: string | null; portal_domain: string | null; default_legal_entity_id: string;
  email_from: string | null; email_from_name: string | null; support_email: string | null;
  status: 'active' | 'inactive'; locale: string; status_page_slug: string | null;
  theme?: Record<string, unknown> | null; version: number; created_at: string; updated_at: string;
  created_by: string | null; updated_by: string | null;
  legal_entity?: { id: string; name: string; [key: string]: unknown } | null;
}
export type BrandInput = Pick<Brand, 'code' | 'name' | 'default_legal_entity_id'> & Partial<Pick<Brand, 'domain' | 'portal_domain' | 'email_from' | 'email_from_name' | 'support_email' | 'status' | 'locale' | 'status_page_slug'>>;

export interface BrandTheme {
  id: string; organization_id: string; brand_id: string; name: string;
  published_version_id: string | null; published_at: string | null; version: number;
  created_at: string; updated_at: string; created_by: string | null; updated_by: string | null;
  versions?: BrandThemeVersion[];
}
export interface BrandThemeVersion {
  id: string; organization_id: string; brand_theme_id: string; brand_id: string;
  version_number: number; version: number; tokens: Record<string, unknown>;
  surfaces: BrandThemeSurface[]; status: 'draft' | 'published' | 'archived';
  change_note: string | null; restored_from_version_id: string | null; logo_file_id: string | null;
  favicon_file_id: string | null; contrast_min_ratio: number | null; contrast_lowest_ratio: number | null;
  contrast_report: ContrastPair[]; contrast_checked_at: string | null; preview_expires_at: string | null;
  published_at: string | null; published_by: string | null; archived_at: string | null;
  created_at: string; updated_at: string; created_by: string | null; updated_by: string | null;
}
export type BrandThemeSurface = 'portal' | 'admin' | 'email';
export interface BrandThemeInput { brand_id: string; name: string }
export interface BrandThemeVersionInput { tokens?: Record<string, unknown>; surfaces?: BrandThemeSurface[]; change_note?: string | null }
export type BrandThemeVersionUpdate = BrandThemeVersionInput & { version: number };
export interface ContrastPair {
  mode: string; foreground: string; background: string; foreground_color: string;
  background_color: string; ratio: number; passes: boolean;
}
export interface ContrastCheckResponse extends BrandThemeVersion { contrast_report: ContrastPair[] }
export interface PreviewLinkResponse { token: string; expires_at: string; url: string }

export interface BrandFilters { status?: Brand['status'] | ''; }
export interface BrandThemeFilters { brand_id?: string }
interface Envelope<T> { data: T }
const enc = encodeURIComponent;

export function createBrandsApi(http: HttpClient) {
  const brandsBase = '/api/v1/admin/brands';
  const themesBase = '/api/v1/admin/brand-themes';
  // Las rutas de versiones están definidas por el backend como
  // /admin/brand-theme-versions/{versionId}, incluido su slash final para GET/PATCH.
  const versionBase = (id: string) => `/api/v1/admin/brand-theme-versions/${enc(id)}`;
  const unwrap = <T>(r: Envelope<T>) => r.data;
  return {
    list: (params: ListParams & { filter?: BrandFilters } = {}) => http.get<CursorPage<Brand>>(`${brandsBase}${toQuery({ q: params.q, sort: params.sort, page: { size: params.size, cursor: params.cursor ?? undefined }, filter: params.filter })}`),
    get: (id: string) => http.get<Envelope<Brand>>(`${brandsBase}/${enc(id)}`).then(unwrap),
    update: (id: string, version: number, input: Partial<BrandInput>) => http.patch<Envelope<Brand>>(`${brandsBase}/${enc(id)}`, { ...input, version }).then(unwrap),
    themes: {
      list: (params: ListParams & { filter?: BrandThemeFilters } = {}) => http.get<CursorPage<BrandTheme>>(`${themesBase}${toQuery({ q: params.q, sort: params.sort, page: { size: params.size, cursor: params.cursor ?? undefined }, filter: params.filter })}`),
      create: (input: BrandThemeInput) => http.post<Envelope<BrandTheme>>(themesBase, input, { idempotencyKey: newIdempotencyKey() }).then(unwrap),
      get: (id: string) => http.get<Envelope<BrandTheme>>(`${themesBase}/${enc(id)}`).then(unwrap),
      createVersion: (id: string, input: BrandThemeVersionInput = {}) => http.post<Envelope<BrandThemeVersion>>(`${themesBase}/${enc(id)}/versions`, input, { idempotencyKey: newIdempotencyKey() }).then(unwrap),
    },
    versions: {
      get: (id: string) => http.get<Envelope<BrandThemeVersion>>(`${versionBase(id)}/`).then(unwrap),
      update: (id: string, input: BrandThemeVersionUpdate) => http.patch<Envelope<BrandThemeVersion>>(`${versionBase(id)}/`, input).then(unwrap),
      checkContrast: (id: string) => http.post<Envelope<ContrastCheckResponse>>(`${versionBase(id)}/check-contrast`).then(unwrap),
      previewLink: (id: string) => http.post<Envelope<PreviewLinkResponse>>(`${versionBase(id)}/preview-link`, {}, { idempotencyKey: newIdempotencyKey() }).then(unwrap),
      publish: (id: string) => http.post<Envelope<BrandThemeVersion>>(`${versionBase(id)}/publish`, {}, { idempotencyKey: newIdempotencyKey() }).then(unwrap),
      revert: (id: string, change_note?: string | null) => http.post<Envelope<BrandThemeVersion>>(`${versionBase(id)}/revert`, { change_note }, { idempotencyKey: newIdempotencyKey() }).then(unwrap),
    },
  };
}

export type BrandsApi = ReturnType<typeof createBrandsApi>;
