/**
 * Tablas del catálogo (catLegacy y genTable del prototipo l.2038-2063 y l.2320):
 * hosting/reseller, VPS + complementos, dominios por extensión, combos y
 * productos genéricos por categoría.
 */
import { useState, type KeyboardEvent } from 'react';
import { useApp } from '../../../app/context';
import { Icon } from '../../../components/Icon';
import { BrandTag, Chip, EmptyState, Switch } from '../../../components/ui';
import { ADDONS, BR, BUNDLES, catCfg, fD, HPLANS, mgPct, moneyRaw, NF2, TC, tldClients, tldMg, TLDS, VPLANS } from '../../../data';
import type { BrandFilter, HostingPlan, TldPrice } from '../../../data';
import { GENPROD, type GenProduct } from './catalogData';
import { MgChip, type AskPrice } from './shared';

export interface CatHandlers {
  edit: (kind: 'hp' | 'vp' | 'bd' | 'gp', id: string, cat?: string) => void;
  preview: (id: string) => void;
  shortcode: (id: string) => void;
  wizard: (cat: string) => void;
  askPrice: AskPrice;
}

export const hostingRows = (brand: BrandFilter, cat: 'hosting' | 'reseller'): HostingPlan[] => HPLANS.filter((p) => (brand === 'all' || p.brand === brand) && (p.cat || 'hosting') === cat);
export const bundleRows = (brand: BrandFilter) => BUNDLES.filter((b) => brand === 'all' || b.brand === brand);

const onEnterBlur = (e: KeyboardEvent<HTMLInputElement>) => {
  if (e.key === 'Enter') e.currentTarget.blur();
};

/* =================== Hosting y reseller =================== */
export function HostingTable({ brand, cat, h }: { brand: BrandFilter; cat: 'hosting' | 'reseller'; h: CatHandlers }) {
  const { toast, refresh, dialogs } = useApp();
  const hp = hostingRows(brand, cat);
  if (!hp.length) return <EmptyState title="Sin paquetes" text="No hay paquetes para la marca seleccionada." />;

  const move = (p: HostingPlan, d: number) => {
    const i = HPLANS.indexOf(p);
    let j = i + d;
    while (j >= 0 && j < HPLANS.length && (HPLANS[j].brand !== p.brand || (HPLANS[j].cat || 'hosting') !== (p.cat || 'hosting'))) j += d;
    if (j < 0 || j >= HPLANS.length) return;
    [HPLANS[i], HPLANS[j]] = [HPLANS[j], HPLANS[i]];
    refresh();
    window.setTimeout(() => {
      const b = document.querySelector<HTMLButtonElement>(`[data-mv="${p.id}:${d}"]`);
      (b && !b.disabled ? b : document.querySelector<HTMLButtonElement>(`[data-ed="${p.id}"]`))?.focus();
    }, 0);
  };
  const dup = (p: HostingPlan) => {
    const i = HPLANS.indexOf(p);
    const c: HostingPlan = { ...p, p: { PEN: { ...p.p.PEN }, USD: { ...p.p.USD } }, id: 'HP' + (100 + HPLANS.length), name: p.name + ' (copia)', whm: p.whm + '_copia', online: false, feat: false, active: false, clients: 0 };
    HPLANS.splice(i + 1, 0, c);
    toast('Paquete duplicado', `${c.name} creado inactivo. Revíselo antes de publicarlo.`);
    refresh();
  };
  const active = (p: HostingPlan) => {
    if (p.active && p.clients > 0)
      dialogs.confirm({
        title: 'Desactivar paquete',
        body: (
          <p style={{ margin: 0 }}>
            «{p.name}» tiene <b>{p.clients} clientes activos</b>. Seguirán con su plan, pero no se podrá contratar de nuevo.
          </p>
        ),
        okLabel: 'Desactivar',
        danger: true,
        onOk: () => {
          p.active = false;
          p.online = false;
          toast('Paquete desactivado', p.name, 'warn');
          refresh();
        },
      });
    else {
      p.active = !p.active;
      if (!p.active) p.online = false;
      toast(p.active ? 'Paquete activado' : 'Paquete desactivado', p.name, p.active ? 'ok' : 'warn');
      refresh();
    }
  };
  const online = (p: HostingPlan) => {
    if (!p.active) {
      toast('Paquete inactivo', 'Active el paquete antes de venderlo en línea.', 'warn');
      return;
    }
    p.online = !p.online;
    toast(`Venta en línea ${p.online ? 'activada' : 'desactivada'}`, `${p.name} · ${BR[p.brand].n}`, 'info');
    refresh();
  };

  return (
    <div className="tw">
      <table className="t">
        <thead>
          <tr>
            <th>Orden</th>
            <th>Paquete</th>
            <th>Recursos</th>
            <th>Paquete WHM · nodo</th>
            <th className="r">Mensual</th>
            <th className="r">Anual</th>
            <th className="r">Clientes</th>
            <th>Venta en línea</th>
            <th className="r">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {hp.map((p, k) => (
            <tr key={p.id} className={p.active ? '' : 'done'}>
              <td className="nw">
                <button type="button" className="btn sm icon" data-mv={`${p.id}:-1`} aria-label={`Subir ${p.name}`} disabled={k === 0 || hp[k - 1].brand !== p.brand} onClick={() => move(p, -1)}>
                  <Icon name="cd" size="sm" style={{ transform: 'rotate(180deg)' }} />
                </button>{' '}
                <button type="button" className="btn sm icon" data-mv={`${p.id}:1`} aria-label={`Bajar ${p.name}`} disabled={k === hp.length - 1 || hp[k + 1].brand !== p.brand} onClick={() => move(p, 1)}>
                  <Icon name="cd" size="sm" />
                </button>
              </td>
              <td style={{ minWidth: 160 }}>
                <b>{p.name}</b>{' '}
                {p.feat ? (
                  <span className="chip warn" title="Destacado">
                    <Icon name="bolt" />
                    Destacado
                  </span>
                ) : null}
                {p.active ? null : (
                  <>
                    {' '}
                    <Chip>Inactivo</Chip>
                  </>
                )}
                <div className="sub">
                  <BrandTag brand={p.brand} />
                </div>
              </td>
              <td className="sub" style={{ minWidth: 170 }}>
                {p.disk} GB · {p.bw ? p.bw + ' GB' : 'transf. ilimitada'}
                <br />
                {p.mails} correos · {p.dbs} BD · {p.sites} {p.sites === 1 ? 'sitio' : 'sitios'}
              </td>
              <td className="nw">
                <span className="mono">{p.whm}</span>
                <div className="sub mono">{p.node}</div>
              </td>
              <td className="r">
                {moneyRaw(p.p.PEN.m, 'PEN')}
                <div className="sub">{moneyRaw(p.p.USD.m, 'USD')}</div>
              </td>
              <td className="r">
                {moneyRaw(p.p.PEN.a, 'PEN')}
                <div className="sub">{moneyRaw(p.p.USD.a, 'USD')}</div>
              </td>
              <td className="r num">{p.clients}</td>
              <td>
                <Switch checked={p.online} onChange={() => online(p)} label={`Venta en línea de ${p.name}`} />
              </td>
              <td className="r nw">
                <button type="button" className="btn sm" data-ed={p.id} onClick={() => h.edit('hp', p.id, cat)}>
                  <Icon name="edit" size="sm" />
                  Editar
                </button>{' '}
                <button type="button" className="btn sm icon" aria-label={`Vista previa de ${p.name}`} title="Vista previa en la web" onClick={() => h.preview(p.id)}>
                  <Icon name="eye" size="sm" />
                </button>{' '}
                <button type="button" className="btn sm icon" aria-label={`Duplicar ${p.name}`} title="Duplicar" onClick={() => dup(p)}>
                  <Icon name="layers" size="sm" />
                </button>{' '}
                <button type="button" className="btn sm icon" aria-label={`${p.active ? 'Desactivar' : 'Activar'} ${p.name}`} title={p.active ? 'Desactivar' : 'Activar'} onClick={() => active(p)}>
                  <Icon name={p.active ? 'pause' : 'check'} size="sm" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* =================== VPS =================== */
export function VpsTable({ h }: { h: CatHandlers }) {
  const { toast, refresh } = useApp();
  const [ad, setAd] = useState<Record<number, string>>({});
  const min = catCfg.minMg;
  return (
    <>
      <div className="tw">
        <table className="t">
          <thead>
            <tr>
              <th>Plan</th>
              <th>Recursos</th>
              <th>SO</th>
              <th>Origen (proveedor · plan)</th>
              <th className="r">Costo</th>
              <th className="r">Mensual</th>
              <th className="r">Trimestral</th>
              <th className="r">Anual</th>
              <th>Margen</th>
              <th>En línea</th>
              <th className="r">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {VPLANS.map((v) => (
              <tr key={v.id} className={v.active ? '' : 'done'}>
                <td>
                  <b>{v.name}</b>
                  <div className="sub">
                    {v.managed ? 'Administrado' : 'Autogestionado'} · {v.clients} clientes
                  </div>
                </td>
                <td className="sub nw">
                  {v.cpu} vCPU · {v.ram} GB RAM
                  <br />
                  {v.disk} GB · {v.tr} TB
                </td>
                <td className="sub" style={{ minWidth: 120 }}>
                  {v.os}
                </td>
                <td className="nw">
                  {v.src}
                  <div className="sub">{v.srcPlan}</div>
                </td>
                <td className="r">{moneyRaw(v.cost, 'USD')}</td>
                <td className="r">
                  {moneyRaw(v.p.m, 'PEN')}
                  <div className="sub">{moneyRaw(v.p.m / TC, 'USD')}</div>
                </td>
                <td className="r">{moneyRaw(v.p.t, 'PEN')}</td>
                <td className="r">{moneyRaw(v.p.a, 'PEN')}</td>
                <td>
                  <MgChip m={mgPct(v.p.m / TC, v.cost)} min={min} />
                </td>
                <td>
                  <Switch
                    checked={v.online}
                    label={`Venta en línea de ${v.name}`}
                    onChange={() => {
                      v.online = !v.online;
                      toast(`Venta en línea ${v.online ? 'activada' : 'desactivada'}`, v.name, 'info');
                      refresh();
                    }}
                  />
                </td>
                <td className="r">
                  <button type="button" className="btn sm" onClick={() => h.edit('vp', v.id)}>
                    <Icon name="edit" size="sm" />
                    Editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card-h" style={{ borderTop: '1px solid var(--border)' }}>
        <h2 className="sec">Complementos</h2>
        <span className="sub">precio mensual en S/ · costo en US$</span>
      </div>
      <div className="tw">
        <table className="t">
          <thead>
            <tr>
              <th>Complemento</th>
              <th className="r">Costo</th>
              <th className="r">Precio (S/)</th>
              <th>Margen</th>
            </tr>
          </thead>
          <tbody>
            {ADDONS.map((a, k) => {
              const raw = ad[k] ?? String(a.p);
              const p = parseFloat(raw) || 0;
              return (
                <tr key={a.n}>
                  <td>
                    <b>{a.n}</b>
                  </td>
                  <td className="r">{moneyRaw(a.cost, 'USD')}</td>
                  <td className="r">
                    <input
                      className="input r"
                      style={{ width: 110, textAlign: 'right' }}
                      type="number"
                      min={0}
                      step="0.5"
                      value={raw}
                      aria-label={`Precio de ${a.n}`}
                      onChange={(e) => setAd({ ...ad, [k]: e.target.value })}
                      onKeyDown={onEnterBlur}
                      onBlur={() => {
                        if (ad[k] == null) return;
                        const nv = parseFloat(ad[k]) || 0;
                        setAd((x) => {
                          const n = { ...x };
                          delete n[k];
                          return n;
                        });
                        if (nv === a.p) return;
                        a.p = nv;
                        toast('Precio de complemento actualizado', `${a.n} · ${moneyRaw(nv, 'PEN')}/mes`, 'info');
                        refresh();
                      }}
                    />
                  </td>
                  <td>
                    <MgChip m={mgPct(p / TC, a.cost)} min={min} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* =================== Dominios =================== */
type TldF = 'cR' | 'cRn' | 'cT' | 'pPEN' | 'pUSD';
const TLD_LBL: Record<TldF, string> = { cR: 'Registro (US$)', cRn: 'Renovación (US$)', cT: 'Transferencia (US$)', pPEN: 'Precio S/', pUSD: 'Precio US$' };

export function TldTable({ h }: { h: CatHandlers }) {
  const { toast, refresh } = useApp();
  const [dr, setDr] = useState<Record<string, string>>({});
  const [minRaw, setMinRaw] = useState<string | null>(null);
  const min = catCfg.minMg;
  const key = (t: TldPrice, f: TldF) => `${t.tld}|${f}`;
  const val = (t: TldPrice, f: TldF) => dr[key(t, f)] ?? String(t[f]);
  const draftOf = (t: TldPrice): TldPrice => ({ ...t, cRn: parseFloat(val(t, 'cRn')) || 0, pPEN: parseFloat(val(t, 'pPEN')) || 0, pUSD: parseFloat(val(t, 'pUSD')) || 0 });
  const drop = (k: string) =>
    setDr((x) => {
      const n = { ...x };
      delete n[k];
      return n;
    });

  const commitField = (t: TldPrice, f: TldF) => {
    const k = key(t, f);
    if (dr[k] == null) return;
    const nv = parseFloat(dr[k]);
    if (!(nv >= 0)) {
      drop(k);
      toast('Valor inválido', 'Ingrese un número válido.', 'err');
      return;
    }
    const old = t[f];
    if (nv === old) {
      drop(k);
      return;
    }
    const n = tldClients(t.tld);
    const commit = (d?: Date) => {
      t[f] = nv;
      drop(k);
      const m = tldMg(t);
      toast(f.startsWith('p') ? 'Precio actualizado' : 'Costo actualizado', `${t.tld} · margen ${NF2.format(m)} %${m < catCfg.minMg ? ' (bajo el mínimo)' : ''}${d ? ' · desde ' + fD(d) : ''}`, m < catCfg.minMg ? 'warn' : 'ok');
      refresh();
    };
    if (f.startsWith('p') && n > 0) h.askPrice({ name: `Dominios ${t.tld}`, n, onOk: commit, onCancel: () => drop(k) });
    else commit();
  };
  const ni = (t: TldPrice, f: TldF) => (
    <input
      className="input"
      style={{ width: 88, textAlign: 'right' }}
      type="number"
      min={0}
      step="0.01"
      value={val(t, f)}
      aria-label={`${TLD_LBL[f]} ${t.tld}`}
      onChange={(e) => setDr({ ...dr, [key(t, f)]: e.target.value })}
      onKeyDown={onEnterBlur}
      onBlur={() => commitField(t, f)}
    />
  );

  return (
    <>
      <div className="toolbar">
        <label className="field" style={{ flexDirection: 'row', display: 'flex', alignItems: 'center', gap: 8 }}>
          Margen mínimo{' '}
          <input
            className="input"
            style={{ width: 80 }}
            type="number"
            min={0}
            max={90}
            value={minRaw ?? String(min)}
            aria-label="Margen mínimo en porcentaje"
            onChange={(e) => setMinRaw(e.target.value)}
            onKeyDown={onEnterBlur}
            onBlur={() => {
              if (minRaw == null) return;
              catCfg.minMg = Math.max(0, Math.min(90, +minRaw || 0));
              setMinRaw(null);
              refresh();
            }}
          />{' '}
          %
        </label>
        <span className="count">{TLDS.filter((t) => tldMg(t) < min).length} extensiones bajo el mínimo · margen calculado sobre la renovación</span>
      </div>
      <div className="tw">
        <table className="t">
          <thead>
            <tr>
              <th>Extensión</th>
              <th>Registrador</th>
              <th className="r">Registro (US$)</th>
              <th className="r">Renovación (US$)</th>
              <th className="r">Transferencia (US$)</th>
              <th className="r">Precio S/</th>
              <th className="r">Precio US$</th>
              <th>Margen</th>
              <th className="r">Dominios</th>
              <th>En línea</th>
            </tr>
          </thead>
          <tbody>
            {TLDS.map((t) => (
              <tr key={t.tld}>
                <td className="mono strong">{t.tld}</td>
                <td>
                  <select
                    className="select"
                    aria-label={`Registrador ${t.tld}`}
                    style={{ width: 140 }}
                    value={t.reg}
                    onChange={(e) => {
                      t.reg = e.target.value;
                      toast('Registrador actualizado', `${t.tld} → ${t.reg}`, 'info');
                      refresh();
                    }}
                  >
                    {['PoloDomains', 'Namecheap', 'NameSilo'].map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </td>
                <td className="r">{ni(t, 'cR')}</td>
                <td className="r">{ni(t, 'cRn')}</td>
                <td className="r">{ni(t, 'cT')}</td>
                <td className="r">{ni(t, 'pPEN')}</td>
                <td className="r">{ni(t, 'pUSD')}</td>
                <td className="nw">
                  <MgChip m={tldMg(draftOf(t))} min={min} />
                </td>
                <td className="r num">{tldClients(t.tld)}</td>
                <td>
                  <Switch
                    checked={t.online}
                    label={`Venta en línea de ${t.tld}`}
                    onChange={() => {
                      t.online = !t.online;
                      toast(`Venta en línea ${t.online ? 'activada' : 'desactivada'}`, t.tld, 'info');
                      refresh();
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* =================== Combos =================== */
export function Combos({ brand, h }: { brand: BrandFilter; h: CatHandlers }) {
  const { toast, refresh } = useApp();
  const bd = bundleRows(brand);
  if (!bd.length) return <EmptyState title="Sin combos" text="No hay paquetes combinados para esta marca." />;
  return (
    <div className="card-b" style={{ paddingTop: 16 }}>
      <div className="grid g-3">
        {bd.map((b) => {
          const d = Math.round((1 - b.price / b.list) * 100);
          return (
            <article key={b.id} className={`card provcard${b.active ? '' : ' done'}`} style={b.active ? undefined : { opacity: 0.6 }}>
              <div className="h">
                <span className="ico">
                  <Icon name="box" size="sm" />
                </span>
                <b>{b.name}</b>
                <Chip kind="ok">-{d} %</Chip>
              </div>
              <BrandTag brand={b.brand} />
              <ul>
                {b.items.map((i) => (
                  <li key={i}>
                    <span>
                      <Icon name="check" size="sm" /> {i}
                    </span>
                    <span />
                  </li>
                ))}
              </ul>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <span>
                  <s className="sub" style={{ color: 'var(--muted)' }}>
                    {moneyRaw(b.list, 'PEN')}
                  </s>{' '}
                  <b style={{ fontFamily: 'var(--f-head)', fontSize: 18 }} className="num">
                    {moneyRaw(b.price, 'PEN')}
                  </b>{' '}
                  <small style={{ color: 'var(--muted)' }}>/año</small>
                </span>
                <span className="sub" style={{ color: 'var(--muted)', fontSize: 12 }}>
                  {b.clients} clientes
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <Switch
                  checked={b.online}
                  label={`Venta en línea de ${b.name}`}
                  onChange={() => {
                    b.online = !b.online;
                    toast(`Venta en línea ${b.online ? 'activada' : 'desactivada'}`, b.name, 'info');
                    refresh();
                  }}
                />
                <span className="sub" style={{ fontSize: 12, color: 'var(--muted)' }}>
                  en línea
                </span>
                <span style={{ flex: 1 }} />
                <button type="button" className="btn sm" onClick={() => h.edit('bd', b.id)}>
                  <Icon name="edit" size="sm" />
                  Editar
                </button>
                <button
                  type="button"
                  className="btn sm"
                  onClick={() => {
                    b.active = !b.active;
                    if (!b.active) b.online = false;
                    toast(b.active ? 'Combo activado' : 'Combo desactivado', b.name, b.active ? 'ok' : 'warn');
                    refresh();
                  }}
                >
                  {b.active ? 'Desactivar' : 'Activar'}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

/* =================== Productos genéricos =================== */
export function GenTable({ cat, h }: { cat: string; h: CatHandlers }) {
  const { toast, refresh } = useApp();
  const rows = GENPROD.filter((g) => g.cat === cat);
  if (!rows.length)
    return (
      <EmptyState
        title="Sin productos en esta categoría"
        text="Cree un servicio personalizado o agregue uno nuevo."
        action={
          <button type="button" className="btn sm" onClick={() => h.wizard(cat)}>
            <Icon name="plus" size="sm" />
            Nuevo servicio
          </button>
        }
      />
    );
  const online = (g: GenProduct) => {
    g.online = !g.online;
    toast(`Venta en línea ${g.online ? 'activada' : 'desactivada'}`, g.name, 'info');
    refresh();
  };
  return (
    <div className="tw">
      <table className="t">
        <thead>
          <tr>
            <th>Producto</th>
            <th>Ciclo</th>
            <th className="r">Precio</th>
            <th>Costo · proveedor</th>
            <th>Margen</th>
            <th>Venta</th>
            <th className="r">Clientes</th>
            <th>En línea</th>
            <th className="r">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((g) => {
            const costPEN = g.cost * TC;
            const m = g.cost ? mgPct(g.price, costPEN) : null;
            return (
              <tr key={g.id} className={g.active ? '' : 'done'}>
                <td style={{ minWidth: 220 }}>
                  <b>{g.name}</b>
                  {g.custom ? (
                    <>
                      {' '}
                      <Chip kind="info">Personalizado</Chip>
                    </>
                  ) : null}
                  <div className="sub">{g.sub}</div>
                </td>
                <td className="nw">{g.cy}</td>
                <td className="r">{moneyRaw(g.price, g.cur)}</td>
                <td className="nw">
                  {g.cost ? moneyRaw(g.cost, 'USD') : '—'}
                  <div className="sub">{g.prov || '—'}</div>
                </td>
                <td>{m == null ? <span className="sub">—</span> : <MgChip m={m} min={catCfg.minMg} />}</td>
                <td>
                  <Chip kind={g.sale === 'online' ? 'ok' : 'outline'}>{g.sale === 'online' ? 'En línea' : 'Solo cotización'}</Chip>
                </td>
                <td className="r num">{g.clients}</td>
                <td>{g.sale === 'online' ? <Switch checked={g.online} onChange={() => online(g)} label={`Venta en línea de ${g.name}`} /> : <span className="sub">—</span>}</td>
                <td className="r nw">
                  <button type="button" className="btn sm" onClick={() => h.edit('gp', g.id, cat)}>
                    <Icon name="edit" size="sm" />
                    Editar
                  </button>{' '}
                  <button type="button" className="btn sm icon" aria-label={`Shortcode de ${g.name}`} title="Shortcode" onClick={() => h.shortcode(g.id)}>
                    <Icon name="code" size="sm" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
