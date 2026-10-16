import { useState } from 'react';
import { Icon } from '@hub/ui';
import './portal.css';

export default function App() {
  const [route, setRoute] = useState<'resumen' | 'servicios' | 'dominios' | 'facturas' | 'soporte' | 'respaldos'>('servicios');
  const [cur, setCur] = useState<'PEN' | 'USD'>('PEN');

  const navItems = [
    { id: 'resumen', label: 'Resumen', icon: 'home' },
    { id: 'servicios', label: 'Mis servicios', icon: 'server', badge: 1 },
    { id: 'dominios', label: 'Dominios', icon: 'globe' },
    { id: 'facturas', label: 'Facturas y pagos', icon: 'wallet', badge: 2 },
    { id: 'soporte', label: 'Soporte', icon: 'msg' },
    { id: 'respaldos', label: 'Respaldos', icon: 'archive' },
  ];

  const services = [
    {
      id: 's1',
      name: 'Web de turismo',
      plan: 'Hosting cPanel Pro',
      host: 'cpanel23.alojamientoplus.pe',
      proj: 'Web pública',
      status: 'Activo',
      stClass: 'ok',
      usage: [
        { label: 'Espacio en disco', used: '6.2 GB', total: '15 GB', pct: 41 },
        { label: 'Transferencia mensual', used: '48 GB', total: '200 GB', pct: 24 },
      ],
      price: cur === 'PEN' ? 'S/ 85.00/mes' : 'US$ 22.50/mes',
      renew: '14/11/2026',
    },
    {
      id: 's2',
      name: 'VPS Sistema Reservas',
      plan: 'VPS Cloud 4 vCPU / 8 GB RAM',
      host: 'vps02.alojamientoplus.pe',
      proj: 'Plataforma Core',
      status: 'Atención requerida',
      stClass: 'warn',
      usage: [
        { label: 'Uso de RAM', used: '7.1 GB', total: '8 GB', pct: 88 },
        { label: 'Disco NVMe', used: '85 GB', total: '120 GB', pct: 70 },
      ],
      price: cur === 'PEN' ? 'S/ 320.00/mes' : 'US$ 85.00/mes',
      renew: '02/12/2026',
    },
  ];

  const invoices = [
    { id: 'F001-00892', desc: 'Hosting cPanel Pro — Periodo Nov 2026', due: '14/11/2026', amt: cur === 'PEN' ? 'S/ 85.00' : 'US$ 22.50', status: 'Pendiente', stClass: 'warn' },
    { id: 'F001-00845', desc: 'VPS Cloud 4 vCPU — Periodo Nov 2026', due: '02/11/2026', amt: cur === 'PEN' ? 'S/ 320.00' : 'US$ 85.00', status: 'Vencida', stClass: 'danger' },
    { id: 'F001-00712', desc: 'Registro de Dominio andestravel.pe', due: '10/10/2026', amt: cur === 'PEN' ? 'S/ 110.00' : 'US$ 29.50', status: 'Pagada', stClass: 'ok' },
  ];

  return (
    <div className="app" id="app">
      {/* Topbar fiel al prototipo */}
      <header className="topbar" role="banner">
        <a className="logo" href="#resumen" onClick={() => setRoute('resumen')}>
          <svg viewBox="0 0 48 36" aria-hidden="true" style={{ width: 42, height: 32, flex: 'none' }}>
            <path d="M37.5 31H12.5a9 9 0 0 1-1.6-17.86A12 12 0 0 1 34 10.4a8.6 8.6 0 0 1 3.5 20.6z" fill="none" stroke="#5f9a32" strokeWidth="3.2" strokeLinejoin="round" />
            <path d="M25.6 9.5 17.8 21h6l-2.2 9.5L31 17.6h-6.2l2.6-8.1z" fill="#f2b71a" stroke="#f2b71a" strokeWidth="1" strokeLinejoin="round" />
          </svg>
          <b>Alojamiento<span>Plus</span></b>
          <em>Portal del cliente</em>
        </a>
        <span className="demo-badge">Datos de ejemplo</span>

        <div className="tb-spacer" style={{ flex: 1 }} />

        <select
          className="tb-cur"
          value={cur}
          onChange={(e) => setCur(e.target.value as 'PEN' | 'USD')}
          title="Moneda"
        >
          <option value="PEN">S/</option>
          <option value="USD">US$</option>
        </select>

        <button className="tb-btn" title="Notificaciones" aria-label="Notificaciones">
          <Icon name="bell" />
          <span className="tb-dot" />
        </button>

        <button className="tb-user" aria-label="Usuario">
          <span className="av" style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--brand-soft)', color: 'var(--brand-text)', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 12 }}>
            LQ
          </span>
          <span className="who" style={{ textAlign: 'left', lineHeight: 1.2 }}>
            <strong style={{ fontSize: 13, display: 'block' }}>Lucía Quispe</strong>
            <small style={{ color: 'var(--topbar-muted)', fontSize: 11 }}>Andes Travel SAC</small>
          </span>
        </button>
      </header>

      {/* Sidebar de navegación */}
      <nav className="sidebar" aria-label="Navegación principal">
        <div className="nav-group">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setRoute(item.id as any)}
              className={`nav-item ${route === item.id ? 'active' : ''}`}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '9px 12px',
                borderRadius: 8,
                background: route === item.id ? 'var(--hover)' : 'transparent',
                color: route === item.id ? 'var(--brand-text)' : 'var(--text)',
                fontWeight: route === item.id ? 600 : 500,
                border: 0,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <Icon name={item.icon} />
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.badge && (
                <span className={`chip sm ${item.badge > 1 ? 'warn' : 'info'}`} style={{ height: 18, fontSize: 11, padding: '0 6px' }}>
                  {item.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </nav>

      {/* Main Content */}
      <main className="main" id="main">
        <div className="page" style={{ padding: '24px 32px', maxWidth: 1180, margin: '0 auto' }}>
          {/* Breadcrumbs */}
          <div className="crumbs">
            <a href="#resumen" onClick={() => setRoute('resumen')}>Portal</a>
            <Icon name="cr" className="sm" />
            <span aria-current="page">{navItems.find((n) => n.id === route)?.label}</span>
          </div>

          {/* Page Head */}
          <div className="phead">
            <div>
              <h1>{navItems.find((n) => n.id === route)?.label}</h1>
              <p>
                {route === 'servicios' && 'Monitorea el estado, rendimiento y consumos de tus servicios contratados.'}
                {route === 'facturas' && `Paga tus comprobantes pendientes con tarjeta, PayPal o transferencia bancaria en ${cur === 'PEN' ? 'Soles (S/)' : 'Dólares (US$)'}.`}
                {route === 'soporte' && 'Centro de tickets y asistencia técnica prioritaria las 24 horas.'}
                {route === 'resumen' && 'Vista general de tu cuenta corporativa y accesos rápidos.'}
                {route === 'dominios' && 'Administración de DNS, vencimientos y titularidad de dominios.'}
                {route === 'respaldos' && 'Copias automáticas diarias de tus sitios, bases de datos y correos.'}
              </p>
            </div>
            {route === 'soporte' && (
              <button className="btn primary">
                <Icon name="plus" className="sm" /> Nuevo ticket
              </button>
            )}
          </div>

          {/* Vistas */}
          {route === 'servicios' && (
            <div style={{ display: 'grid', gap: 20 }}>
              <div className="svc-grid">
                {services.map((s) => (
                  <article key={s.id} className="card svc">
                    <div className="svc-h">
                      <div className="ico"><Icon name="server" /></div>
                      <div className="tt">
                        <b>{s.name}</b>
                        <small>{s.plan} • <span className="mono">{s.host}</span></small>
                      </div>
                      <span className={`chip ${s.stClass}`}>{s.status}</span>
                    </div>

                    <div style={{ display: 'grid', gap: 12, padding: '8px 0' }}>
                      {s.usage.map((u, i) => (
                        <div key={i}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--muted)', marginBottom: 4 }}>
                            <span>{u.label}</span>
                            <b>{u.used} / {u.total}</b>
                          </div>
                          <div style={{ height: 6, background: 'var(--surface-3)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ width: `${u.pct}%`, height: '100%', background: u.pct > 80 ? 'var(--warn)' : 'var(--brand)' }} />
                          </div>
                        </div>
                      ))}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                      <div>
                        <small style={{ color: 'var(--muted)', display: 'block', fontSize: 11 }}>Costo mensual</small>
                        <b className="num" style={{ fontSize: 14 }}>{s.price}</b>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn sm">Ingresar a cPanel</button>
                        <button className="btn sm primary">Detalles</button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}

          {route === 'facturas' && (
            <div className="card">
              <div className="card-h">
                <h2 className="sec">Facturas emitidas</h2>
                <span className="sub">Tipo de cambio referencial S/ 3.75</span>
              </div>
              <div className="tw" style={{ overflowX: 'auto' }}>
                <table className="t" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-2)', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '12px 16px' }}>Comprobante</th>
                      <th style={{ padding: '12px 16px' }}>Concepto</th>
                      <th style={{ padding: '12px 16px' }}>Vencimiento</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right' }}>Total</th>
                      <th style={{ padding: '12px 16px' }}>Estado</th>
                      <th style={{ padding: '12px 16px' }}>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv) => (
                      <tr key={inv.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '12px 16px', fontWeight: 600 }} className="mono">{inv.id}</td>
                        <td style={{ padding: '12px 16px' }}>{inv.desc}</td>
                        <td style={{ padding: '12px 16px' }}>{inv.due}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700 }} className="num">{inv.amt}</td>
                        <td style={{ padding: '12px 16px' }}><span className={`chip ${inv.stClass}`}>{inv.status}</span></td>
                        <td style={{ padding: '12px 16px' }}>
                          {inv.status !== 'Pagada' ? (
                            <button className="btn sm primary">Pagar ahora</button>
                          ) : (
                            <button className="btn sm ghost">Descargar PDF</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {route === 'soporte' && (
            <div className="card">
              <div className="card-h">
                <h2 className="sec">Tickets de atención</h2>
                <span className="sub">Tiempo promedio de respuesta: 18 minutos</span>
              </div>
              <div className="card-b" style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--muted)' }}>
                <Icon name="msg" className="lg" />
                <h3 style={{ margin: '12px 0 4px', color: 'var(--text)' }}>No tienes tickets pendientes</h3>
                <p style={{ margin: 0, fontSize: 13 }}>Si necesitas asistencia técnica, cambio de planes o restaurar copias de seguridad, abre un ticket.</p>
              </div>
            </div>
          )}

          {route === 'resumen' && (
            <div style={{ display: 'grid', gap: 20 }}>
              <div className="qa">
                <button onClick={() => setRoute('servicios')}>
                  <span className="ico"><Icon name="server" /></span>
                  <div><b>Servicios Activos</b><small>2 contratados</small></div>
                </button>
                <button onClick={() => setRoute('facturas')}>
                  <span className="ico"><Icon name="wallet" /></span>
                  <div><b>Por Pagar</b><small>2 comprobantes</small></div>
                </button>
                <button onClick={() => setRoute('dominios')}>
                  <span className="ico"><Icon name="globe" /></span>
                  <div><b>Dominios</b><small>1 registrado (.pe)</small></div>
                </button>
                <button onClick={() => setRoute('soporte')}>
                  <span className="ico"><Icon name="msg" /></span>
                  <div><b>Soporte 24/7</b><small>Sin incidencias</small></div>
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
