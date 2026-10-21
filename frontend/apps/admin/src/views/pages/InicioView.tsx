/**
 * Resumen del día (#inicio) — prototipo vInicio (l.1557), attention(),
 * renewals() y drawChart(). KPIs, gráfico facturado vs. cobrado, cola de
 * atención por severidad, capacidad de nodos y renovaciones próximas.
 * Respeta el filtro global de marca y la moneda de visualización.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { useApp, useMoney } from '../../app/context';
import { useActions } from '../../app/actions';
import type { RouteId } from '../../app/routeMeta';
import type { ViewProps } from '../../app/routes';
import { Icon, SevIcon } from '../../components/Icon';
import { DualMoney } from '../../components/Money';
import { CapBar, ClientLink, DayChip, EmptyState, KpiCard, Legend, PageHead } from '../../components/ui';
import {
  BILLED, BR, BRAND_SHARE, CBY, COLL, MES, MESL, MONTHS, NF0, NODES, SEV, TC, TODAY,
  compact, diffD, fD, fDL, fDom, fInv, fLeads, fSvc, fTk, inBrand, money, moneyRaw, mrrOf, plural, saldo, slaLeft, sumBy, vouchers,
} from '../../data';
import type { Sev } from '../../data';
import { useWidth } from './operacion-kpi/charts';

interface Att {
  sev: Sev;
  t: string;
  s: ReactNode;
  r: RouteId;
  cta: string;
}

export default function InicioView(_props: ViewProps) {
  const { brand, cur, navigate, dataVersion } = useApp();
  const m = useMoney();
  const act = useActions();

  const D = useMemo(() => {
    const svc = fSvc(brand);
    const inv = fInv(brand);
    const mrr = sumBy(svc.filter((s) => s.st === 'Activo'), (s) => [mrrOf(s), s.cur]);
    const open = inv.filter((v) => v.status === 'Pendiente' || v.status === 'Vencida');
    const porCobrar = sumBy(open, (v) => [saldo(v), v.cur]);
    const vencido = sumBy(open.filter((v) => v.status === 'Vencida'), (v) => [saldo(v), v.cur]);
    const due30 = svc.filter((s) => s.st === 'Activo' && diffD(s.due, TODAY) >= 0 && diffD(s.due, TODAY) <= 30);
    const dom30 = fDom(brand).filter((d) => {
      const x = diffD(d.real, TODAY);
      return x >= 0 && x <= 30;
    });
    const tk = fTk(brand).filter((t) => t.status !== 'Resuelto');
    const out = tk.filter((t) => slaLeft(t) < 0);
    const avg = Math.round(NODES.reduce((a, n) => a + n.p, 0) / NODES.length);
    const hot = NODES.filter((n) => n.p >= 85).length;
    return { mrr, porCobrar, vencido, due30, dom30, tk, out, avg, hot };
  }, [brand, dataVersion]);

  const att = useMemo<Att[]>(() => {
    const a: Att[] = [];
    const vp = vouchers.filter((v) => v.st === 'Por validar' && inBrand(brand, v.cid));
    if (vp.length) a.push({ sev: 'alta', t: `${vp.length} pagos por validar`, s: `Vouchers de transferencia por ${m.dual(sumBy(vp, (v) => [v.amt, v.cur]))}`, r: 'cobranza', cta: 'Validar' });
    const sus = fInv(brand).filter((v) => v.status === 'Pendiente' && diffD(v.due, TODAY) === 0 && v.type !== 'Nota de débito');
    if (sus.length) a.push({ sev: 'critica', t: `${sus.length} suspensiones programadas para mañana`, s: sus.slice(0, 2).map((v) => CBY[v.cid].name).join(', ') + (sus.length > 2 ? ` y ${sus.length - 2} más` : ''), r: 'cobranza', cta: 'Revisar' });
    const dx = fDom(brand).filter((d) => {
      const x = diffD(d.real, TODAY);
      return x >= 0 && x <= 7 && !d.auto;
    });
    if (dx.length)
      a.push({
        sev: dx.some((d) => diffD(d.real, TODAY) <= 3) ? 'critica' : 'alta',
        t: `${dx.length} dominios expiran en ≤ 7 días sin renovación automática`,
        s: dx.slice(0, 2).map((d, i) => (
          <span key={d.id}>
            {i ? ', ' : ''}
            <span className="mono">{d.d}</span> ({diffD(d.real, TODAY)} d)
          </span>
        )),
        r: 'dominios',
        cta: 'Renovar',
      });
    a.push({ sev: 'critica', t: 'Backup nocturno fallido en BH-RES-01', s: '3 cuentas sin copia del 07/10 · error de cuota en destino S3', r: 'infra', cta: 'Ver nodo' });
    a.push({ sev: 'media', t: 'Snapshot incompleto en VPS-AP-02', s: 'Último snapshot correcto: 06/10 02:10', r: 'infra', cta: 'Ver nodo' });
    const tk = fTk(brand).filter((t) => t.status !== 'Resuelto');
    const o = tk.filter((t) => slaLeft(t) < 0);
    const soon = tk.filter((t) => {
      const l = slaLeft(t);
      return l >= 0 && l < 120;
    });
    if (o.length) a.push({ sev: 'critica', t: `${o.length} tickets fuera de SLA`, s: o.slice(0, 2).map((t) => `${t.id} · ${t.sub}`).join(' — '), r: 'tickets', cta: 'Atender' });
    if (soon.length) a.push({ sev: 'alta', t: `${soon.length} tickets vencen SLA en menos de 2 h`, s: soon.slice(0, 1).map((t) => `${t.id} · ${t.sub}`).join(''), r: 'tickets', cta: 'Atender' });
    const fu = fLeads(brand).filter((l) => !l.done && diffD(l.next, TODAY) === 0);
    if (fu.length) a.push({ sev: 'baja', t: `${fu.length} seguimientos comerciales para hoy`, s: 'CRM · prospectos en propuesta y negociación', r: 'crm', cta: 'Abrir CRM' });
    return a.sort((x, y) => SEV[x.sev].r - SEV[y.sev].r);
  }, [brand, dataVersion, m]);

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
  const vencPen = cur === 'orig' ? `${moneyRaw(D.vencido.PEN, 'PEN', 1)} + ${moneyRaw(D.vencido.USD, 'USD', 1)}` : m.dual(D.vencido, true);

  return (
    <>
      <PageHead
        crumbs={[['Operación', 'inicio'], ['Resumen del día', 'inicio']]}
        title="Buenos días, Renzo"
        sub={`${fdl[0].toUpperCase() + fdl.slice(1)} · ${brand === 'all' ? 'Todas las marcas' : BR[brand].n} · ${att.length} asuntos requieren atención`}
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
      <section className="grid g-kpi" aria-label="Indicadores clave">
        <KpiCard label="Ingresos recurrentes (MRR)" icon="activity" value={<DualMoney r={D.mrr} int twin />} meta={<><span className="delta-up">▲ 3.2 %</span> vs. setiembre</>} to="clientes" />
        <KpiCard label="Por cobrar" icon="wallet" value={<DualMoney r={D.porCobrar} int twin />} meta={<span className="delta-dn">Vencido: {vencPen}</span>} to="cobranza" />
        <KpiCard
          label="Vencen en 30 días"
          icon="cal"
          value={
            <>
              {NF0.format(D.due30.length + D.dom30.length)} <small>servicios</small>
            </>
          }
          meta={`${plural(D.dom30.length, 'dominio', 'dominios')} · ${plural(D.due30.length, 'suscripción', 'suscripciones')}`}
          to="dominios"
        />
        <KpiCard
          label="Tickets abiertos"
          icon="msg"
          value={`${D.tk.length}`}
          meta={
            <>
              {D.out.length ? <span className="delta-dn">{D.out.length} fuera de SLA</span> : 'Todos dentro de SLA'} · {D.tk.filter((t) => t.status === 'Nuevo').length} sin asignar
            </>
          }
          to="tickets"
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
              {D.hot ? <span className="delta-dn">{D.hot} nodos sobre 85 %</span> : 'Sin nodos críticos'} · {NODES.length} nodos
            </>
          }
          to="infra"
        />
      </section>
      <div style={{ height: 16 }} />
      <div className="grid g-2">
        <section className="card" aria-labelledby="hChart">
          <div className="card-h">
            <h2 className="sec" id="hChart">
              Facturado vs. cobrado <span className="sub">últimos 12 meses · {cur === 'USD' ? 'en US$' : 'equivalente en S/'}</span>
            </h2>
            <div className="legend">
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
            <BilledChart />
            <p style={{ margin: '8px 0 0', fontSize: 12.5, color: 'var(--muted)' }}>
              Octubre es un mes en curso (corte al {fD(TODAY)}). Tasa de cobro de los últimos 11 meses:{' '}
              <b className="num" style={{ color: 'var(--text)' }}>
                96.8 %
              </b>
              .
            </p>
            <div style={{ borderTop: '1px solid var(--border)', marginTop: 14, paddingTop: 12 }}>
              <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                Cobrado por medio de pago <span style={{ fontWeight: 500, color: 'var(--muted)', fontFamily: 'var(--f-body)', fontSize: 12 }}>· setiembre</span>
              </h3>
              {(
                [
                  ['Tarjeta (pasarela local)', 45, 'Comisión absorbida 3.4 %'],
                  ['Transferencia con voucher', 38, 'Validación manual de Finanzas'],
                  ['PayPal', 17, 'Comisión trasladada como línea aparte'],
                ] as [string, number, string][]
              ).map(([n, p, s]) => (
                <div key={n} className="hbar" style={{ gridTemplateColumns: 'minmax(0,190px) minmax(0,1fr) 48px' }}>
                  <span className="ellip" title={s}>
                    {n}
                  </span>
                  <div className="bar" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p} aria-label={`${n}: ${p} %`}>
                    <i style={{ width: `${p}%` }} />
                  </div>
                  <span className="v">{p} %</span>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section className="card" aria-labelledby="hAtt">
          <div className="card-h">
            <h2 className="sec" id="hAtt">
              Atención hoy
            </h2>
            <span className="sub">ordenado por severidad</span>
          </div>
          <ul className="att">
            {att.map((a, i) => (
              <li key={i} className={a.sev}>
                <SevIcon sev={a.sev} />
                <div className="tx">
                  <span className="lvl">{SEV[a.sev].l}</span>
                  <b>{a.t}</b>
                  <small>{a.s}</small>
                </div>
                <button type="button" className="btn sm" onClick={() => navigate(a.r)} aria-label={`${a.cta}: ${a.t}`}>
                  {a.cta}
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <div style={{ height: 16 }} />
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

/** Barras (facturado) + línea (cobrado) con tooltip por mes (drawChart). */
function BilledChart() {
  const { brand, cur } = useApp();
  const [ref, w] = useWidth<HTMLDivElement>(600);
  const [tip, setTip] = useState<{ i: number; x: number; y: number } | null>(null);
  const W = Math.max(280, w);
  const H = W < 500 ? 220 : 270;
  const mg = { l: W < 500 ? 44 : 58, r: 10, t: 12, b: 28 };
  const k = BRAND_SHARE[brand] * (cur === 'USD' ? 1 / TC : 1);
  const b = BILLED.map((v) => v * k);
  const c = COLL.map((v) => v * k);
  const max = Math.max(...b, ...c);
  const step = Math.pow(10, Math.floor(Math.log10(max / 4)));
  const nice = [1, 2, 2.5, 5, 10].map((x) => x * step).find((x) => max / x <= 5) || step * 10;
  const ymax = Math.ceil(max / nice) * nice;
  const iw = W - mg.l - mg.r;
  const ih = H - mg.t - mg.b;
  const bw = iw / 12;
  const y = (v: number) => mg.t + ih - (v / ymax) * ih;
  const ticks: number[] = [];
  for (let v = 0; v <= ymax + 1e-6; v += nice) ticks.push(v);
  const sym = cur === 'USD' ? 'US$' : 'S/';
  const tc = cur === 'USD' ? 'USD' : 'PEN';
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
        {MONTHS.map((d, i) =>
          W < 500 && i % 2 ? null : (
            <text key={'m' + i} className="ax" x={mg.l + i * bw + bw / 2} y={H - 8} textAnchor="middle">
              {MES[d.getMonth()]}
              {d.getMonth() === 0 || i === 0 ? ' ' + String(d.getFullYear()).slice(2) : ''}
            </text>
          ),
        )}
        {MONTHS.map((_, i) => (
          <rect key={'h' + i} x={mg.l + i * bw} y={mg.t} width={bw} height={ih} fill="transparent" onMouseMove={(e) => setTip({ i, x: e.clientX, y: e.clientY })} />
        ))}
      </svg>
      {tip ? (
        <div className="tip" style={{ display: 'block', left: Math.min(tip.x + 14, window.innerWidth - 200), top: tip.y + 14 }}>
          <b>
            {MESL[MONTHS[tip.i].getMonth()]} {MONTHS[tip.i].getFullYear()}
          </b>
          <br />
          Facturado: {moneyRaw(b[tip.i], tc)}
          <br />
          Cobrado: {moneyRaw(c[tip.i], tc)}
          <br />
          Tasa: {((c[tip.i] / b[tip.i]) * 100).toFixed(1)} %
        </div>
      ) : null}
    </div>
  );
}
