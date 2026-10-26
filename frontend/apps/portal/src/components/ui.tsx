/**
 * Piezas visuales compartidas del portal (mismo lenguaje que el admin): cabecera de
 * página, banner de bienvenida, avisos, tarjetas de indicadores, tarjetas, tablas,
 * badges de estado, vacíos, paginación y campos de formulario. Solo presentación.
 */
import type { CSSProperties, ReactNode } from 'react';
import { Icon } from '@hub/ui';

export type Tone = '' | 'ok' | 'warn' | 'danger' | 'info' | 'high';

/* ---------- Cabeceras ---------- */
export function PageHead({ title, lead, actions, back }: { title: ReactNode; lead?: ReactNode; actions?: ReactNode; back?: { label: string; onClick: () => void } }) {
  return (
    <div className="phead" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
      <div>
        {back ? (
          <button type="button" className="btn sm ghost" onClick={back.onClick} style={{ paddingLeft: 0, marginBottom: 6 }}>
            ← {back.label}
          </button>
        ) : null}
        <h1>{title}</h1>
        {lead ? <p className="lead">{lead}</p> : null}
      </div>
      {actions ? <div className="acts">{actions}</div> : null}
    </div>
  );
}

/** Banner azul de bienvenida del resumen. */
export function Hello({ title, text, actions }: { title: ReactNode; text?: ReactNode; actions?: ReactNode }) {
  return (
    <section className="hello">
      <div>
        <h1>{title}</h1>
        {text ? <p>{text}</p> : null}
      </div>
      {actions ? <div className="acts">{actions}</div> : null}
    </section>
  );
}

/** Cabecera de detalle (icono grande, título, subtítulo, badge y acciones). */
export function DetailHead({ icon, title, text, chip, actions }: { icon: string; title: ReactNode; text?: ReactNode; chip?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="dhead">
      <div className="ico">
        <Icon name={icon} />
      </div>
      <div className="tt">
        <h1>{title}</h1>
        {text ? <p>{text}</p> : null}
        {chip ? <div style={{ marginTop: 8 }}>{chip}</div> : null}
      </div>
      {actions ? <div className="acts">{actions}</div> : null}
    </div>
  );
}

/* ---------- Avisos y estados ---------- */
export function Alert({ tone = 'info', icon, title, text, action, role = 'status' }: { tone?: Tone; icon?: string; title?: ReactNode; text?: ReactNode; action?: ReactNode; role?: 'alert' | 'status' }) {
  const ic = icon ?? (tone === 'danger' ? 'receipt' : tone === 'warn' ? 'tri' : 'check');
  return (
    <div className={`alert ${tone}`} role={role}>
      <span className="ico">
        <Icon name={ic} />
      </span>
      <div className="tx">
        {title ? <b>{title}</b> : null}
        {text ? <small>{text}</small> : null}
      </div>
      {action}
    </div>
  );
}

export function Chip({ tone = '', outline, children, style }: { tone?: Tone; outline?: boolean; children: ReactNode; style?: CSSProperties }) {
  return (
    <span className={`chip ${tone}${outline ? ' outline' : ''}`} style={style}>
      {children}
    </span>
  );
}

export function Note({ tone, children }: { tone?: 'warn'; children: ReactNode }) {
  return <div className={`note${tone ? ` ${tone}` : ''}`}>{children}</div>;
}

export function Empty({ children, icon }: { children: ReactNode; icon?: string }) {
  return (
    <div className="card-b empty">
      {icon ? (
        <span className="ring">
          <Icon name={icon} />
        </span>
      ) : null}
      {children}
    </div>
  );
}

export function Loading({ text = 'Cargando…', inCard }: { text?: string; inCard?: boolean }) {
  return (
    <p className={inCard ? 'card-b sub' : 'sub'} role="status" style={{ color: 'var(--muted)', margin: inCard ? undefined : 0 }}>
      {text}
    </p>
  );
}

/* ---------- Indicadores ---------- */
export function Kpis({ children }: { children: ReactNode }) {
  return (
    <section className="kpis" aria-label="Indicadores clave">
      {children}
    </section>
  );
}

export function Kpi({ label, icon, tone = '', value, meta, metaColor, onClick }: { label: ReactNode; icon: string; tone?: 'ok' | 'warn' | ''; value: ReactNode; meta?: ReactNode; metaColor?: string; onClick?: () => void }) {
  return (
    <div className="card kpi" onClick={onClick} style={onClick ? { cursor: 'pointer' } : undefined} role={onClick ? 'button' : undefined}>
      <span className="lbl">
        <span className={`ico ${tone}`}>
          <Icon name={icon} className="sm" />
        </span>
        {label}
      </span>
      <span className="val num">{value}</span>
      {meta ? (
        <span className="meta" style={metaColor ? { color: metaColor } : undefined}>
          {meta}
        </span>
      ) : null}
    </div>
  );
}

/* ---------- Tarjetas ---------- */
export function Card({ title, icon, sub, actions, children, className, style }: { title?: ReactNode; icon?: string; sub?: ReactNode; actions?: ReactNode; children?: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <section className={`card${className ? ` ${className}` : ''}`} style={style}>
      {title || actions ? (
        <div className="card-h" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {title ? (
            <h2 className="sec">
              {icon ? <Icon name={icon} className="sm" /> : null} {title}
            </h2>
          ) : (
            <span />
          )}
          {sub ? <span className="sub">{sub}</span> : null}
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function CardBody({ children, style, className }: { children: ReactNode; style?: CSSProperties; className?: string }) {
  return (
    <div className={`card-b${className ? ` ${className}` : ''}`} style={style}>
      {children}
    </div>
  );
}

/** Pie de tarjeta con acciones (a la derecha o repartidas). */
export function CardFoot({ children, between }: { children: ReactNode; between?: boolean }) {
  return (
    <div className="card-b" style={{ display: 'flex', justifyContent: between ? 'space-between' : 'flex-end', alignItems: 'center', gap: 8, borderTop: '1px solid var(--border)', paddingTop: 14, flexWrap: 'wrap' }}>
      {children}
    </div>
  );
}

/* ---------- Tablas y listas ---------- */
export function Table({ cols, children }: { cols: Array<{ label: ReactNode; right?: boolean; style?: CSSProperties }>; children: ReactNode }) {
  return (
    <div className="tw">
      <table className="t">
        <thead>
          <tr>
            {cols.map((c, i) => (
              <th key={i} className={c.right ? 'r' : undefined} style={c.style}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Pager({ loading, prev, next, onPrev, onNext }: { loading: boolean; prev?: string | null; next?: string | null; onPrev: () => void; onNext: () => void }) {
  return (
    <div className="card-b" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
      <button type="button" className="btn sm" disabled={loading || !prev} onClick={onPrev}>
        Anterior
      </button>
      <button type="button" className="btn sm" disabled={loading || !next} onClick={onNext}>
        Siguiente
      </button>
    </div>
  );
}

export function Kv({ rows, cols = 'auto 1fr', style }: { rows: Array<[ReactNode, ReactNode] | null | false>; cols?: string; style?: CSSProperties }) {
  return (
    <dl className="kv" style={{ gridTemplateColumns: cols, ...style }}>
      {rows.map((r, i) =>
        r ? (
          <div key={i} style={{ display: 'contents' }}>
            <dt>{r[0]}</dt>
            <dd>{r[1]}</dd>
          </div>
        ) : null,
      )}
    </dl>
  );
}

export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: Array<{ id: T; label: ReactNode }>; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" aria-pressed={value === o.id} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- Formularios ---------- */
export function Field({ label, error, children, style }: { label: ReactNode; error?: string; children: ReactNode; style?: CSSProperties }) {
  return (
    <label className="field" style={style}>
      {label}
      {children}
      {error ? <span className="err">{error}</span> : null}
    </label>
  );
}

export function FormGrid({ children }: { children: ReactNode }) {
  return (
    <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
      {children}
    </div>
  );
}
