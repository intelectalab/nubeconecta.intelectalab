/**
 * Vista «boveda» (#boveda): credenciales de servicios de clientes (cifradas,
 * simuladas). Revelar exige motivo y queda auditado. Guía: vBoveda del prototipo.
 */
import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../app/context';
import { useViewState } from '../../app/storage';
import { DataTable, type Column } from '../../components/DataTable';
import { Icon } from '../../components/Icon';
import { Chip, ClientLink, Note, PageHead, SearchBox, Toolbar } from '../../components/ui';
import { AUDIT, CBY, fD, fT, inBrand, ME, norm, plural, TODAY, VAULT } from '../../data';
import type { VaultItem } from '../../data';
import { NoRows } from './infraestructura/shared';
import { VaultAddDialog } from './infraestructura/VaultAdd';

const REVEAL_S = 20;
/** Vencimiento (ms) de cada acceso revelado; sobrevive a cambios de ruta. */
const EXPIRES = new Map<string, number>();

export default function BovedaView() {
  const { brand, dataVersion, refresh, toast, dialogs } = useApp();
  const [q, setQ] = useViewState('bv.q', '');
  const [adding, setAdding] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Cuenta regresiva de los accesos revelados: al vencer se vuelven a ocultar.
  useEffect(() => {
    const tick = () => {
      const t = Date.now();
      let changed = false;
      VAULT.forEach((v) => {
        if (!v.shown) return;
        const exp = EXPIRES.get(v.id);
        if (!exp || exp <= t) {
          v.shown = false;
          EXPIRES.delete(v.id);
          changed = true;
        }
      });
      if (changed || VAULT.some((v) => v.shown)) setNow(t);
      if (changed) refresh();
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const rows = useMemo(() => {
    const nq = norm(q);
    return VAULT.filter((v) => inBrand(brand, v.cid) && (!nq || norm(`${CBY[v.cid]?.name ?? ''} ${v.type} ${v.user}`).includes(nq)));
  }, [q, brand, dataVersion]);

  const reveal = (v: VaultItem) =>
    dialogs.form({
      title: 'Revelar acceso',
      sub: `${CBY[v.cid]?.name ?? v.cid} · ${v.type} · ${v.user}`,
      pre: (
        <Note kind="warn" icon="shield">
          Quedará registrado quién, cuándo y por qué. El cliente puede ver este registro en su portal.
        </Note>
      ),
      fields: [
        { id: 'm', label: 'Motivo', type: 'select', full: true, options: ['Atención de ticket', 'Migración', 'Solicitud del cliente', 'Auditoría de seguridad', 'Otro'], value: 'Atención de ticket' },
        { id: 'r', label: 'Referencia (ticket, pedido…)', full: true, req: true, ph: 'TK-26410' },
      ],
      submit: 'Revelar',
      validate: (x) => (x.r.length < 3 ? 'Indique una referencia válida.' : null),
      onSubmit: (x) => {
        v.shown = true;
        EXPIRES.set(v.id, Date.now() + REVEAL_S * 1000);
        AUDIT.unshift({ at: new Date(), who: ME, what: `${v.type} · ${v.user}`, why: `${x.m} · ${x.r}` });
        toast(`Acceso revelado por ${REVEAL_S} s`, 'Registrado en la auditoría', 'warn');
        setNow(Date.now());
        refresh();
      },
    });

  const cols: Column<VaultItem>[] = [
    { key: 'cli', header: 'Cliente', minWidth: 170, render: (v) => <ClientLink cid={v.cid} />, sort: (v) => CBY[v.cid]?.name },
    { key: 'type', header: 'Tipo', className: 'nw', render: (v) => v.type, sort: (v) => v.type },
    { key: 'user', header: 'Usuario', className: 'mono', render: (v) => v.user, sort: (v) => v.user },
    { key: 'host', header: 'Host', className: 'mono sub', minWidth: 160, render: (v) => <span style={{ overflowWrap: 'anywhere' }}>{v.host}</span> },
    {
      key: 'pw',
      header: 'Contraseña',
      className: 'nw',
      render: (v) => {
        const left = v.shown ? Math.max(0, Math.ceil(((EXPIRES.get(v.id) ?? now) - now) / 1000)) : 0;
        return v.shown ? (
          <>
            <span className="mono reveal">demo-valor-no-real</span>{' '}
            <small className="sub">{left} s</small>
          </>
        ) : (
          <>
            <span className="mono" aria-hidden="true">
              ••••••••••
            </span>
            <span className="sr-only">Oculta</span>{' '}
            <button type="button" className="btn sm" onClick={() => reveal(v)} aria-label={`Revelar contraseña de ${v.user}`}>
              <Icon name="eye" size="sm" />
              Revelar
            </button>
          </>
        );
      },
    },
    { key: 'upd', header: 'Actualizado', className: 'num', render: (v) => fD(v.upd), sort: (v) => v.upd },
  ];

  return (
    <>
      <PageHead
        crumbs={[['Infraestructura', 'boveda'], ['Bóveda', 'boveda']]}
        title="Bóveda de accesos"
        sub="Credenciales de servicios de clientes, cifradas. Revelar exige motivo y queda auditado."
        actions={
          <button type="button" className="btn primary" onClick={() => setAdding(true)}>
            <Icon name="plus" size="sm" />
            Agregar acceso
          </button>
        }
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <Chip kind="outline" icon="shield">En desarrollo</Chip>
        <span className="sub">No se guardan ni se muestran contraseñas reales; al revelar se muestra un valor simulado durante 20 segundos.</span>
      </div>
      <div className="split">
        <section className="card">
          <Toolbar count={plural(rows.length, 'acceso', 'accesos')}>
            <SearchBox label="Buscar accesos" placeholder="Cliente, tipo o usuario…" value={q} onChange={setQ} />
          </Toolbar>
          <DataTable columns={cols} rows={rows} rowKey={(v) => v.id} empty={<NoRows />} />
        </section>
        <aside className="card" aria-labelledby="hAudit">
          <div className="card-h">
            <h2 className="sec" id="hAudit">
              Auditoría
            </h2>
            <span className="sub">últimos accesos revelados</span>
          </div>
          <ul className="rows">
            {AUDIT.map((a, k) => (
              <li key={k}>
                <Icon name="eye" size="sm" />
                <div className="grow">
                  <b>{a.who}</b>
                  <small>
                    {a.what} · {a.why}
                    <br />
                    {fD(a.at)} {fT(a.at)}
                  </small>
                </div>
              </li>
            ))}
          </ul>
        </aside>
      </div>
      <VaultAddDialog
        open={adding}
        onClose={() => setAdding(false)}
        onSave={(v) => {
          VAULT.unshift({ id: 'BVN' + VAULT.length, cid: v.cid, type: v.type, user: v.user, host: v.host, upd: TODAY, shown: false });
          toast('Acceso guardado', 'La contraseña se cifró (simulado).');
          refresh();
        }}
      />
    </>
  );
}
