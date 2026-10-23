/**
 * P-BIL-01 · Comprobantes contra la API real (franja MVP): listado con filtros y cursor,
 * ficha con líneas, IGV, total, estado SUNAT (simulado con HUB_EINVOICE_DRIVER=fake),
 * emisión del borrador, descarga del comprobante imprimible y anulación según permisos.
 *
 * Se usa como vista #facturas[/<uuid>] y embebida en la ficha del cliente (`customerId`).
 * Pagos: ficha con los pagos aplicados y «Registrar pago» (cobranza/PaymentForm).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { FISCAL_STATUS_LABELS, INVOICE_STATUS_LABELS, INVOICE_TYPE_LABELS, isProblem, newIdempotencyKey, type FiscalStatus, type Invoice, type InvoiceFilters, type InvoiceType } from '@hub/api';
import { useApp } from '../../../app/context';
import { useViewState } from '../../../app/storage';
import { href } from '../../../app/routeMeta';
import { DataTable, type Column } from '../../../components/DataTable';
import { Icon } from '../../../components/Icon';
import { Sheet } from '../../../components/Modal';
import { Chip, EmptyState, Kv, Note, PageHead, SearchBox, Select, Toolbar } from '../../../components/ui';
import { displayName, downloadBlob, errorText, fDate, fDateTime, isUuid, moneyMinor, useCan, useLoad } from '../clientes/shared';
import { FISCAL_CHIP, INVOICE_CHIP, invoiceNumber, invoicesApi, MVP_INVOICE_STATUSES } from './shared';
import PaymentForm from '../cobranza/PaymentForm';
import { paymentChip } from '../cobranza/shared';
import { paymentStatusLabel } from '@hub/api';

const PER = 25;
const TYPES: InvoiceType[] = ['invoice', 'receipt'];
const FISCALS: FiscalStatus[] = ['not_applicable', 'pending', 'accepted', 'rejected', 'voided'];

export default function InvoiceList({ param, customerId }: { param?: string | null; customerId?: string }) {
  const embedded = !!customerId;
  const ns = embedded ? 'fac.c' : 'fac.api';
  const [q, setQ] = useViewState(`${ns}.q`, '');
  const [st, setSt] = useViewState(`${ns}.st`, '');
  const [type, setType] = useViewState(`${ns}.type`, '');
  const [fiscal, setFiscal] = useViewState(`${ns}.fiscal`, '');
  const [cur, setCur] = useViewState(`${ns}.cur`, '');
  const [from, setFrom] = useViewState(`${ns}.from`, '');
  const [to, setTo] = useViewState(`${ns}.to`, '');
  const [sort, setSort] = useViewState(`${ns}.sort`, '-created_at');
  const [cursor, setCursor] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(isUuid(param) ? param : null);

  // #facturas/<uuid> abre la ficha (p. ej. desde el pedido); otro texto se usa como búsqueda.
  useEffect(() => {
    if (!param) return;
    if (isUuid(param)) setOpenId(param);
    else setQ(param);
    setCursor(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [param]);

  const filter = useMemo<InvoiceFilters>(
    () => ({ status: st as InvoiceFilters['status'], type: type as InvoiceFilters['type'], fiscal_status: fiscal as InvoiceFilters['fiscal_status'], currency: cur as InvoiceFilters['currency'], customer_id: customerId, issued_from: from || undefined, issued_to: to || undefined }),
    [st, type, fiscal, cur, customerId, from, to],
  );
  const res = useLoad(() => invoicesApi.list({ q: q.trim() || undefined, filter, sort, cursor, size: PER }), [q, filter, sort, cursor]);
  const rows = res.data?.data ?? [];
  const meta = res.data?.meta;
  const filtered = !!(q || st || type || fiscal || cur || from || to);

  const upd = (f: (v: string) => void) => (v: string) => {
    f(v);
    setCursor(null);
  };
  const clear = () => {
    [setQ, setSt, setType, setFiscal, setCur, setFrom, setTo].forEach((f) => f(''));
    setCursor(null);
  };

  const columns: Column<Invoice>[] = [
    {
      key: 'n',
      header: 'Comprobante',
      className: 'nw',
      render: (i) => (
        <>
          <button type="button" className="rowlink mono" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer' }} onClick={() => setOpenId(i.id)}>
            {invoiceNumber(i)}
          </button>
          <div className="sub">{INVOICE_TYPE_LABELS[i.type]}</div>
        </>
      ),
    },
    ...(embedded
      ? []
      : [
          {
            key: 'c',
            header: 'Cliente',
            minWidth: 180,
            render: (i: Invoice) =>
              i.customer ? (
                <>
                  <a className="rowlink" href={href('cliente', i.customer.id)}>
                    {displayName(i.customer)}
                  </a>
                  <div className="sub mono">{i.customer.code}</div>
                </>
              ) : (
                '—'
              ),
          },
        ]),
    { key: 'e', header: 'Emisión', className: 'nw', render: (i) => fDate(i.issue_date) },
    { key: 's', header: 'Estado', render: (i) => <Chip kind={INVOICE_CHIP[i.status]}>{INVOICE_STATUS_LABELS[i.status]}</Chip> },
    { key: 'f', header: 'SUNAT', render: (i) => <Chip kind={FISCAL_CHIP[i.fiscal_status]}>{FISCAL_STATUS_LABELS[i.fiscal_status]}</Chip> },
    { key: 't', header: 'Total', align: 'r', className: 'nw strong', render: (i) => moneyMinor(i.total_minor, i.currency) },
    { key: 'b', header: 'Saldo', align: 'r', className: 'nw', render: (i) => moneyMinor(i.balance_minor, i.currency) },
  ];

  return (
    <>
      {embedded ? null : <PageHead crumbs={[['Finanzas', 'facturas'], ['Facturas y pagos']]} title="Facturas y pagos" sub="Comprobantes electrónicos generados al aprobar pedidos y en cada renovación." />}
      {embedded ? null : (
        <Note icon="info" style={{ marginBottom: 12 }}>
          El saldo es lo pendiente tras los pagos validados. Abra un comprobante para registrar un pago; los vouchers del portal se validan en Cobranza.
        </Note>
      )}
      <section className="card">
        <Toolbar count={res.loading ? 'Cargando…' : `${rows.length}${meta?.has_more ? '+' : ''} en esta página`}>
          {embedded ? null : <SearchBox value={q} onChange={upd(setQ)} label="Buscar comprobantes" placeholder="Número, cliente o RUC" />}
          <Select value={type} onChange={upd(setType)} label="Tipo" options={[['', 'Todos los tipos'], ...TYPES.map((t): [string, string] => [t, INVOICE_TYPE_LABELS[t]])]} />
          <Select value={st} onChange={upd(setSt)} label="Estado" options={[['', 'Todos los estados'], ...MVP_INVOICE_STATUSES.map((s): [string, string] => [s, INVOICE_STATUS_LABELS[s]])]} />
          <Select value={fiscal} onChange={upd(setFiscal)} label="Estado SUNAT" options={[['', 'SUNAT: todos'], ...FISCALS.map((s): [string, string] => [s, FISCAL_STATUS_LABELS[s]])]} />
          <Select value={cur} onChange={upd(setCur)} label="Moneda" options={[['', 'Todas las monedas'], ['PEN', 'Soles'], ['USD', 'Dólares']]} />
          <label className="sub" style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
            Emitido desde
            <input className="input" type="date" value={from} onChange={(e) => upd(setFrom)(e.target.value)} />
          </label>
          <label className="sub" style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
            hasta
            <input className="input" type="date" value={to} onChange={(e) => upd(setTo)(e.target.value)} />
          </label>
          <Select value={sort} onChange={upd(setSort)} label="Orden" options={[['-created_at', 'Más recientes'], ['created_at', 'Más antiguos'], ['-issue_date', 'Emisión reciente'], ['-total_minor', 'Mayor total'], ['number', 'Número']]} />
        </Toolbar>
        {res.error ? (
          <div className="card-b">
            <Note kind="warn" icon="tri" role="alert">
              No se pudo cargar el listado: {errorText(res.error)}{' '}
              <button type="button" className="btn sm" onClick={res.reload}>
                Reintentar
              </button>
            </Note>
          </div>
        ) : !res.loading && !rows.length ? (
          <EmptyState
            title={filtered ? 'Sin comprobantes que coincidan' : 'Aún no hay comprobantes'}
            text={filtered ? 'Ajuste los filtros.' : 'El comprobante se genera en borrador al aprobar un pedido.'}
            action={
              filtered ? (
                <button type="button" className="btn sm" onClick={clear}>
                  Limpiar filtros
                </button>
              ) : undefined
            }
          />
        ) : (
          <>
            <DataTable columns={columns} rows={rows} rowKey={(i) => i.id} caption="Comprobantes" />
            <div className="card-b" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="btn sm" disabled={res.loading || !meta?.prev_cursor} onClick={() => setCursor(meta?.prev_cursor ?? null)}>
                <Icon name="cl" size="sm" />
                Anterior
              </button>
              <button type="button" className="btn sm" disabled={res.loading || !meta?.next_cursor} onClick={() => setCursor(meta?.next_cursor ?? null)}>
                Siguiente
                <Icon name="cr" size="sm" />
              </button>
            </div>
          </>
        )}
      </section>
      {openId ? <InvoiceSheet id={openId} onClose={() => setOpenId(null)} onChanged={res.reload} /> : null}
    </>
  );
}

/** Ficha del comprobante: líneas, IGV, total, respuesta SUNAT, descarga, emisión y anulación. */
export function InvoiceSheet({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged?: () => void }) {
  const { toast } = useApp();
  const can = useCan();
  const res = useLoad(() => invoicesApi.get(id), [id]);
  const [busy, setBusy] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const idem = useRef({ issue: newIdempotencyKey(), void: newIdempotencyKey() });
  const i = res.data;

  const run = async (kind: 'issue' | 'void') => {
    if (!i) return;
    if (kind === 'void' && reason.trim().length < 3) {
      setMsg('Indique el motivo de la anulación (mínimo 3 caracteres).');
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const next = kind === 'issue' ? await invoicesApi.issue(i.id, i.version, idem.current.issue) : await invoicesApi.void(i.id, reason.trim(), i.version, idem.current.void);
      idem.current[kind] = newIdempotencyKey();
      res.setData(next);
      setVoiding(false);
      toast(kind === 'issue' ? 'Comprobante emitido' : 'Comprobante anulado', `${invoiceNumber(next)} · ${FISCAL_STATUS_LABELS[next.fiscal_status]}`, kind === 'issue' ? 'ok' : 'warn');
      onChanged?.();
    } catch (e) {
      if (isProblem(e) && e.status >= 400 && e.status < 500) idem.current[kind] = newIdempotencyKey();
      setMsg(errorText(e));
      if (isProblem(e) && e.code === 'version_conflict') res.reload();
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    if (!i) return;
    setMsg(null);
    try {
      downloadBlob(await invoicesApi.document(i.id), `${i.number ?? 'borrador-' + i.id.slice(0, 8)}.html`);
    } catch (e) {
      setMsg(errorText(e));
    }
  };

  const canIssue = !!i && i.status === 'draft' && can('billing.invoice.issue');
  // Igual que InvoiceService::void: emitido, sin pagos aplicados y con respuesta de SUNAT.
  const canVoid = !!i && i.status === 'issued' && i.balance_minor === i.total_minor && i.fiscal_status !== 'pending' && can('billing.invoice.void');
  const lines = i?.items ?? [];

  return (
    <Sheet
      open
      onClose={onClose}
      title={i ? `${INVOICE_TYPE_LABELS[i.type]} ${invoiceNumber(i)}` : 'Comprobante'}
      sub={
        i ? (
          <>
            <Chip kind={INVOICE_CHIP[i.status]}>{INVOICE_STATUS_LABELS[i.status]}</Chip> <Chip kind={FISCAL_CHIP[i.fiscal_status]}>{FISCAL_STATUS_LABELS[i.fiscal_status]}</Chip>
          </>
        ) : undefined
      }
      footer={
        i ? (
          <>
            <button type="button" className="btn" onClick={() => void download()}>
              <Icon name="download" size="sm" />
              Descargar
            </button>
            {canVoid && !voiding ? (
              <button type="button" className="btn" disabled={busy} onClick={() => setVoiding(true)}>
                Anular
              </button>
            ) : null}
            {canIssue ? (
              <button type="button" className="btn primary" disabled={busy} onClick={() => void run('issue')}>
                {busy ? 'Procesando…' : 'Emitir comprobante'}
              </button>
            ) : null}
          </>
        ) : undefined
      }
    >
      {res.error ? (
        <Note kind="warn" icon="tri" role="alert">
          {errorText(res.error)}
        </Note>
      ) : !i ? (
        <p className="sub">Cargando…</p>
      ) : (
        <>
          <Kv
            items={[
              ['Cliente', i.customer ? <a href={href('cliente', i.customer.id)}>{displayName(i.customer)}</a> : '—'],
              ['Emisión', fDate(i.issue_date)],
              ['Vencimiento', fDate(i.due_date)],
              ['Moneda', i.currency],
              ['Origen', i.origin?.order_id ? <a href={href('pedidos', i.origin.order_id)}>Pedido</a> : i.origin?.type === 'renewal' ? 'Renovación' : '—'],
            ]}
          />
          <h3 style={{ margin: '16px 0 8px' }}>Líneas</h3>
          <DataTable
            rows={lines}
            rowKey={(l) => l.id}
            caption="Líneas del comprobante"
            columns={[
              {
                key: 'd',
                header: 'Descripción',
                render: (l) => (
                  <>
                    {l.service_id ? <a href={href('servicios', l.service_id)}>{l.description}</a> : l.description}
                    {l.period_start ? <div className="sub">Periodo {fDate(l.period_start)} – {fDate(l.period_end)}</div> : null}
                  </>
                ),
              },
              { key: 'q', header: 'Cant.', align: 'r', className: 'num', render: (l) => Number(l.quantity).toLocaleString('es-PE') },
              { key: 'u', header: 'P. unit.', align: 'r', className: 'nw', render: (l) => moneyMinor(l.unit_price_minor, i.currency) },
              { key: 'g', header: 'IGV', align: 'r', className: 'nw', render: (l) => moneyMinor(l.tax_minor, i.currency) },
              { key: 't', header: 'Total', align: 'r', className: 'nw strong', render: (l) => moneyMinor(l.total_minor, i.currency) },
            ]}
          />
          <Kv
            style={{ marginTop: 12 }}
            items={[
              ['Subtotal', moneyMinor(i.subtotal_minor, i.currency)],
              ...(i.discount_minor ? [['Descuento', moneyMinor(-i.discount_minor, i.currency)] as [string, string]] : []),
              [i.tax_treatment === 'export' ? 'IGV (exportación)' : `IGV${i.tax_rate_percent ? ` (${Number(i.tax_rate_percent)} %)` : ''}`, moneyMinor(i.tax_minor, i.currency)],
              [<b key="t">Total</b>, <b key="v">{moneyMinor(i.total_minor, i.currency)}</b>],
              ['Saldo pendiente', moneyMinor(i.balance_minor, i.currency)],
            ]}
          />
          {i.einvoice ? (
            <>
              <h3 style={{ margin: '16px 0 8px' }}>Respuesta SUNAT</h3>
              {i.einvoice.simulated ? (
                <Note kind="warn" icon="tri" style={{ marginBottom: 8 }}>
                  SIMULACIÓN: respuesta del conector de prueba, sin validez ante SUNAT.
                </Note>
              ) : null}
              <Kv
                items={[
                  ['Proveedor', i.einvoice.provider],
                  ['Código', i.einvoice.code ?? '—'],
                  ['Mensaje', i.einvoice.message],
                  ['Referencia', i.einvoice.reference ?? '—'],
                ]}
              />
            </>
          ) : i.status === 'draft' ? (
            <Note icon="info" style={{ marginTop: 12 }}>
              Borrador: al emitirlo se asigna serie y correlativo y se envía a SUNAT.
            </Note>
          ) : null}
          {i.status === 'void' ? (
            <Note icon="info" style={{ marginTop: 12 }}>
              Anulado el {fDateTime(i.voided_at)}
              {i.void_reason ? ` · ${i.void_reason}` : ''}.
            </Note>
          ) : null}
          {i.payments?.length ? (
            <>
              <h3 style={{ margin: '16px 0 8px' }}>Pagos</h3>
              <DataTable
                rows={i.payments}
                rowKey={(p) => p.payment_id}
                caption="Pagos del comprobante"
                columns={[
                  { key: 'f', header: 'Fecha', className: 'nw', render: (p) => fDate(p.received_at) },
                  { key: 'm', header: 'Medio', render: (p) => p.method ?? '—' },
                  { key: 'r', header: 'Referencia', className: 'mono', render: (p) => p.external_id ?? '—' },
                  { key: 's', header: 'Estado', render: (p) => <Chip kind={paymentChip(p)}>{paymentStatusLabel(p)}</Chip> },
                  { key: 'a', header: 'Aplicado', align: 'r', className: 'nw', render: (p) => moneyMinor(p.amount_minor, i.currency) },
                ]}
              />
            </>
          ) : null}
          {['issued', 'partially_paid', 'overdue'].includes(i.status) && i.balance_minor > 0 && can('billing.payment.create') ? (
            paying ? (
              <PaymentForm
                customerId={i.customer_id}
                currency={i.currency}
                invoiceId={i.id}
                onCancel={() => setPaying(false)}
                onDone={() => {
                  setPaying(false);
                  res.reload();
                  onChanged?.();
                }}
              />
            ) : (
              <button type="button" className="btn primary" style={{ marginTop: 12 }} onClick={() => setPaying(true)}>
                <Icon name="plus" size="sm" />
                Registrar pago
              </button>
            )
          ) : null}
          {voiding ? (
            <label className="field full" htmlFor="inv-reason" style={{ marginTop: 12 }}>
              Motivo de la anulación *
              <textarea className="input" id="inv-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
              <span style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <button type="button" className="btn sm" onClick={() => setVoiding(false)}>
                  Volver
                </button>
                <button type="button" className="btn sm danger" disabled={busy} onClick={() => void run('void')}>
                  Confirmar anulación
                </button>
              </span>
            </label>
          ) : null}
          <div className="err" role="alert">
            {msg}
          </div>
        </>
      )}
    </Sheet>
  );
}
