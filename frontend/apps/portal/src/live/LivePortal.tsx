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
  type PortalCustomerInput,
  type PortalContact,
  type ContactRole,
  type ContactInput,
  type PortalConsentInput,
  type PasswordPolicy,
  type Me,
  type PortalTicket,
  type PortalTicketAttachment,
  type PortalTicketStatus,
  type PortalTicketType,
  type PortalTicketPriority,
  type PortalComplaint,
  type PortalComplaintInput,
  type PortalComplaintStatus,
  type PortalComplaintType,
  type PortalComplaintCurrency,
  type PortalKbArticle,
  type PortalDomain,
  type PortalContract,
} from '@hub/api';
import { hub } from '../auth/client';
import { Alert, Card, CardBody, Chip, DetailHead, Empty, Field, FormGrid, Hello, Kpi, Kpis, Kv, Loading, Note, PageHead, Pager, Seg, Table, type Tone } from '../components/ui';
import { RichOut } from '../components/richOut';

export type LiveRoute = 'resumen' | 'servicios' | 'servicio-detalle' | 'facturas' | 'pagar' | 'perfil' | 'usuarios' | 'seguridad' | 'soporte' | 'ayuda' | 'ticket-detalle' | 'dominios' | 'contratos';
export const LIVE_ROUTES: LiveRoute[] = ['resumen', 'servicios', 'servicio-detalle', 'facturas', 'pagar', 'perfil', 'usuarios', 'seguridad', 'soporte', 'ayuda', 'ticket-detalle', 'dominios', 'contratos'];

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
  const [ticketId, setTicketId] = useState<string | null>(null);
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
    setTicketId(null);
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
  const openTicket = (id: string) => {
    opening.current = route !== 'ticket-detalle';
    setTicketId(id);
    go('ticket-detalle');
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
  if (route === 'soporte') return <SupportPage openTicket={openTicket} />;
  if (route === 'ayuda') return <HelpPage go={go} />;
  if (route === 'ticket-detalle') return ticketId ? <SupportTicketPage id={ticketId} back={() => go('soporte')} /> : <SupportPage openTicket={openTicket} />;
  if (route === 'perfil') return <ProfilePage />;
  if (route === 'usuarios') return <ContactsPage />;
  if (route === 'seguridad') return <SecurityPage />;
  if (route === 'pagar') return <PaymentsPage go={go} />;
  if (route === 'dominios') return <DomainsPage />;
  if (route === 'contratos') return <ContractsPage />;
  return invoiceId ? <InvoicePage id={invoiceId} back={() => setInvoiceId(null)} canPay={can('portal.payment.create')} /> : <InvoicesPage openInvoice={setInvoiceId} go={go} />;
}

/* ---------- Centro de ayuda ---------- */
function HelpPage({ go }: { go: (r: LiveRoute) => void }) {
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [articleId, setArticleId] = useState<string | null>(null);
  const res = useLoad(() => hub.support.portalKb.list({ q: q.trim() || undefined, size: 25, cursor }), [q, cursor]);
  const rows = res.data?.data ?? [];
  const meta = res.data?.meta;

  if (articleId) return <HelpArticlePage id={articleId} back={() => setArticleId(null)} />;

  return <div style={{ display: 'grid', gap: 20 }}>
    <PageHead
      title="Centro de ayuda"
      lead="Encuentre respuestas y guías para sus servicios."
      actions={<button type="button" className="btn primary" onClick={() => go('soporte')}>¿Necesitas ayuda? Abre un ticket</button>}
    />
    {res.error ? <Failed error={res.error} onRetry={res.reload} /> : null}
    <Card title="Artículos" icon="book" sub={res.data ? `${rows.length} artículo(s)` : undefined}>
      <div className="card-b" style={{ paddingBottom: 0 }}>
        <Field label="Buscar artículos">
          <input
            className="input"
            type="search"
            value={q}
            placeholder="Escriba una palabra o tema"
            onChange={(e) => { setQ(e.target.value); setCursor(null); }}
          />
        </Field>
      </div>
      {res.loading && !res.data ? <Loading inCard /> : !rows.length ? (
        <Empty icon="book"><b>Sin artículos</b>{q.trim() ? 'No encontramos artículos para esta búsqueda.' : 'Aún no hay artículos publicados.'}</Empty>
      ) : (
        <div className="card-b">
          <div className="help-grid">
            {rows.map((article) => <button key={article.id} type="button" className="help-card" onClick={() => setArticleId(article.id)}>
              <span className="hc-cat">{article.category?.name ?? 'General'}</span>
              <span className="hc-title">{article.title}</span>
              <span className="hc-meta">Actualizado {fDate(article.updated_at ?? article.published_at)}</span>
              <span className="hc-go">Leer artículo →</span>
            </button>)}
          </div>
        </div>
      )}
      <Pager loading={res.loading} prev={meta?.prev_cursor} next={meta?.next_cursor} onPrev={() => setCursor(meta?.prev_cursor ?? null)} onNext={() => setCursor(meta?.next_cursor ?? null)} />
    </Card>
  </div>;
}

function HelpArticlePage({ id, back }: { id: string; back: () => void }) {
  const res = useLoad(() => hub.support.portalKb.get(id), [id]);
  const article: PortalKbArticle | null = res.data;
  return <div style={{ display: 'grid', gap: 20 }}>
    <PageHead
      back={{ label: 'Volver al centro de ayuda', onClick: back }}
      title={article?.title ?? 'Artículo de ayuda'}
      lead={article?.category?.name ?? undefined}
      actions={<button type="button" className="btn primary" onClick={() => back()}>Ver artículos</button>}
    />
    {res.error ? <Failed error={res.error} onRetry={res.reload} /> : null}
    {res.loading && !article ? <Loading /> : null}
    {article ? <Card title={article.title} icon="book"><div className="card-b"><RichOut html={article.body ?? ''} /></div></Card> : null}
  </div>;
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
const DOMAIN_TONE: Record<PortalDomain['status'], Tone> = { active: 'ok', expired: 'danger', redemption: 'danger', pending_transfer: 'warn', transferred_out: '', not_found: '' };
const DOMAIN_LABEL: Record<PortalDomain['status'], string> = { active: 'Activo', expired: 'Vencido', redemption: 'En redención', pending_transfer: 'Transferencia pendiente', transferred_out: 'Transferido', not_found: 'No encontrado' };

function DomainsPage() {
  const res = useLoad(() => hub.domains.portalList({ size: 100 }), []);
  const rows: PortalDomain[] = res.data?.data ?? [];
  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <PageHead title="Mis dominios" lead="Tus dominios registrados y su vencimiento." />
      {res.error ? <Failed error={res.error} onRetry={res.reload} /> : null}
      <Card title="Dominios" icon="globe" sub={res.data ? `${rows.length} dominio(s)` : undefined}>
        {res.loading ? (
          <Loading inCard />
        ) : !rows.length ? (
          <Empty icon="globe">
            <b>Sin dominios</b>
            Aún no hay dominios en tu cuenta.
          </Empty>
        ) : (
          <Table cols={[{ label: 'Dominio' }, { label: 'Estado' }, { label: 'Vence' }, { label: 'Días' }, { label: 'Renovación' }]}>
            {rows.map((d) => (
              <tr key={d.id}>
                <td>
                  <b style={{ display: 'block', fontSize: 13.5 }}>{d.name}</b>
                  <small className="sub mono">.{d.tld}</small>
                </td>
                <td>
                  <Chip tone={DOMAIN_TONE[d.status]}>{DOMAIN_LABEL[d.status]}</Chip>
                </td>
                <td className="num">{fDate(d.registry_expires_at)}</td>
                <td className="num">{d.days_remaining === null ? '—' : `${d.days_remaining} d`}</td>
                <td>{d.auto_renew ? 'Automática' : 'Manual'}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}

const CONTRACT_TONE: Record<PortalContract['status'], Tone> = { draft: '', in_review: '', approved: 'info', sent: 'info', signed_active: 'ok', expired: 'warn', terminated: 'danger' };
const CONTRACT_LABEL: Record<PortalContract['status'], string> = { draft: 'Borrador', in_review: 'En revisión', approved: 'Aprobado', sent: 'Enviado', signed_active: 'Vigente', expired: 'Vencido', terminated: 'Terminado' };
const CONTRACT_KIND: Record<PortalContract['kind'], string> = { contract: 'Contrato', terms: 'Términos' };

function ContractsPage() {
  const res = useLoad(() => hub.contracts.portalList({ size: 100 }), []);
  const rows: PortalContract[] = res.data?.data ?? [];
  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <PageHead title="Mis contratos y acuerdos" lead="Tus contratos vigentes y documentos firmados." />
      {res.error ? <Failed error={res.error} onRetry={res.reload} /> : null}
      <Card title="Contratos" icon="file" sub={res.data ? `${rows.length} contrato(s)` : undefined}>
        {res.loading ? (
          <Loading inCard />
        ) : !rows.length ? (
          <Empty icon="file">
            <b>Sin contratos</b>
            Aún no tienes contratos activos.
          </Empty>
        ) : (
          <Table cols={[{ label: 'Tipo' }, { label: 'Marca' }, { label: 'Estado' }, { label: 'Desde' }, { label: 'Hasta' }, { label: 'Versión', right: true }]}>
            {rows.map((c) => (
              <tr key={c.id}>
                <td>{CONTRACT_KIND[c.kind]}</td>
                <td>{c.brand?.name ?? '—'}</td>
                <td>
                  <Chip tone={CONTRACT_TONE[c.status]}>{CONTRACT_LABEL[c.status]}</Chip>
                </td>
                <td className="num">{fDate(c.starts_on)}</td>
                <td className="num">{fDate(c.ends_on)}</td>
                <td className="r num">v{c.current_version}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}

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

/* ---------- P-PRT Soporte y tickets ---------- */
const TICKET_STATUS_LABELS: Record<PortalTicketStatus, string> = {
  new: 'Nuevo', open: 'Abierto', in_progress: 'En progreso', waiting_customer: 'Esperando tu respuesta',
  waiting_provider: 'Esperando a soporte', escalated: 'Escalado', resolved: 'Resuelto', closed: 'Cerrado', reopened: 'Reabierto',
};
const TICKET_STATUS_TONE: Record<PortalTicketStatus, Tone> = {
  new: 'info', open: 'info', in_progress: 'warn', waiting_customer: 'warn', waiting_provider: 'info', escalated: 'danger', resolved: 'ok', closed: '', reopened: 'warn',
};
const TICKET_TYPE_LABELS: Record<PortalTicketType, string> = { incident: 'Incidencia', request: 'Solicitud', question: 'Consulta', billing: 'Facturación' };
const TICKET_PRIORITY_LABELS: Record<PortalTicketPriority, string> = { critical: 'Crítica', high: 'Alta', medium: 'Media', low: 'Baja' };
const TicketStatusChip = ({ status }: { status: PortalTicketStatus }) => <Chip tone={TICKET_STATUS_TONE[status]}>{TICKET_STATUS_LABELS[status]}</Chip>;

function SupportPage({ openTicket }: { openTicket: (id: string) => void }) {
  const [section, setSection] = useState<'tickets' | 'complaints'>('tickets');
  const [complaintId, setComplaintId] = useState<string | null>(null);
  return <div style={{ display: 'grid', gap: 20 }}>
    <Seg label="Sección de soporte" value={section} onChange={(v) => { setSection(v); setComplaintId(null); }} options={[{ id: 'tickets', label: 'Tickets' }, { id: 'complaints', label: 'Reclamos' }]} />
    {section === 'tickets' ? <SupportTickets openTicket={openTicket} /> : complaintId
      ? <PortalComplaintPage id={complaintId} back={() => setComplaintId(null)} />
      : <PortalComplaintsPage openComplaint={setComplaintId} />}
  </div>;
}

function SupportTickets({ openTicket }: { openTicket: (id: string) => void }) {
  const [cursor, setCursor] = useState<string | null>(null);
  const [ticketFilter, setTicketFilter] = useState<'open' | 'closed' | 'all'>('open');
  const [creating, setCreating] = useState(false);
  const [subject, setSubject] = useState('');
  const [type, setType] = useState<PortalTicketType>('question');
  const [priority, setPriority] = useState<PortalTicketPriority | ''>('');
  const [body, setBody] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const res = useLoad(() => hub.support.portalTickets.list({ size: 25, cursor }), [cursor]);
  const rows = res.data?.data ?? [];
  const openRows = rows.filter((t) => !['resolved', 'closed'].includes(t.status));
  const closedRows = rows.filter((t) => ['resolved', 'closed'].includes(t.status));
  const visibleRows = ticketFilter === 'open' ? openRows : ticketFilter === 'closed' ? closedRows : rows;
  const meta = res.data?.meta;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg(null); setErrors({});
    try {
      const ticket = await hub.support.portalTickets.create({ subject, type, ...(priority ? { priority } : {}), ...(body.trim() ? { body: body.trim() } : {}) });
      openTicket(ticket.id);
    } catch (err) {
      if (isProblem(err) && err.status === 422) setMsg('Revise los campos indicados.');
      else if (isProblem(err) && err.status === 409) { setMsg('El ticket cambió. Recargamos la lista.'); res.reload(); }
      else setMsg(errorText(err));
      if (isProblem(err)) setErrors(Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, v[0] ?? ''])));
    } finally { setBusy(false); }
  };
  return <div style={{ display: 'grid', gap: 20 }}>
    <PageHead title="Soporte técnico" lead="Consulte sus tickets o escriba al equipo de soporte." actions={<button type="button" className="btn primary" onClick={() => { setCreating((v) => !v); setMsg(null); }}><Icon name="msg" className="sm" /> {creating ? 'Cancelar' : 'Crear ticket'}</button>} />
    {res.error ? <Failed error={res.error} onRetry={res.reload} /> : null}
    {msg ? <Alert tone="warn" role="alert" title={msg} /> : null}
    {creating ? <Card title="Nuevo ticket" icon="msg"><form className="card-b" onSubmit={(e) => void submit(e)} noValidate>
      <FormGrid>
        <Field label="Asunto *" error={errors.subject}><input className="input" maxLength={500} value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
        <Field label="Tipo" error={errors.type}><select className="input" value={type} onChange={(e) => setType(e.target.value as PortalTicketType)}>{(Object.keys(TICKET_TYPE_LABELS) as PortalTicketType[]).map((v) => <option key={v} value={v}>{TICKET_TYPE_LABELS[v]}</option>)}</select></Field>
        <Field label="Prioridad (opcional)" error={errors.priority}><select className="input" value={priority} onChange={(e) => setPriority(e.target.value as PortalTicketPriority | '')}><option value="">Sin especificar</option>{(Object.keys(TICKET_PRIORITY_LABELS) as PortalTicketPriority[]).map((v) => <option key={v} value={v}>{TICKET_PRIORITY_LABELS[v]}</option>)}</select></Field>
      </FormGrid>
      <Field label="Mensaje inicial" error={errors.body}><textarea className="input" rows={4} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
      <button className="btn primary" type="submit" disabled={busy}>{busy ? 'Creando…' : 'Crear ticket'}</button>
    </form></Card> : null}
    <Card title="Mis tickets" icon="msg">
      <div className="card-b" style={{ paddingBottom: 0 }}>
        <Seg label="Filtrar tickets" value={ticketFilter} onChange={(v) => setTicketFilter(v as typeof ticketFilter)} options={[{ id: 'open', label: `Abiertos (${openRows.length})` }, { id: 'closed', label: `Resueltos y cerrados (${closedRows.length})` }, { id: 'all', label: `Todos (${rows.length})` }]} />
      </div>
      {res.loading && !res.data ? <Loading inCard /> : !visibleRows.length ? <Empty icon="msg">{rows.length ? 'No hay tickets en esta vista.' : 'Aún no tiene tickets de soporte.'}</Empty> : <Table cols={[{ label: 'C\u00f3digo' }, { label: 'Asunto' }, { label: 'Tipo' }, { label: 'Prioridad' }, { label: '\u00daltima actividad' }, { label: 'Estado' }, { label: 'Acci\u00f3n', right: true }]}>
        {visibleRows.map((t) => <tr key={t.id}><td className="mono nw" style={{ fontWeight: 700 }}>{t.number}</td><td><b>{t.subject}</b></td><td>{TICKET_TYPE_LABELS[t.type]}</td><td><Chip tone={t.priority === 'critical' || t.priority === 'high' ? 'danger' : t.priority === 'medium' ? 'info' : ''}>{TICKET_PRIORITY_LABELS[t.priority]}</Chip></td><td className="nw">{fDate(t.updated_at)}</td><td><TicketStatusChip status={t.status} /></td><td className="r nw"><button type="button" className="btn sm primary" onClick={() => openTicket(t.id)}>Ver conversaci&#243;n &#8594;</button></td></tr>)}
      </Table>}
      <Pager loading={res.loading} prev={meta?.prev_cursor} next={meta?.next_cursor} onPrev={() => setCursor(meta?.prev_cursor ?? null)} onNext={() => setCursor(meta?.next_cursor ?? null)} />
    </Card>
  </div>;
}

function SupportTicketPage({ id, back }: { id: string; back: () => void }) {
  const res = useLoad(() => hub.support.portalTickets.get(id), [id]);
  const [body, setBody] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const ticket: PortalTicket | null = res.data;
  const formatTicketDate = (value: string) => new Date(value).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' });
  const formatFileSize = (bytes: number) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  const openAttachment = async (attachment: PortalTicketAttachment) => {
    setAttachmentError(null);
    try {
      const f = await hub.portalFiles.get(attachment.id);
      if (f.url) window.open(f.url, '_blank', 'noopener');
      else setAttachmentError('No se pudo abrir este adjunto.');
    } catch (err) { setAttachmentError(errorText(err)); }
  };
  const uploadAttachment = async (file?: File) => {
    if (!file || !ticket) return;
    setAttachmentError(null);
    if (file.size > 5 * 1024 * 1024) {
      setAttachmentError('El archivo supera el l\u00edmite de 5 MB.');
      if (fileInput.current) fileInput.current.value = '';
      return;
    }
    setUploading(true);
    try { await hub.portalFiles.upload(file, 'ticket', ticket.id); res.reload(); }
    catch (err) { setAttachmentError(errorText(err)); }
    finally { setUploading(false); if (fileInput.current) fileInput.current.value = ''; }
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg(null); setErrors({});
    try { await hub.support.portalTickets.addMessage(id, { body }); setBody(''); setMsg('Enviamos su respuesta.'); res.reload(); }
    catch (err) {
      if (isProblem(err) && err.status === 422) setMsg('Revise los campos indicados.');
      else if (isProblem(err) && err.status === 409) { setMsg('El ticket cambi\u00f3. Recargamos la conversaci\u00f3n.'); res.reload(); }
      else setMsg(errorText(err));
      if (isProblem(err)) setErrors(Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, v[0] ?? ''])));
    } finally { setBusy(false); }
  };
  return <div style={{ display: 'grid', gap: 20 }}>
    <PageHead back={{ label: 'Volver a soporte', onClick: back }} title={ticket?.subject ?? 'Ticket'} lead={ticket ? `${ticket.number} \u00b7 Creado el ${fDate(ticket.created_at)}` : undefined} actions={ticket ? <><Chip tone={ticket.priority === 'critical' || ticket.priority === 'high' ? 'danger' : 'info'}>Prioridad {TICKET_PRIORITY_LABELS[ticket.priority]}</Chip><TicketStatusChip status={ticket.status} /></> : undefined} />
    {res.error ? <Failed error={res.error} onRetry={res.reload} /> : null}
    {msg ? <Alert tone={msg.startsWith('Enviamos') ? 'info' : 'warn'} role="alert" title={msg} /> : null}
    {res.loading && !ticket ? <Loading /> : null}
    {ticket ? <div className="tk-detail">
      <div style={{ display: 'grid', gap: 16, minWidth: 0 }}>
        <Card title="Conversación" icon="msg" sub={`${ticket.messages.length} mensajes intercambiados`}>
          {ticket.messages.length ? <div className="card-b" style={{ padding: '16px 18px' }}><ul className="thread">{ticket.messages.map((m) => {
            const isCustomer = m.author !== 'Soporte';
            return <li key={m.id} className={`msg ${isCustomer ? 'cliente' : 'agente'}`}><div className="mh"><span className="av" aria-hidden="true">{isCustomer ? 'T' : <Icon name="msg" className="sm" />}</span><b>{isCustomer ? <>T&#250;</> : 'Soporte'}</b><span className={`chip ${isCustomer ? 'outline' : 'info'}`}>{isCustomer ? 'Cliente' : 'Equipo de soporte'}</span><time>{formatTicketDate(m.created_at)}</time></div><p style={{ whiteSpace: 'pre-wrap' }}>{m.body}</p></li>;
          })}</ul></div> : <CardBody><Empty>A&#250;n no hay mensajes en este ticket.</Empty></CardBody>}
          <form className="composer" onSubmit={(e) => void submit(e)} noValidate>
            <Field label="Responder a este ticket" error={errors.body}><textarea className="input" rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Escriba su mensaje para soporte" /></Field>
            <input ref={fileInput} type="file" hidden accept="image/jpeg,image/png,image/webp,application/pdf" aria-label="Seleccionar adjunto" onChange={(e) => void uploadAttachment(e.target.files?.[0])} />
            <div className="comp-tools"><button className="btn sm" type="button" disabled={uploading} onClick={() => fileInput.current?.click()}><Icon name="file" className="sm" /> Adjuntar</button>{uploading ? <span role="status" className="sub">{'Subiendo\u2026'}</span> : null}<span className="sub">Im&#225;genes o PDF, hasta 5 MB.</span></div>
            {attachmentError ? <p role="alert" style={{ color: 'var(--danger-text)', margin: 0 }}>{attachmentError}</p> : null}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}><span className="sub">Respuesta promedio: menos de 15 min en horario h&#225;bil</span><button type="submit" className="btn primary" disabled={busy}><Icon name="check" className="sm" /> {busy ? 'Enviando\u2026' : 'Enviar respuesta'}</button></div>
          </form>
        </Card>
        <Card title="Adjuntos" icon="file" sub={`${ticket.attachments?.length ?? 0} archivo(s)`}>
          {ticket.attachments?.length ? <div className="card-b" style={{ display: 'grid', gap: 10 }}>{ticket.attachments.map((a) => <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}><Icon name="file" /><button type="button" className="btn sm ghost" onClick={() => void openAttachment(a)} style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.original_name}</button><span className="sub nw">{formatFileSize(a.size_bytes)}</span></div>)}</div> : <CardBody><Empty icon="file">A&#250;n no hay adjuntos en este ticket.</Empty></CardBody>}
        </Card>
      </div>
      <aside style={{ display: 'grid', gap: 16 }}>
        <Card title="Detalles del Caso" icon="info"><CardBody style={{ display: 'grid', gap: 12 }}><Kv rows={[["Tipo", TICKET_TYPE_LABELS[ticket.type]], ["Prioridad", TICKET_PRIORITY_LABELS[ticket.priority]], ["Estado", TICKET_STATUS_LABELS[ticket.status]], ["Última actualización", formatTicketDate(ticket.updated_at)], ["Canal", 'Portal web']]} /><Note tone="warn">SLA de respuesta: en cumplimiento (menos de 30 min).</Note></CardBody></Card>
        <div className="card" style={{ background: 'var(--surface-2)' }}><div className="card-b" style={{ padding: '14px 18px', fontSize: 12.5, color: 'var(--muted)' }}><strong style={{ color: 'var(--text)', display: 'block', marginBottom: 4 }}>&#191;Problema urgente?</strong>Para ca&#237;das cr&#237;ticas fuera de horario, la guardia NOC 24/7 atiende solicitudes marcadas con prioridad alta.</div></div>
      </aside>
    </div> : null}
  </div>;
}

const COMPLAINT_TYPE_LABELS: Record<PortalComplaintType, string> = { claim: 'Reclamo', grievance: 'Queja' };
const COMPLAINT_STATUS_LABELS: Record<PortalComplaintStatus, string> = { received: 'Recibido', in_progress: 'En atención', answered: 'Respondido', closed: 'Cerrado' };
const COMPLAINT_STATUS_TONES: Record<PortalComplaintStatus, Tone> = { received: 'info', in_progress: 'warn', answered: 'ok', closed: '' };
const COMPLAINT_STATUS_CHIP = ({ status }: { status: PortalComplaintStatus }) => <Chip tone={COMPLAINT_STATUS_TONES[status]}>{COMPLAINT_STATUS_LABELS[status]}</Chip>;

function PortalComplaintsPage({ openComplaint }: { openComplaint: (id: string) => void }) {
  const [cursor, setCursor] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [type, setType] = useState<PortalComplaintType>('claim');
  const [serviceId, setServiceId] = useState('');
  const [serviceDescription, setServiceDescription] = useState('');
  const [detail, setDetail] = useState('');
  const [consumerRequest, setConsumerRequest] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<PortalComplaintCurrency>('PEN');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const res = useLoad(() => hub.support.portalComplaints.list({ size: 25, cursor }), [cursor]);
  const servicesRes = useLoad(() => hub.services.portalList({ size: 100 }), []);
  const services = servicesRes.data?.data ?? [];
  const rows = res.data?.data ?? [];
  const meta = res.data?.meta;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg(null); setErrors({});
    const local: Record<string, string> = {};
    const amountMinor = amount.trim() ? parseMinor(amount) : null;
    if (!serviceId && !serviceDescription.trim()) local.service_description = 'Seleccione un servicio o describa el servicio relacionado.';
    if (amount.trim() && amountMinor === null) local.amount_minor = 'Ingrese un monto válido, por ejemplo 125.50.';
    if (!detail.trim()) local.detail = 'Describa los hechos.';
    if (!consumerRequest.trim()) local.consumer_request = 'Indique qué solución solicita.';
    if (Object.keys(local).length) { setErrors(local); setMsg('Revise los campos indicados.'); setBusy(false); return; }
    const input: PortalComplaintInput = { complaint_type: type, ...(serviceId ? { service_id: serviceId } : { service_description: serviceDescription.trim() }), ...(amountMinor !== null ? { amount_minor: amountMinor, currency } : {}), detail: detail.trim(), consumer_request: consumerRequest.trim() };
    try {
      const complaint = await hub.support.portalComplaints.create(input);
      setCreating(false); openComplaint(complaint.id);
    } catch (err) {
      if (isProblem(err) && err.status === 422) setMsg('No se pudo registrar. Revise los campos y complete en Perfil los datos personales o de dirección que falten en su cuenta.');
      else if (isProblem(err) && err.status === 409) { setMsg('El registro cambió. Recargamos la lista.'); res.reload(); }
      else setMsg(errorText(err));
      if (isProblem(err)) setErrors(Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, v[0] ?? ''])));
    } finally { setBusy(false); }
  };
  return <div style={{ display: 'grid', gap: 20 }}>
    <PageHead title="Libro de Reclamaciones" lead="Registre un reclamo o queja y consulte sus respuestas oficiales." actions={<button type="button" className="btn primary" onClick={() => { setCreating((v) => !v); setMsg(null); }}><Icon name="plus" className="sm" /> {creating ? 'Cancelar' : 'Registrar reclamo'}</button>} />
    {res.error ? <Failed error={res.error} onRetry={res.reload} /> : null}
    {msg ? <Alert tone="warn" role="alert" title={msg} /> : null}
    {creating ? <Card title="Registrar en el Libro de Reclamaciones" icon="msg"><form className="card-b" onSubmit={(e) => void submit(e)} noValidate>
      <Note tone="warn">Sus datos personales y de contacto se toman de su cuenta. Si falta algún dato requerido, complete su Perfil antes de registrar.</Note>
      <FormGrid>
        <Field label="Tipo *" error={errors.complaint_type}><select className="input" value={type} onChange={(e) => setType(e.target.value as PortalComplaintType)}>{(Object.keys(COMPLAINT_TYPE_LABELS) as PortalComplaintType[]).map((v) => <option key={v} value={v}>{COMPLAINT_TYPE_LABELS[v]}</option>)}</select></Field>
        <Field label="Servicio relacionado"><select className="input" value={serviceId} onChange={(e) => setServiceId(e.target.value)}><option value="">Otro servicio / describir</option>{services.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.label}</option>)}</select>{servicesRes.error ? <small className="sub">No se pudieron cargar los servicios; puede describirlo manualmente.</small> : null}</Field>
      </FormGrid>
      {!serviceId ? <Field label="Descripción del servicio *" error={errors.service_description}><input className="input" maxLength={1000} value={serviceDescription} onChange={(e) => setServiceDescription(e.target.value)} /></Field> : null}
      <Field label="Detalle de los hechos *" error={errors.detail}><textarea className="input" rows={5} value={detail} onChange={(e) => setDetail(e.target.value)} /></Field>
      <Field label="Pedido del consumidor *" error={errors.consumer_request}><textarea className="input" rows={3} value={consumerRequest} onChange={(e) => setConsumerRequest(e.target.value)} /></Field>
      <FormGrid><Field label="Monto reclamado (opcional)" error={errors.amount_minor}><input className="input" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field><Field label="Moneda"><select className="input" value={currency} onChange={(e) => setCurrency(e.target.value as PortalComplaintCurrency)}><option value="PEN">PEN · Soles</option><option value="USD">USD · Dólares</option></select></Field></FormGrid>
      <button className="btn primary" type="submit" disabled={busy}>{busy ? 'Registrando…' : 'Registrar reclamo'}</button>
    </form></Card> : null}
    <Card title="Mis reclamos" icon="msg">
      {res.loading && !res.data ? <Loading inCard /> : !rows.length ? <Empty icon="msg">Aún no tiene reclamos registrados.</Empty> : <Table cols={[{ label: 'Código' }, { label: 'Tipo' }, { label: 'Estado' }, { label: 'Recibido' }, { label: 'Vence' }, { label: 'Acción', right: true }]}>
        {rows.map((c) => <tr key={c.id}><td className="mono nw">{c.code}</td><td>{COMPLAINT_TYPE_LABELS[c.complaint_type]}</td><td><COMPLAINT_STATUS_CHIP status={c.status} /></td><td className="nw">{fDate(c.received_at)}</td><td className="nw">{fDate(c.due_at)}</td><td className="r nw"><button type="button" className="btn sm" onClick={() => openComplaint(c.id)}>Ver detalle →</button></td></tr>)}
      </Table>}
      <Pager loading={res.loading} prev={meta?.prev_cursor} next={meta?.next_cursor} onPrev={() => setCursor(meta?.prev_cursor ?? null)} onNext={() => setCursor(meta?.next_cursor ?? null)} />
    </Card>
  </div>;
}

function PortalComplaintPage({ id, back }: { id: string; back: () => void }) {
  const res = useLoad(() => hub.support.portalComplaints.get(id), [id]);
  const complaint: PortalComplaint | null = res.data;
  return <div style={{ display: 'grid', gap: 20 }}>
    <PageHead back={{ label: 'Volver a reclamos', onClick: back }} title={complaint?.code ?? 'Reclamo'} lead={complaint ? `Registrado el ${fDate(complaint.received_at)}` : undefined} actions={complaint ? <COMPLAINT_STATUS_CHIP status={complaint.status} /> : undefined} />
    {res.error ? <Failed error={res.error} onRetry={res.reload} /> : null}
    {res.loading && !complaint ? <Loading /> : null}
    {complaint ? <>
      <Alert tone="info" title={`Hoja ${complaint.code}`} text="Este es su registro en el Libro de Reclamaciones." />
      <Card title="Detalle del reclamo" icon="msg"><CardBody><Kv rows={[["Código", complaint.code], ["Tipo", COMPLAINT_TYPE_LABELS[complaint.complaint_type]], ["Estado", COMPLAINT_STATUS_LABELS[complaint.status]], ["Recibido", fDate(complaint.received_at)], ["Fecha límite de respuesta", fDate(complaint.due_at)], ["Servicio", complaint.service_description], ["Monto", complaint.amount_minor !== null && complaint.currency ? money(complaint.amount_minor, complaint.currency) : 'No indicado'], ["Detalle de los hechos", complaint.detail], ["Pedido del consumidor", complaint.consumer_request]]} /></CardBody></Card>
      <Card title="Respuestas oficiales" icon="msg">{complaint.responses.length ? <div className="card-b" style={{ display: 'grid', gap: 14 }}>{complaint.responses.map((response, index) => <article key={`${response.sent_at}-${index}`} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}><b>{response.is_final ? 'Respuesta final' : 'Respuesta oficial'}</b><time className="sub">{new Date(response.sent_at).toLocaleString('es-PE')}</time></div><p style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>{response.body}</p></article>)}</div> : <CardBody><Empty>Aún no hay respuestas oficiales.</Empty></CardBody>}</Card>
    </> : null}
  </div>;
}

/* ---------- P-PRT Perfil, contactos y seguridad ---------- */
const CONTACT_ROLE_LABELS: Record<ContactRole, string> = { billing: 'Facturación', administrative: 'Administrativo', technical: 'Técnico', authorized: 'Autorizado' };
const CONSENT_CHANNELS: Array<{ id: PortalConsentInput['channel']; label: string }> = [
  { id: 'all', label: 'Todos los canales' }, { id: 'email', label: 'Correo' }, { id: 'whatsapp', label: 'WhatsApp' }, { id: 'sms', label: 'SMS' }, { id: 'phone', label: 'Teléfono' },
];

function ProfilePage() {
  const res = useLoad(() => hub.customers.portalAccount(), []);
  const a = res.data;
  const [form, setForm] = useState<PortalCustomerInput | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (a) setForm({ version: a.version, legal_name: a.legal_name, trade_name: a.trade_name, tax_id_type: a.tax_id_type, tax_id: a.tax_id, address: a.address, email: a.email, phone: a.phone, locale: a.locale, timezone: a.timezone }); }, [a]);
  const set = (key: keyof PortalCustomerInput, value: string) => setForm((f) => f ? { ...f, [key]: value || null } as PortalCustomerInput : f);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!form) return;
    setBusy(true); setMsg(null); setErrors({});
    try { await hub.customers.portalUpdateAccount(form); setMsg('Guardamos los datos del perfil.'); res.reload(); }
    catch (err) { if (isProblem(err) && err.status === 422) setMsg('Revise los campos indicados.'); else if (isProblem(err) && err.status === 409) { setMsg('Los datos cambiaron en otra sesión. Recargamos la versión actual.'); res.reload(); } else setMsg(errorText(err)); if (isProblem(err)) setErrors(Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, v[0] ?? '']))) }
    finally { setBusy(false); }
  };
  return <div style={{ display: 'grid', gap: 20 }}>
    <PageHead title="Perfil" lead="Datos de la cuenta y de facturación. Los cambios aplican a comprobantes futuros." />
    {res.error ? <Failed error={res.error} onRetry={res.reload} /> : null}{msg ? <Alert tone={msg.includes('Guardamos') ? 'info' : 'warn'} role="alert" title={msg} /> : null}
    {!a && res.loading ? <Loading /> : null}
    {a && form ? <Card title="Datos de la cuenta" icon="building" actions={<Chip outline>{a.code}</Chip>}><form className="card-b" onSubmit={(e) => void submit(e)} noValidate>
      <FormGrid>
        <Field label="Razón social *" error={errors.legal_name}><input className="input" value={form.legal_name} onChange={(e) => set('legal_name', e.target.value)} /></Field>
        <Field label="Nombre comercial" error={errors.trade_name}><input className="input" value={form.trade_name ?? ''} onChange={(e) => set('trade_name', e.target.value)} /></Field>
        <Field label="Tipo de documento" error={errors.tax_id_type}><select className="input" value={form.tax_id_type ?? ''} onChange={(e) => set('tax_id_type', e.target.value)}><option value="">Sin especificar</option>{[['ruc','RUC'],['dni','DNI'],['ce','Carné de extranjería'],['passport','Pasaporte'],['foreign_tax_id','Documento fiscal extranjero'],['other','Otro']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <Field label="Número de documento" error={errors.tax_id}><input className="input" value={form.tax_id ?? ''} onChange={(e) => set('tax_id', e.target.value)} /></Field>
        <Field label="Dirección fiscal" error={errors.address}><input className="input" value={form.address ?? ''} onChange={(e) => set('address', e.target.value)} /></Field>
        <Field label="Correo" error={errors.email}><input className="input" type="email" value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="Teléfono" error={errors.phone}><input className="input" value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} /></Field>
        <Field label="Idioma" error={errors.locale}><select className="input" value={form.locale ?? 'es'} onChange={(e) => set('locale', e.target.value)}><option value="es">Español</option><option value="en">English</option></select></Field>
        <Field label="Zona horaria" error={errors.timezone}><input className="input" value={form.timezone ?? ''} onChange={(e) => set('timezone', e.target.value)} /></Field>
      </FormGrid>
      <Kv cols="180px 1fr" rows={[["País", a.country], ["Moneda", a.currency], ["Tratamiento tributario", a.tax_treatment], ["Consolidación", a.invoice_consolidation]]} />
      <button className="btn primary" type="submit" disabled={busy} style={{ marginTop: 14 }}>{busy ? 'Guardando…' : 'Guardar cambios'}</button>
    </form></Card> : null}
  </div>;
}

function ContactsPage() {
  const res = useLoad(() => hub.customers.portalContacts(), []);
  const consentRes = useLoad(() => hub.customers.portalConsents(), []);
  const [editing, setEditing] = useState<PortalContact | null>(null);
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [phone, setPhone] = useState(''); const [whatsapp, setWhatsapp] = useState(''); const [locale, setLocale] = useState<'es'|'en'>('es'); const [roles, setRoles] = useState<ContactRole[]>([]);
  const [errors, setErrors] = useState<Record<string,string>>({}); const [msg, setMsg] = useState<string|null>(null); const [busy, setBusy] = useState(false);
  const rows: PortalContact[] = res.data ?? []; const allowed = consentRes.data?.marketing_allowed_channels ?? [];
  const reset = () => { setEditing(null); setName(''); setEmail(''); setPhone(''); setWhatsapp(''); setLocale('es'); setRoles([]); setErrors({}); };
  const beginEdit = (c: PortalContact) => { setEditing(c); setName(c.name); setEmail(c.email ?? ''); setPhone(c.phone ?? ''); setWhatsapp(c.whatsapp ?? ''); setLocale((c.locale === 'en' ? 'en' : 'es')); setRoles(c.roles ?? []); setErrors({}); };
  const submit = async (e: React.FormEvent) => { e.preventDefault(); setBusy(true); setMsg(null); setErrors({}); const input: ContactInput = { name, email: email || null, phone: phone || null, whatsapp: whatsapp || null, locale, roles };
    try { if (editing) await hub.customers.portalUpdateContact(editing.id, editing.version, input); else await hub.customers.portalCreateContact(input); reset(); setMsg('Guardamos el contacto.'); res.reload(); }
    catch (err) { if (isProblem(err) && err.status === 422) setMsg('Revise los campos indicados.'); else if (isProblem(err) && err.status === 409) { setMsg('El contacto cambió o tiene acceso al portal. Recargamos la lista.'); reset(); res.reload(); } else setMsg(errorText(err)); if (isProblem(err)) setErrors(Object.fromEntries(Object.entries(err.errors).map(([k,v])=>[k,v[0] ?? '']))); }
    finally { setBusy(false); }
  };
  const remove = async (c: PortalContact) => { if (!window.confirm(`¿Eliminar el contacto ${c.name}?`)) return; setMsg(null); try { await hub.customers.portalDeleteContact(c.id); setMsg('Eliminamos el contacto.'); res.reload(); } catch (err) { setMsg(isProblem(err) && err.status === 409 ? 'No se puede eliminar este contacto porque tiene acceso al portal o es su propio usuario. Recargamos la lista.' : errorText(err)); res.reload(); } };
  const consent = async (channel: PortalConsentInput['channel'], granted: boolean) => { setMsg(null); try { await hub.customers.portalRecordConsent({ channel, granted }); consentRes.reload(); } catch (err) { setMsg(isProblem(err) && err.status === 422 ? 'Revise los campos indicados.' : isProblem(err) && err.status === 409 ? 'El estado cambió. Recargamos los consentimientos.' : errorText(err)); consentRes.reload(); } };
  return <div style={{ display:'grid', gap:20 }}><PageHead title="Usuarios y contactos" lead="Administre los contactos asociados a su cuenta y sus preferencias de comunicaciones." />
    {msg ? <Alert tone="warn" role="alert" title={msg} /> : null}{res.error ? <Failed error={res.error} onRetry={res.reload} /> : null}
    <Card title="Contactos de la cuenta" icon="users" actions={<button className="btn sm" type="button" onClick={reset}>Nuevo contacto</button>}>
      {res.loading && !res.data ? <Loading inCard /> : !rows.length ? <Empty icon="users">Aún no hay contactos adicionales.</Empty> : <Table cols={[{label:'Nombre'}, {label:'Correo'}, {label:'Teléfono'}, {label:'Responsabilidades'}, {label:'Acceso al portal'}, {label:'Acciones',right:true}]}>{rows.map(c => <tr key={c.id}><td>{c.name}{c.is_primary ? <div className="sub">Principal</div> : null}</td><td>{c.email ?? '—'}</td><td>{c.phone ?? '—'}</td><td>{c.roles.map(r => CONTACT_ROLE_LABELS[r]).join(', ') || '—'}</td><td>{c.portal_role === 'customer_admin' ? 'Administrador' : c.portal_role === 'customer_user' ? 'Usuario' : 'Sin acceso'}</td><td className="r nw"><button className="btn sm ghost" type="button" onClick={() => beginEdit(c)}>Editar</button> <button className="btn sm ghost" type="button" onClick={() => void remove(c)}>Eliminar</button></td></tr>)}</Table>}
      <CardBody><Note tone="warn">El rol de acceso al portal se muestra aquí, pero estos endpoints del portal no permiten concederlo ni cambiarlo. Pida a un administrador de la cuenta que gestione los accesos.</Note></CardBody>
    </Card>
    <Card title={editing ? `Editar contacto: ${editing.name}` : 'Crear contacto'} icon="user"><form className="card-b" onSubmit={(e)=>void submit(e)} noValidate><FormGrid>
      <Field label="Nombre *" error={errors.name}><input className="input" value={name} onChange={e=>setName(e.target.value)} /></Field><Field label="Correo" error={errors.email}><input className="input" type="email" value={email} onChange={e=>setEmail(e.target.value)} /></Field><Field label="Teléfono" error={errors.phone}><input className="input" value={phone} onChange={e=>setPhone(e.target.value)} /></Field><Field label="WhatsApp" error={errors.whatsapp}><input className="input" value={whatsapp} onChange={e=>setWhatsapp(e.target.value)} /></Field><Field label="Idioma" error={errors.locale}><select className="input" value={locale} onChange={e=>setLocale(e.target.value as 'es'|'en')}><option value="es">Español</option><option value="en">English</option></select></Field>
    </FormGrid><Field label="Responsabilidades"><div style={{display:'flex',gap:14,flexWrap:'wrap'}}>{(Object.keys(CONTACT_ROLE_LABELS) as ContactRole[]).map(r=><label key={r}><input type="checkbox" checked={roles.includes(r)} onChange={e=>setRoles(old=>e.target.checked?[...old,r]:old.filter(x=>x!==r))}/> {CONTACT_ROLE_LABELS[r]}</label>)}</div></Field>
      {errors.version ? <Alert tone="warn" title={errors.version} /> : null}<button className="btn primary" type="submit" disabled={busy} style={{marginTop:12}}>{busy?'Guardando…':editing?'Guardar contacto':'Crear contacto'}</button>{editing ? <button className="btn" type="button" onClick={reset} style={{marginLeft:8}}>Cancelar</button> : null}
    </form></Card>
    <Card title="Consentimientos de comunicación" icon="mail"><CardBody style={{display:'grid',gap:12}}><p className="sub">Preferencias comerciales de su propio contacto. Los avisos transaccionales de cuenta y servicio no dependen de este consentimiento.</p>{consentRes.error ? <Failed error={consentRes.error} onRetry={consentRes.reload}/> : consentRes.loading && !consentRes.data ? <Loading/> : <>{CONSENT_CHANNELS.map(c=><div key={c.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}><span>{c.label} <small className="sub">{allowed.includes('all') || allowed.includes(c.id) ? 'Permitido' : 'No permitido'}</small></span><span><button className="btn sm" type="button" disabled={busy} onClick={()=>void consent(c.id,true)}>Permitir</button> <button className="btn sm" type="button" disabled={busy} onClick={()=>void consent(c.id,false)}>Retirar</button></span></div>)}<small className="sub">Último cambio: {fDate(consentRes.data?.last_recorded_at)}</small></>}</CardBody></Card>
  </div>;
}

function SecurityPage() {
  const meRes = useLoad(() => hub.auth.me(), []); const policyRes = useLoad(() => hub.auth.passwordPolicy(), []);
  const [current,setCurrent]=useState(''); const [password,setPassword]=useState(''); const [confirm,setConfirm]=useState(''); const [totpCode,setTotpCode]=useState('');
  const [enrollment,setEnrollment]=useState<{secret:string;otpauth_uri:string}|null>(null); const [recovery,setRecovery]=useState<string[]|null>(null); const [errors,setErrors]=useState<Record<string,string>>({}); const [msg,setMsg]=useState<string|null>(null); const [busy,setBusy]=useState(false);
  const p: PasswordPolicy | null = policyRes.data; const me: Me | null = meRes.data;
  const changePassword = async (e:React.FormEvent) => { e.preventDefault(); const local:Record<string,string>={}; const rules=(p?.complexity??{}) as Record<string,boolean>; if(!current)local.current_password='Ingrese su contraseña actual.'; if(password.length<(p?.min_length??8))local.password=`Use al menos ${p?.min_length??8} caracteres.`; if((rules.uppercase||rules.lowercase)&&(!/[A-Z]/.test(password)||!/[a-z]/.test(password)))local.password='Incluya al menos una mayúscula y una minúscula.'; if(rules.number&&!/\d/.test(password))local.password='Incluya al menos un número.'; if(rules.symbol&&!/[^A-Za-z0-9]/.test(password))local.password='Incluya al menos un símbolo.'; if(password!==confirm)local.password_confirmation='Las contraseñas no coinciden.'; setErrors(local); if(Object.keys(local).length)return; setBusy(true);setMsg(null);try{await hub.auth.changePassword(current,password,confirm);setCurrent('');setPassword('');setConfirm('');setMsg('Actualizamos su contraseña.');}catch(err){if(isProblem(err)&&err.status===422)setMsg('Revise los campos indicados.');else if(isProblem(err)&&err.status===409){setMsg('La sesión o política cambió. Actualizamos los datos.');policyRes.reload();}else setMsg(errorText(err));if(isProblem(err))setErrors(Object.fromEntries(Object.entries(err.errors).map(([k,v])=>[k,v[0]??''])));}finally{setBusy(false);}};
  const start = async()=>{setBusy(true);setMsg(null);try{setEnrollment(await hub.auth.startTotp());setRecovery(null);}catch(err){setMsg(isProblem(err)&&err.status===409?'MFA ya está activo. Actualizamos el estado.':errorText(err));meRes.reload();}finally{setBusy(false);}};
  const confirmTotp = async(e:React.FormEvent)=>{e.preventDefault();setBusy(true);setMsg(null);try{const r=await hub.auth.confirmTotp(totpCode);setRecovery(r.recovery_codes);setEnrollment(null);setTotpCode('');setMsg('MFA quedó activado. Guarde sus códigos de recuperación.');meRes.reload();}catch(err){setMsg(isProblem(err)&&err.status===422?'Revise el código indicado.':errorText(err));if(isProblem(err))setErrors({code:err.errors.code?.[0]??''});}finally{setBusy(false);}};
  const disable=async()=>{const code=window.prompt('Para desactivar MFA, confirme con un código TOTP actual.');if(!code)return;setBusy(true);setMsg(null);try{await hub.auth.stepUp(code);await hub.auth.disableTotp();setMsg('Desactivamos MFA.');meRes.reload();}catch(err){setMsg(isProblem(err)&&err.status===403?'La política de seguridad exige mantener MFA.':isProblem(err)&&err.status===409?'MFA ya no está activo.':isProblem(err)&&err.status===422?'El código no es válido.':errorText(err));meRes.reload();}finally{setBusy(false);}};
  const complexity=(p?.complexity??{}) as Record<string,boolean>; const requirements=[['uppercase','Mayúsculas'],['lowercase','Minúsculas'],['number','Números'],['symbol','Símbolos']].filter(([k])=>complexity[k]);
  return <div style={{display:'grid',gap:20}}><PageHead title="Seguridad" lead="Proteja el acceso a su cuenta con una contraseña segura y autenticación de dos factores." />{msg?<Alert tone="warn" role="alert" title={msg}/>:null}
    <Card title="Contraseña" icon="lock">{policyRes.error?<CardBody><Failed error={policyRes.error} onRetry={policyRes.reload}/></CardBody>:<form className="card-b" onSubmit={e=>void changePassword(e)} noValidate><p className="sub">Mínimo {p?.min_length??8} caracteres{requirements.length?`; incluya ${requirements.join(', ')}`:''}. {p?.history_count?`No puede reutilizar las últimas ${p.history_count} contraseñas.`:''}</p><FormGrid><Field label="Contraseña actual" error={errors.current_password}><input className="input" type="password" autoComplete="current-password" value={current} onChange={e=>setCurrent(e.target.value)}/></Field><Field label="Nueva contraseña" error={errors.password}><input className="input" type="password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)}/></Field><Field label="Confirmar contraseña" error={errors.password_confirmation}><input className="input" type="password" autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)}/></Field></FormGrid><button className="btn primary" type="submit" disabled={busy||policyRes.loading} style={{marginTop:12}}>{busy?'Actualizando…':'Cambiar contraseña'}</button></form>}</Card>
    <Card title="Autenticación de dos factores (MFA)" icon="shield"><CardBody style={{display:'grid',gap:12}}>{meRes.error?<Failed error={meRes.error} onRetry={meRes.reload}/>:meRes.loading&&!me?<Loading/>:<><Alert tone={me?.mfa.enabled?'info':'warn'} title={me?.mfa.enabled?'MFA está activado':'MFA está desactivado'} text={me?.mfa.required?'La política de seguridad exige un segundo factor.':me?.mfa.enrollment_required?'Debe completar el enrolamiento de MFA.':'Estado de su usuario actual.'}/>{me?.mfa.enabled?<button className="btn" type="button" disabled={busy||me.mfa.required} onClick={()=>void disable()}>{me.mfa.required?'MFA requerido por política':'Desactivar TOTP'}</button>:<button className="btn primary" type="button" disabled={busy||!!enrollment} onClick={()=>void start()}>{busy?'Preparando…':'Enrolar TOTP'}</button>}{enrollment?<form onSubmit={e=>void confirmTotp(e)}><p>Agregue esta clave a su aplicación autenticadora:</p><p className="mono" style={{wordBreak:'break-all'}}>{enrollment.secret}</p><p className="sub">URI de configuración: {enrollment.otpauth_uri}</p><Field label="Código de la aplicación" error={errors.code}><input className="input" inputMode="numeric" autoComplete="one-time-code" value={totpCode} onChange={e=>setTotpCode(e.target.value)}/></Field><button className="btn primary" type="submit" disabled={busy} style={{marginTop:10}}>Confirmar TOTP</button></form>:null}{recovery?<Note tone="warn"><b>Códigos de recuperación (se muestran una sola vez):</b><pre style={{whiteSpace:'pre-wrap'}}>{recovery.join('\n')}</pre>Guárdelos en un lugar seguro.</Note>:null}</>}</CardBody></Card>
  </div>;
}
