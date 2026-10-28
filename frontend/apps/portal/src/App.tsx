import { useCallback, useEffect, useState } from 'react';
import { Icon } from '@hub/ui';
import { isProblem } from '@hub/api';
import type { Me } from '@hub/api';
import { CLIENT, PROJ, SRV, DOMS, INV, TK } from './data/portalData';
import { LoginView } from './components/LoginView';
import { AccountLinkViews, usePublicRoute } from './components/AccountLinkViews';
import { Alert, Hello, Kpi, Kpis } from './components/ui';
import { DEMO_MODE, DEMO_USER, hub, onUnauthenticated } from './auth/client';
import { PortalShell, type Currency, type PortalNotif, type SearchItem } from './shell/PortalShell';
import { navGroups, useHashRoute, type Route } from './shell/routes';
import { LIVE_ROUTES, LivePortal, type LiveRoute } from './live/LivePortal';
import './portal.css';

export default function App() {
  /* Ruta sincronizada con el hash (#facturas, #servicios…) en ambos modos. */
  const [route, setRoute] = useHashRoute();
  /* Pantallas públicas sin sesión: #/activar?token=…, #/olvide, #/restablecer?token=… */
  const [publicRoute, leavePublicRoute] = usePublicRoute();
  const [selectedServiceId, setSelectedServiceId] = useState<string>('sitio');
  const [selectedTicketId, setSelectedTicketId] = useState<string>('TK-10482');
  const [cur, setCur] = useState<Currency>('PEN');
  const [payStep, setPayStep] = useState<number>(1);
  const [selectedInvoices, setSelectedInvoices] = useState<string[]>(['E001-4498', 'E001-4521']);
  const [payMethod, setPayMethod] = useState<'card' | 'transfer' | 'paypal'>('card');
  const [voucherUploaded, setVoucherUploaded] = useState(false);
  const [newReply, setNewReply] = useState('');
  const [ticketsList, setTicketsList] = useState(TK);
  const [invFilter, setInvFilter] = useState<'pend' | 'paid' | 'all'>('pend');
  const [tkFilter, setTkFilter] = useState<'abiertos' | 'cerrados' | 'todos'>('abiertos');

  /* Sesión real contra /api/v1/auth (o usuario mock con VITE_DEMO=1). */
  type AuthState = { k: 'loading' } | { k: 'anon'; notice?: string | null; changeFor?: Me } | { k: 'ready'; user: Me };
  const [auth, setAuth] = useState<AuthState>(() => (DEMO_MODE ? { k: 'ready', user: DEMO_USER } : { k: 'loading' }));

  /** El portal es solo para usuarios de cliente (type=customer). */
  const enter = useCallback((user: Me) => {
    if (user.type !== 'customer') {
      hub.auth.logout().catch(() => undefined);
      setAuth({ k: 'anon', notice: 'Esta cuenta es del personal: ingresa por el panel de administración.' });
      return;
    }
    if (user.password.change_required) {
      setAuth({ k: 'anon', changeFor: user });
      return;
    }
    setAuth({ k: 'ready', user });
  }, []);

  useEffect(() => {
    if (DEMO_MODE) return;
    hub.auth
      .me()
      .then(enter)
      .catch((e: unknown) => {
        const silent = isProblem(e) && e.status === 401;
        setAuth({ k: 'anon', notice: silent ? null : 'No se pudo comprobar tu sesión. Ingresa de nuevo.' });
      });
    return onUnauthenticated(() =>
      setAuth((a) => (a.k === 'ready' ? { k: 'anon', notice: 'Tu sesión terminó. Vuelve a ingresar.' } : a)),
    );
  }, [enter]);

  /* Modo real: nombre y documento de la cuenta desde /portal/account (en demo, el cliente de ejemplo). */
  const [account, setAccount] = useState<{ name: string; tag: string }>({ name: CLIENT.name, tag: `RUC ${CLIENT.ruc}` });
  useEffect(() => {
    if (DEMO_MODE || auth.k !== 'ready') return;
    let alive = true;
    hub.http
      .get<{ data: { legal_name: string; tax_id_type: string | null; tax_id: string | null; code: string } }>('/api/v1/portal/account')
      .then(({ data }) => alive && setAccount({ name: data.legal_name, tag: data.tax_id ? `${(data.tax_id_type ?? '').toUpperCase()} ${data.tax_id}` : data.code }))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [auth.k]);

  const logout = useCallback(async () => {
    if (DEMO_MODE) return;
    try {
      await hub.auth.logout();
    } catch {
      /* la sesión puede haber expirado ya */
    }
    setAuth({ k: 'anon', notice: 'Sesión cerrada.' });
  }, []);

  const TC = 3.75;
  const conv = (amt: number, from: 'PEN' | 'USD') => {
    if (cur === from) return amt;
    return cur === 'PEN' ? amt * TC : amt / TC;
  };
  const money = (amt: number, from: 'PEN' | 'USD') => {
    const val = conv(amt, from);
    return `${cur === 'PEN' ? 'S/' : 'US$'} ${val.toFixed(2)}`;
  };

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

  if (publicRoute && auth.k !== 'ready') {
    return (
      <AccountLinkViews
        route={publicRoute}
        go={(h) => { window.location.hash = h; }}
        onFinished={(m) => {
          leavePublicRoute();
          setAuth({ k: 'anon', notice: m });
        }}
      />
    );
  }

  if (auth.k === 'loading') {
    return (
      <div className="auth open" role="status" style={{ display: 'grid', placeItems: 'center', position: 'fixed', inset: 0 }}>
        <span className="spin" aria-hidden="true" /> Comprobando sesión…
      </div>
    );
  }

  if (auth.k === 'anon') {
    return <LoginView key={auth.changeFor ? 'change' : (auth.notice ?? '')} notice={auth.notice} changeFor={auth.changeFor} onLoggedIn={enter} />;
  }

  const user = auth.user;
  /* Con backend (sin VITE_DEMO) estas pantallas usan la API real (live/LivePortal); el resto sigue con datos de ejemplo. */
  const live = !DEMO_MODE && (LIVE_ROUTES as string[]).includes(route);
  const perms = new Set(user.permissions ?? []);
  const can = (perm: string) => perms.has(perm) || perms.has('*');

  /* Miga de la ruta actual (las de detalle usan el dato de ejemplo en modo demo). */
  const loadSearch = async (): Promise<SearchItem[]> => {
    if (DEMO_MODE) {
      return [
        ...SRV.map((x): SearchItem => ({ kind: 'Servicio', label: x.name, sub: x.kind, onPick: () => { setSelectedServiceId(x.id); setRoute('servicio-detalle'); } })),
        ...DOMS.map((x): SearchItem => ({ kind: 'Dominio', label: x.name, sub: `vence ${x.exp}`, onPick: () => setRoute('dominios') })),
        ...INV.map((x): SearchItem => ({ kind: 'Comprobante', label: x.id, sub: x.desc, onPick: () => setRoute('facturas') })),
      ];
    }
    const [sv, iv] = await Promise.all([hub.services.portalList({ size: 100 }).catch(() => null), hub.billing.portalList({ sort: '-issue_date', size: 100 }).catch(() => null)]);
    return [
      ...(sv?.data ?? []).map((x): SearchItem => ({ kind: 'Servicio', label: x.label, sub: x.code, onPick: () => setRoute('servicios') })),
      ...(iv?.data ?? []).map((x): SearchItem => ({ kind: 'Comprobante', label: x.number ?? x.id, onPick: () => setRoute('facturas') })),
    ];
  };

  const crumb: string | undefined = live
    ? route === 'pagar'
      ? 'Pagos y vouchers'
      : undefined
    : route === 'servicio-detalle'
      ? selectedService.name
      : route === 'ticket-detalle'
        ? selectedTicket.id
        : undefined;

  const nav = navGroups(
    DEMO_MODE ? { servicios: SRV.filter((s) => s.st === 'warn').length, facturas: INV.filter((i) => i.st !== 'pagada').length } : {},
  );

  /* Avisos de la campana (solo en demo; con backend aún no hay endpoint de avisos del cliente). */
  const notifs: PortalNotif[] = DEMO_MODE
    ? [
        ...INV.filter((i) => i.st === 'vencida').map((i): PortalNotif => ({ id: `inv-${i.id}`, icon: 'receipt', title: `Factura ${i.id} vencida`, sub: `${i.desc} · venció el ${i.due}`, route: 'facturas' })),
        ...SRV.filter((x) => x.st !== 'ok').map((x): PortalNotif => ({
          id: `srv-${x.id}`,
          icon: 'tri',
          title: `Atención en ${x.name}`,
          sub: x.stNote ?? 'Revisa el estado del servicio',
          route: 'servicio-detalle',
          onPick: () => { setSelectedServiceId(x.id); setRoute('servicio-detalle'); },
        })),
        ...ticketsList.filter((t) => t.st === 'Esperando tu respuesta').map((t): PortalNotif => ({
          id: `tk-${t.id}`,
          icon: 'msg',
          title: `${t.id} espera tu respuesta`,
          sub: t.subj,
          route: 'ticket-detalle',
          onPick: () => { setSelectedTicketId(t.id); setRoute('ticket-detalle'); },
        })),
      ]
    : [];

  return (
    <PortalShell
      user={user}
      account={account}
      demo={DEMO_MODE}
      cur={cur}
      onCur={setCur}
      route={route}
      go={setRoute}
      nav={nav}
      crumb={crumb}
      onLogout={() => void logout()}
      loadSearch={loadSearch}
      notifs={notifs}
    >
          {live ? <LivePortal route={route as LiveRoute} go={(r: Route) => setRoute(r)} can={can} userName={user.name} /> : null}

          {/* VISTA 1: RESUMEN / DASHBOARD */}
          {!live && route === 'resumen' && (() => {
            const pendInvoices = INV.filter((i) => i.st !== 'pagada');
            const totalPend = pendInvoices.reduce((acc, curr) => acc + conv(curr.amt, curr.c), 0);
            const overdue = INV.filter((i) => i.st === 'vencida');
            const warnServices = SRV.filter((s) => s.st !== 'ok');
            const openTickets = ticketsList.filter((t) => t.st !== 'Resuelto');

            return (
              <div style={{ display: 'grid', gap: 20 }}>
                {/* Banner de bienvenida (componente compartido) */}
                <Hello
                  title={`Hola, ${user.name.split(' ')[0]}`}
                  text={`Este es el estado integral de la infraestructura de ${CLIENT.name} al día de hoy.`}
                  actions={
                    <>
                      {pendInvoices.length > 0 && (
                        <button className="btn primary" onClick={() => { setPayStep(1); setRoute('pagar'); }}>
                          <Icon name="card" /> Pagar pendientes ({money(totalPend, cur)})
                        </button>
                      )}
                      <button className="btn" onClick={() => setRoute('soporte')}>
                        <Icon name="plus" /> Crear ticket
                      </button>
                    </>
                  }
                />

                {/* Avisos prioritarios */}
                <div style={{ display: 'grid', gap: 10 }}>
                  {overdue.map((inv) => (
                    <Alert
                      key={inv.id}
                      tone="danger"
                      icon="receipt"
                      title={`Factura ${inv.id} vencida (${money(inv.amt, inv.c)})`}
                      text={`${inv.desc} · venció el ${inv.due}. Cancela para evitar interrupciones en el servicio.`}
                      action={
                        <button className="btn sm primary" onClick={() => { setSelectedInvoices([inv.id]); setPayStep(2); setRoute('pagar'); }}>
                          Pagar ahora
                        </button>
                      }
                    />
                  ))}
                  {warnServices.map((s) => (
                    <Alert
                      key={s.id}
                      tone="warn"
                      icon="tri"
                      title={`Atención requerida en ${s.name}`}
                      text={s.stNote}
                      action={
                        <button className="btn sm" onClick={() => { setSelectedServiceId(s.id); setRoute('servicio-detalle'); }}>
                          Ver servicio
                        </button>
                      }
                    />
                  ))}
                </div>

                {/* KPIs principales (componente compartido) */}
                <Kpis>
                  <Kpi
                    label="Servicios activos"
                    icon="server"
                    tone="ok"
                    value={SRV.length}
                    meta={warnServices.length ? `${warnServices.length} requiere atención` : 'Todo operativo'}
                    metaColor={warnServices.length ? 'var(--warn-text)' : 'var(--ok-text)'}
                    onClick={() => setRoute('servicios')}
                  />
                  <Kpi
                    label="Saldo por pagar"
                    icon="wallet"
                    tone="warn"
                    value={money(totalPend, cur)}
                    meta={`${pendInvoices.length} facturas pendientes`}
                    metaColor={overdue.length ? 'var(--danger-text)' : 'var(--muted)'}
                    onClick={() => setRoute('facturas')}
                  />
                  <Kpi label="Dominios activos" icon="globe" value={DOMS.length} meta=".pe y .com vigentes" onClick={() => setRoute('dominios')} />
                  <Kpi label="Tickets de atención" icon="msg" value={openTickets.length} meta="Respuesta promedio < 15 min" onClick={() => setRoute('soporte')} />
                </Kpis>

                {/* Grid a dos columnas: Proyectos y Accesos Rápidos */}
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: 18 }}>
                  {/* Columna Izquierda: Servicios por proyecto */}
                  <div style={{ display: 'grid', gap: 16 }}>
                    {PROJ.map((p) => {
                      const ss = SRV.filter((s) => s.proj === p.id);
                      return (
                        <section key={p.id} className="card">
                          <div className="card-h" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h2 className="sec"><Icon name={p.icon} className="sm" /> {p.name}</h2>
                            <button className="btn sm ghost" onClick={() => setRoute('servicios')}>Ver servicios →</button>
                          </div>
                          <ul className="rows">
                            {ss.map((s) => (
                              <li key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px' }}>
                                <span className={`st-dot ${s.st === 'ok' ? '' : 'warn'}`} />
                                <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => { setSelectedServiceId(s.id); setRoute('servicio-detalle'); }}>
                                  <b style={{ display: 'block', fontSize: 13.5 }}>{s.name}</b>
                                  <small style={{ color: 'var(--muted)', fontSize: 12 }}>{s.plan} · <span className="mono">{s.host}</span></small>
                                </div>
                                <span className={`chip ${s.st === 'ok' ? 'ok' : 'warn'}`}>
                                  {s.st === 'ok' ? 'Operativo' : 'Atención'}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </section>
                      );
                    })}
                  </div>

                  {/* Columna Derecha: Accesos rápidos y Cuenta */}
                  <div style={{ display: 'grid', gap: 16 }}>
                    <div className="card">
                      <div className="card-h">
                        <h2 className="sec">Accesos Rápidos</h2>
                      </div>
                      <div className="card-b" style={{ padding: '12px 16px' }}>
                        <div className="qa" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                          <button type="button" onClick={() => window.open('https://cpanel23.alojamientoplus.pe', '_blank')}>
                            <span className="ico"><Icon name="external" /></span>
                            <div className="txt">
                              <b>Abrir cPanel</b>
                              <small>andestravel.pe</small>
                            </div>
                          </button>
                          <button type="button" onClick={() => { setPayStep(1); setRoute('pagar'); }}>
                            <span className="ico"><Icon name="card" /></span>
                            <div className="txt">
                              <b>Pagar facturas</b>
                              <small>Tarjeta, PayPal o banco</small>
                            </div>
                          </button>
                          <button type="button" onClick={() => setRoute('soporte')}>
                            <span className="ico"><Icon name="msg" /></span>
                            <div className="txt">
                              <b>Crear ticket</b>
                              <small>Guardia NOC 24/7</small>
                            </div>
                          </button>
                          <button type="button" onClick={() => setRoute('respaldos')}>
                            <span className="ico"><Icon name="restore" /></span>
                            <div className="txt">
                              <b>Respaldos</b>
                              <small>Copias diarias seguras</small>
                            </div>
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="card">
                      <div className="card-h">
                        <h2 className="sec"><Icon name="user" className="sm" /> Ejecutiva Asignada</h2>
                      </div>
                      <div className="card-b" style={{ padding: '14px 16px', fontSize: 13 }}>
                        <strong style={{ fontSize: 14.5 }}>{CLIENT.exec}</strong>
                        <p style={{ margin: '4px 0 0', color: 'var(--muted)' }}>
                          Atención de contratos anuales y facturación corporativa (Lun - Vie 9:00 a 18:00).
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* VISTA 2: MIS SERVICIOS (LISTA POR PROYECTOS) */}
          {!live && route === 'servicios' && (
            <div style={{ display: 'grid', gap: 24 }}>
              <div className="phead">
                <div>
                  <h1>Mis Servicios Contratados</h1>
                  <p className="lead">{SRV.every((s) => s.st === 'ok') ? 'Todo funciona con normalidad. Todos tus servicios operan sin incidencias.' : `${SRV.filter((s) => s.st !== 'ok').length} servicio(s) requiere(n) atención.`}</p>
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
          {!live && route === 'servicio-detalle' && (() => {
            const p = PROJ.find((x) => x.id === selectedService.proj);
            const serviceTickets = ticketsList.filter((t) => t.srv.toLowerCase().includes(selectedService.name.toLowerCase()) || (selectedService.id === 'reservas' && t.id === 'TK-10482'));

            return (
              <div style={{ display: 'grid', gap: 20 }}>
                {/* Cabecera del servicio */}
                <div className="dhead">
                  <div className="ico">
                    <Icon name={selectedService.icon} />
                  </div>
                  <div className="tt">
                    <h1>{selectedService.name}</h1>
                    <p>{selectedService.plan} · <span className="mono">{selectedService.host}</span> · Proyecto «{p?.name}»</p>
                    <div style={{ marginTop: 8 }}>
                      <span className={`chip ${selectedService.st === 'ok' ? 'ok' : 'warn'}`}>
                        {selectedService.st === 'ok' ? 'Todo operativo' : 'Requiere atención'}
                      </span>
                    </div>
                  </div>
                  <div className="acts">
                    {selectedService.cpanel && (
                      <button className="btn primary" onClick={() => window.open('https://cpanel23.alojamientoplus.pe', '_blank')}>
                        <Icon name="external" className="sm" /> Abrir cPanel
                      </button>
                    )}
                    <button className="btn" onClick={() => setRoute('soporte')}>
                      <Icon name="msg" className="sm" /> Crear ticket
                    </button>
                    <button className="btn ghost" onClick={() => setRoute('servicios')}>
                      ← Volver a servicios
                    </button>
                  </div>
                </div>

                {selectedService.stNote && (
                  <div className="alert warn">
                    <span className="ico"><Icon name="tri" /></span>
                    <div className="tx">
                      <b>Requiere atención</b>
                      <small>{selectedService.stNote}</small>
                    </div>
                  </div>
                )}

                {/* Layout a dos columnas (.detail) */}
                <div className="detail">
                  {/* Columna Izquierda: Consumo y Características */}
                  <div className="stack" style={{ display: 'grid', gap: 16 }}>
                    <section className="card">
                      <div className="card-h">
                        <h2 className="sec"><Icon name="activity" className="sm" /> Consumo de Recursos</h2>
                        <span className="sub">Medición en vivo</span>
                      </div>
                      <div className="card-b" style={{ display: 'grid', gap: 14 }}>
                        {selectedService.usage.map((u, i) => {
                          const pct = u.total ? Math.round((u.used / u.total) * 100) : u.used;
                          return (
                            <div key={i}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                                <span>{u.label}</span>
                                <b className="num">{u.used} {u.total ? `/ ${u.total}` : ''} {u.unit} ({pct}%)</b>
                              </div>
                              <div style={{ height: 8, background: 'var(--surface-3)', borderRadius: 4, overflow: 'hidden' }}>
                                <div style={{ width: `${pct}%`, height: '100%', background: pct > 80 ? 'var(--danger)' : pct > 60 ? 'var(--warn)' : 'var(--ok)' }} />
                              </div>
                            </div>
                          );
                        })}
                        <div className="legend" style={{ marginTop: 6, fontSize: 12 }}>
                          <span><i style={{ background: 'var(--ok)' }} /> Normal</span>
                          <span><i style={{ background: 'var(--warn)' }} /> Desde 75%</span>
                          <span><i style={{ background: 'var(--danger)' }} /> Crítico (&gt; 90%)</span>
                        </div>
                      </div>
                    </section>

                    <section className="card">
                      <div className="card-h">
                        <h2 className="sec"><Icon name="sliders" className="sm" /> Características Técnicas</h2>
                      </div>
                      <div className="card-b" style={{ padding: '14px 18px' }}>
                        <dl style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '10px 14px', fontSize: 13.5, margin: 0 }}>
                          {selectedService.feats.map(([k, v], idx) => (
                            <div key={idx} style={{ display: 'contents' }}>
                              <dt style={{ color: 'var(--muted)', fontWeight: 500 }}>{k}</dt>
                              <dd style={{ margin: 0, fontWeight: 600 }}>{v}</dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    </section>
                  </div>

                  {/* Columna Derecha: Plan comercial, Respaldo y Tickets vinculados */}
                  <div className="stack" style={{ display: 'grid', gap: 16 }}>
                    <section className="card">
                      <div className="card-h">
                        <h2 className="sec"><Icon name="receipt" className="sm" /> Tu Plan</h2>
                      </div>
                      <div className="card-b" style={{ padding: '14px 18px', display: 'grid', gap: 10, fontSize: 13.5 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--muted)' }}>Plan contratado:</span>
                          <b>{selectedService.plan}</b>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--muted)' }}>Importe recurrente:</span>
                          <strong className="num" style={{ color: 'var(--brand-text)' }}>
                            {money(selectedService.price[0], selectedService.price[1])} /{selectedService.price[2]}
                          </strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--muted)' }}>Próxima renovación:</span>
                          <span className="num">{selectedService.renew || 'Junto con tu plan'}</span>
                        </div>
                      </div>
                    </section>

                    <section className="card">
                      <div className="card-h">
                        <h2 className="sec"><Icon name="archive" className="sm" /> Respaldo Automatizado</h2>
                      </div>
                      <div className="card-b" style={{ padding: '14px 18px', display: 'grid', gap: 8, fontSize: 13 }}>
                        <div>
                          <span style={{ color: 'var(--muted)', display: 'block', fontSize: 11.5 }}>ÚLTIMO RESPALDO EXITOSO</span>
                          <b>Hoy 03:00 AM (Íntegro)</b>
                        </div>
                        <button className="btn sm" onClick={() => setRoute('respaldos')}>
                          <Icon name="restore" className="sm" /> Solicitar restauración
                        </button>
                      </div>
                    </section>

                    <section className="card">
                      <div className="card-h">
                        <h2 className="sec"><Icon name="msg" className="sm" /> Tickets de este servicio</h2>
                      </div>
                      {serviceTickets.length > 0 ? (
                        <ul className="rows">
                          {serviceTickets.map((t) => (
                            <li key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}>
                              <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => { setSelectedTicketId(t.id); setRoute('ticket-detalle'); }}>
                                <b style={{ fontSize: 13 }}>{t.subj}</b>
                                <small style={{ color: 'var(--muted)' }}>{t.id} · {t.upd}</small>
                              </div>
                              <span className={`chip ${t.st === 'En atención' ? 'warn' : 'ok'}`}>
                                {t.st}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="card-b" style={{ padding: '14px 18px', color: 'var(--muted)', fontSize: 13 }}>
                          Sin incidencias ni tickets abiertos para este servicio.
                        </div>
                      )}
                    </section>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* VISTA 4: FACTURAS Y PAGOS */}
          {!live && route === 'facturas' && (() => {
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
                      RUC emisor: 20607431117 • Tipo de cambio referencial S/ {TC}
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
          {!live && route === 'pagar' && (
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
                              <b>GRUPO DE SOLUCIONES CREATIVAS</b>
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

          {/* VISTA 10: CONTRATOS Y DOCUMENTOS */}
          {route === 'contratos' && (
            <div style={{ display: 'grid', gap: 20 }}>
              <div className="phead">
                <div>
                  <h1>Contratos y Documentos Legales</h1>
                  <p className="lead">Acuerdos de servicio vigentes aceptados con valor legal, anexos de SLA y comprobantes tributarios.</p>
                </div>
              </div>

              <div className="alert info">
                <span className="ico"><Icon name="file" /></span>
                <div className="tx">
                  <b>Nueva versión 5.2 de Términos y Condiciones del Servicio</b>
                  <small>Vigente desde el 01/11/2026. Revísala y acéptala antes de esa fecha para continuar con el servicio regular.</small>
                </div>
                <button className="btn sm primary" onClick={() => alert('Modal para revisar nueva versión 5.2')}>
                  Revisar versión 5.2
                </button>
              </div>

              <div className="card">
                <div className="card-h">
                  <h2 className="sec"><Icon name="contract" className="sm" /> Acuerdos Aceptados</h2>
                </div>
                <ul className="rows">
                  {[
                    { id: 'contrato', name: 'Contrato de prestación de servicios de hosting y nube', ver: '3.2', acc: '15/03/2024 10:12', by: 'Lucía Quispe Mamani' },
                    { id: 'tyc', name: 'Términos y condiciones del servicio', ver: '5.1', acc: '02/01/2026 09:40', by: 'Lucía Quispe Mamani' },
                    { id: 'sla', name: 'Acuerdo de nivel de servicio (SLA 99.9%)', ver: '1.8', acc: '01/07/2025 11:05', by: 'Lucía Quispe Mamani' },
                    { id: 'priv', name: 'Política de privacidad y protección de datos (Ley N.° 29733)', ver: '2.4', acc: '20/02/2025 16:30', by: 'Jorge Huamán Ccori' },
                    { id: 'dom', name: 'Condiciones de registro de dominios (.pe y genéricos)', ver: '1.3', acc: '01/09/2026 08:50', by: 'Lucía Quispe Mamani' },
                  ].map((d) => (
                    <li key={d.id} className="doc">
                      <div className="ico">
                        <Icon name="file" className="sm" />
                      </div>
                      <div className="tx">
                        <b style={{ fontSize: 14 }}>{d.name}</b>
                        <small style={{ color: 'var(--muted)', display: 'block', fontSize: 12.5 }}>
                          Versión <span className="mono">{d.ver}</span> · Aceptado el {d.acc} por {d.by}
                        </small>
                      </div>
                      <div className="acts">
                        <button className="btn sm" onClick={() => alert(`Visualizando documento: ${d.name}`)}>Ver</button>
                        <button className="btn sm ghost" onClick={() => alert(`Descargando copia legal certificada PDF: ${d.name}`)}>PDF</button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* VISTA 11: USUARIOS DE LA EMPRESA */}
          {route === 'usuarios' && (
            <div style={{ display: 'grid', gap: 20 }}>
              <div className="phead" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <h1>Usuarios de la Empresa</h1>
                  <p className="lead">Control de accesos para tu equipo. Asigna permisos según sus funciones sin compartir contraseñas.</p>
                </div>
                <button className="btn primary" onClick={() => alert('Modal para invitar nuevo usuario')}>
                  <Icon name="plus" className="sm" /> Invitar Usuario
                </button>
              </div>

              <div className="card">
                <div className="card-h">
                  <h2 className="sec"><Icon name="users" className="sm" /> Personas con Acceso</h2>
                  <span className="sub">4 integrantes registrados</span>
                </div>
                <ul className="rows">
                  {[
                    { name: 'Lucía Quispe Mamani', mail: 'lucia.quispe@andestravel.pe', role: 'Administrador', me: true, st: 'activo', last: 'Hoy 09:02' },
                    { name: 'Jorge Huamán Ccori', mail: 'jorge.huaman@andestravel.pe', role: 'Facturación', me: false, st: 'activo', last: '05/10/2026 16:40' },
                    { name: 'Diego Ramos Salas', mail: 'diego.ramos@andestravel.pe', role: 'Técnico', me: false, st: 'activo', last: '07/10/2026 10:18' },
                    { name: 'Milagros Condori', mail: 'contabilidad@andestravel.pe', role: 'Facturación', me: false, st: 'pendiente', last: 'Invitación enviada 06/10' },
                  ].map((u, i) => (
                    <li key={i} className="urow">
                      <div className="av">
                        {u.name.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                      </div>
                      <div className="tx">
                        <b>
                          {u.name} {u.me && <span className="chip outline" style={{ fontSize: 11, marginLeft: 6 }}>Tú</span>}
                        </b>
                        <small>
                          {u.mail} · {u.st === 'pendiente' ? u.last : `Último acceso: ${u.last}`}
                        </small>
                      </div>
                      <span className={`chip ${u.role === 'Administrador' ? 'info' : 'outline'}`}>{u.role}</span>
                      {u.st === 'pendiente' ? (
                        <span className="chip warn">Pendiente</span>
                      ) : null}
                      {!u.me && (
                        <button className="btn sm ghost" onClick={() => alert(`Configuración de rol para ${u.name}`)}>
                          Editar rol
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Roles descriptivos */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
                <div className="card" style={{ padding: '14px 18px', fontSize: 13 }}>
                  <b style={{ color: 'var(--brand-text)', fontSize: 14 }}>Administrador</b>
                  <p style={{ margin: '4px 0 0', color: 'var(--muted)' }}>Acceso total. Ve y paga facturas, gestiona servicios, usuarios y datos fiscales.</p>
                </div>
                <div className="card" style={{ padding: '14px 18px', fontSize: 13 }}>
                  <b style={{ color: 'var(--text)', fontSize: 14 }}>Facturación</b>
                  <p style={{ margin: '4px 0 0', color: 'var(--muted)' }}>Consulta comprobantes SUNAT, descarga XML/PDF y sube vouchers de transferencia.</p>
                </div>
                <div className="card" style={{ padding: '14px 18px', fontSize: 13 }}>
                  <b style={{ color: 'var(--text)', fontSize: 14 }}>Técnico</b>
                  <p style={{ margin: '4px 0 0', color: 'var(--muted)' }}>Gestión técnica, acceso cPanel, apertura de tickets y solicitud de respaldos.</p>
                </div>
              </div>
            </div>
          )}

          {/* VISTA 12: SEGURIDAD Y 2FA */}
          {route === 'seguridad' && (
            <div style={{ display: 'grid', gap: 20 }}>
              <div className="phead">
                <div>
                  <h1>Seguridad de la Cuenta</h1>
                  <p className="lead">Protege el acceso a tus servicios web y base de datos con políticas de acceso y doble factor.</p>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)', gap: 18 }}>
                {/* Cambio de Contraseña */}
                <div className="card">
                  <div className="card-h">
                    <h2 className="sec"><Icon name="key" className="sm" /> Cambiar Contraseña</h2>
                  </div>
                  <form onSubmit={(e) => { e.preventDefault(); alert('Contraseña actualizada con éxito.'); }} className="card-b" style={{ padding: '16px 20px', display: 'grid', gap: 14 }}>
                    <div style={{ display: 'grid', gap: 4 }}>
                      <label style={{ fontSize: 12.5, fontWeight: 600 }}>Contraseña actual</label>
                      <input className="input" type="password" placeholder="••••••••••••" required />
                    </div>
                    <div style={{ display: 'grid', gap: 4 }}>
                      <label style={{ fontSize: 12.5, fontWeight: 600 }}>Nueva contraseña</label>
                      <input className="input" type="password" placeholder="Mínimo 10 caracteres alfanuméricos" required />
                    </div>
                    <div style={{ display: 'grid', gap: 4 }}>
                      <label style={{ fontSize: 12.5, fontWeight: 600 }}>Confirmar nueva contraseña</label>
                      <input className="input" type="password" placeholder="Repite la contraseña" required />
                    </div>
                    <button type="submit" className="btn primary" style={{ justifySelf: 'start', marginTop: 4 }}>
                      Guardar nueva contraseña
                    </button>
                  </form>
                </div>

                {/* Autenticación en Dos Pasos (2FA) */}
                <div className="card">
                  <div className="card-h">
                    <h2 className="sec"><Icon name="shield" className="sm" /> Doble Factor (2FA / MFA)</h2>
                  </div>
                  <div className="card-b" style={{ padding: '16px 20px', display: 'grid', gap: 14, fontSize: 13 }}>
                    <div className="state on">
                      <div className="ico">
                        <Icon name="check" className="lg" />
                      </div>
                      <div className="tx">
                        <b>Autenticador TOTP Activado</b>
                        <small>Google Authenticator / Microsoft Authenticator</small>
                      </div>
                    </div>
                    <p style={{ margin: 0, color: 'var(--muted)', fontSize: 12.5 }}>
                      Cada vez que inicies sesión desde una nueva ubicación se solicitará el código dinámico de 6 dígitos.
                    </p>
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, display: 'flex', gap: 8 }}>
                      <button className="btn sm" onClick={() => alert('Mostrando códigos de recuperación de respaldo')}>
                        Ver códigos de respaldo
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VISTA 13: DATOS FISCALES / PERFIL */}
          {!live && route === 'perfil' && (
            <div style={{ display: 'grid', gap: 20 }}>
              <div className="phead">
                <div>
                  <h1>Datos de Facturación Fiscal</h1>
                  <p className="lead">Información tributaria registrada para emisión de Facturas Electrónicas SUNAT.</p>
                </div>
              </div>

              <div className="card">
                <div className="card-h" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h2 className="sec"><Icon name="building" className="sm" /> Empresa Titular</h2>
                  <span className="chip ok">RUC Habido y Activo</span>
                </div>
                <div className="card-b" style={{ padding: '16px 20px', display: 'grid', gap: 14 }}>
                  <dl className="kv" style={{ gridTemplateColumns: '180px 1fr' }}>
                    <dt>Razón Social</dt>
                    <dd>{CLIENT.name}</dd>
                    <dt>Número de RUC</dt>
                    <dd className="mono">{CLIENT.ruc}</dd>
                    <dt>Dirección Fiscal</dt>
                    <dd>Av. El Sol 845, Oficina 302, Cusco - Perú</dd>
                    <dt>Correo Facturación</dt>
                    <dd>facturacion@andestravel.pe</dd>
                    <dt>Representante Legal</dt>
                    <dd>Lucía Quispe Mamani</dd>
                    <dt>Régimen Tributario</dt>
                    <dd>Régimen MYPE Tributario</dd>
                  </dl>

                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                    <small style={{ color: 'var(--muted)' }}>
                      Para modificaciones de Razón Social o RUC, se requiere adjuntar la Ficha RUC actualizada.
                    </small>
                    <button className="btn sm primary" onClick={() => alert('Solicitud de actualización de datos fiscales enviada a administración.')}>
                      Solicitar Modificación de Datos
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
    </PortalShell>
  );
}
