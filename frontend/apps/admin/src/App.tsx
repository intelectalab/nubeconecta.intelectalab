import { useState } from 'react';
import { Button, Card, CardHeader, CardBody, Badge } from '@hub/ui';

export default function App() {
  const [activeSection, setActiveSection] = useState<'noc' | 'crm' | 'tickets'>('noc');

  const nodes = [
    { id: 'VPS-AP-01', type: 'VPS Propio', ip: '198.51.100.12', accounts: '45/80', ram: '12/16 GB', status: 'OK' },
    { id: 'VPS-AP-02', type: 'VPS Propio', ip: '198.51.100.15', accounts: '78/80', ram: '15/16 GB', status: 'Alerta' },
    { id: 'BH-RES-01', type: 'Reseller Bana', ip: '192.0.2.88', accounts: '120/150', ram: 'N/A', status: 'En migración' },
  ];

  const leads = [
    { company: 'Inversiones del Sur SAC', value: 'S/ 450/mes', stage: 'Cotización enviada', channel: 'WhatsApp' },
    { company: 'Estudio Jurídico Lima', value: 'S/ 180/mes', stage: 'Contacto inicial', channel: 'Landing Page' },
    { company: 'Constructora Alfa', value: 'S/ 1,200/mes', stage: 'Negociación', channel: 'Referido' },
  ];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Topbar Admin */}
      <header
        style={{
          background: 'var(--topbar-2)',
          color: 'var(--topbar-ink)',
          height: 'var(--toph)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <strong style={{ fontSize: '18px', letterSpacing: '-0.02em' }}>AlojamientoPlus NOC</strong>
          <span style={{ opacity: 0.7, fontSize: '12px' }}>| Backoffice Operaciones</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Badge variant="ok">Todos los sistemas operativos</Badge>
          <span style={{ fontSize: '13px' }}>admin@alojamientoplus.pe</span>
        </div>
      </header>

      {/* Main Container */}
      <div style={{ display: 'flex', flex: 1 }}>
        {/* Sidebar Admin */}
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
            onClick={() => setActiveSection('noc')}
            style={{
              textAlign: 'left',
              padding: '10px 14px',
              borderRadius: '6px',
              background: activeSection === 'noc' ? 'var(--hover)' : 'transparent',
              color: activeSection === 'noc' ? 'var(--brand)' : 'var(--text)',
              fontWeight: activeSection === 'noc' ? 600 : 500,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Servidores e Infraestructura
          </button>
          <button
            onClick={() => setActiveSection('crm')}
            style={{
              textAlign: 'left',
              padding: '10px 14px',
              borderRadius: '6px',
              background: activeSection === 'crm' ? 'var(--hover)' : 'transparent',
              color: activeSection === 'crm' ? 'var(--brand)' : 'var(--text)',
              fontWeight: activeSection === 'crm' ? 600 : 500,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Embudo de Ventas (CRM)
          </button>
          <button
            onClick={() => setActiveSection('tickets')}
            style={{
              textAlign: 'left',
              padding: '10px 14px',
              borderRadius: '6px',
              background: activeSection === 'tickets' ? 'var(--hover)' : 'transparent',
              color: activeSection === 'tickets' ? 'var(--brand)' : 'var(--text)',
              fontWeight: activeSection === 'tickets' ? 600 : 500,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Mesa de Ayuda (SLA)
          </button>
        </aside>

        {/* Content */}
        <main style={{ flex: 1, padding: '28px 36px', maxWidth: '1200px' }}>
          {activeSection === 'noc' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                  <h1 style={{ margin: 0, fontSize: '22px' }}>Nodos y Servidores</h1>
                  <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: '13px' }}>
                    Capacidad, consumo y asignación de clientes por nodo.
                  </p>
                </div>
                <Button variant="primary">+ Agregar Servidor</Button>
              </div>

              <Card>
                <CardHeader title="Estado de Infraestructura" subtitle="Monitoreo en tiempo real" />
                <CardBody style={{ padding: 0 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px' }}>
                    <thead>
                      <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                        <th style={{ padding: '12px 18px' }}>Nodo</th>
                        <th style={{ padding: '12px 18px' }}>Tipo</th>
                        <th style={{ padding: '12px 18px' }}>IP</th>
                        <th style={{ padding: '12px 18px' }}>Cuentas</th>
                        <th style={{ padding: '12px 18px' }}>RAM</th>
                        <th style={{ padding: '12px 18px' }}>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {nodes.map((n) => (
                        <tr key={n.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '12px 18px', fontWeight: 600 }}>{n.id}</td>
                          <td style={{ padding: '12px 18px' }}>{n.type}</td>
                          <td style={{ padding: '12px 18px', fontFamily: 'var(--f-mono)' }}>{n.ip}</td>
                          <td style={{ padding: '12px 18px' }}>{n.accounts}</td>
                          <td style={{ padding: '12px 18px' }}>{n.ram}</td>
                          <td style={{ padding: '12px 18px' }}>
                            <Badge variant={n.status === 'OK' ? 'ok' : n.status === 'Alerta' ? 'danger' : 'warn'}>
                              {n.status}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardBody>
              </Card>
            </div>
          )}

          {activeSection === 'crm' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                  <h1 style={{ margin: 0, fontSize: '22px' }}>Embudo Comercial</h1>
                  <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: '13px' }}>
                    Oportunidades y prospectos clasificados por canal de adquisición.
                  </p>
                </div>
                <Button variant="primary">+ Nuevo Prospecto</Button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
                {leads.map((l, i) => (
                  <Card key={i}>
                    <CardHeader
                      title={l.company}
                      subtitle={l.channel}
                      action={<Badge variant="outline">{l.stage}</Badge>}
                    />
                    <CardBody>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '13px', color: 'var(--muted)' }}>Valor estimado:</span>
                        <strong style={{ fontSize: '16px', color: 'var(--brand-text)' }}>{l.value}</strong>
                      </div>
                    </CardBody>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {activeSection === 'tickets' && (
            <Card>
              <CardHeader title="Bandeja de Tickets y SLA" subtitle="Objetivo de primera respuesta: menos de 30 min" />
              <CardBody>
                <p style={{ margin: 0, color: 'var(--muted)' }}>No hay tickets con SLA vencido en este momento.</p>
              </CardBody>
            </Card>
          )}
        </main>
      </div>
    </div>
  );
}
