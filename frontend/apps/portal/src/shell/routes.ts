/**
 * Rutas del portal (demo y real) y navegación por hash (#facturas, #servicios…):
 * la ruta inicial sale del hash y cualquier cambio del hash cambia de pantalla.
 */
import { useCallback, useEffect, useState } from 'react';

export const ROUTES = [
  'resumen',
  'servicios',
  'servicio-detalle',
  'dominios',
  'facturas',
  'pagar',
  'soporte',
  'ayuda',
  'ticket-detalle',
  'respaldos',
  'contratos',
  'usuarios',
  'seguridad',
  'perfil',
] as const;
export type Route = (typeof ROUTES)[number];

/** Migas por ruta (las de detalle las resuelve cada modo con su dato). */
export const CRUMBS: Record<Route, string> = {
  resumen: 'Resumen',
  servicios: 'Mis servicios',
  'servicio-detalle': 'Detalle de servicio',
  dominios: 'Dominios',
  facturas: 'Facturas y pagos',
  pagar: 'Pagar facturas en línea',
  soporte: 'Centro de soporte',
  ayuda: 'Centro de ayuda',
  'ticket-detalle': 'Ticket',
  respaldos: 'Respaldos automáticos',
  contratos: 'Contratos y acuerdos legales',
  usuarios: 'Usuarios de la empresa',
  seguridad: 'Seguridad de la cuenta y 2FA',
  perfil: 'Datos de facturación fiscal',
};

/** Elemento del menú lateral que queda activo para cada ruta. */
export const NAV_OF: Record<Route, Route> = {
  resumen: 'resumen',
  servicios: 'servicios',
  'servicio-detalle': 'servicios',
  dominios: 'dominios',
  facturas: 'facturas',
  pagar: 'facturas',
  soporte: 'soporte',
  ayuda: 'ayuda',
  'ticket-detalle': 'soporte',
  respaldos: 'respaldos',
  contratos: 'contratos',
  usuarios: 'usuarios',
  seguridad: 'seguridad',
  perfil: 'perfil',
};

export interface NavItem {
  id: Route;
  label: string;
  icon: string;
  badge?: number;
  hot?: boolean;
}
export interface NavGroup {
  title: string;
  items: NavItem[];
}

/** Menú lateral agrupado; `badges` pone contadores por ruta (demo: avisos de ejemplo). */
export function navGroups(badges: Partial<Record<Route, number>> = {}): NavGroup[] {
  return [
    {
      title: 'Mi cuenta',
      items: [
        { id: 'resumen', label: 'Resumen', icon: 'home' },
        { id: 'servicios', label: 'Mis servicios', icon: 'server', badge: badges.servicios },
        { id: 'dominios', label: 'Dominios', icon: 'globe' },
        { id: 'respaldos', label: 'Respaldos', icon: 'archive' },
      ],
    },
    {
      title: 'Pagos y soporte',
      items: [
        { id: 'facturas', label: 'Facturas y pagos', icon: 'wallet', badge: badges.facturas, hot: true },
        { id: 'soporte', label: 'Centro de soporte', icon: 'msg' },
        { id: 'ayuda', label: 'Centro de ayuda', icon: 'book' },
      ],
    },
    {
      title: 'Mi empresa',
      items: [
        { id: 'contratos', label: 'Contratos y acuerdos', icon: 'contract' },
        { id: 'usuarios', label: 'Usuarios del equipo', icon: 'users' },
        { id: 'seguridad', label: 'Seguridad y 2FA', icon: 'shield' },
        { id: 'perfil', label: 'Datos fiscales (RUC)', icon: 'building' },
      ],
    },
  ];
}

export function routeFromHash(hash: string): Route {
  const h = hash.replace(/^#\/?/, '').split(/[?/]/)[0];
  return (ROUTES as readonly string[]).includes(h) ? (h as Route) : 'resumen';
}

/** Ruta sincronizada con `location.hash` (carga inicial, cambios de hash y botón atrás). */
export function useHashRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(() => routeFromHash(window.location.hash));
  useEffect(() => {
    const on = () => setRoute(routeFromHash(window.location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = useCallback((r: Route) => {
    setRoute(r);
    if (routeFromHash(window.location.hash) !== r) window.location.hash = r;
  }, []);
  return [route, go];
}
