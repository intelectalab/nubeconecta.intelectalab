/**
 * Vista «boveda» (#boveda) — Bóveda (M-VLT) conectada al backend: accesos
 * cifrados, revelar con motivo + MFA reciente (step-up) + bitácora, concesiones
 * y enlaces de un solo uso. El valor nunca se lista; solo aparece al revelar.
 */
import { useState, type FormEvent } from 'react';
import { isProblem, type OneTimeLinkPurpose, type Secret, type SecretKind, type SecretOwnerType } from '@hub/api';
import { useApp } from '../../app/context';
import type { ViewProps } from '../../app/routes';
import { DataTable, type Column } from '../../components/DataTable';
import { Icon } from '../../components/Icon';
import { Modal } from '../../components/Modal';
import { Chip, EmptyState, Note, PageHead, Skeleton, Toolbar } from '../../components/ui';
import { errorText, fDate, fDateTime, useCan, useLoad, useLookups } from './clientes/shared';
import { hub } from '../../auth/client';

const vault = hub.vault;

const KIND_LABEL: Record<SecretKind, string> = {
  ssh: 'SSH', sftp: 'SFTP', ftp: 'FTP', cpanel: 'cPanel', whm: 'WHM', plesk: 'Plesk', panel: 'Panel', cloud: 'Cloud',
  registrar: 'Registrador', database: 'Base de datos', app_admin: 'Admin de app', api_token: 'Token API', private_key: 'Llave privada', other: 'Otro',
};
const KINDS = Object.keys(KIND_LABEL) as SecretKind[];
const OWNER_LABEL: Record<SecretOwnerType, string> = {
  provider_account: 'Cuenta de proveedor', server: 'Servidor', hosting_account: 'Cuenta de hosting', cloud_account: 'Cuenta cloud',
  domain: 'Dominio', resource: 'Recurso', saas_instance: 'Instancia SaaS', service: 'Servicio', customer: 'Cliente', webhook_endpoint: 'Webhook', wp_site: 'Sitio WordPress',
};
const OWNER_TYPES = Object.keys(OWNER_LABEL) as SecretOwnerType[];
const PURPOSE_LABEL: Record<OneTimeLinkPurpose, string> = {
  credential_delivery: 'Entrega de credencial', domain_auth_code: 'Código de autorización', welcome_access: 'Acceso de bienvenida', account_handover: 'Traspaso de cuenta',
};
const ACTION_LABEL: Record<string, string> = { reveal: 'Revelada', copy: 'Copiada', connector_use: 'Uso por conector', reveal_denied: 'Denegada', one_time_link: 'Enlace de un solo uso' };

export default function BovedaView(_props: ViewProps) {
  const can = useCan();
  const canCreate = can('vault.secret.create');
  const res = useLoad(() => vault.list({ size: 100 }), []);
  const rows = res.data?.data ?? [];

  const [form, setForm] = useState(false);
  const [reveal, setReveal] = useState<Secret | null>(null);
  const [grants, setGrants] = useState<Secret | null>(null);
  const [logs, setLogs] = useState<Secret | null>(null);
  const [links, setLinks] = useState<Secret | null>(null);

  const cols: Column<Secret>[] = [
    { key: 'name', header: 'Acceso', render: (s) => <div><strong>{s.name}</strong><div className="muted sm"><Chip kind="outline">{KIND_LABEL[s.kind]}</Chip></div></div>, sort: (s) => s.name },
    { key: 'owner', header: 'Pertenece a', render: (s) => OWNER_LABEL[s.owner_type] },
    { key: 'customer', header: 'Cliente', render: (s) => s.customer?.name ?? '—' },
    { key: 'cred', header: 'Usuario / host', className: 'mono sub', render: (s) => <span style={{ overflowWrap: 'anywhere' }}>{[s.username, s.host].filter(Boolean).join(' @ ') || '—'}</span> },
    { key: 'rot', header: 'Rotación', className: 'num', render: (s) => fDate(s.rotates_at), sort: (s) => s.rotates_at ?? '' },
    {
      key: 'actions', header: '', align: 'r', render: (s) => (
        <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          {can('vault.secret.reveal') ? <button className="btn sm" onClick={() => setReveal(s)}><Icon name="eye" size="sm" /> Revelar</button> : null}
          {can('vault.secret_grant.view') ? <button className="btn sm" onClick={() => setGrants(s)}>Concesiones</button> : null}
          {can('vault.one_time_link.create') ? <button className="btn sm" onClick={() => setLinks(s)}>Enlace</button> : null}
          {can('vault.secret_access_log.view') ? <button className="btn sm" onClick={() => setLogs(s)}>Bitácora</button> : null}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHead
        crumbs={[['Infraestructura', 'boveda'], ['Bóveda', 'boveda']]}
        title="Bóveda de accesos"
        sub="Credenciales cifradas. Revelar exige motivo y segundo factor reciente, y queda en bitácora."
        actions={canCreate ? <button type="button" className="btn primary" onClick={() => setForm(true)}><Icon name="plus" size="sm" /> Agregar acceso</button> : undefined}
      />
      <div className="card">
        <Toolbar />
        {res.error ? <div className="card-b"><Note kind="warn">No se pudo cargar: {errorText(res.error)} <button className="btn sm" onClick={res.reload}>Reintentar</button></Note></div>
          : res.loading ? <div className="card-b"><Skeleton rows={6} /></div>
            : rows.length === 0 ? <div className="card-b"><EmptyState icon="key" title="Sin accesos" text="Aún no hay accesos en la bóveda. Agrega el primero." /></div>
              : <DataTable columns={cols} rows={rows} rowKey={(s) => s.id} caption="Accesos" defaultSort={{ key: 'name', dir: 1 }} />}
      </div>

      {form ? <SecretForm onClose={() => setForm(false)} onSaved={() => { setForm(false); res.reload(); }} /> : null}
      {reveal ? <RevealModal secret={reveal} onClose={() => setReveal(null)} /> : null}
      {grants ? <GrantsModal secret={grants} onClose={() => setGrants(null)} /> : null}
      {logs ? <LogsModal secret={logs} onClose={() => setLogs(null)} /> : null}
      {links ? <LinksModal secret={links} onClose={() => setLinks(null)} /> : null}
    </>
  );
}

function SecretForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { toast } = useApp();
  const [kind, setKind] = useState<SecretKind>('cpanel');
  const [name, setName] = useState('');
  const [ownerType, setOwnerType] = useState<SecretOwnerType>('service');
  const [ownerId, setOwnerId] = useState('');
  const [username, setUsername] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('');
  const [value, setValue] = useState('');
  const [rotates, setRotates] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await vault.create({
        kind, name, owner_type: ownerType, owner_id: ownerId, value,
        username: username || null, host: host || null, port: port ? Number(port) : null, rotates_at: rotates || null,
      });
      toast('Acceso guardado', 'La contraseña se cifró en la bóveda.');
      onSaved();
    } catch (err) {
      toast('No se pudo guardar', errorText(err), 'err');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open wide bare onClose={onClose} title="Agregar acceso" sub="El valor se cifra y nunca vuelve a mostrarse en el listado">
      <form className="modal-b" onSubmit={(e) => void submit(e)}>
        <label className="field">Tipo*<select className="input" value={kind} onChange={(e) => setKind(e.target.value as SecretKind)}>{KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select></label>
        <label className="field">Nombre*<input required className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="cPanel de cliente X" /></label>
        <label className="field">Pertenece a*<select className="input" value={ownerType} onChange={(e) => setOwnerType(e.target.value as SecretOwnerType)}>{OWNER_TYPES.map((o) => <option key={o} value={o}>{OWNER_LABEL[o]}</option>)}</select></label>
        <label className="field">ID del propietario (UUID)*<input required className="input mono" value={ownerId} onChange={(e) => setOwnerId(e.target.value)} placeholder="uuid del servicio/servidor/…" /></label>
        <label className="field">Usuario<input className="input" value={username} onChange={(e) => setUsername(e.target.value)} /></label>
        <label className="field">Host<input className="input" value={host} onChange={(e) => setHost(e.target.value)} /></label>
        <label className="field">Puerto<input className="input" type="number" min={1} max={65535} value={port} onChange={(e) => setPort(e.target.value)} /></label>
        <label className="field">Rotación<input className="input" type="date" value={rotates} onChange={(e) => setRotates(e.target.value)} /></label>
        <label className="field full">Valor / contraseña*<input required className="input" type="password" autoComplete="new-password" value={value} onChange={(e) => setValue(e.target.value)} /></label>
        <div className="modal-f"><button type="button" className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={busy}>Guardar cifrado</button></div>
      </form>
    </Modal>
  );
}

function RevealModal({ secret, onClose }: { secret: Secret; onClose: () => void }) {
  const { toast } = useApp();
  const [reason, setReason] = useState('');
  const [value, setValue] = useState<string | null>(null);
  const [needCode, setNeedCode] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  async function doReveal() {
    const v = await vault.reveal(secret.id, reason);
    setValue(v);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (needCode) {
        await hub.auth.stepUp(code);
        setNeedCode(false);
      }
      await doReveal();
    } catch (err) {
      if (isProblem(err) && err.code === 'mfa_required') {
        setNeedCode(true);
        toast('Reingresa tu código 2FA', 'La revelación exige segundo factor reciente.', 'info');
      } else {
        toast('No se pudo revelar', errorText(err), 'err');
      }
    } finally {
      setBusy(false);
    }
  }

  const copy = () => { try { void navigator.clipboard.writeText(value ?? ''); toast('Copiado'); } catch { /* sin portapapeles */ } };

  return (
    <Modal open bare onClose={onClose} title="Revelar acceso" sub={`${secret.name} · ${KIND_LABEL[secret.kind]}`}>
      {value === null ? (
        <form className="modal-b" onSubmit={(e) => void submit(e)}>
          <Note kind="warn" icon="shield">Quedará registrado quién, cuándo y por qué. Exige una concesión vigente y segundo factor reciente.</Note>
          <label className="field full" style={{ marginTop: 10 }}>Motivo*<input required className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Atención de ticket TK-…" /></label>
          {needCode ? <label className="field full">Código 2FA*<input required className="input mono" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" placeholder="123456" /></label> : null}
          <div className="modal-f"><button type="button" className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={busy || reason.trim().length < 3}>{needCode ? 'Verificar y revelar' : 'Revelar'}</button></div>
        </form>
      ) : (
        <>
          <div className="modal-b">
            <Note icon="info">Copia el valor ahora; al cerrar no vuelve a mostrarse.</Note>
            <div style={{ marginTop: 12 }}>
              {secret.username ? <div><span className="muted sm">Usuario</span><div className="mono strong">{secret.username}</div></div> : null}
              <div style={{ marginTop: 8 }}><span className="muted sm">Valor</span><div className="mono strong" style={{ wordBreak: 'break-all', fontSize: 15 }}>{value}</div></div>
            </div>
          </div>
          <div className="modal-f"><button type="button" className="btn" onClick={copy}><Icon name="copy" size="sm" /> Copiar</button><button className="btn primary" onClick={onClose}>Cerrar</button></div>
        </>
      )}
    </Modal>
  );
}

function GrantsModal({ secret, onClose }: { secret: Secret; onClose: () => void }) {
  const { toast } = useApp();
  const { staff } = useLookups();
  const rolesRes = useLoad(() => hub.identity.roles.list().then((r) => r.data), []);
  const res = useLoad(() => vault.grants(secret.id), []);
  const [target, setTarget] = useState<'user' | 'role'>('role');
  const [targetId, setTargetId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!targetId) return;
    setBusy(true);
    try {
      await vault.createGrant(secret.id, { [target === 'user' ? 'user_id' : 'role_id']: targetId, reason: reason || undefined });
      toast('Concesión otorgada');
      setTargetId(''); setReason('');
      res.reload();
    } catch (err) {
      toast('No se pudo', errorText(err), 'err');
    } finally {
      setBusy(false);
    }
  }

  const revoke = async (id: string) => {
    try { await vault.revokeGrant(secret.id, id); toast('Concesión revocada'); res.reload(); } catch (err) { toast('No se pudo', errorText(err), 'err'); }
  };

  return (
    <Modal open wide bare onClose={onClose} title="Concesiones de acceso" sub={secret.name}>
      <div className="modal-b">
        <form onSubmit={(e) => void add(e)} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr auto', gap: 8, alignItems: 'end' }}>
          <label className="field">A<select className="input" value={target} onChange={(e) => { setTarget(e.target.value as 'user' | 'role'); setTargetId(''); }}><option value="role">Rol</option><option value="user">Usuario</option></select></label>
          <label className="field">{target === 'role' ? 'Rol' : 'Usuario'}
            <select className="input" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
              <option value="">— Elegir —</option>
              {target === 'role' ? (rolesRes.data ?? []).filter((r) => r.audience === 'staff').map((r) => <option key={r.id} value={r.id}>{r.name}</option>)
                : staff.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </label>
          <label className="field">Motivo<input className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></label>
          <button className="btn primary" disabled={busy || !targetId}>Otorgar</button>
        </form>

        <div style={{ marginTop: 14 }}>
          {res.loading ? <Skeleton rows={3} /> : (res.data ?? []).length === 0 ? <p className="sub">Sin concesiones. Nadie puede revelar este acceso.</p> : (
            <ul className="rows">
              {(res.data ?? []).map((g) => (
                <li key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div className="grow">
                    <b>{g.user?.name ?? g.role?.name ?? '—'}</b> <Chip kind={g.active ? 'ok' : ''}>{g.active ? 'Vigente' : 'Inactiva'}</Chip>
                    <small className="sub"> {g.reason ?? ''}{g.expires_at ? ` · vence ${fDate(g.expires_at)}` : ''}</small>
                  </div>
                  {g.revoked_at === null ? <button className="btn sm danger" onClick={() => void revoke(g.id)}>Revocar</button> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="modal-f"><button className="btn primary" onClick={onClose}>Cerrar</button></div>
    </Modal>
  );
}

function LogsModal({ secret, onClose }: { secret: Secret; onClose: () => void }) {
  const res = useLoad(() => vault.accessLogs(secret.id, { size: 50 }), []);
  const rows = res.data?.data ?? [];
  const cols: Column<(typeof rows)[number]>[] = [
    { key: 'when', header: 'Fecha', className: 'num nw', render: (l) => fDateTime(l.created_at), sort: (l) => l.created_at ?? '' },
    { key: 'action', header: 'Acción', render: (l) => <Chip kind={l.action === 'reveal_denied' ? 'danger' : l.action === 'reveal' ? 'warn' : ''}>{ACTION_LABEL[l.action] ?? l.action}</Chip> },
    { key: 'user', header: 'Usuario', render: (l) => l.user?.name ?? '— (cliente/conector)' },
    { key: 'reason', header: 'Motivo', render: (l) => l.reason ?? '—' },
    { key: 'ip', header: 'IP', className: 'mono sub', render: (l) => l.ip ?? '—' },
  ];

  return (
    <Modal open wide bare onClose={onClose} title="Bitácora de accesos" sub={secret.name}>
      <div className="modal-b">
        {res.loading ? <Skeleton rows={5} /> : rows.length === 0 ? <p className="sub">Sin movimientos registrados.</p>
          : <DataTable columns={cols} rows={rows} rowKey={(l) => l.id} caption="Bitácora" />}
      </div>
      <div className="modal-f"><button className="btn primary" onClick={onClose}>Cerrar</button></div>
    </Modal>
  );
}

function LinksModal({ secret, onClose }: { secret: Secret; onClose: () => void }) {
  const { toast } = useApp();
  const res = useLoad(() => vault.oneTimeLinks(secret.id), []);
  const [purpose, setPurpose] = useState<OneTimeLinkPurpose>('credential_delivery');
  const [minutes, setMinutes] = useState('1440');
  const [maxViews, setMaxViews] = useState('1');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ token: string; path: string } | null>(null);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await vault.createOneTimeLink({ purpose, secret_id: secret.id, max_views: Number(maxViews), expires_in_minutes: Number(minutes) });
      setCreated({ token: r.token, path: r.consume_path });
      toast('Enlace creado', 'Cópialo ahora: el token se muestra una sola vez.');
      res.reload();
    } catch (err) {
      if (isProblem(err) && err.code === 'mfa_required') toast('Reingresa tu 2FA', 'Crear un enlace exige segundo factor reciente (revela primero un acceso para refrescarlo).', 'info');
      else toast('No se pudo', errorText(err), 'err');
    } finally {
      setBusy(false);
    }
  }

  const revoke = async (id: string) => {
    try { await vault.revokeOneTimeLink(id); toast('Enlace revocado'); res.reload(); } catch (err) { toast('No se pudo', errorText(err), 'err'); }
  };

  return (
    <Modal open wide bare onClose={onClose} title="Enlaces de un solo uso" sub={secret.name}>
      <div className="modal-b">
        <form onSubmit={(e) => void create(e)} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 100px auto', gap: 8, alignItems: 'end' }}>
          <label className="field">Propósito<select className="input" value={purpose} onChange={(e) => setPurpose(e.target.value as OneTimeLinkPurpose)}>{(Object.keys(PURPOSE_LABEL) as OneTimeLinkPurpose[]).map((p) => <option key={p} value={p}>{PURPOSE_LABEL[p]}</option>)}</select></label>
          <label className="field">Vence (min)<input className="input" type="number" min={5} max={20160} value={minutes} onChange={(e) => setMinutes(e.target.value)} /></label>
          <label className="field">Vistas<input className="input" type="number" min={1} max={10} value={maxViews} onChange={(e) => setMaxViews(e.target.value)} /></label>
          <button className="btn primary" disabled={busy}>Crear enlace</button>
        </form>

        {created ? (
          <Note kind="warn" style={{ marginTop: 12 }}>
            <b>Comparte este enlace (se muestra una sola vez):</b>
            <div className="mono" style={{ wordBreak: 'break-all', marginTop: 6 }}>{created.path}</div>
            <button className="btn sm" style={{ marginTop: 6 }} onClick={() => { try { void navigator.clipboard.writeText(created.path); toast('Copiado'); } catch { /* */ } }}><Icon name="copy" size="sm" /> Copiar ruta</button>
          </Note>
        ) : null}

        <div style={{ marginTop: 14 }}>
          {res.loading ? <Skeleton rows={3} /> : (res.data ?? []).length === 0 ? <p className="sub">Sin enlaces para este acceso.</p> : (
            <ul className="rows">
              {(res.data ?? []).map((l) => (
                <li key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div className="grow">
                    <b>{PURPOSE_LABEL[l.purpose]}</b> <Chip kind={l.usable ? 'ok' : ''}>{l.usable ? 'Disponible' : l.consumed_at ? 'Usado' : l.revoked_at ? 'Revocado' : 'Vencido'}</Chip>
                    <small className="sub"> {l.views_count}/{l.max_views} vistas{l.expires_at ? ` · vence ${fDateTime(l.expires_at)}` : ''}</small>
                  </div>
                  {l.usable ? <button className="btn sm danger" onClick={() => void revoke(l.id)}>Revocar</button> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="modal-f"><button className="btn primary" onClick={onClose}>Cerrar</button></div>
    </Modal>
  );
}
