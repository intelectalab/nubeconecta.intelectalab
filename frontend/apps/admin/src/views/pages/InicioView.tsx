/**
 * Resumen del día (#inicio) — prototipo vInicio (l.1557), attention(),
 * renewals() y drawChart(). KPIs, gráfico facturado vs. cobrado, cola de
 * atención por severidad, capacidad de nodos y renovaciones próximas.
 * Respeta el filtro global de marca y la moneda de visualización.
 */
import { useMemo, useState } from 'react';
import { api, type Attention, type Cashflow, type CashflowSeries, type DashboardSummary } from '@hub/api';
import { useApp, useMoney } from '../../app/context';
import { filterParam } from '../../app/filterParam';
import { useActions } from '../../app/actions';
import type { RouteId } from '../../app/routeMeta';
import type { ViewProps } from '../../app/routes';
import { Icon, SevIcon } from '../../components/Icon';
import { DualMoney } from '../../components/Money';
import { CapBar, ClientLink, DayChip, EmptyState, KpiCard, Legend, Note, PageHead } from '../../components/ui';
import {
  BR, MES, MESL, NF0, NF2, NODES, SEV, TODAY,
  compact, diffD, fD, fDL, fDom, fSvc, money, moneyRaw,
} from '../../data';
import type { MoneyPair, Sev } from '../../data';
import { useWidth } from './operacion-kpi/charts';
import { errorText, LIVE, useLoad, type Loadable } from './clientes/shared';

interface Att {
  sev: Sev;
  n: number;
  t: string;
  r: RouteId;
  /** param de la ruta destino (token f~ de filtro o pestaña) */
  p?: string;
  cta: string;
}

/** Pestaña de Cobranza: en vivo las secciones son otras que en la demo. */
const COB_VENCIDAS = LIVE ? 'antiguedad' : 'vencidas';
const COB_PRONTO = LIVE ? 'antiguedad' : 'pronto';

export default function InicioView(_props: ViewProps) {
  const { brand, cur, navigate, dataVersion } = useApp();
  const m = useMoney();
  const act = useActions();
  // TODO: filtrar por marca cuando el selector use brand_id reales
  const summary = useLoad<DashboardSummary>(() => api.dashboard.summary(), [dataVersion]);

  const D = useMemo(() => {
    const avg = Math.round(NODES.reduce((a, n) => a + n.p, 0) / NODES.length);
    const hot = NODES.filter((n) => n.p >= 85).length;
    return { avg, hot };
  }, []);

  const mrr = summary.data?.mrr?.reduce<MoneyPair>((pair, item) => {
    pair[item.currency] = item.amount_minor / 100;
    return pair;
  }, { PEN: 0, USD: 0 });
  const receivable = summary.data?.receivable?.reduce<MoneyPair>((pair, item) => {
    pair[item.currency] = item.total_minor / 100;
    return pair;
  }, { PEN: 0, USD: 0 });
  const overdue = summary.data?.receivable?.reduce<MoneyPair>((pair, item) => {
    pair[item.currency] = item.overdue_minor / 100;
    return pair;
  }, { PEN: 0, USD: 0 });

  const cashflow = useLoad<Cashflow>(() => api.billing.cashflow(), [dataVersion]);
  const attention = useLoad<Attention>(() => api.dashboard.attention(), [dataVersion]);

  const att = useMemo<Att[]>(() => {
    const d = attention.data;
    if (!d) return [];
    const a: Att[] = [];
    const add = (v: number | undefined, sev: Sev, t: (n: number) => string, r: RouteId, cta: string, p?: string) => {
      if (v !== undefined) a.push({ sev, n: v, t: t(v), r, p, cta });
    };
    add(d.tickets_overdue_sla, 'critica', (n) => `${n} ${n === 1 ? 'ticket fuera' : 'tickets fuera'} de SLA`, 'tickets', 'Atender', filterParam({ status: 'open' }));
    add(d.payments_to_validate, 'alta', (n) => `${n} ${n === 1 ? 'pago por validar' : 'pagos por validar'}`, 'cobranza', 'Validar', 'vouchers');
    add(d.domains_expiring_7d, 'alta', (n) => `${n} ${n === 1 ? 'dominio expira' : 'dominios expiran'} en ≤ 7 días sin renovación automática`, 'dominios', 'Renovar', filterParam({ d30: '1' }));
    add(d.invoices_due_today, 'media', (n) => `${n} ${n === 1 ? 'comprobante vence' : 'comprobantes vencen'} hoy`, 'cobranza', 'Revisar', COB_PRONTO);
    add(d.sales_followups_today, 'baja', (n) => `${n} ${n === 1 ? 'seguimiento comercial' : 'seguimientos comerciales'} para hoy`, 'crm', 'Abrir CRM', filterParam({ st: 'open' }));
    return a.sort((x, y) => SEV[x.sev].r - SEV[y.sev].r);
  }, [attention.data]);
  const pending = att.filter((x) => x.n > 0).length;

  const renewals = useMemo(() => {
    const it: { n: number; d: Date; t: string; c: string; m: string; mono?: boolean; key: string }[] = [];
    fSvc(brand)
      .filter((s) => s.st === 'Activo' && s.cy === 'Anual')
      .forEach((s) => {
        const n = diffD(s.due, TODAY);
        if (n >= 0 && n <= 30) it.push({ n, d: s.due, t: `${s.t} ${s.plan}`, c: s.cid, m: money(s.price, s.cur, cur), key: s.id });
      });
    fDom(brand).forEach((d) => {
      const n = diffD(d.real, TODAY);
      if (n >= 0 && n <= 30) it.push({ n, d: d.real, t: d.d, c: d.cid, m: d.reg, mono: true, key: d.id });
    });
    return it.sort((a, b) => a.n - b.n);
  }, [brand, cur, dataVersion]);

  const fdl = fDL(TODAY);
  const vencidoMeta = overdue ? m.dual(overdue, true) : '—';

  return (
    <>
      <PageHead
        crumbs={[['Operación', 'inicio'], ['Resumen del día', 'inicio']]}
        title="Buenos días, Renzo"
        sub={`${fdl[0].toUpperCase() + fdl.slice(1)} · ${brand === 'all' ? 'Todas las marcas' : BR[brand].n} · ${attention.data ? `${pending} ${pending === 1 ? 'asunto requiere' : 'asuntos requieren'} atención` : 'Resumen operativo'}`}
        actions={
          <>
            <button type="button" className="btn" onClick={() => navigate('cobranza')}>
              <Icon name="wallet" size="sm" />
              Bandeja de cobranza
            </button>
            <button type="button" className="btn primary" onClick={() => act.newClient()}>
              <Icon name="plus" size="sm" />
              Nuevo cliente
            </button>
          </>
        }
      />
      {summary.error ? <Note kind="warn" role="alert" style={{ marginBottom: 12 }}>No se pudieron cargar las KPI: {errorText(summary.error)} <button type="button" className="btn sm" onClick={summary.reload}>Reintentar</button></Note> : null}
      <section className="grid g-kpi" aria-label="Indicadores clave">
        <KpiCard label="Ingresos recurrentes (MRR)" icon="activity" value={mrr ? <DualMoney r={mrr} int twin /> : '—'} meta="Ingreso recurrente mensual" to="clientes" param={filterParam({ st: 'active' })} />
        <KpiCard label="Por cobrar" icon="wallet" value={receivable ? <DualMoney r={receivable} int twin /> : '—'} meta={<span className="delta-dn">Vencido: {vencidoMeta}</span>} to="cobranza" param={COB_VENCIDAS} />
        <KpiCard
          label="Vencen en 30 días"
          icon="cal"
          value={
            <>
              {summary.data?.services_due_30 !== undefined ? NF0.format(summary.data.services_due_30) : '—'} <small>servicios</small>
            </>
          }
          meta="Suscripciones"
          to="servicios"
        />
        <KpiCard
          label="Tickets abiertos"
          icon="msg"
          value={summary.data?.tickets ? `${summary.data.tickets.open}` : '—'}
          meta={
            <>
              {summary.data?.tickets ? <>{summary.data.tickets.overdue_sla ? <span className="delta-dn">{summary.data.tickets.overdue_sla} fuera de SLA</span> : 'Todos dentro de SLA'} · {summary.data.tickets.unassigned} sin asignar</> : '—'}
            </>
          }
          to="tickets"
          param={filterParam({ status: 'open' })}
        />
        <KpiCard
          label="Uso de nodos de hosting"
          icon="server"
          value={
            <>
              {D.avg} % <small>promedio</small>
            </>
          }
          meta={
            <>
              {D.hot ? <span className="delta-dn">{D.hot} nodos sobre 85 %</span> : 'Sin nodos críticos'} · {NODES.length} nodos · datos de ejemplo
            </>
          }
          to="infra"
        />
      </section>
      <div style={{ height: 16 }} />
      <div className="grid g-2">
        <CashflowCard cashflow={cashflow} />
        <section className="card" aria-labelledby="hAtt">
          <div className="card-h">
            <h2 className="sec" id="hAtt">
              Atención hoy
            </h2>
            <span className="sub">ordenado por severidad</span>
          </div>
          {attention.error ? (
            <Note kind="warn" role="alert" style={{ margin: 12 }}>
              No se pudo cargar la atención: {errorText(attention.error)} <button type="button" className="btn sm" onClick={attention.reload}>Reintentar</button>
            </Note>
          ) : attention.loading && !attention.data ? (
            <p style={{ margin: 16, color: 'var(--muted)' }}>—</p>
          ) : !att.length ? (
            <EmptyState title="Sin información" text="Su rol no incluye ninguna de las fuentes de atención." />
          ) : (
            <>
              {pending === 0 ? <p style={{ margin: '12px 16px 0', color: 'var(--muted)' }}>Nada urgente por hoy.</p> : null}
              <ul className="att">
                {att.map((a) => (
                  <li key={a.r + a.t} className={a.sev} style={a.n === 0 ? { opacity: 0.55 } : undefined}>
                    <SevIcon sev={a.sev} />
                    <div className="tx">
                      <span className="lvl">{SEV[a.sev].l}</span>
                      <b>{a.t}</b>
                    </div>
                    <button type="button" className="btn sm" onClick={() => navigate(a.r, a.p)} aria-label={`${a.cta}: ${a.t}`}>
                      {a.cta}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
      <div style={{ height: 16 }} />
      <Note icon="info" style={{ marginBottom: 16 }}>Capacidad de nodos, Renovaciones próximas y el uso de nodos de hosting usan datos de ejemplo; se conectarán cuando exista su backend.</Note>
      <div className="grid g-2e">
        <section className="card" aria-labelledby="hCap">
          <div className="card-h">
            <h2 className="sec" id="hCap">
              Capacidad de nodos
            </h2>
            <Legend
              items={[
                ['var(--ok)', '<70'],
                ['var(--warn)', '70–85'],
                ['var(--high)', '85–95'],
                ['var(--danger)', '≥95 %'],
              ]}
            />
          </div>
          <div className="card-b" style={{ display: 'grid', gap: 14 }}>
            {NODES.map((n) => (
              <CapBar
                key={n.id}
                p={n.p}
                label={
                  <>
                    <b className="mono">{n.id}</b> <span style={{ color: 'var(--muted)' }}>· {n.kind}</span>
                  </>
                }
                detail={`${n.acc[0]}/${n.acc[1]} cuentas`}
              />
            ))}
          </div>
          <div className="card-f">
            <a className="btn ghost sm" href="#infra">
              Ver infraestructura
              <Icon name="arrow" size="sm" />
            </a>
          </div>
        </section>
        <section className="card" aria-labelledby="hRen">
          <div className="card-h">
            <h2 className="sec" id="hRen">
              Renovaciones próximas
            </h2>
            <span className="sub">próximos 30 días</span>
          </div>
          {!renewals.length ? (
            <EmptyState title="Sin renovaciones" text="No hay renovaciones en los próximos 30 días." />
          ) : (
            <>
              <div className="tw">
                <table className="t">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Concepto</th>
                      <th>Cliente</th>
                      <th className="r">Monto / registrador</th>
                      <th>Plazo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {renewals.slice(0, 8).map((x) => (
                      <tr key={x.key}>
                        <td className="nw num">{fD(x.d)}</td>
                        <td className={x.mono ? 'mono' : ''}>{x.t}</td>
                        <td>
                          <ClientLink cid={x.c} />
                        </td>
                        <td className="r">{x.m}</td>
                        <td>
                          <DayChip n={x.n} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="card-f">
                <a className="btn ghost sm" href="#dominios">
                  Ver todos los vencimientos
                  <Icon name="arrow" size="sm" />
                </a>
              </div>
            </>
          )}
        </section>
      </div>
    </>
  );
}

const fmtCur = (v: number, c: string, int?: boolean): string => (c === 'PEN' || c === 'USD' ? moneyRaw(v, c, int) : `${c} ${NF2.format(v)}`);
const symOf = (c: string): string => (c === 'PEN' ? 'S/' : c === 'USD' ? 'US$' : c);

/** 'YYYY-MM' -> [año, mes 0-11]. */
function parseMonth(m: string): [number, number] {
  const [y, mo] = m.split('-');
  return [Number(y), Number(mo) - 1];
}

/** Gráfico facturado vs. cobrado (selector de moneda) + cobrado por medio de pago del mes actual. */
function CashflowCard({ cashflow }: { cashflow: Loadable<Cashflow> }) {
  const [sel, setSel] = useState<string | null>(null);
  const cf = cashflow.data;
  const currencies = useMemo(() => {
    if (!cf) return [];
    return Array.from(new Set([...cf.billed, ...cf.collected].map((s) => s.currency))).sort();
  }, [cf]);
  const cur = sel && currencies.includes(sel) ? sel : currencies.includes('PEN') ? 'PEN' : currencies[0];
  const series = (list: CashflowSeries[]): number[] =>
    cf ? (list.find((s) => s.currency === cur)?.points.map((p) => p.amount_minor / 100) ?? cf.months.map(() => 0)) : [];
  const billed = series(cf?.billed ?? []);
  const coll = series(cf?.collected ?? []);
  const hasData = !!cf && !!cur && [...billed, ...coll].some((v) => v > 0);
  const last = cf && cf.months.length ? parseMonth(cf.months[cf.months.length - 1]) : null;
  const methods = (cf?.methods ?? []).filter((x) => x.currency === cur);
  const mTotal = methods.reduce((a, x) => a + x.amount_minor, 0);
  // Tasa de cobro de los meses cerrados (todos menos el actual), solo con datos reales.
  const bClosed = billed.slice(0, -1).reduce((a, v) => a + v, 0);
  const cClosed = coll.slice(0, -1).reduce((a, v) => a + v, 0);
  return (
    <section className="card" aria-labelledby="hChart">
      <div className="card-h">
        <h2 className="sec" id="hChart">
          Facturado vs. cobrado <span className="sub">últimos 12 meses{cur ? ` · en ${symOf(cur)}` : ''}</span>
        </h2>
        <div className="legend">
          {currencies.length > 1
            ? currencies.map((c) => (
                <button key={c} type="button" className={`btn sm${c === cur ? ' primary' : ''}`} aria-pressed={c === cur} onClick={() => setSel(c)}>
                  {c}
                </button>
              ))
            : null}
          <span>
            <i style={{ background: 'var(--chart-bar)' }} />
            Facturado
          </span>
          <span>
            <i style={{ background: 'var(--chart-line)', height: 3, borderRadius: 2, verticalAlign: 3 }} />
            Cobrado
          </span>
        </div>
      </div>
      <div className="card-b">
        {cashflow.error ? (
          <Note kind="warn" role="alert">
            No se pudo cargar el flujo de caja: {errorText(cashflow.error)} <button type="button" className="btn sm" onClick={cashflow.reload}>Reintentar</button>
          </Note>
        ) : !cf ? (
          <p style={{ color: 'var(--muted)' }}>—</p>
        ) : !hasData || !cur ? (
          <EmptyState title="Sin movimientos en el periodo" text="No hay facturación ni cobros en los últimos 12 meses." />
        ) : (
          <>
            <BilledChart months={cf.months} billed={billed} collected={coll} currency={cur} />
            {bClosed > 0 ? (
              <p style={{ margin: '8px 0 0', fontSize: 12.5, color: 'var(--muted)' }}>
                El último mes está en curso. Tasa de cobro de los {cf.months.length - 1} meses cerrados:{' '}
                <b className="num" style={{ color: 'var(--text)' }}>
                  {((cClosed / bClosed) * 100).toFixed(1)} %
                </b>
                .
              </p>
            ) : null}
            <div style={{ borderTop: '1px solid var(--border)', marginTop: 14, paddingTop: 12 }}>
              <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                Cobrado por medio de pago{' '}
                <span style={{ fontWeight: 500, color: 'var(--muted)', fontFamily: 'var(--f-body)', fontSize: 12 }}>· {last ? `${MESL[last[1]]} ${last[0]}` : ''}</span>
              </h3>
              {!methods.length ? (
                <p style={{ margin: 0, fontSize: 12.5, color: 'var(--muted)' }}>Sin cobros este mes</p>
              ) : (
                methods.map((x) => {
                  const p = mTotal > 0 ? (x.amount_minor / mTotal) * 100 : 0;
                  return (
                    <div key={x.kind + x.name} className="hbar" style={{ gridTemplateColumns: 'minmax(0,190px) minmax(0,1fr) 110px' }}>
                      <span className="ellip" title={x.name}>
                        {x.name}
                      </span>
                      <div className="bar" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p)} aria-label={`${x.name}: ${p.toFixed(0)} %`}>
                        <i style={{ width: `${p}%` }} />
                      </div>
                      <span className="v">{fmtCur(x.amount_minor / 100, x.currency)}</span>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

/** Barras (facturado) + línea (cobrado) con tooltip por mes (drawChart). */
function BilledChart({ months, billed: b, collected: c, currency }: { months: string[]; billed: number[]; collected: number[]; currency: string }) {
  const [ref, w] = useWidth<HTMLDivElement>(600);
  const [tip, setTip] = useState<{ i: number; x: number; y: number } | null>(null);
  const W = Math.max(280, w);
  const H = W < 500 ? 220 : 270;
  const mg = { l: W < 500 ? 44 : 58, r: 10, t: 12, b: 28 };
  const max = Math.max(...b, ...c, 1);
  const step = Math.pow(10, Math.floor(Math.log10(max / 4)));
  const nice = [1, 2, 2.5, 5, 10].map((x) => x * step).find((x) => max / x <= 5) || step * 10;
  const ymax = Math.ceil(max / nice) * nice;
  const iw = W - mg.l - mg.r;
  const ih = H - mg.t - mg.b;
  const bw = iw / (months.length || 12);
  const y = (v: number) => mg.t + ih - (v / ymax) * ih;
  const ticks: number[] = [];
  for (let v = 0; v <= ymax + 1e-6; v += nice) ticks.push(v);
  const sym = symOf(currency);
  return (
    <div className="chart-box" ref={ref} role="img" aria-label="Gráfico de barras y línea: facturado y cobrado por mes">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} onMouseLeave={() => setTip(null)}>
        {ticks.map((v) => (
          <g key={v}>
            <line className="gridl" x1={mg.l} x2={W - mg.r} y1={y(v)} y2={y(v)} />
            <text className="ax" x={mg.l - 8} y={y(v) + 4} textAnchor="end">
              {sym} {compact(v)}
            </text>
          </g>
        ))}
        {b.map((v, i) => (
          <rect key={'b' + i} x={mg.l + i * bw + bw * 0.18} y={y(v)} width={bw * 0.64} height={mg.t + ih - y(v)} rx={3} fill="var(--chart-bar)" />
        ))}
        <polyline fill="none" stroke="var(--chart-line)" strokeWidth={2.4} strokeLinejoin="round" points={c.map((v, i) => `${mg.l + i * bw + bw / 2},${y(v)}`).join(' ')} />
        {c.map((v, i) => (
          <circle key={'c' + i} cx={mg.l + i * bw + bw / 2} cy={y(v)} r={3.5} fill="var(--surface)" stroke="var(--chart-line)" strokeWidth={2} />
        ))}
        {months.map((ym, i) => {
          if (W < 500 && i % 2) return null;
          const [yr, mo] = parseMonth(ym);
          return (
            <text key={'m' + i} className="ax" x={mg.l + i * bw + bw / 2} y={H - 8} textAnchor="middle">
              {MES[mo]}
              {mo === 0 || i === 0 ? ' ' + String(yr).slice(2) : ''}
            </text>
          );
        })}
        {months.map((_, i) => (
          <rect key={'h' + i} x={mg.l + i * bw} y={mg.t} width={bw} height={ih} fill="transparent" onMouseMove={(e) => setTip({ i, x: e.clientX, y: e.clientY })} />
        ))}
      </svg>
      {tip && months[tip.i] ? (
        <div className="tip" style={{ display: 'block', left: Math.min(tip.x + 14, window.innerWidth - 200), top: tip.y + 14 }}>
          <b>
            {MESL[parseMonth(months[tip.i])[1]]} {parseMonth(months[tip.i])[0]}
          </b>
          <br />
          Facturado: {fmtCur(b[tip.i], currency)}
          <br />
          Cobrado: {fmtCur(c[tip.i], currency)}
          {b[tip.i] > 0 ? (
            <>
              <br />
              Tasa: {((c[tip.i] / b[tip.i]) * 100).toFixed(1)} %
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
