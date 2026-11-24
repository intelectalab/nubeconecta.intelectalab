/**
 * Cobranza contra la API real (franja MVP): P-BIL-08 vouchers por validar
 * (validar / rechazar con motivo), P-BIL-05 pagos (anular con motivo),
 * P-BIL-12 antigüedad de deuda y avisos de la secuencia de cobranza.
 * Sin recargo por mora (D-04) ni suspensión automática.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AGING_LABELS, isProblem, newIdempotencyKey, PAYMENT_STATUS_LABELS, paymentStatusLabel, type AgingBucket, type Invoice, type Payment, type PaymentPromise, type PaymentPromiseStatus, type PaymentStatus } from '@hub/api';
import { useApp } from '../../../app/context';
import { href } from '../../../app/routeMeta';
import { DataTable, type Column } from '../../../components/DataTable';
import { Icon } from '../../../components/Icon';
import { Modal } from '../../../components/Modal';
import { Chip, EmptyState, Note, PageHead, SearchBox, Select, Tabs, Toolbar } from '../../../components/ui';
import { displayName, downloadBlob, errorText, fDate, fDateTime, moneyMinor, useCan, useLoad } from '../clientes/shared';
import { paymentChip, paymentsApi, VIA_LABELS } from './shared';

/** Estados de dunning_events (CollectionsController). */
const DUNNING_STATUS_LABELS: Record<string, string> = { scheduled: 'Programado', done: 'Enviado', failed: 'Falló', skipped: 'Omitido', cancelled: 'Cancelado' };

type Tab = 'vouchers' | 'pagos' | 'compromisos' | 'antiguedad' | 'avisos';
const TABS: Tab[] = ['vouchers', 'pagos', 'compromisos', 'antiguedad', 'avisos'];
const PROMISE_STATUS: Record<PaymentPromiseStatus, { label: string; kind: 'warn' | 'ok' | 'danger' }> = {
  open: { label: 'Vigente', kind: 'warn' },
  kept: { label: 'Cumplido', kind: 'ok' },
  broken: { label: 'Incumplido', kind: 'danger' },
};
const BUCKETS: AgingBucket[] = ['current', 'd1_30', 'd31_60', 'd61_90', 'd90_plus'];
/** Montos alineados con cifras tabulares. */
const NUM = { fontVariantNumeric: 'tabular-nums' } as const;

export default function CollectionsView({ param }: { param?: string | null }) {
  const can = useCan();
  const [tab, setTab] = useState<Tab>(TABS.includes(param as Tab) ? (param as Tab) : 'vouchers');
  return (
    <>
      <PageHead crumbs={[['Finanzas', 'cobranza'], ['Cobranza']]} title="Cobranza" sub="Vouchers por validar, pagos registrados, antigüedad de deuda y avisos de cobranza." />
      <Tabs<Tab>
        label="Secciones de cobranza"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'vouchers', label: 'Vouchers por validar' },
          { id: 'pagos', label: 'Pagos' },
          ...(can('billing.payment_promise.view') ? [{ id: 'compromisos' as Tab, label: 'Compromisos' }] : []),
          { id: 'antiguedad', label: 'Antigüedad de deuda' },
          ...(can('billing.dunning_event.view') ? [{ id: 'avisos' as Tab, label: 'Avisos' }] : []),
        ]}
        style={{ marginBottom: 12 }}
      />
      {tab === 'vouchers' ? <PaymentsTab fixedStatus="reported" /> : tab === 'pagos' ? <PaymentsTab /> : tab === 'compromisos' ? <PromisesTab /> : tab === 'antiguedad' ? <AgingTab /> : <NoticesTab />}
    </>
  );
}

function PaymentsTab({ fixedStatus }: { fixedStatus?: PaymentStatus }) {
  const { toast } = useApp();
  const can = useCan();
  const [status, setStatus] = useState<string>(fixedStatus ?? '');
  const [cursor, setCursor] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [qDeb, setQDeb] = useState('');
  // Búsqueda con debounce (300 ms): el término enviado a la API no cambia en cada tecla.
  useEffect(() => {
    const t = setTimeout(() => {
      setCursor(null);
      setQDeb(q.trim());
    }, 300);
    return () => clearTimeout(t);
  }, [q]);
  // «Vouchers por validar» = solo constancias subidas desde el portal; los pagos del panel sin validar están en «Pagos».
  const res = useLoad(() => paymentsApi.payments({ filter: { status: (fixedStatus ?? status) as PaymentStatus | '', reported_via: fixedStatus ? 'portal' : undefined }, q: qDeb || undefined, cursor, size: 25 }), [status, qDeb, cursor, fixedStatus]);
  const rows = res.data?.data ?? [];
  const meta = res.data?.meta;
  const [acting, setActing] = useState<{ id: string; kind: 'reject' | 'void' } | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const keys = useRef<Record<string, string>>({});
  const keyFor = (k: string) => (keys.current[k] ??= newIdempotencyKey());

  const run = async (p: Payment, kind: 'validate' | 'reject' | 'void') => {
    if (kind !== 'validate' && reason.trim().length < 3) {
      setMsg('Indique el motivo (mínimo 3 caracteres).');
      return;
    }
    const k = `${kind}:${p.id}`;
    setBusy(true);
    setMsg(null);
    try {
      const next =
        kind === 'validate'
          ? await paymentsApi.validatePayment(p.id, p.version, undefined, keyFor(k))
          : kind === 'reject'
            ? await paymentsApi.rejectPayment(p.id, reason.trim(), p.version, keyFor(k))
            : await paymentsApi.voidPayment(p.id, reason.trim(), p.version, keyFor(k));
      delete keys.current[k];
      setActing(null);
      setReason('');
      toast(kind === 'validate' ? 'Pago validado y aplicado' : kind === 'reject' ? 'Voucher rechazado' : 'Pago anulado', moneyMinor(next.amount_minor, next.currency), kind === 'validate' ? 'ok' : 'warn');
      res.reload();
    } catch (e) {
      if (isProblem(e) && e.status >= 400 && e.status < 500) delete keys.current[k];
      setMsg(errorText(e));
      if (isProblem(e) && (e.code === 'version_conflict' || e.code === 'invalid_transition')) res.reload();
    } finally {
      setBusy(false);
    }
  };

  const proof = async (p: Payment) => {
    try {
      downloadBlob(await paymentsApi.paymentProof(p.id), p.proof?.original_name || `constancia-${p.id.slice(0, 8)}`);
    } catch (e) {
      setMsg(errorText(e));
    }
  };

  const columns: Column<Payment>[] = [
    { key: 'f', header: 'Fecha', className: 'nw', render: (p) => <>{fDate(p.received_at)}<div className="sub">Reportado {fDateTime(p.created_at)}</div></> },
    { key: 'c', header: 'Cliente', minWidth: 160, render: (p) => (p.customer ? <a className="rowlink" href={href('cliente', p.customer.id)}>{displayName(p.customer)}</a> : '—') },
    { key: 'm', header: 'Medio', render: (p) => <>{p.payment_method?.name ?? '—'}{p.external_id ? <div className="sub mono">{p.external_id}</div> : null}</> },
    { key: 'v', header: 'Reportado por', render: (p) => VIA_LABELS[p.reported_via] },
    { key: 'i', header: 'Comprobantes', render: (p) => (p.allocations.length ? p.allocations.map((a) => <div key={a.invoice_id} className="mono">{a.invoice_number ?? '—'} · {moneyMinor(a.amount_minor, p.currency)}</div>) : <span className="sub">Sin aplicar</span>) },
    { key: 's', header: 'Estado', render: (p) => <><Chip kind={paymentChip(p)}>{paymentStatusLabel(p)}</Chip>{p.rejection_reason ? <div className="sub">{p.rejection_reason}</div> : null}</> },
    { key: 'a', header: 'Importe', align: 'r', className: 'nw strong', render: (p) => <span style={NUM}>{moneyMinor(p.amount_minor, p.currency)}</span> },
    {
      key: 'x',
      header: 'Acciones',
      align: 'r',
      render: (p) => (
        <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {p.has_proof ? (
            <button type="button" className="btn sm" onClick={() => void proof(p)} title="Descargar constancia">
              <Icon name="download" size="sm" />
              Constancia
            </button>
          ) : null}
          {p.status === 'reported' && can('billing.payment.validate') ? (
            <>
              <button type="button" className="btn sm primary" disabled={busy} onClick={() => void run(p, 'validate')}>
                Validar
              </button>
              <button type="button" className="btn sm" disabled={busy} onClick={() => setActing({ id: p.id, kind: 'reject' })}>
                Rechazar
              </button>
            </>
          ) : null}
          {p.status === 'validated' && can('billing.payment.validate') ? (
            <button type="button" className="btn sm" disabled={busy} onClick={() => setActing({ id: p.id, kind: 'void' })}>
              Anular
            </button>
          ) : null}
        </span>
      ),
    },
  ];
  const target = acting ? rows.find((r) => r.id === acting.id) : undefined;

  return (
    <section className="card">
      <div className="card-h">
        <h2 style={{ margin: 0, fontSize: 15 }}>{fixedStatus ? 'Vouchers por validar' : 'Pagos registrados'}</h2>
        <span className="sub">{fixedStatus ? 'Constancias subidas por los clientes desde el portal' : 'Historial de pagos y su estado de validación'}</span>
      </div>
      <Toolbar count={res.loading ? 'Cargando…' : `${rows.length}${meta?.has_more ? '+' : ''} en esta página`}>
        <SearchBox value={q} onChange={setQ} label="Buscar pagos" placeholder="Cliente, comprobante u operación" />
        {fixedStatus ? null : (
          <Select
            value={status}
            onChange={(v) => {
              setStatus(v);
              setCursor(null);
            }}
            label="Estado"
            options={[['', 'Todos los estados'], ...(Object.keys(PAYMENT_STATUS_LABELS) as PaymentStatus[]).map((s): [string, string] => [s, PAYMENT_STATUS_LABELS[s]])]}
          />
        )}
        <button type="button" className="btn sm" onClick={res.reload}>
          <Icon name="refresh" size="sm" />
          Actualizar
        </button>
      </Toolbar>
      {target && acting ? (
        <div className="card-b">
          <label className="field full" htmlFor="pay-reason">
            {acting.kind === 'reject' ? 'Motivo del rechazo (lo verá el cliente) *' : 'Motivo de la anulación *'}
            <textarea className="input" id="pay-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <span style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <button type="button" className="btn sm" onClick={() => setActing(null)}>
              Volver
            </button>
            <button type="button" className="btn sm danger" disabled={busy} onClick={() => void run(target, acting.kind)}>
              {acting.kind === 'reject' ? 'Confirmar rechazo' : 'Confirmar anulación'}
            </button>
          </span>
        </div>
      ) : null}
      {msg ? (
        <div className="card-b err" role="alert">
          {msg}
        </div>
      ) : null}
      {res.error ? (
        <div className="card-b">
          <Note kind="warn" icon="tri" role="alert">
            No se pudo cargar: {errorText(res.error)}{' '}
            <button type="button" className="btn sm" onClick={res.reload}>
              Reintentar
            </button>
          </Note>
        </div>
      ) : !res.loading && !rows.length ? (
        <EmptyState title={fixedStatus ? 'No hay vouchers por validar' : 'Sin pagos'} text={fixedStatus ? 'Las constancias que suban los clientes aparecerán aquí.' : 'Registre un pago desde la ficha del comprobante.'} />
      ) : (
        <>
          <DataTable columns={columns} rows={rows} rowKey={(p) => p.id} caption={fixedStatus ? 'Vouchers por validar' : 'Pagos'} />
          <div className="card-b" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="btn sm" disabled={res.loading || !meta?.prev_cursor} onClick={() => setCursor(meta?.prev_cursor ?? null)}>
              Anterior
            </button>
            <button type="button" className="btn sm" disabled={res.loading || !meta?.next_cursor} onClick={() => setCursor(meta?.next_cursor ?? null)}>
              Siguiente
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function PromisesTab() {
  const { toast } = useApp();
  const can = useCan();
  const canCreate = can('billing.payment_promise.create');
  const canUpdate = can('billing.payment_promise.update');
  const [status, setStatus] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [qDeb, setQDeb] = useState('');
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => { setCursor(null); setQDeb(q.trim()); }, 300);
    return () => clearTimeout(t);
  }, [q]);
  const res = useLoad(() => paymentsApi.promises({ filter: { status: status as PaymentPromiseStatus | '' }, q: qDeb || undefined, cursor, size: 25 }), [status, qDeb, cursor]);
  const rows = res.data?.data ?? [];
  const meta = res.data?.meta;

  const resolve = async (p: PaymentPromise, kind: 'kept' | 'broken') => {
    if (!window.confirm(kind === 'kept' ? '¿Marcar el compromiso como cumplido?' : '¿Marcar el compromiso como incumplido?')) return;
    setBusy(true);
    try {
      await paymentsApi.resolvePromise(p.id, kind, p.version);
      toast(kind === 'kept' ? 'Compromiso cumplido' : 'Compromiso incumplido', '', kind === 'kept' ? 'ok' : 'warn');
      res.reload();
    } catch (e) {
      toast('No se pudo', errorText(e), 'err');
    } finally {
      setBusy(false);
    }
  };

  const columns: Column<PaymentPromise>[] = [
    { key: 'i', header: 'Comprobante', className: 'nw', render: (p) => <>{p.invoice?.number ? <a className="rowlink mono" href={href('facturas')}>{p.invoice.number}</a> : <span className="mono">—</span>}<div className="sub">{p.invoice ? INVOICE_STATUS_LABEL(p.invoice.status) : ''}</div></> },
    { key: 'c', header: 'Cliente', minWidth: 160, render: (p) => (p.customer ? <a className="rowlink" href={href('cliente', p.customer.id)}>{p.customer.trade_name || p.customer.legal_name}</a> : '—') },
    { key: 'd', header: 'Fecha prometida', className: 'nw', render: (p) => fDate(p.promised_date) },
    { key: 'a', header: 'Monto', align: 'r', className: 'nw strong', render: (p) => <span style={NUM}>{p.amount_minor != null && p.currency ? moneyMinor(p.amount_minor, p.currency) : '—'}</span> },
    { key: 's', header: 'Estado', render: (p) => <><Chip kind={PROMISE_STATUS[p.status].kind}>{PROMISE_STATUS[p.status].label}</Chip>{p.resolved_at ? <div className="sub">{fDate(p.resolved_at)}</div> : null}</> },
    { key: 'n', header: 'Notas', minWidth: 160, render: (p) => p.notes ? <span className="sub">{p.notes}</span> : <span className="sub">—</span> },
    {
      key: 'x', header: 'Acciones', align: 'r',
      render: (p) => (canUpdate && p.status === 'open' ? (
        <span style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end' }}>
          <button type="button" className="btn sm primary" disabled={busy} onClick={() => void resolve(p, 'kept')}>Cumplido</button>
          <button type="button" className="btn sm danger" disabled={busy} onClick={() => void resolve(p, 'broken')}>Incumplido</button>
        </span>
      ) : null),
    },
  ];

  return (
    <section className="card">
      <div className="card-h">
        <h2 style={{ margin: 0, fontSize: 15 }}>Compromisos de pago</h2>
        <span className="sub">Acuerdos del cliente para pagar un comprobante en una fecha (seguimiento de cobranza)</span>
      </div>
      <Toolbar count={res.loading ? 'Cargando…' : `${rows.length}${meta?.has_more ? '+' : ''} en esta página`}>
        <SearchBox value={q} onChange={setQ} label="Buscar compromisos" placeholder="Cliente o comprobante" />
        <Select value={status} onChange={(v) => { setStatus(v); setCursor(null); }} label="Estado" options={[['', 'Todos'], ['open', 'Vigentes'], ['kept', 'Cumplidos'], ['broken', 'Incumplidos']]} />
        {canCreate ? <button type="button" className="btn sm primary" onClick={() => setCreating(true)}><Icon name="plus" size="sm" /> Nuevo compromiso</button> : null}
        <button type="button" className="btn sm" onClick={res.reload}><Icon name="refresh" size="sm" /> Actualizar</button>
      </Toolbar>
      {res.error ? (
        <div className="card-b"><Note kind="warn" icon="tri" role="alert">No se pudo cargar: {errorText(res.error)} <button type="button" className="btn sm" onClick={res.reload}>Reintentar</button></Note></div>
      ) : !res.loading && !rows.length ? (
        <EmptyState title="Sin compromisos" text="Registra un compromiso cuando un cliente acuerde pagar un comprobante en una fecha." />
      ) : (
        <>
          <DataTable columns={columns} rows={rows} rowKey={(p) => p.id} caption="Compromisos de pago" />
          <div className="card-b" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="btn sm" disabled={res.loading || !meta?.prev_cursor} onClick={() => setCursor(meta?.prev_cursor ?? null)}>Anterior</button>
            <button type="button" className="btn sm" disabled={res.loading || !meta?.next_cursor} onClick={() => setCursor(meta?.next_cursor ?? null)}>Siguiente</button>
          </div>
        </>
      )}
      {creating ? <CreatePromiseModal onClose={() => setCreating(false)} onSaved={() => { setCreating(false); res.reload(); }} /> : null}
    </section>
  );
}

const INVOICE_STATUS_LABEL = (s: string): string => ({ issued: 'Emitido', partially_paid: 'Pagado parcial', overdue: 'Vencido' } as Record<string, string>)[s] ?? s;

function CreatePromiseModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { toast } = useApp();
  const [q, setQ] = useState('');
  const [qDeb, setQDeb] = useState('');
  const [picked, setPicked] = useState<Invoice | null>(null);
  const [date, setDate] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const maxDate = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  useEffect(() => {
    const t = setTimeout(() => setQDeb(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const search = useLoad(() => (qDeb ? paymentsApi.list({ q: qDeb, filter: { has_balance: 'true' }, size: 8 }).then((r) => r.data) : Promise.resolve([] as Invoice[])), [qDeb]);
  const results = search.data ?? [];

  const pick = (inv: Invoice) => {
    setPicked(inv);
    setAmount(String((inv.balance_minor / 100).toFixed(2)));
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!picked || !date) return;
    setBusy(true);
    try {
      await paymentsApi.createPromise({ invoice_id: picked.id, promised_date: date, amount_minor: amount.trim() ? Math.round(Number(amount) * 100) : null, notes: notes.trim() || null });
      toast('Compromiso registrado', `${picked.number ?? ''} · vence ${fDate(date)}`);
      onSaved();
    } catch (err) {
      toast('No se pudo registrar', errorText(err), 'err');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open bare onClose={onClose} title="Nuevo compromiso de pago" sub="Elige el comprobante con saldo y la fecha acordada">
      <form className="modal-b" onSubmit={(e) => void submit(e)}>
        {picked ? (
          <div className="field full" style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}>
            <span><b className="mono">{picked.number ?? '—'}</b> · {moneyMinor(picked.balance_minor, picked.currency)} de saldo</span>
            <button type="button" className="btn sm" onClick={() => setPicked(null)}>Cambiar</button>
          </div>
        ) : (
          <>
            <label className="field full">Comprobante con saldo*<input className="input" value={q} placeholder="Buscar por número o cliente…" onChange={(e) => setQ(e.target.value)} /></label>
            {qDeb ? (
              search.loading ? <p className="sub">Buscando…</p>
              : results.length === 0 ? <p className="sub">Sin comprobantes con saldo para «{qDeb}».</p>
              : (
                <ul className="rows full">
                  {results.map((inv) => (
                    <li key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="grow"><b className="mono">{inv.number ?? '—'}</b> <span className="sub">· {INVOICE_STATUS_LABEL(inv.status)}</span><div className="sub">{moneyMinor(inv.balance_minor, inv.currency)} de saldo</div></div>
                      <button type="button" className="btn sm" onClick={() => pick(inv)}>Elegir</button>
                    </li>
                  ))}
                </ul>
              )
            ) : null}
          </>
        )}
        <label className="field">Fecha prometida*<input required type="date" className="input" value={date} max={maxDate} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="field">Monto (opcional, por defecto el saldo)<input className="input" type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
        <label className="field full">Notas<textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Acordado por teléfono, etc." /></label>
        <Note icon="info">El plazo máximo es 30 días. No altera la mora ni la suspensión; es un registro de seguimiento.</Note>
        <div className="modal-f"><button type="button" className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={busy || !picked || !date}>Registrar compromiso</button></div>
      </form>
    </Modal>
  );
}

function AgingTab() {
  const [cur, setCur] = useState('');
  const res = useLoad(() => paymentsApi.aging({ currency: cur as '' | 'PEN' | 'USD' }), [cur]);
  const rows = res.data?.data ?? [];
  return (
    <section className="card">
      <div className="card-h">
        <h2 style={{ margin: 0, fontSize: 15 }}>Antigüedad de deuda</h2>
        <span className="sub">Saldo pendiente por cliente según los días de atraso</span>
      </div>
      <Toolbar count={res.data ? `Al ${fDate(res.data.meta.as_of)}` : 'Cargando…'}>
        <Select value={cur} onChange={setCur} label="Moneda" options={[['', 'Todas las monedas'], ['PEN', 'Soles'], ['USD', 'Dólares']]} />
      </Toolbar>
      {res.error ? (
        <div className="card-b">
          <Note kind="warn" icon="tri" role="alert">
            {errorText(res.error)}
          </Note>
        </div>
      ) : !res.loading && !rows.length ? (
        <EmptyState title="Sin deuda pendiente" />
      ) : (
        <DataTable
          rows={rows}
          rowKey={(r) => `${r.customer_id}-${r.currency}`}
          caption="Antigüedad de deuda por cliente"
          columns={[
            { key: 'c', header: 'Cliente', minWidth: 160, render: (r) => (r.customer ? <a className="rowlink" href={href('cliente', r.customer.id)}>{displayName(r.customer)}</a> : '—') },
            { key: 'm', header: 'Moneda', render: (r) => r.currency },
            ...BUCKETS.map((b) => ({ key: b, header: AGING_LABELS[b], align: 'r' as const, className: 'nw', render: (r: (typeof rows)[number]) => (r.buckets[b] ? <span style={NUM}>{moneyMinor(r.buckets[b], r.currency)}</span> : <span className="sub">—</span>) })),
            { key: 't', header: 'Total', align: 'r', className: 'nw strong', render: (r) => <span style={NUM}>{moneyMinor(r.total_minor, r.currency)}</span> },
            { key: 'u', header: 'Último pago', className: 'nw', render: (r) => fDate(r.last_payment_at) },
          ]}
        />
      )}
      {res.data?.meta.totals.length ? (
        <div className="card-b" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
          {res.data.meta.totals.map((t) => (
            <span key={t.currency} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', ...NUM }}>
              <Chip kind="info">Total {t.currency}: {moneyMinor(t.total_minor, t.currency)}</Chip>
              <Chip kind={t.overdue_minor > 0 ? 'danger' : 'ok'}>Vencido: {moneyMinor(t.overdue_minor, t.currency)}</Chip>
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function NoticesTab() {
  const res = useLoad(() => paymentsApi.dunningEvents(), []);
  const rows = res.data ?? [];
  return (
    <section className="card">
      <div className="card-h">
        <h2 style={{ margin: 0, fontSize: 15 }}>Avisos de cobranza</h2>
        <span className="sub">Secuencia automática de recordatorios por comprobante</span>
      </div>
      <div className="card-b">
        <Note icon="info">Avisos registrados por el job diario según la secuencia de cobranza. Mientras no exista el canal de correo quedan «pendientes de envío».</Note>
      </div>
      {res.error ? (
        <div className="card-b">
          <Note kind="warn" icon="tri" role="alert">
            {errorText(res.error)}
          </Note>
        </div>
      ) : !res.loading && !rows.length ? (
        <EmptyState title="Sin avisos registrados" />
      ) : (
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          caption="Avisos de cobranza"
          columns={[
            { key: 'f', header: 'Programado', className: 'nw', render: (r) => fDateTime(r.scheduled_for) },
            { key: 'c', header: 'Cliente', render: (r) => r.customer_name },
            { key: 'i', header: 'Comprobante', className: 'mono', render: (r) => r.invoice_number ?? '—' },
            { key: 'e', header: 'Etapa', render: (r) => { const d = r.detail.offset_days ?? 0; return d === 0 ? 'Día del vencimiento' : d < 0 ? `${-d} días antes` : `${d} días después`; } },
            { key: 'd', header: 'Destinatario', render: (r) => r.detail.recipient ?? <span className="sub">Sin contacto de facturación</span> },
            { key: 's', header: 'Estado', render: (r) => <Chip kind={r.detail.delivery === 'pending_channel' ? 'warn' : r.status === 'failed' ? 'danger' : 'ok'}>{r.detail.delivery === 'pending_channel' ? 'Pendiente de envío' : (DUNNING_STATUS_LABELS[r.status] ?? r.status)}</Chip> },
          ]}
        />
      )}
    </section>
  );
}
