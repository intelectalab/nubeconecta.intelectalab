/**
 * Armazón del portal (demo y real): cabecera con marca, etiqueta de modo, moneda,
 * avisos, asistente y usuario; menú lateral agrupado con tarjeta de cuenta; migas;
 * contenedor de página. El contenido de cada pantalla va como `children`.
 */
import { useState, type ReactNode } from 'react';
import { Icon } from '@hub/ui';
import type { Me } from '@hub/api';
import { AssistantChat } from '../components/AssistantChat';
import { initials } from '../auth/client';
import { CRUMBS, NAV_OF, type NavGroup, type Route } from './routes';

export type Currency = 'PEN' | 'USD';

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
  children: ReactNode;
}

export function PortalShell({ user, account, demo, cur, onCur, route, go, nav, crumb, onLogout, children }: PortalShellProps) {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const roleName = user.roles[0]?.name ?? '';
  const active = NAV_OF[route];
  const link = (r: Route) => (e: React.MouseEvent) => {
    e.preventDefault();
    go(r);
  };

  return (
    <div className="app" id="app">
      <header className="topbar" role="banner">
        <a className="logo" href="#resumen" onClick={link('resumen')}>
          <svg viewBox="0 0 48 36" aria-hidden="true" style={{ width: 42, height: 32, flex: 'none' }}>
            <path d="M37.5 31H12.5a9 9 0 0 1-1.6-17.86A12 12 0 0 1 34 10.4a8.6 8.6 0 0 1 3.5 20.6z" fill="none" stroke="#5f9a32" strokeWidth="3.2" strokeLinejoin="round" />
            <path d="M25.6 9.5 17.8 21h6l-2.2 9.5L31 17.6h-6.2l2.6-8.1z" fill="#f2b71a" stroke="#f2b71a" strokeWidth="1" strokeLinejoin="round" />
          </svg>
          <b>
            Alojamiento<span>Plus</span>
          </b>
          <em>Portal del cliente</em>
        </a>
        <span className={`demo-badge${demo ? '' : ' live'}`} title={demo ? 'Toda la información mostrada es ficticia' : 'Información real de su cuenta'}>
          {demo ? 'Datos de ejemplo' : 'Datos en vivo'}
        </span>

        <div className="tb-spacer" style={{ flex: 1 }} />

        <select className="tb-cur" value={cur} onChange={(e) => onCur(e.target.value as Currency)} title="Moneda">
          <option value="PEN">S/</option>
          <option value="USD">US$</option>
        </select>

        <AssistantChat />

        <button className="tb-btn" title="Notificaciones" aria-label="Notificaciones">
          <Icon name="bell" />
          <span className="tb-dot" />
        </button>

        <div className="anchor">
          <button className="tb-user" aria-label="Usuario" aria-expanded={userMenuOpen} onClick={() => setUserMenuOpen(!userMenuOpen)}>
            <span className="av" style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--brand-soft)', color: 'var(--brand-text)', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 12 }}>
              {initials(user.name)}
            </span>
            <span className="who" style={{ textAlign: 'left', lineHeight: 1.2 }}>
              <strong style={{ fontSize: 13, display: 'block' }}>{user.name}</strong>
              <small style={{ color: 'var(--topbar-muted)', fontSize: 11 }}>{account.name}</small>
            </span>
          </button>

          {userMenuOpen && (
            <div className="pop open umenu" style={{ display: 'block', top: 'calc(100% + 8px)', right: 0, width: 230 }}>
              <div className="who">
                <b>{user.name}</b>
                <small>{user.email}</small>
                <small>
                  {account.name}
                  {roleName ? ` · ${roleName}` : ''}
                </small>
              </div>
              <div className="ttl">Tu cuenta</div>
              <button
                type="button"
                className="mi"
                onClick={() => {
                  go('perfil');
                  setUserMenuOpen(false);
                }}
              >
                <Icon name="building" className="sm" /> Datos de facturación
              </button>
              <button
                type="button"
                className="mi"
                onClick={() => {
                  go('seguridad');
                  setUserMenuOpen(false);
                }}
              >
                <Icon name="shield" className="sm" /> Seguridad y 2FA
              </button>
              <div style={{ height: 1, background: 'var(--border)', margin: '6px 0' }} />
              <button
                type="button"
                className="mi"
                style={{ color: 'var(--danger-text)' }}
                onClick={() => {
                  setUserMenuOpen(false);
                  onLogout();
                }}
                disabled={demo}
                title={demo ? 'No disponible en modo demo' : undefined}
              >
                <Icon name="logout" className="sm" /> Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </header>

      <nav className="sidebar" aria-label="Navegación principal">
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

        <div className="nav-foot">
          <button
            type="button"
            className="nav-item"
            onClick={onLogout}
            disabled={demo}
            style={{ width: '100%', border: 0, background: 'transparent', cursor: 'pointer', textAlign: 'left', font: 'inherit', color: 'var(--muted)', fontSize: 13 }}
          >
            <Icon name="logout" />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </nav>

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
