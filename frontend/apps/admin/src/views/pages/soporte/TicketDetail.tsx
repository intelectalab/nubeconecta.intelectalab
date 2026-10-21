/**
 * Detalle de ticket (prototipo tkDetailView l.2586 + respuesta enriquecida l.3138):
 * hilo de conversación, compositor (respuesta al cliente / nota interna) con
 * respuestas predefinidas y adjuntos, estado/prioridad/agente, SLA, vínculos y tareas.
 */
import { useRef, useState } from 'react';
import { useApp } from '../../../app/context';
import { Icon } from '../../../components/Icon';
import { Chip, Crumbs, PrioChip, SlaBar } from '../../../components/ui';
import { AGENTS, CBY, ME, NOW, SEV, SLA, TASKS, TODAY, TST, addD, diffD, fD, fT, fmtMin, fromIso, iso, tkConv, type Sev, type Ticket, type TicketStatus } from '../../../data';
import { RichText, html2txt, sanitize, type RteHandle } from './RichText';
import { CANNED, cannedHtml, type MsgX } from './shared';

type Compose = 'reply' | 'nota';
const FLD: Record<'status' | 'prio' | 'agent', string> = { status: 'estado', prio: 'prioridad', agent: 'agente' };
const FLDU: Record<'status' | 'prio' | 'agent', string> = { status: 'Estado', prio: 'Prioridad', agent: 'Agente' };
/** Borradores del compositor por ticket (S.tkDraft del prototipo): sobreviven al salir y volver al ticket. */
const DRAFTS = new Map<string, string>();

export default function TicketDetail({ t }: { t: Ticket }) {
  const { navigate, href, toast, refresh, dialogs } = useApp();
  const ed = useRef<RteHandle>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [compose, setCompose] = useState<Compose>('reply');
  const [att, setAtt] = useState<string[]>([]);
  const [after, setAfter] = useState('');
  const c = CBY[t.cid];
  const m = tkConv(t) as MsgX[];
  const firstAg = m.find((x) => x.k === 'agente');
  const frLeft = SLA[t.prio].fr - (firstAg ? (firstAg.at.getTime() - t.created.getTime()) / 60000 : (NOW.getTime() - t.created.getTime()) / 60000);
  const linkOpts: [string, string][] = [...c.services.map((s) => ['s:' + s.id, `${s.t} — ${s.plan}`] as [string, string]), ...c.domains.map((d) => ['d:' + d.id, d.d] as [string, string])];
  const links = t.links || [];
  const tasks = TASKS.filter((x) => x.orig === t.id);

  const back = () => navigate('tickets');

  const send = () => {
    const h = ed.current?.get() || '';
    const txt = html2txt(h);
    if (txt.length < 3) {
      toast('Escriba un mensaje', '', 'err');
      ed.current?.focus();
      return;
    }
    const msg: MsgX = { k: compose === 'reply' ? 'agente' : 'nota', a: ME, at: new Date(), txt, html: h, att: att.slice() };
    m.push(msg);
    if (compose === 'reply') {
      if (t.status === 'Nuevo') t.status = 'En progreso';
      if (after) t.status = after as TicketStatus;
      if (!t.agent) t.agent = ME;
    }
    toast(compose === 'reply' ? 'Respuesta enviada' : 'Nota interna guardada', `${t.id}${compose === 'reply' ? ' · notificado por correo' : ''}`);
    setAtt([]);
    setAfter('');
    ed.current?.set('');
    DRAFTS.delete(t.id);
    refresh();
  };

  const setField = (f: 'status' | 'prio' | 'agent', v: string) => {
    const old = f === 'prio' ? SEV[t.prio].l : (f === 'status' ? t.status : t.agent) || 'Sin asignar';
    if (f === 'status') t.status = v as TicketStatus;
    else if (f === 'prio') t.prio = v as Sev;
    else t.agent = v || null;
    const now = f === 'prio' ? SEV[t.prio].l : v || 'Sin asignar';
    m.push({ k: 'nota', a: ME, at: new Date(), txt: `Cambio de ${FLD[f]}: ${old} → ${now}`, att: [] });
    toast('Ticket actualizado', `${FLDU[f]}: ${now}`);
    refresh();
  };

  const toggleLink = (k: string, label: string, on: boolean) => {
    t.links = on ? [...links, k] : links.filter((x) => x !== k);
    toast(on ? 'Vinculado al ticket' : 'Vínculo quitado', label, 'info');
    refresh();
  };

  const newTask = () =>
    dialogs.form({
      title: 'Crear tarea desde el ticket',
      sub: `${t.id} · ${t.sub}`,
      fields: [
        { id: 't', label: 'Título', req: true, full: true, value: `Seguimiento: ${t.sub}` },
        { id: 'w', label: 'Responsable', type: 'select', options: AGENTS, value: t.agent || AGENTS[0] },
        { id: 'd', label: 'Fecha límite', type: 'date', value: iso(addD(TODAY, 1)), req: true },
      ],
      submit: 'Crear tarea',
      validate: (v) => (diffD(fromIso(v.d), TODAY) < 0 ? 'La fecha no puede ser anterior a hoy.' : null),
      onSubmit: (v) => {
        TASKS.unshift({ id: 'TA-' + (200 + TASKS.length), t: v.t, cid: t.cid, orig: t.id, who: v.w, due: fromIso(v.d), col: 'Por hacer', prio: t.prio });
        toast('Tarea creada', `${v.t} · ${v.w} · ver en Tareas`);
        refresh();
      },
    });

  const onFiles = (files: FileList | null) => {
    if (!files) return;
    const add: string[] = [];
    Array.from(files).forEach((f) => {
      if (f.size > 10485760) toast('Archivo muy grande', `${f.name} supera 10 MB`, 'err');
      else add.push(f.name);
    });
    if (add.length) setAtt((a) => [...a, ...add]);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <>
      <Crumbs items={[['Soporte', 'tickets'], ['Tickets', 'tickets'], [t.id]]} />
      <div className="phead">
        <div>
          <button type="button" className="btn sm ghost" onClick={back} style={{ marginBottom: 6 }}>
            <Icon name="cl" size="sm" />
            Volver a la bandeja
          </button>
          <h1 tabIndex={-1} id="ph1">
            {t.sub}
          </h1>
          <p>
            <span className="mono">{t.id}</span> · <a href={href('cliente', c.id)}>{c.name}</a> · {t.ch} · abierto {fD(t.created)} {fT(t.created)}
          </p>
        </div>
        <div className="acts">
          <PrioChip p={t.prio} />
          <Chip kind="outline">{t.status}</Chip>
        </div>
      </div>
      <div className="tk-detail">
        <section className="card">
          <div className="card-b" style={{ paddingTop: 16 }}>
            <ol className="thread" aria-label="Conversación">
              {m.map((x, i) => (
                <li key={i} className={`msg ${x.k}`}>
                  <div className="mh">
                    <span className="av">
                      <Icon name={x.k === 'cliente' ? 'user' : x.k === 'nota' ? 'lock' : 'msg'} size="sm" />
                    </span>
                    <b>{x.a}</b>
                    <span>{x.k === 'cliente' ? 'Cliente' : x.k === 'nota' ? 'Nota interna · no visible para el cliente' : 'Agente'}</span>
                    <time>
                      {fD(x.at)} {fT(x.at)}
                    </time>
                  </div>
                  {x.html ? <div className="rt-out msg-b" dangerouslySetInnerHTML={{ __html: sanitize(x.html) }} /> : <p>{x.txt}</p>}
                  {x.att.length ? (
                    <div className="atts">
                      {x.att.map((a, j) => (
                        <span key={j} className="chip outline">
                          <Icon name="file" />
                          {a}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </li>
              ))}
            </ol>
          </div>
          <div className="composer">
            <div className="seg" role="group" aria-label="Tipo de mensaje">
              <button type="button" aria-pressed={compose === 'reply'} onClick={() => setCompose('reply')}>
                <Icon name="send" size="sm" />
                Responder al cliente
              </button>
              <button type="button" aria-pressed={compose === 'nota'} onClick={() => setCompose('nota')}>
                <Icon name="lock" size="sm" />
                Nota interna
              </button>
            </div>
            <div className="comp-tools">
              {compose === 'reply' ? (
                <select
                  className="select"
                  aria-label="Respuestas predefinidas"
                  style={{ width: 'auto' }}
                  value=""
                  onChange={(e) => {
                    if (e.target.value === '') return;
                    const cn = CANNED[+e.target.value];
                    if (cn) ed.current?.insert(cannedHtml(cn));
                  }}
                >
                  <option value="">Respuesta predefinida…</option>
                  {CANNED.map((x, k) => (
                    <option key={k} value={k}>
                      {x[0]}
                    </option>
                  ))}
                </select>
              ) : null}
              <label className="btn sm">
                <Icon name="upload" size="sm" />
                Adjuntar
                <input ref={fileRef} type="file" multiple className="sr-only" onChange={(e) => onFiles(e.target.files)} />
              </label>
            </div>
            <RichText
              ref={ed}
              initial={DRAFTS.get(t.id) || ''}
              onChange={(h) => {
                if (html2txt(h)) DRAFTS.set(t.id, h);
                else DRAFTS.delete(t.id);
              }}
              mini
              min={120}
              className={compose === 'nota' ? 'rte-note' : undefined}
              label={compose === 'reply' ? 'Respuesta para el cliente' : 'Nota interna'}
              ph={compose === 'reply' ? 'Escriba la respuesta para el cliente…' : 'Nota visible solo para el equipo…'}
            />
            <div className="atts">
              {att.map((a, k) => (
                <span key={k} className="chip outline">
                  <Icon name="file" />
                  {a}
                  <button type="button" className="x" aria-label={`Quitar ${a}`} onClick={() => setAtt(att.filter((_, j) => j !== k))}>
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              {compose === 'reply' ? (
                <select className="select" aria-label="Estado después de responder" style={{ width: 'auto' }} value={after} onChange={(e) => setAfter(e.target.value)}>
                  <option value="">Mantener estado</option>
                  <option>Esperando cliente</option>
                  <option>Resuelto</option>
                </select>
              ) : null}
              <button type="button" className="btn primary" onClick={send}>
                <Icon name={compose === 'reply' ? 'send' : 'lock'} size="sm" />
                {compose === 'reply' ? 'Enviar respuesta' : 'Guardar nota'}
              </button>
            </div>
          </div>
        </section>
        <aside className="stack">
          <section className="card">
            <div className="card-b" style={{ paddingTop: 14, display: 'grid', gap: 12 }}>
              <label className="field">
                Estado
                <select className="select" value={t.status} onChange={(e) => setField('status', e.target.value)}>
                  {TST.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                Prioridad
                <select className="select" value={t.prio} onChange={(e) => setField('prio', e.target.value)}>
                  {(Object.keys(SEV) as Sev[]).map((k) => (
                    <option key={k} value={k}>
                      {SEV[k].l}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Agente asignado
                <select className="select" value={t.agent || ''} onChange={(e) => setField('agent', e.target.value)}>
                  <option value="">Sin asignar</option>
                  {AGENTS.map((a) => (
                    <option key={a}>{a}</option>
                  ))}
                </select>
              </label>
            </div>
          </section>
          <section className="card">
            <div className="card-h">
              <h2 className="sec">SLA</h2>
              <span className="sub">{SLA[t.prio].h}</span>
            </div>
            <div className="card-b" style={{ display: 'grid', gap: 10 }}>
              <div>
                <small style={{ color: 'var(--muted)', fontSize: 12 }}>Primera respuesta ({SLA[t.prio].fr} min)</small>
                <div>
                  {firstAg ? (
                    <Chip kind="ok" icon="check">
                      Cumplida
                    </Chip>
                  ) : frLeft < 0 ? (
                    <Chip kind="danger" icon="oct">
                      Vencida hace {fmtMin(-frLeft)}
                    </Chip>
                  ) : (
                    <Chip kind="warn" icon="clock">
                      Quedan {fmtMin(frLeft)}
                    </Chip>
                  )}
                </div>
              </div>
              <div>
                <small style={{ color: 'var(--muted)', fontSize: 12 }}>Resolución ({SLA[t.prio].res} h)</small>
                <SlaBar t={t} />
              </div>
            </div>
          </section>
          <section className="card">
            <div className="card-h">
              <h2 className="sec">Vinculados</h2>
            </div>
            <div className="card-b" style={{ display: 'grid', gap: 6 }}>
              {linkOpts.length ? (
                linkOpts.map(([k, l]) => (
                  <label key={k} className="check">
                    <input type="checkbox" checked={links.includes(k)} onChange={(e) => toggleLink(k, l, e.target.checked)} />
                    {l}
                  </label>
                ))
              ) : (
                <span className="sub">El cliente no tiene servicios.</span>
              )}
            </div>
          </section>
          <section className="card">
            <div className="card-h">
              <h2 className="sec">Tareas</h2>
              <button type="button" className="btn sm" onClick={newTask}>
                <Icon name="plus" size="sm" />
                Crear tarea
              </button>
            </div>
            <ul className="rows">
              {tasks.length ? (
                tasks.map((x) => (
                  <li key={x.id}>
                    <span className="grow">
                      <b>{x.t}</b>
                      <small>
                        {x.who} · {fD(x.due)} · {x.col}
                      </small>
                    </span>
                  </li>
                ))
              ) : (
                <li className="sub" style={{ color: 'var(--muted)' }}>
                  Sin tareas vinculadas.
                </li>
              )}
            </ul>
          </section>
        </aside>
      </div>
    </>
  );
}
