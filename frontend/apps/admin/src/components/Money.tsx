/**
 * Montos con marcado del prototipo (dualMoney / money), respetando la moneda
 * de visualización del contexto.
 *
 *   <Money v={349} cur="PEN" />                 // <span class="num">S/ 349.00</span>
 *   <DualMoney r={{PEN: 1200, USD: 300}} int twin />
 */
import { useApp } from '../app/context';
import { money, moneyRaw, TC } from '../data/format';
import type { Cur, MoneyPair } from '../data/types';

export function Money({ v, cur, int, className }: { v: number; cur: Cur; int?: boolean; className?: string }) {
  const { cur: view } = useApp();
  return <span className={['num', className].filter(Boolean).join(' ')}>{money(v, cur, view, { int })}</span>;
}

/**
 * Suma por moneda. Con vista 'orig' muestra S/ y US$ (twin = uno bajo otro);
 * con PEN/USD muestra el total convertido.
 */
export function DualMoney({ r, int, twin }: { r: MoneyPair; int?: boolean; twin?: boolean }) {
  const { cur } = useApp();
  if (cur !== 'orig') {
    const t = cur === 'PEN' ? r.PEN + r.USD * TC : r.USD + r.PEN / TC;
    return <span className="num">{moneyRaw(t, cur, int)}</span>;
  }
  if (!r.USD) return <span className="num">{moneyRaw(r.PEN, 'PEN', int)}</span>;
  if (!r.PEN) return <span className="num">{moneyRaw(r.USD, 'USD', int)}</span>;
  if (twin)
    return (
      <span className="twin">
        <span className="num">{moneyRaw(r.PEN, 'PEN', int)}</span>
        <small className="num">{moneyRaw(r.USD, 'USD', int)}</small>
      </span>
    );
  return (
    <>
      <span className="num">{moneyRaw(r.PEN, 'PEN', int)}</span> <small>+ {moneyRaw(r.USD, 'USD', int)}</small>
    </>
  );
}
