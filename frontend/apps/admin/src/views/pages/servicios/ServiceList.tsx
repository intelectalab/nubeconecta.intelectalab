/**
 * P-SRV-01 · Servicios contra la API real (franja MVP): listado con filtros y cursor,
 * ficha con precio congelado, suscripción e historial, y cambios de estado
 * (activar, suspender, reactivar, cancelar) según permisos de /me.
 *
 * Se usa como vista #servicios[/<uuid>] y embebida en la ficha del cliente
 * (`customerId` fija el filtro y oculta la cabecera).
 * Fuera de la franja: terminated / handed_over, suspensión automática por mora
 * (TODO(cobranza)) y aprovisionamiento con conectores reales.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { isProblem, newIdempotencyKey, SERVICE_STATUS_LABELS, type Service, type ServiceAction, type ServiceFilters } from '@hub/api';
import { useApp } from '../../../app/context';
import { useViewState } from '../../../app/storage';
import { href } from '../../../app/routeMeta';
import { DataTable, type Column } from '../../../components/DataTable';
import { Icon } from '../../../components/Icon';
import { Sheet } from '../../../components/Modal';
import { Chip, EmptyState, Kv, Note, PageHead, SearchBox, Select, Toolbar } from '../../../components/ui';
import { displayName, errorText, fDate, fDateTime, isUuid, moneyMinor, useCan, useLoad } from '../clientes/shared';
import { cycleLabel, MVP_SERVICE_STATUSES, SERVICE_ACTIONS, SERVICE_CHIP, servicesApi } from './shared';

const PER = 25;

export const servicePrice = (s: Service) => (s.price.unit_price_minor !== null && s.price.currency ? moneyMinor(s.price.unit_price_minor, s.price.currency) : '—');

export default function ServiceList({ param, customerId }: { param?: string | null; customerId?: string }) {
  const embedded = !!customerId;
  const ns = embedded ? `srv.c.${customerId}` : 'srv.api'; // filtros por cliente: no se comparten entre fichas
  const [q, setQ] = useViewState(`${ns}.q`, '');
  const [st, setSt] = useViewState(`${ns}.st`, '');
  const [from, setFrom] = useViewState(`${ns}.from`, '');
  const [to, setTo] = useViewState(`${ns}.to`, '');
  const [sort, setSort] = useViewState(`${ns}.sort`, '-created_at');
  const [cursor, setCursor] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(isUuid(param) ? param : null);

  // #servicios/<uuid> abre la ficha (p. ej. desde el pedido); otro texto se usa como búsqueda.
  useEffect(() => {
    if (!param) return;
    if (isUuid(param)) setOpenId(param);
    else setQ(param);
    setCursor(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [param]);

  const filter = useMemo<ServiceFilters>(() => ({ status: st as ServiceFilters['status'], customer_id: customerId, due_from: from || undefined, due_to: to || undefined }), [st, customerId, from, to]);
  const res = useLoad(() => servicesApi.list({ q: q.trim() || undefined, filter, sort, cursor, size: PER }), [q, filter, sort, cursor]);
  const rows = res.data?.data ?? [];
  const meta = res.data?.meta;
  const filtered = !!(q || st || from || to);

  const upd = (f: (v: string) => void) => (v: string) => {
    f(v);
    setCursor(null);
  };
  const clear = () => {
    setQ('');
    setSt('');
    setFrom('');
    setTo('');
    setCursor(null);
  };

  const columns: Column<Service>[] = [
    {
      key: 'c',
      header: 'Servicio',
      minWidth: 200,
      render: (s) => (
        <>
          <button type="button" className="rowlink" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', textAlign: 'left' }} onClick={() => setOpenId(s.id)}>
            {s.label}
          </button>
          <div className="sub mono">{s.code}</div>
        </>
      ),
    },
    ...(embedded
      ? []
      : [
          {
            key: 'cl',
            header: 'Cliente',
            minWidth: 180,
            render: (s: Service) =>
              s.customer ? (
                <>
                  <a className="rowlink" href={href('cliente', s.customer.id)}>
                    {displayName(s.customer)}
                  </a>
                  <div className="sub mono">{s.customer.code}</div>
                </>
              ) : (
                '—'
              ),
          },
        ]),
    { key: 's', header: 'Estado', render: (s) => <Chip kind={SERVICE_CHIP[s.status]}>{SERVICE_STATUS_LABELS[s.status]}</Chip> },
    { key: 'cy', header: 'Ciclo', className: 'nw', render: (s) => cycleLabel(s.cycle) },
    { key: 'p', header: 'Precio', align: 'r', className: 'nw strong', render: servicePrice },
    { key: 'v', header: 'Vence', className: 'nw', render: (s) => fDate(s.commercial_due_date) },
  ];

  return (
    <>
      {embedded ? null : <PageHead crumbs={[['Operación', 'servicios'], ['Servicios']]} title="Servicios" sub="Servicios contratados por los clientes, creados al aprobar cada pedido." />}
      <section className="card">
        <Toolbar count={res.loading ? 'Cargando…' : `${rows.length}${meta?.has_more ? '+' : ''} en esta página`}>
          {embedded ? null : <SearchBox value={q} onChange={upd(setQ)} label="Buscar servicios" placeholder="Código, nombre o cliente" />}
          <Select value={st} onChange={upd(setSt)} label="Estado" options={[['', 'Todos los estados'], ...MVP_SERVICE_STATUSES.map((s): [string, string] => [s, SERVICE_STATUS_LABELS[s]])]} />
          <label className="sub" style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
            Vence desde
            <input className="input" type="date" value={from} onChange={(e) => upd(setFrom)(e.target.value)} />
          </label>
          <label className="sub" style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
            hasta
            <input className="input" type="date" value={to} onChange={(e) => upd(setTo)(e.target.value)} />
          </label>
          <Select value={sort} onChange={upd(setSort)} label="Orden" options={[['-created_at', 'Más recientes'], ['created_at', 'Más antiguos'], ['commercial_due_date', 'Próximos a vencer'], ['code', 'Código']]} />
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
            title={filtered ? 'Sin servicios que coincidan' : 'Aún no hay servicios'}
            text={filtered ? 'Ajuste los filtros.' : 'Los servicios se crean al aprobar un pedido.'}
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
            <DataTable columns={columns} rows={rows} rowKey={(s) => s.id} caption="Servicios" />
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
      {openId ? <ServiceSheet id={openId} onClose={() => setOpenId(null)} onChanged={res.reload} /> : null}
    </>
  );
}

/** Ficha del servicio: datos, suscripción, historial y transiciones permitidas. */
export function ServiceSheet({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged?: () => void }) {
  const { toast } = useApp();
  const can = useCan();
  const res = useLoad(() => servicesApi.get(id), [id]);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<ServiceAction | null>(null);
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const idem = useRef<Record<ServiceAction, string>>({ activate: newIdempotencyKey(), suspend: newIdempotencyKey(), reactivate: newIdempotencyKey(), cancel: newIdempotencyKey() });
  const s = res.data;
  const actions = s ? SERVICE_ACTIONS.filter((a) => a.from.includes(s.status) && can(a.perm)) : [];
  const current = SERVICE_ACTIONS.find((a) => a.action === pending);

  const run = async (action: ServiceAction) => {
    if (!s) return;
    const def = SERVICE_ACTIONS.find((a) => a.action === action);
    if (def?.reason && reason.trim().length < 3) {
      setMsg('Indique el motivo (mínimo 3 caracteres).');
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const next = await servicesApi.transition(s.id, action, def?.reason ? reason.trim() : undefined, s.version, idem.current[action]);
      idem.current[action] = newIdempotencyKey();
      res.setData(next);
      setPending(null);
      setReason('');
      toast(`Servicio: ${SERVICE_STATUS_LABELS[next.status].toLowerCase()}`, `${next.code} · ${next.label}`, next.status === 'active' ? 'ok' : 'warn');
      onChanged?.();
    } catch (e) {
      if (isProblem(e) && e.status >= 400 && e.status < 500) idem.current[action] = newIdempotencyKey();
      setMsg(errorText(e));
      if (isProblem(e) && e.code === 'version_conflict') res.reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={s ? s.label : 'Servicio'}
      sub={s ? <Chip kind={SERVICE_CHIP[s.status]}>{SERVICE_STATUS_LABELS[s.status]}</Chip> : undefined}
      footer={
        actions.length && !pending ? (
          <>
            {actions.map((a) => (
              <button
                key={a.action}
                type="button"
                className={a.danger ? 'btn' : a.action === 'activate' || a.action === 'reactivate' ? 'btn primary' : 'btn'}
                disabled={busy}
                onClick={() => {
                  setMsg(null);
                  if (a.reason) setPending(a.action);
                  else void run(a.action);
                }}
              >
                {busy ? 'Procesando…' : a.label}
              </button>
            ))}
          </>
        ) : undefined
      }
    >
      {res.error ? (
        <Note kind="warn" icon="tri" role="alert">
          {errorText(res.error)}
        </Note>
      ) : !s ? (
        <p className="sub">Cargando…</p>
      ) : (
        <>
          <Kv
            items={[
              ['Código', <span key="c" className="mono">{s.code}</span>],
              ['Cliente', s.customer ? <a href={href('cliente', s.customer.id)}>{displayName(s.customer)}</a> : '—'],
              ['Producto', s.product?.name ?? '—'],
              ['Plan', s.plan ? `${s.plan.name} · ${cycleLabel(s.plan.cycle)}` : '—'],
              ['Precio congelado', `${servicePrice(s)} × ${Number(s.price.quantity).toLocaleString('es-PE')}`],
              ['Inicio', fDate(s.starts_on)],
              ['Vencimiento comercial', fDate(s.commercial_due_date)],
              ['Renovación automática', s.auto_renew ? 'Sí' : 'No'],
              ['Pedido de origen', s.order_id ? <a href={href('pedidos', s.order_id)}>Ver pedido</a> : '—'],
            ]}
          />
          {s.subscription ? (
            <>
              <h3 style={{ margin: '16px 0 8px' }}>Suscripción</h3>
              <Kv
                items={[
                  ['Estado', s.subscription.status === 'active' ? 'Activa' : s.subscription.status === 'paused' ? 'En pausa' : 'Cancelada'],
                  ['Ciclo', cycleLabel(s.subscription.cycle)],
                  ['Importe', moneyMinor(s.subscription.price_minor, s.subscription.currency)],
                  ['Próxima factura', fDate(s.subscription.next_invoice_date)],
                ]}
              />
            </>
          ) : s.status === 'pending' ? (
            <Note icon="info" style={{ marginTop: 12 }}>
              Pendiente de aprovisionar: al activarlo se crea la suscripción y empieza a renovarse.
            </Note>
          ) : null}
          {s.history?.length ? (
            <>
              <h3 style={{ margin: '16px 0 8px' }}>Historial</h3>
              <DataTable
                rows={s.history}
                rowKey={(h, i) => `${h.occurred_at}-${i}`}
                caption="Historial de estados"
                columns={[
                  { key: 'd', header: 'Fecha', className: 'nw', render: (h) => fDateTime(h.occurred_at) },
                  { key: 's', header: 'Estado', render: (h) => SERVICE_STATUS_LABELS[h.to_status] },
                  { key: 'r', header: 'Motivo', render: (h) => <span className="sub">{h.reason || (h.trigger_source === 'order' ? 'Aprobación del pedido' : '—')}</span> },
                ]}
              />
            </>
          ) : null}
          {can('services.service.update') ? <AccessForm service={s} onSaved={res.setData} /> : null}
          {current ? (
            <label className="field full" htmlFor="srv-reason" style={{ marginTop: 12 }}>
              Motivo para «{current.label.toLowerCase()}» *
              <textarea className="input" id="srv-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
              <span style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <button type="button" className="btn sm" onClick={() => setPending(null)}>
                  Volver
                </button>
                <button type="button" className={current.danger ? 'btn sm danger' : 'btn sm primary'} disabled={busy} onClick={() => void run(current.action)}>
                  {busy ? 'Procesando…' : `Confirmar: ${current.label.toLowerCase()}`}
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

/** Acceso del cliente al servicio (URL del panel + guía). Lo ve el cliente en su portal. */
function AccessForm({ service, onSaved }: { service: Service; onSaved: (s: Service) => void }) {
  const { toast } = useApp();
  const [url, setUrl] = useState(service.access?.url ?? '');
  const [label, setLabel] = useState(service.access?.label ?? '');
  const [notes, setNotes] = useState(service.access?.notes ?? '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const next = await servicesApi.setAccess(service.id, { url: url.trim() || null, label: label.trim() || null, notes: notes.trim() || null }, service.version);
      onSaved(next);
      toast('Acceso actualizado', 'El cliente lo verá en su portal.');
    } catch (e) {
      toast('No se pudo guardar', errorText(e), 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h3 style={{ margin: '16px 0 8px' }}>Acceso del cliente</h3>
      <p className="sub" style={{ marginTop: 0 }}>URL del panel y guía que verá el cliente en su portal. Las credenciales se entregan por la Bóveda (enlace de un solo uso), no aquí.</p>
      <label className="field full">URL del panel<input className="input" type="url" value={url} placeholder="https://panel.ejemplo.com" onChange={(e) => setUrl(e.target.value)} /></label>
      <label className="field full">Etiqueta del botón<input className="input" value={label} placeholder="Acceder a tu servicio" onChange={(e) => setLabel(e.target.value)} /></label>
      <label className="field full">Guía / notas<textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
      <button type="button" className="btn primary sm" disabled={busy} onClick={() => void save()}>{busy ? 'Guardando…' : 'Guardar acceso'}</button>
    </>
  );
}
