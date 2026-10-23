/**
 * P-ORD-01 · Pedidos contra la API real (franja MVP): listado con filtros y cursor,
 * alta para un cliente real y ficha con aprobar / anular según permisos de /me.
 *
 * Tras aprobar, la ficha enlaza a los servicios (M-SRV) y al comprobante (M-BIL)
 * generados por OrderApproved. TODO(cobranza): pago del pedido.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { INVOICE_STATUS_LABELS, INVOICE_TYPE_LABELS, isProblem, newIdempotencyKey, ORDER_STATUS_LABELS, SERVICE_STATUS_LABELS, type Order, type OrderFilters, type OrderStatus } from '@hub/api';
import { useApp } from '../../../app/context';
import { useViewState } from '../../../app/storage';
import { href } from '../../../app/routeMeta';
import { DataTable, type Column } from '../../../components/DataTable';
import { Icon } from '../../../components/Icon';
import { Sheet } from '../../../components/Modal';
import { Chip, EmptyState, Kv, Note, PageHead, Select, Toolbar } from '../../../components/ui';
import { displayName, errorText, fDateTime, isUuid, moneyMinor, useCan, useLoad } from '../clientes/shared';
import { SERVICE_CHIP, servicesApi } from '../servicios/shared';
import { INVOICE_CHIP, invoiceNumber, invoicesApi } from '../facturas/shared';
import { OrderForm } from './OrderForm';
import { ORDER_CHIP, ordersApi } from './shared';

const PER = 25;
const MVP_STATUSES: OrderStatus[] = ['draft', 'approved', 'cancelled'];

export default function OrderList({ param }: { param?: string | null }) {
  const { toast } = useApp();
  const can = useCan();
  const [st, setSt] = useViewState('ped.api.st', '');
  const [cur, setCur] = useViewState('ped.api.cur', '');
  const [from, setFrom] = useViewState('ped.api.from', '');
  const [to, setTo] = useViewState('ped.api.to', '');
  const [sort, setSort] = useViewState('ped.api.sort', '-created_at');
  const [cursor, setCursor] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(isUuid(param) ? param : null);
  // #pedidos/<uuid> abre la ficha (enlace desde el servicio o el comprobante).
  useEffect(() => {
    if (isUuid(param)) setOpenId(param);
  }, [param]);

  const filter = useMemo<OrderFilters>(() => ({ status: st as OrderFilters['status'], currency: cur as OrderFilters['currency'], created_from: from || undefined, created_to: to || undefined }), [st, cur, from, to]);
  const res = useLoad(() => ordersApi.list({ filter, sort, cursor, size: PER }), [filter, sort, cursor]);
  const rows = res.data?.data ?? [];
  const meta = res.data?.meta;
  const filtered = !!(st || cur || from || to);

  const upd = (f: (v: string) => void) => (v: string) => {
    f(v);
    setCursor(null);
  };

  const columns: Column<Order>[] = [
    {
      key: 'n',
      header: 'Pedido',
      className: 'nw',
      render: (o) => (
        <button type="button" className="rowlink mono" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer' }} onClick={() => setOpenId(o.id)}>
          {o.number}
        </button>
      ),
    },
    {
      key: 'c',
      header: 'Cliente',
      minWidth: 200,
      render: (o) =>
        o.customer ? (
          <>
            <a className="rowlink" href={href('cliente', o.customer.id)}>
              {displayName(o.customer)}
            </a>
            <div className="sub mono">{o.customer.code}</div>
          </>
        ) : (
          '—'
        ),
    },
    { key: 'i', header: 'Detalle', render: (o) => <span className="sub">{o.items.filter((i) => i.config?.kind !== 'setup_fee').map((i) => i.description).join(' · ') || '—'}</span> },
    { key: 's', header: 'Estado', render: (o) => <Chip kind={ORDER_CHIP[o.status]}>{ORDER_STATUS_LABELS[o.status]}</Chip> },
    { key: 't', header: 'Total', align: 'r', className: 'nw strong', render: (o) => moneyMinor(o.total_minor, o.currency) },
    { key: 'd', header: 'Creado', className: 'nw', render: (o) => fDateTime(o.created_at) },
  ];

  return (
    <>
      <PageHead
        crumbs={[['Operación', 'pedidos'], ['Pedidos']]}
        title="Pedidos"
        sub="Ventas registradas por el equipo comercial"
        actions={
          can('orders.order.create') ? (
            <button type="button" className="btn primary" onClick={() => setCreating(true)}>
              <Icon name="plus" size="sm" />
              Nuevo pedido
            </button>
          ) : null
        }
      />
      <section className="card">
        <Toolbar count={res.loading ? 'Cargando…' : `${rows.length}${meta?.has_more ? '+' : ''} en esta página`}>
          <Select value={st} onChange={upd(setSt)} label="Estado" options={[['', 'Todos los estados'], ...MVP_STATUSES.map((s): [string, string] => [s, ORDER_STATUS_LABELS[s]])]} />
          <Select value={cur} onChange={upd(setCur)} label="Moneda" options={[['', 'Todas las monedas'], ['PEN', 'Soles'], ['USD', 'Dólares']]} />
          <label className="sub" style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
            Desde
            <input className="input" type="date" value={from} onChange={(e) => upd(setFrom)(e.target.value)} />
          </label>
          <label className="sub" style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
            Hasta
            <input className="input" type="date" value={to} onChange={(e) => upd(setTo)(e.target.value)} />
          </label>
          <Select value={sort} onChange={upd(setSort)} label="Orden" options={[['-created_at', 'Más recientes'], ['created_at', 'Más antiguos'], ['-total_minor', 'Mayor total'], ['number', 'Número']]} />
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
            title={filtered ? 'Sin pedidos que coincidan' : 'Aún no hay pedidos'}
            text={filtered ? 'Ajuste los filtros.' : 'Cree el primer pedido para un cliente.'}
            action={
              filtered ? (
                <button
                  type="button"
                  className="btn sm"
                  onClick={() => {
                    setSt('');
                    setCur('');
                    setFrom('');
                    setTo('');
                    setCursor(null);
                  }}
                >
                  Limpiar filtros
                </button>
              ) : undefined
            }
          />
        ) : (
          <>
            <DataTable columns={columns} rows={rows} rowKey={(o) => o.id} caption="Pedidos" />
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
      {creating ? (
        <OrderForm
          onClose={() => setCreating(false)}
          onSaved={(o) => {
            setCreating(false);
            toast('Pedido creado', `${o.number} · ${moneyMinor(o.total_minor, o.currency)}`);
            res.reload();
            setOpenId(o.id);
          }}
        />
      ) : null}
      {openId ? <OrderSheet id={openId} onClose={() => setOpenId(null)} onChanged={res.reload} /> : null}
    </>
  );
}

/** Ficha del pedido: líneas, totales del backend y transiciones permitidas. */
function OrderSheet({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { toast } = useApp();
  const can = useCan();
  const res = useLoad(() => ordersApi.get(id), [id]);
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const idem = useRef({ approve: newIdempotencyKey(), cancel: newIdempotencyKey() });
  const o = res.data;

  const run = async (kind: 'approve' | 'cancel') => {
    if (!o) return;
    if (kind === 'cancel' && !reason.trim()) {
      setMsg('Indique el motivo de la anulación.');
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const next = kind === 'approve' ? await ordersApi.approve(o.id, o.version, idem.current.approve) : await ordersApi.cancel(o.id, reason.trim(), o.version, idem.current.cancel);
      res.setData(next);
      setCancelling(false);
      toast(kind === 'approve' ? 'Pedido aprobado' : 'Pedido anulado', next.number);
      onChanged();
    } catch (e) {
      if (isProblem(e) && e.status >= 400 && e.status < 500) idem.current[kind] = newIdempotencyKey();
      setMsg(errorText(e));
      if (isProblem(e) && e.code === 'version_conflict') res.reload();
    } finally {
      setBusy(false);
    }
  };

  const canApprove = !!o && o.status === 'draft' && can('orders.order.approve');
  const canCancel = !!o && (o.status === 'draft' || o.status === 'approved') && can('orders.order.update');
  const lines = o?.items ?? [];

  return (
    <Sheet
      open
      onClose={onClose}
      title={o ? `Pedido ${o.number}` : 'Pedido'}
      sub={o ? <Chip kind={ORDER_CHIP[o.status]}>{ORDER_STATUS_LABELS[o.status]}</Chip> : undefined}
      footer={
        canApprove || canCancel ? (
          <>
            {canCancel && !cancelling ? (
              <button type="button" className="btn" disabled={busy} onClick={() => setCancelling(true)}>
                Anular
              </button>
            ) : null}
            {canApprove ? (
              <button type="button" className="btn primary" disabled={busy} onClick={() => void run('approve')}>
                {busy ? 'Procesando…' : 'Aprobar pedido'}
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
      ) : !o ? (
        <p className="sub">Cargando…</p>
      ) : (
        <>
          <Kv
            items={[
              ['Cliente', o.customer ? <a href={href('cliente', o.customer.id)}>{displayName(o.customer)}</a> : '—'],
              ['Canal', o.channel === 'online' ? 'En línea' : 'Comercial'],
              ['Moneda', o.currency],
              ['Creado', fDateTime(o.created_at)],
              ['Aprobado', o.approved_at ? fDateTime(o.approved_at) : '—'],
            ]}
          />
          <h3 style={{ margin: '16px 0 8px' }}>Líneas</h3>
          <DataTable
            rows={lines}
            rowKey={(i) => i.id}
            caption="Líneas del pedido"
            columns={[
              { key: 'd', header: 'Descripción', render: (i) => (<>{i.description}{i.config?.tax?.treatment === 'export' ? <div className="sub">Exportación · sin IGV</div> : null}</>) },
              { key: 'q', header: 'Cant.', align: 'r', className: 'num', render: (i) => Number(i.quantity).toLocaleString('es-PE') },
              { key: 'u', header: 'Precio', align: 'r', className: 'nw', render: (i) => moneyMinor(i.unit_price_minor, i.currency) },
              { key: 'a', header: 'Importe', align: 'r', className: 'nw strong', render: (i) => moneyMinor(i.amount_minor, i.currency) },
            ]}
          />
          <Kv
            style={{ marginTop: 12 }}
            items={[
              ['Subtotal', moneyMinor(o.subtotal_minor, o.currency)],
              [`IGV${o.tax_rate_percent ? ` (${Number(o.tax_rate_percent)} %)` : ''}`, moneyMinor(o.tax_minor, o.currency)],
              [<b key="t">Total</b>, <b key="v">{moneyMinor(o.total_minor, o.currency)}</b>],
            ]}
          />
          {o.notes ? (
            <p className="sub" style={{ marginTop: 10 }}>
              {o.notes}
            </p>
          ) : null}
          {o.status !== 'draft' && o.status !== 'cancelled' ? <OrderOutputs orderId={o.id} /> : null}
          {cancelling ? (
            <label className="field full" htmlFor="os-reason" style={{ marginTop: 12 }}>
              Motivo de la anulación *
              <textarea className="input" id="os-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
              <span style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <button type="button" className="btn sm" onClick={() => setCancelling(false)}>
                  Volver
                </button>
                <button type="button" className="btn sm danger" disabled={busy} onClick={() => void run('cancel')}>
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

/** Servicios y comprobante generados al aprobar el pedido (filter[order_id]). */
function OrderOutputs({ orderId }: { orderId: string }) {
  const can = useCan();
  const canSrv = can('services.service.view');
  const canInv = can('billing.invoice.view');
  const srv = useLoad(() => (canSrv ? servicesApi.list({ filter: { order_id: orderId }, size: 50 }).then((r) => r.data) : Promise.resolve([])), [orderId, canSrv]);
  const inv = useLoad(() => (canInv ? invoicesApi.list({ filter: { order_id: orderId }, size: 10 }).then((r) => r.data) : Promise.resolve([])), [orderId, canInv]);
  if (!canSrv && !canInv) return null;
  return (
    <>
      <h3 style={{ margin: '16px 0 8px' }}>Generado al aprobar</h3>
      {srv.error || inv.error ? (
        <Note kind="warn" icon="tri" role="alert">
          {errorText(srv.error ?? inv.error)}
        </Note>
      ) : srv.loading || inv.loading ? (
        <p className="sub">Cargando…</p>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
          {(srv.data ?? []).map((s) => (
            <li key={s.id}>
              Servicio <a href={href('servicios', s.id)}>{s.code} · {s.label}</a> <Chip kind={SERVICE_CHIP[s.status]}>{SERVICE_STATUS_LABELS[s.status]}</Chip>
            </li>
          ))}
          {(inv.data ?? []).map((i) => (
            <li key={i.id}>
              {INVOICE_TYPE_LABELS[i.type]} <a href={href('facturas', i.id)}>{invoiceNumber(i)}</a> · {moneyMinor(i.total_minor, i.currency)} <Chip kind={INVOICE_CHIP[i.status]}>{INVOICE_STATUS_LABELS[i.status]}</Chip>
            </li>
          ))}
          {canSrv && !srv.data?.length ? <li className="sub">Sin servicios generados.</li> : null}
          {canInv && !inv.data?.length ? <li className="sub">Sin comprobante generado.</li> : null}
          {/* TODO(cobranza): pago del pedido y su validación. */}
        </ul>
      )}
    </>
  );
}
