import type { ContractStatus } from '@hub/api';
import type { ChipKind } from '../../../components/ui';
import { hub } from '../../../auth/client';

export const contractsApi = hub.contracts;
export const CONTRACT_CHIP: Record<ContractStatus, ChipKind> = {
  draft: 'info', in_review: 'warn', approved: 'ok', sent: 'warn', signed_active: 'ok', expired: '', terminated: 'danger',
};
