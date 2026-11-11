/**
 * Registro de rutas -> componente de vista. Cada vista vive en
 * src/views/pages/<Nombre>View.tsx con `export default function XView(props: ViewProps)`.
 * Se cargan con React.lazy (code-splitting por ruta).
 * Los metadatos (título, grupo, icono, padre, oculta) están en ./routeMeta.ts.
 */
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { RouteId } from './routeMeta';
const InicioView = lazy(() => import('../views/pages/InicioView'));
const KpiView = lazy(() => import('../views/pages/KpiView'));
const KpiDetalleView = lazy(() => import('../views/pages/KpiDetalleView'));
const ClientesView = lazy(() => import('../views/pages/ClientesView'));
const ClienteView = lazy(() => import('../views/pages/ClienteView'));
const DominiosView = lazy(() => import('../views/pages/DominiosView'));
const PedidosView = lazy(() => import('../views/pages/PedidosView'));
const ServiciosView = lazy(() => import('../views/pages/ServiciosView'));
const TareasView = lazy(() => import('../views/pages/TareasView'));
const CrmView = lazy(() => import('../views/pages/CrmView'));
const SolicitudesView = lazy(() => import('../views/pages/SolicitudesView'));
const CotizacionesView = lazy(() => import('../views/pages/CotizacionesView'));
const ContratosView = lazy(() => import('../views/pages/ContratosView'));
const CatalogoView = lazy(() => import('../views/pages/CatalogoView'));
const CobranzaView = lazy(() => import('../views/pages/CobranzaView'));
const FacturasView = lazy(() => import('../views/pages/FacturasView'));
const ReportesView = lazy(() => import('../views/pages/ReportesView'));
const TicketsView = lazy(() => import('../views/pages/TicketsView'));
const ReclamosView = lazy(() => import('../views/pages/ReclamosView'));
const AyudaView = lazy(() => import('../views/pages/AyudaView'));
const InfraView = lazy(() => import('../views/pages/InfraView'));
const MonitoreoView = lazy(() => import('../views/pages/MonitoreoView'));
const ProveedoresView = lazy(() => import('../views/pages/ProveedoresView'));
const CloudView = lazy(() => import('../views/pages/CloudView'));
const CorreoView = lazy(() => import('../views/pages/CorreoView'));
const BovedaView = lazy(() => import('../views/pages/BovedaView'));
const WpView = lazy(() => import('../views/pages/WpView'));
const AjustesView = lazy(() => import('../views/pages/AjustesView'));
const AparienciaView = lazy(() => import('../views/pages/AparienciaView'));
const AccesoPortalView = lazy(() => import('../views/pages/AccesoPortalView'));
const PlantillasView = lazy(() => import('../views/pages/PlantillasView'));
const SeguridadView = lazy(() => import('../views/pages/SeguridadView'));
const RolesView = lazy(() => import('../views/pages/RolesView'));

/** Props uniformes que recibe toda vista. */
export interface ViewProps {
  /** Ruta activa (p. ej. 'cliente') */
  route: RouteId;
  /**
   * Parámetro del hash tras la primera «/» (decodificado) o null.
   * '#cliente/CL-1001' => 'CL-1001' · '#kpid/mrr' (o '#kpi/mrr') => 'mrr'
   * '#wp/generador/hub_planes' => 'generador/hub_planes'
   */
  param: string | null;
}

/**
 * Cada vista se carga bajo demanda (React.lazy) para que el bundle inicial no
 * incluya las 29 pantallas; App.tsx envuelve la vista en <Suspense> con
 * <PageSkeleton /> como fallback.
 */
export const VIEWS: Record<RouteId, LazyExoticComponent<ComponentType<ViewProps>>> = {
  inicio: InicioView,
  kpi: KpiView,
  kpid: KpiDetalleView,
  clientes: ClientesView,
  cliente: ClienteView,
  dominios: DominiosView,
  pedidos: PedidosView,
  servicios: ServiciosView,
  tareas: TareasView,
  crm: CrmView,
  solicitudes: SolicitudesView,
  cotizaciones: CotizacionesView,
  contratos: ContratosView,
  catalogo: CatalogoView,
  cobranza: CobranzaView,
  facturas: FacturasView,
  reportes: ReportesView,
  tickets: TicketsView,
  reclamos: ReclamosView,
  ayuda: AyudaView,
  infra: InfraView,
  monitoreo: MonitoreoView,
  proveedores: ProveedoresView,
  cloud: CloudView,
  correo: CorreoView,
  boveda: BovedaView,
  wp: WpView,
  ajustes: AjustesView,
  apariencia: AparienciaView,
  'acceso-portal': AccesoPortalView,
  plantillas: PlantillasView,
  seguridad: SeguridadView,
  roles: RolesView,
};
