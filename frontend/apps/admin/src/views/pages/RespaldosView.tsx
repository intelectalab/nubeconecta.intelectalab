/**
 * Vista «respaldos» (#respaldos) — Respaldos en modo manual (M-MON): políticas de
 * respaldo por recurso/servicio y registro de corridas. La ejecución vía API de la
 * herramienta del nodo es una fase posterior (externa). Las solicitudes de
 * restauración (portal + admin) también son una fase posterior.
 */
import { useEffect, useState, type FormEvent } from 'react';
import {
  type BackupFrequency, type BackupPolicy, type BackupPolicyInput, type BackupResponsibility,
  type BackupRun, type BackupRunStatus,
} from '@hub/api';
import { useApp } from '../../app/context';
import type { ViewProps } from '../../app/routes';
import { DataTable, type Column } from '../../components/DataTable';
import { Icon } from '../../components/Icon';
import { Modal } from '../../components/Modal';
import { Chip, EmptyState, Note, PageHead, Select, Tabs, Toolbar, type TabDef } from '../../components/ui';
import { errorText, fDateTime, useCan, useLoad, useLookups } from './clientes/shared';
import { hub } from '../../auth/client';

const mon = hub.monitoring;
type Tab = 'politicas' | 'corridas';
const TABS: TabDef<Tab>[] = [{ id: 'politicas', label: 'Políticas' }, { id: 'corridas', label: 'Corridas' }];

const FREQ: Record<BackupFrequency, string> = { hourly: 'Cada hora', daily: 'Diaria', weekly: 'Semanal', monthly: 'Mensual' };
const RESP: Record<BackupResponsibility, string> = { company: 'Empresa', provider: 'Proveedor', customer: 'Cliente' };
const RUN: Record<BackupRunStatus, { label: string; kind: 'ok' | 'danger' | 'warn' | 'info' }> = {
  running: { label: 'En curso', kind: 'info' }, succeeded: { label: 'Correcta', kind: 'ok' }, failed: { label: 'Fallida', kind: 'danger' }, partial: { label: 'Parcial', kind: 'warn' },
};
const fSize = (b: number | null) => (b == null ? '—' : b >= 1073741824 ? `${(b / 1073741824).toFixed(1)} GB` : `${Math.max(0.1, b / 1048576).toFixed(1)} MB`);

export default function RespaldosView({ param }: ViewProps) {
  const initial = (TABS.some((t) => t.id === param) ? param : 'politicas') as Tab;
  const [tab, setTab] = useState<Tab>(initial);
  return (
    <>
      <PageHead crumbs={[['Infraestructura', 'infra'], ['Respaldos']]} title="Respaldos" sub="Políticas de respaldo por recurso y registro de corridas (modo manual; la ejecución automática por API llega después)." />
      <Tabs tabs={TABS} value={tab} onChange={setTab} label="Secciones de respaldos" style={{ marginBottom: 12 }} />
      {tab === 'politicas' ? <PoliciesTab /> : <RunsTab />}
    </>
  );
}

/* ------------------------------ Políticas ------------------------------ */

function PoliciesTab() {
  const { toast } = useApp();
  const can = useCan();
  const canEdit = can('monitoring.backup_policy.create') || can('monitoring.backup_policy.update');
  const [cursor, setCursor] = useState<string | null>(null);
  const res = useLoad(() => mon.listBackupPolicies({ size: 25, cursor, sort: 'name' }), [cursor]);
  const rows = res.data?.data ?? [];
  const meta = res.data?.meta;
  const [form, setForm] = useState<BackupPolicy | 'new' | null>(null);

  const remove = async (p: BackupPolicy) => {
    if (!window.confirm(`¿Eliminar la política «${p.name}»?`)) return;
    try {
      await mon.removeBackupPolicy(p.id);
      toast('Política eliminada');
      res.reload();
    } catch (e) {
      toast('No se pudo', errorText(e), 'err');
    }
  };

  const cols: Column<BackupPolicy>[] = [
    { key: 'name', header: 'Política', render: (p) => <div><strong>{p.name}</strong><div className="muted sm">{p.resource?.name ?? '—'}{p.service?.label ? ` · ${p.service.label}` : ''}</div></div> },
    { key: 'freq', header: 'Frecuencia', render: (p) => FREQ[p.frequency] },
    { key: 'ret', header: 'Retención', className: 'nw', render: (p) => `${p.retention_days} días` },
    { key: 'resp', header: 'Responsable', render: (p) => RESP[p.responsibility] },
    { key: 'enc', header: 'Cifrado', render: (p) => (p.encrypted ? <Chip kind="ok">Sí</Chip> : <Chip kind="warn">No</Chip>) },
    { key: 'act', header: 'Estado', render: (p) => <Chip kind={p.is_active ? 'ok' : ''}>{p.is_active ? 'Activa' : 'Inactiva'}</Chip> },
    { key: 'x', header: '', align: 'r', render: (p) => (canEdit ? (
      <span style={{ display: 'inline-flex', gap: 5, justifyContent: 'flex-end' }}>
        <button className="btn sm" onClick={() => setForm(p)}>Editar</button>
        {can('monitoring.backup_policy.delete') ? <button className="btn sm danger" onClick={() => void remove(p)}>Quitar</button> : null}
      </span>
    ) : null) },
  ];

  return (
    <div className="card">
      <Toolbar count={res.loading ? 'Cargando…' : `${rows.length}${meta?.has_more ? '+' : ''} en esta página`}>
        {can('monitoring.backup_policy.create') ? <button className="btn primary" onClick={() => setForm('new')}><Icon name="plus" size="sm" /> Nueva política</button> : null}
        <button className="btn sm" onClick={res.reload}><Icon name="refresh" size="sm" /> Actualizar</button>
      </Toolbar>
      {res.error ? <div className="card-b"><Note kind="warn">No se pudo cargar: {errorText(res.error)} <button className="btn sm" onClick={res.reload}>Reintentar</button></Note></div>
        : !res.loading && !rows.length ? <div className="card-b"><EmptyState title="Sin políticas" text="Crea la primera política de respaldo para un recurso." icon="restore" /></div>
          : <>
              <DataTable columns={cols} rows={rows} rowKey={(p) => p.id} caption="Políticas de respaldo" />
              <div className="card-b" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button className="btn sm" disabled={res.loading || !meta?.prev_cursor} onClick={() => setCursor(meta?.prev_cursor ?? null)}>Anterior</button>
                <button className="btn sm" disabled={res.loading || !meta?.next_cursor} onClick={() => setCursor(meta?.next_cursor ?? null)}>Siguiente</button>
              </div>
            </>}
      {form ? <PolicyModal policy={form === 'new' ? null : form} onClose={() => setForm(null)} onSaved={() => { setForm(null); res.reload(); }} /> : null}
    </div>
  );
}

function PolicyModal({ policy, onClose, onSaved }: { policy: BackupPolicy | null; onClose: () => void; onSaved: () => void }) {
  const { toast } = useApp();
  const { staff } = useLookups();
  const [rq, setRq] = useState('');
  const [rqDeb, setRqDeb] = useState('');
  const [resourceId, setResourceId] = useState(policy?.resource_id ?? '');
  const [resourceName, setResourceName] = useState(policy?.resource?.name ?? '');
  const [name, setName] = useState(policy?.name ?? '');
  const [frequency, setFrequency] = useState<BackupFrequency>(policy?.frequency ?? 'daily');
  const [retention, setRetention] = useState(String(policy?.retention_days ?? 14));
  const [responsibility, setResponsibility] = useState<BackupResponsibility>(policy?.responsibility ?? 'company');
  const [rpo, setRpo] = useState(policy?.rpo_minutes != null ? String(policy.rpo_minutes) : '');
  const [rto, setRto] = useState(policy?.rto_minutes != null ? String(policy.rto_minutes) : '');
  const [encrypted, setEncrypted] = useState(policy?.encrypted ?? true);
  const [isActive, setIsActive] = useState(policy?.is_active ?? true);
  const [destination, setDestination] = useState(policy?.destination ?? '');
  const [owner, setOwner] = useState(policy?.responsible_user_id ?? '');
  const [busy, setBusy] = useState(false);

  useEffect(() => { const t = setTimeout(() => setRqDeb(rq.trim()), 300); return () => clearTimeout(t); }, [rq]);
  const search = useLoad(() => (rqDeb && !resourceId ? hub.inventory.resources.list({ q: rqDeb, size: 8 }).then((r) => r.data) : Promise.resolve([])), [rqDeb, resourceId]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!resourceId) { toast('Falta el recurso', 'Elige el recurso a respaldar.', 'err'); return; }
    const input: BackupPolicyInput = {
      resource_id: resourceId, name: name.trim(), frequency, retention_days: Math.max(1, Number(retention) || 1),
      responsibility, rpo_minutes: rpo.trim() ? Number(rpo) : null, rto_minutes: rto.trim() ? Number(rto) : null,
      encrypted, is_active: isActive, destination: destination.trim() || null, responsible_user_id: owner || null,
    };
    setBusy(true);
    try {
      if (policy) await mon.updateBackupPolicy(policy.id, policy.version, input);
      else await mon.createBackupPolicy(input);
      toast(policy ? 'Política guardada' : 'Política creada');
      onSaved();
    } catch (err) {
      toast('No se pudo guardar', errorText(err), 'err');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open wide bare onClose={onClose} title={policy ? 'Editar política' : 'Nueva política de respaldo'}>
      <form className="modal-b" onSubmit={(e) => void submit(e)}>
        {resourceId ? (
          <div className="field full" style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}>
            <span>Recurso: <b>{resourceName || resourceId}</b></span>
            {!policy ? <button type="button" className="btn sm" onClick={() => { setResourceId(''); setResourceName(''); }}>Cambiar</button> : null}
          </div>
        ) : (
          <>
            <label className="field full">Recurso a respaldar*<input className="input" value={rq} placeholder="Buscar recurso (nodo, servicio, servidor…)" onChange={(e) => setRq(e.target.value)} /></label>
            {rqDeb ? (search.loading ? <p className="sub">Buscando…</p> : (search.data ?? []).length === 0 ? <p className="sub">Sin recursos para «{rqDeb}».</p> : (
              <ul className="rows full">
                {(search.data ?? []).map((r) => (
                  <li key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div className="grow"><b>{r.name}</b> <span className="sub">· {r.type}</span></div>
                    <button type="button" className="btn sm" onClick={() => { setResourceId(r.id); setResourceName(r.name); if (!name) setName(`Respaldo ${r.name}`); }}>Elegir</button>
                  </li>
                ))}
              </ul>
            )) : null}
          </>
        )}
        <label className="field">Nombre*<input required className="input" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="field">Frecuencia<Select value={frequency} onChange={(v) => setFrequency(v as BackupFrequency)} label="" options={(Object.keys(FREQ) as BackupFrequency[]).map((f) => [f, FREQ[f]])} /></label>
        <label className="field">Retención (días)*<input required className="input" type="number" min={1} value={retention} onChange={(e) => setRetention(e.target.value)} /></label>
        <label className="field">Responsable del respaldo<Select value={responsibility} onChange={(v) => setResponsibility(v as BackupResponsibility)} label="" options={(Object.keys(RESP) as BackupResponsibility[]).map((r) => [r, RESP[r]])} /></label>
        <label className="field">RPO (min, opcional)<input className="input" type="number" min={1} value={rpo} onChange={(e) => setRpo(e.target.value)} /></label>
        <label className="field">RTO (min, opcional)<input className="input" type="number" min={1} value={rto} onChange={(e) => setRto(e.target.value)} /></label>
        <label className="field full">Destino (opcional)<input className="input" value={destination} placeholder="S3, servidor de respaldos…" onChange={(e) => setDestination(e.target.value)} /></label>
        <label className="field">Encargado (usuario)<select className="input" value={owner} onChange={(e) => setOwner(e.target.value)}><option value="">— Ninguno —</option>{staff.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
        <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={encrypted} onChange={(e) => setEncrypted(e.target.checked)} /> Respaldo cifrado</label>
        <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Política activa</label>
        <div className="modal-f"><button type="button" className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={busy}>{policy ? 'Guardar' : 'Crear política'}</button></div>
      </form>
    </Modal>
  );
}

/* ------------------------------ Corridas ------------------------------ */

function RunsTab() {
  const can = useCan();
  const [status, setStatus] = useState('');
  const [policyF, setPolicyF] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const policies = useLoad(() => mon.listBackupPolicies({ size: 100, sort: 'name' }), []);
  const res = useLoad(() => mon.listBackupRuns({ size: 25, cursor, filter: { status: status || undefined, backup_policy_id: policyF || undefined } }), [status, policyF, cursor]);
  const rows = res.data?.data ?? [];
  const meta = res.data?.meta;
  const [creating, setCreating] = useState(false);

  const cols: Column<BackupRun>[] = [
    { key: 's', header: 'Inicio', className: 'nw', render: (r) => fDateTime(r.started_at) },
    { key: 'p', header: 'Política', render: (r) => r.policy?.name ?? '—' },
    { key: 'st', header: 'Estado', render: (r) => <><Chip kind={RUN[r.status].kind}>{RUN[r.status].label}</Chip>{r.error ? <div className="sub">{r.error}</div> : null}</> },
    { key: 'f', header: 'Fin', className: 'nw', render: (r) => fDateTime(r.finished_at) },
    { key: 'sz', header: 'Tamaño', align: 'r', className: 'nw', render: (r) => fSize(r.size_bytes) },
    { key: 'loc', header: 'Ubicación', render: (r) => r.location ?? <span className="sub">—</span> },
  ];

  return (
    <div className="card">
      <Toolbar count={res.loading ? 'Cargando…' : `${rows.length}${meta?.has_more ? '+' : ''} en esta página`}>
        <Select value={policyF} onChange={(v) => { setPolicyF(v); setCursor(null); }} label="Política" options={[['', 'Todas las políticas'], ...(policies.data?.data ?? []).map((p): [string, string] => [p.id, p.name])]} />
        <Select value={status} onChange={(v) => { setStatus(v); setCursor(null); }} label="Estado" options={[['', 'Todos'], ['succeeded', 'Correcta'], ['failed', 'Fallida'], ['partial', 'Parcial'], ['running', 'En curso']]} />
        {can('monitoring.backup_run.create') ? <button className="btn primary" onClick={() => setCreating(true)} disabled={(policies.data?.data ?? []).length === 0}><Icon name="plus" size="sm" /> Registrar corrida</button> : null}
        <button className="btn sm" onClick={res.reload}><Icon name="refresh" size="sm" /> Actualizar</button>
      </Toolbar>
      {res.error ? <div className="card-b"><Note kind="warn">No se pudo cargar: {errorText(res.error)} <button className="btn sm" onClick={res.reload}>Reintentar</button></Note></div>
        : !res.loading && !rows.length ? <div className="card-b"><EmptyState title="Sin corridas" text="Registra una corrida de respaldo o conéctala a la herramienta del nodo (fase posterior)." icon="restore" /></div>
          : <>
              <DataTable columns={cols} rows={rows} rowKey={(r) => r.id} caption="Corridas de respaldo" />
              <div className="card-b" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button className="btn sm" disabled={res.loading || !meta?.prev_cursor} onClick={() => setCursor(meta?.prev_cursor ?? null)}>Anterior</button>
                <button className="btn sm" disabled={res.loading || !meta?.next_cursor} onClick={() => setCursor(meta?.next_cursor ?? null)}>Siguiente</button>
              </div>
            </>}
      {creating ? <RunModal policies={policies.data?.data ?? []} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); res.reload(); }} /> : null}
    </div>
  );
}

function RunModal({ policies, onClose, onSaved }: { policies: BackupPolicy[]; onClose: () => void; onSaved: () => void }) {
  const { toast } = useApp();
  const [policyId, setPolicyId] = useState(policies[0]?.id ?? '');
  const [status, setStatus] = useState<BackupRunStatus>('succeeded');
  const [startedAt, setStartedAt] = useState('');
  const [finishedAt, setFinishedAt] = useState('');
  const [sizeMb, setSizeMb] = useState('');
  const [location, setLocation] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const terminated = status !== 'running';

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!policyId || !startedAt) return;
    if (terminated && !finishedAt) { toast('Falta la hora de fin', 'Una corrida terminada necesita hora de fin.', 'err'); return; }
    if ((status === 'failed' || status === 'partial') && !error.trim()) { toast('Falta el detalle', 'Indica el detalle del fallo.', 'err'); return; }
    setBusy(true);
    try {
      await mon.createBackupRun({
        backup_policy_id: policyId, status,
        started_at: new Date(startedAt).toISOString(),
        finished_at: finishedAt ? new Date(finishedAt).toISOString() : null,
        size_bytes: sizeMb.trim() ? Math.round(Number(sizeMb) * 1048576) : null,
        location: location.trim() || null, error: error.trim() || null,
      });
      toast('Corrida registrada');
      onSaved();
    } catch (err) {
      toast('No se pudo registrar', errorText(err), 'err');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open bare onClose={onClose} title="Registrar corrida de respaldo">
      <form className="modal-b" onSubmit={(e) => void submit(e)}>
        <label className="field full">Política*<select required className="input" value={policyId} onChange={(e) => setPolicyId(e.target.value)}>{policies.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label className="field">Estado*<Select value={status} onChange={(v) => setStatus(v as BackupRunStatus)} label="" options={(Object.keys(RUN) as BackupRunStatus[]).map((s) => [s, RUN[s].label])} /></label>
        <label className="field">Tamaño (MB, opcional)<input className="input" type="number" min={0} step="0.1" value={sizeMb} onChange={(e) => setSizeMb(e.target.value)} /></label>
        <label className="field">Inicio*<input required type="datetime-local" className="input" value={startedAt} onChange={(e) => setStartedAt(e.target.value)} /></label>
        <label className="field">Fin{terminated ? '*' : ' (si terminó)'}<input type="datetime-local" className="input" value={finishedAt} onChange={(e) => setFinishedAt(e.target.value)} /></label>
        <label className="field full">Ubicación (opcional)<input className="input" value={location} placeholder="Ruta o id del punto de restauración" onChange={(e) => setLocation(e.target.value)} /></label>
        {status === 'failed' || status === 'partial' ? <label className="field full">Detalle del fallo*<textarea className="input" rows={2} value={error} onChange={(e) => setError(e.target.value)} /></label> : null}
        <div className="modal-f"><button type="button" className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={busy}>Registrar</button></div>
      </form>
    </Modal>
  );
}
