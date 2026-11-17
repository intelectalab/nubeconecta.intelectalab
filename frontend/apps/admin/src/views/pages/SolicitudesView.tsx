/**
 * Vista «solicitudes» (#solicitudes[/<uuid>]) — bandeja «Solicitudes web» (M-WCN):
 * envíos de los formularios de contacto y cotización de las webs WordPress.
 * Listado con filtros (estado, formulario, búsqueda) y cursor, panel de detalle
 * con mensaje, página de origen, UTM y consentimiento, y cambio de estado
 * (spam / restaurar) con concurrencia optimista.
 *
 * Con backend usa /api/v1/admin/web-connector/form-submissions; en modo demo
 * (VITE_DEMO=1) trabaja sobre WEB_SUBMISSIONS en memoria.
 * «Convertir en prospecto» crea el lead del CRM (POST .../{id}/lead, idempotente) y
 * deja la solicitud derivada; «Ver prospecto» abre el CRM. Derivar a ticket queda
 * para cuando Helpdesk tenga API.
 */
import { useEffect, useMemo, useState } from 'react';
import { isProblem, WEB_SUBMISSION_STATUS_LABELS, type CursorPage, type WebSubmission, type WebSubmissionChange, type WebSubmissionStatus, type WebSubmissionSummary } from '@hub/api';
import { useApp } from '../../app/context';
import type { ViewProps } from '../../app/routes';
import { useViewState } from '../../app/storage';
import { filterParam, parseFilterParam } from '../../app/filterParam';
import { hub } from '../../auth/client';
import { DataTable, type Column } from '../../components/DataTable';
import { Icon } from '../../components/Icon';
import { Sheet } from '../../components/Modal';
import { Chip, EmptyState, Kv, Note, PageHead, SearchBox, Select, StatLine, Toolbar, type ChipKind } from '../../components/ui';
import { WEB_SUBMISSIONS, webInBrand } from '../../data/webInbox';
import type { BrandFilter } from '../../data/types';
import { errorText, fDateTime, isUuid, LIVE, useCan, useLoad } from './clientes/shared';

const PER = 25;
const api = hub.webConnector.submissions;

export const WEB_CHIP: Record<WebSubmissionStatus, ChipKind> = { received: 'info', routed: 'ok', failed: 'danger', spam: 'neutral' };
const FORM_OPTIONS: [string, string][] = [
  ['', 'Todos los formularios'],
  ['contacto', 'Contacto'],
  ['cotizacion', 'Cotización'],
];
const STATUS_OPTIONS: [string, string][] = [
  ['', 'Todas (sin spam)'],
  ['received', 'Nuevas'],
  ['routed', 'Derivadas'],
  ['failed', 'Con error'],
  ['spam', 'Spam'],
];
const UTM_LABEL: Record<string, string> = { source: 'Fuente', medium: 'Medio', campaign: 'Campaña', term: 'Término', content: 'Contenido' };

interface Query {
  q: string;
  status: string;
  form: string;
  cursor: string | null;
  brand: BrandFilter;
}

/* ---------- Fuente de datos: API real o datos de ejemplo ---------- */
const demo = {
  list(p: Query): CursorPage<WebSubmission> {
    const q = p.q.trim().toLowerCase();
    const rows = WEB_SUBMISSIONS.filter(
      (s) =>
        webInBrand(p.brand, s) &&
        (p.status ? s.status === p.status : s.status !== 'spam') &&
        (!p.form || s.form_code === p.form) &&
        (!q || [s.payload.name, s.payload.email, s.payload.company].some((x) => (x ?? '').toLowerCase().includes(q))),
    ).sort((a, b) => b.created_at.localeCompare(a.created_at));
    return { data: rows, meta: { next_cursor: null, prev_cursor: null, has_more: false, page_size: PER }, links: { next: null, prev: null } } as CursorPage<WebSubmission>;
  },
  summary(brand: BrandFilter): WebSubmissionSummary {
    const out: WebSubmissionSummary = { received: 0, routed: 0, failed: 0, spam: 0 };
    WEB_SUBMISSIONS.filter((s) => webInBrand(brand, s)).forEach((s) => (out[s.status] += 1));
    return out;
  },
  update(id: string, change: WebSubmissionChange): WebSubmission {
    const s = WEB_SUBMISSIONS.find((x) => x.id === id);
    if (!s) throw new Error('not found');
    s.status = change.status;
    s.version += 1;
    s.updated_at = new Date().toISOString();
    return { ...s };
  },
};

const who = (s: WebSubmission) => s.payload.name || s.payload.email || '—';

export default function SolicitudesView({ param }: ViewProps) {
  const { brand, dataVersion, refresh } = useApp();
  const [q, setQ] = useViewState('web.inbox.q', '');
  const [status, setStatus] = useViewState('web.inbox.st', '');
  const [form, setForm] = useViewState('web.inbox.form', '');
  const [cursor, setCursor] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(isUuid(param) ? param : null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (isUuid(param)) setOpenId(param);
    const fl = parseFilterParam(param);
    if (fl) {
      setStatus(fl.st ?? '');
      setForm(fl.form ?? '');
      setQ('');
      setCursor(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [param]);

  const query: Query = { q, status, form, cursor, brand };
  const res = useLoad(
    () => (LIVE ? api.list({ q: q.trim() || undefined, filter: { status: status || undefined, form_code: form || undefined }, cursor, size: PER }) : Promise.resolve(demo.list(query))),
    [q, status, form, cursor, brand, dataVersion, tick],
  );
  const sum = useLoad(() => (LIVE ? api.summary() : Promise.resolve(demo.summary(brand))), [brand, dataVersion, tick]);
  const rows = res.data?.data ?? [];
  const meta = res.data?.meta;
  const filtered = !!(q || status || form);
  const counts = sum.data;

  const upd = (f: (v: string) => void) => (v: string) => {
    f(v);
    setCursor(null);
  };
  const clear = () => {
    setQ('');
    setStatus('');
    setForm('');
    setCursor(null);
  };
  const changed = () => {
    setTick((t) => t + 1);
    refresh(); // contador del menú
  };

  const columns: Column<WebSubmission>[] = useMemo(
    () => [
      { key: 'd', header: 'Fecha', className: 'nw', render: (s) => fDateTime(s.created_at) },
      {
        key: 'f',
        header: 'Formulario',
        render: (s) => (
          <>
            {s.form_name ?? s.form_code ?? '—'}
            {s.brand_name ? <div className="sub">{s.brand_name}</div> : null}
          </>
        ),
      },
      {
        key: 'n',
        header: 'Nombre',
        minWidth: 160,
        render: (s) => (
          <button type="button" className="rowlink" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', textAlign: 'left', fontWeight: s.status === 'received' ? 700 : undefined }} onClick={() => setOpenId(s.id)}>
            {who(s)}
          </button>
        ),
      },
      { key: 'c', header: 'Empresa', render: (s) => s.payload.company || <span className="sub">—</span> },
      { key: 'e', header: 'Correo', render: (s) => (s.payload.email ? <a href={`mailto:${s.payload.email}`}>{s.payload.email}</a> : '—') },
      { key: 't', header: 'Teléfono', className: 'nw', render: (s) => (s.payload.phone ? <a href={`tel:${s.payload.phone.replace(/[^\d+]/g, '')}`}>{s.payload.phone}</a> : <span className="sub">—</span>) },
      { key: 's', header: 'Estado', render: (s) => <Chip kind={WEB_CHIP[s.status]}>{WEB_SUBMISSION_STATUS_LABELS[s.status]}</Chip> },
    ],
    [],
  );

  return (
    <>
      <PageHead crumbs={[['Comercial', 'solicitudes'], ['Solicitudes web']]} title="Solicitudes web" sub="Mensajes de los formularios de contacto y cotización de las webs WordPress." />
      <StatLine
        items={[
          { label: 'Nuevas', value: counts ? counts.received : '—', tone: counts?.received ? 'info' : '', to: 'solicitudes', param: filterParam({ st: 'received' }) },
          { label: 'Derivadas', value: counts ? counts.routed : '—', tone: 'ok', to: 'solicitudes', param: filterParam({ st: 'routed' }) },
          { label: 'Con error', value: counts ? counts.failed : '—', tone: counts?.failed ? 'danger' : '', to: 'solicitudes', param: filterParam({ st: 'failed' }) },
          { label: 'Spam', value: counts ? counts.spam : '—', to: 'solicitudes', param: filterParam({ st: 'spam' }) },
        ]}
      />
      <section className="card">
        <Toolbar count={res.loading ? 'Cargando…' : `${rows.length}${meta?.has_more ? '+' : ''} ${rows.length === 1 ? 'solicitud' : 'solicitudes'}`}>
          <SearchBox value={q} onChange={upd(setQ)} label="Buscar solicitudes" placeholder="Nombre, correo o empresa" />
          <Select value={status} onChange={upd(setStatus)} label="Estado" options={STATUS_OPTIONS} />
          <Select value={form} onChange={upd(setForm)} label="Formulario" options={FORM_OPTIONS} />
        </Toolbar>
        {res.error ? (
          <div className="card-b">
            <Note kind="warn" icon="tri" role="alert">
              No se pudo cargar la bandeja: {errorText(res.error)}{' '}
              <button type="button" className="btn sm" onClick={res.reload}>
                Reintentar
              </button>
            </Note>
          </div>
        ) : !res.loading && !rows.length ? (
          <EmptyState
            icon="inbox"
            title={filtered ? 'Sin solicitudes que coincidan' : 'Aún no hay solicitudes'}
            text={filtered ? 'Ajuste los filtros.' : 'Aquí llegan los formularios de contacto y cotización enviados desde las webs.'}
            action={
              filtered ? (
                <button type="button" className="btn sm" onClick={clear}>
                  Limpiar filtros
                </button>
              ) : undefined
            }
          />
        ) : (
          <>
            <DataTable columns={columns} rows={rows} rowKey={(s) => s.id} caption="Solicitudes web" />
            {LIVE && (meta?.prev_cursor || meta?.next_cursor) ? (
              <div className="card-b" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className="btn sm" disabled={res.loading || !meta?.prev_cursor} onClick={() => setCursor(meta?.prev_cursor ?? null)}>
                  <Icon name="cl" size="sm" />
                  Anterior
                </button>
                <button type="button" className="btn sm" disabled={res.loading || !meta?.next_cursor} onClick={() => setCursor(meta?.next_cursor ?? null)}>
                  Siguiente
                  <Icon name="cr" size="sm" />
                </button>
              </div>
            ) : null}
          </>
        )}
      </section>
      {openId ? <SubmissionSheet id={openId} onClose={() => setOpenId(null)} onChanged={changed} /> : null}
    </>
  );
}

/** Panel de detalle: datos de contacto, mensaje completo, origen, UTM, consentimiento y acciones. */
function SubmissionSheet({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { toast, href } = useApp();
  const can = useCan();
  const res = useLoad(() => {
    if (LIVE) return api.get(id);
    const s = WEB_SUBMISSIONS.find((x) => x.id === id);
    return s ? Promise.resolve({ ...s }) : Promise.reject(new Error('not found'));
  }, [id]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const s = res.data;
  const canManage = !LIVE || can('web_connector.form_submission.update');

  const setStatus = async (status: 'received' | 'spam') => {
    if (!s) return;
    setBusy(true);
    setMsg(null);
    try {
      const next = LIVE ? await api.update(s.id, { status, version: s.version }) : demo.update(s.id, { status, version: s.version });
      res.setData(next);
      toast(status === 'spam' ? 'Marcada como spam' : 'Solicitud restaurada', who(next), status === 'spam' ? 'warn' : 'ok');
      onChanged();
    } catch (e) {
      setMsg(errorText(e));
      if (isProblem(e) && e.code === 'version_conflict') res.reload();
    } finally {
      setBusy(false);
    }
  };

  /** «Convertir en prospecto»: crea el prospecto en el CRM (idempotente) y deja la solicitud derivada. */
  const toLead = async () => {
    if (!s) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await hub.sales.leads.fromSubmission(s.id);
      toast(r.created ? 'Prospecto creado' : 'La solicitud ya tenía prospecto', r.code);
      res.reload();
      onChanged();
    } catch (e) {
      setMsg(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const canLead = LIVE && can('sales.lead.create');

  const p = s?.payload;
  const utm = s && s.attribution && !Array.isArray(s.attribution) ? Object.entries(s.attribution).filter(([, v]) => v) : [];
  const mail = p?.email
    ? `mailto:${p.email}?subject=${encodeURIComponent(`Re: su solicitud${s?.brand_name ? ` en ${s.brand_name}` : ''}`)}`
    : null;

  return (
    <Sheet
      open
      onClose={onClose}
      title={s ? who(s) : 'Solicitud web'}
      sub={s ? <Chip kind={WEB_CHIP[s.status]}>{WEB_SUBMISSION_STATUS_LABELS[s.status]}</Chip> : undefined}
      footer={
        s ? (
          <>
            {mail ? (
              <a className="btn primary" href={mail}>
                <Icon name="mail" size="sm" />
                Responder por correo
              </a>
            ) : null}
            {p?.phone ? (
              <a className="btn" href={`tel:${p.phone.replace(/[^\d+]/g, '')}`}>
                <Icon name="phone" size="sm" />
                Llamar
              </a>
            ) : null}
            {s.lead_id ? (
              <a className="btn primary" href={href('crm', s.lead_id)}>
                Ver prospecto
              </a>
            ) : canLead && s.status !== 'spam' && !s.ticket_id ? (
              <button type="button" className="btn primary" disabled={busy} onClick={() => void toLead()}>
                {busy ? 'Procesando…' : 'Convertir en prospecto'}
              </button>
            ) : null}
            {canManage && s.status !== 'routed' ? (
              s.status === 'spam' ? (
                <button type="button" className="btn" disabled={busy} onClick={() => void setStatus('received')}>
                  {busy ? 'Procesando…' : 'No es spam'}
                </button>
              ) : (
                <button type="button" className="btn" disabled={busy} onClick={() => void setStatus('spam')}>
                  {busy ? 'Procesando…' : 'Marcar como spam'}
                </button>
              )
            ) : null}
          </>
        ) : undefined
      }
    >
      {res.error ? (
        <Note kind="warn" icon="tri" role="alert">
          {isProblem(res.error) ? errorText(res.error) : 'Solicitud no encontrada.'}
        </Note>
      ) : !s || !p ? (
        <p className="sub">Cargando…</p>
      ) : (
        <>
          <Kv
            items={[
              ['Recibida', fDateTime(s.created_at)],
              ['Formulario', `${s.form_name ?? s.form_code ?? '—'}${s.brand_name ? ` · ${s.brand_name}` : ''}`],
              ['Nombre', p.name || '—'],
              ['Empresa', p.company || '—'],
              ['Correo', p.email ? <a key="e" href={`mailto:${p.email}`}>{p.email}</a> : '—'],
              ['Teléfono', p.phone ? <a key="t" href={`tel:${p.phone.replace(/[^\d+]/g, '')}`}>{p.phone}</a> : '—'],
            ]}
          />
          <h3 style={{ margin: '16px 0 8px' }}>Mensaje</h3>
          <div className="card" style={{ padding: 12, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', lineHeight: 1.5 }}>
            {p.message || <span className="sub">Sin mensaje.</span>}
          </div>
          <h3 style={{ margin: '16px 0 8px' }}>Origen</h3>
          <Kv
            items={[
              [
                'Página',
                s.page_url ? (
                  <a key="u" href={s.page_url} target="_blank" rel="noopener noreferrer" style={{ overflowWrap: 'anywhere' }}>
                    {s.page_url.replace(/^https?:\/\//, '')} <Icon name="external" size="sm" />
                  </a>
                ) : (
                  '—'
                ),
              ],
              ['Origen declarado', p.source || '—'],
              ...utm.map(([k, v]): [string, string] => [`UTM ${UTM_LABEL[k] ?? k}`, String(v)]),
              ...(utm.length ? [] : [['Campaña (UTM)', <span key="n" className="sub">Sin datos de campaña</span>] as [string, JSX.Element]]),
            ]}
          />
          <h3 style={{ margin: '16px 0 8px' }}>Consentimiento</h3>
          <Kv
            items={[
              ['Aceptó', s.consent_given ? <Chip key="c" kind="ok" icon="check">Sí</Chip> : <Chip key="c" kind="warn">No</Chip>],
              ['Texto aceptado', s.consent_text ? <span key="x" className="sub">{s.consent_text}</span> : '—'],
            ]}
          />
          {s.status === 'failed' && s.last_error ? (
            <Note kind="warn" icon="tri" style={{ marginTop: 12 }}>
              La derivación automática falló: {s.last_error}
            </Note>
          ) : null}
          {s.status === 'routed' ? (
            <Note icon="info" style={{ marginTop: 12 }}>
              Derivada el {fDateTime(s.routed_at)}
              {s.lead_id ? ' a un prospecto del CRM' : s.ticket_id ? ' a un ticket de soporte' : ' por correo'}.
            </Note>
          ) : null}
          <div className="err" role="alert">
            {msg}
          </div>
        </>
      )}
    </Sheet>
  );
}
