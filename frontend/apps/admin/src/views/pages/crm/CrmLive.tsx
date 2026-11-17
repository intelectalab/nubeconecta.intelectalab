/**
 * CRM conectado a la API (/api/v1/admin/leads, M-SAL): tablero por etapas
 * (arrastrar entre columnas o «Mover a…») y lista con filtros, panel de detalle
 * con datos, origen, actividades e historial, y las acciones ganar (convertir en
 * cliente), perder (motivo obligatorio), asignar responsable y registrar actividad.
 * El modo demo (VITE_DEMO=1) sigue en CrmView con datos de ejemplo.
 */
import { useEffect, useMemo, useState, type DragEvent } from 'react';
import { isProblem, LEAD_ACTIVITY_LABELS, LEAD_STATUS_LABELS, type Lead, type LeadActivityType, type LeadBoardColumn, type LeadDetail, type LeadStatus, type PipelineStage } from '@hub/api';
import { useApp } from '../../../app/context';
import type { ViewProps } from '../../../app/routes';
import { useViewState } from '../../../app/storage';
import { parseFilterParam } from '../../../app/filterParam';
import { hub } from '../../../auth/client';
import { DataTable, type Column } from '../../../components/DataTable';
import { Icon } from '../../../components/Icon';
import { Sheet } from '../../../components/Modal';
import { Chip, EmptyState, Kv, Note, PageHead, SearchBox, Select, Seg, StatLine, Toolbar, type ChipKind } from '../../../components/ui';
import { errorText, fDate, fDateTime, isUuid, moneyMinor, useCan, useLoad } from '../clientes/shared';

const api = hub.sales.leads;
const PER = 25;

const STATUS_CHIP: Record<LeadStatus, ChipKind> = { open: 'info', won: 'ok', lost: 'danger' };
const STATUS_FILTER: [string, string][] = [
  ['open', 'Abiertos'],
  ['', 'Todos'],
  ['won', 'Ganados'],
  ['lost', 'Perdidos'],
];
const UTM_LABEL: Record<string, string> = { source: 'Fuente', medium: 'Medio', campaign: 'Campaña', term: 'Término', content: 'Contenido' };
const SOURCE_LABEL: Record<string, string> = { board_drag: 'tablero', form: 'formulario', created: 'alta', conversion: 'conversión', automation: 'automatización', api: 'API' };

const money = (l: Pick<Lead, 'estimated_amount_minor' | 'currency'>) => (l.estimated_amount_minor != null && l.currency ? moneyMinor(l.estimated_amount_minor, l.currency) : '—');
const company = (l: Lead) => l.company_name || l.name;

export default function CrmLive({ param }: ViewProps) {
  const { toast, dialogs, dataVersion, href } = useApp();
  const can = useCan();
  const canUpdate = can('sales.lead.update');
  const canCreate = can('sales.lead.create');
  const [view, setView] = useViewState<'kanban' | 'lista'>('crm.live.view', 'kanban');
  const [q, setQ] = useViewState('crm.live.q', '');
  const [status, setStatus] = useViewState('crm.live.st', 'open');
  const [stageF, setStageF] = useViewState('crm.live.stage', '');
  const [channelF, setChannelF] = useViewState('crm.live.ch', '');
  const [ownerF, setOwnerF] = useViewState('crm.live.ow', '');
  const [cursor, setCursor] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(isUuid(param) ? param : null);
  const [tick, setTick] = useState(0);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  useEffect(() => {
    if (isUuid(param)) setOpenId(param);
    const f = parseFilterParam(param);
    if (f) {
      // Token de filtro (f~st=open,stage=…,ch=…,ow=…): abre la lista ya filtrada.
      setStatus(f.st ?? 'open');
      setStageF(f.stage ?? '');
      setChannelF(f.ch ?? '');
      setOwnerF(f.ow ?? '');
      setQ(f.q ?? '');
      setCursor(null);
      setView('lista');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [param]);

  const opts = useLoad(() => api.options(), []);
  const board = useLoad(() => (view === 'kanban' ? api.board({ owner_id: ownerF && ownerF !== 'none' ? ownerF : undefined }) : Promise.resolve(null)), [view, ownerF, dataVersion, tick]);
  const list = useLoad(
    () =>
      view === 'lista'
        ? api.list({ q: q.trim() || undefined, filter: { status: status || undefined, stage_id: stageF || undefined, channel_id: channelF || undefined, owner_id: ownerF || undefined }, cursor, size: PER })
        : Promise.resolve(null),
    [view, q, status, stageF, channelF, ownerF, cursor, dataVersion, tick],
  );
  const reload = () => setTick((t) => t + 1);
  const stages: PipelineStage[] = opts.data?.stages ?? [];
  const openStages = stages.filter((s) => s.outcome === 'open');

  const cols = board.data ?? [];
  const boardLeads = useMemo(() => cols.flatMap((c) => c.leads.filter((l) => (q.trim() ? [l.name, l.company_name, l.email].some((x) => (x ?? '').toLowerCase().includes(q.trim().toLowerCase())) : true))), [cols, q]);
  const totals = useMemo(() => {
    const out: Record<string, number> = {};
    cols.forEach((c) => Object.entries(c.totals).forEach(([cur, v]) => (out[cur] = (out[cur] ?? 0) + v)));
    return out;
  }, [cols]);

  /** Ejecuta una llamada de la API con aviso de error; ante un conflicto de versión recarga. */
  const run = async <T,>(fn: () => Promise<T>, okTitle?: string, okSub?: string): Promise<T | null> => {
    try {
      const r = await fn();
      if (okTitle) toast(okTitle, okSub);
      reload();
      return r;
    } catch (e) {
      toast('No se pudo completar la acción', errorText(e), 'err');
      if (isProblem(e) && (e.code === 'version_conflict' || e.code === 'lead_closed')) reload();
      return null;
    }
  };

  const loseDialog = (l: Lead, source: 'board_drag' | 'form' = 'form') =>
    dialogs.form({
      title: 'Marcar como perdido',
      sub: company(l),
      fields: [{ id: 'reason', label: 'Motivo', type: 'textarea', req: true, full: true, ph: 'Por qué se perdió (precio, eligió a otro proveedor, sin respuesta…)' }],
      submit: 'Marcar perdido',
      validate: (v) => (v.reason.trim() ? null : 'El motivo es obligatorio.'),
      onSubmit: (v) => {
        void run(() => api.lose(l.id, l.version, v.reason.trim(), source), 'Prospecto perdido', company(l));
      },
    });

  const convertDialog = (l: Lead) =>
    dialogs.form({
      title: 'Ganar y convertir en cliente',
      sub: company(l),
      pre: (
        <Note icon="info">
          Se crea el cliente con su contacto principal. Si el correo o el documento ya pertenecen a un cliente, se vincula en lugar de duplicar. No se da acceso al portal: se otorga a mano desde la ficha del contacto.
        </Note>
      ),
      fields: [
        { id: 'tax_id_type', label: 'Tipo de documento (opcional)', type: 'select', options: [['', 'Sin documento'], ['ruc', 'RUC'], ['dni', 'DNI'], ['ce', 'Carné de extranjería'], ['passport', 'Pasaporte']], value: '' },
        { id: 'tax_id', label: 'Número de documento', value: '' },
      ],
      submit: 'Ganar y crear cliente',
      validate: (v) => (v.tax_id_type && !v.tax_id.trim() ? 'Indique el número de documento.' : null),
      onSubmit: (v) => {
        void run(
          () => api.convert(l.id, { version: l.version, ...(v.tax_id_type && v.tax_id.trim() ? { tax_id_type: v.tax_id_type, tax_id: v.tax_id.trim() } : {}) }),
          'Prospecto ganado',
          `${company(l)} · cliente creado o vinculado`,
        );
      },
    });

  /** Mover una tarjeta: etapas abiertas por la API; ganado y perdido abren su diálogo. */
  const moveTo = (l: Lead, stage: PipelineStage, source: 'board_drag' | 'form') => {
    if (stage.id === l.pipeline_stage_id) return;
    if (stage.outcome === 'won') return convertDialog(l);
    if (stage.outcome === 'lost') return loseDialog(l, source);
    void run(() => api.move(l.id, l.version, stage.id, source), `Movido a «${stage.name}»`, company(l));
  };

  const newLeadDialog = () =>
    dialogs.form({
      title: 'Nuevo prospecto',
      fields: [
        { id: 'name', label: 'Contacto', req: true },
        { id: 'company_name', label: 'Empresa' },
        { id: 'email', label: 'Correo', type: 'email' },
        { id: 'phone', label: 'Teléfono', type: 'tel' },
        { id: 'brand_id', label: 'Marca', type: 'select', options: (opts.data?.brands ?? []).map((b) => [b.id, b.name] as [string, string]), value: opts.data?.brands[0]?.id ?? '' },
        { id: 'lead_channel_id', label: 'Canal de origen', type: 'select', options: (opts.data?.channels ?? []).map((c) => [c.id, c.name] as [string, string]), value: opts.data?.channels.find((c) => c.code === 'manual')?.id ?? '' },
        { id: 'amount', label: 'Valor estimado', type: 'number', min: 0, step: '0.01' },
        { id: 'currency', label: 'Moneda', type: 'select', options: ['PEN', 'USD'], value: 'PEN' },
        { id: 'owner_id', label: 'Responsable', type: 'select', options: [['', 'Sin asignar'], ...(opts.data?.owners ?? []).map((o) => [o.id, o.name] as [string, string])], value: '' },
      ],
      submit: 'Crear prospecto',
      validate: (v) => (!v.brand_id ? 'Elija la marca.' : null),
      onSubmit: (v) => {
        void run(
          () =>
            api.create({
              name: v.name,
              company_name: v.company_name || null,
              email: v.email || null,
              phone: v.phone || null,
              brand_id: v.brand_id,
              lead_channel_id: v.lead_channel_id || null,
              owner_id: v.owner_id || null,
              ...(v.amount ? { estimated_amount_minor: Math.round(Number(v.amount) * 100), currency: v.currency as 'PEN' | 'USD' } : {}),
            }),
          'Prospecto creado',
          v.company_name || v.name,
        ).then((d) => d && setOpenId(d.id));
      },
    });

  /* ---------- Tablero ---------- */
  const dropOn = (e: DragEvent, col: LeadBoardColumn) => {
    e.preventDefault();
    setOverId(null);
    const id = e.dataTransfer.getData('text/plain') || dragId;
    setDragId(null);
    const lead = cols.flatMap((c) => c.leads).find((l) => l.id === id);
    if (lead && canUpdate) moveTo(lead, col, 'board_drag');
  };

  const kanban = (
    <div className="card-b" style={{ paddingTop: 14 }}>
      <p className="kb-help">Arrastre las tarjetas entre etapas o use el selector «Mover a…» de cada tarjeta. Al soltar en «Ganado» se convierte en cliente; en «Perdido» se pide el motivo.</p>
      <div className="kb">
        {cols.map((col) => {
          const items = col.leads.filter((l) => boardLeads.includes(l));
          const terminal = col.outcome !== 'open';
          return (
            <section
              className={`kcol${overId === col.id ? ' drop-on' : ''}`}
              key={col.id}
              aria-label={`${col.name}: ${items.length} prospectos`}
              onDragOver={(e) => {
                if (!canUpdate) return;
                e.preventDefault();
                setOverId(col.id);
              }}
              onDragLeave={() => setOverId((c) => (c === col.id ? null : c))}
              onDrop={(e) => dropOn(e, col)}
            >
              <div className="kcol-h">
                <b>
                  {col.name} <small>({items.length})</small>
                </b>
                <small>{Object.entries(col.totals).map(([cur, v]) => moneyMinor(v, cur)).join(' · ') || '—'}</small>
              </div>
              <div className="kcol-b">
                {items.length ? (
                  items.map((l) => (
                    <article
                      key={l.id}
                      className="kcard dcard"
                      tabIndex={0}
                      role="button"
                      draggable={canUpdate}
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', l.id);
                        e.dataTransfer.effectAllowed = 'move';
                        setDragId(l.id);
                      }}
                      onDragEnd={() => {
                        setDragId(null);
                        setOverId(null);
                      }}
                      aria-label={`${company(l)}, ${money(l)}, etapa ${col.name}`}
                      onClick={() => setOpenId(l.id)}
                      onKeyDown={(e) => {
                        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                          e.preventDefault();
                          setOpenId(l.id);
                        }
                      }}
                      style={dragId === l.id ? { opacity: 0.5 } : undefined}
                    >
                      <span className="meta" style={{ justifyContent: 'space-between' }}>
                        <span className="t1" style={{ color: 'var(--text)' }}>
                          {company(l)}
                        </span>
                        <span className="sub">{l.code}</span>
                      </span>
                      {l.company_name ? <span className="meta">{l.name}</span> : null}
                      <span className="meta">
                        <b className="num" style={{ color: 'var(--text)' }}>
                          {money(l)}
                        </b>
                        <Chip kind="outline">{l.channel_name ?? '—'}</Chip>
                      </span>
                      <span className="meta">
                        <Icon name="user" size="sm" />
                        {l.owner_name ?? 'Sin asignar'}
                        {l.next_follow_up_at ? ` · ${fDate(l.next_follow_up_at)}` : ''}
                      </span>
                      {canUpdate ? (
                        <select
                          className="select"
                          aria-label={`Mover ${company(l)} a…`}
                          value={l.pipeline_stage_id}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            const s = stages.find((x) => x.id === e.target.value);
                            if (s) moveTo(l, s, 'form');
                          }}
                        >
                          {stages.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      ) : null}
                    </article>
                  ))
                ) : (
                  <p className="kb-empty">{terminal ? (col.outcome === 'won' ? 'Suelte aquí para ganar' : 'Suelte aquí para perder') : 'Sin prospectos'}</p>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );

  /* ---------- Lista ---------- */
  const columns: Column<Lead>[] = useMemo(
    () => [
      { key: 'c', header: 'Código', className: 'nw mono', render: (l) => l.code },
      {
        key: 'n',
        header: 'Prospecto',
        minWidth: 190,
        render: (l) => (
          <>
            <button type="button" className="rowlink" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', textAlign: 'left' }} onClick={() => setOpenId(l.id)}>
              {company(l)}
            </button>
            {l.company_name ? <div className="sub">{l.name}</div> : null}
          </>
        ),
      },
      { key: 's', header: 'Etapa', render: (l) => <Chip kind={STATUS_CHIP[l.status]}>{l.stage_name ?? '—'}</Chip> },
      { key: 'ch', header: 'Canal', render: (l) => l.channel_name ?? '—' },
      { key: 'o', header: 'Responsable', className: 'nw', render: (l) => l.owner_name ?? <span className="sub">Sin asignar</span> },
      { key: 'v', header: 'Valor', align: 'r', className: 'num nw', render: (l) => money(l) },
      { key: 'f', header: 'Próx. seguimiento', className: 'nw', render: (l) => (l.next_follow_up_at ? fDate(l.next_follow_up_at) : <span className="sub">—</span>) },
      { key: 'cu', header: 'Cliente', className: 'nw', render: (l) => (l.customer_id ? <a href={href('cliente', l.customer_id)}>{l.customer_code}</a> : <span className="sub">—</span>) },
    ],
    [href],
  );
  const rows = list.data?.data ?? [];
  const meta = list.data?.meta;

  const listView = (
    <>
      {list.error ? (
        <div className="card-b">
          <Note kind="warn" icon="tri" role="alert">
            No se pudo cargar la lista: {errorText(list.error)}{' '}
            <button type="button" className="btn sm" onClick={list.reload}>
              Reintentar
            </button>
          </Note>
        </div>
      ) : !list.loading && !rows.length ? (
        <EmptyState icon="inbox" title="Sin prospectos" text="Ningún prospecto coincide con los filtros." />
      ) : (
        <>
          <DataTable columns={columns} rows={rows} rowKey={(l) => l.id} caption="Prospectos" />
          {meta?.prev_cursor || meta?.next_cursor ? (
            <div className="card-b" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="btn sm" disabled={list.loading || !meta?.prev_cursor} onClick={() => setCursor(meta?.prev_cursor ?? null)}>
                <Icon name="cl" size="sm" />
                Anterior
              </button>
              <button type="button" className="btn sm" disabled={list.loading || !meta?.next_cursor} onClick={() => setCursor(meta?.next_cursor ?? null)}>
                Siguiente
                <Icon name="cr" size="sm" />
              </button>
            </div>
          ) : null}
        </>
      )}
    </>
  );

  const reset = (f: (v: string) => void) => (v: string) => {
    f(v);
    setCursor(null);
  };
  const openCount = cols.reduce((a, c) => a + (c.outcome === 'open' ? c.leads.length : 0), 0);

  return (
    <>
      <PageHead
        crumbs={[['Comercial', 'crm'], ['CRM']]}
        title="CRM"
        sub="Prospectos del embudo comercial: desde la solicitud web hasta el cliente."
        actions={
          canCreate ? (
            <button type="button" className="btn primary" onClick={newLeadDialog} disabled={!opts.data}>
              <Icon name="plus" size="sm" />
              Nuevo prospecto
            </button>
          ) : undefined
        }
      />
      {view === 'kanban' ? (
        <StatLine
          items={[
            { label: 'Prospectos abiertos', value: board.data ? openCount : '—' },
            ...(Object.keys(totals).length ? Object.entries(totals).map(([cur, v]) => ({ label: `Embudo abierto (${cur})`, value: moneyMinor(v, cur) })) : [{ label: 'Embudo abierto', value: '—' }]),
          ]}
        />
      ) : null}
      <section className="card" style={{ marginBottom: 16 }} aria-labelledby="hFun">
        <div className="card-h">
          <h2 className="sec" id="hFun">
            Embudo
          </h2>
          <Seg<'kanban' | 'lista'>
            label="Vista"
            value={view}
            onChange={(v) => {
              setView(v);
              setCursor(null);
            }}
            options={[
              ['kanban', 'Kanban', 'cols'],
              ['lista', 'Lista', 'list'],
            ]}
          />
        </div>
        <Toolbar count={view === 'lista' ? (list.loading ? 'Cargando…' : `${rows.length}${meta?.has_more ? '+' : ''} prospectos`) : board.loading ? 'Cargando…' : undefined}>
          <SearchBox value={q} onChange={reset(setQ)} label="Buscar prospectos" placeholder="Nombre, correo o empresa" />
          {view === 'lista' ? (
            <>
              <Select value={status} onChange={reset(setStatus)} label="Estado" options={STATUS_FILTER} />
              <Select value={stageF} onChange={reset(setStageF)} label="Etapa" options={[['', 'Todas las etapas'], ...stages.map((s) => [s.id, s.name] as [string, string])]} />
              <Select value={channelF} onChange={reset(setChannelF)} label="Canal" options={[['', 'Todos los canales'], ...(opts.data?.channels ?? []).map((c) => [c.id, c.name] as [string, string])]} />
            </>
          ) : null}
          <Select value={ownerF} onChange={reset(setOwnerF)} label="Responsable" options={[['', 'Todos los responsables'], ...(view === 'lista' ? ([['none', 'Sin asignar']] as [string, string][]) : []), ...(opts.data?.owners ?? []).map((o) => [o.id, o.name] as [string, string])]} />
        </Toolbar>
        {view === 'kanban' ? (
          board.error ? (
            <div className="card-b">
              <Note kind="warn" icon="tri" role="alert">
                No se pudo cargar el tablero: {errorText(board.error)}{' '}
                <button type="button" className="btn sm" onClick={board.reload}>
                  Reintentar
                </button>
              </Note>
            </div>
          ) : (
            kanban
          )
        ) : (
          listView
        )}
      </section>
      {openId ? <LeadSheet id={openId} stages={openStages} onClose={() => setOpenId(null)} onChanged={reload} /> : null}
    </>
  );
}

/* =================== Panel de detalle =================== */
function LeadSheet({ id, stages, onClose, onChanged }: { id: string; stages: PipelineStage[]; onClose: () => void; onChanged: () => void }) {
  const { toast, dialogs, href } = useApp();
  const can = useCan();
  const res = useLoad(() => api.get(id), [id]);
  const opts = useLoad(() => api.options(), []);
  const [busy, setBusy] = useState(false);
  const l = res.data;
  const canUpdate = can('sales.lead.update') && l?.status === 'open';
  const canActivity = can('sales.lead_activity.create');
  const canConvert = canUpdate && can('customers.customer.create');

  const apply = async (fn: (d: LeadDetail) => Promise<LeadDetail>, okTitle: string) => {
    if (!l) return;
    setBusy(true);
    try {
      const d = await fn(l);
      res.setData(d);
      toast(okTitle, d.code);
      onChanged();
    } catch (e) {
      toast('No se pudo completar la acción', errorText(e), 'err');
      if (isProblem(e) && (e.code === 'version_conflict' || e.code === 'lead_closed')) res.reload();
    } finally {
      setBusy(false);
    }
  };

  const editDialog = () => {
    if (!l) return;
    dialogs.form({
      title: 'Editar prospecto',
      sub: l.code,
      fields: [
        { id: 'name', label: 'Contacto', req: true, value: l.name },
        { id: 'company_name', label: 'Empresa', value: l.company_name ?? '' },
        { id: 'email', label: 'Correo', type: 'email', value: l.email ?? '' },
        { id: 'phone', label: 'Teléfono', type: 'tel', value: l.phone ?? '' },
        { id: 'amount', label: 'Valor estimado', type: 'number', min: 0, step: '0.01', value: l.estimated_amount_minor != null ? l.estimated_amount_minor / 100 : '' },
        { id: 'currency', label: 'Moneda', type: 'select', options: ['PEN', 'USD'], value: l.currency ?? 'PEN' },
        { id: 'next', label: 'Próximo seguimiento', type: 'date', value: l.next_follow_up_at ? l.next_follow_up_at.slice(0, 10) : '' },
      ],
      submit: 'Guardar',
      onSubmit: (v) =>
        void apply(
          (cur) =>
            api.update(cur.id, cur.version, {
              name: v.name,
              company_name: v.company_name || null,
              email: v.email || null,
              phone: v.phone || null,
              next_follow_up_at: v.next || null,
              ...(v.amount ? { estimated_amount_minor: Math.round(Number(v.amount) * 100), currency: v.currency as 'PEN' | 'USD' } : { clear_amount: true, estimated_amount_minor: null, currency: null }),
            }),
          'Prospecto actualizado',
        ),
    });
  };

  const activityDialog = () => {
    if (!l) return;
    dialogs.form({
      title: 'Registrar actividad',
      sub: company(l),
      fields: [
        { id: 'type', label: 'Tipo', type: 'select', options: (Object.entries(LEAD_ACTIVITY_LABELS) as [LeadActivityType, string][]).map(([k, n]) => [k, n] as [string, string]), value: 'note' },
        { id: 'subject', label: 'Asunto' },
        { id: 'notes', label: 'Detalle', type: 'textarea', full: true },
        { id: 'due', label: 'Fecha de seguimiento (solo seguimientos)', type: 'date' },
      ],
      submit: 'Registrar',
      validate: (v) => (v.type === 'follow_up' && !v.due ? 'Indique la fecha del seguimiento.' : !v.subject.trim() && !v.notes.trim() ? 'Escriba un asunto o un detalle.' : null),
      onSubmit: (v) => void apply((cur) => api.addActivity(cur.id, { type: v.type as LeadActivityType, subject: v.subject.trim() || null, notes: v.notes.trim() || null, due_at: v.type === 'follow_up' ? v.due : null }), 'Actividad registrada'),
    });
  };

  const loseDialog = () => {
    if (!l) return;
    dialogs.form({
      title: 'Marcar como perdido',
      sub: company(l),
      fields: [{ id: 'reason', label: 'Motivo', type: 'textarea', req: true, full: true }],
      submit: 'Marcar perdido',
      validate: (v) => (v.reason.trim() ? null : 'El motivo es obligatorio.'),
      onSubmit: (v) => void apply((cur) => api.lose(cur.id, cur.version, v.reason.trim()), 'Prospecto perdido'),
    });
  };

  const convertDialog = () => {
    if (!l) return;
    dialogs.form({
      title: 'Ganar y convertir en cliente',
      sub: company(l),
      pre: <Note icon="info">Se crea el cliente con su contacto principal; si el correo o el documento ya son de un cliente, se vincula. No se da acceso al portal: se otorga desde la ficha del contacto.</Note>,
      fields: [
        { id: 'tax_id_type', label: 'Tipo de documento (opcional)', type: 'select', options: [['', 'Sin documento'], ['ruc', 'RUC'], ['dni', 'DNI'], ['ce', 'Carné de extranjería'], ['passport', 'Pasaporte']], value: '' },
        { id: 'tax_id', label: 'Número de documento', value: '' },
      ],
      submit: 'Ganar y crear cliente',
      validate: (v) => (v.tax_id_type && !v.tax_id.trim() ? 'Indique el número de documento.' : null),
      onSubmit: (v) =>
        void apply((cur) => api.convert(cur.id, { version: cur.version, ...(v.tax_id_type && v.tax_id.trim() ? { tax_id_type: v.tax_id_type, tax_id: v.tax_id.trim() } : {}) }), 'Prospecto ganado: cliente listo'),
    });
  };

  const attribution = l && l.attribution && !Array.isArray(l.attribution) ? (l.attribution as Record<string, string>) : {};
  const utm = Object.entries(attribution).filter(([k, v]) => v && k in UTM_LABEL);

  return (
    <Sheet
      open
      onClose={onClose}
      title={l ? company(l) : 'Prospecto'}
      sub={l ? <Chip kind={STATUS_CHIP[l.status]}>{l.status === 'open' ? l.stage_name : LEAD_STATUS_LABELS[l.status]}</Chip> : undefined}
      footer={
        l ? (
          <>
            {canConvert ? (
              <button type="button" className="btn primary" disabled={busy} onClick={convertDialog}>
                <Icon name="check" size="sm" />
                Ganar y convertir en cliente
              </button>
            ) : null}
            {canUpdate ? (
              <button type="button" className="btn" disabled={busy} onClick={editDialog}>
                Editar
              </button>
            ) : null}
            {canUpdate ? (
              <button type="button" className="btn" disabled={busy} onClick={loseDialog}>
                Marcar perdido
              </button>
            ) : null}
            {l.customer_id ? (
              <a className="btn primary" href={href('cliente', l.customer_id)}>
                Ver cliente {l.customer_code}
              </a>
            ) : null}
          </>
        ) : undefined
      }
    >
      {res.error ? (
        <Note kind="warn" icon="tri" role="alert">
          {isProblem(res.error) ? errorText(res.error) : 'Prospecto no encontrado.'}
        </Note>
      ) : !l ? (
        <p className="sub">Cargando…</p>
      ) : (
        <>
          <Kv
            items={[
              ['Código', l.code],
              ['Contacto', l.name],
              ['Empresa', l.company_name || '—'],
              ['Correo', l.email ? <a key="e" href={`mailto:${l.email}`}>{l.email}</a> : '—'],
              ['Teléfono', l.phone ? <a key="t" href={`tel:${l.phone.replace(/[^\d+]/g, '')}`}>{l.phone}</a> : '—'],
              ['Marca', l.brand_name ?? '—'],
              ['Canal', l.channel_name ?? '—'],
              ['Valor estimado', money(l)],
              ['Próximo seguimiento', fDate(l.next_follow_up_at)],
              [
                'Responsable',
                canUpdate ? (
                  <Select
                    key="o"
                    value={l.owner_id ?? ''}
                    label="Responsable"
                    options={[['', 'Sin asignar'], ...(opts.data?.owners ?? []).map((o) => [o.id, o.name] as [string, string])]}
                    onChange={(v) => void apply((cur) => api.update(cur.id, cur.version, { owner_id: v || null }), 'Responsable asignado')}
                    disabled={busy}
                  />
                ) : (
                  (l.owner_name ?? 'Sin asignar')
                ),
              ],
              ...(canUpdate && stages.length
                ? ([
                    [
                      'Etapa',
                      <Select
                        key="s"
                        value={l.pipeline_stage_id}
                        label="Etapa"
                        options={stages.map((s) => [s.id, s.name] as [string, string])}
                        onChange={(v) => void apply((cur) => api.move(cur.id, cur.version, v), 'Etapa actualizada')}
                        disabled={busy}
                      />,
                    ],
                  ] as [string, JSX.Element][])
                : []),
              ...(l.status === 'lost' ? ([['Motivo de pérdida', l.lost_reason ?? '—']] as [string, string][]) : []),
              ...(l.status === 'won' ? ([['Convertido', fDateTime(l.converted_at)]] as [string, string][]) : []),
            ]}
          />
          <h3 style={{ margin: '16px 0 8px' }}>Origen</h3>
          <Kv
            items={[
              [
                'Página',
                attribution.page_url ? (
                  <a key="u" href={attribution.page_url} target="_blank" rel="noopener noreferrer" style={{ overflowWrap: 'anywhere' }}>
                    {attribution.page_url.replace(/^https?:\/\//, '')} <Icon name="external" size="sm" />
                  </a>
                ) : (
                  '—'
                ),
              ],
              ['Formulario', attribution.form_code || '—'],
              ...utm.map(([k, v]): [string, string] => [`UTM ${UTM_LABEL[k]}`, String(v)]),
              ['Consentimiento comercial', l.marketing_consent ? 'Sí' : 'No'],
            ]}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '16px 0 8px' }}>
            <h3 style={{ margin: 0 }}>Actividades</h3>
            {canActivity ? (
              <button type="button" className="btn sm" disabled={busy} onClick={activityDialog}>
                <Icon name="plus" size="sm" />
                Registrar actividad
              </button>
            ) : null}
          </div>
          {l.activities.length ? (
            <ul className="rows">
              {l.activities.map((a) => (
                <li key={a.id}>
                  <div className="grow">
                    <b>
                      {LEAD_ACTIVITY_LABELS[a.type]}
                      {a.subject ? ` · ${a.subject}` : ''}
                    </b>
                    {a.notes ? <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{a.notes}</div> : null}
                    <small>
                      {fDateTime(a.created_at)}
                      {a.due_at ? ` · para el ${fDate(a.due_at)}` : ''}
                    </small>
                  </div>
                  {a.type === 'follow_up' ? (
                    canActivity && can('sales.lead_activity.update') ? (
                      <button type="button" className="btn sm" disabled={busy} onClick={() => void apply(() => api.completeActivity(a.id, a.version, !a.completed_at), a.completed_at ? 'Seguimiento reabierto' : 'Seguimiento completado')}>
                        {a.completed_at ? 'Reabrir' : 'Marcar hecho'}
                      </button>
                    ) : (
                      <Chip kind={a.completed_at ? 'ok' : 'warn'}>{a.completed_at ? 'Hecho' : 'Pendiente'}</Chip>
                    )
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="sub">Sin actividades todavía.</p>
          )}
          <h3 style={{ margin: '16px 0 8px' }}>Historial de etapas</h3>
          <ul className="rows">
            {l.stage_changes.map((c) => (
              <li key={c.id}>
                <div className="grow">
                  <b>
                    {c.from_stage ? `${c.from_stage} → ` : ''}
                    {c.to_stage}
                  </b>
                  <small>
                    {fDateTime(c.created_at)} · {SOURCE_LABEL[c.source] ?? c.source}
                    {c.changed_by_name ? ` · ${c.changed_by_name}` : ''}
                  </small>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </Sheet>
  );
}
