/**
 * WordPress › Sitios conectados (prototipo vWp, pestaña «sitios», y acciones
 * wpTest2, wpInv, tokRegen, tokRevoke; l.2475-2478 y l.2495-2499).
 */
import { useState } from 'react';
import { useApp } from '../../../app/context';
import { Icon } from '../../../components/Icon';
import { BrandTag, Chip, Note } from '../../../components/ui';
import { PERM, SCUSE, WPS, fD, fT, maskTok, type WpSite } from '../../../data';
import { ScBox } from './shared';

const PLUGIN_OK = '1.4.2';

export default function WpSitios() {
  const { brand, role, toast, refresh, dialogs } = useApp();
  const [testing, setTesting] = useState<string | null>(null);
  const canTok = role === 'Administrador' || PERM[role]?.WordPress?.Especial === true;
  const sites = WPS.filter((w) => brand === 'all' || w.brand === brand);
  const uses = SCUSE.filter((r) => brand === 'all' || r[0] === brand);
  const tokWhy = canTok ? undefined : `El rol ${role} no tiene el permiso «Regenerar tokens».`;

  const test = (w: WpSite) => {
    setTesting(w.id);
    window.setTimeout(() => {
      if (!w.tok) toast('Conexión rechazada', `${w.host}: el token fue revocado. Regenere uno y péguelo en el plugin.`, 'err');
      else {
        w.lat = 120 + Math.floor(Math.random() * 101);
        if (w.st !== 'Plugin desactualizado') w.st = 'Conectado';
        toast('Conexión correcta', `${w.host} · API ${w.lat} ms · plugin ${w.plugin}`, w.plugin === PLUGIN_OK ? 'ok' : 'warn');
      }
      setTesting(null);
      refresh();
    }, 900);
  };
  const inv = (w: WpSite) => {
    if (!w.tok) {
      toast('Sin conexión', 'Regenere el token antes de invalidar la caché.', 'err');
      return;
    }
    w.inv = new Date();
    toast('Caché invalidada', `${w.host} · webhook respondió 200`);
    refresh();
  };
  const regen = (w: WpSite) =>
    dialogs.confirm({
      title: 'Regenerar token',
      body: (
        <p style={{ margin: 0 }}>
          El token actual de <b>{w.host}</b> dejará de funcionar de inmediato. Deberá pegar el nuevo token en <i>Ajustes › Plugin del sistema</i> de WordPress.
        </p>
      ),
      okLabel: 'Regenerar',
      onOk: () => {
        const ch = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
        w.tok = 'hub_ro_' + Array.from({ length: 16 }, () => ch[Math.floor(Math.random() * ch.length)]).join('');
        w.st = w.plugin === PLUGIN_OK ? 'Conectado' : 'Plugin desactualizado';
        refresh();
        dialogs.open(
          <>
            <Note kind="warn" icon="tri">
              Cópielo ahora: por seguridad no se volverá a mostrar completo.
            </Note>
            <ScBox code={w.tok} id="tokNew" label="Nuevo token" />
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--muted)' }}>Permisos: solo lectura de catálogo, precios, formularios y documentos públicos.</p>
          </>,
          {
            title: 'Nuevo token generado',
            sub: w.host,
            footer: (
              <button type="button" className="btn primary" onClick={() => dialogs.close()}>
                Listo
              </button>
            ),
          },
        );
      },
    });
  const revoke = (w: WpSite) =>
    dialogs.confirm({
      title: 'Revocar token',
      body: <p style={{ margin: 0 }}>{w.host} dejará de mostrar planes, precios y formularios hasta que se configure un token nuevo.</p>,
      okLabel: 'Revocar',
      danger: true,
      onOk: () => {
        w.tok = '';
        w.st = 'Token revocado';
        toast('Token revocado', w.host, 'warn');
        refresh();
      },
    });

  return (
    <div className="card-b" style={{ paddingTop: 16, display: 'grid', gap: 16 }}>
      <Note>
        Las webs públicas son un <b>WordPress Multisite</b> con el plugin del sistema. Muestran planes, precios, formularios y documentos mediante shortcodes con un <b>token de solo lectura</b>; al cambiar el catálogo, el
        sistema llama al webhook para invalidar la caché.
      </Note>
      <div className="grid g-2e">
        {sites.map((w) => (
          <article className="card provcard" key={w.id} aria-label={w.host}>
            <div className="h">
              <span className="ico">WP</span>
              <b>
                {w.host}
                <div className="sub" style={{ fontWeight: 500, fontSize: 12, color: 'var(--muted)' }}>
                  {w.ms} · <BrandTag brand={w.brand} />
                </div>
              </b>
              <Chip kind={w.st === 'Conectado' ? 'ok' : w.st === 'Token revocado' ? 'danger' : 'warn'} icon={w.st === 'Conectado' ? 'check' : 'tri'}>
                {w.st}
              </Chip>
            </div>
            <dl className="kv">
              <dt>Token (solo lectura)</dt>
              <dd className="mono">{maskTok(w.tok)}</dd>
              <dt>Webhook de caché</dt>
              <dd className="mono" style={{ fontSize: 12 }}>
                {w.wh}
              </dd>
              <dt>Última invalidación</dt>
              <dd>
                {fD(w.inv)} {fT(w.inv)}
              </dd>
              <dt>Plugin · WordPress</dt>
              <dd>
                {w.plugin}
                {w.plugin !== PLUGIN_OK ? (
                  <>
                    {' '}
                    <span className="chip warn">actualizar a {PLUGIN_OK}</span>
                  </>
                ) : null}{' '}
                · {w.wp}
              </dd>
              {w.lat ? (
                <>
                  <dt>Latencia API</dt>
                  <dd>{w.lat} ms</dd>
                </>
              ) : null}
            </dl>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn sm" onClick={() => test(w)} disabled={testing === w.id} aria-busy={testing === w.id}>
                {testing === w.id ? (
                  <>
                    <span className="spin" aria-hidden="true" />
                    Probando…
                  </>
                ) : (
                  <>
                    <Icon name="activity" size="sm" />
                    Probar conexión
                  </>
                )}
              </button>
              <button type="button" className="btn sm" onClick={() => inv(w)}>
                <Icon name="refresh" size="sm" />
                Invalidar caché
              </button>
              <button type="button" className="btn sm" onClick={() => regen(w)} disabled={!canTok} title={tokWhy}>
                <Icon name="lock" size="sm" />
                Regenerar token
              </button>
              {w.tok ? (
                <button type="button" className="btn sm danger" onClick={() => revoke(w)} disabled={!canTok} title={tokWhy}>
                  Revocar
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </div>
      <div>
        <h3 className="fs">
          Shortcodes usados por sitio{' '}
          <span className="sub" style={{ fontWeight: 500, color: 'var(--muted)' }}>
            detectados por el plugin
          </span>
        </h3>
        <div className="tw" style={{ border: '1px solid var(--border)', borderRadius: 8 }}>
          <table className="t">
            <thead>
              <tr>
                <th>Sitio</th>
                <th>Shortcode</th>
                <th>Página</th>
                <th>Última vista</th>
              </tr>
            </thead>
            <tbody>
              {uses.map((r, k) => (
                <tr key={k}>
                  <td className="nw">{(WPS.find((w) => w.id === r[0]) || WPS[0]).host}</td>
                  <td className="mono" style={{ minWidth: 220 }}>
                    [{r[1]}]
                  </td>
                  <td className="mono">{r[2]}</td>
                  <td className="num">{r[3]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
