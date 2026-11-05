import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { isProblem, type Contract, type ContractFilters, type ContractInput, type ContractStatus, type ContractUpdateInput, type Currency } from '@hub/api';
import { useApp } from '../../app/context';
import type { ViewProps } from '../../app/routes';
import { DataTable, type Column } from '../../components/DataTable';
import { Icon } from '../../components/Icon';
import { Modal } from '../../components/Modal';
import { Chip, EmptyState, Note, PageHead, Select, Skeleton, Toolbar } from '../../components/ui';
import { customersApi, displayName, errorText, fDate, useCan, useLoad, useLookups } from './clientes/shared';
import { CONTRACT_CHIP, contractsApi } from './contratos/shared';

const STATUS: Record<ContractStatus, string> = { draft: 'Borrador', in_review: 'En revisión', approved: 'Aprobado', sent: 'Enviado', signed_active: 'Vigente firmado', expired: 'Vencido', terminated: 'Terminado' };
const PER = 25;

export default function ContratosView({ param }: ViewProps) {
  return param ? <ContractDetail id={param} onBack={() => { window.location.hash = '#contratos'; }} /> : <ContractList />;
}

function ContractList() {
  const can = useCan();
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [reload, setReload] = useState(0);
  const filter = useMemo<ContractFilters>(() => ({ status: status as ContractStatus | '' }), [status]);
  const res = useLoad(() => contractsApi.list({ filter, q: q || undefined, cursor, size: PER, sort: '-created_at' }), [filter, q, cursor, reload]);
  const rows = res.data?.data ?? [];
  const meta = res.data?.meta;
  const cols: Column<Contract>[] = [
    { key: 'number', header: 'Contrato', className: 'nw', render: (c) => <a className="rowlink mono" href={`#contratos/${c.id}`}>{c.number}</a> },
    { key: 'customer', header: 'Cliente', minWidth: 180, render: (c) => c.customer ? <>{c.customer.name}<div className="sub mono">{c.customer.code}</div></> : '—' },
    { key: 'status', header: 'Estado', render: (c) => <Chip kind={CONTRACT_CHIP[c.status]}>{STATUS[c.status]}</Chip> },
    { key: 'currency', header: 'Moneda', render: (c) => c.currency },
    { key: 'term', header: 'Vigencia', className: 'nw', render: (c) => `${fDate(c.starts_on)} – ${fDate(c.ends_on)}` },
  ];
  const changeStatus = (v: string) => { setStatus(v); setCursor(null); };
  return <>
    <PageHead crumbs={[[ 'Comercial', 'contratos' ], ['Contratos']]} title="Contratos" sub="Contratos y versiones vigentes."
      actions={can('contracts.contract.create') ? <button type="button" className="btn primary" onClick={() => setCreating(true)}><Icon name="plus" size="sm" />Nuevo contrato</button> : null} />
    <section className="card">
      <Toolbar count={res.loading ? 'Cargando…' : `${rows.length}${meta?.has_more ? '+' : ''} en esta página`}>
        <Select value={status} onChange={changeStatus} label="Estado" options={[['', 'Todos los estados'], ...Object.entries(STATUS)]} />
        <input className="input" aria-label="Buscar contratos" placeholder="Buscar número o cliente…" value={q} onChange={(e) => { setQ(e.target.value); setCursor(null); }} />
      </Toolbar>
      {res.error ? <div className="card-b"><Note kind="warn" role="alert">No se pudo cargar: {errorText(res.error)} <button type="button" className="btn sm" onClick={res.reload}>Reintentar</button></Note></div>
        : res.loading && !res.data ? <Skeleton variant="table" rows={5} />
        : !rows.length ? <EmptyState title="Sin contratos" text="No hay contratos que coincidan con los filtros." />
        : <><DataTable columns={cols} rows={rows} rowKey={(x) => x.id} caption="Contratos" />
          <div className="card-b" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="btn sm" disabled={res.loading || !meta?.prev_cursor} onClick={() => setCursor(meta?.prev_cursor ?? null)}>Anterior</button>
            <button type="button" className="btn sm" disabled={res.loading || !meta?.next_cursor} onClick={() => setCursor(meta?.next_cursor ?? null)}>Siguiente</button>
          </div></>}
    </section>
    {creating ? <ContractForm onClose={() => setCreating(false)} onSaved={(c) => { setCreating(false); setReload((n) => n + 1); window.location.hash = `#contratos/${c.id}`; }} /> : null}
  </>;
}

function ContractDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { toast } = useApp();
  const can = useCan();
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState(false);
  const [modal, setModal] = useState<'terminate' | 'addendum' | null>(null);
  const [reason, setReason] = useState('');
  const [changeSummary, setChangeSummary] = useState('');
  const [busy, setBusy] = useState(false);
  const res = useLoad(() => contractsApi.get(id), [id, reload]);
  const c = res.data;
  const ver = c?.current_version_data;
  const refresh = () => setReload((n) => n + 1);
  const act = async (action: 'submit' | 'approve' | 'send' | 'sign' | 'terminate' | 'expire' | 'addendum') => {
    if (!c) return;
    if (action === 'terminate' && !reason.trim()) return;
    if (action === 'addendum' && !reason.trim()) return;
    setBusy(true);
    try {
      if (action === 'submit') await contractsApi.submit(id, c.version);
      else if (action === 'approve') await contractsApi.approve(id, c.version);
      else if (action === 'send') await contractsApi.send(id, c.version);
      else if (action === 'sign') await contractsApi.sign(id, c.version);
      else if (action === 'terminate') await contractsApi.terminate(id, c.version, reason.trim());
      else if (action === 'expire') await contractsApi.expire(id, c.version);
      else await contractsApi.addendum(id, c.version, { body: reason.trim(), change_summary: changeSummary.trim() || null });
      toast('Contrato actualizado', c.number);
      setModal(null); setReason(''); setChangeSummary(''); refresh();
    } catch (e) {
      if (isProblem(e) && e.status === 409) { refresh(); toast('Contrato recargado', errorText(e), 'warn'); }
      else toast(isProblem(e) && e.status === 422 ? 'Revise los campos' : 'No se pudo actualizar', errorText(e), 'err');
    } finally { setBusy(false); }
  };
  if (res.error) return <><PageHead title="Contrato" /><Note kind="warn" role="alert">No se pudo cargar: {errorText(res.error)} <button className="btn sm" onClick={res.reload}>Reintentar</button> <button className="btn sm" onClick={onBack}>Volver</button></Note></>;
  if (res.loading || !c) return <><PageHead title="Contrato" /><Skeleton variant="detail" rows={5} /></>;
  const update = can('contracts.contract.update');
  return <>
    <PageHead crumbs={[[ 'Comercial', 'contratos' ], ['Contratos', 'contratos'], [c.number]]} title={c.number} sub={`${c.customer?.name ?? 'Cliente'} · ${c.brand?.name ?? 'Marca'} · v${c.current_version}`}
      actions={<><Chip kind={CONTRACT_CHIP[c.status]}>{STATUS[c.status]}</Chip>
        {(c.status === 'draft' || c.status === 'in_review') && update ? <button className="btn" onClick={() => setEditing(true)}>Editar borrador</button> : null}
        {c.status === 'draft' && update ? <button className="btn primary" disabled={busy} onClick={() => void act('submit')}>Enviar a revisión</button> : null}
        {c.status === 'in_review' && can('contracts.contract.approve') ? <button className="btn success" disabled={busy} onClick={() => void act('approve')}>Aprobar</button> : null}
        {c.status === 'approved' && update ? <button className="btn primary" disabled={busy} onClick={() => void act('send')}>Enviar</button> : null}
        {c.status === 'sent' && update ? <button className="btn success" disabled={busy} onClick={() => void act('sign')}>Marcar firmado</button> : null}
        {c.status === 'sent' && update ? <button className="btn" disabled={busy} onClick={() => void act('expire')}>Marcar vencido</button> : null}
        {c.status === 'signed_active' && update ? <><button className="btn" onClick={() => setModal('addendum')}>Agregar adenda</button><button className="btn danger" onClick={() => setModal('terminate')}>Terminar</button><button className="btn" disabled={busy} onClick={() => void act('expire')}>Marcar vencido</button></> : null}
      </>} />
    <div className="grid g-2">
      <section className="card"><div className="card-h"><h2 className="sec">Versión {ver?.version_number ?? c.current_version}</h2><span className="sub">{ver?.kind === 'addendum' ? 'Adenda' : 'Original'} · {ver ? fDate(ver.created_at) : ''}</span></div>
        {ver?.change_summary ? <div className="card-b"><Note>{ver.change_summary}</Note></div> : null}
        {ver ? <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', padding: 16, margin: 0, font: 'inherit' }}>{ver.body}</pre> : <div className="card-b"><Note kind="warn">La API no devolvió la versión vigente.</Note></div>}
      </section>
      <aside className="card"><div className="card-h"><h2 className="sec">Datos del contrato</h2></div><div className="card-b"><dl className="kv">
        <dt>Cliente</dt><dd>{c.customer?.name ?? '—'}</dd><dt>Marca</dt><dd>{c.brand?.name ?? '—'}</dd><dt>Estado</dt><dd><Chip kind={CONTRACT_CHIP[c.status]}>{STATUS[c.status]}</Chip></dd>
        <dt>Moneda</dt><dd>{c.currency}</dd><dt>Vigencia</dt><dd>{fDate(c.starts_on)} – {fDate(c.ends_on)}</dd>
        <dt>Fee</dt><dd>{c.management_fee_percent == null ? '—' : `${c.management_fee_percent}%`}</dd><dt>Fee mínimo</dt><dd>{c.management_fee_min_minor == null ? '—' : `${c.management_fee_min_minor} ${c.currency} (minor)`}</dd><dt>Horas incluidas</dt><dd>{c.included_hours ?? '—'}</dd>
        <dt>Creado</dt><dd>{fDate(c.created_at)}</dd>{c.termination_reason ? <><dt>Motivo de término</dt><dd>{c.termination_reason}</dd></> : null}
      </dl></div></aside>
    </div>
    {editing ? <ContractForm contract={c} onClose={() => setEditing(false)} onConflict={refresh} onSaved={() => { setEditing(false); refresh(); }} /> : null}
    {modal ? <Modal open onClose={() => { setModal(null); setReason(''); setChangeSummary(''); }} title={modal === 'terminate' ? 'Terminar contrato' : 'Agregar adenda'} footer={<><button className="btn" onClick={() => setModal(null)}>Cancelar</button><button className={`btn ${modal === 'terminate' ? 'danger' : 'primary'}`} disabled={busy || !reason.trim()} onClick={() => void act(modal)}>{modal === 'terminate' ? 'Confirmar término' : 'Guardar adenda'}</button></>}>
      <label className="field full">{modal === 'terminate' ? 'Motivo de término' : 'Nuevo cuerpo de la adenda'}<textarea className="input" rows={modal === 'terminate' ? 4 : 14} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
      {modal === 'addendum' ? <label className="field full" style={{ marginTop: 10 }}>Resumen del cambio<input className="input" value={changeSummary} onChange={(e) => setChangeSummary(e.target.value)} /></label> : null}
    </Modal> : null}
  </>;
}

function ContractForm({ contract, onClose, onSaved, onConflict }: { contract?: Contract; onClose: () => void; onSaved: (c: Contract) => void; onConflict?: () => void }) {
  const { toast } = useApp();
  const { brands } = useLookups();
  const [customers, setCustomers] = useState<{ id: string; label: string }[]>([]);
  const [customer, setCustomer] = useState(contract?.customer_id ?? '');
  const [brand, setBrand] = useState(contract?.brand_id ?? '');
  const [currency, setCurrency] = useState<Currency>(contract?.currency ?? 'PEN');
  const [starts, setStarts] = useState(contract?.starts_on?.slice(0, 10) ?? '');
  const [ends, setEnds] = useState(contract?.ends_on?.slice(0, 10) ?? '');
  const [fee, setFee] = useState(contract?.management_fee_percent == null ? '' : String(contract.management_fee_percent));
  const [minFee, setMinFee] = useState(contract?.management_fee_min_minor == null ? '' : String(contract.management_fee_min_minor));
  const [hours, setHours] = useState(contract?.included_hours == null ? '' : String(contract.included_hours));
  const [body, setBody] = useState(contract?.current_version_data?.body ?? '');
  const [summary, setSummary] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { void customersApi.list({ size: 100, sort: 'legal_name' }).then((p) => setCustomers(p.data.map((x) => ({ id: x.id, label: `${displayName(x)} · ${x.code}` })))).catch(() => undefined); }, []);
  const submit = async (ev: FormEvent) => {
    ev.preventDefault(); setMessage('');
    if (!customer || !brand || !body.trim()) { setMessage('Seleccione cliente y marca, y complete el cuerpo del contrato.'); return; }
    setBusy(true);
    const core = { customer_id: customer, brand_id: brand, currency, starts_on: starts || null, ends_on: ends || null,
      management_fee_percent: fee === '' ? null : Number(fee), management_fee_min_minor: minFee === '' ? null : Number(minFee), included_hours: hours === '' ? null : Number(hours), body: body.trim() };
    try {
      const saved = contract ? await contractsApi.update(contract.id, contract.version, { ...core, change_summary: summary || null } satisfies ContractUpdateInput) : await contractsApi.create(core satisfies ContractInput);
      toast(contract ? 'Contrato actualizado' : 'Borrador creado', saved.number); onSaved(saved);
    } catch (e) {
      if (isProblem(e) && e.status === 409) { onConflict?.(); setMessage(`${errorText(e)} Se recargó la ficha.`); }
      else setMessage(isProblem(e) && e.status === 422 ? 'Revise los campos.' : errorText(e));
    } finally { setBusy(false); }
  };
  return <Modal open wide onClose={onClose} title={contract ? `Editar ${contract.number}` : 'Nuevo contrato'} sub="El cuerpo se guarda directamente en el contrato." bare>
    <form className="modal-b" onSubmit={(e) => void submit(e)}><div className="form-grid">
      <label className="field">Cliente<select className="select" value={customer} onChange={(e) => setCustomer(e.target.value)}><option value="">Seleccione…</option>{customers.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
      <label className="field">Marca<select className="select" value={brand} onChange={(e) => setBrand(e.target.value)}><option value="">Seleccione…</option>{brands.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
      <label className="field">Moneda<select className="select" value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}><option value="PEN">PEN · Soles</option><option value="USD">USD · Dólares</option></select></label>
      <label className="field">Inicio<input className="input" type="date" value={starts} onChange={(e) => setStarts(e.target.value)} /></label>
      <label className="field">Fin<input className="input" type="date" value={ends} onChange={(e) => setEnds(e.target.value)} /></label>
      <label className="field">Fee de gestión (%)<input className="input" type="number" min="0" step="0.01" value={fee} onChange={(e) => setFee(e.target.value)} /></label>
      <label className="field">Fee mínimo (unidades menores)<input className="input" type="number" min="0" step="1" value={minFee} onChange={(e) => setMinFee(e.target.value)} /></label>
      <label className="field">Horas incluidas<input className="input" type="number" min="0" step="0.01" value={hours} onChange={(e) => setHours(e.target.value)} /></label>
      {contract ? <label className="field">Resumen del cambio<input className="input" value={summary} onChange={(e) => setSummary(e.target.value)} /></label> : null}
      <label className="field full">Cuerpo del contrato<textarea className="input" rows={16} value={body} onChange={(e) => setBody(e.target.value)} /></label>
    </div>
    <div style={{ marginTop: 8 }}><Note>Plantillas y cláusulas: próximamente.</Note></div><div className="err" role="alert">{message}</div>
    <div className="modal-f"><button type="button" className="btn" onClick={onClose}>Cancelar</button><button type="submit" className="btn primary" disabled={busy}>{busy ? 'Guardando…' : contract ? 'Guardar cambios' : 'Crear borrador'}</button></div></form>
  </Modal>;
}
