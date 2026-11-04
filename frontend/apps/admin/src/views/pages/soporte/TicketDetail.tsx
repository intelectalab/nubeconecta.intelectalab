import { useState, type FormEvent } from 'react';
import { isProblem, type TicketMessageChannel, type TicketStatus } from '@hub/api';
import { useApp } from '../../../app/context';
import { Icon } from '../../../components/Icon';
import { Chip, Note, Skeleton } from '../../../components/ui';
import { errorText, useCan, useLoad } from '../clientes/shared';
import { supportApi } from './api';

const STATUSES: [TicketStatus, string][] = [['new', 'Nuevo'], ['open', 'Abierto'], ['in_progress', 'En progreso'], ['waiting_customer', 'Esperando cliente'], ['waiting_provider', 'Esperando proveedor'], ['escalated', 'Escalado'], ['resolved', 'Resuelto'], ['closed', 'Cerrado'], ['reopened', 'Reabierto']];
const NEXT: Record<TicketStatus, TicketStatus[]> = {
  new: ['open', 'in_progress'], open: ['in_progress', 'waiting_customer', 'waiting_provider', 'escalated', 'resolved'],
  in_progress: ['waiting_customer', 'waiting_provider', 'escalated', 'resolved'], waiting_customer: ['in_progress', 'resolved'],
  waiting_provider: ['in_progress', 'resolved'], escalated: ['in_progress', 'resolved'], resolved: ['closed', 'reopened'],
  closed: ['reopened'], reopened: ['open', 'in_progress'],
};
const statusLabel = (s: TicketStatus) => STATUSES.find(([v]) => v === s)?.[1] ?? s;
const fmt = (s: string) => new Date(s).toLocaleString();

export default function TicketDetail({ id }: { id: string }) {
  const { navigate, toast } = useApp();
  const can = useCan();
  const detail = useLoad(() => supportApi.tickets.get(id), [id]);
  const [body, setBody] = useState('');
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);
  const write = can('helpdesk.ticket.update');
  const messageWrite = can('helpdesk.ticket_message.create');

  const changeStatus = async (status: TicketStatus) => {
    const t = detail.data;
    if (!t || status === t.status) return;
    try { await supportApi.tickets.update(t.id, t.version, { status }); toast('Estado actualizado', statusLabel(status)); detail.reload(); }
    catch (e) { toast(isProblem(e) && e.status === 422 ? 'Revise los campos' : 'No se pudo actualizar', errorText(e), 'err'); detail.reload(); }
  };
  const send = async (e: FormEvent) => {
    e.preventDefault(); const t = detail.data; if (!t || !body.trim()) return;
    setBusy(true);
    try {
      const channel: TicketMessageChannel = internal ? 'internal' : 'email';
      await supportApi.messages.add(t.id, { body: body.trim(), channel, is_internal: internal });
      setBody(''); toast(internal ? 'Nota interna guardada' : 'Respuesta enviada'); detail.reload();
    } catch (err) { toast(isProblem(err) && err.status === 422 ? 'Revise los campos' : 'No se pudo enviar el mensaje', errorText(err), 'err'); if (isProblem(err) && err.status === 409) detail.reload(); }
    finally { setBusy(false); }
  };

  return <>
    <div className="phead"><div><button className="btn sm ghost" type="button" onClick={() => navigate('tickets')}><Icon name="cl" size="sm" /> Volver a tickets</button>
      <h1>{detail.data?.subject ?? 'Detalle del ticket'}</h1>{detail.data ? <p><span className="mono">{detail.data.number}</span> · {detail.data.type} · {detail.data.channel} · {fmt(detail.data.created_at)}</p> : null}</div></div>
    {detail.error ? <Note kind="warn" role="alert">No se pudo cargar el ticket: {errorText(detail.error)} <button className="btn sm" type="button" onClick={detail.reload}>Reintentar</button></Note>
      : detail.loading || !detail.data ? <Skeleton variant="table" rows={5} /> : <>
        <section className="card" style={{ marginBottom: 16 }}>
          <div className="card-h"><h2 className="sec">Conversación</h2><Chip>{statusLabel(detail.data.status)}</Chip></div>
          <ol className="thread" aria-label="Mensajes del ticket">{(detail.data.messages ?? []).map((m) => <li key={m.id} className={`msg ${m.is_internal ? 'nota' : m.author_type === 'staff' ? 'agente' : 'cliente'}`}>
            <div className="mh"><span className="av"><Icon name={m.is_internal ? 'lock' : 'msg'} size="sm" /></span><b>{m.author_type === 'staff' ? 'Equipo de soporte' : 'Cliente'}</b><span>{m.is_internal ? 'Nota interna' : m.channel}</span><time>{fmt(m.created_at)}</time></div><p>{m.body}</p>
          </li>)}</ol>
          {!detail.data.messages?.length ? <div className="card-b sub">Todavía no hay mensajes.</div> : null}
          {messageWrite ? <form className="composer" onSubmit={send}><label className="field">{internal ? 'Nota interna' : 'Respuesta al cliente'}<textarea className="textarea" required rows={5} value={body} onChange={(e) => setBody(e.target.value)} /></label>
            <label className="check"><input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} /> Nota interna</label>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}><button className="btn primary" disabled={busy || !body.trim()}><Icon name="send" size="sm" /> {busy ? 'Enviando…' : 'Enviar'}</button></div>
          </form> : null}
        </section>
        <section className="card"><div className="card-h"><h2 className="sec">Detalles</h2></div><div className="card-b" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          <div><small className="sub">Estado</small><div>{write ? <select className="select" value={detail.data.status} onChange={(e) => void changeStatus(e.target.value as TicketStatus)}><option value={detail.data.status}>{statusLabel(detail.data.status)}</option>{NEXT[detail.data.status].map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}</select> : statusLabel(detail.data.status)}</div></div>
          <div><small className="sub">Prioridad</small><div>{detail.data.priority}</div></div><div><small className="sub">Asignado a</small><div>{detail.data.assignee_id ?? 'Sin asignar'}</div></div>
          <div><small className="sub">Cliente</small><div>{detail.data.customer_id ?? 'Sin cliente asociado'}</div></div><div><small className="sub">Departamento</small><div>{detail.data.department ?? '—'}</div></div><div><small className="sub">Categoría</small><div>{detail.data.category ?? '—'}</div></div>
        </div></section>
      </>}
  </>;
}
