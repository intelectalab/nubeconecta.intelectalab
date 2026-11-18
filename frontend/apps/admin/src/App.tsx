/**
 * Shell del panel administrativo (prototipo/panel.html l.910-944 y l.1355-1426):
 * topbar (logo, buscador, marca, moneda, portal, notificaciones, tema, usuario),
 * sidebar con 7 grupos colapsables y contadores, menú móvil (drawer), paleta
 * Ctrl+K, toasts y diálogos. Renderiza la vista de la ruta activa desde
 * src/app/routes.tsx.
 */
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './styles/panel.css';
import { AppProvider, useApp } from './app/context';
import { navCounts, useLiveNavCounts } from './app/navCounts';
import { Palette } from './app/Palette';
import { GROUPS, ROUTE_META, ROUTE_IDS, href, type GroupName, type RouteId } from './app/routeMeta';
import { VIEWS } from './app/routes';
import { lsGet, lsSet } from './app/storage';
import { applyPanelColor, PORTAL_URL, storedPanelColor } from './app/theme';
import { DialogHost } from './components/dialogs';
import { Icon, LogoMark } from './components/Icon';
import { overlayOpen } from './components/Modal';
import { PageSkeleton } from './components/ui';
import { ViewBoundary } from './components/ViewBoundary';
import { ROLE_NAMES } from './data/config';
import { AuthGate } from './auth/AuthGate';
import { DEMO_MODE } from './auth/client';
import { initials, useSession } from './auth/session';
import { hub } from './auth/client';
import type { Attention, UserNotification } from '@hub/api';
import { filterParam } from './app/filterParam';
import { LIVE, useCan, useLoad } from './views/pages/clientes/shared';
import type { BrandFilter, CurView, RoleName } from './data/types';

interface BellItem {
  key: string;
  n: number;
  label: string;
  icon: string;
  route: RouteId;
  param?: string;
}

/** Tiempo relativo corto en español para el feed de notificaciones. */
function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return 'ahora';
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  if (d < 7) return `hace ${d} d`;
  return new Date(t).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' });
}

const isMobile = () => {
  try {
    return window.matchMedia('(max-width:900px)').matches;
  } catch {
    return false;
  }
};
const reducedMotion = () => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};
const CUR_OPTS: [CurView, string][] = [['orig', 'Original (S/ y US$)'], ['PEN', 'Todo en S/'], ['USD', 'Todo en US$']];

export default function App() {
  return (
    <AuthGate>
      <AppProvider>
        <Shell />
      </AppProvider>
    </AuthGate>
  );
}

function BrandOptions({ brands }: { brands: { id: string; name: string }[] }) {
  return (
    <>
      <option value="all">Todas las marcas</option>
      {brands.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name}
        </option>
      ))}
    </>
  );
}
function CurOptions() {
  return (
    <>
      {CUR_OPTS.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </>
  );
}

function Shell() {
  const app = useApp();
  const session = useSession();
  const me = session.user;
  const can = useCan();
  const canBrands = can('brands.brand.view');
  const brandsLoad = useLoad(
    () => (canBrands ? hub.brands.list({ size: 100, sort: 'code' }).then((r) => r.data.map((b) => ({ id: b.id, name: b.name }))) : Promise.resolve([])),
    [canBrands],
  );
  const brands = brandsLoad.data ?? [];
  const attentionLoad = useLoad<Attention>(() => hub.dashboard.attention(), []);
  // Feed persistente por usuario; si falla (401/403/red) la campana sigue con "Atención hoy".
  const feedLoad = useLoad(() => hub.notifications.feed.list(), []);
  const { route, param, navSeq, brand, setBrand, cur, setCur, role, setRole, allowed, theme, toggleTheme, navigate, toasts, dismissToast, dialogs, toast, dataVersion } = app;

  const [collapsed, setCollapsed] = useState(() => lsGet('ap.collapsed') === '1');
  const [drawer, setDrawer] = useState(false);
  const [navCol, setNavCol] = useState<Set<string>>(() => {
    try {
      const x = JSON.parse(lsGet('ap.navcol') || '[]');
      return new Set(Array.isArray(x) ? (x as string[]) : []);
    } catch {
      return new Set();
    }
  });
  const [pop, setPop] = useState<null | 'notif' | 'user'>(null);
  const [palOpen, setPalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const btnMenu = useRef<HTMLButtonElement>(null);
  const btnNotif = useRef<HTMLButtonElement>(null);
  const btnUser = useRef<HTMLButtonElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const sideRef = useRef<HTMLElement>(null);

  /* Color de panel guardado */
  useEffect(() => {
    const pc = storedPanelColor();
    if (pc) applyPanelColor(pc);
  }, []);

  /* Cambio de ruta: esqueleto breve, scroll arriba, foco en h1, título */
  useEffect(() => {
    setLoading(true);
    setPop(null);
    if (isMobile()) setDrawer(false);
    if (mainRef.current) mainRef.current.scrollTop = 0;
    document.title = `${ROUTE_META[route].t} · Panel NubeConecta`;
    const t = window.setTimeout(() => setLoading(false), reducedMotion() ? 60 : 240);
    return () => window.clearTimeout(t);
  }, [route, param, navSeq]);
  useEffect(() => {
    if (loading) return;
    const h = document.getElementById('ph1');
    h?.focus({ preventScroll: true });
  }, [loading]);

  /* Atajos globales */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPop(null);
        setPalOpen((o) => !o);
        return;
      }
      const el = e.target as HTMLElement;
      const tag = (el.tagName || '').toLowerCase();
      const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
      if (e.key === '/' && !typing && !overlayOpen()) {
        e.preventDefault();
        setPalOpen(true);
        return;
      }
      if (e.key === 'Escape' && !overlayOpen()) {
        if (pop) {
          const b = pop === 'user' ? btnUser.current : btnNotif.current;
          setPop(null);
          b?.focus();
          return;
        }
        if (drawer) {
          setDrawer(false);
          btnMenu.current?.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pop, drawer]);

  /* Cerrar popovers al hacer clic fuera */
  useEffect(() => {
    if (!pop) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!(t instanceof Element) || !t.closest('.anchor')) setPop(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [pop]);

  /* Al pasar a escritorio se cierra el drawer */
  useEffect(() => {
    let tm = 0;
    const onR = () => {
      window.clearTimeout(tm);
      tm = window.setTimeout(() => {
        if (!isMobile()) setDrawer(false);
      }, 120);
    };
    window.addEventListener('resize', onR);
    return () => window.removeEventListener('resize', onR);
  }, []);
  useEffect(() => {
    if (drawer) {
      const a = sideRef.current?.querySelector<HTMLElement>('.nav-item.active') || sideRef.current?.querySelector<HTMLElement>('a');
      a?.focus();
    }
  }, [drawer]);

  const toggleNav = () => {
    if (isMobile()) setDrawer((d) => !d);
    else
      setCollapsed((c) => {
        lsSet('ap.collapsed', c ? '0' : '1');
        return !c;
      });
  };
  const toggleGroup = (g: GroupName) => {
    if (collapsed && !isMobile()) return;
    setNavCol((s) => {
      const n = new Set(s);
      if (n.has(g)) n.delete(g);
      else n.add(g);
      lsSet('ap.navcol', JSON.stringify([...n]));
      return n;
    });
  };
  const changeRole = (r: RoleName) => {
    setPop(null);
    setRole(r);
  };

  const liveCounts = useLiveNavCounts([route, dataVersion]);
  const counts = useMemo(() => ({ ...navCounts(brand), ...liveCounts }), [brand, dataVersion, liveCounts]);
  const bellItems = useMemo<BellItem[]>(() => {
    const d = attentionLoad.data;
    if (!d) return [];
    const items: BellItem[] = [];
    const add = (key: string, v: number | undefined, label: string, icon: string, route: RouteId, param?: string) => {
      if (v !== undefined && v > 0) items.push({ key, n: v, label, icon, route, param });
    };
    add('sla', d.tickets_overdue_sla, 'tickets fuera de SLA', 'msg', 'tickets', filterParam({ status: 'open' }));
    add('pay', d.payments_to_validate, 'pagos por validar', 'wallet', 'cobranza', 'vouchers');
    add('dom', d.domains_expiring_7d, 'dominios por vencer (7 días)', 'globe', 'dominios', filterParam({ d30: '1' }));
    add('inv', d.invoices_due_today, 'facturas que vencen hoy', 'cal', 'cobranza', LIVE ? 'antiguedad' : 'pronto');
    add('crm', d.sales_followups_today, 'seguimientos de hoy', 'activity', 'crm', filterParam({ st: 'open' }));
    return items;
  }, [attentionLoad.data]);
  const feedItems: UserNotification[] = feedLoad.data?.data ?? [];
  const feedUnread = feedLoad.data?.meta.unread_count ?? 0;
  // Badge = pendientes de "Atención hoy" + no leídas del feed (ambos visibles en el popover).
  const bellTotal = bellItems.reduce((s, i) => s + i.n, 0) + feedUnread;
  const markFeedRead = (id: string) => {
    void hub.notifications.feed.markRead(id).then(feedLoad.reload, () => undefined);
  };
  const markFeedAllRead = () => {
    void hub.notifications.feed.markAllRead().then(feedLoad.reload, () => undefined);
  };
  const activeOf = useCallback((k: RouteId) => route === k || ROUTE_META[route].parent === k, [route]);
  const View = VIEWS[route];

  return (
    <>
      <a className="skip" href="#main" onClick={(e) => { e.preventDefault(); mainRef.current?.focus(); }}>
        Saltar al contenido
      </a>
      <div className={['app', collapsed && 'collapsed', drawer && 'drawer'].filter(Boolean).join(' ')} id="app">
        <header className="topbar" role="banner">
          <button ref={btnMenu} type="button" className="tb-btn" onClick={toggleNav} aria-label="Abrir o plegar menú" aria-controls="sidebar" aria-expanded={isMobile() ? drawer : !collapsed}>
            <Icon name="menu" />
          </button>
          <a className="logo" href="#inicio" aria-label="NubeConecta, ir al inicio">
            <LogoMark />
            <b>
              Nube<span>Conecta</span>
            </b>
          </a>
          {DEMO_MODE ? (
            <span className="demo-badge" title="Toda la información mostrada es ficticia">
              Datos de ejemplo
            </span>
          ) : null}
          <button type="button" className="tb-search" onClick={() => { setPop(null); setPalOpen(true); }} aria-label="Buscar (Ctrl+K)">
            <Icon name="search" size="sm" />
            <span>Buscar clientes, dominios, facturas…</span>
            <kbd>Ctrl K</kbd>
          </button>
          <div className="tb-spacer" />
          <div className="tb-select">
            <label htmlFor="selBrand">Marca</label>
            <select id="selBrand" aria-label="Filtrar por marca" value={brand} onChange={(e) => setBrand(e.target.value as BrandFilter)}>
              <BrandOptions brands={brands} />
            </select>
          </div>
          <div className="tb-select">
            <label htmlFor="selCur">Moneda</label>
            <select id="selCur" aria-label="Moneda de visualización" value={cur} onChange={(e) => setCur(e.target.value as CurView)}>
              <CurOptions />
            </select>
          </div>
          <a className="tb-portal" href={PORTAL_URL} target="_blank" rel="noopener" aria-label="Ver portal del cliente (se abre en una pestaña nueva)" title="Ver portal del cliente (pestaña nueva)">
            <Icon name="external" size="sm" />
            <span>Ver portal del cliente</span>
          </a>
          <div className="anchor">
            <button ref={btnNotif} type="button" className="tb-btn" onClick={() => setPop((p) => (p === 'notif' ? null : 'notif'))} aria-label={`Notificaciones, ${bellTotal} pendientes`} aria-haspopup="true" aria-expanded={pop === 'notif'}>
              <Icon name="bell" />
              {bellTotal ? <span className="dot">{bellTotal}</span> : null}
            </button>
            <div className={`pop${pop === 'notif' ? ' open' : ''}`} role="region" aria-label="Notificaciones">
              {pop === 'notif' ? (
                <>
                  <div className="pop-h">
                    <b>Atención hoy</b>
                    <button type="button" className="btn ghost sm" autoFocus onClick={() => { attentionLoad.reload(); feedLoad.reload(); }}>
                      Recargar
                    </button>
                  </div>
                  <ul className="pop-list">
                    {bellItems.length ? (
                      bellItems.map((it) => (
                        <li key={it.key}>
                          <a href={href(it.route, it.param)} onClick={() => setPop(null)}>
                            <Icon name={it.icon} />
                            <span className="pn">
                              <span className="pn-top">
                                <b>{it.label}</b>
                              </span>
                            </span>
                            <span className="pill">{it.n}</span>
                          </a>
                        </li>
                      ))
                    ) : (
                      <li>
                        <p className="pop-empty">{attentionLoad.error ? 'No disponible' : attentionLoad.loading ? 'Cargando…' : 'Sin novedades pendientes'}</p>
                      </li>
                    )}
                  </ul>
                  {feedItems.length ? (
                    <>
                      <div className="pop-h">
                        <b>Mis notificaciones</b>
                        {feedUnread ? (
                          <button type="button" className="btn ghost sm" onClick={markFeedAllRead}>
                            Marcar todo como leído
                          </button>
                        ) : null}
                      </div>
                      <ul className="pop-list">
                        {feedItems.map((n) => {
                          const open = () => {
                            if (!n.read_at) markFeedRead(n.id);
                            setPop(null);
                          };
                          const content = (
                            <>
                              {n.read_at ? <span className="read" /> : <span className="unread" aria-label="No leída" />}
                              <span className="pn">
                                <span className="pn-top">
                                  <b>{n.title}</b>
                                  <span className="pn-when">{relTime(n.created_at)}</span>
                                </span>
                                {n.body ? <small>{n.body}</small> : null}
                              </span>
                            </>
                          );
                          return (
                            <li key={n.id} className={n.read_at ? undefined : 'un'}>
                              {n.link ? (
                                <a href={n.link} onClick={open}>{content}</a>
                              ) : (
                                <button type="button" onClick={open}>{content}</button>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
          <button type="button" className="tb-btn" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}>
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
          </button>
          <div className="anchor">
            <button ref={btnUser} type="button" className="tb-user" onClick={() => setPop((p) => (p === 'user' ? null : 'user'))} aria-haspopup="true" aria-expanded={pop === 'user'} aria-label="Menú de usuario">
              <span className="avatar">{initials(me.name)}</span>
              <span className="who">
                <b>{me.name}</b>
                <small>{me.roles[0]?.name ?? role}</small>
              </span>
            </button>
            <div className={`pop umenu${pop === 'user' ? ' open' : ''}`} style={{ width: 'min(270px,calc(100vw - 24px))' }}>
              {pop === 'user' ? (
                <>
                  <div className="who">
                    <b>{me.name}</b>
                    <small>{me.email}</small>
                    {session.demo ? <small>Modo demo (sin backend)</small> : null}
                  </div>
                  <div className="ttl" id="rolTtl">
                    Rol activo (vista previa)
                  </div>
                  <div role="radiogroup" aria-labelledby="rolTtl">
                    {ROLE_NAMES.map((r, i) => (
                      <button key={r} type="button" className="mi" role="radio" aria-checked={role === r} autoFocus={i === 0} onClick={() => changeRole(r)}>
                        <i className="rdot" />
                        {r}
                      </button>
                    ))}
                  </div>
                  <div style={{ borderTop: '1px solid var(--border)', marginTop: 6, paddingTop: 6 }}>
                    <a className="mi" href={PORTAL_URL} target="_blank" rel="noopener">
                      <Icon name="external" />
                      Ver portal del cliente
                    </a>
                    {allowed('ajustes') ? (
                      <button type="button" className="mi" onClick={() => { setPop(null); navigate('ajustes'); }}>
                        <Icon name="sliders" />
                        Cobranza y SLA
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="mi"
                      onClick={() => {
                        setPop(null);
                        dialogs.confirm({
                          title: '¿Cerrar sesión?',
                          body: session.demo ? 'Modo demo: no hay sesión real que cerrar.' : 'Se cerrará la sesión en este navegador.',
                          okLabel: 'Cerrar sesión',
                          onOk: () => {
                            if (session.demo) toast('Modo demo: sesión simulada', '', 'info');
                            else void session.logout();
                          },
                        });
                      }}
                    >
                      <Icon name="logout" />
                      Cerrar sesión
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </header>

        <nav ref={sideRef} className="sidebar" id="sidebar" aria-label="Navegación principal">
          <div className="drawer-ctx">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <b style={{ fontFamily: 'var(--f-head)', fontSize: 15, color: 'var(--text)' }}>Menú</b>
              <button type="button" className="btn icon sm ghost" onClick={() => setDrawer(false)} aria-label="Cerrar menú">
                <Icon name="x" />
              </button>
            </div>
            <label>
              Marca
              <select className="select" value={brand} onChange={(e) => setBrand(e.target.value as BrandFilter)}>
                <BrandOptions brands={brands} />
              </select>
            </label>
            <label>
              Moneda
              <select className="select" value={cur} onChange={(e) => setCur(e.target.value as CurView)}>
                <CurOptions />
              </select>
            </label>
            <a className="btn sm" href={PORTAL_URL} target="_blank" rel="noopener">
              <Icon name="external" size="sm" />
              Ver portal del cliente
            </a>
          </div>
          {GROUPS.map((g) => {
            const items = ROUTE_IDS.filter((k) => ROUTE_META[k].g === g && !ROUTE_META[k].hidden && allowed(k));
            if (!items.length) return null;
            const hasAct = items.some(activeOf);
            const col = navCol.has(g) && !hasAct;
            return (
              <div key={g} className={`nav-group${col ? ' col' : ''}`} role="group" aria-label={g}>
                <button type="button" className="nav-title" onClick={() => toggleGroup(g)} aria-expanded={!col}>
                  <span>{g}</span>
                  <Icon name="cd" size="sm" />
                </button>
                <div className="nav-items">
                  {items.map((k) => {
                    const r = ROUTE_META[k];
                    const act = activeOf(k);
                    const c = counts[k];
                    return (
                      <a key={k} className={`nav-item${act ? ' active' : ''}`} href={href(k)} aria-current={act ? 'page' : undefined} title={r.t}>
                        <Icon name={r.ic} />
                        <span>{r.t}</span>
                        {c && c[0] ? (
                          <em className={`cnt${c[1] ? ' hot' : ''}`} aria-label={`${c[0]} pendientes`}>
                            {c[0]}
                          </em>
                        ) : null}
                      </a>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <div className="nav-foot">
            <button type="button" className="collapse-btn" onClick={toggleNav} aria-label="Plegar o expandir barra lateral">
              <Icon name="panel" />
              <span>Plegar menú</span>
            </button>
          </div>
        </nav>
        <div className="scrim" onClick={() => setDrawer(false)} />
        <main ref={mainRef} className="main" id="main" tabIndex={-1}>
          <div className="page" key={`${route}|${param ?? ''}|${navSeq}`}>
            {loading ? (
              <PageSkeleton />
            ) : (
              <ViewBoundary title={ROUTE_META[route].t}>
                <Suspense fallback={<PageSkeleton />}>
                  <div className="page-enter">
                    <View route={route} param={param} />
                  </div>
                </Suspense>
              </ViewBoundary>
            )}
          </div>
        </main>
      </div>

      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            <Icon name={t.kind === 'ok' ? 'check' : t.kind === 'err' ? 'oct' : t.kind === 'warn' ? 'tri' : 'info'} />
            <div>
              <b>{t.t}</b>
              {t.s ? <small>{t.s}</small> : null}
            </div>
            <button type="button" aria-label="Cerrar aviso" onClick={() => dismissToast(t.id)}>
              <Icon name="x" size="sm" />
            </button>
          </div>
        ))}
      </div>
      <DialogHost />
      <Palette open={palOpen} onClose={() => setPalOpen(false)} />
    </>
  );
}
