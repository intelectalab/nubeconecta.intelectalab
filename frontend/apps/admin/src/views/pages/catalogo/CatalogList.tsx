/**
 * P-CAT-01 · Catálogo contra la API real (franja MVP): productos por categoría,
 * alta/edición de producto y de plan con precios PEN/USD, activar/desactivar.
 *
 * TODO(catalog): fichas técnicas (hosting/VPS), complementos, paquetes, precios de
 * dominios por extensión, fichas por marca y vista previa de shortcode siguen solo
 * en el modo demo (VITE_DEMO=1).
 */
import { useEffect, useMemo, useState } from 'react';
import { currentPrice, cycleLabel, isProblem, type Plan, type Product } from '@hub/api';
import { useApp } from '../../../app/context';
import { useViewState } from '../../../app/storage';
import { DataTable, type Column } from '../../../components/DataTable';
import { Icon } from '../../../components/Icon';
import { Sheet } from '../../../components/Modal';
import { Chip, EmptyState, Kv, Note, PageHead, SearchBox, Select, Switch, Tabs, Toolbar } from '../../../components/ui';
import { errorText, moneyMinor, useCan, useLoad, useLookups } from '../clientes/shared';
import { PlanForm, ProductForm } from './CatalogForms';
import { catalogApi } from './shared';

const PER = 50;

const priceText = (pl: Plan) =>
  (['PEN', 'USD'] as const)
    .map((c) => currentPrice(pl, c))
    .filter((p) => !!p)
    .map((p) => moneyMinor(p!.price_minor, p!.currency))
    .join(' · ') || 'Sin precio vigente';

export default function CatalogList({ param }: { param?: string | null }) {
  const { toast } = useApp();
  const can = useCan();
  const { brands } = useLookups();
  const [cat, setCat] = useViewState('cat.api.cat', '');
  const [q, setQ] = useViewState('cat.api.q', '');
  const [st, setSt] = useViewState('cat.api.st', '');
  const [qDeb, setQDeb] = useState(q);
  const [cursor, setCursor] = useState<string | null>(null);
  const [form, setForm] = useState<{ product?: Product } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const cats = useLoad(() => catalogApi.categories.list({ size: 100, sort: 'sort_order' }).then((r) => r.data), []);
  const categories = cats.data ?? [];

  // #catalogo/<código de categoría> preselecciona la pestaña.
  useEffect(() => {
    const m = param ? categories.find((c) => c.code === param || c.id === param) : undefined;
    if (m) setCat(m.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [param, categories.length]);

  useEffect(() => {
    const t = setTimeout(() => {
      setCursor(null);
      setQDeb(q.trim());
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const filter = useMemo(() => ({ category_id: cat || undefined, is_active: st === '' ? undefined : st === '1' }), [cat, st]);
  const res = useLoad(() => catalogApi.products.list({ q: qDeb, filter, cursor, size: PER }), [qDeb, filter, cursor]);
  const rows = res.data?.data ?? [];
  const meta = res.data?.meta;
  const brandName = (id: string | null) => (id ? (brands.find((b) => b.id === id)?.name ?? 'Una marca') : 'Todas');

  const toggle = async (p: Product) => {
    setBusyId(p.id);
    try {
      await catalogApi.products.update(p.id, p.version, { is_active: !p.is_active });
      toast(p.is_active ? 'Producto desactivado' : 'Producto activado', p.name);
      res.reload();
    } catch (e) {
      toast('No se pudo actualizar', errorText(e), 'err');
      res.reload();
    } finally {
      setBusyId(null);
    }
  };

  const canCreate = can('catalog.product.create');
  const canUpdate = can('catalog.product.update');

  const columns: Column<Product>[] = [
    {
      key: 'name',
      header: 'Producto',
      minWidth: 220,
      render: (p) => (
        <>
          <button type="button" className="rowlink" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer' }} onClick={() => setOpenId(p.id)}>
            {p.name}
          </button>
          <div className="sub">
            <span className="mono">{p.code}</span> · {p.category?.name ?? '—'}
          </div>
        </>
      ),
    },
    { key: 'brand', header: 'Marca', className: 'nw', render: (p) => brandName(p.brand_id) },
    { key: 'sale', header: 'Venta', className: 'nw', render: (p) => (p.sellable_online ? <Chip kind="info">En línea</Chip> : <Chip>Cotización</Chip>) },
    {
      key: 'plans',
      header: 'Planes y precios vigentes',
      minWidth: 260,
      render: (p) =>
        p.plans?.length ? (
          <div style={{ display: 'grid', gap: 2 }}>
            {p.plans.map((pl) => (
              <div key={pl.id} className="sub" style={pl.is_active ? undefined : { textDecoration: 'line-through' }}>
                <b>{pl.name}</b> · {cycleLabel(pl)} · {priceText(pl)}
              </div>
            ))}
          </div>
        ) : (
          <span className="sub">Sin planes</span>
        ),
    },
    { key: 'st', header: 'Estado', render: (p) => <Chip kind={p.is_active ? 'ok' : ''}>{p.is_active ? 'Activo' : 'Inactivo'}</Chip> },
    {
      key: 'act',
      header: '',
      align: 'r',
      className: 'nw',
      render: (p) => (
        <span style={{ display: 'inline-flex', gap: 6 }}>
          <button type="button" className="btn sm" onClick={() => setOpenId(p.id)}>
            Planes
          </button>
          {canUpdate ? (
            <>
              <button type="button" className="btn sm" onClick={() => setForm({ product: p })}>
                Editar
              </button>
              <button type="button" className="btn sm" disabled={busyId === p.id} onClick={() => void toggle(p)}>
                {p.is_active ? 'Desactivar' : 'Activar'}
              </button>
            </>
          ) : null}
        </span>
      ),
    },
  ];

  const tabs = [{ id: '', label: 'Todas' }, ...categories.map((c) => ({ id: c.id, label: c.name }))];

  return (
    <>
      <PageHead
        crumbs={[['Comercial', 'catalogo'], ['Catálogo de productos']]}
        title="Catálogo de productos"
        sub="Productos, planes y precios en soles y dólares"
        actions={
          canCreate ? (
            <button type="button" className="btn primary" disabled={!categories.length} onClick={() => setForm({})}>
              <Icon name="plus" size="sm" />
              Nuevo producto
            </button>
          ) : null
        }
      />
      {cats.error ? (
        <Note kind="warn" icon="tri" role="alert">
          No se pudieron cargar las categorías: {errorText(cats.error)}
        </Note>
      ) : null}
      <Tabs
        tabs={tabs}
        value={cat}
        onChange={(k) => {
          setCat(k);
          setCursor(null);
        }}
        label="Categorías"
        style={{ marginBottom: 14 }}
      />
      <section className="card">
        <Toolbar count={res.loading ? 'Cargando…' : `${rows.length}${meta?.has_more ? '+' : ''} productos`}>
          <SearchBox
            value={q}
            onChange={(v) => {
              setQ(v);
              setCursor(null);
            }}
            placeholder="Nombre o código…"
            label="Buscar productos"
          />
          <Select
            value={st}
            onChange={(v) => {
              setSt(v);
              setCursor(null);
            }}
            label="Estado"
            options={[['', 'Activos e inactivos'], ['1', 'Activos'], ['0', 'Inactivos']]}
          />
        </Toolbar>
        {res.error ? (
          <div className="card-b">
            <Note kind="warn" icon="tri" role="alert">
              No se pudo cargar el catálogo: {errorText(res.error)}{' '}
              <button type="button" className="btn sm" onClick={res.reload}>
                Reintentar
              </button>
            </Note>
          </div>
        ) : !res.loading && !rows.length ? (
          <EmptyState title="Sin productos" text={q || st ? 'Ajuste la búsqueda o los filtros.' : 'Esta categoría aún no tiene productos.'} />
        ) : (
          <>
            <DataTable columns={columns} rows={rows} rowKey={(p) => p.id} caption="Productos" />
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
      {form ? (
        <ProductForm
          product={form.product}
          categories={categories}
          defaultCategoryId={cat}
          onClose={() => setForm(null)}
          onSaved={(p) => {
            setForm(null);
            toast(form.product ? 'Producto actualizado' : 'Producto creado', `${p.name} · ${p.code}`);
            res.reload();
            if (!form.product) setOpenId(p.id);
          }}
        />
      ) : null}
      {openId ? <ProductSheet id={openId} onClose={() => setOpenId(null)} onChanged={res.reload} /> : null}
    </>
  );
}

/** Panel lateral del producto: datos y planes con sus precios vigentes. */
function ProductSheet({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { toast } = useApp();
  const can = useCan();
  const res = useLoad(() => catalogApi.products.get(id), [id]);
  const [planForm, setPlanForm] = useState<{ plan?: Plan } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [addonQuery, setAddonQuery] = useState('');
  const [addonSelection, setAddonSelection] = useState('');
  const p = res.data;
  const addons = useLoad(() => catalogApi.products.addons.list(id), [id]);
  const addonProducts = useLoad(
    () => (can('catalog.product.update') ? catalogApi.products.list({ q: addonQuery.trim(), filter: { is_active: true }, size: 100 }).then((r) => r.data) : Promise.resolve([] as Product[])),
    [addonQuery, can('catalog.product.update')],
  );
  const attachedIds = new Set((addons.data ?? []).map((addon) => addon.addon_product_id));
  const addonOptions = (addonProducts.data ?? []).filter((candidate) => candidate.id !== id && !attachedIds.has(candidate.id));

  const togglePlan = async (pl: Plan) => {
    setBusy(pl.id);
    try {
      await catalogApi.plans.update(pl.id, pl.version, { is_active: !pl.is_active });
      toast(pl.is_active ? 'Plan desactivado' : 'Plan activado', pl.name);
    } catch (e) {
      toast('No se pudo actualizar el plan', errorText(e), 'err');
    } finally {
      setBusy(null);
      res.reload();
      onChanged();
    }
  };

  const canPlan = can('catalog.plan.update');
  const canAddon = can('catalog.product.update');
  const addonError = (e: unknown) =>
    isProblem(e) && e.status === 422
      ? 'No se pudo guardar el complemento. Puede estar duplicado o tener datos no válidos; revise la selección e inténtelo de nuevo.'
      : errorText(e);
  const updateAddon = async (addonId: string, version: number, isRequired: boolean) => {
    setBusy(`addon:${addonId}`);
    try {
      await catalogApi.products.addons.update(id, addonId, { is_required: isRequired, version });
      toast('Complemento actualizado', p?.name ?? '');
    } catch (e) {
      toast('No se pudo actualizar el complemento', addonError(e), 'err');
    } finally {
      setBusy(null);
      addons.reload();
      onChanged();
    }
  };
  const attachAddon = async () => {
    if (!addonSelection) return;
    const selected = addonOptions.find((candidate) => candidate.id === addonSelection);
    setBusy('addon:new');
    try {
      await catalogApi.products.addons.attach(id, { addon_product_id: addonSelection, is_required: false });
      toast('Complemento agregado', selected?.name ?? '');
      setAddonSelection('');
      setAddonQuery('');
    } catch (e) {
      toast('No se pudo agregar el complemento', addonError(e), 'err');
    } finally {
      setBusy(null);
      addons.reload();
      onChanged();
    }
  };
  const removeAddon = async (addonId: string, name: string) => {
    setBusy(`addon:${addonId}`);
    try {
      await catalogApi.products.addons.remove(id, addonId);
      toast('Complemento quitado', name);
    } catch (e) {
      toast('No se pudo quitar el complemento', addonError(e), 'err');
    } finally {
      setBusy(null);
      addons.reload();
      onChanged();
    }
  };
  return (
    <Sheet open onClose={onClose} title={p?.name ?? 'Producto'} sub={p ? `${p.code} · ${p.category?.name ?? ''}` : undefined}>
      {res.error ? (
        <Note kind="warn" icon="tri" role="alert">
          {errorText(res.error)}
        </Note>
      ) : !p ? (
        <p className="sub">Cargando…</p>
      ) : (
        <>
          <Kv
            items={[
              ['Tipo de cobro', p.billing_type === 'recurring' ? 'Recurrente' : 'Pago único'],
              ['Venta', p.sellable_online ? 'En línea' : 'Por cotización'],
              ['Requiere contrato', p.requires_contract ? 'Sí' : 'No'],
              ['Exportación sin IGV', p.export_eligible ? 'Sí' : 'No'],
              ['Estado', p.is_active ? 'Activo' : 'Inactivo'],
            ]}
          />
          {p.description ? <p className="sub" style={{ marginTop: 8 }}>{p.description}</p> : null}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '20px 0 8px' }}>
            <h3 style={{ margin: 0 }}>Complementos</h3>
          </div>
          {addons.error ? (
            <Note kind="warn" icon="tri" role="alert">
              No se pudieron cargar los complementos: {errorText(addons.error)}{' '}
              <button type="button" className="btn sm" onClick={addons.reload}>Reintentar</button>
            </Note>
          ) : addons.loading ? (
            <p className="sub">Cargando complementos…</p>
          ) : addons.data?.length ? (
            <div style={{ display: 'grid', gap: 8 }}>
              {addons.data.map((addon) => {
                const name = addon.addon_product?.name ?? addon.addon_product_id;
                return (
                  <div key={addon.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, border: '1px solid var(--line)', borderRadius: 8, padding: '9px 12px' }}>
                    <div><b>{name}</b>{addon.addon_product?.code ? <div className="sub mono">{addon.addon_product.code}</div> : null}</div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                      <span className="sub">Requerido</span>
                      <Switch checked={addon.is_required} disabled={!canAddon || busy === `addon:${addon.id}`} label={`Complemento requerido: ${name}`} onChange={(value) => void updateAddon(addon.id, addon.version, value)} />
                      {canAddon ? <button type="button" className="btn sm" disabled={busy === `addon:${addon.id}`} onClick={() => void removeAddon(addon.id, name)}>Quitar</button> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : <EmptyState title="Sin complementos" text="Agregue productos que puedan venderse junto con este producto." icon="tag" />}
          {canAddon ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) minmax(180px, 1fr) auto', alignItems: 'end', gap: 8, marginTop: 12 }}>
              <SearchBox value={addonQuery} onChange={(value) => { setAddonQuery(value); setAddonSelection(''); }} placeholder="Buscar producto activo…" label="Buscar productos complemento" />
              <label className="field">
                Producto complemento
                <select className="select" value={addonSelection} disabled={addonProducts.loading || !addonOptions.length} onChange={(e) => setAddonSelection(e.target.value)}>
                  <option value="">{addonProducts.loading ? 'Cargando…' : addonOptions.length ? 'Seleccione un producto' : 'Sin productos disponibles'}</option>
                  {addonOptions.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name} · {candidate.code}</option>)}
                </select>
              </label>
              <button type="button" className="btn sm primary" disabled={!addonSelection || busy !== null} onClick={() => void attachAddon()}>
                <Icon name="plus" size="sm" /> Agregar
              </button>
            </div>
          ) : null}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '16px 0 8px' }}>
            <h3 style={{ margin: 0 }}>Planes</h3>
            {can('catalog.plan.create') ? (
              <button type="button" className="btn sm primary" onClick={() => setPlanForm({})}>
                <Icon name="plus" size="sm" />
                Nuevo plan
              </button>
            ) : null}
          </div>
          {p.plans?.length ? (
            <DataTable
              rows={p.plans}
              rowKey={(pl) => pl.id}
              caption="Planes del producto"
              columns={[
                {
                  key: 'n',
                  header: 'Plan',
                  render: (pl) => (
                    <>
                      <b>{pl.name}</b>
                      <div className="sub mono">{pl.code}</div>
                    </>
                  ),
                },
                { key: 'c', header: 'Ciclo', className: 'nw', render: (pl) => cycleLabel(pl) },
                { key: 'pen', header: 'S/', align: 'r', className: 'nw', render: (pl) => { const x = currentPrice(pl, 'PEN'); return x ? moneyMinor(x.price_minor, 'PEN') : '—'; } },
                { key: 'usd', header: 'US$', align: 'r', className: 'nw', render: (pl) => { const x = currentPrice(pl, 'USD'); return x ? moneyMinor(x.price_minor, 'USD') : '—'; } },
                { key: 's', header: 'Estado', render: (pl) => <Chip kind={pl.is_active ? 'ok' : ''}>{pl.is_active ? 'Activo' : 'Inactivo'}</Chip> },
                {
                  key: 'a',
                  header: '',
                  align: 'r',
                  className: 'nw',
                  render: (pl) =>
                    canPlan ? (
                      <span style={{ display: 'inline-flex', gap: 6 }}>
                        <button type="button" className="btn sm" onClick={() => setPlanForm({ plan: pl })}>
                          Editar
                        </button>
                        <button type="button" className="btn sm" disabled={busy === pl.id} onClick={() => void togglePlan(pl)}>
                          {pl.is_active ? 'Desactivar' : 'Activar'}
                        </button>
                      </span>
                    ) : null,
                },
              ]}
            />
          ) : (
            <EmptyState title="Sin planes" text="Cree un plan con su precio para poder venderlo en pedidos." icon="tag" />
          )}
        </>
      )}
      {planForm && p ? (
        <PlanForm
          product={p}
          plan={planForm.plan}
          onClose={() => {
            setPlanForm(null);
            res.reload();
            onChanged();
          }}
          onSaved={() => {
            setPlanForm(null);
            toast(planForm.plan ? 'Plan actualizado' : 'Plan creado', p.name);
            res.reload();
            onChanged();
          }}
        />
      ) : null}
    </Sheet>
  );
}
