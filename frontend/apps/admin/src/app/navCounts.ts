/**
 * Contadores del menú lateral (navCounts del prototipo, l.1347).
 * [cantidad, caliente(rojo)] por ruta. Se recalcula con brand y dataVersion.
 */
import { fDom, fInv, fLeads, fTk, inBrand, reclHot, slaLeft, vouchers } from '../data/db';
import { diffD, TODAY } from '../data/format';
import type { BrandFilter } from '../data/types';
import type { RouteId } from './routeMeta';

export type NavCounts = Partial<Record<RouteId, [number, boolean]>>;

export function navCounts(brand: BrandFilter): NavCounts {
  const inv = fInv(brand);
  return {
    cobranza: [vouchers.filter((v) => v.st === 'Por validar' && inBrand(brand, v.cid)).length + inv.filter((v) => v.status === 'Vencida').length, true],
    tickets: [fTk(brand).filter((t) => t.status !== 'Resuelto' && slaLeft(t) < 0).length, true],
    reclamos: [reclHot(brand).length, true],
    dominios: [
      fDom(brand).filter((d) => {
        const x = diffD(d.real, TODAY);
        return x >= 0 && x <= 30;
      }).length,
      false,
    ],
    crm: [fLeads(brand).filter((l) => !l.done && diffD(l.next, TODAY) === 0).length, false],
  };
}
