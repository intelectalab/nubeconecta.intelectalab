/**
 * WordPress › Formularios — constructor real de formularios embebibles
 * (web_connector.form.*). Lista por marca, edita la configuración y los campos
 * (agregar/quitar/reordenar) y guarda contra /api/v1/admin/web-connector/forms.
 */
import { useEffect, useRef, useState } from 'react';
import {
  type WebForm,
  type WebFormFieldDef,
  type WebFormInput,
  type WebFieldType,
  type WebFieldMapsTo,
  type WebFormDestination,
  type WebFormStatus,
} from '@hub/api';
import { useApp } from '../../../app/context';
import { Icon } from '../../../components/Icon';
import { Modal } from '../../../components/Modal';
import { Chip, Note } from '../../../components/ui';
import { ScBox } from './shared';
import { errorText, useCan, useLoad, useLookups } from '../clientes/shared';
import { hub } from '../../../auth/client';

const TYPE_LABEL: Record<WebFieldType, string> = {
  text: 'Texto', textarea: 'Área de texto', email: 'Correo', phone: 'Teléfono', select: 'Lista', checkboxes: 'Casillas', file: 'Archivo',
};
const TYPES = Object.keys(TYPE_LABEL) as WebFieldType[];
const MAPS_LABEL: Record<WebFieldMapsTo, string> = { name: 'Nombre', email: 'Correo', phone: 'Teléfono', company: 'Empresa', subject: 'Asunto', message: 'Mensaje' };
const MAPS = Object.keys(MAPS_LABEL) as WebFieldMapsTo[];
const DEST_LABEL: Record<WebFormDestination, string> = { lead: 'Prospecto en el CRM', ticket: 'Ticket de soporte', email: 'Correo al responsable' };
const DESTS = Object.keys(DEST_LABEL) as WebFormDestination[];
const STATUS_LABEL: Record<WebFormStatus, string> = { draft: 'Borrador', active: 'Activo', inactive: 'Inactivo' };
const STATUSES = Object.keys(STATUS_LABEL) as WebFormStatus[];

/** Campo en edición (la etiqueta y las opciones se editan como texto plano en español). */
interface UField {
  key: string;
  label: string;
  type: WebFieldType;
  required: boolean;
  options: string; // separadas por coma; solo lista/casillas
  maps_to: WebFieldMapsTo | '';
}

const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'opcion';
const hasOpts = (t: WebFieldType) => t === 'select' || t === 'checkboxes';

function toUField(f: WebFormFieldDef): UField {
  return {
    key: f.key,
    label: f.label?.es ?? '',
    type: f.field_type,
    required: !!f.is_required,
    options: (f.options ?? []).map((o) => o.label?.es ?? o.value).join(', '),
    maps_to: f.maps_to ?? '',
  };
}

function freshFields(): UField[] {
  return [
    { key: 'nombre', label: 'Nombre', type: 'text', required: true, options: '', maps_to: 'name' },
    { key: 'correo', label: 'Correo', type: 'email', required: true, options: '', maps_to: 'email' },
  ];
}

export default function WpFormularios() {
  const { toast } = useApp();
  const can = useCan();
  const canEdit = can('web_connector.form.create') || can('web_connector.form.update');
  const { brands } = useLookups();
  const [brandId, setBrandId] = useState('');
  useEffect(() => {
    if (!brandId && brands[0]) setBrandId(brands[0].id);
  }, [brands, brandId]);

  const res = useLoad(() => (brandId ? hub.webConnector.forms.list(brandId).then((r) => r.data) : Promise.resolve([] as WebForm[])), [brandId]);
  const forms = res.data ?? [];
  const brand = brands.find((b) => b.id === brandId);
  const [editing, setEditing] = useState<WebForm | 'new' | null>(null);

  const remove = async (f: WebForm) => {
    if (!window.confirm(`¿Eliminar el formulario «${f.name}»? Esta acción no se puede deshacer.`)) return;
    try {
      await hub.webConnector.forms.remove(f.id);
      toast('Formulario eliminado');
      res.reload();
    } catch (e) {
      toast('No se pudo', errorText(e), 'err');
    }
  };

  return (
    <div className="card-b" style={{ paddingTop: 16 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 14 }}>
        <label className="field" htmlFor="fmB" style={{ minWidth: 200 }}>
          Marca
          <select id="fmB" className="select" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </label>
        <span style={{ flex: 1 }} />
        {canEdit ? (
          <button type="button" className="btn primary" disabled={!brandId} onClick={() => setEditing('new')}>
            <Icon name="plus" size="sm" /> Nuevo formulario
          </button>
        ) : null}
      </div>

      {res.error ? (
        <Note kind="warn">No se pudo cargar: {errorText(res.error)} <button type="button" className="btn sm" onClick={res.reload}>Reintentar</button></Note>
      ) : res.loading ? (
        <p className="sub">Cargando…</p>
      ) : forms.length === 0 ? (
        <p className="sub">Esta marca aún no tiene formularios. Crea el primero con «Nuevo formulario».</p>
      ) : (
        <ul className="rows">
          {forms.map((f) => (
            <li key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="grow">
                <b>{f.name}</b>{' '}
                <Chip kind={f.status === 'active' ? 'ok' : f.status === 'inactive' ? 'warn' : ''}>{STATUS_LABEL[f.status]}</Chip>{' '}
                <span className="sub">{DEST_LABEL[f.destination]} · {f.fields_count ?? 0} campo(s)</span>
                <div className="mono" style={{ marginTop: 2 }}>[hub_formulario id="{f.code}"]</div>
              </div>
              <button type="button" className="btn sm" onClick={() => setEditing(f)}>{canEdit ? 'Editar' : 'Ver'}</button>
              {can('web_connector.form.delete') ? (
                <button type="button" className="btn sm danger" onClick={() => void remove(f)}>Quitar</button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {editing && brandId ? (
        <FormEditor
          brandId={brandId}
          brandCode={brand?.code ?? ''}
          form={editing === 'new' ? null : editing}
          readOnly={!canEdit}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); res.reload(); }}
        />
      ) : null}
    </div>
  );
}

function FormEditor({ brandId, brandCode, form, readOnly, onClose, onSaved }: {
  brandId: string; brandCode: string; form: WebForm | null; readOnly: boolean; onClose: () => void; onSaved: () => void;
}) {
  const [full, setFull] = useState<WebForm | null>(form && form.fields ? form : null);
  const [loadErr, setLoadErr] = useState('');
  // Carga los campos completos al abrir uno existente (el listado no los trae).
  useEffect(() => {
    if (form && !form.fields) {
      hub.webConnector.forms.get(form.id).then(setFull).catch((e) => setLoadErr(errorText(e)));
    }
  }, [form]);

  const loaded = !form || !!full;
  if (form && !loaded) {
    return (
      <Modal open onClose={onClose} title="Cargando formulario…">
        {loadErr ? <Note kind="warn">No se pudo cargar: {loadErr}</Note> : <p className="sub">Cargando…</p>}
      </Modal>
    );
  }
  return <FormEditorBody brandId={brandId} brandCode={brandCode} form={full} readOnly={readOnly} onClose={onClose} onSaved={onSaved} />;
}

function FormEditorBody({ brandId, brandCode, form, readOnly, onClose, onSaved }: {
  brandId: string; brandCode: string; form: WebForm | null; readOnly: boolean; onClose: () => void; onSaved: () => void;
}) {
  const { toast } = useApp();
  const [code, setCode] = useState(form?.code ?? '');
  const [name, setName] = useState(form?.name ?? '');
  const [status, setStatus] = useState<WebFormStatus>(form?.status ?? 'draft');
  const [destination, setDestination] = useState<WebFormDestination>(form?.destination ?? 'lead');
  const [notifyEmail, setNotifyEmail] = useState(form?.notify_email ?? '');
  const [consent, setConsent] = useState(form?.consent_required ?? true);
  const [consentPurpose, setConsentPurpose] = useState<'marketing' | 'privacy'>(form?.consent_purpose ?? 'privacy');
  const [consentText, setConsentText] = useState(form?.consent_text?.es ?? 'Acepto la política de privacidad.');
  const [successMsg, setSuccessMsg] = useState(form?.success_message?.es ?? '¡Gracias! Te responderemos pronto.');
  const [redirect, setRedirect] = useState(form?.redirect_url ?? '');
  const [fields, setFields] = useState<UField[]>(form?.fields ? form.fields.map(toUField) : freshFields());
  const [addType, setAddType] = useState<WebFieldType>('text');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLOListElement>(null);

  const setField = (k: number, patch: Partial<UField>) => setFields((xs) => xs.map((x, i) => (i === k ? { ...x, ...patch } : x)));
  const move = (k: number, d: number) => setFields((xs) => {
    const j = k + d;
    if (j < 0 || j >= xs.length) return xs;
    const next = xs.slice();
    [next[k], next[j]] = [next[j], next[k]];
    return next;
  });
  const del = (k: number) => setFields((xs) => (xs.length <= 1 ? xs : xs.filter((_, i) => i !== k)));
  const add = () => {
    const n = fields.length + 1;
    setFields((xs) => [...xs, { key: `campo_${n}`, label: `Campo ${n}`, type: addType, required: false, options: hasOpts(addType) ? 'Opción 1, Opción 2' : '', maps_to: addType === 'email' ? 'email' : '' }]);
  };

  function buildInput(): WebFormInput | string {
    const c = code.trim().toLowerCase();
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(c)) return 'El identificador usa minúsculas, números y guiones (ej. contacto-ventas).';
    if (!name.trim()) return 'Falta el nombre del formulario.';
    if (fields.some((x) => !x.label.trim())) return 'Hay campos sin etiqueta.';
    if (fields.some((x) => !/^[a-z][a-z0-9_]*$/.test(x.key))) return 'La clave de un campo usa minúsculas, números y guion bajo, y empieza por letra.';
    if (new Set(fields.map((x) => x.key)).size !== fields.length) return 'Hay claves de campo repetidas.';
    if (fields.some((x) => hasOpts(x.type) && !x.options.trim())) return 'Lista y casillas necesitan al menos una opción.';
    if (status === 'active' && !successMsg.trim()) return 'Un formulario activo necesita un mensaje de confirmación.';
    if (consent && (!consentText.trim() || !consentPurpose)) return 'Con consentimiento obligatorio indica el propósito y el texto de la casilla.';

    const outFields: WebFormFieldDef[] = fields.map((x) => ({
      key: x.key.trim(),
      label: { es: x.label.trim() },
      field_type: x.type,
      is_required: x.required,
      options: hasOpts(x.type)
        ? x.options.split(',').map((o) => o.trim()).filter(Boolean).map((o) => ({ value: slug(o), label: { es: o } }))
        : undefined,
      maps_to: x.maps_to || null,
    }));
    return {
      brand_id: brandId,
      code: c,
      name: name.trim(),
      status,
      destination,
      notify_email: notifyEmail.trim() || null,
      consent_required: consent,
      consent_purpose: consent ? consentPurpose : null,
      consent_text: consent ? { es: consentText.trim() } : {},
      success_message: successMsg.trim() ? { es: successMsg.trim() } : {},
      redirect_url: redirect.trim() || null,
      fields: outFields,
    };
  }

  async function save() {
    const input = buildInput();
    if (typeof input === 'string') {
      toast('Revisa el formulario', input, 'err');
      return;
    }
    setBusy(true);
    try {
      if (form) await hub.webConnector.forms.update(form.id, form.version, input);
      else await hub.webConnector.forms.create(input);
      toast(form ? 'Formulario guardado' : 'Formulario creado', `[hub_formulario id="${input.code}"]`);
      onSaved();
    } catch (e) {
      toast('No se pudo guardar', errorText(e), 'err');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={form ? 'Editar formulario' : 'Nuevo formulario'}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>{readOnly ? 'Cerrar' : 'Cancelar'}</button>
          {!readOnly ? <button type="button" className="btn primary" disabled={busy} onClick={() => void save()}><Icon name="check" size="sm" /> {form ? 'Guardar' : 'Crear formulario'}</button> : null}
        </>
      }
    >
          <div className="grid g-2">
            {/* Columna izquierda: identidad + campos */}
            <div className="stack">
              <div className="form-grid">
                <label className="field" htmlFor="fmCode">
                  Identificador (shortcode)
                  <input className="input" id="fmCode" value={code} disabled={!!form || readOnly} placeholder="contacto-ventas" onChange={(e) => setCode(e.target.value)} />
                </label>
                <label className="field" htmlFor="fmName">
                  Nombre
                  <input className="input" id="fmName" value={name} disabled={readOnly} onChange={(e) => setName(e.target.value)} />
                </label>
              </div>

              <div>
                <h3 className="fs">Campos</h3>
                <ol className="blk-list" ref={listRef}>
                  {fields.map((x, k) => (
                    <li key={k}>
                      <span className="blk-n">{k + 1}</span>
                      <div className="grow">
                        <input className="input sm" value={x.label} disabled={readOnly} onChange={(e) => setField(k, { label: e.target.value })} aria-label={`Etiqueta del campo ${k + 1}`} placeholder="Etiqueta" />
                        <input className="input sm" value={x.key} disabled={readOnly} onChange={(e) => setField(k, { key: e.target.value })} aria-label={`Clave del campo ${k + 1}`} placeholder="clave" style={{ maxWidth: 140 }} />
                        <select className="select sm" value={x.type} disabled={readOnly} onChange={(e) => setField(k, { type: e.target.value as WebFieldType })} aria-label={`Tipo del campo ${k + 1}`}>
                          {TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
                        </select>
                        <select className="select sm" value={x.maps_to} disabled={readOnly} onChange={(e) => setField(k, { maps_to: e.target.value as WebFieldMapsTo | '' })} aria-label={`Mapeo del campo ${k + 1}`}>
                          <option value="">Sin mapeo</option>
                          {MAPS.map((m) => <option key={m} value={m}>→ {MAPS_LABEL[m]}</option>)}
                        </select>
                        <label className="check">
                          <input type="checkbox" checked={x.required} disabled={readOnly} onChange={(e) => setField(k, { required: e.target.checked })} />
                          Obligatorio
                        </label>
                        {hasOpts(x.type) ? (
                          <input className="input sm" value={x.options} disabled={readOnly} onChange={(e) => setField(k, { options: e.target.value })} placeholder="Opciones separadas por comas" aria-label={`Opciones del campo ${k + 1}`} />
                        ) : null}
                      </div>
                      {!readOnly ? (
                        <>
                          <button type="button" className="btn sm icon" onClick={() => move(k, -1)} aria-label={`Subir campo ${k + 1}`} disabled={k === 0}><Icon name="cd" size="sm" style={{ transform: 'rotate(180deg)' }} /></button>
                          <button type="button" className="btn sm icon" onClick={() => move(k, 1)} aria-label={`Bajar campo ${k + 1}`} disabled={k === fields.length - 1}><Icon name="cd" size="sm" /></button>
                          <button type="button" className="btn sm icon" onClick={() => del(k)} aria-label={`Quitar campo ${k + 1}`} disabled={fields.length <= 1}><Icon name="trash" size="sm" /></button>
                        </>
                      ) : null}
                    </li>
                  ))}
                </ol>
                {!readOnly ? (
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <select className="select" value={addType} onChange={(e) => setAddType(e.target.value as WebFieldType)} aria-label="Tipo de campo nuevo" style={{ width: 'auto' }}>
                      {TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
                    </select>
                    <button type="button" className="btn" onClick={add}><Icon name="plus" size="sm" /> Agregar campo</button>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Columna derecha: envío + confirmación */}
            <div className="stack">
              <div className="form-grid">
                <h3 className="full fs">Envío</h3>
                <label className="field" htmlFor="fmDest">
                  Destino
                  <select id="fmDest" className="select" value={destination} disabled={readOnly} onChange={(e) => setDestination(e.target.value as WebFormDestination)}>
                    {DESTS.map((d) => <option key={d} value={d}>{DEST_LABEL[d]}</option>)}
                  </select>
                </label>
                <label className="field" htmlFor="fmStatus">
                  Estado
                  <select id="fmStatus" className="select" value={status} disabled={readOnly} onChange={(e) => setStatus(e.target.value as WebFormStatus)}>
                    {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                  </select>
                </label>
                <label className="field full" htmlFor="fmNotify">
                  Correo de aviso {destination === 'email' ? '(obligatorio para destino Correo)' : '(opcional)'}
                  <input className="input" id="fmNotify" type="email" value={notifyEmail} disabled={readOnly} placeholder="web@marca.pe" onChange={(e) => setNotifyEmail(e.target.value)} />
                </label>
                <label className="check full">
                  <input type="checkbox" checked={consent} disabled={readOnly} onChange={(e) => setConsent(e.target.checked)} />
                  Casilla de consentimiento obligatoria
                </label>
                {consent ? (
                  <>
                    <label className="field" htmlFor="fmCp">
                      Propósito
                      <select id="fmCp" className="select" value={consentPurpose} disabled={readOnly} onChange={(e) => setConsentPurpose(e.target.value as 'marketing' | 'privacy')}>
                        <option value="privacy">Privacidad</option>
                        <option value="marketing">Marketing</option>
                      </select>
                    </label>
                    <label className="field full" htmlFor="fmCt">
                      Texto del consentimiento
                      <input className="input" id="fmCt" value={consentText} disabled={readOnly} onChange={(e) => setConsentText(e.target.value)} />
                    </label>
                  </>
                ) : null}
                <label className="field full" htmlFor="fmMsg">
                  Mensaje de confirmación {status === 'active' ? '(obligatorio si está activo)' : ''}
                  <textarea className="input" id="fmMsg" rows={2} value={successMsg} disabled={readOnly} onChange={(e) => setSuccessMsg(e.target.value)} />
                </label>
                <label className="field full" htmlFor="fmRedir">
                  Redirección tras enviar (opcional)
                  <input className="input" id="fmRedir" value={redirect} disabled={readOnly} placeholder="https://marca.pe/gracias" onChange={(e) => setRedirect(e.target.value)} />
                </label>
              </div>
              <div className="field">
                Shortcode
                <ScBox code={`[hub_formulario id="${code || 'identificador'}"]`} id="scForm" />
              </div>
              <Note icon="arrow">
                Cada envío crea {destination === 'lead' ? 'un prospecto en el CRM' : destination === 'ticket' ? 'un ticket de soporte' : 'un correo de aviso'}
                {brandCode ? <> para la marca <b>{brandCode}</b></> : null}.
              </Note>
            </div>
          </div>
    </Modal>
  );
}
