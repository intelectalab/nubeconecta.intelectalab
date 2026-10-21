/**
 * Utilidades propias de las vistas comerciales (CRM, Cotizaciones, Contratos y
 * Catálogo): chip de margen (mgChip), caja de shortcode con copia (scBox),
 * diálogo de cambio de precio (priceChangeDlg) y copia al portapapeles.
 */
import { useState } from 'react';
import { useApp } from '../../../app/context';
import { Icon } from '../../../components/Icon';
import { Modal } from '../../../components/Modal';
import { addD, diffD, fromIso, iso, NF2, plural, TODAY } from '../../../data';

/** Chip de margen: rojo bajo el mínimo, ámbar hasta mínimo + 10, verde el resto. */
export function MgChip({ m, min }: { m: number; min: number }) {
  return (
    <span className={`chip ${m < min ? 'danger' : m < min + 10 ? 'warn' : 'ok'}`}>
      {m < min ? <Icon name="tri" /> : null}
      {NF2.format(m).replace(/\.00$/, '')} %
    </span>
  );
}

/** Copia texto al portapapeles con respaldo por execCommand (copyText del prototipo). */
export function useCopy() {
  const { toast } = useApp();
  return (t: string, input?: HTMLInputElement | null) => {
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
        if (input) {
          input.focus();
          input.select();
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
  };
}

/** Caja de shortcode de solo lectura con botón «Copiar». */
export function ScBox({ code, id }: { code: string; id?: string }) {
  const copy = useCopy();
  const [el, setEl] = useState<HTMLInputElement | null>(null);
  return (
    <div className="scbox">
      <input ref={setEl} className="input mono" id={id} readOnly value={code} aria-label="Shortcode" />
      <button type="button" className="btn sm" onClick={() => copy(code, el)}>
        <Icon name="layers" size="sm" />
        Copiar
      </button>
    </div>
  );
}

/** Solicitud de cambio de precio con clientes activos (priceChangeDlg). */
export interface PriceAsk {
  name: string;
  n: number;
  onOk: (d: Date) => void;
  onCancel?: () => void;
}
export type AskPrice = (a: PriceAsk) => void;

export function PriceChangeModal({ ask, onDone }: { ask: PriceAsk | null; onDone: () => void }) {
  return ask ? <PriceChangeBody key={ask.name + ask.n} ask={ask} onDone={onDone} /> : null;
}
function PriceChangeBody({ ask, onDone }: { ask: PriceAsk; onDone: () => void }) {
  const [d, setD] = useState(iso(addD(TODAY, 30)));
  const [mail, setMail] = useState(true);
  const [err, setErr] = useState('');
  const cancel = () => {
    onDone();
    ask.onCancel?.();
  };
  const ok = () => {
    const x = fromIso(d || iso(TODAY));
    if (diffD(x, TODAY) < 0) {
      setErr('La fecha no puede ser anterior a hoy.');
      return;
    }
    onDone();
    ask.onOk(x);
  };
  return (
    <Modal
      open
      onClose={cancel}
      title="Cambio de precio"
      sub={ask.name}
      footer={
        <>
          <button type="button" className="btn" onClick={cancel}>
            Cancelar
          </button>
          <button type="button" className="btn primary" onClick={ok}>
            Programar cambio
          </button>
        </>
      }
    >
      <div className="note warn">
        <Icon name="bell" size="sm" />
        <span>
          <b>{plural(ask.n, 'cliente activo', 'clientes activos')}</b> {ask.n === 1 ? 'recibirá' : 'recibirán'} aviso antes de su renovación. El precio actual se respeta hasta la fecha de vigencia.
        </span>
      </div>
      <label className="field">
        Fecha de vigencia del nuevo precio
        <input className="input" type="date" value={d} min={iso(TODAY)} onChange={(e) => setD(e.target.value)} />
      </label>
      <label className="check">
        <input type="checkbox" checked={mail} onChange={(e) => setMail(e.target.checked)} />
        Enviar aviso por correo 30 días antes de cada renovación
      </label>
      <span className="err" role="alert">
        {err}
      </span>
    </Modal>
  );
}

/** Número de un input (vacío o inválido => NaN). */
export const num = (s: string): number => (s.trim() === '' ? NaN : parseFloat(s));
