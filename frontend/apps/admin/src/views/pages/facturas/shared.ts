/** Utilidades de las vistas de comprobantes conectadas al backend (M-BIL, franja MVP). */
import type { FiscalStatus, Invoice, InvoiceStatus } from '@hub/api';
import type { ChipKind } from '../../../components/ui';
import { hub } from '../../../auth/client';

export const invoicesApi = hub.invoices;

export const INVOICE_CHIP: Record<InvoiceStatus, ChipKind> = {
  draft: 'info',
  issued: 'warn',
  partially_paid: 'warn',
  paid: 'ok',
  overdue: 'danger',
  void: '',
};

export const FISCAL_CHIP: Record<FiscalStatus, ChipKind> = {
  not_applicable: 'outline',
  pending: 'warn',
  accepted: 'ok',
  rejected: 'danger',
  voided: '',
};

/** Estados que produce la franja MVP. */
export const MVP_INVOICE_STATUSES: InvoiceStatus[] = ['draft', 'issued', 'partially_paid', 'paid', 'overdue', 'void'];

export const invoiceNumber = (i: Pick<Invoice, 'number'>) => i.number ?? 'Borrador';
