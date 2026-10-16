import { useState } from 'react';
import { Icon } from '@hub/ui';
import './admin.css';

export default function App() {
  const [activeTab, setActiveTab] = useState<'noc' | 'crm' | 'cobranza' | 'sla'>('noc');

  const nodes = [
    { id: 'VPS-AP-01', name: 'Nube Producción 01', type: 'VPS Propio (Hetzner)', ip: '198.51.100.12', accounts: '45 / 80', ram: '12 / 16 GB', status: 'OK', stClass: 'ok' },
    { id: 'VPS-AP-02', name: 'Nube Producción 02', type: 'VPS Propio (Contabo)', ip: '198.51.100.15', accounts: '78 / 80', ram: '15.2 / 16 GB', status: 'Carga Alta', stClass: 'warn' },
    { id: 'BH-RES-01', name: 'Reseller BanaHosting', type: 'Revendedor cPanel', ip: '192.0.2.88', accounts: '120 / 150', ram: 'N/A', status: 'En migración', stClass: 'info' },
  ];

  const leads = [
    { co: 'Inversiones del Sur SAC', prod: 'VPS Cloud 8GB + Soporte', val: 'S/ 450/mes', ch: 'WhatsApp', stage: 'Cotización', owner: 'Carlos R.' },
    { co: 'Estudio Jurídico Lima', prod: 'Hosting Corporativo cPanel', val: 'S/ 180/mes', ch: 'Landing', stage: 'Contacto inicial', owner: 'María P.' },
    { co: 'Constructora Alfa', prod: 'Infraestructura Dedicada', val: 'S/ 1,200/mes', ch: 'Referido', stage: 'Negociación', owner: 'Carlos R.' },
  ];

  const slas = [
    { pri: 'Crítica', fr: '15 min', res: '2 horas', h: '24/7', esc: 'NOC L3 Guardia', open: 0 },
    { pri: 'Alta', fr: '30 min', res: '6 horas', h: '24/7', esc: 'NOC L2 Especialista', open: 1 },
    { pri: 'Media', fr: '60 min', res: '24 horas', h: 'Hábil (L-V 9-18)', esc: 'Soporte General', open: 3 },
    { pri: 'Baja', fr: '120 min', res: '48 horas', h: 'Hábil (L-V 9-18)', esc: 'Soporte General', open: 0 },
  ];

  return (
    <div className="app" id="app">
      {/* Topbar Admin */}
      <header className="topbar" role="banner">
        <a className="logo" href="#dashboard">
          <svg viewBox="0 0 48 36" aria-hidden="true" style={{ width: 42, height: 32, flex: 'none' }}>
            <path d="M37.5 31H12.5a9 9 0 0 1-1.6-17.86A12 12 0 0 1 34 10.4a8.6 8.6 0 0 1 3.5 20.6z" fill="none" stroke="#4d82ff" strokeWidth="3.2" strokeLinejoin="round" />
            <path d="M25.6 9.5 17.8 21h6l-2.2 9.5L31 17.6h-6.2l2.6-8.1z" fill="#f2b71a" stroke="#f2b71a" strokeWidth="1" strokeLinejoin="round" />
          </svg>
          <b>Alojamiento<span>Plus</span></b>
          <em>Panel Administrativo</em>
        </a>

        <div className="tb-spacer" style={{ flex: 1 }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="chip ok"><Icon name="check" className="sm" /> Infraestructura Operativa</span>
          <span className="tb-user" style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>
            admin@alojamientoplus.pe
          </span>
        </div>
      </header>

      {/* Sidebar Admin */}
      <nav className="sidebar" aria-label="Navegación backoffice">
        <div className="nav-group">
          <button
            onClick={() => setActiveTab('noc')}
            className={`nav-item ${activeTab === 'noc' ? 'active' : ''}`}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, background: activeTab === 'noc' ? 'var(--hover)' : 'transparent', color: activeTab === 'noc' ? 'var(--brand-text)' : 'var(--text)', fontWeight: activeTab === 'noc' ? 600 : 500, border: 0, cursor: 'pointer', textAlign: 'left' }}
          >
            <Icon name="server" />
            <span>Servidores e Infraestructura</span>
          </button>
          <button
            onClick={() => setActiveTab('crm')}
            className={`nav-item ${activeTab === 'crm' ? 'active' : ''}`}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, background: activeTab === 'crm' ? 'var(--hover)' : 'transparent', color: activeTab === 'crm' ? 'var(--brand-text)' : 'var(--text)', fontWeight: activeTab === 'crm' ? 600 : 500, border: 0, cursor: 'pointer', textAlign: 'left' }}
          >
            <Icon name="funnel" />
            <span>Embudo Comercial (CRM)</span>
          </button>
          <button
            onClick={() => setActiveTab('cobranza')}
            className={`nav-item ${activeTab === 'cobranza' ? 'active' : ''}`}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, background: activeTab === 'cobranza' ? 'var(--hover)' : 'transparent', color: activeTab === 'cobranza' ? 'var(--brand-text)' : 'var(--text)', fontWeight: activeTab === 'cobranza' ? 600 : 500, border: 0, cursor: 'pointer', textAlign: 'left' }}
          >
            <Icon name="wallet" />
            <span>Secuencia de Cobranzas</span>
          </button>
          <button
            onClick={() => setActiveTab('sla')}
            className={`nav-item ${activeTab === 'sla' ? 'active' : ''}`}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, background: activeTab === 'sla' ? 'var(--hover)' : 'transparent', color: activeTab === 'sla' ? 'var(--brand-text)' : 'var(--text)', fontWeight: activeTab === 'sla' ? 600 : 500, border: 0, cursor: 'pointer', textAlign: 'left' }}
          >
            <Icon name="clock" />
            <span>Matriz de SLA y Soporte</span>
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <main className="main" id="main">
        <div className="page" style={{ padding: '24px 32px', maxWidth: 1240, margin: '0 auto' }}>
          {/* Header */}
          <div className="phead">
            <div>
              <h1>
                {activeTab === 'noc' && 'Infraestructura y Nodos de Servidores'}
                {activeTab === 'crm' && 'Embudo de Oportunidades y Leads'}
                {activeTab === 'cobranza' && 'Automatización de Avisos de Cobranza'}
                {activeTab === 'sla' && 'Políticas de SLA y Escalamiento'}
              </h1>
              <p>
                {activeTab === 'noc' && 'Monitoreo de recursos, nodos cPanel y migración en lotes.'}
                {activeTab === 'crm' && 'Seguimiento de prospectos clasificados por canal de adquisición.'}
                {activeTab === 'cobranza' && 'Secuencia administrable de suspensiones y recargos automáticos.'}
                {activeTab === 'sla' && 'Tiempos de primera respuesta y resolución por severidad.'}
              </p>
            </div>
            {activeTab === 'noc' && <button className="btn primary"><Icon name="plus" className="sm" /> Añadir Nodo</button>}
            {activeTab === 'crm' && <button className="btn primary"><Icon name="plus" className="sm" /> Nuevo Prospecto</button>}
          </div>

          {/* Vistas */}
          {activeTab === 'noc' && (
            <div style={{ display: 'grid', gap: 20 }}>
              <div className="card">
                <div className="card-h">
                  <h2 className="sec">Servidores en Producción</h2>
                  <span className="sub">3 nodos activos</span>
                </div>
                <div className="tw" style={{ overflowX: 'auto' }}>
                  <table className="t" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                        <th style={{ padding: '12px 16px' }}>Nodo</th>
                        <th style={{ padding: '12px 16px' }}>Nombre</th>
                        <th style={{ padding: '12px 16px' }}>Proveedor</th>
                        <th style={{ padding: '12px 16px' }}>IP Pública</th>
                        <th style={{ padding: '12px 16px' }}>Cuentas</th>
                        <th style={{ padding: '12px 16px' }}>RAM</th>
                        <th style={{ padding: '12px 16px' }}>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {nodes.map((n) => (
                        <tr key={n.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '12px 16px', fontWeight: 700 }} className="mono">{n.id}</td>
                          <td style={{ padding: '12px 16px', fontWeight: 600 }}>{n.name}</td>
                          <td style={{ padding: '12px 16px' }}>{n.type}</td>
                          <td style={{ padding: '12px 16px' }} className="mono">{n.ip}</td>
                          <td style={{ padding: '12px 16px' }} className="num">{n.accounts}</td>
                          <td style={{ padding: '12px 16px' }} className="num">{n.ram}</td>
                          <td style={{ padding: '12px 16px' }}><span className={`chip ${n.stClass}`}>{n.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'crm' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
              {leads.map((l, i) => (
                <div key={i} className="card" style={{ padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <b style={{ fontSize: 15 }}>{l.co}</b>
                    <span className="chip outline">{l.ch}</span>
                  </div>
                  <p style={{ margin: '0 0 12px', color: 'var(--muted)', fontSize: 13 }}>{l.prod}</p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>Responsable: <b>{l.owner}</b></span>
                    <strong className="num" style={{ color: 'var(--brand-text)', fontSize: 15 }}>{l.val}</strong>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'sla' && (
            <div className="card">
              <div className="card-h">
                <h2 className="sec">Matriz de Cumplimiento de SLA</h2>
              </div>
              <div className="tw" style={{ overflowX: 'auto' }}>
                <table className="t" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                      <th style={{ padding: '12px 16px' }}>Prioridad</th>
                      <th style={{ padding: '12px 16px' }}>1ra Respuesta</th>
                      <th style={{ padding: '12px 16px' }}>Resolución Máxima</th>
                      <th style={{ padding: '12px 16px' }}>Horario</th>
                      <th style={{ padding: '12px 16px' }}>Escalamiento</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right' }}>Tickets Abiertos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {slas.map((s, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '12px 16px', fontWeight: 600 }}>{s.pri}</td>
                        <td style={{ padding: '12px 16px' }} className="num">{s.fr}</td>
                        <td style={{ padding: '12px 16px' }} className="num">{s.res}</td>
                        <td style={{ padding: '12px 16px' }}>{s.h}</td>
                        <td style={{ padding: '12px 16px' }}>{s.esc}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700 }} className="num">{s.open}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'cobranza' && (
            <div className="card" style={{ padding: 20 }}>
              <h2 className="sec" style={{ marginBottom: 12 }}>Secuencia de Recordatorios y Cortes</h2>
              <p style={{ color: 'var(--muted)', fontSize: 13 }}>
                El motor de facturación envía avisos previos al vencimiento (-5 días, -1 día), aplica recargos automáticos al día +3 y suspende servicios al día +5 si no existe compromiso de pago registrado.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
