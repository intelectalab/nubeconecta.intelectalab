import { useEffect, useState } from 'react';
import type { FC, FormEvent, ReactNode } from 'react';
import { Icon } from '@hub/ui';
import { isProblem } from '@hub/api';
import type { Me, MfaVerifyMethod, ProblemError } from '@hub/api';
import { hub } from '../auth/client';

/**
 * Acceso al portal contra /api/v1/auth (Sanctum SPA por cookie):
 * correo y contraseña → segundo factor (TOTP o código de recuperación) si el
 * backend lo pide → cambio de contraseña si password.change_required
 * → onLoggedIn(usuario). Los errores RFC 9457 se muestran en
 * el campo que corresponde o en el aviso general del formulario.
 */
interface LoginViewProps {
  onLoggedIn: (user: Me) => void;
  /** Aviso al volver al acceso (sesión cerrada, sesión vencida, cuenta no válida). */
  notice?: string | null;
  /** Sesión ya iniciada que debe cambiar la contraseña antes de entrar (p. ej. tras recargar). */
  changeFor?: Me | null;
}

const REMEMBER_KEY = 'hub.portal.remember_email';

function readRemembered(): string {
  try {
    return localStorage.getItem(REMEMBER_KEY) ?? '';
  } catch {
    return '';
  }
}

function writeRemembered(email: string | null): void {
  try {
    if (email) localStorage.setItem(REMEMBER_KEY, email);
    else localStorage.removeItem(REMEMBER_KEY);
  } catch {
    /* almacenamiento no disponible: no se recuerda */
  }
}

const problemOf = (e: unknown): ProblemError | null => (isProblem(e) ? e : null);

function generalMessage(e: unknown): string {
  const p = problemOf(e);
  if (!p) return 'Ocurrió un error inesperado. Inténtalo de nuevo.';
  if (p.status === 0) return 'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.';
  if (p.status === 429) return p.detail || 'Demasiados intentos. Espera un momento antes de volver a intentarlo.';
  return p.userMessage;
}

const FieldError: FC<{ msg: string | null | undefined }> = ({ msg }) =>
  msg ? <small className="err" role="alert" style={{ display: 'block', marginTop: 4 }}>{msg}</small> : null;

export const LoginView: FC<LoginViewProps> = ({ onLoggedIn, notice, changeFor }) => {
  const remembered = readRemembered();
  const [authStep, setAuthStep] = useState<1 | 2 | 3>(changeFor ? 3 : 1);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [newPw2, setNewPw2] = useState('');
  const [minLength, setMinLength] = useState<number | null>(null);
  const [email, setEmail] = useState(remembered);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(remembered !== '');
  const [methods, setMethods] = useState<string[]>(['totp', 'recovery']);
  const [authMethod, setAuthMethod] = useState<MfaVerifyMethod>('totp');
  const [otpCode, setOtpCode] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [info, setInfo] = useState<string | null>(notice ?? null);
  const [isLoading, setIsLoading] = useState(false);

  const fail = (e: unknown, fields: string[]) => {
    const p = problemOf(e);
    const fe: Record<string, string> = {};
    for (const f of fields) {
      const m = p?.fieldError(f);
      if (m) fe[f] = m;
    }
    setFieldErrors(fe);
    // Si el error ya está en un campo, no se repite en el aviso general.
    setError(Object.keys(fe).length > 0 && p && Object.keys(p.errors).every((k) => k in fe) ? '' : generalMessage(e));
  };

  const reset = () => {
    setError('');
    setFieldErrors({});
    setInfo(null);
  };

  const handleStep1Submit = async (e: FormEvent) => {
    e.preventDefault();
    reset();
    const fe: Record<string, string> = {};
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) fe.email = 'Escribe un correo válido.';
    if (password === '') fe.password = 'Escribe tu contraseña.';
    if (Object.keys(fe).length > 0) {
      setFieldErrors(fe);
      return;
    }

    setIsLoading(true);
    try {
      const r = await hub.auth.login(email.trim(), password);
      writeRemembered(remember ? email.trim() : null);
      setPassword('');
      if (r.mfa_required) {
        const m = r.methods.length > 0 ? r.methods : ['totp'];
        setMethods(m);
        setAuthMethod(m.includes('totp') ? 'totp' : 'recovery');
        setOtpCode('');
        setAuthStep(2);
      } else {
        finish(r.user);
      }
    } catch (err) {
      fail(err, ['email', 'password']);
    } finally {
      setIsLoading(false);
    }
  };

  /** Cuenta de cliente con contraseña puesta por un administrador o vencida: primero debe cambiarla. */
  const finish = (user: Me) => {
    if (user.type === 'customer' && user.password.change_required) {
      setAuthStep(3);
      return;
    }
    onLoggedIn(user);
  };

  useEffect(() => {
    if (authStep !== 3 || minLength !== null) return;
    hub.auth.passwordPolicy().then(
      (p) => setMinLength(p.min_length),
      () => undefined,
    );
  }, [authStep, minLength]);

  const handleStep3Submit = async (e: FormEvent) => {
    e.preventDefault();
    reset();
    if (newPw !== newPw2) {
      setFieldErrors({ password_confirmation: 'Las contraseñas nuevas no coinciden.' });
      return;
    }
    setIsLoading(true);
    try {
      await hub.auth.changePassword(currentPw, newPw, newPw2);
      setCurrentPw('');
      setNewPw('');
      setNewPw2('');
      onLoggedIn(await hub.auth.me());
    } catch (err) {
      const p = problemOf(err);
      if (p && p.status === 401) {
        setAuthStep(1);
        setError('Tu sesión terminó. Vuelve a ingresar.');
      } else {
        fail(err, ['current_password', 'password', 'password_confirmation']);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const cancelChange = async () => {
    setIsLoading(true);
    try {
      await hub.auth.logout();
    } catch {
      /* la sesión puede haber expirado ya */
    }
    setIsLoading(false);
    setCurrentPw('');
    setNewPw('');
    setNewPw2('');
    reset();
    setAuthStep(1);
  };

  const handleStep2Submit = async (e: FormEvent) => {
    e.preventDefault();
    reset();
    const code = otpCode.trim();
    if (authMethod === 'totp' && code.length !== 6) {
      setFieldErrors({ code: 'Ingresa el código completo de 6 dígitos.' });
      return;
    }
    if (authMethod === 'recovery' && code === '') {
      setFieldErrors({ code: 'Escribe el código de recuperación completo.' });
      return;
    }

    setIsLoading(true);
    try {
      finish(await hub.auth.verifyMfa(authMethod, code));
    } catch (err) {
      const p = problemOf(err);
      // El paso pendiente venció o se agotaron los intentos: volver a empezar.
      if (p && (p.status === 401 || p.status === 419)) {
        setAuthStep(1);
        setOtpCode('');
        setError(p.status === 401 ? 'La verificación venció. Vuelve a ingresar tu correo y contraseña.' : generalMessage(err));
      } else {
        fail(err, ['code', 'method']);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const switchMethod = (m: MfaVerifyMethod) => {
    setAuthMethod(m);
    setOtpCode('');
    reset();
  };

  const backToStep1 = () => {
    setAuthStep(1);
    setOtpCode('');
    reset();
  };

  const submitLabel = (busy: boolean, children: ReactNode) => (busy ? <span className="spin" /> : children);

  const logo = (
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

      {/* Lado Derecho: Formulario conectado a /api/v1/auth */}
      <div className="auth-side">
        {authStep === 1 ? (
          <form className="card auth-card" onSubmit={handleStep1Submit} noValidate>
            <div className="auth-top">
              {logo}
              <span className="badge-client">Portal del Cliente</span>
            </div>

            <div>
              <h1>Ingresa a tu cuenta</h1>
              <p className="s">Usa el correo y la contraseña de tu usuario del portal.</p>
            </div>

            {info && (
              <div className="note" role="status" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', fontSize: 13 }}>
                <Icon name="shield" className="sm" /> <span>{info}</span>
              </div>
            )}

            <div style={{ display: 'grid', gap: 14 }}>
              <label className="field" htmlFor="auMail">
                <span>Correo</span>
                <div className="input-ic">
                  <Icon name="mail" />
                  <input
                    className="input"
                    id="auMail"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="username"
                    placeholder="usuario@empresa.com"
                    aria-invalid={fieldErrors.email ? true : undefined}
                    autoFocus={email === ''}
                    required
                  />
                </div>
                <FieldError msg={fieldErrors.email} />
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
                    aria-invalid={fieldErrors.password ? true : undefined}
                    autoFocus={email !== ''}
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
                <FieldError msg={fieldErrors.password} />
              </label>

              <div className="row-b">
                <label className="check">
                  <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                  Recordar correo en este equipo
                </label>
                <button
                  type="button"
                  className="linkbtn"
                  onClick={() => {
                    reset();
                    setInfo('Pide al administrador de tu organización o a soporte que restablezca tu acceso.');
                  }}
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </div>

              {error && <div className="err" role="alert" style={{ padding: '6px 0' }}>{error}</div>}

              <button className="btn primary lg block" type="submit" disabled={isLoading} style={{ marginTop: 4 }}>
                {submitLabel(
                  isLoading,
                  <>
                    Ingresar <Icon name="arrow" className="sm" />
                  </>,
                )}
              </button>
            </div>
          </form>
        ) : authStep === 3 ? (
          <form className="card auth-card" onSubmit={handleStep3Submit} noValidate>
            <div className="auth-top">
              {logo}
              <span className="badge-client">Portal del Cliente</span>
            </div>

            <div>
              <h1>Cambia tu contraseña</h1>
              <p className="s">Por seguridad debes definir una contraseña nueva antes de continuar.</p>
            </div>

            <div style={{ display: 'grid', gap: 14 }}>
              <label className="field" htmlFor="auPwCur">
                <span>Contraseña actual</span>
                <input
                  className="input"
                  id="auPwCur"
                  type="password"
                  value={currentPw}
                  onChange={(e) => setCurrentPw(e.target.value)}
                  autoComplete="current-password"
                  aria-invalid={fieldErrors.current_password ? true : undefined}
                  autoFocus
                  required
                />
                <FieldError msg={fieldErrors.current_password} />
              </label>

              <label className="field" htmlFor="auPwNew">
                <span>Contraseña nueva</span>
                <input
                  className="input"
                  id="auPwNew"
                  type="password"
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  autoComplete="new-password"
                  minLength={minLength ?? undefined}
                  aria-invalid={fieldErrors.password ? true : undefined}
                  aria-describedby="auPwHelp"
                  required
                />
                {fieldErrors.password ? (
                  <FieldError msg={fieldErrors.password} />
                ) : (
                  <small id="auPwHelp" style={{ display: 'block', marginTop: 4, color: 'var(--muted)' }}>
                    {minLength ? `Mínimo ${minLength} caracteres. No puede repetir contraseñas recientes.` : 'No puede repetir contraseñas recientes.'}
                  </small>
                )}
              </label>

              <label className="field" htmlFor="auPwNew2">
                <span>Repite la contraseña nueva</span>
                <input
                  className="input"
                  id="auPwNew2"
                  type="password"
                  value={newPw2}
                  onChange={(e) => setNewPw2(e.target.value)}
                  autoComplete="new-password"
                  aria-invalid={fieldErrors.password_confirmation ? true : undefined}
                  required
                />
                <FieldError msg={fieldErrors.password_confirmation} />
              </label>

              {error && <div className="err" role="alert" style={{ padding: '6px 0' }}>{error}</div>}

              <button className="btn primary lg block" type="submit" disabled={isLoading}>
                {submitLabel(
                  isLoading,
                  <>
                    <Icon name="check" className="sm" /> Guardar y continuar
                  </>,
                )}
              </button>
            </div>

            <div className="row-b" style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
              <button type="button" className="linkbtn" onClick={() => void cancelChange()} disabled={isLoading}>
                Cerrar sesión
              </button>
            </div>
          </form>
        ) : (
          <form className="card auth-card" onSubmit={handleStep2Submit} noValidate>
            <div className="auth-top">
              {logo}
              <span className="chip ok" style={{ gap: 4 }}>
                <Icon name="shield" className="sm" /> 2FA activo
              </span>
            </div>

            <div>
              <h1>Verificación de identidad</h1>
              <p className="s">
                {authMethod === 'totp'
                  ? 'Confirma que eres tú con el código de 6 dígitos de tu aplicación autenticadora.'
                  : 'Escribe uno de tus códigos de recuperación. Cada código se usa una sola vez.'}
              </p>
            </div>

            {methods.includes('totp') && methods.includes('recovery') && (
              <div className="seg" role="group" aria-label="Método de verificación" style={{ alignSelf: 'start' }}>
                <button type="button" aria-pressed={authMethod === 'totp'} onClick={() => switchMethod('totp')}>
                  <Icon name="phonem" className="sm" /> App autenticadora
                </button>
                <button type="button" aria-pressed={authMethod === 'recovery'} onClick={() => switchMethod('recovery')}>
                  <Icon name="shield" className="sm" /> Código de recuperación
                </button>
              </div>
            )}

            {authMethod === 'totp' && (
              <div className="note" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <Icon name="shield" className="sm" />
                <div style={{ fontSize: 13, lineHeight: 1.4 }}>
                  Abre tu aplicación (Google Authenticator, Microsoft Authenticator o 1Password) y copia el código de <b>AlojamientoPlus</b>.
                </div>
              </div>
            )}

            <div className="otp-box">
              <label className="field" htmlFor="auCode" style={{ textAlign: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                  {authMethod === 'totp' ? 'Código de 6 dígitos' : 'Código de recuperación'}
                </span>
                {authMethod === 'totp' ? (
                  <input
                    key="totp"
                    className="input otp-in"
                    id="auCode"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    aria-invalid={fieldErrors.code ? true : undefined}
                    autoFocus
                    required
                  />
                ) : (
                  <input
                    key="recovery"
                    className="input"
                    id="auCode"
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={64}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    placeholder="Código de recuperación"
                    aria-invalid={fieldErrors.code ? true : undefined}
                    style={{ textAlign: 'center', fontFamily: 'monospace' }}
                    autoFocus
                    required
                  />
                )}
              </label>
              <FieldError msg={fieldErrors.code ?? fieldErrors.method} />
            </div>

            {error && <div className="err" role="alert" style={{ textAlign: 'center' }}>{error}</div>}

            <button className="btn primary lg block" type="submit" disabled={isLoading}>
              {submitLabel(
                isLoading,
                <>
                  <Icon name="check" className="sm" /> Verificar e iniciar sesión
                </>,
              )}
            </button>

            <div className="row-b" style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
              <button type="button" className="linkbtn" onClick={backToStep1}>
                ← Usar otra cuenta
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
