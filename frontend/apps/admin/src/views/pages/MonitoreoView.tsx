/**
 * Vista «monitoreo» (#monitoreo): disponibilidad de servicios, incidentes,
 * copias de seguridad y restauraciones solicitadas. Guía: vMonitoreo del prototipo.
 * Parámetro opcional: pestaña inicial ('monitores' | 'incidentes' | 'respaldos' | 'restauraciones').
 */
import { useEffect, useMemo } from 'react';
import { useApp } from '../../app/context';
import type { ViewProps } from '../../app/routes';
import { useViewState } from '../../app/storage';
import { DataTable, type Column } from '../../components/DataTable';
import { Icon } from '../../components/Icon';
import { Chip, ClientLink, PageHead, PrioChip, StatLine, Tabs } from '../../components/ui';
import { BKS, CBY, fD, fmtMin, fT, INCS, inBrand, MONS, NF2, NOW, RESTS } from '../../data';
import type { BackupJob, Incident, Monitor, RestoreReq } from '../../data';
import { BusyButton, NoRows, StateChip, useBusy } from './infraestructura/shared';

type Tab = 'monitores' | 'incidentes' | 'respaldos' | 'restauraciones';
const TABS: Tab[] = ['monitores', 'incidentes', 'respaldos', 'restauraciones'];
const SEV_ORDER: string[] = ['critica', 'alta', 'media', 'baja'];
const NEXT: Record<string, string> = { Solicitada: 'Aprobada', Aprobada: 'En curso', 'En curso': 'Completada' };

export default function MonitoreoView({ param }: ViewProps) {
  const { brand, dataVersion, refresh, toast, dialogs } = useApp();
  const [tab, setTab] = useViewState<Tab>('mon.tab', 'monitores');
  const { busy, run } = useBusy();

  useEffect(() => {
    if (param && (TABS as string[]).includes(param)) setTab(param as Tab);
  }, [param, setTab]);

  const rests = useMemo(() => RESTS.filter((r) => inBrand(brand, r.cid)), [brand, dataVersion]);
  const openInc = INCS.filter((i) => i.st === 'Abierto').length;
  const pendRest = rests.filter((r) => r.st !== 'Completada').length;

  const monPause = (m: Monitor) => {
    m.paused = !m.paused;
    toast(m.paused ? 'Monitor en pausa' : 'Monitor reanudado', m.n, 'info');
    refresh();
  };

  const incResolve = (i: Incident) =>
    dialogs.form({
      title: 'Resolver incidente',
      sub: `${i.id} · ${i.n}`,
      fields: [
        { id: 'c', label: 'Causa raíz', type: 'textarea', req: true, full: true },
        {
          id: 'p',
          label: 'Publicar en la página de estado',
          type: 'select',
          options: [
            ['si', 'Sí'],
            ['no', 'No'],
          ],
          value: 'si',
        },
      ],
      submit: 'Resolver',
      onSubmit: (v) => {
        i.st = 'Resuelto';
        i.end = new Date(Math.max(NOW.getTime(), i.at.getTime() + 60000));
        toast('Incidente resuelto', v.p === 'si' ? `${i.id} · publicado en la página de estado` : i.id);
        refresh();
      },
    });

  const bkRun = (b: BackupJob) =>
    run(b.id, 1300, () => {
      b.last = 'Correcto';
      toast('Respaldo completado', `${b.n} · ${b.size}`);
      refresh();
    });

  const rsNext = (r: RestoreReq) => {
    const nx = NEXT[r.st];
    if (!nx) return;
    const go = () => {
      r.st = nx;
      toast('Restauración: ' + nx, `${r.id} · ${CBY[r.cid]?.name ?? r.cid}`);
      refresh();
    };
    if (r.st === 'Solicitada')
      dialogs.confirm({
        title: 'Aprobar restauración',
        body: (
          <p style={{ margin: 0 }}>
            Se restaurará <b>{r.scope}</b> de la cuenta <span className="mono">{r.acct}</span> al {fD(r.pt)} {fT(r.pt)}. Los cambios posteriores a esa fecha se perderán en ese alcance.
          </p>
        ),
        okLabel: 'Aprobar',
        onOk: go,
      });
    else go();
  };

  const monCols: Column<Monitor>[] = [
    { key: 'n', header: 'Monitor', className: 'strong', render: (m) => m.n, sort: (m) => m.n },
    { key: 'type', header: 'Tipo', className: 'nw', render: (m) => m.type, sort: (m) => m.type },
    { key: 't', header: 'Destino', className: 'mono sub', minWidth: 150, render: (m) => <span style={{ overflowWrap: 'anywhere' }}>{m.t}</span> },
    { key: 'st', header: 'Estado', render: (m) => (m.paused ? <Chip kind="outline">En pausa</Chip> : <StateChip s={m.st} />), sort: (m) => (m.paused ? 'zz' : m.st) },
    {
      key: 'up',
      header: 'Disponibilidad 30 d',
      minWidth: 150,
      sort: (m) => m.up,
      render: (m) => (
        <>
          <div className="bar thin" role="meter" aria-valuemin={95} aria-valuemax={100} aria-valuenow={m.up} aria-label={`Disponibilidad ${NF2.format(m.up)} %`}>
            <i className={m.up >= 99.9 ? 'l1' : m.up >= 99 ? 'l2' : 'l4'} style={{ width: `${Math.max(4, ((m.up - 95) / 5) * 100)}%` }} />
          </div>
          <small className="num" style={{ fontSize: 12 }}>
            {NF2.format(m.up)} %
          </small>
        </>
      ),
    },
    { key: 'ms', header: 'Respuesta', align: 'r', className: 'num', render: (m) => (m.ms ? m.ms + ' ms' : '—'), sort: (m) => m.ms },
    {
      key: 'act',
      header: 'Acciones',
      align: 'r',
      render: (m) => (
        <button type="button" className="btn sm" onClick={() => monPause(m)} aria-label={`${m.paused ? 'Reanudar' : 'Pausar'} ${m.n}`}>
          {m.paused ? 'Reanudar' : 'Pausar'}
        </button>
      ),
    },
  ];

  const incCols: Column<Incident>[] = [
    {
      key: 'n',
      header: 'Incidente',
      sort: (i) => i.id,
      render: (i) => (
        <>
          <b className="mono">{i.id}</b> {i.n}
        </>
      ),
    },
    { key: 'sev', header: 'Severidad', render: (i) => <PrioChip p={i.sev} />, sort: (i) => SEV_ORDER.indexOf(i.sev) },
    { key: 'at', header: 'Inicio', className: 'num nw', render: (i) => `${fD(i.at)} ${fT(i.at)}`, sort: (i) => i.at },
    { key: 'dur', header: 'Duración', className: 'num', render: (i) => fmtMin(((i.end || NOW).getTime() - i.at.getTime()) / 60000), sort: (i) => (i.end || NOW).getTime() - i.at.getTime() },
    { key: 'st', header: 'Estado', render: (i) => <StateChip s={i.st} />, sort: (i) => i.st },
    {
      key: 'act',
      header: 'Acciones',
      align: 'r',
      render: (i) =>
        i.st === 'Abierto' ? (
          <button type="button" className="btn sm" onClick={() => incResolve(i)}>
            <Icon name="check" size="sm" />
            Resolver
          </button>
        ) : null,
    },
  ];

  const bkCols: Column<BackupJob>[] = [
    { key: 'n', header: 'Trabajo', className: 'mono strong', render: (b) => b.n, sort: (b) => b.n },
    { key: 'scope', header: 'Alcance', render: (b) => b.scope },
    { key: 'sch', header: 'Programación', className: 'nw', render: (b) => b.sch },
    { key: 'last', header: 'Último resultado', render: (b) => <StateChip s={b.last} />, sort: (b) => b.last },
    { key: 'size', header: 'Tamaño', align: 'r', className: 'num', render: (b) => b.size, sort: (b) => parseFloat(b.size) },
    {
      key: 'dest',
      header: 'Destino · retención',
      className: 'sub',
      render: (b) => (
        <>
          {b.dest}
          <br />
          {b.ret}
        </>
      ),
    },
    {
      key: 'act',
      header: 'Acciones',
      align: 'r',
      render: (b) => (
        <BusyButton busy={busy[b.id]} busyText="En cola…" icon="refresh" onClick={() => bkRun(b)}>
          Ejecutar ahora
        </BusyButton>
      ),
    },
  ];

  const rsCols: Column<RestoreReq>[] = [
    { key: 'id', header: 'Solicitud', className: 'mono strong', render: (r) => r.id, sort: (r) => r.id },
    { key: 'cli', header: 'Cliente', render: (r) => <ClientLink cid={r.cid} />, sort: (r) => CBY[r.cid]?.name },
    { key: 'acct', header: 'Cuenta', className: 'mono', render: (r) => r.acct },
    { key: 'pt', header: 'Punto de restauración', className: 'num nw', render: (r) => `${fD(r.pt)} ${fT(r.pt)}`, sort: (r) => r.pt },
    { key: 'scope', header: 'Alcance', render: (r) => r.scope },
    { key: 'by', header: 'Origen', className: 'sub', render: (r) => r.by },
    { key: 'st', header: 'Estado', render: (r) => <StateChip s={r.st} />, sort: (r) => r.st },
    {
      key: 'act',
      header: 'Acciones',
      align: 'r',
      className: 'nw',
      render: (r) =>
        r.st === 'Solicitada' ? (
          <button type="button" className="btn sm primary" onClick={() => rsNext(r)}>
            Aprobar
          </button>
        ) : r.st === 'Aprobada' ? (
          <button type="button" className="btn sm" onClick={() => rsNext(r)}>
            Iniciar
          </button>
        ) : r.st === 'En curso' ? (
          <button type="button" className="btn sm" onClick={() => rsNext(r)}>
            Marcar completada
          </button>
        ) : null,
    },
  ];

  const tabs = [
    { id: 'monitores' as Tab, label: 'Monitores', count: MONS.length },
    { id: 'incidentes' as Tab, label: 'Incidentes', count: openInc },
    { id: 'respaldos' as Tab, label: 'Respaldos', count: BKS.length },
    { id: 'restauraciones' as Tab, label: 'Restauraciones', count: pendRest },
  ];

  return (
    <>
      <PageHead crumbs={[['Infraestructura', 'monitoreo'], ['Monitoreo y respaldos', 'monitoreo']]} title="Monitoreo y respaldos" sub="Disponibilidad de servicios, incidentes, copias de seguridad y restauraciones solicitadas." />
      <StatLine
        items={[
          { label: 'Monitores', value: MONS.length },
          { label: 'Caídos / degradados', value: MONS.filter((m) => m.st !== 'Operativo' && !m.paused).length, tone: 'danger' },
          { label: 'Incidentes abiertos', value: openInc, tone: 'warn' },
          { label: 'Respaldos con problemas', value: BKS.filter((b) => b.last !== 'Correcto').length, tone: 'danger' },
          { label: 'Restauraciones pendientes', value: pendRest },
        ]}
      />
      <section className="card">
        <Tabs<Tab> label="Secciones" value={tab} onChange={setTab} tabs={tabs} />
        <div role="tabpanel" aria-label={tabs.find((t) => t.id === tab)?.label}>
          {tab === 'monitores' ? (
            <DataTable key="mon" columns={monCols} rows={MONS} rowKey={(m) => m.id} rowClass={(m) => (m.paused ? 'done' : undefined)} empty={<NoRows />} />
          ) : tab === 'incidentes' ? (
            <DataTable key="inc" columns={incCols} rows={INCS} rowKey={(i) => i.id} empty={<NoRows />} />
          ) : tab === 'respaldos' ? (
            <DataTable key="bk" columns={bkCols} rows={BKS} rowKey={(b) => b.id} empty={<NoRows />} />
          ) : (
            <DataTable key="rs" columns={rsCols} rows={rests} rowKey={(r) => r.id} empty={<NoRows />} />
          )}
        </div>
      </section>
    </>
  );
}
