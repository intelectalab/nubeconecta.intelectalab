import type { FC, ReactNode } from 'react';
import { Icon } from '@hub/ui';

/** Marca del portal (logo + nombre). */
export const AuthLogo: FC = () => (
  <span className="auth-logo">
    <svg viewBox="0 0 48 36" aria-hidden="true">
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
    </svg>
    <b>
      Alojamiento<span>Plus</span>
    </b>
  </span>
);

/** Panel de marca del acceso al portal (compartido por acceso, activación y restablecimiento). */
export const AuthArt: FC = () => (
  <>
    {/* Panel Ilustrado / Branding Oficial */}
    <div className="auth-art">
      <div>
        <span className="auth-logo" style={{ color: '#fff' }}>
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
          </svg>
          <b>
            Alojamiento<span style={{ color: '#c9d8ff' }}>Plus</span>
          </b>
        </span>
      </div>

      <div style={{ display: 'grid', gap: 14 }}>
        <h2>Tu infraestructura en la nube, dominios y finanzas bajo control</h2>
        <p>
          Portal seguro para clientes corporativos de AlojamientoPlus. Supervisa tus servidores, renueva dominios, paga facturas con comprobantes SUNAT y contacta a la guardia técnica 24/7.
        </p>

        <ul>
          <li>
            <div className="ico"><Icon name="shield" /></div>
            <div>
              <b>Doble factor (TOTP)</b>
              <small>Recomendado: compatible con Google y Microsoft Authenticator.</small>
            </div>
          </li>
          <li>
            <div className="ico"><Icon name="card" /></div>
            <div>
              <b>Pasarela de Pagos Cifrada</b>
              <small>Cancela en soles (PEN) o dólares (USD) con tarjeta, PayPal o transferencia BCP/BBVA.</small>
            </div>
          </li>
          <li>
            <div className="ico"><Icon name="restore" /></div>
            <div>
              <b>Respaldos Diarios Automatizados</b>
              <small>Historial de 14 a 30 días con restauración asistida sin recargo adicional.</small>
            </div>
          </li>
        </ul>
      </div>

      <div className="auth-art-foot">
        <span>AlojamientoPlus · GRUPO DE SOLUCIONES CREATIVAS · RUC 20607431117</span>
        <span>Soporte NOC: guardia@alojamientoplus.pe</span>
      </div>
    </div>
  </>
);

/** Pantalla completa del acceso: panel de marca + tarjeta a la derecha. */
export const AuthShell: FC<{ children: ReactNode }> = ({ children }) => (
  <div className="auth open" style={{ display: 'grid', position: 'fixed', inset: 0, zIndex: 100 }}>
    <AuthArt />
    <div className="auth-side">{children}</div>
  </div>
);
