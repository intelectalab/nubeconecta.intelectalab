/**
 * Helpers de las vistas de Finanzas (cobranza, facturas, reportes).
 * Portados de prototipo/panel.html: seqFor / timeline (l.1637-1648),
 * cobData (l.1649) e invTable (l.1880).
 */
import type { MouseEvent, ReactNode } from 'react';
import { href } from '../../../app/routeMeta';
import { Icon } from '../../../components/Icon';
import { ClientLink, Note, StatusChip, SunatChip } from '../../../components/ui';
import { addD, CBY, commits, diffD, fD, fInv, inBrand, saldo, SEQ, TODAY, vouchers } from '../../../data';
import type { BrandFilter, Commitment, Cur, Invoice, SeqStep, Voucher } from '../../../data';

/** Filas por página (PER del prototipo). */
export const PER = 25;

export type SeqState = 'done' | 'now' | 'next' | 'skip' | 'hold';
export interface SeqItem extends SeqStep {
  d: Date;
  s: SeqState;
}

/** Compromiso vigente de un comprobante (si existe). */
export const activeCommit = (invId: string): Commitment | undefined => commits.find((c) => c.inv === invId && c.st === 'Vigente');

/** Etapas de la secuencia de avisos aplicadas a un comprobante. */
export function seqFor(inv: Invoice): SeqItem[] {
  const paid = inv.status === 'Pagada';
  const cm = activeCommit(inv.id);
  return SEQ.slice()
    .sort((a, b) => a.off - b.off)
    .map((st) => {
      const d = addD(inv.due, st.off);
      let s: SeqState = diffD(d, TODAY) < 0 ? 'done' : diffD(d, TODAY) === 0 ? 'now' : 'next';
      if (paid && s !== 'done') s = 'skip';
      if (cm && s !== 'done' && /Suspender|baja|débito/.test(st.act)) s = 'hold';
      return { ...st, d, s };
    });
}

const offLabel = (o: number) => (o < 0 ? `${-o} días antes` : o === 0 ? 'Día del vencimiento' : `${o} día${o > 1 ? 's' : ''} después`);
const stLabel: Record<SeqState, string> = {
  done: 'Enviado',
  now: 'Programado hoy',
  skip: 'Cancelado (comprobante pagado)',
  hold: 'En pausa por compromiso de pago',
  next: 'Programado',
};

/** Línea de tiempo de la secuencia de avisos (timeline del prototipo). */
export function SeqTimeline({ inv }: { inv: Invoice }) {
  const items = seqFor(inv);
  const cm = activeCommit(inv.id);
  return (
    <>
      <ol className="tl">
        {items.map((x, i) => {
          const cls = x.s === 'done' ? 'done' : x.s === 'now' ? 'now' : /Suspender|baja/.test(x.act) && x.s !== 'skip' && x.s !== 'hold' ? 'bad' : '';
          return (
            <li key={i}>
              <span className={`nd ${cls}`}>{x.s === 'done' ? <Icon name="check" /> : null}</span>
              <div className="w">
                <b>{x.act}</b>
                <span>{fD(x.d)}</span>
              </div>
              <small>
                {offLabel(x.off)} · {x.ch} · {stLabel[x.s]}
              </small>
            </li>
          );
        })}
      </ol>
      {cm ? (
        <Note kind="warn" icon="handshake">
          Compromiso de pago vigente hasta el {fD(cm.date)}. La suspensión y el recargo quedan en pausa.
        </Note>
      ) : null}
    </>
  );
}

export interface SuspItem {
  v: Invoice;
  kind: 'Suspensión' | 'Baja';
  d: Date;
}
export interface CobData {
  pronto: Invoice[];
  vencidas: Invoice[];
  vouchers: Voucher[];
  compromisos: Commitment[];
  suspensiones: SuspItem[];
}
/** Bandejas de cobranza para la marca activa (cobData). */
export function cobData(brand: BrandFilter): CobData {
  const inv = fInv(brand).filter((v) => v.type !== 'Nota de crédito');
  const susp: SuspItem[] = [
    ...inv.filter((v) => v.status === 'Pendiente' && diffD(v.due, TODAY) === 0 && v.type !== 'Nota de débito').map((v): SuspItem => ({ v, kind: 'Suspensión', d: addD(TODAY, 1) })),
    ...inv
      .filter((v) => v.status === 'Vencida' && v.type !== 'Nota de débito' && diffD(TODAY, v.due) >= 6)
      .map((v): SuspItem => ({ v, kind: 'Baja', d: addD(v.due, 11) }))
      .filter((x) => diffD(x.d, TODAY) >= 0),
  ].sort((a, b) => a.d.getTime() - b.d.getTime());
  return {
    pronto: inv.filter((v) => v.status === 'Pendiente' && diffD(v.due, TODAY) >= 0 && diffD(v.due, TODAY) <= 30).sort((a, b) => a.due.getTime() - b.due.getTime()),
    vencidas: inv.filter((v) => v.status === 'Vencida').sort((a, b) => a.due.getTime() - b.due.getTime()),
    vouchers: vouchers.filter((v) => inBrand(brand, v.cid)),
    compromisos: commits.filter((c) => inBrand(brand, c.cid)),
    suspensiones: susp,
  };
}

/** Enlace al comprobante que abre su modal de detalle. */
export function InvLink({ v, onOpen, className = 'mono', sub = true }: { v: Invoice; onOpen: (id: string) => void; className?: string; sub?: boolean }) {
  const click = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    onOpen(v.id);
  };
  return (
    <>
      <a className={className} href={href('facturas', v.num)} onClick={click}>
        {v.num}
      </a>
      {sub ? <div className="sub">{v.type}</div> : null}
    </>
  );
}

/** Tabla de comprobantes (invTable del prototipo). */
export function InvTable({ list, compact, onOpen, money }: { list: Invoice[]; compact?: boolean; onOpen: (id: string) => void; money: (v: number, c: Cur) => ReactNode }) {
  return (
    <div className="tw">
      <table className="t">
        <thead>
          <tr>
            <th>Comprobante</th>
            <th>Tipo</th>
            {compact ? null : <th>Cliente</th>}
            <th>Emisión</th>
            <th>Vence</th>
            <th>Mon.</th>
            <th className="r">Total</th>
            <th className="r">Saldo</th>
            <th>Estado</th>
            <th>SUNAT</th>
          </tr>
        </thead>
        <tbody>
          {list.map((v) => {
            const s = saldo(v);
            return (
              <tr key={v.id}>
                <td>
                  <InvLink v={v} onOpen={onOpen} className="rowlink mono" sub={false} />
                  {v.ref ? <div className="sub">ref. {v.ref}</div> : null}
                </td>
                <td className="nw">{v.type}</td>
                {compact ? null : (
                  <td style={{ minWidth: 200 }}>
                    {CBY[v.cid] ? <ClientLink cid={v.cid} light /> : '—'}
                  </td>
                )}
                <td className="num nw">{fD(v.issue)}</td>
                <td className="num nw">{fD(v.due)}</td>
                <td>{v.cur === 'PEN' ? 'S/' : 'US$'}</td>
                <td className="r">{money(v.total, v.cur)}</td>
                <td className={`r${s ? ' strong' : ''}`}>{s && v.type !== 'Nota de crédito' ? money(s, v.cur) : '—'}</td>
                <td>
                  <StatusChip status={v.status} />
                </td>
                <td>
                  <SunatChip s={v.sunat} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Recorta filas a la página indicada (con página acotada al rango). */
export function pageOf<T>(rows: T[], page: number, per = PER): { slice: T[]; page: number } {
  const pages = Math.max(1, Math.ceil(rows.length / per));
  const p = Math.min(Math.max(0, page), pages - 1);
  return { slice: rows.slice(p * per, (p + 1) * per), page: p };
}
