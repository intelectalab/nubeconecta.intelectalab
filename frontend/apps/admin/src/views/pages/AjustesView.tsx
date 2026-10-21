/**
 * Vista «ajustes» (#ajustes) — Cobranza y SLA (prototipo vAjustes,
 * seqRowsHtml, simHtml y handlers seqAdd/seqDel/saveCfg/onField; l.1911-1925,
 * l.3455-3457 y l.3477-3483).
 *
 * Diferencias tomadas de la especificación (docs/modulos):
 *  - M-BIL / M-CFG: el recargo por mora es configurable (porcentaje o monto,
 *    días de gracia, tope y dónde se emite); el prototipo lo fijaba en 5 %.
 *    Una secuencia sin etapas advierte «no se enviarán avisos» y quitar la
 *    etapa de suspensión pide confirmación reforzada.
 *  - M-HLP: los valores iniciales del SLA del kit (crítica 1 h/4 h, alta
 *    4 h/1 día, media 8 h/3 días, baja 1 día/5 días) difieren de los del
 *    prototipo; se ofrecen con «Cargar valores iniciales del kit». La solución
 *    no puede ser menor que la primera respuesta (422 en la especificación).
 *    Solo el administrador edita el SLA; finanzas edita la cobranza.
 */
import { useApp } from '../../app/context';
import { useViewState } from '../../app/storage';
import { Icon } from '../../components/Icon';
import { EmptyState, Note, PageHead, PrioChip, Switch } from '../../components/ui';
import { ACTS, CHS, DIAS, SEQ, SEV, SLA, TODAY, actSev, addD, fD, fTk, fromIso, moneyRaw, slaLeft, type Cur, type SeqStep, type Sev } from '../../data';

/* ---------- Recargo por mora (M-BIL; valores de ejemplo a confirmar) ---------- */
interface MoraCfg {
  on: boolean;
  tipo: 'pct' | 'monto';
  valor: number;
  gracia: number;
  tope: number;
  en: 'Nota de débito' | 'Siguiente factura';
}
const MORA: MoraCfg = { on: true, tipo: 'pct', valor: 5, gracia: 1, tope: 50, en: 'Nota de débito' };
/** Valores iniciales del SLA según M-HLP (primera respuesta en min, solución en h). */
const SLA_KIT: Record<Sev, { fr: number; res: number }> = { critica: { fr: 60, res: 4 }, alta: { fr: 240, res: 24 }, media: { fr: 480, res: 72 }, baja: { fr: 1440, res: 120 } };
const SEVS = Object.keys(SLA) as Sev[];

const relOf = (s: SeqStep) => (s.off < 0 ? 'antes' : s.off === 0 ? 'dia' : 'despues');
const when = (s: SeqStep) => (s.off < 0 ? -s.off + ' días antes' : s.off === 0 ? 'Día del vencimiento' : s.off + ' días después');
const moraAmt = (amt: number) => {
  if (!MORA.on) return 0;
  const v = MORA.tipo === 'pct' ? (amt * MORA.valor) / 100 : MORA.valor;
  return Math.min(v, (amt * MORA.tope) / 100);
};

interface Sim {
  due: string;
  amt: string;
  cur: Cur;
}

function Simulator({ sim }: { sim: Sim }) {
  const due = sim.due ? fromIso(sim.due) : TODAY;
  const amt = +sim.amt || 0;
  const st = SEQ.slice().sort((a, b) => a.off - b.off);
  if (!st.length) return <EmptyState title="Secuencia vacía" text="Agregue al menos una etapa." />;
  const graceDay = Math.max(1, MORA.gracia);
  return (
    <>
      <ol className="tl">
        {st.map((s, i) => {
          const d = addD(due, s.off);
          const k = actSev(s.act);
          return (
            <li key={i}>
              <span className={`nd ${k === 'danger' ? 'bad' : k === 'warn' ? 'now' : ''}`} />
              <div className="w">
                <b>{s.act}</b>
                <span>
                  {DIAS[d.getDay()].slice(0, 3)} {fD(d)}
                </span>
              </div>
              <small>
                {when(s)} · {s.ch}
                {/débito/.test(s.act)
                  ? MORA.on
                    ? ` · recargo ${MORA.tipo === 'pct' ? MORA.valor + ' %' : moneyRaw(MORA.valor, sim.cur)}: ${moneyRaw(moraAmt(amt), sim.cur)}${s.off < graceDay ? ` · se emite tras ${graceDay} ${graceDay === 1 ? 'día' : 'días'} de gracia` : ''}`
                    : ' · recargo por mora desactivado'
                  : ''}
                {/Suspender/.test(s.act) ? ' · se pausa si hay compromiso' : ''}
              </small>
            </li>
          );
        })}
      </ol>
      <Note style={{ marginTop: 6 }}>
        {st.length} etapas · primer contacto {fD(addD(due, st[0].off))} · última acción {fD(addD(due, st[st.length - 1].off))}. Monto simulado {moneyRaw(amt, sim.cur)}.
      </Note>
    </>
  );
}

export default function AjustesView() {
  const { role, brand, toast, refresh, dialogs } = useApp();
  const [sim, setSim] = useViewState<Sim>('aj.sim', { due: '2026-11-15', amt: '349', cur: 'PEN' });
  const canSla = role === 'Administrador';
  const canDun = role === 'Administrador' || role === 'Finanzas';
  const tks = fTk(brand).filter((t) => t.status !== 'Resuelto');
  const slaBad = SEVS.filter((k) => SLA[k].res * 60 < SLA[k].fr);

  const setStep = (s: SeqStep, f: 'n' | 'rel' | 'act' | 'ch', v: string) => {
    if (f === 'act' || f === 'ch') s[f] = v;
    else {
      let n = Math.max(0, Math.min(120, f === 'n' ? Math.round(+v || 0) : Math.abs(s.off)));
      const rel = f === 'rel' ? v : relOf(s);
      if (f === 'rel' && rel !== 'dia' && n === 0) n = 1;
      s.off = rel === 'antes' ? -n : rel === 'dia' ? 0 : n;
    }
    refresh();
  };
  const addStep = () => {
    SEQ.push({ off: 5, act: 'Escalar a ejecutivo', ch: 'Llamada' });
    refresh();
    toast('Etapa agregada', 'Ajuste el momento, la acción y el canal.', 'info');
    window.setTimeout(() => {
      const l = document.querySelectorAll<HTMLInputElement>('#seqRows .seq-row input');
      l[l.length - 1]?.focus();
    }, 0);
  };
  const delStep = (k: number) => {
    const s = SEQ[k];
    const susp = /Suspender/.test(s.act);
    const left = SEQ.filter((x, i) => i !== k && /Suspender/.test(x.act)).length;
    dialogs.confirm({
      title: 'Quitar etapa',
      body: (
        <>
          <p style={{ margin: 0 }}>
            ¿Quitar la etapa «{s.act}» ({s.off < 0 ? -s.off + ' días antes' : s.off === 0 ? 'día del vencimiento' : s.off + ' días después'})?
          </p>
          {susp && !left ? (
            <Note kind="warn" icon="tri">
              Es la única etapa de suspensión: los servicios con deuda dejarán de suspenderse automáticamente.
            </Note>
          ) : null}
          {SEQ.length === 1 ? (
            <Note kind="warn" icon="tri">
              La secuencia quedará vacía: no se enviarán avisos.
            </Note>
          ) : null}
        </>
      ),
      okLabel: 'Quitar',
      danger: true,
      onOk: () => {
        SEQ.splice(k, 1);
        toast('Etapa quitada', '', 'warn');
        refresh();
      },
    });
  };
  const setSla = (k: Sev, f: 'fr' | 'res' | 'h' | 'esc', v: string) => {
    if (f === 'fr' || f === 'res') SLA[k][f] = Math.max(1, Math.round(+v) || 1);
    else SLA[k][f] = v;
    refresh();
  };
  const loadKit = () =>
    dialogs.confirm({
      title: 'Cargar valores iniciales del kit',
      body: (
        <>
          <p style={{ margin: 0 }}>Se reemplazarán los tiempos de primera respuesta y solución por los valores iniciales de la especificación (M-HLP):</p>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13 }}>
            <li>Crítica: 1 h / 4 h</li>
            <li>Alta: 4 h / 1 día</li>
            <li>Media: 8 h / 3 días</li>
            <li>Baja: 1 día / 5 días</li>
          </ul>
          <p style={{ margin: '8px 0 0', fontSize: 12.5, color: 'var(--muted)' }}>Deben confirmarse con gerencia antes de la puesta en marcha.</p>
        </>
      ),
      okLabel: 'Cargar valores',
      onOk: () => {
        SEVS.forEach((k) => Object.assign(SLA[k], SLA_KIT[k]));
        toast('Valores iniciales cargados', 'Recuerde guardar los cambios.', 'info');
        refresh();
      },
    });
  const save = () => {
    if (slaBad.length) {
      toast('SLA inválido', `En ${slaBad.map((k) => SEV[k].l).join(', ')} la solución es menor que la primera respuesta.`, 'err');
      return;
    }
    if (MORA.on && !(MORA.valor > 0)) {
      toast('Recargo por mora inválido', 'Ingrese un valor mayor que 0 o desactive el recargo.', 'err');
      return;
    }
    toast('Configuración guardada', `${SEQ.length} etapas de cobranza · SLA actualizado`);
  };
  const setMora = (p: Partial<MoraCfg>) => {
    Object.assign(MORA, p);
    refresh();
  };

  return (
    <>
      <PageHead
        crumbs={[['Configuración', 'ajustes'], ['Cobranza y SLA', 'ajustes']]}
        title="Cobranza y SLA"
        sub="Secuencia de avisos de cobranza y acuerdos de nivel de servicio."
        actions={
          <button type="button" className="btn primary" onClick={save}>
            <Icon name="check" size="sm" />
            Guardar cambios
          </button>
        }
      />
      {!canDun ? (
        <Note kind="warn" icon="lock" style={{ marginBottom: 16 }}>
          El rol {role} solo puede consultar estos ajustes.
        </Note>
      ) : null}
      <div className="split side-wide" style={{ marginBottom: 16 }}>
        <section className="card" aria-labelledby="hSeqE">
          <div className="card-h">
            <h2 className="sec" id="hSeqE">
              Secuencia de avisos de cobranza
            </h2>
            <button type="button" className="btn sm" onClick={addStep} disabled={!canDun}>
              <Icon name="plus" size="sm" />
              Agregar etapa
            </button>
          </div>
          <div className="card-b">
            {!SEQ.length ? (
              <Note kind="warn" icon="tri">
                La secuencia no tiene etapas: no se enviarán avisos.
              </Note>
            ) : null}
            <div id="seqRows">
              {SEQ.map((s, k) => {
                const rel = relOf(s);
                return (
                  <div className="seq-row" role="group" aria-label={`Etapa ${k + 1}`} key={k}>
                    <input className="input n" type="number" min={0} max={120} value={Math.abs(s.off)} onChange={(e) => setStep(s, 'n', e.target.value)} aria-label="Días" disabled={rel === 'dia' || !canDun} />
                    <select className="select" value={rel} onChange={(e) => setStep(s, 'rel', e.target.value)} aria-label="Momento" disabled={!canDun}>
                      <option value="antes">días antes del venc.</option>
                      <option value="dia">el día del venc.</option>
                      <option value="despues">días después del venc.</option>
                    </select>
                    <select className="select act" value={s.act} onChange={(e) => setStep(s, 'act', e.target.value)} aria-label="Acción" disabled={!canDun}>
                      {ACTS.map((a) => (
                        <option key={a}>{a}</option>
                      ))}
                    </select>
                    <select className="select chn" value={s.ch} onChange={(e) => setStep(s, 'ch', e.target.value)} aria-label="Canal" disabled={!canDun}>
                      {CHS.map((a) => (
                        <option key={a}>{a}</option>
                      ))}
                    </select>
                    <button type="button" className="btn sm icon" onClick={() => delStep(k)} aria-label={`Quitar etapa ${k + 1}`} title="Quitar etapa" disabled={!canDun}>
                      <Icon name="trash" size="sm" />
                    </button>
                  </div>
                );
              })}
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '10px 0 0' }}>
              Las etapas se ordenan por momento al ejecutarse. Las suspensiones y recargos se pausan automáticamente si existe un compromiso de pago vigente.
            </p>
          </div>
          <div className="card-h" style={{ borderTop: '1px solid var(--border)' }}>
            <h2 className="sec">Recargo por mora</h2>
            <span className="sub">se aplica en la etapa «Emitir nota de débito por mora»</span>
          </div>
          <div className="card-b">
            <div className="form-grid">
              <div className="field full">
                <Switch checked={MORA.on} onChange={(v) => setMora({ on: v })} disabled={!canDun}>
                  Cobrar recargo por mora
                </Switch>
              </div>
              {MORA.on ? (
                <>
                  <label className="field" htmlFor="mrTipo">
                    Tipo
                    <select id="mrTipo" className="select" value={MORA.tipo} onChange={(e) => setMora({ tipo: e.target.value as MoraCfg['tipo'] })} disabled={!canDun}>
                      <option value="pct">Porcentaje del saldo</option>
                      <option value="monto">Monto fijo</option>
                    </select>
                  </label>
                  <label className="field" htmlFor="mrVal">
                    {MORA.tipo === 'pct' ? 'Porcentaje (%)' : 'Monto (moneda del comprobante)'}
                    <input id="mrVal" className="input" type="number" min={0} step="0.5" value={MORA.valor} onChange={(e) => setMora({ valor: Math.max(0, +e.target.value || 0) })} disabled={!canDun} />
                  </label>
                  <label className="field" htmlFor="mrGr">
                    Días de gracia
                    <input id="mrGr" className="input" type="number" min={0} max={60} value={MORA.gracia} onChange={(e) => setMora({ gracia: Math.max(0, Math.min(60, Math.round(+e.target.value) || 0)) })} disabled={!canDun} />
                  </label>
                  <label className="field" htmlFor="mrTope">
                    Tope (% del saldo)
                    <input id="mrTope" className="input" type="number" min={1} max={100} value={MORA.tope} onChange={(e) => setMora({ tope: Math.max(1, Math.min(100, Math.round(+e.target.value) || 1)) })} disabled={!canDun} />
                  </label>
                  <label className="field full" htmlFor="mrEn">
                    Se emite en
                    <select id="mrEn" className="select" value={MORA.en} onChange={(e) => setMora({ en: e.target.value as MoraCfg['en'] })} disabled={!canDun}>
                      <option>Nota de débito</option>
                      <option>Siguiente factura</option>
                    </select>
                  </label>
                </>
              ) : null}
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '10px 0 0' }}>Puede desactivarse por cliente o contrato. Valores iniciales de ejemplo: deben confirmarse con gerencia antes de la puesta en marcha.</p>
          </div>
        </section>
        <aside className="card" aria-labelledby="hSim">
          <div className="card-h">
            <h2 className="sec" id="hSim">
              Simulador
            </h2>
            <span className="sub">se actualiza en vivo</span>
          </div>
          <div className="card-b" style={{ display: 'grid', gap: 12 }}>
            <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <label className="field full" htmlFor="simDue">
                Fecha de vencimiento
                <input id="simDue" className="input" type="date" value={sim.due} onChange={(e) => setSim({ ...sim, due: e.target.value })} />
              </label>
              <label className="field" htmlFor="simAmt">
                Monto
                <input id="simAmt" className="input" type="number" min={0} step="0.01" value={sim.amt} onChange={(e) => setSim({ ...sim, amt: e.target.value })} />
              </label>
              <label className="field" htmlFor="simCur">
                Moneda
                <select id="simCur" className="select" value={sim.cur} onChange={(e) => setSim({ ...sim, cur: e.target.value as Cur })}>
                  <option value="PEN">S/</option>
                  <option value="USD">US$</option>
                </select>
              </label>
            </div>
            <div aria-live="polite">
              <Simulator sim={sim} />
            </div>
          </div>
        </aside>
      </div>
      <section className="card" aria-labelledby="hSla">
        <div className="card-h">
          <h2 className="sec" id="hSla">
            SLA de tickets por prioridad
          </h2>
          <span className="sub">los cambios recalculan el SLA restante de los tickets abiertos</span>
          {canSla ? (
            <button type="button" className="btn sm" onClick={loadKit}>
              <Icon name="refresh" size="sm" />
              Cargar valores iniciales del kit
            </button>
          ) : null}
        </div>
        {!canSla ? (
          <div className="card-b" style={{ paddingBottom: 0 }}>
            <Note icon="lock">Solo el administrador puede editar el SLA.</Note>
          </div>
        ) : null}
        {slaBad.length ? (
          <div className="card-b" style={{ paddingBottom: 0 }}>
            <Note kind="warn" icon="tri" role="alert">
              La solución no puede ser menor que la primera respuesta ({slaBad.map((k) => SEV[k].l).join(', ')}).
            </Note>
          </div>
        ) : null}
        <div className="tw">
          <table className="t">
            <thead>
              <tr>
                <th>Prioridad</th>
                <th>Primera respuesta (min)</th>
                <th>Resolución (horas)</th>
                <th>Horario</th>
                <th>Escalar a</th>
                <th className="r">Tickets abiertos</th>
              </tr>
            </thead>
            <tbody>
              {SEVS.map((k) => {
                const v = SLA[k];
                const open = tks.filter((t) => t.prio === k);
                const out = open.filter((t) => slaLeft(t) < 0).length;
                const bad = slaBad.includes(k);
                return (
                  <tr key={k}>
                    <td>
                      <PrioChip p={k} />
                    </td>
                    <td>
                      <input className="input" style={{ width: 110 }} type="number" min={5} value={v.fr} onChange={(e) => setSla(k, 'fr', e.target.value)} aria-label={`Primera respuesta ${SEV[k].l}`} disabled={!canSla} />
                    </td>
                    <td>
                      <input
                        className="input"
                        style={{ width: 110 }}
                        type="number"
                        min={1}
                        value={v.res}
                        onChange={(e) => setSla(k, 'res', e.target.value)}
                        aria-label={`Resolución ${SEV[k].l}`}
                        aria-invalid={bad}
                        disabled={!canSla}
                      />
                    </td>
                    <td>
                      <select className="select" style={{ width: 150 }} value={v.h} onChange={(e) => setSla(k, 'h', e.target.value)} aria-label={`Horario ${SEV[k].l}`} disabled={!canSla}>
                        <option value="24/7">24/7</option>
                        <option value="Hábil">Hábil (L–V 9–18)</option>
                      </select>
                    </td>
                    <td>
                      <input className="input" style={{ width: 180 }} value={v.esc} onChange={(e) => setSla(k, 'esc', e.target.value)} aria-label={`Escalamiento ${SEV[k].l}`} disabled={!canSla} />
                    </td>
                    <td className="r num">
                      {open.length} <span className="sub">({out} fuera)</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
