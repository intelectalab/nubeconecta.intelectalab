/**
 * Datos del catálogo que porta la vista Catálogo (prototipo l.2279-2400 y l.3262):
 * productos genéricos por categoría (GENPROD), categorías personalizadas,
 * listas del asistente de servicio personalizado y servidores dedicados.
 */
import { CATS, HPLANS, VPLANS } from '../../../data';
import type { BrandId, Cur, HostingPlan, VpsPlan } from '../../../data';

export interface GenField {
  l: string;
  t: string;
  req: boolean;
  opts?: string;
}
export interface GenProduct {
  id: string;
  cat: string;
  name: string;
  sub: string;
  descHtml?: string;
  price: number;
  cur: Cur;
  cy: string;
  cost: number;
  prov: string;
  sale: 'online' | 'cotizacion';
  online: boolean;
  active: boolean;
  clients: number;
  brand: BrandId;
  fields: GenField[];
  tasks: string[];
  contract: boolean;
  tpl?: string;
  comp: string;
  compName?: string;
  sees: string[];
  custom?: boolean;
}

let gp = 0;
export function G(cat: string, name: string, sub: string, price: number, cy: string, cost: number, prov: string, sale: 'online' | 'cotizacion', clients: number, extra?: Partial<GenProduct>): GenProduct {
  return Object.assign(
    { id: 'PZ-' + String(++gp).padStart(3, '0'), cat, name, sub, price, cur: 'PEN' as Cur, cy, cost, prov, sale, online: sale === 'online', active: true, clients, brand: 'ap' as BrandId, fields: [], tasks: [], contract: false, comp: 'Otro', sees: ['Nombre', 'Precio', 'Estado'] },
    extra || {},
  );
}

export const GENPROD: GenProduct[] = [
  G('dedicado', 'Dedicado AMD Ryzen 12', '12 núcleos · 128 GB RAM · 2 × 1 TB NVMe', 1450, 'Mensual', 189, 'Contabo', 'cotizacion', 3, { comp: 'Servidor', contract: true }),
  G('dedicado', 'Dedicado Intel Xeon E-2388G', '8 núcleos · 64 GB RAM · 2 × 960 GB SSD', 980, 'Mensual', 129, 'Contabo', 'cotizacion', 2, { comp: 'Servidor', contract: true }),
  G('cloud', 'AWS gestionado', 'Administración + consumo facturado aparte', 350, 'Mensual', 0, 'AWS', 'cotizacion', 4, { comp: 'Servidor' }),
  G('cloud', 'Azure gestionado', 'Administración + consumo', 350, 'Mensual', 0, 'Azure', 'cotizacion', 1, { comp: 'Servidor' }),
  G('cloud', 'Google Cloud gestionado', 'Administración + consumo', 350, 'Mensual', 0, 'Google Cloud', 'cotizacion', 1, { comp: 'Servidor' }),
  G('cloud', 'IBM Cloud gestionado', 'Administración + consumo', 420, 'Mensual', 0, 'IBM Cloud', 'cotizacion', 1, { comp: 'Servidor' }),
  G('ssl', 'SSL DV estándar', '1 dominio · validación de dominio', 89, 'Anual', 8.9, 'Sectigo (vía Namecheap)', 'online', 41, { comp: 'Dominio' }),
  G('ssl', 'SSL Wildcard DV', 'Subdominios ilimitados', 290, 'Anual', 47, 'Sectigo (vía Namecheap)', 'online', 12, { comp: 'Dominio' }),
  G('ssl', 'SSL OV empresarial', 'Validación de organización', 690, 'Anual', 96, 'Sectigo (vía Namecheap)', 'cotizacion', 3, { comp: 'Dominio' }),
  G('correo', 'Correo cPanel 10 buzones', 'cPanel', 149, 'Anual', 6, 'BanaHosting (reseller)', 'online', 88, { comp: 'Correo' }),
  G('correo', 'Google Workspace Business Starter', 'Google Workspace · por usuario', 27, 'Mensual', 7.2, 'Google Workspace', 'online', 61, { comp: 'Correo' }),
  G('correo', 'Google Workspace Business Standard', 'Google Workspace · por usuario', 54, 'Mensual', 14.4, 'Google Workspace', 'online', 19, { comp: 'Correo' }),
  G('correo', 'Microsoft 365 Business Basic', 'Microsoft 365 · por usuario', 23, 'Mensual', 6, 'Microsoft 365', 'online', 37, { comp: 'Correo' }),
  G('correo', 'Microsoft 365 Business Standard', 'Microsoft 365 · por usuario', 47, 'Mensual', 12.5, 'Microsoft 365', 'online', 14, { comp: 'Correo' }),
  G('web', 'Web corporativa 5 secciones', 'WordPress + diseño a medida', 1800, 'Único', 0, 'Equipo interno', 'cotizacion', 22, { comp: 'Sitio web', contract: true, tasks: ['Brief y contenidos', 'Diseño', 'Maquetación', 'Revisión del cliente', 'Publicación'] }),
  G('web', 'Landing page', '1 página + formulario', 650, 'Único', 0, 'Equipo interno', 'online', 35, { comp: 'Sitio web', tasks: ['Brief', 'Diseño', 'Publicación'] }),
  G('tienda', 'Tienda WooCommerce básica', 'Hasta 50 productos + pasarela local', 3200, 'Único', 0, 'Equipo interno', 'cotizacion', 9, { comp: 'Sitio web', contract: true }),
  G('tienda', 'Tienda completa', '500 productos · pasarela · facturación electrónica', 5400, 'Único', 0, 'Equipo interno', 'cotizacion', 4, { comp: 'Sistema a medida', contract: true }),
  G('moodle', 'Moodle hosting 100 usuarios', 'Plataforma lista + copias diarias', 180, 'Mensual', 9.5, 'Contabo', 'online', 7, { comp: 'Sistema a medida' }),
  G('moodle', 'Moodle 500 usuarios', 'VPS dedicado para Moodle', 420, 'Mensual', 17, 'Contabo', 'cotizacion', 3, { comp: 'Sistema a medida' }),
  G('moodle', 'Implementación Moodle', 'Instalación, tema y matrícula inicial', 2500, 'Único', 0, 'Equipo interno', 'cotizacion', 5, { comp: 'Sistema a medida', contract: true }),
  G('licencias', 'Licencia cPanel Admin', '5 cuentas', 135, 'Mensual', 26.99, 'cPanel', 'online', 8, { comp: 'Servidor' }),
  G('licencias', 'Licencia CloudLinux', 'Por servidor', 75, 'Mensual', 13, 'CloudLinux', 'online', 5, { comp: 'Servidor' }),
  G('licencias', 'Imunify360', 'Seguridad del servidor', 89, 'Mensual', 16, 'CloudLinux', 'online', 5, { comp: 'Servidor' }),
  G('licencias', 'Windows Server Standard', 'Licencia SPLA por núcleo', 210, 'Mensual', 38, 'Microsoft', 'cotizacion', 2, { comp: 'Servidor' }),
  G('soporte', 'Mantenimiento WordPress', 'Actualizaciones + copias + 1 h de cambios', 150, 'Mensual', 0, 'Equipo interno', 'online', 46, { comp: 'Sitio web' }),
  G('soporte', 'Bolsa de 10 horas de soporte', 'Vigencia 3 meses', 900, 'Único', 0, 'Equipo interno', 'online', 12, { comp: 'Otro' }),
  G('desarrollo', 'Desarrollo a medida', 'Por hora de desarrollo', 95, 'Por hora', 0, 'Equipo interno', 'cotizacion', 6, { comp: 'Sistema a medida', contract: true }),
  G('desarrollo', 'Integración de facturación electrónica', 'API de comprobantes SUNAT', 2800, 'Único', 0, 'Equipo interno', 'cotizacion', 3, { comp: 'Sistema a medida', contract: true }),
  G('personalizados', 'Migración de correo asistida', 'Hasta 20 buzones', 390, 'Único', 0, 'Equipo interno', 'cotizacion', 11, {
    comp: 'Correo',
    fields: [
      { l: 'Servidor de origen', t: 'Texto', req: true },
      { l: 'N.° de buzones', t: 'Número', req: true },
      { l: 'Fecha de corte', t: 'Fecha', req: false },
    ],
    tasks: ['Inventario de buzones', 'Copia inicial', 'Corte de MX', 'Sincronización final'],
    contract: false,
    sees: ['Nombre', 'Precio', 'Estado', 'Progreso de entrega'],
  }),
  G('personalizados', 'Auditoría de seguridad web', 'Informe + recomendaciones', 1200, 'Único', 0, 'Equipo interno', 'cotizacion', 2, { comp: 'Sitio web', contract: true }),
];

/** Categorías creadas desde el asistente. */
export const CUSTOMCATS: { id: string; n: string; custom?: boolean }[] = [];
export const allCats = () => [...CATS, ...CUSTOMCATS];
export const catName = (id: string): string => (allCats().find((c) => c.id === id) || { n: id }).n;
/** Categorías con tabla propia (no genérica). */
export const LEGACY = ['hosting', 'reseller', 'vps', 'dominios', 'combos'];

export const FTYPES = ['Texto', 'Número', 'Lista', 'Fecha', 'Archivo', 'Casilla'];
export const COMPS = ['Servidor', 'Sitio web', 'Correo', 'Dominio', 'DNS', 'CDN', 'Sistema a medida', 'Otro'];
export const SEES = ['Nombre', 'Precio', 'Estado', 'Campos propios', 'Progreso de entrega', 'Documentos y contrato'];
export const WSTEPS = ['Identidad', 'Campos propios', 'Precio', 'Entrega y contrato', 'Mapa y cliente', 'Venta'];
export const WPROV: (string | [string, string])[] = [['', 'Ninguno'], 'Contabo', 'DigitalOcean', 'AWS', 'Azure', 'Google Cloud', 'IBM Cloud', 'BanaHosting', 'Bunny.net', 'Elastic Email', 'Google Workspace', 'Microsoft 365', 'Namecheap', 'Equipo interno'];

/** Servidores dedicados (l.3262). */
export const DEDI = [
  { id: 'DD1', name: 'Dedicado Ryzen 12', cpu: 12, ram: 128, disk: '2 × 1 TB NVMe', loc: 'Lauterbach, Alemania', pm: 1450 },
  { id: 'DD2', name: 'Dedicado Xeon E-2388G', cpu: 8, ram: 64, disk: '2 × 960 GB SSD', loc: 'St. Louis, EE.UU.', pm: 980 },
  { id: 'DD3', name: 'Dedicado Lima Edge', cpu: 6, ram: 32, disk: '2 × 480 GB SSD', loc: 'Lima, Perú', pm: 1190 },
];

export type AnyProduct = { kind: 'hp'; x: HostingPlan } | { kind: 'vp'; x: VpsPlan } | { kind: 'gp'; x: GenProduct };
/** Busca un producto en cualquier tabla del catálogo (prodById). */
export function prodById(id: string): AnyProduct | null {
  const h = HPLANS.find((p) => p.id === id);
  if (h) return { kind: 'hp', x: h };
  const v = VPLANS.find((p) => p.id === id);
  if (v) return { kind: 'vp', x: v };
  const g = GENPROD.find((p) => p.id === id);
  return g ? { kind: 'gp', x: g } : null;
}
