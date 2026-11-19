import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { isProblem, type TicketMessageChannel, type TicketPriority, type TicketStatus } from '@hub/api';
import { hub } from '../../../auth/client';
import { useApp } from '../../../app/context';
import { href } from '../../../app/routeMeta';
import { Icon } from '../../../components/Icon';
import { Chip, type ChipKind, Note, Skeleton } from '../../../components/ui';
import { errorText, useCan, useLoad } from '../clientes/shared';
import { supportApi } from './api';

const STATUSES: [TicketStatus, string][] = [['new', 'Nuevo'], ['open', 'Abierto'], ['in_progress', 'En progreso'], ['waiting_customer', 'Esperando cliente'], ['waiting_provider', 'Esperando proveedor'], ['escalated', 'Escalado'], ['resolved', 'Resuelto'], ['closed', 'Cerrado'], ['reopened', 'Reabierto']];
const NEXT: Record<TicketStatus, TicketStatus[]> = {
  new: ['open', 'in_progress'], open: ['in_progress', 'waiting_customer', 'waiting_provider', 'escalated', 'resolved'],
  in_progress: ['waiting_customer', 'waiting_provider', 'escalated', 'resolved'], waiting_customer: ['in_progress', 'resolved'],
  waiting_provider: ['in_progress', 'resolved'], escalated: ['in_progress', 'resolved'], resolved: ['closed', 'reopened'],
  closed: ['reopened'], reopened: ['open', 'in_progress'],
};
const PRIORITY: Record<TicketPriority, string> = { critical: 'Crítica', high: 'Alta', medium: 'Media', low: 'Baja' };
const prioKind = (p: TicketPriority): ChipKind => (p === 'critical' ? 'danger' : p === 'high' ? 'warn' : p === 'medium' ? 'info' : 'neutral');
const statusLabel = (s: TicketStatus) => STATUSES.find(([v]) => v === s)?.[1] ?? s;
const fmt = (s: string) => new Date(s).toLocaleString();
const fmtDue = (s: string | null) => (s ? new Date(s).toLocaleString() : null);
const fileSize = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

export default function TicketDetail({ id }: { id: string }) {
  const { navigate, toast } = useApp();
  const can = useCan();
  const detail = useLoad(() => supportApi.tickets.get(id), [id]);
  const [body, setBody] = useState('');
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const write = can('helpdesk.ticket.update');
  const messageWrite = can('helpdesk.ticket_message.create');
  const fileWrite = can('identity.file.create');
  const fileDelete = can('identity.file.delete');

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
  const upload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; const t = detail.data;
    e.target.value = '';
    if (!file || !t) return;
    setUploading(true);
    try { await hub.files.upload(file, { attachable_type: 'ticket', attachable_id: t.id }); toast('Adjunto subido', file.name); detail.reload(); }
    catch (err) { toast(isProblem(err) && err.status === 422 ? 'Archivo no permitido' : 'No se pudo subir el adjunto', errorText(err), 'err'); }
    finally { setUploading(false); }
  };
  const openFile = async (fileId: string) => {
    try { const f = await hub.files.get(fileId); if (f.url) window.open(f.url, '_blank', 'noopener'); else toast('El adjunto no está disponible', '', 'err'); }
    catch (err) { toast('No se pudo abrir el adjunto', errorText(err), 'err'); }
  };
  const removeFile = async (fileId: string, version: number) => {
    if (!window.confirm('¿Eliminar este adjunto? Esta acción no se puede deshacer.')) return;
    try { await hub.files.remove(fileId, version); toast('Adjunto eliminado', '', 'warn'); detail.reload(); }
    catch (err) { toast('No se pudo eliminar el adjunto', errorText(err), 'err'); detail.reload(); }
  };

  const t = detail.data;
  return <>
    <div className="phead">
      <div>
        <button className="btn sm ghost" type="button" onClick={() => navigate('tickets')} style={{ marginBottom: 6 }}><Icon name="cl" size="sm" /> Volver a la bandeja</button>
        <h1 tabIndex={-1}>{t?.subject ?? 'Detalle del ticket'}</h1>
        {t ? <p><span className="mono">{t.number}</span> · {t.type} · {t.channel} · abierto {fmt(t.created_at)}</p> : null}
      </div>
      {t ? <div className="acts"><Chip kind={prioKind(t.priority)}>{PRIORITY[t.priority]}</Chip><Chip kind="outline">{statusLabel(t.status)}</Chip></div> : null}
    </div>
    {detail.error ? <Note kind="warn" role="alert">No se pudo cargar el ticket: {errorText(detail.error)} <button className="btn sm" type="button" onClick={detail.reload}>Reintentar</button></Note>
      : detail.loading || !t ? <Skeleton variant="table" rows={5} /> : <div className="tk-detail">
        <section className="card">
          <div className="card-b" style={{ paddingTop: 16 }}>
            <ol className="thread" aria-label="Mensajes del ticket">{(t.messages ?? []).map((m) => {
              const kind = m.is_internal ? 'nota' : m.author_type === 'staff' ? 'agente' : 'cliente';
              return <li key={m.id} className={`msg ${kind}`}>
                <div className="mh"><span className="av"><Icon name={m.is_internal ? 'lock' : kind === 'cliente' ? 'user' : 'msg'} size="sm" /></span><b>{m.author_name ?? (kind === 'agente' ? 'Equipo de soporte' : 'Cliente')}</b><span>{kind === 'nota' ? 'Nota interna · no visible para el cliente' : kind === 'cliente' ? 'Cliente' : 'Agente'}</span><time>{fmt(m.created_at)}</time></div>
                <p>{m.body}</p>
              </li>;
            })}</ol>
            {!t.messages?.length ? <div className="sub">Todavía no hay mensajes.</div> : null}
          </div>
          {messageWrite ? <div className="composer">
            <div className="seg" role="group" aria-label="Tipo de mensaje">
              <button type="button" aria-pressed={!internal} onClick={() => setInternal(false)}><Icon name="send" size="sm" /> Responder al cliente</button>
              <button type="button" aria-pressed={internal} onClick={() => setInternal(true)}><Icon name="lock" size="sm" /> Nota interna</button>
            </div>
            <form onSubmit={send} style={{ display: 'grid', gap: 10 }}>
              <label className="field">{internal ? 'Nota visible solo para el equipo' : 'Respuesta para el cliente'}<textarea className={`textarea${internal ? ' rte-note' : ''}`} required rows={5} value={body} onChange={(e) => setBody(e.target.value)} placeholder={internal ? 'Nota interna…' : 'Escriba la respuesta para el cliente…'} /></label>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}><button className="btn primary" disabled={busy || !body.trim()}><Icon name={internal ? 'lock' : 'send'} size="sm" /> {busy ? 'Enviando…' : internal ? 'Guardar nota' : 'Enviar respuesta'}</button></div>
            </form>
          </div> : null}
        </section>
        <aside className="stack">
          <section className="card"><div className="card-b" style={{ paddingTop: 14, display: 'grid', gap: 12 }}>
            <label className="field">Estado{write ? <select className="select" value={t.status} onChange={(e) => void changeStatus(e.target.value as TicketStatus)}><option value={t.status}>{statusLabel(t.status)}</option>{NEXT[t.status].map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}</select> : <div>{statusLabel(t.status)}</div>}</label>
            <div className="field">Prioridad<div>{PRIORITY[t.priority]}</div></div>
            <div className="field">Agente asignado<div>{t.assignee?.name ?? 'Sin asignar'}</div></div>
            <div className="field">Cliente<div>{t.customer ? <a className="rowlink" href={href('cliente', t.customer.id)}>{t.customer.name}</a> : 'Sin cliente asociado'}</div></div>
            {t.department || t.category ? <div className="field">Clasificación<div className="sub">{[t.department, t.category].filter(Boolean).join(' · ') || '—'}</div></div> : null}
          </div></section>
          <section className="card"><div className="card-h"><h2 className="sec">SLA</h2>{t.sla_breached ? <Chip kind="danger">Incumplido</Chip> : null}</div><div className="card-b" style={{ display: 'grid', gap: 10 }}>
            <div><small className="sub">Primera respuesta</small><div>{t.first_responded_at ? <Chip kind="ok" icon="check">Cumplida</Chip> : fmtDue(t.first_response_due_at) ? <Chip kind="warn" icon="clock">Vence {fmtDue(t.first_response_due_at)}</Chip> : <span className="sub">—</span>}</div></div>
            <div><small className="sub">Resolución</small><div>{t.resolved_at ? <Chip kind="ok" icon="check">Resuelto</Chip> : fmtDue(t.resolution_due_at) ? <Chip kind={t.sla_breached ? 'danger' : 'warn'} icon="clock">Vence {fmtDue(t.resolution_due_at)}</Chip> : <span className="sub">—</span>}</div></div>
          </div></section>
          <section className="card"><div className="card-h"><h2 className="sec">Adjuntos</h2>{fileWrite ? <>
            <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" style={{ display: 'none' }} onChange={(e) => void upload(e)} />
            <button className="btn sm" type="button" disabled={uploading} onClick={() => fileInput.current?.click()}><Icon name="upload" size="sm" /> {uploading ? 'Subiendo…' : 'Adjuntar'}</button>
          </> : null}</div>
          {(t.attachments ?? []).length ? <ul className="card-b" style={{ display: 'grid', gap: 8, listStyle: 'none', margin: 0 }}>{(t.attachments ?? []).map((f) => <li key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Icon name="file" size="sm" />
            <button type="button" className="rowlink" style={{ flex: '1 1 auto', textAlign: 'left', minWidth: 0 }} onClick={() => void openFile(f.id)}>{f.original_name}</button>
            <span className="sub">{fileSize(f.size_bytes)}</span>
            {f.scan_status === 'infected' ? <Chip kind="danger">Infectado</Chip> : f.scan_status === 'pending' ? <Chip kind="outline">Sin escanear</Chip> : null}
            {fileDelete ? <button className="btn sm ghost" type="button" onClick={() => void removeFile(f.id, f.version)} aria-label={`Eliminar ${f.original_name}`}><Icon name="trash" size="sm" /></button> : null}
          </li>)}</ul> : <div className="card-b sub">Sin archivos. Imágenes (JPG, PNG, WEBP) y PDF, hasta 10 MB.</div>}
          </section>
        </aside>
      </div>}
  </>;
}
