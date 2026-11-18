/**
 * Vista «infra» (#infra) — Inventario: recursos, servidores, nodos de hosting y cuentas.
 * Conectada al backend real (módulo Inventory). El chequeo/sincronización en vivo con
 * proveedores está fuera de alcance; last_synced_at/status se muestran como datos.
 */
import { useMemo, useState, type FormEvent } from 'react';
import {
  isProblem, type CursorPage, type HostingAccount, type HostingAccountInput, type HostingNode, type HostingNodeInput,
  type Resource, type ResourceInput, type ResourceType, type Server, type ServerInput,
} from '@hub/api';
import { useApp } from '../../app/context';
import type { ViewProps } from '../../app/routes';
import { DataTable, type Column } from '../../components/DataTable';
import { Icon } from '../../components/Icon';
import { Modal } from '../../components/Modal';
import { Chip, EmptyState, Note, PageHead, SearchBox, Select, Skeleton, Tabs, Toolbar, type TabDef } from '../../components/ui';
import { CustomerSearch } from './clientes/CustomerSearch';
import { errorText, fDate, useCan, useLoad, type Loadable } from './clientes/shared';
import {
  ACCOUNT_STATUS_CHIP, ACCOUNT_STATUS_EDIT, ACCOUNT_STATUS_LABEL, inventoryApi, NODE_STATUS_CHIP, NODE_STATUS_LABEL,
  RESOURCE_STATUS_CHIP, RESOURCE_STATUS_EDIT, RESOURCE_STATUS_LABEL, RESOURCE_TYPE_LABEL,
} from './infra/shared';

type Tab = 'recursos' | 'servidores' | 'nodos' | 'cuentas';
const TABS: TabDef<Tab>[] = [
  { id: 'recursos', label: 'Recursos' }, { id: 'servidores', label: 'Servidores' },
  { id: 'nodos', label: 'Nodos de hosting' }, { id: 'cuentas', label: 'Cuentas' },
];
const RTYPES = Object.keys(RESOURCE_TYPE_LABEL) as ResourceType[];
const PER = 25;

export default function InfraView({ param }: ViewProps) {
  const initial = (TABS.some((t) => t.id === param) ? param : 'recursos') as Tab;
  const [tab, setTab] = useState<Tab>(initial);
  return (
    <>
      <PageHead crumbs={[['Infraestructura', 'infra'], ['Inventario']]} title="Inventario" sub="Activos técnicos: recursos, servidores, nodos y cuentas de hosting." />
      <section className="card">
        <Tabs<Tab> label="Secciones de inventario" value={tab} onChange={setTab} tabs={TABS} />
        {tab === 'recursos' ? <Resources /> : tab === 'servidores' ? <Servers /> : tab === 'nodos' ? <Nodes /> : <Accounts />}
      </section>
    </>
  );
}

function Pager({ meta, loading, setCursor }: { meta?: { prev_cursor?: string | null; next_cursor?: string | null }; loading: boolean; setCursor: (c: string | null) => void }) {
  return (
    <div className="card-b" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
      <button className="btn sm" disabled={loading || !meta?.prev_cursor} onClick={() => setCursor(meta?.prev_cursor ?? null)}>Anterior</button>
      <button className="btn sm" disabled={loading || !meta?.next_cursor} onClick={() => setCursor(meta?.next_cursor ?? null)}>Siguiente</button>
    </div>
  );
}

function ListFrame<T>({ res, empty, children }: { res: Loadable<CursorPage<T>>; empty: string; children: (rows: T[]) => React.ReactNode }) {
  const rows = res.data?.data ?? [];
  if (res.error) return <div className="card-b"><Note kind="warn">No se pudo cargar: {errorText(res.error)} <button className="btn sm" onClick={res.reload}>Reintentar</button></Note></div>;
  if (res.loading && !res.data) return <Skeleton variant="table" rows={5} />;
  if (!rows.length) return <EmptyState title={empty} text="No hay registros que coincidan con los filtros." />;
  return <>{children(rows)}</>;
}

/* ===================== Recursos ===================== */
function Resources() {
  const can = useCan();
  const { toast, dialogs } = useApp();
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [form, setForm] = useState<Resource | 'new' | null>(null);
  const filter = useMemo(() => ({ type: type || undefined, status: status || undefined }), [type, status]);
  const res = useLoad(() => inventoryApi.resources.list({ filter, q: q || undefined, cursor, size: PER, sort: '-created_at' }), [filter, q, cursor, reload]);
  const refresh = () => setReload((x) => x + 1);
  const meta = res.data?.meta;
  const money = (r: Resource) => (r.cost_minor != null ? `${(r.cost_minor / 100).toFixed(2)} ${r.cost_currency ?? ''}` : '—');
  const del = (r: Resource) => dialogs.confirm({ title: 'Eliminar recurso', body: <p>¿Eliminar «{r.name}»?</p>, okLabel: 'Eliminar', onOk: async () => { try { await inventoryApi.resources.remove(r.id, r.version); toast('Recurso eliminado', r.name); refresh(); } catch (e) { toast('No se pudo eliminar', errorText(e), 'err'); } } });
  const cols: Column<Resource>[] = [
    { key: 'name', header: 'Nombre', className: 'strong', render: (r) => r.name },
    { key: 'type', header: 'Tipo', render: (r) => RESOURCE_TYPE_LABEL[r.type] },
    { key: 'status', header: 'Estado', render: (r) => <Chip kind={RESOURCE_STATUS_CHIP[r.status]}>{RESOURCE_STATUS_LABEL[r.status]}</Chip> },
    { key: 'cost', header: 'Costo', align: 'r', render: money },
    { key: 'renewal', header: 'Renovación', className: 'nw', render: (r) => fDate(r.renewal_date) },
    { key: 'actions', header: '', align: 'r', render: (r) => <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end' }}>{can('inventory.resource.update') ? <button className="btn sm" onClick={() => setForm(r)}>Editar</button> : null}{can('inventory.resource.delete') ? <button className="btn sm danger" onClick={() => del(r)}>Eliminar</button> : null}</div> },
  ];
  return (
    <>
      <Toolbar count={res.loading ? 'Cargando…' : `${(res.data?.data ?? []).length}${meta?.has_more ? '+' : ''} en esta página`}>
        <SearchBox label="Buscar recursos" placeholder="Buscar…" value={q} onChange={(v) => { setQ(v); setCursor(null); }} />
        <Select label="Tipo" value={type} onChange={(v) => { setType(v); setCursor(null); }} options={[['', 'Todos los tipos'], ...RTYPES.map((t) => [t, RESOURCE_TYPE_LABEL[t]] as [string, string])]} />
        <Select label="Estado" value={status} onChange={(v) => { setStatus(v); setCursor(null); }} options={[['', 'Todos los estados'], ...(Object.keys(RESOURCE_STATUS_LABEL) as (keyof typeof RESOURCE_STATUS_LABEL)[]).map((s) => [s, RESOURCE_STATUS_LABEL[s]] as [string, string])]} />
        {can('inventory.resource.create') ? <button className="btn primary" onClick={() => setForm('new')}><Icon name="plus" size="sm" /> Nuevo recurso</button> : null}
      </Toolbar>
      <ListFrame res={res} empty="Sin recursos">{(rows) => <><DataTable columns={cols} rows={rows} rowKey={(r) => r.id} caption="Recursos" /><Pager meta={meta} loading={res.loading} setCursor={setCursor} /></>}</ListFrame>
      {form ? <ResourceForm resource={form === 'new' ? undefined : form} onClose={() => setForm(null)} onSaved={() => { setForm(null); refresh(); }} /> : null}
    </>
  );
}

function ResourceForm({ resource, onClose, onSaved }: { resource?: Resource; onClose: () => void; onSaved: () => void }) {
  const { toast } = useApp();
  const [type, setType] = useState<ResourceType>(resource?.type ?? 'other');
  const [name, setName] = useState(resource?.name ?? '');
  const [status, setStatus] = useState<string>(resource?.status && RESOURCE_STATUS_EDIT.includes(resource.status) ? resource.status : 'active');
  const [costMinor, setCostMinor] = useState(resource?.cost_minor != null ? String(resource.cost_minor) : '');
  const [costCur, setCostCur] = useState(resource?.cost_currency ?? '');
  const [renewal, setRenewal] = useState(resource?.renewal_date?.slice(0, 10) ?? '');
  const [externalId, setExternalId] = useState(resource?.external_id ?? '');
  const [providerAccount, setProviderAccount] = useState(resource?.provider_account_id ?? '');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true);
    const input: ResourceInput = {
      type, name: name.trim(), status: status as ResourceInput['status'],
      cost_minor: costMinor === '' ? null : Number(costMinor), cost_currency: costCur.trim() ? costCur.trim().toUpperCase() : null,
      renewal_date: renewal || null, external_id: externalId.trim() || null, provider_account_id: providerAccount.trim() || null,
    };
    try { if (resource) await inventoryApi.resources.update(resource.id, resource.version, input); else await inventoryApi.resources.create(input); toast(resource ? 'Recurso actualizado' : 'Recurso creado', name); onSaved(); }
    catch (err) { setMsg(isProblem(err) && err.status === 409 ? `${errorText(err)} Recargue.` : errorText(err)); } finally { setBusy(false); }
  };
  return (
    <Modal open wide bare onClose={onClose} title={resource ? `Editar ${resource.name}` : 'Nuevo recurso'}>
      <form className="modal-b" onSubmit={(e) => void submit(e)}>
        <div className="form-grid">
          <label className="field">Tipo*<select className="select" value={type} onChange={(e) => setType(e.target.value as ResourceType)}>{RTYPES.map((t) => <option key={t} value={t}>{RESOURCE_TYPE_LABEL[t]}</option>)}</select></label>
          <label className="field">Estado<select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>{RESOURCE_STATUS_EDIT.map((s) => <option key={s} value={s}>{RESOURCE_STATUS_LABEL[s]}</option>)}</select></label>
          <label className="field full">Nombre*<input required className="input" value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className="field">Costo (céntimos)<input className="input" type="number" min={0} value={costMinor} onChange={(e) => setCostMinor(e.target.value)} /></label>
          <label className="field">Moneda<input className="input" placeholder="USD" maxLength={3} value={costCur} onChange={(e) => setCostCur(e.target.value)} /></label>
          <label className="field">Renovación<input className="input" type="date" value={renewal} onChange={(e) => setRenewal(e.target.value)} /></label>
          <label className="field">ID externo<input className="input" value={externalId} onChange={(e) => setExternalId(e.target.value)} /></label>
          <label className="field full">Cuenta de proveedor (UUID)<input className="input" value={providerAccount} onChange={(e) => setProviderAccount(e.target.value)} /></label>
        </div>
        <div className="err" role="alert">{msg}</div>
        <div className="modal-f"><button type="button" className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={busy}>Guardar</button></div>
      </form>
    </Modal>
  );
}

/* ===================== Servidores ===================== */
function Servers() {
  const can = useCan();
  const { toast, dialogs } = useApp();
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [form, setForm] = useState<Server | 'new' | null>(null);
  const res = useLoad(() => inventoryApi.servers.list({ q: q || undefined, cursor, size: PER, sort: '-created_at' }), [q, cursor, reload]);
  const refresh = () => setReload((x) => x + 1);
  const meta = res.data?.meta;
  const del = (s: Server) => dialogs.confirm({ title: 'Eliminar servidor', body: <p>¿Eliminar «{s.hostname}»?</p>, okLabel: 'Eliminar', onOk: async () => { try { await inventoryApi.servers.remove(s.id, s.version); toast('Servidor eliminado', s.hostname); refresh(); } catch (e) { toast('No se pudo eliminar', errorText(e), 'err'); } } });
  const cols: Column<Server>[] = [
    { key: 'hostname', header: 'Hostname', className: 'strong', render: (s) => s.hostname },
    { key: 'ip', header: 'IP pública', className: 'mono', render: (s) => s.public_ip ?? '—' },
    { key: 'specs', header: 'CPU/RAM/Disco', render: (s) => `${s.cpu ?? '—'} vCPU · ${s.ram_mb ?? '—'} MB · ${s.disk_gb ?? '—'} GB` },
    { key: 'region', header: 'Región', render: (s) => s.region ?? '—' },
    { key: 'tenancy', header: 'Tenencia', render: (s) => (s.tenancy === 'dedicated' ? 'Dedicado' : 'Compartido') },
    { key: 'actions', header: '', align: 'r', render: (s) => <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end' }}>{can('inventory.server.update') ? <button className="btn sm" onClick={() => setForm(s)}>Editar</button> : null}{can('inventory.server.delete') ? <button className="btn sm danger" onClick={() => del(s)}>Eliminar</button> : null}</div> },
  ];
  return (
    <>
      <Toolbar count={res.loading ? 'Cargando…' : `${(res.data?.data ?? []).length}${meta?.has_more ? '+' : ''} en esta página`}>
        <SearchBox label="Buscar servidores" placeholder="Buscar hostname/IP…" value={q} onChange={(v) => { setQ(v); setCursor(null); }} />
        {can('inventory.server.create') ? <button className="btn primary" onClick={() => setForm('new')}><Icon name="plus" size="sm" /> Nuevo servidor</button> : null}
      </Toolbar>
      <ListFrame res={res} empty="Sin servidores">{(rows) => <><DataTable columns={cols} rows={rows} rowKey={(s) => s.id} caption="Servidores" /><Pager meta={meta} loading={res.loading} setCursor={setCursor} /></>}</ListFrame>
      {form ? <ServerForm server={form === 'new' ? undefined : form} onClose={() => setForm(null)} onSaved={() => { setForm(null); refresh(); }} /> : null}
    </>
  );
}

function ServerForm({ server, onClose, onSaved }: { server?: Server; onClose: () => void; onSaved: () => void }) {
  const { toast } = useApp();
  const resources = useLoad(() => inventoryApi.resources.list({ filter: { type: 'server' }, size: 100, sort: 'name' }), []);
  const [resourceId, setResourceId] = useState(server?.resource_id ?? '');
  const [hostname, setHostname] = useState(server?.hostname ?? '');
  const [os, setOs] = useState(server?.os ?? '');
  const [publicIp, setPublicIp] = useState(server?.public_ip ?? '');
  const [privateIp, setPrivateIp] = useState(server?.private_ip ?? '');
  const [cpu, setCpu] = useState(server?.cpu != null ? String(server.cpu) : '');
  const [ram, setRam] = useState(server?.ram_mb != null ? String(server.ram_mb) : '');
  const [disk, setDisk] = useState(server?.disk_gb != null ? String(server.disk_gb) : '');
  const [region, setRegion] = useState(server?.region ?? '');
  const [tenancy, setTenancy] = useState<string>(server?.tenancy ?? 'dedicated');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const opts = resources.data?.data ?? [];
  const num = (v: string) => (v === '' ? null : Number(v));
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true);
    const input: ServerInput = { resource_id: resourceId, hostname: hostname.trim(), os: os.trim() || null, public_ip: publicIp.trim() || null, private_ip: privateIp.trim() || null, cpu: num(cpu), ram_mb: num(ram), disk_gb: num(disk), region: region.trim() || null, tenancy: tenancy as ServerInput['tenancy'] };
    try { if (server) await inventoryApi.servers.update(server.id, server.version, input); else await inventoryApi.servers.create(input); toast(server ? 'Servidor actualizado' : 'Servidor creado', hostname); onSaved(); }
    catch (err) { setMsg(isProblem(err) && err.status === 409 ? `${errorText(err)} Recargue.` : errorText(err)); } finally { setBusy(false); }
  };
  return (
    <Modal open wide bare onClose={onClose} title={server ? `Editar ${server.hostname}` : 'Nuevo servidor'}>
      <form className="modal-b" onSubmit={(e) => void submit(e)}>
        <div className="form-grid">
          <label className="field full">Recurso (tipo servidor)*<select required className="select" value={resourceId} onChange={(e) => setResourceId(e.target.value)}><option value="">Seleccione…</option>{opts.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>{!opts.length ? <span className="sub">Cree primero un recurso de tipo «Servidor».</span> : null}</label>
          <label className="field full">Hostname*<input required className="input" value={hostname} onChange={(e) => setHostname(e.target.value)} /></label>
          <label className="field">SO<input className="input" value={os} onChange={(e) => setOs(e.target.value)} /></label>
          <label className="field">Región<input className="input" value={region} onChange={(e) => setRegion(e.target.value)} /></label>
          <label className="field">IP pública<input className="input" value={publicIp} onChange={(e) => setPublicIp(e.target.value)} /></label>
          <label className="field">IP privada<input className="input" value={privateIp} onChange={(e) => setPrivateIp(e.target.value)} /></label>
          <label className="field">vCPU<input className="input" type="number" min={1} value={cpu} onChange={(e) => setCpu(e.target.value)} /></label>
          <label className="field">RAM (MB)<input className="input" type="number" min={1} value={ram} onChange={(e) => setRam(e.target.value)} /></label>
          <label className="field">Disco (GB)<input className="input" type="number" min={1} value={disk} onChange={(e) => setDisk(e.target.value)} /></label>
          <label className="field">Tenencia<select className="select" value={tenancy} onChange={(e) => setTenancy(e.target.value)}><option value="dedicated">Dedicado</option><option value="shared">Compartido</option></select></label>
        </div>
        <div className="err" role="alert">{msg}</div>
        <div className="modal-f"><button type="button" className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={busy}>Guardar</button></div>
      </form>
    </Modal>
  );
}

/* ===================== Nodos de hosting ===================== */
function Nodes() {
  const can = useCan();
  const { toast, dialogs } = useApp();
  const [kind, setKind] = useState('');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [form, setForm] = useState<HostingNode | 'new' | null>(null);
  const filter = useMemo(() => ({ kind: kind || undefined, status: status || undefined }), [kind, status]);
  const res = useLoad(() => inventoryApi.hostingNodes.list({ filter, q: q || undefined, cursor, size: PER, sort: '-created_at' }), [filter, q, cursor, reload]);
  const refresh = () => setReload((x) => x + 1);
  const meta = res.data?.meta;
  const del = (n: HostingNode) => dialogs.confirm({ title: 'Eliminar nodo', body: <p>¿Eliminar «{n.hostname}»?</p>, okLabel: 'Eliminar', onOk: async () => { try { await inventoryApi.hostingNodes.remove(n.id, n.version); toast('Nodo eliminado', n.hostname); refresh(); } catch (e) { toast('No se pudo eliminar', errorText(e), 'err'); } } });
  const cap = (n: HostingNode) => (n.accounts_used != null && n.accounts_limit ? `${n.accounts_used}/${n.accounts_limit}` : '—');
  const cols: Column<HostingNode>[] = [
    { key: 'hostname', header: 'Hostname', className: 'strong', render: (n) => n.hostname },
    { key: 'kind', header: 'Tipo', render: (n) => (n.kind === 'own_vps' ? 'VPS propio' : 'Reseller') },
    { key: 'panel', header: 'Panel', render: (n) => n.panel.toUpperCase() },
    { key: 'cap', header: 'Cuentas', render: cap },
    { key: 'status', header: 'Estado', render: (n) => <Chip kind={NODE_STATUS_CHIP[n.status]}>{NODE_STATUS_LABEL[n.status]}</Chip> },
    { key: 'actions', header: '', align: 'r', render: (n) => <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end' }}>{can('inventory.hosting_node.update') ? <button className="btn sm" onClick={() => setForm(n)}>Editar</button> : null}{can('inventory.hosting_node.delete') ? <button className="btn sm danger" onClick={() => del(n)}>Eliminar</button> : null}</div> },
  ];
  return (
    <>
      <Toolbar count={res.loading ? 'Cargando…' : `${(res.data?.data ?? []).length}${meta?.has_more ? '+' : ''} en esta página`}>
        <SearchBox label="Buscar nodos" placeholder="Buscar hostname…" value={q} onChange={(v) => { setQ(v); setCursor(null); }} />
        <Select label="Tipo" value={kind} onChange={(v) => { setKind(v); setCursor(null); }} options={[['', 'Todos los tipos'], ['reseller', 'Reseller'], ['own_vps', 'VPS propio']]} />
        <Select label="Estado" value={status} onChange={(v) => { setStatus(v); setCursor(null); }} options={[['', 'Todos los estados'], ...(Object.keys(NODE_STATUS_LABEL) as (keyof typeof NODE_STATUS_LABEL)[]).map((s) => [s, NODE_STATUS_LABEL[s]] as [string, string])]} />
        {can('inventory.hosting_node.create') ? <button className="btn primary" onClick={() => setForm('new')}><Icon name="plus" size="sm" /> Nuevo nodo</button> : null}
      </Toolbar>
      <ListFrame res={res} empty="Sin nodos">{(rows) => <><DataTable columns={cols} rows={rows} rowKey={(n) => n.id} caption="Nodos" /><Pager meta={meta} loading={res.loading} setCursor={setCursor} /></>}</ListFrame>
      {form ? <NodeForm node={form === 'new' ? undefined : form} onClose={() => setForm(null)} onSaved={() => { setForm(null); refresh(); }} /> : null}
    </>
  );
}

function NodeForm({ node, onClose, onSaved }: { node?: HostingNode; onClose: () => void; onSaved: () => void }) {
  const { toast } = useApp();
  const resources = useLoad(() => inventoryApi.resources.list({ filter: { type: 'hosting_node' }, size: 100, sort: 'name' }), []);
  const servers = useLoad(() => inventoryApi.servers.list({ size: 100, sort: 'hostname' }), []);
  const [resourceId, setResourceId] = useState(node?.resource_id ?? '');
  const [kind, setKind] = useState<string>(node?.kind ?? 'reseller');
  const [serverId, setServerId] = useState(node?.server_id ?? '');
  const [panel, setPanel] = useState<string>(node?.panel ?? 'whm');
  const [hostname, setHostname] = useState(node?.hostname ?? '');
  const [ip, setIp] = useState(node?.ip ?? '');
  const [limit, setLimit] = useState(node?.accounts_limit != null ? String(node.accounts_limit) : '');
  const [status, setStatus] = useState<string>(node?.status ?? 'active');
  const [accepts, setAccepts] = useState(node?.accepts_new_accounts ?? true);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const rOpts = resources.data?.data ?? [];
  const sOpts = servers.data?.data ?? [];
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true);
    const input: HostingNodeInput = { resource_id: resourceId, kind: kind as HostingNodeInput['kind'], server_id: kind === 'own_vps' ? (serverId || null) : null, panel: panel as HostingNodeInput['panel'], hostname: hostname.trim(), ip: ip.trim() || null, accounts_limit: limit === '' ? null : Number(limit), status: status as HostingNodeInput['status'], accepts_new_accounts: accepts };
    try { if (node) await inventoryApi.hostingNodes.update(node.id, node.version, input); else await inventoryApi.hostingNodes.create(input); toast(node ? 'Nodo actualizado' : 'Nodo creado', hostname); onSaved(); }
    catch (err) { setMsg(isProblem(err) && err.status === 409 ? `${errorText(err)} Recargue.` : errorText(err)); } finally { setBusy(false); }
  };
  return (
    <Modal open wide bare onClose={onClose} title={node ? `Editar ${node.hostname}` : 'Nuevo nodo'}>
      <form className="modal-b" onSubmit={(e) => void submit(e)}>
        <div className="form-grid">
          <label className="field full">Recurso (tipo nodo)*<select required className="select" value={resourceId} onChange={(e) => setResourceId(e.target.value)}><option value="">Seleccione…</option>{rOpts.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>{!rOpts.length ? <span className="sub">Cree primero un recurso de tipo «Nodo de hosting».</span> : null}</label>
          <label className="field">Tipo*<select className="select" value={kind} onChange={(e) => setKind(e.target.value)}><option value="reseller">Reseller</option><option value="own_vps">VPS propio</option></select></label>
          <label className="field">Panel<select className="select" value={panel} onChange={(e) => setPanel(e.target.value)}><option value="whm">WHM</option><option value="plesk">Plesk</option><option value="other">Otro</option></select></label>
          {kind === 'own_vps' ? <label className="field full">Servidor* (requerido para VPS propio)<select required className="select" value={serverId} onChange={(e) => setServerId(e.target.value)}><option value="">Seleccione…</option>{sOpts.map((s) => <option key={s.id} value={s.id}>{s.hostname}</option>)}</select></label> : null}
          <label className="field full">Hostname*<input required className="input" value={hostname} onChange={(e) => setHostname(e.target.value)} /></label>
          <label className="field">IP<input className="input" value={ip} onChange={(e) => setIp(e.target.value)} /></label>
          <label className="field">Límite de cuentas<input className="input" type="number" min={0} value={limit} onChange={(e) => setLimit(e.target.value)} /></label>
          <label className="field">Estado<select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>{(Object.keys(NODE_STATUS_LABEL) as (keyof typeof NODE_STATUS_LABEL)[]).map((s) => <option key={s} value={s}>{NODE_STATUS_LABEL[s]}</option>)}</select></label>
          <label className="field"><span><input type="checkbox" checked={accepts} onChange={(e) => setAccepts(e.target.checked)} /> Acepta cuentas nuevas</span></label>
        </div>
        <div className="err" role="alert">{msg}</div>
        <div className="modal-f"><button type="button" className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={busy}>Guardar</button></div>
      </form>
    </Modal>
  );
}

/* ===================== Cuentas de hosting ===================== */
function Accounts() {
  const can = useCan();
  const { toast, dialogs } = useApp();
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [form, setForm] = useState<HostingAccount | 'new' | null>(null);
  const filter = useMemo(() => ({ status: status || undefined }), [status]);
  const res = useLoad(() => inventoryApi.hostingAccounts.list({ filter, q: q || undefined, cursor, size: PER, sort: '-created_at' }), [filter, q, cursor, reload]);
  const refresh = () => setReload((x) => x + 1);
  const meta = res.data?.meta;
  const del = (a: HostingAccount) => dialogs.confirm({ title: 'Eliminar cuenta', body: <p>¿Eliminar «{a.username}»?</p>, okLabel: 'Eliminar', onOk: async () => { try { await inventoryApi.hostingAccounts.remove(a.id, a.version); toast('Cuenta eliminada', a.username); refresh(); } catch (e) { toast('No se pudo eliminar', errorText(e), 'err'); } } });
  const cols: Column<HostingAccount>[] = [
    { key: 'username', header: 'Usuario', className: 'strong', render: (a) => a.username },
    { key: 'domain', header: 'Dominio', render: (a) => a.primary_domain },
    { key: 'node', header: 'Nodo', render: (a) => a.hosting_node?.hostname ?? '—' },
    { key: 'status', header: 'Estado', render: (a) => <Chip kind={ACCOUNT_STATUS_CHIP[a.status]}>{ACCOUNT_STATUS_LABEL[a.status]}</Chip> },
    { key: 'actions', header: '', align: 'r', render: (a) => <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end' }}>{can('inventory.hosting_account.update') ? <button className="btn sm" onClick={() => setForm(a)}>Editar</button> : null}{can('inventory.hosting_account.delete') ? <button className="btn sm danger" onClick={() => del(a)}>Eliminar</button> : null}</div> },
  ];
  return (
    <>
      <Toolbar count={res.loading ? 'Cargando…' : `${(res.data?.data ?? []).length}${meta?.has_more ? '+' : ''} en esta página`}>
        <SearchBox label="Buscar cuentas" placeholder="Buscar usuario/dominio…" value={q} onChange={(v) => { setQ(v); setCursor(null); }} />
        <Select label="Estado" value={status} onChange={(v) => { setStatus(v); setCursor(null); }} options={[['', 'Todos los estados'], ...(Object.keys(ACCOUNT_STATUS_LABEL) as (keyof typeof ACCOUNT_STATUS_LABEL)[]).map((s) => [s, ACCOUNT_STATUS_LABEL[s]] as [string, string])]} />
        {can('inventory.hosting_account.create') ? <button className="btn primary" onClick={() => setForm('new')}><Icon name="plus" size="sm" /> Nueva cuenta</button> : null}
      </Toolbar>
      <ListFrame res={res} empty="Sin cuentas">{(rows) => <><DataTable columns={cols} rows={rows} rowKey={(a) => a.id} caption="Cuentas" /><Pager meta={meta} loading={res.loading} setCursor={setCursor} /></>}</ListFrame>
      {form ? <AccountForm account={form === 'new' ? undefined : form} onClose={() => setForm(null)} onSaved={() => { setForm(null); refresh(); }} /> : null}
    </>
  );
}

function AccountForm({ account, onClose, onSaved }: { account?: HostingAccount; onClose: () => void; onSaved: () => void }) {
  const { toast } = useApp();
  const nodes = useLoad(() => inventoryApi.hostingNodes.list({ size: 100, sort: 'hostname' }), []);
  const [nodeId, setNodeId] = useState(account?.hosting_node_id ?? '');
  const [username, setUsername] = useState(account?.username ?? '');
  const [domain, setDomain] = useState(account?.primary_domain ?? '');
  const [status, setStatus] = useState<string>(account?.status && ACCOUNT_STATUS_EDIT.includes(account.status) ? account.status : 'active');
  const [serviceId, setServiceId] = useState(account?.service_id ?? '');
  const [customerId, setCustomerId] = useState(account?.customer_id ?? '');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const nOpts = nodes.data?.data ?? [];
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true);
    const input: HostingAccountInput = { hosting_node_id: nodeId, username: username.trim(), primary_domain: domain.trim(), status: status as HostingAccountInput['status'], service_id: serviceId.trim() || null, customer_id: customerId.trim() || null };
    try { if (account) await inventoryApi.hostingAccounts.update(account.id, account.version, input); else await inventoryApi.hostingAccounts.create(input); toast(account ? 'Cuenta actualizada' : 'Cuenta creada', username); onSaved(); }
    catch (err) { setMsg(isProblem(err) && err.status === 409 ? `${errorText(err)} Recargue.` : errorText(err)); } finally { setBusy(false); }
  };
  return (
    <Modal open wide bare onClose={onClose} title={account ? `Editar ${account.username}` : 'Nueva cuenta'}>
      <form className="modal-b" onSubmit={(e) => void submit(e)}>
        <div className="form-grid">
          <label className="field full">Nodo*<select required className="select" value={nodeId} onChange={(e) => setNodeId(e.target.value)}><option value="">Seleccione…</option>{nOpts.map((n) => <option key={n.id} value={n.id}>{n.hostname}</option>)}</select>{!nOpts.length ? <span className="sub">Cree primero un nodo de hosting.</span> : null}</label>
          <label className="field">Usuario*<input required className="input" value={username} onChange={(e) => setUsername(e.target.value)} /></label>
          <label className="field">Dominio principal*<input required className="input" value={domain} onChange={(e) => setDomain(e.target.value)} /></label>
          <label className="field">Estado<select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>{ACCOUNT_STATUS_EDIT.map((s) => <option key={s} value={s}>{ACCOUNT_STATUS_LABEL[s]}</option>)}</select></label>
          <label className="field">Servicio (UUID)<input className="input" value={serviceId} onChange={(e) => setServiceId(e.target.value)} /></label>
          <CustomerSearch value={customerId} onChange={(v) => setCustomerId(v ?? '')} />
        </div>
        <div className="err" role="alert">{msg}</div>
        <div className="modal-f"><button type="button" className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={busy}>Guardar</button></div>
      </form>
    </Modal>
  );
}
