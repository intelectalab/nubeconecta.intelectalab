/** Utilidades de pagos y cobranza conectadas al backend (M-BIL franja MVP). */
import type { Payment } from '@hub/api';
import type { ChipKind } from '../../../components/ui';
import { hub } from '../../../auth/client';

export const paymentsApi = hub.billing;

export const paymentChip = (p: Pick<Payment, 'status' | 'voided'>): ChipKind =>
  p.voided ? '' : p.status === 'validated' ? 'ok' : p.status === 'reported' ? 'warn' : p.status === 'rejected' ? 'danger' : 'info';

export const VIA_LABELS: Record<Payment['reported_via'], string> = {
  portal: 'Cliente (portal)',
  sales: 'Ventas',
  finance: 'Finanzas',
  webhook: 'Pasarela',
  import: 'Importación',
};

/** "123,45" o "123.45" → céntimos enteros (sin flotantes); null si no es un importe válido. */
export function parseMinor(text: string): number | null {
  const t = text.trim().replace(/\s/g, '').replace(',', '.');
  const m = /^(\d{1,12})(?:\.(\d{0,2}))?$/.exec(t);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
}

/** Céntimos → "123.45" para un campo editable. */
export const minorToInput = (minor: number) => `${Math.trunc(minor / 100)}.${String(minor % 100).padStart(2, '0')}`;

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
