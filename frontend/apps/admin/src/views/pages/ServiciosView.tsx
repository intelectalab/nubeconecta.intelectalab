/**
 * Vista «servicios» (#servicios[/<uuid>]) — servicios contratados (M-SRV, franja MVP).
 * Con backend usa la API real (servicios/ServiceList); en modo demo (VITE_DEMO=1)
 * no hay datos de servicios fuera de la ficha del cliente.
 */
import type { ViewProps } from '../../app/routes';
import { EmptyState, PageHead } from '../../components/ui';
import { LIVE } from './clientes/shared';
import ServiceList from './servicios/ServiceList';

export default function ServiciosView({ param }: ViewProps) {
  if (LIVE) return <ServiceList param={param} />;
  return (
    <>
      <PageHead crumbs={[['Operación', 'servicios'], ['Servicios']]} title="Servicios" sub="Servicios contratados por los clientes." />
      <section className="card">
        <EmptyState title="Modo demostración" text="Los servicios de ejemplo se ven en la ficha de cada cliente (pestaña Servicios)." />
      </section>
    </>
  );
}
