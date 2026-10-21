/**
 * Paleta de búsqueda global (Ctrl+K o «/»), prototipo l.1481-1517.
 * Busca pantallas, clientes, dominios, comprobantes, tickets, catálogo,
 * shortcodes y reclamos, y navega con parámetro (ver contrato de rutas).
 */
import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { HPLANS, TLDS } from '../data/catalog';
import { BR, CBY, fClients, fDom, fInv, fRecl, fTk } from '../data/db';
import { fD, money, moneyRaw, norm } from '../data/format';
import { SCDEF } from '../data/web';
import { useActions } from './actions';
import { useApp } from './context';
import { GROUPS, ROUTE_META, ROUTE_IDS, type RouteId } from './routeMeta';

interface PalItem {
  g: string;
  ic: string;
  t: string;
  s: string;
  run: () => void;
}

export function Palette({ open, onClose }: { open: boolean; onClose: () => void }) {
  return open ? <PaletteInner onClose={onClose} /> : null;
}

function PaletteInner({ onClose }: { onClose: () => void }) {
  const { brand, cur, allowed, navigate, dataVersion } = useApp();
  const act = useActions();
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const items = useMemo<PalItem[]>(() => {
    const n = norm(q).trim();
    const go = (r: RouteId, p?: string) => () => navigate(r, p);
    const scr = ROUTE_IDS.filter((k) => !ROUTE_META[k].hidden && allowed(k) && (!n || norm(ROUTE_META[k].t).includes(n) || norm(ROUTE_META[k].g).includes(n)))
      .sort((a, b) => GROUPS.indexOf(ROUTE_META[a].g) - GROUPS.indexOf(ROUTE_META[b].g))
      .map((k) => ({ g: 'Pantallas', ic: ROUTE_META[k].ic, t: ROUTE_META[k].t, s: ROUTE_META[k].g, run: go(k) }));
    const groups: PalItem[][] = [scr.slice(0, n ? 6 : 10)];
    if (n) {
      groups.push(
        fClients(brand)
          .filter((c) => norm(c.name).includes(n) || norm(c.doc).includes(n) || norm(c.id).includes(n))
          .slice(0, 6)
          .map((c) => ({ g: 'Clientes', ic: 'building', t: c.name, s: `${c.id} · ${c.doc} · ${BR[c.brand].n}`, run: go('cliente', c.id) })),
      );
      groups.push(
        fDom(brand)
          .filter((d) => d.d.includes(n))
          .slice(0, 5)
          .map((d) => ({ g: 'Dominios', ic: 'globe', t: d.d, s: `${CBY[d.cid].name} · vence ${fD(d.real)}`, run: go('dominios', d.d) })),
      );
      groups.push(
        fInv(brand)
          .filter((v) => norm(v.num).includes(n))
          .slice(0, 5)
          .map((v) => ({
            g: 'Facturas', ic: 'file', t: `${v.type} ${v.num}`, s: `${CBY[v.cid].name} · ${money(v.total, v.cur, cur)}`,
            run: () => {
              navigate('facturas');
              window.setTimeout(() => act.openInvoice(v.id), 300);
            },
          })),
      );
      groups.push(
        fTk(brand)
          .filter((t) => norm(t.id).includes(n) || norm(t.sub).includes(n))
          .slice(0, 5)
          .map((t) => ({ g: 'Tickets', ic: 'msg', t: `${t.id} · ${t.sub}`, s: `${CBY[t.cid].name} · ${t.status}`, run: go('tickets', t.id) })),
      );
      groups.push(
        HPLANS.filter((p) => (brand === 'all' || p.brand === brand) && norm(p.name + ' ' + BR[p.brand].n + ' ' + p.whm).includes(n))
          .slice(0, 4)
          .map((p) => ({ g: 'Catálogo', ic: 'tag', t: `${p.name} · ${BR[p.brand].n}`, s: `Hosting · ${moneyRaw(p.p.PEN.m, 'PEN')}/mes · ${p.whm}`, run: go('catalogo', 'hosting') })),
      );
      groups.push(
        TLDS.filter((t) => t.tld.includes(n))
          .slice(0, 3)
          .map((t) => ({ g: 'Catálogo', ic: 'globe', t: `Extensión ${t.tld}`, s: `${t.reg} · ${moneyRaw(t.pPEN, 'PEN')}`, run: go('catalogo', 'dominios') })),
      );
      groups.push(
        Object.keys(SCDEF)
          .filter((k) => k.includes(n.replace(/\s/g, '_')))
          .slice(0, 4)
          .map((k) => ({ g: 'Shortcodes', ic: 'code', t: '[' + k + ']', s: SCDEF[k].d, run: go('wp', 'generador/' + k) })),
      );
      if (allowed('reclamos'))
        groups.push(
          fRecl(brand)
            .filter((r) => norm(r.id + ' ' + r.nombre + ' ' + r.det).includes(n))
            .slice(0, 4)
            .map((r) => ({ g: 'Reclamos', ic: 'book', t: `${r.id} · ${r.tipo}`, s: `${r.nombre} · ${r.st}`, run: go('reclamos', r.id) })),
        );
    }
    return groups.flat();
    // dataVersion invalida resultados tras cambios en los datos
  }, [q, brand, cur, allowed, navigate, act, dataVersion]);

  const run = (it: PalItem | undefined) => {
    if (!it) return;
    onClose();
    it.run();
  };
  const move = (i: number) => {
    setIdx(i);
    window.requestAnimationFrame(() => listRef.current?.querySelector(`#po${i}`)?.scrollIntoView({ block: 'nearest' }));
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      move(Math.min(items.length - 1, idx + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      move(Math.max(0, idx - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(items[idx]);
    }
  };

  let last = '';
  return (
    <Modal open onClose={onClose} label="Búsqueda global" className="pal" initialFocus="#palQ" bare>
      <div className="pal-in">
        <Icon name="search" />
        <input
          id="palQ"
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls="palRes"
          aria-autocomplete="list"
          aria-activedescendant={items.length ? `po${idx}` : undefined}
          placeholder="Buscar clientes, dominios, facturas, tickets o pantallas…"
          autoComplete="off"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setIdx(0);
          }}
          onKeyDown={onKey}
        />
        <kbd>Esc</kbd>
      </div>
      <div className="pal-res" id="palRes" role="listbox" aria-label="Resultados" ref={listRef}>
        {!items.length ? (
          <div className="empty">
            <div className="ring">
              <Icon name="search" size="lg" />
            </div>
            <b>Sin resultados</b>
            <span>No encontramos «{q}». Pruebe con un RUC, dominio o número de comprobante.</span>
          </div>
        ) : (
          items.map((it, k) => {
            const head = it.g !== last;
            last = it.g;
            return (
              <div key={k}>
                {head ? (
                  <div className="pal-g" role="presentation">
                    {it.g}
                  </div>
                ) : null}
                <div className="pal-it" role="option" id={`po${k}`} aria-selected={k === idx} onClick={() => run(it)} onMouseMove={() => idx !== k && setIdx(k)}>
                  <span className="ico">
                    <Icon name={it.ic} size="sm" />
                  </span>
                  <span className="grow">
                    <b>{it.t}</b>
                    <small>{it.s}</small>
                  </span>
                  <Icon name="arrow" size="sm" />
                </div>
              </div>
            );
          })
        )}
      </div>
      <div className="pal-foot">
        <span>
          <kbd>↑</kbd> <kbd>↓</kbd> moverse
        </span>
        <span>
          <kbd>Enter</kbd> abrir
        </span>
        <span>
          <kbd>Esc</kbd> cerrar
        </span>
      </div>
    </Modal>
  );
}
