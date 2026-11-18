/**
 * Web › Widget embebible (F3): arma el snippet de hub-embed.js para una web a medida.
 * Usa el sitio de kind «embed» y su token de scope «embed» (valor plano solo al crearlo).
 */
import { useState } from 'react';
import type { WpSite, WpSiteToken } from '@hub/api';
import { useApp } from '../../../app/context';
import { Icon } from '../../../components/Icon';
import { EmptyState, Note } from '../../../components/ui';
import { hub } from '../../../auth/client';
import { errorText, LIVE, useCan, useLoad } from '../clientes/shared';
import { copyText } from './shared';

type OptType = 'text' | 'num' | { sel: [string, string][] };
interface BlockOpt { attr: string; label: string; type: OptType; ph?: string }
interface BlockDef { label: string; opts: BlockOpt[] }

const CYCLES: [string, string][] = [['', 'Por defecto'], ['monthly', 'Mensual'], ['quarterly', 'Trimestral'], ['semiannual', 'Semestral'], ['annual', 'Anual'], ['biennial', 'Bienal'], ['triennial', 'Trienal']];

const BLOCKS: Record<string, BlockDef> = {
  planes: { label: 'Planes', opts: [
    { attr: 'tipo', label: 'Tipo', type: 'text', ph: 'hosting' }, { attr: 'ciclo', label: 'Ciclo', type: { sel: CYCLES } },
    { attr: 'destacados', label: 'Destacados', type: 'text', ph: 'ids o códigos' }, { attr: 'columnas', label: 'Columnas (1-4)', type: 'num' },
  ] },
  plan: { label: 'Plan individual', opts: [{ attr: 'id', label: 'ID del plan', type: 'text' }] },
  comparador: { label: 'Comparador de planes', opts: [{ attr: 'tipo', label: 'Tipo', type: 'text', ph: 'hosting' }, { attr: 'ciclo', label: 'Ciclo', type: { sel: CYCLES } }] },
  dominios: { label: 'Precios de dominios', opts: [{ attr: 'tlds', label: 'Extensiones', type: 'text', ph: '.pe,.com' }] },
  'buscar-dominio': { label: 'Buscador de dominio', opts: [{ attr: 'tlds', label: 'Extensiones', type: 'text', ph: '.pe,.com' }] },
  formulario: { label: 'Formulario', opts: [{ attr: 'codigo', label: 'Código del formulario', type: 'text', ph: 'contacto' }] },
  'documento-legal': { label: 'Documento legal', opts: [{ attr: 'slug', label: 'Slug o tipo del documento', type: 'text', ph: 'terminos' }] },
  'boton-contratar': { label: 'Botón contratar', opts: [{ attr: 'plan', label: 'ID del plan', type: 'text' }, { attr: 'texto', label: 'Texto del botón', type: 'text', ph: 'Contratar' }] },
  servidores: { label: 'Servidores', opts: [
    { attr: 'tipo', label: 'Tipo', type: 'text' }, { attr: 'ids', label: 'IDs (opcional)', type: 'text', ph: 'id1,id2' },
    { attr: 'ciclo', label: 'Ciclo', type: { sel: CYCLES } }, { attr: 'columnas', label: 'Columnas (1-4)', type: 'num' },
  ] },
  paquete: { label: 'Paquete', opts: [{ attr: 'id', label: 'ID del paquete', type: 'text' }, { attr: 'texto', label: 'Texto del botón', type: 'text', ph: 'Contratar' }] },
  contacto: { label: 'Datos de contacto', opts: [] },
  moneda: { label: 'Selector de moneda', opts: [] },
  estado: { label: 'Estado de servicios', opts: [] },
};

const attrEsc = (v: string): string => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const emptyPage = <T,>(): { data: T[] } => ({ data: [] });

export default function WpWidget() {
  const can = useCan();
  const { toast } = useApp();
  const canView = can('web_connector.site.view');
  const [siteId, setSiteId] = useState('');
  const [reload, setReload] = useState(0);
  const [lang, setLang] = useState<'es' | 'en'>('es');
  const [cur, setCur] = useState<'PEN' | 'USD'>('PEN');
  const [block, setBlock] = useState('planes');
  const [vals, setVals] = useState<Record<string, string>>({});
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [plain, setPlain] = useState<{ siteId: string; key: string } | null>(null);
  const [manual, setManual] = useState('');

  const sites = useLoad(() => (canView && LIVE ? hub.webConnector.sites.list({ size: 100, sort: 'name' }) : Promise.resolve(emptyPage<WpSite>())), [canView]);
  const embedSites = (sites.data?.data ?? []).filter((s) => s.kind === 'embed');
  const site = embedSites.find((s) => s.id === siteId) ?? embedSites[0];
  const sid = site?.id ?? '';
  const tokens = useLoad(() => (sid && LIVE ? hub.webConnector.tokens.list(sid, { size: 50, sort: '-created_at' }) : Promise.resolve(emptyPage<WpSiteToken>())), [sid, reload]);
  const embedTokens = (tokens.data?.data ?? []).filter((t) => t.scope === 'embed' && !t.revoked_at);

  async function create() {
    if (!sid || !name.trim()) return;
    setBusy(true);
    try {
      const t = await hub.webConnector.tokens.create(sid, { name: name.trim(), scope: 'embed' });
      setName('');
      setReload((x) => x + 1);
      if (t.token) setPlain({ siteId: sid, key: t.token });
      toast('Clave creada', t.name, 'ok');
    } catch (e) {
      toast('No se pudo crear la clave', errorText(e), 'err');
    } finally {
      setBusy(false);
    }
  }

  const def = BLOCKS[block];
  const key = (plain && plain.siteId === sid ? plain.key : '') || manual.trim();
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const divAttrs = def.opts
    .map((o) => {
      const v = (vals[block + '.' + o.attr] ?? '').trim();
      return v ? ` data-${o.attr}="${attrEsc(v)}"` : '';
    })
    .join('');
  const snippet =
    `<script src="${attrEsc(origin)}/embed/v1/hub-embed.js" data-hub-key="${attrEsc(key || 'TU_TOKEN')}" data-idioma="${lang}" data-moneda="${cur}" defer></script>\n` +
    `<div data-hub-block="${block}"${divAttrs}></div>`;

  if (!canView) return <div className="card-b"><Note kind="warn" icon="info">No tienes permiso para ver los sitios conectados.</Note></div>;
  if (!LIVE) return <div className="card-b"><Note kind="warn" icon="info">El generador del widget requiere el backend real (sitios y claves). Aún no está disponible en este entorno.</Note></div>;
  if (sites.loading && !sites.data) return <div className="card-b"><p className="sub">Cargando sitios…</p></div>;
  if (sites.error) return <div className="card-b"><Note kind="warn">No se pudieron cargar los sitios: {errorText(sites.error)} <button className="btn sm" onClick={sites.reload}>Reintentar</button></Note></div>;
  if (!embedSites.length) {
    return <div className="card-b"><EmptyState title="Sin sitios «Web a medida»" text="Crea un sitio de tipo «Web a medida» (embed) en la pestaña «Sitios conectados» para generar su fragmento del widget." /></div>;
  }

  return (
    <div className="card-b" style={{ paddingTop: 16 }}>
      <div className="grid g-2">
        <div className="stack">
          <div className="form-grid">
            <label className="field full" htmlFor="wwSite">
              Sitio (web a medida)
              <select id="wwSite" className="select" value={sid} onChange={(e) => { setSiteId(e.target.value); setPlain(null); }}>
                {embedSites.map((s) => <option key={s.id} value={s.id}>{s.name} — {s.base_url}</option>)}
              </select>
            </label>
            <label className="field" htmlFor="wwLang">
              Idioma
              <select id="wwLang" className="select" value={lang} onChange={(e) => setLang(e.target.value === 'en' ? 'en' : 'es')}>
                <option value="es">Español</option>
                <option value="en">English</option>
              </select>
            </label>
            <label className="field" htmlFor="wwCur">
              Moneda inicial
              <select id="wwCur" className="select" value={cur} onChange={(e) => setCur(e.target.value === 'USD' ? 'USD' : 'PEN')}>
                <option value="PEN">PEN (soles)</option>
                <option value="USD">USD (dólares)</option>
              </select>
            </label>
          </div>

          <div className="field">
            <span>Clave publicable (token «embed»)</span>
            {embedTokens.length ? (
              <p className="sub" style={{ margin: '4px 0' }}>Claves activas: {embedTokens.map((t) => `${t.name} (…${t.token_last_four})`).join(', ')}. El valor completo solo se muestra al crearla.</p>
            ) : (
              <Note kind="warn" icon="info">Este sitio aún no tiene claves publicables. Crea una para obtener el fragmento.</Note>
            )}
            {can('web_connector.site_token.create') ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                <input className="input" aria-label="Nombre de la clave" placeholder="Nombre de la clave" value={name} onChange={(e) => setName(e.target.value)} />
                <button type="button" className="btn primary" disabled={busy || !name.trim()} onClick={() => void create()}><Icon name="plus" size="sm" /> Crear clave</button>
              </div>
            ) : null}
            {plain && plain.siteId === sid ? <Note kind="warn" icon="tri">Clave recién creada: <code>{plain.key}</code>. Cópiala ahora; no se volverá a mostrar al recargar o cambiar de sitio.</Note> : (
              <input className="input mono" style={{ marginTop: 6 }} aria-label="Pegar clave existente" placeholder="O pega aquí una clave ya guardada" value={manual} onChange={(e) => setManual(e.target.value)} />
            )}
          </div>

          <div className="form-grid">
            <label className="field full" htmlFor="wwBlock">
              Bloque
              <select id="wwBlock" className="select" value={block} onChange={(e) => setBlock(e.target.value)}>
                {Object.entries(BLOCKS).map(([k, b]) => <option key={k} value={k}>{b.label} ({k})</option>)}
              </select>
            </label>
            {def.opts.map((o) => {
              const id = `wwo_${block}_${o.attr}`;
              const vk = block + '.' + o.attr;
              const v = vals[vk] ?? '';
              const set = (x: string) => setVals({ ...vals, [vk]: x });
              return typeof o.type === 'object' ? (
                <label className="field" htmlFor={id} key={vk}>
                  {o.label}
                  <select id={id} className="select" value={v} onChange={(e) => set(e.target.value)}>
                    {o.type.sel.map(([ov, ol]) => <option key={ov} value={ov}>{ol}</option>)}
                  </select>
                </label>
              ) : (
                <label className="field" htmlFor={id} key={vk}>
                  {o.label}
                  <input id={id} className="input" type={o.type === 'num' ? 'number' : 'text'} min={o.type === 'num' ? 1 : undefined} max={o.type === 'num' ? 4 : undefined} placeholder={o.ph} value={v} onChange={(e) => set(e.target.value)} />
                </label>
              );
            })}
          </div>
        </div>

        <div className="stack">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <h3 className="fs" style={{ margin: 0 }}>Fragmento para pegar en tu web</h3>
            <button type="button" className="btn sm" onClick={() => copyText(snippet, toast)}><Icon name="layers" size="sm" /> Copiar</button>
          </div>
          <pre className="mono" style={{ margin: 0, padding: 12, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12.5 }} aria-label="Fragmento del widget">{snippet}</pre>
          {!key ? <Note kind="warn" icon="info">Falta la clave: el fragmento usa <code>TU_TOKEN</code> como marcador. Crea una clave arriba y se sustituirá sola.</Note> : null}
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--muted)' }}>El <code>&lt;script&gt;</code> va una sola vez por página; puedes repetir los bloques <code>&lt;div data-hub-block&gt;</code> donde los necesites. La web debe estar en los orígenes permitidos del sitio.</p>
        </div>
      </div>
    </div>
  );
}
