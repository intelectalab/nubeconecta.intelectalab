/**
 * Vista «reportes» (#reportes[/pestaña]) — Rentabilidad y antigüedad de deuda.
 * Guía: prototipo/panel.html vReportes (l.2853) y acciones repTab / repExport.
 * Montos siempre en S/ (TC 3.75), como en el prototipo.
 */
import { useEffect, useMemo, type ReactNode } from 'react';
import { useApp } from '../../app/context';
import type { ViewProps } from '../../app/routes';
import { useViewState } from '../../app/storage';
import { Icon } from '../../components/Icon';
import { ClientLink, EmptyState, Legend, PageHead, Tabs } from '../../components/ui';
import { COSTR, diffD, fClients, fInv, fSvc, iso, mrrOf, moneyRaw, NF2, saldo, TODAY, toPEN } from '../../data';

type RepTab = 'cliente' | 'servicio' | 'deuda';
const TABS: [RepTab, string][] = [
  ['cliente', 'Rentabilidad por cliente'],
  ['servicio', 'Rentabilidad por servicio'],
  ['deuda', 'Antigüedad de deuda'],
];
const isTab = (x: string | null): x is RepTab => !!x && TABS.some(([k]) => k === x);
const B = ['Por vencer', '1–30 días', '31–60 días', '61–90 días', 'Más de 90 días'];
const BCOLS = ['var(--chart-bar)', 'var(--warn)', 'var(--high)', 'var(--danger)', 'var(--danger-text)'];
const cost = (t: string) => COSTR[t] ?? 0.3;
const pen = (v: number, int?: boolean) => moneyRaw(v, 'PEN', int);

/** Tabla simple (tbl del prototipo): cabeceras con «>» se alinean a la derecha. */
function Tbl({ head, children, n }: { head: string[]; children: ReactNode; n: number }) {
  if (!n) return <EmptyState title="Sin registros" text="No hay datos para los filtros elegidos." />;
  return (
    <div className="tw">
      <table className="t">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} className={h.startsWith('>') ? 'r' : undefined}>
                {h.replace(/^>/, '')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function PorCliente() {
  const { brand, dataVersion } = useApp();
  const rows = useMemo(
    () =>
      fClients(brand)
        .filter((c) => c.mrr > 0)
        .map((c) => {
          const act = c.services.filter((s) => s.st !== 'Cancelado');
          const inc = act.reduce((a, s) => a + toPEN(mrrOf(s), s.cur), 0);
          const cst = act.reduce((a, s) => a + toPEN(mrrOf(s), s.cur) * cost(s.t), 0);
          return { c, inc, cost: cst, m: inc - cst, p: inc ? ((inc - cst) / inc) * 100 : 0 };
        })
        .sort((a, b) => b.m - a.m)
        .slice(0, 15),
    [brand, dataVersion],
  );
  const mx = Math.max(1, ...rows.map((r) => r.m));
  return (
    <Tbl head={['Cliente', '>Ingreso mensual', '>Costo estimado', '>Margen', 'Margen %']} n={rows.length}>
      {rows.map((r) => (
        <tr key={r.c.id}>
          <td style={{ minWidth: 200 }}>
            <ClientLink cid={r.c.id} />
          </td>
          <td className="r num">{pen(r.inc)}</td>
          <td className="r num">{pen(r.cost)}</td>
          <td className="r num strong">{pen(r.m)}</td>
          <td style={{ minWidth: 170 }}>
            <div className="bar" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(r.p)} aria-label={`Margen de ${r.c.name}`}>
              <i className={r.p >= 50 ? 'l1' : r.p >= 30 ? 'l2' : 'l3'} style={{ width: `${(Math.max(0, r.m) / mx) * 100}%` }} />
            </div>
            <small className="num" style={{ fontSize: 12 }}>
              {NF2.format(r.p)} %
            </small>
          </td>
        </tr>
      ))}
    </Tbl>
  );
}

function PorServicio() {
  const { brand, dataVersion } = useApp();
  const rows = useMemo(() => {
    const g: Record<string, { n: number; inc: number }> = {};
    fSvc(brand)
      .filter((s) => s.st !== 'Cancelado')
      .forEach((s) => {
        g[s.t] = g[s.t] || { n: 0, inc: 0 };
        g[s.t].n++;
        g[s.t].inc += toPEN(mrrOf(s), s.cur);
      });
    return Object.entries(g)
      .map(([k, v]) => ({ k, n: v.n, inc: v.inc, cost: v.inc * cost(k) }))
      .sort((a, b) => b.inc - b.cost - (a.inc - a.cost));
  }, [brand, dataVersion]);
  const mx = Math.max(1, ...rows.map((r) => r.inc));
  return (
    <>
      <Tbl head={['Servicio', '>Contratos', '>Ingreso mensual', '>Costo', '>Margen', 'Ingreso vs costo']} n={rows.length}>
        {rows.map((r) => (
          <tr key={r.k}>
            <td className="strong">{r.k}</td>
            <td className="r num">{r.n}</td>
            <td className="r num">{pen(r.inc, true)}</td>
            <td className="r num">{pen(r.cost, true)}</td>
            <td className="r num strong">
              {pen(r.inc - r.cost, true)} <small className="sub">({r.inc ? Math.round((1 - r.cost / r.inc) * 100) : 0} %)</small>
            </td>
            <td style={{ minWidth: 180 }}>
              <div className="dualbar" role="img" aria-label={`Ingreso ${pen(r.inc, true)}, costo ${pen(r.cost, true)}`}>
                <i style={{ width: `${(r.inc / mx) * 100}%` }} />
                <i className="c" style={{ width: `${(r.cost / mx) * 100}%` }} />
              </div>
            </td>
          </tr>
        ))}
      </Tbl>
      {rows.length ? (
        <div className="card-f" style={{ justifyContent: 'flex-start' }}>
          <Legend
            items={[
              ['var(--chart-bar)', 'Ingreso'],
              ['var(--high)', 'Costo'],
            ]}
          />
        </div>
      ) : null}
    </>
  );
}

const DEMO_AMTS = [480, 215, 890, 160, 1340, 95, 620, 300];

function Deuda() {
  const { brand, dataVersion } = useApp();
  const { rows, tot, T2 } = useMemo(() => {
    const agg: Record<string, number[]> = {};
    const add = (cid: string, b: number, v: number) => {
      agg[cid] = agg[cid] || [0, 0, 0, 0, 0];
      agg[cid][b] += v;
    };
    fInv(brand)
      .filter((v) => (v.status === 'Pendiente' || v.status === 'Vencida') && v.type !== 'Nota de crédito')
      .forEach((v) => {
        const d = diffD(TODAY, v.due);
        add(v.cid, d <= 0 ? 0 : d <= 30 ? 1 : d <= 60 ? 2 : d <= 90 ? 3 : 4, toPEN(saldo(v), v.cur));
      });
    fClients(brand)
      .filter((c) => c.status === 'Suspendido' || c.status === 'Moroso')
      .slice(0, 8)
      .forEach((c, k) => add(c.id, [2, 3, 4][k % 3], DEMO_AMTS[k]));
    const rows = Object.entries(agg)
      .map(([cid, a]) => ({ cid, a, t: a.reduce((x, y) => x + y, 0) }))
      .sort((x, y) => y.a[4] + y.a[3] - (x.a[4] + x.a[3]) || y.t - x.t);
    const tot = B.map((_, i) => rows.reduce((a, r) => a + r.a[i], 0));
    return { rows, tot, T2: tot.reduce((a, b) => a + b, 0) };
  }, [brand, dataVersion]);
  return (
    <>
      <div className="card-b" style={{ paddingTop: 16 }}>
        <div className="stackbar" style={{ height: 22 }} role="img" aria-label="Distribución de la deuda por antigüedad">
          {tot.map((v, i) => (
            <i key={i} style={{ width: `${T2 ? (v / T2) * 100 : 0}%`, background: BCOLS[i] }} title={`${B[i]}: ${pen(v)}`} />
          ))}
        </div>
        <div className="legend" style={{ marginTop: 8 }}>
          {B.map((b, i) => (
            <span key={b}>
              <i style={{ background: BCOLS[i] }} />
              {b}{' '}
              <b className="num" style={{ color: 'var(--text)' }}>
                {pen(tot[i], true)}
              </b>
            </span>
          ))}
        </div>
      </div>
      <Tbl head={['Cliente', ...B.map((b) => '>' + b), '>Total']} n={rows.length}>
        {rows.slice(0, 25).map((r) => (
          <tr key={r.cid}>
            <td style={{ minWidth: 200 }}>
              <ClientLink cid={r.cid} />
            </td>
            {r.a.map((v, i) => (
              <td key={i} className="r num" style={v && i >= 3 ? { color: 'var(--danger-text)', fontWeight: 700 } : undefined}>
                {v ? pen(v) : '—'}
              </td>
            ))}
            <td className="r num strong">{pen(r.t)}</td>
          </tr>
        ))}
      </Tbl>
    </>
  );
}

export default function ReportesView({ param }: ViewProps) {
  const { toast } = useApp();
  const [tab, setTab] = useViewState<RepTab>('rep.tab', 'cliente');

  useEffect(() => {
    if (isTab(param)) setTab(param);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [param]);

  return (
    <>
      <PageHead
        crumbs={[['Finanzas', 'reportes'], ['Reportes']]}
        title="Reportes"
        sub="Rentabilidad por cliente y por servicio, y antigüedad de la deuda. Montos en S/ (TC 3.75)."
        actions={
          <button type="button" className="btn" onClick={() => toast('Reporte exportado', `reporte-${tab}_${iso(TODAY)}.xlsx (simulado)`, 'info')}>
            <Icon name="download" size="sm" />
            Exportar
          </button>
        }
      />
      <section className="card" aria-label="Reportes">
        <Tabs label="Reportes" value={tab} onChange={setTab} tabs={TABS.map(([id, label]) => ({ id, label }))} />
        <div role="tabpanel" aria-label={TABS.find(([k]) => k === tab)?.[1]}>
          {tab === 'cliente' ? <PorCliente /> : tab === 'servicio' ? <PorServicio /> : <Deuda />}
        </div>
      </section>
    </>
  );
}
