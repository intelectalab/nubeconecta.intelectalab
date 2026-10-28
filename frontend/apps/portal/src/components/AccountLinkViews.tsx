import { useEffect, useMemo, useState } from 'react';
import type { FC, FormEvent, ReactNode } from 'react';
import { Icon } from '@hub/ui';
import { isProblem } from '@hub/api';
import type { PasswordPolicy, ProblemError } from '@hub/api';
import { hub } from '../auth/client';
import { AuthLogo, AuthShell } from './AuthFrame';

/**
 * Pantallas públicas del portal sin sesión:
 *   #/activar?token=…     Activa tu cuenta (invitación) → crea la contraseña
 *   #/olvide              ¿Olvidaste tu contraseña? → pide el enlace por correo
 *   #/restablecer?token=… Restablece la contraseña
 * El token se lee del hash y se quita de la barra de direcciones al cargar.
 */
export type PublicRoute = { name: 'activar' | 'restablecer'; token: string } | { name: 'olvide' };

export function parsePublicRoute(hash: string): PublicRoute | null {
  const m = /^#\/?(activar|restablecer|olvide)(?:\?(.*))?$/.exec(hash);
  if (!m) return null;
  if (m[1] === 'olvide') return { name: 'olvide' };
  return { name: m[1] as 'activar' | 'restablecer', token: new URLSearchParams(m[2] ?? '').get('token') ?? '' };
}

/** Ruta pública vigente; el token sobrevive en memoria aunque se limpie el hash. */
export function usePublicRoute(): [PublicRoute | null, () => void] {
  const [route, setRoute] = useState<PublicRoute | null>(() => parsePublicRoute(window.location.hash));
  useEffect(() => {
    const on = () => {
      const r = parsePublicRoute(window.location.hash);
      // Al quitar el token del hash (replaceState no dispara hashchange) se conserva el de memoria.
      setRoute((prev) => (r && r.name !== 'olvide' && r.token === '' && prev && prev.name === r.name ? prev : r));
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  useEffect(() => {
    if (route && route.name !== 'olvide' && window.location.hash.includes('token=')) {
      history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/${route.name}`);
    }
  }, [route]);
  const leave = () => {
    history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    setRoute(null);
  };
  return [route, leave];
}

const problemOf = (e: unknown): ProblemError | null => (isProblem(e) ? e : null);

function generalMessage(e: unknown): string {
  const p = problemOf(e);
  if (!p) return 'Ocurrió un error inesperado. Inténtalo de nuevo.';
  if (p.status === 0) return 'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.';
  if (p.status === 429) return 'Demasiados intentos. Espera un momento antes de volver a intentarlo.';
  return p.userMessage;
}

const FieldError: FC<{ msg: string | null | undefined }> = ({ msg }) =>
  msg ? <small className="err" role="alert" style={{ display: 'block', marginTop: 4 }}>{msg}</small> : null;

const Card: FC<{ title: string; sub?: ReactNode; children: ReactNode; onSubmit?: (e: FormEvent) => void }> = ({ title, sub, children, onSubmit }) => {
  const body = (
    <>
      <div className="auth-top">
        <AuthLogo />
        <span className="badge-client">Portal del Cliente</span>
      </div>
      <div>
        <h1>{title}</h1>
        {sub && <p className="s">{sub}</p>}
      </div>
      {children}
    </>
  );
  return onSubmit ? (
    <form className="card auth-card" onSubmit={onSubmit} noValidate>{body}</form>
  ) : (
    <div className="card auth-card">{body}</div>
  );
};

const Spinner = <span className="spin" />;

/** Requisitos de la política vigente con indicador en vivo. */
const Requirements: FC<{ policy: PasswordPolicy | null; value: string }> = ({ policy, value }) => {
  const items = useMemo(() => {
    const c = (policy?.complexity ?? {}) as Record<string, boolean>;
    const list: Array<[string, boolean]> = [[`Mínimo ${policy?.min_length ?? 10} caracteres`, value.length >= (policy?.min_length ?? 10)]];
    if (c.uppercase || c.lowercase) {
      list.push(['Mayúsculas y minúsculas', /[a-zñ]/.test(value) && /[A-ZÑ]/.test(value)]);
    }
    if (c.number) list.push(['Al menos un número', /\d/.test(value)]);
    if (c.symbol) list.push(['Al menos un símbolo', /[^\p{L}\p{N}\s]/u.test(value)]);
    return list;
  }, [policy, value]);
  return (
    <ul aria-label="Requisitos de la contraseña" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4, fontSize: 13 }}>
      {items.map(([label, ok]) => (
        <li key={label} style={{ display: 'flex', gap: 6, alignItems: 'center', color: ok ? 'var(--ok, #2f7d32)' : 'var(--muted)' }}>
          <Icon name={ok ? 'check' : 'shield'} className="sm" />
          <span>{label}</span>
          <span className="sr-only" style={{ position: 'absolute', left: -9999 }}>{ok ? '(cumplido)' : '(pendiente)'}</span>
        </li>
      ))}
    </ul>
  );
};

/** Dos campos de contraseña con mostrar/ocultar, requisitos y errores 422 por campo. */
const PasswordFields: FC<{
  policy: PasswordPolicy | null;
  password: string;
  confirmation: string;
  onPassword: (v: string) => void;
  onConfirmation: (v: string) => void;
  errors: Record<string, string>;
}> = ({ policy, password, confirmation, onPassword, onConfirmation, errors }) => {
  const [show, setShow] = useState(false);
  return (
    <>
      <label className="field" htmlFor="acPw">
        <span>Contraseña nueva</span>
        <div className="pw">
          <input
            className="input"
            id="acPw"
            type={show ? 'text' : 'password'}
            value={password}
            onChange={(e) => onPassword(e.target.value)}
            autoComplete="new-password"
            aria-invalid={errors.password ? true : undefined}
            autoFocus
            required
          />
          <button type="button" onClick={() => setShow(!show)} aria-label={show ? 'Ocultar contraseña' : 'Ver contraseña'}>
            <Icon name={show ? 'eyeOff' : 'eye'} className="sm" />
          </button>
        </div>
        <FieldError msg={errors.password} />
      </label>
      <Requirements policy={policy} value={password} />
      <label className="field" htmlFor="acPw2">
        <span>Repite la contraseña</span>
        <input
          className="input"
          id="acPw2"
          type={show ? 'text' : 'password'}
          value={confirmation}
          onChange={(e) => onConfirmation(e.target.value)}
          autoComplete="new-password"
          aria-invalid={errors.password_confirmation ? true : undefined}
          required
        />
        <FieldError msg={errors.password_confirmation} />
      </label>
    </>
  );
};

function usePolicy(): PasswordPolicy | null {
  const [policy, setPolicy] = useState<PasswordPolicy | null>(null);
  useEffect(() => {
    hub.auth.publicPasswordPolicy().then(setPolicy, () => undefined);
  }, []);
  return policy;
}

/** Enlace vencido o ya usado: la acción es pedir uno nuevo. */
const DeadLink: FC<{ expired: boolean; onRequest: () => void; onLogin: () => void }> = ({ expired, onRequest, onLogin }) => (
  <Card
    title={expired ? 'Tu enlace venció' : 'Este enlace ya no es válido'}
    sub={expired ? 'Por seguridad los enlaces vencen. Pide uno nuevo y te lo enviamos al correo.' : 'Ya se usó o fue reemplazado por uno más reciente. Pide uno nuevo para continuar.'}
  >
    <button type="button" className="btn primary lg block" onClick={onRequest}>
      Pedir un enlace nuevo <Icon name="arrow" className="sm" />
    </button>
    <div className="row-b" style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
      <button type="button" className="linkbtn" onClick={onLogin}>← Volver al acceso</button>
    </div>
  </Card>
);

type LinkState = { k: 'checking' } | { k: 'ok'; name: string; email: string } | { k: 'dead'; expired: boolean };

const PasswordForm: FC<{
  mode: 'activar' | 'restablecer';
  token: string;
  onDone: (message: string) => void;
  onNewLink: () => void;
  onLogin: () => void;
}> = ({ mode, token, onDone, onNewLink, onLogin }) => {
  const policy = usePolicy();
  const [link, setLink] = useState<LinkState>(mode === 'activar' ? { k: 'checking' } : { k: 'ok', name: '', email: '' });
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (mode !== 'activar') return;
    if (!token) {
      setLink({ k: 'dead', expired: false });
      return;
    }
    hub.auth.verifyInvitation(token).then(
      (d) => setLink({ k: 'ok', name: d.name, email: d.email }),
      (e) => {
        const p = problemOf(e);
        if (p && p.status === 410) setLink({ k: 'dead', expired: p.code === 'token_expired' });
        else setLink({ k: 'ok', name: '', email: '' }); // sin conexión: se intenta igual al enviar
      },
    );
  }, [mode, token]);

  if (link.k === 'checking') {
    return (
      <Card title="Comprobando tu enlace…">
        <div role="status" style={{ display: 'grid', placeItems: 'center', padding: 24 }}>{Spinner}</div>
      </Card>
    );
  }
  if (link.k === 'dead' || (mode === 'restablecer' && !token)) {
    return <DeadLink expired={link.k === 'dead' && link.expired} onRequest={onNewLink} onLogin={onLogin} />;
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const fe: Record<string, string> = {};
    if (password === '') fe.password = 'Escribe una contraseña.';
    else if (password !== confirmation) fe.password_confirmation = 'Las contraseñas no coinciden.';
    setErrors(fe);
    if (Object.keys(fe).length > 0) return;
    setBusy(true);
    try {
      if (mode === 'activar') await hub.auth.acceptInvitation(token, password, confirmation);
      else await hub.auth.resetPassword(token, password, confirmation);
      onDone(mode === 'activar' ? 'Tu cuenta quedó activada. Ingresa con tu correo y tu contraseña nueva.' : 'Contraseña actualizada. Ingresa con tu contraseña nueva; las demás sesiones se cerraron.');
    } catch (err) {
      const p = problemOf(err);
      if (p && p.status === 410) {
        setLink({ k: 'dead', expired: p.code === 'token_expired' });
        return;
      }
      const f: Record<string, string> = {};
      for (const k of ['password', 'password_confirmation']) {
        const m = p?.fieldError(k);
        if (m) f[k] = m;
      }
      const tokenErr = p?.fieldError('token');
      setErrors(f);
      setError(Object.keys(f).length > 0 && !tokenErr ? '' : tokenErr ?? generalMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const activar = mode === 'activar';
  return (
    <Card
      title={activar ? 'Activa tu cuenta' : 'Restablece tu contraseña'}
      sub={
        activar
          ? `${link.k === 'ok' && link.name ? `Hola ${link.name}. ` : ''}Crea tu contraseña${link.k === 'ok' && link.email ? ` para ${link.email}` : ''} y entra al portal.`
          : 'Elige una contraseña nueva para tu cuenta del portal.'
      }
      onSubmit={submit}
    >
      <div style={{ display: 'grid', gap: 14 }}>
        <PasswordFields policy={policy} password={password} confirmation={confirmation} onPassword={setPassword} onConfirmation={setConfirmation} errors={errors} />
        {error && <div className="err" role="alert" style={{ padding: '6px 0' }}>{error}</div>}
        <button className="btn primary lg block" type="submit" disabled={busy}>
          {busy ? Spinner : (<><Icon name="check" className="sm" /> {activar ? 'Activar mi cuenta' : 'Guardar contraseña'}</>)}
        </button>
      </div>
      <div className="row-b" style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
        <button type="button" className="linkbtn" onClick={onLogin}>← Volver al acceso</button>
      </div>
    </Card>
  );
};

const ForgotForm: FC<{ onLogin: () => void }> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError('Escribe un correo válido.');
      return;
    }
    setBusy(true);
    try {
      await hub.auth.forgotPassword(email.trim());
      setSent(true);
    } catch (err) {
      const p = problemOf(err);
      setError(p?.fieldError('email') ?? generalMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <Card title="Revisa tu correo" sub="Si el correo corresponde a una cuenta activa, te enviamos un enlace para crear una contraseña nueva. Vence en 1 hora y solo sirve una vez.">
        <div className="note" role="status" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', fontSize: 13 }}>
          <Icon name="mail" className="sm" /> <span>¿No llega? Revisa la carpeta de spam o vuelve a intentarlo en unos minutos.</span>
        </div>
        <div className="row-b" style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
          <button type="button" className="linkbtn" onClick={onLogin}>← Volver al acceso</button>
        </div>
      </Card>
    );
  }
  return (
    <Card title="¿Olvidaste tu contraseña?" sub="Escribe el correo de tu usuario del portal y te enviaremos un enlace para crear una nueva." onSubmit={submit}>
      <div style={{ display: 'grid', gap: 14 }}>
        <label className="field" htmlFor="fgMail">
          <span>Correo</span>
          <div className="input-ic">
            <Icon name="mail" />
            <input
              className="input"
              id="fgMail"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              placeholder="usuario@empresa.com"
              aria-invalid={error ? true : undefined}
              autoFocus
              required
            />
          </div>
        </label>
        {error && <div className="err" role="alert">{error}</div>}
        <button className="btn primary lg block" type="submit" disabled={busy}>
          {busy ? Spinner : (<>Enviar enlace <Icon name="arrow" className="sm" /></>)}
        </button>
      </div>
      <div className="row-b" style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
        <button type="button" className="linkbtn" onClick={onLogin}>← Volver al acceso</button>
      </div>
    </Card>
  );
};

export const AccountLinkViews: FC<{
  route: PublicRoute;
  go: (hash: string) => void;
  /** Vuelve al acceso con un aviso (p. ej. "Tu cuenta quedó activada"). */
  onFinished: (message: string | null) => void;
}> = ({ route, go, onFinished }) => (
  <AuthShell>
    {route.name === 'olvide' ? (
      <ForgotForm onLogin={() => onFinished(null)} />
    ) : (
      <PasswordForm
        mode={route.name}
        token={route.token}
        onDone={(m) => onFinished(m)}
        onNewLink={() => go('#/olvide')}
        onLogin={() => onFinished(null)}
      />
    )}
  </AuthShell>
);
