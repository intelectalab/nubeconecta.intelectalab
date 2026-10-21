/**
 * Host de diálogos imperativos (useApp().dialogs.confirm / .form / .open).
 * Lo monta App.tsx una sola vez; las vistas no lo usan directamente.
 */
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useApp, type FormField, type FormOpts } from '../app/context';
import { Modal } from './Modal';

const ids = new WeakMap<object, number>();
let idSeq = 0;
const keyOf = (o: object): number => {
  let k = ids.get(o);
  if (k == null) {
    k = ++idSeq;
    ids.set(o, k);
  }
  return k;
};

export function DialogHost() {
  const { dialog, dialogs } = useApp();
  if (!dialog) return null;
  if (dialog.kind === 'confirm') {
    const o = dialog.o;
    return (
      <Modal
        open
        onClose={dialogs.close}
        title={o.title}
        initialFocus="#dlgOk"
        footer={
          <>
            <button type="button" className="btn" onClick={dialogs.close}>
              Cancelar
            </button>
            <button
              type="button"
              id="dlgOk"
              className={`btn ${o.danger ? 'danger' : 'primary'}`}
              onClick={() => {
                dialogs.close();
                o.onOk();
              }}
            >
              {o.okLabel || 'Confirmar'}
            </button>
          </>
        }
      >
        {typeof o.body === 'string' ? <p style={{ margin: 0 }}>{o.body}</p> : o.body}
      </Modal>
    );
  }
  if (dialog.kind === 'form') return <FormDialog key={keyOf(dialog.o)} o={dialog.o} onClose={dialogs.close} />;
  const o = dialog.o;
  return (
    <Modal open onClose={dialogs.close} title={o.title} sub={o.sub} label={o.label} wide={o.wide} footer={o.footer} className={o.className}>
      {dialog.node}
    </Modal>
  );
}

function initVals(fields: FormField[]): Record<string, string> {
  const v: Record<string, string> = {};
  fields.forEach((f) => {
    v[f.id] = f.value != null ? String(f.value) : f.type === 'select' && f.options && f.options.length ? String(Array.isArray(f.options[0]) ? f.options[0][0] : f.options[0]) : '';
  });
  return v;
}

/** Formulario genérico en modal (formDlg del prototipo). */
export function FormDialog({ o, onClose }: { o: FormOpts; onClose: () => void }) {
  const uid = useId();
  const [vals, setVals] = useState<Record<string, string>>(() => initVals(o.fields));
  const [err, setErr] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => setErr(''), [vals]);
  const fid = (id: string) => `f_${uid}_${id}`;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v: Record<string, string> = {};
    o.fields.forEach((f) => (v[f.id] = (vals[f.id] ?? '').trim()));
    const miss = o.fields.find((f) => f.req && !v[f.id]);
    if (miss) {
      setErr(`Complete el campo «${miss.label}».`);
      document.getElementById(fid(miss.id))?.focus();
      return;
    }
    const e2 = o.validate ? o.validate(v) : null;
    if (e2) {
      setErr(e2);
      return;
    }
    onClose();
    o.onSubmit(v);
  };
  return (
    <Modal open onClose={onClose} title={o.title} sub={o.sub} wide={o.wide} bare>
      <form ref={formRef} onSubmit={submit} noValidate style={{ display: 'contents' }}>
        <div className="modal-b">
          {o.pre}
          <div className="form-grid">
            {o.fields.map((f) => {
              const id = fid(f.id);
              const set = (x: string) => setVals((p) => ({ ...p, [f.id]: x }));
              let inp;
              if (f.type === 'select')
                inp = (
                  <select className="select" id={id} name={f.id} value={vals[f.id]} onChange={(e) => set(e.target.value)}>
                    {(f.options || []).map((op) => {
                      const [v, l] = Array.isArray(op) ? op : [op, op];
                      return (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      );
                    })}
                  </select>
                );
              else if (f.type === 'textarea') inp = <textarea className="input" id={id} name={f.id} rows={3} value={vals[f.id]} onChange={(e) => set(e.target.value)} placeholder={f.ph} />;
              else
                inp = (
                  <input
                    className="input"
                    id={id}
                    name={f.id}
                    type={f.type || 'text'}
                    value={vals[f.id]}
                    min={f.min}
                    step={f.step}
                    placeholder={f.ph}
                    required={f.req}
                    list={f.list}
                    onChange={(e) => set(e.target.value)}
                  />
                );
              return (
                <label key={f.id} className={`field${f.full ? ' full' : ''}`} htmlFor={id}>
                  {f.label}
                  {f.req ? ' *' : ''}
                  {inp}
                </label>
              );
            })}
          </div>
          <div className="err" role="alert">
            {err}
          </div>
        </div>
        <div className="modal-f">
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" type="submit">
            {o.submit || 'Guardar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
