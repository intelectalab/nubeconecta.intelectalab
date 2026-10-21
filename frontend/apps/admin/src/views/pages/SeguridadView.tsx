/**
 * Vista «seguridad» (#seguridad) — políticas de acceso para el personal y los
 * clientes (prototipo vSeguridad, secMeter, secIssues, loginPreview y
 * handlers sec*, l.2620-2647).
 */
import { useState } from 'react';
import { useApp } from '../../app/context';
import { useViewState } from '../../app/storage';
import { Icon } from '../../components/Icon';
import { PageHead, Seg, Switch } from '../../components/ui';
import { MFAREQ, SEC, mwVars, secCheck, type SecurityPolicy } from '../../data';
import { MwBar, MwLogo } from './web-config/shared';

type NumKey = 'minLen' | 'expire' | 'hist' | 'att' | 'lock' | 'sess' | 'trustDays';
type BoolKey = 'upper' | 'num' | 'sym' | 'mfaMail' | 'mfaApp' | 'trust';
const LIM: Record<NumKey, [number, number]> = { minLen: [6, 64], expire: [0, 365], hist: [0, 24], att: [3, 20], lock: [1, 1440], sess: [1, 72], trustDays: [1, 90] };
const LEVELS = ['Muy débil', 'Débil', 'Aceptable', 'Fuerte', 'Muy fuerte'];

function secIssues(): string[] {
  const i: string[] = [];
  if (!SEC.mfaMail && !SEC.mfaApp && (Object.values(SEC.role).some((v) => v !== 'Opcional') || Object.values(SEC.type).some((v) => v !== 'Opcional')))
    i.push('Hay roles con segundo factor obligatorio, pero ambos métodos están desactivados.');
  if (!SEC.mfaApp && Object.values(SEC.role).includes('Obligatorio: solo app')) i.push('Un rol exige «solo app», pero la aplicación de autenticación está desactivada.');
  if (SEC.minLen < 8) i.push('La longitud mínima recomendada es 8 caracteres o más.');
  return i;
}

function Meter({ pw }: { pw: string }) {
  const r = secCheck(pw);
  return (
    <>
      <div className={`meter m${r.sc}`} aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </div>
      <small className="num" style={{ fontWeight: 700 }}>
        {pw ? LEVELS[r.sc] + (r.ok ? ' · cumple la política' : ' · no cumple la política') : 'Escriba una contraseña de ejemplo'}
      </small>
      <ul className="checks" style={{ marginTop: 8 }}>
        {r.c.map(([ok, l]) => (
          <li key={l} className={ok ? 'ok' : 'no'}>
            <Icon name={ok ? 'check' : 'x'} size="sm" />
            <span>{l}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

function LoginPreview({ who }: { who: 'personal' | 'clientes' }) {
  const req = who === 'personal' ? SEC.type.personal : SEC.type.clientes;
  const methods = [SEC.mfaApp && 'Aplicación de autenticación', SEC.mfaMail && 'Código por correo'].filter((x): x is string => !!x);
  return (
    <div className="mw login-prev" style={mwVars('ap')}>
      <MwBar>{who === 'personal' ? 'panel.alojamientoplus.com/acceso' : 'portal.alojamientoplus.com/acceso'}</MwBar>
      <div className="lp-grid">
        <div className="lp-card">
          <MwLogo brand="ap" />
          <h3 className="mw-h">{who === 'personal' ? 'Acceso del personal' : 'Portal del cliente'}</h3>
          <span className="mw-in">Correo</span>
          <span className="mw-in">Contraseña</span>
          <small className="mw-mut">
            Mínimo {SEC.minLen} caracteres{SEC.upper ? ', mayúsculas' : ''}
            {SEC.num ? ', números' : ''}
            {SEC.sym ? ', símbolos' : ''}.
          </small>
          {SEC.trust ? <small className="mw-mut">☐ Recordar este dispositivo {SEC.trustDays} días</small> : null}
          <span className="mw-b">Ingresar</span>
          <small className="mw-mut">
            Tras {SEC.att} intentos fallidos la cuenta se bloquea {SEC.lock} min.
          </small>
        </div>
        <div className="lp-card">
          <small className="mw-mut">Paso 2 · {req === 'Opcional' ? 'solo si el usuario lo activó' : 'obligatorio'}</small>
          <h3 className="mw-h">Verificación en dos pasos</h3>
          {methods.length ? (
            <>
              {methods.map((m, k) => (
                <span key={m} className="mw-in" style={k === 0 ? { borderColor: 'var(--mw-p)' } : undefined}>
                  {k === 0 ? '◉' : '○'} {m}
                </span>
              ))}
              <div className="otp">
                {Array.from({ length: 6 }, (_, i) => (
                  <i key={i} />
                ))}
              </div>
              <span className="mw-b">Verificar</span>
            </>
          ) : (
            <p className="mw-mut">Sin métodos activos: no se pedirá segundo factor.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SeguridadView() {
  const { toast, refresh, dialogs } = useApp();
  const [pw, setPw] = useViewState('sec.try', '');
  const [prev, setPrev] = useViewState<'personal' | 'clientes'>('sec.prev', 'personal');
  const [drafts, setDrafts] = useState<Partial<Record<NumKey, string>>>({});
  const iss = secIssues();

  const sw = (k: BoolKey, l: string) => (
    <Switch
      checked={!!SEC[k]}
      onChange={(v) => {
        (SEC as SecurityPolicy)[k] = v;
        refresh();
      }}
    >
      {l}
    </Switch>
  );
  const num = (k: NumKey, id: string, label: string) => {
    const [mn, mx] = LIM[k];
    const commit = () => {
      const raw = drafts[k];
      if (raw == null) return;
      const v = Math.round(+raw);
      if (!(raw.trim() !== '' && v >= mn && v <= mx)) toast('Valor fuera de rango', `Entre ${mn} y ${mx}.`, 'err');
      setDrafts((d) => {
        const n = { ...d };
        delete n[k];
        return n;
      });
    };
    return (
      <label className="field" htmlFor={id}>
        {label}
        <input
          className="input"
          id={id}
          type="number"
          min={mn}
          max={mx}
          value={drafts[k] ?? String(SEC[k])}
          onChange={(e) => {
            const raw = e.target.value;
            setDrafts((d) => ({ ...d, [k]: raw }));
            const v = Math.round(+raw);
            if (raw.trim() !== '' && v >= mn && v <= mx) {
              SEC[k] = v;
              refresh();
            }
          }}
          onBlur={commit}
        />
      </label>
    );
  };
  const save = () =>
    dialogs.confirm({
      title: 'Guardar políticas de seguridad',
      body: (
        <>
          <p style={{ margin: 0 }}>Los cambios aplican en el próximo inicio de sesión. Los usuarios cuya contraseña no cumpla la nueva política deberán cambiarla al ingresar.</p>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13 }}>
            <li>Contraseña mínima: {SEC.minLen} caracteres</li>
            <li>2FA: {[SEC.mfaApp && 'app', SEC.mfaMail && 'correo'].filter(Boolean).join(' y ') || 'desactivado'}</li>
            <li>
              Bloqueo: {SEC.att} intentos · {SEC.lock} min · sesión {SEC.sess} h
            </li>
          </ul>
        </>
      ),
      okLabel: 'Guardar',
      onOk: () => toast('Políticas guardadas', 'Se registró el cambio en la auditoría.'),
    });

  return (
    <>
      <PageHead
        crumbs={[['Configuración', 'ajustes'], ['Seguridad', 'seguridad']]}
        title="Seguridad"
        sub="Políticas de acceso para el personal y los clientes."
        actions={
          <button type="button" className="btn primary" onClick={save} disabled={iss.length > 0} aria-describedby={iss.length ? 'secIss' : undefined}>
            <Icon name="check" size="sm" />
            Guardar políticas
          </button>
        }
      />
      {iss.length ? (
        <div className="note warn" role="alert" id="secIss" style={{ marginBottom: 16 }}>
          <Icon name="tri" size="sm" />
          <span>{iss.join(' ')}</span>
        </div>
      ) : null}
      <div className="grid g-2">
        <div className="stack">
          <section className="card" aria-labelledby="hSecPw">
            <div className="card-h">
              <h2 className="sec" id="hSecPw">
                <Icon name="lock" size="sm" />
                Política de contraseñas
              </h2>
            </div>
            <div className="card-b">
              <div className="form-grid">
                {num('minLen', 'sc_len', 'Longitud mínima')}
                {num('expire', 'sc_exp', 'Caducidad (días, 0 = nunca)')}
                {num('hist', 'sc_hist', 'Historial (no repetir las últimas)')}
                <div className="field">
                  Requisitos
                  <div style={{ display: 'grid', gap: 4 }}>
                    {sw('upper', 'Mayúsculas y minúsculas')}
                    {sw('num', 'Números')}
                    {sw('sym', 'Símbolos')}
                  </div>
                </div>
              </div>
              <label className="field" style={{ marginTop: 12 }} htmlFor="secTry">
                Probar con una contraseña de ejemplo
                <input
                  id="secTry"
                  className="input"
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  aria-describedby="secMeter"
                  placeholder="No use contraseñas reales"
                />
              </label>
              <div id="secMeter" aria-live="polite">
                <Meter pw={pw} />
              </div>
            </div>
          </section>
          <section className="card" aria-labelledby="hSecMfa">
            <div className="card-h">
              <h2 className="sec" id="hSecMfa">
                <Icon name="shield" size="sm" />
                Segundo factor (2FA)
              </h2>
            </div>
            <div className="card-b" style={{ display: 'grid', gap: 12 }}>
              <div style={{ display: 'grid', gap: 4 }}>
                {sw('mfaMail', 'Código por correo (6 dígitos, 10 min)')}
                {sw('mfaApp', 'Aplicación de autenticación (TOTP)')}
              </div>
              <div className="tw" style={{ border: '1px solid var(--border)', borderRadius: 8 }}>
                <table className="t">
                  <thead>
                    <tr>
                      <th>Rol / tipo de usuario</th>
                      <th>Exigencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.keys(SEC.role).map((r) => (
                      <tr key={r}>
                        <td>
                          {r} <span className="sub">(personal)</span>
                        </td>
                        <td>
                          <select
                            className="select"
                            value={SEC.role[r]}
                            aria-label={`Exigencia para ${r}`}
                            onChange={(e) => {
                              SEC.role[r] = e.target.value;
                              refresh();
                            }}
                          >
                            {MFAREQ.map((o) => (
                              <option key={o}>{o}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td>
                        <b>Todo el personal</b> <span className="sub">(mínimo)</span>
                      </td>
                      <td>
                        <select
                          className="select"
                          value={SEC.type.personal}
                          aria-label="Exigencia para el personal"
                          onChange={(e) => {
                            SEC.type.personal = e.target.value;
                            refresh();
                          }}
                        >
                          {['Opcional', 'Obligatorio'].map((o) => (
                            <option key={o}>{o}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                    <tr>
                      <td>
                        <b>Clientes</b> <span className="sub">(portal)</span>
                      </td>
                      <td>
                        <select
                          className="select"
                          value={SEC.type.clientes}
                          aria-label="Exigencia para clientes"
                          onChange={(e) => {
                            SEC.type.clientes = e.target.value;
                            refresh();
                          }}
                        >
                          {['Opcional', 'Obligatorio'].map((o) => (
                            <option key={o}>{o}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>
          <section className="card" aria-labelledby="hSecLock">
            <div className="card-h">
              <h2 className="sec" id="hSecLock">
                <Icon name="clock" size="sm" />
                Bloqueo y sesión
              </h2>
            </div>
            <div className="card-b">
              <div className="form-grid">
                {num('att', 'sc_att', 'Intentos antes del bloqueo')}
                {num('lock', 'sc_lock', 'Duración del bloqueo (min)')}
                {num('sess', 'sc_sess', 'Duración de sesión (horas)')}
                <div className="field">
                  Dispositivos de confianza
                  {sw('trust', 'Permitir «recordar dispositivo»')}
                </div>
                {SEC.trust ? num('trustDays', 'sc_td', 'Recordar durante (días)') : null}
              </div>
            </div>
          </section>
        </div>
        <section className="stack" aria-label="Vista previa de la pantalla de acceso">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h3 className="fs" style={{ margin: 0 }}>
              Vista previa de la pantalla de acceso
            </h3>
            <Seg<'personal' | 'clientes'>
              label="Tipo de usuario"
              value={prev}
              onChange={setPrev}
              options={[
                ['personal', 'Personal'],
                ['clientes', 'Clientes'],
              ]}
            />
          </div>
          <LoginPreview who={prev} />
        </section>
      </div>
    </>
  );
}
