import { useState } from 'react';
import { isProblem, type Role, type SettingDefinition, type SettingValue } from '@hub/api';
import { useApp } from '../../app/context';
import { Icon } from '../../components/Icon';
import { Note, PageHead, Select, Skeleton, Switch } from '../../components/ui';
import { identityApi } from './identidad/shared';
import { errorText, settingsApi, useCan, useLoad } from './configuracion/shared';

/** Etiquetas legibles para las clases de caracteres de la complejidad de contraseña. */
const COMPLEXITY_LABELS: Record<string, string> = {
  uppercase: 'Mayúsculas (A-Z)', lowercase: 'Minúsculas (a-z)', number: 'Números (0-9)', symbol: 'Símbolos (!@#…)',
};

/** Editor amable para `security.password.complexity`: un switch por clase de carácter, en vez de JSON crudo. */
function ComplexityEditor({ value, disabled, onChange }: { value: SettingValue; disabled: boolean; onChange: (next: SettingValue) => void }) {
  const map = (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as Record<string, boolean>;
  const keys = Object.keys(COMPLEXITY_LABELS);
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {keys.map((k) => (
        <Switch key={k} checked={map[k] === true} disabled={disabled} onChange={(next) => onChange({ ...map, [k]: next })}>
          {COMPLEXITY_LABELS[k]}
        </Switch>
      ))}
    </div>
  );
}

/** Editor amable para `security.mfa.required_by_role`: un select por rol, en vez de JSON crudo. */
function RoleMfaEditor({ value, roles, rolesMessage, disabled, onChange }: { value: SettingValue; roles: Role[]; rolesMessage: string; disabled: boolean; onChange: (next: SettingValue) => void }) {
  const map = (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as Record<string, string>;
  if (!roles.length) {
    return <small className="sub">{rolesMessage}</small>;
  }
  const set = (code: string, next: string) => {
    const copy = { ...map };
    if (next === '') { delete copy[code]; } else { copy[code] = next; }
    onChange(copy);
  };
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {roles.map((role) => (
        <label key={role.id} className="field" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(110px,150px)', alignItems: 'center', gap: 8 }}>
          <span>{role.name}</span>
          <Select
            value={map[role.code] ?? ''}
            onChange={(next) => set(role.code, next)}
            disabled={disabled}
            label={`MFA para ${role.name}`}
            options={[['', 'Según global'], ['required', 'Obligatorio'], ['optional', 'Opcional']]}
          />
        </label>
      ))}
    </div>
  );
}

/** Despacha los ajustes de tipo json a un editor legible según su clave (nunca JSON crudo al usuario). */
function JsonSetting({ setting, value, roles, rolesMessage, disabled, onChange }: {
  setting: SettingDefinition; value: SettingValue; roles: Role[]; rolesMessage: string; disabled: boolean; onChange: (next: SettingValue) => void;
}) {
  if (setting.key === 'security.password.complexity') {
    return <ComplexityEditor value={value} disabled={disabled} onChange={onChange} />;
  }
  if (setting.key === 'security.mfa.required_by_role') {
    return <RoleMfaEditor value={value} roles={roles} rolesMessage={rolesMessage} disabled={disabled} onChange={onChange} />;
  }
  // Respaldo para cualquier otro json no previsto: pares clave/valor simples, sin volcar JSON crudo.
  const map = (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as Record<string, unknown>;
  const entries = Object.entries(map);
  return entries.length
    ? <ul className="sub" style={{ margin: 0, paddingLeft: 16 }}>{entries.map(([k, v]) => <li key={k}>{k}: {String(v)}</li>)}</ul>
    : <small className="sub">Sin valores configurados.</small>;
}

const SECTIONS = [
  { title: 'Contraseñas', icon: 'lock', keys: ['security.password.min_length', 'security.password.complexity', 'security.password.expiry_days', 'security.password.history_count'] },
  { title: 'MFA (doble factor)', icon: 'shield', keys: ['security.mfa.required_for_admin', 'security.mfa.required_for_staff', 'security.mfa.required_for_customers', 'security.mfa.required_by_role', 'security.mfa.app_enabled', 'security.mfa.email_enabled', 'security.mfa.email_code_ttl_minutes', 'security.mfa.email_code_max_attempts', 'security.sensitive_action_mfa_max_age_minutes'] },
  { title: 'Acceso y sesión', icon: 'clock', keys: ['security.login_max_attempts', 'security.login_lockout_minutes', 'security.session_duration_hours', 'security.trusted_device_days'] },
  { title: 'Bóveda', icon: 'lock', keys: ['security.vault.reveal_limit_per_hour'] },
];

/** Etiquetas en español por clave: nunca se muestra la clave cruda al usuario. */
const LABELS: Record<string, string> = {
  'security.password.min_length': 'Longitud mínima de la contraseña',
  'security.password.complexity': 'Complejidad de la contraseña',
  'security.password.expiry_days': 'Caducidad de la contraseña (días)',
  'security.password.history_count': 'Historial de contraseñas',
  'security.mfa.required_for_admin': 'MFA obligatorio para administradores',
  'security.mfa.required_for_staff': 'MFA obligatorio para el personal',
  'security.mfa.required_for_customers': 'MFA obligatorio para clientes',
  'security.mfa.required_by_role': 'MFA por rol',
  'security.mfa.app_enabled': 'MFA con app de autenticación',
  'security.mfa.email_enabled': 'MFA con código por correo',
  'security.mfa.email_code_ttl_minutes': 'Validez del código por correo (minutos)',
  'security.mfa.email_code_max_attempts': 'Intentos por código de correo',
  'security.sensitive_action_mfa_max_age_minutes': 'Antigüedad máxima del MFA en acciones sensibles (min)',
  'security.login_max_attempts': 'Intentos de inicio de sesión antes del bloqueo',
  'security.login_lockout_minutes': 'Minutos de bloqueo de cuenta',
  'security.session_duration_hours': 'Duración de la sesión (horas)',
  'security.trusted_device_days': 'Días de dispositivo de confianza',
  'security.vault.reveal_limit_per_hour': 'Revelaciones de secretos por hora',
};

type LabeledSetting = SettingDefinition;

/** Sustituye claves técnicas (security.x.y) del texto de ayuda por su etiqueta en español. */
function cleanDescription(text: string) {
  return text.replace(/security\.[a-z_.]+[a-z]/g, (k) => (LABELS[k] ? `«${LABELS[k]}»` : 'otro ajuste'));
}

/** Input numérico controlado con borrador local; guarda al salir del campo o con Enter. */
function NumberInput({ setting, value, disabled, label, save }: {
  setting: SettingDefinition; value: SettingValue; disabled: boolean; label: string; save: (v: number) => void;
}) {
  const current = value == null ? '' : String(value);
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    const raw = draft;
    setDraft(null);
    if (raw == null || raw.trim() === '') return;
    const next = Number(raw);
    if (Number.isFinite(next) && next !== Number(value)) save(next);
  };
  return (
    <input
      className="input"
      type="number"
      step={setting.type === 'integer' ? 1 : 'any'}
      value={draft ?? current}
      disabled={disabled}
      aria-label={label}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
    />
  );
}

/** Input de texto controlado con borrador local. */
function TextInput({ value, disabled, label, save }: { value: SettingValue; disabled: boolean; label: string; save: (v: string) => void }) {
  const current = String(value ?? '');
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      className="input"
      value={draft ?? current}
      aria-label={label}
      disabled={disabled}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => { const raw = draft; setDraft(null); if (raw != null && raw !== current) save(raw); }}
    />
  );
}

function messageFor(error: unknown) {
  return isProblem(error) && error.status === 422 ? 'Revise los campos.' : errorText(error);
}

function settingLabel(setting: LabeledSetting) {
  return LABELS[setting.key] ?? 'Ajuste de seguridad';
}

function SecuritySetting({ setting, canEdit, busy, roles, rolesMessage, save }: {
  setting: LabeledSetting;
  canEdit: boolean;
  busy: boolean;
  roles: Role[];
  rolesMessage: string;
  save: (setting: SettingDefinition, value: SettingValue) => void;
}) {
  const value = setting.effective ?? setting.default;
  const label = settingLabel(setting);
  const disabled = !canEdit || busy;

  return (
    <div className="field" key={setting.key} style={{ minWidth: 0, gap: 6 }}>
      <strong>{label}</strong>
      {setting.description ? <small className="sub">{cleanDescription(setting.description)}</small> : null}
      {setting.type === 'boolean' ? (
        <Switch checked={value === true} onChange={(next) => save(setting, next)} disabled={disabled}>
          {busy ? 'Guardando…' : undefined}
        </Switch>
      ) : setting.type === 'enum' ? (
        <Select
          value={String(value ?? '')}
          onChange={(next) => save(setting, next === '' ? null : next)}
          options={setting.enum_values ?? []}
          disabled={disabled}
          label={label}
        />
      ) : ['integer', 'decimal', 'number'].includes(setting.type) ? (
        <NumberInput setting={setting} value={value} disabled={disabled} label={label} save={(next) => save(setting, next)} />
      ) : setting.type === 'json' ? (
        <JsonSetting
          setting={setting}
          value={value}
          roles={roles}
          rolesMessage={rolesMessage}
          disabled={disabled}
          onChange={(next) => save(setting, next)}
        />
      ) : (
        <TextInput value={value} disabled={disabled} label={label} save={(next) => save(setting, next)} />
      )}
      {!canEdit ? <small className="sub">Solo lectura: no tiene permiso para editar este ajuste.</small> : null}
    </div>
  );
}

export default function SeguridadView() {
  const { toast } = useApp();
  const can = useCan();
  const canView = can('settings.setting.view');
  const settings = useLoad(
    () => canView ? settingsApi.settings.list() : Promise.resolve({ data: [], meta: { total: 0 } }),
    [canView],
  );
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const definitions = (settings.data?.data ?? []).filter((setting) => setting.key.startsWith('security.'));
  // Roles para el editor de "MFA por rol" (reemplaza el JSON crudo).
  const canRoles = can('identity.role.view');
  const roleList = useLoad(() => canRoles ? identityApi.roles.list() : Promise.resolve(null), [canRoles]);
  const roles = roleList.data?.data ?? [];
  const rolesMessage = !canRoles
    ? 'Requiere el permiso identity.role.view para configurar el MFA por rol.'
    : roleList.loading ? 'Cargando roles…'
    : roleList.error ? `No se pudieron cargar los roles: ${errorText(roleList.error)}`
    : 'No hay roles para configurar.';

  const saveSetting = async (setting: SettingDefinition, value: SettingValue) => {
    setSavingKey(setting.key);
    try {
      await settingsApi.settings.put(setting.key, { scope_type: 'global', value });
      toast('Ajuste de seguridad guardado', LABELS[setting.key]);
      settings.reload();
    } catch (error) {
      toast('No se pudo guardar el ajuste', messageFor(error), 'err');
      if (isProblem(error) && error.status === 409) settings.reload();
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <>
      <PageHead
        crumbs={[[ 'Configuración', 'ajustes' ], [ 'Seguridad', 'seguridad' ]]}
        title="Seguridad"
        sub="Políticas de contraseñas, autenticación, acceso y sesión de la organización."
      />
      {!canView ? (
        <Note kind="warn" icon="lock">No tiene permiso para consultar ajustes de seguridad (settings.setting.view).</Note>
      ) : settings.loading ? (
        <Skeleton rows={8} />
      ) : settings.error ? (
        <Note kind="warn" role="alert">
          {messageFor(settings.error)} <button className="btn sm" type="button" onClick={settings.reload}>Reintentar</button>
        </Note>
      ) : (
        <div className="grid g-2">
          {SECTIONS.map((section) => {
            const rows = section.keys
              .map((key) => definitions.find((definition) => definition.key === key))
              .filter((definition): definition is SettingDefinition => !!definition);
            return (
              <section className="card" key={section.title} aria-label={section.title}>
                <div className="card-h">
                  <h2 className="sec"><Icon name={section.icon} size="sm" />{section.title}</h2>
                </div>
                <div className="card-b">
                  {rows.length ? (
                    <div className="stack">
                      {rows.map((setting) => (
                        <SecuritySetting
                          key={setting.key}
                          setting={setting}
                          canEdit={can(setting.edit_permission)}
                          busy={savingKey === setting.key}
                          roles={roles}
                          rolesMessage={rolesMessage}
                          save={(definition, value) => void saveSetting(definition, value)}
                        />
                      ))}
                    </div>
                  ) : <p className="sub">No hay ajustes de esta sección en el catálogo.</p>}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
