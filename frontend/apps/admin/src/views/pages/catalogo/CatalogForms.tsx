/**
 * P-CAT-02 · Formularios de producto y plan (con precios PEN/USD) contra la API real.
 *
 * - 422: errores RFC 9457 por campo bajo cada control.
 * - Idempotency-Key por alta, renovada tras cualquier 4xx.
 * - Un precio vigente no se edita: cambiar el importe registra una nueva vigencia
 *   (POST /plan-prices); el backend cierra la anterior en esa fecha.
 */
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { currentPrice, isProblem, newIdempotencyKey, PLAN_CYCLES, CYCLE_LABELS, type Currency, type HostingSpecInput, type Plan, type PlanInput, type Product, type ProductCategory, type ProductInput, type VpsSpecInput } from '@hub/api';
import { useApp } from '../../../app/context';
import { Icon } from '../../../components/Icon';
import { Modal } from '../../../components/Modal';
import { EmptyState, Note, SearchBox, Spinner, Switch } from '../../../components/ui';
import { errorText, fieldErrors, useCan, useLoad, useLookups } from '../clientes/shared';
import { catalogApi } from './shared';

type Vals = Record<string, string>;
const nul = (s: string) => (s.trim() === '' ? null : s.trim());
const CURS: Currency[] = ['PEN', 'USD'];

/** "49.90" → 4990; '' → null; inválido → NaN. */
export function toMinor(s: string): number | null {
  const t = s.trim().replace(',', '.');
  if (t === '') return null;
  return /^\d+(\.\d{1,2})?$/.test(t) ? Math.round(Number(t) * 100) : NaN;
}
const fromMinor = (n: number | undefined) => (n === undefined ? '' : (n / 100).toFixed(2));

/** Helpers de campo con error por clave (mismo marcado que clientes/CustomerForm). */
function useFields(prefix: string, vals: Vals, setVals: (f: (p: Vals) => Vals) => void, errs: Record<string, string>) {
  const set = (k: string) => (x: string) => setVals((p) => ({ ...p, [k]: x }));
  const field = (k: string, label: string, control: ReactNode, opts: { full?: boolean; req?: boolean; hint?: string } = {}) => (
    <label className={`field${opts.full ? ' full' : ''}`} htmlFor={`${prefix}-${k}`}>
      {label}
      {opts.req ? ' *' : ''}
      {control}
      {opts.hint && !errs[k] ? <small className="hint">{opts.hint}</small> : null}
      {errs[k] ? (
        <span className="err" id={`${prefix}-${k}-err`}>
          {errs[k]}
        </span>
      ) : null}
    </label>
  );
  const input = (k: string, type = 'text', ph?: string) => (
    <input className="input" id={`${prefix}-${k}`} type={type} value={vals[k]} placeholder={ph} aria-invalid={!!errs[k]} aria-describedby={errs[k] ? `${prefix}-${k}-err` : undefined} onChange={(e) => set(k)(e.target.value)} />
  );
  const select = (k: string, options: [string, string][]) => (
    <select className="select" id={`${prefix}-${k}`} value={vals[k]} aria-invalid={!!errs[k]} onChange={(e) => set(k)(e.target.value)}>
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
  const toggle = (k: string, label: string) => (
    <div className="field">
      {label}
      <Switch checked={vals[k] === '1'} onChange={(v) => set(k)(v ? '1' : '0')} label={label} />
    </div>
  );
  return { field, input, select, toggle };
}

/* ───────────────────────── Producto ───────────────────────── */

export interface ProductFormProps {
  product?: Product;
  categories: ProductCategory[];
  defaultCategoryId?: string;
  onClose: () => void;
  onSaved: (p: Product) => void;
}

export function ProductForm({ product, categories, defaultCategoryId, onClose, onSaved }: ProductFormProps) {
  const { brands } = useLookups();
  const [vals, setVals] = useState<Vals>(() =>
    product
      ? {
          code: product.code, name: product.name, category_id: product.category_id, brand_id: product.brand_id ?? '', description: product.description ?? '', billing_type: product.billing_type,
          requires_contract: product.requires_contract ? '1' : '0', export_eligible: product.export_eligible ? '1' : '0', sellable_online: product.sellable_online ? '1' : '0', is_active: product.is_active ? '1' : '0',
        }
      : { code: '', name: '', category_id: defaultCategoryId || categories[0]?.id || '', brand_id: '', description: '', billing_type: 'recurring', requires_contract: '0', export_eligible: '0', sellable_online: '1', is_active: '1' },
  );
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const idem = useRef(newIdempotencyKey());
  const f = useFields('pf', vals, setVals, errs);

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    setBusy(true);
    setErrs({});
    setMsg(null);
    const input: ProductInput = {
      code: vals.code.trim(), name: vals.name.trim(), category_id: vals.category_id, brand_id: nul(vals.brand_id), description: nul(vals.description), billing_type: vals.billing_type as ProductInput['billing_type'],
      requires_contract: vals.requires_contract === '1', export_eligible: vals.export_eligible === '1', sellable_online: vals.sellable_online === '1', is_active: vals.is_active === '1',
    };
    try {
      onSaved(product ? await catalogApi.products.update(product.id, product.version, input) : await catalogApi.products.create(input, idem.current));
    } catch (e) {
      setErrs(fieldErrors(e));
      if (isProblem(e) && e.status >= 400 && e.status < 500) idem.current = newIdempotencyKey();
      setMsg(isProblem(e) && e.status === 422 ? 'Revise los campos marcados.' : errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={product ? `Editar ${product.code}` : 'Nuevo producto'} sub={product ? `Versión ${product.version}` : 'Después podrá añadir planes y precios.'} wide bare>
      <form onSubmit={(e) => void submit(e)} noValidate style={{ display: 'contents' }}>
        <div className="modal-b">
          <div className="form-grid">
            {f.field('name', 'Nombre', f.input('name', 'text', 'Ej. Hosting Pyme'), { full: true, req: true })}
            {f.field('code', 'Código', f.input('code', 'text', 'Ej. hosting-pyme'), { req: true, hint: 'Letras, números, punto, guion o guion bajo.' })}
            {f.field('category_id', 'Categoría', f.select('category_id', categories.map((c) => [c.id, c.name])), { req: true })}
            {f.field('brand_id', 'Marca', f.select('brand_id', [['', 'Todas las marcas'], ...brands.map((b): [string, string] => [b.id, b.name])]))}
            {f.field('billing_type', 'Tipo de cobro', f.select('billing_type', [['recurring', 'Recurrente'], ['one_time', 'Pago único']]), { req: true })}
            {f.field('description', 'Descripción', f.input('description'), { full: true })}
            {f.toggle('sellable_online', 'Venta en línea (si no, por cotización)')}
            {f.toggle('requires_contract', 'Requiere contrato')}
            {f.toggle('export_eligible', 'Elegible para exportación (sin IGV)')}
            {product ? f.toggle('is_active', 'Activo') : null}
          </div>
          {product ? (
            <>
              <HostingSpecSection product={product} />
              <VpsSpecSection product={product} />
            </>
          ) : null}
          <div className="err" role="alert">
            {msg}
          </div>
        </div>
        <div className="modal-f">
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? <><Spinner size="sm" label="Guardando producto" /> Guardando…</> : product ? 'Guardar cambios' : 'Crear producto'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ───────────────────────── Plan + precios ───────────────────────── */

const HOUR = 'hour';
const CYCLE_OPTS: [string, string][] = [...PLAN_CYCLES.map((c): [string, string] => [c, CYCLE_LABELS[c]]), [HOUR, 'Por hora']];

export interface PlanFormProps {
  product: Product;
  plan?: Plan;
  onClose: () => void;
  onSaved: () => void;
}

export function PlanForm({ product, plan: initialPlan, onClose, onSaved }: PlanFormProps) {
  const today = new Date().toISOString().slice(0, 10);
  const cur = (p: Plan | undefined, c: Currency) => (p ? currentPrice(p, c) : undefined);
  const [plan, setPlan] = useState<Plan | undefined>(initialPlan);
  const [vals, setVals] = useState<Vals>(() => ({
    code: initialPlan?.code ?? '',
    name: initialPlan?.name ?? '',
    cycle: initialPlan ? (initialPlan.cycle === 'one_time' && initialPlan.limits?.billing_unit === HOUR ? HOUR : initialPlan.cycle) : product.billing_type === 'one_time' ? 'one_time' : 'monthly',
    is_active: initialPlan?.is_active === false ? '0' : '1',
    price_PEN: fromMinor(cur(initialPlan, 'PEN')?.price_minor),
    setup_PEN: fromMinor(cur(initialPlan, 'PEN')?.setup_fee_minor),
    price_USD: fromMinor(cur(initialPlan, 'USD')?.price_minor),
    setup_USD: fromMinor(cur(initialPlan, 'USD')?.setup_fee_minor),
    effective_from: today,
  }));
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const idem = useRef<Record<string, string>>({ plan: newIdempotencyKey(), PEN: newIdempotencyKey(), USD: newIdempotencyKey() });
  const f = useFields('plf', vals, setVals, errs);

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    setErrs({});
    setMsg(null);
    // Validación local de importes (el backend vuelve a validar).
    const local: Record<string, string> = {};
    for (const c of CURS) {
      for (const k of [`price_${c}`, `setup_${c}`]) if (Number.isNaN(toMinor(vals[k]))) local[k] = 'Importe inválido (use 0.00).';
      if (toMinor(vals[`price_${c}`]) === null && toMinor(vals[`setup_${c}`])) local[`price_${c}`] = 'Indique el precio si hay costo de instalación.';
    }
    if (!plan && CURS.every((c) => toMinor(vals[`price_${c}`]) === null)) local.price_PEN = 'Indique al menos un precio.';
    if (Object.keys(local).length) {
      setErrs(local);
      return;
    }
    setBusy(true);
    let step = 'plan';
    try {
      const hourly = vals.cycle === HOUR;
      const base: PlanInput = { code: vals.code.trim(), name: vals.name.trim(), cycle: (hourly ? 'one_time' : vals.cycle) as PlanInput['cycle'], is_active: vals.is_active === '1' };
      const limits = { ...(plan?.limits ?? {}) };
      if (hourly) limits.billing_unit = HOUR;
      else delete limits.billing_unit;
      let saved = plan;
      if (!saved) {
        saved = await catalogApi.plans.create({ ...base, product_id: product.id, limits }, idem.current.plan);
        setPlan(saved);
      } else {
        const changed = base.code !== saved.code || base.name !== saved.name || base.cycle !== saved.cycle || base.is_active !== saved.is_active || JSON.stringify(limits) !== JSON.stringify(saved.limits ?? {});
        if (changed) {
          saved = await catalogApi.plans.update(saved.id, saved.version, { ...base, limits });
          setPlan(saved);
        }
      }
      for (const c of CURS) {
        step = c;
        const price = toMinor(vals[`price_${c}`]);
        const setup = toMinor(vals[`setup_${c}`]) ?? 0;
        const now = cur(saved, c);
        if (price === null || (now && now.price_minor === price && now.setup_fee_minor === setup)) continue;
        await catalogApi.prices.create({ plan_id: saved.id, currency: c, price_minor: price, setup_fee_minor: setup, effective_from: vals.effective_from || today }, idem.current[c]);
        idem.current[c] = newIdempotencyKey();
      }
      onSaved();
    } catch (e) {
      if (isProblem(e) && e.status >= 400 && e.status < 500) idem.current[step] = newIdempotencyKey();
      const fe = fieldErrors(e);
      if (step !== 'plan') {
        // Errores de un precio: se muestran bajo el importe de esa moneda.
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(fe)) out[k === 'price_minor' ? `price_${step}` : k === 'setup_fee_minor' ? `setup_${step}` : k] = v;
        setErrs(out);
        setMsg(`Plan guardado, pero el precio en ${step} no: ${errorText(e)}`);
      } else {
        setErrs(fe);
        setMsg(isProblem(e) && e.status === 422 ? 'Revise los campos marcados.' : errorText(e));
      }
    } finally {
      setBusy(false);
    }
  };

  const unit = vals.cycle === HOUR ? ' por hora' : '';
  return (
    <Modal open onClose={onClose} title={plan ? `Editar plan ${plan.code}` : 'Nuevo plan'} sub={product.name} wide bare>
      <form onSubmit={(e) => void submit(e)} noValidate style={{ display: 'contents' }}>
        <div className="modal-b">
          <div className="form-grid">
            {f.field('name', 'Nombre del plan', f.input('name', 'text', 'Ej. Anual'), { req: true })}
            {f.field('code', 'Código', f.input('code', 'text', 'Ej. hosting-pyme-anual'), { req: true })}
            {f.field('cycle', 'Ciclo de cobro', f.select('cycle', CYCLE_OPTS), { req: true, hint: vals.cycle === HOUR ? 'En el pedido, la cantidad son las horas.' : undefined })}
            {f.toggle('is_active', 'Activo')}
            {f.field('price_PEN', `Precio S/${unit}`, f.input('price_PEN', 'text', '0.00'))}
            {f.field('setup_PEN', 'Instalación S/', f.input('setup_PEN', 'text', '0.00'))}
            {f.field('price_USD', `Precio US$${unit}`, f.input('price_USD', 'text', '0.00'))}
            {f.field('setup_USD', 'Instalación US$', f.input('setup_USD', 'text', '0.00'))}
            {f.field('effective_from', 'Vigencia del nuevo precio desde', f.input('effective_from', 'date'), { hint: 'Solo aplica si cambia un importe; el precio anterior se cierra en esa fecha.' })}
          </div>
          {plan ? (
            <>
              <Note icon="info" style={{ marginTop: 10 }}>
                Los pedidos ya creados conservan el precio con que se registraron. Un precio que ya entró en vigencia no se puede modificar el mismo día: use una fecha posterior.
              </Note>
              <BundleItemsSection plan={plan} />
            </>
          ) : null}
          <div className="err" role="alert">
            {msg}
          </div>
        </div>
        <div className="modal-f">
          <button type="button" className="btn" onClick={onClose}>
            {plan && !initialPlan ? 'Cerrar' : 'Cancelar'}
          </button>
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? <><Spinner size="sm" label="Guardando plan" /> Guardando…</> : plan ? 'Guardar' : 'Crear plan'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Componentes de un plan paquete; solo se ofrece para planes ya persistidos. */
function BundleItemsSection({ plan }: { plan: Plan }) {
  const { toast } = useApp();
  const can = useCan();
  const [query, setQuery] = useState('');
  const [selection, setSelection] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const items = useLoad(() => catalogApi.plans.bundleItems.list(plan.id), [plan.id]);
  const candidates = useLoad(
    () => (can('catalog.plan.update') ? catalogApi.plans.list({ q: query.trim(), size: 100 }).then((r) => r.data) : Promise.resolve([] as Plan[])),
    [query, can('catalog.plan.update')],
  );
  useEffect(() => {
    setQuantities(Object.fromEntries((items.data ?? []).map((item) => [item.id, String(item.quantity)])));
  }, [items.data]);

  const attachedIds = new Set((items.data ?? []).map((item) => item.item_plan_id));
  const options = (candidates.data ?? []).filter((candidate) => candidate.id !== plan.id && !attachedIds.has(candidate.id));
  const bundleError = (e: unknown) =>
    isProblem(e) && e.status === 422
      ? 'No se pudo guardar el componente. Verifique que sea otro plan y que la cantidad sea mayor que cero.'
      : errorText(e);

  const attach = async () => {
    const quantity = Number(quantities.new ?? '1');
    if (!selection || !Number.isFinite(quantity) || quantity <= 0) {
      toast('Cantidad no válida', 'Ingrese una cantidad mayor que cero.', 'err');
      return;
    }
    const selected = options.find((candidate) => candidate.id === selection);
    setBusy('new');
    try {
      await catalogApi.plans.bundleItems.attach(plan.id, { item_plan_id: selection, quantity });
      toast('Componente agregado', selected?.name ?? '');
      setSelection('');
      setQuery('');
      setQuantities((current) => ({ ...current, new: '1' }));
    } catch (e) {
      toast('No se pudo agregar el componente', bundleError(e), 'err');
    } finally {
      setBusy(null);
      items.reload();
    }
  };
  const update = async (itemId: string, version: number) => {
    const raw = quantities[itemId] ?? '';
    const quantity = Number(raw);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast('Cantidad no válida', 'Ingrese una cantidad mayor que cero.', 'err');
      setQuantities((current) => ({ ...current, [itemId]: String(items.data?.find((item) => item.id === itemId)?.quantity ?? 1) }));
      return;
    }
    const current = items.data?.find((item) => item.id === itemId);
    if (current?.quantity === quantity) return;
    setBusy(itemId);
    try {
      await catalogApi.plans.bundleItems.update(plan.id, itemId, { quantity, version });
      toast('Componente actualizado', current?.item_plan?.name ?? '');
    } catch (e) {
      toast('No se pudo actualizar el componente', bundleError(e), 'err');
    } finally {
      setBusy(null);
      items.reload();
    }
  };
  const remove = async (itemId: string, name: string) => {
    setBusy(itemId);
    try {
      await catalogApi.plans.bundleItems.remove(plan.id, itemId);
      toast('Componente quitado', name);
    } catch (e) {
      toast('No se pudo quitar el componente', bundleError(e), 'err');
    } finally {
      setBusy(null);
      items.reload();
    }
  };

  return (
    <section style={{ marginTop: 20 }} aria-label="Componentes del paquete">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 0 8px' }}>
        <h3 style={{ margin: 0 }}>Componentes del paquete</h3>
      </div>
      {items.error ? (
        <Note kind="warn" icon="tri" role="alert">
          No se pudieron cargar los componentes: {errorText(items.error)}{' '}
          <button type="button" className="btn sm" onClick={items.reload}>Reintentar</button>
        </Note>
      ) : items.loading ? (
        <Spinner centered label="Cargando componentes del paquete" />
      ) : items.data?.length ? (
        <div style={{ display: 'grid', gap: 8 }}>
          {items.data.map((item) => {
            const name = item.item_plan?.name ?? item.item_plan_id;
            return (
              <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, border: '1px solid var(--line)', borderRadius: 8, padding: '9px 12px' }}>
                <div><b>{name}</b>{item.item_plan?.code ? <div className="sub mono">{item.item_plan.code}</div> : null}</div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                  <label className="field" style={{ margin: 0 }}>
                    Cantidad
                    <input className="input" type="number" min="0.000001" step="any" value={quantities[item.id] ?? String(item.quantity)} disabled={!can('catalog.plan.update') || busy === item.id} aria-label={`Cantidad de ${name}`} onChange={(e) => setQuantities((current) => ({ ...current, [item.id]: e.target.value }))} onBlur={() => void update(item.id, item.version)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }} />
                  </label>
                  {can('catalog.plan.update') ? <button type="button" className="btn sm" disabled={busy === item.id} onClick={() => void remove(item.id, name)}>Quitar</button> : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : <EmptyState title="Sin componentes" text="Agregue los planes que incluye este paquete y su cantidad." icon="tag" />}
      {can('catalog.plan.update') ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) minmax(180px, 1fr) minmax(110px, .5fr) auto', alignItems: 'end', gap: 8, marginTop: 12 }}>
          <SearchBox value={query} onChange={(value) => { setQuery(value); setSelection(''); }} placeholder="Buscar plan…" label="Buscar planes componente" />
          <label className="field">
            Plan componente
            <div className="loading-control">
              <select className="select" value={selection} disabled={candidates.loading || !options.length} aria-busy={candidates.loading} onChange={(e) => setSelection(e.target.value)}>
                <option value="">{options.length ? 'Seleccione un plan' : 'Sin planes disponibles'}</option>
                {options.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name} · {candidate.code}</option>)}
              </select>
              {candidates.loading ? <Spinner size="sm" label="Cargando planes componente" /> : null}
            </div>
          </label>
          <label className="field">
            Cantidad
            <input className="input" type="number" min="0.000001" step="any" value={quantities.new ?? '1'} onChange={(e) => setQuantities((current) => ({ ...current, new: e.target.value }))} />
          </label>
          <button type="button" className="btn sm primary" disabled={!selection || busy !== null} onClick={() => void attach()}>
            <Icon name="plus" size="sm" /> Agregar
          </button>
        </div>
      ) : null}
    </section>
  );
}

/** Ficha técnica de hosting; los atributos JSON extra se conservan en el servidor. */
function HostingSpecSection({ product }: { product: Product }) {
  const { toast } = useApp();
  const can = useCan();
  const editable = can('catalog.product.update');
  const spec = useLoad(() => catalogApi.products.hostingSpec.get(product.id), [product.id]);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const data = spec.data;
    setVals({
      whm_package: data?.whm_package ?? '',
      disk_mb: data?.disk_mb == null ? '' : String(data.disk_mb),
      bandwidth_mb: data?.bandwidth_mb == null ? '' : String(data.bandwidth_mb),
      email_accounts: data?.email_accounts == null ? '' : String(data.email_accounts),
      databases: data?.databases == null ? '' : String(data.databases),
      websites: data?.websites == null ? '' : String(data.websites),
      preferred_node_id: data?.preferred_node_id ?? '',
    });
  }, [spec.data]);
  const set = (key: string) => (value: string) => setVals((current) => ({ ...current, [key]: value }));
  const numberOrNull = (value: string) => value.trim() === '' ? null : Number(value);
  const save = async () => {
    const whmPackage = vals.whm_package?.trim() ?? '';
    if (!whmPackage) {
      toast('Falta el paquete WHM', 'Ingrese el nombre del paquete requerido.', 'err');
      return;
    }
    setBusy(true);
    try {
      const input: HostingSpecInput = {
        whm_package: whmPackage,
        disk_mb: numberOrNull(vals.disk_mb ?? ''),
        bandwidth_mb: numberOrNull(vals.bandwidth_mb ?? ''),
        email_accounts: numberOrNull(vals.email_accounts ?? ''),
        databases: numberOrNull(vals.databases ?? ''),
        websites: numberOrNull(vals.websites ?? ''),
        preferred_node_id: vals.preferred_node_id?.trim() || null,
        ...(spec.data ? { version: spec.data.version } : {}),
      };
      if (spec.data) Object.assign(input, { extra_resources: spec.data.extra_resources });
      await catalogApi.products.hostingSpec.upsert(product.id, input);
      toast('Ficha de hosting guardada', product.name);
      spec.reload();
    } catch (e) {
      if (isProblem(e) && (e.status === 409 || e.status === 422)) spec.reload();
      toast('No se pudo guardar la ficha de hosting', isProblem(e) && e.status === 422 ? `Revise los campos de la ficha. ${errorText(e)}` : errorText(e), 'err');
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    setBusy(true);
    try {
      await catalogApi.products.hostingSpec.remove(product.id);
      toast('Ficha de hosting quitada', product.name);
      spec.reload();
    } catch (e) {
      toast('No se pudo quitar la ficha de hosting', errorText(e), 'err');
    } finally {
      setBusy(false);
    }
  };
  const field = (key: string, label: string, type = 'text', hint?: string, required = false) => (
    <label className="field" key={key}>
      {label}{required ? ' *' : ''}
      <input className="input" type={type} step={type === 'number' ? 1 : undefined} value={vals[key] ?? ''} disabled={!editable || busy} onChange={(e) => set(key)(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }} />
      {hint ? <small className="hint">{hint}</small> : null}
    </label>
  );
  return (
    <section aria-label="Ficha técnica de hosting" style={{ marginTop: 20 }}>
      <h3>Ficha técnica de hosting</h3>
      {spec.loading ? <Spinner centered label="Cargando ficha de hosting" /> : spec.error ? (
        <Note kind="warn" icon="tri" role="alert">
          No se pudo cargar la ficha de hosting: {errorText(spec.error)}{' '}
          <button type="button" className="btn sm" onClick={spec.reload}>Reintentar</button>
        </Note>
      ) : (
        <>
          <div className="form-grid">
            {field('whm_package', 'Paquete WHM', 'text', undefined, true)}
            {field('disk_mb', 'Disco (MB)', 'number')}
            {field('bandwidth_mb', 'Transferencia (MB)', 'number')}
            {field('email_accounts', 'Cuentas de correo', 'number')}
            {field('databases', 'Bases de datos', 'number')}
            {field('websites', 'Sitios web', 'number')}
            {field('preferred_node_id', 'Nodo preferido', 'text', 'UUID del nodo (opcional)')}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button type="button" className="btn primary" disabled={!editable || busy} onClick={() => void save()}>Guardar ficha</button>
            {spec.data ? <button type="button" className="btn" disabled={!editable || busy} onClick={() => void remove()}>Quitar ficha</button> : null}
          </div>
        </>
      )}
    </section>
  );
}

/** Ficha de VPS; la lista de sistemas operativos se edita como texto separado por comas. */
function VpsSpecSection({ product }: { product: Product }) {
  const { toast } = useApp();
  const can = useCan();
  const editable = can('catalog.product.update');
  const spec = useLoad(() => catalogApi.products.vpsSpec.get(product.id), [product.id]);
  const [vals, setVals] = useState<Record<string, string | boolean>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const data = spec.data;
    setVals({
      vcpu: data ? String(data.vcpu) : '', ram_mb: data ? String(data.ram_mb) : '', disk_gb: data ? String(data.disk_gb) : '',
      transfer_gb: data?.transfer_gb == null ? '' : String(data.transfer_gb), os_options: data?.os_options.join(', ') ?? '',
      is_managed: data?.is_managed ?? false, location: data?.location ?? '', cpu_model: data?.cpu_model ?? '',
      disk_type: data?.disk_type ?? '', provider_id: data?.provider_id ?? '', provider_plan_ref: data?.provider_plan_ref ?? '',
    });
  }, [spec.data]);
  const set = (key: string) => (value: string | boolean) => setVals((current) => ({ ...current, [key]: value }));
  const save = async () => {
    const vcpu = Number(vals.vcpu);
    const ramMb = Number(vals.ram_mb);
    const diskGb = Number(vals.disk_gb);
    const providerId = String(vals.provider_id ?? '').trim();
    const providerPlanRef = String(vals.provider_plan_ref ?? '').trim();
    if (!Number.isInteger(vcpu) || vcpu < 1 || !Number.isInteger(ramMb) || ramMb <= 0 || !Number.isInteger(diskGb) || diskGb <= 0 || !providerId || !providerPlanRef) {
      toast('Ficha de VPS incompleta', 'Indique vCPU, RAM, disco, UUID del proveedor y referencia del plan válidos.', 'err');
      return;
    }
    setBusy(true);
    try {
      const diskType = String(vals.disk_type ?? '');
      const transfer = String(vals.transfer_gb ?? '').trim();
      const input: VpsSpecInput = {
        vcpu, ram_mb: ramMb, disk_gb: diskGb,
        transfer_gb: transfer === '' ? null : Number(transfer),
        os_options: String(vals.os_options ?? '').split(',').map((s) => s.trim()).filter(Boolean),
        is_managed: vals.is_managed === true,
        location: String(vals.location ?? '').trim() || null,
        cpu_model: String(vals.cpu_model ?? '').trim() || null,
        disk_type: diskType ? diskType as NonNullable<VpsSpecInput['disk_type']> : null,
        provider_id: providerId, provider_plan_ref: providerPlanRef,
        ...(spec.data ? { version: spec.data.version } : {}),
      };
      await catalogApi.products.vpsSpec.upsert(product.id, input);
      toast('Ficha de VPS guardada', product.name);
      spec.reload();
    } catch (e) {
      if (isProblem(e) && (e.status === 409 || e.status === 422)) spec.reload();
      toast('No se pudo guardar la ficha de VPS', isProblem(e) && e.status === 422 ? `Revise los campos de la ficha. ${errorText(e)}` : errorText(e), 'err');
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    setBusy(true);
    try {
      await catalogApi.products.vpsSpec.remove(product.id);
      toast('Ficha de VPS quitada', product.name);
      spec.reload();
    } catch (e) {
      toast('No se pudo quitar la ficha de VPS', errorText(e), 'err');
    } finally {
      setBusy(false);
    }
  };
  const field = (key: string, label: string, type = 'text', hint?: string, required = false) => (
    <label className="field" key={key}>
      {label}{required ? ' *' : ''}
      <input className="input" type={type} step={type === 'number' ? 1 : undefined} value={String(vals[key] ?? '')} disabled={!editable || busy} onChange={(e) => set(key)(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }} />
      {hint ? <small className="hint">{hint}</small> : null}
    </label>
  );
  return (
    <section aria-label="Ficha técnica de VPS" style={{ marginTop: 20 }}>
      <h3>Ficha técnica de VPS</h3>
      {spec.loading ? <Spinner centered label="Cargando ficha de VPS" /> : spec.error ? (
        <Note kind="warn" icon="tri" role="alert">
          No se pudo cargar la ficha de VPS: {errorText(spec.error)}{' '}
          <button type="button" className="btn sm" onClick={spec.reload}>Reintentar</button>
        </Note>
      ) : (
        <>
          <div className="form-grid">
            {field('vcpu', 'vCPU', 'number', undefined, true)}
            {field('ram_mb', 'RAM (MB)', 'number', undefined, true)}
            {field('disk_gb', 'Disco (GB)', 'number', undefined, true)}
            {field('transfer_gb', 'Transferencia (GB)', 'number')}
            {field('location', 'Ubicación')}
            {field('cpu_model', 'Modelo de CPU')}
            <label className="field">Tipo de disco
              <select className="select" value={String(vals.disk_type ?? '')} disabled={!editable || busy} onChange={(e) => set('disk_type')(e.target.value)}>
                <option value="">Sin especificar</option><option value="ssd">SSD</option><option value="nvme">NVMe</option><option value="hdd">HDD</option>
              </select>
            </label>
            {field('provider_id', 'Proveedor', 'text', 'UUID del proveedor', true)}
            {field('provider_plan_ref', 'Referencia del plan', 'text', undefined, true)}
            {field('os_options', 'Sistemas operativos', 'text', 'Separados por comas')}
            <label className="field">Administrado
              <span><input type="checkbox" checked={vals.is_managed === true} disabled={!editable || busy} onChange={(e) => set('is_managed')(e.target.checked)} /> Sí</span>
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button type="button" className="btn primary" disabled={!editable || busy} onClick={() => void save()}>Guardar ficha</button>
            {spec.data ? <button type="button" className="btn" disabled={!editable || busy} onClick={() => void remove()}>Quitar ficha</button> : null}
          </div>
        </>
      )}
    </section>
  );
}
