/**
 * P-BIL-07 · Registrar pago manual: medio, fecha, importe, referencia, constancia
 * opcional y aplicación a uno o varios comprobantes abiertos del cliente en la
 * misma moneda (parcial o total). Errores 422 por campo; la Idempotency-Key se
 * renueva tras un 4xx definitivo.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { isProblem, newIdempotencyKey, type Currency, type Payment } from '@hub/api';
import { useApp } from '../../../app/context';
import { Field, Note, Select } from '../../../components/ui';
import { errorText, fieldErrors, moneyMinor, useCan, useLoad } from '../clientes/shared';
import { invoiceNumber, invoicesApi } from '../facturas/shared';
import { minorToInput, parseMinor, paymentsApi, todayIso } from './shared';

export default function PaymentForm({ customerId, currency, invoiceId, onDone, onCancel }: { customerId: string; currency: Currency; invoiceId?: string; onDone: (p: Payment) => void; onCancel: () => void }) {
  const { toast } = useApp();
  const can = useCan();
  const methods = useLoad(() => paymentsApi.paymentMethods(), []);
  const open = useLoad(() => invoicesApi.list({ filter: { customer_id: customerId, currency, has_balance: 'true' }, sort: 'due_date', size: 50 }), [customerId, currency]);
  const invoices = useMemo(() => (open.data?.data ?? []).filter((i) => ['issued', 'partially_paid', 'overdue'].includes(i.status)), [open.data]);
  const [method, setMethod] = useState('');
  const [date, setDate] = useState(todayIso());
  const [amount, setAmount] = useState('');
  const [ref, setRef] = useState('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [validate, setValidate] = useState(can('billing.payment.validate'));
  const [alloc, setAlloc] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const key = useRef(newIdempotencyKey());

  useEffect(() => {
    if (!method && methods.data?.length) setMethod(methods.data.find((m) => m.kind === 'bank_transfer')?.id ?? methods.data[0].id);
  }, [methods.data, method]);
  // Comprobante de origen: se propone su saldo completo.
  useEffect(() => {
    const inv = invoices.find((i) => i.id === invoiceId);
    if (inv && alloc[inv.id] === undefined) {
      setAlloc((a) => ({ ...a, [inv.id]: minorToInput(inv.balance_minor) }));
      if (!amount) setAmount(minorToInput(inv.balance_minor));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoices, invoiceId]);

  const amountMinor = parseMinor(amount);
  const rows = invoices.map((i) => ({ i, minor: alloc[i.id] ? parseMinor(alloc[i.id]) : 0 }));
  const allocated = rows.reduce((s, r) => s + (r.minor ?? 0), 0);

  const submit = async () => {
    const local: Record<string, string> = {};
    if (!method) local.payment_method_id = 'Elija el medio de pago.';
    if (!amountMinor) local.amount_minor = 'Indique un importe válido (p. ej. 150.00).';
    rows.forEach((r, idx) => {
      if (r.minor === null) local[`row.${idx}`] = 'Importe inválido.';
      else if (r.minor > r.i.balance_minor) local[`row.${idx}`] = 'Supera el saldo.';
    });
    if (amountMinor && allocated > amountMinor) local.allocations = 'La suma aplicada supera el importe del pago.';
    setErrs(local);
    if (Object.keys(local).length) return;
    setBusy(true);
    setMsg(null);
    try {
      const allocations = rows.filter((r) => (r.minor ?? 0) > 0).map((r) => ({ invoice_id: r.i.id, amount_minor: r.minor as number }));
      const p = await paymentsApi.createPayment(
        { customer_id: customerId, payment_method_id: method, amount_minor: amountMinor as number, currency, received_at: date, external_id: ref.trim() || undefined, notes: notes.trim() || undefined, validate, allocations },
        file,
        key.current,
      );
      key.current = newIdempotencyKey();
      toast(validate ? 'Pago registrado y aplicado' : 'Pago registrado como reportado', moneyMinor(p.amount_minor, p.currency), 'ok');
      onDone(p);
    } catch (e) {
      if (isProblem(e) && e.status >= 400 && e.status < 500) key.current = newIdempotencyKey();
      const fe = fieldErrors(e);
      // allocations.N.* del backend → fila del comprobante enviado en esa posición.
      const sent = rows.filter((r) => (r.minor ?? 0) > 0);
      for (const [k, v] of Object.entries(fe)) {
        const m = /^allocations\.(\d+)\./.exec(k);
        if (m && sent[Number(m[1])]) fe[`row.${rows.indexOf(sent[Number(m[1])])}`] = v;
      }
      setErrs(fe);
      setMsg(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card" style={{ marginTop: 12 }} aria-label="Registrar pago">
      <div className="card-b">
        <h3 style={{ margin: '0 0 8px' }}>Registrar pago</h3>
        <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 }}>
          <Field label="Medio de pago *" error={errs.payment_method_id}>
            <Select value={method} onChange={setMethod} label="Medio de pago" options={(methods.data ?? []).filter((m) => m.kind !== 'card_gateway').map((m): [string, string] => [m.id, m.name])} />
          </Field>
          <Field label="Fecha del pago" error={errs.received_at}>
            <input className="input" type="date" max={todayIso()} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label={`Importe (${currency}) *`} error={errs.amount_minor}>
            <input className="input num" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          </Field>
          <Field label="Referencia / N.º de operación" error={errs.external_id}>
            <input className="input" value={ref} maxLength={120} onChange={(e) => setRef(e.target.value)} />
          </Field>
          <Field label="Constancia (PDF o imagen, máx. 5 MB)" error={errs.proof} full>
            <input className="input" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </Field>
          <Field label="Notas internas" error={errs.notes} full>
            <textarea className="input" rows={2} value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
        <h4 style={{ margin: '12px 0 6px' }}>Aplicar a comprobantes ({currency})</h4>
        {open.loading ? <p className="sub">Cargando comprobantes abiertos…</p> : null}
        {!open.loading && !invoices.length ? <p className="sub">El cliente no tiene comprobantes con saldo en {currency}; el pago quedará sin aplicar.</p> : null}
        {invoices.length ? (
          <table className="tbl" style={{ width: '100%' }}>
            <caption className="sr-only">Aplicación del pago</caption>
            <thead>
              <tr>
                <th>Comprobante</th>
                <th>Vence</th>
                <th className="r">Saldo</th>
                <th className="r">Aplicar</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ i }, idx) => (
                <tr key={i.id}>
                  <td className="mono">{invoiceNumber(i)}</td>
                  <td>{i.due_date ?? '—'}</td>
                  <td className="r nw">{moneyMinor(i.balance_minor, i.currency)}</td>
                  <td className="r">
                    <input
                      className="input num"
                      style={{ maxWidth: 120 }}
                      inputMode="decimal"
                      aria-label={`Aplicar a ${invoiceNumber(i)}`}
                      value={alloc[i.id] ?? ''}
                      onChange={(e) => setAlloc((a) => ({ ...a, [i.id]: e.target.value }))}
                      placeholder="0.00"
                    />
                    {errs[`row.${idx}`] ? <div className="err">{errs[`row.${idx}`]}</div> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        <p className="sub" style={{ marginTop: 6 }}>
          Aplicado: {moneyMinor(allocated, currency)}
          {amountMinor && amountMinor > allocated ? ` · sin aplicar: ${moneyMinor(amountMinor - allocated, currency)} (saldo a favor: próxima entrega)` : ''}
        </p>
        {errs.allocations ? <div className="err">{errs.allocations}</div> : null}
        {can('billing.payment.validate') ? (
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8 }}>
            <input type="checkbox" checked={validate} onChange={(e) => setValidate(e.target.checked)} />
            Validar al guardar (aplica el pago y reduce el saldo)
          </label>
        ) : (
          <Note icon="info" style={{ marginTop: 8 }}>
            Se guarda como reportado: finanzas lo valida antes de aplicarlo.
          </Note>
        )}
        <div className="err" role="alert">
          {msg}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <button type="button" className="btn" onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
          <button type="button" className="btn primary" onClick={() => void submit()} disabled={busy}>
            {busy ? 'Guardando…' : validate ? 'Guardar y validar' : 'Guardar como reportado'}
          </button>
        </div>
      </div>
    </section>
  );
}
