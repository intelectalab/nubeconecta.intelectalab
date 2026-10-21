/**
 * WordPress › Formularios (prototipo vWp, pestaña «formularios»; handlers
 * formSel, fmF, fmS, fmMove, fmDel, fmAdd, formSave, formNew; l.2482-2486 y
 * l.2503-2512).
 */
import { useRef, useState } from 'react';
import { useApp } from '../../../app/context';
import { Icon } from '../../../components/Icon';
import { Note } from '../../../components/ui';
import { AGENTS, EJEC, FORMS, FTYP, VALS, type FormField, type WebForm } from '../../../data';
import { FormPreview, MwFrame } from './previews';
import { MiniRte, ScBox, txt2html, html2txt } from './shared';

/** HTML del mensaje de confirmación por formulario (el dato base es texto). */
const MSG_HTML: Record<string, string> = {};

export default function WpFormularios({ sel, setSel }: { sel: string; setSel: (id: string) => void }) {
  const { toast, refresh, dialogs } = useApp();
  const [addT, setAddT] = useState(FTYP[0]);
  const listRef = useRef<HTMLOListElement>(null);
  const f: WebForm = FORMS.find((x) => x.id === sel) || FORMS[0];
  const owners = [...new Set([...EJEC, ...AGENTS])];

  const setField = (k: number, patch: Partial<FormField>) => {
    Object.assign(f.fields[k], patch);
    refresh();
  };
  const setForm = (patch: Partial<WebForm>) => {
    Object.assign(f, patch);
    refresh();
  };
  const focusLater = (sel2: string) => window.setTimeout(() => listRef.current?.querySelector<HTMLElement>(sel2)?.focus(), 0);
  const move = (k: number, d: number) => {
    const j = k + d;
    if (j < 0 || j >= f.fields.length) return;
    [f.fields[k], f.fields[j]] = [f.fields[j], f.fields[k]];
    refresh();
    focusLater(`[data-mv="${j}:${d}"]:not([disabled]), [data-del="${j}"]`);
  };
  const del = (k: number) => {
    if (f.fields.length <= 1) {
      toast('El formulario necesita al menos un campo', '', 'err');
      return;
    }
    const x = f.fields.splice(k, 1)[0];
    toast('Campo quitado', x.l, 'warn');
    refresh();
  };
  const add = () => {
    f.fields.push({ t: addT, l: 'Nuevo campo ' + addT.toLowerCase(), req: false, v: addT === 'Correo' ? 'Correo válido' : 'Ninguna', opts: addT === 'Lista' || addT === 'Casillas' ? 'Opción 1, Opción 2' : '' });
    refresh();
    window.setTimeout(() => {
      const l = listRef.current?.querySelectorAll<HTMLInputElement>('[data-lbl]');
      const last = l && l[l.length - 1];
      if (last) {
        last.focus();
        last.select();
      }
    }, 0);
  };
  const save = () => {
    if (f.fields.some((x) => !x.l.trim())) {
      toast('Hay campos sin etiqueta', 'Complete todas las etiquetas.', 'err');
      return;
    }
    if (f.fields.some((x) => (x.t === 'Lista' || x.t === 'Casillas') && !(x.opts || '').trim())) {
      toast('Faltan opciones', 'Los campos de lista y casillas necesitan opciones.', 'err');
      return;
    }
    if (!html2txt(MSG_HTML[f.id] ?? txt2html(f.msg))) {
      toast('Falta el mensaje de confirmación', 'Escriba el texto que verá la persona al enviar.', 'err');
      return;
    }
    toast('Formulario guardado', `${f.n} · [hub_formulario id="${f.id}"]`);
  };
  const newForm = () =>
    dialogs.form({
      title: 'Nuevo formulario',
      fields: [
        { id: 'n', label: 'Nombre', req: true, full: true },
        { id: 'id', label: 'Identificador (para el shortcode)', req: true, full: true, ph: 'ej. trabaja-con-nosotros' },
      ],
      validate: (v) => (!/^[a-z0-9-]{3,}$/.test(v.id) ? 'El identificador usa minúsculas, números y guiones.' : FORMS.some((x) => x.id === v.id) ? 'Ese identificador ya existe.' : null),
      submit: 'Crear',
      onSubmit: (v) => {
        FORMS.push({
          id: v.id,
          n: v.n,
          fields: [
            { t: 'Texto', l: 'Nombre', req: true, v: 'Ninguna' },
            { t: 'Correo', l: 'Correo', req: true, v: 'Correo válido' },
          ],
          consent: true,
          consentTxt: 'Acepto la Política de privacidad.',
          captcha: true,
          dest: 'Correo',
          owner: EJEC[0],
          msg: '¡Gracias por escribirnos!',
        });
        setSel(v.id);
        toast('Formulario creado', `[hub_formulario id="${v.id}"]`);
        refresh();
      },
    });

  return (
    <div className="card-b" style={{ paddingTop: 16 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end', marginBottom: 14 }}>
        <label className="field" htmlFor="fmSel">
          Formulario
          <select id="fmSel" className="select" value={f.id} onChange={(e) => setSel(e.target.value)}>
            {FORMS.map((x) => (
              <option key={x.id} value={x.id}>
                {x.n}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn" onClick={newForm}>
          <Icon name="plus" size="sm" />
          Nuevo formulario
        </button>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn primary" onClick={save}>
          <Icon name="check" size="sm" />
          Guardar formulario
        </button>
      </div>
      <div className="grid g-2">
        <div className="stack">
          <div>
            <h3 className="fs">Campos</h3>
            <ol className="blk-list" ref={listRef}>
              {f.fields.map((x, k) => (
                <li className="fm-row" key={k}>
                  <span className="blk-n">{k + 1}</span>
                  <div className="grow fm-g">
                    <input className="input sm" data-lbl value={x.l} onChange={(e) => setField(k, { l: e.target.value })} aria-label={`Etiqueta del campo ${k + 1}`} />
                    <select className="select sm" value={x.t} onChange={(e) => setField(k, { t: e.target.value, opts: (e.target.value === 'Lista' || e.target.value === 'Casillas') && !x.opts ? 'Opción 1, Opción 2' : x.opts })} aria-label={`Tipo del campo ${k + 1}`}>
                      {FTYP.map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                    <select className="select sm" value={x.v} onChange={(e) => setField(k, { v: e.target.value })} aria-label={`Validación del campo ${k + 1}`}>
                      {VALS.map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                    <label className="check">
                      <input type="checkbox" checked={x.req} onChange={(e) => setField(k, { req: e.target.checked })} />
                      Obligatorio
                    </label>
                    {x.t === 'Lista' || x.t === 'Casillas' ? (
                      <input className="input sm" value={x.opts || ''} onChange={(e) => setField(k, { opts: e.target.value })} placeholder="Opciones separadas por comas" aria-label={`Opciones del campo ${k + 1}`} />
                    ) : null}
                  </div>
                  <button type="button" className="btn sm icon" data-mv={`${k}:-1`} onClick={() => move(k, -1)} aria-label={`Subir campo ${k + 1}`} disabled={k === 0}>
                    <Icon name="cd" size="sm" style={{ transform: 'rotate(180deg)' }} />
                  </button>
                  <button type="button" className="btn sm icon" data-mv={`${k}:1`} onClick={() => move(k, 1)} aria-label={`Bajar campo ${k + 1}`} disabled={k === f.fields.length - 1}>
                    <Icon name="cd" size="sm" />
                  </button>
                  <button type="button" className="btn sm icon" data-del={k} onClick={() => del(k)} aria-label={`Quitar campo ${k + 1}`}>
                    <Icon name="trash" size="sm" />
                  </button>
                </li>
              ))}
            </ol>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <select className="select" value={addT} onChange={(e) => setAddT(e.target.value)} aria-label="Tipo de campo nuevo" style={{ width: 'auto' }}>
                {FTYP.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
              <button type="button" className="btn" onClick={add}>
                <Icon name="plus" size="sm" />
                Agregar campo
              </button>
            </div>
          </div>
          <div className="form-grid">
            <h3 className="full fs">Envío</h3>
            <label className="check full">
              <input type="checkbox" checked={f.consent} onChange={(e) => setForm({ consent: e.target.checked })} />
              Casilla de consentimiento
            </label>
            {f.consent ? (
              <label className="field full" htmlFor="fmCt">
                Texto del consentimiento
                <input className="input" id="fmCt" value={f.consentTxt} onChange={(e) => setForm({ consentTxt: e.target.value })} />
              </label>
            ) : null}
            <label className="check full">
              <input type="checkbox" checked={f.captcha} onChange={(e) => setForm({ captcha: e.target.checked })} />
              Captcha antispam
            </label>
            <label className="field" htmlFor="fmD">
              Destino
              <select id="fmD" className="select" value={f.dest} onChange={(e) => setForm({ dest: e.target.value })}>
                {['Prospecto CRM', 'Ticket', 'Correo'].map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </label>
            <label className="field" htmlFor="fmO">
              Responsable
              <select id="fmO" className="select" value={f.owner} onChange={(e) => setForm({ owner: e.target.value })}>
                {owners.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </label>
            <div className="field full">
              Mensaje de confirmación
              <MiniRte
                resetKey={f.id}
                initial={MSG_HTML[f.id] ?? txt2html(f.msg)}
                label="Mensaje de confirmación"
                onChange={(h) => {
                  MSG_HTML[f.id] = h;
                  f.msg = html2txt(h);
                }}
              />
            </div>
          </div>
        </div>
        <div className="stack">
          <div>
            <h3 className="fs">Vista previa</h3>
            <MwFrame brand="ap">
              <FormPreview f={f} brand="ap" />
            </MwFrame>
          </div>
          <div className="field">
            Shortcode
            <ScBox code={`[hub_formulario id="${f.id}"]`} id="scForm" />
          </div>
          <Note icon="arrow">
            Cada envío crea {f.dest === 'Prospecto CRM' ? 'un prospecto en el CRM' : f.dest === 'Ticket' ? 'un ticket de soporte' : 'un correo'} asignado a <b>{f.owner}</b>.
          </Note>
        </div>
      </div>
    </div>
  );
}
