/**
 * Vista pública del Libro de Reclamaciones (prototipo pubForm/pubDoc l.3222-3262):
 * hoja virtual tal como la ve el consumidor en la web de cada marca. Los envíos
 * son simulados y se registran marcados como prueba.
 */
import { useState, type FormEvent, type ReactNode } from 'react';
import { useApp } from '../../../app/context';
import { useActions } from '../../../app/actions';
import { EMPRESA, NOW, RCOUNT, RECL, TODAY, fD, fT, moneyRaw, mwBtnCls, reclCfg, reclDue, type BrandId } from '../../../data';
import { MwLogo, type ReclX } from './shared';

type FormState = Record<'pb_nom' | 'pb_ape' | 'pb_dt' | 'pb_dn' | 'pb_dom' | 'pb_tel' | 'pb_mail' | 'pb_ap' | 'pb_apd' | 'pb_mon' | 'pb_bd' | 'pb_det' | 'pb_ped' | 'tipo' | 'bien', string> & { acc: boolean; menor: boolean };
const EMPTY: FormState = { pb_nom: '', pb_ape: '', pb_dt: 'DNI', pb_dn: '', pb_dom: '', pb_tel: '', pb_mail: '', pb_ap: '', pb_apd: '', pb_mon: '', pb_bd: '', pb_det: '', pb_ped: '', tipo: '', bien: 'Servicio', acc: false, menor: false };
const SAMPLE: Partial<FormState> = {
  pb_nom: 'Lucía', pb_ape: 'Ramos Quispe', pb_dt: 'DNI', pb_dn: '45879123', pb_dom: 'Jr. Puno 455, Cercado de Lima', pb_tel: '987 654 321', pb_mail: 'lucia.ramos@correo.pe', pb_mon: '89',
  pb_bd: 'Certificado SSL DV estándar', pb_det: 'Pagué la renovación del SSL hace 5 días y el sitio sigue mostrando «no seguro».', pb_ped: 'Instalación inmediata del certificado o devolución del pago.', tipo: 'Reclamo', bien: 'Servicio', acc: true, pb_ap: '', pb_apd: '',
};

export function PubForm({ brand, onCreated }: { brand: BrandId; onCreated: (id: string) => void }) {
  const { toast, refresh } = useApp();
  const [f, setF] = useState<FormState>(EMPTY);
  const [err, setErr] = useState<Record<string, string>>({});
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((o) => ({ ...o, [k]: v }));

  const F = (id: keyof FormState & string, l: string, inp: ReactNode, full?: boolean) => (
    <label className={`field${full ? ' full' : ''}`} htmlFor={id}>
      {l}
      {inp}
      <span className="err" id={`pe_${id}`}>
        {err[id] || ''}
      </span>
    </label>
  );
  const I = (id: 'pb_nom' | 'pb_ape' | 'pb_dn' | 'pb_dom' | 'pb_tel' | 'pb_mail' | 'pb_ap' | 'pb_apd' | 'pb_bd', type = 'text', ph?: string) => (
    <input className="input" id={id} type={type} placeholder={ph} value={f[id]} aria-invalid={err[id] ? true : undefined} aria-describedby={`pe_${id}`} onChange={(e) => set(id, e.target.value)} />
  );

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const o = f;
    const er: Record<string, string> = {};
    const req = (k: keyof FormState & string) => {
      if (!String(o[k] || '').trim()) er[k] = 'Campo obligatorio.';
    };
    (['pb_nom', 'pb_ape', 'pb_dn', 'pb_dom', 'pb_tel', 'pb_mail', 'pb_bd', 'pb_det', 'pb_ped'] as const).forEach((k) => req(k));
    if (o.pb_dt === 'DNI' && o.pb_dn && !/^\d{8}$/.test(o.pb_dn)) er.pb_dn = 'El DNI tiene 8 dígitos.';
    if (o.pb_mail && !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(o.pb_mail)) er.pb_mail = 'Correo no válido.';
    if (o.pb_tel && !/^[\d\s+()-]{7,}$/.test(o.pb_tel)) er.pb_tel = 'Teléfono no válido.';
    if (o.menor) {
      req('pb_ap');
      req('pb_apd');
    }
    if (o.pb_mon && !(+o.pb_mon >= 0)) er.pb_mon = 'Monto no válido.';
    if (!o.tipo) er.pb_tipo = 'Elija reclamo o queja.';
    if (!o.acc) er.pb_acc = 'Debe aceptar la declaración.';
    setErr(er);
    const k0 = Object.keys(er)[0];
    if (k0) {
      const el = document.getElementById(k0) || document.querySelector<HTMLElement>(`input[name="${k0}"]`);
      el?.focus();
      toast('Revise el formulario', `${Object.keys(er).length} campos por corregir`, 'err');
      return;
    }
    RCOUNT[brand]++;
    const r: ReclX = {
      id: `${brand.toUpperCase()}-2026-${String(RCOUNT[brand]).padStart(6, '0')}`, brand, tipo: o.tipo as 'Reclamo' | 'Queja', det: o.pb_det.trim(), monto: +o.pb_mon || 0, pedido: o.pb_ped.trim(), date: TODAY, at: new Date(), st: 'Nuevo',
      nombre: `${o.pb_nom.trim()} ${o.pb_ape.trim()}`, docT: o.pb_dt, dni: o.pb_dn.trim(), dom: o.pb_dom.trim(), tel: o.pb_tel.trim(), mail: o.pb_mail.trim(), menor: o.menor, apod: o.pb_ap || '', apodDoc: o.pb_apd || '',
      bien: o.bien, bienDesc: o.pb_bd.trim(), cid: null, resp: '', test: true, origin: 'Vista pública (simulación)',
    };
    RECL.push(r);
    toast('Hoja de reclamación registrada', `${r.id} · marcada como prueba en el registro interno`);
    onCreated(r.id);
    refresh();
  };

  return (
    <form className="lr-form" noValidate onSubmit={submit}>
      <div className="lr-head">
        <MwLogo brand={brand} />
        <div>
          <h2 className="mw-h">Libro de Reclamaciones</h2>
          <small className="mw-mut">
            Hoja de reclamación virtual · {EMPRESA.rs} · RUC {EMPRESA.ruc}
          </small>
        </div>
        <span className="lr-date">Fecha: {fD(TODAY)}</span>
      </div>
      <fieldset>
        <legend>1. Identificación del consumidor reclamante</legend>
        <div className="form-grid">
          {F('pb_nom', 'Nombres *', I('pb_nom'))}
          {F('pb_ape', 'Apellidos *', I('pb_ape'))}
          {F(
            'pb_dt',
            'Tipo de documento',
            <select className="select" id="pb_dt" value={f.pb_dt} onChange={(e) => set('pb_dt', e.target.value)}>
              <option>DNI</option>
              <option>Carné de extranjería</option>
              <option>Pasaporte</option>
            </select>,
          )}
          {F('pb_dn', 'Número de documento *', I('pb_dn', 'text', '8 dígitos para DNI'))}
          {F('pb_dom', 'Domicilio *', I('pb_dom'), true)}
          {F('pb_tel', 'Teléfono *', I('pb_tel', 'tel'))}
          {F('pb_mail', 'Correo electrónico *', I('pb_mail', 'email'))}
          <label className="check full">
            <input type="checkbox" id="pb_men" checked={f.menor} onChange={(e) => set('menor', e.target.checked)} />
            Soy menor de edad
          </label>
          {f.menor ? (
            <>
              {F('pb_ap', 'Nombre del padre, madre o apoderado *', I('pb_ap'))}
              {F('pb_apd', 'Documento del apoderado *', I('pb_apd'))}
            </>
          ) : null}
        </div>
      </fieldset>
      <fieldset>
        <legend>2. Identificación del bien contratado</legend>
        <div className="form-grid">
          <div className="field" role="radiogroup" aria-label="Tipo de bien">
            Tipo
            <div className="lr-radios">
              {['Producto', 'Servicio'].map((v) => (
                <label key={v} className="check">
                  <input type="radio" name="pb_bien" value={v} checked={f.bien === v} onChange={() => set('bien', v)} />
                  {v}
                </label>
              ))}
            </div>
          </div>
          {F('pb_mon', 'Monto reclamado (S/)', <input className="input" id="pb_mon" type="number" min={0} step="0.01" value={f.pb_mon} onChange={(e) => set('pb_mon', e.target.value)} />)}
          {F('pb_bd', 'Descripción del servicio *', I('pb_bd', 'text', 'Ej. Hosting Pyme, dominio .pe'), true)}
        </div>
      </fieldset>
      <fieldset>
        <legend>3. Detalle de la reclamación y pedido del consumidor</legend>
        <div className="form-grid">
          <div className="field full" role="radiogroup" aria-label="Tipo de hoja" aria-describedby="pe_pb_tipo">
            Tipo *
            <div className="lr-radios">
              <label className="check">
                <input type="radio" name="pb_tipo" value="Reclamo" checked={f.tipo === 'Reclamo'} onChange={() => set('tipo', 'Reclamo')} />
                <span>
                  <b>Reclamo:</b> disconformidad relacionada con los productos o servicios.
                </span>
              </label>
              <label className="check">
                <input type="radio" name="pb_tipo" value="Queja" checked={f.tipo === 'Queja'} onChange={() => set('tipo', 'Queja')} />
                <span>
                  <b>Queja:</b> disconformidad no relacionada con los productos o servicios, o malestar respecto a la atención.
                </span>
              </label>
            </div>
            <span className="err" id="pe_pb_tipo">
              {err.pb_tipo || ''}
            </span>
          </div>
          {F('pb_det', 'Detalle *', <textarea className="input" id="pb_det" rows={3} value={f.pb_det} onChange={(e) => set('pb_det', e.target.value)} />, true)}
          {F('pb_ped', 'Pedido *', <textarea className="input" id="pb_ped" rows={2} value={f.pb_ped} onChange={(e) => set('pb_ped', e.target.value)} />, true)}
        </div>
      </fieldset>
      <label className="check">
        <input type="checkbox" id="pb_acc" checked={f.acc} onChange={(e) => set('acc', e.target.checked)} aria-describedby="pe_pb_acc" />
        <span>Declaro que los datos consignados son verdaderos y acepto el tratamiento de mis datos para atender esta hoja. *</span>
      </label>
      <span className="err" id="pe_pb_acc">
        {err.pb_acc || ''}
      </span>
      <p className="mw-mut lr-legal">
        La formulación del reclamo no impide acudir a otras vías de solución de controversias ni es requisito previo para interponer una denuncia ante el INDECOPI. El proveedor deberá dar respuesta en un plazo no mayor a {reclCfg.plazo} días {reclCfg.unit}.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="submit" className={`${mwBtnCls(brand)} lr-send`}>
          Enviar hoja de reclamación
        </button>
        <button
          type="button"
          className="mw-b o"
          onClick={() => {
            setF((o) => ({ ...o, ...SAMPLE }));
            setErr({});
          }}
        >
          Autocompletar ejemplo
        </button>
      </div>
    </form>
  );
}

export function PubDoc({ r, onNew, onSeeInternal }: { r: ReclX; onNew: () => void; onSeeInternal: () => void }) {
  const { fakeDownload } = useActions();
  return (
    <article className="lr-doc">
      <div className="lr-head">
        <MwLogo brand={r.brand} />
        <div>
          <h2 className="mw-h">Hoja de reclamación N.° {r.id}</h2>
          <small className="mw-mut">
            {EMPRESA.rs} · RUC {EMPRESA.ruc} · {EMPRESA.dir}
          </small>
        </div>
        <span className="lr-date">
          {fD(r.date)} {fT(r.at || NOW)}
        </span>
      </div>
      <table className="lr-tbl">
        <tbody>
          <tr>
            <th colSpan={2}>1. Identificación del consumidor</th>
          </tr>
          <tr>
            <td>Nombre</td>
            <td>{r.nombre}</td>
          </tr>
          <tr>
            <td>Documento</td>
            <td>
              {r.docT} {r.dni}
            </td>
          </tr>
          <tr>
            <td>Domicilio</td>
            <td>{r.dom}</td>
          </tr>
          <tr>
            <td>Teléfono · correo</td>
            <td>
              {r.tel} · {r.mail}
            </td>
          </tr>
          {r.menor ? (
            <tr>
              <td>Apoderado</td>
              <td>
                {r.apod} · {r.apodDoc}
              </td>
            </tr>
          ) : null}
          <tr>
            <th colSpan={2}>2. Bien contratado</th>
          </tr>
          <tr>
            <td>Tipo</td>
            <td>{r.bien}</td>
          </tr>
          <tr>
            <td>Monto reclamado</td>
            <td>{r.monto ? moneyRaw(r.monto, 'PEN') : '—'}</td>
          </tr>
          <tr>
            <td>Descripción</td>
            <td>{r.bienDesc}</td>
          </tr>
          <tr>
            <th colSpan={2}>3. Detalle</th>
          </tr>
          <tr>
            <td>Tipo</td>
            <td>{r.tipo}</td>
          </tr>
          <tr>
            <td>Detalle</td>
            <td>{r.det}</td>
          </tr>
          <tr>
            <td>Pedido</td>
            <td>{r.pedido}</td>
          </tr>
          <tr>
            <th colSpan={2}>4. Observaciones y acciones del proveedor</th>
          </tr>
          <tr>
            <td colSpan={2} className="mw-mut">
              Pendiente · plazo de respuesta hasta el {fD(reclDue(r))}
            </td>
          </tr>
        </tbody>
      </table>
      <div className="lr-ok" role="status">
        ✓ Enviamos una constancia de esta hoja a <b>{r.mail}</b>. Conserve el número {r.id} para su seguimiento.
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="mw-b o" onClick={() => fakeDownload(r.id)}>
          Descargar constancia (PDF)
        </button>
        <button type="button" className="mw-b o" onClick={onNew}>
          Registrar otra hoja
        </button>
        <button type="button" className={mwBtnCls(r.brand)} onClick={onSeeInternal}>
          Ver en el registro interno
        </button>
      </div>
    </article>
  );
}
