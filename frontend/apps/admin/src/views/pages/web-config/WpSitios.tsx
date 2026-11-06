/** WordPress: administración de sitios, credenciales de plugin y avisos de caché. */
import { useState, type FormEvent } from 'react';
import { isProblem, type CursorPage, type WpCacheInvalidation, type WpSite, type WpSiteInput, type WpSiteToken } from '@hub/api';
import { useApp } from '../../../app/context';
import { DataTable, type Column } from '../../../components/DataTable';
import { Icon } from '../../../components/Icon';
import { Modal } from '../../../components/Modal';
import { Chip, EmptyState, Note, Select, Skeleton, Toolbar } from '../../../components/ui';
import { hub } from '../../../auth/client';
import { SCUSE, WPS } from '../../../data';
import { errorText, fDateTime, LIVE, useCan, useLoad } from '../clientes/shared';
import { ScBox } from './shared';

const PER = 25;
const api = hub.webConnector;
const page = <T,>(rows: T[]): CursorPage<T> => ({ data: rows, meta: { next_cursor: null, prev_cursor: null, has_more: false, page_size: PER }, links: { next: null, prev: null } });
const demoSites: WpSite[] = WPS.map((w, i) => ({ id: w.id, organization_id: '', brand_id: w.brand, name: w.host, base_url: `https://${w.host}`, network_site_id: null, webhook_url: w.wh || null, allowed_origins: [`https://${w.host}`], thank_you_url: null, status: w.st === 'Conectado' ? 'active' : 'pending', plugin_version: w.plugin || null, wordpress_version: w.wp || null, disabled_reason: null, has_webhook_secret: !!w.wh, last_seen_at: null, last_invalidation_at: w.inv?.toISOString() ?? null, version: 1, created_at: new Date(Date.now() - i * 86400000).toISOString(), updated_at: new Date().toISOString(), created_by: null, updated_by: null }));
const SITE_LABEL = { pending: 'Pendiente', active: 'Activo', disabled: 'Desactivado' } as const;
const SITE_CHIP = { pending: 'warn', active: 'ok', disabled: 'neutral' } as const;
const INVALIDATION_CHIP: Record<string, 'info' | 'ok' | 'danger' | 'neutral'> = { pending: 'info', delivered: 'ok', failed: 'danger' };

export default function WpSitios() {
  const can = useCan();
  const { brand, toast, dialogs, refresh } = useApp();
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState<WpSite | 'new' | null>(null);
  const [openSite, setOpenSite] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const brands = useLoad(() => hub.customers.brands(), []);
  const brandId = brands.data?.find((b) => b.code === brand)?.id;
  const res = useLoad(() => !can('web_connector.site.view') ? Promise.resolve(page<WpSite>([])) : LIVE
    ? brand !== 'all' && !brandId ? Promise.resolve(page<WpSite>([])) : api.sites.list({ q: query.trim() || undefined, filter: { brand_id: brand === 'all' ? undefined : brandId, status: (filterStatus || undefined) as WpSite['status'] | undefined }, cursor, size: PER, sort: '-created_at' })
    : Promise.resolve(page(demoSites.filter((s) => (brand === 'all' || s.brand_id === brand) && (!filterStatus || s.status === filterStatus) && (!query || `${s.name} ${s.base_url}`.toLowerCase().includes(query.toLowerCase()))))),
  [query, filterStatus, brand, brandId, cursor, reload]);
  const inv = useLoad(() => !can('web_connector.cache_invalidation.view') || !LIVE ? Promise.resolve(page<WpCacheInvalidation>([])) : api.cacheInvalidations.list({ size: PER, sort: '-created_at' }), [reload, can('web_connector.cache_invalidation.view')]);
  const rows = res.data?.data ?? [];
  const meta = res.data?.meta;
  const changed = () => { setReload((n) => n + 1); refresh(); };

  const columns: Column<WpSite>[] = [
    { key: 'site', header: 'Sitio', className: 'strong', render: (s) => <><span>{s.name}</span><div className="sub">{s.base_url}</div></> },
    { key: 'status', header: 'Estado', render: (s) => <Chip kind={SITE_CHIP[s.status]}>{SITE_LABEL[s.status]}</Chip> },
    { key: 'secret', header: 'Secreto webhook', render: (s) => s.has_webhook_secret ? <Chip kind="ok">Configurado</Chip> : <Chip kind="warn">Pendiente</Chip> },
    { key: 'seen', header: 'Última actividad', className: 'nw', render: (s) => fDateTime(s.last_seen_at) },
    { key: 'actions', header: '', align: 'r', render: (s) => <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
      {can('web_connector.site.update') ? <><button className="btn sm" onClick={() => setEditing(s)}>Editar</button><button className="btn sm" disabled={busyId === s.id} onClick={() => void test(s)}><Icon name="activity" size="sm" /> Probar webhook</button><button className="btn sm" disabled={busyId === s.id} onClick={() => void rotate(s)}><Icon name="lock" size="sm" /> Rotar secreto</button>{s.status === 'active' ? <button className="btn sm" disabled={busyId === s.id} onClick={() => void disable(s)}>Desactivar</button> : <button className="btn sm" disabled={busyId === s.id} onClick={() => void activate(s)}>Activar</button>}</> : null}
      {can('web_connector.site_token.view') ? <button className="btn sm" onClick={() => setOpenSite(openSite === s.id ? null : s.id)}>{openSite === s.id ? 'Cerrar tokens' : 'Tokens'}</button> : null}
      {can('web_connector.site.delete') ? <button className="btn sm danger" onClick={() => removeSite(s)}>Eliminar</button> : null}
    </div> },
  ];

  async function test(s: WpSite) {
    setBusyId(s.id);
    try { const result = LIVE ? await api.sites.testWebhook(s.id) : null; toast('Prueba de webhook', result ? `${result.status} · HTTP ${result.response_status ?? '—'}${result.last_error ? ` · ${result.last_error}` : ''}` : 'Disponible en backend real', result?.status === 'failed' ? 'warn' : 'ok'); changed(); }
    catch (e) { toast('No se pudo probar el webhook', errorText(e), 'err'); if (isProblem(e) && e.code === 'version_conflict') res.reload(); }
    finally { setBusyId(null); }
  }
  async function rotate(s: WpSite) {
    setBusyId(s.id);
    try {
      const result = await api.sites.rotateSecret(s.id);
      dialogs.open(<><Note kind="warn" icon="tri">Copie el secreto ahora. Por seguridad no se volverá a mostrar.</Note><ScBox code={result.webhook_secret} label="Secreto webhook" /><p className="sub">El secreto anterior sigue siendo válido hasta {fDateTime(result.previous_secret_valid_until)}.</p></>, { title: 'Secreto webhook generado', sub: s.base_url, footer: <button className="btn primary" onClick={() => dialogs.close()}>Listo</button> });
      changed();
    } catch (e) { toast('No se pudo rotar el secreto', errorText(e), 'err'); if (isProblem(e) && e.code === 'version_conflict') res.reload(); }
    finally { setBusyId(null); }
  }
  async function activate(s: WpSite) {
    setBusyId(s.id); try { await api.sites.activate(s.id, s.version); toast('Sitio activado', s.name); changed(); }
    catch (e) { toast('No se pudo activar', errorText(e), 'err'); if (isProblem(e) && e.code === 'version_conflict') res.reload(); } finally { setBusyId(null); }
  }
  async function disable(s: WpSite) {
    dialogs.form({ title: 'Desactivar sitio', sub: s.name, fields: [{ id: 'reason', label: 'Motivo', type: 'textarea', req: true, full: true }], submit: 'Desactivar', onSubmit: async ({ reason }) => {
      setBusyId(s.id); try { await api.sites.disable(s.id, s.version, reason); toast('Sitio desactivado', s.name, 'warn'); changed(); }
      catch (e) { toast('No se pudo desactivar', errorText(e), 'err'); if (isProblem(e) && e.code === 'version_conflict') res.reload(); } finally { setBusyId(null); }
    } });
  }
  function removeSite(s: WpSite) { dialogs.confirm({ title: 'Eliminar sitio', body: <p>Se dará de baja {s.base_url} y se revocarán sus tokens.</p>, okLabel: 'Eliminar', danger: true, onOk: async () => { try { await api.sites.remove(s.id); toast('Sitio eliminado', s.name, 'warn'); changed(); } catch (e) { toast('No se pudo eliminar', errorText(e), 'err'); } } }); }

  return <div className="card-b" style={{ paddingTop: 16, display: 'grid', gap: 16 }}>
    <Note>Administre los sitios conectados, los secretos de firma y los tokens de solo lectura usados por el plugin de WordPress.</Note>
    {!can('web_connector.site.view') ? <Note kind="warn">No tiene permiso para consultar sitios conectados.</Note> : null}
    <section className="card">
      <Toolbar count={res.loading ? 'Cargando…' : `${rows.length}${meta?.has_more ? '+' : ''} sitios`}>
        <input className="input" aria-label="Buscar sitios WordPress" placeholder="Buscar nombre o dominio" value={query} onChange={(e) => { setQuery(e.target.value); setCursor(null); }} />
        <Select label="Estado" value={filterStatus} onChange={(v) => { setFilterStatus(v); setCursor(null); }} options={ [['', 'Todos'], ['pending', 'Pendiente'], ['active', 'Activo'], ['disabled', 'Desactivado']] } />
        {can('web_connector.site.create') ? <button className="btn primary" onClick={() => setEditing('new')}><Icon name="plus" size="sm" /> Nuevo sitio</button> : null}
      </Toolbar>
      {res.error ? <div className="card-b"><Note kind="warn" icon="tri">No se pudieron cargar sitios: {errorText(res.error)} <button className="btn sm" onClick={res.reload}>Reintentar</button></Note></div>
        : res.loading && !res.data ? <Skeleton variant="table" rows={4} />
          : !rows.length ? <EmptyState title="Sin sitios conectados" text="Registre un sitio para vincular el plugin de WordPress." />
            : <><DataTable columns={columns} rows={rows} rowKey={(s) => s.id} caption="Sitios conectados de WordPress" />{meta?.prev_cursor || meta?.next_cursor ? <div className="card-b" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}><button className="btn sm" disabled={res.loading || !meta.prev_cursor} onClick={() => setCursor(meta.prev_cursor ?? null)}>Anterior</button><button className="btn sm" disabled={res.loading || !meta.next_cursor} onClick={() => setCursor(meta.next_cursor ?? null)}>Siguiente</button></div> : null}</>}
    </section>
    {openSite ? <TokenPanel siteId={openSite} site={rows.find((s) => s.id === openSite)} onChanged={changed} /> : null}
    <CacheInvalidations result={inv} can={can} onChanged={changed} />
    <section>
      <h3 className="fs">Shortcodes usados por sitio <span className="sub" style={{ fontWeight: 500 }}>detectados por el plugin</span></h3>
      <Note kind="warn" icon="info">Pendiente de backend: no existe un endpoint para consultar el uso de shortcodes reportado por cada plugin; esta tabla conserva datos de muestra.</Note>
      <div className="tw" style={{ border: '1px solid var(--border)', borderRadius: 8 }}><table className="t"><thead><tr><th>Sitio</th><th>Shortcode</th><th>Página</th><th>Última vista</th></tr></thead><tbody>{SCUSE.filter((r) => brand === 'all' || WPS.find((w) => w.id === r[0])?.brand === brand).map((r, i) => <tr key={i}><td className="nw">{WPS.find((w) => w.id === r[0])?.host ?? r[0]}</td><td className="mono" style={{ minWidth: 220 }}>[{r[1]}]</td><td className="mono">{r[2]}</td><td className="num">{r[3]}</td></tr>)}</tbody></table></div>
    </section>
    {editing ? <SiteForm site={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onSaved={changed} /> : null}
  </div>;
}

function SiteForm({ site, onClose, onSaved }: { site?: WpSite; onClose: () => void; onSaved: () => void }) {
  const { toast } = useApp();
  const can = useCan();
  const brands = useLoad(() => hub.customers.brands(), []);
  const [brandId, setBrandId] = useState(site?.brand_id ?? '');
  const [name, setName] = useState(site?.name ?? '');
  const [baseUrl, setBaseUrl] = useState(site?.base_url ?? 'https://');
  const [networkId, setNetworkId] = useState(site?.network_site_id == null ? '' : String(site.network_site_id));
  const [webhookUrl, setWebhookUrl] = useState(site?.webhook_url ?? '');
  const [origins, setOrigins] = useState(site?.allowed_origins.join('\n') ?? '');
  const [thankYouUrl, setThankYouUrl] = useState(site?.thank_you_url ?? '');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setMessage('');
    const input: WpSiteInput = { brand_id: brandId, name: name.trim(), base_url: baseUrl.trim(), network_site_id: networkId ? Number(networkId) : null, webhook_url: webhookUrl.trim() || null, allowed_origins: origins.split('\n').map((x) => x.trim()).filter(Boolean), thank_you_url: thankYouUrl.trim() || null };
    try { if (site) await api.sites.update(site.id, site.version, input); else await api.sites.create(input); toast(site ? 'Sitio actualizado' : 'Sitio creado', name); onSaved(); onClose(); }
    catch (e) { setMessage(errorText(e)); if (isProblem(e) && e.code === 'version_conflict') { setMessage(`${errorText(e)} Se recargó el listado.`); onSaved(); } }
    finally { setBusy(false); }
  };
  return <Modal open wide bare onClose={onClose} title={site ? `Editar ${site.name}` : 'Nuevo sitio WordPress'}>
    <form className="modal-b" onSubmit={(e) => void submit(e)}><div className="form-grid">
      <label className="field">Marca*<select required className="select" value={brandId} onChange={(e) => setBrandId(e.target.value)}><option value="">Seleccione…</option>{(brands.data ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      <label className="field">Nombre*<input required className="input" maxLength={200} value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label className="field full">URL base HTTPS*<input required type="url" className="input" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://www.ejemplo.com" /></label>
      <label className="field">ID del sitio en Multisite<input type="number" min={1} className="input" value={networkId} onChange={(e) => setNetworkId(e.target.value)} /></label>
      <label className="field">URL del webhook del plugin<input type="url" className="input" value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="https://…" /></label>
      <label className="field full">Orígenes permitidos (uno por línea)<textarea className="input" rows={3} value={origins} onChange={(e) => setOrigins(e.target.value)} /></label>
      <label className="field full">URL de agradecimiento<input type="url" className="input" value={thankYouUrl} onChange={(e) => setThankYouUrl(e.target.value)} /></label>
    </div><div className="err" role="alert">{message}</div><div className="modal-f"><button type="button" className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={busy || !can(site ? 'web_connector.site.update' : 'web_connector.site.create')}>{busy ? 'Guardando…' : 'Guardar'}</button></div></form>
  </Modal>;
}

function TokenPanel({ siteId, site, onChanged }: { siteId: string; site?: WpSite; onChanged: () => void }) {
  const can = useCan(); const { toast, dialogs } = useApp();
  const [reload, setReload] = useState(0); const [name, setName] = useState(''); const [busy, setBusy] = useState(false);
  const res = useLoad(() => api.tokens.list(siteId, { size: PER, sort: '-created_at' }), [siteId, reload]);
  const rows = res.data?.data ?? [];
  async function create() {
    if (!name.trim()) return; setBusy(true);
    try { const token = await api.tokens.create(siteId, { name: name.trim() }); setName(''); setReload((x) => x + 1); onChanged(); dialogs.open(<><Note kind="warn" icon="tri">Copie el token ahora. No se volverá a mostrar después de cerrar este cuadro.</Note><ScBox code={token.token ?? ''} label="Token del plugin" /></>, { title: 'Token creado', sub: site?.base_url, footer: <button className="btn primary" onClick={() => dialogs.close()}>Listo</button> }); }
    catch (e) { toast('No se pudo crear el token', errorText(e), 'err'); } finally { setBusy(false); }
  }
  function revoke(token: WpSiteToken) { dialogs.form({ title: 'Revocar token', sub: token.name, fields: [{ id: 'reason', label: 'Motivo', type: 'textarea', req: true, full: true }], submit: 'Revocar', onSubmit: async ({ reason }) => { try { await api.tokens.remove(siteId, token.id, reason); toast('Token revocado', token.name, 'warn'); setReload((x) => x + 1); onChanged(); } catch (e) { toast('No se pudo revocar', errorText(e), 'err'); } } }); }
  const columns: Column<WpSiteToken>[] = [
    { key: 'name', header: 'Nombre', className: 'strong', render: (t) => t.name }, { key: 'scope', header: 'Alcance', render: (t) => t.scope },
    { key: 'created', header: 'Creado', className: 'nw', render: (t) => fDateTime(t.created_at) }, { key: 'used', header: 'Último uso', className: 'nw', render: (t) => fDateTime(t.last_used_at) },
    { key: 'state', header: 'Estado', render: (t) => t.revoked_at ? <Chip kind="neutral">Revocado</Chip> : <Chip kind="ok">Activo</Chip> },
    { key: 'actions', header: '', align: 'r', render: (t) => can('web_connector.site_token.delete') && !t.revoked_at ? <button className="btn sm danger" onClick={() => revoke(t)}>Revocar</button> : null },
  ];
  return <section className="card"><Toolbar count={`Tokens · ${rows.length}`}>
    {can('web_connector.site_token.create') ? <><input className="input" aria-label="Nombre del token" placeholder="Nombre del token" value={name} onChange={(e) => setName(e.target.value)} /><button className="btn primary" disabled={busy || !name.trim()} onClick={() => void create()}><Icon name="plus" size="sm" /> Crear token</button></> : null}
  </Toolbar>
  {res.error ? <div className="card-b"><Note kind="warn">No se pudieron cargar tokens: {errorText(res.error)} <button className="btn sm" onClick={res.reload}>Reintentar</button></Note></div> : !rows.length ? <EmptyState title="Sin tokens" text="Cree un token para autenticar el plugin de este sitio." /> : <DataTable columns={columns} rows={rows} rowKey={(t) => t.id} caption="Tokens del sitio" />}
  </section>;
}

function CacheInvalidations({ result, can, onChanged }: { result: ReturnType<typeof useLoad<CursorPage<WpCacheInvalidation>>>; can: (p: string) => boolean; onChanged: () => void }) {
  const { toast } = useApp();
  const rows = result.data?.data ?? [];
  const cols: Column<WpCacheInvalidation>[] = [
    { key: 'date', header: 'Solicitada', className: 'nw', render: (r) => fDateTime(r.created_at) },
    { key: 'site', header: 'Sitio', render: (r) => r.wp_site_id ?? 'Marca / no disponible' }, { key: 'scope', header: 'Alcance', render: (r) => r.scope },
    { key: 'state', header: 'Estado', render: (r) => <Chip kind={INVALIDATION_CHIP[r.status] ?? 'neutral'}>{r.status}</Chip> },
    { key: 'attempts', header: 'Intentos', align: 'r', render: (r) => r.attempts }, { key: 'error', header: 'Último error', render: (r) => r.last_error || '—' },
    { key: 'retry', header: '', align: 'r', render: (r) => can('web_connector.cache_invalidation.create') && r.status === 'failed' ? <button className="btn sm" onClick={() => void retry(r)}>Reintentar</button> : null },
  ];
  async function retry(r: WpCacheInvalidation) { try { await api.cacheInvalidations.retry(r.id); toast('Aviso reintentado', r.scope); onChanged(); } catch (e) { toast('No se pudo reintentar', errorText(e), 'err'); if (isProblem(e) && e.code === 'version_conflict') result.reload(); } }
  if (!can('web_connector.cache_invalidation.view')) return null;
  return <section className="card"><Toolbar count={`Invalidaciones · ${rows.length}`} />{result.error ? <div className="card-b"><Note kind="warn">No se pudieron cargar invalidaciones: {errorText(result.error)} <button className="btn sm" onClick={result.reload}>Reintentar</button></Note></div> : result.loading && !result.data ? <Skeleton variant="table" rows={3} /> : !rows.length ? <EmptyState title="Sin avisos de caché" text="Los avisos enviados al plugin aparecerán aquí." /> : <DataTable columns={cols} rows={rows} rowKey={(r) => r.id} caption="Avisos de invalidación de caché" />}</section>;
}
