import { useEffect, useState } from 'react';
import { isProblem, type Ticket, type TicketChannel, type TicketPriority, type TicketStatus, type TicketType } from '@hub/api';
import { useApp } from '../../app/context';
import { parseFilterParam } from '../../app/filterParam';
import type { ViewProps } from '../../app/routes';
import { Icon } from '../../components/Icon';
import { Chip, EmptyState, Note, PageHead, Select, Skeleton, Toolbar } from '../../components/ui';
import { errorText, useCan, useLoad } from './clientes/shared';
import { supportApi } from './soporte/api';
import TicketDetail from './soporte/TicketDetail';

const STATUS: [string, string][] = [['new', 'Nuevo'], ['open', 'Abierto'], ['in_progress', 'En progreso'], ['waiting_customer', 'Esperando cliente'], ['waiting_provider', 'Esperando proveedor'], ['escalated', 'Escalado'], ['resolved', 'Resuelto'], ['closed', 'Cerrado'], ['reopened', 'Reabierto']];
const PRIORITY: [string, string][] = [['critical', 'Crítica'], ['high', 'Alta'], ['medium', 'Media'], ['low', 'Baja']];
const CHANNEL: TicketChannel[] = ['email', 'portal', 'whatsapp', 'phone', 'internal', 'monitoring', 'assistant', 'web_form'];
const TYPES: TicketType[] = ['incident', 'request', 'question', 'billing', 'complaint', 'security'];
const label = (values: [string, string][], value: string) => values.find(([v]) => v === value)?.[1] ?? value;

export default function TicketsView({ param }: ViewProps) {
  return param && !param.startsWith('f~') ? <TicketDetail id={param} /> : <TicketInbox param={param} />;
}

function TicketInbox({ param }: { param?: string | null }) {
  const { toast, navigate } = useApp();
  const can = useCan();
  const [status, setStatus] = useState<TicketStatus | ''>('');
  const [priority, setPriority] = useState<TicketPriority | ''>('');
  // Token de filtro (f~status=open,priority=high) desde un tile o desde Inicio.
  useEffect(() => {
    const f = parseFilterParam(param);
    if (!f) return;
    setStatus(STATUS.some(([k]) => k === f.status) ? (f.status as TicketStatus) : '');
    setPriority(PRIORITY.some(([k]) => k === f.priority) ? (f.priority as TicketPriority) : '');
  }, [param]);
  const [creating, setCreating] = useState(false);
  const [subject, setSubject] = useState('');
  const [channel, setChannel] = useState<TicketChannel>('email');
  const [type, setType] = useState<TicketType>('question');
  const [busy, setBusy] = useState(false);
  const list = useLoad(() => supportApi.tickets.list({ size: 50, filter: { status, priority } }), [status, priority]);
  const rows = list.data?.data ?? [];
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try {
      const ticket = await supportApi.tickets.create({ subject: subject.trim(), channel, type });
      toast('Ticket creado', ticket.number);
      setCreating(false); setSubject(''); list.reload(); navigate('tickets', ticket.id);
    } catch (err) { toast(isProblem(err) && err.status === 422 ? 'Revise los campos' : 'No se pudo crear el ticket', errorText(err), 'err'); }
    finally { setBusy(false); }
  };
  return <>
    <PageHead crumbs={[["Soporte", 'tickets'], ['Tickets', 'tickets']]} title="Tickets" sub="Bandeja de soporte" actions={can('helpdesk.ticket.create') ? <button className="btn primary" type="button" onClick={() => setCreating((v) => !v)}><Icon name="plus" size="sm" /> Nuevo ticket</button> : null} />
    {creating ? <form className="card card-b" onSubmit={submit} style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
      <label className="field">Asunto<input className="input" required maxLength={500} value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <label className="field">Tipo<select className="select" value={type} onChange={(e) => setType(e.target.value as TicketType)}>{TYPES.map((x) => <option key={x} value={x}>{x}</option>)}</select></label>
        <label className="field">Canal<select className="select" value={channel} onChange={(e) => setChannel(e.target.value as TicketChannel)}>{CHANNEL.map((x) => <option key={x}>{x}</option>)}</select></label>
      </div>
      <div><button className="btn primary" disabled={busy}>{busy ? 'Creando…' : 'Crear ticket'}</button> <button className="btn" type="button" onClick={() => setCreating(false)}>Cancelar</button></div>
    </form> : null}
    <section className="card" aria-busy={list.loading}>
      <Toolbar count={`${rows.length}${list.data?.meta?.next_cursor ? '+' : ''} tickets`}>
        <Select value={status} onChange={(v) => setStatus(v as TicketStatus | '')} label="Estado" options={[[ '', 'Todos los estados' ], ...STATUS]} />
        <Select value={priority} onChange={(v) => setPriority(v as TicketPriority | '')} label="Prioridad" options={[[ '', 'Todas las prioridades' ], ...PRIORITY]} />
      </Toolbar>
      {list.error ? <div className="card-b"><Note kind="warn" role="alert">No se pudieron cargar los tickets: {errorText(list.error)} <button className="btn sm" type="button" onClick={list.reload}>Reintentar</button></Note></div>
        : list.loading ? <Skeleton variant="table" rows={6} />
          : rows.length ? <div className="tw"><table className="t"><thead><tr><th>Número / asunto</th><th>Estado</th><th>Prioridad</th><th>Tipo</th><th>Creado</th></tr></thead><tbody>{rows.map((t: Ticket) => <tr key={t.id}>
            <td><button type="button" className="rowlink" onClick={() => navigate('tickets', t.id)}>{t.subject}</button><div className="sub mono">{t.number}</div></td>
            <td><Chip>{label(STATUS, t.status)}</Chip></td><td>{label(PRIORITY, t.priority)}</td><td>{t.type}</td><td>{new Date(t.created_at).toLocaleString()}</td>
          </tr>)}</tbody></table></div> : <EmptyState title="Sin tickets" text="No hay tickets que coincidan con estos filtros." />}
    </section>
  </>;
}
