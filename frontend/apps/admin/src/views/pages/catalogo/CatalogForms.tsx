/**
 * P-CAT-02 · Formularios de producto y plan (con precios PEN/USD) contra la API real.
 *
 * - 422: errores RFC 9457 por campo bajo cada control.
 * - Idempotency-Key por alta, renovada tras cualquier 4xx.
 * - Un precio vigente no se edita: cambiar el importe registra una nueva vigencia
 *   (POST /plan-prices); el backend cierra la anterior en esa fecha.
 */
import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { currentPrice, isProblem, newIdempotencyKey, PLAN_CYCLES, CYCLE_LABELS, type Currency, type Plan, type PlanInput, type Product, type ProductCategory, type ProductInput } from '@hub/api';
import { Modal } from '../../../components/Modal';
import { Note, Switch } from '../../../components/ui';
import { errorText, fieldErrors, useLookups } from '../clientes/shared';
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
          <div className="err" role="alert">
            {msg}
          </div>
        </div>
        <div className="modal-f">
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? 'Guardando…' : product ? 'Guardar cambios' : 'Crear producto'}
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
            <Note icon="info" style={{ marginTop: 10 }}>
              Los pedidos ya creados conservan el precio con que se registraron. Un precio que ya entró en vigencia no se puede modificar el mismo día: use una fecha posterior.
            </Note>
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
            {busy ? 'Guardando…' : plan ? 'Guardar' : 'Crear plan'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
