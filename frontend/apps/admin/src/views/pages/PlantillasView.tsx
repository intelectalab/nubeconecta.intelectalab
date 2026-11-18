/** Administración de plantillas de notificación mediante el módulo Notifications. */
import { useState, type FormEvent } from 'react';
import { isProblem, type CursorPage, type NotificationCategory, type NotificationTemplate, type NotificationTemplateInput } from '@hub/api';
import { useApp } from '../../app/context';
import type { ViewProps } from '../../app/routes';
import { DataTable, type Column } from '../../components/DataTable';
import { Icon } from '../../components/Icon';
import { Modal } from '../../components/Modal';
import { Chip, EmptyState, Note, PageHead, SearchBox, Select, Skeleton, Toolbar } from '../../components/ui';
import { hub } from '../../auth/client';
import { errorText, fDateTime, useCan, useLoad } from './clientes/shared';

const PAGE_SIZE = 25;
const CATEGORY_OPTIONS: [string, string][] = [
  ['notice', 'Aviso'], ['canned_reply', 'Respuesta predefinida'], ['complaint_response', 'Respuesta a reclamo'], ['form_confirmation', 'Confirmación de formulario'],
];
const CATEGORY_LABEL: Record<NotificationCategory, string> = Object.fromEntries(CATEGORY_OPTIONS) as Record<NotificationCategory, string>;
const categoryOf = (value: string) => CATEGORY_LABEL[value as NotificationCategory] ?? value;

export default function PlantillasView(_props: ViewProps) {
  const can = useCan();
  const { toast, dialogs } = useApp();
  const [query, setQuery] = useState('');
  const [channel, setChannel] = useState('');
  const [category, setCategory] = useState('');
  const [active, setActive] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState<NotificationTemplate | 'new' | null>(null);
  const params = {
    q: query.trim() || undefined, size: PAGE_SIZE, cursor: cursor ?? undefined,
    filter: { channel: channel as 'email' | '' , category: category as NotificationCategory | '', is_active: (active === '' ? '' : active === 'true') as boolean | '' },
  };
  const result = useLoad(() => can('automation.notification_template.view')
    ? hub.notifications.templates.list(params)
    : Promise.resolve<CursorPage<NotificationTemplate>>({ data: [], meta: { next_cursor: null, prev_cursor: null, has_more: false, page_size: PAGE_SIZE }, links: { next: null, prev: null } }),
  [can, query, channel, category, active, cursor, reload]);
  const rows = result.data?.data ?? [];
  const meta = result.data?.meta;
  const changed = () => setReload((n) => n + 1);

  async function remove(template: NotificationTemplate) {
    dialogs.confirm({
      title: 'Eliminar plantilla',
      body: <p style={{ margin: 0 }}>Se eliminará «{template.code}». Esta acción no se puede deshacer.</p>,
      okLabel: 'Eliminar', danger: true,
      onOk: async () => {
        try { await hub.notifications.templates.remove(template.id, template.version); toast('Plantilla eliminada', template.code, 'warn'); changed(); }
        catch (e) { toast('No se pudo eliminar', errorText(e), 'err'); if (isProblem(e) && e.code === 'version_conflict') changed(); }
      },
    });
  }

  const columns: Column<NotificationTemplate>[] = [
    { key: 'code', header: 'Código', className: 'mono strong', sort: (t) => t.code, render: (t) => t.code },
    { key: 'channel', header: 'Canal', render: (t) => t.channel },
    { key: 'category', header: 'Categoría', render: (t) => categoryOf(t.category) },
    { key: 'active', header: 'Estado', render: (t) => <Chip kind={t.is_active ? 'ok' : 'neutral'}>{t.is_active ? 'Activa' : 'Inactiva'}</Chip> },
    { key: 'updated', header: 'Actualizada', className: 'nw', render: (t) => fDateTime(t.updated_at) },
    { key: 'actions', header: '', align: 'r', render: (t) => <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
      {can('automation.notification_template.update') ? <><button type="button" className="btn sm" onClick={() => setEditing(t)}>Editar</button><TestButton template={t} /></> : null}
      {can('automation.notification_template.delete') ? <button type="button" className="btn sm danger" onClick={() => void remove(t)}>Eliminar</button> : null}
    </div> },
  ];

  return <>
    <PageHead crumbs={[[ 'Configuración', 'ajustes' ], [ 'Plantillas de correo', 'plantillas' ]]} title="Plantillas de correo" sub="Plantillas de correo para avisos y respuestas de soporte." />
    <section className="card">
      {!can('automation.notification_template.view') ? <div className="card-b"><Note kind="warn">No tiene permiso para consultar plantillas.</Note></div> : <>
        <Toolbar count={result.loading ? 'Cargando…' : `${rows.length}${meta?.has_more ? '+' : ''} plantillas`}><SearchBox label="Buscar plantillas" placeholder="Buscar por código" value={query} onChange={(v) => { setQuery(v); setCursor(null); }} />
          
          <Select label="Canal" value={channel} onChange={(v) => { setChannel(v); setCursor(null); }} options={ [['', 'Todos los canales'], ['email', 'Correo']] } />
          <Select label="Categoría" value={category} onChange={(v) => { setCategory(v); setCursor(null); }} options={ [['', 'Todas las categorías'], ...CATEGORY_OPTIONS] } />
          <Select label="Estado" value={active} onChange={(v) => { setActive(v); setCursor(null); }} options={ [['', 'Todos los estados'], ['true', 'Activas'], ['false', 'Inactivas']] } />
          {can('automation.notification_template.create') ? <button type="button" className="btn primary" onClick={() => setEditing('new')}><Icon name="plus" size="sm" /> Nueva plantilla</button> : null}
        </Toolbar>
        {result.error ? <div className="card-b"><Note kind="warn">No se pudieron cargar plantillas: {errorText(result.error)} <button className="btn sm" onClick={result.reload}>Reintentar</button></Note></div>
          : result.loading && !result.data ? <Skeleton variant="table" rows={4} />
            : !rows.length ? <EmptyState title="Sin plantillas" text="Cree una plantilla para empezar a enviar notificaciones." />
              : <><DataTable columns={columns} rows={rows} rowKey={(t) => t.id} caption="Plantillas de notificación" />
                {meta?.prev_cursor || meta?.next_cursor ? <div className="card-b" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button className="btn sm" disabled={result.loading || !meta.prev_cursor} onClick={() => setCursor(meta.prev_cursor)}>Anterior</button>
                  <button className="btn sm" disabled={result.loading || !meta.next_cursor} onClick={() => setCursor(meta.next_cursor)}>Siguiente</button>
                </div> : null}</>}
      </>}
    </section>
    {editing ? <TemplateForm template={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onSaved={changed} /> : null}
  </>;
}

function TemplateForm({ template, onClose, onSaved }: { template?: NotificationTemplate; onClose: () => void; onSaved: () => void }) {
  const can = useCan();
  const { toast } = useApp();
  const [code, setCode] = useState(template?.code ?? '');
  const [category, setCategory] = useState<NotificationCategory>(template?.category ?? 'notice');
  const [subject, setSubject] = useState(template?.subject ?? '');
  const [body, setBody] = useState(template?.body ?? '');
  const [format, setFormat] = useState<'html' | 'plain'>(template?.content_format ?? 'html');
  const [locale, setLocale] = useState(template?.locale ?? 'es');
  const [active, setActive] = useState(template?.is_active ?? true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setMessage('');
    const input: NotificationTemplateInput = { code: code.trim(), channel: 'email', category, subject: subject.trim() || null, body, content_format: format, locale: locale.trim() || 'es', is_active: active };
    try {
      if (template) await hub.notifications.templates.update(template.id, template.version, input);
      else await hub.notifications.templates.create(input);
      toast(template ? 'Plantilla actualizada' : 'Plantilla creada', input.code); onSaved(); onClose();
    } catch (e) {
      setMessage(errorText(e));
      if (isProblem(e) && e.code === 'version_conflict') { setMessage(`${errorText(e)} Se recargó el listado.`); onSaved(); }
    } finally { setBusy(false); }
  };
  const maySave = can(template ? 'automation.notification_template.update' : 'automation.notification_template.create');
  return <Modal open wide bare onClose={onClose} title={template ? `Editar ${template.code}` : 'Nueva plantilla de correo'}>
    <form className="modal-b" onSubmit={(e) => void submit(e)}><div className="form-grid">
      <label className="field">Código*<input required className="input" maxLength={160} value={code} onChange={(e) => setCode(e.target.value)} /></label>
      <label className="field">Canal<select className="select" value="email" disabled><option value="email">Correo</option></select></label>
      <label className="field">Categoría<select className="select" value={category} onChange={(e) => setCategory(e.target.value as NotificationCategory)}>{CATEGORY_OPTIONS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></label>
      <label className="field">Formato<select className="select" value={format} onChange={(e) => setFormat(e.target.value as 'html' | 'plain')}><option value="html">HTML</option><option value="plain">Texto plano</option></select></label>
      <label className="field full">Asunto<input className="input" maxLength={1000} value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
      <label className="field full">Cuerpo*<textarea required className="input" rows={12} value={body} onChange={(e) => setBody(e.target.value)} /></label>
      <label className="field">Idioma<input className="input" maxLength={12} value={locale} onChange={(e) => setLocale(e.target.value)} /></label>
      <label className="field" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Activa</label>
    </div>
    {format === 'html' ? <div style={{ marginTop: 12 }}><Note kind="warn">Para plantillas HTML, el backend rechaza contenido con &lt;script&gt;, &lt;iframe&gt;, &lt;object&gt;, &lt;embed&gt;, &lt;style&gt;, javascript: o atributos de evento como onload=.</Note></div> : null}
    {message ? <p className="err" role="alert">{message}</p> : null}
    <div className="modal-f"><button type="button" className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={busy || !maySave}>{busy ? 'Guardando…' : 'Guardar plantilla'}</button></div></form>
  </Modal>;
}

function TestButton({ template }: { template: NotificationTemplate }) {
  const { toast } = useApp();
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setMessage('');
    try {
      const delivery = await hub.notifications.test({ template_code: template.code, to: to.trim() });
      toast('Prueba solicitada', `${template.code} · ${delivery.status}`); setOpen(false); setTo('');
    } catch (e) { setMessage(errorText(e)); }
    finally { setBusy(false); }
  }
  return <>
    <button type="button" className="btn sm" onClick={() => { setMessage(''); setOpen(true); }}><Icon name="send" size="sm" /> Probar</button>
    <Modal open={open} onClose={() => setOpen(false)} title="Enviar correo de prueba" sub={template.code} bare>
      <form className="modal-b" onSubmit={(e) => void submit(e)}>
        <label className="field">Enviar a*<input required type="email" maxLength={320} className="input" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        {message ? <p className="err" role="alert">{message}</p> : null}
        <div className="modal-f"><button type="button" className="btn" onClick={() => setOpen(false)}>Cancelar</button><button className="btn primary" disabled={busy}>{busy ? 'Enviando…' : 'Enviar prueba'}</button></div>
      </form>
    </Modal>
  </>;
}
