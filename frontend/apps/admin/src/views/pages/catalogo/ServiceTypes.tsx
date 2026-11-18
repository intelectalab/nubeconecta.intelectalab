import { useEffect, useMemo, useState } from 'react';
import { isProblem, type ServiceType, type ServiceTypeField, type DeliveryTask, type FieldOption, type ProductCategory, type ServiceComponentKind, type FieldType, type FilledBy, type I18nText, type ServiceTypeSaleMode } from '@hub/api';
import { useApp } from '../../../app/context';
import { DataTable, type Column } from '../../../components/DataTable';
import { Sheet } from '../../../components/Modal';
import { Chip, EmptyState, Note, SearchBox, Select, Skeleton, Spinner, Switch, Tabs, Toolbar } from '../../../components/ui';
import { errorText, useCan, useLoad, useLookups } from '../clientes/shared';
import { catalogApi } from './shared';

const PER = 50;
type TypeDraft = {
  code: string; name: I18nText; description: I18nText; icon: string | null;
  category_id: string; brand_ids: string[]; sale_mode: ServiceTypeSaleMode;
  requires_contract: boolean; default_provider_id: string | null;
  component_kind: ServiceComponentKind | null; delivery_tasks: DeliveryTask[]; portal_fields: string[];
};
type FieldDraft = {
  key: string; label: I18nText; help_text: I18nText; field_type: FieldType;
  options: FieldOption[]; validation: Record<string, unknown>; is_required: boolean;
  filled_by: FilledBy; position: number | undefined; is_active: boolean;
};
const kinds: [ServiceComponentKind, string][] = [
  ['server', 'Servidor'], ['hosting', 'Hosting'], ['domain', 'Dominio'], ['dns', 'DNS'], ['cdn', 'CDN'], ['email', 'Correo'],
  ['bulk_email', 'Correo masivo'], ['ssl_certificate', 'Certificado SSL'], ['database', 'Base de datos'], ['storage', 'Almacenamiento'],
  ['wordpress_site', 'Sitio WordPress'], ['custom_system', 'Sistema a medida'], ['moodle_platform', 'Plataforma Moodle'], ['license', 'Licencia'], ['other', 'Otro'],
];
const fieldTypes: [FieldType, string][] = [['text', 'Texto'], ['number', 'Número'], ['select', 'Selección'], ['date', 'Fecha'], ['file', 'Archivo'], ['checkbox', 'Casilla']];
function statusLabel(s: ServiceType['status']): string { return s === 'draft' ? 'Borrador' : s === 'active' ? 'Activo' : 'Archivado'; }
const initialType = (): TypeDraft => ({
  code: '', name: { es: '', en: '' }, description: { es: '', en: '' }, icon: null, category_id: '', brand_ids: [],
  sale_mode: 'online', requires_contract: false, default_provider_id: null, component_kind: null, delivery_tasks: [], portal_fields: [],
});

export function ServiceTypesPanel() {
  const can = useCan();
  const [q, setQ] = useState('');
  const [qDeb, setQDeb] = useState('');
  const [status, setStatus] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ id?: string } | null>(null);
  const cats = useLoad(() => catalogApi.categories.list().then((r) => r.data), []);
  const categories = cats.data ?? [];
  const filter = useMemo(() => ({ status: status || undefined, category_id: categoryId || undefined }), [status, categoryId]);
  const res = useLoad(() => catalogApi.serviceTypes.list({ q: qDeb, size: PER, cursor, filter }), [qDeb, filter, cursor]);
  const rows = res.data?.data ?? [];
  const meta = res.data?.meta;
  useEffect(() => { const t = setTimeout(() => { setCursor(null); setQDeb(q.trim()); }, 300); return () => clearTimeout(t); }, [q]);
  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? '—';
  const columns: Column<ServiceType>[] = [
    { key: 'code', header: 'Código', className: 'mono nw', render: (x) => x.code },
    { key: 'name', header: 'Nombre', minWidth: 180, render: (x) => <button type="button" className="rowlink" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer' }} onClick={() => setEditor({ id: x.id })}>{x.name.es}</button> },
    { key: 'category', header: 'Categoría', render: (x) => categoryName(x.category_id) },
    { key: 'status', header: 'Estado', render: (x) => <Chip kind={x.status === 'active' ? 'ok' : ''} style={x.status === 'archived' ? { opacity: 0.62 } : undefined}>{statusLabel(x.status)}</Chip> },
    { key: 'sale', header: 'Venta', render: (x) => x.sale_mode === 'online' ? 'En línea' : 'Solo cotización' },
  ];
  return <>
    <Toolbar count={res.loading ? <Spinner size="sm" /> : `${rows.length}${meta?.next_cursor ? '+' : ''} tipos`}>
      <SearchBox value={q} onChange={(v) => { setQ(v); setCursor(null); }} placeholder="Nombre o código…" label="Buscar tipos de servicio" />
      <Select value={status} onChange={(v) => { setStatus(v); setCursor(null); }} label="Estado" options={[['', 'Todos los estados'], ['draft', 'Borrador'], ['active', 'Activo'], ['archived', 'Archivado']]} />
      <Select value={categoryId} onChange={(v) => { setCategoryId(v); setCursor(null); }} label="Categoría" options={[['', 'Todas las categorías'], ...categories.map((c) => [c.id, c.name] as [string, string])]} />
      {can('catalog.service_type.create') ? <button type="button" className="btn primary" onClick={() => setEditor({})}>＋ Nuevo tipo</button> : null}
    </Toolbar>
    {cats.error ? <Note kind="warn" role="alert">No se pudieron cargar las categorías: {errorText(cats.error)}</Note> : null}
    <section className="card" aria-busy={res.loading}>
      {res.error ? <div className="card-b"><Note kind="warn" role="alert">No se pudieron cargar los tipos: {errorText(res.error)} <button type="button" className="btn sm" onClick={res.reload}>Reintentar</button></Note></div>
        : res.loading ? <Skeleton variant="table" rows={6} />
          : rows.length ? <><DataTable columns={columns} rows={rows} rowKey={(x) => x.id} caption="Tipos de servicio" />
            <div className="card-b" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="btn sm" disabled={res.loading || !meta?.prev_cursor} onClick={() => setCursor(meta?.prev_cursor ?? null)}>Anterior</button>
              <button type="button" className="btn sm" disabled={res.loading || !meta?.next_cursor} onClick={() => setCursor(meta?.next_cursor ?? null)}>Siguiente</button>
            </div></>
          : <EmptyState title="Sin tipos de servicio" text={q || status || categoryId ? 'Ajuste la búsqueda o los filtros.' : 'Cree el primer tipo de servicio.'} />}
    </section>
    {editor ? <ServiceTypeEditor id={editor.id} categories={categories} onClose={() => setEditor(null)} onChanged={res.reload} onCreated={(id) => { setEditor({ id }); res.reload(); }} /> : null}
  </>;
}

function ServiceTypeEditor({ id, categories, onClose, onChanged, onCreated }: { id?: string; categories: ProductCategory[]; onClose: () => void; onChanged: () => void; onCreated: (id: string) => void }) {
  const { toast } = useApp();
  const can = useCan();
  const { brands } = useLookups();
  const detail = useLoad(() => id ? catalogApi.serviceTypes.get(id) : Promise.resolve(null), [id]);
  const [input, setInput] = useState<TypeDraft>(initialType);
  const [entity, setEntity] = useState<ServiceType | null>(null);
  const [tab, setTab] = useState('identity');
  const [busy, setBusy] = useState(false);
  const [fieldEdit, setFieldEdit] = useState<ServiceTypeField | null>(null);
  const [fieldForm, setFieldForm] = useState<FieldDraft>(newField());
  const [taskChecklist, setTaskChecklist] = useState<Record<number, string>>({});
  const allowedWrite = id ? can('catalog.service_type.update') : can('catalog.service_type.create');
  const fieldsRes = useLoad(() => id ? catalogApi.serviceTypes.fields.list(id) : Promise.resolve([] as ServiceTypeField[]), [id]);
  useEffect(() => {
    if (detail.data) {
      setEntity(detail.data);
      const { id: _id, version: _version, status: _status, activated_at: _activated, archived_at: _archived, fields: _fields, ...rest } = detail.data;
      setInput({ ...initialType(), ...rest });
      setTaskChecklist(Object.fromEntries((detail.data.delivery_tasks ?? []).map((t, i) => [i, (t.checklist ?? []).join('\n')])));
    }
  }, [detail.data]);
  const set = <K extends keyof TypeDraft>(key: K, value: TypeDraft[K]) => setInput((prev) => ({ ...prev, [key]: value }));
  const updateI18n = (key: 'name' | 'description', lang: 'es' | 'en', value: string) => set(key, { ...(input[key] ?? {}), [lang]: value });
  const handleError = (e: unknown, title: string) => {
    const conflict = isProblem(e) && e.status === 409;
    toast(title, conflict ? 'Cambió en otra sesión. Se recargaron los datos.' : isProblem(e) && e.status === 422 ? `Revise los campos. ${errorText(e)}` : errorText(e), 'err');
    if (conflict) { detail.reload(); fieldsRes.reload(); }
  };
  const save = async () => {
    if (!allowedWrite) return;
    setBusy(true);
    try {
      if (entity) {
        const saved = await catalogApi.serviceTypes.update(entity.id, entity.version, input);
        setEntity(saved); toast('Tipo de servicio guardado', saved.name.es); detail.reload(); onChanged();
      } else {
        const created = await catalogApi.serviceTypes.create(input);
        toast('Tipo de servicio creado', created.name.es); onCreated(created.id);
      }
    } catch (e) { handleError(e, 'No se pudo guardar el tipo'); }
    finally { setBusy(false); }
  };
  const changeStatus = async (action: 'activate' | 'archive') => {
    if (!entity || !can('catalog.service_type.update')) return;
    setBusy(true);
    try {
      const updated = action === 'activate' ? await catalogApi.serviceTypes.activate(entity.id, entity.version) : await catalogApi.serviceTypes.archive(entity.id, entity.version);
      setEntity(updated); toast(action === 'activate' ? 'Tipo activado' : 'Tipo archivado', updated.name.es); detail.reload(); onChanged();
    } catch (e) { handleError(e, action === 'activate' ? 'No se pudo activar' : 'No se pudo archivar'); }
    finally { setBusy(false); }
  };
  const saveTasks = async () => { await save(); };
  const resetField = () => { setFieldEdit(null); setFieldForm(newField()); };
  const saveField = async () => {
    if (!id || !entity || !can('catalog.service_type.update')) return;
    const options = fieldForm.field_type === 'select' ? fieldForm.options : [];
    if (fieldForm.field_type === 'select' && !options?.length) { toast('Revise los campos', 'Agregue al menos una opción.', 'err'); return; }
    setBusy(true);
    try {
      if (fieldEdit) await catalogApi.serviceTypes.fields.update(id, fieldEdit.id, fieldEdit.version, { label: fieldForm.label, help_text: fieldForm.help_text, is_required: fieldForm.is_required, filled_by: fieldForm.filled_by, position: fieldForm.position, is_active: fieldForm.is_active, options });
      else await catalogApi.serviceTypes.fields.create(id, { ...fieldForm, options });
      toast(fieldEdit ? 'Campo actualizado' : 'Campo agregado'); resetField(); fieldsRes.reload(); detail.reload();
    } catch (e) { handleError(e, 'No se pudo guardar el campo'); }
    finally { setBusy(false); }
  };
  const removeField = async (f: ServiceTypeField) => {
    if (!id || !can('catalog.service_type.delete')) return;
    try { await catalogApi.serviceTypes.fields.remove(id, f.id); toast('Campo quitado', f.label.es); fieldsRes.reload(); detail.reload(); }
    catch (e) { if (isProblem(e) && e.status === 409) toast('No se puede quitar', 'El campo tiene valores; desactívelo.', 'err'); else handleError(e, 'No se pudo quitar el campo'); }
  };
  const setTask = (i: number, value: Partial<DeliveryTask>) => set('delivery_tasks', (input.delivery_tasks ?? []).map((t, n) => n === i ? { ...t, ...value } : t));
  const tabs = [{ id: 'identity', label: 'Identidad' }, ...(entity ? [{ id: 'status', label: 'Estado' }, { id: 'fields', label: 'Campos' }, { id: 'tasks', label: 'Tareas de entrega' }, { id: 'portal', label: 'Campos del portal' }] : [])];
  return <Sheet open onClose={onClose} title={entity?.name.es ?? (id ? 'Tipo de servicio' : 'Nuevo tipo de servicio')} sub={entity ? `${entity.code} · ${entity.status}` : 'Borrador'}>
    {id && detail.loading && !detail.data ? <Spinner centered label="Cargando tipo de servicio" /> : detail.error ? <Note kind="warn" role="alert">{errorText(detail.error)} <button type="button" className="btn sm" onClick={detail.reload}>Reintentar</button></Note> : <>
      {entity ? <Tabs tabs={tabs} value={tab} onChange={setTab} label="Secciones del tipo de servicio" style={{ marginBottom: 16 }} /> : null}
      {tab === 'identity' ? <div style={{ display: 'grid', gap: 12 }}>
        <FieldText label="Código" value={input.code} disabled={!allowedWrite || !!entity} hint="Minúsculas y guiones; por ejemplo soporte-premium" onChange={(v) => set('code', v)} />
        <div className="grid g-2"><FieldText label="Nombre (es)" value={input.name.es ?? ''} disabled={!allowedWrite} onChange={(v) => updateI18n('name', 'es', v)} /><FieldText label="Nombre (en)" value={input.name.en ?? ''} disabled={!allowedWrite} onChange={(v) => updateI18n('name', 'en', v)} /></div>
        <div className="grid g-2"><FieldText label="Descripción (es)" value={input.description.es ?? ''} disabled={!allowedWrite} multiline onChange={(v) => updateI18n('description', 'es', v)} /><FieldText label="Descripción (en)" value={input.description.en ?? ''} disabled={!allowedWrite} multiline onChange={(v) => updateI18n('description', 'en', v)} /></div>
        <div className="grid g-2"><FieldText label="Icono" value={input.icon ?? ''} disabled={!allowedWrite} hint="Nombre de icono" onChange={(v) => set('icon', v || null)} /><label className="field">Categoría<Select value={input.category_id} disabled={!allowedWrite} options={[['', 'Seleccione una categoría'], ...categories.map((c) => [c.id, c.name] as [string, string])]} onChange={(v) => set('category_id', v)} /></label></div>
        <div className="grid g-2"><label className="field">Modalidad de venta<Select value={input.sale_mode} disabled={!allowedWrite} options={[["online", 'En línea'], ['quote_only', 'Solo cotización']]} onChange={(v) => set('sale_mode', v as ServiceTypeSaleMode)} /></label><label className="field">Componente<Select value={input.component_kind ?? ''} disabled={!allowedWrite} options={[['', 'Ninguno'], ...kinds]} onChange={(v) => set('component_kind', (v || null) as ServiceComponentKind | null)} /></label></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span>Requiere contrato</span><Switch checked={input.requires_contract} disabled={!allowedWrite} label="Requiere contrato" onChange={(v) => set('requires_contract', v)} /></div>
        <FieldText label="Proveedor predeterminado" value={input.default_provider_id ?? ''} disabled={!allowedWrite} hint="UUID del proveedor" onChange={(v) => set('default_provider_id', v || null)} />
        <div><b>Marcas</b><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 6, marginTop: 6 }}>{brands.map((b) => <label key={b.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" disabled={!allowedWrite} checked={input.brand_ids.includes(b.id)} onChange={(e) => set('brand_ids', e.target.checked ? [...input.brand_ids, b.id] : input.brand_ids.filter((x) => x !== b.id))} />{b.name}</label>)}</div></div>
        {allowedWrite ? <button type="button" className="btn primary" disabled={busy || !input.code.trim() || !input.name.es?.trim() || !input.category_id} onClick={() => void save()}>{busy ? 'Guardando…' : 'Guardar'}</button> : null}
      </div> : null}
      {entity && tab === 'status' ? <div style={{ display: 'grid', gap: 14 }}><Chip kind={entity.status === 'active' ? 'ok' : ''} style={entity.status === 'archived' ? { opacity: 0.62 } : undefined}>{statusLabel(entity.status)}</Chip><Note>Para activar un tipo debe tener al menos una marca asignada. El servidor valida también los demás requisitos y mostrará el detalle si la activación no es válida.</Note><div style={{ display: 'flex', gap: 8 }}>{can('catalog.service_type.update') ? <button type="button" className="btn primary" disabled={busy || !input.brand_ids.length || entity.status === 'active'} onClick={() => void changeStatus('activate')}>Activar</button> : null}{can('catalog.service_type.update') ? <button type="button" className="btn" disabled={busy} onClick={() => void changeStatus('archive')}>Archivar</button> : null}</div></div> : null}
      {entity && tab === 'fields' ? <div style={{ display: 'grid', gap: 12 }}>
        {fieldsRes.error ? <Note kind="warn" role="alert">{errorText(fieldsRes.error)}</Note> : fieldsRes.loading ? <Spinner centered label="Cargando campos" /> : (fieldsRes.data ?? []).length ? <DataTable rows={[...(fieldsRes.data ?? [])].sort((a,b) => a.position-b.position)} rowKey={(f) => f.id} caption="Campos del tipo" columns={fieldColumns((f) => { setFieldEdit(f); setFieldForm(fieldToInput(f)); }, removeField, can('catalog.service_type.update'), can('catalog.service_type.delete'))} /> : <EmptyState title="Sin campos" text="Agregue campos para capturar datos al contratar el servicio." />}
        {can('catalog.service_type.update') ? <div className="card" style={{ padding: 14, display: 'grid', gap: 10 }}><h3 style={{ margin: 0 }}>{fieldEdit ? 'Editar campo' : 'Agregar campo'}</h3>{!fieldEdit ? <div className="grid g-2"><FieldText label="Clave" value={fieldForm.key} hint="Regex: ^[a-z][a-z0-9_]*$" onChange={(v) => setFieldForm({ ...fieldForm, key: v })} /><label className="field">Tipo<Select value={fieldForm.field_type} options={fieldTypes} onChange={(v) => setFieldForm({ ...fieldForm, field_type: v as FieldType, options: v === 'select' ? fieldForm.options : [] })} /></label></div> : <p className="sub">{fieldEdit.key} · {fieldEdit.field_type}</p>}
          <FieldText label="Etiqueta (es)" value={fieldForm.label.es ?? ''} onChange={(v) => setFieldForm({ ...fieldForm, label: { ...fieldForm.label, es: v } })} />
          <div className="grid g-2"><label className="field">Lo llena<Select value={fieldForm.filled_by} options={[["customer", 'Cliente'], ['staff', 'Soporte']]} onChange={(v) => setFieldForm({ ...fieldForm, filled_by: v as FilledBy })} /></label><FieldText label="Posición" type="number" value={fieldForm.position == null ? '' : String(fieldForm.position)} hint="Vacío: se agrega al final" onChange={(v) => setFieldForm({ ...fieldForm, position: v === '' ? undefined : Number(v) })} /></div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}><span>Obligatorio <Switch checked={fieldForm.is_required} label="Campo obligatorio" onChange={(v) => setFieldForm({ ...fieldForm, is_required: v })} /></span>{fieldEdit ? <span>Activo <Switch checked={fieldForm.is_active ?? true} label="Campo activo" onChange={(v) => setFieldForm({ ...fieldForm, is_active: v })} /></span> : null}</div>
          {fieldForm.field_type === 'select' ? <div style={{ display: 'grid', gap: 8 }}><b>Opciones</b>{(fieldForm.options ?? []).map((o, i) => <div key={i} className="grid g-2"><FieldText label={`Valor ${i + 1}`} value={o.value} onChange={(v) => setFieldForm({ ...fieldForm, options: fieldForm.options?.map((x,n) => n === i ? { ...x, value: v } : x) })} /><FieldText label={`Etiqueta ${i + 1} (es)`} value={o.label.es ?? ''} onChange={(v) => setFieldForm({ ...fieldForm, options: fieldForm.options?.map((x,n) => n === i ? { ...x, label: { ...x.label, es: v } } : x) })} /></div>)}<button type="button" className="btn sm" onClick={() => setFieldForm({ ...fieldForm, options: [...(fieldForm.options ?? []), { value: '', label: { es: '' } }] })}>＋ Opción</button></div> : null}
          <div style={{ display: 'flex', gap: 8 }}><button type="button" className="btn primary" disabled={busy || !fieldForm.label.es?.trim() || (!fieldEdit && (!fieldForm.key.trim() || !/^[a-z][a-z0-9_]*$/.test(fieldForm.key)))} onClick={() => void saveField()}>{fieldEdit ? 'Guardar campo' : 'Agregar campo'}</button>{fieldEdit ? <button type="button" className="btn" onClick={resetField}>Cancelar edición</button> : null}</div>
        </div> : null}
      </div> : null}
      {entity && tab === 'tasks' ? <div style={{ display: 'grid', gap: 12 }}>{(input.delivery_tasks ?? []).map((task, i) => <div key={i} className="card" style={{ padding: 12, display: 'grid', gap: 8 }}><div className="grid g-2"><FieldText label={`Tarea ${i+1} (es)`} value={task.title.es ?? ''} onChange={(v) => setTask(i, { title: { ...task.title, es: v } })} /><FieldText label="Rol" value={task.role ?? ''} onChange={(v) => setTask(i, { role: v || null })} /></div><FieldText label="Días para vencer" type="number" value={task.due_days == null ? '' : String(task.due_days)} onChange={(v) => setTask(i, { due_days: v === '' ? null : Math.max(0, Number(v)) })} /><FieldText label="Checklist (un elemento por línea)" multiline value={taskChecklist[i] ?? (task.checklist ?? []).join('\n')} onChange={(v) => { setTaskChecklist({ ...taskChecklist, [i]: v }); setTask(i, { checklist: v.split('\n').map((x) => x.trim()).filter(Boolean) }); }} /><button type="button" className="btn sm" disabled={!can('catalog.service_type.update')} onClick={() => set('delivery_tasks', (input.delivery_tasks ?? []).filter((_, n) => n !== i))}>Quitar tarea</button></div>)}<div style={{ display: 'flex', gap: 8 }}><button type="button" className="btn" disabled={!can('catalog.service_type.update')} onClick={() => set('delivery_tasks', [...(input.delivery_tasks ?? []), { title: { es: '' }, role: null, due_days: null, checklist: [] }])}>＋ Agregar tarea</button><button type="button" className="btn primary" disabled={busy || !can('catalog.service_type.update')} onClick={() => void saveTasks()}>Guardar tareas</button></div></div> : null}
      {entity && tab === 'portal' ? <div style={{ display: 'grid', gap: 12 }}><p className="sub">Seleccione qué campos verá el cliente en el portal.</p>{(fieldsRes.data ?? []).map((f) => <label key={f.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" disabled={!can('catalog.service_type.update')} checked={(input.portal_fields ?? []).includes(f.key)} onChange={(e) => set('portal_fields', e.target.checked ? [...(input.portal_fields ?? []), f.key] : (input.portal_fields ?? []).filter((k) => k !== f.key))} />{f.label.es} <span className="sub mono">{f.key}</span></label>)}<button type="button" className="btn primary" disabled={busy || !can('catalog.service_type.update')} onClick={() => void save()}>Guardar campos del portal</button></div> : null}
    </>}
  </Sheet>;
}

function newField(): FieldDraft { return { key: '', label: { es: '' }, help_text: {}, field_type: 'text', options: [], validation: {}, is_required: false, filled_by: 'customer', position: undefined, is_active: true }; }
function fieldToInput(f: ServiceTypeField): FieldDraft { return { key: f.key, label: f.label, help_text: f.help_text, field_type: f.field_type, options: f.options, validation: f.validation, is_required: f.is_required, filled_by: f.filled_by, position: f.position, is_active: f.is_active }; }
function FieldText({ label, value, onChange, disabled, hint, multiline, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean; hint?: string; multiline?: boolean; type?: string }) {
  return <label className="field">{label}{multiline ? <textarea className="input" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} rows={3} /> : <input className="input" type={type} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />}{hint ? <small className="hint">{hint}</small> : null}</label>;
}
function fieldColumns(edit: (f: ServiceTypeField) => void, remove: (f: ServiceTypeField) => void, canUpdate: boolean, canDelete: boolean): Column<ServiceTypeField>[] {
  return [
    { key: 'key', header: 'Clave', className: 'mono', render: (f) => f.key },
    { key: 'label', header: 'Etiqueta', render: (f) => f.label.es },
    { key: 'type', header: 'Tipo', render: (f) => f.field_type },
    { key: 'required', header: 'Obligatorio', render: (f) => f.is_required ? 'Sí' : 'No' },
    { key: 'filled', header: 'Lo llena', render: (f) => f.filled_by === 'customer' ? 'Cliente' : 'Soporte' },
    { key: 'active', header: 'Activo', render: (f) => <Chip kind={f.is_active ? 'ok' : ''}>{f.is_active ? 'Sí' : 'No'}</Chip> },
    { key: 'actions', header: '', render: (f) => <span style={{ display: 'flex', gap: 6 }}>{canUpdate ? <button type="button" className="btn sm" onClick={() => edit(f)}>Editar</button> : null}{canDelete ? <button type="button" className="btn sm" onClick={() => remove(f)}>Quitar</button> : null}</span> },
  ];
}
