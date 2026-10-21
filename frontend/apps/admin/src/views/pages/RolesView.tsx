/**
 * Vista «roles» (#roles) — usuarios del panel, roles y matriz de permisos
 * (prototipo vRoles y handlers role*, perm*, user*; l.2649-2679).
 * Parámetro opcional: 'usuarios' | 'roles' (pestaña inicial).
 */
import { useEffect } from 'react';
import { useApp } from '../../app/context';
import type { ViewProps } from '../../app/routes';
import { useViewState } from '../../app/storage';
import { Icon } from '../../components/Icon';
import { Chip, PageHead, Tabs } from '../../components/ui';
import { ACTS2, ME, MODS, PERM, RLS, SEC, USERS, fD, fT, norm, permInit, type UserAccount } from '../../data';

type Tab = 'usuarios' | 'roles';
type PermRow = Record<string, boolean | null>;
/** Copia de los permisos del rol antes de editarlo (para descartar). */
const SNAP: Record<string, Record<string, PermRow>> = {};
const clone = (p: Record<string, PermRow>) => JSON.parse(JSON.stringify(p)) as Record<string, PermRow>;

export default function RolesView({ param }: ViewProps) {
  const { toast, refresh, dialogs } = useApp();
  const [tab, setTab] = useViewState<Tab>('roles.tab', 'usuarios');
  const [sel, setSel] = useViewState('roles.sel', 'Soporte');
  const [dirty, setDirty] = useViewState('roles.dirty', 0);

  useEffect(() => {
    if (param === 'usuarios' || param === 'roles') setTab(param);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [param]);

  const r = RLS.find((x) => x.id === sel) || RLS[1];
  const P = PERM[r.id];
  const ro = r.id === 'Administrador';
  const nUsers = (id: string) => USERS.filter((u) => u.role === id).length;

  /* ---------- Roles ---------- */
  const touch = () => {
    if (!SNAP[r.id]) SNAP[r.id] = clone(P);
    setDirty((d) => d + 1);
    refresh();
  };
  const discard = () => {
    if (SNAP[r.id]) PERM[r.id] = SNAP[r.id];
    delete SNAP[r.id];
    setDirty(0);
  };
  const pickRole = (id: string) => {
    if (id === r.id) return;
    if (dirty) {
      dialogs.confirm({
        title: 'Descartar cambios',
        body: (
          <p style={{ margin: 0 }}>
            Hay {dirty} cambios sin guardar en «{r.id}».
          </p>
        ),
        okLabel: 'Descartar',
        danger: true,
        onOk: () => {
          discard();
          setSel(id);
          refresh();
        },
      });
      return;
    }
    setSel(id);
  };
  const cell = (m: string, a: string, v: boolean) => {
    P[m][a] = v;
    touch();
  };
  const row = (m: string, v: boolean) => {
    ACTS2.forEach((a) => {
      if (P[m][a] !== null) P[m][a] = v;
    });
    touch();
  };
  const savePerm = () =>
    dialogs.confirm({
      title: 'Guardar permisos',
      body: (
        <p style={{ margin: 0 }}>
          Se aplicarán {dirty} cambios al rol <b>{r.id}</b>, que tienen {nUsers(r.id)} usuarios. Los cambios rigen desde su próxima acción.
        </p>
      ),
      okLabel: 'Guardar',
      onOk: () => {
        delete SNAP[r.id];
        setDirty(0);
        toast('Permisos guardados', r.id);
        refresh();
      },
    });
  const newRole = () =>
    dialogs.form({
      title: 'Nuevo rol',
      fields: [
        { id: 'n', label: 'Nombre del rol', req: true, full: true },
        { id: 'b', label: 'Partir de', type: 'select', options: [['', 'Sin permisos'], ...RLS.map((x): [string, string] => [x.id, 'Copia de ' + x.id])], value: '' },
        { id: 'd', label: 'Descripción', full: true },
      ],
      validate: (v) => (RLS.some((x) => norm(x.id) === norm(v.n)) ? 'Ya existe un rol con ese nombre.' : null),
      submit: 'Crear rol',
      onSubmit: (v) => {
        if (dirty) discard();
        RLS.push({ id: v.n, sys: false, desc: v.d || 'Rol personalizado' });
        if (v.b) PERM[v.n] = clone(PERM[v.b]);
        else permInit(v.n, []);
        setSel(v.n);
        setTab('roles');
        setDirty(0);
        toast('Rol creado', v.n);
        refresh();
      },
    });
  const copyRole = () => {
    const src = r.id;
    let n = src + ' (copia)';
    let i = 2;
    while (RLS.some((x) => x.id === n)) n = `${src} (copia ${i++})`;
    RLS.push({ id: n, sys: false, desc: 'Copia de ' + src });
    PERM[n] = clone(PERM[src]);
    if (dirty) discard();
    setSel(n);
    setDirty(0);
    toast('Rol copiado', n);
    refresh();
  };
  const delRole = () => {
    if (r.sys) return;
    const n = nUsers(r.id);
    if (n) {
      toast('No se puede eliminar', `${n} usuarios tienen este rol. Reasígnelos primero.`, 'err');
      return;
    }
    dialogs.confirm({
      title: 'Eliminar rol',
      body: <p style={{ margin: 0 }}>Se eliminará el rol «{r.id}».</p>,
      okLabel: 'Eliminar',
      danger: true,
      onOk: () => {
        RLS.splice(RLS.indexOf(r), 1);
        delete PERM[r.id];
        delete SNAP[r.id];
        setSel('Soporte');
        setDirty(0);
        toast('Rol eliminado', r.id, 'warn');
        refresh();
      },
    });
  };

  /* ---------- Usuarios ---------- */
  const setUserRole = (u: UserAccount, v: string) => {
    if (u.n === ME && v !== 'Administrador') {
      toast('Acción no permitida', 'No puede quitarse su propio rol de administrador.', 'err');
      refresh();
      return;
    }
    u.role = v;
    toast('Rol actualizado', `${u.n} → ${u.role}`);
    refresh();
  };
  const toggleUser = (u: UserAccount) => {
    const act = u.st === 'Activo';
    dialogs.confirm({
      title: act ? 'Suspender usuario' : 'Reactivar usuario',
      body: <p style={{ margin: 0 }}>{act ? 'Se cerrarán sus sesiones activas y no podrá ingresar.' : 'Podrá volver a ingresar con su contraseña.'}</p>,
      okLabel: act ? 'Suspender' : 'Reactivar',
      danger: act,
      onOk: () => {
        u.st = act ? 'Suspendido' : 'Activo';
        toast(`Usuario ${u.st === 'Activo' ? 'reactivado' : 'suspendido'}`, u.n, u.st === 'Activo' ? 'ok' : 'warn');
        refresh();
      },
    });
  };
  const mfaReset = (u: UserAccount) =>
    dialogs.confirm({
      title: 'Restablecer 2FA',
      body: <p style={{ margin: 0 }}>{u.n} deberá configurar de nuevo su segundo factor en el próximo ingreso.</p>,
      okLabel: 'Restablecer',
      danger: true,
      onOk: () => {
        u.mfa = false;
        toast('2FA restablecido', u.n, 'warn');
        refresh();
      },
    });
  const invite = () =>
    dialogs.form({
      title: 'Invitar usuario',
      fields: [
        { id: 'n', label: 'Nombre', req: true, full: true },
        { id: 'm', label: 'Correo', type: 'email', req: true, full: true },
        { id: 'r', label: 'Rol', type: 'select', options: RLS.map((x) => x.id), value: 'Soporte' },
      ],
      validate: (v) => (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(v.m) ? 'Ingrese un correo válido.' : USERS.some((u) => norm(u.m) === norm(v.m)) ? 'Ese correo ya tiene acceso.' : null),
      submit: 'Enviar invitación',
      onSubmit: (v) => {
        USERS.push({ n: v.n, m: v.m, role: v.r, st: 'Invitado', mfa: false, last: null });
        setTab('usuarios');
        toast('Invitación enviada', `${v.m} · vence en 72 h`);
        refresh();
      },
    });

  const usersBody = (
    <div className="tw">
      <table className="t">
        <thead>
          <tr>
            <th>Usuario</th>
            <th>Rol</th>
            <th>Estado</th>
            <th>2FA</th>
            <th>Último acceso</th>
            <th className="r">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {USERS.map((u) => {
            const req = SEC.role[u.role];
            const must = !!req && req !== 'Opcional';
            return (
              <tr key={u.m}>
                <td style={{ minWidth: 200 }}>
                  <b>{u.n}</b>
                  <div className="sub mono">{u.m}</div>
                </td>
                <td>
                  <select className="select" style={{ width: 190 }} value={u.role} aria-label={`Rol de ${u.n}`} onChange={(e) => setUserRole(u, e.target.value)}>
                    {RLS.map((x) => (
                      <option key={x.id}>{x.id}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <Chip kind={u.st === 'Activo' ? 'ok' : u.st === 'Invitado' ? 'info' : 'danger'}>{u.st}</Chip>
                </td>
                <td>
                  {u.mfa ? (
                    <Chip kind="ok" icon="shield">
                      Activo
                    </Chip>
                  ) : (
                    <Chip kind={must ? 'warn' : ''}>{must ? 'Pendiente (obligatorio)' : 'No activado'}</Chip>
                  )}
                </td>
                <td className="num nw">{u.last ? `${fD(u.last)} ${fT(u.last)}` : '—'}</td>
                <td className="r nw">
                  {u.st === 'Invitado' ? (
                    <button type="button" className="btn sm" onClick={() => toast('Invitación reenviada', u.m, 'info')}>
                      <Icon name="send" size="sm" />
                      Reenviar invitación
                    </button>
                  ) : u.n === ME ? (
                    <span className="sub">Usted</span>
                  ) : (
                    <button type="button" className="btn sm" onClick={() => toggleUser(u)}>
                      {u.st === 'Activo' ? 'Suspender' : 'Reactivar'}
                    </button>
                  )}{' '}
                  {u.mfa && u.n !== ME ? (
                    <button type="button" className="btn sm ghost" onClick={() => mfaReset(u)}>
                      Restablecer 2FA
                    </button>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  const rolesBody = (
    <div className="roles-l">
      <nav className="tk-filters" aria-label="Roles">
        <ul>
          {RLS.map((x) => (
            <li key={x.id}>
              <button type="button" onClick={() => pickRole(x.id)} aria-current={x.id === r.id}>
                <span>
                  {x.sys ? <Icon name="lock" size="sm" /> : null} {x.id}
                </span>
                <em>{nUsers(x.id)}</em>
              </button>
            </li>
          ))}
        </ul>
        <div style={{ display: 'grid', gap: 6, padding: 10 }}>
          <button type="button" className="btn sm" onClick={newRole}>
            <Icon name="plus" size="sm" />
            Nuevo rol
          </button>
          <button type="button" className="btn sm" onClick={copyRole}>
            <Icon name="layers" size="sm" />
            Copiar «{r.id}»
          </button>
          <button type="button" className="btn sm danger" onClick={delRole} disabled={r.sys} aria-describedby={r.sys ? 'roleSysWhy' : undefined}>
            <Icon name="trash" size="sm" />
            Eliminar rol
          </button>
          {r.sys ? (
            <small id="roleSysWhy" className="hint">
              Los roles de sistema no se pueden eliminar.
            </small>
          ) : null}
        </div>
      </nav>
      <div style={{ minWidth: 0 }}>
        <div className="toolbar">
          <div>
            <b style={{ fontFamily: 'var(--f-head)' }}>{r.id}</b>{' '}
            {r.sys ? (
              <Chip kind="outline" icon="lock">
                Sistema
              </Chip>
            ) : (
              <Chip kind="info">Personalizado</Chip>
            )}
            <div className="sub" style={{ fontSize: 12, color: 'var(--muted)' }}>
              {r.desc}
              {ro ? ' · los permisos del administrador no se pueden modificar.' : ''}
            </div>
          </div>
          <span className="count" aria-live="polite">
            {dirty ? <b style={{ color: 'var(--warn-text)' }}>{dirty} cambios sin guardar</b> : 'Sin cambios'}
          </span>
          {dirty && !ro ? (
            <button
              type="button"
              className="btn"
              onClick={() => {
                discard();
                toast('Cambios descartados', r.id, 'info');
                refresh();
              }}
            >
              Descartar
            </button>
          ) : null}
          <button type="button" className="btn primary" onClick={savePerm} disabled={ro || !dirty}>
            <Icon name="check" size="sm" />
            Guardar permisos
          </button>
        </div>
        <div className="tw">
          <table className="t perm">
            <thead>
              <tr>
                <th>Módulo</th>
                <th title="Marcar todo el módulo">Todo</th>
                {ACTS2.map((a) => (
                  <th key={a}>{a === 'Especial' ? 'Especiales' : a}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MODS.map(([m, sp]) => {
                const vals = ACTS2.filter((a) => P[m][a] !== null).map((a) => !!P[m][a]);
                const all = vals.every(Boolean);
                const some = vals.some(Boolean);
                return (
                  <tr key={m}>
                    <td className="strong nw">{m}</td>
                    <td>
                      <input
                        type="checkbox"
                        checked={all}
                        ref={(el) => {
                          if (el) el.indeterminate = !all && some;
                        }}
                        disabled={ro}
                        aria-label={`Marcar todo ${m}`}
                        onChange={(e) => row(m, e.target.checked)}
                      />
                    </td>
                    {ACTS2.map((a) =>
                      P[m][a] === null ? (
                        <td key={a} className="sub">
                          —
                        </td>
                      ) : (
                        <td key={a}>
                          <label className="pcell">
                            <input type="checkbox" checked={!!P[m][a]} disabled={ro} aria-label={`${a === 'Especial' ? sp : a} en ${m}`} onChange={(e) => cell(m, a, e.target.checked)} />
                            {a === 'Especial' ? <span>{sp}</span> : null}
                          </label>
                        </td>
                      ),
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <PageHead
        crumbs={[['Configuración', 'ajustes'], ['Usuarios y roles', 'roles']]}
        title="Usuarios y roles"
        sub="Personal con acceso al panel, sus roles y la matriz de permisos."
        actions={
          <button type="button" className="btn primary" onClick={invite}>
            <Icon name="plus" size="sm" />
            Invitar usuario
          </button>
        }
      />
      <section className="card">
        <Tabs<Tab>
          label="Secciones"
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'usuarios', label: 'Usuarios', count: USERS.length },
            { id: 'roles', label: 'Roles y permisos', count: RLS.length },
          ]}
        />
        <div role="tabpanel" aria-label={tab === 'usuarios' ? 'Usuarios' : 'Roles y permisos'}>
          {tab === 'usuarios' ? usersBody : rolesBody}
        </div>
      </section>
    </>
  );
}
