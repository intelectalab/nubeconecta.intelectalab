/**
 * Piezas del panel de indicadores: tarjeta (kCard), barra de filtros,
 * modal de definición y fórmula (kInfo), modal de metas (kGoals) y gráficos
 * por grupo (kCharts). Prototipo l.2938-3075.
 */
import { useState, type ReactNode } from 'react';
import { useApp } from '../../../app/context';
import { Icon } from '../../../components/Icon';
import { Modal } from '../../../components/Modal';
import { Chip, Kv } from '../../../components/ui';
import {
  AGENTS, BR, BRANDS, BRAND_SHARE, CATF, CHANNELS, COSTR, GOALS, KBY, KD, KG, ME, NF0, NF2, NODES, PACC, STAGES, SYM, TC,
  compact, conv, fLeads, kCmpOff, kDelta, kFmt, kGoal, kGroups, kLabels, kLen, kPerLabel, kPrev, kSpark, kStatus,
} from '../../../data';
import type { KpiDef, KpiFilter } from '../../../data';
import { ChartBox, CC, Spark, type ChartSpec } from './charts';
import { kValQ } from './kds';
import { CAT_OPTS, CUR_OPTS, PER_OPTS, RANGE_MONTHS, cmpLabel, type KpiBase } from './state';

/* ---------- Tarjeta de indicador ---------- */
export interface KCardProps {
  k: KpiDef;
  F: KpiFilter;
  pinned: boolean;
  onOpen: (id: string) => void;
  onInfo: (id: string) => void;
  onPin: (id: string) => void;
  /** Modo personalización: índice y total para mover/ocultar */
  custom?: { idx: number; n: number; onMove: (id: string, d: -1 | 1) => void; onHide: (id: string) => void } | null;
}
export function KCard({ k, F, pinned, onOpen, onInfo, onPin, custom }: KCardProps) {
  const v = kValQ(k, F);
  const p = kPrev(k, F);
  const dl = kDelta(k, v, p);
  const g = kGoal(k, F);
  const [st, sc, r] = kStatus(k, v, g);
  const cur = F.cur;
  return (
    <article className="card kc" data-kid={k.id}>
      <div className="kc-h">
        <button type="button" className="kc-t" onClick={() => onOpen(k.id)}>
          {k.n}
        </button>
        <span className="kc-tools">
          <button type="button" className="kc-ib" onClick={() => onInfo(k.id)} aria-label={`Definición y fórmula de ${k.n}`} title="Definición y fórmula">
            ⓘ
          </button>
          <button type="button" className={`kc-ib${pinned ? ' on' : ''}`} onClick={() => onPin(k.id)} aria-pressed={pinned} aria-label={`${pinned ? 'Desfijar' : 'Fijar'} ${k.n}`} title={pinned ? 'Desfijar' : 'Fijar arriba'}>
            <Icon name="bolt" size="sm" />
          </button>
          {custom ? (
            <>
              <button type="button" className="kc-ib" data-move={`${k.id}|-1`} onClick={() => custom.onMove(k.id, -1)} aria-label="Mover antes" disabled={custom.idx === 0}>
                ←
              </button>
              <button type="button" className="kc-ib" data-move={`${k.id}|1`} onClick={() => custom.onMove(k.id, 1)} aria-label="Mover después" disabled={custom.idx === custom.n - 1}>
                →
              </button>
              <button type="button" className="kc-ib" onClick={() => custom.onHide(k.id)} aria-label={`Ocultar ${k.n}`} title="Ocultar">
                <Icon name="x" size="sm" />
              </button>
            </>
          ) : null}
        </span>
      </div>
      <button
        type="button"
        className="kc-b"
        onClick={() => onOpen(k.id)}
        aria-label={`${k.n}: ${kFmt(k, v, cur)}, ${dl.cls === 'good' ? 'mejora' : dl.cls === 'bad' ? 'empeora' : 'sin cambio'} ${dl.txt.slice(2)} vs ${F.kCmp === 'anual' ? 'año anterior' : 'periodo anterior'}. Ver detalle`}
      >
        <span className="kc-v num">{kFmt(k, v, cur, true)}</span>
        <span className="kc-row">
          <span className={`kc-d ${dl.cls}`}>{dl.txt}</span>
          <span className="kc-vs">vs {kFmt(k, p, cur, true)}</span>
        </span>
        <Spark v={kSpark(k, F)} cls={dl.cls} />
      </button>
      <div className="kc-g">
        <div className="kc-gt">
          <span>Meta {kFmt(k, g, cur, true)}</span>
          <Chip kind={sc}>{st}</Chip>
        </div>
        <div className="bar thin">
          <i className={sc === 'ok' ? 'l1' : sc === 'warn' ? 'l2' : 'l4'} style={{ width: `${Math.min(100, r * 100)}%` }} />
        </div>
      </div>
    </article>
  );
}

/* ---------- Barra de filtros ---------- */
export function KpiFilters({ F, setF, resp, lead, label }: { F: KpiFilter; setF: <K extends keyof KpiBase>(k: K, v: KpiBase[K]) => void; resp: string[]; lead?: ReactNode; label: string }) {
  const { setBrand, setCur } = useApp();
  return (
    <section className="card kfilters" aria-label={label}>
      <div className="toolbar">
        {lead}
        <label className="field">
          Periodo
          <select className="select" value={F.kPer} onChange={(e) => setF('kPer', e.target.value as KpiBase['kPer'])}>
            {PER_OPTS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        {F.kPer === 'rango' ? (
          <>
            <label className="field">
              Desde
              <select className="select" value={F.kFrom} onChange={(e) => setF('kFrom', +e.target.value)}>
                {RANGE_MONTHS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Hasta
              <select className="select" value={F.kTo} onChange={(e) => setF('kTo', +e.target.value)}>
                {RANGE_MONTHS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}
        <label className="field">
          Comparar con
          <select className="select" value={F.kCmp} onChange={(e) => setF('kCmp', e.target.value as KpiBase['kCmp'])}>
            <option value="anterior">Periodo anterior</option>
            <option value="anual">Mismo periodo del año anterior</option>
          </select>
        </label>
        <label className="field">
          Marca
          <select className="select" value={F.brand} onChange={(e) => setBrand(e.target.value as KpiFilter['brand'])}>
            <option value="all">Todas las marcas</option>
            {BRANDS.map((b) => (
              <option key={b.id} value={b.id}>
                {b.n}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Moneda
          <select className="select" value={F.cur} onChange={(e) => setCur(e.target.value as KpiFilter['cur'])}>
            {CUR_OPTS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Categoría
          <select className="select" value={F.kCat} onChange={(e) => setF('kCat', e.target.value)}>
            {CAT_OPTS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Responsable
          <select className="select" value={F.kResp} onChange={(e) => setF('kResp', e.target.value)}>
            <option value="">Todos</option>
            {resp.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
      </div>
    </section>
  );
}

/* ---------- Definición y fórmula ---------- */
export function KpiInfoModal({ id, onClose, onOpen }: { id: string | null; onClose: () => void; onOpen: (id: string) => void }) {
  const k = id ? KBY[id] : null;
  return (
    <Modal
      open={!!k}
      onClose={onClose}
      title={k?.n}
      sub={k ? KG.find((g) => g[0] === k.g)?.[1] : undefined}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cerrar
          </button>
          {k ? (
            <button type="button" className="btn primary" onClick={() => onOpen(k.id)}>
              Ver detalle
            </button>
          ) : null}
        </>
      }
    >
      {k ? (
        <Kv
          items={[
            ['Definición', k.def],
            ['Fórmula', <span key="f" className="mono" style={{ fontWeight: 500 }}>{k.f}</span>],
            ['Dirección deseada', k.dir === 'up' ? '▲ Mayor es mejor' : '▼ Menor es mejor'],
            ['Agregación', { sum: 'Suma del periodo', avg: 'Promedio del periodo', last: 'Valor al cierre del periodo' }[k.agg]],
            ['Estado', 'En meta: alcanza la meta · En riesgo: a menos de 10 % · Fuera: más lejos'],
          ]}
        />
      ) : null}
    </Modal>
  );
}

/* ---------- Metas por indicador ---------- */
const UNIT_L: Record<string, string> = { money: 'S/', pct: '%', days: 'días', hours: 'horas', min: 'min', num: 'cantidad' };
interface GoalDraft {
  g: string;
  b: KpiFilter['brand'];
  p: 'mes' | 'trimestre' | 'año';
  tmp: Record<string, number>;
}
export function GoalsModal({ open, group, F, onClose }: { open: boolean; group: string; F: KpiFilter; onClose: () => void }) {
  if (!open) return null;
  return <GoalsInner group={group} F={F} onClose={onClose} />;
}
function GoalsInner({ group, F, onClose }: { group: string; F: KpiFilter; onClose: () => void }) {
  const { role, toast, refresh } = useApp();
  const gs = kGroups(role);
  const [GD, setGD] = useState<GoalDraft>(() => ({ g: gs.some((x) => x[0] === group) ? group : gs[0][0], b: F.brand, p: F.kPer === 'rango' ? 'mes' : F.kPer, tmp: {} }));
  const [err, setErr] = useState('');
  const FG: KpiFilter = { ...F, brand: GD.b, kPer: GD.p };
  const ks = KD.filter((k) => k.g === GD.g);
  const n = Object.keys(GD.tmp).length;
  const save = () => {
    if (!n) {
      toast('Sin cambios', 'No modificó ninguna meta.', 'info');
      return;
    }
    Object.assign(GOALS, GD.tmp);
    onClose();
    toast('Metas guardadas', `${n} metas · ${GD.b === 'all' ? 'todas las marcas' : BR[GD.b].n} · ${GD.p}`);
    refresh();
  };
  return (
    <Modal
      open
      wide
      onClose={onClose}
      title="Metas por indicador"
      sub="Se aplican al marcar estado y barra de avance de cada tarjeta"
      initialFocus="select"
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn primary" onClick={save}>
            <Icon name="check" size="sm" />
            Guardar metas{n ? ` (${n})` : ''}
          </button>
        </>
      }
    >
      <div className="form-grid" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))' }}>
        <label className="field">
          Grupo
          <select className="select" value={GD.g} onChange={(e) => setGD((d) => ({ ...d, g: e.target.value }))}>
            {gs.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Marca
          <select className="select" value={GD.b} onChange={(e) => setGD((d) => ({ ...d, b: e.target.value as KpiFilter['brand'] }))}>
            <option value="all">Todas</option>
            {BRANDS.map((b) => (
              <option key={b.id} value={b.id}>
                {b.n}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Periodo
          <select className="select" value={GD.p} onChange={(e) => setGD((d) => ({ ...d, p: e.target.value as GoalDraft['p'] }))}>
            <option value="mes">Mes</option>
            <option value="trimestre">Trimestre</option>
            <option value="año">Año</option>
          </select>
        </label>
      </div>
      <div className="tw" style={{ border: '1px solid var(--border)', borderRadius: 8 }}>
        <table className="t">
          <thead>
            <tr>
              <th>Indicador</th>
              <th className="r">Actual</th>
              <th className="r">Meta</th>
              <th>Unidad</th>
            </tr>
          </thead>
          <tbody>
            {ks.map((k) => {
              const key = `${k.id}|${GD.b}|${GD.p}`;
              const cur = GD.tmp[key] ?? kGoal(k, FG);
              return (
                <tr key={key}>
                  <td>
                    <b>{k.n}</b>
                    <div className="sub">{k.dir === 'up' ? '▲ mayor es mejor' : '▼ menor es mejor'}</div>
                  </td>
                  <td className="r num">{kFmt(k, kValQ(k, FG), F.cur)}</td>
                  <td className="r">
                    <input
                      key={key}
                      className="input"
                      type="number"
                      step="any"
                      min={0}
                      defaultValue={+cur.toFixed(2)}
                      aria-label={`Meta de ${k.n}`}
                      style={{ width: 140, textAlign: 'right' }}
                      onBlur={(e) => {
                        const v = parseFloat(e.target.value);
                        if (!(v >= 0)) {
                          setErr('Ingrese un número mayor o igual a 0.');
                          return;
                        }
                        setErr('');
                        // Como el evento «change» del prototipo: solo cuenta si el valor cambió
                        if (GD.tmp[key] === undefined && e.target.value === e.target.defaultValue) return;
                        setGD((d) => ({ ...d, tmp: { ...d.tmp, [key]: v } }));
                      }}
                    />
                  </td>
                  <td className="sub">{UNIT_L[k.unit]}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <span className="err" role="alert">
        {err}
      </span>
    </Modal>
  );
}

/* ---------- Gráficos por grupo ---------- */
export function KpiGroupCharts({ g, F }: { g: string; F: KpiFilter }) {
  const L = kLabels(F);
  const sp = (id: string) => kSpark(KBY[id], F);
  const bf = BRAND_SHARE[F.brand] * CATF[F.kCat];
  const money0 = (v: number) => {
    const [x, c] = conv(v, 'PEN', F.cur);
    return `${SYM[c]} ${compact(x)}`;
  };
  const pct0 = (v: number) => NF0.format(v) + ' %';
  const n0 = (v: number) => NF0.format(v);
  const per = kPerLabel(F);
  const brands = BRANDS.filter((b) => F.brand === 'all' || b.id === F.brand);
  const boxes: { id: string; title: string; sub?: string; spec: ChartSpec; wide?: boolean }[] = [];
  const add = (id: string, title: string, sub: string, spec: ChartSpec, wide?: boolean) => boxes.push({ id, title, sub, spec, wide });
  const cmpN = F.kCmp === 'anual' ? 'Año anterior' : 'Periodo anterior';
  if (g === 'comercial') {
    const mrr = kValQ(KBY.mrr, F);
    const nu = mrr * 0.052, ex = mrr * 0.018, ba = mrr * 0.027, co = mrr * 0.006;
    const st2 = mrr - nu - ex + ba + co;
    add('wf', 'Cascada de MRR', per, { type: 'waterfall', fmt: money0, h: 240, items: [{ n: 'Inicio', v: st2, t: 'total' }, { n: 'Nuevos', v: nu, t: 'up' }, { n: 'Expansiones', v: ex, t: 'up' }, { n: 'Bajas', v: ba, t: 'down' }, { n: 'Contracciones', v: co, t: 'down' }, { n: 'Fin', v: mrr, t: 'total' }] });
    add('mrrT', 'Tendencia de MRR', '12 periodos · línea punteada: periodo comparado', { type: 'line', labels: L, fmt: money0, series: [{ n: 'MRR', v: sp('mrr') }, { n: cmpN, v: kSpark(KBY.mrr, F, kCmpOff(F)), dash: true, c: 'var(--faint)' }] });
    const ch = CHANNELS.map((c, i) => [c, [31, 27, 9, 22, 11][i]] as [string, number]);
    add('canal', 'Ventas por canal y marca', `clientes nuevos · ${per}`, { type: 'bars', labels: ch.map((c) => c[0]), fmt: n0, series: brands.map((b) => ({ n: b.n, v: ch.map((c) => Math.max(0, Math.round(c[1] * BRAND_SHARE[b.id] * kLen(F) * CATF[F.kCat] * 1.2))), c: CC[BRANDS.indexOf(b)] })) });
    const ol = kValQ(KBY.enlinea, F);
    add('olc', 'En línea vs. cotización', 'partes de las ventas cerradas', { type: 'donut', h: 200, fmt: (v) => NF0.format(v) + ' ventas', items: [{ n: 'En línea', v: Math.round(ol * kLen(F) * bf * 1.4) }, { n: 'Cotización', v: Math.round((100 - ol) * kLen(F) * bf * 1.4) }] });
  }
  if (g === 'crm') {
    const st = STAGES.slice(0, 5).map((s2) => ({ n: s2 as string, v: 0 }));
    fLeads(F.brand).forEach((l) => {
      const i = STAGES.indexOf(l.stage);
      for (let j = 0; j <= Math.min(i, 4); j++) if (l.stage !== 'Perdido') st[j].v += l.val;
    });
    add('fun', 'Embudo por etapa', 'valor acumulado que alcanzó cada etapa · % de paso', { type: 'funnel', fmt: money0, items: st, h: 230 });
    add('convc', 'Conversión por canal', 'ganados ÷ cerrados', { type: 'hbar', fmt: pct0, max: 100, items: CHANNELS.map((c, i) => ({ n: c, v: [16, 21, 12, 34, 9][i] * (1 + (kLen(F) - 1) * 0.01) })) });
    add('ciclo', 'Ciclo de venta', 'días promedio', { type: 'line', labels: L, fmt: (v) => NF0.format(v) + ' d', series: [{ n: 'Ciclo', v: sp('ciclo') }, { n: 'Comparado', v: kSpark(KBY.ciclo, F, kCmpOff(F)), dash: true, c: 'var(--faint)' }] }, true);
  }
  if (g === 'finanzas') {
    add('fcr', 'Facturado, cobrado y reconocido', '12 periodos', { type: 'line', labels: L, fmt: money0, series: [{ n: 'Facturado', v: sp('facturado') }, { n: 'Cobrado', v: sp('cobrado') }, { n: 'Reconocido', v: sp('reconocido') }] }, true);
    const B = ['Por vencer', '1–30 d', '31–60 d', '61–90 d', '> 90 d'];
    const L6 = L.slice(6);
    add('aging', 'Deuda por antigüedad', 'últimos 6 periodos', { type: 'stack', labels: L6, fmt: money0, series: B.map((b, j) => ({ n: b, v: L6.map((_, i) => [30000, 15500, 3200, 1500, 2400][j] * bf * (1 + 0.04 * Math.sin(i + j)) * (1 - 0.02 * i)), c: ['var(--c1)', 'var(--c3)', 'var(--c4)', 'var(--danger)', 'var(--c5)'][j] })) });
    add('mserv', 'Margen bruto por servicio', '%', { type: 'hbar', fmt: pct0, max: 100, items: Object.entries(COSTR).slice(0, 8).map(([k2, v]) => ({ n: k2, v: (1 - v) * 100, c: 1 - v < 0.3 ? 'var(--c4)' : 'var(--c2)' })) });
    add('cprov', 'Costos por proveedor', 'US$ / mes convertido a S/', { type: 'hbar', fmt: money0, items: PACC.filter((a) => a.cost).sort((a, b) => b.cost - a.cost).slice(0, 8).map((a) => ({ n: a.p + (a.type === 'Reseller' ? ' ' + (a.acc.split(' ')[1] || '') : ''), v: a.cost * TC * kLen(F) })) });
  }
  if (g === 'cobranza') {
    add('susre', 'Suspensiones vs. reactivaciones', '12 periodos', { type: 'bars', labels: L, fmt: n0, series: [{ n: 'Suspensiones', v: sp('susp'), c: 'var(--c4)' }, { n: 'Reactivaciones', v: sp('react'), c: 'var(--c2)' }] }, true);
    const cc = sp('compcump');
    add('comp', 'Compromisos de pago', 'cumplidos vs. incumplidos', { type: 'stack', labels: L, fmt: n0, series: [{ n: 'Cumplidos', v: cc.map((x) => Math.round(x / 10)), c: 'var(--c2)' }, { n: 'Incumplidos', v: cc.map((x) => Math.round((100 - x) / 10)), c: 'var(--danger)' }] });
    add('vou', 'Vouchers validados', 'y horas promedio de validación', { type: 'bars', labels: L, fmt: n0, series: [{ n: 'Vouchers', v: sp('vouch') }] });
  }
  if (g === 'operacion') {
    add('nod', 'Uso por nodo', 'umbrales 70 · 85 · 95 %', { type: 'hbar', fmt: pct0, max: 100, marks: [70, 85, 95], items: NODES.map((n) => ({ n: n.id, v: n.p, c: n.p >= 95 ? 'var(--danger)' : n.p >= 85 ? 'var(--c4)' : n.p >= 70 ? 'var(--c3)' : 'var(--c2)' })) });
    add('upt', 'Disponibilidad', '% de los monitores', { type: 'line', labels: L, ml: 64, fmt: (v) => NF2.format(v) + ' %', series: [{ n: 'Disponibilidad', v: sp('uptime') }, { n: 'Meta 99.9 %', v: L.map(() => 99.9), dash: true, c: 'var(--c4)' }] });
    add('mig', 'Avance de migración', '% de cuentas migradas', { type: 'line', labels: L, fmt: pct0, series: [{ n: 'Avance', v: sp('migra') }] });
  }
  if (g === 'soporte') {
    const days = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    const ag = AGENTS.filter((a) => a !== ME);
    add('heat', 'Carga por técnico y día', 'tickets atendidos · últimos 7 días', { type: 'heat', rows: ag, cols: days, h: Math.max(170, ag.length * 34 + 30), data: ag.map((a, i) => days.map((_, j) => Math.max(0, Math.round((j < 5 ? 9 : 3) + ((i * 3 + j * 5) % 7) - 2 + (a === F.kResp ? 3 : 0))))) }, true);
    add('slat', 'Cumplimiento de SLA', '%', { type: 'line', labels: L, fmt: pct0, series: [{ n: 'SLA', v: sp('sla') }, { n: 'CSAT', v: sp('csat') }] });
    add('tecn', 'Tickets por técnico', per, { type: 'hbar', fmt: n0, items: ag.map((a, i) => ({ n: a, v: Math.round([42, 38, 35, 28][i % 4] * kLen(F) * (F.kResp && F.kResp !== a ? 0.9 : 1)) })) });
  }
  if (g === 'reclamos') {
    const rr = sp('rrec');
    const rp = sp('rplazo');
    add('recl', 'Hojas recibidas y respondidas en plazo', '12 periodos', { type: 'bars', labels: L, fmt: n0, series: [{ n: 'Recibidas', v: rr }, { n: 'En plazo', v: rr.map((x, i) => (x * rp[i]) / 100), c: 'var(--c2)' }] }, true);
  }
  if (g === 'web') {
    const L6 = L.slice(6);
    add('convb', 'Conversión por marca', '% de sesiones con pedido', { type: 'bars', labels: L6, fmt: (v) => NF2.format(v) + ' %', series: brands.map((b, j) => ({ n: b.n, v: L6.map((_, i) => [2.6, 2.2, 1.7, 1.4][BRANDS.indexOf(b)] * (1 + 0.05 * Math.sin(i + j))), c: CC[BRANDS.indexOf(b)] })) });
    add('whr', 'Búsquedas WHOIS vs. registros', 'eje compartido en escala de registros ×50', { type: 'line', labels: L, fmt: n0, series: [{ n: 'Búsquedas ÷ 50', v: sp('whois').map((x) => x / 50) }, { n: 'Registros', v: sp('regs'), c: 'var(--c2)' }] });
  }
  if (!boxes.length) return null;
  return (
    <div className="kcharts">
      {boxes.map((b) => (
        <ChartBox key={b.id} title={b.title} sub={b.sub} spec={b.spec} wide={b.wide} />
      ))}
    </div>
  );
}

/** Marca o «todas las marcas» para subtítulos. */
export const brandLabel = (b: KpiFilter['brand'], lower = true): string => (b === 'all' ? (lower ? 'todas las marcas' : 'Todas las marcas') : BR[b].n);
export { cmpLabel };
