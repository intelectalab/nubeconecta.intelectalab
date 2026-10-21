/**
 * Vista «cotizaciones» (#cotizaciones y #cotizaciones/<COT-id>) — vCotizaciones
 * y quoteEditor del prototipo (l.2741): listado con KPIs y editor de líneas
 * (cargos únicos y recurrentes) con historial de versiones, envío, aceptación
 * y conversión en pedido.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ClientDatalist } from '../../app/actions';
import { useApp, useMoney } from '../../app/context';
import type { ViewProps } from '../../app/routes';
import { Icon } from '../../components/Icon';
import { Chip, ClientLink, Crumbs, DayChip, EmptyState, PageHead, StatLine } from '../../components/ui';
import { addD, BR, diffD, fD, findClient, HPLANS, inBrand, ME, moneyRaw, ORDERS, QUOTES, TODAY, VPLANS } from '../../data';
import type { Quote, QuoteLine } from '../../data';
import { GENPROD, prodById } from './comercial/catalogData';

const qTot = (lines: QuoteLine[]) => {
  const u = lines.filter((l) => l.type === 'Único').reduce((a, l) => a + l.q * l.pu, 0);
  const r = lines.filter((l) => l.type === 'Recurrente').reduce((a, l) => a + (l.q * l.pu) / (l.cy === 'Anual' ? 12 : 1), 0);
  return { u, r, igv: u * 0.18, tot: u * 1.18 };
};
const last = (q: Quote) => q.vers[q.vers.length - 1];
const clone = (l: QuoteLine[]): QuoteLine[] => l.map((x) => ({ ...x }));
const same = (a: QuoteLine[], b: QuoteLine[]) => JSON.stringify(a) === JSON.stringify(b);
const OPEN_ST = ['Borrador', 'Enviada'];

function QSt({ s }: { s: string }) {
  return <Chip kind={s === 'Aceptada' ? 'ok' : s === 'Enviada' ? 'info' : s === 'Borrador' ? 'outline' : s === 'Rechazada' ? 'danger' : 'warn'}>{s}</Chip>;
}
const Party = ({ q }: { q: Quote }) => (q.cid ? <ClientLink cid={q.cid} /> : <>{q.to}</>);

export default function CotizacionesView({ param }: ViewProps) {
  const quote = param ? QUOTES.find((q) => q.id === param) : undefined;
  if (quote) return <QuoteEditor key={quote.id} q={quote} />;
  return <QuoteList missing={param} />;
}

/* =================== Listado =================== */
function QuoteList({ missing }: { missing: string | null }) {
  const { brand, dataVersion, navigate, dialogs, toast } = useApp();
  const m = useMoney();
  const warned = useRef<string | null>(null);
  useEffect(() => {
    if (missing && warned.current !== missing) {
      warned.current = missing;
      toast('Cotización no encontrada', missing, 'warn');
    }
  }, [missing, toast]);
  const list = useMemo(() => QUOTES.filter((q) => !q.cid || inBrand(brand, q.cid)), [brand, dataVersion]);
  const sent = list.filter((q) => q.st === 'Enviada');

  const qNew = () =>
    dialogs.form({
      title: 'Nueva cotización',
      fields: [
        { id: 'c', label: 'Cliente existente (opcional)', full: true, ph: 'Escriba para buscar…', list: 'dlClients' },
        { id: 'p', label: 'O prospecto', full: true, ph: 'Nombre de la empresa' },
        { id: 't', label: 'Asunto', req: true, full: true },
      ],
      validate: (v) => (!v.c && !v.p ? 'Indique un cliente o un prospecto.' : v.c && !findClient(v.c) ? 'Seleccione un cliente de la lista.' : null),
      submit: 'Crear',
      onSubmit: (v) => {
        const c = v.c ? findClient(v.c) : undefined;
        const q: Quote = {
          id: 'COT-2026-' + String(81 + QUOTES.length).padStart(4, '0'),
          cid: c ? c.id : null,
          to: c ? c.name : v.p + ' (prospecto)',
          title: v.t,
          exec: ME,
          st: 'Borrador',
          valid: addD(TODAY, 15),
          vers: [{ v: 1, date: TODAY, by: ME, lines: [{ type: 'Único', d: '', q: 1, pu: 0, cy: 'Mensual' }] }],
        };
        QUOTES.unshift(q);
        toast('Cotización creada', `${q.id} · borrador`);
        navigate('cotizaciones', q.id);
      },
    });

  return (
    <>
      <ClientDatalist />
      <PageHead
        crumbs={[['Comercial', 'cotizaciones'], ['Cotizaciones']]}
        title="Cotizaciones"
        sub="Propuestas con cargos únicos y recurrentes, con historial de versiones."
        actions={
          <button type="button" className="btn primary" onClick={qNew}>
            <Icon name="plus" size="sm" />
            Nueva cotización
          </button>
        }
      />
      <StatLine
        items={[
          { label: 'Abiertas', value: list.filter((q) => OPEN_ST.includes(q.st)).length },
          { label: 'Aceptadas (mes)', value: list.filter((q) => q.st === 'Aceptada').length, tone: 'ok' },
          { label: 'Valor único en curso', value: m.money(sent.reduce((a, q) => a + qTot(last(q).lines).u, 0), 'PEN', true) },
          { label: 'Recurrente mensual en curso', value: m.money(sent.reduce((a, q) => a + qTot(last(q).lines).r, 0), 'PEN', true) },
        ]}
      />
      <section className="card">
        {list.length ? (
          <div className="tw">
            <table className="t">
              <thead>
                <tr>
                  <th>N.°</th>
                  <th>Cliente / prospecto</th>
                  <th>Asunto</th>
                  <th className="r">Único</th>
                  <th className="r">Recurrente / mes</th>
                  <th>Versión</th>
                  <th>Validez</th>
                  <th>Estado</th>
                  <th className="r" />
                </tr>
              </thead>
              <tbody>
                {list.map((q) => {
                  const t = qTot(last(q).lines);
                  return (
                    <tr key={q.id}>
                      <td>
                        <a className="rowlink mono" href={`#cotizaciones/${q.id}`}>
                          {q.id}
                        </a>
                      </td>
                      <td>
                        <Party q={q} />
                      </td>
                      <td style={{ minWidth: 180 }}>
                        {q.title}
                        <div className="sub">{q.exec}</div>
                      </td>
                      <td className="r num">{m.money(t.u, 'PEN')}</td>
                      <td className="r num">{m.money(t.r, 'PEN')}</td>
                      <td className="mono">v{q.vers.length}</td>
                      <td className="nw num">
                        {fD(q.valid)} {OPEN_ST.includes(q.st) ? <DayChip n={diffD(q.valid, TODAY)} /> : null}
                      </td>
                      <td>
                        <QSt s={q.st} />
                      </td>
                      <td className="r">
                        <button type="button" className="btn sm" onClick={() => navigate('cotizaciones', q.id)}>
                          Abrir
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="Sin cotizaciones" text="No hay cotizaciones para la marca seleccionada." />
        )}
      </section>
    </>
  );
}

/* =================== Editor =================== */
function QuoteEditor({ q }: { q: Quote }) {
  const { navigate, dialogs, toast, refresh } = useApp();
  const [D, setD] = useState<QuoteLine[]>(() => clone(last(q).lines));
  const [focusLast, setFocusLast] = useState(false);
  const t = qTot(D);
  const ro = q.st === 'Aceptada' || q.st === 'Rechazada';
  const dirty = !same(D, last(q).lines);

  useEffect(() => {
    if (!focusLast) return;
    setFocusLast(false);
    const l = document.querySelectorAll<HTMLInputElement>('[data-f="d"]');
    l[l.length - 1]?.focus();
  }, [focusLast]);

  const upd = (k: number, f: keyof QuoteLine, v: string) =>
    setD((d) => d.map((l, i) => (i !== k ? l : { ...l, [f]: f === 'q' || f === 'pu' ? Math.max(0, +v || 0) : v })));
  const add = (type: string) => {
    setD((d) => [...d, { type, d: '', q: 1, pu: 0, cy: 'Mensual' }]);
    setFocusLast(true);
  };
  const pushVersion = () => q.vers.push({ v: q.vers.length + 1, date: TODAY, by: ME, lines: clone(D) });

  const saveVer = () => {
    if (D.some((l) => !l.d.trim() || !(l.pu > 0))) {
      toast('Revise las líneas', 'Todas necesitan descripción y precio mayor que 0.', 'err');
      return;
    }
    pushVersion();
    toast('Versión guardada', `${q.id} v${q.vers.length}`);
    refresh();
  };
  const load = (v: number) => {
    const ver = q.vers.find((x) => x.v === v);
    if (!ver) return;
    setD(clone(ver.lines));
    toast(`Versión ${v} cargada en el editor`, 'Guárdela como versión nueva para conservarla.', 'info');
  };
  const send = () =>
    dialogs.confirm({
      title: 'Enviar cotización',
      body: (
        <>
          <p style={{ margin: 0 }}>
            Se enviará la versión v{q.vers.length} (PDF + enlace de aceptación en el portal) a {q.to}.
          </p>
          {dirty ? (
            <div className="note warn" style={{ marginTop: 8 }}>
              <Icon name="tri" size="sm" />
              <span>Hay cambios sin guardar: se guardarán como v{q.vers.length + 1} antes de enviar.</span>
            </div>
          ) : null}
        </>
      ),
      okLabel: 'Enviar',
      onOk: () => {
        if (!same(D, last(q).lines)) pushVersion();
        q.st = 'Enviada';
        q.valid = addD(TODAY, 15);
        toast('Cotización enviada', `${q.id} v${q.vers.length}`);
        refresh();
      },
    });
  const accept = () => {
    q.st = 'Aceptada';
    toast('Cotización aceptada', q.id);
    refresh();
  };
  const toOrder = () => {
    const o = { id: 'PD-2026-' + String(430 + ORDERS.length), cid: q.cid || 'CL-1001', prod: q.title, orig: 'Cotización ' + q.id, pay: 'Pendiente', step: 0, err: null, at: new Date() };
    ORDERS.unshift(o);
    toast('Pedido creado', `${o.id} desde ${q.id}`);
    navigate('pedidos');
  };
  const fromCat = () => {
    const opts: [string, string][] = [
      ...HPLANS.filter((p) => p.active).map((p) => [p.id, `${p.name} (${BR[p.brand].n}) · S/ ${p.p.PEN.a}/año`] as [string, string]),
      ...VPLANS.map((v) => [v.id, `${v.name} · S/ ${v.p.m}/mes`] as [string, string]),
      ...GENPROD.map((g) => [g.id, `${g.name} · S/ ${g.price} ${g.cy.toLowerCase()}`] as [string, string]),
    ];
    dialogs.form({
      title: 'Agregar desde el catálogo',
      fields: [
        { id: 'p', label: 'Producto', type: 'select', options: opts, full: true, value: opts[0][0] },
        { id: 'q', label: 'Cantidad', type: 'number', min: 1, value: '1' },
      ],
      submit: 'Agregar',
      onSubmit: (v) => {
        const x = prodById(v.p);
        if (!x) return;
        const qty = +v.q || 1;
        let l: QuoteLine;
        if (x.kind === 'hp') l = { type: 'Recurrente', d: `Hosting ${x.x.name}`, q: qty, pu: x.x.p.PEN.a, cy: 'Anual' };
        else if (x.kind === 'vp') l = { type: 'Recurrente', d: x.x.name, q: qty, pu: x.x.p.m, cy: 'Mensual' };
        else l = { type: ['Único', 'Por hora'].includes(x.x.cy) ? 'Único' : 'Recurrente', d: x.x.name, q: qty, pu: x.x.price, cy: x.x.cy === 'Anual' ? 'Anual' : 'Mensual' };
        setD((d) => [...d, l]);
        toast('Línea agregada', l.d);
      },
    });
  };

  return (
    <>
      <Crumbs items={[['Comercial', 'cotizaciones'], ['Cotizaciones', 'cotizaciones'], [q.id]]} />
      <div className="phead">
        <div>
          <button type="button" className="btn sm ghost" style={{ marginBottom: 6 }} onClick={() => navigate('cotizaciones')}>
            <Icon name="cl" size="sm" />
            Volver
          </button>
          <h1 tabIndex={-1} id="ph1">
            {q.title}
          </h1>
          <p>
            <span className="mono">{q.id}</span> · <Party q={q} /> · {q.exec} · válida hasta {fD(q.valid)}
          </p>
        </div>
        <div className="acts">
          <QSt s={q.st} />
          {!ro ? (
            <>
              <button type="button" className="btn" onClick={saveVer}>
                <Icon name="layers" size="sm" />
                Guardar como v{q.vers.length + 1}
              </button>
              <button type="button" className="btn primary" onClick={send}>
                <Icon name="send" size="sm" />
                Enviar al cliente
              </button>
            </>
          ) : null}
          {q.st === 'Aceptada' ? (
            <button type="button" className="btn success" onClick={toOrder}>
              <Icon name="box" size="sm" />
              Convertir en pedido
            </button>
          ) : null}
          {q.st === 'Enviada' ? (
            <button type="button" className="btn" onClick={accept}>
              <Icon name="check" size="sm" />
              Marcar aceptada
            </button>
          ) : null}
        </div>
      </div>
      <div className="tk-detail">
        <section className="card" aria-label="Líneas de la cotización">
          <div className="tw">
            <table className="t qlines">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Descripción</th>
                  <th className="r">Cant.</th>
                  <th className="r">P. unit. (S/)</th>
                  <th>Ciclo</th>
                  <th className="r">Importe</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {D.map((l, k) => (
                  <tr key={k}>
                    <td>
                      <select className="select sm" disabled={ro} aria-label={`Tipo de la línea ${k + 1}`} style={{ width: 120 }} value={l.type} onChange={(e) => upd(k, 'type', e.target.value)}>
                        <option>Único</option>
                        <option>Recurrente</option>
                      </select>
                    </td>
                    <td>
                      <input className="input sm" data-f="d" disabled={ro} aria-label={`Descripción de la línea ${k + 1}`} style={{ minWidth: 220 }} value={l.d} onChange={(e) => upd(k, 'd', e.target.value)} />
                    </td>
                    <td className="r">
                      <input className="input sm" type="number" min={1} disabled={ro} aria-label="Cantidad" style={{ width: 70, textAlign: 'right' }} value={l.q} onChange={(e) => upd(k, 'q', e.target.value)} />
                    </td>
                    <td className="r">
                      <input className="input sm" type="number" min={0} step="0.01" disabled={ro} aria-label="Precio unitario" style={{ width: 110, textAlign: 'right' }} value={l.pu} onChange={(e) => upd(k, 'pu', e.target.value)} />
                    </td>
                    <td>
                      {l.type === 'Recurrente' ? (
                        <select className="select sm" disabled={ro} aria-label="Ciclo" style={{ width: 110 }} value={l.cy} onChange={(e) => upd(k, 'cy', e.target.value)}>
                          <option>Mensual</option>
                          <option>Anual</option>
                        </select>
                      ) : (
                        <span className="sub">—</span>
                      )}
                    </td>
                    <td className="r num strong">{moneyRaw(l.q * l.pu, 'PEN')}</td>
                    <td>
                      {ro ? null : (
                        <button type="button" className="btn sm icon" aria-label={`Quitar línea ${k + 1}`} onClick={() => setD((d) => d.filter((_, i) => i !== k))}>
                          <Icon name="trash" size="sm" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {ro ? null : (
            <div className="card-f" style={{ justifyContent: 'flex-start', gap: 8 }}>
              <button type="button" className="btn sm" onClick={() => add('Único')}>
                <Icon name="plus" size="sm" />
                Cargo único
              </button>
              <button type="button" className="btn sm" onClick={() => add('Recurrente')}>
                <Icon name="plus" size="sm" />
                Cargo recurrente
              </button>
              <button type="button" className="btn sm ghost" onClick={fromCat}>
                <Icon name="tag" size="sm" />
                Desde el catálogo
              </button>
            </div>
          )}
          <div className="card-b">
            <div className="tot num" aria-live="polite">
              <div>
                <span>Cargos únicos</span>
                <span>{moneyRaw(t.u, 'PEN')}</span>
              </div>
              <div>
                <span>IGV 18 %</span>
                <span>{moneyRaw(t.igv, 'PEN')}</span>
              </div>
              <div className="g">
                <span>Total al aceptar</span>
                <span>{moneyRaw(t.tot, 'PEN')}</span>
              </div>
              <div>
                <span>Recurrente (equivalente mensual, sin IGV)</span>
                <span>{moneyRaw(t.r, 'PEN')}</span>
              </div>
            </div>
          </div>
        </section>
        <aside className="card">
          <div className="card-h">
            <h2 className="sec">Versiones</h2>
          </div>
          <ul className="rows">
            {q.vers
              .slice()
              .reverse()
              .map((v) => {
                const tt = qTot(v.lines);
                return (
                  <li key={v.v}>
                    <span className="blk-n">v{v.v}</span>
                    <div className="grow">
                      <b>
                        {fD(v.date)} · {v.by}
                      </b>
                      <small>
                        Único {moneyRaw(tt.u, 'PEN', true)} · recurrente {moneyRaw(tt.r, 'PEN', true)}/mes
                      </small>
                    </div>
                    {!ro && v.v !== q.vers.length ? (
                      <button type="button" className="btn sm" onClick={() => load(v.v)}>
                        Cargar
                      </button>
                    ) : null}
                  </li>
                );
              })}
          </ul>
        </aside>
      </div>
    </>
  );
}
