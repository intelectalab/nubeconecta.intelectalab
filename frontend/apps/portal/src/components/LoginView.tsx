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
  const [authMethod, setAuthMethod] = useState<'app' | 'mail'>('app');
  const [otpCode, setOtpCode] = useState('');
  const [trustDevice, setTrustDevice] = useState(true);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleStep1Submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError('Escribe un correo corporativo válido.');
      return;
    }
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }

    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      setAuthStep(2);
    }, 450);
  };

  const handleStep2Submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (otpCode.length !== 6) {
      setError('Ingresa el código completo de 6 dígitos.');
      return;
    }

    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      onLoginSuccess();
    }, 550);
  };

  return (
    <div className="auth open" style={{ display: 'grid', position: 'fixed', inset: 0, zIndex: 100 }}>
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
                <b>Doble Factor Obligatorio (TOTP)</b>
                <small>Autenticación segura compatible con Google y Microsoft Authenticator.</small>
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
          <span>AlojamientoPlus S.A.C. · RUC 20614587231</span>
          <span>Soporte NOC: guardia@alojamientoplus.pe</span>
        </div>
      </div>

      {/* Lado Derecho: Formulario Interactivo */}
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
              <span className="badge-client">Portal del Cliente</span>
            </div>

            <div>
              <h1>Ingresa a tu cuenta</h1>
              <p className="s">Introduce tus credenciales autorizadas de Andes Travel S.A.C.</p>
            </div>

            <div style={{ display: 'grid', gap: 14 }}>
              <label className="field" htmlFor="auMail">
                <span>Correo corporativo</span>
                <div className="input-ic">
                  <Icon name="mail" />
                  <input
                    className="input"
                    id="auMail"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="username"
                    placeholder="usuario@andestravel.pe"
                    required
                  />
                </div>
              </label>

              <label className="field" htmlFor="auPw">
                <span>Contraseña</span>
                <div className="pw">
                  <input
                    className="input"
                    id="auPw"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Escribe tu contraseña"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                  >
                    <Icon name={showPassword ? 'eyeOff' : 'eye'} className="sm" />
                  </button>
                </div>
              </label>

              <div className="row-b">
                <label className="check">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                  />
                  Recordar cuenta
                </label>
                <button
                  type="button"
                  className="linkbtn"
                  onClick={() => alert('Se ha enviado un correo con instrucciones de restablecimiento seguro.')}
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </div>

              {error && <div className="err" role="alert" style={{ padding: '6px 0' }}>{error}</div>}

              <button className="btn primary lg block" type="submit" disabled={isLoading} style={{ marginTop: 4 }}>
                {isLoading ? (
                  <span className="spin" />
                ) : (
                  <>
                    Continuar al Segundo Factor <Icon name="arrow" className="sm" />
                  </>
                )}
              </button>
            </div>

            {onCancel && (
              <div style={{ textAlign: 'center', borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 4 }}>
                <button type="button" className="linkbtn" onClick={onCancel} style={{ color: 'var(--muted)', fontSize: 13 }}>
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
              <span className="chip ok" style={{ gap: 4 }}>
                <Icon name="shield" className="sm" /> 2FA Activo
              </span>
            </div>

            <div>
              <h1>Verificación de Identidad</h1>
              <p className="s">Confirma que eres tú introduciendo el código de seguridad de 6 dígitos.</p>
            </div>

            <div className="seg" role="group" aria-label="Método de verificación" style={{ alignSelf: 'start' }}>
              <button
                type="button"
                aria-pressed={authMethod === 'app'}
                onClick={() => setAuthMethod('app')}
              >
                <Icon name="phonem" className="sm" /> App Autenticadora
              </button>
              <button
                type="button"
                aria-pressed={authMethod === 'mail'}
                onClick={() => setAuthMethod('mail')}
              >
                <Icon name="mail" className="sm" /> Código al Correo
              </button>
            </div>

            <div className="note" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <Icon name={authMethod === 'mail' ? 'mail' : 'shield'} className="sm" />
              <div style={{ fontSize: 13, lineHeight: 1.4 }}>
                {authMethod === 'mail' ? (
                  <span>
                    Enviamos un código temporal a <b>l***e@andestravel.pe</b>. Caduca en 10 minutos.
                  </span>
                ) : (
                  <span>
                    Abre tu aplicación (Google Authenticator, Microsoft Authenticator o 1Password) y copia el código de <b>AlojamientoPlus</b>.
                  </span>
                )}
              </div>
            </div>

            <div className="otp-box">
              <label className="field" htmlFor="auCode" style={{ textAlign: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Código de 6 dígitos</span>
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
              <small style={{ textAlign: 'center' }}>Ingresa solo los números sin espacios</small>
            </div>

            <label className="check" style={{ justifyContent: 'center' }}>
              <input
                type="checkbox"
                checked={trustDevice}
                onChange={(e) => setTrustDevice(e.target.checked)}
              />
              Recordar este dispositivo por 30 días
            </label>

            {error && <div className="err" role="alert" style={{ textAlign: 'center' }}>{error}</div>}

            <button className="btn primary lg block" type="submit" disabled={isLoading}>
              {isLoading ? (
                <span className="spin" />
              ) : (
                <>
                  <Icon name="check" className="sm" /> Verificar e Iniciar Sesión
                </>
              )}
            </button>

            <div className="row-b" style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
              <button
                type="button"
                className="linkbtn"
                onClick={() => {
                  setAuthStep(1);
                  setOtpCode('');
                  setError('');
                }}
              >
                ← Usar otra cuenta
              </button>

              {authMethod === 'mail' ? (
                <button
                  type="button"
                  className="linkbtn"
                  onClick={() => alert('Se ha reenviado un nuevo código dinámico a tu correo.')}
                >
                  Reenviar código
                </button>
              ) : (
                <button
                  type="button"
                  className="linkbtn"
                  onClick={() => alert('Usa uno de tus 8 códigos de respaldo generados en Seguridad y 2FA.')}
                >
                  Código de respaldo
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
