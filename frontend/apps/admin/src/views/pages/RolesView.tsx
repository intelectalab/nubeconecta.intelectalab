import { useEffect, useMemo, useState } from 'react';
import { isProblem, type AdminUser, type AdminUserInput, type IdentityAudience, type Permission, type Role, type RoleInput } from '@hub/api';
import type { ViewProps } from '../../app/routes';
import { useApp } from '../../app/context';
import { DataTable, type Column } from '../../components/DataTable';
import { Modal } from '../../components/Modal';
import { Chip, Note, PageHead, Select, Tabs, Toolbar } from '../../components/ui';
import { errorText, useCan, useLoad } from './clientes/shared';
import { identityApi } from './identidad/shared';

type Tab = 'usuarios' | 'roles';
type UserDraft = { name: string; email: string; type: IdentityAudience; password: string; roles: string[] };
type RoleDraft = { code: string; name: string; description: string; audience: IdentityAudience };
const PAGE_SIZE = 50;
const audienceLabel: Record<IdentityAudience, string> = { staff: 'Personal', customer: 'Cliente' };

export default function RolesView({ param }: ViewProps) {
  const { toast, dialogs } = useApp();
  const can = useCan();
  const [tab, setTab] = useState<Tab>(param === 'roles' ? 'roles' : 'usuarios');
  const [userCursor, setUserCursor] = useState<string | null>(null);
  const [usersTick, setUsersTick] = useState(0);
  const [rolesTick, setRolesTick] = useState(0);
  const [userModal, setUserModal] = useState<{ user?: AdminUser } | null>(null);
  const [roleModal, setRoleModal] = useState<{ role?: Role; copy?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [roleFilter, setRoleFilter] = useState<IdentityAudience | ''>('');
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const canUsers = can('identity.user.view');
  const canRoles = can('identity.role.view');
  const canPermissionView = can('identity.permission.view');
  const userList = useLoad(() => canUsers ? identityApi.users.list({ size: PAGE_SIZE, cursor: userCursor }) : Promise.resolve(null), [canUsers, userCursor, usersTick]);
  const roleList = useLoad(() => canRoles ? identityApi.roles.list() : Promise.resolve(null), [canRoles, rolesTick]);
  const permissionList = useLoad(() => canPermissionView ? identityApi.permissions.list() : Promise.resolve([] as Permission[]), [canPermissionView]);
  const matrix = useLoad(() => canPermissionView ? identityApi.permissions.matrix() : Promise.resolve(null), [canPermissionView, rolesTick]);
  const users = userList.data?.data ?? [];
  const roles = roleList.data?.data ?? [];
  const shownRoles = roles.filter((r) => !roleFilter || r.audience === roleFilter);
  const activeRole = roles.find((r) => r.id === selectedRoleId) ?? shownRoles[0] ?? null;
  const matrixRole = activeRole ? matrix.data?.roles.find((r) => r.id === activeRole.id) : null;
  const permissions = permissionList.data ?? [];
  const grouped = useMemo(() => permissions.reduce<Record<string, Record<string, Permission[]>>>((acc, p) => {
    (acc[p.module] ??= {})[p.entity] ??= [];
    acc[p.module][p.entity].push(p);
    return acc;
  }, {}), [permissions]);

  useEffect(() => { if (param === 'usuarios' || param === 'roles') setTab(param); }, [param]);
  useEffect(() => {
    if (!canUsers && canRoles) setTab('roles');
    else if (canUsers && !canRoles) setTab('usuarios');
  }, [canUsers, canRoles]);
  useEffect(() => {
    if (!shownRoles.some((r) => r.id === selectedRoleId)) setSelectedRoleId(shownRoles[0]?.id ?? '');
  }, [shownRoles, selectedRoleId]);

  const reloadUsers = () => setUsersTick((n) => n + 1);
  const reloadRoles = () => setRolesTick((n) => n + 1);
  const handleError = (e: unknown, reload: () => void) => {
    if (isProblem(e) && e.status === 409) reload();
    setFormError(isProblem(e) && e.status === 422 ? 'Revise los campos e inténtelo de nuevo.' : errorText(e));
  };

  const saveUser = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!userModal) return;
    const data = new FormData(e.currentTarget);
    const draft: UserDraft = {
      name: String(data.get('name') ?? '').trim(), email: String(data.get('email') ?? '').trim(),
      type: String(data.get('type')) as IdentityAudience, password: String(data.get('password') ?? ''),
      roles: data.getAll('roles').map(String),
    };
    setBusy(true); setFormError('');
    try {
      if (userModal.user) {
        const next = await identityApi.users.update(userModal.user.id, userModal.user.version, { name: draft.name, email: draft.email });
        if (canRoles && JSON.stringify(next.roles.map((r) => r.id).sort()) !== JSON.stringify(draft.roles.slice().sort())) await identityApi.users.setRoles(next.id, draft.roles);
      } else {
        const input: AdminUserInput = { name: draft.name, email: draft.email, type: draft.type, password: draft.password, role_ids: canRoles ? draft.roles : undefined };
        await identityApi.users.create(input);
      }
      setUserModal(null); reloadUsers(); toast(userModal.user ? 'Usuario actualizado' : 'Usuario creado', draft.email);
    } catch (err) { handleError(err, reloadUsers); }
    finally { setBusy(false); }
  };

  const toggleStatus = (user: AdminUser) => {
    const enabling = user.status !== 'active';
    dialogs.confirm({
      title: enabling ? 'Habilitar usuario' : 'Deshabilitar usuario',
      body: <p style={{ margin: 0 }}>{enabling ? 'El usuario podrá volver a ingresar.' : 'Se revocarán sus sesiones activas y no podrá ingresar.'}</p>,
      okLabel: enabling ? 'Habilitar' : 'Deshabilitar', danger: !enabling,
      onOk: () => { void (async () => { try { await (enabling ? identityApi.users.enable(user.id) : identityApi.users.disable(user.id)); reloadUsers(); toast(enabling ? 'Usuario habilitado' : 'Usuario deshabilitado', user.email); } catch (e) { setFormError(isProblem(e) && e.status === 422 ? 'Revise los campos e inténtelo de nuevo.' : errorText(e)); if (isProblem(e) && e.status === 409) reloadUsers(); } })(); },
    });
  };

  const saveRole = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!roleModal) return;
    const data = new FormData(e.currentTarget);
    const draft: RoleDraft = { code: String(data.get('code') ?? '').trim(), name: String(data.get('name') ?? '').trim(), description: String(data.get('description') ?? '').trim(), audience: String(data.get('audience')) as IdentityAudience };
    setBusy(true); setFormError('');
    try {
      let saved: Role;
      if (roleModal.copy && roleModal.role) saved = await identityApi.roles.copy(roleModal.role.id, { code: draft.code, name: draft.name, description: draft.description || null });
      else if (roleModal.role) saved = await identityApi.roles.update(roleModal.role.id, roleModal.role.version, { code: draft.code, name: draft.name, description: draft.description || null });
      else { const input: RoleInput = { ...draft, description: draft.description || null }; saved = await identityApi.roles.create(input); }
      setRoleModal(null); setSelectedRoleId(saved.id); reloadRoles(); toast(roleModal.copy ? 'Rol copiado' : roleModal.role ? 'Rol actualizado' : 'Rol creado', saved.name);
    } catch (err) { handleError(err, reloadRoles); }
    finally { setBusy(false); }
  };

  const savePermissions = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!activeRole) return;
    const codes = Array.from(new FormData(e.currentTarget).getAll('permission')).map(String);
    setBusy(true); setFormError('');
    try { await identityApi.roles.setPermissions(activeRole.id, codes, activeRole.version); reloadRoles(); toast('Permisos guardados', activeRole.name); }
    catch (err) { handleError(err, reloadRoles); }
    finally { setBusy(false); }
  };

  const removeRole = (role: Role) => dialogs.confirm({ title: 'Eliminar rol', body: <p style={{ margin: 0 }}>Se eliminará el rol «{role.name}».</p>, okLabel: 'Eliminar', danger: true, onOk: () => { void identityApi.roles.remove(role.id).then(() => { reloadRoles(); setSelectedRoleId(''); toast('Rol eliminado', role.name, 'warn'); }).catch((e: unknown) => { setFormError(isProblem(e) && e.status === 422 ? 'Revise los campos e inténtelo de nuevo.' : errorText(e)); if (isProblem(e) && e.status === 409) reloadRoles(); }); } });

  const userColumns: Column<AdminUser>[] = [
    { key: 'name', header: 'Usuario', sort: (u) => u.name, render: (u) => <><b>{u.name}</b><div className="sub">{u.email}</div></> },
    { key: 'type', header: 'Tipo', render: (u) => audienceLabel[u.type] ?? u.type },
    { key: 'status', header: 'Estado', render: (u) => <Chip kind={u.status === 'active' ? 'ok' : 'warn'}>{u.status === 'active' ? 'Activo' : u.status === 'disabled' ? 'Deshabilitado' : u.status}</Chip> },
    { key: 'roles', header: 'Roles', render: (u) => u.roles.map((r) => <Chip key={r.id}>{r.name}</Chip>) },
    { key: 'actions', header: 'Acciones', render: (u) => <span style={{ display: 'flex', gap: 6 }}>
      {can('identity.user.update') ? <button type="button" className="btn sm" onClick={() => { setFormError(''); setUserModal({ user: u }); }}>Editar / roles</button> : null}
      {can('identity.user.update') ? <button type="button" className="btn sm" onClick={() => toggleStatus(u)}>{u.status === 'active' ? 'Deshabilitar' : 'Habilitar'}</button> : null}
      {can('identity.user.delete') ? <button type="button" className="btn sm danger" onClick={() => dialogs.confirm({ title: 'Eliminar usuario', body: <p style={{ margin: 0 }}>Se eliminará la cuenta de {u.name}.</p>, okLabel: 'Eliminar', danger: true, onOk: () => { void identityApi.users.remove(u.id).then(() => { reloadUsers(); toast('Usuario eliminado', u.email, 'warn'); }).catch((e: unknown) => { setFormError(errorText(e)); if (isProblem(e) && e.status === 409) reloadUsers(); }); } })}>Eliminar</button> : null}
    </span> },
  ];
  const roleColumns: Column<Role>[] = [
    { key: 'code', header: 'Código', sort: (r) => r.code, className: 'mono', render: (r) => r.code },
    { key: 'name', header: 'Rol', sort: (r) => r.name, render: (r) => <><b>{r.name}</b>{r.is_system ? <div className="sub">Rol del sistema</div> : null}</> },
    { key: 'audience', header: 'Audiencia', render: (r) => audienceLabel[r.audience] },
    { key: 'description', header: 'Descripción', render: (r) => r.description || '—' },
    { key: 'permissions', header: 'Permisos', align: 'r', render: (r) => matrix.data?.roles.find((mr) => mr.id === r.id)?.permissions.length ?? r.permissions?.length ?? '—' },
    { key: 'actions', header: 'Acciones', render: (r) => <span style={{ display: 'flex', gap: 6 }}>
      {can('identity.role.update') ? <button type="button" className="btn sm" onClick={() => { setFormError(''); setRoleModal({ role: r }); }}>Editar</button> : null}
      {can('identity.role.create') ? <button type="button" className="btn sm" onClick={() => { setFormError(''); setRoleModal({ role: r, copy: true }); }}>Copiar</button> : null}
      {can('identity.role.delete') ? <button type="button" className="btn sm danger" disabled={r.is_system} onClick={() => removeRole(r)}>Eliminar</button> : null}
    </span> },
  ];

  const userError = userList.error;
  const roleError = roleList.error || (canPermissionView ? permissionList.error || matrix.error : null);
  return <>
    <PageHead crumbs={[[ 'Configuración', 'roles' ], ['Usuarios y roles']]} title="Usuarios y roles" sub="Cuentas del panel, roles y permisos" actions={tab === 'usuarios' && can('identity.user.create') ? <button className="btn primary" type="button" onClick={() => { setFormError(''); setUserModal({}); }}>Invitar usuario</button> : tab === 'roles' && can('identity.role.create') ? <button className="btn primary" type="button" onClick={() => { setFormError(''); setRoleModal({}); }}>Nuevo rol</button> : null} />
    <Tabs label="Usuarios y roles" value={tab} onChange={setTab} tabs={[...(canUsers ? [{ id: 'usuarios' as const, label: 'Usuarios' }] : []), ...(canRoles ? [{ id: 'roles' as const, label: 'Roles y permisos' }] : [])]} />
    {!canUsers && !canRoles ? <section className="card"><div className="card-b"><Note kind="warn">No tiene permiso para ver usuarios ni roles.</Note></div></section> : null}
    {tab === 'usuarios' && canUsers ? <section className="card">
      <Toolbar count={userList.loading ? 'Cargando…' : `${users.length}${userList.data?.meta.has_more ? '+' : ''} usuarios`} />
      {userError ? <div className="card-b"><Note kind="warn" role="alert">No se pudo cargar usuarios: {errorText(userError)} <button className="btn sm" type="button" onClick={userList.reload}>Reintentar</button></Note></div> : userList.loading && !userList.data ? <div className="card-b" aria-busy="true"><div className="skel" style={{ height: 220 }} /></div> : <>
        {formError ? <div className="card-b"><Note kind="warn" role="alert">{formError}</Note></div> : null}
        <DataTable rows={users} rowKey={(u) => u.id} columns={userColumns} caption="Usuarios del panel" />
        <div className="card-b" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}><button type="button" className="btn sm" disabled={userList.loading || !userList.data?.meta.prev_cursor} onClick={() => setUserCursor(userList.data?.meta.prev_cursor ?? null)}>Anterior</button><button type="button" className="btn sm" disabled={userList.loading || !userList.data?.meta.next_cursor} onClick={() => setUserCursor(userList.data?.meta.next_cursor ?? null)}>Siguiente</button></div>
      </>}
    </section> : null}
    {tab === 'roles' && canRoles ? <>
      <section className="card">
        <Toolbar count={roleList.loading ? 'Cargando…' : `${shownRoles.length} roles`}><Select label="Audiencia" value={roleFilter} onChange={(v) => setRoleFilter(v as IdentityAudience | '')} options={ [['', 'Todas las audiencias'], ['staff', 'Personal'], ['customer', 'Cliente']] } /></Toolbar>
        {roleError ? <div className="card-b"><Note kind="warn" role="alert">No se pudo cargar roles/permisos: {errorText(roleError)} <button className="btn sm" type="button" onClick={() => { roleList.reload(); permissionList.reload(); matrix.reload(); }}>Reintentar</button></Note></div> : roleList.loading && !roleList.data ? <div className="card-b" aria-busy="true"><div className="skel" style={{ height: 200 }} /></div> : <>
          {formError ? <div className="card-b"><Note kind="warn" role="alert">{formError}</Note></div> : null}
          <DataTable rows={shownRoles} rowKey={(r) => r.id} columns={roleColumns} caption="Roles" />
        </>}
      </section>
      {canPermissionView ? <section className="card" style={{ marginTop: 16 }}>
        <div className="card-h"><h2 className="sec">Matriz de permisos</h2><span className="sub">Permisos asignados por rol</span></div>
        {!activeRole ? <div className="card-b sub">Seleccione un rol para ver su matriz.</div> : matrix.loading && !matrix.data ? <div className="card-b" aria-busy="true"><div className="skel" style={{ height: 160 }} /></div> : <>
          <div className="card-b"><label className="field">Rol para editar<Select value={activeRole.id} onChange={setSelectedRoleId} options={shownRoles.map((r) => [r.id, `${r.name} (${r.code})`])} /></label></div>
          {can('identity.role.update') ? <form key={`${activeRole.id}:${matrixRole?.version ?? activeRole.version}`} onSubmit={(e) => void savePermissions(e)}>
            <div className="card-b" style={{ display: 'grid', gap: 14 }}>{Object.entries(grouped).map(([module, entities]) => <section key={module}>
              <h3 style={{ margin: '0 0 8px' }}>{module}</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10 }}>{Object.entries(entities).map(([entity, rows]) => <fieldset key={entity} className="card" style={{ padding: 12, margin: 0 }}><legend>{entity}</legend>{rows.filter((p) => activeRole.audience === 'customer' ? p.code.startsWith('portal.') : !p.code.startsWith('portal.')).map((p) => <label key={p.code} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', margin: '7px 0' }}><input type="checkbox" name="permission" value={p.code} defaultChecked={(matrixRole?.permissions ?? activeRole.permissions ?? []).includes(p.code)} disabled={busy || matrix.loading} /><span>{p.action}<small className="sub" style={{ display: 'block' }}>{p.code}{p.is_sensitive ? ' · sensible' : ''}</small></span></label>)}</fieldset>)}</div>
            </section>)}</div>
            <div className="card-f" style={{ display: 'flex', justifyContent: 'flex-end' }}><button className="btn primary" type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar permisos'}</button></div>
          </form> : <div className="card-b">{(matrixRole?.permissions ?? activeRole.permissions ?? []).join(', ') || 'Sin permisos asignados.'}</div>}
          {matrix.data ? <div className="card-b sub">La matriz cargada incluye {matrix.data.roles.length} roles.</div> : null}
        </>}
      </section> : null}
    </> : null}

    <Modal open={!!userModal} onClose={() => !busy && setUserModal(null)} title={userModal?.user ? 'Editar usuario y roles' : 'Invitar usuario'} sub="La contraseña inicial debe cambiarse al ingresar." wide>
      <form onSubmit={(e) => void saveUser(e)}>
        <div className="form-grid">
          <label className="field full">Nombre<input className="input" name="name" required defaultValue={userModal?.user?.name ?? ''} /></label>
          <label className="field full">Correo<input className="input" name="email" type="email" required defaultValue={userModal?.user?.email ?? ''} /></label>
          {!userModal?.user ? <><label className="field">Tipo<select className="select" name="type" defaultValue="staff"><option value="staff">Personal</option><option value="customer">Cliente</option></select></label><label className="field">Contraseña temporal<input className="input" name="password" type="password" autoComplete="new-password" minLength={12} required /><small className="hint">Se exige cambio de contraseña al primer ingreso.</small></label></> : null}
          {canRoles ? <fieldset className="field full"><legend>Roles</legend><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 8 }}>{roles.filter((r) => r.audience === (userModal?.user?.type ?? 'staff')).map((r) => <label key={r.id} style={{ display: 'flex', gap: 8 }}><input type="checkbox" name="roles" value={r.id} defaultChecked={userModal?.user?.roles.some((ur) => ur.id === r.id)} />{r.name}</label>)}</div></fieldset> : null}
          {formError ? <div className="err full" role="alert">{formError}</div> : null}
        </div>
        <div className="modal-f"><button type="button" className="btn" disabled={busy} onClick={() => setUserModal(null)}>Cancelar</button><button type="submit" className="btn primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar usuario'}</button></div>
      </form>
    </Modal>
    <Modal open={!!roleModal} onClose={() => !busy && setRoleModal(null)} title={roleModal?.copy ? 'Copiar rol' : roleModal?.role ? 'Editar rol' : 'Nuevo rol'}>
      <form onSubmit={(e) => void saveRole(e)}>
        <div className="form-grid">
          <label className="field">Código<input className="input" name="code" required pattern="[a-z][a-z0-9_]{1,62}" defaultValue={roleModal?.copy && roleModal.role ? `${roleModal.role.code}_copy` : roleModal?.role?.code ?? ''} /></label>
          <label className="field">Audiencia<select className="select" name="audience" disabled={!!roleModal?.role} defaultValue={roleModal?.role?.audience ?? 'staff'}><option value="staff">Personal</option><option value="customer">Cliente</option></select></label>
          <label className="field full">Nombre<input className="input" name="name" required maxLength={200} defaultValue={roleModal?.copy && roleModal.role ? `${roleModal.role.name} (copia)` : roleModal?.role?.name ?? ''} /></label>
          <label className="field full">Descripción<textarea className="input" name="description" rows={3} maxLength={2000} defaultValue={roleModal?.role?.description ?? ''} /></label>
          {formError ? <div className="err full" role="alert">{formError}</div> : null}
        </div>
        <div className="modal-f"><button type="button" className="btn" disabled={busy} onClick={() => setRoleModal(null)}>Cancelar</button><button type="submit" className="btn primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar rol'}</button></div>
      </form>
    </Modal>
  </>;
}
