/**
 * Componentes básicos equivalentes a los helpers HTML del prototipo
 * (crumbs, phead, chip, dayChip, capBar, slaBar, emptyState, pager, kpis,
 * tabsBar, swBtn, brandTag…). Todos usan las clases de styles/panel.css.
 */
import { Fragment, useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { useApp } from '../app/context';
import { href, type RouteId } from '../app/routeMeta';
import { BR, CBY, SEV, SLA, slaLeft } from '../data/db';
import { fmtMin, NF0 } from '../data/format';
import type { BrandId, Sev, Ticket } from '../data/types';
import { Icon, SevIcon } from './Icon';

/* =================== Navegación =================== */
export interface LinkProps {
  to: RouteId;
  param?: string | null;
  className?: string;
  style?: CSSProperties;
  title?: string;
  'aria-label'?: string;
  children: ReactNode;
}
/** Enlace interno (#ruta/param). */
export function Link({ to, param, children, ...rest }: LinkProps) {
  return (
    <a href={href(to, param)} {...rest}>
      {children}
    </a>
  );
}
/** Nombre del cliente enlazado a su ficha (cl1 del prototipo). `sub` añade la marca debajo. */
export function ClientLink({ cid, sub, light }: { cid: string; sub?: boolean; light?: boolean }) {
  const c = CBY[cid];
  if (!c) return <span className="sub">—</span>;
  return (
    <>
      <a className="rowlink" style={light ? { fontWeight: 500 } : undefined} href={href('cliente', cid)}>
        {c.name}
      </a>
      {sub ? <div className="sub">{BR[c.brand].n}</div> : null}
    </>
  );
}

/* =================== Cabecera de página =================== */
export type Crumb = [string, RouteId?, string?];
/** Migas de pan: siempre empiezan en «Inicio». items: [etiqueta, ruta?, param?] */
export function Crumbs({ items }: { items: Crumb[] }) {
  return (
    <nav className="crumbs" aria-label="Migas de pan">
      <a href="#inicio">Inicio</a>
      {items.map(([l, r, p], i) => (
        <span key={i} style={{ display: 'contents' }}>
          <Icon name="cr" />
          {i === items.length - 1 || !r ? <span aria-current={i === items.length - 1 ? 'page' : undefined}>{l}</span> : <a href={href(r, p)}>{l}</a>}
        </span>
      ))}
    </nav>
  );
}
export interface PageHeadProps {
  title: ReactNode;
  sub?: ReactNode;
  /** Botones a la derecha */
  actions?: ReactNode;
  /** Migas (sin «Inicio», se agrega solo) */
  crumbs?: Crumb[];
}
/**
 * Cabecera estándar (crumbs + phead). El h1 lleva id="ph1" y tabIndex=-1:
 * el shell lo enfoca al cambiar de ruta.
 */
export function PageHead({ title, sub, actions, crumbs }: PageHeadProps) {
  return (
    <>
      {crumbs ? <Crumbs items={crumbs} /> : null}
      <div className="phead">
        <div>
          <h1 tabIndex={-1} id="ph1">
            {title}
          </h1>
          {sub ? <p>{sub}</p> : null}
        </div>
        {actions ? <div className="acts">{actions}</div> : null}
      </div>
    </>
  );
}

/* =================== Tarjetas =================== */
export interface CardProps {
  title?: ReactNode;
  /** Texto pequeño a la derecha del título (.sub) */
  sub?: ReactNode;
  /** Acciones a la derecha de la cabecera */
  actions?: ReactNode;
  /** Pie (.card-f) */
  footer?: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Envuelve children en .card-b */
  body?: boolean;
  id?: string;
  'aria-label'?: string;
  children?: ReactNode;
}
/** <section class="card"> con cabecera opcional (h2.sec). */
export function Card({ title, sub, actions, footer, className, style, body, id, children, ...rest }: CardProps) {
  return (
    <section className={['card', className].filter(Boolean).join(' ')} style={style} id={id} aria-label={rest['aria-label']}>
      {title != null || actions ? (
        <div className="card-h">
          {title != null ? <h2 className="sec">{title}</h2> : <span />}
          {sub ? <span className="sub">{sub}</span> : null}
          {actions}
        </div>
      ) : null}
      {body ? <div className="card-b">{children}</div> : children}
      {footer ? <div className="card-f">{footer}</div> : null}
    </section>
  );
}

export interface KpiCardProps {
  label: string;
  icon?: string;
  value: ReactNode;
  meta?: ReactNode;
  /** Ruta a la que lleva toda la tarjeta */
  to?: RouteId;
  param?: string;
}
/** Tarjeta KPI (prototipo kpi() de Inicio). */
export function KpiCard({ label, icon, value, meta, to, param }: KpiCardProps) {
  return (
    <div className="card kpi">
      <span className="lbl">
        {icon ? <Icon name={icon} size="sm" /> : null}
        {label}
      </span>
      <div className="val">{value}</div>
      {meta ? <div className="meta">{meta}</div> : null}
      {to ? <a className="cover" href={href(to, param)} aria-label={`${label}: ver detalle`} /> : null}
    </div>
  );
}

export interface StatItem {
  label: string;
  value: ReactNode;
  /** Color del valor: 'danger' | 'warn' | 'high' | 'ok' | 'info' */
  tone?: 'danger' | 'warn' | 'high' | 'ok' | 'info' | '';
  /** Si se indica, el tile es clicable y lleva a esa ruta (con filtro opcional en `param`). */
  to?: RouteId;
  param?: string;
}
/** Franja de estadísticas en tarjeta (kpis()/statline del prototipo). Los tiles con `to` son enlaces a su lista ya filtrada. */
export function StatLine({ items, style }: { items: StatItem[]; style?: CSSProperties }) {
  return (
    <div className="card" style={{ marginBottom: 16, ...style }}>
      <div className="statline">
        {items.map((x, i) => (
          <div key={i} style={x.to ? { position: 'relative' } : undefined}>
            <small>{x.label}</small>
            <b style={x.tone ? { color: `var(--${x.tone}-text)` } : undefined}>{x.value}</b>
            {x.to ? <a className="cover" href={href(x.to, x.param)} aria-label={`${x.label}: ver lista`} /> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

/* =================== Chips =================== */
export type ChipKind = 'ok' | 'warn' | 'high' | 'danger' | 'info' | 'outline' | 'neutral' | '';
export function Chip({ kind, icon, children, title, style, className }: { kind?: ChipKind | string; icon?: string; children: ReactNode; title?: string; style?: CSSProperties; className?: string }) {
  return (
    <span className={['chip', kind && kind !== 'neutral' ? kind : '', className].filter(Boolean).join(' ')} title={title} style={style}>
      {icon ? <Icon name={icon} /> : null}
      {children}
    </span>
  );
}
/** Clase de chip por estado (stChip del prototipo). */
export const ST_CHIP: Record<string, ChipKind> = { Activo: 'ok', Moroso: 'warn', Suspendido: 'danger', Inactivo: '', Cancelado: '', Pagada: 'ok', Pendiente: 'info', Vencida: 'danger', Parcial: 'warn', Aplicada: '', Anulada: '' };
export const StatusChip = ({ status }: { status: string }) => <Chip kind={ST_CHIP[status] ?? ''}>{status}</Chip>;
export function SunatChip({ s }: { s: string }) {
  return (
    <Chip kind={s === 'Aceptada' ? 'ok' : s === 'Pendiente' ? 'warn' : s === 'Rechazada' ? 'danger' : 'high'} icon={s === 'Aceptada' ? 'check' : s === 'Rechazada' ? 'x' : 'clock'}>
      {s === 'Aceptada' ? 'Aceptada SUNAT' : s}
    </Chip>
  );
}
export function PrioChip({ p }: { p: Sev }) {
  return (
    <span className={`chip ${p === 'critica' ? 'danger' : p === 'alta' ? 'high' : p === 'media' ? 'info' : ''}`} style={{ paddingLeft: 4 }}>
      <SevIcon sev={p} small />
      {SEV[p].l}
    </span>
  );
}
/** Chip de días restantes: vencido, hoy, ≤7, ≤30, resto. */
export function DayChip({ n }: { n: number }) {
  if (n < 0) return <Chip kind="danger" icon="oct" className="daychip">Vencido {-n} d</Chip>;
  if (n === 0) return <Chip kind="danger" icon="tri" className="daychip">Hoy</Chip>;
  if (n <= 7) return <Chip kind="high" icon="tri" className="daychip">{n} d</Chip>;
  if (n <= 30) return <Chip kind="warn" icon="clock" className="daychip">{n} d</Chip>;
  return <Chip className="daychip">{n} d</Chip>;
}
export function BrandTag({ brand }: { brand: BrandId }) {
  return (
    <span className="brand-tag">
      <i style={{ background: BR[brand].c }} />
      {BR[brand].n}
    </span>
  );
}

/* =================== Barras =================== */
/** Nivel de color por porcentaje: l1 <70, l2 70–85, l3 85–95, l4 ≥95. */
export const levelOf = (p: number): 'l1' | 'l2' | 'l3' | 'l4' => (p >= 95 ? 'l4' : p >= 85 ? 'l3' : p >= 70 ? 'l2' : 'l1');
/** Barra de capacidad con marcas en 70/85/95 (capBar). */
export function CapBar({ p, label, detail }: { p: number; label?: ReactNode; detail?: ReactNode }) {
  return (
    <div className="cap">
      <div className="cap-top">
        <span>{label}</span>
        <span className="num">
          <b>{p} %</b>
          {detail ? (
            <>
              {' · '}
              <span style={{ color: 'var(--muted)' }}>{detail}</span>
            </>
          ) : null}
        </span>
      </div>
      <div className="bar" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p} aria-label={`${typeof label === 'string' ? label : ''} ${p} %`}>
        <i className={levelOf(p)} style={{ width: `${Math.min(100, p)}%` }} />
        <span className="tick" style={{ left: '70%' }} />
        <span className="tick" style={{ left: '85%' }} />
        <span className="tick" style={{ left: '95%' }} />
      </div>
    </div>
  );
}
/** Barra delgada de porcentaje (pctBar). `level` fuerza la clase l1..l4. */
export function PctBar({ p, label, level, thin = true }: { p: number; label?: string; level?: 'l1' | 'l2' | 'l3' | 'l4'; thin?: boolean }) {
  const l = level || (p >= 100 ? 'l4' : p >= 85 ? 'l3' : p >= 70 ? 'l2' : 'l1');
  return (
    <div className={`bar${thin ? ' thin' : ''}`} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p)} aria-label={label || ''}>
      <i className={l} style={{ width: `${Math.min(100, Math.max(0, p))}%` }} />
    </div>
  );
}
/** SLA restante de un ticket (slaBar). */
export function SlaBar({ t }: { t: Ticket }) {
  if (t.status === 'Resuelto') return <Chip kind="ok" icon="check">Cumplido</Chip>;
  const left = slaLeft(t);
  const tot = SLA[t.prio].res * 60;
  const used = Math.min(100, Math.max(0, (1 - left / tot) * 100));
  const l = left < 0 ? 'l4' : left < tot * 0.25 ? 'l3' : left < tot * 0.5 ? 'l2' : 'l1';
  const txt = left < 0 ? `Fuera de SLA hace ${fmtMin(-left)}` : `Quedan ${fmtMin(left)}`;
  return (
    <div className="sla">
      <div className="bar thin">
        <i className={l} style={{ width: `${left < 0 ? 100 : used}%` }} />
      </div>
      <small style={{ color: left < 0 ? 'var(--danger-text)' : left < tot * 0.25 ? 'var(--high-text)' : 'var(--muted)', fontWeight: left < tot * 0.25 ? 700 : 500 }}>{txt}</small>
    </div>
  );
}
/** Leyenda de colores: [[color CSS, etiqueta], …] */
export function Legend({ items }: { items: [string, ReactNode][] }) {
  return (
    <span className="legend">
      {items.map(([c, l], i) => (
        <span key={i}>
          <i style={{ background: c }} />
          {l}
        </span>
      ))}
    </span>
  );
}

/* =================== Estados =================== */
export type SkeletonVariant = 'table' | 'detail';

export interface SkeletonProps {
  /** Forma del contenido que se está cargando. */
  variant?: SkeletonVariant;
  /** Cantidad de filas o bloques a mostrar. */
  rows?: number;
  className?: string;
  style?: CSSProperties;
}

/** Indicador de carga para listas, tablas y bloques de ficha. */
export function Skeleton({ variant = 'table', rows = 5, className, style }: SkeletonProps) {
  const count = Math.max(1, Math.floor(rows));
  const tableWidths = [
    ['42%', '18%', '24%', '16%', '62%'],
    ['55%', '24%', '18%', '28%', '48%'],
    ['36%', '20%', '30%', '14%', '72%'],
    ['48%', '16%', '22%', '24%', '56%'],
  ];
  const detailWidths = ['34%', '58%', '44%', '68%', '50%'];

  return (
    <div className={['loading-skeleton', `loading-skeleton--${variant}`, className].filter(Boolean).join(' ')} aria-busy="true" role="status" aria-label="Cargando" style={style}>
      <span className="sr-only">Cargando</span>
      {variant === 'table'
        ? Array.from({ length: count }, (_, i) => (
            <div key={i} className="loading-skeleton__table-row" aria-hidden="true">
              {tableWidths[i % tableWidths.length].map((width, j) => <span key={j} className="skel loading-skeleton__bar" style={{ width }} />)}
            </div>
          ))
        : Array.from({ length: count }, (_, i) => (
            <div key={i} className="loading-skeleton__detail-row" aria-hidden="true">
              <span className="skel loading-skeleton__bar loading-skeleton__bar--label" style={{ width: detailWidths[i % detailWidths.length] }} />
              <span className="skel loading-skeleton__bar" style={{ width: i % 2 ? '74%' : '88%' }} />
            </div>
          ))}
    </div>
  );
}

export interface SpinnerProps {
  size?: 'sm' | 'md';
  /** Centra el spinner como bloque dentro de su contenedor. */
  centered?: boolean;
  label?: string;
  className?: string;
}

/** Indicador de carga para acciones puntuales o fichas individuales. */
export function Spinner({ size = 'md', centered = false, label = 'Cargando', className }: SpinnerProps) {
  return <span className={['spinner', `spinner--${size}`, centered ? 'spinner--centered' : '', className].filter(Boolean).join(' ')} role="status" aria-label={label}><span className="sr-only">{label}</span></span>;
}

export function EmptyState({ title, text, action, icon = 'search' }: { title: string; text?: ReactNode; action?: ReactNode; icon?: string }) {
  return (
    <div className="empty">
      <div className="ring">
        <Icon name={icon} size="lg" />
      </div>
      <b>{title}</b>
      {text ? <span>{text}</span> : null}
      {action}
    </div>
  );
}
/** Aviso informativo (.note). kind 'warn' = fondo amarillo. */
export function Note({ kind, icon = 'info', children, style, role }: { kind?: 'warn'; icon?: string; children: ReactNode; style?: CSSProperties; role?: string }) {
  return (
    <div className={`note${kind ? ' ' + kind : ''}`} style={style} role={role}>
      <Icon name={icon} size="sm" />
      <span>{children}</span>
    </div>
  );
}
/** Lista de definiciones clave/valor (.kv). */
export function Kv({ items, style }: { items: [ReactNode, ReactNode][]; style?: CSSProperties }) {
  return (
    <dl className="kv" style={style}>
      {items.map(([a, b], i) => (
        <Fragment key={i}>
          <dt>{a}</dt>
          <dd>{b}</dd>
        </Fragment>
      ))}
    </dl>
  );
}
/** Esqueleto de carga de página (se muestra al cambiar de ruta). */
export function PageSkeleton() {
  const b = (w: string, h: number) => <div className="skel" style={{ width: w, height: h }} />;
  return (
    <div aria-busy="true" aria-label="Cargando">
      {b('180px', 12)}
      <div style={{ height: 10 }} />
      {b('280px', 26)}
      <div style={{ height: 22 }} />
      <div className="grid g-kpi">
        {[1, 2, 3, 4, 5].map((k) => (
          <div key={k} className="card kpi">
            {b('60%', 12)}
            {b('80%', 24)}
            {b('50%', 10)}
          </div>
        ))}
      </div>
      <div style={{ height: 16 }} />
      <div className="grid g-2">
        <div className="card" style={{ padding: 16 }}>
          {b('40%', 14)}
          <div style={{ height: 14 }} />
          {b('100%', 220)}
        </div>
        <div className="card" style={{ padding: 16 }}>
          {[1, 2, 3, 4, 5].map((k) => (
            <div key={k}>
              {b('100%', 36)}
              <div style={{ height: 10 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* =================== Controles =================== */
/** Paginador (pager): page base 0. */
export function Pager({ page, total, per, onPage }: { page: number; total: number; per: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / per));
  return (
    <div className="pager">
      <span>
        Mostrando {total ? page * per + 1 : 0}–{Math.min(total, (page + 1) * per)} de {NF0.format(total)}
      </span>
      <div className="btns">
        <button type="button" className="btn sm" disabled={page <= 0} onClick={() => onPage(page - 1)} aria-label="Página anterior">
          <Icon name="cl" size="sm" />
          Anterior
        </button>
        <button type="button" className="btn sm" disabled={page >= pages - 1} onClick={() => onPage(page + 1)} aria-label="Página siguiente">
          Siguiente
          <Icon name="cr" size="sm" />
        </button>
      </div>
    </div>
  );
}

export interface TabDef<K extends string = string> {
  id: K;
  label: ReactNode;
  /** Contador (.cnt) */
  count?: number | null;
}
/** Pestañas accesibles (role=tablist, flechas ←/→). */
export function Tabs<K extends string>({ tabs, value, onChange, label, style, className }: { tabs: TabDef<K>[]; value: K; onChange: (k: K) => void; label: string; style?: CSSProperties; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const n = (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    onChange(tabs[n].id);
    const b = ref.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[n];
    b?.focus();
  };
  return (
    <div ref={ref} className={['tabs', className].filter(Boolean).join(' ')} role="tablist" aria-label={label} style={style}>
      {tabs.map((t, i) => (
        <button key={t.id} type="button" className="tab" role="tab" aria-selected={value === t.id} tabIndex={value === t.id ? 0 : -1} onClick={() => onChange(t.id)} onKeyDown={(e) => onKey(e, i)}>
          {t.label}
          {t.count != null ? <span className="cnt">{t.count}</span> : null}
        </button>
      ))}
    </div>
  );
}
/** Control segmentado (.seg) con aria-pressed. options: [valor, etiqueta, icono?] */
export function Seg<K extends string>({ options, value, onChange, label }: { options: [K, ReactNode, string?][]; value: K; onChange: (k: K) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(([k, l, ic]) => (
        <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}>
          {ic ? <Icon name={ic} size="sm" /> : null}
          {l}
        </button>
      ))}
    </div>
  );
}
/** Interruptor (role=switch). Muestra «Sí/No» salvo que se pase children. */
export function Switch({ checked, onChange, label, children, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: string; children?: ReactNode; disabled?: boolean }) {
  return (
    <button type="button" className="switch" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}>
      <span className="trk" />
      {children ?? (checked ? 'Sí' : 'No')}
    </button>
  );
}
/** Buscador con icono (label.input-ic). */
export function SearchBox({ value, onChange, placeholder, label, style }: { value: string; onChange: (v: string) => void; placeholder?: string; label: string; style?: CSSProperties }) {
  return (
    <label className="input-ic" style={style}>
      <span className="sr-only">{label}</span>
      <Icon name="search" />
      <input className="input" type="search" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
/** <select class="select">. options: valores o [valor, etiqueta]. */
export function Select({ value, onChange, options, label, className, style, id, disabled }: { value: string; onChange: (v: string) => void; options: (string | [string, string])[]; label?: string; className?: string; style?: CSSProperties; id?: string; disabled?: boolean }) {
  return (
    <select id={id} className={['select', className].filter(Boolean).join(' ')} style={style} aria-label={label} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => {
        const [v, l] = Array.isArray(o) ? o : [o, o];
        return (
          <option key={v} value={v}>
            {l}
          </option>
        );
      })}
    </select>
  );
}
/** Campo con etiqueta (.field). */
export function Field({ label, children, full, hint, error, style }: { label: ReactNode; children: ReactNode; full?: boolean; hint?: ReactNode; error?: ReactNode; style?: CSSProperties }) {
  return (
    <label className={`field${full ? ' full' : ''}`} style={style}>
      {label}
      {children}
      {hint ? <small className="hint">{hint}</small> : null}
      {error ? <span className="err">{error}</span> : null}
    </label>
  );
}
/** Barra de herramientas de tabla (.toolbar). `count` se alinea a la derecha. */
export function Toolbar({ children, count, style }: { children?: ReactNode; count?: ReactNode; style?: CSSProperties }) {
  return (
    <div className="toolbar" style={style}>
      {children}
      {count != null ? <span className="count">{count}</span> : null}
    </div>
  );
}
/** Selector de marca reutilizable (incluye «Todas las marcas»), enlazado al contexto. */
export function BrandSelect({ className = 'select', style }: { className?: string; style?: CSSProperties }) {
  const { brand, setBrand } = useApp();
  return (
    <select className={className} style={style} aria-label="Marca" value={brand} onChange={(e) => setBrand(e.target.value as typeof brand)}>
      <option value="all">Todas las marcas</option>
      {Object.values(BR).map((b) => (
        <option key={b.id} value={b.id}>
          {b.n}
        </option>
      ))}
    </select>
  );
}

/* =================== Vista en construcción =================== */
export function UnderConstruction({ what }: { what?: string }) {
  return (
    <div className="card uc">
      <div className="ring">
        <Icon name="tasks" size="lg" />
      </div>
      <b>En construcción</b>
      <span>{what ? `La pantalla «${what}» se está implementando.` : 'Esta pantalla se está implementando.'}</span>
    </div>
  );
}
