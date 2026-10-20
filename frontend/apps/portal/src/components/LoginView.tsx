import { useState } from 'react';
import type { FC } from 'react';
import { Icon } from '@hub/ui';

interface LoginModalProps {
  onLoginSuccess: () => void;
  onCancel?: () => void;
}

export const LoginView: FC<LoginModalProps> = ({ onLoginSuccess, onCancel }) => {
  const [authStep, setAuthStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState('lucia.quispe@andestravel.pe');
  const [password, setPassword] = useState('admin123456');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [authMethod, setAuthMethod] = useState<'mail' | 'app'>('app');
  const [otpCode, setOtpCode] = useState('');
  const [trustDevice, setTrustDevice] = useState(true);
  const [error, setError] = useState('');

  const handleStep1Submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError('Escribe un correo electrónico válido.');
      return;
    }
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    setAuthStep(2);
  };

  const handleStep2Submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (otpCode.length !== 6) {
      setError('El código dinámico consta de 6 dígitos.');
      return;
    }
    onLoginSuccess();
  };

  return (
    <div className="auth open" style={{ display: 'grid', position: 'fixed', inset: 0, zIndex: 100 }}>
      {/* Ilustración / Brand Panel Izquierdo */}
      <div className="auth-art">
        <div>
          <span className="auth-logo" style={{ color: '#fff' }}>
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
              Alojamiento<span style={{ color: 'var(--topbar-muted)' }}>Plus</span>
            </b>
          </span>
        </div>

        <div>
          <h2>Tu web, tu correo y tus pagos en un solo lugar</h2>
          <p>Portal del cliente de AlojamientoPlus: consulta servicios, paga en línea y conversa con soporte técnico.</p>
        </div>

        <ul>
          <li>
            <Icon name="shield" />
            <span>Acceso protegido con verificación en dos pasos (2FA)</span>
          </li>
          <li>
            <Icon name="card" />
            <span>Pagos en línea con tarjeta, PayPal o transferencia</span>
          </li>
          <li>
            <Icon name="msg" />
            <span>Soporte NOC en español 24/7 para incidencias y urgencias</span>
          </li>
        </ul>
      </div>

      {/* Formulario Derecho */}
      <div className="auth-side">
        {authStep === 1 ? (
          <form className="card auth-card" onSubmit={handleStep1Submit} noValidate>
            <div className="auth-top">
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
              <span className="demo-badge">Portal del cliente</span>
            </div>

            <div>
              <h1>Ingresa a tu portal</h1>
              <p className="s">Gestiona tus servicios, facturación fiscal y soporte.</p>
            </div>

            <label className="field" htmlFor="auMail">
              Correo electrónico
              <input
                className="input"
                id="auMail"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                required
              />
            </label>

            <label className="field" htmlFor="auPw">
              Contraseña
              <span className="pw">
                <input
                  className="input"
                  id="auPw"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label="Mostrar u ocultar contraseña"
                >
                  <Icon name={showPassword ? 'eyeOff' : 'eye'} className="sm" />
                </button>
              </span>
            </label>

            <div className="row-b">
              <label className="check">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                Recordar mi correo
              </label>
              <button
                type="button"
                className="linkbtn"
                onClick={() => alert('Se ha enviado un enlace de recuperación a tu correo corporativo.')}
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>

            {error && <div className="err" role="alert">{error}</div>}

            <button className="btn primary lg block" type="submit">
              Continuar al Segundo Factor →
            </button>

            {onCancel && (
              <div style={{ textAlign: 'center', marginTop: 4 }}>
                <button type="button" className="linkbtn" onClick={onCancel}>
                  ← Volver al portal
                </button>
              </div>
            )}
          </form>
        ) : (
          <form className="card auth-card" onSubmit={handleStep2Submit} noValidate>
            <div className="auth-top">
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
            </div>

            <div>
              <h1>Verificación en dos pasos</h1>
              <p className="s">Confirma tu identidad con el código dinámico de 6 dígitos.</p>
            </div>

            <div className="seg" role="group" aria-label="Método de verificación" style={{ alignSelf: 'start' }}>
              <button
                type="button"
                aria-pressed={authMethod === 'app'}
                onClick={() => setAuthMethod('app')}
              >
                <Icon name="phonem" className="sm" /> App de autenticación
              </button>
              <button
                type="button"
                aria-pressed={authMethod === 'mail'}
                onClick={() => setAuthMethod('mail')}
              >
                <Icon name="mail" className="sm" /> Código al correo
              </button>
            </div>

            <div className="note" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <Icon name={authMethod === 'mail' ? 'mail' : 'shield'} className="sm" />
              <span>
                {authMethod === 'mail'
                  ? 'Enviamos un código de 6 dígitos a l***e@andestravel.pe. Válido por 10 minutos.'
                  : 'Abre tu app autenticadora (Google o Microsoft Authenticator) e introduce el código temporal.'}
              </span>
            </div>

            <label className="field" htmlFor="auCode">
              Código de verificación
              <input
                className="input otp-in"
                id="auCode"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                autoFocus
                required
              />
            </label>

            <label className="check">
              <input
                type="checkbox"
                checked={trustDevice}
                onChange={(e) => setTrustDevice(e.target.checked)}
              />
              Confiar en este equipo por 30 días
            </label>

            {error && <div className="err" role="alert">{error}</div>}

            <button className="btn primary lg block" type="submit">
              Verificar e Ingresar
            </button>

            <div className="row-b">
              <button
                type="button"
                className="linkbtn"
                onClick={() => {
                  setAuthStep(1);
                  setOtpCode('');
                  setError('');
                }}
              >
                Usar otra cuenta
              </button>
              {authMethod === 'mail' ? (
                <button
                  type="button"
                  className="linkbtn"
                  onClick={() => alert('Código reenviado a tu correo.')}
                >
                  Reenviar código
                </button>
              ) : (
                <button
                  type="button"
                  className="linkbtn"
                  onClick={() => alert('Ingresa uno de tus 8 códigos alfanuméricos de respaldo descargados al activar 2FA.')}
                >
                  Usar código de recuperación
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
