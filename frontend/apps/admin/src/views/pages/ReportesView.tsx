/**
 * Vista «reportes» (#reportes) — Finanzas: costos por periodo, su reparto entre
 * servicios y la rentabilidad (costo asignado por servicio). Conectada al backend
 * (módulo Finance). El lado de ingresos de la rentabilidad aún no está disponible:
 * el reporte muestra solo costos asignados.
 */
import { useMemo, useState, type FormEvent } from 'react';
import {
  isProblem, type Cost, type CostAllocation, type CostAllocationInput, type CostInput, type CostKind, type ProfitabilityRow,
} from '@hub/api';
import { useApp } from '../../app/context';
import type { ViewProps } from '../../app/routes';
import { DataTable, type Column } from '../../components/DataTable';
import { Icon } from '../../components/Icon';
import { Modal } from '../../components/Modal';
import { Chip, EmptyState, Note, PageHead, SearchBox, Select, Skeleton, StatLine, Tabs, Toolbar, type TabDef } from '../../components/ui';
import { errorText, fDate, useCan, useLoad } from './clientes/shared';
import { hub } from '../../auth/client';

const financeApi = hub.finance;
type Tab = 'costos' | 'rentabilidad';
const TABS: TabDef<Tab>[] = [{ id: 'costos', label: 'Costos' }, { id: 'rentabilidad', label: 'Rentabilidad' }];
const KIND_LABEL: Record<CostKind, string> = { provider_recurring: 'Proveedor (recurrente)', provider_one_time: 'Proveedor (único)', license: 'Licencia', payment_fee: 'Comisión de pago', other: 'Otro' };
const KINDS = Object.keys(KIND_LABEL) as CostKind[];
const PER = 25;
const money = (minor: number, cur: string) => `${(minor / 100).toLocaleString('es-PE', { minimumFractionDigits: 2 })} ${cur}`;
const firstOfMonth = (ym: string) => (ym ? `${ym}-01` : '');

export default function ReportesView({ param }: ViewProps) {
  const initial = (TABS.some((t) => t.id === param) ? param : 'costos') as Tab;
  const [tab, setTab] = useState<Tab>(initial);
  return (
    <>
      <PageHead crumbs={[['Finanzas', 'reportes'], ['Finanzas']]} title="Finanzas" sub="Costos por periodo, su reparto entre servicios y la rentabilidad." />
      <section className="card">
        <Tabs<Tab> label="Secciones de finanzas" value={tab} onChange={setTab} tabs={TABS} />
        {tab === 'costos' ? <Costs /> : <Profitability />}
      </section>
    </>
  );
}

/* ===================== Costos ===================== */
function Costs() {
  const can = useCan();
  const { toast, dialogs } = useApp();
  const [kind, setKind] = useState('');
  const [period, setPeriod] = useState('');
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [form, setForm] = useState<Cost | 'new' | null>(null);
  const [detail, setDetail] = useState<Cost | null>(null);
  const filter = useMemo(() => ({ kind: (kind || undefined) as CostKind | undefined, period_month: period ? firstOfMonth(period) : undefined }), [kind, period]);
  const res = useLoad(() => financeApi.listCosts({ filter, q: q || undefined, cursor, size: PER, sort: '-period_month' }), [filter, q, cursor, reload]);
  const refresh = () => setReload((x) => x + 1);
  const rows = res.data?.data ?? [];
  const meta = res.data?.meta;
  const del = (c: Cost) => dialogs.confirm({ title: 'Eliminar costo', body: <p>¿Eliminar este costo de {money(c.amount_minor, c.cost_currency)}?</p>, okLabel: 'Eliminar', onOk: async () => { try { await financeApi.removeCost(c.id, c.version); toast('Costo eliminado'); refresh(); } catch (e) { toast('No se pudo eliminar', errorText(e), 'err'); } } });
  const cols: Column<Cost>[] = [
    { key: 'period', header: 'Periodo', className: 'nw', render: (c) => fDate(c.period_month) },
    { key: 'kind', header: 'Tipo', render: (c) => KIND_LABEL[c.kind] },
    { key: 'desc', header: 'Descripción', className: 'strong', render: (c) => c.description || '—' },
    { key: 'amount', header: 'Monto', align: 'r', render: (c) => money(c.amount_minor, c.cost_currency) },
    { key: 'method', header: 'Reparto', render: (c) => c.allocation_method },
    { key: 'actions', header: '', align: 'r', render: (c) => <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end' }}><button className="btn sm" onClick={() => setDetail(c)}>Reparto</button>{can('finance.cost.update') ? <button className="btn sm" onClick={() => setForm(c)}>Editar</button> : null}{can('finance.cost.delete') ? <button className="btn sm danger" onClick={() => del(c)}>Eliminar</button> : null}</div> },
  ];
  return (
    <>
      <Toolbar count={res.loading ? 'Cargando…' : `${rows.length}${meta?.has_more ? '+' : ''} en esta página`}>
        <SearchBox label="Buscar costos" placeholder="Buscar descripción…" value={q} onChange={(v) => { setQ(v); setCursor(null); }} />
        <Select label="Tipo" value={kind} onChange={(v) => { setKind(v); setCursor(null); }} options={[['', 'Todos los tipos'], ...KINDS.map((k) => [k, KIND_LABEL[k]] as [string, string])]} />
        <label className="sub" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          Periodo
          <input className="input" type="month" aria-label="Periodo" value={period} onChange={(e) => { setPeriod(e.target.value); setCursor(null); }} />
        </label>
        {can('finance.cost.create') ? <button className="btn primary" onClick={() => setForm('new')}><Icon name="plus" size="sm" /> Nuevo costo</button> : null}
      </Toolbar>
      {res.error ? <div className="card-b"><Note kind="warn">No se pudo cargar: {errorText(res.error)} <button className="btn sm" onClick={res.reload}>Reintentar</button></Note></div>
        : res.loading && !res.data ? <Skeleton variant="table" rows={5} />
          : !rows.length ? <EmptyState title="Sin costos" text="No hay costos que coincidan con los filtros." />
            : <><DataTable columns={cols} rows={rows} rowKey={(c) => c.id} caption="Costos" /><div className="card-b" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}><button className="btn sm" disabled={res.loading || !meta?.prev_cursor} onClick={() => setCursor(meta?.prev_cursor ?? null)}>Anterior</button><button className="btn sm" disabled={res.loading || !meta?.next_cursor} onClick={() => setCursor(meta?.next_cursor ?? null)}>Siguiente</button></div></>}
      {form ? <CostForm cost={form === 'new' ? undefined : form} onClose={() => setForm(null)} onSaved={() => { setForm(null); refresh(); }} /> : null}
      {detail ? <AllocationsModal cost={detail} onClose={() => setDetail(null)} /> : null}
    </>
  );
}

function CostForm({ cost, onClose, onSaved }: { cost?: Cost; onClose: () => void; onSaved: () => void }) {
  const { toast } = useApp();
  const [kind, setKind] = useState<CostKind>(cost?.kind ?? 'provider_recurring');
  const [period, setPeriod] = useState(cost?.period_month?.slice(0, 7) ?? '');
  const [amount, setAmount] = useState(cost ? String(cost.amount_minor) : '');
  const [currency, setCurrency] = useState(cost?.cost_currency ?? 'USD');
  const [description, setDescription] = useState(cost?.description ?? '');
  const [resourceId, setResourceId] = useState(cost?.resource_id ?? '');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true);
    const input: CostInput = { kind, period_month: firstOfMonth(period), amount_minor: Number(amount), cost_currency: currency.trim().toUpperCase(), description: description.trim() || null, resource_id: resourceId.trim() || null };
    try { if (cost) await financeApi.updateCost(cost.id, cost.version, input); else await financeApi.createCost(input); toast(cost ? 'Costo actualizado' : 'Costo creado'); onSaved(); }
    catch (err) { setMsg(isProblem(err) && err.status === 409 ? `${errorText(err)} Recargue.` : errorText(err)); } finally { setBusy(false); }
  };
  return (
    <Modal open wide bare onClose={onClose} title={cost ? 'Editar costo' : 'Nuevo costo'}>
      <form className="modal-b" onSubmit={(e) => void submit(e)}>
        <div className="form-grid">
          <label className="field">Tipo*<select className="select" value={kind} onChange={(e) => setKind(e.target.value as CostKind)}>{KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select></label>
          <label className="field">Periodo*<input required className="input" type="month" value={period} onChange={(e) => setPeriod(e.target.value)} /></label>
          <label className="field">Monto (céntimos)*<input required className="input" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
          <label className="field">Moneda*<input required className="input" maxLength={3} value={currency} onChange={(e) => setCurrency(e.target.value)} /></label>
          <label className="field full">Descripción<input className="input" value={description} onChange={(e) => setDescription(e.target.value)} /></label>
          <label className="field full">Recurso (UUID, opcional)<input className="input" value={resourceId} onChange={(e) => setResourceId(e.target.value)} /></label>
        </div>
        <div className="err" role="alert">{msg}</div>
        <div className="modal-f"><button type="button" className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={busy}>Guardar</button></div>
      </form>
    </Modal>
  );
}

/** Modal de reparto: muestra las asignaciones del costo y permite agregar/eliminar. */
function AllocationsModal({ cost, onClose }: { cost: Cost; onClose: () => void }) {
  const can = useCan();
  const { toast, dialogs } = useApp();
  const [reload, setReload] = useState(0);
  const [adding, setAdding] = useState(false);
  const res = useLoad(() => financeApi.getCost(cost.id), [cost.id, reload]);
  const refresh = () => setReload((x) => x + 1);
  const allocations = res.data?.allocations ?? [];
  const allocated = allocations.reduce((a, x) => a + x.amount_minor, 0);
  const remaining = cost.amount_minor - allocated;
  const del = (al: CostAllocation) => dialogs.confirm({ title: 'Quitar asignación', body: <p>¿Quitar esta asignación?</p>, okLabel: 'Quitar', onOk: async () => { try { await financeApi.removeAllocation(al.id, al.version); toast('Asignación eliminada'); refresh(); } catch (e) { toast('No se pudo', errorText(e), 'err'); } } });
  const cols: Column<CostAllocation>[] = [
    { key: 'service', header: 'Servicio', className: 'strong', render: (a) => a.service?.name ?? a.service_id },
    { key: 'amount', header: 'Monto', align: 'r', render: (a) => money(a.amount_minor, a.cost_currency) },
    { key: 'pct', header: '%', align: 'r', render: (a) => (a.share_percent != null ? `${Number(a.share_percent)}%` : '—') },
    { key: 'actions', header: '', align: 'r', render: (a) => (can('finance.cost.delete') ? <button className="btn sm danger" onClick={() => del(a)}>Quitar</button> : null) },
  ];
  return (
    <Modal open wide bare onClose={onClose} title={`Reparto del costo · ${money(cost.amount_minor, cost.cost_currency)}`}>
      <div className="modal-b">
        <StatLine style={{ marginBottom: 12 }} items={[{ label: 'Asignado', value: money(allocated, cost.cost_currency) }, { label: 'Disponible', value: money(remaining, cost.cost_currency) }]} />
        {res.loading && !res.data ? <Skeleton variant="table" rows={3} />
          : !allocations.length ? <EmptyState title="Sin asignaciones" text="Este costo aún no se reparte entre servicios." />
            : <DataTable columns={cols} rows={allocations} rowKey={(a) => a.id} caption="Asignaciones" />}
        {can('finance.cost_allocation.create') && !adding ? <div style={{ marginTop: 12 }}><button className="btn" onClick={() => setAdding(true)}><Icon name="plus" size="sm" /> Agregar asignación</button></div> : null}
        {adding ? <AllocationForm cost={cost} remaining={remaining} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); refresh(); }} /> : null}
      </div>
      <div className="modal-f"><button type="button" className="btn primary" onClick={onClose}>Cerrar</button></div>
    </Modal>
  );
}

function AllocationForm({ cost, remaining, onClose, onSaved }: { cost: Cost; remaining: number; onClose: () => void; onSaved: () => void }) {
  const [serviceId, setServiceId] = useState('');
  const [amount, setAmount] = useState(remaining > 0 ? String(remaining) : '');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true);
    const input: CostAllocationInput = { cost_id: cost.id, service_id: serviceId.trim(), amount_minor: Number(amount), cost_currency: cost.cost_currency };
    try { await financeApi.createAllocation(input); onSaved(); }
    catch (err) { setMsg(errorText(err)); } finally { setBusy(false); }
  };
  return (
    <form className="form-grid" onSubmit={(e) => void submit(e)} style={{ marginTop: 12, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
      <label className="field full">Servicio (UUID)*<input required className="input" value={serviceId} onChange={(e) => setServiceId(e.target.value)} /></label>
      <label className="field">Monto (céntimos)*<input required className="input" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
      <div className="err" role="alert" style={{ gridColumn: '1 / -1' }}>{msg}</div>
      <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, justifyContent: 'flex-end' }}><button type="button" className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={busy}>Agregar</button></div>
    </form>
  );
}

/* ===================== Rentabilidad ===================== */
function Profitability() {
  const [period, setPeriod] = useState('');
  const res = useLoad(() => (period ? financeApi.profitability(firstOfMonth(period)) : Promise.resolve({ data: [], totals: [] })), [period]);
  const rows = res.data?.data ?? [];
  const totals = res.data?.totals ?? [];
  const marginStyle = (v: number) => ({ color: v > 0 ? 'var(--ok-text, var(--ok))' : v < 0 ? 'var(--danger-text)' : 'var(--muted)', fontWeight: 700 });
  const cols: Column<ProfitabilityRow>[] = [
    { key: 'service', header: 'Servicio', className: 'strong', render: (r) => r.service_name ?? r.service_id },
    { key: 'currency', header: 'Moneda', render: (r) => r.currency },
    { key: 'revenue', header: 'Ingreso (mensual)', align: 'r', className: 'num', render: (r) => money(r.revenue_minor, r.currency) },
    { key: 'cost', header: 'Costo asignado', align: 'r', className: 'num', render: (r) => money(r.allocated_cost_minor, r.currency) },
    { key: 'margin', header: 'Margen', align: 'r', className: 'num', render: (r) => <span style={marginStyle(r.margin_minor)}>{money(r.margin_minor, r.currency)}</span> },
    { key: 'pct', header: 'Margen %', align: 'r', className: 'num', render: (r) => (r.margin_pct === null ? <span className="sub">—</span> : <span style={marginStyle(r.margin_minor)}>{r.margin_pct} %</span>) },
  ];
  return (
    <>
      <Toolbar count={period ? (res.loading ? 'Cargando…' : `${rows.length} servicios`) : 'Elija un periodo'}>
        <label className="sub" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          Periodo
          <input className="input" type="month" aria-label="Periodo" value={period} onChange={(e) => setPeriod(e.target.value)} />
        </label>
      </Toolbar>
      <div className="card-b"><Note icon="info">Ingreso = suscripciones activas del mes normalizadas a su equivalente mensual. El margen solo se calcula cuando ingreso y costo están en la misma moneda (sin tipo de cambio).</Note></div>
      {!period ? <EmptyState title="Elija un periodo" text="Seleccione un mes para ver el ingreso, costo y margen por servicio." />
        : res.error ? <div className="card-b"><Note kind="warn">No se pudo cargar: {errorText(res.error)} <button className="btn sm" onClick={res.reload}>Reintentar</button></Note></div>
          : res.loading && !res.data ? <Skeleton variant="table" rows={4} />
            : !rows.length ? <EmptyState title="Sin datos" text="No hay ingreso ni costo asignado en este periodo." />
              : <>
                <DataTable columns={cols} rows={rows} rowKey={(r) => r.service_id + r.currency} caption="Rentabilidad por servicio" />
                <div className="card-b" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>{totals.map((t) => <Chip key={t.currency} kind={t.margin_minor >= 0 ? 'ok' : 'danger'}>{t.currency}: ingreso {money(t.revenue_minor, t.currency)} · costo {money(t.allocated_cost_minor, t.currency)} · margen {money(t.margin_minor, t.currency)}{t.margin_pct === null ? '' : ` (${t.margin_pct} %)`}</Chip>)}</div>
              </>}
    </>
  );
}
