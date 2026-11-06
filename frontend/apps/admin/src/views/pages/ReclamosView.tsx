import { useState, type FormEvent } from 'react';
import { isProblem, type Complaint, type ComplaintDocumentType, type ComplaintInput, type ComplaintStatus, type ComplaintType } from '@hub/api';
import { hub } from '../../auth/client';
import { useApp } from '../../app/context';
import type { ViewProps } from '../../app/routes';
import { Icon } from '../../components/Icon';
import { Chip, EmptyState, Note, PageHead, Select, Skeleton } from '../../components/ui';
import { errorText, useCan, useLoad, useLookups } from './clientes/shared';
import { supportApi } from './soporte/api';

const STATUS: [ComplaintStatus, string][] = [['received', 'Recibido'], ['in_progress', 'En atención'], ['answered', 'Respondido'], ['closed', 'Cerrado']];
const statusLabel = (s: ComplaintStatus) => STATUS.find(([value]) => value === s)?.[1] ?? s;
const dateTime = (s: string | null) => s ? new Date(s).toLocaleString('es-PE') : '—';
const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const bodyHtml = (value: string) => value.split(/\r?\n\s*\r?\n/).map((p) => `<p>${escapeHtml(p).replace(/\r?\n/g, '<br>')}</p>`).join('');

export default function ReclamosView({ param }: ViewProps) {
  return param ? <ComplaintDetail id={param} /> : <ComplaintInbox />;
}

function ComplaintInbox() {
  const { toast, navigate } = useApp();
  const can = useCan();
  const { brands } = useLookups();
  const [status, setStatus] = useState<ComplaintStatus | ''>('');
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [isMinor, setIsMinor] = useState(false);
  const list = useLoad(() => supportApi.complaints.list({ size: 50, filter: { status } }), [status]);
  const rows = list.data?.data ?? [];

  const create = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setBusy(true);
    const form = new FormData(e.currentTarget);
    const amount = String(form.get('amount_minor') ?? '').trim();
    const minor = form.get('is_minor') === 'on';
    const isTest = form.get('is_test') === 'on';
    const input: ComplaintInput = {
      brand_id: String(form.get('brand_id') ?? ''), complaint_type: String(form.get('complaint_type')) as ComplaintType,
      consumer_name: String(form.get('consumer_name') ?? '').trim(), consumer_document_type: String(form.get('consumer_document_type')) as ComplaintDocumentType,
      consumer_document_number: String(form.get('consumer_document_number') ?? '').trim(), consumer_address: String(form.get('consumer_address') ?? '').trim(),
      consumer_email: String(form.get('consumer_email') ?? '').trim(), consumer_phone: String(form.get('consumer_phone') ?? '').trim() || null,
      is_minor: minor, guardian_name: String(form.get('guardian_name') ?? '').trim() || null,
      service_description: String(form.get('service_description') ?? '').trim(), amount_minor: amount ? Number(amount) : null,
      currency: amount ? String(form.get('currency')) as 'PEN' | 'USD' : null,
      detail: String(form.get('detail') ?? '').trim(), consumer_request: String(form.get('consumer_request') ?? '').trim(),
      response_days: Number(form.get('response_days')), is_test: isTest,
      test_reason: isTest ? String(form.get('test_reason') ?? '').trim() : null,
    };
    try {
      const complaint = await supportApi.complaints.create(input);
      toast('Hoja creada', complaint.code);
      setCreating(false); list.reload(); navigate('reclamos', complaint.id);
    } catch (err) { toast(isProblem(err) && err.status === 422 ? 'Revise los campos' : 'No se pudo crear la hoja', errorText(err), 'err'); }
    finally { setBusy(false); }
  };

  return <>
    <PageHead crumbs={ [['Soporte', 'tickets'], ['Libro de Reclamaciones', 'reclamos']] } title="Libro de Reclamaciones" sub="Hojas recibidas y respuestas oficiales." actions={can('helpdesk.complaint.create') ? <button className="btn primary" type="button" onClick={() => setCreating((v) => !v)}><Icon name="plus" size="sm" /> Nueva hoja</button> : null} />
    {creating ? <form className="card card-b" onSubmit={create} style={{ display: 'grid', gap: 14, marginBottom: 16 }}>
      <h2 className="sec">Datos de la hoja</h2>
      <div className="grid g-3">
        <label className="field">Marca<select className="select" name="brand_id" required defaultValue=""><option value="" disabled>Seleccione una marca</option>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
        <label className="field">Tipo<select className="select" name="complaint_type"><option value="claim">Reclamo</option><option value="grievance">Queja</option></select></label>
        <label className="field">Plazo de respuesta (días)<input className="input" name="response_days" type="number" min="1" max="365" defaultValue="30" required /></label>
      </div>
      <h3 className="sec">Datos del consumidor</h3>
      <div className="grid g-3">
        <label className="field">Nombre completo<input className="input" name="consumer_name" maxLength={255} required /></label>
        <label className="field">Tipo de documento<select className="select" name="consumer_document_type"><option value="dni">DNI</option><option value="ce">Carné de extranjería</option><option value="passport">Pasaporte</option><option value="ruc">RUC</option></select></label>
        <label className="field">Número de documento<input className="input" name="consumer_document_number" maxLength={40} required /></label>
        <label className="field">Correo<input className="input" name="consumer_email" type="email" maxLength={255} required /></label>
        <label className="field">Teléfono<input className="input" name="consumer_phone" maxLength={50} /></label>
        <label className="field">Domicilio<input className="input" name="consumer_address" maxLength={1000} required /></label>
      </div>
      <label className="check"><input type="checkbox" name="is_minor" checked={isMinor} onChange={(e) => setIsMinor(e.target.checked)} /> El consumidor es menor de edad</label>
      <label className="field">Nombre del padre, madre o tutor (si es menor)<input className="input" name="guardian_name" maxLength={255} required={isMinor} /></label>
      <h3 className="sec">Servicio y solicitud</h3>
      <label className="field">Producto o servicio<input className="input" name="service_description" required /></label>
      <div className="grid g-3">
        <label className="field">Importe en céntimos (opcional)<input className="input" name="amount_minor" type="number" min="0" step="1" /></label>
        <label className="field">Moneda<select className="select" name="currency"><option value="PEN">PEN</option><option value="USD">USD</option></select></label>
      </div>
      <label className="field">Detalle de los hechos<textarea className="textarea" name="detail" rows={4} required /></label>
      <label className="field">Pedido del consumidor<textarea className="textarea" name="consumer_request" rows={3} required /></label>
      <label className="check"><input type="checkbox" name="is_test" /> Crear como registro de prueba</label>
      <label className="field">Motivo de prueba (obligatorio si se marca)<input className="input" name="test_reason" maxLength={1000} /></label>
      <div><button className="btn primary" disabled={busy || brands.length === 0}>{busy ? 'Creando…' : 'Crear hoja'}</button>{' '}<button className="btn" type="button" onClick={() => setCreating(false)}>Cancelar</button>{brands.length === 0 ? <span className="sub"> No hay marcas disponibles para seleccionar.</span> : null}</div>
    </form> : null}
    <section className="card" aria-busy={list.loading}>
      <div className="toolbar"><Select value={status} onChange={(v) => setStatus(v as ComplaintStatus | '')} label="Estado" options={[['', 'Todos los estados'], ...STATUS]} /><span className="count">{rows.length} {rows.length === 1 ? 'hoja' : 'hojas'}</span></div>
      {list.error ? <div className="card-b"><Note kind="warn" role="alert">No se pudieron cargar las hojas: {errorText(list.error)} <button className="btn sm" type="button" onClick={list.reload}>Reintentar</button></Note></div>
        : list.loading ? <Skeleton variant="table" rows={6} />
          : rows.length ? <div className="tw"><table className="t"><thead><tr><th>Código</th><th>Tipo</th><th>Consumidor</th><th>Detalle</th><th>Recepción / vence</th><th>Estado</th><th /></tr></thead><tbody>{rows.map((c) => <tr key={c.id}>
            <td><button type="button" className="rowlink mono" onClick={() => navigate('reclamos', c.id)}>{c.code}</button>{c.is_test ? <div><Chip kind="warn">Prueba</Chip></div> : null}</td>
            <td>{c.complaint_type === 'claim' ? 'Reclamo' : 'Queja'}</td><td>{c.consumer_name}<div className="sub">{c.consumer_document_type.toUpperCase()} {c.consumer_document_number}</div></td>
            <td className="sub">{c.detail}</td><td className="nw">{dateTime(c.received_at)}<div className="sub">Vence {dateTime(c.due_at)}</div></td><td><Chip kind={c.status === 'answered' || c.status === 'closed' ? 'ok' : c.status === 'received' ? 'info' : 'warn'}>{statusLabel(c.status)}</Chip></td>
            <td>{can('helpdesk.complaint.view') ? <button className="btn sm" type="button" onClick={() => navigate('reclamos', c.id)}>Ver</button> : null}</td>
          </tr>)}</tbody></table></div> : <EmptyState title="Sin hojas" text="No hay hojas que coincidan con este estado." />}
    </section>
  </>;
}

function ComplaintDetail({ id }: { id: string }) {
  const { navigate, toast } = useApp();
  const can = useCan();
  const detail = useLoad(() => supportApi.complaints.get(id), [id]);
  const [reply, setReply] = useState('');
  const [preview, setPreview] = useState<{ body: string; previewedAt: string } | null>(null);
  const [testReason, setTestReason] = useState('');
  const [evidence, setEvidence] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const c = detail.data;
  const canAttach = can('identity.file.create');
  const openFile = async (fileId: string) => {
    try { const f = await hub.files.get(fileId); if (f.url) window.open(f.url, '_blank', 'noopener'); else toast('El adjunto no está disponible', '', 'err'); }
    catch (err) { toast('No se pudo abrir el adjunto', errorText(err), 'err'); }
  };
  const update = async (input: Partial<Pick<Complaint, 'status' | 'is_test' | 'test_reason'>>, success: string) => {
    if (!c) return;
    setBusy(true);
    try { await supportApi.complaints.update(c.id, c.version, input); toast(success); detail.reload(); }
    catch (err) { toast(isProblem(err) && err.status === 422 ? 'Revise los campos' : 'No se pudo actualizar', errorText(err), 'err'); if (isProblem(err) && (err.status === 409 || err.code === 'version_conflict')) detail.reload(); }
    finally { setBusy(false); }
  };
  const sendResponse = async () => {
    if (!c || !preview) return;
    setBusy(true);
    try {
      let file_id: string | undefined;
      if (evidence) { const f = await hub.files.upload(evidence, { visibility: 'customer' }); file_id = f.id; }
      await supportApi.complaints.responses.add(c.id, { body: preview.body, body_html: bodyHtml(preview.body), previewed_at: preview.previewedAt, is_final: true, file_id });
      toast('Respuesta oficial registrada', c.consumer_email); setReply(''); setPreview(null); setEvidence(null); detail.reload();
    } catch (err) { toast(isProblem(err) && err.status === 422 ? 'Revise los campos' : 'No se pudo registrar la respuesta', errorText(err), 'err'); if (isProblem(err) && (err.status === 409 || err.code === 'version_conflict')) detail.reload(); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!c || !c.is_test || !window.confirm(`¿Eliminar la hoja de prueba ${c.code}? Esta acción no se puede deshacer.`)) return;
    setBusy(true);
    try { await supportApi.complaints.remove(c.id, c.version); toast('Hoja de prueba eliminada', c.code, 'warn'); navigate('reclamos'); }
    catch (err) { toast(isProblem(err) && err.status === 422 ? 'Revise los campos' : 'No se pudo eliminar', errorText(err), 'err'); if (isProblem(err) && (err.status === 409 || err.code === 'version_conflict')) detail.reload(); }
    finally { setBusy(false); }
  };
  return <>
    <div className="phead"><div><button className="btn sm ghost" type="button" onClick={() => navigate('reclamos')}><Icon name="cl" size="sm" /> Volver a hojas</button><h1>{c?.code ?? 'Detalle de hoja'}</h1>{c ? <p>{c.number} · {c.complaint_type === 'claim' ? 'Reclamo' : 'Queja'} · Recibido {dateTime(c.received_at)}</p> : null}</div></div>
    {detail.error ? <Note kind="warn" role="alert">No se pudo cargar la hoja: {errorText(detail.error)} <button className="btn sm" type="button" onClick={detail.reload}>Reintentar</button></Note>
      : detail.loading || !c ? <Skeleton variant="table" rows={5} /> : <>
        <section className="card" style={{ marginBottom: 16 }}><div className="card-h"><h2 className="sec">Estado y gestión</h2><Chip kind={c.status === 'answered' || c.status === 'closed' ? 'ok' : 'warn'}>{statusLabel(c.status)}</Chip></div>
          <div className="card-b" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
            {can('helpdesk.complaint.update') ? <label className="field">Cambiar estado<select className="select" value={c.status} disabled={busy} onChange={(e) => void update({ status: e.target.value as ComplaintStatus }, 'Estado actualizado')}>
              <option value={c.status}>{statusLabel(c.status)}</option>{c.status === 'received' ? <option value="in_progress">En atención</option> : null}{c.status === 'answered' ? <option value="closed">Cerrar</option> : null}</select></label> : null}
            {c.is_test ? <Chip kind="warn">Registro de prueba{c.test_reason ? `: ${c.test_reason}` : ''}</Chip> : null}
            {can('helpdesk.complaint.update') && !c.is_test ? <><label className="field">Motivo para marcar como prueba<input className="input" value={testReason} onChange={(e) => setTestReason(e.target.value)} maxLength={1000} /></label><button className="btn" type="button" disabled={busy || !testReason.trim()} onClick={() => void update({ is_test: true, test_reason: testReason.trim() }, 'Marcada como prueba')}>Marcar como prueba</button></> : null}
            {c.is_test && can('helpdesk.complaint.delete') ? <button className="btn danger" type="button" disabled={busy} onClick={() => void remove()}><Icon name="trash" size="sm" /> Eliminar prueba</button> : null}
            <span className="sub">Plazo: {c.response_days} días · vence {dateTime(c.due_at)} · ticket {c.ticket_id}</span>
          </div>
        </section>
        <section className="card" style={{ marginBottom: 16 }}><div className="card-h"><h2 className="sec">Datos del consumidor</h2></div><div className="card-b" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14 }}>
          <Info label="Nombre" value={c.consumer_name} /><Info label="Documento" value={`${c.consumer_document_type.toUpperCase()} ${c.consumer_document_number}`} /><Info label="Correo" value={c.consumer_email} /><Info label="Teléfono" value={c.consumer_phone} /><Info label="Domicilio" value={c.consumer_address} /><Info label="Menor de edad" value={c.is_minor ? `Sí · tutor: ${c.guardian_name ?? '—'}` : 'No'} /><Info label="Servicio" value={c.service_description} /><Info label="Importe" value={c.amount_minor === null ? null : `${(c.amount_minor / 100).toFixed(2)} ${c.currency ?? ''}`} />
          <div style={{ gridColumn: '1 / -1' }}><small className="sub">Detalle</small><p style={{ whiteSpace: 'pre-wrap' }}>{c.detail}</p></div><div style={{ gridColumn: '1 / -1' }}><small className="sub">Pedido del consumidor</small><p style={{ whiteSpace: 'pre-wrap' }}>{c.consumer_request}</p></div>
        </div></section>
        <section className="card" style={{ marginBottom: 16 }}><div className="card-h"><h2 className="sec">Respuestas oficiales</h2></div>
          {c.responses.length ? <ol className="thread" aria-label="Respuestas oficiales">{c.responses.map((r) => <li key={r.id} className="msg agente"><div className="mh"><b>Respuesta oficial</b><time>{dateTime(r.sent_at)}</time></div><p style={{ whiteSpace: 'pre-wrap' }}>{r.body}</p><div className="sub">Enviada a {r.sent_to_email}{r.is_final ? ' · Final' : ''}{r.file_id ? <> · <button type="button" className="rowlink" onClick={() => void openFile(r.file_id!)}>Ver adjunto</button></> : ''}</div></li>)}</ol> : <div className="card-b sub">Todavía no hay respuestas registradas.</div>}
          {can('helpdesk.complaint.respond') && c.status !== 'answered' && c.status !== 'closed' ? <form className="composer" onSubmit={(e) => { e.preventDefault(); setPreview({ body: reply.trim(), previewedAt: new Date().toISOString() }); }}><label className="field">Respuesta al consumidor<textarea className="textarea" rows={5} required value={reply} onChange={(e) => { setReply(e.target.value); setPreview(null); }} /></label>{canAttach ? <label className="field">Evidencia adjunta (opcional · imagen o PDF, máx. 10 MB)<input className="input" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setEvidence(e.target.files?.[0] ?? null)} /></label> : null}<div style={{ display: 'flex', justifyContent: 'flex-end' }}><button className="btn" type="submit" disabled={!reply.trim()}>Previsualizar respuesta</button></div></form> : null}
          {preview ? <div className="card-b" style={{ borderTop: '1px solid var(--line)' }}><h3 className="sec">Vista previa · {dateTime(preview.previewedAt)}</h3><p style={{ whiteSpace: 'pre-wrap' }}>{preview.body}</p>{evidence ? <p className="sub">Se adjuntará: {evidence.name}</p> : null}<button className="btn primary" type="button" disabled={busy} onClick={() => void sendResponse()}>{busy ? 'Registrando…' : 'Registrar y enviar respuesta oficial'}</button>{' '}<button className="btn" type="button" onClick={() => setPreview(null)}>Editar</button></div> : null}
        </section>
      </>}
  </>;
}

function Info({ label, value }: { label: string; value: string | null }) { return <div><small className="sub">{label}</small><div>{value || '—'}</div></div>; }
