/**
 * Vista «plantillas» (#plantillas) — Plantillas de correo (prototipo vPlantillas l.3178).
 * Pestañas: «Correos y avisos» (MAILT: asunto, cuerpo enriquecido, vista previa por marca,
 * guardar con validación de variables y envío de prueba) y «Respuestas predefinidas»
 * (CANNED, usadas en el detalle de cada ticket).
 */
import { useRef, useState } from 'react';
import { useApp } from '../../app/context';
import { useViewState } from '../../app/storage';
import type { ViewProps } from '../../app/routes';
import { Icon } from '../../components/Icon';
import { Field, PageHead, Tabs } from '../../components/ui';
import { BRANDS, BR, type BrandId } from '../../data';
import { RichText, VARS, html2txt, type RteHandle } from './soporte/RichText';
import { CANNED, MAILT, MailPreview, cannedHtml, setCannedHtml, type MailTpl } from './soporte/shared';

type Tab = 'correos' | 'respuestas';

export default function PlantillasView({ param }: ViewProps) {
  const { dataVersion } = useApp();
  const [tab, setTab] = useViewState<Tab>('mt.tab', param === 'respuestas' ? 'respuestas' : 'correos');
  const [sel, setSel] = useViewState<string>('mt.sel', 'rec30');
  const [mtBrand, setMtBrand] = useViewState<BrandId>('mt.brand', 'ap');
  const [cnSel, setCnSel] = useViewState<number>('mt.cnSel', 0);
  const t = MAILT.find((x) => x.id === sel) || MAILT[0];
  const ci = CANNED[cnSel] ? cnSel : 0;

  const focusNav = (attr: string, v: string | number) => window.setTimeout(() => document.querySelector<HTMLButtonElement>(`[${attr}="${v}"]`)?.focus(), 0);

  return (
    <>
      <PageHead
        crumbs={[['Configuración', 'ajustes'], ['Plantillas de correo', 'plantillas']]}
        title="Plantillas de correo"
        sub="Correos automáticos de cobranza y eventos del sistema, y respuestas predefinidas de soporte. Use variables {{…}}."
      />
      <section className="card">
        <Tabs<Tab>
          label="Secciones"
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'correos', label: 'Correos y avisos', count: MAILT.length },
            { id: 'respuestas', label: 'Respuestas predefinidas', count: CANNED.length },
          ]}
        />
        {tab === 'correos' ? (
          <div className="mt-l">
            <nav className="tk-filters" aria-label="Plantillas">
              <ul>
                {MAILT.map((x) => (
                  <li key={x.id}>
                    <button
                      type="button"
                      data-mt={x.id}
                      aria-current={x.id === t.id}
                      onClick={() => {
                        setSel(x.id);
                        focusNav('data-mt', x.id);
                      }}
                    >
                      <span>{x.n}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
            <MailEditor key={`${t.id}-${dataVersion}`} t={t} brand={mtBrand} setBrand={setMtBrand} />
          </div>
        ) : (
          <div className="mt-l">
            <nav className="tk-filters" aria-label="Respuestas">
              <ul>
                {CANNED.map((x, k) => (
                  <li key={k}>
                    <button
                      type="button"
                      data-cn={k}
                      aria-current={k === ci}
                      onClick={() => {
                        setCnSel(k);
                        focusNav('data-cn', k);
                      }}
                    >
                      <span>{x[0]}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <div style={{ padding: 10 }}>
                <NewCannedButton onCreated={(k) => setCnSel(k)} />
              </div>
            </nav>
            <CannedEditor key={`${ci}-${CANNED.length}-${dataVersion}`} k={ci} onDeleted={() => setCnSel(0)} />
          </div>
        )}
      </section>
    </>
  );
}

/* ---------- Correos y avisos ---------- */
function MailEditor({ t, brand, setBrand }: { t: MailTpl; brand: BrandId; setBrand: (b: BrandId) => void }) {
  const { toast, refresh, dialogs } = useApp();
  const ed = useRef<RteHandle>(null);
  const [n, setN] = useState(t.n);
  const [subj, setSubj] = useState(t.subj);
  const [html, setHtml] = useState(t.html);

  const save = () => {
    const h = ed.current?.get() ?? html;
    if (!subj.trim()) {
      toast('El asunto es obligatorio', '', 'err');
      document.getElementById('mtS')?.focus();
      return;
    }
    if (html2txt(h).length < 5) {
      toast('El cuerpo está vacío', '', 'err');
      return;
    }
    const bad = ((h + subj).match(/\{\{\s*([a-z.]+)\s*\}\}/g) || []).filter((v) => !VARS.some((x) => v.includes(x[0])));
    if (bad.length) {
      toast('Variable desconocida', bad.join(', '), 'err');
      return;
    }
    Object.assign(t, { n: n.trim() || t.n, subj, html: h });
    toast('Plantilla guardada', t.n);
    refresh();
  };
  const test = () =>
    dialogs.form({
      title: 'Enviar correo de prueba',
      sub: t.n,
      fields: [{ id: 'm', label: 'Enviar a', type: 'email', value: 'renzo.vargas@alojamientoplus.pe', req: true, full: true }],
      validate: (v) => (/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(v.m) ? null : 'Correo no válido.'),
      submit: 'Enviar',
      onSubmit: (v) => toast('Prueba enviada', `${v.m} · con datos de ejemplo y marca ${BR[brand].n}`),
    });

  return (
    <div className="card-b" style={{ paddingTop: 14, display: 'grid', gap: 12, minWidth: 0 }}>
      <div className="form-grid">
        <Field label="Nombre">
          <input className="input" id="mtN" value={n} onChange={(e) => setN(e.target.value)} />
        </Field>
        <Field label="Evento que la dispara" hint="según la secuencia de cobranza y eventos del sistema">
          <input className="input" id="mtE" value={t.ev} readOnly />
        </Field>
        <Field label="Asunto" full>
          <input className="input" id="mtS" value={subj} onChange={(e) => setSubj(e.target.value)} />
        </Field>
      </div>
      <RichText ref={ed} initial={t.html} label="Cuerpo del correo" min={200} onChange={setHtml} />
      <div className="grid g-2e">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <button type="button" className="btn primary" onClick={save}>
            <Icon name="check" size="sm" />
            Guardar plantilla
          </button>
          <button type="button" className="btn" onClick={test}>
            <Icon name="send" size="sm" />
            Enviar prueba
          </button>
        </div>
        <label className="field">
          Vista previa con la marca
          <select className="select" value={brand} onChange={(e) => setBrand(e.target.value as BrandId)}>
            {BRANDS.map((b) => (
              <option key={b.id} value={b.id}>
                {b.n}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div aria-live="polite" aria-label="Vista previa del correo">
        <MailPreview subj={subj} html={html} brand={brand} />
      </div>
    </div>
  );
}

/* ---------- Respuestas predefinidas ---------- */
function NewCannedButton({ onCreated }: { onCreated: (k: number) => void }) {
  const { refresh } = useApp();
  return (
    <button
      type="button"
      className="btn sm"
      onClick={() => {
        const c: [string, string] = ['Nueva respuesta', ''];
        CANNED.push(c);
        setCannedHtml(c, '<p>Hola {{cliente.contacto}}, </p>');
        c[1] = html2txt('<p>Hola {{cliente.contacto}}, </p>');
        onCreated(CANNED.length - 1);
        refresh();
        window.setTimeout(() => {
          const el = document.getElementById('cnN') as HTMLInputElement | null;
          el?.focus();
          el?.select();
        }, 50);
      }}
    >
      <Icon name="plus" size="sm" />
      Nueva respuesta
    </button>
  );
}

function CannedEditor({ k, onDeleted }: { k: number; onDeleted: () => void }) {
  const { toast, refresh, dialogs } = useApp();
  const c = CANNED[k];
  const ed = useRef<RteHandle>(null);
  const [n, setN] = useState(c ? c[0] : '');
  if (!c) return null;

  const save = () => {
    const h = ed.current?.get() || '';
    if (!n.trim() || html2txt(h).length < 3) {
      toast('Complete el nombre y el texto', '', 'err');
      return;
    }
    c[0] = n.trim();
    c[1] = html2txt(h);
    setCannedHtml(c, h);
    toast('Respuesta guardada', c[0]);
    refresh();
  };
  const del = () =>
    dialogs.confirm({
      title: 'Eliminar respuesta',
      body: <p style={{ margin: 0 }}>Se eliminará «{c[0]}».</p>,
      okLabel: 'Eliminar',
      danger: true,
      onOk: () => {
        CANNED.splice(k, 1);
        onDeleted();
        toast('Respuesta eliminada', c[0], 'warn');
        refresh();
      },
    });

  return (
    <div className="card-b" style={{ paddingTop: 14, display: 'grid', gap: 12, minWidth: 0 }}>
      <Field label="Nombre">
        <input className="input" id="cnN" value={n} onChange={(e) => setN(e.target.value)} />
      </Field>
      <RichText ref={ed} initial={cannedHtml(c)} label="Texto de la respuesta" min={180} mini />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn primary" onClick={save}>
          <Icon name="check" size="sm" />
          Guardar respuesta
        </button>
        <button type="button" className="btn danger" onClick={del} disabled={CANNED.length <= 1}>
          <Icon name="trash" size="sm" />
          Eliminar
        </button>
      </div>
      <p className="sub" style={{ margin: 0, fontSize: 12.5, color: 'var(--muted)' }}>
        Disponible en el selector «Respuesta predefinida…» del detalle de cada ticket.
      </p>
    </div>
  );
}
