/**
 * Metadatos de rutas (equivalente a ROUTES y GROUPS del prototipo, l.1314-1344
 * y l.3516). Sin componentes para evitar dependencias circulares: el registro
 * con componentes está en ./routes.tsx.
 */
export type RouteId =
  | 'inicio' | 'kpi' | 'kpid' | 'clientes' | 'cliente' | 'dominios' | 'pedidos' | 'servicios' | 'tareas'
  | 'crm' | 'cotizaciones' | 'contratos' | 'catalogo'
  | 'cobranza' | 'facturas' | 'reportes'
  | 'tickets' | 'reclamos'
  | 'infra' | 'monitoreo' | 'proveedores' | 'cloud' | 'correo' | 'boveda'
  | 'wp'
  | 'ajustes' | 'apariencia' | 'plantillas' | 'seguridad' | 'roles';

export type GroupName = 'Operación' | 'Comercial' | 'Finanzas' | 'Soporte' | 'Infraestructura' | 'Web' | 'Configuración';

export interface RouteMeta {
  /** Título (menú, documento y cabecera) */
  t: string;
  /** Grupo del menú */
  g: GroupName;
  /** id de icono del prototipo (ver components/Icon) */
  ic: string;
  /** Ruta padre (se marca activa en el menú) */
  parent?: RouteId;
  /** No aparece en el menú ni en la paleta */
  hidden?: boolean;
}

export const GROUPS: GroupName[] = ['Operación', 'Comercial', 'Finanzas', 'Soporte', 'Infraestructura', 'Web', 'Configuración'];

export const ROUTE_META: Record<RouteId, RouteMeta> = {
  inicio: { t: 'Inicio', g: 'Operación', ic: 'home' },
  kpi: { t: 'Panel de indicadores', g: 'Operación', ic: 'gauge' },
  kpid: { t: 'Detalle de indicador', g: 'Operación', ic: 'gauge', parent: 'kpi', hidden: true },
  clientes: { t: 'Clientes', g: 'Operación', ic: 'users' },
  cliente: { t: 'Ficha del cliente', g: 'Operación', ic: 'user', parent: 'clientes', hidden: true },
  dominios: { t: 'Dominios', g: 'Operación', ic: 'globe' },
  pedidos: { t: 'Pedidos', g: 'Operación', ic: 'box' },
  servicios: { t: 'Servicios', g: 'Operación', ic: 'layers' },
  tareas: { t: 'Tareas', g: 'Operación', ic: 'tasks' },
  crm: { t: 'CRM', g: 'Comercial', ic: 'funnel' },
  cotizaciones: { t: 'Cotizaciones', g: 'Comercial', ic: 'receipt' },
  contratos: { t: 'Contratos', g: 'Comercial', ic: 'contract' },
  catalogo: { t: 'Catálogo de productos', g: 'Comercial', ic: 'tag' },
  cobranza: { t: 'Bandeja de cobranza', g: 'Finanzas', ic: 'wallet' },
  facturas: { t: 'Facturas y pagos', g: 'Finanzas', ic: 'file' },
  reportes: { t: 'Reportes', g: 'Finanzas', ic: 'chart' },
  tickets: { t: 'Tickets', g: 'Soporte', ic: 'msg' },
  reclamos: { t: 'Libro de Reclamaciones', g: 'Soporte', ic: 'book' },
  infra: { t: 'Nodos y migración', g: 'Infraestructura', ic: 'server' },
  monitoreo: { t: 'Monitoreo y respaldos', g: 'Infraestructura', ic: 'activity' },
  proveedores: { t: 'Proveedores', g: 'Infraestructura', ic: 'building' },
  cloud: { t: 'Cloud', g: 'Infraestructura', ic: 'cloud' },
  correo: { t: 'Correo y SSL', g: 'Infraestructura', ic: 'mail' },
  boveda: { t: 'Bóveda', g: 'Infraestructura', ic: 'key' },
  wp: { t: 'WordPress y shortcodes', g: 'Web', ic: 'browser' },
  ajustes: { t: 'Cobranza y SLA', g: 'Configuración', ic: 'sliders' },
  apariencia: { t: 'Apariencia', g: 'Configuración', ic: 'palette' },
  plantillas: { t: 'Plantillas de correo', g: 'Configuración', ic: 'mail' },
  seguridad: { t: 'Seguridad', g: 'Configuración', ic: 'lock' },
  roles: { t: 'Usuarios y roles', g: 'Configuración', ic: 'users' },
};

export const ROUTE_IDS = Object.keys(ROUTE_META) as RouteId[];
export const isRouteId = (r: string): r is RouteId => Object.prototype.hasOwnProperty.call(ROUTE_META, r);

/** Construye el hash de una ruta: href('cliente','CL-1001') => '#cliente/CL-1001'. */
export const href = (route: RouteId, param?: string | null): string => '#' + route + (param ? '/' + encodeURIComponent(param) : '');

/**
 * Interpreta location.hash. Admite '#ruta', '#ruta/param' y el alias del
 * prototipo '#kpi/<id>' (=> kpid). Devuelve null si la ruta no existe.
 */
export function parseHash(hash: string): { route: RouteId; param: string | null } | null {
  const raw = (hash || '').replace(/^#\/?/, '');
  if (!raw) return { route: 'inicio', param: null };
  const i = raw.indexOf('/');
  let r = i < 0 ? raw : raw.slice(0, i);
  let p: string | null = i < 0 ? null : raw.slice(i + 1);
  if (p !== null) {
    try {
      p = decodeURIComponent(p);
    } catch {
      /* deja el valor tal cual */
    }
    if (!p) p = null;
  }
  if (r === 'kpi' && p) r = 'kpid';
  if (!isRouteId(r)) return null;
  return { route: r, param: p };
}
