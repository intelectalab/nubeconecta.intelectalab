import { useState } from 'react';
import { Button, Card, CardHeader, CardBody, Badge } from '@hub/ui';

export default function App() {
  const [activeTab, setActiveTab] = useState<'servicios' | 'facturas' | 'soporte'>('servicios');

  const services = [
    { id: '1', name: 'Hosting Emprendedor', domain: 'midominio.com', plan: 'cPanel Cloud', status: 'Activo', renew: '14/11/2026', usage: '65%' },
    { id: '2', name: 'VPS Pro Linux', domain: 'vps.empresa.pe', plan: '4 vCPU / 8 GB RAM', status: 'Activo', renew: '01/12/2026', usage: '42%' },
    { id: '3', name: 'Dominio .pe', domain: 'midominio.pe', plan: 'Registro anual', status: 'Por vencer', renew: '20/10/2026', usage: 'N/A' },
  ];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Topbar */}
      <header
        style={{
          background: 'var(--topbar)',
          color: 'var(--topbar-ink)',
          height: 'var(--toph)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <strong style={{ fontSize: '18px', letterSpacing: '-0.02em' }}>AlojamientoPlus</strong>
          <span style={{ opacity: 0.7, fontSize: '12px' }}>| Portal de Clientes</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ fontSize: '13px' }}>cliente@empresa.com</span>
          <Button variant="ghost" size="sm" style={{ color: '#fff', border: '1px solid rgba(255,255,255,0.3)' }}>
            Cerrar sesión
          </Button>
        </div>
      </header>

      {/* Main Container */}
      <div style={{ display: 'flex', flex: 1 }}>
        {/* Navigation Sidebar */}
        <aside
          style={{
            width: 'var(--sidew)',
            background: 'var(--surface)',
            borderRight: '1px solid var(--border)',
            padding: '20px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          <button
            onClick={() => setActiveTab('servicios')}
            style={{
              textAlign: 'left',
              padding: '10px 14px',
              borderRadius: '6px',
              background: activeTab === 'servicios' ? 'var(--hover)' : 'transparent',
              color: activeTab === 'servicios' ? 'var(--brand)' : 'var(--text)',
              fontWeight: activeTab === 'servicios' ? 600 : 500,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Mis Servicios
          </button>
          <button
            onClick={() => setActiveTab('facturas')}
            style={{
              textAlign: 'left',
              padding: '10px 14px',
              borderRadius: '6px',
              background: activeTab === 'facturas' ? 'var(--hover)' : 'transparent',
              color: activeTab === 'facturas' ? 'var(--brand)' : 'var(--text)',
              fontWeight: activeTab === 'facturas' ? 600 : 500,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Facturas y Pagos
          </button>
          <button
            onClick={() => setActiveTab('soporte')}
            style={{
              textAlign: 'left',
              padding: '10px 14px',
              borderRadius: '6px',
              background: activeTab === 'soporte' ? 'var(--hover)' : 'transparent',
              color: activeTab === 'soporte' ? 'var(--brand)' : 'var(--text)',
              fontWeight: activeTab === 'soporte' ? 600 : 500,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Tickets de Soporte
          </button>
        </aside>

        {/* Content Area */}
        <main style={{ flex: 1, padding: '28px 36px', maxWidth: '1100px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: '22px' }}>
                {activeTab === 'servicios' && 'Mis Servicios Contratados'}
                {activeTab === 'facturas' && 'Facturación y Pagos'}
                {activeTab === 'soporte' && 'Centro de Ayuda y Tickets'}
              </h1>
              <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: '13px' }}>
                Monitoreo, consumo y renovación de tus servicios web.
              </p>
            </div>
            {activeTab === 'soporte' && <Button variant="primary">+ Nuevo Ticket</Button>}
          </div>

          {/* Service Cards Grid */}
          {activeTab === 'servicios' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
              {services.map((svc) => (
                <Card key={svc.id}>
                  <CardHeader
                    title={svc.name}
                    subtitle={svc.domain}
                    action={
                      <Badge variant={svc.status === 'Activo' ? 'ok' : 'warn'}>
                        {svc.status}
                      </Badge>
                    }
                  />
                  <CardBody>
                    <div style={{ display: 'grid', gap: '10px', fontSize: '13px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--muted)' }}>Plan:</span>
                        <b>{svc.plan}</b>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--muted)' }}>Próxima renovación:</span>
                        <span>{svc.renew}</span>
                      </div>
                      {svc.usage !== 'N/A' && (
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <span style={{ color: 'var(--muted)' }}>Uso de almacenamiento:</span>
                            <span>{svc.usage}</span>
                          </div>
                          <div style={{ height: '6px', background: 'var(--surface-3)', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ width: svc.usage, height: '100%', background: 'var(--brand)' }} />
                          </div>
                        </div>
                      )}
                      <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                        <Button variant="secondary" size="sm" style={{ flex: 1 }}>Ingresar a cPanel</Button>
                        <Button variant="ghost" size="sm">Detalles</Button>
                      </div>
                    </div>
                  </CardBody>
                </Card>
              ))}
            </div>
          )}

          {activeTab === 'facturas' && (
            <Card>
              <CardHeader title="Facturas pendientes de pago" subtitle="Puedes pagar en soles (PEN) o dólares (USD)" />
              <CardBody>
                <p style={{ margin: 0, color: 'var(--muted)' }}>No tienes facturas pendientes de pago al día de hoy.</p>
              </CardBody>
            </Card>
          )}

          {activeTab === 'soporte' && (
            <Card>
              <CardHeader title="Historial de consultas y reclamos" />
              <CardBody>
                <p style={{ margin: 0, color: 'var(--muted)' }}>No tienes tickets de soporte abiertos actualmente.</p>
              </CardBody>
            </Card>
          )}
        </main>
      </div>
    </div>
  );
}
