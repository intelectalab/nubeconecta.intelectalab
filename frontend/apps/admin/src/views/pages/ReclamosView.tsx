/**
 * Vista «reclamos» (#reclamos, #reclamos/<id>) — Libro de Reclamaciones (prototipo vReclamos3 l.3239,
 * que usa vReclamos2 l.2684 / vReclamos l.2203 para el registro interno).
 * Pestañas: Registro interno (KPIs, plazo administrable, tabla con marca de prueba y eliminación)
 * y Vista pública (hoja virtual por marca). param = id de hoja abre su panel lateral.
 */
import { useState } from 'react';
import { useApp } from '../../app/context';
import { useViewState } from '../../app/storage';
import type { ViewProps } from '../../app/routes';
import { Icon } from '../../components/Icon';
import { Modal } from '../../components/Modal';
import { BrandTag, Chip, EmptyState, Note, PageHead, SearchBox, Select, StatLine, Tabs, type Crumb } from '../../components/ui';
import { BRANDS, RECL, TODAY, WPS, diffD, fD, fDs, fRecl, iso, norm, plural, reclCfg, reclDue, reclHot, reclLeft, type BrandId } from '../../data';
import ReclSheet from './soporte/ReclSheet';
import { PubDoc, PubForm } from './soporte/ReclPublic';
import { mwStyle, type ReclX } from './soporte/shared';

type Tab = 'interno' | 'publica';
const CRUMBS: Crumb[] = [['Soporte', 'reclamos'], ['Libro de Reclamaciones', 'reclamos']];

function ReclBar({ r }: { r: ReclX }) {
  if (r.st === 'Respondido')
    return (
      <Chip kind="ok" icon="check">
        Respondido {r.respDate ? fDs(r.respDate) : ''}
      </Chip>
    );
  const l = reclLeft(r);
  const tot = reclCfg.plazo;
  const u = Math.min(100, Math.max(0, (1 - l / tot) * 100));
  const hab = reclCfg.unit === 'hábiles';
  return (
    <div className="sla">
      <div className="bar thin">
        <i className={l < 0 ? 'l4' : l <= 3 ? 'l3' : l <= 7 ? 'l2' : 'l1'} style={{ width: `${l < 0 ? 100 : u}%` }} />
      </div>
      <small style={{ color: l < 0 ? 'var(--danger-text)' : l <= 3 ? 'var(--high-text)' : 'var(--muted)', fontWeight: l <= 3 ? 700 : 500 }}>
        {l < 0 ? `Vencido hace ${-l} d` : l === 0 ? 'Vence hoy' : `${l} ${l === 1 ? 'día' : 'días'} ${hab ? (l === 1 ? 'hábil' : 'hábiles') : 'calendario'} · vence ${fD(reclDue(r))}`}
      </small>
    </div>
  );
}

export default function ReclamosView({ param }: ViewProps) {
  const { brand, toast, refresh } = useApp();
  const [tab, setTab] = useViewState<Tab>('rcl.tab', 'interno');
  const [q, setQ] = useViewState<string>('rcl.q', '');
  const [st, setSt] = useViewState<string>('rcl.st', '');
  const [pubBrand, setPubBrand] = useViewState<BrandId>('rcl.pubBrand', 'ap');
  const [pubDoc, setPubDoc] = useViewState<string | null>('rcl.pubDoc', null);
  const [openId, setOpenId] = useState<string | null>(() => (param && RECL.some((x) => x.id === param) ? param : null));
  const [plazoTxt, setPlazoTxt] = useState(String(reclCfg.plazo));
  const [testId, setTestId] = useState<string | null>(null);
  const [testOk, setTestOk] = useState(false);
  const [testErr, setTestErr] = useState('');
  const [delId, setDelId] = useState<string | null>(null);
  const [delTxt, setDelTxt] = useState('');

  const curTab: Tab = openId ? 'interno' : tab;
  const all = fRecl(brand) as ReclX[];
  const nq = norm(q);
  const rows = all
    .filter((r) => (!nq || norm(r.id).includes(nq) || norm(r.nombre).includes(nq) || norm(r.det).includes(nq)) && (!st || r.st === st))
    .sort((a, b) => Number(a.st === 'Respondido') - Number(b.st === 'Respondido') || reclLeft(a) - reclLeft(b));
  const hot = reclHot(brand);
  const openR = openId ? (RECL.find((x) => x.id === openId) as ReclX | undefined) : undefined;
  const testR = testId ? RECL.find((x) => x.id === testId) : undefined;
  const delR = delId ? RECL.find((x) => x.id === delId) : undefined;

  const tabs = (
    <Tabs<Tab>
      label="Vistas del Libro"
      value={curTab}
      onChange={(k) => {
        setTab(k);
        setOpenId(null);
      }}
      tabs={[
        { id: 'interno', label: 'Registro interno', count: all.length },
        { id: 'publica', label: 'Vista pública' },
      ]}
    />
  );

  const commitPlazo = () => {
    const v = Math.round(+plazoTxt);
    if (v === reclCfg.plazo) return;
    if (!(v >= 1 && v <= 60)) {
      setPlazoTxt(String(reclCfg.plazo));
      toast('Plazo no válido', 'Ingrese entre 1 y 60 días.', 'err');
      return;
    }
    reclCfg.plazo = v;
    setPlazoTxt(String(v));
    toast('Plazo actualizado', `${v} días ${reclCfg.unit} · recuerde validarlo con asesoría legal`, 'warn');
    refresh();
  };

  /* ---------- Vista pública ---------- */
  if (curTab === 'publica') {
    const r = pubDoc ? (RECL.find((x) => x.id === pubDoc) as ReclX | undefined) : undefined;
    const host = (WPS.find((w) => w.brand === pubBrand) || { host: '' }).host;
    return (
      <>
        <PageHead
          crumbs={CRUMBS}
          title="Libro de Reclamaciones"
          sub="Así ve el consumidor la hoja virtual en la web de cada marca ([hub_libro_reclamaciones]). Los envíos desde aquí son simulados y se marcan como prueba."
          actions={
            <label className="field" style={{ minWidth: 220 }}>
              Marca
              <select
                className="select"
                value={pubBrand}
                onChange={(e) => {
                  setPubBrand(e.target.value as BrandId);
                  setPubDoc(null);
                }}
              >
                {BRANDS.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.n}
                  </option>
                ))}
              </select>
            </label>
          }
        />
        {tabs}
        <div style={{ paddingTop: 14 }}>
          <div className="mw lr-web" style={mwStyle(pubBrand)}>
            <div className="mw-bar">
              <i />
              <i />
              <i />
              <span>https://{host}/libro-de-reclamaciones</span>
            </div>
            <div className="mw-sec">
              {r ? (
                <PubDoc
                  r={r}
                  onNew={() => setPubDoc(null)}
                  onSeeInternal={() => {
                    setTab('interno');
                    setPubDoc(null);
                    setOpenId(r.id);
                  }}
                />
              ) : (
                <PubForm key={pubBrand} brand={pubBrand} onCreated={(id) => setPubDoc(id)} />
              )}
            </div>
          </div>
        </div>
      </>
    );
  }

  /* ---------- Registro interno ---------- */
  return (
    <>
      <PageHead
        crumbs={CRUMBS}
        title="Libro de Reclamaciones"
        sub="Hojas de reclamación virtuales recibidas desde las webs de cada marca. Correlativo independiente por marca."
        actions={
          <button type="button" className="btn" onClick={() => toast('Registro exportado', `libro-reclamaciones_${iso(TODAY)}.xlsx (simulado)`, 'info')}>
            <Icon name="download" size="sm" />
            Exportar registro
          </button>
        }
      />
      {tabs}
      <div style={{ height: 14 }} />
      {hot.length ? (
        <Note kind="warn" icon="tri" role="alert" style={{ marginBottom: 16 }}>
          <b>
            {hot.length} {hot.length === 1 ? 'hoja vence' : 'hojas vencen'} en 3 días o menos:
          </b>{' '}
          {hot.slice(0, 3).map((r, i) => (
            <span key={r.id}>
              {i ? ', ' : ''}
              <span className="mono">{r.id}</span>
            </span>
          ))}
          {hot.length > 3 ? '…' : ''}. Responda antes del plazo.
        </Note>
      ) : null}
      <div className="grid g-2" style={{ marginBottom: 16, alignItems: 'start' }}>
        <StatLine
          style={{ marginBottom: 0 }}
          items={[
            { label: 'Recibidos (30 d)', value: all.filter((r) => diffD(TODAY, r.date) <= 30).length },
            { label: 'Pendientes', value: all.filter((r) => r.st !== 'Respondido').length },
            { label: 'Por vencer (≤ 3 d)', value: hot.length, tone: 'high' },
            { label: 'Reclamos / quejas', value: `${all.filter((r) => r.tipo === 'Reclamo').length} / ${all.filter((r) => r.tipo === 'Queja').length}` },
          ]}
        />
        <div className="card">
          <div className="card-b" style={{ paddingTop: 12 }}>
            <div className="field">
              <span>
                Plazo de respuesta{' '}
                <Chip kind="warn" style={{ width: 'max-content' }}>
                  administrable (confirmar con asesoría legal)
                </Chip>
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="input"
                  style={{ width: 90 }}
                  type="number"
                  min={1}
                  max={60}
                  value={plazoTxt}
                  aria-label="Plazo en días"
                  onChange={(e) => setPlazoTxt(e.target.value)}
                  onBlur={commitPlazo}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitPlazo();
                  }}
                />
                <select
                  className="select"
                  style={{ width: 'auto' }}
                  aria-label="Tipo de días"
                  value={reclCfg.unit}
                  onChange={(e) => {
                    reclCfg.unit = e.target.value as 'hábiles' | 'calendario';
                    refresh();
                  }}
                >
                  <option>hábiles</option>
                  <option>calendario</option>
                </select>
                <span style={{ alignSelf: 'center', fontSize: 13, color: 'var(--muted)' }}>días</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <section className="card">
        <div className="toolbar">
          <SearchBox value={q} onChange={setQ} placeholder="Correlativo, consumidor o detalle…" label="Buscar hojas" />
          <Select value={st} onChange={setSt} label="Estado" options={[['', 'Todos los estados'], 'Nuevo', 'En atención', 'Respondido']} />
          <span className="count">{plural(rows.length, 'hoja', 'hojas')}</span>
        </div>
        {rows.length ? (
          <div className="tw">
            <table className="t">
              <thead>
                <tr>
                  <th>Correlativo</th>
                  <th>Marca</th>
                  <th>Tipo</th>
                  <th>Consumidor</th>
                  <th>Detalle</th>
                  <th>Fecha</th>
                  <th>Plazo restante</th>
                  <th>Estado</th>
                  <th className="r">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={r.test ? 'is-test' : undefined}>
                    <td>
                      <a
                        className="rowlink mono"
                        href={`#reclamos/${encodeURIComponent(r.id)}`}
                        onClick={(e) => {
                          e.preventDefault();
                          setOpenId(r.id);
                        }}
                      >
                        {r.id}
                      </a>
                      {r.test ? (
                        <>
                          {' '}
                          <Chip kind="warn">Prueba</Chip>
                        </>
                      ) : null}
                    </td>
                    <td>
                      <BrandTag brand={r.brand} />
                    </td>
                    <td>
                      <Chip kind={r.tipo === 'Reclamo' ? 'high' : 'outline'}>{r.tipo}</Chip>
                    </td>
                    <td className="nw">
                      {r.nombre}
                      <div className="sub">DNI {r.dni}</div>
                    </td>
                    <td style={{ minWidth: 200 }} className="sub">
                      {r.det}
                    </td>
                    <td className="num nw">{fD(r.date)}</td>
                    <td style={{ minWidth: 160 }}>
                      <ReclBar r={r} />
                    </td>
                    <td>
                      <Chip kind={r.st === 'Respondido' ? 'ok' : r.st === 'Nuevo' ? 'info' : 'warn'}>{r.st}</Chip>
                    </td>
                    <td className="r nw">
                      {r.test ? (
                        <>
                          <button
                            type="button"
                            className="btn sm ghost"
                            onClick={() => {
                              r.test = false;
                              toast('Marca de prueba quitada', r.id, 'info');
                              refresh();
                            }}
                          >
                            Quitar marca
                          </button>{' '}
                          <button
                            type="button"
                            className="btn sm danger"
                            onClick={() => {
                              setDelTxt('');
                              setDelId(r.id);
                            }}
                          >
                            <Icon name="trash" size="sm" />
                            Eliminar
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="btn sm"
                            onClick={() => {
                              setTestOk(false);
                              setTestErr('');
                              setTestId(r.id);
                            }}
                          >
                            Marcar como prueba
                          </button>{' '}
                          <button type="button" className="btn sm" disabled aria-describedby={`why-${r.id}`}>
                            <Icon name="trash" size="sm" />
                            Eliminar
                          </button>
                          <div className="why" id={`why-${r.id}`}>
                            Registro real: se conserva por obligación legal.
                          </div>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="Sin hojas"
            text="Ninguna hoja coincide con los filtros."
            action={
              <button
                type="button"
                className="btn sm"
                onClick={() => {
                  setQ('');
                  setSt('');
                }}
              >
                Limpiar filtros
              </button>
            }
          />
        )}
      </section>

      {openR ? <ReclSheet key={openR.id} r={openR} onClose={() => setOpenId(null)} /> : null}

      <Modal
        open={!!testR}
        onClose={() => setTestId(null)}
        title="Marcar como prueba"
        footer={
          <>
            <button type="button" className="btn" onClick={() => setTestId(null)}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                if (!testR) return;
                if (!testOk) {
                  setTestErr('Debe confirmar que es un registro de prueba.');
                  return;
                }
                testR.test = true;
                setTestId(null);
                toast('Marcado como prueba', testR.id, 'warn');
                refresh();
              }}
            >
              Marcar como prueba
            </button>
          </>
        }
      >
        <p style={{ margin: 0 }}>
          Marque como prueba <b>solo</b> hojas creadas por el equipo para probar el formulario. Una hoja real de un consumidor no debe marcarse ni eliminarse.
        </p>
        <label className="check" style={{ marginTop: 10 }}>
          <input
            type="checkbox"
            checked={testOk}
            onChange={(e) => {
              setTestOk(e.target.checked);
              if (e.target.checked) setTestErr('');
            }}
          />
          <span>
            Confirmo que <span className="mono">{testR?.id}</span> fue creada por el equipo
          </span>
        </label>
        <span className="err" role={testErr ? 'alert' : undefined}>
          {testErr}
        </span>
      </Modal>

      <Modal
        open={!!delR}
        onClose={() => setDelId(null)}
        title="Eliminar registro de prueba"
        sub={<span className="mono">{delR?.id}</span>}
        initialFocus="#delConf"
        footer={
          <>
            <button type="button" className="btn" onClick={() => setDelId(null)}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn danger"
              disabled={delTxt.trim() !== 'ELIMINAR'}
              onClick={() => {
                if (!delR || delTxt.trim() !== 'ELIMINAR') return;
                if (!delR.test) {
                  toast('No se puede eliminar', 'Solo se eliminan registros marcados como prueba.', 'err');
                  return;
                }
                RECL.splice(RECL.indexOf(delR), 1);
                setDelId(null);
                toast('Registro de prueba eliminado', delR.id, 'warn');
                refresh();
              }}
            >
              Eliminar definitivamente
            </button>
          </>
        }
      >
        <Note kind="warn" icon="tri">
          Esta acción no se puede deshacer. El correlativo no se reutiliza.
        </Note>
        <label className="field" htmlFor="delConf" style={{ marginTop: 12 }}>
          <span>
            Escriba <b className="mono">ELIMINAR</b> para confirmar
          </span>
          <input className="input mono" id="delConf" autoComplete="off" value={delTxt} onChange={(e) => setDelTxt(e.target.value)} />
        </label>
      </Modal>
    </>
  );
}
