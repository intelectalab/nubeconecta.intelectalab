/**
 * Panel de indicadores (KPI): definiciones KD (prototipo l.2870-2936) y motor
 * de cálculo de series y agregados (l.2938-2960, 3056-3057).
 *
 * El prototipo usa estado global (S.brand, S.kPer…); aquí todo recibe un
 * objeto `KpiFilter` explícito. La cuantización por listado (kQuant / KDS,
 * l.3534-3700) y la tabla de registros por indicador las porta la vista
 * KpiDetalle; `kVal` acepta un `quant` opcional para ello.
 */
import { AGENTS, BRANDS, BRAND_SHARE, CHANNELS, EJEC, MSTATES, NODES, STAGES } from './db';
import { compact, conv, MES, MESL, NF0, NF2, moneyRaw, SYM } from './format';
import { kHash } from './rng';
import type { BrandFilter, CurView, KpiDef, KpiUnit } from './types';

/** Grupos de indicadores [id, etiqueta]. */
export const KG: [string, string][] = [['comercial', 'Comercial'], ['crm', 'CRM'], ['finanzas', 'Finanzas'], ['cobranza', 'Cobranza'], ['operacion', 'Operación'], ['soporte', 'Soporte'], ['reclamos', 'Reclamos'], ['web', 'Web']];
/** Grupos visibles por rol (null = todos). */
export const KROLE: Record<string, string[] | null> = { Administrador: null, Ventas: ['comercial', 'crm', 'web'], Finanzas: ['comercial', 'finanzas', 'cobranza'], Soporte: ['operacion', 'soporte', 'reclamos'] };
export const kGroups = (role: string): [string, string][] => KG.filter((g) => !KROLE[role] || (KROLE[role] as string[]).includes(g[0]));

export const KD: KpiDef[] = [];
const K = (g: string, id: string, n: string, unit: KpiUnit, agg: KpiDef['agg'], dir: KpiDef['dir'], base: number, trend: number, noise: number, goal: number, dim: string, def: string, f: string): void => {
  KD.push({ g, id, n, unit, agg, dir, base, trend, noise, goal, dim, def, f });
};
// Comercial
K('comercial','mrr','MRR','money','last','up',61300,.34,.03,64000,'servicio','Ingreso recurrente mensual de suscripciones activas al cierre del periodo.','Σ precio mensualizado de servicios activos (anual ÷ 12)');
K('comercial','arr','ARR','money','last','up',735600,.34,.03,768000,'servicio','Ingreso recurrente anualizado.','MRR × 12');
K('comercial','activos','Clientes activos','num','last','up',372,.22,.015,385,'marca','Clientes con al menos un servicio activo al cierre.','count(clientes con servicio activo)');
K('comercial','nuevos','Clientes nuevos','num','sum','up',14,.3,.25,15,'canal','Clientes cuyo primer servicio se activó en el periodo.','count(primer alta ∈ periodo)');
K('comercial','perdidos','Clientes perdidos','num','sum','down',5,-.2,.35,4,'servicio','Clientes que dieron de baja todos sus servicios.','count(bajas totales ∈ periodo)');
K('comercial','churn','Churn de clientes','pct','avg','down',1.4,-.25,.2,1.2,'marca','Porcentaje de clientes perdidos sobre los activos al inicio.','perdidos ÷ activos al inicio × 100');
K('comercial','arpu','ARPU','money','avg','up',165,.12,.03,170,'marca','Ingreso recurrente promedio por cliente activo.','MRR ÷ clientes activos');
K('comercial','ltv','LTV','money','last','up',11800,.18,.05,12500,'servicio','Valor de vida estimado de un cliente.','ARPU × margen bruto ÷ churn mensual');
K('comercial','enlinea','Ventas en línea','pct','avg','up',58,.15,.06,60,'marca','Participación de ventas cerradas en el carrito frente a cotización.','ventas en línea ÷ ventas totales × 100');
// CRM
K('crm','embudo','Valor del embudo','money','last','up',76900,.25,.08,80000,'etapa','Valor mensual estimado de prospectos abiertos.','Σ valor de prospectos en etapas abiertas');
K('crm','conv','Conversión global','pct','avg','up',18.5,.12,.1,20,'canal','Prospectos ganados sobre prospectos cerrados.','ganados ÷ (ganados + perdidos) × 100');
K('crm','ciclo','Ciclo de venta','days','avg','down',19,-.15,.1,16,'canal','Días promedio desde el alta del prospecto hasta el cierre.','promedio(fecha de cierre − fecha de alta)');
K('crm','sinseg','Prospectos sin seguimiento','num','last','down',6,-.1,.3,3,'ejecutivo','Prospectos abiertos sin actividad en los últimos 7 días.','count(abiertos sin actividad 7 d)');
K('crm','ganados','Prospectos ganados','num','sum','up',9,.3,.25,10,'canal','Prospectos que pasaron a «Ganado».','count(ganados ∈ periodo)');
// Finanzas
K('finanzas','facturado','Facturado','money','sum','up',59650,.3,.04,62000,'servicio','Total de comprobantes emitidos (sin notas de crédito).','Σ facturas + boletas + notas de débito');
K('finanzas','cobrado','Cobrado','money','sum','up',57210,.3,.04,60000,'medio','Pagos conciliados en el periodo.','Σ pagos validados');
K('finanzas','reconocido','Ingreso reconocido','money','sum','up',58800,.3,.03,61000,'servicio','Ingreso devengado según la vigencia del servicio.','Σ (precio × días de servicio en el periodo ÷ días del ciclo)');
K('finanzas','dso','DSO','days','avg','down',23,-.12,.08,20,'marca','Días promedio de cobro.','cuentas por cobrar ÷ facturado × días del periodo');
K('finanzas','margen','Margen bruto','pct','avg','up',61,.05,.03,62,'servicio','Margen después de costos directos de proveedores.','(ingreso − costo de proveedores) ÷ ingreso × 100');
K('finanzas','costos','Costos de proveedores','money','sum','down',6340,.2,.05,6200,'proveedor','Gasto en proveedores convertido a S/.','Σ facturas de proveedores × TC');
K('finanzas','refact','Refacturación de consumo','money','sum','up',4120,.35,.12,4500,'proveedor','Consumo cloud y licencias trasladado a clientes.','Σ líneas de consumo refacturadas');
K('finanzas','comis','Comisiones de medios de pago','money','sum','down',612,.15,.1,580,'medio','Comisiones de pasarela y PayPal (PayPal se traslada al cliente).','Σ comisiones cobradas por los medios de pago');
K('finanzas','recargos','Recargos por mora','money','sum','down',418,-.1,.2,350,'marca','Notas de débito por mora emitidas.','Σ notas de débito por mora');
// Cobranza
K('cobranza','porvencer','Por vencer (30 d)','money','last','up',37400,.2,.06,36000,'marca','Saldo de comprobantes que vencen en los próximos 30 días.','Σ saldo con vencimiento ∈ [hoy, hoy + 30]');
K('cobranza','vencido','Vencido','money','last','down',18300,-.08,.1,15000,'tramo','Saldo de comprobantes vencidos no pagados.','Σ saldo con vencimiento < hoy');
K('cobranza','compcump','Compromisos cumplidos','pct','avg','up',78,.06,.06,85,'ejecutivo','Compromisos de pago pagados a tiempo.','cumplidos ÷ vencidos en el periodo × 100');
K('cobranza','compinc','Compromisos incumplidos','num','sum','down',3,-.1,.4,2,'ejecutivo','Compromisos vencidos sin pago.','count(incumplidos ∈ periodo)');
K('cobranza','susp','Suspensiones','num','sum','down',11,-.15,.25,8,'marca','Servicios suspendidos por falta de pago.','count(suspensiones ∈ periodo)');
K('cobranza','react','Reactivaciones','num','sum','up',9,.1,.25,8,'marca','Servicios reactivados tras el pago.','count(reactivaciones ∈ periodo)');
K('cobranza','vouch','Vouchers validados','num','sum','up',64,.25,.12,60,'banco','Transferencias validadas por Finanzas.','count(vouchers validados)');
K('cobranza','vouchT','Tiempo de validación','hours','avg','down',5.2,-.3,.15,4,'banco','Horas desde que el cliente sube el voucher hasta su validación.','promedio(validado − recibido)');
// Operación
K('operacion','renov','Tasa de renovación','pct','avg','up',91.5,.03,.02,93,'servicio','Servicios renovados sobre los que vencían.','renovados ÷ por vencer × 100');
K('operacion','domv','Dominios por vencer (30 d)','num','last','down',70,.1,.15,60,'registrador','Dominios con fecha real de vencimiento en 30 días.','count(vencimiento real ≤ 30 d)');
K('operacion','nodos','Uso promedio de nodos','pct','last','down',66,.08,.03,70,'nodo','Uso promedio del recurso más exigido de cada nodo.','promedio(max(disco, cuentas, RAM) por nodo)');
K('operacion','migra','Avance de migración','pct','last','up',41,1.4,.02,50,'estado','Cuentas migradas de BanaHosting a VPS propio.','completadas ÷ total × 100');
K('operacion','bkok','Respaldos correctos','pct','avg','up',97.8,.01,.01,99,'nodo','Trabajos de respaldo terminados sin error.','correctos ÷ ejecutados × 100');
K('operacion','uptime','Disponibilidad','pct','avg','up',99.93,0,.0004,99.9,'nodo','Disponibilidad promedio de los monitores.','tiempo arriba ÷ tiempo total × 100');
K('operacion','inc','Incidentes','num','sum','down',4,-.2,.35,3,'severidad','Incidentes registrados por monitoreo.','count(incidentes ∈ periodo)');
// Soporte
K('soporte','tkab','Tickets abiertos','num','last','down',48,-.05,.12,40,'tecnico','Tickets no resueltos al cierre.','count(estado ≠ Resuelto)');
K('soporte','fr','Primera respuesta','min','avg','down',42,-.2,.12,35,'prioridad','Minutos promedio hasta la primera respuesta de un agente.','promedio(primera respuesta − apertura)');
K('soporte','sol','Tiempo de solución','hours','avg','down',14.5,-.15,.1,12,'prioridad','Horas promedio hasta resolver.','promedio(resuelto − apertura)');
K('soporte','sla','Cumplimiento de SLA','pct','avg','up',94.1,.03,.02,95,'prioridad','Tickets resueltos dentro del SLA de su prioridad.','dentro de SLA ÷ resueltos × 100');
K('soporte','csat','CSAT','pct','avg','up',91,.03,.03,92,'tecnico','Clientes satisfechos en la encuesta posterior al cierre.','respuestas 4–5 ÷ respuestas × 100');
K('soporte','carga','Tickets por técnico','num','avg','down',13,.05,.12,12,'tecnico','Tickets atendidos por técnico en el periodo.','tickets atendidos ÷ técnicos activos');
// Reclamos
K('reclamos','rrec','Reclamos recibidos','num','sum','down',9,-.1,.3,8,'marca','Hojas del Libro de Reclamaciones recibidas.','count(hojas ∈ periodo)');
K('reclamos','rplazo','Respondidos en plazo','pct','avg','up',93,.04,.04,100,'marca','Hojas respondidas dentro del plazo configurado.','respondidas en plazo ÷ respondidas × 100');
K('reclamos','rvenc','Por vencer (≤ 3 d)','num','last','down',3,0,.4,0,'marca','Hojas pendientes con 3 días o menos de plazo.','count(pendientes con plazo ≤ 3 d)');
K('reclamos','rtiempo','Tiempo medio de respuesta','days','avg','down',6.8,-.15,.12,7,'marca','Días promedio hasta enviar la respuesta.','promedio(respuesta − recepción)');
// Web
K('web','ped','Pedidos en línea','num','sum','up',96,.4,.1,100,'marca','Pedidos completados desde el carrito de las webs.','count(pedidos web pagados)');
K('web','carr','Carritos abandonados','pct','avg','down',64,-.1,.05,60,'marca','Carritos iniciados que no terminaron en pago.','abandonados ÷ iniciados × 100');
K('web','convw','Conversión web','pct','avg','up',2.4,.2,.08,2.6,'marca','Visitas que terminan en pedido.','pedidos ÷ sesiones × 100');
K('web','whois','Búsquedas WHOIS','num','sum','up',3840,.35,.1,4000,'extension','Búsquedas en el verificador de dominios.','count(búsquedas [hub_whois])');
K('web','regs','Registros de dominios','num','sum','up',61,.3,.15,65,'extension','Dominios registrados desde la web.','count(registros web)');
export const KBY: Record<string, KpiDef> = Object.fromEntries(KD.map((k) => [k.id, k]));

/* ---------- Filtros ---------- */
export type KPer = 'mes' | 'trimestre' | 'año' | 'rango';
export interface KpiFilter {
  brand: BrandFilter;
  cur: CurView;
  kPer: KPer;
  /** 'anterior' = periodo anterior · 'anual' = mismo periodo del año anterior */
  kCmp: 'anterior' | 'anual';
  /** índices de mes 0..47 (47 = oct 2026) para el periodo 'rango' */
  kFrom: number;
  kTo: number;
  /** categoría ('' = todas): hosting, vps, correo, dominios, ssl, web, otros */
  kCat: string;
  /** responsable ('' = todos): ejecutivo o agente */
  kResp: string;
}
export const KPI_FILTER_DEFAULT: Omit<KpiFilter, 'brand' | 'cur'> = { kPer: 'mes', kCmp: 'anterior', kFrom: 36, kTo: 47, kCat: '', kResp: '' };
export const CATF: Record<string, number> = { '': 1, hosting: 0.42, vps: 0.2, correo: 0.14, dominios: 0.08, ssl: 0.04, web: 0.07, otros: 0.05 };

/** Mes del índice i (47 = octubre 2026). */
export const kMonth = (i: number): Date => new Date(2026, 9 - (47 - i), 1);
export const kMonL = (i: number): string => {
  const d = kMonth(i);
  return `${MES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
};
const SERIES = new Map<string, number[]>();
/** Serie mensual de 48 valores (determinista por id). */
export function kSeries(k: KpiDef): number[] {
  const hit = SERIES.get(k.id);
  if (hit) return hit;
  let sd = kHash(k.id);
  const r = (): number => {
    sd = (sd * 9301 + 49297) % 233280;
    return sd / 233280;
  };
  const o: number[] = [];
  for (let i = 0; i < 48; i++) {
    let v = k.base * (1 + (k.trend * (i - 47)) / 47) * (1 + k.noise * Math.sin((i / 12) * 2 * Math.PI + (sd % 7))) * (1 + (r() - 0.5) * k.noise);
    if (k.unit === 'pct') v = Math.max(0, Math.min(k.id === 'uptime' ? 100 : 99.5, v));
    o.push(v);
  }
  SERIES.set(k.id, o);
  return o;
}
export function kFactor(k: KpiDef, F: KpiFilter): number {
  const ext = ['money', 'num'].includes(k.unit);
  let f = 1;
  if (ext) {
    f *= BRAND_SHARE[F.brand];
    if (['comercial', 'finanzas', 'web', 'cobranza'].includes(k.g)) f *= CATF[F.kCat];
  }
  if (F.kResp) {
    if (EJEC.includes(F.kResp) && ['comercial', 'crm'].includes(k.g) && ext) f *= [0.38, 0.34, 0.28][EJEC.indexOf(F.kResp)];
    if (AGENTS.includes(F.kResp) && k.g === 'soporte' && ext) f *= 0.22;
  }
  return f;
}
export const kLen = (F: KpiFilter): number => (F.kPer === 'mes' ? 1 : F.kPer === 'trimestre' ? 3 : F.kPer === 'año' ? 12 : Math.max(1, F.kTo - F.kFrom + 1));
export const kEnd = (F: KpiFilter): number => (F.kPer === 'rango' ? F.kTo : 47);
export function kAgg(k: KpiDef, end: number, len: number, F: KpiFilter): number {
  const s = kSeries(k);
  const v: number[] = [];
  for (let i = end - len + 1; i <= end; i++) v.push(s[Math.max(0, i)]);
  const x = k.agg === 'sum' ? v.reduce((a, b) => a + b, 0) : k.agg === 'avg' ? v.reduce((a, b) => a + b, 0) / v.length : v[v.length - 1];
  return x * kFactor(k, F);
}
export const kCmpOff = (F: KpiFilter): number => (F.kCmp === 'anual' ? 12 : kLen(F));
/** Valor del periodo. `quant` permite ajustar al listado (kQuant del prototipo). */
export const kVal = (k: KpiDef, F: KpiFilter, quant?: (k: KpiDef, v: number) => number): number => {
  const v = kAgg(k, kEnd(F), kLen(F), F);
  return quant ? quant(k, v) : v;
};
export const kPrev = (k: KpiDef, F: KpiFilter): number => kAgg(k, kEnd(F) - kCmpOff(F), kLen(F), F);
/** 12 puntos para la mini serie (off = desplazamiento para la serie comparada). */
export function kSpark(k: KpiDef, F: KpiFilter, off = 0): number[] {
  const len = kLen(F);
  const step = F.kPer === 'año' || F.kPer === 'rango' ? 1 : len;
  const o: number[] = [];
  for (let i = 11; i >= 0; i--) o.push(kAgg(k, kEnd(F) - off - i * step, F.kPer === 'rango' ? 1 : len, F));
  return o;
}
/** Metas personalizadas: clave `${id}|${brand}|${kPer}`. */
export const GOALS: Record<string, number> = {};
export function kGoal(k: KpiDef, F: KpiFilter): number {
  const key = `${k.id}|${F.brand}|${F.kPer}`;
  if (GOALS[key] != null) return GOALS[key];
  let g = k.goal;
  if (k.agg === 'sum') g *= kLen(F);
  if (['money', 'num'].includes(k.unit)) g *= BRAND_SHARE[F.brand];
  return g;
}
/** [etiqueta, clase de chip, ratio de avance] */
export function kStatus(k: KpiDef, v: number, g: number): [string, 'ok' | 'warn' | 'danger', number] {
  if (g === 0) return v <= 0.5 ? ['En meta', 'ok', 1] : ['Fuera', 'danger', 0];
  const r = k.dir === 'up' ? v / g : g / Math.max(v, 1e-9);
  return r >= 1 ? ['En meta', 'ok', r] : r >= 0.9 ? ['En riesgo', 'warn', r] : ['Fuera', 'danger', r];
}
/** Formatea un valor según la unidad del indicador (montos en S/ convertidos a la moneda de vista). */
export function kFmt(k: KpiDef, v: number, cur: CurView, short?: boolean): string {
  if (k.unit === 'money') {
    const [x, c] = conv(v, 'PEN', cur);
    return short && Math.abs(x) >= 1e5 ? `${SYM[c]} ${compact(x)}` : moneyRaw(x, c, 1);
  }
  if (k.unit === 'pct') return NF2.format(v).replace(/(\.\d)0$/, '$1') + ' %';
  if (k.unit === 'days') return NF2.format(v).replace(/0$/, '') + ' d';
  if (k.unit === 'hours') return NF2.format(v).replace(/0$/, '') + ' h';
  if (k.unit === 'min') return NF0.format(v) + ' min';
  return NF0.format(v);
}
export function kDelta(k: KpiDef, v: number, p: number): { d: number; cls: 'flat' | 'good' | 'bad'; txt: string } {
  const d = p ? ((v - p) / Math.abs(p)) * 100 : 0;
  const flat = Math.abs(d) < 0.5;
  const good = k.dir === 'up' ? d > 0 : d < 0;
  return { d, cls: flat ? 'flat' : good ? 'good' : 'bad', txt: `${flat ? '■' : d > 0 ? '▲' : '▼'} ${NF2.format(Math.abs(d)).replace(/0$/, '')} %` };
}
export function kPerLabel(F: KpiFilter, off = 0): string {
  const len = kLen(F);
  const end = kEnd(F) - off;
  if (F.kPer === 'mes') return MESL[kMonth(end).getMonth()] + ' ' + kMonth(end).getFullYear();
  return `${kMonL(end - len + 1)} – ${kMonL(end)}`;
}
export function kLabels(F: KpiFilter): string[] {
  const len = kLen(F);
  const step = F.kPer === 'año' || F.kPer === 'rango' ? 1 : len;
  const o: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const e = kEnd(F) - i * step;
    o.push(F.kPer === 'trimestre' ? `T${Math.floor(kMonth(e).getMonth() / 3) + 1} ${String(kMonth(e).getFullYear()).slice(2)}` : kMonL(e));
  }
  return o;
}
/** Dimensiones de desglose por indicador. */
export const DIMS: Record<string, string[]> = {
  servicio: ['Hosting cPanel', 'VPS administrado', 'Correo corporativo', 'Dominios', 'SSL', 'Desarrollo y web'],
  marca: BRANDS.map((b) => b.n),
  canal: CHANNELS,
  etapa: STAGES.slice(0, 5),
  ejecutivo: EJEC,
  medio: ['Tarjeta (pasarela local)', 'Transferencia', 'PayPal'],
  proveedor: ['Contabo', 'BanaHosting', 'Google Workspace', 'Microsoft 365', 'AWS', 'DigitalOcean'],
  tramo: ['1–30 d', '31–60 d', '61–90 d', '> 90 d'],
  banco: ['BCP', 'Interbank', 'BBVA', 'Scotiabank', 'Yape'],
  registrador: ['Namecheap', 'NameSilo', 'PoloDomains'],
  nodo: NODES.map((n) => n.id),
  estado: MSTATES.map((m) => m[0]),
  severidad: ['Crítica', 'Alta', 'Media', 'Baja'],
  tecnico: AGENTS.filter((a) => a !== 'Renzo Vargas'),
  prioridad: ['Crítica', 'Alta', 'Media', 'Baja'],
  extension: ['.pe', '.com.pe', '.com', '.net', '.org'],
};
/** Desglose determinista de un valor por la dimensión del indicador. */
export function kDims(k: KpiDef, v: number): { n: string; v: number; p: number }[] {
  const names = DIMS[k.dim] || DIMS.servicio;
  let sd = kHash(k.id + k.dim);
  const r = (): number => {
    sd = (sd * 9301 + 49297) % 233280;
    return sd / 233280;
  };
  const ext = ['money', 'num'].includes(k.unit) && k.agg !== 'avg';
  const w = names.map(() => 0.4 + r());
  const tw = w.reduce((a, b) => a + b, 0);
  return names.map((n, i) => {
    const val = ext ? (v * w[i]) / tw : v * (0.88 + 0.24 * r());
    const pv = val * (1 - (r() - 0.45) * 0.12);
    return { n, v: val, p: pv };
  });
}
