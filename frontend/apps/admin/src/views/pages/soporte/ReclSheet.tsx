/**
 * Hoja de reclamación en panel lateral (prototipo ACT2.reclDetail l.3194):
 * datos del consumidor, bien, detalle y respuesta enriquecida con plantillas,
 * vista previa de la carta y envío con confirmación.
 */
import { useRef, useState, type ReactNode } from 'react';
import { useApp } from '../../../app/context';
import { useActions } from '../../../app/actions';
import { Icon } from '../../../components/Icon';
import { Sheet } from '../../../components/Modal';
import { Chip, Kv, Note } from '../../../components/ui';
import { BR, CBY, ME, TODAY, addD, fD, moneyRaw, reclCfg, reclDue, reclLeft } from '../../../data';
import { RichText, html2txt, txt2html, type RteHandle } from './RichText';
import { Letter, type ReclX } from './shared';

/** Plantillas de respuesta (RTPL l.2220). */
export const RTPL: Record<string, (r: ReclX) => string> = {
  'Procedente — solución': (r) =>
    `Estimado(a) ${r.nombre}:\n\nEn atención a su ${r.tipo.toLowerCase()} N.° ${r.id}, le informamos que este resulta PROCEDENTE. ${r.monto ? `Hemos dispuesto la devolución de ${moneyRaw(r.monto, 'PEN')} en un plazo de 5 días hábiles.` : 'Hemos tomado las medidas correctivas correspondientes.'}\n\nAtentamente,\nÁrea de Atención al Cliente — ${BR[r.brand].n}`,
  'Improcedente — explicación': (r) =>
    `Estimado(a) ${r.nombre}:\n\nTras revisar su ${r.tipo.toLowerCase()} N.° ${r.id}, le informamos que no resulta procedente por los siguientes motivos:\n\n- \n\nQuedamos atentos a cualquier consulta.\n\nAtentamente,\n${BR[r.brand].n}`,
  'Solicitud de información': (r) =>
    `Estimado(a) ${r.nombre}:\n\nPara atender su ${r.tipo.toLowerCase()} N.° ${r.id} necesitamos que nos envíe:\n\n- Comprobante de pago\n- Capturas del inconveniente\n\nAtentamente,\n${BR[r.brand].n}`,
};

export default function ReclSheet({ r, onClose }: { r: ReclX; onClose: () => void }) {
  const { toast, refresh, dialogs, href } = useApp();
  const { fakeDownload } = useActions();
  const ed = useRef<RteHandle>(null);
  const [err, setErr] = useState('');
  if (r.respHtml == null) r.respHtml = r.resp ? txt2html(r.resp) : '';
  const l = reclLeft(r);
  const done = r.st === 'Respondido';

  const markAt = () => {
    r.respHtml = ed.current?.get() || '';
    r.st = 'En atención';
    onClose();
    toast('Hoja en atención', r.id, 'info');
    refresh();
  };
  const sendResp = () => {
    const h = ed.current?.get() || '';
    if (html2txt(h).length < 40) {
      setErr('La respuesta debe tener al menos 40 caracteres.');
      ed.current?.focus();
      return;
    }
    r.respHtml = h;
    dialogs.confirm({
      title: 'Enviar respuesta',
      body: (
        <p style={{ margin: 0 }}>
          Se enviará la carta de respuesta a <span className="mono">{r.mail}</span> y quedará registrada con fecha {fD(TODAY)} y responsable <b>{ME}</b>.
        </p>
      ),
      okLabel: 'Enviar',
      onOk: () => {
        r.st = 'Respondido';
        r.resp = html2txt(h);
        r.respDate = TODAY;
        r.respBy = ME;
        onClose();
        toast('Respuesta enviada', `${r.id} · ${r.mail} · registrada por ${ME}`);
        refresh();
      },
    });
  };
  const preview = () => {
    const h = ed.current?.get() || '';
    dialogs.open(
      <div className="letter-wrap">
        <Letter r={{ ...r, respBy: ME, respDate: TODAY }} html={h || '<p><i>(Sin texto aún)</i></p>'} />
      </div>,
      {
        title: 'Vista previa de la carta',
        sub: `Respuesta a la hoja ${r.id}`,
        wide: true,
        footer: (
          <button type="button" className="btn primary" onClick={() => dialogs.close()}>
            Volver a editar
          </button>
        ),
      },
    );
  };

  const footer = done ? (
    <>
      <button type="button" className="btn" onClick={() => fakeDownload(`${r.id}-respuesta`)}>
        <Icon name="download" size="sm" />
        PDF
      </button>
      <button type="button" className="btn" onClick={onClose}>
        Cerrar
      </button>
    </>
  ) : (
    <>
      <button type="button" className="btn" onClick={preview}>
        <Icon name="eye" size="sm" />
        Vista previa de la carta
      </button>
      <button type="button" className="btn" onClick={markAt}>
        Marcar en atención
      </button>
      <button type="button" className="btn primary" onClick={sendResp}>
        <Icon name="send" size="sm" />
        Enviar respuesta
      </button>
    </>
  );

  return (
    <Sheet
      open
      onClose={onClose}
      title={
        <>
          {r.tipo} <span className="mono">{r.id}</span>
          {r.test ? (
            <>
              {' '}
              <Chip kind="warn">Prueba</Chip>
            </>
          ) : null}
        </>
      }
      sub={`${BR[r.brand].n} · recibido ${fD(r.date)}${r.origin ? ' · ' + r.origin : ''}`}
      footer={footer}
    >
      <div style={{ display: 'grid', gap: 14 }}>
        {!done && l <= 3 ? (
          <Note kind="warn" icon="tri" role="alert">
            {l < 0 ? `El plazo venció hace ${-l} días.` : `Quedan ${l} días ${reclCfg.unit} (vence ${fD(reclDue(r))}).`}
          </Note>
        ) : null}
        <div>
          <h3 className="fs">1. Consumidor</h3>
          <Kv
            items={[
              ['Nombre', r.nombre],
              ['Documento', `${r.docT || 'DNI'} ${r.dni}`],
              ['Domicilio', r.dom],
              ['Teléfono', <span className="mono">{r.tel}</span>],
              ['Correo', <span className="mono">{r.mail}</span>],
              ['Menor de edad', r.menor ? `Sí · apoderado: ${r.apod} (${r.apodDoc})` : 'No'],
            ]}
          />
        </div>
        <div>
          <h3 className="fs">2. Bien contratado</h3>
          <Kv
            items={[
              ['Tipo', r.bien || 'Servicio'],
              ['Monto reclamado', r.monto ? moneyRaw(r.monto, 'PEN') : '—'],
              ...(r.bienDesc ? ([['Descripción', r.bienDesc]] as [string, string][]) : []),
              ...(r.cid && CBY[r.cid] ? ([['Cliente vinculado', <a href={href('cliente', r.cid)}>{CBY[r.cid].name}</a>]] as [string, ReactNode][]) : []),
            ]}
          />
        </div>
        <div>
          <h3 className="fs">3. Detalle</h3>
          <Kv
            items={[
              ['Tipo', r.tipo],
              ['Detalle', r.det],
              ['Pedido', r.pedido],
            ]}
          />
        </div>
        <div>
          <h3 className="fs">4. Respuesta del proveedor</h3>
          {done ? (
            <>
              <Note icon="check">
                Respondido el {fD(r.respDate || addD(r.date, 4))} por {r.respBy || 'Área de Atención al Cliente'} · enviado a {r.mail}.
              </Note>
              <div className="letter-wrap" style={{ marginTop: 10 }}>
                <Letter r={r} html={r.respHtml || txt2html(r.resp || 'Respuesta enviada (archivo).')} />
              </div>
            </>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              <label className="field">
                Plantilla
                <select
                  className="select"
                  value=""
                  onChange={(e) => {
                    const k = e.target.value;
                    if (k && RTPL[k]) ed.current?.set(txt2html(RTPL[k](r)));
                  }}
                >
                  <option value="">— Elegir plantilla —</option>
                  {Object.keys(RTPL).map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
              </label>
              <RichText
                ref={ed}
                initial={r.respHtml || ''}
                label="Respuesta al consumidor"
                min={220}
                ph="Redacte la respuesta o elija una plantilla…"
                onChange={(h) => {
                  r.respHtml = h;
                  if (err && html2txt(h).length >= 40) setErr('');
                }}
              />
              <span className="err" role={err ? 'alert' : undefined}>
                {err}
              </span>
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}
