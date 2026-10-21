/**
 * Gráficos SVG a escala del panel de indicadores (drawSpec del prototipo,
 * l.2968-2990): línea, barras agrupadas, apiladas, cascada, barras
 * horizontales, embudo, mapa de calor y dona. Se redibujan al cambiar el
 * ancho del contenedor (ResizeObserver).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { compact } from '../../../data';

export const CC = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)'];

export interface Series {
  n: string;
  v: number[];
  c?: string;
  dash?: boolean;
}
export interface Item {
  n: string;
  v: number;
  c?: string;
  t?: 'total' | 'up' | 'down';
}
interface Base {
  h?: number;
  ml?: number;
  fmt?: (v: number) => string;
  title?: string;
}
export type ChartSpec =
  | (Base & { type: 'line' | 'bars' | 'stack'; labels: string[]; series: Series[] })
  | (Base & { type: 'waterfall'; items: Item[] })
  | (Base & { type: 'hbar'; items: Item[]; max?: number; marks?: number[] })
  | (Base & { type: 'funnel'; items: Item[] })
  | (Base & { type: 'heat'; rows: string[]; cols: string[]; data: number[][] })
  | (Base & { type: 'donut'; items: Item[] });

/** Ancho del contenedor (se actualiza al redimensionar). */
export function useWidth<T extends HTMLElement>(fallback = 300) {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const upd = () => setW(el.clientWidth || fallback);
    upd();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', upd);
      return () => window.removeEventListener('resize', upd);
    }
    let t = 0;
    const ro = new ResizeObserver(() => {
      window.clearTimeout(t);
      t = window.setTimeout(upd, 60);
    });
    ro.observe(el);
    return () => {
      window.clearTimeout(t);
      ro.disconnect();
    };
  }, [fallback]);
  return [ref, w] as const;
}

export function niceMax(m: number): number {
  if (m <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(m)));
  const n = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((x) => x * p >= m) || 10;
  return n * p;
}
const trunc = (s: string): string => (s.length > 22 ? s.slice(0, 21) + '…' : s);

function YAxis({ m, W, H, mx, fmt }: { m: { l: number; r: number; t: number; b: number }; W: number; H: number; mx: number; fmt: (v: number) => string }) {
  return (
    <>
      {[0, 1, 2, 3, 4].map((i) => {
        const v = (mx * i) / 4;
        const y = H - m.b - ((H - m.t - m.b) * i) / 4;
        return (
          <g key={i}>
            <line className="gridl" x1={m.l} x2={W - m.r} y1={y} y2={y} />
            <text className="ax" x={m.l - 6} y={y + 4} textAnchor="end">
              {fmt(v)}
            </text>
          </g>
        );
      })}
    </>
  );
}
function XLabels({ labels, x0, bw, H, W }: { labels: string[]; x0: number; bw: number; H: number; W: number }) {
  const every = Math.ceil(labels.length / Math.max(2, Math.floor((W - 60) / 52)));
  return (
    <>
      {labels.map((l, i) =>
        i % every ? null : (
          <text key={i} className="ax" x={x0 + i * bw + bw / 2} y={H - 8} textAnchor="middle">
            {l}
          </text>
        ),
      )}
    </>
  );
}

function draw(sp: ChartSpec, W: number): { svg: ReactNode; H: number } {
  const H = sp.h || 220;
  const f = sp.fmt || ((v: number) => compact(v));
  const m = { l: sp.ml || (W < 420 ? 44 : 56), r: 12, t: 12, b: 28 };
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;
  const out: ReactNode[] = [];
  if (sp.type === 'line' || sp.type === 'bars' || sp.type === 'stack') {
    const n = sp.labels.length;
    const bw = iw / n;
    const tot = sp.type === 'stack' ? sp.labels.map((_, i) => sp.series.reduce((a, se) => a + se.v[i], 0)) : [];
    const mx = niceMax(sp.type === 'stack' ? Math.max(...tot) : Math.max(...sp.series.flatMap((se) => se.v)));
    const y = (v: number) => m.t + ih - (v / mx) * ih;
    out.push(<YAxis key="y" m={m} W={W} H={H} mx={mx} fmt={f} />);
    if (sp.type === 'line') {
      sp.series.forEach((se, j) => {
        const c = se.c || CC[j];
        out.push(
          <g key={'s' + j}>
            <polyline fill="none" stroke={c} strokeWidth={se.dash ? 1.8 : 2.4} strokeDasharray={se.dash ? '5 4' : undefined} strokeLinejoin="round" points={se.v.map((v, i) => `${m.l + i * bw + bw / 2},${y(v)}`).join(' ')} />
            {se.v.map((v, i) => (
              <circle key={i} cx={m.l + i * bw + bw / 2} cy={y(v)} r={se.dash ? 2 : 3} fill="var(--surface)" stroke={c} strokeWidth={2}>
                <title>{`${se.n} · ${sp.labels[i]}: ${f(v)}`}</title>
              </circle>
            ))}
          </g>,
        );
      });
    } else if (sp.type === 'bars') {
      const k = sp.series.length;
      const gw = bw * 0.76;
      const w = gw / k;
      sp.series.forEach((se, j) =>
        se.v.forEach((v, i) =>
          out.push(
            <rect key={`b${j}-${i}`} x={m.l + i * bw + bw * 0.12 + j * w} y={y(v)} width={Math.max(1, w - 1.5)} height={Math.max(0, m.t + ih - y(v))} rx={2} fill={se.c || CC[j]}>
              <title>{`${se.n} · ${sp.labels[i]}: ${f(v)}`}</title>
            </rect>,
          ),
        ),
      );
    } else {
      sp.labels.forEach((_, i) => {
        let acc = 0;
        sp.series.forEach((se, j) => {
          const v = se.v[i];
          out.push(
            <rect key={`k${j}-${i}`} x={m.l + i * bw + bw * 0.18} y={y(acc + v)} width={bw * 0.64} height={Math.max(0, y(acc) - y(acc + v))} fill={se.c || CC[j]}>
              <title>{`${se.n} · ${sp.labels[i]}: ${f(v)}`}</title>
            </rect>,
          );
          acc += v;
        });
      });
    }
    out.push(<XLabels key="x" labels={sp.labels} x0={m.l} bw={bw} H={H} W={W} />);
  } else if (sp.type === 'waterfall') {
    const it = sp.items;
    const bw = iw / it.length;
    let run = 0;
    const tops: [number, number][] = [];
    it.forEach((x) => {
      if (x.t === 'total') {
        tops.push([0, x.v]);
        run = x.v;
      } else if (x.t === 'up') {
        tops.push([run, run + x.v]);
        run += x.v;
      } else {
        tops.push([run - x.v, run]);
        run -= x.v;
      }
    });
    const mx = niceMax(Math.max(...tops.map((t) => t[1])));
    const mn = Math.max(0, Math.floor((Math.min(...tops.map((t) => t[0])) * 0.9) / (mx / 20)) * (mx / 20));
    const y = (v: number) => m.t + ih - ((v - mn) / (mx - mn)) * ih;
    for (let i = 0; i <= 4; i++) {
      const v = mn + ((mx - mn) * i) / 4;
      const yy = y(v);
      out.push(
        <g key={'g' + i}>
          <line className="gridl" x1={m.l} x2={W - m.r} y1={yy} y2={yy} />
          <text className="ax" x={m.l - 6} y={yy + 4} textAnchor="end">
            {f(v)}
          </text>
        </g>,
      );
    }
    it.forEach((x, i) => {
      const [a, b] = tops[i];
      const c = x.t === 'total' ? 'var(--c1)' : x.t === 'up' ? 'var(--c2)' : 'var(--danger)';
      const sg = x.t === 'down' ? '−' : x.t === 'up' ? '+' : '';
      out.push(
        <g key={'w' + i}>
          <rect x={m.l + i * bw + bw * 0.18} y={y(b)} width={bw * 0.64} height={Math.max(1, y(a) - y(b))} rx={2} fill={c}>
            <title>{`${x.n}: ${sg}${f(x.v)}`}</title>
          </rect>
          <text className="ax strong" x={m.l + i * bw + bw / 2} y={y(b) - 5} textAnchor="middle">
            {sg + f(x.v)}
          </text>
          {i < it.length - 1 ? <line x1={m.l + i * bw + bw * 0.82} x2={m.l + (i + 1) * bw + bw * 0.18} y1={y(x.t === 'down' ? a : b)} y2={y(x.t === 'down' ? a : b)} stroke="var(--border-strong)" strokeDasharray="3 3" /> : null}
        </g>,
      );
    });
    out.push(<XLabels key="x" labels={it.map((x) => x.n)} x0={m.l} bw={bw} H={H} W={W} />);
  } else if (sp.type === 'hbar') {
    const it = sp.items;
    const lw = Math.min(150, W * 0.34);
    const rh = Math.min(30, (H - 16) / it.length);
    const mx = sp.max || niceMax(Math.max(...it.map((x) => x.v)));
    const bx = lw + 8;
    const bwid = Math.max(10, W - bx - 60);
    it.forEach((x, i) => {
      const yy = 8 + i * rh;
      out.push(
        <g key={'h' + i}>
          <text className="ax" x={lw} y={yy + rh / 2 + 4} textAnchor="end">
            {trunc(x.n)}
          </text>
          <rect x={bx} y={yy + rh * 0.18} width={bwid} height={rh * 0.64} rx={3} fill="var(--surface-3)" />
          <rect x={bx} y={yy + rh * 0.18} width={Math.max(1, (x.v / mx) * bwid)} height={rh * 0.64} rx={3} fill={x.c || 'var(--c1)'}>
            <title>{`${x.n}: ${f(x.v)}`}</title>
          </rect>
          <text className="ax strong" x={bx + bwid + 6} y={yy + rh / 2 + 4}>
            {f(x.v)}
          </text>
        </g>,
      );
    });
    (sp.marks || []).forEach((t) => {
      const xx = bx + (t / mx) * bwid;
      out.push(
        <g key={'m' + t}>
          <line x1={xx} x2={xx} y1={4} y2={8 + it.length * rh} stroke="var(--border-strong)" strokeDasharray="3 3" />
          <text className="ax" x={xx} y={8 + it.length * rh + 12} textAnchor="middle">
            {t} %
          </text>
        </g>,
      );
    });
  } else if (sp.type === 'funnel') {
    const it = sp.items;
    const mx = it[0]?.v || 1;
    const rh = (H - 10) / Math.max(1, it.length);
    it.forEach((x, i) => {
      const w = Math.max(30, ((W - 170) * x.v) / mx);
      const xx = 150 + (W - 170 - w) / 2;
      const yy = 5 + i * rh;
      out.push(
        <g key={'f' + i}>
          <text className="ax" x={140} y={yy + rh / 2 + 4} textAnchor="end">
            {x.n}
          </text>
          <rect x={xx} y={yy + 3} width={w} height={Math.max(1, rh - 6)} rx={4} fill="var(--c1)" fillOpacity={1 - i * 0.13}>
            <title>{`${x.n}: ${f(x.v)}`}</title>
          </rect>
          <text className="ax strong on-c" x={xx + w / 2} y={yy + rh / 2 + 4} textAnchor="middle">
            {f(x.v)}
            {i && it[i - 1].v ? ` · ${Math.round((x.v / it[i - 1].v) * 100)} %` : ''}
          </text>
        </g>,
      );
    });
  } else if (sp.type === 'heat') {
    const R = sp.rows;
    const Cc = sp.cols;
    const lw = 110;
    const cw = (W - lw - 10) / Cc.length;
    const rh = Math.min(34, (H - 26) / R.length);
    const mx = Math.max(1, ...sp.data.flat());
    R.forEach((r, i) => {
      out.push(
        <text key={'r' + i} className="ax" x={lw - 8} y={6 + i * rh + rh / 2 + 4} textAnchor="end">
          {r}
        </text>,
      );
      Cc.forEach((c, j) => {
        const v = sp.data[i][j];
        out.push(
          <g key={`c${i}-${j}`}>
            <rect x={lw + j * cw + 1} y={6 + i * rh + 1} width={Math.max(1, cw - 2)} height={rh - 2} rx={4} fill="var(--heat)" fillOpacity={0.08 + (0.92 * v) / mx}>
              <title>{`${r} · ${c}: ${v} tickets`}</title>
            </rect>
            <text className={`ax${v / mx > 0.55 ? ' on-c' : ''}`} x={lw + j * cw + cw / 2} y={6 + i * rh + rh / 2 + 4} textAnchor="middle">
              {v}
            </text>
          </g>,
        );
      });
    });
    Cc.forEach((c, j) =>
      out.push(
        <text key={'h' + j} className="ax" x={lw + j * cw + cw / 2} y={6 + R.length * rh + 14} textAnchor="middle">
          {c}
        </text>,
      ),
    );
  } else if (sp.type === 'donut') {
    const it = sp.items;
    const t = it.reduce((a, x) => a + x.v, 0) || 1;
    const cx = Math.min(W / 2, 110);
    const cy = H / 2;
    const R = Math.min(H / 2 - 8, 80);
    const r0 = R * 0.62;
    let a0 = -Math.PI / 2;
    const p = (a: number, rr: number) => `${cx + rr * Math.cos(a)},${cy + rr * Math.sin(a)}`;
    it.forEach((x, j) => {
      const a1 = a0 + (x.v / t) * 2 * Math.PI;
      const lg = a1 - a0 > Math.PI ? 1 : 0;
      out.push(
        <path key={'d' + j} d={`M${p(a0, R)}A${R},${R} 0 ${lg} 1 ${p(a1, R)}L${p(a1, r0)}A${r0},${r0} 0 ${lg} 0 ${p(a0, r0)}Z`} fill={x.c || CC[j]}>
          <title>{`${x.n}: ${Math.round((x.v / t) * 100)} %`}</title>
        </path>,
      );
      a0 = a1;
    });
    out.push(
      <g key="ctr">
        <text className="ax strong big" x={cx} y={cy + 2} textAnchor="middle">
          {Math.round(((it[0]?.v || 0) / t) * 100)} %
        </text>
        <text className="ax" x={cx} y={cy + 18} textAnchor="middle">
          {it[0]?.n}
        </text>
      </g>,
    );
    it.forEach((x, j) =>
      out.push(
        <g key={'l' + j}>
          <rect x={cx + R + 24} y={cy - it.length * 11 + j * 22} width={10} height={10} rx={2} fill={x.c || CC[j]} />
          <text className="ax" x={cx + R + 40} y={cy - it.length * 11 + j * 22 + 9}>
            {`${x.n} · ${Math.round((x.v / t) * 100)} % (${f(x.v)})`}
          </text>
        </g>,
      ),
    );
  }
  return { svg: out, H };
}

/** Gráfico a escala (div.kchart con su SVG y leyenda). */
export function SpecChart({ spec, id }: { spec: ChartSpec; id?: string }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const W = Math.max(260, w);
  const { svg, H } = draw(spec, W);
  const series = 'series' in spec ? spec.series : null;
  return (
    <div className="kchart" ref={ref} id={id}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={spec.title || 'Gráfico'}>
        {svg}
      </svg>
      {series && series.length > 1 ? (
        <div className="legend" style={{ marginTop: 6 }}>
          {series.map((se, j) => (
            <span key={j}>
              <i style={{ background: se.c || CC[j], ...(se.dash ? { height: 3, verticalAlign: 3 } : {}) }} />
              {se.n}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Tarjeta con un gráfico (chartBox del prototipo). */
export function ChartBox({ title, sub, spec, wide, h3 = true }: { title: string; sub?: string; spec: ChartSpec; wide?: boolean; h3?: boolean }) {
  return (
    <section className={`card${wide ? ' kwide' : ''}`}>
      <div className="card-h">
        {h3 ? <h3 className="sec">{title}</h3> : <h2 className="sec">{title}</h2>}
        {sub ? <span className="sub">{sub}</span> : null}
      </div>
      <div className="card-b">
        <SpecChart spec={{ title, ...spec }} />
      </div>
    </section>
  );
}

/** Mini serie de la tarjeta (sparkSvg). */
export function Spark({ v, cls }: { v: number[]; cls: string }) {
  const W = 120;
  const H = 34;
  const mn = Math.min(...v);
  const mx = Math.max(...v);
  const r = mx - mn || 1;
  const pts = v.map((x, i) => [(i * (W - 4)) / (v.length - 1) + 2, H - 3 - ((x - mn) / r) * (H - 8)]);
  const last = pts[pts.length - 1];
  return (
    <svg className={`spark ${cls}`} viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true">
      <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r={2.6} fill="currentColor" />
    </svg>
  );
}
