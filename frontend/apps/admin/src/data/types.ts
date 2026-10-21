/**
 * Tipos de los datos mock del panel (portados de prototipo/panel.html).
 * Los nombres de campo se conservan del prototipo para facilitar el portado
 * de cada vista (p. ej. `c.name`, `v.num`, `t.sub`, `d.real`).
 */
export type Cur = 'PEN' | 'USD';
/** Moneda de visualización: 'orig' muestra cada monto en su moneda original. */
export type CurView = 'orig' | Cur;
export type BrandId = 'ap' | 'sc' | 'ha' | 'ns';
export type BrandFilter = 'all' | BrandId;
export type RoleName = 'Administrador' | 'Ventas' | 'Finanzas' | 'Soporte';
export type Sev = 'critica' | 'alta' | 'media' | 'baja';
export type MoneyPair = { PEN: number; USD: number };

export interface Brand {
  id: BrandId;
  /** Nombre comercial */
  n: string;
  /** Color CSS (variable) del indicador de marca */
  c: string;
}

export type ClientStatus = 'Activo' | 'Moroso' | 'Suspendido' | 'Inactivo';
export interface Client {
  id: string; // CL-1001
  name: string;
  person: boolean;
  country: string;
  brand: BrandId;
  status: ClientStatus;
  doc: string; // "RUC 20…" | "DNI …" | "Pasaporte" | "Tax ID …"
  cur: Cur;
  since: Date;
  exec: string;
  contact: string;
  phone: string;
  email: string;
  services: Service[];
  domains: Domain[];
  invoices: Invoice[];
  tickets: Ticket[];
  /** MRR en la moneda del cliente */
  mrr: number;
}

export type ServiceStatus = 'Activo' | 'Suspendido' | 'Cancelado';
export interface Service {
  id: string; // SV-5001
  cid: string;
  t: string; // tipo: "Hosting cPanel", "VPS administrado", …
  plan: string;
  /** id de icono del prototipo (ver components/Icon) */
  ic: string;
  prov: string;
  node: string | null;
  cur: Cur;
  price: number;
  cy: 'Anual' | 'Mensual' | string;
  due: Date;
  st: ServiceStatus;
  /** Licencias (solo en servicios generados; undefined en los del cliente vitrina) */
  seats?: number;
}

export interface Domain {
  id: string; // DM-1
  d: string;
  cid: string;
  reg: 'Namecheap' | 'NameSilo' | 'PoloDomains' | string;
  /** Vencimiento real en el registrador */
  real: Date;
  /** Vencimiento comercial comunicado al cliente (15 días antes) */
  com: Date;
  tit: 'Empresa' | 'Cliente';
  auto: boolean;
  ns: string;
}

export type InvoiceType = 'Factura' | 'Boleta' | 'Nota de crédito' | 'Nota de débito';
export type InvoiceStatus = 'Pendiente' | 'Pagada' | 'Vencida' | 'Aplicada' | 'Parcial' | 'Anulada';
export type SunatStatus = 'Aceptada' | 'Pendiente' | 'Rechazada' | 'Observada';
export interface InvoiceLine {
  d: string;
  q: number;
  pu: number;
  /** Línea de comisión de medio de pago (PayPal) */
  fee?: boolean;
}
export interface Payment {
  d: Date;
  m: string | null;
  amt: number;
}
export interface Invoice {
  id: string; // = num
  num: string; // F001-00018240
  cid: string;
  type: InvoiceType;
  cur: Cur;
  issue: Date;
  due: Date;
  lines: InvoiceLine[];
  sub: number;
  igvR: number;
  igv: number;
  total: number;
  paid: number;
  status: InvoiceStatus;
  sunat: SunatStatus;
  method: string | null;
  ref: string | null;
  payments: Payment[];
  /** Fechas de recordatorios manuales enviados */
  remind: Date[];
}

export type VoucherStatus = 'Por validar' | 'Validado' | 'Rechazado';
export interface Voucher {
  id: string; // VC-7301
  inv: string;
  cid: string;
  bank: string;
  op: string;
  amt: number;
  cur: Cur;
  at: Date;
  st: VoucherStatus;
}

export type CommitStatus = 'Vigente' | 'Cumplido' | 'Incumplido';
export interface Commitment {
  id: string; // CP-401
  inv: string;
  cid: string;
  date: Date;
  amt: number;
  cur: Cur;
  note: string;
  by: string;
  st: CommitStatus;
}

export type TicketStatus = 'Nuevo' | 'En progreso' | 'Esperando cliente' | 'Resuelto';
export interface TicketMsg {
  k: 'cliente' | 'agente' | 'nota';
  a: string;
  at: Date;
  txt: string;
  att: string[];
}
export interface Ticket {
  id: string; // TK-26410
  sub: string;
  cid: string;
  prio: Sev;
  status: TicketStatus;
  created: Date;
  agent: string | null;
  ch: 'Portal' | 'Correo' | 'WhatsApp' | 'Teléfono' | string;
  /** Conversación (se genera bajo demanda con tkConv en la vista de tickets) */
  msgs?: TicketMsg[];
  links?: string[];
}
export interface SlaRule {
  /** primera respuesta (min) */
  fr: number;
  /** resolución (h) */
  res: number;
  h: '24/7' | 'Hábil' | string;
  esc: string;
}

export type LeadStage = 'Nuevo' | 'Contactado' | 'Propuesta enviada' | 'Negociación' | 'Ganado' | 'Perdido';
export interface Lead {
  id: string; // LD-880
  co: string;
  contact: string;
  stage: LeadStage;
  val: number; // S/ mensual estimado
  ch: string;
  owner: string;
  prod: string;
  brand: BrandId;
  next: Date;
  done: boolean;
  act: string;
}

export interface HostNode {
  id: string; // BH-RES-01
  n: string;
  prov: string;
  kind: string;
  disk: [number, number];
  acc: [number, number];
  ram: [number, number] | null;
  cpu: number | null;
  loc: string;
  ip: string;
  /** uso máximo (%) entre disco, cuentas y RAM */
  p: number;
}

export interface PlanDef {
  t: string;
  plan: string;
  PEN: number;
  USD: number;
  cy: string;
  ic: string;
  prov?: string;
  seats?: boolean;
}

export type MigState = 'Pendiente' | 'Respaldo' | 'Copiando' | 'DNS propagando' | 'Verificación' | 'Completada';
export interface MigItem {
  cid: string;
  acct: string;
  size: number;
  st: MigState;
}

export interface Provider {
  n: string;
  ab: string;
  cost: number;
  items: [string, string][];
}

export interface SeqStep {
  off: number;
  act: string;
  ch: string;
}

export interface Notif {
  t: string;
  s: string;
  at: string;
  /** ruta destino */
  r: string;
  /** sin leer */
  u: boolean;
  ic: string;
}

export interface Reclamo {
  id: string; // AP-2026-000041
  brand: BrandId;
  tipo: 'Reclamo' | 'Queja';
  det: string;
  monto: number;
  pedido: string;
  date: Date;
  st: 'Nuevo' | 'En atención' | 'Respondido';
  nombre: string;
  dni: string;
  dom: string;
  tel: string;
  mail: string;
  cid: string | null;
  resp: string;
  respDate?: Date;
  test: boolean;
}

export interface LegalDoc {
  id: string;
  n: string;
  v: string;
  vig: Date;
  st: string;
  acc: number;
  tot: number;
  txt: string;
  hist: { v: string; date: Date }[];
}

export interface Task {
  id: string; // TA-101
  t: string;
  cid: string | null;
  orig: string;
  who: string;
  due: Date;
  col: 'Por hacer' | 'En curso' | 'En revisión' | 'Hecho' | string;
  prio: Sev;
}

export interface ProviderAccount {
  id: string; // PV0
  p: string;
  acc: string;
  type: string;
  pay: string;
  cost: number; // US$/mes
  ren: Date | null;
  bal: number | null;
  st: string;
}

export interface CloudProject {
  id: string; // CP0
  cid: string;
  prov: 'AWS' | 'Azure' | 'Google Cloud' | 'IBM Cloud' | string;
  acct: string;
  svc: string;
  cost: number;
  fc: number;
  bud: number;
}

export interface License {
  id: string; // LC0
  cid: string;
  prod: string;
  /** asignadas */
  as: number;
  /** facturadas */
  bi: number;
}

export interface Cert {
  id: string; // SS0
  d: string;
  cid: string;
  type: string;
  exp: Date;
  auto: boolean;
}

export interface QuoteLine {
  type: 'Único' | 'Recurrente' | string;
  d: string;
  q: number;
  pu: number;
  cy: string;
}
export interface QuoteVersion {
  v: number;
  date: Date;
  by: string;
  lines: QuoteLine[];
}
export interface Quote {
  id: string; // COT-2026-0081
  cid: string | null;
  to: string;
  title: string;
  exec: string;
  st: 'Borrador' | 'Enviada' | 'Aceptada' | 'Rechazada' | 'Vencida' | string;
  valid: Date;
  vers: QuoteVersion[];
}

export interface ContractTemplate {
  id: string;
  n: string;
  cl: string[];
}
export interface Contract {
  id: string; // CT-2026-031
  cid: string;
  tpl: string;
  st: 'Firmado' | 'Enviado para firma' | 'Borrador' | 'Vencido' | string;
  date: Date;
  end: Date;
  body: string | null;
}

export interface Order {
  id: string; // PD-2026-412
  cid: string;
  prod: string;
  orig: string;
  pay: 'Pagado' | 'Pendiente' | string;
  /** índice en OSTEPS */
  step: number;
  err: string | null;
  at: Date;
}

export interface VaultItem {
  id: string;
  cid: string;
  type: string;
  user: string;
  host: string;
  upd: Date;
  shown: boolean;
}
export interface VaultAudit {
  at: Date;
  who: string;
  what: string;
  why: string;
}

export interface Monitor {
  id: string;
  n: string;
  type: string;
  t: string;
  st: 'Operativo' | 'Degradado' | 'Caído' | string;
  up: number;
  ms: number;
  paused: boolean;
}
export interface Incident {
  id: string;
  n: string;
  sev: Sev;
  at: Date;
  st: 'Abierto' | 'Resuelto' | string;
  end?: Date;
}
export interface BackupJob {
  id: string;
  n: string;
  scope: string;
  sch: string;
  last: 'Correcto' | 'Fallido' | 'Incompleto' | string;
  size: string;
  dest: string;
  ret: string;
}
export interface RestoreReq {
  id: string;
  cid: string;
  acct: string;
  pt: Date;
  scope: string;
  st: string;
  by: string;
}

export interface HostingPlan {
  id: string;
  cat?: 'hosting' | 'reseller';
  brand: BrandId;
  name: string;
  disk: number;
  bw: number;
  mails: number;
  dbs: number;
  sites: number;
  whm: string;
  node: string;
  p: { PEN: { m: number; a: number }; USD: { m: number; a: number } };
  online: boolean;
  feat: boolean;
  active: boolean;
  clients: number;
}
export interface VpsPlan {
  id: string;
  name: string;
  cpu: number;
  ram: number;
  disk: number;
  tr: number;
  os: string;
  managed: boolean;
  src: string;
  srcPlan: string;
  cost: number;
  p: { m: number; t: number; s: number; a: number };
  online: boolean;
  active: boolean;
  clients: number;
}
export interface Addon {
  n: string;
  cost: number;
  p: number;
}
export interface TldPrice {
  tld: string;
  reg: string;
  cR: number;
  cRn: number;
  cT: number;
  pPEN: number;
  pUSD: number;
  online: boolean;
}
export interface Bundle {
  id: string;
  brand: BrandId;
  name: string;
  items: string[];
  list: number;
  price: number;
  online: boolean;
  active: boolean;
  clients: number;
}

export interface UserAccount {
  n: string;
  m: string;
  role: string;
  st: 'Activo' | 'Suspendido' | 'Invitado' | string;
  mfa: boolean;
  last: Date | null;
}
export interface RoleDef {
  id: string;
  sys: boolean;
  desc: string;
}

export type KpiUnit = 'money' | 'num' | 'pct' | 'days' | 'hours' | 'min';
export interface KpiDef {
  g: string;
  id: string;
  n: string;
  unit: KpiUnit;
  agg: 'sum' | 'avg' | 'last';
  dir: 'up' | 'down';
  base: number;
  trend: number;
  noise: number;
  goal: number;
  dim: string;
  def: string;
  f: string;
}

export interface WpSite {
  id: string;
  host: string;
  brand: BrandId;
  ms: string;
  st: string;
  tok: string;
  wh: string;
  inv: Date;
  plugin: string;
  wp: string;
  lat: number;
}

export interface BrandContact {
  tel: string;
  tel2: string;
  mail: string;
  mail2: string;
  wa: string;
  dir: string;
  hor: string;
}

export interface Appearance {
  logo: string | null;
  primary: string;
  secondary: string;
  accent: string;
  bg: string;
  fh: string;
  fb: string;
  radius: number;
  btn: 'Sólido' | 'Contorno' | 'Píldora' | string;
  status: string;
}

export interface SecurityPolicy {
  minLen: number;
  upper: boolean;
  num: boolean;
  sym: boolean;
  expire: number;
  hist: number;
  mfaMail: boolean;
  mfaApp: boolean;
  role: Record<string, string>;
  type: { personal: string; clientes: string };
  att: number;
  lock: number;
  sess: number;
  trust: boolean;
  trustDays: number;
}
