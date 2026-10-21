/**
 * Modal y panel lateral (sheet/drawer) accesibles, equivalentes a openModal /
 * openSheet del prototipo (l.1438 y l.1937).
 *
 *   <Modal open={o} onClose={() => setO(false)} title="Registrar pago" sub="Cliente"
 *          footer={<><button className="btn" onClick={close}>Cancelar</button>
 *                    <button className="btn primary">Guardar</button></>}>
 *     …contenido (va dentro de .modal-b)…
 *   </Modal>
 *
 *   <Sheet open={o} onClose={close} title="Editar paquete" sub="…">…(dentro de .sheet-b)…</Sheet>
 *
 * - role="dialog" + aria-modal, título enlazado con aria-labelledby.
 * - Escape cierra solo la capa superior; Tab queda atrapado en la capa.
 * - Al cerrar, el foco vuelve al elemento que la abrió.
 * - Se renderiza en un portal sobre document.body.
 */
import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

/* ---------- Pila de capas (para Escape y foco) ---------- */
const stack: string[] = [];
export const overlayOpen = (): boolean => stack.length > 0;

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]';

function useOverlay(open: boolean, onClose: () => void, boxRef: RefObject<HTMLElement>, initialFocus?: string) {
  const id = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const ret = document.activeElement as HTMLElement | null;
    stack.push(id);
    const t = window.setTimeout(() => {
      const box = boxRef.current;
      if (!box) return;
      const f =
        (initialFocus ? box.querySelector<HTMLElement>(initialFocus) : null) ||
        box.querySelector<HTMLElement>('[autofocus],input:not([disabled]),select,textarea,.modal-b button,.sheet-b button,.modal-f button') ||
        box.querySelector<HTMLElement>('button');
      f?.focus();
    }, 10);
    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== id) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key === 'Tab' && boxRef.current) {
        const f = Array.from(boxRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((x) => x.offsetParent !== null);
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', onKey, true);
      const i = stack.lastIndexOf(id);
      if (i >= 0) stack.splice(i, 1);
      if (ret && document.contains(ret)) ret.focus();
    };
  }, [open]);
  return id;
}

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** Título (h2). Si se omite, indique `label` para aria-label. */
  title?: ReactNode;
  /** Subtítulo bajo el título */
  sub?: ReactNode;
  /** aria-label cuando no hay título visible */
  label?: string;
  /** Pie (.modal-f): botones de acción */
  footer?: ReactNode;
  /** Ancho 820 px */
  wide?: boolean;
  /** Clase extra para .modal (p. ej. 'pal') */
  className?: string;
  /** Selector CSS del elemento a enfocar al abrir */
  initialFocus?: string;
  /** true: no envuelve children en .modal-b (control total del cuerpo) */
  bare?: boolean;
  children?: ReactNode;
}

export function Modal({ open, onClose, title, sub, label, footer, wide, className, initialFocus, bare, children }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useOverlay(open, onClose, ref, initialFocus);
  if (!open) return null;
  const tid = `mt-${id}`;
  return createPortal(
    <div className="modal-root open">
      <div className="modal-scrim" onClick={onClose} />
      <div
        ref={ref}
        className={['modal', wide && 'wide', className].filter(Boolean).join(' ')}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? tid : undefined}
        aria-label={title ? undefined : label}
      >
        {title != null && (
          <div className="modal-h">
            <div>
              <h2 id={tid}>{title}</h2>
              {sub ? <p>{sub}</p> : null}
            </div>
            <button type="button" className="btn icon sm ghost" onClick={onClose} aria-label="Cerrar">
              <Icon name="x" />
            </button>
          </div>
        )}
        {bare ? children : <div className="modal-b">{children}</div>}
        {footer ? <div className="modal-f">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  sub?: ReactNode;
  /** Pie fijo (.modal-f) */
  footer?: ReactNode;
  /** true: no envuelve children en .sheet-b (p. ej. si el hijo es <form className="sheet-b">) */
  bare?: boolean;
  initialFocus?: string;
  children?: ReactNode;
}

/** Panel lateral derecho (drawer). */
export function Sheet({ open, onClose, title, sub, footer, bare, initialFocus, children }: SheetProps) {
  const ref = useRef<HTMLElement>(null);
  const id = useOverlay(open, onClose, ref, initialFocus);
  if (!open) return null;
  const tid = `st-${id}`;
  return createPortal(
    <div className="sheet-root open">
      <div className="modal-scrim" onClick={onClose} />
      <aside ref={ref} className="sheet" role="dialog" aria-modal="true" aria-labelledby={tid}>
        <div className="modal-h">
          <div>
            <h2 id={tid}>{title}</h2>
            {sub ? <p>{sub}</p> : null}
          </div>
          <button type="button" className="btn icon sm ghost" onClick={onClose} aria-label="Cerrar panel">
            <Icon name="x" />
          </button>
        </div>
        {bare ? children : <div className="sheet-b">{children}</div>}
        {footer ? <div className="modal-f">{footer}</div> : null}
      </aside>
    </div>,
    document.body,
  );
}
