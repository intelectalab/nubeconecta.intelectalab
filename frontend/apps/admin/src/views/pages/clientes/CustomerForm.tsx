/**
 * P-CUS-02 · Formulario de cliente (alta y edición) contra la API real.
 *
 * - 422: errores RFC 9457 por campo bajo cada control.
 * - 409 possible_duplicate: panel de posibles duplicados con «Crear de todos modos».
 * - 409 duplicate_customer: el documento ya existe (no se puede forzar).
 * - 409 version_conflict (edición): aviso y opción de recargar.
 */
import { useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { isProblem, newIdempotencyKey, TAX_ID_TYPES, type Customer, type CustomerInput, type DuplicateMatch } from '@hub/api';
import { Modal } from '../../../components/Modal';
import { Note } from '../../../components/ui';
import { href } from '../../../app/routeMeta';
import { COUNTRY_OPTIONS, customersApi, errorText, fieldErrors, TAX_LABEL, TYPE_LABEL, useLookups } from './shared';

type Vals = Record<string, string>;

const EMPTY: Vals = {
  type: 'company', legal_name: '', trade_name: '', tax_id_type: 'ruc', tax_id: '', country: 'PE', currency: 'PEN', locale: 'es', timezone: 'America/Lima',
  email: '', phone: '', address: '', origin_brand_id: '', account_manager_id: '', invoice_consolidation: 'consolidated', tax_treatment: 'taxed', is_withholding_agent: '0', status: 'active',
};

function fromCustomer(c: Customer): Vals {
  return {
    type: c.type, legal_name: c.legal_name, trade_name: c.trade_name ?? '', tax_id_type: c.tax_id_type ?? '', tax_id: c.tax_id ?? '', country: c.country, currency: c.currency,
    locale: c.locale, timezone: c.timezone, email: c.email ?? '', phone: c.phone ?? '', address: c.address ?? '', origin_brand_id: c.origin_brand_id,
    account_manager_id: c.account_manager_id ?? '', invoice_consolidation: c.invoice_consolidation, tax_treatment: c.tax_treatment, is_withholding_agent: c.is_withholding_agent ? '1' : '0', status: c.status,
  };
}

const nul = (s: string) => (s.trim() === '' ? null : s.trim());

function toInput(v: Vals): CustomerInput {
  return {
    type: v.type as CustomerInput['type'], legal_name: v.legal_name.trim(), trade_name: nul(v.trade_name), tax_id_type: (nul(v.tax_id) ? v.tax_id_type || null : null) as CustomerInput['tax_id_type'],
    tax_id: nul(v.tax_id), country: v.country.toUpperCase(), currency: v.currency as CustomerInput['currency'], locale: v.locale as CustomerInput['locale'], timezone: v.timezone,
    email: nul(v.email), phone: nul(v.phone), address: nul(v.address), origin_brand_id: v.origin_brand_id, account_manager_id: nul(v.account_manager_id),
    invoice_consolidation: v.invoice_consolidation as CustomerInput['invoice_consolidation'], tax_treatment: v.tax_treatment as CustomerInput['tax_treatment'], is_withholding_agent: v.is_withholding_agent === '1',
    status: v.status as CustomerInput['status'],
  };
}

/** Solo los campos que cambiaron (PATCH parcial). */
function diff(a: CustomerInput, b: CustomerInput): CustomerInput {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(b) as (keyof CustomerInput)[]) if (a[k] !== b[k]) out[k] = b[k];
  return out as CustomerInput;
}

export interface CustomerFormProps {
  open: boolean;
  onClose: () => void;
  /** Cliente a editar; sin él es un alta. */
  customer?: Customer;
  onSaved: (c: Customer) => void;
  /** Recargar tras un conflicto de versión. */
  onReload?: () => void;
}

export function CustomerForm({ open, onClose, customer, onSaved, onReload }: CustomerFormProps) {
  const { brands, staff } = useLookups();
  const initial = useMemo(() => (customer ? fromCustomer(customer) : EMPTY), [customer]);
  const [vals, setVals] = useState<Vals>(initial);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [dups, setDups] = useState<{ list: DuplicateMatch[]; forceable: boolean } | null>(null);
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const idem = useRef(newIdempotencyKey());

  const brandId = vals.origin_brand_id || brands[0]?.id || '';
  const dirty = JSON.stringify(vals) !== JSON.stringify(initial);
  const set = (k: string) => (x: string) => setVals((p) => ({ ...p, [k]: x }));

  const close = () => {
    if (dirty && !busy && !window.confirm('Hay cambios sin guardar. ¿Descartarlos?')) return;
    onClose();
  };

  const save = async (confirmDuplicates = false) => {
    if (!customer && !brandId) {
      // Las marcas aún no cargan (o no hay permiso para listarlas): no enviar un alta sin marca.
      setErrs({ origin_brand_id: 'Elija la marca de origen.' });
      return;
    }
    setBusy(true);
    setMsg(null);
    setErrs({});
    try {
      const input = toInput({ ...vals, origin_brand_id: brandId });
      let saved: Customer;
      if (customer) {
        saved = await customersApi.update(customer.id, customer.version, diff(toInput(initial), input));
      } else {
        saved = await customersApi.create({ ...input, confirm_duplicates: confirmDuplicates || undefined }, idem.current);
      }
      onSaved(saved);
    } catch (e) {
      setErrs(fieldErrors(e));
      // Un 4xx definitivo queda guardado con la clave: el reintento corregido necesita otra (si no, 422 idempotency_key_reused).
      if (isProblem(e) && e.status >= 400 && e.status < 500) idem.current = newIdempotencyKey();
      if (isProblem(e) && (e.code === 'possible_duplicate' || e.code === 'duplicate_customer')) {
        setDups({ list: (e.extensions.duplicates as DuplicateMatch[] | undefined) ?? [], forceable: e.code === 'possible_duplicate' });
        idem.current = newIdempotencyKey();
      } else if (isProblem(e) && e.code === 'version_conflict') {
        setConflict(true);
      } else {
        setMsg(isProblem(e) && e.status === 422 ? 'Revise los campos marcados.' : errorText(e));
      }
    } finally {
      setBusy(false);
    }
  };

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    void save(false);
  };

  const field = (k: string, label: string, control: ReactNode, opts: { full?: boolean; req?: boolean; hint?: string } = {}) => (
    <label className={`field${opts.full ? ' full' : ''}`} htmlFor={`cf-${k}`}>
      {label}
      {opts.req ? ' *' : ''}
      {control}
      {opts.hint && !errs[k] ? <small className="hint">{opts.hint}</small> : null}
      {errs[k] ? (
        <span className="err" id={`cf-${k}-err`}>
          {errs[k]}
        </span>
      ) : null}
    </label>
  );
  const input = (k: string, type = 'text', ph?: string) => (
    <input className="input" id={`cf-${k}`} type={type} value={vals[k]} placeholder={ph} aria-invalid={!!errs[k]} aria-describedby={errs[k] ? `cf-${k}-err` : undefined} onChange={(e) => set(k)(e.target.value)} />
  );
  const select = (k: string, options: [string, string][], value = vals[k]) => (
    <select className="select" id={`cf-${k}`} value={value} aria-invalid={!!errs[k]} onChange={(e) => set(k)(e.target.value)}>
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );

  const countryOpts = COUNTRY_OPTIONS.some((c) => c[0] === vals.country) ? COUNTRY_OPTIONS : [...COUNTRY_OPTIONS, [vals.country, vals.country] as [string, string]];

  return (
    <Modal open={open} onClose={close} title={customer ? `Editar ${customer.code}` : 'Nuevo cliente'} sub={customer ? `Versión ${customer.version}` : 'Se comprueba si ya existe por documento, correo y nombre.'} wide bare>
      <form onSubmit={submit} noValidate style={{ display: 'contents' }}>
        <div className="modal-b">
          {conflict ? (
            <Note kind="warn" icon="tri" role="alert">
              Otra persona modificó este cliente mientras lo editaba. Sus cambios no se guardaron.{' '}
              {onReload ? (
                <button type="button" className="btn sm" onClick={onReload}>
                  Recargar la versión actual
                </button>
              ) : null}
            </Note>
          ) : null}
          {dups ? (
            <Note kind="warn" icon="users" role="alert">
              <b>{dups.forceable ? 'Hay clientes parecidos.' : 'Ya existe un cliente con ese documento.'}</b>
              <ul style={{ margin: '6px 0' }}>
                {dups.list.map((d) => (
                  <li key={d.id}>
                    <a href={href('cliente', d.id)} target="_blank" rel="noreferrer">
                      {d.code} · {d.legal_name}
                    </a>{' '}
                    <small>(coincide en {d.matches.map((m) => (m === 'tax_id' ? 'documento' : m === 'email' ? 'correo' : 'nombre')).join(', ')})</small>
                  </li>
                ))}
              </ul>
              {dups.forceable ? (
                <button type="button" className="btn sm" disabled={busy} onClick={() => void save(true)}>
                  Crear de todos modos
                </button>
              ) : null}
            </Note>
          ) : null}
          <div className="form-grid">
            {field('type', 'Tipo', select('type', Object.entries(TYPE_LABEL)), { req: true })}
            {field('country', 'País', select('country', countryOpts), { req: true })}
            {field('legal_name', 'Razón social o nombre', input('legal_name', 'text', 'Ej. Inversiones Qori S.A.C.'), { full: true, req: true })}
            {field('trade_name', 'Nombre comercial', input('trade_name'), { full: true })}
            {field('tax_id_type', 'Tipo de documento', select('tax_id_type', [['', '—'], ...TAX_ID_TYPES.map((t): [string, string] => [t, TAX_LABEL[t]])]))}
            {field('tax_id', 'Número de documento', input('tax_id', 'text', vals.tax_id_type === 'ruc' ? '11 dígitos' : vals.tax_id_type === 'dni' ? '8 dígitos' : ''))}
            {field('email', 'Correo', input('email', 'email', 'contacto@empresa.pe'))}
            {field('phone', 'Teléfono', input('phone', 'tel'))}
            {field('address', 'Dirección fiscal', input('address'), { full: true })}
            {field('origin_brand_id', 'Marca de origen', brands.length ? select('origin_brand_id', brands.map((b) => [b.id, b.name]), brandId) : input('origin_brand_id', 'text', 'UUID de la marca'), { req: true })}
            {field('account_manager_id', 'Responsable', select('account_manager_id', [['', 'Sin asignar'], ...staff.map((u): [string, string] => [u.id, u.name])]))}
            {field('currency', 'Moneda', select('currency', [['PEN', 'Soles (S/)'], ['USD', 'Dólares (US$)']]), { req: true })}
            {field('locale', 'Idioma', select('locale', [['es', 'Español'], ['en', 'Inglés']]))}
            {field('timezone', 'Zona horaria', input('timezone'))}
            {field('invoice_consolidation', 'Modo de facturación', select('invoice_consolidation', [['consolidated', 'Consolidada'], ['per_service', 'Por servicio']]))}
            {field('tax_treatment', 'Tratamiento tributario', select('tax_treatment', [['taxed', 'Gravado'], ['export', 'Exportación']]))}
            {field('is_withholding_agent', 'Agente de retención de IGV', select('is_withholding_agent', [['0', 'No'], ['1', 'Sí']]))}
            {customer ? field('status', 'Estado', select('status', [['active', 'Activo'], ['inactive', 'Inactivo']])) : null}
          </div>
          <div className="err" role="alert">
            {msg}
          </div>
        </div>
        <div className="modal-f">
          <button type="button" className="btn" onClick={close}>
            Cancelar
          </button>
          <button className="btn primary" type="submit" disabled={busy || conflict || (!!customer && !dirty)}>
            {busy ? 'Guardando…' : customer ? 'Guardar cambios' : 'Crear cliente'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
