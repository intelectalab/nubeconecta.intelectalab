/** Utilidades de las vistas de pedidos conectadas al backend (M-ORD). */
import type { ChipKind } from '../../../components/ui';
import type { OrderStatus } from '@hub/api';
import { hub } from '../../../auth/client';

export const ordersApi = hub.orders;

export const ORDER_CHIP: Record<OrderStatus, ChipKind> = {
  draft: 'info',
  approved: 'ok',
  payment_validated: 'ok',
  provisioning: 'warn',
  testing: 'warn',
  active: 'ok',
  manual_review: 'high',
  failed: 'danger',
  cancelled: '',
};
