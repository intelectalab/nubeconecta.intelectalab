import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { isProblem, QUOTE_STATUS_LABELS, type Currency, type Lead, type Quote, type QuoteFilters, type QuoteInput, type QuoteItemInput, type QuoteStatus } from '@hub/api';
import { useApp } from '../../app/context';
import type { ViewProps } from '../../app/routes';
import { DataTable, type Column } from '../../components/DataTable';
import { Icon } from '../../components/Icon';
import { Modal } from '../../components/Modal';
import { Chip, EmptyState, Note, PageHead, SearchBox, Select, Skeleton, Toolbar } from '../../components/ui';
import { CustomerSearch } from './clientes/CustomerSearch';
import { errorText, fDate, fDateTime, moneyMinor, useCan, useLoad, useLookups } from './clientes/shared';
import { quotesApi, QUOTE_CHIP } from './cotizaciones/shared';
import { hub } from '../../auth/client';

const PER = 25;
const CYCLES = [['monthly', 'Mensual'], ['quarterly', 'Trimestral'], ['semiannual', 'Semestral'], ['annual', 'Anual'], ['biennial', 'Bienal'], ['triennial', 'Trienal']];
const formatInputMoney = (minor: number) => (minor / 100).toFixed(2);
const toMinor = (amount: string) => Math.round((Number(amount) || 0) * 100);

export default function CotizacionesView({ param }: ViewProps) {
  return param ? <QuoteDetail id={param} onBack={() => { window.location.hash = '#cotizaciones'; }} /> : <QuoteList />;
}

function QuoteList() {
  const can = useCan();
  const [status, setStatus] = useState('');
  const [currency, setCurrency] = useState('');
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const filter = useMemo<QuoteFilters>(() => ({ status: status as QuoteStatus | '', currency: currency as Currency | '' }), [status, currency]);
  const res = useLoad(() => quotesApi.list({ filter, q: q || undefined, cursor, size: PER, sort: '-created_at' }), [filter, q, cursor, refresh]);
  const rows = res.data?.data ?? [];
  const meta = res.data?.meta;
  const columns: Column<Quote>[] = [
    { key: 'number', header: 'Cotización', className: 'nw', render: (x) => <a className="rowlink mono" href={`#cotizaciones/${x.id}`}>{x.number}</a> },
    { key: 'party', header: 'Cliente / prospecto', minWidth: 190, render: (x) => x.customer ? <>{x.customer.name}<div className="sub mono">{x.customer.code}</div></> : x.lead?.name ?? '—' },
    { key: 'brand', header: 'Marca', render: (x) => x.brand?.name ?? '—' },
    { key: 'total', header: 'Cargo único', align: 'r', className: 'nw', render: (x) => x.current_version_data ? moneyMinor(x.current_version_data.one_time_total_minor, x.currency) : '—' },
    { key: 'recurring', header: 'Recurrente', align: 'r', className: 'nw', render: (x) => x.current_version_data ? moneyMinor(x.current_version_data.recurring_total_minor, x.currency) : '—' },
    { key: 'version', header: 'Versión', render: (x) => `v${x.current_version}` },
    { key: 'valid', header: 'Válida hasta', className: 'nw', render: (x) => fDate(x.valid_until) },
    { key: 'status', header: 'Estado', render: (x) => <Chip kind={QUOTE_CHIP[x.status]}>{QUOTE_STATUS_LABELS[x.status]}</Chip> },
  ];
  const changeFilter = (fn: (s: string) => void) => (value: string) => { fn(value); setCursor(null); };
  return <>
    <PageHead crumbs={[[ 'Comercial', 'cotizaciones' ], ['Cotizaciones']]} title="Cotizaciones" sub="Propuestas comerciales y sus versiones vigentes."
      actions={can('sales.quote.create') ? <button type="button" className="btn primary" onClick={() => setCreating(true)}><Icon name="plus" size="sm" />Nueva cotización</button> : null} />
    <section className="card">
      <Toolbar count={res.loading ? 'Cargando…' : `${rows.length}${meta?.has_more ? '+' : ''} en esta página`}><SearchBox label="Buscar cotizaciones" placeholder="Buscar número o cliente…" value={q} onChange={(v) => { setQ(v); setCursor(null); }} />
        <Select value={status} onChange={changeFilter(setStatus)} label="Estado" options={[['', 'Todos los estados'], ...Object.entries(QUOTE_STATUS_LABELS)]} />
        <Select value={currency} onChange={changeFilter(setCurrency)} label="Moneda" options={[[ '', 'Todas las monedas' ], ['PEN', 'Soles'], ['USD', 'Dólares']]} />
        
      </Toolbar>
      {res.error ? <div className="card-b"><Note kind="warn" role="alert">No se pudo cargar: {errorText(res.error)} <button type="button" className="btn sm" onClick={res.reload}>Reintentar</button></Note></div>
        : res.loading && !res.data ? <Skeleton variant="table" rows={5} />
        : !rows.length ? <EmptyState title="Sin cotizaciones" text="No hay cotizaciones que coincidan con los filtros." />
        : <><DataTable columns={columns} rows={rows} rowKey={(x) => x.id} caption="Cotizaciones" />
          <div className="card-b" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="btn sm" disabled={res.loading || !meta?.prev_cursor} onClick={() => setCursor(meta?.prev_cursor ?? null)}>Anterior</button>
            <button type="button" className="btn sm" disabled={res.loading || !meta?.next_cursor} onClick={() => setCursor(meta?.next_cursor ?? null)}>Siguiente</button>
          </div></>}
    </section>
    {creating ? <QuoteForm onClose={() => setCreating(false)} onSaved={(quote) => { setCreating(false); setRefresh((n) => n + 1); window.location.hash = `#cotizaciones/${quote.id}`; }} /> : null}
  </>;
}

function QuoteDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { toast } = useApp();
  const can = useCan();
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const res = useLoad(() => quotesApi.get(id), [id, reload]);
  const quote = res.data;
  const version = quote?.current_version_data;
  const doAction = async (action: 'send' | 'accept' | 'reject' | 'expire' | 'remove') => {
    if (!quote) return;
    if (action === 'reject' && !reason.trim()) return;
    if (action === 'remove' && !window.confirm(`¿Eliminar el borrador ${quote.number}?`)) return;
    setBusy(true);
    try {
      if (action === 'send') await quotesApi.send(id, quote.version);
      else if (action === 'accept') await quotesApi.accept(id, quote.version);
      else if (action === 'reject') await quotesApi.reject(id, quote.version, reason.trim());
      else if (action === 'expire') await quotesApi.expire(id, quote.version);
      else await quotesApi.remove(id, quote.version);
      if (action === 'remove') { toast('Borrador eliminado', quote.number); onBack(); }
      else { toast('Cotización actualizada', quote.number); setRejecting(false); setReason(''); setReload((n) => n + 1); }
    } catch (e) {
      if (isProblem(e) && e.status === 409) { setReload((n) => n + 1); toast('Cotización recargada', errorText(e), 'warn'); }
      else toast(isProblem(e) && e.status === 422 ? 'Revise los campos' : 'No se pudo actualizar', errorText(e), 'err');
    } finally { setBusy(false); }
  };
  if (res.error) return <><PageHead title="Cotización" /><Note kind="warn" role="alert">No se pudo cargar: {errorText(res.error)} <button className="btn sm" onClick={res.reload}>Reintentar</button> <button className="btn sm" onClick={onBack}>Volver</button></Note></>;
  if (res.loading || !quote) return <><PageHead title="Cotización" /><Skeleton variant="detail" rows={5} /></>;
  const party = quote.customer?.name ?? quote.lead?.name ?? 'Sin nombre';
  return <>
    <PageHead crumbs={[[ 'Comercial', 'cotizaciones' ], ['Cotizaciones', 'cotizaciones'], [quote.number]]} title={quote.number} sub={`${party} · ${quote.brand?.name ?? ''} · v${quote.current_version} · válida hasta ${fDate(quote.valid_until)}`}
      actions={<><Chip kind={QUOTE_CHIP[quote.status]}>{QUOTE_STATUS_LABELS[quote.status]}</Chip>
        {quote.status === 'draft' && can('sales.quote.update') ? <button className="btn" onClick={() => setEditing(true)}>Editar borrador</button> : null}
        {quote.status === 'draft' && can('sales.quote.update') ? <button className="btn primary" disabled={busy} onClick={() => void doAction('send')}>Enviar</button> : null}
        {quote.status === 'draft' && can('sales.quote.delete') ? <button className="btn danger" disabled={busy} onClick={() => void doAction('remove')}>Eliminar</button> : null}
        {quote.status === 'sent' && can('sales.quote.update') ? <><button className="btn success" disabled={busy} onClick={() => void doAction('accept')}>Aceptar</button><button className="btn" disabled={busy} onClick={() => setRejecting(true)}>Rechazar</button><button className="btn" disabled={busy} onClick={() => void doAction('expire')}>Vencer</button></> : null}</>} />
    {!version ? <Note kind="warn">La API no devolvió la versión vigente.</Note> : <div className="grid g-2">
      <section className="card"><div className="card-h"><h2 className="sec">Versión {version.version_number}</h2><span className="sub">Creada {fDateTime(version.created_at)}</span></div>
        {version.change_note ? <div className="card-b"><Note>{version.change_note}</Note></div> : null}
        <div className="tw"><table className="t"><thead><tr><th>Descripción</th><th>Tipo</th><th>Ciclo</th><th className="r">Cantidad</th><th className="r">Precio unitario</th><th className="r">Descuento</th><th className="r">Total</th></tr></thead><tbody>
          {version.items.map((item) => <tr key={item.id}><td>{item.description}</td><td>{item.charge_type === 'one_time' ? 'Único' : 'Recurrente'}</td><td>{item.cycle ?? '—'}</td><td className="r">{item.quantity}</td><td className="r nw">{moneyMinor(item.unit_price_minor, item.currency)}</td><td className="r nw">{moneyMinor(item.discount_minor, item.currency)}</td><td className="r nw strong">{moneyMinor(item.total_minor, item.currency)}</td></tr>)}
        </tbody></table></div>
        <div className="card-b" style={{ marginLeft: 'auto', maxWidth: 360 }}><div className="kv"><dt>Cargos únicos</dt><dd>{moneyMinor(version.one_time_total_minor, version.currency)}</dd><dt>Recurrente</dt><dd>{moneyMinor(version.recurring_total_minor, version.currency)}</dd><dt>IGV</dt><dd>{moneyMinor(version.tax_minor, version.currency)}</dd><dt><b>Total cargos únicos + IGV</b></dt><dd><b>{moneyMinor(version.one_time_total_minor + version.tax_minor, version.currency)}</b></dd></div></div>
      </section><aside className="card"><div className="card-h"><h2 className="sec">Datos</h2></div><div className="card-b"><p>Estado: <Chip kind={QUOTE_CHIP[quote.status]}>{QUOTE_STATUS_LABELS[quote.status]}</Chip></p><p>Moneda: {quote.currency}</p><p>Responsable: {quote.owner?.name ?? '—'}</p><p>Creada: {fDateTime(quote.created_at)}</p>{quote.rejection_reason ? <p>Motivo de rechazo: {quote.rejection_reason}</p> : null}</div></aside>
    </div>}
    {rejecting ? <Modal open onClose={() => setRejecting(false)} title="Rechazar cotización" footer={<><button className="btn" onClick={() => setRejecting(false)}>Cancelar</button><button className="btn danger" disabled={busy || !reason.trim()} onClick={() => void doAction('reject')}>Confirmar rechazo</button></>}><label className="field full">Motivo<textarea className="input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></label></Modal> : null}
    {editing ? <QuoteForm quote={quote} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); setReload((n) => n + 1); }} /> : null}
  </>;
}

function QuoteForm({ quote, onClose, onSaved }: { quote?: Quote; onClose: () => void; onSaved: (q: Quote) => void }) {
  const { toast } = useApp();
  const { brands } = useLookups();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [brand, setBrand] = useState(quote?.brand_id ?? '');
  const [partyType, setPartyType] = useState(quote?.customer_id ? 'customer' : 'lead');
  const [party, setParty] = useState(quote?.customer_id ?? quote?.lead_id ?? '');
  const [currency, setCurrency] = useState<Currency>(quote?.currency ?? 'PEN');
  const [validUntil, setValidUntil] = useState(quote?.valid_until ?? '');
  const [terms, setTerms] = useState(quote?.current_version_data?.terms ?? '');
  const [changeNote, setChangeNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const initialItems = quote?.current_version_data?.items;
  const [items, setItems] = useState<QuoteItemInput[]>(initialItems?.map((i) => ({ description: i.description, charge_type: i.charge_type, cycle: i.cycle, quantity: Number(i.quantity), unit_price_minor: i.unit_price_minor, discount_minor: i.discount_minor })) ?? [{ description: '', charge_type: 'one_time', quantity: 1, unit_price_minor: 0, discount_minor: 0 }]);
  useEffect(() => { hub.sales.leads.list({ size: 100, sort: '-created_at' }).then((page) => setLeads(page.data)).catch(() => undefined); }, []);
  const updateItem = (idx: number, patch: Partial<QuoteItemInput>) => setItems((prev) => prev.map((item, i) => i === idx ? { ...item, ...patch } : item));
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setMessage('');
    if (!brand || !party || items.length === 0 || items.some((i) => !i.description.trim() || i.quantity <= 0 || i.unit_price_minor < 0 || (i.charge_type === 'recurring' && !i.cycle))) { setMessage('Revise los campos y complete cada línea.'); return; }
    const input: QuoteInput = { brand_id: brand, currency, valid_until: validUntil || null, terms: terms || null, ...(partyType === 'customer' ? { customer_id: party, lead_id: null } : { lead_id: party, customer_id: null }), items };
    setBusy(true);
    try { const saved = quote ? await quotesApi.update(quote.id, quote.version, { ...input, change_note: changeNote || null }) : await quotesApi.create(input); toast(quote ? 'Nueva versión guardada' : 'Cotización creada', saved.number); onSaved(saved); }
    catch (e) { if (isProblem(e) && e.status === 409) setMessage(`${errorText(e)} Recargue la ficha.`); else if (isProblem(e) && e.status === 422) setMessage('Revise los campos.'); else setMessage(errorText(e)); }
    finally { setBusy(false); }
  };
  return <Modal open wide onClose={onClose} title={quote ? 'Editar borrador' : 'Nueva cotización'} sub="El precio lo define el equipo comercial." bare>
    <form className="modal-b" onSubmit={(e) => void submit(e)}><div className="grid g-2">
      <label className="field">Marca<select className="select" value={brand} onChange={(e) => setBrand(e.target.value)}><option value="">Seleccione…</option>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      <label className="field">Moneda<select className="select" value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}><option value="PEN">PEN · Soles</option><option value="USD">USD · Dólares</option></select></label>
      <label className="field">Tipo de contacto<select className="select" value={partyType} onChange={(e) => { setPartyType(e.target.value); setParty(''); }}><option value="customer">Cliente</option><option value="lead">Prospecto</option></select></label>
      {partyType === 'customer' ? <CustomerSearch value={party} onChange={(id) => setParty(id ?? '')} /> : <label className="field">Prospecto<select className="select" value={party} onChange={(e) => setParty(e.target.value)}><option value="">Seleccione…</option>{leads.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>}
      <label className="field">Válida hasta<input className="input" type="date" value={validUntil?.slice(0, 10) ?? ''} onChange={(e) => setValidUntil(e.target.value || '')} /></label>
      {quote ? <label className="field">Nota del cambio<input className="input" value={changeNote} onChange={(e) => setChangeNote(e.target.value)} /></label> : null}
    </div>
    <h3 className="sec" style={{ marginTop: 16 }}>Líneas</h3>
    {items.map((item, idx) => <div className="grid g-2 card" style={{ padding: 12, marginBottom: 8 }} key={idx}>
      <label className="field">Descripción<input className="input" value={item.description} onChange={(e) => updateItem(idx, { description: e.target.value })} /></label>
      <label className="field">Tipo<select className="select" value={item.charge_type} onChange={(e) => updateItem(idx, { charge_type: e.target.value as QuoteItemInput['charge_type'], cycle: e.target.value === 'recurring' ? 'monthly' : null })}><option value="one_time">Único</option><option value="recurring">Recurrente</option></select></label>
      {item.charge_type === 'recurring' ? <label className="field">Ciclo<select className="select" value={item.cycle ?? 'monthly'} onChange={(e) => updateItem(idx, { cycle: e.target.value as QuoteItemInput['cycle'] })}>{CYCLES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></label> : null}
      <label className="field">Cantidad<input className="input" type="number" min="0.01" step="0.01" value={item.quantity} onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })} /></label>
      <label className="field">Precio unitario ({currency})<input className="input" type="number" min="0" step="0.01" value={formatInputMoney(item.unit_price_minor)} onChange={(e) => updateItem(idx, { unit_price_minor: toMinor(e.target.value) })} /></label>
      <label className="field">Descuento ({currency})<input className="input" type="number" min="0" step="0.01" value={formatInputMoney(item.discount_minor ?? 0)} onChange={(e) => updateItem(idx, { discount_minor: toMinor(e.target.value) })} /></label>
      <button className="btn sm" type="button" disabled={items.length < 2} onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}>Quitar línea</button>
    </div>)}
    <button className="btn sm" type="button" onClick={() => setItems((prev) => [...prev, { description: '', charge_type: 'one_time', quantity: 1, unit_price_minor: 0, discount_minor: 0 }])}><Icon name="plus" size="sm" />Agregar línea</button>
    <label className="field full" style={{ marginTop: 12 }}>Términos<textarea className="input" rows={2} value={terms} onChange={(e) => setTerms(e.target.value)} /></label>
    <div className="err" role="alert">{message}</div>
    <div className="modal-f"><button type="button" className="btn" onClick={onClose}>Cancelar</button><button type="submit" className="btn primary" disabled={busy}>{busy ? 'Guardando…' : quote ? 'Guardar nueva versión' : 'Crear cotización'}</button></div>
    </form>
  </Modal>;
}
