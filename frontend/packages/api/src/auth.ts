/**
 * /api/v1/auth/* — tipos según los controladores reales del backend:
 * App\Modules\Identity\Http\Controllers\{AuthController,MfaController} y
 * Http\Resources\UserResource (más mePayload()).
 */
import { HttpClient } from './http';

export type UserType = 'staff' | 'customer' | (string & {});
export type MfaMethod = 'totp' | (string & {});

export interface UserRole {
  id: string;
  code: string;
  name: string;
  expires_at: string | null;
}

/** UserResource. */
export interface User {
  id: string;
  type: UserType;
  name: string;
  email: string;
  status: string;
  locale: string | null;
  timezone: string | null;
  mfa_enabled: boolean;
  mfa_method: MfaMethod | null;
  must_change_password: boolean;
  locked_until: string | null;
  last_login_at: string | null;
  disabled_at: string | null;
  roles?: UserRole[];
  version: number;
  created_at: string | null;
  updated_at: string | null;
}

/** AuthController::mePayload(): UserResource + permisos y estado MFA/contraseña. */
export interface Me extends User {
  roles: UserRole[];
  permissions: string[];
  mfa: {
    enabled: boolean;
    method: MfaMethod | null;
    required: boolean;
    enrollment_required: boolean;
  };
  password: { change_required: boolean };
}

export type LoginResult =
  | { mfa_required: true; methods: Array<MfaMethod | 'recovery'> }
  | { mfa_required: false; user: Me };

export type MfaVerifyMethod = 'totp' | 'recovery';

export interface PasswordPolicy {
  min_length: number;
  complexity: unknown;
  expiry_days: number | null;
  history_count: number;
}

export interface TotpEnrollment {
  secret: string;
  otpauth_uri: string;
}

export interface TotpConfirmation {
  mfa_method: 'totp';
  recovery_codes: string[];
}

interface Envelope<T> {
  data: T;
}

const P = '/api/v1/auth';

export function createAuthApi(http: HttpClient) {
  return {
    /** POST /auth/login → si `mfa_required`, continuar con verifyMfa. */
    login: async (email: string, password: string) =>
      (await http.post<Envelope<LoginResult>>(`${P}/login`, { email, password })).data,

    /** POST /auth/mfa/verify con código TOTP o de recuperación. */
    verifyMfa: async (method: MfaVerifyMethod, code: string) =>
      (await http.post<Envelope<{ mfa_required: false; user: Me }>>(`${P}/mfa/verify`, { method, code })).data.user,

    /** POST /auth/logout (204). */
    logout: () => http.post<void>(`${P}/logout`),

    /** GET /auth/me. */
    me: async () => (await http.get<Envelope<Me>>(`${P}/me`)).data,

    /** GET /auth/password-policy. */
    passwordPolicy: async () => (await http.get<Envelope<PasswordPolicy>>(`${P}/password-policy`)).data,

    /** POST /auth/password/change (204). Cierra las demás sesiones del usuario. */
    changePassword: (currentPassword: string, password: string, passwordConfirmation: string) =>
      http.post<void>(`${P}/password/change`, {
        current_password: currentPassword,
        password,
        password_confirmation: passwordConfirmation,
      }),

    /** GET /portal/auth/password-policy: reglas vigentes, sin sesión (activación y restablecimiento). */
    publicPasswordPolicy: async () => (await http.get<Envelope<PasswordPolicy>>('/api/v1/portal/auth/password-policy')).data,

    /** POST /portal/auth/invitations/verify → nombre y correo enmascarado (no consume el enlace). 410 token_expired | token_invalid. */
    verifyInvitation: async (token: string) =>
      (await http.post<Envelope<{ name: string; email: string }>>('/api/v1/portal/auth/invitations/verify', { token })).data,

    /** POST /portal/auth/invitations/accept (204): fija la contraseña; no inicia sesión. */
    acceptInvitation: (token: string, password: string, passwordConfirmation: string) =>
      http.post<void>('/api/v1/portal/auth/invitations/accept', { token, password, password_confirmation: passwordConfirmation }),

    /** POST /portal/auth/password/forgot (202, siempre genérica). */
    forgotPassword: (email: string) => http.post<unknown>('/api/v1/portal/auth/password/forgot', { email }),

    /** POST /portal/auth/password/reset (204): cierra todas las sesiones del usuario. */
    resetPassword: (token: string, password: string, passwordConfirmation: string) =>
      http.post<void>('/api/v1/portal/auth/password/reset', { token, password, password_confirmation: passwordConfirmation }),

    /** POST /auth/mfa/totp → clave y URI otpauth (la clave queda en sesión hasta confirmar). */
    startTotp: async () => (await http.post<Envelope<TotpEnrollment>>(`${P}/mfa/totp`)).data,

    /** POST /auth/mfa/totp/confirm (201) → códigos de recuperación (se muestran una sola vez). */
    confirmTotp: async (code: string) =>
      (await http.post<Envelope<TotpConfirmation>>(`${P}/mfa/totp/confirm`, { code })).data,

    /** POST /auth/mfa/step-up → MFA reciente para acciones sensibles. */
    stepUp: async (code: string) =>
      (await http.post<Envelope<{ mfa_verified_at: string }>>(`${P}/mfa/step-up`, { code })).data,
  };
}

export type AuthApi = ReturnType<typeof createAuthApi>;
