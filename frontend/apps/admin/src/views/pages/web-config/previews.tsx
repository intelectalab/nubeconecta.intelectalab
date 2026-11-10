/**
 * Vistas previas de la web pública: shortcodes (scPreview), formularios
 * (formPreview) y contacto (contactPreview). Prototipo l.2434-2468 y l.3256-3280.
 */
import type { ReactNode } from 'react';
import { useApp } from '../../../app/context';
import { useViewState } from '../../../app/storage';
import {
  ADDONS, BR, BUNDLES, CONTACT, FORMS, HPLANS, LEGAL, NF0, NF2, PROMOS, TC, TLDS, TODAY, VPLANS, WPS,
  diffD, fD, fromIso, moneyRaw, mwBtnCls, mwVars, norm, type BrandId, type WebForm,
} from '../../../data';
import { GENPROD } from '../comercial/catalogData';
import { MwBar, MwPlanCard } from './shared';
import { prodById, scValues, srvList, type Prod, type ScVals } from './wpData';

const s = (v: unknown): string => (v == null ? '' : String(v));

/* ---------- Formulario ---------- */
export function FormPreview({ f, brand = 'ap' }: { f: WebForm; brand?: BrandId }) {
  const B = mwBtnCls(brand);
  return (
    <>
      <h3 className="mw-h">{f.n}</h3>
      <div className="mw-form">
        {f.fields.map((x, k) =>
          x.t === 'Casillas' ? (
            <div className="mw-cats" key={k}>
              {(x.opts || '')
                .split(',')
                .filter(Boolean)
                .map((o) => (
                  <span key={o}>☐ {o.trim()}</span>
                ))}
            </div>
          ) : (
            <span key={k} className={`mw-in${/mensaje|descrip/.test(x.l.toLowerCase()) ? ' tall' : ''}`}>
              {x.l}
              {x.req ? ' *' : ''}
              {x.t === 'Lista' ? ' ▾' : x.t === 'Archivo' ? ' · Adjuntar archivo' : ''}
            </span>
          ),
        )}
        {f.consent ? <small className="mw-mut">☐ {f.consentTxt}</small> : null}
        {f.captcha ? <span className="mw-captcha">☐ No soy un robot</span> : null}
        <span className={B}>Enviar</span>
      </div>
    </>
  );
}

/* ---------- Contacto ---------- */
export function ContactPreview({ brand, show = 'todo' }: { brand: BrandId; show?: string }) {
  const c = CONTACT[brand];
  const m = show || 'todo';
  return (
    <div className="mw-contact">
      {m === 'todo' || m === 'telefonos' ? (
        <div>
          <small className="mw-mut">Teléfonos</small>
          <b>{c.tel}</b>
          {c.tel2 ? <span>{c.tel2}</span> : null}
        </div>
      ) : null}
      {m === 'todo' || m === 'whatsapp' ? (
        <div>
          <small className="mw-mut">WhatsApp</small>
          <b>{c.wa}</b>
          <span className={`${mwBtnCls(brand)} sm`}>Escribir</span>
        </div>
      ) : null}
      {m === 'todo' ? (
        <div>
          <small className="mw-mut">Correo</small>
          <b>{c.mail}</b>
          <span>{c.mail2}</span>
        </div>
      ) : null}
      {m === 'todo' || m === 'direccion' ? (
        <div>
          <small className="mw-mut">Dirección y horario</small>
          <b>{c.dir}</b>
          <span>{c.hor}</span>
        </div>
      ) : null}
    </div>
  );
}

/** Envoltorio .mw con las variables de la marca. */
export function MwFrame({ brand, bar, children }: { brand: BrandId; bar?: string; children: ReactNode }) {
  return (
    <div className="mw" style={mwVars(brand)}>
      {bar ? <MwBar>{bar}</MwBar> : null}
      <div className="mw-sec">{children}</div>
    </div>
  );
}

/* ---------- Shortcodes ---------- */
const fmtCur = (pen: number, usd: number, mon: string) => (mon === 'USD' ? moneyRaw(usd, 'USD') : moneyRaw(pen, 'PEN'));
const scMoney = (pen: number, mon: string) => (mon === 'USD' ? moneyRaw(pen / TC, 'USD') : moneyRaw(pen, 'PEN'));

function ProdCard({ pr, v, b }: { pr: Prod | null; v: ScVals; b: BrandId }) {
  if (!pr) return <p className="mw-mut">Producto no encontrado.</p>;
  const an = v.ciclo === 'anual';
  if (pr.kind === 'hp') {
    const x = pr.x;
    return <MwPlanCard brand={b} p={{ ...x, p: { PEN: { m: an ? x.p.PEN.a : x.p.PEN.m, a: x.p.PEN.a } } }} per={an ? '/año' : '/mes'} />;
  }
  const name = pr.x.name;
  const price = pr.kind === 'vp' ? pr.x.p.m : pr.x.price;
  const sub = pr.kind === 'vp' ? `${pr.x.cpu} vCPU · ${pr.x.ram} GB RAM · ${pr.x.disk} GB` : pr.x.sub;
  const cot = pr.kind === 'gp' && pr.x.sale === 'cotizacion';
  return (
    <div className="mw-plan">
      <b className="mw-h">{name}</b>
      <div className="mw-price">
        <span>S/</span>
        {NF2.format(price)}
        <small>{pr.kind === 'gp' ? ' · ' + pr.x.cy.toLowerCase() : '/mes'}</small>
      </div>
      <small className="mw-mut">{sub}</small>
      <span className={mwBtnCls(b)}>{cot ? 'Solicitar cotización' : 'Contratar'}</span>
    </div>
  );
}

function listFor(t: string, b: BrandId): Prod[] {
  if (t === 'hosting' || t === 'reseller') return HPLANS.filter((p) => (p.cat || 'hosting') === t && p.active && p.online && p.brand === b).map((x) => ({ kind: 'hp' as const, x }));
  if (t === 'vps') return VPLANS.filter((x) => x.active && x.online).map((x) => ({ kind: 'vp' as const, x }));
  return GENPROD.filter((g) => g.cat === t && g.active).map((x) => ({ kind: 'gp' as const, x }));
}
function pickList(t: string, ids: string, b: BrandId): Prod[] {
  if (ids && ids.trim()) return ids.split(',').map((x) => prodById(x.trim())).filter((x): x is Prod => !!x);
  return listFor(t, b);
}


interface SrvState {
  cpu: number;
  ram: number;
  loc: string;
  cfg: string | null;
  add: number[];
  os: string;
}
function Servers({ v, b }: { v: ScVals; b: BrandId }) {
  const { toast } = useApp();
  const [F, setF] = useViewState<SrvState>('wp.srv', { cpu: 0, ram: 0, loc: '', cfg: null, add: [], os: 'Ubuntu 24.04' });
  const all = srvList(s(v.tipo), s(v.ids));
  const locs = [...new Set(all.map((x) => x.loc))];
  const l = v.filtros ? all.filter((x) => x.cpu >= F.cpu && x.ram >= F.ram && (!F.loc || x.loc === F.loc)) : all;
  const an = v.ciclo === 'anual';
  const base = (x: { pm: number; pa?: number }) => (an ? x.pa || x.pm * 12 * 0.9 : x.pm);
  const addP = (p: number) => (an ? p * 12 : p);
  const cfg = v.configurador && F.cfg ? l.find((x) => x.id === F.cfg) : undefined;
  const mon = s(v.moneda);
  const cart = (id: string) => toast('Agregado al carrito (vista previa)', `${id} · ${F.add.length} complementos · ${F.os}`);
  return (
    <>
      {v.filtros ? (
        <div className="srv-f">
          <label>
            CPU mín.
            <select className="select" value={F.cpu} onChange={(e) => setF({ ...F, cpu: +e.target.value })}>
              {[0, 2, 4, 8].map((n) => (
                <option key={n} value={n}>
                  {n ? n + ' vCPU' : 'Cualquiera'}
                </option>
              ))}
            </select>
          </label>
          <label>
            RAM mín.
            <select className="select" value={F.ram} onChange={(e) => setF({ ...F, ram: +e.target.value })}>
              {[0, 4, 8, 16, 32].map((n) => (
                <option key={n} value={n}>
                  {n ? n + ' GB' : 'Cualquiera'}
                </option>
              ))}
            </select>
          </label>
          <label>
            Ubicación
            <select className="select" value={F.loc} onChange={(e) => setF({ ...F, loc: e.target.value })}>
              <option value="">Todas</option>
              {locs.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
        </div>
      ) : null}
      {l.length ? (
        <table className="mw-cmp srv-t">
          <thead>
            <tr>
              <th>Servidor</th>
              <th>CPU</th>
              <th>RAM</th>
              <th>Disco</th>
              <th>Ubicación</th>
              <th>Precio</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {l.map((x) => (
              <tr key={x.id} className={cfg && cfg.id === x.id ? 'on' : undefined}>
                <td>
                  <b>{x.name}</b>
                </td>
                <td>{x.cpu} vCPU</td>
                <td>{x.ram} GB</td>
                <td>{x.dsk}</td>
                <td>{x.loc}</td>
                <td>
                  <b>{scMoney(base(x), mon)}</b>
                  {an ? '/año' : '/mes'}
                </td>
                <td>
                  {v.configurador ? (
                    <button type="button" className="mw-b o sm" aria-pressed={F.cfg === x.id} onClick={() => setF({ ...F, cfg: F.cfg === x.id ? null : x.id })}>
                      Configurar
                    </button>
                  ) : (
                    <button type="button" className={`${mwBtnCls(b)} sm`} onClick={() => cart(x.id)}>
                      Contratar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="mw-mut">Ningún servidor cumple los filtros.</p>
      )}
      {cfg ? (
        <div className="srv-cfg">
          <h4 className="mw-h">Configurar {cfg.name}</h4>
          <label>
            Sistema operativo
            <select className="select" value={F.os} onChange={(e) => setF({ ...F, os: e.target.value })}>
              {['Ubuntu 24.04', 'AlmaLinux 9', 'Debian 12', 'Windows Server 2022 (+ licencia)'].map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </label>
          <div className="srv-adds">
            {ADDONS.map((a, i) => (
              <label className="check" key={a.n}>
                <input type="checkbox" checked={F.add.includes(i)} onChange={(e) => setF({ ...F, add: e.target.checked ? [...F.add, i] : F.add.filter((y) => y !== i) })} />
                {a.n} <span className="mw-mut">+{scMoney(addP(a.p), mon)}</span>
              </label>
            ))}
          </div>
          <div className="srv-tot">
            <span>Total {an ? 'anual' : 'mensual'}</span>
            <b>{scMoney(base(cfg) + F.add.reduce((t, i) => t + addP(ADDONS[i].p), 0) + (F.os.startsWith('Windows') ? (an ? 210 * 12 : 210) : 0), mon)}</b>
          </div>
          <button type="button" className={mwBtnCls(b)} onClick={() => cart(cfg.id)}>
            Agregar al carrito
          </button>
        </div>
      ) : null}
    </>
  );
}

export function ScPreview({ name, vals, brand }: { name: string; vals: ScVals; brand: BrandId }) {
  const v = scValues(name, vals);
  const b = brand;
  const B = mwBtnCls(b);
  let h: ReactNode = null;
  if (name === 'hub_servidores') h = <Servers v={v} b={b} />;
  else if (name === 'hub_planes') {
    const l = pickList(s(v.tipo), s(v.ids), b).filter((p) => v.destacados || !(p.kind === 'hp' && p.x.feat));
    h = l.length ? (
      <div className="mw-plans" style={{ gridTemplateColumns: `repeat(${Math.max(1, Math.min(4, +s(v.columnas) || 3))},minmax(0,1fr))` }}>
        {l.slice(0, 8).map((p) => (
          <ProdCard key={p.x.id} pr={p} v={v} b={b} />
        ))}
      </div>
    ) : (
      <p className="mw-mut">No hay productos publicados en esta categoría para la marca.</p>
    );
  } else if (name === 'hub_plan')
    h = (
      <div className="mw-plans" style={{ gridTemplateColumns: 'minmax(0,260px)' }}>
        <ProdCard pr={prodById(s(v.id))} v={v} b={b} />
      </div>
    );
  else if (name === 'hub_comparador') {
    const l = pickList(s(v.tipo), s(v.ids), b)
      .filter((p): p is Exclude<Prod, { kind: 'gp' }> => p.kind !== 'gp')
      .slice(0, 4);
    const rows: [string, (p: Exclude<Prod, { kind: 'gp' }>) => string][] = [
      ['Espacio', (p) => p.x.disk + ' GB'],
      ['Transferencia', (p) => (p.kind === 'hp' ? (p.x.bw ? p.x.bw + ' GB' : 'Ilimitada') : p.x.tr ? p.x.tr + ' TB' : 'Ilimitada')],
      ['Correos', (p) => (p.kind === 'hp' ? String(p.x.mails) : '—')],
      ['Precio', (p) => (p.kind === 'hp' ? fmtCur(p.x.p.PEN.m, p.x.p.USD.m, s(v.moneda)) : moneyRaw(p.x.p.m, 'PEN'))],
    ];
    h = l.length ? (
      <table className="mw-cmp">
        <thead>
          <tr>
            <th />
            {l.map((p) => (
              <th key={p.x.id}>{p.x.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([l2, f]) => (
            <tr key={l2}>
              <td>{l2}</td>
              {l.map((p) => (
                <td key={p.x.id}>{f(p)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    ) : (
      <p className="mw-mut">Elija una categoría con recursos comparables (hosting, reseller o VPS).</p>
    );
  } else if (name === 'hub_paquete') {
    const x = BUNDLES.find((y) => y.id === v.id) || BUNDLES[0];
    h = (
      <div className="mw-plan" style={{ maxWidth: 300 }}>
        <span className="mw-tag">-{Math.round((1 - x.price / x.list) * 100)} %</span>
        <b className="mw-h">{x.name}</b>
        <ul>
          {x.items.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
        <div className="mw-price">
          <span>S/</span>
          {NF2.format(x.price)}
          <small>/año</small>
        </div>
        <s className="mw-mut">S/ {NF2.format(x.list)}</s>
        <span className={B}>Contratar</span>
      </div>
    );
  } else if (name === 'hub_dominios') {
    const ex = s(v.extensiones).split(',').map((x) => x.trim());
    const pr = (t: (typeof TLDS)[number]) => (v.moneda === 'USD' ? moneyRaw(t.pUSD, 'USD') : moneyRaw(t.pPEN, 'PEN'));
    h = (
      <table className="mw-cmp">
        <thead>
          <tr>
            <th>Extensión</th>
            {v.mostrar !== 'renovacion' ? <th>Registro</th> : null}
            {v.mostrar !== 'registro' ? <th>Renovación</th> : null}
          </tr>
        </thead>
        <tbody>
          {TLDS.filter((t) => ex.includes(t.tld) && t.online).map((t) => (
            <tr key={t.tld}>
              <td>
                <b>{t.tld}</b>
              </td>
              {v.mostrar !== 'renovacion' ? <td>{pr(t)}</td> : null}
              {v.mostrar !== 'registro' ? <td>{pr(t)}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    );
  } else if (name === 'hub_buscar_dominio')
    h = (
      <>
        <div className="mw-search">
          <span className="mw-in">tuempresa</span>
          <span className={B}>{s(v.boton)}</span>
        </div>
        <div className="mw-tlds">
          {s(v.extensiones)
            .split(',')
            .map((x) => {
              const t = TLDS.find((y) => y.tld === x.trim());
              return t ? (
                <span key={t.tld}>
                  {t.tld} <b>S/ {NF0.format(t.pPEN)}</b>
                </span>
              ) : null;
            })}
        </div>
      </>
    );
  else if (name === 'hub_boton_contratar')
    h = (
      <>
        <span className={v.estilo === 'contorno' ? 'mw-b o' : B}>{s(v.texto)}</span>{' '}
        <small className="mw-mut">
          → portal.alojamientoplus.com/carrito?producto={s(v.id)}&amp;ciclo={s(v.ciclo)}
          {b !== 'ap' ? '&marca=' + b : ''}
        </small>
      </>
    );
  else if (name === 'hub_formulario') h = <FormPreview f={FORMS.find((f) => f.id === v.id) || FORMS[0]} brand={b} />;
  else if (name === 'hub_contacto') h = <ContactPreview brand={s(v.marca) as BrandId} show={s(v.mostrar)} />;
  else if (name === 'hub_documento_legal') {
    const d = LEGAL[s(v.marca) as BrandId].find((x) => x.id === v.doc) || LEGAL[s(v.marca) as BrandId][0];
    h = (
      <>
        <h3 className="mw-h">{d.n}</h3>
        <small className="mw-mut">
          Versión {d.v} · vigente desde {fD(d.vig)}
          {v.version === 'todas' ? (
            <>
              {' · '}
              <a className="mw-link">ver versiones anteriores</a>
            </>
          ) : null}
        </small>
        <p>{d.txt.split('\n')[0]}</p>
        <p className="mw-mut">1. Alcance… 2. Obligaciones… 3. Pagos…</p>
      </>
    );
  } else if (name === 'hub_libro_reclamaciones') {
    const m = s(v.marca) as BrandId;
    h = (
      <>
        <h3 className="mw-h">Libro de Reclamaciones</h3>
        <small className="mw-mut">
          {BR[m].n} · Hoja virtual N.° {m.toUpperCase()}-2026-000xxx
        </small>
        <div className="mw-form">
          <span className="mw-in">Nombre completo</span>
          <span className="mw-in">DNI / CE</span>
          <span className="mw-in">Reclamo ○ Queja ○</span>
          <span className="mw-in tall">Detalle</span>
          <span className={mwBtnCls(m)}>Enviar hoja</span>
        </div>
      </>
    );
  } else if (name === 'hub_asistente')
    h = (
      <>
        <div className="mw-steps">
          {Array.from({ length: Math.max(2, Math.min(6, +s(v.pasos) || 3)) }, (_, i) => (
            <span key={i} className={i === 0 ? 'on' : undefined}>
              {i + 1}
            </span>
          ))}
        </div>
        <h3 className="mw-h">¿Cuántos sitios web necesitas?</h3>
        <div className="mw-search">
          <span className="mw-b o">1 sitio</span>
          <span className="mw-b o">2 a 5</span>
          <span className="mw-b o">Más de 5</span>
        </div>
      </>
    );
  else if (name === 'hub_estado_servicios')
    h = (
      <ul className="mw-status">
        {(
          [
            ['Hosting compartido', 'ok'],
            ['Correo', 'ok'],
            ['VPS', 'ok'],
            ['Panel y portal', 'ok'],
            ['DNS', 'warn'],
          ] as [string, string][]
        )
          .filter((x) => v.grupo === 'todos' || norm(x[0]).includes(s(v.grupo)))
          .map(([s2, k]) => (
            <li key={s2}>
              <i className={k} />
              {s2}
              <span className="mw-mut">
                {k === 'ok' ? 'Operativo' : 'Degradado'} · {k === 'ok' ? '99.98' : '99.71'} % en {+s(v.historial) || 30} días
              </span>
            </li>
          ))}
      </ul>
    );
  else if (name === 'hub_promocion') {
    const p = PROMOS.find((x) => x[0] === v.id) || PROMOS[0];
    const d = diffD(fromIso(p[2]), TODAY);
    h = (
      <div className="mw-promo">
        <b className="mw-h">{p[1]}</b>
        {v.cuenta_regresiva ? <span className="mw-cd">{d} días · 14 h · 32 min</span> : null}
        <span className={B}>Ver oferta</span>
      </div>
    );
  } else
    h =
      v.estilo === 'botones' ? (
        <div className="mw-cur">
          <span className={v.predeterminada === 'PEN' ? 'on' : undefined}>S/</span>
          <span className={v.predeterminada === 'USD' ? 'on' : undefined}>US$</span>
        </div>
      ) : (
        <span className="mw-in" style={{ maxWidth: 140 }}>
          {v.predeterminada === 'PEN' ? 'S/ Soles' : 'US$ Dólares'} ▾
        </span>
      );
  const host = (WPS.find((x) => x.brand === b) || WPS[0]).host;
  return (
    <MwFrame brand={b} bar={`${host}/…`}>
      {h}
    </MwFrame>
  );
}
