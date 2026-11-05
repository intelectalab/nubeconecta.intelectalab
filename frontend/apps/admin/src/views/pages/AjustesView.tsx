import { useMemo, useState } from 'react';
import { isProblem, type BusinessHourInterval, type BusinessHours, type Holiday, type HolidayInput, type SettingDefinition, type SettingValue } from '@hub/api';
import { useApp } from '../../app/context';
import { DataTable, type Column } from '../../components/DataTable';
import { Icon } from '../../components/Icon';
import { EmptyState, Note, PageHead, Select, Skeleton, Switch } from '../../components/ui';
import { errorText, settingsApi, useCan, useLoad } from './configuracion/shared';

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const HOLIDAY_INPUT: HolidayInput = { country: 'PE', date: '', name: '', recurring: false };
const emptyHours: BusinessHours = { calendar: 'default', timezone: 'America/Lima', version: 0, intervals: [] };

function messageFor(e: unknown) {
  if (isProblem(e) && e.status === 422) return 'Revise los campos.';
  return errorText(e);
}

export default function AjustesView() {
  const { toast } = useApp();
  const can = useCan();
  const canSettingsView = can('settings.setting.view');
  const canBusinessView = can('settings.business_hours.view');
  const canHolidayView = can('settings.holiday.view');
  const canHolidayCreate = can('settings.holiday.create');
  const canHolidayUpdate = can('settings.holiday.update');
  const canHolidayDelete = can('settings.holiday.delete');
  const [hoursDraft, setHoursDraft] = useState<BusinessHours | null>(null);
  const [savingHours, setSavingHours] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [holidayBusy, setHolidayBusy] = useState(false);

  const hours = useLoad<BusinessHours>(() => (canBusinessView ? settingsApi.businessHours.get('default') : Promise.resolve(emptyHours)), [canBusinessView]);
  const holidayList = useLoad<{ data: Holiday[] }>(() => (canHolidayView ? settingsApi.holidays.list() : Promise.resolve({ data: [] })), [canHolidayView]);
  const settings = useLoad<{ data: SettingDefinition[]; meta: { total: number } }>(() => (canSettingsView ? settingsApi.settings.list() : Promise.resolve({ data: [], meta: { total: 0 } })), [canSettingsView]);
  const holidays = holidayList.data?.data ?? [];
  const billingSettings = useMemo(() => (settings.data?.data ?? []).filter((s) => /^(billing\.|collections\.)/.test(s.key) && (/collections_inbox_days|late_fee\.|dunning\.default_sequence/.test(s.key))), [settings.data]);
  const currentHours = hoursDraft ?? hours.data ?? emptyHours;

  const updateIntervals = (weekday: number, transform: (rows: BusinessHourInterval[]) => BusinessHourInterval[]) => {
    const next = { ...currentHours, intervals: [...currentHours.intervals] };
    const rows = next.intervals.filter((i) => i.weekday === weekday);
    const updated = transform(rows).map((r) => ({ ...r, weekday }));
    next.intervals = next.intervals.filter((i) => i.weekday !== weekday).concat(updated);
    setHoursDraft(next);
  };
  const saveHours = async () => {
    setSavingHours(true);
    try {
      const saved = await settingsApi.businessHours.put('default', { version: currentHours.version, timezone: currentHours.timezone || 'America/Lima', intervals: currentHours.intervals.map(({ weekday, opens_at, closes_at }) => ({ weekday, opens_at, closes_at })) });
      hours.setData(saved);
      setHoursDraft(null);
      toast('Horario guardado', 'Se actualizó el calendario de atención.');
    } catch (e) {
      toast('No se pudo guardar el horario', messageFor(e), 'err');
      if (isProblem(e) && e.status === 409) { setHoursDraft(null); hours.reload(); }
    } finally { setSavingHours(false); }
  };

  const upsertHoliday = async (holiday?: Holiday) => {
    const country = window.prompt('País (ISO alfa-2)', holiday?.country ?? HOLIDAY_INPUT.country);
    if (country === null) return;
    const date = window.prompt('Fecha (AAAA-MM-DD)', holiday?.date ?? '');
    if (date === null) return;
    const name = window.prompt('Nombre del feriado', holiday?.name ?? '');
    if (name === null) return;
    const recurring = window.confirm('¿Se repite cada año? Acepte para recurrente; cancele para una sola fecha.');
    const input = { country: country.trim().toUpperCase(), date: date.trim(), name: name.trim(), recurring };
    setHolidayBusy(true);
    try {
      if (holiday) await settingsApi.holidays.update(holiday.id, holiday.version, input);
      else await settingsApi.holidays.create(input);
      toast(holiday ? 'Feriado actualizado' : 'Feriado creado');
      holidayList.reload();
    } catch (e) {
      toast('No se pudo guardar el feriado', messageFor(e), 'err');
      if (isProblem(e) && e.status === 409) holidayList.reload();
    } finally { setHolidayBusy(false); }
  };
  const removeHoliday = async (holiday: Holiday) => {
    if (!window.confirm(`¿Eliminar «${holiday.name}» (${holiday.date})?`)) return;
    setHolidayBusy(true);
    try { await settingsApi.holidays.remove(holiday.id); toast('Feriado eliminado'); holidayList.reload(); }
    catch (e) { toast('No se pudo eliminar el feriado', messageFor(e), 'err'); if (isProblem(e) && e.status === 409) holidayList.reload(); }
    finally { setHolidayBusy(false); }
  };

  const saveSetting = async (definition: SettingDefinition, value: SettingValue) => {
    setSavingKey(definition.key);
    try {
      await settingsApi.settings.put(definition.key, { scope_type: 'global', value });
      toast('Ajuste guardado', definition.key);
      settings.reload();
    } catch (e) {
      toast('No se pudo guardar el ajuste', messageFor(e), 'err');
      if (isProblem(e) && e.status === 409) settings.reload();
    } finally { setSavingKey(null); }
  };

  const holidayColumns: Column<Holiday>[] = [
    { key: 'date', header: 'Fecha', render: (h) => h.date, sort: (h) => h.date },
    { key: 'name', header: 'Nombre', render: (h) => h.name, sort: (h) => h.name },
    { key: 'country', header: 'País', render: (h) => h.country },
    { key: 'recurring', header: 'Recurrente', render: (h) => h.recurring ? 'Sí' : 'No' },
    { key: 'actions', header: 'Acciones', render: (h) => <span style={{ display: 'flex', gap: 6 }}>{canHolidayUpdate ? <button className="btn sm" type="button" disabled={holidayBusy} onClick={() => void upsertHoliday(h)}>Editar</button> : null}{canHolidayDelete ? <button className="btn sm" type="button" disabled={holidayBusy} onClick={() => void removeHoliday(h)} aria-label={`Eliminar ${h.name}`}><Icon name="trash" size="sm" /></button> : null}</span> },
  ];

  return <>
    <PageHead crumbs={[[ 'Configuración', 'ajustes' ], [ 'Cobranza y SLA', 'ajustes' ]]} title="Cobranza y SLA" sub="Horario, feriados y ajustes de cobranza que gobiernan los vencimientos." />

    <section className="card" style={{ marginBottom: 16 }}>
      <div className="card-h"><h2 className="sec">Horario de atención</h2><button className="btn primary" type="button" onClick={() => void saveHours()} disabled={!can('settings.business_hours.update') || savingHours || hours.loading || !!hours.error}><Icon name="check" size="sm" />Guardar horario</button></div>
      <div className="card-b">
        {!canBusinessView ? <Note kind="warn" icon="lock">No tiene permiso para consultar el horario (settings.business_hours.view).</Note> : hours.loading ? <Skeleton rows={5} /> : hours.error ? <Note kind="warn" role="alert">{messageFor(hours.error)} <button className="btn sm" onClick={hours.reload}>Reintentar</button></Note> : <>
          <label className="field" style={{ maxWidth: 360 }}>Zona horaria<input className="input" value={currentHours.timezone ?? ''} onChange={(e) => setHoursDraft({ ...currentHours, timezone: e.target.value })} disabled={!can('settings.business_hours.update')} placeholder="America/Lima" /></label>
          <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>{DAYS.map((day, idx) => {
            const weekday = idx + 1;
            const rows = currentHours.intervals.filter((i) => i.weekday === weekday);
            return <div key={weekday} style={{ display: 'grid', gridTemplateColumns: '100px 1fr auto', alignItems: 'center', gap: 10 }}><strong>{day}</strong><div style={{ display: 'grid', gap: 6 }}>{rows.map((interval, i) => <div key={`${weekday}-${i}`} style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input aria-label={`${day}: apertura`} className="input" type="time" value={interval.opens_at} disabled={!can('settings.business_hours.update')} onChange={(e) => updateIntervals(weekday, (rs) => rs.map((r, j) => j === i ? { ...r, opens_at: e.target.value } : r))} /><span>a</span><input aria-label={`${day}: cierre`} className="input" type="time" value={interval.closes_at} disabled={!can('settings.business_hours.update')} onChange={(e) => updateIntervals(weekday, (rs) => rs.map((r, j) => j === i ? { ...r, closes_at: e.target.value } : r))} /><button className="btn sm" type="button" disabled={!can('settings.business_hours.update')} onClick={() => updateIntervals(weekday, (rs) => rs.filter((_, j) => j !== i))} aria-label={`Quitar tramo ${day}`}><Icon name="trash" size="sm" /></button></div>)}</div><button className="btn sm" type="button" disabled={!can('settings.business_hours.update')} onClick={() => updateIntervals(weekday, (rs) => [...rs, { weekday, opens_at: '09:00', closes_at: '18:00' }])}>Agregar tramo</button></div>;
          })}</div>
          <Note style={{ marginTop: 14 }}>Los feriados y los tramos de este calendario permiten calcular plazos en días hábiles del Libro de Reclamaciones.</Note>
        </>}
      </div>
    </section>

    <section className="card" style={{ marginBottom: 16 }}>
      <div className="card-h"><h2 className="sec">Feriados</h2>{canHolidayCreate ? <button className="btn primary" type="button" disabled={holidayBusy} onClick={() => void upsertHoliday()}><Icon name="plus" size="sm" />Agregar feriado</button> : null}</div>
      <div className="card-b">{!canHolidayView ? <Note kind="warn" icon="lock">No tiene permiso para consultar feriados (settings.holiday.view).</Note> : holidayList.loading ? <Skeleton rows={4} /> : holidayList.error ? <Note kind="warn" role="alert">{messageFor(holidayList.error)} <button className="btn sm" onClick={holidayList.reload}>Reintentar</button></Note> : <DataTable rows={holidays} rowKey={(h) => h.id} columns={holidayColumns} empty={<EmptyState title="Sin feriados" text="Agregue feriados para el calendario legal." />} />}</div>
    </section>

    <section className="card" style={{ marginBottom: 16 }}>
      <div className="card-h"><h2 className="sec">Cobranza</h2></div>
      <div className="card-b">{!canSettingsView ? <Note kind="warn" icon="lock">No tiene permiso para consultar ajustes (settings.setting.view).</Note> : settings.loading ? <Skeleton rows={5} /> : settings.error ? <Note kind="warn" role="alert">{messageFor(settings.error)} <button className="btn sm" onClick={settings.reload}>Reintentar</button></Note> : billingSettings.length === 0 ? <EmptyState title="Sin ajustes de cobranza" /> : <div className="form-grid">{billingSettings.map((s) => {
        const value = s.effective ?? s.default;
        const editable = can(s.edit_permission);
        const busy = savingKey === s.key;
        const label = s.key === 'billing.collections_inbox_days' ? 'Días visibles en la bandeja de cobranza' : s.key.replace(/^billing\./, '').replace(/\./g, ' · ');
        return <div className="field" key={s.key} style={{ minWidth: 260 }}><strong>{label}</strong><small className="sub">{s.description}</small>{s.type === 'boolean' ? <Switch checked={value === true} onChange={(v) => void saveSetting(s, v)} disabled={!editable || busy}>{busy ? 'Guardando…' : 'Activado'}</Switch> : s.type === 'enum' ? <Select value={String(value ?? '')} onChange={(v) => void saveSetting(s, v === '' ? null : v)} options={[[ '', '—' ], ...(s.enum_values ?? []).map((v) => [v, v] as [string, string])]} disabled={!editable || busy} /> : ['integer', 'decimal', 'number'].includes(s.type) ? <input className="input" type="number" step={s.type === 'integer' ? 1 : 'any'} value={value == null ? '' : String(value)} disabled={!editable || busy} aria-label={label} onBlur={(e) => { if (e.target.value !== '' && Number(e.target.value) !== Number(value)) void saveSetting(s, Number(e.target.value)); }} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} /> : s.type === 'json' ? <textarea className="input" rows={5} defaultValue={JSON.stringify(value ?? {}, null, 2)} aria-label={label} disabled={!editable || busy} onBlur={(e) => { try { const parsed = JSON.parse(e.target.value) as SettingValue; if (JSON.stringify(parsed) !== JSON.stringify(value)) void saveSetting(s, parsed); } catch { toast('JSON inválido', 'Revise el contenido antes de guardar.', 'err'); } }} /> : <input className="input" value={String(value ?? '')} aria-label={label} disabled={!editable || busy} onBlur={(e) => { if (e.target.value !== String(value ?? '')) void saveSetting(s, e.target.value); }} />}{!editable ? <small className="sub">Solo lectura: requiere {s.edit_permission}.</small> : null}</div>;
      })}</div>}</div>
    </section>

    <section className="card"><div className="card-h"><h2 className="sec">SLA por severidad</h2></div><div className="card-b"><Note>La configuración de SLA requiere backend (pendiente).</Note></div></section>
  </>;
}
