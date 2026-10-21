/**
 * Catálogo de productos (prototipo l.1957-2003 y l.2279-2282).
 * Datos estáticos (no consumen el generador). Mutables por la vista Catálogo.
 * Productos genéricos por categoría (GENPROD, l.2284-2334), servidores
 * dedicados (DEDI, l.3262) y categorías personalizadas los porta la vista.
 */
import { CBY, domains, services } from './db';
import { TC, NF2 } from './format';
import type { Addon, BrandId, Bundle, HostingPlan, TldPrice, VpsPlan } from './types';

const svcCount = (brand: BrandId, plan: string): number =>
  services.filter((s) => s.t === 'Hosting cPanel' && s.plan.startsWith(plan) && CBY[s.cid].brand === brand && s.st === 'Activo').length;

export const HPLANS: HostingPlan[] = (
  [
    { id: 'HP1', brand: 'ap', name: 'Emprendedor', disk: 10, bw: 100, mails: 10, dbs: 2, sites: 1, whm: 'ap_emprendedor', node: 'VPS-AP-03', p: { PEN: { m: 19.9, a: 199 }, USD: { m: 5.9, a: 59 } }, online: true, feat: false, active: true },
    { id: 'HP2', brand: 'ap', name: 'Pyme', disk: 30, bw: 0, mails: 50, dbs: 10, sites: 5, whm: 'ap_pyme', node: 'VPS-AP-03', p: { PEN: { m: 34.9, a: 349 }, USD: { m: 9.9, a: 99 } }, online: true, feat: true, active: true },
    { id: 'HP3', brand: 'ap', name: 'Corporativo', disk: 80, bw: 0, mails: 200, dbs: 30, sites: 20, whm: 'ap_corporativo', node: 'VPS-AP-01', p: { PEN: { m: 69.9, a: 699 }, USD: { m: 18.9, a: 189 } }, online: true, feat: false, active: true },
    { id: 'HP4', brand: 'ap', name: 'Reseller Inicial', disk: 100, bw: 0, mails: 0, dbs: 0, sites: 25, whm: 'ap_reseller25', node: 'VPS-AP-01', p: { PEN: { m: 99, a: 990 }, USD: { m: 27, a: 270 } }, online: false, feat: false, active: true },
    { id: 'HP5', brand: 'sc', name: 'Emprendedor', disk: 15, bw: 150, mails: 15, dbs: 3, sites: 1, whm: 'sc_start', node: 'VPS-SC-01', p: { PEN: { m: 21.9, a: 219 }, USD: { m: 5.9, a: 59 } }, online: true, feat: false, active: true },
    { id: 'HP6', brand: 'sc', name: 'Pyme', disk: 40, bw: 0, mails: 60, dbs: 15, sites: 5, whm: 'sc_pro', node: 'VPS-SC-01', p: { PEN: { m: 36.9, a: 369 }, USD: { m: 9.9, a: 99 } }, online: true, feat: true, active: true },
    { id: 'HP7', brand: 'sc', name: 'Corporativo', disk: 100, bw: 0, mails: 250, dbs: 40, sites: 25, whm: 'sc_business', node: 'VPS-SC-01', p: { PEN: { m: 74.9, a: 749 }, USD: { m: 19.9, a: 199 } }, online: true, feat: false, active: true },
    { id: 'HP8', brand: 'ha', name: 'Emprendedor', disk: 10, bw: 100, mails: 10, dbs: 2, sites: 1, whm: 'ha_basico', node: 'BH-RES-03', p: { PEN: { m: 17.9, a: 179 }, USD: { m: 4.9, a: 49 } }, online: true, feat: false, active: true },
    { id: 'HP9', brand: 'ha', name: 'Pyme', disk: 25, bw: 0, mails: 40, dbs: 8, sites: 3, whm: 'ha_plus', node: 'BH-RES-03', p: { PEN: { m: 29.9, a: 299 }, USD: { m: 8.5, a: 85 } }, online: true, feat: true, active: true },
    { id: 'HP10', brand: 'ns', name: 'Corporativo', disk: 60, bw: 0, mails: 100, dbs: 20, sites: 10, whm: 'ns_nube1', node: 'VPS-AP-02', p: { PEN: { m: 59.9, a: 599 }, USD: { m: 15.9, a: 159 } }, online: true, feat: true, active: true },
    { id: 'HP11', brand: 'ns', name: 'Pyme', disk: 20, bw: 0, mails: 30, dbs: 5, sites: 3, whm: 'ns_start', node: 'VPS-AP-02', p: { PEN: { m: 29.9, a: 299 }, USD: { m: 7.9, a: 79 } }, online: false, feat: false, active: false },
  ] as Omit<HostingPlan, 'clients'>[]
).map((h) => ({ ...h, clients: svcCount(h.brand, h.name) }));
(HPLANS.find((p) => p.id === 'HP4') as HostingPlan).cat = 'reseller';
HPLANS.push(
  { id: 'HP12', cat: 'reseller', brand: 'ap', name: 'Reseller Pro', disk: 250, bw: 0, mails: 0, dbs: 0, sites: 60, whm: 'ap_reseller60', node: 'VPS-AP-03', p: { PEN: { m: 189, a: 1890 }, USD: { m: 52, a: 520 } }, online: true, feat: true, active: true, clients: 4 },
  { id: 'HP13', cat: 'reseller', brand: 'sc', name: 'Reseller Agencia', disk: 150, bw: 0, mails: 0, dbs: 0, sites: 40, whm: 'sc_reseller40', node: 'VPS-SC-01', p: { PEN: { m: 149, a: 1490 }, USD: { m: 41, a: 410 } }, online: true, feat: false, active: true, clients: 2 },
);

export const VPLANS: VpsPlan[] = [
  { id: 'VP1', name: 'VPS Start', cpu: 2, ram: 4, disk: 80, tr: 4, os: 'Ubuntu 24.04 / AlmaLinux 9', managed: false, src: 'Contabo', srcPlan: 'Cloud VPS 10', cost: 5.5, p: { m: 75, t: 210, s: 405, a: 780 }, online: true, active: true, clients: 14 },
  { id: 'VP2', name: 'VPS Pro', cpu: 6, ram: 12, disk: 200, tr: 32, os: 'AlmaLinux 9 + cPanel', managed: true, src: 'Contabo', srcPlan: 'Cloud VPS 20', cost: 9.5, p: { m: 180, t: 510, s: 990, a: 1890 }, online: true, active: true, clients: 21 },
  { id: 'VP3', name: 'VPS Business', cpu: 8, ram: 24, disk: 400, tr: 32, os: 'AlmaLinux 9 + cPanel', managed: true, src: 'Contabo', srcPlan: 'Cloud VPS 30', cost: 17, p: { m: 320, t: 910, s: 1760, a: 3360 }, online: true, active: true, clients: 6 },
  { id: 'VP4', name: 'Droplet Ágil', cpu: 2, ram: 4, disk: 80, tr: 4, os: 'Ubuntu 24.04', managed: false, src: 'DigitalOcean', srcPlan: 'Basic 4 GB', cost: 24, p: { m: 150, t: 430, s: 840, a: 1620 }, online: true, active: true, clients: 9 },
  { id: 'VP5', name: 'Droplet Gestionado', cpu: 4, ram: 8, disk: 160, tr: 5, os: 'Ubuntu 24.04 + panel', managed: true, src: 'DigitalOcean', srcPlan: 'Basic 8 GB', cost: 48, p: { m: 260, t: 750, s: 1460, a: 2808 }, online: false, active: true, clients: 3 },
  { id: 'VP6', name: 'VPS Dedicado Lima', cpu: 4, ram: 16, disk: 500, tr: 10, os: 'Debian 12', managed: true, src: 'Propio', srcPlan: 'Nodo propio (colocation)', cost: 42, p: { m: 290, t: 840, s: 1640, a: 3150 }, online: false, active: true, clients: 2 },
];
export const ADDONS: Addon[] = [
  { n: 'Respaldos diarios (7 copias)', cost: 1.5, p: 25 },
  { n: 'Licencia cPanel Admin (5 cuentas)', cost: 26.99, p: 135 },
  { n: 'Licencia cPanel Pro (30 cuentas)', cost: 37.99, p: 179 },
  { n: 'IP adicional', cost: 3, p: 19 },
  { n: 'Administración 24/7', cost: 0, p: 60 },
];
export const TLDS: TldPrice[] = [
  { tld: '.pe', reg: 'PoloDomains', cR: 26, cRn: 26, cT: 26, pPEN: 129, pUSD: 35, online: true },
  { tld: '.com.pe', reg: 'PoloDomains', cR: 24, cRn: 24, cT: 24, pPEN: 119, pUSD: 32, online: true },
  { tld: '.com', reg: 'Namecheap', cR: 10.28, cRn: 15.16, cT: 10.28, pPEN: 69, pUSD: 19, online: true },
  { tld: '.net', reg: 'Namecheap', cR: 12.98, cRn: 16.98, cT: 12.98, pPEN: 79, pUSD: 21, online: true },
  { tld: '.org', reg: 'NameSilo', cR: 10.79, cRn: 12.79, cT: 10.79, pPEN: 69, pUSD: 18, online: true },
  { tld: '.cl', reg: 'NameSilo', cR: 19.99, cRn: 19.99, cT: 19.99, pPEN: 89, pUSD: 24, online: false },
  { tld: '.mx', reg: 'Namecheap', cR: 35.98, cRn: 35.98, cT: 35.98, pPEN: 149, pUSD: 42, online: true },
  { tld: '.co', reg: 'Namecheap', cR: 11.98, cRn: 28.98, cT: 11.98, pPEN: 99, pUSD: 29, online: true },
];
/** Cantidad de dominios registrados con una extensión. */
export const tldClients = (t: string): number =>
  domains.filter((d) => (t === '.pe' ? /^[^.]+\.pe$/.test(d.d) : d.d.endsWith(t) && (t !== '.com' || !d.d.endsWith('.com.pe')))).length;
export const BUNDLES: Bundle[] = [
  { id: 'BD1', brand: 'ap', name: 'Emprende Online', items: ['Hosting Emprendedor (anual)', 'Dominio .com.pe', 'SSL incluido'], list: 318, price: 259, online: true, active: true, clients: 37 },
  { id: 'BD2', brand: 'ap', name: 'Pyme Profesional', items: ['Hosting Pyme (anual)', 'Dominio .pe', 'Google Workspace × 3 (anual)'], list: 1450, price: 1199, online: true, active: true, clients: 22 },
  { id: 'BD3', brand: 'sc', name: 'Tienda Lista', items: ['VPS Start (anual)', 'Dominio .com', 'WooCommerce instalado', 'CDN Bunny.net (anual)'], list: 1390, price: 1149, online: true, active: true, clients: 8 },
  { id: 'BD4', brand: 'ha', name: 'Andino Básico', items: ['Hosting Emprendedor (anual)', 'Dominio .pe'], list: 308, price: 269, online: false, active: true, clients: 5 },
  { id: 'BD5', brand: 'ns', name: 'Nube Corporativa', items: ['Hosting Corporativo (anual)', 'Microsoft 365 × 5 (anual)', 'Mailing 10k'], list: 2310, price: 1990, online: true, active: false, clients: 0 },
];
/** Categorías del catálogo. */
export const CATS: { id: string; n: string }[] = (
  [['hosting', 'Hosting compartido'], ['reseller', 'Reseller'], ['vps', 'VPS'], ['dedicado', 'Servidores dedicados'], ['cloud', 'Cloud'], ['dominios', 'Dominios'], ['ssl', 'SSL'], ['correo', 'Correo corporativo'], ['web', 'Páginas web'], ['tienda', 'Tiendas virtuales'], ['moodle', 'Moodle'], ['licencias', 'Licencias'], ['soporte', 'Soporte y mantenimiento'], ['desarrollo', 'Desarrollo a medida'], ['combos', 'Paquetes combinados'], ['personalizados', 'Personalizados']] as [string, string][]
).map(([id, n]) => ({ id, n }));
export const CYC = ['Único', 'Mensual', 'Anual', 'Por hora', 'Por consumo'];
/** Margen % de precio vs costo (misma moneda). */
export const mgPct = (price: number, cost: number): number => (price > 0 ? ((price - cost) / price) * 100 : 0);
/** Margen mínimo de un TLD sobre la renovación. */
export const tldMg = (t: TldPrice): number => Math.min(mgPct(t.pUSD, t.cRn), mgPct(t.pPEN / TC, t.cRn));
/** Texto de margen: "35 %". */
export const mgText = (m: number): string => NF2.format(m).replace(/\.00$/, '') + ' %';
/** Configuración editable del catálogo. */
export const catCfg = { minMg: 20 };
