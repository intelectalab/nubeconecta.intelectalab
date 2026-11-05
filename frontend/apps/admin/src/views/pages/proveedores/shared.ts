import type { ProviderStatus, ProviderType } from '@hub/api';
import type { ChipKind } from '../../../components/ui';
import { hub } from '../../../auth/client';

export const providersApi = hub.providers;
export const PROVIDER_STATUS_CHIP: Record<ProviderStatus, ChipKind> = { active: 'ok', inactive: '' };
export const PROVIDER_TYPE_LABEL: Record<ProviderType, string> = {
  hosting: 'Hosting', server: 'Servidor', cloud: 'Cloud', registrar: 'Registrador', email: 'Correo', ssl: 'SSL', cdn: 'CDN',
  bulk_email: 'Email masivo', payment: 'Pagos', einvoice: 'Facturación electrónica', saas: 'SaaS', dns: 'DNS', ai: 'IA', other: 'Otro',
};
