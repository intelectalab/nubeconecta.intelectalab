/**
 * WordPress › Contacto por marca y Documentos legales (prototipo vWp,
 * pestañas «contacto» y «legales»; handlers ctF, ctSave, lgEdit, lgPub;
 * l.2487-2490 y l.2513-2518).
 */
import { useState } from 'react';
import { useApp } from '../../../app/context';
import { Icon } from '../../../components/Icon';
import { Sheet } from '../../../components/Modal';
import { Chip, Note } from '../../../components/ui';
import { BR, BRANDS, CONTACT, LEGAL, NF0, TODAY, addD, diffD, fD, fromIso, iso, type BrandContact, type BrandId, type LegalDoc } from '../../../data';
import { ContactPreview, MwFrame } from './previews';
import { ScBox, SoonNote, copyText } from './shared';

const BRAND_OPTS = BRANDS.map((b) => (
  <option key={b.id} value={b.id}>
    {b.n}
  </option>
));

export function WpContacto({ brand, setBrand }: { brand: BrandId; setBrand: (b: BrandId) => void }) {
  const { toast, refresh } = useApp();
  const c = CONTACT[brand];
  const F = (k: keyof BrandContact, l: string) => (
    <label className={`field${k === 'dir' || k === 'hor' ? ' full' : ''}`} htmlFor={'ct_' + k} key={k}>
      {l}
      <input
        className="input"
        id={'ct_' + k}
        value={c[k]}
        onChange={(e) => {
          c[k] = e.target.value;
          refresh();
        }}
      />
    </label>
  );
  const save = () => {
    if (!/^\+?[\d\s()]{7,}$/.test(c.wa)) {
      toast('WhatsApp no válido', 'Use formato +51 9XX XXX XXX.', 'err');
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(c.mail)) {
      toast('Correo de ventas no válido', '', 'err');
      return;
    }
    if (c.mail2 && !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(c.mail2)) {
      toast('Correo de soporte no válido', '', 'err');
      return;
    }
    toast('Contacto guardado', `${BR[brand].n} · se actualizó en WordPress (caché invalidada)`);
  };
  return (
    <div className="card-b" style={{ paddingTop: 16 }}>
      <SoonNote>La edición de contacto por marca llegará con el backend; los datos mostrados son de ejemplo.</SoonNote>
      <div className="grid g-2">
        <div className="form-grid">
          <label className="field full" htmlFor="ctB">
            Marca
            <select id="ctB" className="select" value={brand} onChange={(e) => setBrand(e.target.value as BrandId)}>
              {BRAND_OPTS}
            </select>
          </label>
          {F('tel', 'Teléfono principal')}
          {F('tel2', 'Teléfono de soporte')}
          {F('mail', 'Correo de ventas')}
          {F('mail2', 'Correo de soporte')}
          {F('wa', 'WhatsApp')}
          {F('dir', 'Dirección')}
          {F('hor', 'Horario')}
          <div className="full">
            <button type="button" className="btn primary" onClick={save}>
              <Icon name="check" size="sm" />
              Guardar contacto
            </button>
          </div>
        </div>
        <div className="stack">
          <div>
            <h3 className="fs">Vista previa</h3>
            <MwFrame brand={brand}>
              <ContactPreview brand={brand} />
            </MwFrame>
          </div>
          <div className="field">
            Shortcode
            <ScBox code={`[hub_contacto marca="${brand}"]`} id="scCt" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function WpLegales({ brand, setBrand }: { brand: BrandId; setBrand: (b: BrandId) => void }) {
  const { toast, refresh, dialogs } = useApp();
  const [edit, setEdit] = useState<LegalDoc | null>(null);
  const [txt, setTxt] = useState('');
  const L2 = LEGAL[brand];

  const openEdit = (d: LegalDoc) => {
    setTxt(d.txt);
    setEdit(d);
  };
  const saveEdit = () => {
    if (!edit) return;
    if (txt.trim().length < 20) {
      toast('Contenido muy corto', 'El documento debe tener al menos 20 caracteres.', 'err');
      return;
    }
    edit.txt = txt;
    edit.st = 'Borrador pendiente';
    toast('Borrador guardado', edit.n);
    setEdit(null);
    refresh();
  };
  const publish = (d: LegalDoc) => {
    const [M, m] = d.v.slice(1).split('.').map(Number);
    dialogs.form({
      title: 'Publicar versión nueva',
      sub: `${d.n} · ${BR[brand].n}`,
      fields: [
        { id: 'v', label: 'Versión', value: `v${M}.${m + 1}` },
        { id: 'd', label: 'Vigente desde', type: 'date', value: iso(addD(TODAY, 15)), req: true },
        { id: 'a', label: 'Pedir aceptación a clientes', type: 'select', options: [['si', 'Sí, en el próximo ingreso al portal'], ['no', 'No (cambio menor)']], value: 'si' },
        { id: 'c', label: 'Resumen de cambios', type: 'textarea', full: true },
      ],
      submit: 'Publicar',
      validate: (v) => (!/^v\d+\.\d+$/.test(v.v) ? 'Formato de versión: v1.2' : diffD(fromIso(v.d), TODAY) < 0 ? 'La vigencia no puede ser anterior a hoy.' : d.hist.some((h) => h.v === v.v) || v.v === d.v ? 'Esa versión ya existe.' : null),
      onSubmit: (v) => {
        d.hist.unshift({ v: v.v, date: new Date() });
        d.v = v.v;
        d.vig = fromIso(v.d);
        d.st = 'Publicado';
        if (v.a === 'si') d.acc = 0;
        toast('Versión publicada', `${d.n} ${v.v} · ${v.a === 'si' ? '0 de ' + d.tot + ' clientes la aceptaron aún' : 'sin pedir aceptación'}`);
        refresh();
      },
    });
  };

  return (
    <>
      <div className="card-b" style={{ paddingTop: 16, paddingBottom: 0 }}><SoonNote>La edición y publicación de documentos legales llegará con el backend; los datos mostrados son de ejemplo.</SoonNote></div>
      <div className="toolbar">
        <label className="field" htmlFor="lgB">
          Marca
          <select id="lgB" className="select" value={brand} onChange={(e) => setBrand(e.target.value as BrandId)}>
            {BRAND_OPTS}
          </select>
        </label>
        <span className="count">Clientes activos de la marca: {L2[0].tot}</span>
      </div>
      <div className="tw">
        <table className="t">
          <thead>
            <tr>
              <th>Documento</th>
              <th>Versión</th>
              <th>Vigente desde</th>
              <th style={{ minWidth: 200 }}>Aceptación de la versión vigente</th>
              <th>Shortcode</th>
              <th className="r">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {L2.map((d) => {
              const p = d.tot ? Math.round((d.acc / d.tot) * 100) : 0;
              const code = `[hub_documento_legal doc="${d.id}" marca="${brand}"]`;
              return (
                <tr key={d.id}>
                  <td>
                    <b>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="contract" size="sm" />{d.n}</span>
                    </b>
                    {d.st !== 'Publicado' ? (
                      <>
                        {' '}
                        <Chip kind="warn">{d.st}</Chip>
                      </>
                    ) : null}
                  </td>
                  <td className="mono">{d.v}</td>
                  <td className="num">{fD(d.vig)}</td>
                  <td>
                    <div className="cap">
                      <div className="cap-top">
                        <span className="num">
                          <b>{NF0.format(d.acc)}</b> de {NF0.format(d.tot)} clientes
                        </span>
                        <span className="num">{p} %</span>
                      </div>
                      <div className="bar thin" role="img" aria-label={`${p} % de aceptación`}>
                        <i className={p >= 90 ? 'l1' : p >= 60 ? 'l2' : 'l3'} style={{ width: p + '%' }} />
                      </div>
                    </div>
                  </td>
                  <td>
                    <button type="button" className="btn sm ghost mono" title="Copiar shortcode" onClick={() => copyText(code, toast)}>
                      [hub_documento_legal doc="{d.id}"]
                    </button>
                  </td>
                  <td className="r nw">
                    <button type="button" className="btn sm" onClick={() => openEdit(d)}>
                      <Icon name="edit" size="sm" />
                      Editar
                    </button>{' '}
                    <button type="button" className="btn sm primary" onClick={() => publish(d)}>
                      <Icon name="upload" size="sm" />
                      Publicar versión nueva
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Sheet
        open={!!edit}
        onClose={() => setEdit(null)}
        title="Editar documento"
        sub={edit ? `${edit.n} · ${BR[brand].n} · ${edit.v}` : undefined}
        initialFocus="#lgTxt"
        footer={
          <>
            <button type="button" className="btn" onClick={() => setEdit(null)}>
              Cancelar
            </button>
            <button type="button" className="btn primary" onClick={saveEdit}>
              Guardar borrador
            </button>
          </>
        }
      >
        <label className="field" htmlFor="lgTxt">
          Contenido
          <textarea className="input" id="lgTxt" rows={16} value={txt} onChange={(e) => setTxt(e.target.value)} />
        </label>
        <Note>Se guarda como borrador. Publique una versión nueva para que entre en vigencia y se pida aceptación a los clientes.</Note>
      </Sheet>
    </>
  );
}
