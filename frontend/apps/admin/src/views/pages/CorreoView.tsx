/**
 * Vista «correo» (#correo): licencias de Google Workspace / Microsoft 365
 * asignadas frente a facturadas y certificados SSL por vencer.
 * Guía: vCorreo del prototipo. Parámetro opcional: pestaña inicial ('lic' | 'ssl').
 */
import { useEffect, useMemo } from 'react';
import { useApp } from '../../app/context';
import type { ViewProps } from '../../app/routes';
import { useViewState } from '../../app/storage';
import { filterParam, parseFilterParam } from '../../app/filterParam';
import { DataTable, type Column } from '../../components/DataTable';
import { Chip, ClientLink, DayChip, PageHead, StatLine, Tabs } from '../../components/ui';
import { addD, CBY, CERTS, diffD, fD, inBrand, LICS, TODAY } from '../../data';
import type { Cert, License } from '../../data';
import { BusyButton, NoRows, useBusy } from './infraestructura/shared';

type Tab = 'lic' | 'ssl';

export default function CorreoView({ param }: ViewProps) {
  const { brand, dataVersion, refresh, toast, dialogs } = useApp();
  const [tab, setTab] = useViewState<Tab>('mail.tab', 'lic');
  const { busy, run } = useBusy();

  useEffect(() => {
    if (param === 'lic' || param === 'ssl') setTab(param);
    const t = parseFilterParam(param)?.tab;
    if (t === 'lic' || t === 'ssl') setTab(t);
  }, [param, setTab]);

  const lics = useMemo(() => LICS.filter((l) => inBrand(brand, l.cid)), [brand, dataVersion]);
  const certs = useMemo(() => CERTS.filter((c) => inBrand(brand, c.cid)), [brand, dataVersion]);
  const dif = lics.filter((l) => l.as !== l.bi);
  const soon = certs.filter((c) => diffD(c.exp, TODAY) <= 30);

  const licFix = (l: License) => {
    const d = l.as - l.bi;
    const name = CBY[l.cid]?.name ?? l.cid;
    dialogs.confirm({
      title: d > 0 ? 'Facturar licencias adicionales' : 'Ajustar facturación',
      body: (
        <p style={{ margin: 0 }}>
          {name} · {l.prod}: {d > 0 ? `se agregarán ${d} licencias a la próxima factura (prorrateadas).` : `se emitirá una nota de crédito por ${-d} licencias y se bajará la cantidad facturada.`}
        </p>
      ),
      okLabel: 'Confirmar',
      onOk: () => {
        l.bi = l.as;
        toast('Licencias cuadradas', `${name} · ${l.as} licencias`);
        refresh();
      },
    });
  };

  const sslRenew = (c: Cert) =>
    run(c.id, 1100, () => {
      c.exp = addD(TODAY, c.type.includes('AutoSSL') ? 90 : 365);
      toast('Certificado renovado e instalado', `${c.d} · vence ${fD(c.exp)}`);
      refresh();
    });

  const licCols: Column<License>[] = [
    { key: 'cli', header: 'Cliente', minWidth: 180, render: (l) => <ClientLink cid={l.cid} />, sort: (l) => CBY[l.cid]?.name },
    { key: 'prod', header: 'Producto', render: (l) => l.prod, sort: (l) => l.prod },
    { key: 'as', header: 'Asignadas (consola)', align: 'r', className: 'num', render: (l) => l.as, sort: (l) => l.as },
    { key: 'bi', header: 'Facturadas', align: 'r', className: 'num', render: (l) => l.bi, sort: (l) => l.bi },
    {
      key: 'd',
      header: 'Diferencia',
      sort: (l) => l.as - l.bi,
      render: (l) => {
        const d = l.as - l.bi;
        if (d > 0)
          return (
            <Chip kind="danger" icon="tri">
              +{d} sin facturar
            </Chip>
          );
        if (d < 0) return <Chip kind="warn">{-d} facturadas de más</Chip>;
        return (
          <Chip kind="ok" icon="check">
            Cuadra
          </Chip>
        );
      },
    },
    {
      key: 'act',
      header: 'Acciones',
      align: 'r',
      render: (l) => {
        const d = l.as - l.bi;
        return d ? (
          <button type="button" className="btn sm" onClick={() => licFix(l)}>
            {d > 0 ? 'Facturar diferencia' : 'Ajustar facturación'}
          </button>
        ) : null;
      },
    },
  ];

  const sslCols: Column<Cert>[] = [
    { key: 'd', header: 'Dominio', className: 'mono strong', render: (c) => c.d, sort: (c) => c.d },
    { key: 'cli', header: 'Cliente', render: (c) => <ClientLink cid={c.cid} />, sort: (c) => CBY[c.cid]?.name },
    { key: 'type', header: 'Tipo', className: 'nw', render: (c) => c.type, sort: (c) => c.type },
    {
      key: 'exp',
      header: 'Vence',
      className: 'nw num',
      sort: (c) => c.exp,
      render: (c) => (
        <>
          {fD(c.exp)} <DayChip n={diffD(c.exp, TODAY)} />
        </>
      ),
    },
    { key: 'auto', header: 'Renovación automática', render: (c) => (c.auto ? <Chip kind="ok">Sí</Chip> : <Chip kind="warn">No · manual</Chip>), sort: (c) => (c.auto ? 1 : 0) },
    {
      key: 'act',
      header: 'Acciones',
      align: 'r',
      render: (c) => (
        <BusyButton busy={busy[c.id]} busyText="Renovando…" icon="refresh" onClick={() => sslRenew(c)}>
          {c.auto ? 'Forzar renovación' : 'Renovar e instalar'}
        </BusyButton>
      ),
    },
  ];

  return (
    <>
      <PageHead crumbs={[['Infraestructura', 'infra'], ['Correo y SSL', 'correo']]} title="Correo y SSL" sub="Licencias de Google Workspace y Microsoft 365 asignadas frente a facturadas, y certificados por vencer." />
      <StatLine
        items={[
          { label: 'Licencias asignadas', value: lics.reduce((a, l) => a + l.as, 0), to: 'correo', param: filterParam({ tab: 'lic' }) },
          { label: 'Licencias facturadas', value: lics.reduce((a, l) => a + l.bi, 0), to: 'correo', param: filterParam({ tab: 'lic' }) },
          { label: 'Clientes con diferencia', value: dif.length, tone: dif.length ? 'danger' : '', to: 'correo', param: filterParam({ tab: 'lic' }) },
          { label: 'Certificados por vencer (30 d)', value: soon.length, tone: 'warn', to: 'correo', param: filterParam({ tab: 'ssl' }) },
        ]}
      />
      <section className="card">
        <Tabs<Tab>
          label="Secciones"
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'lic', label: 'Licencias de correo', count: lics.length },
            { id: 'ssl', label: 'Certificados SSL', count: certs.length },
          ]}
        />
        <div role="tabpanel" aria-label={tab === 'lic' ? 'Licencias de correo' : 'Certificados SSL'}>
          {tab === 'lic' ? (
            <DataTable key="lic" columns={licCols} rows={lics} rowKey={(l) => l.id} empty={<NoRows />} />
          ) : (
            <DataTable key="ssl" columns={sslCols} rows={certs} rowKey={(c) => c.id} defaultSort={{ key: 'exp', dir: 1 }} empty={<NoRows />} />
          )}
        </div>
      </section>
    </>
  );
}
