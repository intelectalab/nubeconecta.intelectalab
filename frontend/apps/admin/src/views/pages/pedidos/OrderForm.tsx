/**
 * P-ORD-02 · Nuevo pedido para un cliente real con planes del catálogo.
 *
 * El precio se congela y los totales (IGV incluido) los calcula el backend al crear;
 * aquí solo se muestra un subtotal estimado sin IGV. Idempotency-Key obligatoria,
 * renovada tras cualquier 4xx. Errores 422 por línea (items.N.plan_id).
 */
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { currentPrice, cycleLabel, isProblem, newIdempotencyKey, type Currency, type Customer, type Order, type Plan, type Product } from '@hub/api';
import { Modal } from '../../../components/Modal';
import { Icon } from '../../../components/Icon';
import { Note } from '../../../components/ui';
import { customersApi, displayName, docOf, errorText, fieldErrors, moneyMinor, useLoad } from '../clientes/shared';
import { catalogApi } from '../catalogo/shared';
import { ordersApi } from './shared';

interface Line {
  key: number;
  plan_id: string;
  quantity: string;
}

export function OrderForm({ onClose, onSaved, onConflict, initialCustomer, order }: { onClose: () => void; onSaved: (o: Order) => void; onConflict?: () => void; initialCustomer?: Customer; order?: Order }) {
  const [customer, setCustomer] = useState<Customer | null>(initialCustomer ?? null);
  const [cq, setCq] = useState('');
  const [cqDeb, setCqDeb] = useState('');
  const [currency, setCurrency] = useState<Currency>(order?.currency ?? initialCustomer?.currency ?? 'PEN');
  const [notes, setNotes] = useState(order?.notes ?? '');
  const [lines, setLines] = useState<Line[]>(() => order ? order.items.filter((i) => i.config?.kind !== 'setup_fee' && i.plan_id).map((i, n) => ({ key: n + 1, plan_id: i.plan_id!, quantity: String(i.quantity) })) : [{ key: 1, plan_id: '', quantity: '1' }]);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof ordersApi.preview>> | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const idem = useRef(newIdempotencyKey());
  const seq = useRef(2);
  const previewSeq = useRef(0);

  useEffect(() => {
    if (order && !initialCustomer) {
      let active = true;
      void customersApi.get(order.customer_id).then((c) => { if (active) setCustomer(c); }).catch(() => {
        if (active) setErrs((e) => ({ ...e, customer_id: 'No se pudo cargar el cliente del pedido.' }));
      });
      return () => { active = false; };
    }
  }, [order, initialCustomer]);

  useEffect(() => {
    const t = setTimeout(() => setCqDeb(cq.trim()), 300);
    return () => clearTimeout(t);
  }, [cq]);

  const found = useLoad(() => (customer || !cqDeb ? Promise.resolve([] as Customer[]) : customersApi.list({ q: cqDeb, filter: { status: 'active' }, size: 8 }).then((r) => r.data)), [cqDeb, customer]);

  // Productos activos vendibles en la marca del cliente (incluye los de todas las marcas).
  const brandId = customer?.origin_brand_id ?? '';
  const prods = useLoad(() => (brandId ? catalogApi.products.list({ filter: { is_active: true, brand_id: brandId }, size: 100 }).then((r) => r.data) : Promise.resolve([] as Product[])), [brandId]);
  // TODO(catalog): más de 100 productos activos requerirían un buscador de planes paginado.

  const plans = useMemo(() => {
    const out: { plan: Plan; product: Product }[] = [];
    for (const product of prods.data ?? []) for (const plan of product.plans ?? []) if (plan.is_active) out.push({ plan, product });
    return out;
  }, [prods.data]);
  const byId = (id: string) => plans.find((x) => x.plan.id === id);

  const estimate = lines.reduce((a, l) => {
    const x = byId(l.plan_id);
    const p = x ? currentPrice(x.plan, currency) : undefined;
    const q = Number(l.quantity.replace(',', '.'));
    return p && q > 0 ? a + Math.round(p.price_minor * q) + p.setup_fee_minor : a;
  }, 0);

  const validLines = lines.filter((l) => l.plan_id && Number(l.quantity.replace(',', '.')) > 0);
  const previewItems = validLines.map((l) => ({ plan_id: l.plan_id, quantity: Number(l.quantity.replace(',', '.')) }));
  const previewKey = JSON.stringify({ customer: customer?.id, currency, items: previewItems });
  useEffect(() => {
    const requestId = ++previewSeq.current;
    if (!customer || !previewItems.length) {
      setPreview(null);
      setPreviewLoading(false);
      setPreviewFailed(false);
      return;
    }
    setPreview(null);
    setPreviewLoading(true);
    setPreviewFailed(false);
    const timer = window.setTimeout(() => {
      void ordersApi.preview({ customer_id: customer.id, currency, items: previewItems }).then((result) => {
        if (previewSeq.current === requestId) { setPreview(result); setPreviewFailed(false); }
      }).catch(() => {
        if (previewSeq.current === requestId) { setPreview(null); setPreviewFailed(true); }
      }).finally(() => {
        if (previewSeq.current === requestId) setPreviewLoading(false);
      });
    }, 400);
    return () => { window.clearTimeout(timer); };
    // previewKey captures the normalized request payload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey]);

  const setLine = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!customer) {
      setErrs({ customer_id: 'Elija un cliente.' });
      return;
    }
    const items = lines.filter((l) => l.plan_id);
    if (!items.length) {
      setErrs({ 'items.0.plan_id': 'Agregue al menos un plan.' });
      return;
    }
    const badQty = items.filter((l) => !(Number(l.quantity.replace(',', '.')) > 0));
    if (badQty.length) {
      setErrs(Object.fromEntries(badQty.map((l) => [`line.${l.key}.quantity`, 'Indique una cantidad mayor que 0.'])));
      return;
    }
    setBusy(true);
    setErrs({});
    setMsg(null);
    try {
      const input = { customer_id: customer.id, currency, notes: notes.trim() || null, items: items.map((l) => ({ plan_id: l.plan_id, quantity: Number(l.quantity.replace(',', '.')) })) };
      const o = order ? await ordersApi.update(order.id, order.version, input) : await ordersApi.create(input, idem.current);
      onSaved(o);
    } catch (e) {
      if (!order && isProblem(e) && e.status >= 400 && e.status < 500) idem.current = newIdempotencyKey();
      // Los índices del backend son sobre las líneas enviadas (sin las vacías).
      const fe = fieldErrors(e);
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(fe)) {
        const m = /^items\.(\d+)\.(.+)$/.exec(k);
        out[m ? `line.${items[Number(m[1])]?.key}.${m[2]}` : k] = v;
      }
      setErrs(out);
      if (order && isProblem(e) && e.status === 409) onConflict?.();
      setMsg(isProblem(e) && e.status === 422 ? 'Revise los campos marcados.' : isProblem(e) && e.status === 409 ? `${errorText(e)} Recargue la ficha del pedido e inténtelo de nuevo.` : errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const err = (k: string) => (errs[k] ? <span className="err">{errs[k]}</span> : null);

  return (
    <Modal open onClose={onClose} title={order ? `Editar pedido ${order.number}` : 'Nuevo pedido'} sub="El precio y los totales con IGV los calcula el sistema." wide bare>
      <form onSubmit={(e) => void submit(e)} noValidate style={{ display: 'contents' }}>
        <div className="modal-b">
          <div className="form-grid">
            <div className="field full">
              Cliente *
              {customer ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <b>{displayName(customer)}</b>
                  <span className="sub">
                    {customer.code} · {docOf(customer)} · {customer.tax_treatment === 'export' ? 'Exportación' : 'Gravado'}
                  </span>
                  {!order ? <button
                    type="button"
                    className="btn sm"
                    onClick={() => {
                      setCustomer(null);
                      setLines([{ key: seq.current++, plan_id: '', quantity: '1' }]);
                    }}
                  >
                    Cambiar
                  </button> : null}
                </div>
              ) : (
                <>
                  <input className="input" type="search" value={cq} placeholder="Buscar por nombre, documento o código…" aria-label="Buscar cliente" onChange={(e) => setCq(e.target.value)} />
                  {found.data?.length ? (
                    <ul style={{ listStyle: 'none', margin: '6px 0 0', padding: 0, display: 'grid', gap: 4 }}>
                      {found.data.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            className="btn sm"
                            style={{ width: '100%', justifyContent: 'flex-start' }}
                            onClick={() => {
                              setCustomer(c);
                              setCurrency(c.currency);
                            }}
                          >
                            {displayName(c)} · <span className="mono">{c.code}</span> · {docOf(c)}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : cqDeb && !found.loading ? (
                    <small className="hint">Sin clientes activos que coincidan.</small>
                  ) : null}
                </>
              )}
              {err('customer_id')}
            </div>
            <label className="field" htmlFor="of-cur">
              Moneda *
              <select className="select" id="of-cur" value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
                <option value="PEN">Soles (S/)</option>
                <option value="USD">Dólares (US$)</option>
              </select>
              {err('currency')}
            </label>
          </div>

          <h3 style={{ margin: '16px 0 8px' }}>Líneas</h3>
          {customer && prods.error ? (
            <Note kind="warn" icon="tri">
              No se pudo cargar el catálogo: {errorText(prods.error)}
            </Note>
          ) : null}
          {customer && !prods.loading && !plans.length ? <Note icon="info">No hay planes activos para la marca de este cliente.</Note> : null}
          <div style={{ display: 'grid', gap: 8 }}>
            {lines.map((l, i) => {
              const x = byId(l.plan_id);
              const price = x ? currentPrice(x.plan, currency) : undefined;
              const hourly = x?.plan.limits?.billing_unit === 'hour';
              return (
                <div key={l.key} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 110px auto', gap: 8, alignItems: 'start' }}>
                  <label className="field" htmlFor={`of-pl-${l.key}`}>
                    Plan {i + 1}
                    <select className="select" id={`of-pl-${l.key}`} value={l.plan_id} disabled={!customer} aria-invalid={!!errs[`line.${l.key}.plan_id`]} onChange={(e) => setLine(l.key, { plan_id: e.target.value })}>
                      <option value="">{customer ? 'Elija un plan…' : 'Primero elija el cliente'}</option>
                      {plans.map(({ plan, product }) => {
                        const p = currentPrice(plan, currency);
                        return (
                          <option key={plan.id} value={plan.id} disabled={!p}>
                            {product.name} · {plan.name} ({cycleLabel(plan)}) — {p ? moneyMinor(p.price_minor, currency) : `sin precio en ${currency}`}
                          </option>
                        );
                      })}
                    </select>
                    {price?.setup_fee_minor ? <small className="hint">+ instalación {moneyMinor(price.setup_fee_minor, currency)}</small> : null}
                    {err(`line.${l.key}.plan_id`)}
                  </label>
                  <label className="field" htmlFor={`of-q-${l.key}`}>
                    {hourly ? 'Horas' : 'Cantidad'}
                    <input className="input" id={`of-q-${l.key}`} inputMode="decimal" value={l.quantity} aria-invalid={!!errs[`line.${l.key}.quantity`]} onChange={(e) => setLine(l.key, { quantity: e.target.value })} />
                    {err(`line.${l.key}.quantity`)}
                  </label>
                  <button type="button" className="btn sm" style={{ marginTop: 22 }} aria-label={`Quitar línea ${i + 1}`} disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((y) => y.key !== l.key))}>
                    <Icon name="x" size="sm" />
                  </button>
                </div>
              );
            })}
          </div>
          {err('items')}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
            <button type="button" className="btn sm" disabled={!customer} onClick={() => setLines((ls) => [...ls, { key: seq.current++, plan_id: '', quantity: '1' }])}>
              <Icon name="plus" size="sm" />
              Agregar línea
            </button>
            <span className="sub" aria-live="polite">
              {previewLoading ? <span>Calculando… </span> : null}
              {preview ? <>Subtotal: <b>{moneyMinor(preview.subtotal_minor, currency)}</b> · IGV ({Number(preview.tax_rate_percent)}%): <b>{moneyMinor(preview.tax_minor, currency)}</b> · Total: <b>{moneyMinor(preview.total_minor, currency)}</b></> : <>Subtotal estimado: <b>{moneyMinor(estimate, currency)}</b></>}
            </span>
          </div>
          {previewFailed ? <small className="hint">No se pudo calcular el total; se validará al guardar.</small> : null}
          <label className="field full" htmlFor="of-notes" style={{ marginTop: 12 }}>
            Notas
            <textarea className="input" id="of-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <div className="err" role="alert">
            {msg}
          </div>
        </div>
        <div className="modal-f">
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" type="submit" disabled={busy || !customer}>
            {busy ? (order ? 'Guardando…' : 'Creando…') : (order ? 'Guardar cambios' : 'Crear pedido')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
