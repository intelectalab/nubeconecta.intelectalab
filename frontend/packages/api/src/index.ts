import { createAuthApi } from './auth';
import { createCatalogApi } from './catalog';
import { createCustomersApi } from './customers';
import { createOrdersApi } from './orders';
import { createServicesApi } from './services';
import { createBillingApi } from './billing';
import { createWebConnectorApi } from './webConnector';
import { createSalesApi } from './sales';
import { createSupportApi } from './support';
import { createIdentityApi } from './identity';
import { HttpClient, type HttpClientOptions } from './http';
import { createSettingsApi } from './settings';
import { createContractsApi } from './contracts';
import { createProvidersApi } from './providers';
import { createWorkApi } from './work';
import { createMonitoringApi } from './monitoring';
import { createInventoryApi } from './inventory';
import { createFinanceApi } from './finance';
import { createBrandsApi } from './brands';
import { createNotificationsApi } from './notifications';
import { createFilesApi, createPortalFilesApi } from './files';
import { createDashboardApi } from './dashboard';
import { createDomainsApi } from './domains';

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
export * from './identity';
export * from './settings';
export * from './contracts';
export * from './providers';
export * from './work';
export * from './monitoring';
export * from './inventory';
export * from './finance';
export * from './brands';
export * from './notifications';
export * from './files';
export * from './dashboard';
export * from './domains';

/** Crea un cliente con su propia configuración (p. ej. otro baseUrl). */
export function createHubApi(opts: HttpClientOptions = {}) {
  const http = new HttpClient(opts);
  const billing = createBillingApi(http);
  /** `invoices` es alias de `billing` (comprobantes de M-BIL). */
  return { http, auth: createAuthApi(http), customers: createCustomersApi(http), brands: createBrandsApi(http), catalog: createCatalogApi(http), orders: createOrdersApi(http), services: createServicesApi(http), billing, invoices: billing, webConnector: createWebConnectorApi(http), sales: createSalesApi(http), contracts: createContractsApi(http), support: createSupportApi(http), identity: createIdentityApi(http), settings: createSettingsApi(http), providers: createProvidersApi(http), work: createWorkApi(http), monitoring: createMonitoringApi(http), inventory: createInventoryApi(http), finance: createFinanceApi(http), notifications: createNotificationsApi(http), files: createFilesApi(http), portalFiles: createPortalFilesApi(http), dashboard: createDashboardApi(http), domains: createDomainsApi(http) };
}

/** Cliente por defecto: mismo origen (proxy de Vite en desarrollo). */
export const api = createHubApi();

export const { login, verifyMfa, logout, me, changePassword, startTotp, confirmTotp, passwordPolicy, stepUp } = api.auth;
