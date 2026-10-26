/**
 * Portal del cliente contra la API real (franja MVP; con VITE_DEMO=1 se usa el
 * mock de App.tsx). Solo datos del cliente de la sesión (el backend lo toma del
 * contacto enlazado; lo ajeno responde 404):
 *  - P-PRT-02 Resumen (/portal/summary)
 *  - P-PRT-03/04 Servicios y detalle (/portal/services)
 *  - P-PRT-07/08 Comprobantes, detalle con pagos y envío de voucher (/portal/invoices)
 *  - P-PRT-09 Pagos y vouchers (/portal/payments)
 *  - P-PRT-14 Datos de facturación (/portal/account)
 * Pago con tarjeta (D-18, Mercado Pago Checkout Pro) cuando el comprobante lo
 * ofrece (`card_payment.available`); PayPal en línea no está disponible todavía.
 * La presentación usa las piezas compartidas de components/ui (mismo diseño que
 * el portal de muestra y el admin); el armazón lo pone App via shell/PortalShell.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@hub/ui';
import {
  CYCLE_LABELS,
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
  type PlanCycle,
  type PortalSummary,
  type Service,
} from '@hub/api';
import { hub } from '../auth/client';
import { Alert, Card, CardBody, CardFoot, Chip, DetailHead, Empty, Field, FormGrid, Hello, Kpi, Kpis, Kv, Loading, Note, PageHead, Pager, Seg, Table, type Tone } from '../components/ui';

export type LiveRoute = 'resumen' | 'servicios' | 'servicio-detalle' | 'facturas' | 'pagar' | 'perfil';
export const LIVE_ROUTES: LiveRoute[] = ['resumen', 'servicios', 'servicio-detalle', 'facturas', 'pagar', 'perfil'];

const MONEY: Record<string, Intl.NumberFormat> = {
  PEN: new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }),
  USD: new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'USD' }),
};
const money = (minor: number, cur: string) => (MONEY[cur] ?? MONEY.PEN).format(minor / 100);
const cycleLabel = (cycle: string | null | undefined) => (cycle ? (CYCLE_LABELS[cycle as PlanCycle] ?? cycle) : '—');
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

const INV_CHIP: Record<string, Tone> = { issued: 'warn', partially_paid: 'warn', paid: 'ok', overdue: 'danger', void: '' };
const PAY_CHIP = (p: Pick<Payment, 'status' | 'voided'>): Tone => (p.voided ? '' : p.status === 'validated' ? 'ok' : p.status === 'reported' ? 'warn' : p.status === 'rejected' ? 'danger' : 'info');
const SRV_CHIP: Record<string, Tone> = { active: 'ok', pending: 'info', suspended: 'danger', terminated: '', cancelled: '', handed_over: '' };
const SRV_ICON: Record<string, string> = { active: 'server', pending: 'clock', suspended: 'tri', terminated: 'archive', cancelled: 'archive', handed_over: 'archive' };

const InvChip = ({ i }: { i: Pick<Invoice, 'status'> }) => <Chip tone={INV_CHIP[i.status] ?? ''}>{INVOICE_STATUS_LABELS[i.status]}</Chip>;
const SrvChip = ({ s }: { s: Pick<Service, 'status'> }) => <Chip tone={SRV_CHIP[s.status] ?? ''}>{SERVICE_STATUS_LABELS[s.status]}</Chip>;

function Failed({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <Alert
      tone="warn"
      role="alert"
      title="No se pudo cargar"
      text={errorText(error)}
      action={
        <button type="button" className="btn sm" onClick={onRetry}>
          Reintentar
        </button>
      }
    />
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

export function LivePortal({ route, go, can, userName }: { route: LiveRoute; go: (r: LiveRoute) => void; can: (perm: string) => boolean; userName: string }) {
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [cardReturn, setCardReturn] = useState(readCardReturn);
  // Al cambiar de ruta desde el menú se cierra la ficha abierta; openX marca que el cambio de ruta viene de abrir una ficha.
  const opening = useRef(false);
  useEffect(() => {
    if (opening.current) {
      opening.current = false;
      return;
    }
    setInvoiceId(null);
    setServiceId(null);
  }, [route]);
  const openService = (id: string) => {
    opening.current = route !== 'servicio-detalle';
    setServiceId(id);
    go('servicio-detalle');
  };
  const openInvoice = (id: string) => {
    opening.current = route !== 'facturas';
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
  if (route === 'resumen') return <SummaryPage openInvoice={openInvoice} go={go} userName={userName} />;
  if (route === 'servicios') return <ServicesPage openService={openService} />;
  if (route === 'servicio-detalle') return serviceId ? <ServicePage id={serviceId} back={() => go('servicios')} /> : <ServicesPage openService={openService} />;
  if (route === 'perfil') return <BillingProfilePage />;
  if (route === 'pagar') return <PaymentsPage go={go} />;
  return invoiceId ? <InvoicePage id={invoiceId} back={() => setInvoiceId(null)} canPay={can('portal.payment.create')} /> : <InvoicesPage openInvoice={setInvoiceId} go={go} />;
}

/* ---------- P-PRT-02 Resumen ---------- */
function SummaryPage({ openInvoice, go, userName }: { openInvoice: (id: string) => void; go: (r: LiveRoute) => void; userName: string }) {
  const res = useLoad(() => hub.billing.portalSummary(), []);
  const s: PortalSummary | null = res.data;
  const debt = s?.debt ?? [];
  const hasDebt = debt.some((d) => d.balance_minor > 0);
  const overdue = debt.filter((d) => d.overdue_minor > 0);
  const fmtDebt = (key: 'balance_minor' | 'overdue_minor') => debt.filter((d) => d[key] > 0).map((d) => money(d[key], d.currency)).join(' + ');
  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <Hello
        title={`Hola, ${userName.split(' ')[0]}`}
        text="Este es el estado de sus servicios, vencimientos y saldo pendiente al día de hoy."
        actions={
          <>
            {hasDebt ? (
              <button className="btn primary" onClick={() => go('facturas')}>
                <Icon name="card" /> Pagar pendientes ({fmtDebt('balance_minor')})
              </button>
            ) : null}
            <button className="btn" onClick={() => go('pagar')}>
              <Icon name="receipt" /> Pagos y vouchers
            </button>
          </>
        }
      />
      {res.error ? <Failed error={res.error} onRetry={res.reload} /> : null}
      {res.loading && !s ? <Loading /> : null}
      {s ? (
        <>
          {overdue.length ? (
            <Alert
              tone="danger"
              icon="receipt"
              title={`Tiene saldo vencido por ${fmtDebt('overdue_minor')}`}
              text="Regularice el pago para evitar interrupciones en el servicio."
              action={
                <button className="btn sm primary" onClick={() => go('facturas')}>
                  Pagar ahora
                </button>
              }
            />
          ) : null}
          {s.services.suspended ? (
            <Alert
              tone="warn"
              icon="tri"
              title={`${s.services.suspended} servicio(s) suspendido(s)`}
              text="Revise sus comprobantes pendientes o escriba a soporte para reactivarlos."
              action={
                <button className="btn sm" onClick={() => go('servicios')}>
                  Ver servicios
                </button>
              }
            />
          ) : null}

          <Kpis>
            <Kpi
              label="Servicios activos"
              icon="server"
              tone="ok"
              value={s.services.active}
              meta={`${s.services.suspended ? `${s.services.suspended} suspendido(s)` : 'Ninguno suspendido'}${s.services.pending ? ` · ${s.services.pending} en preparación` : ''}`}
              metaColor={s.services.suspended ? 'var(--warn-text)' : 'var(--ok-text)'}
              onClick={() => go('servicios')}
            />
            <Kpi
              label="Saldo pendiente"
              icon="wallet"
              tone="warn"
              value={hasDebt ? fmtDebt('balance_minor') : money(0, 'PEN')}
              meta={overdue.length ? `Vencido: ${fmtDebt('overdue_minor')}` : 'Sin deuda vencida'}
              metaColor={overdue.length ? 'var(--danger-text)' : 'var(--muted)'}
              onClick={() => go('facturas')}
            />
            <Kpi label="Vouchers en revisión" icon="receipt" value={s.pending_vouchers} meta="Finanzas los valida contra el banco" onClick={() => go('pagar')} />
            <Kpi label="Próximos vencimientos" icon="clock" value={s.upcoming_invoices.length} meta={s.upcoming_invoices.length ? 'Comprobantes por vencer' : 'Nada por vencer'} onClick={() => go('facturas')} />
          </Kpis>

          <Card
            title="Próximos vencimientos"
            icon="receipt"
            actions={
              <button type="button" className="btn sm ghost" onClick={() => go('facturas')}>
                Ver comprobantes →
              </button>
            }
          >
            {s.upcoming_invoices.length ? (
              <Table cols={[{ label: 'Comprobante' }, { label: 'Vence' }, { label: 'Estado' }, { label: 'Saldo', right: true }, { label: 'Acción', right: true }]}>
                {s.upcoming_invoices.map((i) => (
                  <tr key={i.id}>
                    <td className="nw mono" style={{ fontWeight: 700 }}>
                      {i.number}
                    </td>
                    <td className="num">{fDate(i.due_date)}</td>
                    <td>
                      <InvChip i={i} />
                    </td>
                    <td className="r num" style={{ fontWeight: 700 }}>
                      {money(i.balance_minor, i.currency)}
                    </td>
                    <td className="r">
                      <button type="button" className="btn sm primary" onClick={() => openInvoice(i.id)}>
                        Ver y pagar
                      </button>
                    </td>
                  </tr>
                ))}
              </Table>
            ) : (
              <Empty icon="check">
                <b>Está al día</b>
                No tiene comprobantes pendientes.
              </Empty>
            )}
          </Card>
        </>
      ) : null}
    </div>
  );
}

/* ---------- P-PRT-03 / 04 Servicios ---------- */
function ServicesPage({ openService }: { openService: (id: string) => void }) {
  const res = useLoad(() => hub.services.portalList({ size: 100 }), []);
  const rows: Service[] = res.data?.data ?? [];
  const alerts = rows.filter((s) => s.status === 'suspended').length;
  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <PageHead title="Mis servicios contratados" lead={res.data ? (alerts ? `${alerts} servicio(s) requiere(n) atención.` : 'Lo que tiene contratado, con su estado y vencimiento.') : 'Lo que tiene contratado, con su estado y vencimiento.'} />
      {res.error ? <Failed error={res.error} onRetry={res.reload} /> : null}
      <Card title="Servicios" icon="server" sub={res.data ? `${rows.length} servicio(s)` : undefined}>
        {res.loading ? (
          <Loading inCard />
        ) : !rows.length ? (
          <Empty icon="server">
            <b>Sin servicios</b>
            Aún no hay servicios registrados en su cuenta.
          </Empty>
        ) : (
          <Table cols={[{ label: 'Servicio' }, { label: 'Plan' }, { label: 'Ciclo' }, { label: 'Estado' }, { label: 'Vencimiento' }, { label: 'Renovación' }, { label: 'Acción', right: true }]}>
            {rows.map((s) => (
              <tr key={s.id}>
                <td>
                  <b style={{ display: 'block', fontSize: 13.5 }}>{s.label}</b>
                  <small className="sub mono">{s.code}</small>
                </td>
                <td>{s.plan?.name ?? s.product?.name ?? '—'}</td>
                <td>{cycleLabel(s.cycle)}</td>
                <td>
                  <SrvChip s={s} />
                </td>
                <td className="num">{fDate(s.commercial_due_date)}</td>
                <td>{s.auto_renew ? 'Automática' : 'Manual'}</td>
                <td className="r nw">
                  <button type="button" className="btn sm primary" onClick={() => openService(s.id)}>
                    Detalles
                  </button>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}

function ServicePage({ id, back }: { id: string; back: () => void }) {
  const res = useLoad(() => hub.services.portalGet(id), [id]);
  const s = res.data;
  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <DetailHead
        icon={s ? (SRV_ICON[s.status] ?? 'server') : 'server'}
        title={s?.label ?? 'Detalle de servicio'}
        text={s ? `${s.product?.name ?? ''}${s.plan ? ` · ${s.plan.name}` : ''} · ${cycleLabel(s.cycle)}` : undefined}
        chip={s ? <SrvChip s={s} /> : undefined}
        actions={
          <button type="button" className="btn ghost" onClick={back}>
            ← Volver a servicios
          </button>
        }
      />
      {res.error ? <Failed error={res.error} onRetry={res.reload} /> : null}
      {s ? (
        <div className="detail">
          <div className="stack" style={{ display: 'grid', gap: 16 }}>
            <Card title="Datos del servicio" icon="sliders">
              <CardBody style={{ padding: '14px 18px' }}>
                <Kv
                  cols="150px 1fr"
                  rows={[
                    ['Estado', <SrvChip s={s} />],
                    ['Código', <span className="mono">{s.code}</span>],
                    ['Producto', s.product?.name ?? '—'],
                    ['Plan', s.plan?.name ?? '—'],
                    ['Ciclo', cycleLabel(s.cycle)],
                  ]}
                />
              </CardBody>
            </Card>
          </div>
          <div className="stack" style={{ display: 'grid', gap: 16 }}>
            <Card title="Tu plan" icon="receipt">
              <CardBody style={{ padding: '14px 18px' }}>
                <Kv
                  rows={[
                    ['Precio', <span className="num" style={{ color: 'var(--brand-text)' }}>{s.price.unit_price_minor !== null && s.price.currency ? `${money(s.price.unit_price_minor, s.price.currency)} × ${Number(s.price.quantity)}` : '—'}</span>],
                    ['Inicio', <span className="num">{fDate(s.starts_on)}</span>],
                    ['Vencimiento comercial', <span className="num">{fDate(s.commercial_due_date)}</span>],
                    ['Próxima factura', <span className="num">{fDate(s.subscription?.next_invoice_date ?? null)}</span>],
                    ['Renovación automática', s.auto_renew ? 'Sí' : 'No'],
                  ]}
                />
              </CardBody>
            </Card>
          </div>
        </div>
      ) : res.loading ? (
        <Loading />
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
      <PageHead
        title="Facturas y pagos"
        lead="Descargue sus comprobantes, pague con tarjeta o envíe la constancia de su transferencia o depósito."
        actions={
          <button type="button" className="btn" onClick={() => go('pagar')}>
            <Icon name="receipt" className="sm" /> Historial de pagos y vouchers
          </button>
        }
      />
      <Card>
        <div className="toolbar" style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <Seg
            label="Filtrar comprobantes"
            value={filter}
            options={[
              { id: 'pend', label: 'Por pagar' },
              { id: 'all', label: 'Todos' },
            ]}
            onChange={(f) => {
              setFilter(f);
              setCursor(null);
            }}
          />
        </div>
        {res.error ? (
          <CardBody>
            <Failed error={res.error} onRetry={res.reload} />
          </CardBody>
        ) : res.loading ? (
          <Loading inCard />
        ) : !rows.length ? (
          <Empty icon="receipt">
            <b>{filter === 'pend' ? 'Está al día' : 'Sin comprobantes'}</b>
            {filter === 'pend' ? 'No tiene comprobantes pendientes.' : 'No tiene comprobantes.'}
          </Empty>
        ) : (
          <Table cols={[{ label: 'Comprobante' }, { label: 'Emisión' }, { label: 'Vence' }, { label: 'Total', right: true }, { label: 'Saldo', right: true }, { label: 'Estado' }, { label: 'Acción', right: true }]}>
            {rows.map((i) => (
              <tr key={i.id}>
                <td className="nw">
                  <span className="mono" style={{ fontWeight: 700 }}>
                    {i.number}
                  </span>
                  <div className="sub">{INVOICE_TYPE_LABELS[i.type]}</div>
                </td>
                <td className="num">{fDate(i.issue_date)}</td>
                <td className="num">{fDate(i.due_date)}</td>
                <td className="r num">{money(i.total_minor, i.currency)}</td>
                <td className="r num" style={{ fontWeight: 700 }}>
                  {money(i.balance_minor, i.currency)}
                </td>
                <td>
                  <InvChip i={i} />
                </td>
                <td className="r nw">
                  <button type="button" className={`btn sm${i.balance_minor > 0 ? ' primary' : ' ghost'}`} onClick={() => openInvoice(i.id)}>
                    {i.balance_minor > 0 ? 'Ver y pagar' : 'Ver'}
                  </button>
                </td>
              </tr>
            ))}
          </Table>
        )}
        <Pager loading={res.loading} prev={meta?.prev_cursor} next={meta?.next_cursor} onPrev={() => setCursor(meta?.prev_cursor ?? null)} onNext={() => setCursor(meta?.next_cursor ?? null)} />
      </Card>
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
      <PageHead
        back={{ label: 'Volver a Facturas y pagos', onClick: back }}
        title={i ? `${INVOICE_TYPE_LABELS[i.type]} ${i.number ?? ''}` : 'Comprobante'}
        lead={i ? `Emitido el ${fDate(i.issue_date)} · vence el ${fDate(i.due_date)}` : undefined}
        actions={
          i ? (
            <button type="button" className="btn" onClick={() => void doc()}>
              <Icon name="file" className="sm" /> Descargar
            </button>
          ) : null
        }
      />
      {res.error ? <Failed error={res.error} onRetry={res.reload} /> : null}
      {msg ? <Alert tone="warn" role="alert" title={msg} /> : null}
      {i ? (
        <>
          <div className="detail">
            <div className="stack" style={{ display: 'grid', gap: 16 }}>
              <Card
                title="Detalle del comprobante"
                icon="receipt"
                actions={
                  <span style={{ display: 'inline-flex', gap: 6 }}>
                    <InvChip i={i} />
                    <Chip outline>{FISCAL_STATUS_LABELS[i.fiscal_status]}</Chip>
                  </span>
                }
              >
                <Table cols={[{ label: 'Descripción' }, { label: 'Cant.', right: true }, { label: 'Total', right: true }]}>
                  {(i.items ?? []).map((l) => (
                    <tr key={l.id}>
                      <td>
                        {l.description}
                        {l.period_start ? (
                          <div className="sub">
                            Periodo {fDate(l.period_start)} – {fDate(l.period_end)}
                          </div>
                        ) : null}
                      </td>
                      <td className="r num">{Number(l.quantity).toLocaleString('es-PE')}</td>
                      <td className="r num">{money(l.total_minor, i.currency)}</td>
                    </tr>
                  ))}
                </Table>
              </Card>
              <Card title="Pagos de este comprobante" icon="wallet">
                {i.payments?.length ? (
                  <Table cols={[{ label: 'Fecha' }, { label: 'Medio' }, { label: 'Operación' }, { label: 'Estado' }, { label: 'Importe aplicado', right: true }]}>
                    {i.payments.map((p) => (
                      <tr key={p.payment_id}>
                        <td className="num">{fDate(p.received_at)}</td>
                        <td>{p.method ?? '—'}</td>
                        <td className="mono">{p.external_id ?? '—'}</td>
                        <td>
                          <Chip tone={PAY_CHIP(p)}>{paymentStatusLabel(p)}</Chip>
                        </td>
                        <td className="r num">{money(p.amount_minor, i.currency)}</td>
                      </tr>
                    ))}
                  </Table>
                ) : (
                  <Empty>Aún no hay pagos registrados para este comprobante.</Empty>
                )}
              </Card>
            </div>
            <div className="stack" style={{ display: 'grid', gap: 16 }}>
              <aside className="card sumbox">
                <h2 className="sec">Resumen</h2>
                <div className="ln">
                  <span>Subtotal</span>
                  <span className="num">{money(i.subtotal_minor, i.currency)}</span>
                </div>
                <div className="ln">
                  <span>IGV</span>
                  <span className="num">{money(i.tax_minor, i.currency)}</span>
                </div>
                <div className="ln">
                  <span>Total</span>
                  <span className="num">{money(i.total_minor, i.currency)}</span>
                </div>
                <div className="ln tot">
                  <span>Saldo pendiente</span>
                  <span className="num">{money(i.balance_minor, i.currency)}</span>
                </div>
              </aside>
              {payable && canPay && i.card_payment?.available ? <CardPayBox invoice={i} /> : null}
              {payable && !canPay ? <Note tone="warn">Su usuario no puede reportar pagos; pida al administrador de su cuenta que lo haga.</Note> : null}
            </div>
          </div>
          {payable && canPay ? <VoucherForm invoice={i} onSent={res.reload} /> : null}
        </>
      ) : res.loading ? (
        <Loading />
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
    <Card title="Pagar con tarjeta" icon="card">
      <CardBody style={{ display: 'grid', gap: 12 }}>
        <p className="sub" style={{ margin: 0, color: 'var(--muted)', fontSize: 13 }}>
          Pague el saldo de <b>{money(invoice.balance_minor, invoice.currency)}</b> con tarjeta de crédito o débito en el formulario seguro de Mercado Pago. No guardamos los datos de su tarjeta.
        </p>
        {msg ? <Alert tone="warn" role="alert" title={msg} /> : null}
        <div className="gw" style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, color: 'var(--muted)' }}>
          <Icon name="lock" className="sm" />
          <span>Pasarela de pago segura y cifrada.</span>
        </div>
        <div>
          <button type="button" className="btn primary" disabled={busy} onClick={() => void pay()}>
            <Icon name="card" className="sm" /> {busy ? 'Redirigiendo a Mercado Pago…' : 'Pagar con tarjeta'}
          </button>
        </div>
      </CardBody>
    </Card>
  );
}

const CARD_RESULT: Record<CardCheckout['status'], { title: string; text: string; tone: Tone; icon: string }> = {
  approved: { title: 'Pago aprobado', text: 'Registramos su pago y el comprobante quedó actualizado.', tone: 'info', icon: 'check' },
  pending: { title: 'Pago en proceso', text: 'Mercado Pago aún está procesando el pago. Le avisaremos cuando se confirme; no vuelva a pagar.', tone: 'warn', icon: 'clock' },
  declined: { title: 'Pago rechazado', text: 'El saldo del comprobante no cambió.', tone: 'danger', icon: 'oct' },
  created: { title: 'Pago no completado', text: 'No se realizó ningún cobro. Puede intentarlo de nuevo.', tone: 'warn', icon: 'tri' },
  expired: { title: 'Intento vencido', text: 'El enlace de pago venció. Puede generar uno nuevo desde el comprobante.', tone: 'warn', icon: 'clock' },
  cancelled: { title: 'Pago cancelado', text: 'No se realizó ningún cobro.', tone: 'warn', icon: 'tri' },
};

function CardReturnPage({ checkoutId, paymentId, close }: { checkoutId: string; paymentId: string | null; close: (invoiceId: string | null) => void }) {
  // La confirmación (POST, con límite de tasa) se envía una sola vez aunque el efecto corra dos veces (StrictMode);
  // «Actualizar estado» consulta el intento (GET) y «Reintentar» vuelve a confirmar.
  const confirm = useRef<Promise<CardCheckout> | null>(null);
  const res = useLoad(() => (confirm.current ??= hub.billing.portalConfirmCardPayment(checkoutId, paymentId)), [checkoutId, paymentId]);
  const retry = () => {
    confirm.current = null;
    res.reload();
  };
  const refresh = () => {
    confirm.current = hub.billing.portalCardPayment(checkoutId);
    res.reload();
  };
  const c = res.data;
  const r = c ? CARD_RESULT[c.status] : null;
  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <PageHead title="Pago con tarjeta" lead="Resultado del pago en Mercado Pago" />
      {res.error ? <Failed error={res.error} onRetry={retry} /> : null}
      {res.loading && !c ? <Loading text="Confirmando el pago con Mercado Pago…" /> : null}
      {c && r ? (
        <Card title={r.title} icon="card">
          <CardBody style={{ display: 'grid', gap: 12 }}>
            <Alert tone={r.tone} icon={r.icon} title={r.title} text={`${r.text}${c.message ? ` ${c.message}` : ''}`} />
            <Kv rows={[['Importe', <span className="num">{money(c.amount_minor, c.currency)}</span>], c.surcharge_minor > 0 ? ['Incluye comisión', <span className="num">{money(c.surcharge_minor, c.currency)}</span>] : null]} />
            <span style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn primary" onClick={() => close(c.invoice_id)}>
                Ver comprobante
              </button>
              {c.status === 'pending' ? (
                <button type="button" className="btn" onClick={refresh}>
                  Actualizar estado
                </button>
              ) : null}
            </span>
          </CardBody>
        </Card>
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
      <Card title="Reportar pago con constancia" icon="file">
        <CardBody style={{ display: 'grid', gap: 10 }}>
          <Alert tone="info" icon="check" title="Recibimos su constancia" text="Finanzas la revisará contra el banco; verá el resultado en «Pagos y vouchers»." />
          <div>
            <button type="button" className="btn sm" onClick={() => setDone(false)}>
              Enviar otra constancia
            </button>
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card title="Reportar pago con constancia" icon="file">
      <form className="card-b" onSubmit={(e) => void submit(e)} noValidate>
        <p className="sub" style={{ marginTop: 0, color: 'var(--muted)', fontSize: 13 }}>
          Transfiera o deposite el saldo y adjunte la constancia.{invoice.card_payment?.available ? ' Si prefiere, pague con tarjeta más arriba.' : ' El pago con tarjeta en línea estará disponible próximamente.'}
        </p>
        <FormGrid>
          <Field label="Medio de pago *" error={errs.payment_method_id}>
            <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
              {list.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={`Importe pagado (${invoice.currency}) *`} error={errs.amount_minor}>
            <input className="input num" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Fecha del pago" error={errs.received_at}>
            <input className="input" type="date" max={todayIso()} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="N.º de operación" error={errs.external_id}>
            <input className="input" maxLength={120} value={ref} onChange={(e) => setRef(e.target.value)} />
          </Field>
          <Field label="Constancia (PDF, JPG, PNG o WEBP; máx. 5 MB) *" error={errs.file} style={{ gridColumn: '1 / -1' }}>
            <input className="input" type="file" accept={ACCEPT} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </Field>
        </FormGrid>
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
          <Icon name="file" className="sm" /> {busy ? (progress !== null && progress < 1 ? `Subiendo ${Math.round(progress * 100)} %` : 'Enviando…') : 'Enviar constancia'}
        </button>
      </form>
    </Card>
  );
}

/* ---------- P-PRT-09 Pagos y vouchers ---------- */
function PaymentsPage({ go }: { go: (r: LiveRoute) => void }) {
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
      <PageHead back={{ label: 'Volver a Facturas y pagos', onClick: () => go('facturas') }} title="Pagos y vouchers" lead="Estado de los pagos y constancias que envió." />
      {msg ? <Alert tone="warn" role="alert" title={msg} /> : null}
      <Card title="Historial de pagos" icon="wallet">
        {res.error ? (
          <CardBody>
            <Failed error={res.error} onRetry={res.reload} />
          </CardBody>
        ) : res.loading ? (
          <Loading inCard />
        ) : !rows.length ? (
          <Empty icon="wallet">
            <b>Sin pagos</b>
            Sin pagos registrados.
          </Empty>
        ) : (
          <Table cols={[{ label: 'Fecha' }, { label: 'Medio' }, { label: 'Comprobantes' }, { label: 'Estado' }, { label: 'Importe', right: true }, { label: 'Constancia', right: true }]}>
            {rows.map((p) => (
              <tr key={p.id}>
                <td className="num">{fDate(p.received_at)}</td>
                <td>
                  {p.payment_method?.name ?? '—'}
                  {p.external_id ? <div className="sub mono">{p.external_id}</div> : null}
                </td>
                <td className="mono">{p.allocations.map((a) => a.invoice_number).filter(Boolean).join(', ') || '—'}</td>
                <td>
                  <Chip tone={PAY_CHIP(p)}>{p.status === 'reported' ? 'Pendiente de validación' : paymentStatusLabel(p)}</Chip>
                  {p.rejection_reason ? <div className="sub">Motivo: {p.rejection_reason}</div> : null}
                </td>
                <td className="r num" style={{ fontWeight: 700 }}>
                  {money(p.amount_minor, p.currency)}
                </td>
                <td className="r nw">
                  {p.has_proof ? (
                    <button type="button" className="btn sm ghost" onClick={() => void proof(p)}>
                      Ver
                    </button>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
        <Pager loading={res.loading} prev={meta?.prev_cursor} next={meta?.next_cursor} onPrev={() => setCursor(meta?.prev_cursor ?? null)} onNext={() => setCursor(meta?.next_cursor ?? null)} />
      </Card>
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
      <PageHead title="Datos de facturación fiscal" lead="Datos con los que se emiten sus comprobantes. Los cambios aplican a comprobantes futuros." />
      {res.error ? <Failed error={res.error} onRetry={res.reload} /> : null}
      {a ? (
        <Card title="Empresa titular" icon="building" actions={<Chip outline>{a.code}</Chip>}>
          <CardBody style={{ padding: '16px 20px', display: 'grid', gap: 14 }}>
            <Kv
              cols="180px 1fr"
              rows={[
                ['Razón social', a.legal_name],
                ['Nombre comercial', a.trade_name ?? '—'],
                ['Documento', <span className="mono">{a.tax_id ? `${(a.tax_id_type ?? '').toUpperCase()} ${a.tax_id}` : '—'}</span>],
                ['Dirección fiscal', a.address ?? '—'],
                ['Correo de facturación', a.email ?? '—'],
                ['Teléfono', a.phone ?? '—'],
                ['Moneda', a.currency],
                ['Código de cliente', <span className="mono">{a.code}</span>],
              ]}
            />
            <CardFoot between>
              <small style={{ color: 'var(--muted)' }}>Para corregir estos datos escriba a soporte o pida a su ejecutivo; la edición desde el portal llega en la próxima entrega.</small>
            </CardFoot>
          </CardBody>
        </Card>
      ) : res.loading ? (
        <Loading />
      ) : null}
    </div>
  );
}
