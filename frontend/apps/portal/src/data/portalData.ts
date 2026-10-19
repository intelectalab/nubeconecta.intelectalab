export interface ServiceUsage {
  label: string;
  used: number;
  total: number | null;
  unit: string;
}

export interface ServiceItem {
  id: string;
  proj: 'web' | 'correo';
  kind: string;
  name: string;
  plan: string;
  host: string;
  icon: string;
  st: 'ok' | 'warn' | 'danger';
  stNote?: string;
  cpanel?: boolean;
  usage: ServiceUsage[];
  feats: [string, string][];
  price: [number, 'PEN' | 'USD', string];
  renew: string | null;
}

export interface InvoiceItem {
  id: string;
  date: string;
  due: string;
  desc: string;
  srv: string | null;
  amt: number;
  c: 'PEN' | 'USD';
  st: 'vencida' | 'pendiente' | 'pagada';
  paid?: string;
  via?: string;
  lines: [string, number][];
}

export interface DomainItem {
  name: string;
  reg: string;
  exp: string;
  auto: boolean;
  holder: string;
  lockUntil: string | null;
  lockWhy?: string;
  st: string;
  ns: string;
  priv: string;
  price: [number, 'PEN' | 'USD'];
}

export interface TicketMsg {
  w: 'c' | 'a';
  n: string;
  t: string;
  x: string;
  files?: string[];
}

export interface TicketItem {
  id: string;
  subj: string;
  srv: string;
  pri: 'alta' | 'media' | 'baja';
  st: 'En atención' | 'Esperando tu respuesta' | 'Resuelto';
  created: string;
  upd: string;
  msgs: TicketMsg[];
}

export const CLIENT = {
  name: 'Andes Travel S.A.C.',
  ruc: '20614587231',
  code: 'CLI-00873',
  since: '14/03/2019',
  brand: 'AlojamientoPlus',
  addr: 'Av. El Sol 845, oficina 302',
  dist: 'Cusco',
  prov: 'Cusco',
  dep: 'Cusco',
  billMail: 'facturacion@andestravel.pe',
  phone: '+51 984 512 337',
  doc: 'Factura electrónica',
  curPref: 'PEN',
  exec: 'Rosa Medina (ejecutiva de cuenta)',
};

export const PROJ = [
  { id: 'web', name: 'Web de turismo', desc: 'Sitio público, reservas en línea y comunicación con viajeros', icon: 'globe' },
  { id: 'correo', name: 'Correo corporativo', desc: 'Buzones del equipo de Andes Travel', icon: 'mail' },
];

export const SRV: ServiceItem[] = [
  {
    id: 'servidor',
    proj: 'web',
    kind: 'Servidor',
    name: 'Servidor cloud',
    plan: 'Servidor Cloud M',
    host: 'srv-web-01.andestravel.pe',
    icon: 'server',
    st: 'ok',
    usage: [
      { label: 'Procesador', used: 38, total: null, unit: '%' },
      { label: 'Memoria RAM', used: 4.9, total: 8, unit: 'GB' },
      { label: 'Disco SSD NVMe', used: 115, total: 160, unit: 'GB' },
      { label: 'Transferencia del mes', used: 1.2, total: 4, unit: 'TB' },
    ],
    feats: [
      ['Procesador', '4 núcleos virtuales'],
      ['Memoria', '8 GB RAM'],
      ['Disco', '160 GB SSD NVMe'],
      ['Sistema operativo', 'Ubuntu 24.04 LTS'],
      ['Ubicación', 'Centro de datos EE. UU. (costa este)'],
      ['IP pública', '203.0.113.24'],
      ['Disponibilidad del mes', '99.98 %'],
    ],
    price: [48, 'USD', 'mes'],
    renew: '01/11/2026',
  },
  {
    id: 'sitio',
    proj: 'web',
    kind: 'Sitio web',
    name: 'Sitio web principal',
    plan: 'Hosting Negocios cPanel',
    host: 'andestravel.pe',
    icon: 'browser',
    st: 'ok',
    cpanel: true,
    usage: [
      { label: 'Espacio en disco', used: 18.4, total: 50, unit: 'GB' },
      { label: 'Bases de datos', used: 3, total: 10, unit: '' },
      { label: 'Visitas este mes', used: 42.6, total: 100, unit: 'mil' },
    ],
    feats: [
      ['Gestor', 'WordPress 6.6'],
      ['Versión de PHP', '8.3'],
      ['Certificado SSL', 'Activo (HTTPS)'],
      ['Cuentas FTP', '2'],
      ['Respaldo', 'Diario, 30 días de retención'],
    ],
    price: [590, 'PEN', 'año'],
    renew: '15/10/2026',
  },
  {
    id: 'reservas',
    proj: 'web',
    kind: 'Aplicación',
    name: 'Sistema de reservas',
    plan: 'Hosting de Aplicaciones Pro',
    host: 'reservas.andestravel.pe',
    icon: 'cal2',
    st: 'warn',
    stNote: 'Carga alta entre 17:00 y 20:00 · en optimización (ticket TK-10482)',
    usage: [
      { label: 'Procesador', used: 71, total: null, unit: '%' },
      { label: 'Memoria RAM', used: 2.6, total: 4, unit: 'GB' },
      { label: 'Base de datos', used: 2.1, total: 10, unit: 'GB' },
    ],
    feats: [
      ['Tecnología', 'Node.js 20 + PostgreSQL 16'],
      ['Reservas procesadas (mes)', '1 284'],
      ['Respaldo de BD', 'Cada 6 horas'],
      ['Tiempo de respuesta', '420 ms'],
    ],
    price: [35, 'USD', 'mes'],
    renew: '01/11/2026',
  },
  {
    id: 'mailcorp',
    proj: 'correo',
    kind: 'Correo',
    name: 'Correo empresarial',
    plan: 'Correo Empresarial Pro · 30 buzones',
    host: '@andestravel.pe',
    icon: 'mail',
    st: 'ok',
    usage: [
      { label: 'Buzones usados', used: 24, total: 30, unit: '' },
      { label: 'Almacenamiento total', used: 186, total: 300, unit: 'GB' },
    ],
    feats: [
      ['Buzones', '30 cuentas de 15 GB c/u'],
      ['Acceso', 'Webmail, Outlook, Gmail y celulares'],
      ['Seguridad', 'Antispam y Antivirus activo'],
      ['Respaldo', 'Diario, 14 días'],
    ],
    price: [270, 'PEN', 'mes'],
    renew: '20/10/2026',
  },
];

export const DOMS: DomainItem[] = [
  { name: 'andestravel.pe', reg: '14/02/2019', exp: '14/02/2027', auto: true, holder: 'Andes Travel S.A.C.', lockUntil: null, st: 'activo', ns: 'ns1.alojamientoplus.pe / ns2.alojamientoplus.pe', priv: 'No aplica (.pe)', price: [95, 'PEN'] },
  { name: 'andestravel.com', reg: '03/11/2019', exp: '03/11/2026', auto: false, holder: 'Andes Travel S.A.C.', lockUntil: null, st: 'activo', ns: 'ns1.alojamientoplus.pe / ns2.alojamientoplus.pe', priv: 'Activa', price: [18.9, 'USD'] },
  { name: 'andes-travel.com.pe', reg: '01/09/2026', exp: '01/09/2027', auto: true, holder: 'Andes Travel S.A.C.', lockUntil: '31/10/2026', lockWhy: 'registro reciente (60 días)', st: 'activo', ns: 'ns1.alojamientoplus.pe / ns2.alojamientoplus.pe', priv: 'No aplica (.pe)', price: [95, 'PEN'] },
];

export const INV: InvoiceItem[] = [
  { id: 'E001-4498', date: '01/09/2026', due: '01/10/2026', desc: 'Servidor cloud · setiembre 2026', srv: 'servidor', amt: 48, c: 'USD', st: 'vencida', lines: [['Servidor Cloud M (1 mes)', 48]] },
  { id: 'E001-4521', date: '30/09/2026', due: '15/10/2026', desc: 'Hosting Negocios cPanel · renovación anual', srv: 'sitio', amt: 590, c: 'PEN', st: 'pendiente', lines: [['Hosting Negocios (12 meses)', 500], ['IGV 18 %', 90]] },
  { id: 'E001-4533', date: '05/10/2026', due: '20/10/2026', desc: 'Correo empresarial y archivo · octubre 2026', srv: 'mailcorp', amt: 315, c: 'PEN', st: 'pendiente', lines: [['Correo Empresarial Pro · 30 buzones', 228.81], ['Archivo legal 5 años', 38.14], ['IGV 18 %', 48.05]] },
  { id: 'E001-4540', date: '06/10/2026', due: '25/10/2026', desc: 'Renovación de andestravel.com (1 año)', srv: null, amt: 18.9, c: 'USD', st: 'pendiente', lines: [['Renovación de dominio .com', 18.9]] },
  { id: 'E001-4472', date: '01/09/2026', due: '15/09/2026', desc: 'Aplicaciones, red de entrega y envíos · setiembre', srv: 'reservas', amt: 84, c: 'USD', st: 'pagada', paid: '12/09/2026', via: 'Tarjeta Visa •••• 4821', lines: [['Hosting Apps Pro', 35], ['Aceleración CDN', 12], ['Correo transaccional', 8], ['Boletines', 29]] },
  { id: 'E001-4455', date: '05/09/2026', due: '20/09/2026', desc: 'Correo empresarial y archivo · setiembre 2026', srv: 'mailcorp', amt: 315, c: 'PEN', st: 'pagada', paid: '18/09/2026', via: 'Transferencia BCP', lines: [['Correo Empresarial Pro · 30 buzones', 228.81], ['Archivo legal 5 años', 38.14], ['IGV 18 %', 48.05]] },
];

export const TK: TicketItem[] = [
  {
    id: 'TK-10482',
    subj: 'El sistema de reservas va lento por las tardes',
    srv: 'Sistema de reservas',
    pri: 'alta',
    st: 'En atención',
    created: '06/10/2026 17:42',
    upd: '08/10/2026 09:15',
    msgs: [
      { w: 'c', n: 'Lucía Quispe', t: '06/10/2026 17:42', x: 'Desde el lunes, entre las 5 y 8 p. m., la página de reservas tarda casi 10 segundos en cargar los paquetes. Los clientes se quejan por WhatsApp.', files: ['captura-reservas.png'] },
      { w: 'a', n: 'Carla Vargas · Soporte AlojamientoPlus', t: '06/10/2026 18:05', x: 'Hola, Lucía. Gracias por avisar. Ya revisamos y vemos picos de uso del procesador en ese horario. Estamos analizando las consultas a la base de datos para optimizarlas.' },
      { w: 'c', n: 'Diego Ramos', t: '07/10/2026 10:20', x: '¿Les ayuda si les compartimos el detalle de la campaña que lanzamos el lunes? Puede que sea más tráfico de lo normal.' },
      { w: 'a', n: 'Carla Vargas · Soporte AlojamientoPlus', t: '08/10/2026 09:15', x: 'Sí, gracias, Diego. Confirmamos que el tráfico subió 3 veces. Aplicamos una mejora en la caché del listado de paquetes. Te avisamos hoy en la tarde cómo se comporta en el horario punta.' },
    ],
  },
  {
    id: 'TK-10455',
    subj: 'Agregar registro TXT para verificar Google Search Console',
    srv: 'DNS administrado',
    pri: 'media',
    st: 'Esperando tu respuesta',
    created: '03/10/2026 11:02',
    upd: '04/10/2026 15:30',
    msgs: [
      { w: 'c', n: 'Lucía Quispe', t: '03/10/2026 11:02', x: 'Necesito agregar un registro TXT con valor "google-site-verification=abc123xyz" en el dominio andestravel.pe por favor.' },
      { w: 'a', n: 'Carla Vargas · Soporte AlojamientoPlus', t: '04/10/2026 15:30', x: 'Registro TXT agregado correctamente con propagación de 300 segundos. ¿Podrías confirmarnos si Google ya te permite verificar la propiedad?' },
    ],
  },
];
