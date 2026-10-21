/**
 * Asistente «Nuevo servicio personalizado» (prototipo l.2356-2397): 6 pasos
 * (identidad, campos propios, precio, entrega y contrato, mapa y cliente,
 * venta) que crean un producto en GENPROD y, opcionalmente, una categoría.
 */
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../../app/context';
import { Icon } from '../../../components/Icon';
import { Modal } from '../../../components/Modal';
import { catCfg, CTPL, CYC, mgPct, moneyRaw, norm, TC } from '../../../data';
import type { Cur } from '../../../data';
import { allCats, catName, COMPS, CUSTOMCATS, FTYPES, G, GENPROD, LEGACY, SEES, WPROV, WSTEPS, type GenField, type GenProduct } from './catalogData';
import { html2txt, RichText } from './RichText';
import { MgChip } from './shared';

interface Wiz {
  step: number;
  name: string;
  descHtml: string;
  catMode: 'existente' | 'nueva';
  cat: string;
  newCat: string;
  fields: (GenField & { opts: string })[];
  price: string;
  cur: Cur;
  cy: string;
  cost: string;
  prov: string;
  tasks: string[];
  contract: boolean;
  tpl: string;
  comp: string;
  compName: string;
  sees: string[];
  sale: 'online' | 'cotizacion';
}

export function WizardModal({ cat, onClose, onCreated }: { cat: string; onClose: () => void; onCreated: (p: GenProduct) => void }) {
  const { toast } = useApp();
  const [w, setW] = useState<Wiz>(() => ({
    step: 0, name: '', descHtml: '', catMode: 'existente', cat: cat && !LEGACY.includes(cat) ? cat : 'personalizados', newCat: '',
    fields: [{ l: 'Dominio del cliente', t: 'Texto', req: true, opts: '' }], price: '', cur: 'PEN', cy: 'Único', cost: '', prov: '',
    tasks: ['Reunión de inicio', 'Ejecución', 'Entrega y conformidad'], contract: true, tpl: 'Contrato marco de servicios TI', comp: 'Otro', compName: '',
    sees: ['Nombre', 'Precio', 'Estado', 'Progreso de entrega'], sale: 'cotizacion',
  }));
  const [e, setE] = useState<Record<string, string>>({});
  const body = useRef<HTMLDivElement>(null);
  const focusLast = useRef<string | null>(null);
  const up = (p: Partial<Wiz>) => setW((x) => ({ ...x, ...p }));

  /* Al cambiar de paso, enfocar el primer control; tras agregar, el último */
  useEffect(() => {
    const b = body.current;
    if (!b) return;
    if (focusLast.current) {
      const l = b.querySelectorAll<HTMLElement>(focusLast.current);
      focusLast.current = null;
      l[l.length - 1]?.focus();
      return;
    }
    b.querySelector<HTMLElement>('input,select,textarea,[contenteditable="true"]')?.focus();
  }, [w.step, w.fields.length, w.tasks.length]);

  const valid = (): boolean => {
    const er: Record<string, string> = {};
    if (w.step === 0) {
      if (!w.name.trim()) er.name = 'Ingrese el nombre del servicio.';
      else if (GENPROD.some((g) => norm(g.name) === norm(w.name.trim()))) er.name = 'Ya existe un producto con ese nombre.';
      if (w.catMode === 'nueva' && !w.newCat.trim()) er.newCat = 'Ingrese el nombre de la categoría.';
    }
    if (w.step === 1) {
      if (w.fields.some((f) => !f.l.trim())) er.fields = 'Todos los campos necesitan una etiqueta.';
      else if (w.fields.some((f) => f.t === 'Lista' && !f.opts.trim())) er.fields = 'Los campos de tipo lista necesitan opciones.';
    }
    if (w.step === 2) {
      if (!(+w.price > 0)) er.price = 'Ingrese un precio mayor que 0.';
      if (w.cost !== '' && !(+w.cost >= 0)) er.cost = 'Costo inválido.';
    }
    if (w.step === 3 && !w.tasks.filter((t) => t.trim()).length) {
      toast('Agregue al menos una tarea de entrega', '', 'err');
      return false;
    }
    setE(er);
    if (Object.keys(er).length) {
      window.setTimeout(() => body.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0);
      return false;
    }
    return true;
  };
  const next = () => valid() && up({ step: w.step + 1 });
  const save = () => {
    let c = w.cat;
    if (w.catMode === 'nueva') {
      c = 'c-' + norm(w.newCat).replace(/[^a-z0-9]+/g, '-');
      if (!CUSTOMCATS.find((x) => x.id === c)) CUSTOMCATS.push({ id: c, n: w.newCat.trim(), custom: true });
    }
    const desc = html2txt(w.descHtml).split('\n')[0] || '';
    const n = G(c, w.name.trim(), desc.trim() || 'Servicio personalizado', +w.price, w.cy, +w.cost || 0, w.prov || 'Equipo interno', w.sale, 0, {
      custom: true, descHtml: w.descHtml, cur: w.cur, fields: w.fields.map((f) => ({ ...f })), tasks: w.tasks.filter((t) => t.trim()), contract: w.contract, tpl: w.tpl, comp: w.comp, compName: w.compName || w.name, sees: w.sees,
    });
    GENPROD.push(n);
    onCreated(n);
  };

  const p = +w.price || 0;
  const cst = (+w.cost || 0) * (w.cur === 'PEN' ? TC : 1);
  const mg = cst ? <MgChip m={mgPct(p, cst)} min={catCfg.minMg} /> : <span className="sub">Sin costo directo</span>;
  const setField = (k: number, patch: Partial<GenField & { opts: string }>) => up({ fields: w.fields.map((f, i) => (i === k ? { ...f, ...patch } : f)) });

  let content;
  if (w.step === 0)
    content = (
      <div className="form-grid">
        <label className="field full">
          Nombre del servicio *
          <input className="input" value={w.name} placeholder="Ej. Migración de sitio web" aria-invalid={!!e.name} onChange={(ev) => up({ name: ev.target.value })} />
          <span className="err">{e.name || ''}</span>
        </label>
        <div className="field full">
          Descripción
          <RichText initial={w.descHtml} label="Descripción del servicio" min={100} mini onChange={(h) => setW((x) => ({ ...x, descHtml: h }))} />
        </div>
        <fieldset className="fset full">
          <legend>Categoría</legend>
          <label className="check">
            <input type="radio" name="wzcm" checked={w.catMode === 'existente'} onChange={() => up({ catMode: 'existente' })} />
            Categoría existente
          </label>
          {w.catMode === 'existente' ? (
            <select className="select" aria-label="Categoría existente" value={w.cat} onChange={(ev) => up({ cat: ev.target.value })}>
              {allCats()
                .filter((c) => !LEGACY.includes(c.id))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.n}
                  </option>
                ))}
            </select>
          ) : null}
          <label className="check">
            <input type="radio" name="wzcm" checked={w.catMode === 'nueva'} onChange={() => up({ catMode: 'nueva' })} />
            Crear categoría nueva
          </label>
          {w.catMode === 'nueva' ? (
            <input className="input" value={w.newCat} placeholder="Nombre de la categoría" aria-label="Nombre de la categoría nueva" aria-invalid={!!e.newCat} onChange={(ev) => up({ newCat: ev.target.value })} />
          ) : null}
          <span className="err">{e.newCat || ''}</span>
        </fieldset>
      </div>
    );
  else if (w.step === 1)
    content = (
      <>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>Datos que se piden al contratar y que quedan en la ficha del servicio.</p>
        <div className="wz-fields">
          {w.fields.length ? (
            w.fields.map((f, k) => (
              <div className="wz-f" key={k}>
                <input className="input wz-l" value={f.l} placeholder="Etiqueta" aria-label={`Etiqueta del campo ${k + 1}`} aria-invalid={!!e.fields && !f.l.trim()} onChange={(ev) => setField(k, { l: ev.target.value })} />
                <select className="select" aria-label={`Tipo del campo ${k + 1}`} value={f.t} onChange={(ev) => setField(k, { t: ev.target.value })}>
                  {FTYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
                <label className="check">
                  <input type="checkbox" checked={f.req} onChange={(ev) => setField(k, { req: ev.target.checked })} />
                  Obligatorio
                </label>
                <button type="button" className="btn sm icon" aria-label={`Quitar campo ${k + 1}`} onClick={() => up({ fields: w.fields.filter((_, i) => i !== k) })}>
                  <Icon name="trash" size="sm" />
                </button>
                {f.t === 'Lista' ? (
                  <input className="input wz-opts" value={f.opts} placeholder="Opciones separadas por comas" aria-label={`Opciones del campo ${k + 1}`} aria-invalid={!!e.fields && !f.opts.trim()} onChange={(ev) => setField(k, { opts: ev.target.value })} />
                ) : null}
              </div>
            ))
          ) : (
            <p className="sub">Sin campos propios.</p>
          )}
        </div>
        <button
          type="button"
          className="btn sm"
          onClick={() => {
            focusLast.current = '.wz-l';
            up({ fields: [...w.fields, { l: '', t: 'Texto', req: false, opts: '' }] });
          }}
        >
          <Icon name="plus" size="sm" />
          Agregar campo
        </button>
        <span className="err">{e.fields || ''}</span>
      </>
    );
  else if (w.step === 2)
    content = (
      <div className="form-grid">
        <label className="field">
          Precio *
          <input className="input" type="number" min={0} step="0.1" value={w.price} aria-invalid={!!e.price} onChange={(ev) => up({ price: ev.target.value })} />
          <span className="err">{e.price || ''}</span>
        </label>
        <label className="field">
          Moneda
          <select className="select" value={w.cur} onChange={(ev) => up({ cur: ev.target.value as Cur })}>
            <option value="PEN">S/</option>
            <option value="USD">US$</option>
          </select>
        </label>
        <label className="field">
          Ciclo
          <select className="select" value={w.cy} onChange={(ev) => up({ cy: ev.target.value })}>
            {CYC.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Costo (US$, opcional)
          <input className="input" type="number" min={0} step="0.01" value={w.cost} aria-invalid={!!e.cost} onChange={(ev) => up({ cost: ev.target.value })} />
          <span className="err">{e.cost || ''}</span>
        </label>
        <label className="field full">
          Proveedor (opcional)
          <select className="select" value={w.prov} onChange={(ev) => up({ prov: ev.target.value })}>
            {WPROV.map((o) => {
              const [v, l] = Array.isArray(o) ? o : [o, o];
              return (
                <option key={v} value={v}>
                  {l}
                </option>
              );
            })}
          </select>
        </label>
        <div className="field full">
          Margen
          <div className="mg-live" aria-live="polite">
            {mg}
          </div>
        </div>
      </div>
    );
  else if (w.step === 3)
    content = (
      <>
        <h3 className="fs">Tareas de entrega</h3>
        <ol className="blk-list">
          {w.tasks.map((t, k) => (
            <li key={k}>
              <span className="blk-n">{k + 1}</span>
              <div className="grow">
                <input className="input sm wz-t" value={t} aria-label={`Tarea ${k + 1}`} onChange={(ev) => up({ tasks: w.tasks.map((x, i) => (i === k ? ev.target.value : x)) })} />
              </div>
              <button type="button" className="btn sm icon" aria-label={`Quitar tarea ${k + 1}`} onClick={() => up({ tasks: w.tasks.filter((_, i) => i !== k) })}>
                <Icon name="trash" size="sm" />
              </button>
            </li>
          ))}
        </ol>
        <button
          type="button"
          className="btn sm"
          onClick={() => {
            focusLast.current = '.wz-t';
            up({ tasks: [...w.tasks, ''] });
          }}
        >
          <Icon name="plus" size="sm" />
          Agregar tarea
        </button>
        <div className="note">
          <Icon name="info" size="sm" />
          <span>Al confirmarse un pedido se crean estas tareas en el tablero de Tareas.</span>
        </div>
        <label className="check">
          <input type="checkbox" checked={w.contract} onChange={(ev) => up({ contract: ev.target.checked })} />
          Requiere contrato firmado antes de entregar
        </label>
        {w.contract ? (
          <label className="field">
            Plantilla de contrato
            <select className="select" value={w.tpl} onChange={(ev) => up({ tpl: ev.target.value })}>
              {CTPL.map((t) => (
                <option key={t.id}>{t.n}</option>
              ))}
            </select>
          </label>
        ) : null}
      </>
    );
  else if (w.step === 4)
    content = (
      <div className="form-grid">
        <label className="field">
          Componente en el mapa de servicios
          <select className="select" value={w.comp} onChange={(ev) => up({ comp: ev.target.value })}>
            {COMPS.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Nombre del componente
          <input className="input" value={w.compName} placeholder={w.name || 'Ej. Migración'} onChange={(ev) => up({ compName: ev.target.value })} />
        </label>
        <fieldset className="fset full">
          <legend>Qué ve el cliente en su portal</legend>
          {SEES.map((x) => (
            <label className="check" key={x}>
              <input type="checkbox" checked={w.sees.includes(x)} onChange={(ev) => up({ sees: ev.target.checked ? [...w.sees, x] : w.sees.filter((y) => y !== x) })} />
              {x}
            </label>
          ))}
        </fieldset>
      </div>
    );
  else
    content = (
      <>
        <fieldset className="fset">
          <legend>Modalidad de venta</legend>
          <label className="check">
            <input type="radio" name="wzs" checked={w.sale === 'online'} onChange={() => up({ sale: 'online' })} />
            Venta en línea (se puede contratar desde la web y el portal)
          </label>
          <label className="check">
            <input type="radio" name="wzs" checked={w.sale === 'cotizacion'} onChange={() => up({ sale: 'cotizacion' })} />
            Solo cotización (el botón abre una solicitud de cotización)
          </label>
        </fieldset>
        <div className="note">
          <div>
            <b>{w.name}</b> · {w.catMode === 'nueva' ? w.newCat + ' (nueva)' : catName(w.cat)}
            <br />
            {w.price ? moneyRaw(+w.price, w.cur) : '—'} · {w.cy} · {w.fields.length} campos propios · {w.tasks.length} tareas · {w.contract ? 'con contrato' : 'sin contrato'} · componente «{w.compName || w.comp}»
          </div>
        </div>
      </>
    );

  const lastStep = w.step === WSTEPS.length - 1;
  return (
    <Modal
      open
      wide
      onClose={onClose}
      title="Nuevo servicio personalizado"
      sub={`Paso ${w.step + 1} de ${WSTEPS.length}: ${WSTEPS[w.step]}`}
      bare
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          {w.step ? (
            <button type="button" className="btn" onClick={() => up({ step: w.step - 1 })}>
              <Icon name="cl" size="sm" />
              Anterior
            </button>
          ) : null}
          {!lastStep ? (
            <button type="button" className="btn primary" onClick={next}>
              Siguiente
              <Icon name="cr" size="sm" />
            </button>
          ) : (
            <button type="button" className="btn success" onClick={save}>
              <Icon name="check" size="sm" />
              Guardar servicio
            </button>
          )}
        </>
      }
    >
      <ol className="stepper" aria-label="Pasos">
        {WSTEPS.map((n, k) => (
          <li key={n} className={k < w.step ? 'done' : k === w.step ? 'cur' : ''} aria-current={k === w.step ? 'step' : undefined}>
            <span>{k < w.step ? '✓' : k + 1}</span>
            {n}
          </li>
        ))}
      </ol>
      <div className="modal-b" ref={body}>
        {content}
      </div>
    </Modal>
  );
}
