/**
 * Vista «plataforma» (#plataforma) — Multitenancy Fase 1: gestión de inquilinos
 * (organizaciones cliente del SaaS) y de los planes de suscripción, por el
 * operador. Conectada al backend (módulo Tenancy). El backend restringe estos
 * endpoints a la organización operadora y al superadministrador; si el usuario
 * no tiene acceso, la API responde 403 y la vista lo muestra.
 */
import { useState, type FormEvent } from 'react';
import { type SaasPlan, type SaasPlanInput, type SaasStatus, type Tenant, type TenantCreated } from '@hub/api';
import { useApp } from '../../app/context';
import type { ViewProps } from '../../app/routes';
import { DataTable, type Column } from '../../components/DataTable';
import { Icon } from '../../components/Icon';
import { Modal } from '../../components/Modal';
import { Chip, EmptyState, Note, PageHead, Skeleton, Tabs, Toolbar, type TabDef } from '../../components/ui';
import { COUNTRY_OPTIONS, errorText, fDate, moneyMinor, useCan, useLoad } from './clientes/shared';
import { hub } from '../../auth/client';

const tenancy = hub.tenancy;

type Tab = 'inquilinos' | 'planes';
const TABS: TabDef<Tab>[] = [{ id: 'inquilinos', label: 'Inquilinos' }, { id: 'planes', label: 'Planes' }];

const SAAS_CHIP: Record<SaasStatus, 'ok' | 'info' | 'warn' | 'danger' | ''> = { active: 'ok', trial: 'info', suspended: 'danger', cancelled: '' };
const SAAS_LABEL: Record<SaasStatus, string> = { active: 'Activo', trial: 'Prueba', suspended: 'Suspendido', cancelled: 'Cancelado' };
const limit = (n: number | null) => (n === null ? '∞' : String(n));

export default function PlataformaView({ param }: ViewProps) {
  const initial = (TABS.some((t) => t.id === param) ? param : 'inquilinos') as Tab;
  const [tab, setTab] = useState<Tab>(initial);

  return (
    <>
      <PageHead title="Plataforma SaaS" sub="Inquilinos y planes de suscripción" />
      <Tabs tabs={TABS} value={tab} onChange={setTab} label="Secciones de la plataforma" />
      {tab === 'inquilinos' ? <TenantsTab /> : <PlansTab />}
    </>
  );
}

/* ---------------------------------- Inquilinos ---------------------------------- */

function TenantsTab() {
  const { toast, dialogs } = useApp();
  const can = useCan();
  const canCreate = can('tenancy.tenant.create');
  const canUpdate = can('tenancy.tenant.update');

  const res = useLoad(() => tenancy.listTenants({ size: 100 }), []);
  const plansRes = useLoad(() => tenancy.listPlans(), []);
  const rows = res.data?.data ?? [];
  const activePlans = (plansRes.data ?? []).filter((p) => p.status === 'active');

  const [form, setForm] = useState(false);
  const [created, setCreated] = useState<TenantCreated | null>(null);
  const [planFor, setPlanFor] = useState<Tenant | null>(null);

  const toggleStatus = (t: Tenant) => {
    const suspend = t.status === 'active';
    dialogs.confirm({
      title: suspend ? 'Suspender inquilino' : 'Reactivar inquilino',
      body: <p>{suspend ? <>Se suspenderá <strong>{t.name}</strong> y se cerrarán las sesiones de sus usuarios.</> : <>Se reactivará <strong>{t.name}</strong>.</>}</p>,
      okLabel: suspend ? 'Suspender' : 'Reactivar',
      onOk: async () => {
        try {
          await (suspend ? tenancy.suspendTenant(t.id) : tenancy.reactivateTenant(t.id));
          toast(suspend ? 'Inquilino suspendido' : 'Inquilino reactivado');
          res.reload();
        } catch (e) {
          toast('No se pudo', errorText(e), 'err');
        }
      },
    });
  };

  const cols: Column<Tenant>[] = [
    { key: 'name', header: 'Inquilino', render: (t) => <div><strong>{t.name}</strong><div className="muted sm">{t.slug}</div></div>, sort: (t) => t.name },
    { key: 'plan', header: 'Plan', render: (t) => t.plan?.name ?? '—' },
    { key: 'saas', header: 'Suscripción', render: (t) => (t.saas_status ? <Chip kind={SAAS_CHIP[t.saas_status]}>{SAAS_LABEL[t.saas_status]}</Chip> : '—') },
    { key: 'renewal', header: 'Renovación', render: (t) => fDate(t.saas_renewal_date), sort: (t) => t.saas_renewal_date ?? '' },
    { key: 'created', header: 'Alta', render: (t) => fDate(t.created_at), sort: (t) => t.created_at ?? '' },
    {
      key: 'actions', header: '', align: 'r', render: (t) => (canUpdate ? (
        <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end' }}>
          <button className="btn sm" onClick={() => setPlanFor(t)} disabled={activePlans.length === 0}>Plan</button>
          <button className={`btn sm${t.status === 'active' ? ' danger' : ''}`} onClick={() => toggleStatus(t)}>{t.status === 'active' ? 'Suspender' : 'Reactivar'}</button>
        </div>
      ) : null),
    },
  ];

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <Toolbar>
        {canCreate ? <button className="btn primary" onClick={() => setForm(true)}><Icon name="plus" size="sm" /> Nuevo inquilino</button> : null}
      </Toolbar>
      {res.error ? <div className="card-b"><Note kind="warn">No se pudo cargar: {errorText(res.error)} <button className="btn sm" onClick={res.reload}>Reintentar</button></Note></div>
        : res.loading ? <div className="card-b"><Skeleton rows={5} /></div>
          : rows.length === 0 ? <div className="card-b"><EmptyState title="Sin inquilinos" text="Aún no hay inquilinos. Crea el primero." icon="building" /></div>
            : <DataTable columns={cols} rows={rows} rowKey={(t) => t.id} caption="Inquilinos" defaultSort={{ key: 'created', dir: -1 }} />}

      {form ? <TenantForm plans={activePlans} onClose={() => setForm(false)} onCreated={(c) => { setForm(false); setCreated(c); res.reload(); }} /> : null}
      {created ? <CredentialsModal created={created} onClose={() => setCreated(null)} /> : null}
      {planFor ? <PlanChangeModal tenant={planFor} plans={activePlans} onClose={() => setPlanFor(null)} onSaved={() => { setPlanFor(null); res.reload(); }} /> : null}
    </div>
  );
}

function TenantForm({ plans, onClose, onCreated }: { plans: SaasPlan[]; onClose: () => void; onCreated: (c: TenantCreated) => void }) {
  const { toast } = useApp();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [subdomain, setSubdomain] = useState('');
  const [country, setCountry] = useState('PE');
  const [planId, setPlanId] = useState('');
  const [renewal, setRenewal] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [busy, setBusy] = useState(false);

  const slugify = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const created = await tenancy.createTenant({
        name, slug: slug || slugify(name), subdomain: subdomain || null, country,
        saas_plan_id: planId || null, saas_renewal_date: renewal || null,
        admin_name: adminName, admin_email: adminEmail,
      });
      toast('Inquilino creado');
      onCreated(created);
    } catch (err) {
      toast('No se pudo crear', errorText(err), 'err');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open wide bare onClose={onClose} title="Nuevo inquilino" sub="Crea la organización, sus roles y su primer administrador">
      <form className="modal-b" onSubmit={(e) => void submit(e)}>
        <label className="field">Nombre*<input required className="input" value={name} onChange={(e) => { setName(e.target.value); if (!slug) setSlug(''); }} /></label>
        <label className="field">Identificador (slug)*<input required className="input" value={slug} placeholder={slugify(name) || 'mi-inquilino'} pattern="[a-z0-9\-]+" onChange={(e) => setSlug(e.target.value)} /></label>
        <label className="field">Subdominio<input className="input" value={subdomain} placeholder="hostinga" pattern="[a-z0-9][a-z0-9-]*" onChange={(e) => setSubdomain(e.target.value.toLowerCase())} /></label>
        <label className="field">País<select className="input" value={country} onChange={(e) => setCountry(e.target.value)}>{COUNTRY_OPTIONS.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select></label>
        <label className="field">Plan<select className="input" value={planId} onChange={(e) => setPlanId(e.target.value)}><option value="">— Sin plan —</option>{plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label className="field">Renovación<input className="input" type="date" value={renewal} onChange={(e) => setRenewal(e.target.value)} /></label>
        <div className="field full" style={{ borderTop: '1px solid var(--line)', paddingTop: 10, fontWeight: 600 }}>Primer administrador del inquilino</div>
        <label className="field">Nombre del admin*<input required className="input" value={adminName} onChange={(e) => setAdminName(e.target.value)} /></label>
        <label className="field">Correo del admin*<input required className="input" type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} /></label>
        <div className="modal-f"><button type="button" className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={busy}>Crear inquilino</button></div>
      </form>
    </Modal>
  );
}

function CredentialsModal({ created, onClose }: { created: TenantCreated; onClose: () => void }) {
  return (
    <Modal open bare onClose={onClose} title="Inquilino creado" sub="Guarda estas credenciales ahora">
      <div className="modal-b">
        <Note icon="info">Esta contraseña temporal se muestra <strong>una sola vez</strong>. Entrégasela al administrador del inquilino: al entrar deberá cambiarla y activar el segundo factor (2FA).</Note>
        <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
          <div><span className="muted sm">Correo</span><div className="mono strong">{created.admin.email}</div></div>
          <div><span className="muted sm">Contraseña temporal</span><div className="mono strong" style={{ fontSize: 16 }}>{created.temporary_password}</div></div>
        </div>
      </div>
      <div className="modal-f"><button className="btn primary" onClick={onClose}>Entendido</button></div>
    </Modal>
  );
}

function PlanChangeModal({ tenant, plans, onClose, onSaved }: { tenant: Tenant; plans: SaasPlan[]; onClose: () => void; onSaved: () => void }) {
  const { toast } = useApp();
  const [planId, setPlanId] = useState(tenant.plan?.id ?? plans[0]?.id ?? '');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await tenancy.changeTenantPlan(tenant.id, planId);
      toast('Plan actualizado');
      onSaved();
    } catch (err) {
      toast('No se pudo', errorText(err), 'err');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open bare onClose={onClose} title="Cambiar plan" sub={tenant.name}>
      <form className="modal-b" onSubmit={(e) => void submit(e)}>
        <label className="field full">Plan*<select required className="input" value={planId} onChange={(e) => setPlanId(e.target.value)}>{plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <div className="modal-f"><button type="button" className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={busy || !planId}>Guardar</button></div>
      </form>
    </Modal>
  );
}

/* ------------------------------------ Planes ------------------------------------ */

function PlansTab() {
  const { toast, dialogs } = useApp();
  const can = useCan();
  const canManage = can('tenancy.plan.manage');

  const res = useLoad(() => tenancy.listPlans(), []);
  const rows = res.data ?? [];
  const [form, setForm] = useState<SaasPlan | 'new' | null>(null);

  const archive = (p: SaasPlan) => dialogs.confirm({
    title: 'Archivar plan', body: <p>¿Archivar el plan <strong>{p.name}</strong>? Dejará de ofrecerse a inquilinos nuevos.</p>, okLabel: 'Archivar',
    onOk: async () => { try { await tenancy.archivePlan(p.id); toast('Plan archivado'); res.reload(); } catch (e) { toast('No se pudo', errorText(e), 'err'); } },
  });

  const cols: Column<SaasPlan>[] = [
    { key: 'name', header: 'Plan', render: (p) => <div><strong>{p.name}</strong><div className="muted sm">{p.code}</div></div>, sort: (p) => p.name },
    { key: 'price', header: 'Precio/mes', align: 'r', className: 'num', render: (p) => moneyMinor(p.price_minor, p.currency), sort: (p) => p.price_minor },
    { key: 'limits', header: 'Límites (staff / clientes / servicios)', render: (p) => `${limit(p.max_staff_users)} / ${limit(p.max_customers)} / ${limit(p.max_services)}` },
    { key: 'status', header: 'Estado', render: (p) => <Chip kind={p.status === 'active' ? 'ok' : ''}>{p.status === 'active' ? 'Activo' : 'Archivado'}</Chip> },
    {
      key: 'actions', header: '', align: 'r', render: (p) => (canManage ? (
        <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end' }}>
          <button className="btn sm" onClick={() => setForm(p)}>Editar</button>
          {p.status === 'active' ? <button className="btn sm danger" onClick={() => archive(p)}>Archivar</button> : null}
        </div>
      ) : null),
    },
  ];

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <Toolbar>
        {canManage ? <button className="btn primary" onClick={() => setForm('new')}><Icon name="plus" size="sm" /> Nuevo plan</button> : null}
      </Toolbar>
      {res.error ? <div className="card-b"><Note kind="warn">No se pudo cargar: {errorText(res.error)} <button className="btn sm" onClick={res.reload}>Reintentar</button></Note></div>
        : res.loading ? <div className="card-b"><Skeleton rows={4} /></div>
          : rows.length === 0 ? <div className="card-b"><EmptyState title="Sin planes" text="Crea el primer plan de suscripción." icon="tag" /></div>
            : <DataTable columns={cols} rows={rows} rowKey={(p) => p.id} caption="Planes" />}
      {form ? <PlanForm plan={form === 'new' ? null : form} onClose={() => setForm(null)} onSaved={() => { setForm(null); res.reload(); }} /> : null}
    </div>
  );
}

function PlanForm({ plan, onClose, onSaved }: { plan: SaasPlan | null; onClose: () => void; onSaved: () => void }) {
  const { toast } = useApp();
  const [code, setCode] = useState(plan?.code ?? '');
  const [name, setName] = useState(plan?.name ?? '');
  const [price, setPrice] = useState(plan ? String(plan.price_minor / 100) : '');
  const [currency, setCurrency] = useState<'PEN' | 'USD'>(plan?.currency ?? 'PEN');
  const [staff, setStaff] = useState(plan?.max_staff_users != null ? String(plan.max_staff_users) : '');
  const [customers, setCustomers] = useState(plan?.max_customers != null ? String(plan.max_customers) : '');
  const [services, setServices] = useState(plan?.max_services != null ? String(plan.max_services) : '');
  const [busy, setBusy] = useState(false);

  const num = (s: string): number | null => (s.trim() === '' ? null : Math.max(1, Math.round(Number(s))));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const input: SaasPlanInput = {
      code, name, price_minor: Math.max(0, Math.round(Number(price) * 100)), currency,
      max_staff_users: num(staff), max_customers: num(customers), max_services: num(services),
    };
    try {
      if (plan) await tenancy.updatePlan(plan.id, input); else await tenancy.createPlan(input);
      toast(plan ? 'Plan actualizado' : 'Plan creado');
      onSaved();
    } catch (err) {
      toast('No se pudo guardar', errorText(err), 'err');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open wide bare onClose={onClose} title={plan ? 'Editar plan' : 'Nuevo plan'}>
      <form className="modal-b" onSubmit={(e) => void submit(e)}>
        <label className="field">Código*<input required className="input" value={code} pattern="[a-z0-9_\-]+" placeholder="pro" onChange={(e) => setCode(e.target.value)} /></label>
        <label className="field">Nombre*<input required className="input" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="field">Precio/mes*<input required className="input" type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} /></label>
        <label className="field">Moneda*<select className="input" value={currency} onChange={(e) => setCurrency(e.target.value as 'PEN' | 'USD')}><option value="PEN">PEN</option><option value="USD">USD</option></select></label>
        <label className="field">Máx. usuarios staff<input className="input" type="number" min={1} value={staff} placeholder="∞" onChange={(e) => setStaff(e.target.value)} /></label>
        <label className="field">Máx. clientes<input className="input" type="number" min={1} value={customers} placeholder="∞" onChange={(e) => setCustomers(e.target.value)} /></label>
        <label className="field">Máx. servicios<input className="input" type="number" min={1} value={services} placeholder="∞" onChange={(e) => setServices(e.target.value)} /></label>
        <div className="modal-f"><button type="button" className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={busy}>Guardar</button></div>
      </form>
    </Modal>
  );
}
