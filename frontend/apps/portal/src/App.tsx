import { useState } from 'react';
import { Icon } from '@hub/ui';
import { CLIENT, PROJ, SRV, DOMS, INV, TK } from './data/portalData';
import { AssistantChat } from './components/AssistantChat';
import './portal.css';

export default function App() {
  const [route, setRoute] = useState<'resumen' | 'servicios' | 'servicio-detalle' | 'dominios' | 'facturas' | 'pagar' | 'soporte' | 'ticket-detalle' | 'respaldos'>('resumen');
  const [selectedServiceId, setSelectedServiceId] = useState<string>('sitio');
  const [selectedTicketId, setSelectedTicketId] = useState<string>('TK-10482');
  const [cur, setCur] = useState<'PEN' | 'USD'>('PEN');
  const [payStep, setPayStep] = useState<number>(1);
  const [selectedInvoices, setSelectedInvoices] = useState<string[]>(['E001-4498', 'E001-4521']);
  const [payMethod, setPayMethod] = useState<'card' | 'transfer' | 'paypal'>('card');
  const [voucherUploaded, setVoucherUploaded] = useState(false);
  const [newReply, setNewReply] = useState('');
  const [ticketsList, setTicketsList] = useState(TK);

  const TC = 3.75;
  const conv = (amt: number, from: 'PEN' | 'USD') => {
    if (cur === from) return amt;
    return cur === 'PEN' ? amt * TC : amt / TC;
  };
  const money = (amt: number, from: 'PEN' | 'USD') => {
    const val = conv(amt, from);
    return `${cur === 'PEN' ? 'S/' : 'US$'} ${val.toFixed(2)}`;
  };

  const navItems = [
    { id: 'resumen', label: 'Resumen', icon: 'home' },
    { id: 'servicios', label: 'Mis servicios', icon: 'server', badge: SRV.filter((s) => s.st === 'warn').length },
    { id: 'dominios', label: 'Dominios', icon: 'globe' },
    { id: 'facturas', label: 'Facturas y pagos', icon: 'wallet', badge: INV.filter((i) => i.st !== 'pagada').length },
    { id: 'soporte', label: 'Soporte', icon: 'msg' },
    { id: 'respaldos', label: 'Respaldos', icon: 'archive' },
  ];

  const selectedService = SRV.find((s) => s.id === selectedServiceId) || SRV[0];
  const selectedTicket = ticketsList.find((t) => t.id === selectedTicketId) || ticketsList[0];

  const totalToPay = INV
    .filter((i) => selectedInvoices.includes(i.id))
    .reduce((acc, curr) => acc + conv(curr.amt, curr.c), 0);

  const handleSendTicketReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReply.trim()) return;
    const msg = {
      w: 'c' as const,
      n: 'Lucía Quispe',
      t: 'Hoy 11:15',
      x: newReply,
    };
    setTicketsList((prev) =>
      prev.map((t) => (t.id === selectedTicketId ? { ...t, msgs: [...t.msgs, msg], upd: 'Hoy 11:15' } : t))
    );
    setNewReply('');
  };

  return (
    <div className="app" id="app">
      {/* Topbar oficial de AlojamientoPlus */}
      <header className="topbar" role="banner">
        <a className="logo" href="#resumen" onClick={(e) => { e.preventDefault(); setRoute('resumen'); }}>
          <svg viewBox="0 0 48 36" aria-hidden="true" style={{ width: 42, height: 32, flex: 'none' }}>
            <path d="M37.5 31H12.5a9 9 0 0 1-1.6-17.86A12 12 0 0 1 34 10.4a8.6 8.6 0 0 1 3.5 20.6z" fill="none" stroke="#5f9a32" strokeWidth="3.2" strokeLinejoin="round" />
            <path d="M25.6 9.5 17.8 21h6l-2.2 9.5L31 17.6h-6.2l2.6-8.1z" fill="#f2b71a" stroke="#f2b71a" strokeWidth="1" strokeLinejoin="round" />
          </svg>
          <b>Alojamiento<span>Plus</span></b>
          <em>Portal del cliente</em>
        </a>
        <span className="demo-badge">Datos en vivo</span>

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
            <small style={{ color: 'var(--topbar-muted)', fontSize: 11 }}>{CLIENT.name}</small>
          </span>
        </button>
      </header>

      {/* Sidebar de navegación */}
      <nav className="sidebar" aria-label="Navegación principal">
        <div className="nav-group">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                if (item.id === 'servicios') setRoute('servicios');
                else if (item.id === 'facturas') setRoute('facturas');
                else if (item.id === 'soporte') setRoute('soporte');
                else setRoute(item.id as any);
              }}
              className={`nav-item ${route.startsWith(item.id) ? 'active' : ''}`}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 14px',
                borderRadius: 8,
                background: route.startsWith(item.id) ? 'var(--hover)' : 'transparent',
                color: route.startsWith(item.id) ? 'var(--brand-text)' : 'var(--text)',
                fontWeight: route.startsWith(item.id) ? 600 : 500,
                border: 0,
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: '13.5px',
              }}
            >
              <Icon name={item.icon} />
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.badge ? (
                <span className={`chip sm ${item.id === 'facturas' ? 'warn' : 'info'}`} style={{ height: 18, fontSize: 11, padding: '0 6px' }}>
                  {item.badge}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="main" id="main">
        <div className="page" style={{ padding: '24px 36px', maxWidth: 1180, margin: '0 auto' }}>
          
          {/* Breadcrumbs */}
          <div className="crumbs">
            <a href="#resumen" onClick={(e) => { e.preventDefault(); setRoute('resumen'); }}>Portal</a>
            <Icon name="cr" className="sm" />
            <span aria-current="page">
              {route === 'resumen' && 'Resumen'}
              {route === 'servicios' && 'Mis servicios'}
              {route === 'servicio-detalle' && selectedService.name}
              {route === 'dominios' && 'Dominios'}
              {route === 'facturas' && 'Facturas y pagos'}
              {route === 'pagar' && 'Pagar facturas en línea'}
              {route === 'soporte' && 'Centro de soporte'}
              {route === 'ticket-detalle' && selectedTicket.id}
              {route === 'respaldos' && 'Respaldos automáticos'}
            </span>
          </div>

          {/* VISTA 1: RESUMEN / DASHBOARD */}
          {route === 'resumen' && (
            <div style={{ display: 'grid', gap: 24 }}>
              <div className="phead">
                <div>
                  <h1>Hola, Lucía Quispe</h1>
                  <p>Bienvenida al portal de autoservicio de {CLIENT.name}. RUC {CLIENT.ruc}.</p>
                </div>
                <button className="btn primary" onClick={() => { setPayStep(1); setRoute('pagar'); }}>
                  <Icon name="wallet" className="sm" /> Pagar pendientes ({money(totalToPay, cur)})
                </button>
              </div>

              {/* Accesos rápidos */}
              <div className="qa">
                <button onClick={() => setRoute('servicios')}>
                  <span className="ico"><Icon name="server" /></span>
                  <div><b>{SRV.length} Servicios Activos</b><small>cPanel, VPS y Correo</small></div>
                </button>
                <button onClick={() => setRoute('facturas')}>
                  <span className="ico" style={{ background: 'var(--warn-bg)', color: 'var(--warn-text)' }}><Icon name="wallet" /></span>
                  <div><b>Facturas por Pagar</b><small>1 vencida, 3 pendientes</small></div>
                </button>
                <button onClick={() => setRoute('dominios')}>
                  <span className="ico"><Icon name="globe" /></span>
                  <div><b>{DOMS.length} Dominios</b><small>.pe y .com vigentes</small></div>
                </button>
                <button onClick={() => setRoute('soporte')}>
                  <span className="ico"><Icon name="msg" /></span>
                  <div><b>Tickets de Atención</b><small>1 en atención activa</small></div>
                </button>
              </div>

              {/* Alerta de servicio requiriendo atención */}
              <div style={{ background: 'var(--warn-bg)', border: '1px solid var(--warn)', borderRadius: 10, padding: '14px 18px', display: 'flex', gap: 14, alignItems: 'center' }}>
                <span style={{ color: 'var(--warn-text)', display: 'grid', placeItems: 'center' }}><Icon name="tri" className="lg" /></span>
                <div style={{ flex: 1 }}>
                  <strong style={{ color: 'var(--warn-text)', fontSize: 14 }}>Atención requerida en tu Sistema de Reservas</strong>
                  <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--text-2)' }}>Picos de memoria en horario punta (ticket TK-10482 en curso). El equipo de soporte está optimizando la caché.</p>
                </div>
                <button className="btn sm" onClick={() => { setSelectedServiceId('reservas'); setRoute('servicio-detalle'); }}>Ver servicio</button>
              </div>

              {/* Tus ejecutivos asignados */}
              <div className="card">
                <div className="card-h">
                  <h2 className="sec"><Icon name="user" className="sm" /> Tu Ejecutiva de Cuenta</h2>
                  <span className="sub">Lunes a viernes 9:00 a 18:00</span>
                </div>
                <div className="card-b" style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong style={{ fontSize: 15 }}>{CLIENT.exec}</strong>
                    <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 13 }}>Atención corporativa personalizada, ampliación de planes y contratos anuales.</p>
                  </div>
                  <button className="btn primary sm" onClick={() => setRoute('soporte')}>Contactar por ticket</button>
                </div>
              </div>
            </div>
          )}

          {/* VISTA 2: MIS SERVICIOS (LISTA POR PROYECTOS) */}
          {route === 'servicios' && (
            <div style={{ display: 'grid', gap: 24 }}>
              <div className="phead">
                <div>
                  <h1>Mis Servicios Contratados</h1>
                  <p>Estado, recursos consumidos y renovación de tu infraestructura contratada.</p>
                </div>
              </div>

              {PROJ.map((p) => {
                const projectServices = SRV.filter((s) => s.proj === p.id);
                return (
                  <section key={p.id} className="proj">
                    <div className="proj-h">
                      <span className="ico"><Icon name={p.icon} /></span>
                      <div>
                        <h2>{p.name}</h2>
                        <small>{p.desc} • {projectServices.length} servicios</small>
                      </div>
                    </div>

                    <div className="svc-grid">
                      {projectServices.map((s) => (
                        <article key={s.id} className="card svc">
                          <div className="svc-h">
                            <div className="ico"><Icon name={s.icon} /></div>
                            <div className="tt">
                              <b>{s.name}</b>
                              <small>{s.plan} • <span className="mono">{s.host}</span></small>
                            </div>
                            <span className={`chip ${s.st}`}>{s.st === 'ok' ? 'Normal' : 'Atención'}</span>
                          </div>

                          <div style={{ display: 'grid', gap: 10, padding: '6px 0' }}>
                            {s.usage.slice(0, 2).map((u, i) => {
                              const pct = u.total ? Math.round((u.used / u.total) * 100) : u.used;
                              return (
                                <div key={i}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>
                                    <span>{u.label}</span>
                                    <b>{u.used} {u.total ? `/ ${u.total}` : ''} {u.unit}</b>
                                  </div>
                                  <div style={{ height: 6, background: 'var(--surface-3)', borderRadius: 3, overflow: 'hidden' }}>
                                    <div style={{ width: `${pct}%`, height: '100%', background: pct > 80 ? 'var(--warn)' : 'var(--brand)' }} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                            <div>
                              <small style={{ color: 'var(--muted)', fontSize: 11 }}>Precio pactado</small>
                              <b className="num" style={{ fontSize: 14, display: 'block' }}>{money(s.price[0], s.price[1])} /{s.price[2]}</b>
                            </div>
                            <div style={{ display: 'flex', gap: 6 }}>
                              {s.cpanel && <a href="https://cpanel23.alojamientoplus.pe" target="_blank" rel="noreferrer" className="btn sm">cPanel</a>}
                              <button className="btn sm primary" onClick={() => { setSelectedServiceId(s.id); setRoute('servicio-detalle'); }}>Detalles</button>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          )}

          {/* VISTA 3: DETALLE PROFUNDO DE UN SERVICIO */}
          {route === 'servicio-detalle' && (
            <div style={{ display: 'grid', gap: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
                <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                  <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--brand-soft)', color: 'var(--brand-text)', display: 'grid', placeItems: 'center' }}>
                    <Icon name={selectedService.icon} className="lg" />
                  </div>
                  <div>
                    <h1 style={{ fontSize: 24, margin: 0 }}>{selectedService.name}</h1>
                    <p style={{ margin: '4px 0 0', color: 'var(--muted)' }}>{selectedService.plan} • <span className="mono">{selectedService.host}</span></p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="btn ghost" onClick={() => setRoute('servicios')}>← Volver a lista</button>
                  {selectedService.cpanel && (
                    <button className="btn primary">
                      <Icon name="external" className="sm" /> Ingresar directo a cPanel
                    </button>
                  )}
                </div>
              </div>

              {selectedService.stNote && (
                <div style={{ background: 'var(--warn-bg)', border: '1px solid var(--warn)', borderRadius: 8, padding: '12px 16px', color: 'var(--warn-text)', fontSize: 13.5 }}>
                  <Icon name="tri" className="sm" /> {selectedService.stNote}
                </div>
              )}

              {/* Cuadrícula de detalles */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 18 }}>
                {/* Consumo de recursos */}
                <div className="card">
                  <div className="card-h">
                    <h2 className="sec"><Icon name="activity" className="sm" /> Consumo de Recursos</h2>
                    <span className="sub">Medición en vivo</span>
                  </div>
                  <div className="card-b" style={{ padding: '16px 20px', display: 'grid', gap: 16 }}>
                    {selectedService.usage.map((u, i) => {
                      const pct = u.total ? Math.round((u.used / u.total) * 100) : u.used;
                      return (
                        <div key={i}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                            <span>{u.label}</span>
                            <strong>{u.used} {u.total ? `de ${u.total}` : ''} {u.unit} ({pct}%)</strong>
                          </div>
                          <div style={{ height: 8, background: 'var(--surface-3)', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: pct > 80 ? 'var(--danger)' : pct > 60 ? 'var(--warn)' : 'var(--ok)' }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Características técnicas */}
                <div className="card">
                  <div className="card-h">
                    <h2 className="sec"><Icon name="sliders" className="sm" /> Características Técnicas</h2>
                  </div>
                  <div className="card-b" style={{ padding: '12px 20px' }}>
                    <dl style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '10px 12px', fontSize: 13.5, margin: 0 }}>
                      {selectedService.feats.map(([k, v], idx) => (
                        <div key={idx} style={{ display: 'contents' }}>
                          <dt style={{ color: 'var(--muted)', fontWeight: 500 }}>{k}</dt>
                          <dd style={{ margin: 0, fontWeight: 600 }}>{v}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </div>

                {/* Facturación y renovación */}
                <div className="card">
                  <div className="card-h">
                    <h2 className="sec"><Icon name="receipt" className="sm" /> Renovación y Plan</h2>
                  </div>
                  <div className="card-b" style={{ padding: '16px 20px', display: 'grid', gap: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--muted)' }}>Importe recurrente:</span>
                      <strong className="num" style={{ fontSize: 16 }}>{money(selectedService.price[0], selectedService.price[1])} /{selectedService.price[2]}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--muted)' }}>Próxima renovación:</span>
                      <span>{selectedService.renew || 'Junto con tu plan'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--muted)' }}>Estado comercial:</span>
                      <span className="chip ok">Al día</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VISTA 4: FACTURAS Y PAGOS */}
          {route === 'facturas' && (
            <div style={{ display: 'grid', gap: 20 }}>
              <div className="phead">
                <div>
                  <h1>Facturas y Pagos</h1>
                  <p>Consulta tus comprobantes emitidos, historial y realiza el pago de tus servicios en {cur === 'PEN' ? 'Soles (PEN)' : 'Dólares (USD)'}.</p>
                </div>
                <button className="btn primary" onClick={() => { setPayStep(1); setRoute('pagar'); }}>
                  <Icon name="card" className="sm" /> Pagar facturas pendientes
                </button>
              </div>

              <div className="card">
                <div className="card-h">
                  <h2 className="sec">Comprobantes Electrónicos</h2>
                  <span className="sub">RUC emisor: 20614587231 • Tipo de cambio S/ 3.75</span>
                </div>
                <div className="tw" style={{ overflowX: 'auto' }}>
                  <table className="t" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'var(--surface-2)', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                        <th style={{ padding: '12px 16px' }}>Factura</th>
                        <th style={{ padding: '12px 16px' }}>Emisión</th>
                        <th style={{ padding: '12px 16px' }}>Vencimiento</th>
                        <th style={{ padding: '12px 16px' }}>Descripción</th>
                        <th style={{ padding: '12px 16px', textAlign: 'right' }}>Total</th>
                        <th style={{ padding: '12px 16px' }}>Estado</th>
                        <th style={{ padding: '12px 16px', textAlign: 'center' }}>Comprobante</th>
                      </tr>
                    </thead>
                    <tbody>
                      {INV.map((i) => (
                        <tr key={i.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '12px 16px', fontWeight: 700 }} className="mono">{i.id}</td>
                          <td style={{ padding: '12px 16px' }}>{i.date}</td>
                          <td style={{ padding: '12px 16px' }}>{i.due}</td>
                          <td style={{ padding: '12px 16px' }}>{i.desc}</td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700 }} className="num">{money(i.amt, i.c)}</td>
                          <td style={{ padding: '12px 16px' }}>
                            <span className={`chip ${i.st === 'pagada' ? 'ok' : i.st === 'vencida' ? 'danger' : 'warn'}`}>
                              {i.st}
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                            <button className="btn sm ghost" title="Descargar PDF SUNAT">PDF</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* VISTA 5: PASARELA DE PAGO EN 3 PASOS */}
          {route === 'pagar' && (
            <div style={{ display: 'grid', gap: 20, maxWidth: 840, margin: '0 auto' }}>
              <div className="phead">
                <div>
                  <h1>Pagar Facturas</h1>
                  <p>Pasarela de pago segura en 3 pasos con soporte para tarjeta, PayPal y transferencia bancaria.</p>
                </div>
                <button className="btn ghost" onClick={() => setRoute('facturas')}>← Volver</button>
              </div>

              {/* Indicador de pasos */}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontWeight: payStep === 1 ? 700 : 500, color: payStep === 1 ? 'var(--brand)' : 'var(--muted)' }}>1. Elegir Facturas</span>
                <span style={{ fontWeight: payStep === 2 ? 700 : 500, color: payStep === 2 ? 'var(--brand)' : 'var(--muted)' }}>2. Método de Pago</span>
                <span style={{ fontWeight: payStep === 3 ? 700 : 500, color: payStep === 3 ? 'var(--brand)' : 'var(--muted)' }}>3. Confirmación</span>
              </div>

              {/* PASO 1: SELECCIONAR FACTURAS */}
              {payStep === 1 && (
                <div className="card">
                  <div className="card-h">
                    <h2 className="sec">Selecciona las facturas que deseas cancelar</h2>
                  </div>
                  <div className="card-b" style={{ padding: '16px 20px', display: 'grid', gap: 12 }}>
                    {INV.filter((i) => i.st !== 'pagada').map((inv) => (
                      <label key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', background: selectedInvoices.includes(inv.id) ? 'var(--hover)' : 'transparent' }}>
                        <input
                          type="checkbox"
                          checked={selectedInvoices.includes(inv.id)}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedInvoices([...selectedInvoices, inv.id]);
                            else setSelectedInvoices(selectedInvoices.filter((id) => id !== inv.id));
                          }}
                        />
                        <div style={{ flex: 1 }}>
                          <b className="mono">{inv.id}</b> — {inv.desc}
                          <small style={{ color: 'var(--muted)', display: 'block' }}>Vence el {inv.due}</small>
                        </div>
                        <strong className="num" style={{ fontSize: 15 }}>{money(inv.amt, inv.c)}</strong>
                      </label>
                    ))}

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '2px solid var(--border)', paddingTop: 16, marginTop: 8 }}>
                      <div>
                        <span style={{ color: 'var(--muted)' }}>Total a cancelar:</span>
                        <h2 className="num" style={{ margin: 0, color: 'var(--brand-text)' }}>{money(totalToPay, cur)}</h2>
                      </div>
                      <button
                        className="btn primary"
                        disabled={selectedInvoices.length === 0}
                        onClick={() => setPayStep(2)}
                      >
                        Continuar al Pago ({selectedInvoices.length}) →
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* PASO 2: MEDIO DE PAGO */}
              {payStep === 2 && (
                <div className="card">
                  <div className="card-h">
                    <h2 className="sec">Elige cómo deseas pagar</h2>
                    <span className="sub">Total: {money(totalToPay, cur)}</span>
                  </div>
                  <div className="card-b" style={{ padding: '20px', display: 'grid', gap: 16 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                      <button
                        type="button"
                        onClick={() => setPayMethod('card')}
                        className={`card ${payMethod === 'card' ? 'selected' : ''}`}
                        style={{ padding: 16, textAlign: 'center', cursor: 'pointer', border: payMethod === 'card' ? '2px solid var(--brand)' : '1px solid var(--border)', background: payMethod === 'card' ? 'var(--hover)' : 'var(--surface)' }}
                      >
                        <Icon name="card" className="lg" />
                        <b style={{ display: 'block', marginTop: 8 }}>Tarjeta de Crédito / Débito</b>
                        <small style={{ color: 'var(--muted)' }}>Visa, Mastercard, Amex</small>
                      </button>

                      <button
                        type="button"
                        onClick={() => setPayMethod('transfer')}
                        className={`card ${payMethod === 'transfer' ? 'selected' : ''}`}
                        style={{ padding: 16, textAlign: 'center', cursor: 'pointer', border: payMethod === 'transfer' ? '2px solid var(--brand)' : '1px solid var(--border)', background: payMethod === 'transfer' ? 'var(--hover)' : 'var(--surface)' }}
                      >
                        <Icon name="receipt" className="lg" />
                        <b style={{ display: 'block', marginTop: 8 }}>Transferencia Bancaria</b>
                        <small style={{ color: 'var(--muted)' }}>BCP, BBVA, Interbank</small>
                      </button>

                      <button
                        type="button"
                        onClick={() => setPayMethod('paypal')}
                        className={`card ${payMethod === 'paypal' ? 'selected' : ''}`}
                        style={{ padding: 16, textAlign: 'center', cursor: 'pointer', border: payMethod === 'paypal' ? '2px solid var(--brand)' : '1px solid var(--border)', background: payMethod === 'paypal' ? 'var(--hover)' : 'var(--surface)' }}
                      >
                        <Icon name="globe" className="lg" />
                        <b style={{ display: 'block', marginTop: 8 }}>PayPal</b>
                        <small style={{ color: 'var(--muted)' }}>Pagos internacionales USD</small>
                      </button>
                    </div>

                    {/* Detalle del método elegido */}
                    {payMethod === 'card' && (
                      <div style={{ background: 'var(--surface-2)', padding: 18, borderRadius: 8, display: 'grid', gap: 12 }}>
                        <div style={{ display: 'grid', gap: 4 }}>
                          <label style={{ fontSize: 12, fontWeight: 600 }}>Número de tarjeta</label>
                          <input type="text" placeholder="•••• •••• •••• ••••" style={{ height: 38, padding: '0 10px', borderRadius: 6, border: '1px solid var(--border-strong)' }} />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                          <div style={{ display: 'grid', gap: 4 }}>
                            <label style={{ fontSize: 12, fontWeight: 600 }}>Vencimiento (MM/AA)</label>
                            <input type="text" placeholder="MM/AA" style={{ height: 38, padding: '0 10px', borderRadius: 6, border: '1px solid var(--border-strong)' }} />
                          </div>
                          <div style={{ display: 'grid', gap: 4 }}>
                            <label style={{ fontSize: 12, fontWeight: 600 }}>Código CVV</label>
                            <input type="password" placeholder="•••" style={{ height: 38, padding: '0 10px', borderRadius: 6, border: '1px solid var(--border-strong)' }} />
                          </div>
                        </div>
                      </div>
                    )}

                    {payMethod === 'transfer' && (
                      <div style={{ background: 'var(--surface-2)', padding: 18, borderRadius: 8, display: 'grid', gap: 12 }}>
                        <p style={{ margin: 0, fontSize: 13 }}>Transfiere a nuestra cuenta corriente BCP en Soles: <b>193-982145-0-22</b> (CCI: 0021930098214502214) a nombre de <b>AlojamientoPlus S.A.C.</b></p>
                        <div style={{ border: '2px dashed var(--border-strong)', padding: 20, textAlign: 'center', borderRadius: 8, background: '#fff' }}>
                          <input
                            type="file"
                            id="voucherFile"
                            style={{ display: 'none' }}
                            onChange={() => setVoucherUploaded(true)}
                          />
                          <label htmlFor="voucherFile" style={{ cursor: 'pointer', display: 'grid', gap: 6 }}>
                            <Icon name="upload" className="lg" />
                            <b>{voucherUploaded ? '✅ Voucher adjuntado con éxito' : 'Haz clic aquí para subir la foto de tu voucher'}</b>
                            <small style={{ color: 'var(--muted)' }}>Formatos permitidos: JPG, PNG, PDF (máx. 5 MB)</small>
                          </label>
                        </div>
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
                      <button className="btn" onClick={() => setPayStep(1)}>← Modificar facturas</button>
                      <button className="btn primary" onClick={() => setPayStep(3)}>Procesar Pago ({money(totalToPay, cur)}) →</button>
                    </div>
                  </div>
                </div>
              )}

              {/* PASO 3: CONFIRMACIÓN DE PAGO */}
              {payStep === 3 && (
                <div className="card" style={{ padding: '40px 24px', textAlign: 'center' }}>
                  <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--ok-bg)', color: 'var(--ok-text)', display: 'grid', placeItems: 'center', margin: '0 auto 16px' }}>
                    <Icon name="check" className="lg" />
                  </div>
                  <h2 style={{ fontSize: 24, margin: '0 0 8px' }}>
                    {payMethod === 'transfer' ? '¡Voucher recibido con éxito!' : '¡Pago realizado con éxito!'}
                  </h2>
                  <p style={{ maxWidth: 480, margin: '0 auto 24px', color: 'var(--muted)', fontSize: 14 }}>
                    {payMethod === 'transfer'
                      ? 'El comprobante ha sido derivado al área de finanzas. Validaremos tu pago en un plazo máximo de 24 horas hábiles y te enviaremos la constancia por correo.'
                      : 'Tu transacción ha sido aprobada. Enviamos la constancia oficial de pago a facturacion@andestravel.pe. Tus servicios continúan activos sin interrupciones.'}
                  </p>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                    <button className="btn" onClick={() => setRoute('facturas')}>Ver mis facturas</button>
                    <button className="btn primary" onClick={() => setRoute('servicios')}>Ir a mis servicios</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* VISTA 6: DOMINIOS */}
          {route === 'dominios' && (
            <div style={{ display: 'grid', gap: 20 }}>
              <div className="phead">
                <div>
                  <h1>Mis Dominios</h1>
                  <p>Administración de zonas DNS, bloqueo de transferencia y fechas de expiración.</p>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 18 }}>
                {DOMS.map((d) => (
                  <article key={d.name} className="card" style={{ padding: 20, display: 'grid', gap: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <b style={{ fontSize: 18 }}>{d.name}</b>
                      <span className="chip ok">Activo</span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12.5 }}>
                      <div>
                        <span style={{ color: 'var(--muted)', display: 'block' }}>Vence el:</span>
                        <b>{d.exp}</b>
                      </div>
                      <div>
                        <span style={{ color: 'var(--muted)', display: 'block' }}>Autorenovación:</span>
                        <b>{d.auto ? 'Activada' : 'Manual'}</b>
                      </div>
                      <div style={{ gridColumn: 'span 2' }}>
                        <span style={{ color: 'var(--muted)', display: 'block' }}>Servidores DNS:</span>
                        <span className="mono" style={{ fontSize: 12 }}>{d.ns}</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                      <span className="num" style={{ fontWeight: 700 }}>{money(d.price[0], d.price[1])} /año</span>
                      <button className="btn sm">Gestionar DNS</button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}

          {/* VISTA 7: SOPORTE Y TICKETS */}
          {route === 'soporte' && (
            <div style={{ display: 'grid', gap: 20 }}>
              <div className="phead">
                <div>
                  <h1>Soporte Técnico</h1>
                  <p>Atención de consultas, incidencias y solicitudes con respuesta en horario hábil y emergencias 24/7.</p>
                </div>
                <button className="btn primary" onClick={() => alert('Modal para abrir ticket')}>+ Crear Ticket</button>
              </div>

              <div className="card">
                <div className="card-h">
                  <h2 className="sec">Tickets Registrados</h2>
                  <span className="sub">{ticketsList.length} tickets en historial</span>
                </div>
                <div className="tw" style={{ overflowX: 'auto' }}>
                  <table className="t" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'var(--surface-2)', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                        <th style={{ padding: '12px 16px' }}>Código</th>
                        <th style={{ padding: '12px 16px' }}>Asunto</th>
                        <th style={{ padding: '12px 16px' }}>Servicio</th>
                        <th style={{ padding: '12px 16px' }}>Prioridad</th>
                        <th style={{ padding: '12px 16px' }}>Última Actividad</th>
                        <th style={{ padding: '12px 16px' }}>Estado</th>
                        <th style={{ padding: '12px 16px' }}>Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ticketsList.map((t) => (
                        <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '12px 16px', fontWeight: 700 }} className="mono">{t.id}</td>
                          <td style={{ padding: '12px 16px', fontWeight: 600 }}>{t.subj}</td>
                          <td style={{ padding: '12px 16px' }}>{t.srv}</td>
                          <td style={{ padding: '12px 16px' }}>
                            <span className={`chip ${t.pri === 'alta' ? 'danger' : 'info'}`}>{t.pri}</span>
                          </td>
                          <td style={{ padding: '12px 16px' }}>{t.upd}</td>
                          <td style={{ padding: '12px 16px' }}>
                            <span className={`chip ${t.st === 'En atención' ? 'warn' : 'ok'}`}>{t.st}</span>
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <button className="btn sm primary" onClick={() => { setSelectedTicketId(t.id); setRoute('ticket-detalle'); }}>Ver conversación</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* VISTA 8: HILO DE CONVERSACIÓN DE UN TICKET */}
          {route === 'ticket-detalle' && (
            <div style={{ display: 'grid', gap: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <h1 style={{ fontSize: 22, margin: 0 }}>{selectedTicket.subj}</h1>
                  <p style={{ margin: '4px 0 0', color: 'var(--muted)' }}><span className="mono">{selectedTicket.id}</span> • {selectedTicket.srv} • Abierto el {selectedTicket.created}</p>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="btn ghost" onClick={() => setRoute('soporte')}>← Volver a tickets</button>
                  <span className="chip warn">{selectedTicket.st}</span>
                </div>
              </div>

              {/* Hilo de mensajes */}
              <div className="card">
                <div className="card-h">
                  <h2 className="sec">Mensajes e Historial</h2>
                </div>
                <div className="card-b" style={{ padding: '20px', display: 'grid', gap: 18 }}>
                  {selectedTicket.msgs.map((m, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '14px 18px',
                        borderRadius: 10,
                        background: m.w === 'a' ? 'var(--hover)' : 'var(--surface-2)',
                        border: '1px solid var(--border)',
                        marginLeft: m.w === 'a' ? '24px' : '0',
                        marginRight: m.w === 'c' ? '24px' : '0',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <strong style={{ color: m.w === 'a' ? 'var(--brand-text)' : 'var(--text)' }}>{m.n}</strong>
                        <small style={{ color: 'var(--muted)' }}>{m.t}</small>
                      </div>
                      <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5 }}>{m.x}</p>
                      {m.files && (
                        <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                          {m.files.map((f, i) => (
                            <span key={i} className="chip outline" style={{ fontSize: 11 }}>📎 {f}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Formulario de respuesta */}
                  <form onSubmit={handleSendTicketReply} style={{ borderTop: '1px solid var(--border)', paddingTop: 16, display: 'grid', gap: 12 }}>
                    <label style={{ fontWeight: 600, fontSize: 13 }}>Escribir respuesta al equipo técnico:</label>
                    <textarea
                      rows={3}
                      value={newReply}
                      onChange={(e) => setNewReply(e.target.value)}
                      placeholder="Agrega información adicional o responde a la consulta del agente..."
                      style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-strong)', fontSize: 13.5, fontFamily: 'inherit' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                      <button type="submit" className="btn primary">Enviar mensaje</button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          )}

          {/* VISTA 9: RESPALDOS AUTOMÁTICOS */}
          {route === 'respaldos' && (
            <div style={{ display: 'grid', gap: 20 }}>
              <div className="phead">
                <div>
                  <h1>Copias de Seguridad (Respaldos)</h1>
                  <p>Copias automáticas diarias de tus sitios web, bases de datos PostgreSQL/MySQL y cuentas de correo.</p>
                </div>
                <button className="btn primary" onClick={() => alert('Solicitud enviada a soporte')}>
                  <Icon name="restore" className="sm" /> Solicitar Restauración Asistida
                </button>
              </div>

              <div className="card">
                <div className="card-h">
                  <h2 className="sec"><Icon name="archive" className="sm" /> Respaldos de los Últimos 14 Días</h2>
                  <span className="sub">Todos los respaldos verificados e íntegros</span>
                </div>
                <div className="card-b" style={{ padding: '20px', display: 'grid', gap: 12 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
                    <div style={{ padding: 14, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface-2)' }}>
                      <b style={{ display: 'block' }}>Sitio web andestravel.pe</b>
                      <small style={{ color: 'var(--muted)' }}>Último respaldo: Hoy 03:00 AM</small>
                      <div style={{ marginTop: 8 }}><span className="chip ok">Exitoso (3.2 GB)</span></div>
                    </div>
                    <div style={{ padding: 14, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface-2)' }}>
                      <b style={{ display: 'block' }}>Base de datos Reservas</b>
                      <small style={{ color: 'var(--muted)' }}>Último respaldo: Hoy 06:00 AM</small>
                      <div style={{ marginTop: 8 }}><span className="chip ok">Exitoso (420 MB)</span></div>
                    </div>
                    <div style={{ padding: 14, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface-2)' }}>
                      <b style={{ display: 'block' }}>Buzones de Correo (30)</b>
                      <small style={{ color: 'var(--muted)' }}>Último respaldo: Ayer 23:00 PM</small>
                      <div style={{ marginTop: 8 }}><span className="chip ok">Exitoso (18.6 GB)</span></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </main>

      {/* Widget flotante del Asistente IA */}
      <AssistantChat />
    </div>
  );
}
