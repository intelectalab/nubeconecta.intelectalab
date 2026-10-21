/**
 * Datos y helpers del generador de shortcodes (prototipo l.2401-2470 y
 * l.3256-3280): opciones por atributo, código generado, búsqueda de productos,
 * WHOIS simulado y catálogo de servidores.
 */
import {
  BRANDS, BR, BUNDLES, FORMS, HPLANS, LEGDOCS, PROMOS, SCDEF, VPLANS, domains, kHash, type HostingPlan, type VpsPlan,
} from '../../../data';
import { DEDI, GENPROD, allCats, type GenProduct } from '../comercial/catalogData';

/* Shortcodes agregados en la ampliación del prototipo (l.3257). */
if (!SCDEF.hub_whois) {
  Object.assign(SCDEF, {
    hub_whois: { d: 'Buscador WHOIS con disponibilidad, precios y sugerencias', o: [['extensiones', 'txt', '.pe,.com.pe,.com,.net'], ['sugerencias', 'chk', true], ['mostrar_whois', 'chk', true], ['moneda', 'sel', 'auto']] },
    hub_servidores: { d: 'Catálogo de VPS o dedicados con filtros y configurador', o: [['tipo', 'sel', 'vps'], ['ids', 'txt', ''], ['filtros', 'chk', true], ['configurador', 'chk', true], ['ciclo', 'sel', 'mensual'], ['moneda', 'sel', 'auto']] },
  });
}

export type ScVal = string | number | boolean;
export type ScVals = Record<string, ScVal>;

/** Valores efectivos del shortcode (por defecto + editados). */
export function scValues(name: string, vals: ScVals): ScVals {
  const v: ScVals = {};
  SCDEF[name].o.forEach(([k, , def]) => {
    const x = vals[name + '.' + k];
    v[k] = x ?? def;
  });
  return v;
}
/** Código para pegar en WordPress. */
export function scCode(name: string, vals: ScVals): string {
  const v = scValues(name, vals);
  return `[${name}${SCDEF[name].o
    .map(([k, t]) => {
      const x = v[k];
      if (x === '' || x == null) return '';
      return ` ${k}="${t === 'chk' ? (x ? 'si' : 'no') : x}"`;
    })
    .join('')}]`;
}

/** Opciones de los atributos tipo lista (scOpts). */
export function scOpts(k: string, name: string): [string, string][] {
  if (name === 'hub_servidores' && k === 'tipo') return [['vps', 'VPS'], ['dedicado', 'Servidores dedicados']];
  switch (k) {
    case 'tipo':
      return allCats().map((c) => [c.id, c.n]);
    case 'ciclo':
      return [['mensual', 'Mensual'], ['anual', 'Anual']];
    case 'moneda':
      return [['auto', 'Automática'], ['PEN', 'S/'], ['USD', 'US$']];
    case 'id':
      if (name === 'hub_paquete') return BUNDLES.map((b) => [b.id, `${b.name} (${b.id})`]);
      if (name === 'hub_formulario') return FORMS.map((f) => [f.id, f.n]);
      if (name === 'hub_promocion') return PROMOS.map((p) => [p[0], p[1]]);
      return [...HPLANS.map((p): [string, string] => [p.id, `${p.name} · ${BR[p.brand].n} (${p.id})`]), ...VPLANS.map((v): [string, string] => [v.id, `${v.name} (${v.id})`]), ...GENPROD.map((g): [string, string] => [g.id, `${g.name} (${g.id})`])];
    case 'mostrar':
      return name === 'hub_contacto'
        ? [['todo', 'Todo'], ['telefonos', 'Teléfonos'], ['whatsapp', 'WhatsApp'], ['direccion', 'Dirección y horario']]
        : [['ambos', 'Registro y renovación'], ['registro', 'Solo registro'], ['renovacion', 'Solo renovación']];
    case 'estilo':
      return name === 'hub_selector_moneda' ? [['botones', 'Botones'], ['lista', 'Lista']] : [['solido', 'Sólido'], ['contorno', 'Contorno']];
    case 'marca':
      return BRANDS.map((b) => [b.id, b.n]);
    case 'doc':
      return LEGDOCS;
    case 'version':
      return [['vigente', 'Vigente'], ['todas', 'Todas las versiones']];
    case 'grupo':
      return [['todos', 'Todos'], ['hosting', 'Hosting'], ['correo', 'Correo'], ['vps', 'VPS']];
    case 'predeterminada':
      return [['PEN', 'S/'], ['USD', 'US$']];
    default:
      return [];
  }
}

export type Prod = { kind: 'hp'; x: HostingPlan } | { kind: 'vp'; x: VpsPlan } | { kind: 'gp'; x: GenProduct };
export function prodById(id: string): Prod | null {
  const h = HPLANS.find((p) => p.id === id);
  if (h) return { kind: 'hp', x: h };
  const v = VPLANS.find((p) => p.id === id);
  if (v) return { kind: 'vp', x: v };
  const g = GENPROD.find((p) => p.id === id);
  return g ? { kind: 'gp', x: g } : null;
}

/* ---------- WHOIS y servidores ---------- */
export const LOCS: Record<string, string> = { Contabo: 'St. Louis, EE.UU.', DigitalOcean: 'Nueva York, EE.UU.', Propio: 'Lima, Perú' };
export const whoisTaken = (d: string): boolean => domains.some((x) => x.d === d) || kHash(d) % 3 === 0;
export interface SrvRow {
  id: string;
  name: string;
  cpu: number;
  ram: number;
  dsk: string;
  loc: string;
  pm: number;
  pa?: number;
}
export function srvList(tipo: string, ids: string): SrvRow[] {
  let l: SrvRow[] =
    tipo === 'dedicado'
      ? DEDI.map((d) => ({ id: d.id, name: d.name, cpu: d.cpu, ram: d.ram, dsk: d.disk, loc: d.loc, pm: d.pm }))
      : VPLANS.filter((x) => x.active).map((x) => ({ id: x.id, name: x.name, cpu: x.cpu, ram: x.ram, dsk: x.disk + ' GB SSD', loc: LOCS[x.src] || x.src, pm: x.p.m, pa: x.p.a }));
  if (ids && ids.trim()) {
    const s = ids.split(',').map((x) => x.trim());
    l = l.filter((x) => s.includes(x.id));
  }
  return l;
}
