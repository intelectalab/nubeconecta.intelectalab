/**
 * Vista «infra» (#infra): nodos de hosting, migración BanaHosting → VPS propio
 * y servidores/cuentas por proveedor. Guía: vInfra del prototipo.
 */
import { useApp, useMoney } from '../../app/context';
import { Icon } from '../../components/Icon';
import { CapBar, Chip, ClientLink, Note, PageHead, StatLine } from '../../components/ui';
import { MSTATES, migBatch, migCounts, NF0, NF2, NODES, pct, PROVIDERS } from '../../data';
import type { HostNode, MigItem } from '../../data';
import { BusyButton, useBusy } from './infraestructura/shared';

function BackupChip({ n }: { n: HostNode }) {
  if (n.id === 'BH-RES-01') return <Chip kind="danger" icon="oct">Fallido</Chip>;
  if (n.id === 'VPS-AP-02') return <Chip kind="warn" icon="tri">Incompleto</Chip>;
  return <Chip kind="ok" icon="check">OK</Chip>;
}

export default function InfraView() {
  const { brand, refresh, toast } = useApp();
  const m = useMoney();
  const { busy, run } = useBusy();

  const tot = Object.values(migCounts).reduce((a, b) => a + b, 0);
  const done = migCounts['Completada'];
  const cost = PROVIDERS.reduce((a, p) => a + p.cost, 0);
  const rev = MSTATES.slice().reverse();

  const sync = () =>
    run('sync', 1300, () => {
      toast('Proveedores sincronizados', '13 proveedores · 7 nodos · costos actualizados');
      refresh();
    });

  const migNext = (it: MigItem) => {
    const i = MSTATES.findIndex((x) => x[0] === it.st);
    if (i < 0 || i >= MSTATES.length - 1) return;
    migCounts[it.st]--;
    it.st = MSTATES[i + 1][0];
    migCounts[it.st]++;
    toast('Estado de migración actualizado', `${it.acct} → ${it.st}`);
    refresh();
  };

  return (
    <>
      <PageHead
        crumbs={[['Infraestructura', 'infra'], ['Nodos y proveedores', 'infra']]}
        title="Infraestructura"
        sub="Nodos de hosting (reseller y propios), cuentas cloud por proveedor y migración en curso."
        actions={
          <BusyButton id="btnSync" className="btn primary" busy={busy.sync} busyText="Sincronizando…" icon="refresh" onClick={sync}>
            Sincronizar proveedores
          </BusyButton>
        }
      />
      {brand !== 'all' ? (
        <Note style={{ marginBottom: 14 }}>La infraestructura es compartida por las 4 marcas; el filtro de marca no aplica en esta pantalla.</Note>
      ) : null}
      <StatLine
        items={[
          { label: 'Nodos de hosting', value: NODES.length },
          { label: 'Cuentas cPanel', value: NF0.format(NODES.reduce((a, n) => a + n.acc[0], 0)) },
          { label: 'Costo cloud mensual', value: m.money(cost, 'USD', true) },
          { label: 'Nodos sobre 85 %', value: NODES.filter((n) => n.p >= 85).length, tone: 'danger' },
          { label: 'Backups fallidos (24 h)', value: 1, tone: 'danger' },
        ]}
      />

      <section className="card" style={{ marginBottom: 16 }} aria-labelledby="hNodes">
        <div className="card-h">
          <h2 className="sec" id="hNodes">
            Nodos de hosting
          </h2>
          <span className="legend">
            <span>Umbrales: 70 · 85 · 95 %</span>
          </span>
        </div>
        <div className="tw">
          <table className="t">
            <thead>
              <tr>
                <th>Nodo</th>
                <th>Tipo · proveedor</th>
                <th style={{ minWidth: 170 }}>Disco</th>
                <th style={{ minWidth: 170 }}>Cuentas</th>
                <th style={{ minWidth: 170 }}>RAM</th>
                <th>Backup</th>
                <th>Ubicación · IP</th>
              </tr>
            </thead>
            <tbody>
              {NODES.map((n) => (
                <tr key={n.id}>
                  <td>
                    <b className="mono">{n.id}</b>
                    <div className="sub">{n.n}</div>
                  </td>
                  <td className="nw">
                    {n.kind}
                    <div className="sub">{n.prov}</div>
                  </td>
                  <td>
                    <CapBar p={pct(n.disk) ?? 0} detail={`${n.disk[0]}/${n.disk[1]} GB`} />
                  </td>
                  <td>
                    <CapBar p={pct(n.acc) ?? 0} detail={`${n.acc[0]}/${n.acc[1]}`} />
                  </td>
                  <td>{n.ram ? <CapBar p={pct(n.ram) ?? 0} detail={`${n.ram[0]}/${n.ram[1]} GB`} /> : <span className="sub">No aplica (reseller)</span>}</td>
                  <td>
                    <BackupChip n={n} />
                  </td>
                  <td className="nw">
                    {n.loc}
                    <div className="sub mono">{n.ip}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card" style={{ marginBottom: 16 }} aria-labelledby="hMig">
        <div className="card-h">
          <h2 className="sec" id="hMig">
            <Icon name="migrate" size="sm" />
            Migración BanaHosting → VPS propio
          </h2>
          <span className="sub">BH-RES-01 → VPS-AP-03 · lote 7 de 12</span>
        </div>
        <div className="card-b" style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
            <b style={{ fontFamily: 'var(--f-head)', fontSize: 20 }} className="num">
              {Math.round((done / tot) * 100)} %{' '}
              <small style={{ fontSize: 13, color: 'var(--muted)', fontFamily: 'var(--f-body)' }}>
                completado · {done} de {tot} cuentas
              </small>
            </b>
            <span className="sub" style={{ fontSize: 12.5, color: 'var(--muted)' }}>
              Fin estimado: 24/10/2026 · ventana nocturna 01:00–05:00
            </span>
          </div>
          <div className="stackbar" role="img" aria-label="Progreso por estado">
            {rev.map(([s, c]) => (
              <i key={s} style={{ width: `${(migCounts[s] / tot) * 100}%`, background: c }} title={`${s}: ${migCounts[s]}`} />
            ))}
          </div>
          <div className="legend">
            {rev.map(([s, c]) => (
              <span key={s}>
                <i style={{ background: c, border: '1px solid var(--border-strong)' }} />
                {s}{' '}
                <b className="num" style={{ color: 'var(--text)' }}>
                  {migCounts[s]}
                </b>
              </span>
            ))}
          </div>
          <div className="tw">
            <table className="t">
              <thead>
                <tr>
                  <th>Cuenta</th>
                  <th>Cliente</th>
                  <th className="r">Tamaño</th>
                  <th>Estado</th>
                  <th className="r">Acción</th>
                </tr>
              </thead>
              <tbody>
                {migBatch.map((it, k) => {
                  const i = MSTATES.findIndex((x) => x[0] === it.st);
                  const st = MSTATES[i];
                  const next = MSTATES[i + 1];
                  return (
                    <tr key={it.acct + k}>
                      <td className="mono strong">{it.acct}</td>
                      <td>
                        <ClientLink cid={it.cid} />
                      </td>
                      <td className="r num">{NF2.format(it.size)} GB</td>
                      <td>
                        <Chip kind={st ? st[2] : ''} icon={it.st === 'Completada' ? 'check' : it.st === 'Pendiente' ? 'clock' : 'refresh'}>
                          {it.st}
                        </Chip>
                      </td>
                      <td className="r">
                        {it.st !== 'Completada' && next ? (
                          <button type="button" className="btn sm" onClick={() => migNext(it)}>
                            Avanzar a «{next[0]}»
                          </button>
                        ) : (
                          <span className="sub">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section aria-labelledby="hProv">
        <h2 className="sec" id="hProv" style={{ marginBottom: 10 }}>
          Servidores y cuentas por proveedor
        </h2>
        <div className="grid g-4">
          {PROVIDERS.map((p) => (
            <article key={p.n} className="card provcard">
              <div className="h">
                <span className="ico">{p.ab}</span>
                <b>{p.n}</b>
                {p.cost ? (
                  <span className="num" style={{ fontWeight: 700 }}>
                    {m.money(p.cost, 'USD')}
                    <small style={{ color: 'var(--muted)', fontWeight: 500 }}>/mes</small>
                  </span>
                ) : (
                  <Chip kind="outline">Prepago</Chip>
                )}
              </div>
              <ul>
                {p.items.map((i, k) => (
                  <li key={k}>
                    <span style={{ color: 'var(--muted)' }}>{i[0]}</span>
                    <span>{i[1]}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
