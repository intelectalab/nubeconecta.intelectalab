/**
 * Vista «contratos» (#contratos y #contratos/<pestaña>) — vContratos del
 * prototipo (l.2772) con el editor enriquecido de l.3136-3146: contratos
 * (borradores editables, envío para firma, renovación), plantillas y cláusulas.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ClientDatalist, useActions } from '../../app/actions';
import { useApp } from '../../app/context';
import { useViewState } from '../../app/storage';
import type { ViewProps } from '../../app/routes';
import { Icon } from '../../components/Icon';
import { Sheet } from '../../components/Modal';
import { Chip, ClientLink, DayChip, EmptyState, PageHead, Tabs } from '../../components/ui';
import { addD, CBY, CLAUSES, CONTRACTS, CTPL, diffD, fD, findClient, inBrand, TODAY } from '../../data';
import type { Contract } from '../../data';
import { clHtml, CL_HTML, ctDoc, ctHtml, DEFAULT_INTRO, TPL_INTRO } from './comercial/contractsData';
import { fillVars, html2txt, RichOut, RichText, type RteHandle } from './comercial/RichText';

type CtTab = 'contratos' | 'plantillas' | 'clausulas';
const TABS: CtTab[] = ['contratos', 'plantillas', 'clausulas'];
type Open = { k: 'ct'; id: string } | { k: 'tpl'; id: string } | { k: 'cl'; id: string } | null;
const tplName = (id: string) => (CTPL.find((t) => t.id === id) || CTPL[0]).n;
const newId = () => 'CT-2026-' + String(31 + CONTRACTS.length).padStart(3, '0');

export default function ContratosView({ param }: ViewProps) {
  const { brand, dataVersion, navSeq, dialogs, toast, refresh } = useApp();
  const [tab, setTab] = useViewState<CtTab>('ct.tab', 'contratos');
  const [open, setOpen] = useState<Open>(null);
  useEffect(() => {
    if (param && (TABS as string[]).includes(param)) setTab(param as CtTab);
    else if (param && CONTRACTS.some((c) => c.id === param)) {
      setTab('contratos');
      setOpen({ k: 'ct', id: param });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [param, navSeq]);

  const list = useMemo(() => CONTRACTS.filter((c) => inBrand(brand, c.cid)), [brand, dataVersion]);
  const clauseKeys = Object.keys(CLAUSES);

  const ctNew = (tp: string) =>
    dialogs.form({
      title: 'Nuevo contrato',
      fields: [
        { id: 'c', label: 'Cliente', req: true, full: true, ph: 'Escriba para buscar…', list: 'dlClients' },
        { id: 't', label: 'Plantilla', type: 'select', options: CTPL.map((t) => [t.id, t.n] as [string, string]), value: tp, full: true },
      ],
      validate: (v) => (findClient(v.c) ? null : 'Seleccione un cliente existente.'),
      submit: 'Crear borrador',
      onSubmit: (v) => {
        const cl = findClient(v.c);
        if (!cl) return;
        const c: Contract = { id: newId(), cid: cl.id, tpl: v.t, st: 'Borrador', date: TODAY, end: addD(TODAY, 365), body: null };
        CONTRACTS.unshift(c);
        setTab('contratos');
        refresh();
        window.setTimeout(() => setOpen({ k: 'ct', id: c.id }), 60);
      },
    });
  const ctRenew = (c: Contract) =>
    dialogs.confirm({
      title: 'Renovar contrato',
      body: <p style={{ margin: 0 }}>Se creará un borrador nuevo a partir de {c.id} con vigencia desde hoy.</p>,
      okLabel: 'Crear borrador',
      onOk: () => {
        CONTRACTS.unshift({ id: newId(), cid: c.cid, tpl: c.tpl, st: 'Borrador', date: TODAY, end: addD(TODAY, 365), body: null });
        toast('Borrador de renovación creado', '');
        refresh();
      },
    });

  let body;
  if (tab === 'contratos')
    body = list.length ? (
      <div className="tw">
        <table className="t">
          <thead>
            <tr>
              <th>Código</th>
              <th>Cliente</th>
              <th>Plantilla</th>
              <th>Firmado / creado</th>
              <th>Vence</th>
              <th>Estado</th>
              <th className="r">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.id}>
                <td className="mono strong">{c.id}</td>
                <td>
                  <ClientLink cid={c.cid} />
                </td>
                <td>{tplName(c.tpl)}</td>
                <td className="num">{fD(c.date)}</td>
                <td className="nw num">
                  {fD(c.end)} {c.st === 'Firmado' ? <DayChip n={diffD(c.end, TODAY)} /> : null}
                </td>
                <td>
                  <Chip kind={c.st === 'Firmado' ? 'ok' : c.st === 'Borrador' ? 'outline' : c.st === 'Vencido' ? 'danger' : 'info'}>{c.st}</Chip>
                </td>
                <td className="r nw">
                  {c.st === 'Borrador' ? (
                    <button type="button" className="btn sm primary" onClick={() => setOpen({ k: 'ct', id: c.id })}>
                      <Icon name="edit" size="sm" />
                      Editar borrador
                    </button>
                  ) : (
                    <button type="button" className="btn sm" onClick={() => setOpen({ k: 'ct', id: c.id })}>
                      <Icon name="eye" size="sm" />
                      Ver
                    </button>
                  )}
                  {c.st === 'Vencido' ? (
                    <>
                      {' '}
                      <button type="button" className="btn sm" onClick={() => ctRenew(c)}>
                        Renovar
                      </button>
                    </>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <EmptyState title="Sin contratos" text="No hay contratos para la marca seleccionada." />
    );
  else if (tab === 'plantillas')
    body = (
      <div className="tw">
        <table className="t">
          <thead>
            <tr>
              <th>Plantilla</th>
              <th>Cláusulas</th>
              <th className="r">En uso</th>
              <th className="r" />
            </tr>
          </thead>
          <tbody>
            {CTPL.map((t) => (
              <tr key={t.id}>
                <td className="strong">
                  <Icon name="contract" size="sm" /> {t.n}
                </td>
                <td className="sub" style={{ minWidth: 260 }}>
                  {t.cl.map((k) => CLAUSES[k][0]).join(' · ')}
                </td>
                <td className="r num">{CONTRACTS.filter((c) => c.tpl === t.id).length}</td>
                <td className="r nw">
                  <button type="button" className="btn sm" onClick={() => setOpen({ k: 'tpl', id: t.id })}>
                    <Icon name="edit" size="sm" />
                    Editar plantilla
                  </button>{' '}
                  <button type="button" className="btn sm" onClick={() => ctNew(t.id)}>
                    <Icon name="plus" size="sm" />
                    Nuevo contrato
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  else
    body = (
      <div className="card-b" style={{ paddingTop: 14, display: 'grid', gap: 10 }}>
        {clauseKeys.map((k) => {
          const c = CLAUSES[k];
          return (
            <article className="clause" key={k}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <b>{c[0]}</b>
                <Chip kind="outline">{c[1]}</Chip>
              </div>
              {CL_HTML[k] ? <RichOut html={CL_HTML[k]} /> : <p>{c[2]}</p>}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <small className="sub" style={{ color: 'var(--muted)' }}>
                  Usada en {CTPL.filter((t) => t.cl.includes(k)).length} plantillas
                </small>
                <button type="button" className="btn sm" onClick={() => setOpen({ k: 'cl', id: k })}>
                  <Icon name="edit" size="sm" />
                  Editar cláusula
                </button>
              </div>
            </article>
          );
        })}
      </div>
    );

  const close = () => setOpen(null);
  const ct = open?.k === 'ct' ? CONTRACTS.find((c) => c.id === open.id) : undefined;

  return (
    <>
      <ClientDatalist />
      <PageHead
        crumbs={[['Comercial', 'contratos'], ['Contratos']]}
        title="Contratos"
        sub="Plantillas con cláusulas reutilizables, borradores editables y estado de firma."
        actions={
          <button type="button" className="btn primary" onClick={() => ctNew('PL-01')}>
            <Icon name="plus" size="sm" />
            Nuevo contrato
          </button>
        }
      />
      <section className="card">
        <Tabs<CtTab>
          label="Secciones"
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'contratos', label: 'Contratos', count: list.length },
            { id: 'plantillas', label: 'Plantillas', count: CTPL.length },
            { id: 'clausulas', label: 'Cláusulas', count: clauseKeys.length },
          ]}
        />
        {body}
      </section>
      {ct ? <ContractSheet key={ct.id} c={ct} onClose={close} /> : null}
      {open?.k === 'tpl' ? <TemplateSheet key={open.id} id={open.id} onClose={close} /> : null}
      {open?.k === 'cl' ? <ClauseSheet key={open.id} k={open.id} onClose={close} /> : null}
    </>
  );
}

/* =================== Panel: contrato / borrador =================== */
function ContractSheet({ c, onClose }: { c: Contract; onClose: () => void }) {
  const { dialogs, toast, refresh } = useApp();
  const { fakeDownload } = useActions();
  const ed = useRef<RteHandle>(null);
  const doc = ctDoc(c.id, c.tpl);
  const [sel, setSel] = useState<string[]>(() => doc.sel.slice());
  const ro = c.st !== 'Borrador';
  const cl = CBY[c.cid];
  const tpl = CTPL.find((t) => t.id === c.tpl) || CTPL[0];

  const regen = () => {
    const s = Object.keys(CLAUSES).filter((k) => sel.includes(k));
    if (!s.length) {
      toast('Elija al menos una cláusula', '', 'err');
      return;
    }
    doc.sel = s;
    ed.current?.set(ctHtml(c.tpl, s));
    toast('Texto regenerado', `${s.length} cláusulas`, 'info');
  };
  const saveDraft = () => {
    doc.html = ed.current?.get() || doc.html;
    doc.sel = sel;
    onClose();
    toast('Borrador guardado', c.id);
  };
  const sendSign = () => {
    const h = ed.current?.get() || doc.html;
    doc.html = h;
    doc.sel = sel;
    if (html2txt(h).length < 200) {
      toast('El contrato parece incompleto', 'Revise el texto antes de enviarlo.', 'err');
      return;
    }
    onClose();
    dialogs.confirm({
      title: 'Enviar para firma',
      body: (
        <p style={{ margin: 0 }}>
          Se enviará {c.id} a {cl?.contact} ({cl?.email}) para firma electrónica.
        </p>
      ),
      okLabel: 'Enviar',
      onOk: () => {
        c.st = 'Enviado para firma';
        toast('Enviado para firma', c.id);
        refresh();
      },
    });
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={`${c.id} · ${ro ? 'Contrato' : 'Borrador'}`}
      sub={`${cl?.name || c.cid} · ${tpl.n}`}
      footer={
        ro ? (
          <>
            <button type="button" className="btn" onClick={() => fakeDownload(c.id)}>
              <Icon name="download" size="sm" />
              PDF
            </button>
            <button type="button" className="btn" onClick={onClose}>
              Cerrar
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn" onClick={onClose}>
              Cancelar
            </button>
            <button type="button" className="btn" onClick={saveDraft}>
              Guardar borrador
            </button>
            <button type="button" className="btn primary" onClick={sendSign}>
              <Icon name="send" size="sm" />
              Enviar para firma
            </button>
          </>
        )
      }
    >
      <div style={{ display: 'grid', gap: 12 }}>
        {ro ? (
          <>
            <div className="note">
              <Icon name="lock" size="sm" />
              <span>Estado «{c.st}»: el texto no se puede editar. Para cambios, cree una adenda.</span>
            </div>
            <div className="doc-view" dangerouslySetInnerHTML={{ __html: fillVars(doc.html, { 'cliente.nombre': cl?.name || '', 'cliente.ruc': (cl?.doc || '').replace(/\D/g, '') }) }} />
          </>
        ) : (
          <>
            <fieldset className="fset">
              <legend>Cláusulas incluidas</legend>
              {Object.entries(CLAUSES).map(([k, x]) => (
                <label className="check" key={k}>
                  <input type="checkbox" checked={sel.includes(k)} onChange={(e) => setSel((s) => (e.target.checked ? [...s, k] : s.filter((y) => y !== k)))} />
                  {x[0]}
                </label>
              ))}
              <button type="button" className="btn sm" style={{ justifySelf: 'start' }} onClick={regen}>
                <Icon name="refresh" size="sm" />
                Regenerar texto desde cláusulas
              </button>
            </fieldset>
            <RichText ref={ed} initial={doc.html} label="Texto del contrato" min={340} />
          </>
        )}
      </div>
    </Sheet>
  );
}

/* =================== Panel: plantilla =================== */
function TemplateSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const { toast, refresh } = useApp();
  const t = CTPL.find((x) => x.id === id) || CTPL[0];
  const ed = useRef<RteHandle>(null);
  const [n, setN] = useState(t.n);
  const [cl, setCl] = useState<string[]>(() => t.cl.slice());
  const [err, setErr] = useState('');
  const save = () => {
    const keys = Object.keys(CLAUSES).filter((k) => cl.includes(k));
    if (!n.trim()) {
      setErr('Ingrese el nombre.');
      return;
    }
    if (!keys.length) {
      toast('Elija al menos una cláusula', '', 'err');
      return;
    }
    t.n = n.trim();
    t.cl = keys;
    TPL_INTRO[t.id] = ed.current?.get() || TPL_INTRO[t.id] || DEFAULT_INTRO;
    onClose();
    toast('Plantilla guardada', `${t.n} · ${keys.length} cláusulas`);
    refresh();
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title="Editar plantilla"
      sub={t.n}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn primary" onClick={save}>
            <Icon name="check" size="sm" />
            Guardar plantilla
          </button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: 12 }}>
        <label className="field full">
          Nombre
          <input
            className="input"
            value={n}
            aria-invalid={!!err}
            onChange={(e) => {
              setN(e.target.value);
              setErr('');
            }}
          />
          <span className="err">{err}</span>
        </label>
        <fieldset className="fset">
          <legend>Cláusulas de la plantilla (en orden)</legend>
          {Object.entries(CLAUSES).map(([k, x]) => (
            <label className="check" key={k}>
              <input type="checkbox" checked={cl.includes(k)} onChange={(e) => setCl((s) => (e.target.checked ? [...s, k] : s.filter((y) => y !== k)))} />
              {x[0]}
            </label>
          ))}
        </fieldset>
        <div className="field">
          Encabezado e introducción
          <RichText ref={ed} initial={TPL_INTRO[t.id] || DEFAULT_INTRO} label="Introducción de la plantilla" min={120} />
        </div>
      </div>
    </Sheet>
  );
}

/* =================== Panel: cláusula =================== */
function ClauseSheet({ k, onClose }: { k: string; onClose: () => void }) {
  const { toast, refresh } = useApp();
  const c = CLAUSES[k];
  const ed = useRef<RteHandle>(null);
  const [n, setN] = useState(c[0]);
  const [cat, setCat] = useState(c[1]);
  const save = () => {
    const h = ed.current?.get() || '';
    if (html2txt(h).length < 10) {
      toast('La cláusula está vacía', '', 'err');
      return;
    }
    c[0] = n.trim() || c[0];
    c[1] = cat;
    CL_HTML[k] = h;
    c[2] = html2txt(h);
    onClose();
    toast('Cláusula guardada', c[0]);
    refresh();
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title="Editar cláusula"
      sub={c[0]}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn primary" onClick={save}>
            <Icon name="check" size="sm" />
            Guardar cláusula
          </button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: 12 }}>
        <div className="form-grid">
          <label className="field">
            Nombre
            <input className="input" value={n} onChange={(e) => setN(e.target.value)} />
          </label>
          <label className="field">
            Categoría
            <select className="select" value={cat} onChange={(e) => setCat(e.target.value)}>
              {['General', 'Económica', 'Técnica', 'Legal'].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
        </div>
        <RichText ref={ed} initial={clHtml(k)} label="Texto de la cláusula" min={180} />
        <div className="note">
          <Icon name="info" size="sm" />
          <span>Se usa en {CTPL.filter((t) => t.cl.includes(k)).length} plantillas. Los contratos ya firmados no cambian.</span>
        </div>
      </div>
    </Sheet>
  );
}
