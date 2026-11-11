import { useEffect, useState } from 'react';
import { isProblem, type SettingDetail, type SettingValue } from '@hub/api';
import { Icon } from '@hub/ui';
import { useApp } from '../../app/context';
import type { ViewProps } from '../../app/routes';
import { hub } from '../../auth/client';
import { Note, PageHead, Skeleton } from '../../components/ui';
import { errorText, useCan } from './clientes/shared';

const KEY = 'portal.login_branding';
const ICONS = ['shield', 'card', 'restore', 'globe', 'server', 'lock', 'clock', 'cloud', 'key', 'wallet', 'receipt', 'refresh', 'chart', 'check', 'mail', 'database', 'building', 'users', 'user', 'home', 'bell', 'archive', 'file', 'funnel', 'search', 'sliders', 'browser', 'contract', 'activity'] as const;
type Branding = {
  brand_name: string; logo_url: string | null; hero_title: string; hero_subtitle: string;
  bullets: { icon: typeof ICONS[number]; title: string; text: string }[];
  footer_line1: string; footer_line2: string;
  colors: { bg_from: string | null; bg_mid: string | null; bg_to: string | null; accent: string | null };
};
const DEFAULT: Branding = {
  brand_name: 'NubeConecta', logo_url: null,
  hero_title: 'Tu infraestructura en la nube, dominios y finanzas bajo control',
  hero_subtitle: 'Portal seguro para clientes corporativos de NubeConecta. Supervisa tus servidores, renueva dominios, paga facturas con comprobantes SUNAT y contacta a la guardia técnica 24/7.',
  bullets: [
    { icon: 'shield', title: 'Doble factor (TOTP)', text: 'Recomendado: compatible con Google y Microsoft Authenticator.' },
    { icon: 'card', title: 'Pasarela de Pagos Cifrada', text: 'Cancela en soles (PEN) o dólares (USD) con tarjeta, PayPal o transferencia BCP/BBVA.' },
    { icon: 'restore', title: 'Respaldos Diarios Automatizados', text: 'Historial de 14 a 30 días con restauración asistida sin recargo adicional.' },
  ],
  footer_line1: 'NubeConecta · GRUPO DE SOLUCIONES CREATIVAS · RUC 20607431117', footer_line2: 'Soporte NOC: guardia@alojamientoplus.pe',
  colors: { bg_from: null, bg_mid: null, bg_to: null, accent: null },
};
const isBranding = (value: unknown): value is Branding => !!value && typeof value === 'object' && !Array.isArray(value);
const HEX = /^#[\da-f]{6}$/i;
const COLOR_DEFAULTS: Record<keyof Branding['colors'], string> = { bg_from: '#17326b', bg_mid: '#0c1833', bg_to: '#060b18', accent: '#c9d8ff' };

function LoginPreview({ value }: { value: Branding }) {
  const [first, ...rest] = value.brand_name.trim().split(/\s+/);
  const colors = value.colors;
  return <div style={{ background: `radial-gradient(ellipse at 20% 0%, ${colors.bg_from || '#17326b'} 0%, ${colors.bg_mid || '#0c1833'} 60%, ${colors.bg_to || '#060b18'} 100%)`, color: '#fff', padding: 28, borderRadius: 12, minHeight: 420, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 24 }}>
    <div><div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 19, fontWeight: 800, marginBottom: 34 }}>{value.logo_url ? <img src={value.logo_url} alt={value.brand_name} style={{ height: 34, maxWidth: 150, objectFit: 'contain' }} /> : <span aria-hidden="true" style={{ fontSize: 32 }}>☁</span>}<span>{first}{rest.length ? <span style={{ color: colors.accent || '#c9d8ff' }}>{` ${rest.join(' ')}`}</span> : ''}</span></div>
      <h2 style={{ fontSize: 25, lineHeight: 1.2, margin: '0 0 12px' }}>{value.hero_title}</h2><p style={{ color: '#9fb3d9', fontSize: 14, lineHeight: 1.55, margin: '0 0 20px' }}>{value.hero_subtitle}</p>
      <div style={{ display: 'grid', gap: 12 }}>{value.bullets.map((b, i) => <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}><span style={{ width: 34, height: 34, borderRadius: 9, display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,.1)', flex: 'none' }}><Icon name={b.icon} /></span><div><b style={{ display: 'block', fontSize: 13 }}>{b.title}</b><small style={{ color: '#aabbd6' }}>{b.text}</small></div></div>)}</div>
    </div><div style={{ borderTop: '1px solid rgba(255,255,255,.15)', paddingTop: 12, color: '#9fb3d9', fontSize: 11, display: 'grid', gap: 4 }}><span>{value.footer_line1}</span><span>{value.footer_line2}</span></div>
  </div>;
}

export default function AccesoPortalView(_props: ViewProps) {
  const can = useCan();
  const { toast } = useApp();
  const canView = can('settings.setting.view');
  const canEdit = can('settings.setting.update');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<SettingDetail | null>(null);
  const [value, setValue] = useState<Branding>(DEFAULT);
  const [error, setError] = useState('');

  async function load() {
    if (!canView && !canEdit) { setLoading(false); return; }
    setLoading(true); setError('');
    try {
      const result = await hub.settings.settings.get(KEY);
      const override = result.values?.find((row) => row.scope_type === 'global');
      setDetail(result);
      const source = override?.value ?? result.default;
      setValue(isBranding(source) ? { ...DEFAULT, ...source, bullets: Array.isArray(source.bullets) ? source.bullets as Branding['bullets'] : DEFAULT.bullets, colors: { ...DEFAULT.colors, ...(source.colors as Branding['colors'] | undefined) } } : DEFAULT);
    } catch (e) { setError(errorText(e)); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [canView, canEdit]);
  const setColor = (key: keyof Branding['colors'], raw: string) => setValue((old) => ({ ...old, colors: { ...old.colors, [key]: raw ? raw : null } }));
  const updateBullet = (index: number, patch: Partial<Branding['bullets'][number]>) => setValue((old) => ({ ...old, bullets: old.bullets.map((item, i) => i === index ? { ...item, ...patch } : item) }));
  const save = async () => {
    const clean: Branding = { ...value, brand_name: value.brand_name.trim(), logo_url: value.logo_url?.trim() || null, hero_title: value.hero_title.trim(), hero_subtitle: value.hero_subtitle.trim(), footer_line1: value.footer_line1.trim(), footer_line2: value.footer_line2.trim(), bullets: value.bullets.map((b) => ({ ...b, title: b.title.trim(), text: b.text.trim() })) };
    if (!clean.brand_name || clean.brand_name.length > 80 || !clean.hero_title || clean.hero_title.length > 180 || clean.hero_subtitle.length > 600 || clean.footer_line1.length > 180 || clean.footer_line2.length > 180 || clean.bullets.length < 1 || clean.bullets.length > 4 || clean.bullets.some((b) => !b.title || !b.text || b.title.length > 80 || b.text.length > 220)) { toast('Revise los campos', 'Complete los textos y respete los límites indicados. Debe haber entre uno y cuatro beneficios.', 'err'); return; }
    if (clean.logo_url) { try { const parsed = new URL(clean.logo_url); if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(); } catch { toast('URL de logo inválida', 'Use una URL http o https.', 'err'); return; } }
    if (Object.values(clean.colors).some((color) => color !== null && !HEX.test(color))) { toast('Color inválido', 'Use el formato hexadecimal #rrggbb.', 'err'); return; }
    setBusy(true);
    try {
      const version = detail?.values?.find((row) => row.scope_type === 'global')?.version;
      await hub.settings.settings.put(KEY, { scope_type: 'global', value: clean as unknown as SettingValue, ...(version == null ? {} : { version }) });
      setValue(clean); toast('Acceso del portal guardado', 'El branding global se actualizó.'); await load();
    } catch (e) {
      if (isProblem(e) && e.status === 409) { toast('Conflicto de versión', 'Se recargó la configuración; revise los cambios y vuelva a guardar.', 'err'); await load(); }
      else toast('No se pudo guardar', errorText(e), 'err');
    } finally { setBusy(false); }
  };
  const change = (key: keyof Branding, next: string) => setValue((old) => ({ ...old, [key]: next }));

  return <>
    <PageHead crumbs={[[ 'Configuración', 'ajustes' ], [ 'Acceso del portal', 'acceso-portal' ]]} title="Acceso del portal" sub="Branding global del login de clientes, activación y restablecimiento." actions={<button className="btn primary" type="button" onClick={() => void save()} disabled={!canEdit || busy || loading}><Icon name="check" />Guardar</button>} />
    {!canEdit ? <Note kind="warn" icon="lock">La edición requiere el permiso settings.setting.update.</Note> : null}
    {loading ? <Skeleton rows={6} /> : error ? <Note kind="warn" role="alert">No se pudo cargar la configuración: {error} <button className="btn sm" type="button" onClick={() => void load()}>Reintentar</button></Note> : <div className="grid g-2">
      <section className="card"><div className="card-b"><div className="form-grid">
        <label className="field">Nombre de marca<input className="input" maxLength={80} value={value.brand_name} disabled={!canEdit || busy} onChange={(e) => change('brand_name', e.target.value)} /></label>
        <label className="field">URL del logo (opcional)<input className="input" type="url" maxLength={2048} placeholder="https://…" value={value.logo_url ?? ''} disabled={!canEdit || busy} onChange={(e) => setValue((old) => ({ ...old, logo_url: e.target.value || null }))} /></label>
        <label className="field full">Título principal<input className="input" maxLength={180} value={value.hero_title} disabled={!canEdit || busy} onChange={(e) => change('hero_title', e.target.value)} /></label>
        <label className="field full">Subtítulo<textarea className="input" rows={3} maxLength={600} value={value.hero_subtitle} disabled={!canEdit || busy} onChange={(e) => change('hero_subtitle', e.target.value)} /></label>
        <div className="field full"><b>Beneficios</b>{value.bullets.map((bullet, index) => <div key={index} style={{ display: 'grid', gridTemplateColumns: '150px 1fr 1fr auto', gap: 8, alignItems: 'end', marginTop: 10 }}><label className="field">Ícono<select className="select" value={bullet.icon} disabled={!canEdit || busy} onChange={(e) => updateBullet(index, { icon: e.target.value as typeof ICONS[number] })}>{ICONS.map((icon) => <option key={icon} value={icon}>{icon}</option>)}</select></label><label className="field">Título<input className="input" maxLength={80} value={bullet.title} disabled={!canEdit || busy} onChange={(e) => updateBullet(index, { title: e.target.value })} /></label><label className="field">Texto<input className="input" maxLength={220} value={bullet.text} disabled={!canEdit || busy} onChange={(e) => updateBullet(index, { text: e.target.value })} /></label><button className="btn sm" type="button" disabled={!canEdit || busy || value.bullets.length <= 1} onClick={() => setValue((old) => ({ ...old, bullets: old.bullets.filter((_, i) => i !== index) }))}>Quitar</button></div>)}{value.bullets.length < 4 ? <button className="btn sm" type="button" disabled={!canEdit || busy} style={{ marginTop: 10 }} onClick={() => setValue((old) => ({ ...old, bullets: [...old.bullets, { icon: 'check', title: '', text: '' }] }))}>Agregar beneficio</button> : null}</div>
        <label className="field">Pie de página · línea 1<input className="input" maxLength={180} value={value.footer_line1} disabled={!canEdit || busy} onChange={(e) => change('footer_line1', e.target.value)} /></label>
        <label className="field">Pie de página · línea 2<input className="input" maxLength={180} value={value.footer_line2} disabled={!canEdit || busy} onChange={(e) => change('footer_line2', e.target.value)} /></label>
        {([['bg_from', 'Fondo inicial'], ['bg_mid', 'Fondo medio'], ['bg_to', 'Fondo final'], ['accent', 'Acento']] as const).map(([key, label]) => <label className="field" key={key}>{label}<div style={{ display: 'flex', gap: 8 }}><input type="color" aria-label={label} value={value.colors[key] ?? COLOR_DEFAULTS[key]} disabled={!canEdit || busy} onChange={(e) => setColor(key, e.target.value)} /><input className="input" placeholder="Predeterminado" value={value.colors[key] ?? ''} maxLength={7} disabled={!canEdit || busy} onChange={(e) => setColor(key, e.target.value || '')} /></div></label>)}
      </div></div></section>
      <section><h2 className="sec" style={{ margin: '0 0 12px' }}>Vista previa</h2><LoginPreview value={value} /></section>
    </div>}
  </>;
}
