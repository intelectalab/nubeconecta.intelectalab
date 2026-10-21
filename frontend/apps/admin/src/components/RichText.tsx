/**
 * Editor de texto enriquecido compartido (rte del prototipo l.3083-3130):
 * contratos, cláusulas, catálogo, respuestas de tickets, plantillas de correo
 * y respuestas del Libro de Reclamaciones. Incluye `className`, `insert()` y `focus()`.
 *
 *   const ed = useRef<RteHandle>(null);
 *   <RichText ref={ed} initial={html} label="Texto del contrato" min={340} />
 *   ed.current?.get()   // HTML saneado
 *   ed.current?.set(h)  // reemplaza el contenido
 */
import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react';
import { useApp } from '../app/context';
import { Icon } from './Icon';
import { esc } from '../data';

/* ---------- Saneado y conversión ---------- */
const RT_OK = new Set(['P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'H2', 'H3', 'H4', 'UL', 'OL', 'LI', 'A', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'IMG', 'BLOCKQUOTE', 'DIV', 'SPAN', 'HR', 'MARK']);
const RT_DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'TITLE', 'FORM', 'INPUT', 'BUTTON', 'SELECT', 'TEXTAREA', 'SVG', 'MATH', 'NOSCRIPT', 'TEMPLATE', 'VIDEO', 'AUDIO', 'CANVAS', 'BASE']);

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
      const tg = el.tagName;
      if (RT_DROP.has(tg)) {
        el.remove();
        return;
      }
      walk(el);
      if (!RT_OK.has(tg)) {
        el.replaceWith(...Array.from(el.childNodes));
        return;
      }
      Array.from(el.attributes).forEach((a) => {
        const nm = a.name.toLowerCase();
        const v = a.value.trim();
        let keep = false;
        if (tg === 'A' && nm === 'href') keep = /^(https?:|mailto:|#|\/)/i.test(v);
        else if (tg === 'IMG' && nm === 'src') keep = /^(https?:|data:image\/(png|jpe?g|gif|webp);)/i.test(v);
        else if (tg === 'IMG' && nm === 'alt') keep = true;
        else if ((tg === 'TD' || tg === 'TH') && nm === 'colspan') keep = /^\d{1,2}$/.test(v);
        else if (tg === 'MARK' && nm === 'class') keep = v === 'var';
        if (!keep) el.removeAttribute(a.name);
      });
      if (tg === 'A') {
        el.setAttribute('rel', 'noopener noreferrer');
        el.setAttribute('target', '_blank');
      }
    });
  };
  walk(t.content);
  t.content.querySelectorAll('p').forEach((p) => {
    if (p.querySelector('ul,ol,table,h2,h3,h4,div,blockquote,p')) p.replaceWith(...Array.from(p.childNodes));
  });
  return t.innerHTML;
}
export const txt2html = (t: string): string =>
  String(t || '')
    .split(/\n{2,}/)
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
export const html2txt = (h: string): string => {
  const d = document.createElement('template');
  d.innerHTML = String(h || '').replace(/<\/(p|h\d|li|tr)>/g, '$&\n');
  return (d.content.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
};
export const VARS: [string, string][] = [
  ['cliente.nombre', 'Andes Travel Experience S.A.C.'], ['cliente.contacto', 'Mariela Choque'], ['cliente.ruc', '20604418827'], ['factura.numero', 'F001-00018310'],
  ['factura.total', 'S/ 212.40'], ['factura.vence', '15/10/2026'], ['servicio.nombre', 'Hosting Pyme'], ['dominio', 'andestravel.pe'], ['ticket.numero', 'TK-26411'],
  ['reclamo.numero', 'AP-2026-000045'], ['marca.nombre', 'AlojamientoPlus'], ['marca.telefono', '(01) 640 2200'], ['enlace.pago', 'https://portal.alojamientoplus.com/pagar'], ['agente.nombre', 'Renzo Vargas'],
];
/** Sustituye {{variables}} por valores de ejemplo (o del mapa) resaltados. */
export const fillVars = (h: string, map?: Record<string, string>): string =>
  String(h).replace(/\{\{\s*([a-z.]+)\s*\}\}/g, (m, k: string) => {
    const v = (map && map[k]) ?? (VARS.find((x) => x[0] === k) || [])[1];
    return v != null ? `<mark class="var">${esc(v)}</mark>` : m;
  });

/** HTML saneado de solo lectura. */
export function RichOut({ html, className = 'rt-out' }: { html: string; className?: string }) {
  return <div className={className} dangerouslySetInnerHTML={{ __html: sanitize(html) }} />;
}

/* ---------- Componente ---------- */
export interface RteHandle {
  get: () => string;
  set: (html: string) => void;
  insert: (html: string) => void;
  focus: () => void;
}
export interface RichTextProps {
  initial: string;
  label: string;
  min?: number;
  mini?: boolean;
  ph?: string;
  onChange?: (html: string) => void;
  /** Clase extra del contenedor (p. ej. 'rte-note') */
  className?: string;
}
type Pop = 'link' | 'table' | 'image' | null;

function exec(cmd: string, arg?: string) {
  try {
    document.execCommand(cmd, false, arg);
  } catch {
    /* sin soporte */
  }
}

export const RichText = forwardRef<RteHandle, RichTextProps>(function RichText({ initial, label, min = 140, mini, ph = 'Escriba aquí…', onChange, className }, ref) {
  const { toast } = useApp();
  const area = useRef<HTMLDivElement>(null);
  const sel = useRef<Range | null>(null);
  const [mode, setMode] = useState<'edit' | 'html' | 'prev'>('edit');
  const [src, setSrc] = useState('');
  const [pop, setPop] = useState<Pop>(null);
  const [f, setF] = useState({ u: '', t: '', r: '3', c: '3', a: '', e: '' });
  const [file, setFile] = useState<File | null>(null);
  const changeRef = useRef(onChange);
  changeRef.current = onChange;

  useEffect(() => {
    if (area.current) area.current.innerHTML = sanitize(initial);
    // solo al montar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = (): string => sanitize(mode === 'html' ? src : area.current?.innerHTML || '');
  const emit = () => changeRef.current?.(current());

  useImperativeHandle(ref, () => ({
    get: current,
    set: (h: string) => {
      if (area.current) area.current.innerHTML = sanitize(h);
      if (mode === 'html') setSrc(sanitize(h).replace(/></g, '>\n<'));
      changeRef.current?.(sanitize(h));
    },
    insert: (h: string) => insert(h),
    focus: () => focusArea(),
  }));

  const save = () => {
    const s = getSelection();
    if (s && s.rangeCount && area.current && area.current.contains(s.anchorNode)) sel.current = s.getRangeAt(0).cloneRange();
  };
  const focusArea = () => {
    const a = area.current;
    if (!a) return;
    const s = getSelection();
    if (document.activeElement === a && s && s.rangeCount && a.contains(s.anchorNode)) return;
    a.focus();
    if (!s) return;
    s.removeAllRanges();
    if (sel.current && a.contains(sel.current.startContainer)) s.addRange(sel.current);
    else {
      const rg = document.createRange();
      rg.selectNodeContents(a);
      rg.collapse(false);
      s.addRange(rg);
    }
  };
  const run = (cmd: string, arg?: string) => {
    focusArea();
    exec(cmd, arg);
    save();
    emit();
  };
  const insert = (html: string) => {
    focusArea();
    let ok = false;
    try {
      ok = document.execCommand('insertHTML', false, sanitize(html));
    } catch {
      ok = false;
    }
    if (!ok) area.current?.insertAdjacentHTML('beforeend', sanitize(html));
    emit();
  };

  const toggleHtml = () => {
    if (mode !== 'html') {
      setSrc(sanitize(area.current?.innerHTML || '').replace(/></g, '>\n<'));
      setMode('html');
    } else {
      if (area.current) area.current.innerHTML = sanitize(src);
      setMode('edit');
      emit();
      window.setTimeout(() => area.current?.focus(), 0);
    }
  };
  const togglePrev = () => {
    if (mode === 'html' && area.current) area.current.innerHTML = sanitize(src);
    setMode(mode === 'prev' ? 'edit' : 'prev');
    if (mode === 'prev') window.setTimeout(() => area.current?.focus(), 0);
  };
  const openPop = (k: Pop) => {
    save();
    setF({ u: '', t: '', r: '3', c: '3', a: '', e: '' });
    setFile(null);
    setPop(k);
  };
  const doInsert = () => {
    const E = (e: string) => setF((x) => ({ ...x, e }));
    if (pop === 'link') {
      const u = f.u.trim();
      const t = f.t.trim();
      if (!/^(https?:\/\/\S+|mailto:\S+@\S+)$/i.test(u)) return E('Ingrese una dirección válida (https:// o mailto:).');
      setPop(null);
      if (sel.current && !sel.current.collapsed && !t) run('createLink', u);
      else insert(`<a href="${esc(u)}">${esc(t || u)}</a>`);
    } else if (pop === 'table') {
      const R = Math.max(1, Math.min(12, +f.r || 3));
      const C = Math.max(1, Math.min(8, +f.c || 3));
      setPop(null);
      insert(`<table><thead><tr>${Array.from({ length: C }, (_, i) => `<th>Columna ${i + 1}</th>`).join('')}</tr></thead><tbody>${Array.from({ length: R }, () => `<tr>${'<td>&nbsp;</td>'.repeat(C)}</tr>`).join('')}</tbody></table><p><br></p>`);
    } else if (pop === 'image') {
      const a = f.a.trim() || 'Imagen';
      if (file) {
        if (!/^image\//.test(file.type)) return E('El archivo no es una imagen.');
        if (file.size > 1572864) return E('Máximo 1.5 MB.');
        const rd = new FileReader();
        rd.onload = () => {
          setPop(null);
          insert(`<img src="${String(rd.result)}" alt="${esc(a)}">`);
        };
        rd.readAsDataURL(file);
        return;
      }
      const u = f.u.trim();
      if (!/^https?:\/\/\S+$/i.test(u)) return E('Ingrese una URL https:// o elija un archivo.');
      setPop(null);
      insert(`<img src="${esc(u)}" alt="${esc(a)}">`);
    }
  };

  const locked = mode !== 'edit';
  const B = (cmd: string, lbl: string, inner: ReactNode, onClick: () => void, extra?: { pressed?: boolean; always?: boolean }) => (
    <button
      type="button"
      className="rte-b"
      aria-label={lbl}
      title={lbl}
      aria-pressed={extra?.pressed}
      disabled={locked && !extra?.always}
      data-cmd={cmd}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {inner}
    </button>
  );

  return (
    <div className={['rte', className].filter(Boolean).join(' ')}>
      <div className="rte-bar" role="toolbar" aria-label="Formato de texto">
        {B('bold', 'Negrita (Ctrl+B)', <b>B</b>, () => run('bold'))}
        {B('italic', 'Cursiva (Ctrl+I)', <i>I</i>, () => run('italic'))}
        {B('underline', 'Subrayado (Ctrl+U)', <u>U</u>, () => run('underline'))}
        <span className="rte-sep" />
        {mini ? null : (
          <>
            {B('h2', 'Título', 'H2', () => run('formatBlock', '<h2>'))}
            {B('h3', 'Subtítulo', 'H3', () => run('formatBlock', '<h3>'))}
            {B('p', 'Párrafo', '¶', () => run('formatBlock', '<p>'))}
          </>
        )}
        {B('ul', 'Lista con viñetas', <Icon name="list" size="sm" />, () => run('insertUnorderedList'))}
        {B('ol', 'Lista numerada', '1.', () => run('insertOrderedList'))}
        <span className="rte-sep" />
        {B('link', 'Insertar enlace', <Icon name="link" size="sm" />, () => openPop('link'))}
        {mini ? null : B('table', 'Insertar tabla', '⊞', () => openPop('table'))}
        {B('image', 'Insertar imagen', <Icon name="upload" size="sm" />, () => openPop('image'))}
        <select
          className="select sm rte-var"
          aria-label="Insertar variable"
          value=""
          disabled={locked}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) return;
            focusArea();
            exec('insertText', `{{${v}}}`);
            emit();
          }}
        >
          <option value="">{'{{ }}'} Variable…</option>
          {VARS.map((v) => (
            <option key={v[0]} value={v[0]}>
              {v[0]}
            </option>
          ))}
        </select>
        <span className="rte-sep" />
        {B('undo', 'Deshacer (Ctrl+Z)', '↶', () => run('undo'))}
        {B('redo', 'Rehacer (Ctrl+Y)', '↷', () => run('redo'))}
        <span className="rte-sp" />
        {B('html', 'Ver HTML', '</>', toggleHtml, { pressed: mode === 'html', always: true })}
        {B('preview', 'Vista previa', <Icon name="eye" size="sm" />, togglePrev, { pressed: mode === 'prev', always: true })}
      </div>
      {pop ? (
        <div className="rte-pop">
          <div className="rte-popin">
            {pop === 'link' ? (
              <>
                <label className="field">
                  Dirección (https:// o mailto:)
                  <input className="input" placeholder="https://" value={f.u} autoFocus onChange={(e) => setF({ ...f, u: e.target.value })} />
                </label>
                <label className="field">
                  Texto (opcional)
                  <input className="input" value={f.t} onChange={(e) => setF({ ...f, t: e.target.value })} />
                </label>
              </>
            ) : pop === 'table' ? (
              <>
                <label className="field">
                  Filas
                  <input className="input" type="number" min={1} max={12} value={f.r} autoFocus onChange={(e) => setF({ ...f, r: e.target.value })} />
                </label>
                <label className="field">
                  Columnas
                  <input className="input" type="number" min={1} max={8} value={f.c} onChange={(e) => setF({ ...f, c: e.target.value })} />
                </label>
              </>
            ) : (
              <>
                <label className="field">
                  URL de la imagen
                  <input className="input" placeholder="https://…" value={f.u} autoFocus onChange={(e) => setF({ ...f, u: e.target.value })} />
                </label>
                <label className="field">
                  o archivo
                  <input className="input" type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                </label>
                <label className="field">
                  Texto alternativo
                  <input className="input" value={f.a} onChange={(e) => setF({ ...f, a: e.target.value })} />
                </label>
              </>
            )}
            <span className="err">{f.e}</span>
            <div className="rte-popf">
              <button
                type="button"
                className="btn sm"
                onClick={() => {
                  setPop(null);
                  focusArea();
                }}
              >
                Cancelar
              </button>
              <button type="button" className="btn sm primary" onClick={doInsert}>
                Insertar
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <div
        ref={area}
        className="rte-area"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={label}
        data-ph={ph}
        hidden={mode !== 'edit'}
        style={{ minHeight: min }}
        onKeyUp={save}
        onMouseUp={save}
        onBlur={save}
        onInput={() => {
          save();
          emit();
        }}
        onPaste={(e) => {
          e.preventDefault();
          const h = e.clipboardData.getData('text/html');
          const t = e.clipboardData.getData('text/plain');
          const clean = h ? sanitize(h) : txt2html(t);
          if (h && clean.length < h.length * 0.6) toast('Formato limpiado al pegar', 'Se quitaron estilos, scripts y atributos no permitidos.', 'info');
          let ok = false;
          try {
            ok = document.execCommand('insertHTML', false, clean);
          } catch {
            ok = false;
          }
          if (!ok) area.current?.insertAdjacentHTML('beforeend', clean);
          emit();
        }}
      />
      {mode === 'html' ? (
        <textarea
          className="rte-src"
          aria-label="Código HTML"
          spellCheck={false}
          value={src}
          autoFocus
          onChange={(e) => {
            setSrc(e.target.value);
            changeRef.current?.(sanitize(e.target.value));
          }}
        />
      ) : null}
      {mode === 'prev' ? (
        <div className="rte-prev" aria-live="polite">
          <small className="rte-prev-l">Vista previa con datos de ejemplo</small>
          <div dangerouslySetInnerHTML={{ __html: fillVars(sanitize(area.current?.innerHTML || '')) }} />
        </div>
      ) : null}
    </div>
  );
});
