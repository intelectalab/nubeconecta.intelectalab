import { useEffect, useState } from 'react';
import { isProblem, type DomainExtension, type DomainExtensionInput, type DomainTldPrice, type DomainTldPriceInput, type DomainTldOperation } from '@hub/api';
import { useApp } from '../../../app/context';
import { DataTable, type Column } from '../../../components/DataTable';
import { Sheet } from '../../../components/Modal';
import { Icon } from '../../../components/Icon';
import { Chip, EmptyState, Note, Select, Skeleton, Spinner, Switch, Tabs, Toolbar } from '../../../components/ui';
import { errorText, useCan, useLoad } from '../clientes/shared';
import { catalogApi } from './shared';

type ExtensionDraft = {
  tld: string; default_registrar_id: string; min_margin_percent: string;
  sellable_online: boolean; allows_transfer_in: boolean; is_featured: boolean; sort_order: string; is_active: boolean;
};
type PriceDraft = {
  tld: string; provider_id: string; operation: DomainTldOperation; years: string;
  cost_minor: string; cost_currency: string; price_minor: string; currency: 'PEN' | 'USD';
  effective_from: string; effective_to: string; domain_extension_id: string;
};
const initialExtension = (): ExtensionDraft => ({ tld: '', default_registrar_id: '', min_margin_percent: '', sellable_online: true, allows_transfer_in: true, is_featured: false, sort_order: '0', is_active: true });
const initialPrice = (): PriceDraft => ({ tld: '', provider_id: '', operation: 'register', years: '1', cost_minor: '', cost_currency: 'USD', price_minor: '', currency: 'PEN', effective_from: new Date().toISOString().slice(0, 10), effective_to: '', domain_extension_id: '' });
const shortId = (id: string) => `${id.slice(0, 8)}…`;
const operations: [DomainTldOperation, string][] = [['register', 'Registro'], ['renew', 'Renovación'], ['transfer', 'Transferencia'], ['restore', 'Restauración']];
const operationLabel = (value: DomainTldOperation) => operations.find(([key]) => key === value)?.[1] ?? value;

export function DomainsPanel() {
  const [tab, setTab] = useState('extensions');
  const [extensionEditor, setExtensionEditor] = useState<{ item?: DomainExtension } | null>(null);
  const [priceEditor, setPriceEditor] = useState<{ item?: DomainTldPrice } | null>(null);
  const extensions = useLoad(() => catalogApi.domainExtensions.list({ size: 100, sort: 'sort_order' }), []);
  const prices = useLoad(() => catalogApi.domainTldPrices.list({ size: 100, sort: 'effective_from' }), []);
  const extensionRows = extensions.data?.data ?? [];
  const priceRows = prices.data?.data ?? [];
  const tabs = [{ id: 'extensions', label: 'Extensiones' }, { id: 'prices', label: 'Precios TLD' }];

  const extensionColumns: Column<DomainExtension>[] = [
    { key: 'tld', header: 'TLD', className: 'mono nw', render: (x) => <button type="button" className="rowlink" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer' }} onClick={() => setExtensionEditor({ item: x })}>{x.tld}</button> },
    { key: 'registrar', header: 'Registrador', className: 'mono', render: (x) => shortId(x.default_registrar_id) },
    { key: 'online', header: 'Venta online', render: (x) => x.sellable_online ? 'Sí' : 'No' },
    { key: 'transfer', header: 'Transferencia', render: (x) => x.allows_transfer_in ? 'Sí' : 'No' },
    { key: 'featured', header: 'Destacado', render: (x) => x.is_featured ? 'Sí' : 'No' },
    { key: 'order', header: 'Orden', align: 'r', render: (x) => x.sort_order },
    { key: 'active', header: 'Activo', render: (x) => <Chip kind={x.is_active ? 'ok' : ''}>{x.is_active ? 'Sí' : 'No'}</Chip> },
    { key: 'actions', header: '', render: (x) => <span style={{ display: 'flex', gap: 6 }}>{canUpdateExtension() ? <button type="button" className="btn sm" onClick={() => setExtensionEditor({ item: x })}>Editar</button> : null}{canDeleteExtension() ? <button type="button" className="btn sm" onClick={() => void removeExtension(x)}>Quitar</button> : null}</span> },
  ];
  const priceColumns: Column<DomainTldPrice>[] = [
    { key: 'tld', header: 'TLD', className: 'mono nw', render: (x) => <button type="button" className="rowlink" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer' }} onClick={() => setPriceEditor({ item: x })}>{x.tld}</button> },
    { key: 'op', header: 'Operación', render: (x) => operationLabel(x.operation) },
    { key: 'currency', header: 'Moneda', className: 'nw', render: (x) => x.currency },
    { key: 'price', header: 'Precio', align: 'r', className: 'nw', render: (x) => `${x.currency} ${(x.price_minor / 100).toFixed(2)}` },
    { key: 'from', header: 'Vigencia desde', className: 'nw', render: (x) => x.effective_from },
    { key: 'to', header: 'Vigencia hasta', className: 'nw', render: (x) => x.effective_to ?? '—' },
    { key: 'actions', header: '', render: (x) => <span style={{ display: 'flex', gap: 6 }}>{canUpdatePrice() ? <button type="button" className="btn sm" onClick={() => setPriceEditor({ item: x })}>Editar</button> : null}{canDeletePrice() ? <button type="button" className="btn sm" onClick={() => void removePrice(x)}>Quitar</button> : null}</span> },
  ];

  const can = useCan();
  const { toast } = useApp();
  function canUpdateExtension() { return can('catalog.domain_extension.update'); }
  function canDeleteExtension() { return can('catalog.domain_extension.delete'); }
  function canUpdatePrice() { return can('catalog.domain_tld_price.update'); }
  function canDeletePrice() { return can('catalog.domain_tld_price.delete'); }
  async function removeExtension(x: DomainExtension) {
    try { await catalogApi.domainExtensions.remove(x.id); toast('Extensión quitada', x.tld); extensions.reload(); }
    catch (e) { toast('No se pudo quitar la extensión', errorText(e), 'err'); if (isProblem(e) && e.status === 409) extensions.reload(); }
  }
  async function removePrice(x: DomainTldPrice) {
    try { await catalogApi.domainTldPrices.remove(x.id); toast('Precio quitado', `${x.tld} · ${operationLabel(x.operation)}`); prices.reload(); }
    catch (e) { toast('No se pudo quitar el precio', errorText(e), 'err'); if (isProblem(e) && e.status === 409) prices.reload(); }
  }

  return <>
    <Tabs tabs={tabs} value={tab} onChange={setTab} label="Secciones de dominios" style={{ marginBottom: 14 }} />
    {tab === 'extensions' ? <section className="card" aria-busy={extensions.loading}>
      <Toolbar count={extensions.loading ? <Spinner size="sm" /> : `${extensionRows.length} extensiones`}>
        {can('catalog.domain_extension.create') ? <button type="button" className="btn primary" onClick={() => setExtensionEditor({})}><Icon name="plus" size="sm" /> Nueva extensión</button> : null}
      </Toolbar>
      {extensions.error ? <div className="card-b"><Note kind="warn" role="alert">No se pudieron cargar las extensiones: {errorText(extensions.error)} <button type="button" className="btn sm" onClick={extensions.reload}>Reintentar</button></Note></div>
        : extensions.loading ? <Skeleton variant="table" rows={5} />
          : extensionRows.length ? <DataTable columns={extensionColumns} rows={extensionRows} rowKey={(x) => x.id} caption="Extensiones de dominio" />
            : <EmptyState title="Sin extensiones" text="Agregue las extensiones de dominio que ofrece el catálogo." />}
    </section> : <section className="card" aria-busy={prices.loading}>
      <Toolbar count={prices.loading ? <Spinner size="sm" /> : `${priceRows.length} precios`}>
        {can('catalog.domain_tld_price.create') ? <button type="button" className="btn primary" onClick={() => setPriceEditor({})}><Icon name="plus" size="sm" /> Nuevo precio</button> : null}
      </Toolbar>
      {prices.error ? <div className="card-b"><Note kind="warn" role="alert">No se pudieron cargar los precios: {errorText(prices.error)} <button type="button" className="btn sm" onClick={prices.reload}>Reintentar</button></Note></div>
        : prices.loading ? <Skeleton variant="table" rows={5} />
          : priceRows.length ? <DataTable columns={priceColumns} rows={priceRows} rowKey={(x) => x.id} caption="Precios de dominios TLD" />
            : <EmptyState title="Sin precios TLD" text="Agregue el primer precio para una operación de dominio." />}
    </section>}
    {extensionEditor ? <ExtensionEditor item={extensionEditor.item} onClose={() => setExtensionEditor(null)} onSaved={() => { setExtensionEditor(null); extensions.reload(); }} /> : null}
    {priceEditor ? <PriceEditor item={priceEditor.item} onClose={() => setPriceEditor(null)} onSaved={() => { setPriceEditor(null); prices.reload(); }} /> : null}
  </>;
}

function ExtensionEditor({ item, onClose, onSaved }: { item?: DomainExtension; onClose: () => void; onSaved: () => void }) {
  const { toast } = useApp();
  const can = useCan();
  const [draft, setDraft] = useState<ExtensionDraft>(initialExtension);
  const [busy, setBusy] = useState(false);
  const allowed = item ? can('catalog.domain_extension.update') : can('catalog.domain_extension.create');
  useEffect(() => { if (item) setDraft({ tld: item.tld, default_registrar_id: item.default_registrar_id, min_margin_percent: item.min_margin_percent == null ? '' : String(item.min_margin_percent), sellable_online: item.sellable_online, allows_transfer_in: item.allows_transfer_in, is_featured: item.is_featured, sort_order: String(item.sort_order), is_active: item.is_active }); }, [item]);
  const save = async () => {
    const input: DomainExtensionInput = { tld: draft.tld.trim(), default_registrar_id: draft.default_registrar_id.trim(), min_margin_percent: draft.min_margin_percent === '' ? null : Number(draft.min_margin_percent), sellable_online: draft.sellable_online, allows_transfer_in: draft.allows_transfer_in, is_featured: draft.is_featured, sort_order: Number(draft.sort_order), is_active: draft.is_active };
    setBusy(true);
    try {
      if (item) await catalogApi.domainExtensions.update(item.id, item.version, input);
      else await catalogApi.domainExtensions.create(input);
      toast(item ? 'Extensión actualizada' : 'Extensión creada', input.tld); onSaved();
    } catch (e) {
      const conflict = isProblem(e) && e.status === 409;
      toast('No se pudo guardar la extensión', conflict ? 'Cambió en otra sesión. Se recargaron los datos.' : isProblem(e) && e.status === 422 ? `Revise los campos. ${errorText(e)}` : errorText(e), 'err');
      if (conflict) onSaved();
    } finally { setBusy(false); }
  };
  const set = <K extends keyof ExtensionDraft>(key: K, value: ExtensionDraft[K]) => setDraft((x) => ({ ...x, [key]: value }));
  return <Sheet open onClose={onClose} title={item ? `Editar ${item.tld}` : 'Nueva extensión'} sub="Catálogo de dominios">
    <div style={{ display: 'grid', gap: 12 }}>
      <DomainField label="TLD" value={draft.tld} disabled={!allowed} hint="Por ejemplo .com" onChange={(v) => set('tld', v)} />
      <DomainField label="Registrador predeterminado" value={draft.default_registrar_id} disabled={!allowed} hint="UUID del proveedor/registrador" onChange={(v) => set('default_registrar_id', v)} />
      <div className="grid g-2"><DomainField label="Margen mínimo (%)" type="number" value={draft.min_margin_percent} disabled={!allowed} hint="Opcional" onChange={(v) => set('min_margin_percent', v)} /><DomainField label="Orden" type="number" value={draft.sort_order} disabled={!allowed} onChange={(v) => set('sort_order', v)} /></div>
      <SwitchRow label="Venta online" checked={draft.sellable_online} disabled={!allowed} onChange={(v) => set('sellable_online', v)} />
      <SwitchRow label="Permite transferencias entrantes" checked={draft.allows_transfer_in} disabled={!allowed} onChange={(v) => set('allows_transfer_in', v)} />
      <SwitchRow label="Destacado" checked={draft.is_featured} disabled={!allowed} onChange={(v) => set('is_featured', v)} />
      <SwitchRow label="Activo" checked={draft.is_active} disabled={!allowed} onChange={(v) => set('is_active', v)} />
      {allowed ? <button type="button" className="btn primary" disabled={busy || !draft.tld.trim() || !draft.default_registrar_id.trim() || draft.sort_order === ''} onClick={() => void save()}>{busy ? 'Guardando…' : 'Guardar'}</button> : null}
    </div>
  </Sheet>;
}

function PriceEditor({ item, onClose, onSaved }: { item?: DomainTldPrice; onClose: () => void; onSaved: () => void }) {
  const { toast } = useApp();
  const can = useCan();
  const [draft, setDraft] = useState<PriceDraft>(initialPrice);
  const [busy, setBusy] = useState(false);
  const allowed = item ? can('catalog.domain_tld_price.update') : can('catalog.domain_tld_price.create');
  useEffect(() => { if (item) setDraft({ tld: item.tld, provider_id: item.provider_id, operation: item.operation, years: String(item.years), cost_minor: String(item.cost_minor), cost_currency: item.cost_currency, price_minor: String(item.price_minor), currency: item.currency, effective_from: item.effective_from, effective_to: item.effective_to ?? '', domain_extension_id: item.domain_extension_id ?? '' }); }, [item]);
  const save = async () => {
    let input: DomainTldPriceInput;
    if (item) {
      // El endpoint de actualización solo admite estos cuatro campos.
      input = { cost_minor: Number(draft.cost_minor), cost_currency: draft.cost_currency.trim(), price_minor: Number(draft.price_minor), effective_to: draft.effective_to || null };
    } else {
      input = { tld: draft.tld.trim(), provider_id: draft.provider_id.trim(), operation: draft.operation, years: Number(draft.years), cost_minor: Number(draft.cost_minor), cost_currency: draft.cost_currency.trim(), price_minor: Number(draft.price_minor), currency: draft.currency, effective_from: draft.effective_from, effective_to: draft.effective_to || null, domain_extension_id: draft.domain_extension_id.trim() || null };
    }
    setBusy(true);
    try {
      if (item) await catalogApi.domainTldPrices.update(item.id, item.version, input);
      else await catalogApi.domainTldPrices.create(input);
      toast(item ? 'Precio actualizado' : 'Precio creado', item?.tld ?? draft.tld); onSaved();
    } catch (e) {
      const conflict = isProblem(e) && e.status === 409;
      toast('No se pudo guardar el precio', conflict ? 'Cambió en otra sesión. Se recargaron los datos.' : isProblem(e) && e.status === 422 ? `Revise los campos. ${errorText(e)}` : errorText(e), 'err');
      if (conflict) onSaved();
    } finally { setBusy(false); }
  };
  const set = <K extends keyof PriceDraft>(key: K, value: PriceDraft[K]) => setDraft((x) => ({ ...x, [key]: value }));
  const valid = draft.cost_minor !== '' && draft.price_minor !== '' && draft.cost_currency.trim() && (item || (draft.tld.trim() && draft.provider_id.trim() && draft.effective_from && Number(draft.years) >= 1 && Number(draft.years) <= 10));
  return <Sheet open onClose={onClose} title={item ? `Editar precio ${item.tld}` : 'Nuevo precio TLD'} sub={item ? `${operationLabel(item.operation)} · ${item.currency} · ${item.effective_from}` : 'Alta de vigencia y costos'}>
    <div style={{ display: 'grid', gap: 12 }}>
      {!item ? <>
        <div className="grid g-2"><DomainField label="TLD" value={draft.tld} disabled={!allowed} hint="Por ejemplo .com" onChange={(v) => set('tld', v)} /><DomainField label="Proveedor" value={draft.provider_id} disabled={!allowed} hint="UUID del proveedor" onChange={(v) => set('provider_id', v)} /></div>
        <div className="grid g-2"><label className="field">Operación<Select value={draft.operation} disabled={!allowed} options={operations} onChange={(v) => set('operation', v as DomainTldOperation)} /></label><DomainField label="Años" type="number" value={draft.years} disabled={!allowed} hint="De 1 a 10" onChange={(v) => set('years', v)} /></div>
      </> : <p className="sub">{item.tld} · {operationLabel(item.operation)} · {item.years} año(s) · {item.currency}</p>}
      <div className="grid g-2"><DomainField label="Costo (minor units)" type="number" value={draft.cost_minor} disabled={!allowed} hint="Ingresar centavos; 1234 = 12.34" onChange={(v) => set('cost_minor', v)} /><DomainField label="Moneda del costo" value={draft.cost_currency} disabled={!allowed} hint="Código de moneda, por ejemplo USD" onChange={(v) => set('cost_currency', v)} /></div>
      <div className="grid g-2"><DomainField label="Precio (minor units)" type="number" value={draft.price_minor} disabled={!allowed} hint="Ingresar centavos; 1234 = 12.34" onChange={(v) => set('price_minor', v)} />{!item ? <label className="field">Moneda del precio<Select value={draft.currency} disabled={!allowed} options={[["PEN", 'PEN · Soles'], ['USD', 'USD · Dólares']]} onChange={(v) => set('currency', v as 'PEN' | 'USD')} /></label> : null}</div>
      {!item ? <div className="grid g-2"><DomainField label="Vigencia desde" type="date" value={draft.effective_from} disabled={!allowed} onChange={(v) => set('effective_from', v)} /><DomainField label="Vigencia hasta" type="date" value={draft.effective_to} disabled={!allowed} hint="Opcional" onChange={(v) => set('effective_to', v)} /></div> : <DomainField label="Vigencia hasta" type="date" value={draft.effective_to} disabled={!allowed} hint="Opcional; vacío para dejar sin fecha final" onChange={(v) => set('effective_to', v)} />}
      {!item ? <DomainField label="Extensión asociada" value={draft.domain_extension_id} disabled={!allowed} hint="UUID opcional" onChange={(v) => set('domain_extension_id', v)} /> : null}
      {allowed ? <button type="button" className="btn primary" disabled={busy || !valid} onClick={() => void save()}>{busy ? 'Guardando…' : 'Guardar'}</button> : null}
    </div>
  </Sheet>;
}

function DomainField({ label, value, onChange, disabled, hint, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean; hint?: string; type?: string }) {
  return <label className="field">{label}<input className="input" type={type} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />{hint ? <small className="hint">{hint}</small> : null}</label>;
}
function SwitchRow({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: (value: boolean) => void }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span>{label}</span><Switch checked={checked} disabled={disabled} label={label} onChange={onChange} /></div>;
}
