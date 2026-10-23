/**
 * Portal del cliente contra la API real (franja MVP; con VITE_DEMO=1 se usa el
 * mock de App.tsx). Solo datos del cliente de la sesión (el backend lo toma del
 * contacto enlazado; lo ajeno responde 404):
 *  - P-PRT-02 Resumen (/portal/summary)
 *  - P-PRT-03/04 Servicios y detalle (/portal/services)
 *  - P-PRT-07/08 Comprobantes, detalle con pagos y envío de voucher (/portal/invoices)
 *  - P-PRT-09 Pagos y vouchers (/portal/payments)
 *  - P-PRT-14 Datos de facturación (/portal/account)
 * La pasarela de tarjetas (D-18) y PayPal en línea no están disponibles todavía.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  FISCAL_STATUS_LABELS,
  INVOICE_STATUS_LABELS,
  INVOICE_TYPE_LABELS,
  isProblem,
  newIdempotencyKey,
  paymentStatusLabel,
  SERVICE_STATUS_LABELS,
  type CardCheckout,
  type Invoice,
  type Payment,
  type PaymentMethodOption,
  type PortalSummary,
  type Service,
} from '@hub/api';
import { hub } from '../auth/client';

export type LiveRoute = 'resumen' | 'servicios' | 'servicio-detalle' | 'facturas' | 'pagar' | 'perfil';
export const LIVE_ROUTES: LiveRoute[] = ['resumen', 'servicios', 'servicio-detalle', 'facturas', 'pagar', 'perfil'];

const MONEY: Record<string, Intl.NumberFormat> = {
  PEN: new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }),
  USD: new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'USD' }),
};
const money = (minor: number, cur: string) => (MONEY[cur] ?? MONEY.PEN).format(minor / 100);
/** Fechas YYYY-MM-DD sin desplazamiento de zona. */
const fDate = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
function parseMinor(text: string): number | null {
  const m = /^(\d{1,12})(?:[.,](\d{0,2}))?$/.exec(text.trim());
  return m ? Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0')) : null;
}
const minorToInput = (minor: number) => `${Math.trunc(minor / 100)}.${String(minor % 100).padStart(2, '0')}`;

function errorText(e: unknown): string {
  if (isProblem(e)) return e.status === 403 ? 'No tiene permiso para esta acción.' : e.userMessage;
  return 'Ocurrió un error inesperado. Intente de nuevo.';
}

function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fn()
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { data, error, loading, reload: useCallback(() => setTick((t) => t + 1), []) };
}

const INV_CHIP: Record<string, string> = { issued: 'warn', partially_paid: 'warn', paid: 'ok', overdue: 'danger', void: '' };
const PAY_CHIP = (p: Pick<Payment, 'status' | 'voided'>) => (p.voided ? '' : p.status === 'validated' ? 'ok' : p.status === 'reported' ? 'warn' : p.status === 'rejected' ? 'danger' : 'info');
const SRV_CHIP: Record<string, string> = { active: 'ok', pending: 'info', suspended: 'danger', terminated: '', cancelled: '', handed_over: '' };

function Failed({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="alert warn" role="alert">
      {errorText(error)}{' '}
      <button type="button" className="btn sm" onClick={onRetry}>
        Reintentar
      </button>
    </div>
  );
}

function Head({ title, lead, actions }: { title: string; lead?: string; actions?: ReactNode }) {
  return (
    <div className="phead" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
      <div>
        <h1>{title}</h1>
        {lead ? <p className="lead">{lead}</p> : null}
      </div>
      {actions}
    </div>
  );
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function LivePortal({ route, go, can }: { route: LiveRoute; go: (r: LiveRoute) => void; can: (perm: string) => boolean }) {
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [cardReturn, setCardReturn] = useState(readCardReturn);
  const openService = (id: string) => {
    setServiceId(id);
    go('servicio-detalle');
  };
  const openInvoice = (id: string) => {
    setInvoiceId(id);
    go('facturas');
  };

  if (cardReturn) {
    const close = (invoice: string | null) => {
      window.history.replaceState(null, '', window.location.pathname);
      setCardReturn(null);
      if (invoice) openInvoice(invoice);
    };
    return <CardReturnPage checkoutId={cardReturn.checkout} paymentId={cardReturn.paymentId} close={close} />;
  }
  if (route === 'resumen') return <SummaryPage openInvoice={openInvoice} go={go} />;
  if (route === 'servicios') return <ServicesPage openService={openService} />;
  if (route === 'servicio-detalle') return serviceId ? <ServicePage id={serviceId} back={() => go('servicios')} /> : <ServicesPage openService={openService} />;
  if (route === 'perfil') return <BillingProfilePage />;
  if (route === 'pagar') return <PaymentsPage />;
  return invoiceId ? <InvoicePage id={invoiceId} back={() => setInvoiceId(null)} canPay={can('portal.payment.create')} /> : <InvoicesPage openInvoice={setInvoiceId} go={go} />;
}

/* ---------- P-PRT-02 Resumen ---------- */
function SummaryPage({ openInvoice, go }: { openInvoice: (id: string) => void; go: (r: LiveRoute) => void }) {
  const res = useLoad(() => hub.billing.portalSummary(), []);
  const s: PortalSummary | null = res.data;
  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <Head title="Resumen de su cuenta" lead="Servicios, próximos vencimientos y saldo pendiente." />
      {res.error ? <Failed error={res.error} onRetry={res.reload} /> : null}
      {res.loading && !s ? <p className="sub">Cargando…</p> : null}
      {s ? (
        <>
          <section className="kpis g-kpi" aria-label="Indicadores" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
            <div className="card kpi">
              <span className="lbl">Servicios activos</span>
              <span className="val">{s.services.active}</span>
              <span className="meta">
                {s.services.suspended ? `${s.services.suspended} suspendido(s)` : 'Ninguno suspendido'}
                {s.services.pending ? ` · ${s.services.pending} en preparación` : ''}
              </span>
            </div>
            <div className="card kpi">
              <span className="lbl">Saldo pendiente</span>
              <span className="val">{s.debt.length ? s.debt.map((d) => money(d.balance_minor, d.currency)).join(' + ') : money(0, 'PEN')}</span>
              <span className="meta">{s.debt.some((d) => d.overdue_minor > 0) ? `Vencido: ${s.debt.filter((d) => d.overdue_minor).map((d) => money(d.overdue_minor, d.currency)).join(' + ')}` : 'Sin deuda vencida'}</span>
            </div>
            <div className="card kpi">
              <span className="lbl">Vouchers en revisión</span>
              <span className="val">{s.pending_vouchers}</span>
              <span className="meta">Finanzas los valida contra el banco</span>
            </div>
          </section>
          <section className="card">
            <div className="card-h">
              <h2>Próximos vencimientos</h2>
              <button type="button" className="btn sm" onClick={() => go('facturas')}>
                Ver comprobantes
              </button>
            </div>
            {s.upcoming_invoices.length ? (
              <div className="tw">
                <table className="t">
                  <thead>
                    <tr>
                      <th>Comprobante</th>
                      <th>Vence</th>
                      <th>Estado</th>
                      <th className="r">Saldo</th>
                      <th className="r">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.upcoming_invoices.map((i) => (
                      <tr key={i.id}>
                        <td className="mono">{i.number}</td>
                        <td>{fDate(i.due_date)}</td>
                        <td>
                          <span className={`chip ${INV_CHIP[i.status] ?? ''}`}>{INVOICE_STATUS_LABELS[i.status]}</span>
                        </td>
                        <td className="r num">{money(i.balance_minor, i.currency)}</td>
                        <td className="r">
                          <button type="button" className="btn sm primary" onClick={() => openInvoice(i.id)}>
                            Ver y pagar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="card-b empty">No tiene comprobantes pendientes. ¡Está al día!</div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}

/* ---------- P-PRT-03 / 04 Servicios ---------- */
function ServicesPage({ openService }: { openService: (id: string) => void }) {
  const res = useLoad(() => hub.services.portalList({ size: 100 }), []);
  const rows: Service[] = res.data?.data ?? [];
  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <Head title="Mis servicios" lead="Lo que tiene contratado, con su estado y vencimiento." />
      {res.error ? <Failed error={res.error} onRetry={res.reload} /> : null}
      <section className="card">
        {res.loading ? (
          <div className="card-b sub">Cargando…</div>
        ) : !rows.length ? (
          <div className="card-b empty">Aún no hay servicios registrados en su cuenta.</div>
        ) : (
          <div className="tw">
            <table className="t">
              <thead>
                <tr>
                  <th>Servicio</th>
                  <th>Plan</th>
                  <th>Estado</th>
                  <th>Vencimiento</th>
                  <th>Renovación</th>
                  <th className="r">Acción</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <b>{s.label}</b>
                      <div className="sub mono">{s.code}</div>
                    </td>
                    <td>{s.plan?.name ?? s.product?.name ?? '—'}</td>
                    <td>
                      <span className={`chip ${SRV_CHIP[s.status] ?? ''}`}>{SERVICE_STATUS_LABELS[s.status]}</span>
                    </td>
                    <td>{fDate(s.commercial_due_date)}</td>
                    <td>{s.auto_renew ? 'Automática' : 'Manual'}</td>
                    <td className="r">
                      <button type="button" className="btn sm" onClick={() => openService(s.id)}>
                        Ver detalle
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function ServicePage({ id, back }: { id: string; back: () => void }) {
  const res = useLoad(() => hub.services.portalGet(id), [id]);
  const s = res.data;
  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <Head
        title={s?.label ?? 'Detalle de servicio'}
        lead={s ? `${s.product?.name ?? ''}${s.plan ? ` · ${s.plan.name}` : ''}` : undefined}
        actions={
          <button type="button" className="btn" onClick={back}>
            Volver a mis servicios
          </button>
        }
      />
      {res.error ? <Failed error={res.error} onRetry={res.reload} /> : null}
      {s ? (
        <section className="card">
          <div className="card-b">
            <dl className="kv">
              <dt>Estado</dt>
              <dd>
                <span className={`chip ${SRV_CHIP[s.status] ?? ''}`}>{SERVICE_STATUS_LABELS[s.status]}</span>
              </dd>
              <dt>Código</dt>
              <dd className="mono">{s.code}</dd>
              <dt>Ciclo</dt>
              <dd>{s.cycle ?? '—'}</dd>
              <dt>Precio</dt>
              <dd>{s.price.unit_price_minor !== null && s.price.currency ? `${money(s.price.unit_price_minor, s.price.currency)} × ${Number(s.price.quantity)}` : '—'}</dd>
              <dt>Inicio</dt>
              <dd>{fDate(s.starts_on)}</dd>
              <dt>Vencimiento comercial</dt>
              <dd>{fDate(s.commercial_due_date)}</dd>
              <dt>Próxima factura</dt>
              <dd>{fDate(s.subscription?.next_invoice_date ?? null)}</dd>
              <dt>Renovación automática</dt>
              <dd>{s.auto_renew ? 'Sí' : 'No'}</dd>
            </dl>
          </div>
        </section>
      ) : res.loading ? (
        <p className="sub">Cargando…</p>
      ) : null}
    </div>
  );
}

/* ---------- P-PRT-07 Comprobantes ---------- */
function InvoicesPage({ openInvoice, go }: { openInvoice: (id: string) => void; go: (r: LiveRoute) => void }) {
  const [filter, setFilter] = useState<'pend' | 'all'>('pend');
  const [cursor, setCursor] = useState<string | null>(null);
  const res = useLoad(() => hub.billing.portalList({ filter: filter === 'pend' ? { has_balance: 'true' } : {}, sort: '-issue_date', cursor, size: 25 }), [filter, cursor]);
  const rows: Invoice[] = res.data?.data ?? [];
  const meta = res.data?.meta;
  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <Head
        title="Facturas y pagos"
        lead="Descargue sus comprobantes y envíe la constancia de su transferencia o depósito."
        actions={
          <button type="button" className="btn" onClick={() => go('pagar')}>
            Historial de pagos y vouchers
          </button>
        }
      />
      <section className="card">
        <div className="toolbar" style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div className="seg" role="group" aria-label="Filtrar comprobantes">
            {(['pend', 'all'] as const).map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={filter === f}
                onClick={() => {
                  setFilter(f);
                  setCursor(null);
                }}
              >
                {f === 'pend' ? 'Por pagar' : 'Todos'}
              </button>
            ))}
          </div>
        </div>
        {res.error ? (
          <div className="card-b">
            <Failed error={res.error} onRetry={res.reload} />
          </div>
        ) : res.loading ? (
          <div className="card-b sub">Cargando…</div>
        ) : !rows.length ? (
          <div className="card-b empty">{filter === 'pend' ? 'No tiene comprobantes pendientes.' : 'No tiene comprobantes.'}</div>
        ) : (
          <div className="tw">
            <table className="t">
              <thead>
                <tr>
                  <th>Comprobante</th>
                  <th>Emisión</th>
                  <th>Vence</th>
                  <th className="r">Total</th>
                  <th className="r">Saldo</th>
                  <th>Estado</th>
                  <th className="r">Acción</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <span className="mono">{i.number}</span>
                      <div className="sub">{INVOICE_TYPE_LABELS[i.type]}</div>
                    </td>
                    <td>{fDate(i.issue_date)}</td>
                    <td>{fDate(i.due_date)}</td>
                    <td className="r num">{money(i.total_minor, i.currency)}</td>
                    <td className="r num">{money(i.balance_minor, i.currency)}</td>
                    <td>
                      <span className={`chip ${INV_CHIP[i.status] ?? ''}`}>{INVOICE_STATUS_LABELS[i.status]}</span>
                    </td>
                    <td className="r">
                      <button type="button" className={`btn sm${i.balance_minor > 0 ? ' primary' : ''}`} onClick={() => openInvoice(i.id)}>
                        {i.balance_minor > 0 ? 'Ver y pagar' : 'Ver'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="card-b" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn sm" disabled={res.loading || !meta?.prev_cursor} onClick={() => setCursor(meta?.prev_cursor ?? null)}>
            Anterior
          </button>
          <button type="button" className="btn sm" disabled={res.loading || !meta?.next_cursor} onClick={() => setCursor(meta?.next_cursor ?? null)}>
            Siguiente
          </button>
        </div>
      </section>
    </div>
  );
}

/* ---------- P-PRT-08 Detalle de comprobante, pagos y voucher ---------- */
function InvoicePage({ id, back, canPay }: { id: string; back: () => void; canPay: boolean }) {
  const res = useLoad(() => hub.billing.portalGet(id), [id]);
  const i = res.data;
  const [msg, setMsg] = useState<string | null>(null);
  const payable = !!i && ['issued', 'partially_paid', 'overdue'].includes(i.status) && i.balance_minor > 0;
  const doc = async () => {
    if (!i) return;
    try {
      download(await hub.billing.portalDocument(i.id), `${i.number ?? 'comprobante'}.html`);
    } catch (e) {
      setMsg(errorText(e));
    }
  };
  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <Head
        title={i ? `${INVOICE_TYPE_LABELS[i.type]} ${i.number ?? ''}` : 'Comprobante'}
        lead={i ? `Emitido el ${fDate(i.issue_date)} · vence el ${fDate(i.due_date)}` : undefined}
        actions={
          <span style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn" onClick={back}>
              Volver
            </button>
            {i ? (
              <button type="button" className="btn" onClick={() => void doc()}>
                Descargar
              </button>
            ) : null}
          </span>
        }
      />
      {res.error ? <Failed error={res.error} onRetry={res.reload} /> : null}
      {msg ? (
        <div className="alert warn" role="alert">
          {msg}
        </div>
      ) : null}
      {i ? (
        <>
          <section className="card">
            <div className="card-b">
              <p>
                <span className={`chip ${INV_CHIP[i.status] ?? ''}`}>{INVOICE_STATUS_LABELS[i.status]}</span> <span className="chip outline">{FISCAL_STATUS_LABELS[i.fiscal_status]}</span>
              </p>
              <div className="tw">
                <table className="t">
                  <thead>
                    <tr>
                      <th>Descripción</th>
                      <th className="r">Cant.</th>
                      <th className="r">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(i.items ?? []).map((l) => (
                      <tr key={l.id}>
                        <td>
                          {l.description}
                          {l.period_start ? <div className="sub">Periodo {fDate(l.period_start)} – {fDate(l.period_end)}</div> : null}
                        </td>
                        <td className="r num">{Number(l.quantity).toLocaleString('es-PE')}</td>
                        <td className="r num">{money(l.total_minor, i.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <dl className="kv" style={{ marginTop: 12 }}>
                <dt>Subtotal</dt>
                <dd className="num">{money(i.subtotal_minor, i.currency)}</dd>
                <dt>IGV</dt>
                <dd className="num">{money(i.tax_minor, i.currency)}</dd>
                <dt>Total</dt>
                <dd className="num">
                  <b>{money(i.total_minor, i.currency)}</b>
                </dd>
                <dt>Saldo pendiente</dt>
                <dd className="num">
                  <b>{money(i.balance_minor, i.currency)}</b>
                </dd>
              </dl>
            </div>
          </section>
          <section className="card">
            <div className="card-h">
              <h2>Pagos de este comprobante</h2>
            </div>
            {i.payments?.length ? (
              <div className="tw">
                <table className="t">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Medio</th>
                      <th>Operación</th>
                      <th>Estado</th>
                      <th className="r">Importe aplicado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {i.payments.map((p) => (
                      <tr key={p.payment_id}>
                        <td>{fDate(p.received_at)}</td>
                        <td>{p.method ?? '—'}</td>
                        <td className="mono">{p.external_id ?? '—'}</td>
                        <td>
                          <span className={`chip ${PAY_CHIP(p)}`}>{paymentStatusLabel(p)}</span>
                        </td>
                        <td className="r num">{money(p.amount_minor, i.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="card-b empty">Aún no hay pagos registrados para este comprobante.</div>
            )}
          </section>
          {payable && canPay && i.card_payment?.available ? <CardPayBox invoice={i} /> : null}
          {payable && canPay ? <VoucherForm invoice={i} onSent={res.reload} /> : null}
          {payable && !canPay ? <div className="note">Su usuario no puede reportar pagos; pida al administrador de su cuenta que lo haga.</div> : null}
        </>
      ) : res.loading ? (
        <p className="sub">Cargando…</p>
      ) : null}
    </div>
  );
}

/* ---------- Pago con tarjeta (Mercado Pago Checkout Pro) ---------- */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Retorno desde Mercado Pago: ?card_return=<intento>&payment_id=… (MP envía "null" si no hubo pago). */
function readCardReturn(): { checkout: string; paymentId: string | null } | null {
  const q = new URLSearchParams(window.location.search);
  const checkout = q.get('card_return') ?? '';
  if (!UUID_RE.test(checkout)) return null;
  const raw = q.get('payment_id') ?? q.get('collection_id') ?? '';
  return { checkout, paymentId: /^\d{1,20}$/.test(raw) ? raw : null };
}

function CardPayBox({ invoice }: { invoice: Invoice }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const pay = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const c = await hub.billing.portalStartCardPayment(invoice.id, newIdempotencyKey());
      if (!c.redirect_url) throw new Error('Mercado Pago no devolvió el enlace de pago.');
      window.location.assign(c.redirect_url);
    } catch (e) {
      setMsg(errorText(e));
      setBusy(false);
    }
  };
  return (
    <section className="card">
      <div className="card-h">
        <h2>Pagar con tarjeta</h2>
      </div>
      <div className="card-b" style={{ display: 'grid', gap: 12 }}>
        <p className="sub">
          Pague el saldo de {money(invoice.balance_minor, invoice.currency)} con tarjeta de crédito o débito en el formulario seguro de Mercado Pago. No guardamos los datos de su tarjeta.
        </p>
        {msg ? (
          <div className="alert warn" role="alert">
            {msg}
          </div>
        ) : null}
        <div>
          <button type="button" className="btn primary" disabled={busy} onClick={() => void pay()}>
            {busy ? 'Redirigiendo a Mercado Pago…' : 'Pagar con tarjeta'}
          </button>
        </div>
      </div>
    </section>
  );
}

const CARD_RESULT: Record<CardCheckout['status'], { title: string; text: string; tone: string }> = {
  approved: { title: 'Pago aprobado', text: 'Registramos su pago y el comprobante quedó actualizado.', tone: 'info' },
  pending: { title: 'Pago en proceso', text: 'Mercado Pago aún está procesando el pago. Le avisaremos cuando se confirme; no vuelva a pagar.', tone: 'warn' },
  declined: { title: 'Pago rechazado', text: 'El saldo del comprobante no cambió.', tone: 'danger' },
  created: { title: 'Pago no completado', text: 'No se realizó ningún cobro. Puede intentarlo de nuevo.', tone: 'warn' },
  expired: { title: 'Intento vencido', text: 'El enlace de pago venció. Puede generar uno nuevo desde el comprobante.', tone: 'warn' },
  cancelled: { title: 'Pago cancelado', text: 'No se realizó ningún cobro.', tone: 'warn' },
};

function CardReturnPage({ checkoutId, paymentId, close }: { checkoutId: string; paymentId: string | null; close: (invoiceId: string | null) => void }) {
  const res = useLoad(() => hub.billing.portalConfirmCardPayment(checkoutId, paymentId), [checkoutId, paymentId]);
  const c = res.data;
  const r = c ? CARD_RESULT[c.status] : null;
  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <Head title="Pago con tarjeta" lead="Resultado del pago en Mercado Pago" />
      {res.error ? <Failed error={res.error} onRetry={res.reload} /> : null}
      {res.loading && !c ? <p className="sub">Confirmando el pago con Mercado Pago…</p> : null}
      {c && r ? (
        <section className="card">
          <div className="card-b" style={{ display: 'grid', gap: 12 }}>
            <div className={`alert ${r.tone}`} role="status">
              <b>{r.title}.</b> {r.text}
              {c.message ? <div>{c.message}</div> : null}
            </div>
            <dl className="kv">
              <dt>Importe</dt>
              <dd className="num">{money(c.amount_minor, c.currency)}</dd>
              {c.surcharge_minor > 0 ? (
                <>
                  <dt>Incluye comisión</dt>
                  <dd className="num">{money(c.surcharge_minor, c.currency)}</dd>
                </>
              ) : null}
            </dl>
            <span style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn primary" onClick={() => close(c.invoice_id)}>
                Ver comprobante
              </button>
              {c.status === 'pending' ? (
                <button type="button" className="btn" onClick={res.reload}>
                  Actualizar estado
                </button>
              ) : null}
            </span>
          </div>
        </section>
      ) : null}
      {res.error ? (
        <div>
          <button type="button" className="btn" onClick={() => close(null)}>
            Ir al inicio
          </button>
        </div>
      ) : null}
    </div>
  );
}

const ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp';
const MAX_BYTES = 5 * 1024 * 1024;

function VoucherForm({ invoice, onSent }: { invoice: Invoice; onSent: () => void }) {
  const methods = useLoad(() => hub.billing.portalPaymentMethods(), []);
  const list: PaymentMethodOption[] = methods.data ?? [];
  const [method, setMethod] = useState('');
  const [amount, setAmount] = useState(minorToInput(invoice.balance_minor));
  const [date, setDate] = useState(todayIso());
  const [ref, setRef] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const key = useRef(newIdempotencyKey());
  const [progress, setProgress] = useState<number | null>(null);

  useEffect(() => {
    if (!method && list.length) setMethod(list.find((m) => m.kind === 'bank_transfer')?.id ?? list[0].id);
  }, [list, method]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const minor = parseMinor(amount);
    const local: Record<string, string> = {};
    if (!method) local.payment_method_id = 'Elija cómo pagó.';
    if (!minor) local.amount_minor = 'Indique el importe pagado (p. ej. 150.00).';
    if (!file) local.file = 'Adjunte la constancia (PDF o imagen).';
    else if (file.size > MAX_BYTES) local.file = 'El archivo supera 5 MB.';
    else if (!ACCEPT.split(',').includes(file.type)) local.file = 'Formato no admitido: use PDF, JPG, PNG o WEBP.';
    setErrs(local);
    if (Object.keys(local).length || !file || !minor) return;
    setBusy(true);
    setMsg(null);
    setProgress(0);
    try {
      await hub.billing.portalSubmitVoucher(invoice.id, { payment_method_id: method, amount_minor: minor, received_at: date, external_id: ref.trim() || undefined, file }, key.current, setProgress);
      key.current = newIdempotencyKey();
      setDone(true);
      onSent();
    } catch (err) {
      if (isProblem(err) && err.status >= 400 && err.status < 500) key.current = newIdempotencyKey();
      if (isProblem(err)) {
        const fe: Record<string, string> = {};
        for (const [k, v] of Object.entries(err.errors)) if (v[0]) fe[k] = v[0];
        setErrs(fe);
      }
      setMsg(errorText(err));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  if (done) {
    return (
      <section className="card">
        <div className="card-b">
          <div className="alert info" role="status">
            Recibimos su constancia. Finanzas la revisará contra el banco; verá el resultado en «Historial de pagos y vouchers».
          </div>
          <button type="button" className="btn sm" style={{ marginTop: 8 }} onClick={() => setDone(false)}>
            Enviar otra constancia
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="card">
      <div className="card-h">
        <h2>Reportar pago con constancia</h2>
      </div>
      <form className="card-b" onSubmit={(e) => void submit(e)} noValidate>
        <p className="sub" style={{ marginTop: 0 }}>
          Transfiera o deposite el saldo y adjunte la constancia. El pago con tarjeta en línea estará disponible próximamente.
        </p>
        <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
          <label className="field">
            Medio de pago *
            <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
              {list.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            {errs.payment_method_id ? <span className="err">{errs.payment_method_id}</span> : null}
          </label>
          <label className="field">
            Importe pagado ({invoice.currency}) *
            <input className="input num" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            {errs.amount_minor ? <span className="err">{errs.amount_minor}</span> : null}
          </label>
          <label className="field">
            Fecha del pago
            <input className="input" type="date" max={todayIso()} value={date} onChange={(e) => setDate(e.target.value)} />
            {errs.received_at ? <span className="err">{errs.received_at}</span> : null}
          </label>
          <label className="field">
            N.º de operación
            <input className="input" maxLength={120} value={ref} onChange={(e) => setRef(e.target.value)} />
            {errs.external_id ? <span className="err">{errs.external_id}</span> : null}
          </label>
          <label className="field" style={{ gridColumn: '1 / -1' }}>
            Constancia (PDF, JPG, PNG o WEBP; máx. 5 MB) *
            <input className="input" type="file" accept={ACCEPT} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            {errs.file ? <span className="err">{errs.file}</span> : null}
          </label>
        </div>
        {msg ? (
          <div className="err" role="alert" style={{ marginTop: 8 }}>
            {msg}
          </div>
        ) : null}
        {progress !== null ? (
          <div style={{ marginTop: 10 }} role="status" aria-live="polite">
            <progress value={Math.round(progress * 100)} max={100} style={{ width: '100%' }} aria-label="Avance de la subida" />
            <span className="sub">{progress < 1 ? `Subiendo constancia… ${Math.round(progress * 100)} %` : 'Procesando…'}</span>
          </div>
        ) : null}
        <button type="submit" className="btn primary" style={{ marginTop: 12 }} disabled={busy}>
          {busy ? (progress !== null && progress < 1 ? `Subiendo ${Math.round(progress * 100)} %` : 'Enviando…') : 'Enviar constancia'}
        </button>
      </form>
    </section>
  );
}

/* ---------- P-PRT-09 Pagos y vouchers ---------- */
function PaymentsPage() {
  const [cursor, setCursor] = useState<string | null>(null);
  const res = useLoad(() => hub.billing.portalPayments({ cursor, size: 25 }), [cursor]);
  const rows: Payment[] = res.data?.data ?? [];
  const meta = res.data?.meta;
  const [msg, setMsg] = useState<string | null>(null);
  const proof = async (p: Payment) => {
    try {
      download(await hub.billing.portalPaymentProof(p.id), `constancia-${p.id.slice(0, 8)}`);
    } catch (e) {
      setMsg(errorText(e));
    }
  };
  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <Head title="Pagos y vouchers" lead="Estado de los pagos y constancias que envió." />
      {msg ? (
        <div className="alert warn" role="alert">
          {msg}
        </div>
      ) : null}
      <section className="card">
        {res.error ? (
          <div className="card-b">
            <Failed error={res.error} onRetry={res.reload} />
          </div>
        ) : res.loading ? (
          <div className="card-b sub">Cargando…</div>
        ) : !rows.length ? (
          <div className="card-b empty">Sin pagos registrados.</div>
        ) : (
          <div className="tw">
            <table className="t">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Medio</th>
                  <th>Comprobantes</th>
                  <th>Estado</th>
                  <th className="r">Importe</th>
                  <th className="r">Constancia</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td>{fDate(p.received_at)}</td>
                    <td>
                      {p.payment_method?.name ?? '—'}
                      {p.external_id ? <div className="sub mono">{p.external_id}</div> : null}
                    </td>
                    <td className="mono">{p.allocations.map((a) => a.invoice_number).filter(Boolean).join(', ') || '—'}</td>
                    <td>
                      <span className={`chip ${PAY_CHIP(p)}`}>{p.status === 'reported' ? 'Pendiente de validación' : paymentStatusLabel(p)}</span>
                      {p.rejection_reason ? <div className="sub">Motivo: {p.rejection_reason}</div> : null}
                    </td>
                    <td className="r num">{money(p.amount_minor, p.currency)}</td>
                    <td className="r">
                      {p.has_proof ? (
                        <button type="button" className="btn sm" onClick={() => void proof(p)}>
                          Ver
                        </button>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="card-b" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn sm" disabled={res.loading || !meta?.prev_cursor} onClick={() => setCursor(meta?.prev_cursor ?? null)}>
            Anterior
          </button>
          <button type="button" className="btn sm" disabled={res.loading || !meta?.next_cursor} onClick={() => setCursor(meta?.next_cursor ?? null)}>
            Siguiente
          </button>
        </div>
      </section>
    </div>
  );
}

/* ---------- P-PRT-14 Datos de facturación (lectura; /portal/account) ---------- */
interface PortalAccount {
  code: string;
  legal_name: string;
  trade_name: string | null;
  tax_id_type: string | null;
  tax_id: string | null;
  country: string;
  currency: string;
  email: string | null;
  phone: string | null;
  address: string | null;
}

function BillingProfilePage() {
  const res = useLoad(() => hub.http.get<{ data: PortalAccount }>('/api/v1/portal/account').then((r) => r.data), []);
  const a = res.data;
  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <Head title="Datos de facturación" lead="Datos con los que se emiten sus comprobantes. Los cambios aplican a comprobantes futuros." />
      {res.error ? <Failed error={res.error} onRetry={res.reload} /> : null}
      {a ? (
        <section className="card">
          <div className="card-b">
            <dl className="kv">
              <dt>Razón social</dt>
              <dd>{a.legal_name}</dd>
              <dt>Nombre comercial</dt>
              <dd>{a.trade_name ?? '—'}</dd>
              <dt>Documento</dt>
              <dd className="mono">{a.tax_id ? `${(a.tax_id_type ?? '').toUpperCase()} ${a.tax_id}` : '—'}</dd>
              <dt>Dirección fiscal</dt>
              <dd>{a.address ?? '—'}</dd>
              <dt>Correo de facturación</dt>
              <dd>{a.email ?? '—'}</dd>
              <dt>Teléfono</dt>
              <dd>{a.phone ?? '—'}</dd>
              <dt>Moneda</dt>
              <dd>{a.currency}</dd>
              <dt>Código de cliente</dt>
              <dd className="mono">{a.code}</dd>
            </dl>
            <p className="sub">Para corregir estos datos escriba a soporte o pida a su ejecutivo; la edición desde el portal llega en la próxima entrega.</p>
          </div>
        </section>
      ) : res.loading ? (
        <p className="sub">Cargando…</p>
      ) : null}
    </div>
  );
}
