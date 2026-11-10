/**
 * WordPress › Generador de shortcodes (prototipo vWp, pestaña «generador»;
 * handlers scName, scOpt, scBrand; l.2479-2481 y l.2500-2502).
 */
import { useState } from 'react';
import { BRANDS, SCDEF, type BrandId } from '../../../data';
import { catName } from '../comercial/catalogData';
import { ScPreview } from './previews';
import { ScBox } from './shared';
import { embedCode, scCode, scOpts, scValues, type ScVals } from './wpData';
import { Note } from '../../../components/ui';

const lbl = (k: string): string => {
  const l = k.replace('_', ' ');
  return l[0].toUpperCase() + l.slice(1);
};

export default function WpGenerador({ name, setName, vals, setVals, brand, setBrand }: { name: string; setName: (v: string) => void; vals: ScVals; setVals: (v: ScVals) => void; brand: BrandId; setBrand: (b: BrandId) => void }) {
  const sc = SCDEF[name] ? name : 'hub_planes';
  const d = SCDEF[sc];
  const v = scValues(sc, vals);
  const set = (k: string, x: string | number | boolean) => setVals({ ...vals, [sc + '.' + k]: x });
  const [fmt, setFmt] = useState<'wp' | 'embed'>('wp');
  return (
    <div className="card-b" style={{ paddingTop: 16 }}>
      <Note kind="warn" icon="info">Pendiente de backend: el generador depende de la configuración de shortcodes del plugin; no existe un endpoint administrativo para leer o guardar esta configuración.</Note>
      <div className="grid g-2">
        <div className="stack">
          <div className="form-grid">
            <label className="field full" htmlFor="scN">
              Shortcode
              <select id="scN" className="select" value={sc} onChange={(e) => setName(e.target.value)}>
                {Object.keys(SCDEF).map((k) => (
                  <option key={k} value={k}>
                    {k} — {SCDEF[k].d}
                  </option>
                ))}
              </select>
            </label>
            {d.o.map(([k, t]) => {
              const id = 'sco_' + k;
              if (t === 'sel') {
                const opts = scOpts(k, sc);
                const cur = String(v[k]);
                return (
                  <label className="field" htmlFor={id} key={sc + k}>
                    {lbl(k)}
                    <select id={id} className="select" value={opts.some((o) => o[0] === cur) ? cur : opts[0]?.[0] ?? ''} onChange={(e) => set(k, e.target.value)}>
                      {opts.map(([ov, ol]) => (
                        <option key={ov} value={ov}>
                          {ol}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              }
              if (t === 'chk')
                return (
                  <div className="field" key={sc + k}>
                    {lbl(k)}
                    <label className="check">
                      <input type="checkbox" checked={!!v[k]} onChange={(e) => set(k, e.target.checked)} />
                      Sí
                    </label>
                  </div>
                );
              return (
                <label className="field" htmlFor={id} key={sc + k}>
                  {lbl(k) + (k === 'ids' ? ' (opcional)' : '')}
                  <input
                    id={id}
                    className={`input${k === 'ids' || k === 'extensiones' ? ' mono' : ''}`}
                    type={t === 'num' ? 'number' : 'text'}
                    min={t === 'num' ? 1 : undefined}
                    max={t === 'num' ? (k === 'historial' ? 90 : 6) : undefined}
                    value={String(v[k] ?? '')}
                    placeholder={k === 'ids' ? 'HP1,HP2' : undefined}
                    onChange={(e) => set(k, e.target.value)}
                  />
                </label>
              );
            })}
            <label className="field" htmlFor="scB">
              Ver con estilo de la marca
              <select id="scB" className="select" value={brand} onChange={(e) => setBrand(e.target.value as BrandId)}>
                {BRANDS.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.n}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="field">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span>Código para pegar</span>
              <div className="seg" role="group" aria-label="Formato del código">
                <button type="button" aria-pressed={fmt === 'wp'} onClick={() => setFmt('wp')}>WordPress</button>
                <button type="button" aria-pressed={fmt === 'embed'} onClick={() => setFmt('embed')}>Web a medida</button>
              </div>
            </div>
            <ScBox code={fmt === 'embed' ? embedCode(sc, vals) : scCode(sc, vals)} id="scOut" />
          </div>
          {fmt === 'embed' ? <Note icon="info">Pega este bloque en tu web a medida. Una sola vez por página, agrega también el <code>&lt;script&gt;</code> con tu <b>clave publicable</b> (lo entrega «Sitios → Web a medida → clave publicable»).</Note> : null}
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--muted)' }}>Incluidos los productos personalizados del catálogo (tipo «{catName('personalizados')}» y categorías nuevas).</p>
        </div>
        <div>
          <h3 className="fs">Vista previa en la web de la marca</h3>
          <div>
            <ScPreview name={sc} vals={vals} brand={brand} />
          </div>
        </div>
      </div>
    </div>
  );
}
