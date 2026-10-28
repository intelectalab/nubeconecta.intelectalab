/**
 * Contadores del menú lateral (navCounts del prototipo, l.1347).
 * [cantidad, caliente(rojo)] por ruta. Se recalcula con brand y dataVersion.
 */
import { useEffect, useMemo, useState } from 'react';
import { DEMO_MODE, hub } from '../auth/client';
import { fDom, fInv, fLeads, fTk, inBrand, reclHot, slaLeft, vouchers } from '../data/db';
import { diffD, TODAY } from '../data/format';
import { WEB_SUBMISSIONS, webInBrand } from '../data/webInbox';
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
    solicitudes: [WEB_SUBMISSIONS.filter((s) => s.status === 'received' && webInBrand(brand, s)).length, false],
    crm: [fLeads(brand).filter((l) => !l.done && diffD(l.next, TODAY) === 0).length, false],
  };
}

/**
 * Contadores que vienen de la API (modo live): solicitudes web nuevas.
 * Se vuelve a pedir al cambiar de ruta o tras un refresh(); sin permiso (403) no se muestra.
 */
export function useLiveNavCounts(deps: unknown[]): NavCounts {
  const [web, setWeb] = useState<number | null>(null);
  useEffect(() => {
    if (DEMO_MODE) return;
    let alive = true;
    hub.webConnector.submissions.summary().then(
      (s) => alive && setWeb(s.received),
      () => alive && setWeb(null),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return useMemo<NavCounts>(() => (DEMO_MODE || web === null ? {} : { solicitudes: [web, false] }), [web]);
}
