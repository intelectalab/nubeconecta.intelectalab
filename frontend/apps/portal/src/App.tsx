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
  const [invFilter, setInvFilter] = useState<'pend' | 'paid' | 'all'>('pend');
  const [tkFilter, setTkFilter] = useState<'abiertos' | 'cerrados' | 'todos'>('abiertos');

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
        <div className="acct">
          <div className="ico"><Icon name="building" /></div>
          <div style={{ minWidth: 0, overflow: 'hidden' }}>
            <b style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{CLIENT.name}</b>
            <small>RUC {CLIENT.ruc}</small>
          </div>
        </div>

        <div className="nav-title">Módulos</div>
        <div style={{ display: 'grid', gap: 2 }}>
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
              style={{ width: '100%', border: 0, cursor: 'pointer', textAlign: 'left', font: 'inherit' }}
            >
              <Icon name={item.icon} />
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.badge ? (
                <span className={`cnt ${item.id === 'facturas' ? 'hot' : ''}`}>
                  {item.badge}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="main" id="main">
        <div className="page">
          
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
          {route === 'facturas' && (() => {
            const filteredInvoices = INV.filter((i) => {
              if (invFilter === 'pend') return i.st !== 'pagada';
              if (invFilter === 'paid') return i.st === 'pagada';
              return true;
            });
            const pendCount = INV.filter((i) => i.st !== 'pagada').length;
            const paidCount = INV.filter((i) => i.st === 'pagada').length;

            return (
              <div style={{ display: 'grid', gap: 20 }}>
                <div className="phead" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    <h1>Facturas y Pagos</h1>
                    <p className="lead">Paga una o varias facturas a la vez con tarjeta, PayPal o transferencia bancaria. Comprobantes oficiales SUNAT.</p>
                  </div>
                  {pendCount > 0 && (
                    <button className="btn primary" onClick={() => { setPayStep(1); setRoute('pagar'); }}>
                      <Icon name="card" className="sm" /> Pagar facturas pendientes ({pendCount})
                    </button>
                  )}
                </div>

                <div className="card">
                  <div className="toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                    <div className="seg" role="group" aria-label="Filtrar facturas">
                      <button
                        type="button"
                        aria-pressed={invFilter === 'pend'}
                        onClick={() => setInvFilter('pend')}
                      >
                        Por pagar <span className="num">({pendCount})</span>
                      </button>
                      <button
                        type="button"
                        aria-pressed={invFilter === 'paid'}
                        onClick={() => setInvFilter('paid')}
                      >
                        Pagadas <span className="num">({paidCount})</span>
                      </button>
                      <button
                        type="button"
                        aria-pressed={invFilter === 'all'}
                        onClick={() => setInvFilter('all')}
                      >
                        Todas <span className="num">({INV.length})</span>
                      </button>
                    </div>

                    <span className="sub" style={{ fontSize: 12, color: 'var(--muted)' }}>
                      RUC emisor: 20614587231 • Tipo de cambio referencial S/ {TC}
                    </span>
                  </div>

                  <div className="tw">
                    <table className="t">
                      <thead>
                        <tr>
                          <th style={{ width: 44, textAlign: 'center' }}>
                            <span className="sr-only">Sel</span>
                          </th>
                          <th>Comprobante</th>
                          <th>Emisión</th>
                          <th>Vencimiento</th>
                          <th>Descripción</th>
                          <th className="r">Total</th>
                          <th>Estado</th>
                          <th className="r">Acción</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredInvoices.map((i) => {
                          const isPayable = i.st !== 'pagada';
                          const isSelected = selectedInvoices.includes(i.id);
                          return (
                            <tr key={i.id}>
                              <td style={{ textAlign: 'center' }}>
                                {isPayable ? (
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={(e) => {
                                      if (e.target.checked) setSelectedInvoices([...selectedInvoices, i.id]);
                                      else setSelectedInvoices(selectedInvoices.filter((id) => id !== i.id));
                                    }}
                                    aria-label={`Seleccionar ${i.id}`}
                                  />
                                ) : (
                                  <span style={{ color: 'var(--muted)' }}>—</span>
                                )}
                              </td>
                              <td className="nw mono" style={{ fontWeight: 700 }}>{i.id}</td>
                              <td className="num">{i.date}</td>
                              <td className="num">{i.due}</td>
                              <td>{i.desc}</td>
                              <td className="r num" style={{ fontWeight: 700 }}>{money(i.amt, i.c)}</td>
                              <td>
                                <span className={`chip ${i.st === 'pagada' ? 'ok' : i.st === 'vencida' ? 'danger' : 'warn'}`}>
                                  {i.st}
                                </span>
                              </td>
                              <td className="r nw">
                                <div style={{ display: 'inline-flex', gap: 6 }}>
                                  <button
                                    className="btn sm ghost"
                                    title="Descargar comprobante PDF"
                                    onClick={() => alert(`Descargando comprobante ${i.id} en formato PDF oficial SUNAT`)}
                                  >
                                    PDF
                                  </button>
                                  {isPayable && (
                                    <button
                                      className="btn sm primary"
                                      onClick={() => {
                                        setSelectedInvoices([i.id]);
                                        setPayStep(2);
                                        setRoute('pagar');
                                      }}
                                    >
                                      Pagar
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Barra flotante inferior de pago si hay pendientes seleccionadas */}
                  {selectedInvoices.length > 0 && pendCount > 0 && (
                    <div className="paybar">
                      <div className="sum">
                        <small>{selectedInvoices.length} {selectedInvoices.length === 1 ? 'factura seleccionada' : 'facturas seleccionadas'}</small>
                        <b>{money(totalToPay, cur)}</b>
                      </div>
                      <button
                        className="btn primary lg"
                        onClick={() => {
                          setPayStep(2);
                          setRoute('pagar');
                        }}
                      >
                        <Icon name="card" className="sm" /> Pagar seleccionadas ({money(totalToPay, cur)})
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* VISTA 5: PASARELA DE PAGO EN 3 PASOS */}
          {route === 'pagar' && (
            <div style={{ display: 'grid', gap: 20 }}>
              <div className="phead">
                <button className="btn sm ghost" onClick={() => setRoute('facturas')} style={{ paddingLeft: 0, marginBottom: 6 }}>
                  ← Volver a Facturas y pagos
                </button>
                <h1>Pagar Facturas</h1>
                <p className="lead">Pasarela de pago segura en 3 pasos con soporte para tarjeta, PayPal y transferencia bancaria.</p>
              </div>

              {/* Indicador de pasos estilo prototipo */}
              <ol className="pstep" aria-label="Pasos del pago">
                <li className={payStep > 1 ? 'done' : payStep === 1 ? 'cur' : ''}>
                  <span>{payStep > 1 ? <Icon name="check" className="sm" /> : 1}</span>
                  <em>1. Elegir Facturas</em>
                </li>
                <li className={payStep > 2 ? 'done' : payStep === 2 ? 'cur' : ''}>
                  <span>{payStep > 2 ? <Icon name="check" className="sm" /> : 2}</span>
                  <em>2. Método de Pago</em>
                </li>
                <li className={payStep === 3 ? 'cur' : ''}>
                  <span>3</span>
                  <em>3. Confirmación</em>
                </li>
              </ol>

              {/* PASO 1: SELECCIONAR FACTURAS */}
              {payStep === 1 && (
                <div className="pay-l">
                  <section className="card">
                    <div className="card-h">
                      <h2>Elige qué facturas pagar</h2>
                    </div>
                    <ul className="rows">
                      {INV.filter((i) => i.st !== 'pagada').map((inv) => (
                        <li key={inv.id}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, cursor: 'pointer', minWidth: 0 }}>
                            <input
                              type="checkbox"
                              checked={selectedInvoices.includes(inv.id)}
                              onChange={(e) => {
                                if (e.target.checked) setSelectedInvoices([...selectedInvoices, inv.id]);
                                else setSelectedInvoices(selectedInvoices.filter((id) => id !== inv.id));
                              }}
                            />
                            <div style={{ minWidth: 0 }}>
                              <b className="mono">{inv.id}</b>
                              <small>{inv.desc} · vence {inv.due}</small>
                            </div>
                          </label>
                          <strong className="num" style={{ textAlign: 'right' }}>{money(inv.amt, inv.c)}</strong>
                          {inv.st === 'vencida' ? <span className="chip danger">Vencida</span> : null}
                        </li>
                      ))}
                    </ul>
                    <div className="card-b" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                      <button className="btn ghost" onClick={() => setRoute('facturas')}>Cancelar</button>
                      <button
                        className="btn primary"
                        disabled={selectedInvoices.length === 0}
                        onClick={() => setPayStep(2)}
                      >
                        Continuar al Pago ({selectedInvoices.length}) →
                      </button>
                    </div>
                  </section>

                  {/* Resumen lateral */}
                  <aside className="card sumbox">
                    <h2 className="sec">Resumen</h2>
                    {selectedInvoices.map((id) => {
                      const inv = INV.find((x) => x.id === id);
                      return inv ? (
                        <div key={id} className="ln">
                          <span>{inv.id}</span>
                          <span>{money(inv.amt, inv.c)}</span>
                        </div>
                      ) : null;
                    })}
                    <div className="ln tot">
                      <span>Total a pagar</span>
                      <span>{money(totalToPay, cur)}</span>
                    </div>
                  </aside>
                </div>
              )}

              {/* PASO 2: MEDIO DE PAGO */}
              {payStep === 2 && (
                <div className="pay-l">
                  <section className="card">
                    <div className="card-h">
                      <h2>¿Cómo quieres pagar?</h2>
                    </div>
                    <div className="card-b" style={{ display: 'grid', gap: 16 }}>
                      <div className="methods">
                        <button
                          type="button"
                          className="method"
                          aria-checked={payMethod === 'card'}
                          onClick={() => setPayMethod('card')}
                        >
                          <span className="ico"><Icon name="card" /></span>
                          <span>
                            <b>Tarjeta</b>
                            <small>Visa, Mastercard, Amex</small>
                          </span>
                        </button>

                        <button
                          type="button"
                          className="method"
                          aria-checked={payMethod === 'transfer'}
                          onClick={() => setPayMethod('transfer')}
                        >
                          <span className="ico"><Icon name="receipt" /></span>
                          <span>
                            <b>Transferencia</b>
                            <small>BCP, BBVA, Interbank</small>
                          </span>
                        </button>

                        <button
                          type="button"
                          className="method"
                          aria-checked={payMethod === 'paypal'}
                          onClick={() => setPayMethod('paypal')}
                        >
                          <span className="ico"><Icon name="globe" /></span>
                          <span>
                            <b>PayPal</b>
                            <small>Pagos en dólares USD</small>
                          </span>
                        </button>
                      </div>

                      {/* Detalle del método elegido */}
                      {payMethod === 'card' && (
                        <div className="cardf">
                          <div className="gw">
                            <Icon name="lock" className="sm" />
                            <span>Pasarela de pago segura y cifrada. Los datos no se almacenan.</span>
                          </div>
                          <div style={{ display: 'grid', gap: 4 }}>
                            <label style={{ fontSize: 12.5, fontWeight: 600 }}>Número de tarjeta</label>
                            <input type="text" placeholder="•••• •••• •••• ••••" className="input" />
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div style={{ display: 'grid', gap: 4 }}>
                              <label style={{ fontSize: 12.5, fontWeight: 600 }}>Vencimiento (MM/AA)</label>
                              <input type="text" placeholder="MM/AA" className="input" />
                            </div>
                            <div style={{ display: 'grid', gap: 4 }}>
                              <label style={{ fontSize: 12.5, fontWeight: 600 }}>Código CVV</label>
                              <input type="password" placeholder="•••" className="input" />
                            </div>
                          </div>
                        </div>
                      )}

                      {payMethod === 'transfer' && (
                        <div style={{ display: 'grid', gap: 14 }}>
                          <div className="bank">
                            <div className="row">
                              <span>Titular:</span>
                              <b>AlojamientoPlus S.A.C.</b>
                            </div>
                            <div className="row">
                              <span>Cuenta BCP Soles:</span>
                              <code>193-982145-0-22</code>
                            </div>
                            <div className="row">
                              <span>CCI Interbancario:</span>
                              <code>0021930098214502214</code>
                            </div>
                            <div className="row">
                              <span>Monto exacto a transferir:</span>
                              <b className="num" style={{ color: 'var(--brand-text)' }}>{money(totalToPay, cur)}</b>
                            </div>
                          </div>

                          <label className="drop">
                            <Icon name="upload" className="lg" />
                            <b style={{ color: 'var(--text)' }}>
                              {voucherUploaded ? '✅ Voucher adjuntado con éxito' : 'Arrastra tu voucher aquí o haz clic para subir'}
                            </b>
                            <small>JPG, PNG o PDF · máximo 5 MB</small>
                            <input
                              type="file"
                              onChange={() => setVoucherUploaded(true)}
                              accept="image/*,application/pdf"
                            />
                          </label>
                        </div>
                      )}

                      {payMethod === 'paypal' && (
                        <div style={{ display: 'grid', gap: 12 }}>
                          <div className="gw">
                            <Icon name="globe" className="sm" />
                            <span>PayPal procesa en USD y aplica tarifa de transacción estándar internacional.</span>
                          </div>
                          <div className="bank">
                            <div className="row">
                              <span>Total en USD:</span>
                              <b className="num">{money(totalToPay, 'USD')}</b>
                            </div>
                          </div>
                        </div>
                      )}

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                        <button className="btn" onClick={() => setPayStep(1)}>← Modificar facturas</button>
                        <button className="btn primary" onClick={() => setPayStep(3)}>
                          Procesar Pago ({money(totalToPay, cur)}) →
                        </button>
                      </div>
                    </div>
                  </section>

                  {/* Resumen lateral */}
                  <aside className="card sumbox">
                    <h2 className="sec">Resumen</h2>
                    {selectedInvoices.map((id) => {
                      const inv = INV.find((x) => x.id === id);
                      return inv ? (
                        <div key={id} className="ln">
                          <span>{inv.id}</span>
                          <span>{money(inv.amt, inv.c)}</span>
                        </div>
                      ) : null;
                    })}
                    <div className="ln tot">
                      <span>Total a pagar</span>
                      <span>{money(totalToPay, cur)}</span>
                    </div>
                  </aside>
                </div>
              )}

              {/* PASO 3: CONFIRMACIÓN DE PAGO */}
              {payStep === 3 && (
                <div className="card done-box">
                  <div className={`big ${payMethod === 'transfer' ? 'warn' : ''}`}>
                    <Icon name={payMethod === 'transfer' ? 'clock' : 'check'} className="lg" />
                  </div>
                  <h2>
                    {payMethod === 'transfer' ? '¡Voucher recibido con éxito!' : '¡Pago realizado con éxito!'}
                  </h2>
                  <p>
                    {payMethod === 'transfer'
                      ? 'El comprobante ha sido derivado al área de finanzas. Validaremos tu pago en un plazo máximo de 24 horas hábiles y te enviaremos la constancia por correo.'
                      : 'Tu transacción ha sido aprobada. Enviamos la constancia oficial de pago a facturacion@andestravel.pe. Tus servicios continúan activos sin interrupciones.'}
                  </p>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 14 }}>
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
                  <p className="lead">Revisa vencimientos, renovación automática y titularidad. Los cambios sensibles se confirman con el contacto titular registrado.</p>
                </div>
              </div>

              <div className="lock">
                <Icon name="lock" className="sm" />
                <div>
                  <strong>Bloqueo de seguridad de 60 días:</strong> Por normativa ICANN y de registros de dominios, un dominio recién registrado o transferido no puede moverse a otro proveedor durante sus primeros 60 días.
                </div>
              </div>

              <div style={{ display: 'grid', gap: 14 }}>
                {DOMS.map((d) => (
                  <article key={d.name} className="card dom-card">
                    <div className="dom-h">
                      <Icon name="globe" />
                      <b>{d.name}</b>
                      <span className="chip ok">Activo</span>
                      {d.lockUntil && (
                        <span className="chip outline">
                          <Icon name="lock" className="sm" /> Bloqueado hasta {d.lockUntil} ({d.lockWhy})
                        </span>
                      )}
                    </div>

                    <div className="dom-grid">
                      <div>
                        <small>Vencimiento</small>
                        <b>{d.exp}</b>
                      </div>
                      <div>
                        <small>Titular</small>
                        <b>{d.holder}</b>
                      </div>
                      <div>
                        <small>Renovación</small>
                        <b className="num">{money(d.price[0], d.price[1])} / año</b>
                      </div>
                      <div>
                        <small>Renovación automática</small>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 13, marginTop: 2 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: d.auto ? 'var(--ok)' : 'var(--muted)' }} />
                          {d.auto ? 'Activada' : 'Manual'}
                        </span>
                      </div>
                    </div>

                    <div className="dom-acts">
                      <button className="btn sm" onClick={() => alert(`Contactos de ${d.name} actualizados en base de datos.`)}>
                        <Icon name="user" className="sm" /> Actualizar Contactos
                      </button>
                      <button className="btn sm" disabled={!!d.lockUntil} title={d.lockUntil ? 'Bloqueado por 60 días' : ''}>
                        Transferir dominio
                      </button>
                      <button className="btn sm ghost" onClick={() => alert(`Zona DNS de ${d.name}:\n${d.ns}`)}>
                        Ver DNS
                      </button>
                      {!d.auto && (
                        <button className="btn sm primary" onClick={() => { setPayStep(1); setRoute('pagar'); }}>
                          Renovar ahora
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}

          {/* VISTA 7: SOPORTE Y TICKETS */}
          {route === 'soporte' && (() => {
            const filteredTickets = ticketsList.filter((t) => {
              if (tkFilter === 'abiertos') return t.st !== 'Resuelto';
              if (tkFilter === 'cerrados') return t.st === 'Resuelto';
              return true;
            });
            const openTkCount = ticketsList.filter((t) => t.st !== 'Resuelto').length;
            const closedTkCount = ticketsList.filter((t) => t.st === 'Resuelto').length;

            return (
              <div style={{ display: 'grid', gap: 20 }}>
                <div className="phead" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    <h1>Soporte Técnico</h1>
                    <p className="lead">Atención de consultas e incidencias con respuesta garantizada por SLA. Urgencias NOC 24/7.</p>
                  </div>
                  <button className="btn primary" onClick={() => alert('Modal para abrir ticket')}>
                    <Icon name="msg" className="sm" /> + Crear Ticket
                  </button>
                </div>

                <div className="card">
                  <div className="toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                    <div className="seg" role="group" aria-label="Filtrar tickets">
                      <button
                        type="button"
                        aria-pressed={tkFilter === 'abiertos'}
                        onClick={() => setTkFilter('abiertos')}
                      >
                        Abiertos <span className="num">({openTkCount})</span>
                      </button>
                      <button
                        type="button"
                        aria-pressed={tkFilter === 'cerrados'}
                        onClick={() => setTkFilter('cerrados')}
                      >
                        Resueltos y cerrados <span className="num">({closedTkCount})</span>
                      </button>
                      <button
                        type="button"
                        aria-pressed={tkFilter === 'todos'}
                        onClick={() => setTkFilter('todos')}
                      >
                        Todos <span className="num">({ticketsList.length})</span>
                      </button>
                    </div>
                  </div>

                  <div className="tw">
                    <table className="t">
                      <thead>
                        <tr>
                          <th>Código</th>
                          <th>Asunto</th>
                          <th>Servicio</th>
                          <th>Prioridad</th>
                          <th>Última Actividad</th>
                          <th>Estado</th>
                          <th className="r">Acción</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredTickets.map((t) => (
                          <tr key={t.id}>
                            <td className="nw mono" style={{ fontWeight: 700 }}>{t.id}</td>
                            <td style={{ fontWeight: 600 }}>{t.subj}</td>
                            <td>{t.srv}</td>
                            <td>
                              <span className={`chip ${t.pri === 'alta' ? 'danger' : 'info'}`}>
                                {t.pri}
                              </span>
                            </td>
                            <td className="num">{t.upd}</td>
                            <td>
                              <span className={`chip ${t.st === 'En atención' ? 'warn' : 'ok'}`}>
                                {t.st}
                              </span>
                            </td>
                            <td className="r nw">
                              <button
                                className="btn sm primary"
                                onClick={() => { setSelectedTicketId(t.id); setRoute('ticket-detalle'); }}
                              >
                                Ver conversación →
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* VISTA 8: HILO DE CONVERSACIÓN DE UN TICKET */}
          {route === 'ticket-detalle' && (
            <div style={{ display: 'grid', gap: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <button className="btn sm ghost" onClick={() => setRoute('soporte')} style={{ paddingLeft: 0, marginBottom: 6 }}>
                    ← Volver a tickets
                  </button>
                  <h1 style={{ fontSize: 22, margin: 0 }}>{selectedTicket.subj}</h1>
                  <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 13 }}>
                    <span className="mono">{selectedTicket.id}</span> • Creado el {selectedTicket.created}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span className={`chip ${selectedTicket.pri === 'alta' ? 'danger' : 'info'}`}>Prioridad {selectedTicket.pri}</span>
                  <span className={`chip ${selectedTicket.st === 'En atención' ? 'warn' : 'ok'}`}>{selectedTicket.st}</span>
                </div>
              </div>

              <div className="tk-detail">
                {/* Columna Izquierda: Conversación e Historial */}
                <div className="card">
                  <div className="card-h">
                    <h2 className="sec"><Icon name="msg" className="sm" /> Conversación</h2>
                    <span className="sub">{selectedTicket.msgs.length} mensajes intercambiados</span>
                  </div>
                  
                  <div className="card-b" style={{ padding: '16px 18px', display: 'grid', gap: 16 }}>
                    <ul className="thread">
                      {selectedTicket.msgs.map((m, idx) => (
                        <li key={idx} className={`msg ${m.w === 'a' ? 'agente' : 'cliente'}`}>
                          <div className="mh">
                            <span className="av">{m.w === 'a' ? '🛠️' : '👤'}</span>
                            <b>{m.n}</b>
                            <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                              ({m.w === 'a' ? 'Soporte Técnico Especializado' : 'Cliente / Andes Travel'})
                            </span>
                            <time>{m.t}</time>
                          </div>
                          <p>{m.x}</p>
                          {m.files && (
                            <div className="atts">
                              {m.files.map((f, i) => (
                                <span key={i} className="chip outline" style={{ fontSize: 11 }}>📎 {f}</span>
                              ))}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>

                    {/* Caja de respuesta / Composer */}
                    <form onSubmit={handleSendTicketReply} className="composer" style={{ padding: '14px 0 0' }}>
                      <label style={{ fontWeight: 600, fontSize: 13 }}>Responder a este ticket:</label>
                      <textarea
                        rows={3}
                        value={newReply}
                        onChange={(e) => setNewReply(e.target.value)}
                        placeholder="Escribe tu mensaje o adjunta detalles para el equipo de soporte..."
                        style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-strong)', fontSize: 13.5, fontFamily: 'inherit', resize: 'vertical' }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                        <span style={{ fontSize: 12, color: 'var(--muted)' }}>Respuesta promedio: &lt; 15 min en horario hábil</span>
                        <button type="submit" className="btn primary">
                          <Icon name="check" className="sm" /> Enviar Respuesta
                        </button>
                      </div>
                    </form>
                  </div>
                </div>

                {/* Columna Derecha: Información del Ticket y Servicio Asociado */}
                <div style={{ display: 'grid', gap: 16 }}>
                  <div className="card">
                    <div className="card-h">
                      <h2 className="sec">Detalles del Caso</h2>
                    </div>
                    <div className="card-b" style={{ padding: '14px 18px', display: 'grid', gap: 12, fontSize: 13 }}>
                      <div>
                        <span style={{ color: 'var(--muted)', display: 'block', fontSize: 11.5 }}>SERVICIO ASOCIADO</span>
                        <b>{selectedTicket.srv}</b>
                      </div>
                      <div>
                        <span style={{ color: 'var(--muted)', display: 'block', fontSize: 11.5 }}>ÚLTIMA ACTUALIZACIÓN</span>
                        <b>{selectedTicket.upd}</b>
                      </div>
                      <div>
                        <span style={{ color: 'var(--muted)', display: 'block', fontSize: 11.5 }}>CANAL</span>
                        <span>Portal Web con autenticación segura</span>
                      </div>
                      <div>
                        <span style={{ color: 'var(--muted)', display: 'block', fontSize: 11.5 }}>SLA DE RESPUESTA</span>
                        <span className="chip ok" style={{ marginTop: 4 }}>En cumplimiento (&lt; 30 min)</span>
                      </div>
                    </div>
                  </div>

                  <div className="card" style={{ background: 'var(--surface-2)' }}>
                    <div className="card-b" style={{ padding: '14px 18px', fontSize: 12.5, color: 'var(--muted)' }}>
                      <strong style={{ color: 'var(--text)', display: 'block', marginBottom: 4 }}>💡 ¿Problema urgente?</strong>
                      Para caídas críticas fuera de horario, nuestra guardia NOC 24/7 atiende vía tickets marcados con prioridad Alta.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VISTA 9: RESPALDOS AUTOMÁTICOS */}
          {route === 'respaldos' && (
            <div style={{ display: 'grid', gap: 20 }}>
              <div className="phead" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <h1>Respaldos Automáticos</h1>
                  <p className="lead">Copias automáticas de tus sitios, bases de datos y correos. Si borraste algo por error, solicita una restauración asistida.</p>
                </div>
                <button className="btn primary" onClick={() => alert('Solicitud de restauración asistida enviada a la guardia técnica.')}>
                  <Icon name="restore" className="sm" /> Solicitar Restauración
                </button>
              </div>

              <div className="card">
                <div className="card-h">
                  <h2 className="sec"><Icon name="archive" className="sm" /> Tus respaldos (Últimos 14 días)</h2>
                  <span className="sub" style={{ fontSize: 12, color: 'var(--muted)' }}>
                    <span style={{ color: 'var(--ok-text)', fontWeight: 700 }}>■</span> exitoso &nbsp;&nbsp;
                    <span style={{ color: 'var(--warn-text)', fontWeight: 700 }}>■</span> reintentado con éxito
                  </span>
                </div>

                <div className="card-b" style={{ padding: 0 }}>
                  {[
                    { id: 'sitio', name: 'Sitio web andestravel.pe', kind: 'Archivos del sitio WordPress', icon: 'browser', last: 'Hoy 03:10 AM', freq: 'Diario a las 03:00', ret: '30 días', size: '17.9 GB', hist: 'ooooofoooooooo' },
                    { id: 'bd', name: 'Base de datos de reservas (PostgreSQL)', kind: 'Base de datos transaccional', icon: 'database', last: 'Hoy 06:00 AM', freq: 'Cada 6 horas', ret: '14 días', size: '2.1 GB', hist: 'oooooooooooooo' },
                    { id: 'wpdb', name: 'Base de datos del sitio (MySQL)', kind: 'Base de datos relacional', icon: 'database', last: 'Hoy 03:25 AM', freq: 'Diario a las 03:00', ret: '30 días', size: '640 MB', hist: 'ooooorooooooo' },
                    { id: 'mail', name: 'Correo empresarial (30 buzones IMAP)', kind: 'Buzones y adjuntos', icon: 'server', last: 'Ayer 23:40 PM', freq: 'Diario a las 23:00', ret: '14 días', size: '18.6 GB', hist: 'oooooooooooooo' },
                    { id: 'vps', name: 'Servidor cloud (imagen completa snapshot)', kind: 'Snapshot de sistema operativo', icon: 'server', last: '05/10/2026 02:00', freq: 'Semanal (domingos)', ret: '4 semanas', size: '98 GB', hist: 'oooo' },
                  ].map((b) => (
                    <div key={b.id} className="bk">
                      <div className="ico">
                        <Icon name={b.icon as any} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <b style={{ fontSize: 14 }}>{b.name}</b>
                        <small>{b.kind} · {b.freq} · se guardan {b.ret} · {b.size}</small>
                        <div style={{ fontSize: 12, marginTop: 2, color: 'var(--muted)' }}>
                          Último respaldo exitoso: <strong style={{ color: 'var(--text)' }}>{b.last}</strong>
                        </div>
                        <div className="days" aria-label={`Historial de ${b.name}`}>
                          {[...b.hist].map((x, idx) => (
                            <i key={idx} className={x === 'o' ? '' : 'r'} title={x === 'o' ? 'Exitoso' : 'Reintentado'} />
                          ))}
                        </div>
                      </div>
                      <div>
                        <button
                          className="btn sm"
                          onClick={() => alert(`Iniciando restauración de respaldo de: ${b.name}`)}
                        >
                          <Icon name="restore" className="sm" /> Restaurar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="lock" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <Icon name="activity" className="sm" />
                <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                  <strong style={{ color: 'var(--text)', display: 'block', marginBottom: 2 }}>Política de restauración:</strong>
                  Las restauraciones no tienen recargo adicional hasta 2 veces al mes. Por seguridad, el sistema crea un clon temporal de validación antes de sobreescribir la base de datos o el sitio en vivo.
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
