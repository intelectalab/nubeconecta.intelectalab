import { useState } from 'react';
import { isProblem, type SettingDefinition, type SettingValue } from '@hub/api';
import { useApp } from '../../app/context';
import { Icon } from '../../components/Icon';
import { Note, PageHead, Select, Skeleton, Switch } from '../../components/ui';
import { errorText, settingsApi, useCan, useLoad } from './configuracion/shared';

const SECTIONS = [
  { title: 'Contraseñas', icon: 'lock', keys: ['security.password.min_length', 'security.password.complexity', 'security.password.expiry_days', 'security.password.history_count'] },
  { title: 'MFA (doble factor)', icon: 'shield', keys: ['security.mfa.required_for_admin', 'security.mfa.required_for_staff', 'security.mfa.required_for_customers', 'security.mfa.required_by_role', 'security.mfa.app_enabled', 'security.mfa.email_enabled', 'security.mfa.email_code_ttl_minutes', 'security.mfa.email_code_max_attempts', 'security.sensitive_action_mfa_max_age_minutes'] },
  { title: 'Acceso y sesión', icon: 'clock', keys: ['security.login_max_attempts', 'security.login_lockout_minutes', 'security.session_duration_hours', 'security.trusted_device_days'] },
  { title: 'Bóveda', icon: 'lock', keys: ['security.vault.reveal_limit_per_hour'] },
];

type LabeledSetting = SettingDefinition & { label?: string };

function messageFor(error: unknown) {
  return isProblem(error) && error.status === 422 ? 'Revise los campos.' : errorText(error);
}

function settingLabel(setting: LabeledSetting) {
  return setting.label || setting.key;
}

function SecuritySetting({ setting, canEdit, busy, save }: {
  setting: LabeledSetting;
  canEdit: boolean;
  busy: boolean;
  save: (setting: SettingDefinition, value: SettingValue) => void;
}) {
  const value = setting.effective ?? setting.default;
  const label = settingLabel(setting);
  const disabled = !canEdit || busy;
  const saveText = (next: string) => {
    if (next !== String(value ?? '')) save(setting, next);
  };

  return (
    <div className="field" key={setting.key} style={{ minWidth: 240 }}>
      <strong>{label}</strong>
      {setting.description ? <small className="sub">{setting.description}</small> : null}
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
        <input
          className="input"
          type="number"
          step={setting.type === 'integer' ? 1 : 'any'}
          value={value == null ? '' : String(value)}
          disabled={disabled}
          aria-label={label}
          onBlur={(event) => {
            const raw = event.currentTarget.value;
            if (raw === '') return;
            const next = Number(raw);
            if (Number.isFinite(next) && next !== Number(value)) save(setting, next);
          }}
          onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
        />
      ) : setting.type === 'json' ? (
        <textarea
          className="input"
          rows={5}
          value={JSON.stringify(value ?? {}, null, 2)}
          aria-label={label}
          disabled={disabled}
          onBlur={(event) => {
            try {
              const next = JSON.parse(event.currentTarget.value) as SettingValue;
              if (JSON.stringify(next) !== JSON.stringify(value)) save(setting, next);
            } catch {
              // JSON inválido: no se persiste.
            }
          }}
        />
      ) : (
        <input
          className="input"
          value={String(value ?? '')}
          aria-label={label}
          disabled={disabled}
          onBlur={(event) => saveText(event.currentTarget.value)}
        />
      )}
      {!canEdit ? <small className="sub">Solo lectura: requiere {setting.edit_permission}.</small> : null}
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

  const saveSetting = async (setting: SettingDefinition, value: SettingValue) => {
    setSavingKey(setting.key);
    try {
      await settingsApi.settings.put(setting.key, { scope_type: 'global', value });
      toast('Ajuste de seguridad guardado', setting.key);
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
                    <div className="form-grid">
                      {rows.map((setting) => (
                        <SecuritySetting
                          key={setting.key}
                          setting={setting}
                          canEdit={can(setting.edit_permission)}
                          busy={savingKey === setting.key}
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
