import { useEffect, useState, type FC, type ReactNode } from 'react';
import { Icon } from '@hub/ui';

type LoginBranding = {
  brand_name: string; logo_url: string | null; hero_title: string; hero_subtitle: string;
  bullets: { icon: string; title: string; text: string }[];
  footer_line1: string; footer_line2: string;
  colors: { bg_from: string | null; bg_mid: string | null; bg_to: string | null; accent: string | null };
};
const FALLBACK: LoginBranding = {
  brand_name: 'NubeConecta', logo_url: null,
  hero_title: 'Tu infraestructura en la nube, dominios y finanzas bajo control',
  hero_subtitle: 'Portal seguro para clientes corporativos de NubeConecta. Supervisa tus servidores, renueva dominios, paga facturas con comprobantes SUNAT y contacta a la guardia técnica 24/7.',
  bullets: [
    { icon: 'shield', title: 'Doble factor (TOTP)', text: 'Recomendado: compatible con Google y Microsoft Authenticator.' },
    { icon: 'card', title: 'Pasarela de Pagos Cifrada', text: 'Cancela en soles (PEN) o dólares (USD) con tarjeta, PayPal o transferencia BCP/BBVA.' },
    { icon: 'restore', title: 'Respaldos Diarios Automatizados', text: 'Historial de 14 a 30 días con restauración asistida sin recargo adicional.' },
  ],
  footer_line1: 'NubeConecta · GRUPO DE SOLUCIONES CREATIVAS · RUC 20607431117',
  footer_line2: 'Soporte NOC: guardia@nubeconecta.pe',
  colors: { bg_from: null, bg_mid: null, bg_to: null, accent: null },
};
const STORAGE_KEY = 'nubeconecta.login_branding';
let brandingCache: LoginBranding | null = null;
let brandingRequest: Promise<LoginBranding> | null = null;

/** Guarda mínima para no renderizar un objeto corrupto (el render ya es seguro ante texto). */
function isBranding(v: unknown): v is LoginBranding {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const b = v as LoginBranding;
  return typeof b.brand_name === 'string' && Array.isArray(b.bullets) && !!b.colors && typeof b.colors === 'object';
}
/** Lee el branding cacheado en el navegador (visitas previas): render instantáneo sin esperar la red. */
function readStored(): LoginBranding | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return isBranding(parsed) ? parsed : null;
  } catch { return null; }
}
function writeStored(data: LoginBranding): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* modo privado / almacenamiento bloqueado */ }
}

function useLoginBranding() {
  const [branding, setBranding] = useState<LoginBranding>(() => brandingCache ?? readStored() ?? FALLBACK);
  useEffect(() => {
    let active = true;
    // Revalida siempre en segundo plano; brandingRequest dedupe = un solo fetch por carga.
    brandingRequest ??= fetch('/api/v1/public/login-branding', { credentials: 'omit' }).then((response) => {
      if (!response.ok) throw new Error('No se pudo cargar el branding');
      return response.json() as Promise<{ data: LoginBranding }>;
    }).then(({ data }) => { brandingCache = data; writeStored(data); return data; }).catch((error: unknown) => { brandingRequest = null; throw error; });
    void brandingRequest.then((data) => { if (active) setBranding(data); }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  return branding;
}

/** Marca del portal (logo + nombre). */
export const AuthLogo: FC = () => {
  const brand = useLoginBranding();
  const [first, ...rest] = brand.brand_name.split(/\s+/);
  return <span className="auth-logo">
    {brand.logo_url ? <img src={brand.logo_url} alt={brand.brand_name} style={{ height: 34 }} /> : <svg viewBox="0 0 48 36" aria-hidden="true">
      <path
        d="M37.5 31H12.5a9 9 0 0 1-1.6-17.86A12 12 0 0 1 34 10.4a8.6 8.6 0 0 1 3.5 20.6z"
        fill="none"
        stroke="#5f9a32"
        strokeWidth="3.2"
        strokeLinejoin="round"
      />
      <path
        d="M25.6 9.5 17.8 21h6l-2.2 9.5L31 17.6h-6.2l2.6-8.1z"
        fill="#f2b71a"
        stroke="#f2b71a"
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>}
    <b>
      {rest.length ? <>{first}<span style={brand.colors.accent ? { color: brand.colors.accent } : undefined}>{` ${rest.join(' ')}`}</span></> : brand.brand_name}
    </b>
  </span>;
};

/** Panel de marca del acceso al portal (compartido por acceso, activación y restablecimiento). */
export const AuthArt: FC = () => {
  const brand = useLoginBranding();
  const [first, ...rest] = brand.brand_name.split(/\s+/);
  const colors = brand.colors ?? FALLBACK.colors;
  const background = `radial-gradient(ellipse at 20% 0%, ${colors.bg_from ?? '#17326b'} 0%, ${colors.bg_mid ?? '#0c1833'} 60%, ${colors.bg_to ?? '#060b18'} 100%)`;
  return (
  <>
    {/* Panel Ilustrado / Branding Oficial */}
    <div className="auth-art" style={{ background }}>
      <div>
        <span className="auth-logo" style={{ color: '#fff' }}>
          {brand.logo_url ? <img src={brand.logo_url} alt={brand.brand_name} style={{ height: 34 }} /> :
          <svg viewBox="0 0 48 36" aria-hidden="true" style={{ width: 44, height: 34 }}>
            <path
              d="M37.5 31H12.5a9 9 0 0 1-1.6-17.86A12 12 0 0 1 34 10.4a8.6 8.6 0 0 1 3.5 20.6z"
              fill="none"
              stroke="#5f9a32"
              strokeWidth="3.2"
              strokeLinejoin="round"
            />
            <path
              d="M25.6 9.5 17.8 21h6l-2.2 9.5L31 17.6h-6.2l2.6-8.1z"
              fill="#f2b71a"
              stroke="#f2b71a"
              strokeWidth="1"
              strokeLinejoin="round"
            />
          </svg>}
          <b>
            {rest.length ? <>{first}<span style={{ color: colors.accent ?? '#c9d8ff' }}>{` ${rest.join(' ')}`}</span></> : brand.brand_name}
          </b>
        </span>
      </div>

      <div style={{ display: 'grid', gap: 14 }}>
        <h2>{brand.hero_title}</h2>
        <p>{brand.hero_subtitle}</p>

        <ul>
          {brand.bullets.map((bullet, index) => <li key={`${bullet.icon}-${index}`}>
            <div className="ico"><Icon name={bullet.icon} /></div>
            <div><b>{bullet.title}</b><small>{bullet.text}</small></div>
          </li>)}
        </ul>
      </div>

      <div className="auth-art-foot">
        <span>{brand.footer_line1}</span>
        <span>{brand.footer_line2}</span>
      </div>
    </div>
  </>
  );
};

/** Pantalla completa del acceso: panel de marca + tarjeta a la derecha. */
export const AuthShell: FC<{ children: ReactNode }> = ({ children }) => (
  <div className="auth open" style={{ display: 'grid', position: 'fixed', inset: 0, zIndex: 100 }}>
    <AuthArt />
    <div className="auth-side">{children}</div>
  </div>
);
