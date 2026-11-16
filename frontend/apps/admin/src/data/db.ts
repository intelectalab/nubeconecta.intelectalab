/**
 * Base de datos mock del panel. Generada con el MISMO generador y en el MISMO
 * orden que prototipo/panel.html (l.1063-1295 y bloques posteriores), por lo
 * que con la semilla 20261008 produce exactamente los mismos registros.
 *
 * Los arreglos son mutables a propósito: las acciones simuladas modifican los
 * registros en memoria (como `refresh()` en el prototipo) y luego llaman a
 * `refresh()` de `useApp()` para volver a renderizar.
 *
 * NO cambie el orden de las secciones ni añada llamadas a rnd()/pick()/ri()
 * entre ellas: alteraría todos los datos posteriores.
 */
import { pick, ri, rnd, wpick } from './rng';
import { addBiz, addD, bizBetween, diffD, norm, NOW, slug, TODAY } from './format';
import type {
  Brand,
  BrandFilter,
  TicketMsg,
  BrandId,
  Client,
  ClientStatus,
  CloudProject,
  Commitment,
  Contract,
  Cert,
  Cur,
  Domain,
  HostNode,
  Invoice,
  InvoiceLine,
  InvoiceType,
  Lead,
  LeadStage,
  LegalDoc,
  License,
  MigItem,
  MigState,
  Notif,
  Order,
  PlanDef,
  Provider,
  Reclamo,
  SeqStep,
  Service,
  Sev,
  SlaRule,
  SunatStatus,
  Task,
  Ticket,
  TicketStatus,
  VaultAudit,
  VaultItem,
  Voucher,
  Quote,
  QuoteLine,
  QuoteVersion,
  ProviderAccount,
} from './types';

/* ================= Marcas y catálogos de nombres ================= */
export const BRANDS: Brand[] = [
  { id: 'ap', n: 'NubeConecta', c: 'var(--brand)' },
  { id: 'sc', n: 'ServerCreativo', c: 'var(--ok)' },
  { id: 'ha', n: 'HostAndino', c: 'var(--high)' },
  { id: 'ns', n: 'NubeSur Cloud', c: 'var(--faint)' },
];
export const BR: Record<BrandId, Brand> = Object.fromEntries(BRANDS.map((b) => [b.id, b])) as Record<BrandId, Brand>;
/** Participación de cada marca (se usa para escalar cifras agregadas). */
export const BRAND_SHARE: Record<'all' | BrandId, number> = { all: 1, ap: 0.56, sc: 0.24, ha: 0.12, ns: 0.08 };

export const EJEC = ['Lucía Paredes', 'Jorge Quispe', 'Valeria Ccori'];
/** Agentes de soporte. Tras la generación se añade ME ('Renzo Vargas'). */
export const AGENTS = ['Carla Huamán', 'Diego Rojas', 'Ana Salazar', 'Miguel Torres'];
export const ME = 'Renzo Vargas';
export const PRE = ['Inversiones', 'Corporación', 'Comercial', 'Consultora', 'Agencia', 'Clínica', 'Estudio', 'Colegio', 'Distribuidora', 'Transportes', 'Constructora', 'Restaurante', 'Hotel', 'Inmobiliaria', 'Laboratorio', 'Ferretería', 'Textil', 'Agroexportadora', 'Academia', 'Importaciones', 'Notaría', 'Veterinaria'];
export const MID = ['Andina', 'Los Incas', 'Mistura', 'Pacífico Sur', 'Qori', 'Wayra', 'San Martín', 'Huascarán', 'Chaska', 'Inti Raymi', 'Miraflores', 'El Sol', 'Amazonas', 'Tumi', 'Kallpa', 'Illari', 'Nazca', 'Titicaca', 'Moche', 'Paracas', 'Colca', 'Lúcuma', 'Sumaq', 'Yaku', 'Ayllu', 'Cusi', 'Vilcanota', 'Chavín', 'Misti', 'Ichu'];
export const SUF = ['S.A.C.', 'E.I.R.L.', 'S.A.', 'S.R.L.', 'S.A.C.', 'S.A.C.'];
export const PERS = ['Rosa', 'Carlos', 'Milagros', 'Luis', 'Patricia', 'Jhon', 'Kiara', 'Renato', 'Gabriela', 'Óscar', 'Fiorella', 'Raúl'];
export const APE = ['Mamani', 'Flores', 'Chávez', 'Ramírez', 'Torres', 'Huamaní', 'Castillo', 'Ríos', 'Vega', 'Medina', 'Soto', 'Cárdenas'];
export const COUNTRIES: [string, number][] = [['Perú', 85], ['Chile', 4], ['Colombia', 3], ['México', 3], ['EE.UU.', 3], ['España', 2]];

/* ================= Clientes ================= */
export const clients: Client[] = [];
const usedNames = new Set<string>();
export function mkName(): string {
  for (;;) {
    const n = `${pick(PRE)} ${pick(MID)} ${pick(SUF)}`;
    if (!usedNames.has(n)) {
      usedNames.add(n);
      return n;
    }
  }
}
for (let i = 0; i < 412; i++) {
  const person = rnd() < 0.12;
  const name = person ? `${pick(PERS)} ${pick(APE)} ${pick(APE)}` : mkName();
  const country = wpick(COUNTRIES);
  const brand = wpick<BrandId>([['ap', 55], ['sc', 25], ['ha', 12], ['ns', 8]]);
  const status = wpick<ClientStatus>([['Activo', 84], ['Moroso', 7], ['Suspendido', 4], ['Inactivo', 5]]);
  const doc = person
    ? country === 'Perú'
      ? 'DNI ' + ri(10000000, 79999999)
      : 'Pasaporte'
    : country === 'Perú'
      ? 'RUC 20' + ri(100000000, 699999999)
      : 'Tax ID ' + ri(10000000, 99999999);
  const cur: Cur = country === 'Perú' ? (rnd() < 0.82 ? 'PEN' : 'USD') : 'USD';
  const since = addD(TODAY, -ri(60, 2900));
  const exec = pick(EJEC);
  const contact = `${pick(PERS)} ${pick(APE)}`;
  const phone = '+51 9' + ri(10, 99) + ' ' + ri(100, 999) + ' ' + ri(100, 999);
  clients.push({ id: 'CL-' + String(1001 + i), name, person, country, brand, status, doc, cur, since, exec, contact, phone, email: '', services: [], domains: [], invoices: [], tickets: [], mrr: 0 });
}
// Cliente vitrina
Object.assign(clients[0], { name: 'Andes Travel Experience S.A.C.', person: false, country: 'Perú', brand: 'ap', status: 'Activo', doc: 'RUC 20604418827', cur: 'PEN', since: new Date(2021, 2, 15), exec: 'Lucía Paredes', contact: 'Mariela Choque', phone: '+51 984 221 640' });
Object.assign(clients[1], { name: 'Clínica Dental Sonríe E.I.R.L.', person: false, country: 'Perú', brand: 'sc', status: 'Moroso', doc: 'RUC 20601992315', cur: 'PEN' });
clients.forEach((c, i) => {
  c.email =
    i === 0
      ? 'reservas@andestravel.pe'
      : (c.person ? norm(c.name.split(' ')[0]) + '.' + norm(c.name.split(' ')[1]) : 'admin') + '@' + slug(c.name) + (c.country === 'Perú' ? '.pe' : '.com');
});
/** Índice de clientes por id (se mantiene al crear clientes con addClient). */
export const CBY: Record<string, Client> = Object.fromEntries(clients.map((c) => [c.id, c]));

/* ================= Nodos de hosting ================= */
const pctOf = (a: [number, number] | null): number | null => (a ? Math.round((a[0] / a[1]) * 100) : null);
export const NODES: HostNode[] = (
  [
    { id: 'BH-RES-01', n: 'BanaHosting Reseller 1', prov: 'BanaHosting', kind: 'Reseller WHM', disk: [468, 500], acc: [148, 150], ram: null, cpu: null, loc: 'Dallas, EE.UU.', ip: '198.51.100.21' },
    { id: 'BH-RES-02', n: 'BanaHosting Reseller 2', prov: 'BanaHosting', kind: 'Reseller WHM', disk: [392, 500], acc: [121, 150], ram: null, cpu: null, loc: 'Dallas, EE.UU.', ip: '198.51.100.48' },
    { id: 'BH-RES-03', n: 'BanaHosting Reseller 3', prov: 'BanaHosting', kind: 'Reseller WHM', disk: [188, 300], acc: [64, 100], ram: null, cpu: null, loc: 'Miami, EE.UU.', ip: '198.51.100.77' },
    { id: 'VPS-AP-01', n: 'VPS propio AP 1', prov: 'Contabo', kind: 'VPS propio WHM', disk: [214, 400], acc: [71, 200], ram: [14.1, 24], cpu: 41, loc: 'St. Louis, EE.UU.', ip: '203.0.113.14' },
    { id: 'VPS-AP-02', n: 'VPS propio AP 2', prov: 'DigitalOcean', kind: 'VPS propio WHM', disk: [118, 320], acc: [39, 160], ram: [6.2, 16], cpu: 22, loc: 'Nueva York, EE.UU.', ip: '203.0.113.52' },
    { id: 'VPS-AP-03', n: 'VPS propio AP 3 (destino migración)', prov: 'Contabo', kind: 'VPS propio WHM', disk: [171, 600], acc: [61, 300], ram: [11.8, 48], cpu: 18, loc: 'St. Louis, EE.UU.', ip: '203.0.113.90' },
    { id: 'VPS-SC-01', n: 'VPS ServerCreativo', prov: 'Contabo', kind: 'VPS propio WHM', disk: [356, 400], acc: [96, 120], ram: [20.9, 24], cpu: 67, loc: 'Lauterbach, Alemania', ip: '203.0.113.131' },
  ] as Omit<HostNode, 'p'>[]
).map((n) => ({ ...n, p: Math.max(pctOf(n.disk) as number, pctOf(n.acc) as number, n.ram ? (pctOf(n.ram) as number) : 0) }));
export const NBY: Record<string, HostNode> = Object.fromEntries(NODES.map((n) => [n.id, n]));
/** Porcentaje usado de un par [usado, total]; null si no aplica. */
export const pct = pctOf;

/* ================= Servicios ================= */
export const PLANS: PlanDef[] = [
  { t: 'Hosting cPanel', plan: 'Emprendedor', PEN: 199, USD: 59, cy: 'Anual', ic: 'server' },
  { t: 'Hosting cPanel', plan: 'Pyme', PEN: 349, USD: 99, cy: 'Anual', ic: 'server' },
  { t: 'Hosting cPanel', plan: 'Corporativo', PEN: 699, USD: 189, cy: 'Anual', ic: 'server' },
  { t: 'VPS administrado', plan: 'Cloud VPS 20', PEN: 180, USD: 49, cy: 'Mensual', ic: 'cpu', prov: 'Contabo' },
  { t: 'VPS administrado', plan: 'Droplet 4 GB', PEN: 150, USD: 40, cy: 'Mensual', ic: 'cpu', prov: 'DigitalOcean' },
  { t: 'Google Workspace', plan: 'Business Starter', PEN: 27, USD: 7.2, cy: 'Mensual', ic: 'mail', prov: 'Google Workspace', seats: true },
  { t: 'Microsoft 365', plan: 'Business Basic', PEN: 23, USD: 6, cy: 'Mensual', ic: 'mail', prov: 'Microsoft 365', seats: true },
  { t: 'CDN', plan: 'Pull zone estándar', PEN: 25, USD: 7, cy: 'Mensual', ic: 'layers', prov: 'Bunny.net' },
  { t: 'Mailing', plan: 'Plan 10k envíos', PEN: 45, USD: 12, cy: 'Mensual', ic: 'send', prov: 'Elastic Email' },
  { t: 'Certificado SSL', plan: 'Wildcard DV', PEN: 290, USD: 79, cy: 'Anual', ic: 'shield', prov: 'Sectigo (vía Namecheap)' },
  { t: 'Backup externo', plan: '50 GB', PEN: 19, USD: 5, cy: 'Mensual', ic: 'db', prov: 'AWS S3' },
];
export const services: Service[] = [];
let sid = 5001;
const hostNodes = ['BH-RES-01', 'BH-RES-02', 'BH-RES-03', 'VPS-AP-01', 'VPS-AP-02', 'VPS-AP-03'];
clients.forEach((c, i) => {
  const n = i === 0 ? 0 : wpick([[1, 30], [2, 35], [3, 22], [4, 9], [5, 4]]);
  const chosen = new Set<number>();
  if (n > 0) chosen.add(rnd() < 0.85 ? ri(0, 2) : ri(3, 4));
  while (chosen.size < n) chosen.add(ri(0, PLANS.length - 1));
  chosen.forEach((pi) => {
    const P = PLANS[pi];
    const seats = P.seats ? ri(3, 40) : 1;
    let node: string | null = null;
    let prov = P.prov as string;
    if (P.t === 'Hosting cPanel') {
      node = c.brand === 'sc' && rnd() < 0.6 ? 'VPS-SC-01' : pick(hostNodes);
      prov = NBY[node].prov + (node.startsWith('BH') ? ' (reseller)' : ' (VPS propio)');
    }
    const due = P.cy === 'Anual' ? addD(TODAY, ri(-25, 340)) : addD(TODAY, ri(-12, 24));
    let st: Service['st'] = 'Activo';
    if (c.status === 'Suspendido') st = 'Suspendido';
    else if (c.status === 'Inactivo') st = 'Cancelado';
    services.push({ id: 'SV-' + sid++, cid: c.id, t: P.t, plan: P.plan + (seats > 1 ? ` × ${seats}` : ''), ic: P.ic, prov, node, cur: c.cur, price: +(P[c.cur] * seats).toFixed(2), cy: P.cy, due, st, seats });
  });
});
// Servicios del cliente vitrina (sin `seats`, igual que en el prototipo)
(
  [
    ['VPS administrado', 'Cloud VPS 20 · 6 vCPU · 12 GB', 'cpu', 'Contabo', null, 'PEN', 180, 'Mensual', addD(TODAY, 6)],
    ['CDN', 'Pull zone andestravel', 'layers', 'Bunny.net', null, 'PEN', 25, 'Mensual', addD(TODAY, 6)],
    ['DNS administrado', 'Route 53 · 1 zona', 'net', 'AWS', null, 'PEN', 8, 'Mensual', addD(TODAY, 6)],
    ['Hosting de correo', 'Correo cPanel · 18 buzones', 'mail', 'BanaHosting (reseller)', 'BH-RES-02', 'PEN', 349, 'Anual', addD(TODAY, 47)],
    ['Mailing', 'Plan 25k envíos', 'send', 'Elastic Email', null, 'PEN', 85, 'Mensual', addD(TODAY, 6)],
    ['Desarrollo y soporte', 'Motor de reservas · bolsa 6 h/mes', 'code', 'Equipo interno', null, 'PEN', 540, 'Mensual', addD(TODAY, 6)],
    ['Google Workspace', 'Business Starter × 14', 'mail', 'Google Workspace', null, 'PEN', 378, 'Mensual', addD(TODAY, 6)],
  ] as [string, string, string, string, string | null, Cur, number, string, Date][]
).forEach((a) => services.push({ id: 'SV-' + sid++, cid: 'CL-1001', t: a[0], plan: a[1], ic: a[2], prov: a[3], node: a[4], cur: a[5], price: a[6], cy: a[7], due: a[8], st: 'Activo' }));
services.forEach((s) => CBY[s.cid].services.push(s));
/** MRR de un servicio en su moneda (anual ÷ 12; cancelado = 0). */
export const mrrOf = (s: Service): number => (s.st === 'Cancelado' ? 0 : s.cy === 'Anual' ? s.price / 12 : s.price);
clients.forEach((c) => {
  c.mrr = c.services.reduce((a, s) => a + mrrOf(s), 0);
});

/* ================= Dominios ================= */
export const domains: Domain[] = [];
const usedDom = new Set<string>();
let did = 1;
clients.forEach((c, i) => {
  const n = i === 0 ? 2 : wpick([[0, 8], [1, 62], [2, 24], [3, 6]]);
  for (let k = 0; k < n; k++) {
    const tld =
      c.country === 'Perú'
        ? wpick([['.pe', 30], ['.com.pe', 30], ['.com', 32], ['.org.pe', 4], ['.net', 4]])
        : wpick([['.com', 70], ['.net', 15], ['.org', 15]]);
    const base = slug(c.name) + (k > 0 ? pick(['online', 'tienda', 'reservas', 'app', 'blog']) : '');
    let d = base + tld;
    let j = 2;
    while (usedDom.has(d)) {
      d = base + j + tld;
      j++;
    }
    usedDom.add(d);
    const reg = tld.endsWith('.pe') ? 'PoloDomains' : rnd() < 0.6 ? 'Namecheap' : 'NameSilo';
    const opts: [number, number][] = [[ri(-15, -1), 5], [ri(0, 30), 14], [ri(31, 120), 25], [ri(121, 380), 56]];
    const real = addD(TODAY, wpick(opts));
    const tit = rnd() < 0.35 ? 'Empresa' : 'Cliente';
    const auto = rnd() < 0.62;
    const ns = pick(['ns1/ns2.nubeconecta.pe', 'Route 53', 'Bunny DNS', 'ns de cliente']);
    domains.push({ id: 'DM-' + did++, d, cid: c.id, reg, real, com: addD(real, -15), tit, auto, ns });
  }
});
{
  const d0 = domains.filter((d) => d.cid === 'CL-1001');
  Object.assign(d0[0], { d: 'andestravel.pe', reg: 'PoloDomains', real: addD(TODAY, 156), com: addD(TODAY, 141), tit: 'Empresa', auto: true, ns: 'Route 53' });
  Object.assign(d0[1], { d: 'andestravelexperience.com', reg: 'Namecheap', real: addD(TODAY, 19), com: addD(TODAY, 4), tit: 'Cliente', auto: false, ns: 'Route 53' });
}
// algunos críticos
domains[5].real = addD(TODAY, 3);
domains[5].com = addD(TODAY, -12);
domains[5].tit = 'Empresa';
domains[5].auto = false;
domains[9].real = addD(TODAY, 1);
domains[9].com = addD(TODAY, -14);
domains[9].auto = false;
domains.forEach((d) => CBY[d.cid].domains.push(d));

/* ================= Comprobantes ================= */
export const invoices: Invoice[] = [];
const counters = { fN: 18240, bN: 6120, ncN: 311, ndN: 208 };
export interface NewInvoiceOpts {
  type?: InvoiceType;
  cur?: Cur;
  issue: Date;
  due: Date;
  lines: InvoiceLine[];
  sunat?: SunatStatus;
  method?: string | null;
  ref?: string | null;
  paid?: boolean;
  paidOn?: Date;
}
/** Emite un comprobante (numeración correlativa por serie) y lo enlaza al cliente. */
export function addInv(c: Client, o: NewInvoiceOpts): Invoice {
  const type: InvoiceType = o.type || (c.person ? 'Boleta' : 'Factura');
  const num =
    type === 'Factura'
      ? `F001-${String(counters.fN++).padStart(8, '0')}`
      : type === 'Boleta'
        ? `B001-${String(counters.bN++).padStart(8, '0')}`
        : type === 'Nota de crédito'
          ? `FC01-${String(counters.ncN++).padStart(8, '0')}`
          : `FD01-${String(counters.ndN++).padStart(8, '0')}`;
  const igv = c.country === 'Perú' && type !== 'Nota de crédito' ? 0.18 : 0;
  const lines = o.lines;
  const sub = lines.reduce((a, l) => a + l.q * l.pu, 0);
  const inv: Invoice = {
    id: num, num, cid: c.id, type, cur: o.cur || c.cur, issue: o.issue, due: o.due, lines,
    sub: +sub.toFixed(2), igvR: igv, igv: +(sub * igv).toFixed(2), total: +(sub * (1 + igv)).toFixed(2),
    paid: 0, status: 'Pendiente', sunat: o.sunat || 'Aceptada', method: o.method || null, ref: o.ref || null, payments: [], remind: [],
  };
  if (o.paid) {
    inv.paid = inv.total;
    inv.status = 'Pagada';
    inv.payments.push({ d: o.paidOn || o.due, m: o.method || null, amt: inv.total });
  }
  invoices.push(inv);
  c.invoices.push(inv);
  IBY[inv.id] = inv;
  return inv;
}
export const METH: [string, number][] = [['Tarjeta (pasarela local)', 45], ['Transferencia', 38], ['PayPal', 17]];
/** Líneas de comprobante para servicios (agrega comisión PayPal como línea aparte). */
export function svcLines(c: Client, list: Service[], method: string | null): InvoiceLine[] {
  const ls: InvoiceLine[] = list.map((s) => ({ d: `${s.t} — ${s.plan}${s.cy === 'Anual' ? ' (12 meses)' : ' (1 mes)'}`, q: 1, pu: s.price }));
  if (method === 'PayPal') {
    const base = ls.reduce((a, l) => a + l.pu, 0);
    ls.push({ d: 'Comisión por medio de pago (PayPal 5.4 % + tarifa fija)', q: 1, pu: +(base * 0.054 + (c.cur === 'USD' ? 0.3 : 1.15)).toFixed(2), fee: true });
  }
  return ls;
}
/** Índice de comprobantes por id/número. */
export const IBY: Record<string, Invoice> = {};
clients.forEach((c) => {
  if (!c.services.length) return;
  // histórico pagado
  const hist = ri(1, 2);
  for (let h = 0; h < hist; h++) {
    const due = addD(TODAY, -ri(20, 330));
    const m = wpick(METH);
    const issue = addD(due, -15);
    const lines = svcLines(c, [pick(c.services)], m);
    const paidOn = addD(due, -ri(0, 10));
    addInv(c, { issue, due, lines, method: m, paid: true, paidOn });
  }
  // vigente
  const s = c.services.slice().sort((a, b) => a.due.getTime() - b.due.getTime())[0];
  if (diffD(s.due, TODAY) <= 32) {
    const m = wpick(METH);
    const over = diffD(TODAY, s.due);
    let paid = false;
    if (over > 0) paid = c.status === 'Activo' ? rnd() < 0.55 : false;
    else paid = rnd() < 0.18;
    const issue = diffD(addD(s.due, -30), TODAY) > 0 ? addD(TODAY, -ri(0, 3)) : addD(s.due, -30);
    const lines = svcLines(c, [s], paid ? m : null);
    const sunat = wpick<SunatStatus>([['Aceptada', 92], ['Pendiente', 5], ['Rechazada', 2], ['Observada', 1]]);
    const inv = addInv(c, { issue, due: s.due, lines, method: paid ? m : null, paid, sunat });
    if (!paid && over > 0) inv.status = 'Vencida';
  }
});
// vencen hoy (suspensión mañana)
[3, 7, 12, 18, 26].forEach((k) => {
  const c = clients[k];
  if (!c.services.length) return;
  const s = c.services[0];
  addInv(c, { issue: addD(TODAY, -25), due: TODAY, lines: svcLines(c, [s], null), sunat: 'Aceptada' });
});
// vitrina
{
  const c = clients[0];
  const ss = c.services.filter((s) => s.cy === 'Mensual');
  addInv(c, { issue: new Date(2026, 8, 1), due: new Date(2026, 8, 10), lines: svcLines(c, ss, 'PayPal'), method: 'PayPal', paid: true, paidOn: new Date(2026, 8, 9) });
  addInv(c, { issue: new Date(2026, 8, 20), due: addD(TODAY, 6), lines: svcLines(c, ss, null) });
  addInv(c, { issue: new Date(2026, 7, 1), due: new Date(2026, 7, 10), lines: svcLines(c, ss, 'Tarjeta (pasarela local)'), method: 'Tarjeta (pasarela local)', paid: true, paidOn: new Date(2026, 7, 8) });
}
// Notas de débito por mora y notas de crédito
invoices
  .filter((v) => v.status === 'Vencida' && diffD(TODAY, v.due) >= 1)
  .slice(0, 14)
  .forEach((v) => {
    const c = CBY[v.cid];
    addInv(c, { type: 'Nota de débito', cur: v.cur, issue: addD(v.due, 1), due: addD(v.due, 8), lines: [{ d: `Recargo por mora — ref. ${v.num}`, q: 1, pu: +(v.sub * 0.05).toFixed(2) }], ref: v.num, sunat: 'Aceptada' }).status =
      diffD(TODAY, addD(v.due, 8)) > 0 ? 'Vencida' : 'Pendiente';
  });
invoices
  .filter((v) => v.status === 'Pagada' && v.type === 'Factura')
  .slice(3, 9)
  .forEach((v) => {
    const c = CBY[v.cid];
    const n = addInv(c, { type: 'Nota de crédito', cur: v.cur, issue: addD(v.issue, 4), due: addD(v.issue, 4), lines: [{ d: `Descuento por ajuste de plan — ref. ${v.num}`, q: 1, pu: -+(v.sub * 0.1).toFixed(2) }], ref: v.num });
    n.status = 'Aplicada';
    n.paid = n.total;
  });
invoices.forEach((v) => {
  if (v.sunat === 'Rechazada' && v.status === 'Pagada') v.sunat = 'Aceptada';
});
/** Saldo pendiente de un comprobante (nunca negativo). */
export const saldo = (v: Invoice): number => Math.max(0, +(v.total - v.paid).toFixed(2));

/* ================= Vouchers y compromisos ================= */
export const BANKS = ['BCP', 'Interbank', 'BBVA', 'Scotiabank', 'Yape', 'BanBif'];
export const vouchers: Voucher[] = invoices
  .filter((v) => (v.status === 'Pendiente' || v.status === 'Vencida') && v.type !== 'Nota de débito')
  .filter((_, k) => k % 5 === 1)
  .slice(0, 9)
  .map((v, k) => {
    const bank = pick(BANKS);
    const op = String(ri(10000000, 99999999));
    const amt = saldo(v);
    const day = ri(6, 8);
    const hour = ri(8, 10);
    const min = ri(0, 59);
    return { id: 'VC-' + (7301 + k), inv: v.id, cid: v.cid, bank, op, amt, cur: v.cur, at: new Date(2026, 9, day, hour, min), st: 'Por validar' as const };
  });
export const commits: Commitment[] = invoices
  .filter((v) => v.status === 'Vencida')
  .filter((_, k) => k % 3 === 0)
  .slice(0, 7)
  .map((v, k) => {
    const date = addD(TODAY, [-2, 1, 3, 5, 7, 10, 0][k]);
    const note = pick(['Pagará con transferencia al cierre de quincena', 'Confirmó por WhatsApp; espera aprobación de su gerencia', 'Pago parcial ahora y saldo en la fecha', 'Cliente en proceso de cambio de cuenta bancaria']);
    const by = pick(['Rosa Mendoza', 'Lucía Paredes']);
    return { id: 'CP-' + (401 + k), inv: v.id, cid: v.cid, date, amt: saldo(v), cur: v.cur, note, by, st: k === 0 ? 'Incumplido' : 'Vigente' };
  });

/* ================= Tickets ================= */
export const TSUB = ['El sitio web muestra error 500', 'No llegan correos a Gmail', 'Solicitud de restauración de backup', 'Certificado SSL vencido', 'Lentitud en el panel cPanel', 'Migrar buzones a Google Workspace', 'Cambio de DNS para nuevo subdominio', 'Aumento de cuota de disco', 'WordPress con malware detectado', 'Configurar registros SPF/DKIM', 'Facturación: emitir factura con otro RUC', 'Acceso FTP bloqueado', 'Error al conectar base de datos', 'Consulta sobre renovación de dominio', 'Instalar certificado en VPS', 'Correo rebotado por lista negra'];
/** SLA por prioridad (mutable desde Ajustes). */
export const SLA: Record<Sev, SlaRule> = {
  critica: { fr: 15, res: 4, h: '24/7', esc: 'Jefe de soporte' },
  alta: { fr: 60, res: 8, h: '24/7', esc: 'Jefe de soporte' },
  media: { fr: 240, res: 24, h: 'Hábil', esc: 'Coordinador' },
  baja: { fr: 480, res: 48, h: 'Hábil', esc: 'Coordinador' },
};
/** Severidades: etiqueta, icono del prototipo y rango para ordenar. */
export const SEV: Record<Sev, { l: string; ic: string; r: number }> = {
  critica: { l: 'Crítica', ic: 'oct', r: 0 },
  alta: { l: 'Alta', ic: 'tri', r: 1 },
  media: { l: 'Media', ic: 'circ', r: 2 },
  baja: { l: 'Baja', ic: 'sq', r: 3 },
};
export const TST: TicketStatus[] = ['Nuevo', 'En progreso', 'Esperando cliente', 'Resuelto'];
export const tickets: Ticket[] = [];
for (let k = 0; k < 64; k++) {
  const prio = wpick<Sev>([['critica', 6], ['alta', 18], ['media', 46], ['baja', 30]]);
  const status = wpick<TicketStatus>([['Nuevo', 18], ['En progreso', 38], ['Esperando cliente', 22], ['Resuelto', 22]]);
  const created = new Date(NOW.getTime() - ri(10, SLA[prio].res * 60 * 1.35) * 60000);
  const c = k < 3 ? clients[0] : clients[ri(0, clients.length - 1)];
  const sub = k === 0 ? 'Cola de reservas atascada en el motor de reservas' : k === 1 ? 'Rebote de correos desde info@andestravel.pe' : pick(TSUB);
  const agent = status === 'Nuevo' ? null : pick(AGENTS);
  const ch = pick(['Portal', 'Correo', 'WhatsApp', 'Teléfono']);
  const t: Ticket = { id: 'TK-' + (26410 + k), sub, cid: c.id, prio, status, created, agent, ch };
  tickets.push(t);
  c.tickets.push(t);
}
tickets[0].prio = 'alta';
tickets[0].status = 'En progreso';
tickets[0].created = new Date(NOW.getTime() - 6.2 * 36e5);
/** Minutos restantes de SLA de resolución (negativo = fuera de SLA). */
export const slaLeft = (t: Ticket): number => SLA[t.prio].res * 60 - (NOW.getTime() - t.created.getTime()) / 60000;
export const TBY: Record<string, Ticket> = Object.fromEntries(tickets.map((t) => [t.id, t]));

/* ================= CRM ================= */
export const STAGES: LeadStage[] = ['Nuevo', 'Contactado', 'Propuesta enviada', 'Negociación', 'Ganado', 'Perdido'];
export const CHANNELS = ['Landing', 'WhatsApp', 'Mailing', 'Referidos', 'Redes sociales'];
export const LPROD = ['Hosting Pyme + correo', 'VPS administrado', 'Google Workspace 20 usuarios', 'Tienda virtual + hosting', 'Migración a VPS', 'Microsoft 365 + dominio', 'Web corporativa + hosting', 'Mailing 50k'];
export const leads: Lead[] = [];
for (let k = 0; k < 38; k++) {
  const st = wpick<LeadStage>([['Nuevo', 8], ['Contactado', 8], ['Propuesta enviada', 8], ['Negociación', 5], ['Ganado', 6], ['Perdido', 3]]);
  const co = mkName();
  const contact = `${pick(PERS)} ${pick(APE)}`;
  const val = ri(6, 90) * 50;
  const ch = wpick([['Landing', 30], ['WhatsApp', 32], ['Mailing', 12], ['Referidos', 18], ['Redes sociales', 8]]);
  const owner = pick(EJEC);
  const prod = pick(LPROD);
  const brand = wpick<BrandId>([['ap', 60], ['sc', 25], ['ha', 10], ['ns', 5]]);
  const next = k < 7 ? new Date(2026, 9, 8, 9 + k, k % 2 ? 30 : 0) : addD(TODAY, ri(1, 12));
  const act = pick(['Llamada de seguimiento', 'Enviar propuesta', 'Responder por WhatsApp', 'Agendar demo', 'Confirmar datos de facturación']);
  leads.push({ id: 'LD-' + (880 + k), co, contact, stage: st, val, ch, owner, prod, brand, next, done: false, act });
}

/* ================= Migración BanaHosting → VPS propio ================= */
/** [estado, color CSS, clase de chip] */
export const MSTATES: [MigState, string, string][] = [
  ['Pendiente', 'var(--surface-3)', 'neutral'],
  ['Respaldo', 'var(--brand-line)', 'info'],
  ['Copiando', 'var(--brand)', 'info'],
  ['DNS propagando', 'var(--warn)', 'warn'],
  ['Verificación', 'var(--high)', 'high'],
  ['Completada', 'var(--ok)', 'ok'],
];
export const migCounts: Record<MigState, number> = { Pendiente: 56, Respaldo: 4, Copiando: 6, 'DNS propagando': 12, Verificación: 9, Completada: 61 };
const MIG_ST: MigState[] = ['Respaldo', 'Copiando', 'Copiando', 'DNS propagando', 'DNS propagando', 'Verificación', 'Verificación', 'Completada', 'Completada', 'Pendiente', 'Pendiente', 'Respaldo'];
export const migBatch: MigItem[] = clients
  .filter((c) => c.services.some((s) => s.node === 'BH-RES-01'))
  .slice(0, 12)
  .map((c, k) => ({ cid: c.id, acct: slug(c.name).slice(0, 8), size: +(ri(4, 180) / 10).toFixed(1), st: MIG_ST[k] }));

/* ================= Proveedores (resumen en Infraestructura) ================= */
export const PROVIDERS: Provider[] = [
  { n: 'Contabo', ab: 'CT', cost: 142.6, items: [['VPS activos', '5'], ['vCPU totales', '34'], ['Almacenamiento', '2.2 TB']] },
  { n: 'DigitalOcean', ab: 'DO', cost: 118, items: [['Droplets', '4'], ['Volúmenes', '2 · 300 GB'], ['Snapshots', '11']] },
  { n: 'AWS', ab: 'AWS', cost: 96.4, items: [['EC2', '2 instancias'], ['Route 53', '38 zonas'], ['S3 (backups)', '1.6 TB']] },
  { n: 'Azure', ab: 'AZ', cost: 61.2, items: [['Máquinas virtuales', '1 (B2s)'], ['Clientes', '1'], ['Crédito restante', 'US$ 0.00']] },
  { n: 'Google Cloud', ab: 'GC', cost: 44.9, items: [['Compute Engine', '1 (e2-medium)'], ['Cloud SQL', '1'], ['Clientes', '1']] },
  { n: 'Bunny.net', ab: 'BN', cost: 38.7, items: [['Pull zones', '12'], ['Tráfico mes', '3.9 TB'], ['Saldo prepago', 'US$ 61.30']] },
  { n: 'Elastic Email', ab: 'EE', cost: 54, items: [['Subcuentas', '9'], ['Envíos mes', '218 k'], ['Reputación', '98 %']] },
  { n: 'Google Workspace', ab: 'GW', cost: 619.2, items: [['Licencias', '86'], ['Dominios', '11'], ['Margen promedio', '22 %']] },
  { n: 'Microsoft 365', ab: 'MS', cost: 324, items: [['Licencias', '54'], ['Inquilinos', '7'], ['Margen promedio', '18 %']] },
  { n: 'BanaHosting', ab: 'BH', cost: 189, items: [['Cuentas reseller', '3'], ['Cuentas cPanel', '333'], ['Renovación', '15/01/2027']] },
  { n: 'Namecheap', ab: 'NC', cost: 0, items: [['Dominios', '—'], ['Saldo', 'US$ 248.10'], ['Renov. automática', 'Sí']] },
  { n: 'NameSilo', ab: 'NS', cost: 0, items: [['Dominios', '—'], ['Saldo', 'US$ 96.40'], ['Renov. automática', 'Sí']] },
  { n: 'PoloDomains', ab: 'PD', cost: 0, items: [['Dominios .pe', '—'], ['Saldo', 'S/ 1,120.00'], ['Renov. automática', 'No']] },
];
PROVIDERS.forEach((p) => {
  if (['Namecheap', 'NameSilo', 'PoloDomains'].includes(p.n)) p.items[0][1] = String(domains.filter((d) => d.reg === p.n).length);
});

/* ================= Secuencia de cobranza ================= */
/** Etapas de la secuencia de avisos (mutable desde Ajustes). */
export const SEQ: SeqStep[] = [
  { off: -30, act: 'Recordatorio', ch: 'Correo' },
  { off: -15, act: 'Recordatorio', ch: 'Correo' },
  { off: -7, act: 'Recordatorio', ch: 'Correo + WhatsApp' },
  { off: -3, act: 'Último aviso', ch: 'Correo + WhatsApp' },
  { off: 0, act: 'Aviso de vencimiento', ch: 'Correo + WhatsApp' },
  { off: 1, act: 'Suspender servicio', ch: 'Correo + WhatsApp' },
  { off: 1, act: 'Emitir nota de débito por mora', ch: 'Correo' },
  { off: 11, act: 'Dar de baja', ch: 'Correo' },
];
export const ACTS = ['Recordatorio', 'Último aviso', 'Aviso de vencimiento', 'Suspender servicio', 'Emitir nota de débito por mora', 'Dar de baja', 'Escalar a ejecutivo'];
export const CHS = ['Correo', 'WhatsApp', 'SMS', 'Correo + WhatsApp', 'Llamada'];
export const actSev = (a: string): 'danger' | 'warn' | 'info' => (/Suspender|baja/.test(a) ? 'danger' : /débito|Último|Escalar/.test(a) ? 'warn' : 'info');

/* ================= Notificaciones ================= */
export const notifs: Notif[] = [
  { t: '3 vouchers nuevos por validar', s: 'Transferencias BCP e Interbank', at: 'hace 12 min', r: 'cobranza', u: true, ic: 'upload' },
  { t: 'Backup nocturno falló en BH-RES-01', s: '3 cuentas sin copia del 07/10', at: 'hace 2 h', r: 'infra', u: true, ic: 'db' },
  { t: 'Ticket TK-26410 a punto de vencer SLA', s: 'Prioridad alta · Andes Travel Experience', at: 'hace 25 min', r: 'tickets', u: true, ic: 'clock' },
  { t: 'Disco de BH-RES-01 al 94 %', s: 'Superó el umbral de 85 %', at: 'hace 3 h', r: 'infra', u: true, ic: 'server' },
  { t: 'Nuevo prospecto desde la landing', s: 'Plan Hosting Pyme + correo', at: 'hace 4 h', r: 'crm', u: false, ic: 'funnel' },
  { t: 'SUNAT rechazó 1 comprobante', s: 'Revise el detalle en Facturas y pagos', at: 'ayer', r: 'facturas', u: false, ic: 'file' },
  { t: 'Migración: 9 cuentas listas para verificación', s: 'BH-RES-01 → VPS-AP-03', at: 'ayer', r: 'infra', u: false, ic: 'migrate' },
];

/* ================= Libro de Reclamaciones (l.2191) ================= */
/** Correlativo actual por marca. */
export const RCOUNT: Record<BrandId, number> = { ap: 40, sc: 17, ha: 8, ns: 3 };
export const RECL: Reclamo[] = [];
(
  [
    ['Reclamo', 'Cobro duplicado en la renovación del hosting', 148.9, 'Devolución del monto cobrado dos veces'],
    ['Queja', 'Demora en la atención por WhatsApp', 0, 'Mejorar los tiempos de respuesta'],
    ['Reclamo', 'Suspensión del servicio pese a haber enviado el voucher', 349, 'Reactivación inmediata y compensación'],
    ['Reclamo', 'Pérdida de correos tras la migración', 0, 'Recuperar los correos del 1 al 3 de octubre'],
    ['Queja', 'Trato poco cordial en llamada de cobranza', 0, 'Disculpa formal'],
    ['Reclamo', 'El dominio venció aunque pagué la renovación', 69, 'Recuperar el dominio sin costo adicional'],
    ['Reclamo', 'Recargo por mora mal calculado', 17.45, 'Anulación de la nota de débito'],
    ['Queja', 'Publicidad del plan no coincide con los recursos', 0, 'Ajustar el plan a lo ofrecido'],
    ['Reclamo', 'Caída del sitio web por 6 horas', 540, 'Compensación según SLA'],
    ['Reclamo', 'Cobro de comisión PayPal no informado', 8.2, 'Devolución de la comisión'],
    ['Queja', 'No responden mi ticket hace 3 días', 0, 'Atención prioritaria'],
    ['Reclamo', 'Factura emitida con RUC equivocado', 0, 'Emisión de nota de crédito y nueva factura'],
    ['Reclamo', 'Certificado SSL no renovado', 79, 'Instalación inmediata'],
    ['Queja', 'Cambio de precio sin aviso previo', 0, 'Mantener el precio anterior'],
  ] as ['Reclamo' | 'Queja', string, number, string][]
).forEach((r, k) => {
  const b = (['ap', 'ap', 'sc', 'ap', 'ha', 'ap', 'sc', 'ns', 'ap', 'sc', 'ap', 'ha', 'ap', 'sc'] as BrandId[])[k];
  RCOUNT[b]++;
  const date = addD(TODAY, -[1, 2, 13, 4, 6, 9, 12, 3, 19, 7, 0, 18, 20, 23][k]);
  const c = clients.find((x) => x.brand === b && x.person) || clients.find((x) => x.brand === b);
  const nombre = `${PERS[k % PERS.length]} ${APE[(k * 5) % APE.length]} ${APE[(k * 7 + 3) % APE.length]}`;
  const dni = String(40000000 + k * 731911).slice(0, 8);
  const dom = `Av. ${pick(MID)} ${ri(100, 2500)}, ${pick(['Miraflores', 'Surco', 'San Isidro', 'Arequipa', 'Cusco', 'Trujillo', 'Los Olivos'])}`;
  const tel = '+51 9' + ri(10, 99) + ' ' + ri(100, 999) + ' ' + ri(100, 999);
  RECL.push({
    id: `${b.toUpperCase()}-2026-${String(RCOUNT[b]).padStart(6, '0')}`, brand: b, tipo: r[0], det: r[1], monto: r[2], pedido: r[3], date,
    st: [16, 18].includes(k) ? 'Respondido' : k === 11 || k === 2 ? 'Respondido' : k % 4 === 0 ? 'En atención' : 'Nuevo',
    nombre, dni, dom, tel, mail: `${norm(PERS[k % PERS.length])}.${norm(APE[(k * 5) % APE.length])}@correo.pe`, cid: c ? c.id : null, resp: '', test: false,
  });
});

/* ================= Documentos legales por marca (l.2426 y l.2470) ================= */
export const LEGDOCS: [string, string][] = [['terminos', 'Términos y condiciones'], ['privacidad', 'Política de privacidad'], ['reembolsos', 'Política de reembolsos'], ['sla', 'Acuerdo de nivel de servicio (SLA)'], ['uso', 'Política de uso aceptable'], ['aviso', 'Aviso legal']];
export const LEGAL = {} as Record<BrandId, LegalDoc[]>;
BRANDS.forEach((b) => {
  const tot = clients.filter((c) => c.brand === b.id && c.status !== 'Inactivo').length;
  LEGAL[b.id] = LEGDOCS.map(([id, n], k) => {
    const v = k === 0 ? 'v3.2' : k === 1 ? 'v2.4' : `v1.${ri(1, 6)}`;
    const pend = k === 0;
    const vig = new Date(2026, k === 0 ? 8 : ri(0, 7), k === 0 ? 20 : 1);
    const acc = pend ? Math.round(tot * 0.58) : Math.round(tot * (0.93 + rnd() * 0.06));
    return { id, n, v, vig, st: 'Publicado', acc, tot, txt: `${n} de ${b.n}.\n\n1. Alcance\nRegula la relación entre ${b.n} y sus clientes.\n\n(Texto de ejemplo; revisar con asesoría legal.)`, hist: [{ v, date: new Date(2026, 6, 1) }] };
  });
});

/* ================= Tickets: agente actual (l.2557) ================= */
AGENTS.push(ME);
tickets.forEach((t, k) => {
  if (k % 7 === 2 && t.status !== 'Nuevo') t.agent = ME;
});
/** Respuestas predefinidas [título, texto]. */
export const CANNED: [string, string][] = [
  ['Saludo inicial', 'Hola, gracias por escribirnos. Ya estamos revisando tu caso y te actualizamos en breve.'],
  ['Solicitar acceso', 'Para avanzar necesitamos que nos confirmes un usuario temporal con acceso. Puedes compartirlo de forma segura desde tu portal (sección Bóveda).'],
  ['Limpiar caché', 'Hicimos el cambio. Te pedimos limpiar la caché del navegador (Ctrl+F5) y confirmarnos si se ve correctamente.'],
  ['Propagación DNS', 'El cambio de DNS ya está aplicado. La propagación puede tardar hasta 4 horas; te avisaremos cuando esté completa.'],
  ['Cierre', 'Damos por resuelto el caso. Si necesitas algo más, responde a este mensaje y lo reabrimos.'],
];
/** Conversación de un ticket (se genera y cachea en t.msgs; prototipo tkConv l.2561). */
export function tkConv(t: Ticket): TicketMsg[] {
  if (t.msgs) return t.msgs;
  const c = CBY[t.cid];
  const m: TicketMsg[] = [{ k: 'cliente', a: c.contact, at: t.created, txt: `Hola, ${t.sub.toLowerCase()}. ¿Nos pueden ayudar con urgencia? Gracias.`, att: t.id === 'TK-26410' ? ['captura-cola-reservas.png'] : [] }];
  if (t.status !== 'Nuevo') {
    m.push({ k: 'agente', a: t.agent || 'Carla Huamán', at: new Date(t.created.getTime() + 22 * 60000), txt: 'Hola, gracias por escribirnos. Ya estamos revisando el caso y te actualizamos en breve.', att: [] });
    m.push({ k: 'nota', a: t.agent || 'Carla Huamán', at: new Date(t.created.getTime() + 40 * 60000), txt: t.id === 'TK-26410' ? 'La cola de Laravel tiene 312 jobs fallidos por timeout de Elastic Email. Revisar credenciales SMTP en el VPS.' : 'Revisé los logs del servidor; parece un problema de configuración del lado del cliente.', att: [] });
  }
  if (t.status === 'Esperando cliente') m.push({ k: 'agente', a: t.agent || '', at: new Date(t.created.getTime() + 90 * 60000), txt: 'Para avanzar necesitamos que nos confirmes un usuario temporal con acceso.', att: [] });
  if (t.status === 'Resuelto') m.push({ k: 'agente', a: t.agent || '', at: new Date(t.created.getTime() + 180 * 60000), txt: 'Damos por resuelto el caso. Si necesitas algo más, responde a este mensaje.', att: [] });
  t.msgs = m;
  t.links = t.links || [...c.services.slice(0, 2).map((s) => 's:' + s.id), ...c.domains.slice(0, 1).map((d) => 'd:' + d.id)];
  return m;
}

/* ================= Reclamos: registros de prueba (l.2682) ================= */
(
  [
    ['Reclamo', 'PRUEBA — verificación del formulario web (QA)'],
    ['Queja', 'PRUEBA — envío desde servercreativo.com tras actualizar el plugin'],
  ] as ['Reclamo' | 'Queja', string][]
).forEach((x, k) => {
  const b: BrandId = k ? 'sc' : 'ap';
  RCOUNT[b]++;
  RECL.push({ id: `${b.toUpperCase()}-2026-${String(RCOUNT[b]).padStart(6, '0')}`, brand: b, tipo: x[0], det: x[1], monto: 0, pedido: 'Sin pedido (registro de prueba)', date: addD(TODAY, -k - 1), st: 'Nuevo', nombre: k ? 'Diego Rojas (equipo)' : 'Ana Salazar (equipo)', dni: '00000000', dom: '—', tel: '—', mail: k ? 'diego.rojas@nubeconecta.pe' : 'ana.salazar@nubeconecta.pe', cid: null, resp: '', test: true });
});

/* ================= Proveedores: cuentas (l.2696) ================= */
export const PACC: ProviderAccount[] = (
  [
    ['BanaHosting', 'Reseller 1 · BH-RES-01', 'Reseller', 'Tarjeta •••• 4021', 63, new Date(2027, 0, 15), null, 'Activa'],
    ['BanaHosting', 'Reseller 2 · BH-RES-02', 'Reseller', 'Tarjeta •••• 4021', 63, new Date(2026, 10, 2), null, 'Activa'],
    ['BanaHosting', 'Reseller 3 · BH-RES-03', 'Reseller', 'Tarjeta •••• 4021', 63, new Date(2026, 9, 21), null, 'Activa'],
    ['Contabo', 'Cuenta principal (5 VPS)', 'VPS', 'Tarjeta •••• 7710', 142.6, new Date(2026, 9, 12), null, 'Activa'],
    ['DigitalOcean', 'Equipo NubeConecta', 'VPS', 'Tarjeta •••• 7710', 118, new Date(2026, 10, 1), null, 'Activa'],
    ['AWS', 'Organización (3 cuentas)', 'Cloud', 'Tarjeta •••• 7710', 96.4, new Date(2026, 10, 1), null, 'Activa'],
    ['Azure', 'Suscripción CSP', 'Cloud', 'Factura mensual', 61.2, new Date(2026, 10, 1), null, 'Activa'],
    ['Google Cloud', 'Facturación GSC', 'Cloud', 'Tarjeta •••• 7710', 44.9, new Date(2026, 10, 1), null, 'Activa'],
    ['IBM Cloud', 'Cuenta pay-as-you-go', 'Cloud', 'Tarjeta •••• 7710', 38, new Date(2026, 10, 1), null, 'Activa'],
    ['Namecheap', 'Cuenta reseller de dominios', 'Registrador', 'Saldo prepago', 0, null, 248.1, 'Activa'],
    ['NameSilo', 'Cuenta de dominios', 'Registrador', 'Saldo prepago', 0, null, 96.4, 'Saldo bajo'],
    ['PoloDomains', 'Distribuidor .pe', 'Registrador', 'Saldo prepago', 0, null, 298.6, 'Activa'],
    ['Bunny.net', 'CDN (12 pull zones)', 'CDN', 'Saldo prepago', 38.7, null, 61.3, 'Activa'],
    ['Elastic Email', 'Cuenta maestra + 9 subcuentas', 'Mailing', 'Tarjeta •••• 4021', 54, new Date(2026, 9, 18), null, 'Activa'],
    ['Google Workspace', 'Reseller (86 licencias)', 'Correo', 'Factura mensual', 619.2, new Date(2026, 10, 1), null, 'Activa'],
    ['Microsoft 365', 'CSP (54 licencias)', 'Correo', 'Factura mensual', 324, new Date(2026, 10, 1), null, 'Activa'],
    ['cPanel', 'Licencias (4 servidores)', 'Licencias', 'Tarjeta •••• 4021', 107.96, new Date(2026, 9, 10), null, 'Activa'],
  ] as [string, string, string, string, number, Date | null, number | null, string][]
).map((r, k) => ({ id: 'PV' + k, p: r[0], acc: r[1], type: r[2], pay: r[3], cost: r[4], ren: r[5], bal: r[6], st: r[7] }));

/* ================= Cloud: proyectos por cliente (l.2709) ================= */
export const CPROJ: CloudProject[] = clients
  .filter((c) => c.status === 'Activo' && !c.person)
  .slice(5, 17)
  .map((c, k) => {
    const prov = ['AWS', 'Azure', 'Google Cloud', 'IBM Cloud', 'AWS', 'AWS', 'Azure', 'Google Cloud', 'AWS', 'IBM Cloud', 'Google Cloud', 'AWS'][k];
    const bud = [400, 250, 180, 300, 900, 120, 500, 220, 650, 150, 90, 1200][k];
    const cost = +(bud * [0.62, 0.91, 0.48, 1.07, 0.77, 0.33, 0.88, 0.71, 0.97, 0.55, 1.12, 0.41][k]).toFixed(2);
    // El prototipo evalúa las 4 claves del objeto (consume 4 ri) aunque use una.
    const accts: Record<string, string> = {};
    accts['AWS'] = 'aws-' + ri(1e11, 9e11);
    accts['Azure'] = 'sub-' + ri(1000, 9999) + '-' + ri(1000, 9999);
    accts['Google Cloud'] = slug(c.name) + '-prod';
    accts['IBM Cloud'] = 'ibm-' + ri(100000, 999999);
    const svc = ({ AWS: 'EC2, RDS, S3, CloudFront', Azure: 'App Service, SQL Database', 'Google Cloud': 'Compute Engine, Cloud SQL', 'IBM Cloud': 'Virtual Server, Object Storage' } as Record<string, string>)[prov];
    return { id: 'CP' + k, cid: c.id, prov, acct: accts[prov], svc, cost, fc: +((cost / 0.26) * 0.3).toFixed(2), bud };
  });

/* ================= Correo: licencias y certificados (l.2721) ================= */
export const LICS: License[] = clients
  .filter((c) => c.services.some((s) => s.t === 'Google Workspace' || s.t === 'Microsoft 365'))
  .slice(0, 12)
  .map((c, k) => {
    const s = c.services.find((x) => x.t === 'Google Workspace' || x.t === 'Microsoft 365') as Service;
    const b = s.seats || ri(3, 20);
    const a = b + [0, 2, -1, 0, 3, 0, -2, 1, 0, 0, 4, -1][k];
    return { id: 'LC' + k, cid: c.id, prod: s.t + ' · ' + s.plan.split(' × ')[0], as: a, bi: b };
  });
LICS.unshift({ id: 'LCX', cid: 'CL-1001', prod: 'Google Workspace · Business Starter', as: 15, bi: 14 });
export const CERTS: Cert[] = domains
  .slice(0, 40)
  .filter((_, k) => k % 3 === 0)
  .slice(0, 12)
  .map((d, k) => ({ id: 'SS' + k, d: d.d, cid: d.cid, type: ["AutoSSL (Let's Encrypt)", 'Sectigo DV', 'Sectigo Wildcard', "AutoSSL (Let's Encrypt)"][k % 4], exp: addD(TODAY, [3, 9, 14, 21, 28, 45, 60, 75, 88, 120, 200, 300][k]), auto: k % 4 !== 1 && k % 4 !== 2 }));
CERTS.unshift({ id: 'SSX', d: 'andestravel.pe', cid: 'CL-1001', type: 'Sectigo Wildcard', exp: addD(TODAY, 12), auto: false });

/* ================= Cotizaciones (l.2736) ================= */
export const QUOTES: Quote[] = [];
(
  [
    ['CL-1001', 'Ampliación motor de reservas + CDN', 'Aceptada', [['Único', 'Módulo de pagos en línea para reservas', 1, 2800, ''], ['Único', 'Configuración de CDN y caché', 1, 450, ''], ['Recurrente', 'Soporte del sistema (bolsa 6 h)', 1, 540, 'Mensual'], ['Recurrente', 'VPS Pro adicional (staging)', 1, 180, 'Mensual']]],
    [null, 'Tienda virtual Textil Sumaq', 'Enviada', [['Único', 'Tienda WooCommerce básica', 1, 3200, ''], ['Único', 'Carga de 50 productos', 1, 350, ''], ['Recurrente', 'Hosting Pyme', 1, 349, 'Anual'], ['Recurrente', 'Dominio .pe', 1, 129, 'Anual']]],
    [clients[1].id, 'Migración a VPS y correo Microsoft 365', 'Borrador', [['Único', 'Migración de 3 sitios', 3, 180, ''], ['Recurrente', 'VPS Start', 1, 75, 'Mensual'], ['Recurrente', 'Microsoft 365 Business Basic', 8, 23, 'Mensual']]],
    [null, 'Campus Moodle Academia Illari', 'Enviada', [['Único', 'Implementación Moodle', 1, 2500, ''], ['Recurrente', 'Moodle hosting 500 usuarios', 1, 420, 'Mensual']]],
    [clients[3].id, 'Renovación anual con descuento', 'Rechazada', [['Recurrente', 'Hosting Corporativo', 1, 699, 'Anual'], ['Recurrente', 'SSL Wildcard DV', 1, 290, 'Anual']]],
    [clients[7].id, 'Web corporativa + correo', 'Vencida', [['Único', 'Web corporativa 5 secciones', 1, 1800, ''], ['Recurrente', 'Google Workspace Business Starter', 5, 27, 'Mensual']]],
  ] as [string | null, string, string, [string, string, number, number, string][]][]
).forEach((q, k) => {
  const lines: QuoteLine[] = q[3].map((l) => ({ type: l[0], d: l[1], q: l[2], pu: l[3], cy: l[4] || 'Mensual' }));
  const vs: QuoteVersion[] = [
    { v: 1, date: addD(TODAY, -12 + k), by: EJEC[k % 3], lines: lines.map((l) => ({ ...l, pu: Math.round(l.pu * 1.08) })) },
    { v: 2, date: addD(TODAY, -6 + k), by: EJEC[k % 3], lines },
  ];
  QUOTES.push({
    id: 'COT-2026-' + String(81 + k).padStart(4, '0'), cid: q[0], to: q[0] ? CBY[q[0]].name : q[1].split(' ').slice(-2).join(' ') + ' (prospecto)', title: q[1], exec: EJEC[k % 3], st: q[2],
    valid: addD(TODAY, [15, 9, 20, 4, -3, -10][k]), vers: k % 2 ? vs.slice(1).map((x) => ({ ...x, v: 1 })) : vs,
  });
});

/* ================= Contratos (l.2767) ================= */
/** Cláusulas: clave -> [título, categoría, texto]. */
export const CLAUSES: Record<string, [string, string, string]> = {
  obj: ['Objeto', 'General', 'El PROVEEDOR prestará al CLIENTE los servicios detallados en el Anexo 1, conforme a las condiciones de este contrato.'],
  vig: ['Vigencia y renovación', 'General', 'El contrato tiene vigencia de doce (12) meses y se renueva automáticamente por periodos iguales salvo aviso con treinta (30) días de anticipación.'],
  pago: ['Precio y forma de pago', 'Económica', 'El CLIENTE pagará las tarifas del Anexo 1 por adelantado, mediante tarjeta, PayPal o transferencia bancaria.'],
  mora: ['Mora y suspensión', 'Económica', 'El incumplimiento de pago faculta al PROVEEDOR a suspender el servicio al día siguiente del vencimiento y a cobrar el recargo por mora mediante nota de débito.'],
  sla: ['Niveles de servicio', 'Técnica', 'El PROVEEDOR garantiza una disponibilidad mensual de 99.9 % y los tiempos de atención por prioridad del Anexo 2.'],
  conf: ['Confidencialidad', 'Legal', 'Las partes mantendrán reserva sobre la información a la que accedan con motivo del contrato.'],
  datos: ['Protección de datos personales', 'Legal', 'El PROVEEDOR tratará los datos personales del CLIENTE conforme a la Ley N.° 29733 y su reglamento.'],
  pi: ['Propiedad intelectual', 'Legal', 'El código desarrollado a medida será de propiedad del CLIENTE una vez cancelado el íntegro del precio.'],
  resol: ['Resolución', 'Legal', 'Cualquiera de las partes podrá resolver el contrato por incumplimiento grave no subsanado en quince (15) días.'],
  jur: ['Ley aplicable y jurisdicción', 'Legal', 'El contrato se rige por las leyes del Perú. Las controversias se someten a los jueces de Lima.'],
};
export const CTPL = [
  { id: 'PL-01', n: 'Contrato marco de servicios TI', cl: ['obj', 'vig', 'pago', 'mora', 'sla', 'conf', 'datos', 'resol', 'jur'] },
  { id: 'PL-02', n: 'Contrato de desarrollo a medida', cl: ['obj', 'pago', 'pi', 'conf', 'datos', 'resol', 'jur'] },
  { id: 'PL-03', n: 'Acuerdo de nivel de servicio', cl: ['obj', 'sla', 'vig'] },
  { id: 'PL-04', n: 'Contrato de hosting y dominios', cl: ['obj', 'vig', 'pago', 'mora', 'datos', 'jur'] },
];
export const CONTRACTS: Contract[] = clients
  .filter((c) => c.status !== 'Inactivo')
  .slice(0, 9)
  .map((c, k) => {
    const date = addD(TODAY, -ri(5, 300));
    const end = addD(TODAY, ri(-20, 330));
    return { id: 'CT-2026-' + String(31 + k).padStart(3, '0'), cid: k === 0 ? 'CL-1001' : c.id, tpl: CTPL[k % 4].id, st: ['Firmado', 'Enviado para firma', 'Borrador', 'Firmado', 'Firmado', 'Vencido', 'Borrador', 'Firmado', 'Enviado para firma'][k], date, end, body: null };
  });
const ORD_N = ['PRIMERA', 'SEGUNDA', 'TERCERA', 'CUARTA', 'QUINTA', 'SEXTA', 'SÉPTIMA', 'OCTAVA', 'NOVENA', 'DÉCIMA', 'UNDÉCIMA'];
/** Texto del contrato a partir de una plantilla y cláusulas (ctBody del prototipo). */
export const ctBody = (tplId: string, sel?: string[]): string => {
  const t = CTPL.find((x) => x.id === tplId) || CTPL[0];
  return (
    `${t.n.toUpperCase()}\n\nConste por el presente documento el contrato que celebran, de una parte, el PROVEEDOR, y de la otra, el CLIENTE, en los términos siguientes:\n\n` +
    (sel || t.cl).map((k, i) => `CLÁUSULA ${ORD_N[i] || i + 1}. ${CLAUSES[k][0].toUpperCase()}\n${CLAUSES[k][2]}`).join('\n\n') +
    `\n\n(Texto de ejemplo; revisar con asesoría legal.)`
  );
};

/* ================= Pedidos (l.2788) ================= */
export const OSTEPS = ['Recibido', 'Pago confirmado', 'Aprovisionando', 'Configurado', 'Entregado'];
export const ORDERS: Order[] = clients
  .filter((c) => c.services.length)
  .slice(20, 34)
  .map((c, k) => ({
    id: 'PD-2026-' + String(412 + k), cid: c.id,
    prod: pick(['Hosting Pyme (anual)', 'VPS Start', 'Dominio .pe', 'Google Workspace × 5', 'SSL Wildcard DV', 'Correo cPanel 10 buzones', 'Landing page', 'Moodle hosting 100 usuarios']),
    orig: ['Web (WordPress)', 'Portal del cliente', 'Panel', 'Cotización COT-2026-0081'][k % 4], pay: k % 5 === 3 ? 'Pendiente' : 'Pagado',
    step: [4, 4, 2, 1, 3, 0, 2, 4, 1, 3, 2, 4, 0, 1][k], err: k === 6 ? 'WHM: cuota de cuentas llena en BH-RES-01' : k === 10 ? 'Registrador: saldo insuficiente en NameSilo' : null,
    at: new Date(2026, 9, 8 - Math.floor(k / 3), 9 + (k % 8), (k * 13) % 60),
  }));

/* ================= Bóveda (l.2800) ================= */
export const VAULT: VaultItem[] = [];
clients.slice(0, 8).forEach((c, k) => {
  const sl = slug(c.name).slice(0, 8) || 'cliente';
  (
    [
      ['cPanel', sl, `cpanel.${NODES[k % 6].id.toLowerCase()}.nubeconecta.net`],
      ['WordPress (admin)', 'admin_' + sl, `${(c.domains[0] || { d: sl + '.pe' }).d}/wp-admin`],
      [k % 2 ? 'SSH' : 'FTP', sl + '_ftp', NODES[k % 6].ip],
    ] as [string, string, string][]
  ).forEach((x, j) => VAULT.push({ id: 'BV' + k + j, cid: c.id, type: x[0], user: x[1], host: x[2], upd: addD(TODAY, -ri(3, 200)), shown: false }));
});
export const AUDIT: VaultAudit[] = [
  { at: new Date(2026, 9, 7, 16, 40), who: 'Diego Rojas', what: 'cPanel · andestra', why: 'Ticket TK-26410' },
  { at: new Date(2026, 9, 6, 11, 5), who: 'Ana Salazar', what: 'WordPress (admin) · admin_andestra', why: 'Migración' },
];

/* ================= Tareas (l.2815) ================= */
export const TCOLS = ['Por hacer', 'En curso', 'En revisión', 'Hecho'];
export const TASKS: Task[] = [];
(
  [
    ['Configurar DNS para reservas.andestravel.pe', 'CL-1001', 'TK-26410', 'Ana Salazar', 1, 'En curso', 'alta'],
    ['Migrar 6 cuentas del lote 7 a VPS-AP-03', null, 'Migración', 'Diego Rojas', 2, 'En curso', 'media'],
    ['Renovar SSL wildcard andestravel.pe', 'CL-1001', 'Correo y SSL', 'Ana Salazar', 3, 'Por hacer', 'alta'],
    ['Enviar propuesta revisada a Textil Sumaq', null, 'COT-2026-0082', 'Lucía Paredes', 0, 'Por hacer', 'media'],
    ['Revisar backups fallidos de BH-RES-01', null, 'Monitoreo', 'Diego Rojas', 0, 'Por hacer', 'critica'],
    ['Diseño de landing Cyber Days', null, 'Marketing', 'Valeria Ccori', 4, 'En revisión', 'baja'],
    ['Cargar catálogo inicial de la tienda', clients[9].id, 'PD-2026-0418', 'Jorge Quispe', 6, 'Por hacer', 'media'],
    ['Actualizar plugin del sistema en hostandino.pe', null, 'WordPress', 'Carla Huamán', 1, 'Por hacer', 'media'],
    ['Conciliar licencias Google Workspace', null, 'Correo y SSL', 'Rosa Mendoza', 2, 'En revisión', 'media'],
    ['Entregar accesos de Moodle a Academia Illari', null, 'PD-2026-0421', 'Ana Salazar', -1, 'Hecho', 'baja'],
  ] as [string, string | null, string, string, number, string, Sev][]
).forEach((x, k) => TASKS.push({ id: 'TA-' + (101 + k), t: x[0], cid: x[1], orig: x[2], who: x[3], due: addD(TODAY, x[4]), col: x[5], prio: x[6] }));

/* ================= Utilidades de filtrado por marca ================= */
export const inBrand = (brand: BrandFilter, cid: string): boolean => brand === 'all' || CBY[cid]?.brand === brand;
export const fClients = (brand: BrandFilter): Client[] => clients.filter((c) => brand === 'all' || c.brand === brand);
export const fInv = (brand: BrandFilter): Invoice[] => invoices.filter((v) => inBrand(brand, v.cid));
export const fDom = (brand: BrandFilter): Domain[] => domains.filter((d) => inBrand(brand, d.cid));
export const fSvc = (brand: BrandFilter): Service[] => services.filter((s) => inBrand(brand, s.cid));
export const fTk = (brand: BrandFilter): Ticket[] => tickets.filter((t) => inBrand(brand, t.cid));
export const fLeads = (brand: BrandFilter): Lead[] => leads.filter((l) => brand === 'all' || l.brand === brand);
export const fRecl = (brand: BrandFilter): Reclamo[] => RECL.filter((r) => brand === 'all' || r.brand === brand);
/** Busca cliente por nombre exacto (normalizado). */
export const findClient = (n: string): Client | undefined => clients.find((c) => norm(c.name) === norm(n));

/* ================= Libro de Reclamaciones: plazos ================= */
/** Configuración del plazo de respuesta (mutable desde la vista Reclamos). */
export const reclCfg: { plazo: number; unit: 'hábiles' | 'calendario' } = { plazo: 15, unit: 'hábiles' };
export const reclDue = (r: Reclamo): Date => (reclCfg.unit === 'hábiles' ? addBiz(r.date, reclCfg.plazo) : addD(r.date, reclCfg.plazo));
export const reclLeft = (r: Reclamo): number => (reclCfg.unit === 'hábiles' ? bizBetween(TODAY, reclDue(r)) : diffD(reclDue(r), TODAY));
/** Hojas pendientes con 3 días o menos de plazo. */
export const reclHot = (brand: BrandFilter): Reclamo[] => fRecl(brand).filter((r) => r.st !== 'Respondido' && reclLeft(r) <= 3);

/* ================= Altas en memoria ================= */
/** Crea un cliente nuevo (al inicio de la lista) y lo indexa. */
export function addClient(c: Omit<Client, 'id' | 'services' | 'domains' | 'invoices' | 'tickets' | 'mrr'>): Client {
  const id = 'CL-' + (1001 + clients.length);
  const full: Client = { ...c, id, services: [], domains: [], invoices: [], tickets: [], mrr: 0 };
  clients.unshift(full);
  CBY[id] = full;
  return full;
}
/** Crea un ticket nuevo (al inicio) y lo indexa. */
export function addTicket(t: Omit<Ticket, 'id' | 'created' | 'status' | 'agent'> & Partial<Pick<Ticket, 'status' | 'agent'>>): Ticket {
  const full: Ticket = { id: 'TK-' + (26410 + tickets.length), created: new Date(NOW), status: t.status || 'Nuevo', agent: t.agent ?? null, ...t };
  tickets.unshift(full);
  TBY[full.id] = full;
  CBY[full.cid]?.tickets.unshift(full);
  return full;
}
