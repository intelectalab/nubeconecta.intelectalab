/**
 * P-CUS-03 · Ficha 360° del cliente contra la API real
 * (GET /api/v1/admin/customers/{id}/overview).
 *
 * Pestañas con datos reales: resumen (datos, documento, dirección), contactos
 * (P-CUS-04), notas, servicios (M-SRV), facturas (M-BIL) e historial. Las pestañas de módulos que aún no existen las
 * pinta la vista con datos de ejemplo (`mockTab`).
 */
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { AGING_LABELS, SERVICE_STATUS_LABELS, isProblem, newIdempotencyKey, CONTACT_ROLES, type AgingBucket, type AuditEvent, type Contact, type ContactInput, type ContactRole, type Contract, type ContractStatus, type Customer, type CustomerNote, type PortalRole, type Service, type TicketPriority, type TicketStatus, type TicketType } from '@hub/api';
import { useApp } from '../../../app/context';
import { Icon } from '../../../components/Icon';
import { Modal } from '../../../components/Modal';
import { Chip, Crumbs, EmptyState, Kv, Note, PageHead, PageSkeleton, Tabs } from '../../../components/ui';
import { CustomerForm } from './CustomerForm';
import ServiceList from '../servicios/ServiceList';
import DomainList from '../dominios/DomainList';
import InvoiceList from '../facturas/InvoiceList';
import { invoicesApi } from '../facturas/shared';
import { contractsApi, CONTRACT_CHIP } from '../contratos/shared';
import { servicesApi, SERVICE_CHIP } from '../servicios/shared';
import { supportApi } from '../soporte/api';
import { href } from '../../../app/routeMeta';
import { ACTOR_LABELS, auditActionLabel, countryName, customersApi, displayName, docOf, errorText, fDate, fDateTime, fieldErrors, moneyMinor, ROLE_LABEL, STATUS_LABEL, TAX_LABEL, TYPE_LABEL, useCan, useLoad, useLookups } from './shared';

export type MockTabId = 'mapa' | 'servicios' | 'dominios' | 'facturas' | 'tickets' | 'contratos';
type TabId = 'resumen' | 'contactos' | 'notas' | 'historial' | MockTabId;
/** Pestañas ya conectadas a su módulo (el resto de MOCK_TABS sigue con datos de ejemplo). */
const LIVE_TABS: Partial<Record<MockTabId, string>> = { servicios: 'services.service.view', facturas: 'billing.invoice.view', tickets: 'helpdesk.ticket.view', contratos: 'contracts.contract.view', mapa: 'services.service.view', dominios: 'domains.domain.view' };

const MOCK_TABS: { id: MockTabId; label: string; count: string }[] = [
  { id: 'servicios', label: 'Servicios', count: 'services' },
  { id: 'mapa', label: 'Mapa de servicios', count: '' },
  { id: 'dominios', label: 'Dominios', count: 'domains' },
  { id: 'facturas', label: 'Facturas', count: 'invoices' },
  { id: 'tickets', label: 'Tickets', count: 'tickets' },
  { id: 'contratos', label: 'Contratos', count: 'contracts' },
];

export default function CustomerFicha({ id, mockTab }: { id: string; mockTab: (tab: MockTabId) => ReactNode }) {
  const { navigate } = useApp();
  const ov = useLoad(() => customersApi.overview(id), [id]);
  const e = ov.error;
  const merged = isProblem(e) && e.code === 'customer_merged' ? (e.extensions.merged_into_id as string | undefined) : undefined;
  // 404 por fusión: se redirige al cliente sobreviviente (P-CUS-03).
  useEffect(() => {
    if (merged) navigate('cliente', merged);
  }, [merged, navigate]);

  if (ov.loading && !ov.data) return <PageSkeleton />;
  if (ov.error || !ov.data) {
    return (
      <>
        <PageHead crumbs={[['Clientes', 'clientes'], ['Cliente']]} title={merged ? 'Cliente fusionado' : 'No se pudo abrir el cliente'} />
        <section className="card">
          <EmptyState
            title={merged ? 'Este cliente fue fusionado' : isProblem(e) && e.status === 404 ? 'No encontramos este cliente' : 'Error al cargar la ficha'}
            text={merged ? 'Redirigiendo al cliente que lo absorbió…' : errorText(e)}
            action={
              <>
                <button type="button" className="btn" onClick={ov.reload}>
                  Reintentar
                </button>{' '}
                <a className="btn primary" href="#clientes">
                  Volver a clientes
                </a>
              </>
            }
          />
        </section>
      </>
    );
  }
  return <Ficha key={id} ov={ov.data} reload={ov.reload} mockTab={mockTab} />;
}

function Ficha({ ov, reload, mockTab }: { ov: Awaited<ReturnType<typeof customersApi.overview>>; reload: () => void; mockTab: (tab: MockTabId) => ReactNode }) {
  const { toast } = useApp();
  const can = useCan();
  const { brands, staff } = useLookups();
  const [tab, setTab] = useState<TabId>('resumen');
  const [editing, setEditing] = useState(false);
  const c = ov.customer;
  const balances = Object.entries(ov.balance_minor).filter(([, v]) => v);

  /** Vista "ver como cliente": activa la vista de solo lectura y abre el portal en otra pestaña. */
  const viewAsCustomer = async () => {
    try {
      const r = await customersApi.impersonation.start(c.id);
      window.open(r.portal_url, '_blank', 'noopener');
      toast('Vista de cliente activada', 'El portal se abrió en otra pestaña (solo lectura, 30 min).');
    } catch (e) {
      toast('No se pudo abrir la vista', errorText(e), 'err');
    }
  };

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: 'resumen', label: 'Resumen' },
    ...(can('customers.contact.view') ? [{ id: 'contactos' as TabId, label: 'Contactos', count: ov.counts.contacts }] : []),
    ...(can('customers.customer_note.view') ? [{ id: 'notas' as TabId, label: 'Notas', count: ov.counts.customer_notes }] : []),
    ...MOCK_TABS.filter((t) => !LIVE_TABS[t.id] || can(LIVE_TABS[t.id] as string)).map((t) => ({ id: t.id as TabId, label: t.label, count: t.count ? ov.counts[t.count] : undefined })),
    { id: 'historial', label: 'Historial' },
  ];

  let body: ReactNode;
  if (tab === 'resumen') body = <Resumen c={c} ov={ov} brand={brands.find((b) => b.id === c.origin_brand_id)?.name} manager={staff.find((u) => u.id === c.account_manager_id)?.name} />;
  else if (tab === 'contactos') body = <Contactos customer={c} billingMissing={ov.billing_contact_missing} onChange={reload} />;
  else if (tab === 'notas') body = <Notas customerId={c.id} />;
  else if (tab === 'historial') body = <Historial customerId={c.id} />;
  else if (tab === 'servicios') body = <ServiceList customerId={c.id} />;
  else if (tab === 'facturas') body = <InvoiceList customerId={c.id} />;
  else if (tab === 'tickets') body = <CustomerTickets customerId={c.id} />;
  else if (tab === 'contratos') body = <CustomerContracts customerId={c.id} />;
  else if (tab === 'mapa') body = <CustomerServiceMap customerId={c.id} />;
  else if (tab === 'dominios') body = <CustomerDomains customerId={c.id} />;
  else
    body = (
      <>
        <Note icon="info" style={{ marginBottom: 12 }}>
          Datos de ejemplo: el módulo de {MOCK_TABS.find((t) => t.id === tab)?.label.toLowerCase()} aún no está conectado.
        </Note>
        {mockTab(tab)}
      </>
    );

  return (
    <>
      <Crumbs items={[['Clientes', 'clientes'], [displayName(c)]]} />
      <section className="card c360" aria-label="Cabecera del cliente" style={{ marginBottom: 14 }}>
        <div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
            <Chip kind={c.status === 'active' ? 'ok' : ''}>{STATUS_LABEL[c.status]}</Chip>
            {ov.suspension_exempt ? <Chip kind="info">Exento de suspensión</Chip> : null}
            <span className="mono" style={{ color: 'var(--muted)', fontSize: 12 }}>
              {c.code}
            </span>
          </div>
          <h1 tabIndex={-1} id="ph1">
            {displayName(c)}
          </h1>
          <div className="meta">
            <span>
              <Icon name="file" size="sm" />
              {docOf(c)}
            </span>
            <span>
              <Icon name="globe" size="sm" />
              {countryName(c.country)}
            </span>
            <span>
              <Icon name="user" size="sm" />
              Responsable: {staff.find((u) => u.id === c.account_manager_id)?.name ?? (c.account_manager_id ? '—' : 'Sin asignar')}
            </span>
            <span>
              <Icon name="cal" size="sm" />
              Cliente desde {fDate(c.created_at)}
            </span>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 12, justifyItems: 'end' }}>
          <div className="money">
            <div>
              <small>Saldo pendiente</small>
              <b>{balances.length ? balances.map(([cur, v]) => moneyMinor(v ?? 0, cur)).join(' · ') : '—'}</b>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {can('customers.customer.impersonate') ? (
              <button type="button" className="btn" onClick={() => void viewAsCustomer()}>
                <Icon name="external" size="sm" />
                Ver como cliente
              </button>
            ) : null}
            {can('customers.customer.update') ? (
              <button type="button" className="btn primary" onClick={() => setEditing(true)}>
                <Icon name="edit" size="sm" />
                Editar cliente
              </button>
            ) : null}
          </div>
        </div>
      </section>
      <Tabs tabs={tabs} value={tab} onChange={setTab} label="Secciones de la ficha" style={{ marginBottom: 14 }} />
      <div role="tabpanel">{body}</div>
      {editing ? (
        <CustomerForm
          open
          customer={c}
          onClose={() => setEditing(false)}
          onReload={() => {
            setEditing(false);
            reload();
          }}
          onSaved={(saved) => {
            setEditing(false);
            toast('Cliente actualizado', `${saved.code} · versión ${saved.version}`);
            reload();
          }}
        />
      ) : null}
    </>
  );
}

/* ---------- Tickets del cliente (HLP) ---------- */
const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  new: 'Nuevo', open: 'Abierto', in_progress: 'En curso', waiting_customer: 'Espera cliente', waiting_provider: 'Espera proveedor',
  escalated: 'Escalado', resolved: 'Resuelto', closed: 'Cerrado', reopened: 'Reabierto',
};
const TICKET_TYPE_LABEL: Record<TicketType, string> = {
  incident: 'Incidente', request: 'Solicitud', question: 'Consulta', billing: 'Facturación', complaint: 'Reclamo', security: 'Seguridad',
};
const TICKET_PRIORITY_LABEL: Record<TicketPriority, string> = { critical: 'Crítica', high: 'Alta', medium: 'Media', low: 'Baja' };
const ticketStatusKind = (status: TicketStatus) => status === 'resolved' || status === 'closed' ? 'ok' : status === 'escalated' ? 'danger' : status === 'waiting_customer' || status === 'waiting_provider' ? 'warn' : 'info';
const ticketPriorityKind = (priority: TicketPriority) => priority === 'critical' ? 'danger' : priority === 'high' ? 'warn' : priority === 'medium' ? 'info' : 'neutral';

function CustomerTickets({ customerId }: { customerId: string }) {
  const res = useLoad(() => supportApi.tickets.list({ filter: { customer_id: customerId }, size: 50 }), [customerId]);
  const rows = res.data?.data ?? [];
  return (
    <section className="card">
      <div className="card-h"><h2 className="sec">Tickets</h2></div>
      {res.error ? <div className="card-b"><Note kind="warn" icon="tri" role="alert">{errorText(res.error)}{' '}<button type="button" className="btn sm" onClick={res.reload}>Reintentar</button></Note></div> : res.loading ? <div className="card-b">Cargando tickets…</div> : !rows.length ? <EmptyState title="Sin tickets" text="No hay tickets registrados para este cliente." /> : (
        <div className="tw"><table className="t"><thead><tr><th>Número</th><th>Asunto</th><th>Tipo</th><th>Estado</th><th>Prioridad</th><th>Fecha</th></tr></thead><tbody>
          {rows.map((ticket) => <tr key={ticket.id}><td className="nw"><a className="rowlink mono" href={href('tickets', ticket.id)}>{ticket.number}</a></td><td>{ticket.subject}</td><td>{TICKET_TYPE_LABEL[ticket.type]}</td><td><Chip kind={ticketStatusKind(ticket.status)}>{TICKET_STATUS_LABEL[ticket.status]}</Chip></td><td><Chip kind={ticketPriorityKind(ticket.priority)}>{TICKET_PRIORITY_LABEL[ticket.priority]}</Chip></td><td className="nw">{fDateTime(ticket.created_at)}</td></tr>)}
        </tbody></table></div>
      )}
    </section>
  );
}

/* ---------- Dominios del cliente (DOM) ---------- */
function CustomerDomains({ customerId }: { customerId: string }) {
  return <DomainList customerId={customerId} />;
}

/* ---------- Contratos del cliente (CON) ---------- */
const CONTRACT_STATUS_LABEL: Record<ContractStatus, string> = { draft: 'Borrador', in_review: 'En revisión', approved: 'Aprobado', sent: 'Enviado', signed_active: 'Vigente firmado', expired: 'Vencido', terminated: 'Terminado' };

function CustomerContracts({ customerId }: { customerId: string }) {
  const res = useLoad(() => contractsApi.list({ filter: { customer_id: customerId }, size: 50 }), [customerId]);
  const rows: Contract[] = res.data?.data ?? [];
  return (
    <section className="card">
      <div className="card-h"><h2 className="sec">Contratos</h2></div>
      {res.error ? <div className="card-b"><Note kind="warn" icon="tri" role="alert">{errorText(res.error)}{' '}<button type="button" className="btn sm" onClick={res.reload}>Reintentar</button></Note></div> : res.loading ? <div className="card-b">Cargando contratos…</div> : !rows.length ? <EmptyState title="Sin contratos" text="No hay contratos registrados para este cliente." /> : (
        <div className="tw"><table className="t"><thead><tr><th>Código / título</th><th>Estado</th><th>Vigencia</th><th>Versión</th></tr></thead><tbody>
          {rows.map((contract) => <tr key={contract.id}><td><a className="rowlink mono" href={href('contratos', contract.id)}>{contract.number}</a><div className="sub">{contract.kind === 'terms' ? 'Términos y condiciones' : 'Contrato'}</div></td><td><Chip kind={CONTRACT_CHIP[contract.status]}>{CONTRACT_STATUS_LABEL[contract.status]}</Chip></td><td className="nw">{fDate(contract.starts_on)} – {fDate(contract.ends_on)}</td><td>v{contract.current_version}</td></tr>)}
        </tbody></table></div>
      )}
    </section>
  );
}

/* ---------- Mapa visual de servicios del cliente (M-SRV) ---------- */
function CustomerServiceMap({ customerId }: { customerId: string }) {
  const res = useLoad(() => servicesApi.list({ filter: { customer_id: customerId }, size: 100 }), [customerId]);
  const rows: Service[] = res.data?.data ?? [];
  const groups = rows.reduce<Partial<Record<Service['status'], Service[]>>>((result, service) => {
    (result[service.status] ??= []).push(service);
    return result;
  }, {});
  const orderedStatuses: Service['status'][] = ['active', 'pending', 'suspended', 'handed_over', 'terminated', 'cancelled'];
  return (
    <section className="card">
      <div className="card-h"><h2 className="sec">Mapa de servicios</h2></div>
      {res.error ? <div className="card-b"><Note kind="warn" icon="tri" role="alert">{errorText(res.error)}{' '}<button type="button" className="btn sm" onClick={res.reload}>Reintentar</button></Note></div> : res.loading ? <div className="card-b">Cargando servicios…</div> : !rows.length ? <EmptyState title="Sin servicios" text="Este cliente aún no tiene servicios registrados." /> : (
        <div className="card-b" style={{ display: 'grid', gap: 16 }}>
          {orderedStatuses.filter((status) => groups[status]?.length).map((status) => <div key={status}>
            <h3 className="sec" style={{ margin: '0 0 8px' }}>{SERVICE_STATUS_LABELS[status]}</h3>
            <div className="grid g-3">{(groups[status] ?? []).map((service) => <article className="card" key={service.id}>
              <div className="card-b" style={{ display: 'grid', gap: 6 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'start' }}><b>{service.label}</b><Chip kind={SERVICE_CHIP[service.status]}>{SERVICE_STATUS_LABELS[service.status]}</Chip></div><div className="sub">{service.plan?.name ?? service.product?.name ?? service.code}</div><div className="sub">Próximo vencimiento: {fDate(service.commercial_due_date ?? service.subscription?.next_invoice_date)}</div></div>
            </article>)}</div>
          </div>)}
        </div>
      )}
    </section>
  );
}

/* ---------- Resumen: datos, documento y dirección ---------- */
function Resumen({ c, ov, brand, manager }: { c: Customer; ov: { counts: Record<string, number>; billing_contact_missing: boolean }; brand?: string; manager?: string }) {
  return (
    <div className="grid g-3">
      <section className="card">
        <div className="card-h">
          <h2 className="sec">Datos del cliente</h2>
        </div>
        <div className="card-b">
          <Kv
            items={[
              ['Tipo', TYPE_LABEL[c.type]],
              ['Razón social', c.legal_name],
              ['Nombre comercial', c.trade_name ?? '—'],
              ['Correo', <span className="mono">{c.email ?? '—'}</span>],
              ['Teléfono', <span className="mono">{c.phone ?? '—'}</span>],
              ['Marca de origen', brand ?? '—'],
              ['Responsable', manager ?? (c.account_manager_id ? '—' : 'Sin asignar')],
              ['Idioma / zona', `${c.locale === 'en' ? 'Inglés' : 'Español'} · ${c.timezone}`],
            ]}
          />
        </div>
      </section>
      <section className="card">
        <div className="card-h">
          <h2 className="sec">Documento y facturación</h2>
        </div>
        <div className="card-b">
          <Kv
            items={[
              ['Documento', c.tax_id_type ? TAX_LABEL[c.tax_id_type] : '—'],
              ['Número', <span className="mono">{c.tax_id ?? '—'}</span>],
              ['País', countryName(c.country)],
              ['Moneda', c.currency === 'PEN' ? 'Soles (S/)' : 'Dólares (US$)'],
              ['Tratamiento', c.tax_treatment === 'export' ? 'Exportación' : 'Gravado'],
              ['Agente de retención', c.is_withholding_agent ? 'Sí' : 'No'],
              ['Facturación', c.invoice_consolidation === 'per_service' ? 'Por servicio' : 'Consolidada'],
            ]}
          />
        </div>
      </section>
      <section className="card">
        <div className="card-h">
          <h2 className="sec">Dirección y actividad</h2>
        </div>
        <div className="card-b">
          <Kv
            items={[
              ['Dirección fiscal', c.address ?? '—'],
              ['Contactos', ov.counts.contacts ?? 0],
              ['Notas', ov.counts.customer_notes ?? 0],
              ['Última modificación', fDateTime(c.updated_at)],
              ['Versión', c.version],
            ]}
          />
          {c.tags.length ? (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
              {c.tags.map((t) => (
                <Chip key={t.id}>{t.name}</Chip>
              ))}
            </div>
          ) : null}
          {ov.billing_contact_missing ? (
            <Note kind="warn" icon="tri" style={{ marginTop: 10 }}>
              Sin contacto de facturación: los avisos de cobranza no tendrían destinatario.
            </Note>
          ) : null}
        </div>
      </section>
      <CustomerDebt customerId={c.id} />
    </div>
  );
}

/* ---------- Deuda real por antigüedad (M-BIL /admin/collections/aging) ---------- */
function CustomerDebt({ customerId }: { customerId: string }) {
  const can = useCan();
  const allowed = can('billing.invoice.view');
  const { data, error, loading } = useLoad(() => (allowed ? invoicesApi.aging({ customer_id: customerId }) : Promise.resolve(null)), [customerId, allowed]);
  if (!allowed) return null;
  const rows = data?.data ?? [];
  return (
    <section className="card">
      <div className="card-h">
        <h2 className="sec">Deuda y antigüedad</h2>
      </div>
      <div className="card-b">
        {loading ? (
          <p className="muted">Cargando deuda…</p>
        ) : error ? (
          <Note kind="warn" icon="tri">{errorText(error)}</Note>
        ) : !rows.length ? (
          <p className="muted">Sin saldo pendiente.</p>
        ) : (
          rows.map((r) => (
            <Kv
              key={r.currency}
              items={[
                ['Moneda', r.currency],
                ['Saldo total', <strong>{moneyMinor(r.total_minor, r.currency)}</strong>],
                ['Vencido', moneyMinor(r.overdue_minor, r.currency)],
                ...(Object.keys(AGING_LABELS) as AgingBucket[]).map((b): [string, string] => [AGING_LABELS[b], moneyMinor(r.buckets[b] ?? 0, r.currency)]),
                ['Comprobantes abiertos', r.invoices],
                ['Vencimiento más antiguo', fDate(r.oldest_due_date)],
                ['Último pago', fDate(r.last_payment_at)],
              ]}
            />
          ))
        )}
      </div>
    </section>
  );
}

/* ---------- Contactos (P-CUS-04) ---------- */
function Contactos({ customer, billingMissing, onChange }: { customer: Customer; billingMissing: boolean; onChange: () => void }) {
  const { toast, dialogs } = useApp();
  const can = useCan();
  const [role, setRole] = useState<ContactRole | ''>('');
  const list = useLoad(() => customersApi.contacts.list(customer.id, { role: role || undefined, size: 100 }), [customer.id, role]);
  const [form, setForm] = useState<Contact | 'new' | null>(null);
  const [grantRole, setGrantRole] = useState<Record<string, PortalRole>>({});
  const canUpdate = can('customers.contact.update');

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast(ok);
      list.reload();
      onChange();
    } catch (e) {
      toast('No se pudo completar', errorText(e), 'err');
    }
  };

  const rows = list.data?.data ?? [];
  return (
    <section className="card">
      <div className="card-h">
        <h2 className="sec">Contactos</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <select className="select" aria-label="Rol de contacto" value={role} onChange={(e) => setRole(e.target.value as ContactRole | '')}>
            <option value="">Todos los roles</option>
            {CONTACT_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
          {can('customers.contact.create') ? (
            <button type="button" className="btn sm primary" onClick={() => setForm('new')}>
              <Icon name="plus" size="sm" />
              Agregar contacto
            </button>
          ) : null}
        </div>
      </div>
      {billingMissing ? (
        <div className="card-b">
          <Note kind="warn" icon="tri">
            No hay contacto de facturación: los avisos de cobranza no tendrían destinatario.
          </Note>
        </div>
      ) : null}
      {list.error ? (
        <div className="card-b">
          <Note kind="warn" icon="tri" role="alert">
            {errorText(list.error)}{' '}
            <button type="button" className="btn sm" onClick={list.reload}>
              Reintentar
            </button>
          </Note>
        </div>
      ) : list.loading ? (
        <div className="card-b">Cargando…</div>
      ) : !rows.length ? (
        <EmptyState title="Sin contactos" text="Agregue al menos un contacto de facturación." />
      ) : (
        <div className="tw">
          <table className="t">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Correo / teléfono</th>
                <th>Roles</th>
                <th>Portal</th>
                <th>MFA</th>
                <th>Comercial</th>
                <th>Último acceso</th>
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {rows.map((k) => (
                <tr key={k.id}>
                  <td>
                    <b>{k.name}</b>
                    {k.is_primary ? <div className="sub">Principal</div> : null}
                  </td>
                  <td>
                    <span className="mono">{k.email ?? '—'}</span>
                    <div className="sub mono">{k.phone ?? k.whatsapp ?? ''}</div>
                  </td>
                  <td>{k.roles.length ? k.roles.map((r) => ROLE_LABEL[r]).join(', ') : '—'}</td>
                  <td>{k.portal_role ? <Chip kind="ok">{k.portal_role === 'customer_admin' ? 'Administrador' : 'Usuario'}</Chip> : 'Sin acceso'}</td>
                  <td>{k.portal_role ? (k.mfa_enabled ? 'Sí' : 'No') : '—'}</td>
                  <td>{k.consent.marketing_allowed_channels.length ? k.consent.marketing_allowed_channels.join(', ') : 'No'}</td>
                  <td className="nw">{fDateTime(k.last_login_at)}</td>
                  <td className="nw" style={{ textAlign: 'right' }}>
                    {canUpdate ? (
                      <>
                        <button type="button" className="btn sm" onClick={() => setForm(k)}>
                          Editar
                        </button>{' '}
                        {k.portal_role ? (
                          <>
                            <button type="button" className="btn sm" onClick={() => void run(() => customersApi.contacts.resendInvitation(k.id), 'Invitación reenviada')}>
                              Reenviar invitación
                            </button>{' '}
                            <button
                              type="button"
                              className="btn sm"
                              onClick={() => dialogs.confirm({ title: 'Quitar acceso al portal', body: `${k.name} ya no podrá entrar al portal.`, okLabel: 'Quitar acceso', danger: true, onOk: () => void run(() => customersApi.contacts.revokePortal(k.id), 'Acceso al portal retirado') })}
                            >
                              Quitar acceso
                            </button>
                          </>
                        ) : k.email ? (
                          <>
                            <select className="select" aria-label="Rol en el portal" value={grantRole[k.id] ?? 'customer_user'} onChange={(e) => setGrantRole((g) => ({ ...g, [k.id]: e.target.value as PortalRole }))}>
                              <option value="customer_user">Usuario</option>
                              <option value="customer_admin">Administrador</option>
                            </select>{' '}
                            <button type="button" className="btn sm" onClick={() => void run(() => customersApi.contacts.grantPortal(k.id, grantRole[k.id] ?? 'customer_user'), 'Acceso al portal concedido')}>
                              Dar acceso
                            </button>
                          </>
                        ) : null}{' '}
                        {k.portal_role ? (
                          <button
                            type="button"
                            className="btn sm"
                            onClick={() => void run(() => customersApi.contacts.grantPortal(k.id, k.portal_role === 'customer_admin' ? 'customer_user' : 'customer_admin'), 'Rol del portal actualizado')}
                          >
                            {k.portal_role === 'customer_admin' ? 'Pasar a usuario' : 'Hacer administrador'}
                          </button>
                        ) : null}{' '}
                      </>
                    ) : null}
                    {can('customers.contact.delete') ? (
                      <button
                        type="button"
                        className="btn sm"
                        aria-label={`Eliminar ${k.name}`}
                        onClick={() => dialogs.confirm({ title: 'Eliminar contacto', body: `Se eliminará ${k.name}.`, okLabel: 'Eliminar', danger: true, onOk: () => void run(() => customersApi.contacts.remove(k.id), 'Contacto eliminado') })}
                      >
                        <Icon name="trash" size="sm" />
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {form ? (
        <ContactForm
          customerId={customer.id}
          contact={form === 'new' ? undefined : form}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            toast(form === 'new' ? 'Contacto agregado' : 'Contacto actualizado');
            list.reload();
            onChange();
          }}
        />
      ) : null}
    </section>
  );
}

function ContactForm({ customerId, contact, onClose, onSaved }: { customerId: string; contact?: Contact; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState({ name: contact?.name ?? '', email: contact?.email ?? '', phone: contact?.phone ?? '', whatsapp: contact?.whatsapp ?? '', is_primary: contact?.is_primary ?? false, locale: contact?.locale ?? '' });
  const [roles, setRoles] = useState<ContactRole[]>(contact?.roles ?? []);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const idem = useRef(newIdempotencyKey());

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    setBusy(true);
    setErrs({});
    setMsg(null);
    const input: ContactInput = { name: v.name.trim(), email: v.email.trim() || null, phone: v.phone.trim() || null, whatsapp: v.whatsapp.trim() || null, roles, is_primary: v.is_primary, locale: (v.locale || null) as ContactInput['locale'] };
    try {
      if (contact) await customersApi.contacts.update(contact.id, contact.version, input);
      else await customersApi.contacts.create(customerId, input, idem.current);
      onSaved();
    } catch (e) {
      setErrs(fieldErrors(e));
      if (isProblem(e) && e.status >= 400 && e.status < 500) idem.current = newIdempotencyKey();
      setMsg(isProblem(e) && e.status === 422 ? 'Revise los campos marcados.' : errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const text = (k: 'name' | 'email' | 'phone' | 'whatsapp', label: string, type = 'text', full = false) => (
    <label className={`field${full ? ' full' : ''}`} htmlFor={`ct-${k}`}>
      {label}
      <input className="input" id={`ct-${k}`} type={type} value={v[k]} aria-invalid={!!errs[k]} onChange={(e) => setV((p) => ({ ...p, [k]: e.target.value }))} />
      {errs[k] ? <span className="err">{errs[k]}</span> : null}
    </label>
  );

  return (
    <Modal open onClose={onClose} title={contact ? 'Editar contacto' : 'Agregar contacto'} bare>
      <form onSubmit={(e) => void submit(e)} noValidate style={{ display: 'contents' }}>
        <div className="modal-b">
          <div className="form-grid">
            {text('name', 'Nombre *', 'text', true)}
            {text('email', 'Correo', 'email')}
            {text('phone', 'Teléfono', 'tel')}
            {text('whatsapp', 'WhatsApp', 'tel')}
            <label className="field" htmlFor="ct-locale">
              Idioma
              <select className="select" id="ct-locale" value={v.locale} onChange={(e) => setV((p) => ({ ...p, locale: e.target.value }))}>
                <option value="">El del cliente</option>
                <option value="es">Español</option>
                <option value="en">Inglés</option>
              </select>
            </label>
            <fieldset className="field full" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend>Roles de contacto</legend>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {CONTACT_ROLES.map((r) => (
                  <label key={r} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontWeight: 400 }}>
                    <input type="checkbox" checked={roles.includes(r)} onChange={(e) => setRoles((p) => (e.target.checked ? [...p, r] : p.filter((x) => x !== r)))} />
                    {ROLE_LABEL[r]}
                  </label>
                ))}
              </div>
              {errs.roles || errs['roles.0'] ? <span className="err">{errs.roles || errs['roles.0']}</span> : null}
            </fieldset>
            <label className="field full" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={v.is_primary} onChange={(e) => setV((p) => ({ ...p, is_primary: e.target.checked }))} />
              Contacto principal
            </label>
          </div>
          <div className="err" role="alert">
            {msg}
          </div>
        </div>
        <div className="modal-f">
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ---------- Notas internas ---------- */
function Notas({ customerId }: { customerId: string }) {
  const { toast, dialogs } = useApp();
  const can = useCan();
  const list = useLoad(() => customersApi.notes.list(customerId, { size: 100 }), [customerId]);
  const [body, setBody] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const add = async (ev: FormEvent) => {
    ev.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await customersApi.notes.create(customerId, body.trim());
      setBody('');
      list.reload();
    } catch (e) {
      setErr(fieldErrors(e).body ?? errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      list.reload();
    } catch (e) {
      toast('No se pudo completar', errorText(e), 'err');
      if (isProblem(e) && e.code === 'version_conflict') list.reload();
    }
  };

  const rows: CustomerNote[] = list.data?.data ?? [];
  return (
    <section className="card">
      <div className="card-h">
        <h2 className="sec">Notas internas</h2>
        <small className="sub">Nunca se muestran en el portal.</small>
      </div>
      {can('customers.customer_note.create') ? (
        <form className="card-b" onSubmit={(e) => void add(e)} noValidate>
          <label className="field" htmlFor="note-body">
            Nueva nota
            <textarea className="input" id="note-body" rows={3} value={body} aria-invalid={!!err} onChange={(e) => setBody(e.target.value)} />
            {err ? <span className="err">{err}</span> : null}
          </label>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button className="btn sm primary" type="submit" disabled={busy || !body.trim()}>
              Agregar nota
            </button>
          </div>
        </form>
      ) : null}
      {list.error ? (
        <div className="card-b">
          <Note kind="warn" icon="tri">
            {errorText(list.error)}
          </Note>
        </div>
      ) : !rows.length && !list.loading ? (
        <EmptyState title="Sin notas" />
      ) : (
        <ul className="rows">
          {rows.map((n) => (
            <li key={n.id}>
              <Icon name={n.is_pinned ? 'tag' : 'file'} />
              <div className="grow">
                <div style={{ whiteSpace: 'pre-wrap' }}>{n.body}</div>
                <small>
                  {fDateTime(n.created_at)}
                  {n.is_pinned ? ' · Fijada' : ''}
                </small>
              </div>
              {can('customers.customer_note.update') ? (
                <button type="button" className="btn sm" onClick={() => void act(() => customersApi.notes.update(n.id, n.version, { is_pinned: !n.is_pinned }))}>
                  {n.is_pinned ? 'Desfijar' : 'Fijar'}
                </button>
              ) : null}
              {can('customers.customer_note.delete') ? (
                <button
                  type="button"
                  className="btn sm"
                  aria-label="Eliminar nota"
                  onClick={() => dialogs.confirm({ title: 'Eliminar nota', okLabel: 'Eliminar', danger: true, onOk: () => void act(() => customersApi.notes.remove(n.id)) })}
                >
                  <Icon name="trash" size="sm" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ---------- Historial (auditoría del cliente y de los absorbidos) ---------- */
function Historial({ customerId }: { customerId: string }) {
  const [pages, setPages] = useState<string[]>(['']);
  return (
    <div className="card">
      <div className="card-b" style={{ paddingTop: 16 }}>
        <ol className="tl">
          {pages.map((cur, i) => (
            <HistoryPage key={cur || 'first'} customerId={customerId} cursor={cur || null} last={i === pages.length - 1} onMore={(next) => setPages((p) => [...p, next])} />
          ))}
        </ol>
      </div>
    </div>
  );
}

function HistoryPage({ customerId, cursor, last, onMore }: { customerId: string; cursor: string | null; last: boolean; onMore: (next: string) => void }) {
  const res = useLoad(() => customersApi.history(customerId, { cursor, size: 50 }), [customerId, cursor]);
  const rows: AuditEvent[] = res.data?.data ?? [];
  const next = res.data?.meta.next_cursor;
  return (
    <>
      {res.error ? <li>{errorText(res.error)}</li> : null}
      {!res.loading && !rows.length && !cursor ? <li>Sin eventos registrados.</li> : null}
      {rows.map((e) => (
        <li key={e.id}>
          <span className="nd now" />
          <div className="w">
            <b>{auditActionLabel(e.action)}</b>
            <span>{fDateTime(e.occurred_at)}</span>
          </div>
          <small>{ACTOR_LABELS[e.actor_type] ?? e.actor_type}</small>
        </li>
      ))}
      {last && next ? (
        <li>
          <button type="button" className="btn sm" onClick={() => onMore(next)}>
            Cargar más
          </button>
        </li>
      ) : null}
    </>
  );
}
