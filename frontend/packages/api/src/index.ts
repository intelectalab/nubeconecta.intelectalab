import { createAuthApi } from './auth';
import { createCatalogApi } from './catalog';
import { createCustomersApi } from './customers';
import { createOrdersApi } from './orders';
import { createServicesApi } from './services';
import { createBillingApi } from './billing';
import { createWebConnectorApi } from './webConnector';
import { createSalesApi } from './sales';
import { createSupportApi } from './support';
import { HttpClient, type HttpClientOptions } from './http';

export * from './http';
export * from './auth';
export * from './customers';
export * from './catalog';
export * from './orders';
export * from './services';
export * from './billing';
export * from './webConnector';
export * from './sales';
export * from './support';

/** Crea un cliente con su propia configuración (p. ej. otro baseUrl). */
export function createHubApi(opts: HttpClientOptions = {}) {
  const http = new HttpClient(opts);
  const billing = createBillingApi(http);
  /** `invoices` es alias de `billing` (comprobantes de M-BIL). */
  return { http, auth: createAuthApi(http), customers: createCustomersApi(http), catalog: createCatalogApi(http), orders: createOrdersApi(http), services: createServicesApi(http), billing, invoices: billing, webConnector: createWebConnectorApi(http), sales: createSalesApi(http), support: createSupportApi(http) };
}

/** Cliente por defecto: mismo origen (proxy de Vite en desarrollo). */
export const api = createHubApi();

export const { login, verifyMfa, logout, me, changePassword, startTotp, confirmTotp, passwordPolicy, stepUp } = api.auth;
