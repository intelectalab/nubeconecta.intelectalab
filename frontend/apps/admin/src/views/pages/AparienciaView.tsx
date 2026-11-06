/** Apariencia de marcas: editor de versiones reales de BrandTheme. */
import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../app/context';
import type { ViewProps } from '../../app/routes';
import { Icon } from '../../components/Icon';
import { Chip, Note, PageHead, Skeleton } from '../../components/ui';
import { hub } from '../../auth/client';
import type { BrandThemeVersion, BrandThemeSurface, ContrastPair } from '@hub/api';
import { isProblem } from '@hub/api';
import { errorText, fDateTime, useCan, useLoad } from './clientes/shared';
import { MwBar, ScBox } from './web-config/shared';

type Tokens = Record<string, unknown>;
const SURFACES: { id: BrandThemeSurface; label: string }[] = [
  { id: 'portal', label: 'Portal del cliente' }, { id: 'admin', label: 'Panel interno' }, { id: 'email', label: 'Correos' },
];
function pathSet(obj: Tokens, path: string[], value: string): Tokens {
  const out = structuredClone(obj);
  let target: Tokens = out;
  path.slice(0, -1).forEach((part) => { if (!target[part] || typeof target[part] !== 'object') target[part] = {}; target = target[part] as Tokens; });
  target[path[path.length - 1]] = value;
  return out;
}
function leaves(node: unknown, path: string[] = []): { path: string[]; value: string }[] {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return [];
  return Object.entries(node as Tokens).flatMap(([key, value]) => typeof value === 'string' ? [{ path: [...path, key], value }] : leaves(value, [...path, key]));
}
const hexValue = (s: string) => /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(s);
const title = (s: string) => s.split('_').map((x) => x[0]?.toUpperCase() + x.slice(1)).join(' ');

function Preview({ brand, tokens, surface }: { brand: string; tokens: Tokens; surface: BrandThemeSurface }) {
  const colors = (tokens.colors as Record<string, Record<string, string>> | undefined)?.light ?? {};
  const primary = colors.primary ?? '#0a3fc4';
  const secondary = colors.secondary ?? '#324c75';
  const accent = colors.accent ?? '#ef9c24';
  const background = colors.background ?? '#ffffff';
  const foreground = colors.text ?? '#202b3c';
  const fonts = leaves(tokens).filter((x) => /(^|_)font(_family)?$/i.test(x.path[x.path.length - 1] ?? ''));
  const font = fonts[0]?.value;
  const style = { '--mw-primary': primary, '--mw-secondary': secondary, '--mw-accent': accent, '--mw-bg': background, '--mw-text': foreground, background, color: foreground, fontFamily: font } as React.CSSProperties;
  return <div className={`mw ${surface === 'email' ? 'mw-mail' : 'mw-portal'}`} style={style}>
    <MwBar>{surface === 'email' ? `Asunto: Tu factura vence pronto · ${brand}` : `${brand} · Vista previa ${surface === 'admin' ? 'del panel' : 'del portal'}`}</MwBar>
    {surface === 'portal' ? <aside><b style={{ color: primary }}>{brand}</b><span className="on">Inicio</span><span>Servicios</span><span>Facturas</span><span>Soporte</span></aside> : null}
    <div className="mp-main"><h3 className="mw-h">Hola, Mariela</h3><p style={{ margin: 0 }}>Tu factura por <b>S/ 212.40</b> vence pronto.</p><span className="mw-btn" style={{ background: primary, borderColor: primary, color: '#fff', justifySelf: 'start' }}>Pagar ahora</span><p className="mw-mut" style={{ margin: 0 }}>Consulta tus servicios y comprobantes.</p><div className="mp-cards"><div><small className="mw-mut">Saldo pendiente</small><b>S/ 1,647.28</b></div><div><small className="mw-mut">Servicios activos</small><b>7</b></div></div><span style={{ color: secondary, borderColor: accent }}>Colores de tema activos</span></div>
  </div>;
}

export default function AparienciaView({ param }: ViewProps) {
  const can = useCan();
  const { brand: appBrand, toast, refresh, dialogs } = useApp();
  const canView = can('brands.theme.view');
  const brandsResult = useLoad(() => canView && can('brands.brand.view') ? hub.brands.list({ size: 100, sort: 'code' }).then((r) => r.data) : Promise.resolve([]), [canView, can('brands.brand.view')]);
  const brands = brandsResult.data ?? [];
  const [brandId, setBrandId] = useState('');
  const selectedBrand = brands.find((b) => b.id === brandId);
  useEffect(() => {
    if (!brands.length) return;
    const requested = param || appBrand;
    const found = brands.find((b) => b.id === requested || b.code === requested) ?? brands[0];
    setBrandId(found.id);
  }, [param, appBrand, brands]);

  const themeResult = useLoad(async () => {
    if (!canView || !brandId) return null;
    const page = await hub.brands.themes.list({ size: 100, filter: { brand_id: brandId }, sort: '-created_at' });
    const theme = page.data[0];
    return theme ? hub.brands.themes.get(theme.id) : null;
  }, [brandId, canView]);
  const theme = themeResult.data;
  const versions = theme?.versions ?? [];
  const initialVersion = versions.find((v) => v.status === 'draft') ?? versions.find((v) => v.id === theme?.published_version_id) ?? versions[0] ?? null;
  const [versionId, setVersionId] = useState('');
  useEffect(() => { setVersionId(initialVersion?.id ?? ''); }, [initialVersion?.id, theme?.id]);
  const versionResult = useLoad(() => versionId ? hub.brands.versions.get(versionId) : Promise.resolve(null), [versionId]);
  const version = versionResult.data;
  const [tokens, setTokens] = useState<Tokens>({});
  const [surfaces, setSurfaces] = useState<BrandThemeSurface[]>([]);
  const [changeNote, setChangeNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<ContrastPair[] | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  useEffect(() => { if (version) { setTokens(version.tokens ?? {}); setSurfaces(version.surfaces ?? []); setChangeNote(version.change_note ?? ''); setReport(version.contrast_report ?? null); setPreviewUrl(''); } }, [version?.id, version?.updated_at]);
  const fields = useMemo(() => leaves(tokens), [tokens]);
  const colorFields = fields.filter(({ path, value }) => path[0] === 'colors' && hexValue(value));
  const fontFields = fields.filter(({ path, value }) => /(^|_)font(_family)?$/i.test(path[path.length - 1] ?? '') && !hexValue(value));
  const reload = () => { themeResult.reload(); versionResult.reload(); refresh(); };
  const handleError = (e: unknown, action: string) => { toast(action, errorText(e), 'err'); if (isProblem(e) && e.code === 'version_conflict') reload(); };

  async function createTheme() {
    if (!selectedBrand) return;
    setBusy(true);
    try { await hub.brands.themes.create({ brand_id: selectedBrand.id, name: `${selectedBrand.name} · Tema` }); toast('Tema creado', selectedBrand.name); themeResult.reload(); }
    catch (e) { handleError(e, 'No se pudo crear el tema'); }
    finally { setBusy(false); }
  }
  async function newVersion() {
    if (!theme) return;
    setBusy(true);
    try { const created = await hub.brands.themes.createVersion(theme.id, { change_note: 'Nuevo borrador' }); setVersionId(created.id); themeResult.reload(); toast('Nueva versión creada', `v${created.version_number}`); }
    catch (e) { handleError(e, 'No se pudo crear la versión'); }
    finally { setBusy(false); }
  }
  async function save() {
    if (!version) return;
    setBusy(true);
    try { const updated = await hub.brands.versions.update(version.id, { version: version.version, tokens, surfaces, change_note: changeNote || null }); versionResult.setData(updated); themeResult.reload(); toast('Borrador guardado', `${selectedBrand?.name} · v${updated.version_number}`); }
    catch (e) { handleError(e, 'No se pudo guardar el borrador'); }
    finally { setBusy(false); }
  }
  async function checkContrast() {
    if (!version) return;
    setBusy(true);
    try { const saved = await hub.brands.versions.update(version.id, { version: version.version, tokens, surfaces, change_note: changeNote || null }); const checked = await hub.brands.versions.checkContrast(saved.id); versionResult.setData(checked); setReport(checked.contrast_report); themeResult.reload(); toast('Contraste verificado', `${checked.contrast_lowest_ratio ?? '—'}:1 mínimo`); }
    catch (e) { handleError(e, 'No se pudo verificar el contraste'); }
    finally { setBusy(false); }
  }
  async function makePreviewLink() {
    if (!version) return;
    setBusy(true);
    try { const saved = await hub.brands.versions.update(version.id, { version: version.version, tokens, surfaces, change_note: changeNote || null }); const link = await hub.brands.versions.previewLink(saved.id); setPreviewUrl(link.url); versionResult.setData({ ...saved, preview_expires_at: link.expires_at }); }
    catch (e) { handleError(e, 'No se pudo generar el enlace'); }
    finally { setBusy(false); }
  }
  function publish() {
    if (!version) return;
    dialogs.confirm({ title: 'Publicar tema', body: <p>Se publicará la versión v{version.version_number} de {selectedBrand?.name}. Se requiere una verificación de contraste vigente.</p>, okLabel: 'Publicar', onOk: async () => {
      setBusy(true); try { await hub.brands.versions.publish(version.id); toast('Tema publicado', `v${version.version_number}`); setVersionId(''); reload(); } catch (e) { handleError(e, 'No se pudo publicar'); } finally { setBusy(false); }
    } });
  }
  function revert(v: BrandThemeVersion) {
    dialogs.confirm({ title: 'Revertir versión', body: <p>Se creará y publicará una copia de la versión v{v.version_number}.</p>, okLabel: 'Revertir', onOk: async () => {
      setBusy(true); try { const restored = await hub.brands.versions.revert(v.id, `Reversión a v${v.version_number}`); setVersionId(restored.id); toast('Versión revertida y publicada', `v${restored.version_number}`); reload(); } catch (e) { handleError(e, 'No se pudo revertir'); } finally { setBusy(false); }
    } });
  }
  const badPairs = report?.filter((p) => !p.passes) ?? [];

  return <>
    <PageHead crumbs={[["Configuración", 'ajustes'], ['Apariencia', 'apariencia']]} title="Apariencia" sub="Temas visuales por marca, gestionados como versiones publicables." actions={<>
      {can('brands.theme.create') && theme && <button className="btn" disabled={busy} onClick={() => void newVersion()}><Icon name="plus" size="sm" /> Nueva versión</button>}
      {can('brands.theme.update') && version?.status === 'draft' && <><button className="btn" disabled={busy} onClick={() => void save()}>Guardar borrador</button><button className="btn" disabled={busy} onClick={() => void checkContrast()}>Verificar contraste</button><button className="btn" disabled={busy} onClick={() => void makePreviewLink()}>Generar enlace de previsualización</button></>}
      {can('brands.theme.approve') && version?.status === 'draft' && <button className="btn primary" disabled={busy} onClick={publish}><Icon name="upload" size="sm" /> Publicar</button>}
    </>} />
    {!canView ? <Note kind="warn">No tiene permiso para consultar temas de marca.</Note> : <>
      {brandsResult.error ? <Note kind="warn">No se pudieron cargar marcas: {errorText(brandsResult.error)} <button className="btn sm" onClick={brandsResult.reload}>Reintentar</button></Note> : null}
      <div className="card" style={{ marginBottom: 16 }}><div className="toolbar"><label className="field" style={{ minWidth: 240 }}>Marca<select className="select" value={brandId} onChange={(e) => { setBrandId(e.target.value); setVersionId(''); }}><option value="">Seleccione una marca</option>{brands.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}</select></label>
        <div className="field">Superficies<div className="seg" role="group" aria-label="Superficies del tema">{SURFACES.map((s) => <button key={s.id} type="button" disabled={version?.status !== 'draft' || !can('brands.theme.update')} aria-pressed={surfaces.includes(s.id)} onClick={() => setSurfaces((old) => old.includes(s.id) ? old.filter((x) => x !== s.id) : [...old, s.id])}>{s.label}</button>)}</div></div>
        {version ? <Chip kind={version.status === 'published' ? 'ok' : version.status === 'draft' ? 'warn' : 'neutral'}>{version.status} · v{version.version_number}</Chip> : null}
      </div></div>
      {!can('brands.brand.view') ? <Note kind="warn">Falta el permiso brands.brand.view para cargar el selector.</Note> : null}
      {themeResult.loading ? <Skeleton variant="detail" rows={4} /> : themeResult.error ? <Note kind="warn">No se pudo cargar el tema: {errorText(themeResult.error)} <button className="btn sm" onClick={themeResult.reload}>Reintentar</button></Note>
        : !selectedBrand ? <Note>Seleccione una marca.</Note> : !theme ? <section className="card card-b"><Note>Esta marca aún no tiene tema.</Note>{can('brands.theme.create') ? <button className="btn primary" disabled={busy} onClick={() => void createTheme()}>Crear tema</button> : null}</section>
          : <>
            {versions.length ? <div className="card card-b" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}><b>Versiones:</b>{versions.map((v) => <button key={v.id} className={`btn sm ${v.id === versionId ? 'primary' : ''}`} onClick={() => setVersionId(v.id)}>v{v.version_number} · {v.status}</button>)}</div> : null}
            {!versions.length && !version ? <section className="card card-b"><Note>El tema todavía no tiene versiones.</Note>{can('brands.theme.create') ? <button className="btn primary" disabled={busy} onClick={() => void newVersion()}>Crear primera versión</button> : null}</section> : null}
            {version ? <div className="grid g-2"><section className="card" aria-label="Editor de apariencia"><div className="card-b" style={{ paddingTop: 16 }}>
              <div className="form-grid">
                {colorFields.map(({ path, value }) => <label className="field" key={path.join('.')}><span>{path.map(title).join(' · ')}</span><div className="colorf"><input type="color" value={value.length === 4 ? `#${value.slice(1).split('').map((x) => x+x).join('')}` : value} disabled={version.status !== 'draft' || !can('brands.theme.update')} onChange={(e) => setTokens(pathSet(tokens, path, e.target.value))} aria-label={path.join(' ')} /><input className="input mono" value={value} disabled={version.status !== 'draft' || !can('brands.theme.update')} onChange={(e) => setTokens(pathSet(tokens, path, e.target.value))} /></div></label>)}
                {fontFields.map(({ path, value }) => <label className="field" key={path.join('.')}><span>{path.map(title).join(' · ')}</span><input className="input" value={value} disabled={version.status !== 'draft' || !can('brands.theme.update')} onChange={(e) => setTokens(pathSet(tokens, path, e.target.value))} /></label>)}
                {!colorFields.length && !fontFields.length ? <div className="field full"><Note>Esta versión no contiene tokens de color ni tipografía editables.</Note></div> : null}
                <label className="field full">Nota del cambio<textarea className="input" rows={2} maxLength={2000} value={changeNote} disabled={version.status !== 'draft' || !can('brands.theme.update')} onChange={(e) => setChangeNote(e.target.value)} /></label>
                <div className="field full"><b>Logo</b><p className="sub">El backend solo expone logo_file_id y no incluye una ruta de carga de archivos en BrandThemeController.</p>{version.logo_file_id ? <code>{version.logo_file_id}</code> : 'Sin logo asociado'}<div style={{ marginTop: 8 }}><b>Favicon</b><p className="sub">Identificador de archivo (solo lectura).</p>{version.favicon_file_id ? <code>{version.favicon_file_id}</code> : 'Sin favicon asociado'}</div></div>
              </div></div>
              <div className="card-h"><h2 className="sec">Contraste WCAG</h2>{version.contrast_lowest_ratio != null ? <span className="sub">Mínimo {version.contrast_min_ratio}:1 · menor {version.contrast_lowest_ratio}:1 · {fDateTime(version.contrast_checked_at)}</span> : <span className="sub">Aún no verificado</span>}</div>
              <div className="card-b">{report ? badPairs.length ? <Note kind="warn">{badPairs.length} pares no alcanzan el umbral configurado.</Note> : <Note>Todos los pares evaluados cumplen el umbral configurado.</Note> : null}<ul className="checks">{(report ?? []).map((p, i) => <li key={`${p.mode}-${p.foreground}-${i}`} className={p.passes ? 'ok' : 'no'}><Icon name={p.passes ? 'check' : 'tri'} size="sm" /><span>{p.mode}: {p.foreground} sobre {p.background}<small>{p.ratio}:1 · {p.foreground_color} / {p.background_color}</small></span></li>)}</ul>
                {previewUrl ? <div style={{ marginTop: 12 }}><Note>Enlace temporal válido hasta {fDateTime(version.preview_expires_at)}.</Note><ScBox code={previewUrl} label="Enlace de previsualización" /></div> : null}
              </div><div className="card-h"><h2 className="sec">Versiones anteriores</h2></div><ul className="rows">{versions.map((v) => <li key={v.id}><span className="swatch" style={{ background: ((v.tokens.colors as Record<string, Record<string, string>> | undefined)?.light?.primary) ?? '#999' }} /><div className="grow"><b>v{v.version_number} · {v.status}</b><small>{fDateTime(v.created_at)} · {v.change_note || 'Sin nota'}</small></div>{can('brands.theme.approve') && v.status === 'archived' ? <button className="btn sm" disabled={busy} onClick={() => revert(v)}>Revertir</button> : null}</li>)}</ul>
            </section><section className="stack" aria-label="Vista previa"><div><h3 className="fs">Vista previa · {surfaces.map((x) => SURFACES.find((s) => s.id === x)?.label).join(', ') || 'sin superficies'}</h3><Preview brand={selectedBrand.name} tokens={tokens} surface={surfaces[0] ?? 'portal'} /></div></section></div> : null}
          </>}
    </>}
  </>;
}
