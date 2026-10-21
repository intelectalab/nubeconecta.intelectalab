/**
 * Vista «apariencia» (#apariencia) — identidad visual por marca y destino
 * (prototipo vApariencia y handlers app*, l.2149-2186).
 * Parámetro opcional: id de marca (ap|sc|ha|ns).
 */
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../app/context';
import type { ViewProps } from '../../app/routes';
import { useViewState } from '../../app/storage';
import { applyPanelColor, savePanelColor } from '../../app/theme';
import { Icon } from '../../components/Icon';
import { Chip, Note, PageHead } from '../../components/ui';
import { APP, APPH, BR, BRANDS, FONTS, NF2, TARGETS, bestFg, contrast, fD, fT, hexOk, mwBtnCls, mwVars, type Appearance, type BrandId } from '../../data';
import { MwBar, MwLogo } from './web-config/shared';

type ColorKey = 'primary' | 'secondary' | 'accent' | 'bg';
const COLORS: [ColorKey, string][] = [
  ['primary', 'Color principal'],
  ['secondary', 'Color secundario'],
  ['accent', 'Color de acento'],
  ['bg', 'Color de fondo'],
];
const BTN_STYLES = ['Sólido', 'Contorno', 'Píldora'];
const DEFAULT_PANEL = '#0a3fc4';

const crList = (a: Appearance): [string, number][] =>
  (
    [
      ['Texto del botón sobre principal', bestFg(a.primary), a.primary],
      ['Texto sobre fondo', bestFg(a.bg), a.bg],
      ['Principal como enlace sobre fondo', a.primary, a.bg],
      ['Acento sobre fondo', a.accent, a.bg],
    ] as [string, string, string][]
  ).map(([l, f, g]) => [l, contrast(f, g)]);
const level = (r: number) => (r >= 7 ? 'AAA' : r >= 4.5 ? 'AA' : r >= 3 ? 'solo texto grande' : 'insuficiente');

function MailPreview({ b, t }: { b: BrandId; t: string }) {
  const B = mwBtnCls(b, t);
  return (
    <div className="mw mw-mail" style={mwVars(b, t)}>
      <MwBar>Asunto: Tu factura F001-00018310 vence en 7 días</MwBar>
      <div className="mm-head">
        <MwLogo brand={b} target={t} />
      </div>
      <div className="mp-main">
        <h3 className="mw-h">Hola, Mariela</h3>
        <p style={{ margin: 0 }}>
          Tu factura <b>F001-00018310</b> por <b>S/ 212.40</b> vence el <b>15/10/2026</b>. Puedes pagar con tarjeta, PayPal o transferencia.
        </p>
        <span className={B} style={{ justifySelf: 'start' }}>
          Pagar ahora
        </span>
        <p className="mw-mut" style={{ margin: 0 }}>
          ¿Pagaste por transferencia? <a className="mw-link">Sube tu voucher</a>.
        </p>
      </div>
      <div className="mw-foot">{BR[b].n} · Correo automático de cobranza.</div>
    </div>
  );
}
function PortalPreview({ b, t }: { b: BrandId; t: string }) {
  const B = mwBtnCls(b, t);
  return (
    <div className="mw mw-portal" style={mwVars(b, t)}>
      <aside>
        <MwLogo brand={b} target={t} />
        <span className="on">Inicio</span>
        <span>Servicios</span>
        <span>Facturas</span>
        <span>Soporte</span>
      </aside>
      <div className="mp-main">
        <h3 className="mw-h">Hola, Mariela</h3>
        <div className="mp-cards">
          <div>
            <small className="mw-mut">Saldo pendiente</small>
            <b>S/ 1,647.28</b>
            <span className={`${B} sm`}>Pagar ahora</span>
          </div>
          <div>
            <small className="mw-mut">Servicios activos</small>
            <b>7</b>
            <a className="mw-link">Ver detalle</a>
          </div>
        </div>
        <div className="mp-row">
          <span>F001-00018310</span>
          <span className="mw-tag" style={{ position: 'static' }}>
            Por vencer
          </span>
          <b>S/ 212.40</b>
        </div>
        <div className="mp-row">
          <span>F001-00018245</span>
          <span className="mw-mut">Pagada</span>
          <b>S/ 411.82</b>
        </div>
      </div>
    </div>
  );
}

export default function AparienciaView({ param }: ViewProps) {
  const { brand, toast, refresh, dialogs } = useApp();
  const [b, setB] = useViewState<BrandId>('app.brand', brand === 'all' ? 'ap' : brand);
  const [t, setT] = useViewState('app.target', 'Portal del cliente');
  const [hex, setHex] = useState<Partial<Record<ColorKey, string>>>({});
  const [hexErr, setHexErr] = useState<Partial<Record<ColorKey, string>>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const a = APP[b][t];

  useEffect(() => {
    if (param && param in BR) setB(param as BrandId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [param]);
  useEffect(() => {
    if (brand !== 'all') setB(brand);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand]);
  useEffect(() => {
    setHex({});
    setHexErr({});
  }, [b, t]);

  const cr = crList(a);
  const bad = cr.filter((c) => c[1] < 4.5);

  /** Aplica un cambio en vivo (appLive). */
  const live = (patch: Partial<Appearance>) => {
    Object.assign(a, patch, { status: 'Borrador sin publicar' });
    if (t === 'Panel interno' && patch.primary) savePanelColor(a.primary);
    refresh();
  };
  const setColor = (k: ColorKey, v: string) => {
    setHex((h) => ({ ...h, [k]: v }));
    let x = v.trim();
    if (!x.startsWith('#')) x = '#' + x;
    if (!hexOk(x)) return;
    setHexErr((e) => ({ ...e, [k]: '' }));
    live({ [k]: x.toLowerCase() });
  };
  const blurHex = (k: ColorKey) => {
    const v = hex[k];
    if (v == null) return;
    let x = v.trim();
    if (!x.startsWith('#')) x = '#' + x;
    setHexErr((e) => ({ ...e, [k]: hexOk(x) ? '' : 'Formato #RRGGBB' }));
  };
  const onLogo = (f: File | undefined) => {
    if (!f) return;
    if (!/^image\/(png|svg\+xml|jpeg|webp)$/.test(f.type)) {
      toast('Formato no admitido', 'Use PNG, SVG, JPG o WEBP.', 'err');
      return;
    }
    if (f.size > 1048576) {
      toast('Archivo muy grande', 'El logo debe pesar menos de 1 MB.', 'err');
      return;
    }
    const r = new FileReader();
    r.onload = () => {
      live({ logo: String(r.result) });
      toast('Logo cargado', f.name);
    };
    r.onerror = () => toast('No se pudo leer el archivo', '', 'err');
    r.readAsDataURL(f);
  };
  const draft = () => {
    a.status = 'Borrador guardado';
    toast('Borrador guardado', `${BR[b].n} · ${t}`);
    refresh();
  };
  const publish = () => {
    const nBad = (
      [
        [bestFg(a.primary), a.primary],
        [bestFg(a.bg), a.bg],
        [a.primary, a.bg],
      ] as [string, string][]
    ).filter(([x, y]) => contrast(x, y) < 4.5).length;
    const H0 = APPH[b][t];
    const [M, m] = H0[0].v.slice(1).split('.').map(Number);
    const nv = `v${M}.${m + 1}`;
    dialogs.confirm({
      title: 'Publicar apariencia',
      body: (
        <>
          <p style={{ margin: 0 }}>
            Se publicará la versión <b>{nv}</b> de{' '}
            <b>
              {BR[b].n} · {t}
            </b>
            . {t === 'Portal del cliente' ? 'Los cambios se verán en el portal en menos de 1 minuto.' : t === 'Correos' ? 'Aplicará a los próximos correos enviados.' : ''}
          </p>
          {nBad ? (
            <Note kind="warn" icon="tri">
              Hay {nBad} combinaciones con contraste menor a 4.5:1.
            </Note>
          ) : null}
        </>
      ),
      okLabel: 'Publicar',
      onOk: () => {
        a.status = 'Publicado';
        H0.unshift({ v: nv, date: new Date(), by: 'Renzo Vargas', snap: { ...a } });
        toast('Apariencia publicada', `${BR[b].n} · ${t} · ${nv}`);
        refresh();
      },
    });
  };
  const revert = (k: number) => {
    const h = APPH[b][t][k];
    dialogs.confirm({
      title: 'Revertir apariencia',
      body: (
        <p style={{ margin: 0 }}>
          Se cargará la versión {h.v} ({fD(h.date)}) como borrador. Publíquela para aplicarla.
        </p>
      ),
      okLabel: 'Revertir',
      onOk: () => {
        Object.assign(a, h.snap, { status: 'Borrador sin publicar' });
        if (t === 'Panel interno') savePanelColor(h.snap.primary);
        setHex({});
        toast('Versión restaurada como borrador', h.v, 'info');
        refresh();
      },
    });
  };
  const reset = () => {
    savePanelColor(null);
    applyPanelColor(null);
    Object.assign(APP[b]['Panel interno'], { primary: DEFAULT_PANEL });
    setHex({});
    toast('Panel restablecido', 'Se volvió al azul AlojamientoPlus.', 'info');
    refresh();
  };

  return (
    <>
      <PageHead
        crumbs={[['Configuración', 'ajustes'], ['Apariencia', 'apariencia']]}
        title="Apariencia"
        sub="Identidad visual por marca y destino: portal del cliente, este panel y correos. Las webs públicas se diseñan en WordPress."
        actions={
          <>
            <button type="button" className="btn" onClick={draft}>
              Guardar borrador
            </button>
            <button type="button" className="btn primary" onClick={publish}>
              <Icon name="upload" size="sm" />
              Publicar
            </button>
          </>
        }
      />
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="toolbar">
          <label className="field" style={{ minWidth: 200 }} htmlFor="apBrand">
            Marca
            <select id="apBrand" className="select" value={b} onChange={(e) => setB(e.target.value as BrandId)}>
              {BRANDS.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.n}
                </option>
              ))}
            </select>
          </label>
          <div className="field">
            Destino
            <div className="seg" role="group" aria-label="Destino">
              {TARGETS.map((x) => (
                <button type="button" key={x} aria-pressed={x === t} onClick={() => setT(x)}>
                  {x}
                </button>
              ))}
            </div>
          </div>
          <span className="count">
            <Chip kind={a.status === 'Publicado' ? 'ok' : 'warn'}>{a.status}</Chip>
          </span>
        </div>
      </div>
      {t === 'Panel interno' ? (
        <div className="note" style={{ marginBottom: 16 }}>
          <Icon name="info" size="sm" />
          <span>
            En «Panel interno» el color principal se aplica <b>en vivo</b> a este panel (barra superior, botones, enlaces y gráficos) y se recuerda en este navegador.
          </span>
          <button type="button" className="btn sm" onClick={reset} style={{ marginLeft: 'auto' }}>
            Restablecer azul
          </button>
        </div>
      ) : null}
      <div className="grid g-2">
        <section className="card" aria-label="Ajustes de apariencia">
          <div className="card-b" style={{ paddingTop: 16 }}>
            <div className="form-grid">
              <div className="field full">
                Logo
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span className="logo-prev" style={mwVars(b, t)}>
                    <MwLogo brand={b} target={t} />
                  </span>
                  <button type="button" className="btn sm" onClick={() => fileRef.current?.click()}>
                    <Icon name="upload" size="sm" />
                    Subir logo
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/svg+xml,image/jpeg,image/webp"
                    className="sr-only"
                    tabIndex={-1}
                    aria-label="Archivo del logo"
                    onChange={(e) => {
                      onLogo(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                  {a.logo ? (
                    <button type="button" className="btn sm ghost" onClick={() => live({ logo: null })}>
                      Quitar
                    </button>
                  ) : null}
                  <small className="hint">PNG, SVG, JPG o WEBP · máx. 1 MB</small>
                </div>
              </div>
              {COLORS.map(([k, l]) => (
                <div className="field" key={k}>
                  {l}
                  <div className="colorf">
                    <input type="color" value={a[k]} onChange={(e) => setColor(k, e.target.value)} aria-label={`${l} (selector)`} />
                    <input
                      className="input mono"
                      value={hex[k] ?? a[k]}
                      maxLength={7}
                      onChange={(e) => setColor(k, e.target.value)}
                      onBlur={() => blurHex(k)}
                      aria-label={`${l} (hex)`}
                      aria-invalid={!!hexErr[k]}
                      aria-describedby={`e_hex_${k}`}
                    />
                    <span className="err" id={`e_hex_${k}`}>
                      {hexErr[k] || ''}
                    </span>
                  </div>
                </div>
              ))}
              <label className="field" htmlFor="ap_fh">
                Tipografía de títulos
                <select id="ap_fh" className="select" value={a.fh} onChange={(e) => live({ fh: e.target.value })}>
                  {FONTS.map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
              </label>
              <label className="field" htmlFor="ap_fb">
                Tipografía de texto
                <select id="ap_fb" className="select" value={a.fb} onChange={(e) => live({ fb: e.target.value })}>
                  {FONTS.map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
              </label>
              <label className="field" htmlFor="ap_r">
                <span>
                  Radio de bordes:{' '}
                  <b className="num" id="rv">
                    {a.radius} px
                  </b>
                </span>
                <input id="ap_r" type="range" min={0} max={24} value={a.radius} onChange={(e) => live({ radius: +e.target.value })} />
              </label>
              <div className="field">
                Estilo de botones
                <div className="seg" role="group" aria-label="Estilo de botones">
                  {BTN_STYLES.map((x) => (
                    <button type="button" key={x} aria-pressed={a.btn === x} onClick={() => live({ btn: x })}>
                      {x}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="card-h" style={{ borderTop: '1px solid var(--border)' }}>
            <h2 className="sec">Contraste (WCAG AA)</h2>
            <span className="sub">mínimo 4.5:1 para texto</span>
          </div>
          <div className="card-b" aria-live="polite">
            {bad.length ? (
              <Note kind="warn" icon="tri" style={{ marginBottom: 10 }}>
                {bad.length} {bad.length === 1 ? 'combinación no alcanza' : 'combinaciones no alcanzan'} 4.5:1. Ajuste los colores antes de publicar.
              </Note>
            ) : null}
            <ul className="checks">
              {cr.map(([l, r]) => (
                <li key={l} className={r >= 4.5 ? 'ok' : 'no'}>
                  <Icon name={r >= 4.5 ? 'check' : 'tri'} size="sm" />
                  <span>
                    {l}
                    <small>
                      {NF2.format(r)}:1 · {level(r)}
                    </small>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="card-h" style={{ borderTop: '1px solid var(--border)' }}>
            <h2 className="sec">Historial</h2>
          </div>
          <ul className="rows">
            {APPH[b][t].map((h, k) => (
              <li key={h.v + k}>
                <span className="swatch" style={{ background: h.snap.primary }} />
                <div className="grow">
                  <b>
                    {h.v}
                    {k === 0 ? ' (publicada)' : ''}
                  </b>
                  <small>
                    {fD(h.date)} {fT(h.date)} · {h.by}
                  </small>
                </div>
                {k > 0 ? (
                  <button type="button" className="btn sm" onClick={() => revert(k)}>
                    Revertir
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
        <section className="stack" aria-label="Vistas previas">
          <div>
            <h3 className="fs">Vista previa · correo</h3>
            <MailPreview b={b} t={t} />
          </div>
          <div>
            <h3 className="fs">Vista previa · mini portal del cliente</h3>
            <PortalPreview b={b} t={t} />
          </div>
        </section>
      </div>
    </>
  );
}
