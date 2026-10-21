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
import { navCounts } from './app/navCounts';
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
import { initials, useSession } from './auth/session';
import { BRANDS, notifs } from './data/db';
import type { BrandFilter, CurView, RoleName } from './data/types';

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

function BrandOptions() {
  return (
    <>
      <option value="all">Todas las marcas</option>
      {BRANDS.map((b) => (
        <option key={b.id} value={b.id}>
          {b.n}
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
  const { route, param, navSeq, brand, setBrand, cur, setCur, role, setRole, allowed, theme, toggleTheme, navigate, toasts, dismissToast, dialogs, toast, dataVersion, refresh } = app;

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
    document.title = `${ROUTE_META[route].t} · Panel AlojamientoPlus`;
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

  const counts = useMemo(() => navCounts(brand), [brand, dataVersion]);
  const unread = notifs.filter((n) => n.u).length;
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
          <a className="logo" href="#inicio" aria-label="AlojamientoPlus, ir al inicio">
            <LogoMark />
            <b>
              Alojamiento<span>Plus</span>
            </b>
          </a>
          <span className="demo-badge" title="Toda la información mostrada es ficticia">
            Datos de ejemplo
          </span>
          <button type="button" className="tb-search" onClick={() => { setPop(null); setPalOpen(true); }} aria-label="Buscar (Ctrl+K)">
            <Icon name="search" size="sm" />
            <span>Buscar clientes, dominios, facturas…</span>
            <kbd>Ctrl K</kbd>
          </button>
          <div className="tb-spacer" />
          <div className="tb-select">
            <label htmlFor="selBrand">Marca</label>
            <select id="selBrand" aria-label="Filtrar por marca" value={brand} onChange={(e) => setBrand(e.target.value as BrandFilter)}>
              <BrandOptions />
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
            <button ref={btnNotif} type="button" className="tb-btn" onClick={() => setPop((p) => (p === 'notif' ? null : 'notif'))} aria-label={`Notificaciones, ${unread} sin leer`} aria-haspopup="true" aria-expanded={pop === 'notif'}>
              <Icon name="bell" />
              {unread ? <span className="dot">{unread}</span> : null}
            </button>
            <div className={`pop${pop === 'notif' ? ' open' : ''}`} role="region" aria-label="Notificaciones">
              {pop === 'notif' ? (
                <>
                  <div className="pop-h">
                    <b>Notificaciones</b>
                    <button
                      type="button"
                      className="btn ghost sm"
                      autoFocus
                      onClick={() => {
                        notifs.forEach((n) => (n.u = false));
                        refresh();
                        toast('Notificaciones marcadas como leídas', '', 'info');
                      }}
                    >
                      Marcar todo como leído
                    </button>
                  </div>
                  <ul className="pop-list">
                    {notifs.map((n, k) => (
                      <li key={k}>
                        <button
                          type="button"
                          onClick={() => {
                            n.u = false;
                            setPop(null);
                            refresh();
                            navigate(n.r as RouteId);
                          }}
                        >
                          {n.u ? <i className="unread" aria-label="sin leer" /> : <i className="read" />}
                          <Icon name={n.ic} />
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <b style={{ fontWeight: n.u ? 700 : 500 }}>{n.t}</b>
                            <small>
                              {n.s} · {n.at}
                            </small>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
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
                <BrandOptions />
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
