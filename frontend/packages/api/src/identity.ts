import { toQuery, type HttpClient } from './http';

export type IdentityAudience = 'staff' | 'customer';
export type UserStatus = 'active' | 'disabled' | 'locked';

export interface AdminUserRole {
  id: string;
  code: string;
  name: string;
  expires_at: string | null;
}

/** Campos de UserResource. */
export interface AdminUser {
  id: string;
  type: IdentityAudience;
  name: string;
  email: string;
  status: UserStatus | string;
  locale: 'es' | 'en' | null;
  timezone: string | null;
  mfa_enabled: boolean;
  mfa_method: string | null;
  must_change_password: boolean;
  locked_until: string | null;
  last_login_at: string | null;
  disabled_at: string | null;
  roles: AdminUserRole[];
  version: number;
  created_at: string;
  updated_at: string;
}

/** store requiere password; los demás campos opcionales coinciden con el controlador. */
export interface AdminUserInput {
  name: string;
  email: string;
  type: IdentityAudience;
  password: string;
  locale?: 'es' | 'en';
  timezone?: string;
  role_ids?: string[];
}

export interface Role {
  id: string;
  code: string;
  name: string;
  description: string | null;
  audience: IdentityAudience;
  is_system: boolean;
  copied_from_role_id: string | null;
  /** Presente al cargar una ficha; el listado no eager-loads esta relación. */
  permissions?: string[];
  version: number;
  created_at: string;
  updated_at: string;
}

export interface RoleInput {
  code: string;
  name: string;
  description?: string | null;
  audience: IdentityAudience;
  permissions?: string[];
}

export interface RoleCopyInput {
  code: string;
  name: string;
  description?: string | null;
}

export interface Permission {
  id: string;
  code: string;
  module: string;
  entity: string;
  action: string;
  description: string | null;
  is_sensitive: boolean;
}

export interface PermissionMatrix {
  modules: { module: string; entities: { entity: string; actions: { code: string; action: string; is_sensitive: boolean }[] }[] }[];
  roles: { id: string; code: string; name: string; audience: IdentityAudience; is_system: boolean; version: number; permissions: string[] }[];
}

export interface IdentityListParams {
  q?: string;
  sort?: string;
  cursor?: string | null;
  size?: number;
  type?: IdentityAudience | '';
  status?: string;
  audience?: IdentityAudience | '';
}

export interface IdentityCursorPage<T> {
  data: T[];
  meta: { next_cursor: string | null; prev_cursor: string | null; has_more: boolean; page_size: number };
  links: { next: string | null; prev: string | null };
}

interface Envelope<T> { data: T }
const enc = encodeURIComponent;
const unwrap = <T>(r: Envelope<T>): T => r.data;
const pageQuery = (p: IdentityListParams) => toQuery({
  sort: p.sort,
  filter: { q: p.q, type: p.type, status: p.status, audience: p.audience },
  page: { size: p.size, cursor: p.cursor ?? undefined },
});

export function createIdentityApi(http: HttpClient) {
  const base = '/api/v1/admin';
  return {
    users: {
      list: (params: IdentityListParams = {}) => http.get<IdentityCursorPage<AdminUser>>(`${base}/users${pageQuery(params)}`),
      get: (id: string) => http.get<Envelope<AdminUser>>(`${base}/users/${enc(id)}`).then(unwrap),
      create: (input: AdminUserInput) => http.post<Envelope<AdminUser>>(`${base}/users`, input).then(unwrap),
      update: async (id: string, versionOrInput: number | Partial<AdminUserInput> | undefined, maybeInput?: Partial<AdminUserInput>) => {
        const version = typeof versionOrInput === 'number' ? versionOrInput : undefined;
        const input = typeof versionOrInput === 'object' && versionOrInput !== null ? versionOrInput : maybeInput ?? {};
        const currentVersion = version ?? (await http.get<Envelope<AdminUser>>(`${base}/users/${enc(id)}`)).data.version;
        return http.patch<Envelope<AdminUser>>(`${base}/users/${enc(id)}`, { ...input, version: currentVersion }).then(unwrap);
      },
      remove: (id: string) => http.delete<void>(`${base}/users/${enc(id)}`),
      disable: (id: string) => http.post<Envelope<AdminUser>>(`${base}/users/${enc(id)}/disable`).then(unwrap),
      enable: (id: string) => http.post<Envelope<AdminUser>>(`${base}/users/${enc(id)}/enable`).then(unwrap),
      setRoles: (id: string, roleIds: string[]) => http.put<Envelope<AdminUser>>(`${base}/users/${enc(id)}/roles`, { roles: roleIds.map((rid) => ({ id: rid })) }).then(unwrap),
    },
    roles: {
      list: () => http.get<IdentityCursorPage<Role>>(`${base}/roles${toQuery({ page: { size: 100 } })}`),
      get: (id: string) => http.get<Envelope<Role>>(`${base}/roles/${enc(id)}`).then(unwrap),
      create: (input: RoleInput) => http.post<Envelope<Role>>(`${base}/roles`, input).then(unwrap),
      update: async (id: string, versionOrInput: number | Partial<RoleInput> | undefined, maybeInput?: Partial<RoleInput>) => {
        const version = typeof versionOrInput === 'number' ? versionOrInput : undefined;
        const input = typeof versionOrInput === 'object' && versionOrInput !== null ? versionOrInput : maybeInput ?? {};
        const currentVersion = version ?? (await http.get<Envelope<Role>>(`${base}/roles/${enc(id)}`)).data.version;
        return http.patch<Envelope<Role>>(`${base}/roles/${enc(id)}`, { ...input, version: currentVersion }).then(unwrap);
      },
      remove: (id: string) => http.delete<void>(`${base}/roles/${enc(id)}`),
      copy: async (id: string, input?: RoleCopyInput) => {
        const source = input ? null : await http.get<Envelope<Role>>(`${base}/roles/${enc(id)}`).then(unwrap);
        const body = input ?? { code: `${source!.code}_copy`, name: `${source!.name} (copia)`, description: source!.description };
        return http.post<Envelope<Role>>(`${base}/roles/${enc(id)}/copy`, body).then(unwrap);
      },
      setPermissions: async (id: string, permissionCodes: string[], version?: number) => {
        const currentVersion = version ?? (await http.get<Envelope<Role>>(`${base}/roles/${enc(id)}`)).data.version;
        return http.put<Envelope<Role>>(`${base}/roles/${enc(id)}/permissions`, { version: currentVersion, permissions: permissionCodes }).then(unwrap);
      },
    },
    permissions: {
      list: () => http.get<Envelope<Permission[]>>(`${base}/permissions`).then(unwrap),
      matrix: () => http.get<Envelope<PermissionMatrix>>(`${base}/permissions/matrix`).then(unwrap),
    },
  };
}

export type IdentityApi = ReturnType<typeof createIdentityApi>;
