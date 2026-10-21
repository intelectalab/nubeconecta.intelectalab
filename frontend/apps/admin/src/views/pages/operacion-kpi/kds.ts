/**
 * Listado de registros por indicador (prototipo l.3510-3700: KDS, kdRows,
 * kQuant, kdMeasure…). Cada indicador genera de forma determinista las filas
 * que lo explican y se calibran para que el total del listado concilie con el
 * valor de la tarjeta.
 */
import {
  APE, BR, BRANDS, BRAND_SHARE, CHANNELS, DIMS, EJEC, AGENTS, MESL, MID, MSTATES, NF0, NF2, NODES, PERS, PRE, STAGES, SUF, TODAY,
  addD, clients, conv, fClients, fD, kAgg, kEnd, kHash, kLen, kMonth, kVal, norm, slug,
} from '../../../data';
import type { Client, CurView, KpiDef, KpiFilter } from '../../../data';

/* eslint-disable @typescript-eslint/no-explicit-any */
export type KdRow = Record<string, any>;
export type KdColType = 'id' | 'mono' | 'txt' | 'client' | 'brand' | 'money' | 'int' | 'n1' | 'pct' | 'date' | 'chip';
export interface KdCol {
  k: string;
  l: string;
  t: KdColType;
  /** dimensión principal (gráfico «Por …» y filtro) */
  dim?: 1;
  /** dimensión secundaria (filtro) */
  x2?: 1;
  /** columna de estado (filtro y gráfico) */
  st?: 1;
  map?: Record<string, string>;
}
export type KdMeasure =
  | { t: 'count' }
  | { t: 'sum'; f: string; also?: string[] }
  | { t: 'avg'; f: string }
  | { t: 'avgc'; f: string; top: number }
  | { t: 'share'; f: string; y: string; n?: string }
  | { t: 'margin'; p: string; c: string }
  | { t: 'ratio'; n: string; d: string; D: number };

interface Gen {
  i: number;
  r: () => number;
  pick: <T>(a: readonly T[]) => T;
  ri: (a: number, b: number) => number;
  c: () => Client;
  uc: () => Client;
  br: () => string;
  d: () => Date;
  past: (a: number, b: number) => Date;
  mes: (i?: number) => string;
  code: (p: string, b: number) => string;
  inv: (c?: Client) => string;
  hoja: (b: string) => string;
  emp: () => string;
  persona: () => string;
  sld: () => string;
  dom: (c: Client) => string;
  ex: (c?: Client) => string;
  ag: () => string;
  svc: () => string;
  dv: () => string;
}
export interface KdSpec {
  /** etiqueta de los registros (plural) */
  e: string;
  nb?: number;
  per?: 1;
  nob?: 0 | 1;
  min?: number;
  cnt?: 1;
  fixed?: (F: KpiFilter) => number;
  /** ruta del módulo relacionado */
  mod: string;
  m: KdMeasure;
  cols: KdCol[];
  g: (x: Gen) => KdRow;
  post?: (o: KdRow, x: Gen) => void;
  flagY?: (o: KdRow, x: Gen) => void;
  note?: string;
  nobrand?: 1;
}

export const SVC_CAT: Record<string, string> = { hosting: 'Hosting cPanel', vps: 'VPS administrado', correo: 'Correo corporativo', dominios: 'Dominios', ssl: 'SSL', web: 'Desarrollo y web', otros: 'Otros servicios' };
const SVC_PRICE: Record<string, number> = { 'Hosting cPanel': 38, 'VPS administrado': 185, 'Correo corporativo': 29, Dominios: 11, SSL: 9, 'Desarrollo y web': 140, 'Otros servicios': 45 };
const PRODS = ['Hosting Pyme', 'Hosting Emprendedor', 'Hosting Negocio', 'VPS Cloud 4', 'VPS Cloud 8', 'Correo corporativo 10', 'Certificado SSL DV', 'Dominio .pe', 'Dominio .com', 'Tienda virtual Básica'];
const ASUNTOS = ['No envía correos', 'Sitio lento', 'Renovar certificado SSL', 'Cambio de DNS', 'Restaurar copia de seguridad', 'Error 500 en WordPress', 'Crear buzón nuevo', 'Acceso a cPanel', 'Ampliar espacio', 'Consulta de factura'];
const MOTIVOS = ['Precio', 'Cierre del negocio', 'Migró a otro proveedor', 'Falta de pago', 'Ya no requiere el servicio'];
const PAGES = ['/', '/hosting', '/vps', '/servidores-dedicados', '/dominios', '/correo-corporativo', '/certificados-ssl', '/tiendas-virtuales', '/blog'];
const NODES_DST = NODES.filter((n) => n.prov !== 'BanaHosting').map((n) => n.id);
const NODES_SRC = NODES.filter((n) => n.prov === 'BanaHosting').map((n) => n.id);
const FINUS = ['Patricia Soto', 'Raúl Vega'];
const YN: Record<string, string> = { Sí: 'ok', No: 'danger' };

const C = (k: string, l: string, t: KdColType = 'txt', o?: Partial<KdCol>): KdCol => ({ k, l, t, ...(o || {}) });
export const cCli = C('c', 'Cliente', 'client');
export const cBr = C('brand', 'Marca', 'brand');

/** Filtro activo durante la generación (las funciones `fixed`/`g` del prototipo leen S.*). */
let CURF: KpiFilter | null = null;
const kRespIn = (l: string[]): string | null => (CURF && CURF.kResp && l.includes(CURF.kResp) ? CURF.kResp : null);

export const KDS: Record<string, KdSpec> = {
  mrr: { e: 'servicios activos', nb: 900, mod: 'clientes', m: { t: 'sum', f: 'mrr' }, cols: [C('id', 'Código', 'id'), cCli, cBr, C('svc', 'Servicio', 'txt', { dim: 1 }), C('ciclo', 'Ciclo', 'txt', { x2: 1 }), C('desde', 'Activo desde', 'date'), C('mrr', 'MRR', 'money')],
    g: (x) => { const c = x.c(), s = x.svc(); return { id: x.code('SV-', 20000), c, brand: c.brand, svc: s, ciclo: x.pick(['Mensual', 'Anual', 'Anual', 'Trimestral']), desde: x.past(30, 1800), mrr: (SVC_PRICE[s] || 40) * (0.6 + x.r() * 0.9) }; } },
  arr: { e: 'servicios activos', nb: 900, mod: 'clientes', m: { t: 'sum', f: 'arr', also: ['mrr'] }, cols: [C('id', 'Código', 'id'), cCli, cBr, C('svc', 'Servicio', 'txt', { dim: 1 }), C('ciclo', 'Ciclo', 'txt', { x2: 1 }), C('mrr', 'MRR', 'money'), C('arr', 'ARR (MRR × 12)', 'money')],
    g: (x) => { const c = x.c(), s = x.svc(), m = (SVC_PRICE[s] || 40) * (0.6 + x.r() * 0.9); return { id: x.code('SV-', 20000), c, brand: c.brand, svc: s, ciclo: x.pick(['Mensual', 'Anual', 'Anual', 'Trimestral']), mrr: m, arr: m * 12 }; } },
  activos: { e: 'clientes activos', cnt: 1, mod: 'clientes', m: { t: 'count' }, cols: [cCli, C('cid', 'Código', 'mono'), C('brand', 'Marca', 'brand', { dim: 1 }), C('pais', 'País', 'txt', { x2: 1 }), C('ns', 'Servicios activos', 'int'), C('mrr', 'MRR', 'money'), C('desde', 'Cliente desde', 'date'), C('ex', 'Ejecutivo')],
    g: (x) => { const c = x.uc(); return { c, cid: c.id, brand: c.brand, pais: c.country, ns: x.ri(1, 7), mrr: 40 + x.r() * 420, desde: c.since, ex: x.ex(c) }; } },
  nuevos: { e: 'clientes nuevos', cnt: 1, mod: 'clientes', m: { t: 'count' }, cols: [cCli, cBr, C('canal', 'Canal', 'txt', { dim: 1 }), C('svc', 'Primer servicio', 'txt', { x2: 1 }), C('f', 'Fecha de alta', 'date'), C('mrr', 'MRR inicial', 'money'), C('ex', 'Ejecutivo')],
    g: (x) => { const c = x.c(); return { c, brand: c.brand, canal: x.dv(), svc: x.svc(), f: x.d(), mrr: 30 + x.r() * 260, ex: x.ex(c) }; } },
  perdidos: { e: 'clientes perdidos', cnt: 1, mod: 'clientes', m: { t: 'count' }, cols: [cCli, cBr, C('svc', 'Último servicio', 'txt', { dim: 1 }), C('f', 'Fecha de baja', 'date'), C('mot', 'Motivo', 'txt', { x2: 1 }), C('mrr', 'MRR perdido', 'money')],
    g: (x) => { const c = x.c(); return { c, brand: c.brand, svc: x.svc(), f: x.d(), mot: x.pick(MOTIVOS), mrr: 25 + x.r() * 220 }; } },
  churn: { e: 'clientes por mes', nb: 372, per: 1, mod: 'clientes', m: { t: 'share', f: 'perd', y: 'Sí', n: 'No' }, cols: [C('mes', 'Mes', 'txt', { x2: 1 }), cCli, C('brand', 'Marca', 'brand', { dim: 1 }), C('perd', 'Perdido en el mes', 'chip', { map: { Sí: 'danger', No: 'ok' }, st: 1 })],
    g: (x) => { const c = x.c(); return { mes: x.mes(), c, brand: c.brand, perd: 'No' }; }, note: 'Una fila por cliente activo al inicio de cada mes; el churn es la proporción marcada como perdida.' },
  arpu: { e: 'clientes activos', nb: 372, mod: 'clientes', m: { t: 'avg', f: 'mrr' }, cols: [cCli, C('brand', 'Marca', 'brand', { dim: 1 }), C('ns', 'Servicios', 'int', { x2: 1 }), C('mrr', 'MRR del cliente', 'money')],
    g: (x) => { const c = x.c(); return { c, brand: c.brand, ns: x.ri(1, 6), mrr: 40 + x.r() * 300 }; } },
  ltv: { e: 'clientes activos', nb: 372, mod: 'clientes', m: { t: 'avg', f: 'ltv' }, cols: [cCli, cBr, C('svc', 'Servicio principal', 'txt', { dim: 1 }), C('arpu', 'ARPU', 'money'), C('mg', 'Margen bruto', 'pct'), C('ant', 'Antigüedad (meses)', 'int'), C('ltv', 'LTV estimado', 'money')],
    g: (x) => { const c = x.c(), a = 60 + x.r() * 280; return { c, brand: c.brand, svc: x.svc(), arpu: a, mg: 48 + x.r() * 25, ant: x.ri(3, 96), ltv: a * (40 + x.r() * 60) }; } },
  enlinea: { e: 'ventas cerradas', nb: 130, per: 1, mod: 'pedidos', m: { t: 'share', f: 'orig', y: 'En línea', n: 'Cotización' }, cols: [C('id', 'Venta', 'id'), C('f', 'Fecha', 'date'), cCli, C('brand', 'Marca', 'brand', { dim: 1 }), C('prod', 'Producto', 'txt', { x2: 1 }), C('orig', 'Origen', 'chip', { map: { 'En línea': 'info', Cotización: 'neutral' }, st: 1 }), C('m', 'Monto', 'money')],
    g: (x) => { const c = x.c(); return { id: x.code('VT-', 8000), f: x.d(), c, brand: c.brand, prod: x.pick(PRODS), orig: 'Cotización', m: 60 + x.r() * 900 }; } },
  embudo: { e: 'prospectos abiertos', nb: 46, mod: 'crm', m: { t: 'sum', f: 'val' }, cols: [C('id', 'Prospecto', 'id'), C('emp', 'Empresa'), C('etapa', 'Etapa', 'txt', { dim: 1 }), C('canal', 'Canal', 'txt', { x2: 1 }), C('ex', 'Ejecutivo'), C('val', 'Valor mensual', 'money'), C('f', 'Último contacto', 'date')],
    g: (x) => ({ id: x.code('LD-', 3000), emp: x.emp(), brand: x.br(), etapa: x.dv(), canal: x.pick(CHANNELS), ex: x.ex(), val: 200 + x.r() * 3200, f: x.past(0, 20) }) },
  conv: { e: 'prospectos cerrados', nb: 50, per: 1, mod: 'crm', m: { t: 'share', f: 'res', y: 'Ganado', n: 'Perdido' }, cols: [C('id', 'Prospecto', 'id'), C('emp', 'Empresa'), C('canal', 'Canal', 'txt', { dim: 1 }), C('ex', 'Ejecutivo', 'txt', { x2: 1 }), C('f', 'Cierre', 'date'), C('res', 'Resultado', 'chip', { map: { Ganado: 'ok', Perdido: 'danger' }, st: 1 }), C('val', 'Valor mensual', 'money')],
    g: (x) => ({ id: x.code('LD-', 3000), emp: x.emp(), brand: x.br(), canal: x.dv(), ex: x.ex(), f: x.d(), res: 'Perdido', val: 150 + x.r() * 2000 }) },
  ciclo: { e: 'prospectos ganados', nb: 9, per: 1, mod: 'crm', m: { t: 'avg', f: 'dias' }, cols: [C('id', 'Prospecto', 'id'), C('emp', 'Empresa'), C('canal', 'Canal', 'txt', { dim: 1 }), C('ex', 'Ejecutivo', 'txt', { x2: 1 }), C('ini', 'Creado', 'date'), C('f', 'Ganado', 'date'), C('dias', 'Días del ciclo', 'n1')],
    g: (x) => ({ id: x.code('LD-', 3000), emp: x.emp(), brand: x.br(), canal: x.dv(), ex: x.ex(), f: x.d(), dias: 5 + x.r() * 30 }), post: (o) => { o.ini = addD(o.f, -Math.round(o.dias)); } },
  sinseg: { e: 'prospectos sin seguimiento', cnt: 1, mod: 'crm', m: { t: 'count' }, cols: [C('id', 'Prospecto', 'id'), C('emp', 'Empresa'), C('ex', 'Ejecutivo', 'txt', { dim: 1 }), C('etapa', 'Etapa', 'txt', { x2: 1 }), C('f', 'Último contacto', 'date'), C('dias', 'Días sin contacto', 'int')],
    g: (x) => { const d = x.ri(8, 40); return { id: x.code('LD-', 3000), emp: x.emp(), brand: x.br(), ex: x.ex(), etapa: x.pick(STAGES.slice(0, 4)), f: addD(TODAY, -d), dias: d }; } },
  ganados: { e: 'prospectos ganados', cnt: 1, mod: 'crm', m: { t: 'count' }, cols: [C('id', 'Prospecto', 'id'), C('emp', 'Empresa'), C('canal', 'Canal', 'txt', { dim: 1 }), C('ex', 'Ejecutivo', 'txt', { x2: 1 }), C('f', 'Fecha', 'date'), C('val', 'Valor mensual', 'money')],
    g: (x) => ({ id: x.code('LD-', 3000), emp: x.emp(), brand: x.br(), canal: x.dv(), ex: x.ex(), f: x.d(), val: 150 + x.r() * 2200 }) },
  facturado: { e: 'comprobantes emitidos', nb: 520, per: 1, mod: 'facturas', m: { t: 'sum', f: 'tot' }, cols: [C('id', 'Comprobante', 'id'), C('f', 'Emisión', 'date'), cCli, C('svc', 'Servicio', 'txt', { dim: 1 }), C('mon', 'Moneda original'), C('st', 'Estado', 'chip', { map: { Pagada: 'ok', Pendiente: 'warn', Vencida: 'danger' }, st: 1 }), C('tot', 'Total', 'money')],
    g: (x) => { const c = x.c(), s = x.svc(); return { id: x.inv(c), f: x.d(), c, brand: c.brand, svc: s, mon: c.cur, st: x.pick(['Pagada', 'Pagada', 'Pagada', 'Pagada', 'Pendiente', 'Vencida']), tot: (SVC_PRICE[s] || 40) * (0.5 + x.r() * 3) }; } },
  cobrado: { e: 'pagos recibidos', nb: 500, per: 1, mod: 'cobranza', m: { t: 'sum', f: 'm' }, cols: [C('id', 'Recibo', 'id'), C('f', 'Fecha', 'date'), cCli, C('medio', 'Medio de pago', 'txt', { dim: 1 }), C('cp', 'Comprobante', 'mono'), C('m', 'Monto', 'money')],
    g: (x) => { const c = x.c(); return { id: x.code('RC-', 41000), f: x.d(), c, brand: c.brand, medio: x.dv(), cp: x.inv(c), m: 30 + x.r() * 400 }; } },
  reconocido: { e: 'líneas de ingreso', nb: 520, per: 1, mod: 'facturas', m: { t: 'sum', f: 'm' }, cols: [C('cp', 'Comprobante', 'id'), cCli, C('svc', 'Servicio', 'txt', { dim: 1 }), C('mes', 'Periodo del servicio', 'txt', { x2: 1 }), C('m', 'Ingreso reconocido', 'money')],
    g: (x) => { const c = x.c(); return { cp: x.inv(c), c, brand: c.brand, svc: x.svc(), mes: x.mes(), m: 20 + x.r() * 300 }; } },
  dso: { e: 'comprobantes cobrados', nb: 480, per: 1, mod: 'facturas', m: { t: 'avg', f: 'dias' }, cols: [C('id', 'Comprobante', 'id'), cCli, C('brand', 'Marca', 'brand', { dim: 1 }), C('em', 'Emisión', 'date'), C('f', 'Pago', 'date'), C('dias', 'Días de cobro', 'n1')],
    g: (x) => { const c = x.c(); return { id: x.inv(c), c, brand: c.brand, f: x.d(), dias: 2 + x.r() * 45 }; }, post: (o) => { o.em = addD(o.f, -Math.round(o.dias)); } },
  margen: { e: 'servicios activos', nb: 900, mod: 'catalogo', m: { t: 'margin', p: 'p', c: 'cost' }, cols: [C('svc', 'Servicio', 'txt', { dim: 1 }), cCli, C('prov', 'Proveedor', 'txt', { x2: 1 }), C('p', 'Precio mensual', 'money'), C('cost', 'Costo mensual', 'money'), C('mg', 'Margen', 'pct')],
    g: (x) => { const c = x.c(), s = x.svc(), p = (SVC_PRICE[s] || 40) * (0.6 + x.r() * 0.9); return { svc: s, c, brand: c.brand, prov: x.pick(DIMS.proveedor), p, cost: p * (0.2 + x.r() * 0.4) }; }, post: (o) => { o.mg = o.p ? ((o.p - o.cost) / o.p) * 100 : 0; } },
  costos: { e: 'documentos de proveedores', nb: 40, per: 1, nob: 0, mod: 'proveedores', m: { t: 'sum', f: 'm' }, cols: [C('id', 'Documento', 'id'), C('prov', 'Proveedor', 'txt', { dim: 1 }), C('con', 'Concepto', 'txt', { x2: 1 }), C('f', 'Fecha', 'date'), C('m', 'Monto', 'money')],
    g: (x) => ({ id: x.code('PR-', 5100), brand: x.br(), prov: x.dv(), con: x.pick(['Renovación de servidor', 'Consumo del mes', 'Licencias', 'Registro de dominios', 'Transferencia de datos']), f: x.d(), m: 20 + x.r() * 400 }) },
  refact: { e: 'cargos refacturados', nb: 25, per: 1, mod: 'facturas', m: { t: 'sum', f: 'm', also: ['cost'] }, cols: [cCli, C('prov', 'Proveedor', 'txt', { dim: 1 }), C('con', 'Concepto', 'txt', { x2: 1 }), C('f', 'Fecha', 'date'), C('cost', 'Costo del proveedor', 'money'), C('pct', 'Recargo', 'pct'), C('m', 'Monto refacturado', 'money')],
    g: (x) => { const c = x.c(), pc = x.pick([10, 12, 15, 18, 20]), co = 40 + x.r() * 300; return { c, brand: c.brand, prov: x.dv(), con: x.pick(['Consumo AWS', 'Consumo Azure', 'Licencias Microsoft 365', 'Google Workspace', 'Transferencia adicional']), f: x.d(), cost: co, pct: pc, m: co * (1 + pc / 100) }; } },
  comis: { e: 'pagos con comisión', nb: 220, per: 1, mod: 'cobranza', m: { t: 'sum', f: 'com' }, cols: [C('id', 'Recibo', 'id'), C('f', 'Fecha', 'date'), cCli, C('medio', 'Medio de pago', 'txt', { dim: 1 }), C('m', 'Monto cobrado', 'money'), C('com', 'Comisión', 'money')],
    g: (x) => { const c = x.c(), m = 40 + x.r() * 400; return { id: x.code('RC-', 41000), f: x.d(), c, brand: c.brand, medio: x.dv(), m, com: m * (0.02 + x.r() * 0.03) }; } },
  recargos: { e: 'notas de débito por mora', nb: 18, per: 1, mod: 'facturas', m: { t: 'sum', f: 'm' }, cols: [C('id', 'Nota de débito', 'id'), C('f', 'Fecha', 'date'), cCli, C('brand', 'Marca', 'brand', { dim: 1 }), C('cp', 'Comprobante de origen', 'mono'), C('dias', 'Días de mora', 'int'), C('m', 'Recargo', 'money')],
    g: (x) => { const c = x.c(); return { id: x.code('ND01-', 600), f: x.d(), c, brand: c.brand, cp: x.inv(c), dias: x.ri(11, 90), m: 5 + x.r() * 45 }; } },
  porvencer: { e: 'comprobantes por vencer', nb: 260, mod: 'cobranza', m: { t: 'sum', f: 'm' }, cols: [C('id', 'Comprobante', 'id'), cCli, C('brand', 'Marca', 'brand', { dim: 1 }), C('v', 'Vence', 'date'), C('dias', 'Días restantes', 'int'), C('ex', 'Ejecutivo', 'txt', { x2: 1 }), C('m', 'Saldo', 'money')],
    g: (x) => { const c = x.c(), d = x.ri(1, 30); return { id: x.inv(c), c, brand: c.brand, v: addD(TODAY, d), dias: d, ex: x.ex(c), m: 40 + x.r() * 300 }; } },
  vencido: { e: 'comprobantes vencidos', nb: 120, mod: 'cobranza', m: { t: 'sum', f: 'm' }, cols: [C('id', 'Comprobante', 'id'), cCli, C('tramo', 'Tramo', 'txt', { dim: 1 }), C('v', 'Venció', 'date'), C('dias', 'Días vencido', 'int'), C('ex', 'Ejecutivo', 'txt', { x2: 1 }), C('m', 'Saldo', 'money')],
    g: (x) => { const c = x.c(), t = x.dv(); const rg = ({ '1–30 d': [1, 30], '31–60 d': [31, 60], '61–90 d': [61, 90], '> 90 d': [91, 240] } as Record<string, [number, number]>)[t] || [1, 30]; const d = x.ri(rg[0], rg[1]); return { id: x.inv(c), c, brand: c.brand, tramo: t, v: addD(TODAY, -d), dias: d, ex: x.ex(c), m: 40 + x.r() * 300 }; } },
  compcump: { e: 'compromisos de pago', nb: 30, per: 1, mod: 'cobranza', m: { t: 'share', f: 'res', y: 'Cumplido', n: 'Incumplido' }, cols: [C('id', 'Compromiso', 'id'), cCli, C('ex', 'Ejecutivo', 'txt', { dim: 1 }), C('f', 'Fecha comprometida', 'date'), C('m', 'Monto', 'money'), C('res', 'Resultado', 'chip', { map: { Cumplido: 'ok', Incumplido: 'danger' }, st: 1 })],
    g: (x) => { const c = x.c(); return { id: x.code('CP-', 900), c, brand: c.brand, ex: x.ex(c), f: x.d(), m: 60 + x.r() * 500, res: 'Incumplido' }; } },
  compinc: { e: 'compromisos incumplidos', cnt: 1, mod: 'cobranza', m: { t: 'count' }, cols: [C('id', 'Compromiso', 'id'), cCli, C('ex', 'Ejecutivo', 'txt', { dim: 1 }), C('f', 'Fecha comprometida', 'date'), C('atr', 'Días de atraso', 'int'), C('st', 'Acción', 'chip', { map: { Suspendido: 'danger', 'En gestión': 'warn', 'Nuevo compromiso': 'info' }, st: 1 }), C('m', 'Monto', 'money')],
    g: (x) => { const c = x.c(); return { id: x.code('CP-', 900), c, brand: c.brand, ex: x.ex(c), f: x.d(), atr: x.ri(1, 20), st: x.pick(['Suspendido', 'En gestión', 'Nuevo compromiso']), m: 60 + x.r() * 500 }; } },
  susp: { e: 'suspensiones', cnt: 1, mod: 'cobranza', m: { t: 'count' }, cols: [cCli, C('brand', 'Marca', 'brand', { dim: 1 }), C('svc', 'Servicio', 'txt', { x2: 1 }), C('f', 'Suspendido el', 'date'), C('deu', 'Deuda', 'money'), C('st', 'Estado actual', 'chip', { map: { Suspendido: 'danger', Reactivado: 'ok', Terminado: 'neutral' }, st: 1 })],
    g: (x) => { const c = x.c(); return { c, brand: c.brand, svc: x.svc(), f: x.d(), deu: 40 + x.r() * 400, st: x.pick(['Suspendido', 'Reactivado', 'Reactivado', 'Terminado']) }; } },
  react: { e: 'reactivaciones', cnt: 1, mod: 'cobranza', m: { t: 'count' }, cols: [cCli, C('brand', 'Marca', 'brand', { dim: 1 }), C('svc', 'Servicio', 'txt', { x2: 1 }), C('fs', 'Suspendido el', 'date'), C('f', 'Reactivado el', 'date'), C('m', 'Pago recibido', 'money')],
    g: (x) => { const c = x.c(), f = x.d(); return { c, brand: c.brand, svc: x.svc(), f, fs: addD(f, -x.ri(1, 15)), m: 40 + x.r() * 400 }; } },
  vouch: { e: 'vouchers validados', cnt: 1, mod: 'cobranza', m: { t: 'count' }, cols: [C('id', 'Voucher', 'id'), C('f', 'Recibido', 'date'), cCli, C('banco', 'Banco', 'txt', { dim: 1 }), C('fin', 'Validado por', 'txt', { x2: 1 }), C('h', 'Horas para validar', 'n1'), C('m', 'Monto', 'money')],
    g: (x) => { const c = x.c(); return { id: x.code('VC-', 7000), f: x.d(), c, brand: c.brand, banco: x.dv(), fin: x.pick(FINUS), h: 0.5 + x.r() * 12, m: 40 + x.r() * 500 }; } },
  vouchT: { e: 'vouchers validados', nb: 64, per: 1, mod: 'cobranza', m: { t: 'avg', f: 'h' }, cols: [C('id', 'Voucher', 'id'), C('f', 'Recibido', 'date'), cCli, C('banco', 'Banco', 'txt', { dim: 1 }), C('fin', 'Validado por', 'txt', { x2: 1 }), C('h', 'Horas para validar', 'n1')],
    g: (x) => { const c = x.c(); return { id: x.code('VC-', 7000), f: x.d(), c, brand: c.brand, banco: x.dv(), fin: x.pick(FINUS), h: 0.5 + x.r() * 12 }; } },
  renov: { e: 'servicios con vencimiento', nb: 140, per: 1, mod: 'dominios', m: { t: 'share', f: 'res', y: 'Renovado', n: 'No renovado' }, cols: [C('svc', 'Servicio', 'txt', { dim: 1 }), cCli, cBr, C('f', 'Vencimiento', 'date'), C('m', 'Precio', 'money'), C('res', 'Resultado', 'chip', { map: { Renovado: 'ok', 'No renovado': 'danger' }, st: 1 })],
    g: (x) => { const c = x.c(), s = x.svc(); return { svc: s, c, brand: c.brand, f: x.d(), m: (SVC_PRICE[s] || 40) * 12 * (0.6 + x.r() * 0.6), res: 'No renovado' }; } },
  domv: { e: 'dominios por vencer', cnt: 1, mod: 'dominios', m: { t: 'count' }, cols: [C('dom', 'Dominio', 'mono'), cCli, C('reg', 'Registrador', 'txt', { dim: 1 }), C('v', 'Vence', 'date'), C('dias', 'Días', 'int'), C('auto', 'Renovación automática', 'chip', { map: YN, st: 1 }), C('m', 'Precio de renovación', 'money')],
    g: (x) => { const c = x.c(), d = x.ri(1, 30); return { dom: x.dom(c), c, brand: c.brand, reg: x.dv(), v: addD(TODAY, d), dias: d, auto: x.r() < 0.55 ? 'Sí' : 'No', m: 45 + x.r() * 120 }; } },
  nodos: { e: 'nodos de hosting', fixed: () => NODES.length, mod: 'infra', m: { t: 'avg', f: 'uso' }, cols: [C('nodo', 'Nodo', 'mono', { dim: 1 }), C('prov', 'Proveedor', 'txt', { x2: 1 }), C('tipo', 'Tipo'), C('loc', 'Ubicación'), C('acc', 'Cuentas', 'int'), C('uso', 'Uso de disco', 'pct')],
    g: (x) => { const n = NODES[x.i]; return { nodo: n.id, prov: n.prov, tipo: n.kind, loc: n.loc, acc: n.acc ? n.acc[0] : x.ri(5, 40), uso: n.disk ? (n.disk[0] / n.disk[1]) * 100 : 40 + x.r() * 40 }; }, nobrand: 1 },
  migra: { e: 'cuentas por migrar', nb: 260, nob: 1, mod: 'infra', m: { t: 'share', f: 'est', y: 'Completada' }, cols: [C('dom', 'Cuenta', 'mono'), cCli, C('src', 'Nodo de origen', 'mono', { x2: 1 }), C('dst', 'Nodo de destino', 'mono'), C('est', 'Estado', 'chip', { map: Object.fromEntries(MSTATES.map((m) => [m[0], m[2]])), dim: 1 }), C('f', 'Actualizado', 'date')],
    g: (x) => { const c = x.c(); return { dom: x.dom(c), c, brand: c.brand, src: x.pick(NODES_SRC.length ? NODES_SRC : ['BH-RES-01']), dst: x.pick(NODES_DST.length ? NODES_DST : ['VPS-01']), est: x.pick(MSTATES.slice(0, 5).map((m) => m[0])), f: x.past(0, 25) }; },
    flagY: (o) => { o.est = 'Completada'; }, note: 'Cuentas de BanaHosting que pasan a los VPS propios; el avance es la proporción en estado «Completada».' },
  bkok: { e: 'trabajos de respaldo', nb: 900, per: 1, nob: 1, mod: 'infra', m: { t: 'share', f: 'res', y: 'Correcto', n: 'Fallido' }, cols: [C('f', 'Fecha', 'date'), C('nodo', 'Nodo', 'mono', { dim: 1 }), C('tipo', 'Tipo', 'txt', { x2: 1 }), C('gb', 'Tamaño (GB)', 'n1'), C('min', 'Duración (min)', 'int'), C('res', 'Resultado', 'chip', { map: { Correcto: 'ok', Fallido: 'danger' }, st: 1 })],
    g: (x) => ({ f: x.d(), nodo: x.dv(), tipo: x.pick(['Incremental', 'Incremental', 'Incremental', 'Completo']), gb: 2 + x.r() * 80, min: x.ri(3, 95), res: 'Fallido' }), nobrand: 1 },
  uptime: { e: 'nodo por mes', fixed: (F) => NODES.length * kLen(F), mod: 'monitoreo', m: { t: 'avgc', f: 'disp', top: 100 }, cols: [C('mes', 'Mes', 'txt', { x2: 1 }), C('nodo', 'Nodo', 'mono', { dim: 1 }), C('caida', 'Minutos caídos', 'int'), C('disp', 'Disponibilidad', 'pct')],
    g: (x) => { const L = CURF ? kLen(CURF) : 1; return { mes: x.mes(x.i % L), nodo: NODES[Math.floor(x.i / L) % NODES.length].id, disp: 100 - (0.01 + x.r() * 0.15) }; }, post: (o) => { o.caida = Math.round(((100 - o.disp) / 100) * 43200); }, nobrand: 1 },
  inc: { e: 'incidentes', cnt: 1, mod: 'monitoreo', m: { t: 'count' }, cols: [C('id', 'Incidente', 'id'), C('f', 'Inicio', 'date'), C('sev', 'Severidad', 'txt', { dim: 1 }), C('nodo', 'Nodo', 'mono', { x2: 1 }), C('afe', 'Clientes afectados', 'int'), C('dur', 'Duración (min)', 'int'), C('st', 'Estado', 'chip', { map: { Resuelto: 'ok', 'En curso': 'warn' }, st: 1 })],
    g: (x) => ({ id: x.code('INC-', 310), f: x.d(), sev: x.dv(), nodo: x.pick(NODES.map((n) => n.id)), afe: x.ri(1, 60), dur: x.ri(4, 180), st: x.r() < 0.9 ? 'Resuelto' : 'En curso' }), nobrand: 1 },
  tkab: { e: 'tickets abiertos', cnt: 1, mod: 'tickets', m: { t: 'count' }, cols: [C('id', 'Ticket', 'id'), C('f', 'Abierto', 'date'), cCli, C('as', 'Asunto'), C('pr', 'Prioridad', 'txt', { x2: 1 }), C('tec', 'Técnico', 'txt', { dim: 1 }), C('st', 'Estado', 'chip', { map: { Nuevo: 'info', 'En progreso': 'warn', 'Esperando cliente': 'neutral' }, st: 1 }), C('ant', 'Antigüedad (días)', 'int')],
    g: (x) => { const c = x.c(), a = x.ri(0, 12); return { id: x.code('TK-', 26000), f: addD(TODAY, -a), c, brand: c.brand, as: x.pick(ASUNTOS), pr: x.pick(DIMS.prioridad), tec: x.ag(), st: x.pick(['Nuevo', 'En progreso', 'En progreso', 'Esperando cliente']), ant: a }; } },
  fr: { e: 'tickets', nb: 210, per: 1, mod: 'tickets', m: { t: 'avg', f: 'min' }, cols: [C('id', 'Ticket', 'id'), C('f', 'Creado', 'date'), cCli, C('pr', 'Prioridad', 'txt', { dim: 1 }), C('tec', 'Técnico', 'txt', { x2: 1 }), C('min', 'Primera respuesta (min)', 'int')],
    g: (x) => { const c = x.c(); return { id: x.code('TK-', 26000), f: x.d(), c, brand: c.brand, pr: x.dv(), tec: x.ag(), min: 5 + x.r() * 90 }; } },
  sol: { e: 'tickets resueltos', nb: 200, per: 1, mod: 'tickets', m: { t: 'avg', f: 'h' }, cols: [C('id', 'Ticket', 'id'), cCli, C('pr', 'Prioridad', 'txt', { dim: 1 }), C('tec', 'Técnico', 'txt', { x2: 1 }), C('f', 'Resuelto', 'date'), C('h', 'Horas de solución', 'n1')],
    g: (x) => { const c = x.c(); return { id: x.code('TK-', 26000), c, brand: c.brand, pr: x.dv(), tec: x.ag(), f: x.d(), h: 0.5 + x.r() * 30 }; } },
  sla: { e: 'tickets resueltos', nb: 200, per: 1, mod: 'tickets', m: { t: 'share', f: 'res', y: 'Cumplido', n: 'Incumplido' }, cols: [C('id', 'Ticket', 'id'), cCli, C('pr', 'Prioridad', 'txt', { dim: 1 }), C('tec', 'Técnico', 'txt', { x2: 1 }), C('f', 'Resuelto', 'date'), C('res', 'SLA', 'chip', { map: { Cumplido: 'ok', Incumplido: 'danger' }, st: 1 })],
    g: (x) => { const c = x.c(); return { id: x.code('TK-', 26000), c, brand: c.brand, pr: x.dv(), tec: x.ag(), f: x.d(), res: 'Incumplido' }; } },
  csat: { e: 'encuestas respondidas', nb: 90, per: 1, mod: 'tickets', m: { t: 'share', f: 'cal', y: 'Satisfecho', n: 'Insatisfecho' }, cols: [C('id', 'Ticket', 'id'), cCli, C('tec', 'Técnico', 'txt', { dim: 1 }), C('f', 'Fecha', 'date'), C('cal', 'Calificación', 'chip', { map: { Satisfecho: 'ok', Insatisfecho: 'danger' }, st: 1 }), C('com', 'Comentario')],
    g: (x) => { const c = x.c(); return { id: x.code('TK-', 26000), c, brand: c.brand, tec: x.ag(), f: x.d(), cal: 'Insatisfecho', com: '' }; }, post: (o) => { o.com = o.cal === 'Satisfecho' ? 'Atención rápida y clara' : 'Demoró la solución'; } },
  carga: { e: 'técnicos', fixed: (F) => (F.kResp && AGENTS.includes(F.kResp) ? 1 : DIMS.tecnico.length), mod: 'tickets', m: { t: 'avg', f: 'n' }, cols: [C('tec', 'Técnico', 'txt', { dim: 1 }), C('n', 'Tickets asignados', 'n1'), C('res', 'Resueltos', 'int'), C('ab', 'Abiertos', 'int')],
    g: (x) => ({ tec: kRespIn(AGENTS) || DIMS.tecnico[x.i], n: 8 + x.r() * 10, ab: x.ri(2, 6) }), post: (o) => { o.res = Math.max(0, Math.round(o.n) - o.ab); }, nobrand: 1 },
  rrec: { e: 'hojas de reclamación', cnt: 1, mod: 'reclamos', m: { t: 'count' }, cols: [C('id', 'Hoja', 'id'), C('f', 'Recibido', 'date'), C('brand', 'Marca', 'brand', { dim: 1 }), C('tipo', 'Tipo', 'txt', { x2: 1 }), C('con', 'Consumidor'), C('bien', 'Bien contratado'), C('st', 'Estado', 'chip', { map: { Respondido: 'ok', Pendiente: 'warn' }, st: 1 }), C('v', 'Vence', 'date')],
    g: (x) => { const f = x.d(), b = x.br(); return { id: x.hoja(b), f, brand: b, tipo: x.pick(['Reclamo', 'Reclamo', 'Queja']), con: x.persona(), bien: x.pick(PRODS), st: x.r() < 0.75 ? 'Respondido' : 'Pendiente', v: addD(f, 15) }; } },
  rplazo: { e: 'hojas respondidas', nb: 9, per: 1, mod: 'reclamos', m: { t: 'share', f: 'pl', y: 'Sí', n: 'No' }, cols: [C('id', 'Hoja', 'id'), C('brand', 'Marca', 'brand', { dim: 1 }), C('f', 'Recibido', 'date'), C('fr', 'Respondido', 'date'), C('dias', 'Días', 'int'), C('pl', 'En plazo', 'chip', { map: YN, st: 1 })],
    g: (x) => { const b = x.br(); return { id: x.hoja(b), brand: b, f: x.d(), pl: 'No' }; }, post: (o, x) => { o.dias = o.pl === 'Sí' ? x.ri(2, 14) : x.ri(16, 22); o.fr = addD(o.f, o.dias); } },
  rvenc: { e: 'hojas por vencer', cnt: 1, mod: 'reclamos', m: { t: 'count' }, cols: [C('id', 'Hoja', 'id'), C('brand', 'Marca', 'brand', { dim: 1 }), C('tipo', 'Tipo', 'txt', { x2: 1 }), C('f', 'Recibido', 'date'), C('v', 'Vence', 'date'), C('dias', 'Días restantes', 'int')],
    g: (x) => { const d = x.ri(0, 3), b = x.br(); return { id: x.hoja(b), brand: b, tipo: x.pick(['Reclamo', 'Queja']), v: addD(TODAY, d), f: addD(TODAY, d - 15), dias: d }; } },
  rtiempo: { e: 'hojas respondidas', nb: 9, per: 1, mod: 'reclamos', m: { t: 'avg', f: 'dias' }, cols: [C('id', 'Hoja', 'id'), C('brand', 'Marca', 'brand', { dim: 1 }), C('tipo', 'Tipo', 'txt', { x2: 1 }), C('f', 'Recibido', 'date'), C('fr', 'Respondido', 'date'), C('dias', 'Días de respuesta', 'n1')],
    g: (x) => { const b = x.br(); return { id: x.hoja(b), brand: b, tipo: x.pick(['Reclamo', 'Queja']), f: x.d(), dias: 2 + x.r() * 10 }; }, post: (o) => { o.fr = addD(o.f, Math.round(o.dias)); } },
  ped: { e: 'pedidos en línea', cnt: 1, mod: 'pedidos', m: { t: 'count' }, cols: [C('id', 'Pedido', 'id'), C('f', 'Fecha', 'date'), cCli, C('brand', 'Marca', 'brand', { dim: 1 }), C('prod', 'Producto'), C('pago', 'Pago', 'txt', { x2: 1 }), C('st', 'Estado', 'chip', { map: { Aprovisionado: 'ok', Pagado: 'info', 'Pendiente de pago': 'warn' }, st: 1 }), C('m', 'Monto', 'money')],
    g: (x) => { const c = x.c(); return { id: x.code('PED-', 5400), f: x.d(), c, brand: c.brand, prod: x.pick(PRODS), pago: x.pick(['Tarjeta', 'Tarjeta', 'PayPal', 'Transferencia']), st: x.pick(['Aprovisionado', 'Aprovisionado', 'Pagado', 'Pendiente de pago']), m: 30 + x.r() * 600 }; } },
  carr: { e: 'carritos iniciados', nb: 260, per: 1, mod: 'pedidos', m: { t: 'share', f: 'res', y: 'Abandonado', n: 'Convertido' }, cols: [C('id', 'Carrito', 'id'), C('f', 'Fecha', 'date'), C('brand', 'Marca', 'brand', { dim: 1 }), C('prod', 'Producto', 'txt', { x2: 1 }), C('m', 'Monto', 'money'), C('res', 'Resultado', 'chip', { map: { Abandonado: 'danger', Convertido: 'ok' }, st: 1 })],
    g: (x) => ({ id: x.code('CA-', 12000), f: x.d(), brand: x.br(), prod: x.pick(PRODS), m: 30 + x.r() * 600, res: 'Convertido' }) },
  convw: { e: 'páginas por mes', fixed: (F) => PAGES.length * kLen(F) * (F.brand === 'all' ? BRANDS.length : 1), mod: 'wp', m: { t: 'ratio', n: 'ped', d: 'vis', D: 4000 }, cols: [C('mes', 'Mes', 'txt', { x2: 1 }), C('brand', 'Marca', 'brand', { dim: 1 }), C('pag', 'Página', 'mono'), C('vis', 'Visitas', 'int'), C('ped', 'Pedidos', 'int'), C('cv', 'Conversión', 'pct')],
    g: (x) => { const all = !CURF || CURF.brand === 'all'; const nb = all ? BRANDS.length : 1, pp = PAGES.length; const p = x.i % pp, b = Math.floor(x.i / pp) % nb, mi = Math.floor(x.i / (pp * nb)); return { mes: x.mes(mi), brand: all ? BRANDS[b].id : (CURF as KpiFilter).brand, pag: PAGES[p], vis: (p < 5 ? 3 : 1) * (0.5 + x.r()) * (all ? BRAND_SHARE[BRANDS[b].id] : 1) }; },
    post: (o) => { o.cv = o.vis ? (o.ped / o.vis) * 100 : 0; }, note: 'La conversión es pedidos ÷ visitas de todas las filas del filtro (no el promedio de las filas).' },
  whois: { e: 'búsquedas de dominio', cnt: 1, mod: 'wp', m: { t: 'count' }, cols: [C('f', 'Fecha', 'date'), C('dom', 'Dominio buscado', 'mono'), C('ext', 'Extensión', 'txt', { dim: 1 }), C('brand', 'Marca', 'brand', { x2: 1 }), C('pag', 'Página'), C('res', 'Resultado', 'chip', { map: { Disponible: 'ok', Registrado: 'neutral' }, st: 1 }), C('car', 'Pasó al carrito', 'chip', { map: { Sí: 'info', No: 'neutral' } })],
    g: (x) => { const e = x.dv(); return { f: x.d(), dom: x.sld() + e, ext: e, brand: x.br(), pag: x.pick(['/dominios', '/', '/hosting']), res: x.r() < 0.42 ? 'Disponible' : 'Registrado', car: 'No' }; }, post: (o, x) => { o.car = o.res === 'Disponible' && x.r() < (0.035 / 0.42) * 1.6 ? 'Sí' : 'No'; }, note: 'Las búsquedas no guardan la IP del visitante.' },
  regs: { e: 'dominios registrados', cnt: 1, mod: 'dominios', m: { t: 'count' }, cols: [C('dom', 'Dominio', 'mono'), C('ext', 'Extensión', 'txt', { dim: 1 }), cCli, C('reg', 'Registrador', 'txt', { x2: 1 }), C('f', 'Fecha', 'date'), C('an', 'Años', 'int'), C('m', 'Precio', 'money')],
    g: (x) => { const c = x.c(), e = x.dv(); return { dom: x.sld() + e, ext: e, c, brand: c.brand, reg: e.endsWith('.pe') ? 'PoloDomains' : x.pick(['Namecheap', 'NameSilo']), f: x.d(), an: x.pick([1, 1, 1, 2, 3]), m: 45 + x.r() * 120 }; } },
};

/* ---------- Generación determinista y calibrada ---------- */
function kdRng(seed: string): () => number {
  let s = (kHash(seed) * 7919 + 13) % 2147483647 || 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}
const kdN0 = (F: KpiFilter, sp: KdSpec): number => {
  const bf = sp.nob ? 1 : BRAND_SHARE[F.brand];
  return Math.max(sp.min || 1, Math.round((sp.nb || 0) * bf * (sp.per ? kLen(F) : 1)));
};
export function kdN(k: KpiDef, F: KpiFilter): number {
  const sp = KDS[k.id];
  if (!sp) return 0;
  if (sp.fixed) return sp.fixed(F);
  if (sp.cnt) return Math.max(0, Math.round(kAgg(k, kEnd(F), kLen(F), F)));
  return kdN0(F, sp);
}
function kdDen(k: KpiDef, F: KpiFilter): number {
  const sp = KDS[k.id];
  const D = sp.m.t === 'ratio' ? sp.m.D : 0;
  return Math.max(50, Math.round(D * (F.brand === 'all' ? 1 : BRAND_SHARE[F.brand]) * kLen(F)));
}
/** Ajusta el valor de la tarjeta a lo que el listado puede representar (proporciones exactas). */
export function kQuantF(F: KpiFilter) {
  return (k: KpiDef, v: number): number => {
    const sp = KDS[k.id];
    if (!sp) return v;
    if (sp.m.t === 'share') {
      const n = kdN(k, F);
      return n ? (Math.round((n * v) / 100) / n) * 100 : v;
    }
    if (sp.m.t === 'ratio') {
      const d = kdDen(k, F);
      return (Math.round((d * v) / 100) / d) * 100;
    }
    return v;
  };
}
/** Valor del indicador tal como lo muestran las tarjetas (con cuantización). */
export const kValQ = (k: KpiDef, F: KpiFilter): number => kVal(k, F, kQuantF(F));

const KDCACHE = new Map<string, KdRow[]>();
export function kdRows(k: KpiDef, F: KpiFilter): KdRow[] {
  const key = [k.id, F.brand, F.kPer, F.kFrom, F.kTo, F.kCat, F.kResp].join('|');
  const hit = KDCACHE.get(key);
  if (hit) return hit;
  const sp = KDS[k.id];
  if (!sp) return [];
  CURF = F;
  const r = kdRng(key);
  const v = kValQ(k, F);
  const N = Math.min(60000, kdN(k, F));
  const pick = <T,>(a: readonly T[]): T => a[Math.floor(r() * a.length)];
  const ri = (a: number, b: number): number => a + Math.floor(r() * (b - a + 1));
  const st = kMonth(kEnd(F) - kLen(F) + 1);
  const eM = kMonth(kEnd(F));
  const en = new Date(Math.min(new Date(eM.getFullYear(), eM.getMonth() + 1, 0).getTime(), TODAY.getTime()));
  const span = Math.max(0, Math.round((en.getTime() - st.getTime()) / 864e5));
  let pool = fClients(F.brand);
  if (F.kResp && EJEC.includes(F.kResp) && ['comercial', 'crm', 'cobranza'].includes(k.g)) {
    const p2 = pool.filter((c) => c.exec === F.kResp);
    if (p2.length) pool = p2;
  }
  if (!pool.length) pool = clients;
  const names = DIMS[k.dim] || [];
  let sd = kHash(k.id + k.dim);
  const rr = (): number => {
    sd = (sd * 9301 + 49297) % 233280;
    return sd / 233280;
  };
  const w = names.map(() => 0.4 + rr());
  const tw = w.reduce((a, b) => a + b, 0);
  const wpick = (): string => {
    let t = r() * tw;
    for (let i = 0; i < names.length; i++) {
      t -= w[i];
      if (t <= 0) return names[i];
    }
    return names[names.length - 1];
  };
  const svcN = DIMS.servicio;
  const wpickSvc = (): string => (k.dim === 'servicio' ? wpick() : svcN[Math.floor(r() * svcN.length)]);
  const shuffled = pool.slice().sort((a, b) => kHash(key + a.id) - kHash(key + b.id));
  let ui = 0;
  const x: Gen = {
    i: 0, r, pick, ri,
    c: () => pick(pool),
    uc: () => shuffled[ui++ % shuffled.length],
    br: () => {
      if (F.brand !== 'all') return F.brand;
      const t = r();
      let a = 0;
      for (const b of BRANDS) {
        a += BRAND_SHARE[b.id];
        if (t <= a) return b.id;
      }
      return 'ap';
    },
    d: () => addD(st, ri(0, span)),
    past: (a, b) => addD(TODAY, -ri(a, b)),
    mes: (i) => {
      const m = kMonth(kEnd(F) - kLen(F) + 1 + (i != null ? i : ri(0, kLen(F) - 1)));
      return `${MESL[m.getMonth()]} ${m.getFullYear()}`;
    },
    code: (p, b) => p + String(b + ri(1, 8999)).padStart(String(b).length, '0'),
    inv: (c) => (c && c.doc.startsWith('RUC') ? 'F001-' : 'B001-') + String(18000 + ri(1, 999)).padStart(8, '0'),
    hoja: (b) => `${b.toUpperCase()}-2026-${String(ri(1, 999)).padStart(6, '0')}`,
    emp: () => `${pick(PRE)} ${pick(MID)} ${pick(SUF)}`,
    persona: () => `${pick(PERS)} ${pick(APE)[0]}.`,
    sld: () => norm(`${pick(MID)}${pick(['', 'peru', 'online', 'tienda', 'lima', 'studio'])}`).replace(/[^a-z0-9]/g, ''),
    dom: (c) => slug(c.name) + (c.country === 'Perú' ? '.pe' : '.com'),
    ex: (c) => kRespIn(EJEC) || (c && c.exec) || pick(EJEC),
    ag: () => kRespIn(AGENTS) || pick(DIMS.tecnico),
    svc: () => (F.kCat ? SVC_CAT[F.kCat] : wpickSvc()),
    dv: () => (k.dim === 'ejecutivo' ? x.ex() : k.dim === 'tecnico' ? x.ag() : k.dim === 'servicio' ? x.svc() : wpick()),
  };
  const rows: KdRow[] = [];
  for (let i = 0; i < N; i++) {
    x.i = i;
    rows.push(sp.g(x));
  }
  const m = sp.m;
  if (rows.length) {
    if (m.t === 'sum') {
      const t = rows.reduce((a, o) => a + o[m.f], 0) || 1;
      const f = v / t;
      rows.forEach((o) => {
        o[m.f] *= f;
        (m.also || []).forEach((a) => (o[a] *= f));
      });
    } else if (m.t === 'avg') {
      const mean = rows.reduce((a, o) => a + o[m.f], 0) / rows.length || 1;
      const f = v / mean;
      rows.forEach((o) => (o[m.f] *= f));
    } else if (m.t === 'avgc') {
      const dn = rows.reduce((a, o) => a + (m.top - o[m.f]), 0) / rows.length || 1;
      const f = (m.top - v) / dn;
      rows.forEach((o) => (o[m.f] = m.top - (m.top - o[m.f]) * f));
    } else if (m.t === 'margin') {
      const P = rows.reduce((a, o) => a + o[m.p], 0);
      const Cs = rows.reduce((a, o) => a + o[m.c], 0) || 1;
      const f = (P * (1 - v / 100)) / Cs;
      rows.forEach((o) => (o[m.c] *= f));
    } else if (m.t === 'share') {
      const K = Math.round((rows.length * v) / 100);
      const idx = rows.map((_, i) => i).sort((a, b) => kHash(key + 's' + a) - kHash(key + 's' + b));
      idx.slice(0, K).forEach((i) => {
        if (sp.flagY) sp.flagY(rows[i], x);
        else rows[i][m.f] = m.y;
      });
      if (m.n) idx.slice(K).forEach((i) => (rows[i][m.f] = m.n));
    } else if (m.t === 'ratio') {
      const D = kdDen(k, F);
      const tv = rows.reduce((a, o) => a + o[m.d], 0) || 1;
      let acc = 0;
      rows.forEach((o) => {
        o[m.d] = Math.max(1, Math.round((o[m.d] / tv) * D));
        acc += o[m.d];
      });
      rows[0][m.d] += D - acc;
      const P = Math.round((D * v) / 100);
      let pa = 0;
      rows.forEach((o) => {
        o[m.n] = Math.floor((o[m.d] * P) / D);
        pa += o[m.n];
      });
      const ord = rows.map((_, i) => i).sort((a, b) => rows[b][m.d] - rows[a][m.d]);
      for (let j = 0; pa < P; j = (j + 1) % ord.length) {
        rows[ord[j]][m.n]++;
        pa++;
      }
    }
  }
  if (sp.post) rows.forEach((o) => sp.post?.(o, x));
  CURF = null;
  KDCACHE.set(key, rows);
  return rows;
}

export function kdMeasure(k: KpiDef, rows: KdRow[]): number | null {
  const m = KDS[k.id].m;
  if (!rows.length) return m.t === 'count' || m.t === 'sum' ? 0 : null;
  switch (m.t) {
    case 'count':
      return rows.length;
    case 'sum':
      return rows.reduce((a, o) => a + o[m.f], 0);
    case 'avg':
    case 'avgc':
      return rows.reduce((a, o) => a + o[m.f], 0) / rows.length;
    case 'share':
      return (rows.filter((o) => o[m.f] === m.y).length / rows.length) * 100;
    case 'margin': {
      const P = rows.reduce((a, o) => a + o[m.p], 0);
      return P ? ((P - rows.reduce((a, o) => a + o[m.c], 0)) / P) * 100 : null;
    }
    case 'ratio': {
      const d = rows.reduce((a, o) => a + o[m.d], 0);
      return d ? (rows.reduce((a, o) => a + o[m.n], 0) / d) * 100 : null;
    }
  }
  return null;
}
export const kdMeasLbl = (k: KpiDef): string =>
  ({ count: 'conteo de filas', sum: 'suma de la columna', avg: 'promedio de la columna', avgc: 'promedio de la columna', share: 'proporción de filas marcadas', margin: '(Σ precio − Σ costo) ÷ Σ precio', ratio: 'Σ pedidos ÷ Σ visitas' })[KDS[k.id].m.t];

/* ---------- Formato ---------- */
/** Texto plano de una celda (búsqueda y CSV). */
export const kdTxt = (c: KdCol, v: any, cur: CurView): string =>
  v == null ? '' : c.t === 'client' ? v.name : c.t === 'brand' ? BR[v as keyof typeof BR]?.n ?? String(v) : c.t === 'date' ? fD(v) : c.t === 'money' ? NF2.format(conv(v, 'PEN', cur)[0]) : c.t === 'pct' || c.t === 'n1' ? NF2.format(v) : c.t === 'int' ? String(Math.round(v)) : String(v);
export const kdNum = (c: KdCol): boolean => ['money', 'pct', 'n1', 'int'].includes(c.t);
export const kdLab = (c: KdCol, v: string): string => (c.t === 'brand' ? BR[v as keyof typeof BR]?.n ?? v : String(v));
export const fmtInt = (v: number): string => NF0.format(Math.round(v));

export interface KdFilterState {
  id: string;
  q: string;
  dim: string;
  st: string;
  x2: string;
  sort: string | null;
  dir: 1 | -1;
  pg: number;
}
export const kdInit = (id: string): KdFilterState => ({ id, q: '', dim: '', st: '', x2: '', sort: null, dir: -1, pg: 0 });

export function kdFiltered(k: KpiDef, rows: KdRow[], S: KdFilterState, cur: CurView): KdRow[] {
  const sp = KDS[k.id];
  const dc = sp.cols.find((c) => c.dim);
  const sc = sp.cols.find((c) => c.st);
  const xc = sp.cols.find((c) => c.x2);
  const q = norm(S.q.trim());
  let o = rows;
  if (S.dim && dc) o = o.filter((r) => String(r[dc.k]) === S.dim);
  if (S.st && sc) o = o.filter((r) => r[sc.k] === S.st);
  if (S.x2 && xc) o = o.filter((r) => String(r[xc.k]) === S.x2);
  if (q) o = o.filter((r) => norm(sp.cols.map((c) => kdTxt(c, r[c.k], cur)).join(' ')).includes(q));
  if (S.sort) {
    const c = sp.cols.find((x) => x.k === S.sort);
    if (c) {
      const key = (r: KdRow): string | number => {
        const v = r[c.k];
        return c.t === 'client' ? norm(v && v.name) : c.t === 'brand' ? kdLab(c, v) : c.t === 'date' ? (v ? (v as Date).getTime() : 0) : v;
      };
      o = o.slice().sort((a, b) => {
        const A = key(a);
        const B = key(b);
        return (A > B ? 1 : A < B ? -1 : 0) * S.dir;
      });
    }
  }
  return o;
}
export function kdGroup(k: KpiDef, rows: KdRow[], col: KdCol): { id: string; n: string; rows: number; v: number }[] {
  const g: Record<string, KdRow[]> = {};
  rows.forEach((r) => {
    const v = String(r[col.k]);
    (g[v] = g[v] || []).push(r);
  });
  return Object.entries(g)
    .map(([n, rs]) => ({ id: n, n: kdLab(col, n), rows: rs.length, v: kdMeasure(k, rs) }))
    .filter((x): x is { id: string; n: string; rows: number; v: number } => x.v != null)
    .sort((a, b) => b.v - a.v);
}
