/**
 * Configuración: roles y permisos, seguridad y usuarios (prototipo l.1310 y l.2620-2657).
 */
import type { RoleDef, RoleName, SecurityPolicy, UserAccount } from './types';

/**
 * Matriz de acceso por rol a las rutas (null = acceso total).
 * Igual al prototipo; 'kpid' se agrega a los roles que tienen 'kpi' (l.3517).
 */
export const ROLES: Record<RoleName, string[] | null> = {
  Administrador: null,
  Ventas: ['inicio', 'kpi', 'clientes', 'cliente', 'dominios', 'crm', 'catalogo', 'wp', 'cotizaciones', 'contratos', 'pedidos', 'tareas'],
  Finanzas: ['inicio', 'kpi', 'plantillas', 'clientes', 'cliente', 'cobranza', 'facturas', 'ajustes', 'reportes', 'cotizaciones', 'contratos', 'proveedores', 'pedidos'],
  Soporte: ['inicio', 'kpi', 'plantillas', 'clientes', 'cliente', 'dominios', 'tickets', 'infra', 'reclamos', 'monitoreo', 'correo', 'cloud', 'boveda', 'tareas', 'pedidos'],
};
Object.values(ROLES).forEach((l) => {
  if (l && l.includes('kpi') && !l.includes('kpid')) l.push('kpid');
});
export const ROLE_NAMES = Object.keys(ROLES) as RoleName[];
export const roleAllows = (role: RoleName, route: string): boolean => {
  const l = ROLES[role];
  return !l || l.includes(route);
};

/* ---------- Seguridad ---------- */
export const SEC: SecurityPolicy = {
  minLen: 10, upper: true, num: true, sym: false, expire: 90, hist: 5, mfaMail: true, mfaApp: true,
  role: { Administrador: 'Obligatorio: solo app', Finanzas: 'Obligatorio: cualquier método', Ventas: 'Opcional', Soporte: 'Obligatorio: cualquier método' },
  type: { personal: 'Obligatorio', clientes: 'Opcional' },
  att: 5, lock: 15, sess: 8, trust: true, trustDays: 30,
};
export const MFAREQ = ['Opcional', 'Obligatorio: cualquier método', 'Obligatorio: solo app'];
/** Evalúa una contraseña contra la política (secCheck del prototipo). */
export function secCheck(p: string): { c: [boolean, string][]; sc: number; ok: boolean } {
  const c: [boolean, string][] = [[p.length >= SEC.minLen, `Al menos ${SEC.minLen} caracteres`]];
  if (SEC.upper) c.push([/[A-ZÁÉÍÓÚÑ]/.test(p) && /[a-záéíóúñ]/.test(p), 'Mayúsculas y minúsculas']);
  if (SEC.num) c.push([/\d/.test(p), 'Al menos un número']);
  if (SEC.sym) c.push([/[^A-Za-z0-9áéíóúñÁÉÍÓÚÑ]/.test(p), 'Al menos un símbolo']);
  c.push([!/(1234|qwerty|password|contraseña|alojamiento)/i.test(p), 'No es una contraseña común']);
  let sc = 0;
  if (p) {
    sc = Math.min(4, Math.floor(p.length / 4) + (/[A-Z]/.test(p) ? 1 : 0) + (/\d/.test(p) ? 1 : 0) + (/[^A-Za-z0-9]/.test(p) ? 1 : 0) - (c.every((x) => x[0]) ? 0 : 1));
    sc = Math.max(0, sc);
  }
  return { c, sc, ok: c.every((x) => x[0]) };
}

/* ---------- Usuarios y roles ---------- */
/** Módulos de permisos: [módulo, permiso especial ('' si no tiene)]. */
export const MODS: [string, string][] = [['Clientes', 'Ver datos sensibles'], ['Dominios', ''], ['Pedidos', ''], ['Tareas', ''], ['CRM', ''], ['Cotizaciones', 'Aprobar descuentos'], ['Contratos', ''], ['Catálogo', 'Cambiar precios'], ['Cobranza', 'Validar vouchers'], ['Facturas', 'Anular comprobantes'], ['Reportes', ''], ['Tickets', 'Ver notas internas'], ['Reclamos', ''], ['Infraestructura', ''], ['Proveedores', ''], ['Cloud', ''], ['Correo y SSL', ''], ['Monitoreo', ''], ['Bóveda', 'Revelar accesos'], ['WordPress', 'Regenerar tokens'], ['Configuración', ''], ['Seguridad y roles', '']];
export const ACTS2 = ['Ver', 'Crear', 'Editar', 'Eliminar', 'Aprobar', 'Exportar', 'Especial'];
export const RBASE: Record<string, string[]> = {
  Ventas: ['Clientes', 'Dominios', 'Pedidos', 'Tareas', 'CRM', 'Cotizaciones', 'Contratos', 'Catálogo', 'WordPress'],
  Finanzas: ['Clientes', 'Cobranza', 'Facturas', 'Reportes', 'Cotizaciones', 'Contratos', 'Proveedores', 'Pedidos'],
  Soporte: ['Clientes', 'Dominios', 'Tickets', 'Reclamos', 'Infraestructura', 'Monitoreo', 'Correo y SSL', 'Cloud', 'Bóveda', 'Tareas', 'Pedidos'],
};
export const RLS: RoleDef[] = [
  { id: 'Administrador', sys: true, desc: 'Acceso total. No editable.' },
  { id: 'Ventas', sys: true, desc: 'Comercial y clientes' },
  { id: 'Finanzas', sys: true, desc: 'Cobranza, facturación y reportes' },
  { id: 'Soporte', sys: true, desc: 'Tickets, infraestructura y bóveda' },
  { id: 'Supervisor de soporte', sys: false, desc: 'Soporte + aprobar restauraciones y revelar accesos' },
];
/** PERM[rol][módulo][acción] = true/false; null = acción no aplica. */
export const PERM: Record<string, Record<string, Record<string, boolean | null>>> = {};
export function permInit(r: string, base?: string[]): void {
  PERM[r] = {};
  MODS.forEach(([m, sp]) => {
    const on = r === 'Administrador' || (base || []).includes(m);
    PERM[r][m] = {};
    ACTS2.forEach((a) => {
      PERM[r][m][a] =
        a === 'Especial' && !sp
          ? null
          : r === 'Administrador'
            ? true
            : on && (a === 'Ver' || a === 'Crear' || a === 'Editar' || (a === 'Exportar' && r === 'Finanzas') || (a === 'Especial' && ((r === 'Finanzas' && m === 'Cobranza') || (r === 'Soporte' && m === 'Tickets'))));
    });
  });
}
permInit('Administrador');
Object.entries(RBASE).forEach(([r, b]) => permInit(r, b));
permInit('Supervisor de soporte', RBASE.Soporte);
['Bóveda', 'Monitoreo'].forEach((m) => {
  PERM['Supervisor de soporte'][m].Aprobar = true;
  PERM['Supervisor de soporte'][m].Especial = PERM['Supervisor de soporte'][m].Especial === null ? null : true;
});
export const USERS: UserAccount[] = (
  [
    ['Renzo Vargas', 'renzo.vargas@alojamientoplus.pe', 'Administrador', 'Activo', true, new Date(2026, 9, 8, 10, 24)],
    ['Rosa Mendoza', 'rosa.mendoza@alojamientoplus.pe', 'Finanzas', 'Activo', true, new Date(2026, 9, 8, 9, 2)],
    ['Lucía Paredes', 'lucia.paredes@alojamientoplus.pe', 'Ventas', 'Activo', false, new Date(2026, 9, 8, 9, 40)],
    ['Jorge Quispe', 'jorge.quispe@alojamientoplus.pe', 'Ventas', 'Activo', true, new Date(2026, 9, 7, 18, 11)],
    ['Valeria Ccori', 'valeria.ccori@servercreativo.com', 'Ventas', 'Activo', false, new Date(2026, 9, 6, 12, 5)],
    ['Carla Huamán', 'carla.huaman@alojamientoplus.pe', 'Supervisor de soporte', 'Activo', true, new Date(2026, 9, 8, 8, 1)],
    ['Diego Rojas', 'diego.rojas@alojamientoplus.pe', 'Soporte', 'Activo', true, new Date(2026, 9, 8, 7, 55)],
    ['Ana Salazar', 'ana.salazar@alojamientoplus.pe', 'Soporte', 'Activo', true, new Date(2026, 9, 8, 10, 2)],
    ['Miguel Torres', 'miguel.torres@alojamientoplus.pe', 'Soporte', 'Suspendido', false, new Date(2026, 8, 12, 16, 0)],
    ['Paola Linares', 'paola.linares@alojamientoplus.pe', 'Finanzas', 'Invitado', false, null],
  ] as [string, string, string, string, boolean, Date | null][]
).map((r) => ({ n: r[0], m: r[1], role: r[2], st: r[3], mfa: r[4], last: r[5] }));
/** Usuario de la sesión simulada. */
export const SESSION_USER = { name: 'Renzo Vargas', initials: 'RV', email: 'renzo.vargas@alojamientoplus.pe' };
/** Empresa emisora (un solo RUC para las 4 marcas). */
export const EMPRESA = { rs: 'Soluciones Digitales del Sur S.A.C. (datos de ejemplo)', ruc: '20000000001', dir: 'Av. José Larco 1232, of. 504, Miraflores, Lima' };
