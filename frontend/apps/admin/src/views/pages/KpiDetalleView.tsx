/**
 * Tablero propio por indicador (#kpi/<id> o #kpid/<id>) — prototipo vKpiDet
 * (l.3708) y kdDraw/kdCsv. Resumen con conciliación, evolución, desgloses
 * calculados sobre el listado y la tabla de registros con filtros, orden,
 * paginación y exportación CSV.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../../app/context';
import { ROUTE_META, isRouteId } from '../../app/routeMeta';
import type { ViewProps } from '../../app/routes';
import { useViewState } from '../../app/storage';
import { Icon } from '../../components/Icon';
import { BrandTag, Chip, EmptyState, PageHead, Pager } from '../../components/ui';
import { BR, KBY, KD, KG, NF0, NF2, TODAY, fD, iso, kCmpOff, kDelta, kFmt, kGoal, kGroups, kLabels, kPerLabel, kPrev, kSpark, kStatus, money, plural } from '../../data';
import type { BrandId, KpiDef } from '../../data';
import { CC, SpecChart, type ChartSpec } from './operacion-kpi/charts';
import { KDS, cBr, kValQ, kdFiltered, kdGroup, kdInit, kdLab, kdMeasLbl, kdMeasure, kdNum, kdRows, kdTxt, type KdCol, type KdFilterState, type KdRow } from './operacion-kpi/kds';
import { GoalsModal, KCard, KpiFilters, KpiInfoModal } from './operacion-kpi/parts';
import { cmpLabel, respFor, useKpiFilter, useKpiPrefs } from './operacion-kpi/state';

const PER = 25;

export default function KpiDetalleView({ param }: ViewProps) {
  const { role, navigate } = useApp();
  const [, setTab] = useViewState<string | null>('kpi.tab', null);
  // '#kpi/<grupo>' llega aquí: abre el panel en esa pestaña
  const isGroup = !!param && KG.some((g) => g[0] === param);
  useEffect(() => {
    if (isGroup && param) {
      setTab(param);
      navigate('kpi');
    }
  }, [isGroup, param]); // eslint-disable-line react-hooks/exhaustive-deps
  const k = param ? KBY[param] : undefined;
  if (isGroup) return null;
  if (!k || !kGroups(role).some((g) => g[0] === k.g) || !KDS[k.id]) {
    return (
      <>
        <PageHead crumbs={[['Operación', 'kpi'], ['Panel de indicadores', 'kpi'], ['Indicador', 'kpi']]} title="Indicador no disponible" />
        <section className="card">
          <EmptyState
            title="No encontramos este indicador"
            text={`No existe o su rol (${role}) no tiene acceso a su grupo.`}
            action={
              <a className="btn primary" href="#kpi">
                Volver al panel
              </a>
            }
          />
        </section>
      </>
    );
  }
  return <KpiDetail key={k.id} k={k} />;
}

function Cell({ c, v }: { c: KdCol; v: KdRow[string] }) {
  const { cur } = useApp();
  if (v == null || v === '') return <span className="sub">—</span>;
  switch (c.t) {
    case 'client':
      return (
        <>
          <a className="rowlink" href={`#cliente/${encodeURIComponent(v.id)}`}>
            {v.name}
          </a>
          <div className="sub mono">{v.id}</div>
        </>
      );
    case 'brand':
      return BR[v as BrandId] ? <BrandTag brand={v as BrandId} /> : <>{String(v)}</>;
    case 'date':
      return <span className="nw num">{fD(v)}</span>;
    case 'money':
      return <span className="num">{money(v, 'PEN', cur)}</span>;
    case 'pct':
      return <span className="num">{NF2.format(v)} %</span>;
    case 'n1':
      return <span className="num">{NF2.format(v).replace(/0$/, '')}</span>;
    case 'int':
      return <span className="num">{NF0.format(Math.round(v))}</span>;
    case 'chip':
      return <Chip kind={(c.map && c.map[v]) || 'neutral'}>{String(v)}</Chip>;
    case 'id':
      return <b className="mono">{String(v)}</b>;
    case 'mono':
      return <span className="mono">{String(v)}</span>;
    default:
      return <>{String(v)}</>;
  }
}

function KpiDetail({ k }: { k: KpiDef }) {
  const { role, allowed, toast, navigate, dataVersion } = useApp();
  const { F, setF } = useKpiFilter();
  const [prefs, setPrefs] = useKpiPrefs();
  const [S0, setS] = useViewState<KdFilterState>('kpid.F', () => kdInit(k.id));
  const S = S0.id === k.id ? S0 : kdInit(k.id);
  // Actualización funcional: el buscador con retardo no pisa cambios hechos mientras tanto
  const upd = (p: Partial<KdFilterState>) => setS((prev) => ({ ...(prev.id === k.id ? prev : kdInit(k.id)), ...p }));
  const [q, setQ] = useState(S.q);
  const qRef = useRef<HTMLInputElement>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [goals, setGoals] = useState(false);
  const qt = useRef(0);
  useEffect(() => () => window.clearTimeout(qt.current), []);

  useEffect(() => {
    document.title = `${k.n} · Panel NubeConecta`;
  }, [k.n]);

  const sp = KDS[k.id];
  const gname = KG.find((g) => g[0] === k.g)?.[1] || '';
  const cur = F.cur;
  const v = kValQ(k, F);
  const p = kPrev(k, F);
  const dl = kDelta(k, v, p);
  const g = kGoal(k, F);
  const [stt, sc] = kStatus(k, v, g);
  const all = useMemo(() => kdRows(k, F), [k, F, dataVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = useMemo(() => kdFiltered(k, all, S, cur), [k, all, S, cur]);
  const filt = !!(S.q.trim() || S.dim || S.st || S.x2);
  const tot = kdMeasure(k, all);
  const fv = kdMeasure(k, rows);
  const ok = Math.abs((tot ?? 0) - v) <= Math.max(1e-6, Math.abs(v) * 1e-9) + (sp.m.t === 'count' ? 0.5 : 0);
  const dc = sp.cols.find((c) => c.dim);
  const scol = sp.cols.find((c) => c.st);
  const xc = sp.cols.find((c) => c.x2);
  const c2 = scol || xc || (dc && dc.t !== 'brand' && !sp.nobrand ? cBr : null);
  const pages = Math.max(1, Math.ceil(rows.length / PER));
  const pg = Math.min(S.pg, pages - 1);
  const page = rows.slice(pg * PER, (pg + 1) * PER);
  const others = KD.filter((x) => x.g === k.g && x.id !== k.id);
  const modMeta = isRouteId(sp.mod) ? ROUTE_META[sp.mod] : null;

  const opts = (col: KdCol): string[] => [...new Set(all.map((r) => String(r[col.k])))].sort((a, b) => kdLab(col, a).localeCompare(kdLab(col, b), 'es', { numeric: true }));

  const hbSpec = (col: KdCol): ChartSpec | null => {
    const it = kdGroup(k, rows, col)
      .slice(0, 10)
      .map((x, i) => ({ n: x.n, v: Math.max(0, x.v), c: CC[i % CC.length] }));
    if (!it.length) return null;
    return { type: 'hbar', fmt: (x) => kFmt(k, x, cur, true), items: it, h: Math.max(110, it.length * 32 + 12), title: `${k.n} por ${col.l}`, max: sp.m.t === 'share' || k.unit === 'pct' ? 100 : undefined };
  };
  const L = kLabels(F);
  const evo: ChartSpec = { type: 'line', labels: L, fmt: (x) => kFmt(k, x, cur, true), ml: 72, h: 240, title: 'Evolución de ' + k.n, series: [{ n: k.n, v: kSpark(k, F) }, { n: cmpLabel(F), v: kSpark(k, F, kCmpOff(F)), dash: true, c: 'var(--faint)' }, { n: 'Meta', v: L.map(() => g), dash: true, c: 'var(--c4)' }] };

  const onQ = (val: string) => {
    setQ(val);
    window.clearTimeout(qt.current);
    qt.current = window.setTimeout(() => upd({ q: val, pg: 0 }), 180);
  };
  const clear = () => {
    setQ('');
    window.clearTimeout(qt.current);
    setS({ ...kdInit(k.id), sort: S.sort, dir: S.dir });
    qRef.current?.focus();
  };
  const sortBy = (c: string) => upd(S.sort === c ? { dir: S.dir === 1 ? -1 : 1, pg: 0 } : { sort: c, dir: -1, pg: 0 });
  const csv = () => {
    const qq = (s: unknown) => {
      const t = String(s ?? '');
      return /[",;\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    const cc = cur === 'orig' ? 'PEN' : cur;
    const head = sp.cols.map((c) => (c.t === 'money' ? `${c.l} (${cc})` : c.l));
    const text = '﻿' + [head, ...rows.map((r) => sp.cols.map((c) => kdTxt(c, r[c.k], cur)))].map((l) => l.map(qq).join(',')).join('\r\n');
    const name = `indicador-${k.id}_${F.kPer}_${F.brand}_${iso(TODAY)}.csv`;
    toast('Exportación en cola', `${name} · ${NF0.format(rows.length)} filas · ${Math.round(text.length / 1024)} KB (simulado: el sistema la envía por enlace firmado)`, 'info');
  };
  const pin = (id: string) => {
    const on = prefs.pins.includes(id);
    setPrefs({ ...prefs, pins: on ? prefs.pins.filter((x) => x !== id) : [...prefs.pins, id] });
    toast(on ? 'Indicador desfijado' : 'Indicador fijado arriba', KBY[id].n, 'info');
  };
  const openK = (id: string) => {
    setInfo(null);
    navigate('kpid', id);
  };

  const foot = () => {
    const m = sp.m;
    const lab = filt ? `Filtro (${NF0.format(rows.length)} de ${NF0.format(all.length)} filas)` : `Total del listado (${NF0.format(all.length)} filas)`;
    const val = filt ? fv : tot;
    const sumM = (key: string) => money(rows.reduce((a, o) => a + o[key], 0), 'PEN', cur);
    return (
      <tfoot>
        <tr>
          {sp.cols.map((c, i) => {
            if (i === 0)
              return (
                <td key={c.k}>
                  <b>{lab}</b>
                </td>
              );
            if (m.t === 'sum' && (c.k === m.f || (m.also || []).includes(c.k)))
              return (
                <td key={c.k} className="r">
                  <b className="num">{sumM(c.k)}</b>
                </td>
              );
            if ((m.t === 'avg' || m.t === 'avgc') && c.k === m.f)
              return (
                <td key={c.k} className="r">
                  <b className="num">{val == null ? '—' : kFmt(k, val, cur)}</b>
                  <div className="sub">promedio</div>
                </td>
              );
            if (m.t === 'share' && c.k === m.f)
              return (
                <td key={c.k}>
                  <b className="num">{val == null ? '—' : kFmt(k, val, cur)}</b>
                  <div className="sub">{m.y}</div>
                </td>
              );
            if (m.t === 'margin' && (c.k === m.p || c.k === m.c))
              return (
                <td key={c.k} className="r">
                  <b className="num">{sumM(c.k)}</b>
                </td>
              );
            if ((m.t === 'margin' && c.k === 'mg') || (m.t === 'ratio' && c.k === 'cv'))
              return (
                <td key={c.k} className="r">
                  <b className="num">{val == null ? '—' : kFmt(k, val, cur)}</b>
                </td>
              );
            if (m.t === 'ratio' && (c.k === m.n || c.k === m.d))
              return (
                <td key={c.k} className="r">
                  <b className="num">{NF0.format(rows.reduce((a, o) => a + o[c.k], 0))}</b>
                </td>
              );
            return <td key={c.k} />;
          })}
        </tr>
      </tfoot>
    );
  };

  const dimSpec = dc ? hbSpec(dc) : null;
  const xSpec = c2 ? hbSpec(c2) : null;
  const brandName = F.brand === 'all' ? '' : ' · ' + BR[F.brand as BrandId].n;

  return (
    <>
      <PageHead
        crumbs={[['Operación', 'kpi'], ['Panel de indicadores', 'kpi'], [k.n, 'kpid', k.id]]}
        title={k.n}
        sub={`${gname} · ${k.def}`}
        actions={
          <>
            <a className="btn" href="#kpi">
              <Icon name="cl" size="sm" />
              Panel
            </a>
            {modMeta && isRouteId(sp.mod) && allowed(sp.mod) ? (
              <a className="btn" href={`#${sp.mod}`}>
                <Icon name={modMeta.ic} size="sm" />
                Ir a {modMeta.t}
              </a>
            ) : null}
            <button type="button" className="btn" onClick={() => setInfo(k.id)}>
              ⓘ Fórmula
            </button>
            <button type="button" className="btn" onClick={() => setGoals(true)}>
              <Icon name="tasks" size="sm" />
              Meta
            </button>
            <button type="button" className="btn primary" onClick={csv}>
              <Icon name="download" size="sm" />
              Exportar CSV
            </button>
          </>
        }
      />
      <KpiFilters
        F={F}
        setF={setF}
        resp={respFor(k.g)}
        label="Filtros del indicador"
        lead={
          <label className="field">
            Indicador
            <select className="select" value={k.id} onChange={(e) => navigate('kpid', e.target.value)}>
              {kGroups(role).map(([gid, gl]) => (
                <optgroup key={gid} label={gl}>
                  {KD.filter((x) => x.g === gid).map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.n}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
        }
      />
      <section className="card" style={{ marginBottom: 16 }}>
        <div className="statline kd-stats">
          <div>
            <small>{kPerLabel(F)}</small>
            <b className="kd-big">{kFmt(k, v, cur)}</b>
          </div>
          <div>
            <small>{cmpLabel(F)}</small>
            <b>{kFmt(k, p, cur)}</b>
          </div>
          <div>
            <small>Variación</small>
            <b className={`kc-d ${dl.cls}`}>{dl.txt}</b>
          </div>
          <div>
            <small>Meta</small>
            <b>{kFmt(k, g, cur)}</b>
          </div>
          <div>
            <small>Estado</small>
            <b>
              <Chip kind={sc}>{stt}</Chip>
            </b>
          </div>
          <div>
            <small>Registros</small>
            <b>
              {NF0.format(all.length)} <span className="sub">{sp.e}</span>
            </b>
          </div>
          {filt ? (
            <div className="kd-fv">
              <small>Valor con su filtro</small>
              <b>{fv == null ? '—' : kFmt(k, fv, cur)}</b>
            </div>
          ) : null}
        </div>
        <div className={`kd-recon ${ok ? 'ok' : 'warn'}`}>
          <Icon name={ok ? 'check' : 'info'} size="sm" />
          <span>
            {ok ? `El total del listado (${kdMeasLbl(k)}) coincide con el indicador.` : 'El listado no coincide con el indicador; revise la fórmula.'}
            {sp.note ? ' ' + sp.note : ''}
            {sp.nobrand && F.brand !== 'all' ? ' Este indicador es de infraestructura compartida: no se separa por marca.' : ''}
          </span>
        </div>
      </section>
      <div className="kcharts kd-charts">
        <section className="card kwide">
          <div className="card-h">
            <h2 className="sec">Evolución · 12 periodos</h2>
            <span className="sub">valor del indicador, periodo de comparación y meta</span>
          </div>
          <div className="card-b">
            <SpecChart spec={evo} id="kdEvo" />
          </div>
        </section>
        {dc ? (
          <section className="card">
            <div className="card-h">
              <h2 className="sec">Por {dc.l.toLowerCase()}</h2>
              <span className="sub">{filt ? 'según su filtro' : 'todas las filas'} · clic para filtrar</span>
            </div>
            <div className="card-b">
              {dimSpec ? <SpecChart spec={dimSpec} /> : <p className="sub" style={{ margin: '8px 0' }}>Sin datos para graficar.</p>}
              <div className="kd-chips">
                {kdGroup(k, rows, dc)
                  .slice(0, 12)
                  .map((x) => (
                    <button key={x.id} type="button" className={`btn sm${S.dim === x.id ? ' primary' : ''}`} aria-pressed={S.dim === x.id} onClick={() => upd({ dim: S.dim === x.id ? '' : x.id, pg: 0 })}>
                      {x.n} · {kFmt(k, x.v, cur, true)}
                    </button>
                  ))}
              </div>
            </div>
          </section>
        ) : null}
        {c2 ? (
          <section className="card">
            <div className="card-h">
              <h2 className="sec">Por {c2.l.toLowerCase()}</h2>
              <span className="sub">{filt ? 'según su filtro' : 'todas las filas'}</span>
            </div>
            <div className="card-b">{xSpec ? <SpecChart spec={xSpec} /> : <p className="sub" style={{ margin: '8px 0' }}>Sin datos para graficar.</p>}</div>
          </section>
        ) : null}
      </div>
      <section className="card" style={{ marginTop: 16 }}>
        <div className="card-h">
          <h2 className="sec">Registros del indicador</h2>
          <span className="sub">
            {sp.e} · {kPerLabel(F)}
            {brandName}
          </span>
        </div>
        <div className="toolbar">
          <label className="input-ic">
            <span className="sr-only">Buscar en los registros</span>
            <Icon name="search" />
            <input ref={qRef} className="input" type="search" placeholder={`Buscar en ${sp.e}…`} value={q} onChange={(e) => onQ(e.target.value)} />
          </label>
          {[
            ['dim', dc, S.dim],
            ['x2', xc, S.x2],
            ['st', scol, S.st],
          ].map(([key, col, val]) =>
            col ? (
              <select key={key as string} className="select" aria-label={(col as KdCol).l} value={val as string} onChange={(e) => upd({ [key as string]: e.target.value, pg: 0 } as Partial<KdFilterState>)}>
                <option value="">{(col as KdCol).l}: todos</option>
                {opts(col as KdCol).map((x) => (
                  <option key={x} value={x}>
                    {kdLab(col as KdCol, x)}
                  </option>
                ))}
              </select>
            ) : null,
          )}
          {filt ? (
            <button type="button" className="btn ghost sm" onClick={clear}>
              <Icon name="x" size="sm" />
              Limpiar filtros
            </button>
          ) : null}
          <span className="count">{plural(rows.length, 'registro', 'registros')}</span>
        </div>
        {rows.length ? (
          <>
            <div className="tw">
              <table className="t kd-t">
                <thead>
                  <tr>
                    {sp.cols.map((c) => {
                      const on = S.sort === c.k;
                      return (
                        <th key={c.k} className={kdNum(c) ? 'r' : ''} aria-sort={on ? (S.dir > 0 ? 'ascending' : 'descending') : 'none'}>
                          <button type="button" className="th-sort" onClick={() => sortBy(c.k)}>
                            {c.l}
                            <span aria-hidden="true">{on ? (S.dir > 0 ? '▲' : '▼') : '↕'}</span>
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {page.map((r, i) => (
                    <tr key={pg * PER + i}>
                      {sp.cols.map((c) => (
                        <td key={c.k} className={kdNum(c) ? 'r' : ''}>
                          <Cell c={c} v={r[c.k]} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                {foot()}
              </table>
            </div>
            <Pager
              page={pg}
              total={rows.length}
              per={PER}
              onPage={(n) => {
                upd({ pg: n });
                document.querySelector('.kd-t')?.scrollIntoView({ block: 'nearest' });
              }}
            />
          </>
        ) : (
          <EmptyState
            title={all.length ? 'Sin registros con estos filtros' : 'Sin registros en el periodo'}
            text={all.length ? 'Cambie o limpie los filtros de la tabla.' : 'Pruebe otro periodo o marca.'}
            action={
              filt ? (
                <button type="button" className="btn" onClick={clear}>
                  Limpiar filtros
                </button>
              ) : undefined
            }
          />
        )}
      </section>
      {others.length ? (
        <section className="kd-more" aria-label="Otros indicadores del grupo">
          <h2 className="sec" style={{ margin: '18px 0 10px' }}>
            Otros indicadores de {gname}
          </h2>
          <div className="kgrid">
            {others.map((x) => (
              <KCard key={x.id} k={x} F={F} pinned={prefs.pins.includes(x.id)} onOpen={openK} onInfo={setInfo} onPin={pin} />
            ))}
          </div>
        </section>
      ) : null}
      <KpiInfoModal id={info} onClose={() => setInfo(null)} onOpen={openK} />
      <GoalsModal open={goals} group={k.g} F={F} onClose={() => setGoals(false)} />
    </>
  );
}
