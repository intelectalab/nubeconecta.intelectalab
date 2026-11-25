/**
 * Protección del shell (M-IDN): al cargar llama a GET /auth/me; sin sesión
 * muestra el acceso en pasos:
 *   correo + contraseña → [MFA: TOTP o código de recuperación]
 *   → [cambio de contraseña obligatorio] → [alta de TOTP obligatoria] → panel.
 * Con VITE_DEMO=1 se salta todo y se usa un usuario de demostración.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { isProblem, type Me, type MfaVerifyMethod, type TotpConfirmation, type TotpEnrollment } from '@hub/api';
import '../styles/panel.css';
import './auth.css';
import { Icon, LogoMark } from '../components/Icon';
import { SESSION_USER } from '../data/config';
import { DEMO_MODE, hub, onUnauthenticated } from './client';
import { QrCode } from './QrCode';
import { SessionContext, type Session } from './session';

type Stage =
  | { k: 'loading' }
  | { k: 'login'; notice?: string }
  | { k: 'mfa'; methods: string[] }
  | { k: 'password'; user: Me }
  | { k: 'enroll'; user: Me }
  | { k: 'ready'; user: Me };

const DEMO_USER: Me = {
  id: 'demo',
  type: 'staff',
  name: SESSION_USER.name,
  email: SESSION_USER.email,
  status: 'active',
  locale: 'es',
  timezone: 'America/Lima',
  mfa_enabled: true,
  mfa_method: 'totp',
  must_change_password: false,
  locked_until: null,
  last_login_at: null,
  disabled_at: null,
  roles: [],
  version: 1,
  created_at: null,
  updated_at: null,
  permissions: [],
  mfa: { enabled: true, method: 'totp', required: true, enrollment_required: false },
  password: { change_required: false },
};

const errMsg = (e: unknown): string => (isProblem(e) ? e.userMessage : 'Ocurrió un error inesperado.');

/** Siguiente paso obligatorio según /me. */
function nextStage(user: Me): Stage {
  if (user.password.change_required) return { k: 'password', user };
  if (user.mfa.enrollment_required) return { k: 'enroll', user };
  return { k: 'ready', user };
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [stage, setStage] = useState<Stage>(() => (DEMO_MODE ? { k: 'ready', user: DEMO_USER } : { k: 'loading' }));
  const [bootError, setBootError] = useState<string | null>(null);

  /** El panel es solo para personal (type=staff); el backend además responde 403 en /admin. */
  const enter = useCallback((user: Me) => {
    if (user.type !== 'staff') {
      hub.auth.logout().catch(() => undefined);
      setStage({ k: 'login', notice: 'Esta cuenta es de cliente: ingresa por el portal del cliente.' });
      return;
    }
    setStage(nextStage(user));
  }, []);

  const loadMe = useCallback(async () => {
    setBootError(null);
    try {
      enter(await hub.auth.me());
    } catch (e) {
      if (isProblem(e) && e.status === 401) setStage({ k: 'login' });
      else {
        setBootError(errMsg(e));
        setStage({ k: 'login' });
      }
    }
  }, [enter]);

  useEffect(() => {
    if (DEMO_MODE) return;
    void loadMe();
    return onUnauthenticated(() =>
      setStage((s) => (s.k === 'ready' || s.k === 'password' || s.k === 'enroll' ? { k: 'login', notice: 'Tu sesión terminó. Vuelve a ingresar.' } : s)),
    );
  }, [loadMe]);

  const logout = useCallback(async () => {
    if (DEMO_MODE) return;
    try {
      await hub.auth.logout();
    } catch {
      /* la sesión puede haber expirado ya */
    }
    setStage({ k: 'login', notice: 'Sesión cerrada.' });
  }, []);

  const session = useMemo<Session | null>(() => {
    if (stage.k !== 'ready') return null;
    const user = stage.user;
    return {
      user,
      demo: DEMO_MODE,
      logout,
      handleApiError: (e) => {
        if (!DEMO_MODE && isProblem(e) && e.status === 403 && e.code === 'mfa_required' && !user.mfa.enabled) {
          setStage({ k: 'enroll', user });
          return true;
        }
        return false;
      },
    };
  }, [stage, logout]);

  if (session) return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;

  if (stage.k === 'loading') {
    return (
      <AuthFrame>
        <div className="auth-loading" role="status">
          <span className="auth-spin" aria-hidden="true" />
          Comprobando sesión…
        </div>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame>
      {stage.k === 'login' ? (
        <LoginStep
          notice={stage.notice}
          bootError={bootError}
          onDone={(r) => {
            setBootError(null);
            if (r.mfa_required) setStage({ k: 'mfa', methods: r.methods });
            else enter(r.user);
          }}
        />
      ) : null}
      {stage.k === 'mfa' ? <MfaStep methods={stage.methods} onBack={() => setStage({ k: 'login' })} onDone={enter} /> : null}
      {stage.k === 'password' ? <PasswordStep onDone={loadMe} onCancel={logout} /> : null}
      {stage.k === 'enroll' ? <EnrollStep user={stage.user} onDone={loadMe} onCancel={logout} /> : null}
    </AuthFrame>
  );
}

/* ------------------------------------------------------------------ UI */

function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <div className="auth-wrap">
      <main className="auth-card card" aria-labelledby="authTtl">
        <div className="auth-brand">
          <span className="auth-logo">
            <LogoMark />
          </span>
          <div>
            <b>NubeConecta</b>
            <small>Panel administrativo</small>
          </div>
        </div>
        {children}
      </main>
      <p className="auth-foot">Acceso restringido al personal autorizado. Las acciones quedan registradas.</p>
    </div>
  );
}

function ErrorNote({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return (
    <div className="note auth-err" role="alert">
      <Icon name="oct" />
      <span>{msg}</span>
    </div>
  );
}

function Submit({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <button type="submit" className="btn primary auth-submit" disabled={busy} aria-busy={busy}>
      {busy ? <span className="spin" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

function useBusy() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, setError, run };
}

/* Paso 1: correo y contraseña */
function LoginStep({ notice, bootError, onDone }: { notice?: string; bootError: string | null; onDone: (r: Awaited<ReturnType<typeof hub.auth.login>>) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const { busy, error, run } = useBusy();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => onDone(await hub.auth.login(email.trim(), password)));
  };

  return (
    <form onSubmit={submit} noValidate>
      <h1 id="authTtl" className="auth-ttl">Iniciar sesión</h1>
      <p className="auth-sub">Ingresa con tu correo corporativo.</p>
      {notice && !error ? (
        <div className="note" role="status">
          <Icon name="info" />
          <span>{notice}</span>
        </div>
      ) : null}
      <ErrorNote msg={error ?? (bootError ? `No se pudo comprobar la sesión: ${bootError}` : null)} />
      <label className="field">
        Correo electrónico
        <span className="input-ic">
          <Icon name="mail" className="i" />
          <input className="input" type="email" autoComplete="username" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
        </span>
      </label>
      <label className="field">
        Contraseña
        <span className="input-ic auth-pw">
          <Icon name="lock" className="i" />
          <input className="input" type={show ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          <button type="button" className="btn icon sm ghost" onClick={() => setShow((s) => !s)} aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={show}>
            <Icon name="eye" />
          </button>
        </span>
      </label>
      <Submit busy={busy}>Continuar</Submit>
    </form>
  );
}

/* Paso 2: segundo factor */
function MfaStep({ methods, onBack, onDone }: { methods: string[]; onBack: () => void; onDone: (u: Me) => void }) {
  const canTotp = methods.includes('totp');
  const [method, setMethod] = useState<MfaVerifyMethod>(canTotp ? 'totp' : 'recovery');
  const [code, setCode] = useState('');
  const { busy, error, setError, run } = useBusy();
  const input = useRef<HTMLInputElement>(null);

  const switchMethod = (m: MfaVerifyMethod) => {
    setMethod(m);
    setCode('');
    setError(null);
    input.current?.focus();
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => onDone(await hub.auth.verifyMfa(method, code.trim())));
  };

  return (
    <form onSubmit={submit} noValidate>
      <h1 id="authTtl" className="auth-ttl">Verificación en dos pasos</h1>
      <p className="auth-sub">
        {method === 'totp' ? 'Escribe el código de 6 dígitos de tu aplicación de autenticación.' : 'Escribe uno de tus códigos de recuperación. Cada código sirve una sola vez.'}
      </p>
      <ErrorNote msg={error} />
      <label className="field">
        {method === 'totp' ? 'Código de verificación' : 'Código de recuperación'}
        <span className="input-ic">
          <Icon name={method === 'totp' ? 'shield' : 'key'} className="i" />
          <input
            ref={input}
            className="input auth-code"
            autoFocus
            required
            value={code}
            onChange={(e) => setCode(method === 'totp' ? e.target.value.replace(/\D/g, '').slice(0, 6) : e.target.value)}
            inputMode={method === 'totp' ? 'numeric' : 'text'}
            autoComplete="one-time-code"
            maxLength={method === 'totp' ? 6 : 64}
            spellCheck={false}
          />
        </span>
      </label>
      <Submit busy={busy}>Verificar</Submit>
      <div className="auth-links">
        {canTotp ? (
          <button type="button" className="btn ghost sm" onClick={() => switchMethod(method === 'totp' ? 'recovery' : 'totp')}>
            {method === 'totp' ? 'Usar un código de recuperación' : 'Usar la aplicación de autenticación'}
          </button>
        ) : null}
        <button type="button" className="btn ghost sm" onClick={onBack}>
          <Icon name="cl" />
          Volver
        </button>
      </div>
    </form>
  );
}

/* Paso 3: cambio de contraseña obligatorio */
function PasswordStep({ onDone, onCancel }: { onDone: () => Promise<void>; onCancel: () => Promise<void> }) {
  const [current, setCurrent] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [minLength, setMinLength] = useState<number | null>(null);
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});
  const { busy, error, setError, run } = useBusy();

  useEffect(() => {
    hub.auth.passwordPolicy().then(
      (p) => setMinLength(p.min_length),
      () => undefined,
    );
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setFieldErr({});
    if (pw !== pw2) {
      setError('Las contraseñas nuevas no coinciden.');
      return;
    }
    void run(async () => {
      try {
        await hub.auth.changePassword(current, pw, pw2);
      } catch (err) {
        if (isProblem(err) && Object.keys(err.errors).length) {
          setFieldErr(Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, v[0] ?? ''])));
        }
        throw err;
      }
      await onDone();
    });
  };

  return (
    <form onSubmit={submit} noValidate>
      <h1 id="authTtl" className="auth-ttl">Cambia tu contraseña</h1>
      <p className="auth-sub">Por seguridad debes definir una contraseña nueva antes de continuar.</p>
      <ErrorNote msg={error} />
      <label className="field">
        Contraseña actual
        <input className="input" type="password" autoComplete="current-password" autoFocus required value={current} onChange={(e) => setCurrent(e.target.value)} aria-invalid={!!fieldErr.current_password} />
        {fieldErr.current_password ? <small className="auth-ferr">{fieldErr.current_password}</small> : null}
      </label>
      <label className="field">
        Contraseña nueva
        <input className="input" type="password" autoComplete="new-password" required minLength={minLength ?? undefined} value={pw} onChange={(e) => setPw(e.target.value)} aria-invalid={!!fieldErr.password} aria-describedby="pwHelp" />
        <small id="pwHelp" className={fieldErr.password ? 'auth-ferr' : 'auth-help'}>
          {fieldErr.password ?? (minLength ? `Mínimo ${minLength} caracteres. No puede repetir contraseñas recientes.` : 'No puede repetir contraseñas recientes.')}
        </small>
      </label>
      <label className="field">
        Repite la contraseña nueva
        <input className="input" type="password" autoComplete="new-password" required value={pw2} onChange={(e) => setPw2(e.target.value)} />
      </label>
      <Submit busy={busy}>Guardar y continuar</Submit>
      <div className="auth-links">
        <button type="button" className="btn ghost sm" onClick={() => void onCancel()}>
          <Icon name="logout" />
          Cerrar sesión
        </button>
      </div>
    </form>
  );
}

/* Paso 4: alta de TOTP obligatoria */
function EnrollStep({ user, onDone, onCancel }: { user: Me; onDone: () => Promise<void>; onCancel: () => Promise<void> }) {
  const [enroll, setEnroll] = useState<TotpEnrollment | null>(null);
  const [done, setDone] = useState<TotpConfirmation | null>(null);
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const start = useBusy();
  const confirm = useBusy();
  const started = useRef(false);

  const begin = useCallback(() => {
    void start.run(async () => {
      try {
        setEnroll(await hub.auth.startTotp());
      } catch (err) {
        // 409: el segundo factor ya está activo → continuar.
        if (isProblem(err) && err.status === 409) return onDone();
        throw err;
      }
    });
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    begin();
  }, [begin]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void confirm.run(async () => setDone(await hub.auth.confirmTotp(code.trim())));
  };

  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).then(
      () => setCopied(true),
      () => undefined,
    );
  };

  if (done) {
    return (
      <div>
        <h1 id="authTtl" className="auth-ttl">Guarda tus códigos de recuperación</h1>
        <p className="auth-sub">Úsalos si pierdes acceso a tu aplicación. Cada código sirve una vez y no se volverán a mostrar.</p>
        <ul className="auth-codes" aria-label="Códigos de recuperación">
          {done.recovery_codes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <div className="auth-links">
          <button type="button" className="btn sm" onClick={() => copy(done.recovery_codes.join('\n'))}>
            <Icon name={copied ? 'check' : 'file'} />
            {copied ? 'Copiados' : 'Copiar códigos'}
          </button>
        </div>
        <label className="auth-check">
          <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
          Guardé los códigos en un lugar seguro
        </label>
        <button type="button" className="btn primary auth-submit" disabled={!saved || confirm.busy} onClick={() => void confirm.run(onDone)}>
          Entrar al panel
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate>
      <h1 id="authTtl" className="auth-ttl">Activa la verificación en dos pasos</h1>
      <p className="auth-sub">Tu cuenta ({user.email}) requiere un segundo factor. Escanea el código con una aplicación de autenticación (Google Authenticator, Microsoft Authenticator, 1Password…).</p>
      <ErrorNote msg={start.error ?? confirm.error} />
      {start.busy && !enroll ? (
        <div className="auth-loading" role="status">
          <span className="auth-spin" aria-hidden="true" />
          Generando clave…
        </div>
      ) : null}
      {!enroll && start.error ? (
        <button type="button" className="btn" onClick={begin}>
          <Icon name="refresh" />
          Reintentar
        </button>
      ) : null}
      {enroll ? (
        <>
          <div className="auth-enroll">
            <QrCode value={enroll.otpauth_uri} label="Código QR para la aplicación de autenticación" />
            <div className="auth-secret">
              <span className="field">Clave para ingreso manual</span>
              <code>{enroll.secret.replace(/(.{4})/g, '$1 ').trim()}</code>
              <button type="button" className="btn sm" onClick={() => copy(enroll.secret)}>
                <Icon name={copied ? 'check' : 'file'} />
                {copied ? 'Copiada' : 'Copiar clave'}
              </button>
              <details>
                <summary>Ver URI otpauth</summary>
                <code className="auth-uri">{enroll.otpauth_uri}</code>
              </details>
            </div>
          </div>
          <label className="field">
            Código de 6 dígitos
            <span className="input-ic">
              <Icon name="shield" className="i" />
              <input className="input auth-code" inputMode="numeric" autoComplete="one-time-code" required maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
            </span>
          </label>
          <Submit busy={confirm.busy}>Confirmar</Submit>
        </>
      ) : null}
      <div className="auth-links">
        <button type="button" className="btn ghost sm" onClick={() => void onCancel()}>
          <Icon name="logout" />
          Cerrar sesión
        </button>
      </div>
    </form>
  );
}
