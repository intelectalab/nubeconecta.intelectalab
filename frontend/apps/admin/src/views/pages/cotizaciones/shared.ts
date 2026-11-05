import type { QuoteStatus } from '@hub/api';
import type { ChipKind } from '../../../components/ui';
import { hub } from '../../../auth/client';

export const quotesApi = hub.sales.quotes;
export const QUOTE_CHIP: Record<QuoteStatus, ChipKind> = {
  draft: 'info', sent: 'warn', accepted: 'ok', rejected: 'danger', expired: '',
};
