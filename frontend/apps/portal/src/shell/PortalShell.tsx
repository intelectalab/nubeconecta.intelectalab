/**
 * Armazón del portal (demo y real): cabecera con la misma estructura que el admin
 * (marca, etiqueta de modo, buscador, moneda, avisos, tema y usuario), asistente flotante; menú lateral agrupado con tarjeta de cuenta; migas;
 * contenedor de página. El contenido de cada pantalla va como `children`.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Icon } from '@hub/ui';
import type { Me } from '@hub/api';
import { AssistantChat } from '../components/AssistantChat';
import { initials } from '../auth/client';
import { CRUMBS, NAV_OF, type NavGroup, type Route } from './routes';

export type Currency = 'PEN' | 'USD';

/** Elemento buscable con Ctrl K: servicio, dominio o comprobante del cliente. */
export interface SearchItem {
  kind: 'Servicio' | 'Dominio' | 'Comprobante';
  label: string;
  sub?: string;
  onPick: () => void;
}

/** Aviso de la campana de la cabecera. */
export interface PortalNotif {
  id: string;
  icon: string;
  title: string;
  sub: string;
  route: Route;
  onPick?: () => void;
}

const THEME_KEY = 'portal.theme';
type Theme = 'light' | 'dark';
function storedTheme(): Theme | null {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === 'dark' || t === 'light' ? t : null;
  } catch {
    return null;
  }
}
function systemDark(): boolean {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}
const isMobile = () => window.matchMedia('(max-width:900px)').matches;
const KIND_ICON: Record<SearchItem['kind'], string> = { Servicio: 'server', Dominio: 'globe', Comprobante: 'receipt' };

function MenuIcon() {
  return (
    <svg className="i" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function Palette({ open, onClose, loadItems }: { open: boolean; onClose: () => void; loadItems: () => Promise<SearchItem[]> }) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<SearchItem[]>([]);
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    setQ('');
    setSel(0);
    let alive = true;
    loadItems()
      .then((r) => alive && setItems(r))
      .catch(() => alive && setItems([]));
    setTimeout(() => inputRef.current?.focus(), 0);
    return () => {
      alive = false;
    };
  }, [open, loadItems]);
  const found = useMemo(() => {
    const t = q.trim().toLowerCase();
    return items.filter((i) => !t || `${i.label} ${i.sub ?? ''} ${i.kind}`.toLowerCase().includes(t)).slice(0, 30);
  }, [items, q]);
  if (!open) return null;
  const pick = (i: SearchItem | undefined) => {
    if (!i) return;
    onClose();
    i.onPick();
  };
  return (
    <div className="pal-root" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="pal" role="dialog" aria-modal="true" aria-label="Buscar">
        <div className="pal-in">
          <Icon name="search" />
          <input
            ref={inputRef}
            value={q}
            placeholder="Buscar servicios, dominios, comprobantes…"
            aria-label="Buscar"
            onChange={(e) => {
              setQ(e.target.value);
              setSel(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSel((v) => Math.min(v + 1, found.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSel((v) => Math.max(v - 1, 0));
              } else if (e.key === 'Enter') pick(found[sel]);
            }}
          />
          <kbd>Esc</kbd>
        </div>
        <div className="pal-res">
          {found.length === 0 ? (
            <div className="pal-empty">Sin resultados</div>
          ) : (
            found.map((i, k) => (
              <div key={`${i.kind}-${i.label}-${k}`} className="pal-it" role="option" aria-selected={k === sel} onMouseEnter={() => setSel(k)} onClick={() => pick(i)}>
                <span className="ico">
                  <Icon name={KIND_ICON[i.kind]} />
                </span>
                <span className="grow">
                  <b>{i.label}</b>
                  <small>
                    {i.kind}
                    {i.sub ? ` · ${i.sub}` : ''}
                  </small>
                </span>
              </div>
            ))
          )}
        </div>
        <div className="pal-foot">
          <span>↑↓ navegar</span>
          <span>Enter abrir</span>
          <span>Esc cerrar</span>
        </div>
      </div>
    </div>
  );
}

export interface PortalShellProps {
  user: Me;
  /** Cuenta de cliente mostrada en la tarjeta del menú y bajo el nombre. */
  account: { name: string; tag: string };
  demo: boolean;
  cur: Currency;
  onCur: (c: Currency) => void;
  route: Route;
  go: (r: Route) => void;
  nav: NavGroup[];
  /** Texto de la miga actual; por defecto el nombre de la ruta. */
  crumb?: string;
  onLogout: () => void;
  /** Carga los elementos buscables (servicios, dominios, comprobantes). */
  loadSearch: () => Promise<SearchItem[]>;
  /** Avisos de la campana (facturas vencidas, servicios con incidencias, tickets por responder). */
  notifs?: PortalNotif[];
  /** Vista "ver como cliente" (staff): franja superior de solo lectura con botón para salir. */
  impersonation?: { account: string; onExit: () => void } | null;
  children: ReactNode;
}

export function PortalShell({ user, account, demo, cur, onCur, route, go, nav, crumb, onLogout, loadSearch, notifs = [], impersonation = null, children }: PortalShellProps) {
  const [pop, setPop] = useState<'notif' | 'user' | null>(null);
  const [read, setRead] = useState<Set<string>>(() => new Set());
  const notifRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);
  const [drawer, setDrawer] = useState(false);
  const [palOpen, setPalOpen] = useState(false);
  const [explicit, setExplicit] = useState<Theme | null>(storedTheme);
  const [sysDark, setSysDark] = useState(systemDark);
  const theme: Theme = explicit ?? (sysDark ? 'dark' : 'light');
  useEffect(() => {
    if (explicit) document.documentElement.setAttribute('data-theme', explicit);
  }, [explicit]);
  useEffect(() => {
    let mq: MediaQueryList;
    try {
      mq = window.matchMedia('(prefers-color-scheme: dark)');
    } catch {
      return;
    }
    const on = () => setSysDark(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  const toggleTheme = () => {
    const n: Theme = theme === 'dark' ? 'light' : 'dark';
    setExplicit(n);
    try {
      localStorage.setItem(THEME_KEY, n);
    } catch {
      /* sin almacenamiento: la preferencia dura la sesión */
    }
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    setDrawer(false);
    setPop(null);
  }, [route]);
  /* Cierra los menús de la cabecera al hacer clic fuera o con Escape (devuelve el foco al botón). */
  useEffect(() => {
    if (!pop) return;
    const box = pop === 'notif' ? notifRef : userRef;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setPop(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setPop(null);
      box.current?.querySelector<HTMLButtonElement>('button')?.focus();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [pop]);
  const unread = notifs.filter((n) => !read.has(n.id)).length;
  const loadItems = useCallback(() => loadSearch(), [loadSearch]);
  const roleName = user.roles[0]?.name ?? '';
  const active = NAV_OF[route];
  const link = (r: Route) => (e: React.MouseEvent) => {
    e.preventDefault();
    go(r);
  };

  return (
    <div className={`app${drawer ? " drawer" : ""}${impersonation ? " imp" : ""}`} id="app">
      {impersonation ? (
        <div className="imp-bar" role="status">
          <span>
            Vista de cliente: <b>{impersonation.account}</b> · solo lectura
          </span>
          <button type="button" className="imp-exit" onClick={impersonation.onExit}>
            Salir de la vista
          </button>
        </div>
      ) : null}
      <header className="topbar" role="banner">
        <button type="button" className="tb-btn" onClick={() => { if (isMobile()) setDrawer((v) => !v); }} aria-label="Abrir o plegar menú" aria-controls="sidebar" aria-expanded={drawer}>
          <MenuIcon />
        </button>
        <a className="logo" href="#resumen" onClick={link('resumen')} aria-label="NubeConecta, ir al resumen del portal">
          <svg viewBox="0 0 48 36" aria-hidden="true">
            <path d="M37.5 31H12.5a9 9 0 0 1-1.6-17.86A12 12 0 0 1 34 10.4a8.6 8.6 0 0 1 3.5 20.6z" fill="none" stroke="#5f9a32" strokeWidth="3.2" strokeLinejoin="round" />
            <path d="M25.6 9.5 17.8 21h6l-2.2 9.5L31 17.6h-6.2l2.6-8.1z" fill="#f2b71a" stroke="#f2b71a" strokeWidth="1" strokeLinejoin="round" />
          </svg>
          <b>
            Nube<span>Conecta</span>
          </b>
        </a>
        <span className={`demo-badge${demo ? '' : ' live'}`} title={demo ? 'Toda la información mostrada es ficticia' : 'Información real de su cuenta'}>
          {demo ? 'Datos de ejemplo' : 'Datos en vivo'}
        </span>

        <button type="button" className="tb-search" onClick={() => { setPop(null); setPalOpen(true); }} aria-label="Buscar (Ctrl+K)">
          <Icon name="search" className="sm" />
          <span>Buscar servicios, dominios, comprobantes…</span>
          <kbd>Ctrl K</kbd>
        </button>
        <div className="tb-spacer" />

        <div className="tb-select">
          <label htmlFor="selCur">Moneda</label>
          <select id="selCur" aria-label="Moneda de visualización" value={cur} onChange={(e) => onCur(e.target.value as Currency)}>
            <option value="PEN">Soles (S/)</option>
            <option value="USD">Dólares (US$)</option>
          </select>
        </div>

        <div className="anchor" ref={notifRef}>
          <button type="button" className="tb-btn" onClick={() => setPop((p) => (p === 'notif' ? null : 'notif'))} aria-label={`Notificaciones, ${unread} sin leer`} aria-haspopup="true" aria-expanded={pop === 'notif'}>
            <Icon name="bell" />
            {unread ? <span className="dot">{unread}</span> : null}
          </button>
          <div className={`pop${pop === 'notif' ? ' open' : ''}`} role="region" aria-label="Notificaciones">
            {pop === 'notif' ? (
              <>
                <div className="pop-h">
                  <b>Notificaciones</b>
                  <button type="button" className="btn ghost sm" autoFocus disabled={!unread} onClick={() => setRead(new Set(notifs.map((n) => n.id)))}>
                    Marcar todo como leído
                  </button>
                </div>
                {notifs.length === 0 ? (
                  <div className="pop-empty">No tienes notificaciones nuevas.</div>
                ) : (
                  <ul className="pop-list">
                    {notifs.map((n) => {
                      const isUnread = !read.has(n.id);
                      return (
                        <li key={n.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setRead((s) => new Set(s).add(n.id));
                              setPop(null);
                              if (n.onPick) n.onPick();
                              else go(n.route);
                            }}
                          >
                            {isUnread ? <i className="unread" aria-label="sin leer" /> : <i className="read" />}
                            <Icon name={n.icon} />
                            <span style={{ flex: 1, minWidth: 0 }}>
                              <b style={{ fontWeight: isUnread ? 700 : 500 }}>{n.title}</b>
                              <small>{n.sub}</small>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            ) : null}
          </div>
        </div>

        <button type="button" className="tb-btn" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}>
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
        </button>

        <div className="anchor" ref={userRef}>
          <button type="button" className="tb-user" onClick={() => setPop((p) => (p === 'user' ? null : 'user'))} aria-haspopup="true" aria-expanded={pop === 'user'} aria-label="Menú de usuario">
            <span className="avatar">{initials(user.name)}</span>
            <span className="who">
              <b>{user.name}</b>
              <small>{account.name}</small>
            </span>
          </button>
          <div className={`pop umenu${pop === 'user' ? ' open' : ''}`} style={{ width: 'min(270px,calc(100vw - 24px))' }}>
            {pop === 'user' ? (
              <>
                <div className="who">
                  <b>{user.name}</b>
                  <small>{user.email}</small>
                  <small>
                    {account.name}
                    {roleName ? ` · ${roleName}` : ''}
                  </small>
                  {demo ? <small>Modo demo (sin backend)</small> : null}
                </div>
                <div className="ttl">Tu cuenta</div>
                <button type="button" className="mi" autoFocus onClick={() => { setPop(null); go('perfil'); }}>
                  <Icon name="building" /> Datos de facturación
                </button>
                <button type="button" className="mi" onClick={() => { setPop(null); go('seguridad'); }}>
                  <Icon name="shield" /> Seguridad y 2FA
                </button>
                <button type="button" className="mi" onClick={() => { setPop(null); go('soporte'); }}>
                  <Icon name="msg" /> Centro de soporte
                </button>
                <div style={{ borderTop: '1px solid var(--border)', marginTop: 6, paddingTop: 6 }}>
                  <button
                    type="button"
                    className="mi"
                    onClick={() => {
                      setPop(null);
                      onLogout();
                    }}
                    disabled={demo}
                    title={demo ? 'No disponible en modo demo' : undefined}
                  >
                    <Icon name="logout" /> Cerrar sesión
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </header>

      <div className="scrim" onClick={() => setDrawer(false)} />
      <nav className="sidebar" id="sidebar" aria-label="Navegación principal">
        <div className="acct">
          <div className="ico">
            <Icon name="building" />
          </div>
          <div style={{ minWidth: 0, overflow: 'hidden' }}>
            <b style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{account.name}</b>
            <small>{account.tag}</small>
          </div>
        </div>

        {nav.map((group) => (
          <div key={group.title} className="nav-group">
            <div className="nav-title">
              <span>{group.title}</span>
            </div>
            <div style={{ display: 'grid', gap: 2 }}>
              {group.items.map((item) => (
                <a key={item.id} href={`#${item.id}`} onClick={link(item.id)} className={`nav-item ${active === item.id ? 'active' : ''}`} aria-current={active === item.id ? 'page' : undefined}>
                  <Icon name={item.icon} />
                  <span className="lbl">{item.label}</span>
                  {item.badge ? <span className={`cnt ${item.hot ? 'hot' : ''}`}>{item.badge}</span> : null}
                </a>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <AssistantChat userName={user.name.split(' ')[0]} onOpenTicket={() => go('soporte')} />

      <Palette open={palOpen} onClose={() => setPalOpen(false)} loadItems={loadItems} />

      <main className="main" id="main">
        <div className="page">
          <div className="crumbs">
            <a href="#resumen" onClick={link('resumen')}>
              Portal
            </a>
            <Icon name="cr" className="sm" />
            <span aria-current="page">{crumb ?? CRUMBS[route]}</span>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
