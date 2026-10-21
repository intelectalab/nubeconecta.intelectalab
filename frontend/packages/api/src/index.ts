import { createAuthApi } from './auth';
import { HttpClient, type HttpClientOptions } from './http';

export * from './http';
export * from './auth';

/** Crea un cliente con su propia configuración (p. ej. otro baseUrl). */
export function createHubApi(opts: HttpClientOptions = {}) {
  const http = new HttpClient(opts);
  return { http, auth: createAuthApi(http) };
}

/** Cliente por defecto: mismo origen (proxy de Vite en desarrollo). */
export const api = createHubApi();

export const { login, verifyMfa, logout, me, changePassword, startTotp, confirmTotp, passwordPolicy, stepUp } = api.auth;
