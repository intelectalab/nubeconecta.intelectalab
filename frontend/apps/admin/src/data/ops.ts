/**
 * Monitoreo, respaldos y costos (prototipo l.2830-2851). Datos estáticos.
 */
import { clients, NODES } from './db';
import { slug } from './format';
import type { BackupJob, Incident, Monitor, RestoreReq } from './types';

export const MONS: Monitor[] = (
  [
    ['Web andestravel.pe', 'HTTP', 'https://andestravel.pe', 'Operativo', 99.98, 412],
    ['Motor de reservas', 'HTTP', 'https://reservas.andestravel.pe/salud', 'Degradado', 99.21, 1840],
    ['BH-RES-01', 'Ping', '198.51.100.21', 'Operativo', 99.99, 38],
    ['BH-RES-02', 'Ping', '198.51.100.48', 'Operativo', 100, 41],
    ['VPS-AP-01', 'Puerto 2087 (WHM)', '203.0.113.14:2087', 'Operativo', 99.97, 52],
    ['VPS-AP-02', 'Puerto 2087 (WHM)', '203.0.113.52:2087', 'Operativo', 99.95, 61],
    ['VPS-SC-01', 'Ping', '203.0.113.131', 'Operativo', 99.9, 149],
    ['Correo SMTP BH-RES-02', 'Puerto 465', 'mail.bh-res-02:465', 'Operativo', 99.96, 88],
    ['Portal del cliente', 'HTTP', 'https://portal.nubeconecta.pe', 'Operativo', 99.99, 210],
    ['DNS ns1.nubeconecta.pe', 'DNS', 'ns1.nubeconecta.pe', 'Operativo', 100, 12],
    ['SSL andestravel.pe', 'SSL', 'vence en 12 días', 'Degradado', 100, 0],
    ['Tienda Textil Sumaq', 'HTTP', 'https://textilsumaq.pe', 'Caído', 97.4, 0],
  ] as [string, string, string, string, number, number][]
).map((m, k) => ({ id: 'MN' + k, n: m[0], type: m[1], t: m[2], st: m[3], up: m[4], ms: m[5], paused: false }));

export const INCS: Incident[] = [
  { id: 'IN-88', n: 'Tienda Textil Sumaq no responde (HTTP 503)', sev: 'critica', at: new Date(2026, 9, 8, 9, 52), st: 'Abierto' },
  { id: 'IN-87', n: 'Latencia alta en motor de reservas', sev: 'alta', at: new Date(2026, 9, 8, 7, 15), st: 'Abierto' },
  { id: 'IN-86', n: 'Backup nocturno fallido en BH-RES-01', sev: 'alta', at: new Date(2026, 9, 8, 2, 10), st: 'Abierto' },
  { id: 'IN-85', n: 'Pérdida de paquetes en VPS-SC-01', sev: 'media', at: new Date(2026, 9, 6, 22, 4), st: 'Resuelto', end: new Date(2026, 9, 6, 22, 41) },
];

export const BKS: BackupJob[] = NODES.map((n, k) => ({
  id: 'BK' + k, n: n.id, scope: 'Todas las cuentas cPanel', sch: 'Diario 02:00',
  last: n.id === 'BH-RES-01' ? 'Fallido' : n.id === 'VPS-AP-02' ? 'Incompleto' : 'Correcto',
  size: Math.round(n.disk[0] * 0.82) + ' GB', dest: 'AWS S3 · us-east-1', ret: '14 diarias · 4 semanales',
})).concat([{ id: 'BKx', n: 'VPS andestravel (Contabo)', scope: 'Snapshot completo', sch: 'Diario 03:30', last: 'Correcto', size: '61 GB', dest: 'Contabo Object Storage', ret: '7 diarias' }]);

export const RESTS: RestoreReq[] = [
  { id: 'RS-31', cid: 'CL-1001', acct: 'andestra', pt: new Date(2026, 9, 5, 2, 0), scope: 'Base de datos reservas_db', st: 'Solicitada', by: 'Cliente (portal)' },
  { id: 'RS-30', cid: clients[4].id, acct: slug(clients[4].name).slice(0, 8), pt: new Date(2026, 9, 7, 2, 0), scope: 'Archivos public_html', st: 'Aprobada', by: 'Ticket TK-26422' },
  { id: 'RS-29', cid: clients[11].id, acct: slug(clients[11].name).slice(0, 8), pt: new Date(2026, 9, 3, 2, 0), scope: 'Correo (3 buzones)', st: 'En curso', by: 'Cliente (portal)' },
  { id: 'RS-28', cid: clients[15].id, acct: slug(clients[15].name).slice(0, 8), pt: new Date(2026, 9, 1, 2, 0), scope: 'Cuenta completa', st: 'Completada', by: 'Ticket TK-26398' },
];

/** Proporción de costo por tipo de servicio (para reportes de rentabilidad). */
export const COSTR: Record<string, number> = { 'Hosting cPanel': 0.16, 'VPS administrado': 0.38, 'Google Workspace': 0.78, 'Microsoft 365': 0.8, CDN: 0.3, Mailing: 0.42, 'Certificado SSL': 0.35, 'Backup externo': 0.25, 'DNS administrado': 0.6, 'Hosting de correo': 0.12, 'Desarrollo y soporte': 0.45 };

/* ---------- Inicio: series del gráfico Facturado vs. cobrado (l.1554) ---------- */
export const MONTHS: Date[] = [];
for (let k = 11; k >= 0; k--) MONTHS.push(new Date(2026, 9 - k, 1));
export const BILLED = [48200, 49650, 51800, 50240, 52900, 54100, 55380, 56900, 57420, 59650, 61280, 38900];
export const COLL = [46800, 48420, 49100, 49870, 51260, 52010, 54320, 55180, 55860, 57210, 58440, 24110];
