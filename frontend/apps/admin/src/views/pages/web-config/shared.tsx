/**
 * Piezas compartidas por las vistas de Web y Configuración (WordPress,
 * Apariencia, Seguridad): logo y tarjeta de plan de las mini webs, caja de
 * shortcode con «Copiar» y un editor de texto enriquecido compacto.
 * Prototipo: mwLogo/mwPlanCard (l.2026-2034), scBox/copyText (l.2240-2246),
 * rte (l.3083-3130).
 */
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { useApp } from '../../../app/context';
import { Icon } from '../../../components/Icon';
import { Chip } from '../../../components/ui';
import { NF2, esc, mwBtnCls, type BrandId } from '../../../data';

/* ---------- Etiqueta discreta de función en desarrollo ---------- */
export function SoonNote({ label = 'Próximamente', children, style }: { label?: string; children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '0 0 12px', ...style }}>
      <Chip kind="outline" icon="info">{label}</Chip>
      <span className="sub">{children}</span>
    </div>
  );
}

/* ---------- Copiar al portapapeles ---------- */
export function copyText(t: string, toast: (a: string, b?: string, k?: 'ok' | 'info' | 'warn' | 'err') => void, field?: HTMLInputElement | null): void {
  const done = () => toast('Copiado al portapapeles', t.length > 70 ? t.slice(0, 67) + '…' : t);
  const fb = () => {
    let ok = false;
    const ta = document.createElement('textarea');
    ta.value = t;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    if (ok) done();
    else {
      if (field) {
        field.focus();
        field.select();
      }
      toast('Copie manualmente', 'El texto quedó seleccionado: use Ctrl+C.', 'warn');
    }
  };
  try {
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(done, fb);
    else fb();
  } catch {
    fb();
  }
}

/** Campo de solo lectura con el código y botón «Copiar» (.scbox). */
export function ScBox({ code, id, label = 'Shortcode' }: { code: string; id?: string; label?: string }) {
  const { toast } = useApp();
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="scbox">
      <input ref={ref} className="input mono" id={id} readOnly value={code} aria-label={label} onFocus={(e) => e.currentTarget.select()} />
      <button type="button" className="btn sm" onClick={() => copyText(code, toast, ref.current)}>
        <Icon name="layers" size="sm" />
        Copiar
      </button>
    </div>
  );
}

/* ---------- Mini web: logo y tarjeta de plan ---------- */
export { MwLogo } from '../../../components/MwLogo';

export interface PlanLike {
  name: string;
  disk: number;
  bw?: number;
  mails?: number;
  dbs?: number;
  sites?: number;
  feat?: boolean;
  p: { PEN: { m: number; a: number } };
}
/** Tarjeta de plan de la web (mwPlanCard). `per` = sufijo del precio. */
export function MwPlanCard({ p, brand, hl, per = '/mes' }: { p: PlanLike; brand: BrandId; hl?: boolean; per?: string }) {
  const sites = p.sites ?? 1;
  const fs = [
    `${p.disk} GB SSD NVMe`,
    p.bw ? `${p.bw} GB de transferencia` : 'Transferencia ilimitada',
    p.mails ? `${p.mails} cuentas de correo` : 'Correo no incluido',
    `${p.dbs ?? 0} bases de datos`,
    `${sites} ${sites === 1 ? 'sitio' : 'sitios'}`,
  ];
  return (
    <div className={['mw-plan', p.feat && 'destacado', hl && 'hl'].filter(Boolean).join(' ')}>
      {p.feat ? <span className="mw-tag">Más elegido</span> : null}
      <b className="mw-h">{p.name}</b>
      <div className="mw-price">
        <span>S/</span>
        {NF2.format(p.p.PEN.m)}
        <small>{per}</small>
      </div>
      <small className="mw-mut">S/ {NF2.format(p.p.PEN.a)} al año</small>
      <ul>
        {fs.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
      <span className={mwBtnCls(brand)}>Contratar</span>
    </div>
  );
}

/** Barra de navegador de la mini web. */
export function MwBar({ children }: { children: ReactNode }) {
  return (
    <div className="mw-bar">
      <i />
      <i />
      <i />
      <span>{children}</span>
    </div>
  );
}

/* ---------- Editor de texto enriquecido compacto ---------- */
const OK_TAGS = new Set(['P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'UL', 'OL', 'LI', 'A', 'DIV', 'SPAN']);
export function sanitize(html: string): string {
  const t = document.createElement('template');
  t.innerHTML = String(html || '');
  const walk = (n: Node) => {
    Array.from(n.childNodes).forEach((c) => {
      if (c.nodeType === 8) {
        (c as ChildNode).remove();
        return;
      }
      if (c.nodeType !== 1) return;
      const el = c as Element;
      if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'FORM', 'INPUT', 'BUTTON'].includes(el.tagName)) {
        el.remove();
        return;
      }
      walk(el);
      if (!OK_TAGS.has(el.tagName)) {
        el.replaceWith(...Array.from(el.childNodes));
        return;
      }
      Array.from(el.attributes).forEach((a) => {
        const keep = el.tagName === 'A' && a.name.toLowerCase() === 'href' && /^(https?:|mailto:|#|\/)/i.test(a.value.trim());
        if (!keep) el.removeAttribute(a.name);
      });
      if (el.tagName === 'A') {
        el.setAttribute('rel', 'noopener noreferrer');
        el.setAttribute('target', '_blank');
      }
    });
  };
  walk(t.content);
  return t.innerHTML;
}
export const txt2html = (t: string): string =>
  String(t || '')
    .split(/\n{2,}/)
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
export const html2txt = (h: string): string => {
  const d = document.createElement('div');
  d.innerHTML = h.replace(/<\/p>\s*<p>/g, '\n\n').replace(/<br\s*\/?>/g, '\n');
  return (d.textContent || '').trim();
};

/**
 * Editor enriquecido mínimo (negrita, cursiva, subrayado, listas y enlace).
 * No controlado: `initial` se carga al montar o al cambiar `resetKey`.
 */
export function MiniRte({ initial, onChange, label, min = 90, resetKey }: { initial: string; onChange: (html: string) => void; label: string; min?: number; resetKey?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { dialogs } = useApp();
  useEffect(() => {
    if (ref.current) ref.current.innerHTML = sanitize(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);
  const emit = () => {
    if (ref.current) onChange(sanitize(ref.current.innerHTML));
  };
  const exec = (cmd: string, arg?: string) => {
    ref.current?.focus();
    try {
      document.execCommand(cmd, false, arg);
    } catch {
      /* sin soporte */
    }
    emit();
  };
  const link = () => {
    const sel = window.getSelection();
    const range = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
    dialogs.form({
      title: 'Insertar enlace',
      fields: [{ id: 'u', label: 'Dirección (https://…)', type: 'url', req: true, full: true, ph: 'https://' }],
      submit: 'Insertar',
      validate: (v) => (/^(https?:\/\/|mailto:)/i.test(v.u) ? null : 'Use una dirección que empiece con https:// o mailto:'),
      onSubmit: (v) => {
        ref.current?.focus();
        if (range) {
          const s = window.getSelection();
          s?.removeAllRanges();
          s?.addRange(range);
        }
        exec('createLink', v.u);
      },
    });
  };
  /* Función de render (no componente) para no remontar los botones en cada render. */
  const B = ({ cmd, lbl, children, onClick }: { cmd?: string; lbl: string; children: ReactNode; onClick?: () => void }) => (
    <button key={lbl} type="button" className="rte-b" aria-label={lbl} title={lbl} onMouseDown={(e) => e.preventDefault()} onClick={onClick || (() => cmd && exec(cmd))}>
      {children}
    </button>
  );
  const st: CSSProperties = { minHeight: min };
  return (
    <div className="rte">
      <div className="rte-bar" role="toolbar" aria-label={`Formato: ${label}`}>
        {B({ cmd: 'bold', lbl: 'Negrita', children: <b>B</b> })}
        {B({ cmd: 'italic', lbl: 'Cursiva', children: <i>I</i> })}
        {B({ cmd: 'underline', lbl: 'Subrayado', children: <u>U</u> })}
        <span className="rte-sep" />
        {B({ cmd: 'insertUnorderedList', lbl: 'Lista con viñetas', children: <Icon name="list" size="sm" /> })}
        {B({ cmd: 'insertOrderedList', lbl: 'Lista numerada', children: '1.' })}
        {B({ lbl: 'Insertar enlace', onClick: link, children: <Icon name="link" size="sm" /> })}
        <span className="rte-sp" />
        {B({ cmd: 'removeFormat', lbl: 'Quitar formato', children: <Icon name="x" size="sm" /> })}
      </div>
      <div
        ref={ref}
        className="rte-area"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={label}
        style={st}
        onInput={emit}
        onBlur={emit}
        onPaste={(e) => {
          e.preventDefault();
          const h = e.clipboardData.getData('text/html');
          const t = e.clipboardData.getData('text/plain');
          try {
            document.execCommand('insertHTML', false, h ? sanitize(h) : txt2html(t));
          } catch {
            /* sin soporte */
          }
          emit();
        }}
      />
    </div>
  );
}
