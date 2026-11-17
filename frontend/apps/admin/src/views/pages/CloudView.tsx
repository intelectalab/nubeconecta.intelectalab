/**
 * Vista «cloud» (#cloud): proyectos y cuentas cloud administradas por cliente,
 * con costo del mes, proyección y presupuesto. Guía: vCloud del prototipo.
 */
import { useEffect, useMemo } from 'react';
import { useApp } from '../../app/context';
import type { ViewProps } from '../../app/routes';
import { useViewState } from '../../app/storage';
import { filterParam, parseFilterParam } from '../../app/filterParam';
import { DataTable, type Column } from '../../components/DataTable';
import { ClientLink, PageHead, PctBar, Seg, StatLine, Toolbar } from '../../components/ui';
import { CBY, CPROJ, inBrand, moneyRaw, plural } from '../../data';
import type { CloudProject } from '../../data';
import { BusyButton, NoRows, useBusy } from './infraestructura/shared';

const PROVS = ['AWS', 'Azure', 'Google Cloud', 'IBM Cloud'];

export default function CloudView({ param }: ViewProps) {
  const { brand, dataVersion, refresh, toast, dialogs } = useApp();
  const [prov, setProv] = useViewState('cp.prov', '');
  const [overOnly, setOverOnly] = useViewState('cp.over', '');
  const { busy, run } = useBusy();

  useEffect(() => {
    const fl = parseFilterParam(param);
    if (!fl) return;
    setProv(PROVS.includes(fl.prov ?? '') ? fl.prov : '');
    setOverOnly(fl.over === '1' ? '1' : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [param]);

  const all = useMemo(() => CPROJ.filter((p) => inBrand(brand, p.cid)), [brand, dataVersion]);
  const rows = useMemo(() => all.filter((p) => (!prov || p.prov === prov) && (!overOnly || p.fc > p.bud)), [all, prov, overOnly]);
  const over = all.filter((p) => p.fc > p.bud);

  const sync = () =>
    run('sync', 1000, () => {
      CPROJ.forEach((p) => {
        p.cost = +(p.cost * 1.012).toFixed(2);
      });
      toast('Costos actualizados', 'AWS Cost Explorer, Azure Cost Management, GCP Billing e IBM Usage');
      refresh();
    });

  const budget = (p: CloudProject) =>
    dialogs.form({
      title: 'Presupuesto mensual',
      sub: `${CBY[p.cid]?.name ?? p.cid} · ${p.prov}`,
      fields: [
        { id: 'b', label: 'Presupuesto (US$)', type: 'number', min: 1, value: String(p.bud), req: true },
        { id: 'a', label: 'Alertar al cliente al', type: 'select', options: ['50 %', '80 %', '100 %'], value: '80 %' },
      ],
      submit: 'Guardar',
      validate: (v) => (+v.b > 0 ? null : 'Monto inválido.'),
      onSubmit: (v) => {
        p.bud = +v.b;
        toast('Presupuesto actualizado', `${moneyRaw(p.bud, 'USD')} · alerta al ${v.a}`);
        refresh();
      },
    });

  const cols: Column<CloudProject>[] = [
    { key: 'cli', header: 'Cliente', minWidth: 180, render: (p) => <ClientLink cid={p.cid} />, sort: (p) => CBY[p.cid]?.name },
    {
      key: 'prov',
      header: 'Proveedor · cuenta',
      className: 'nw',
      sort: (p) => p.prov,
      render: (p) => (
        <>
          <b>{p.prov}</b>
          <div className="sub mono">{p.acct}</div>
        </>
      ),
    },
    { key: 'svc', header: 'Servicios', className: 'sub', minWidth: 150, render: (p) => p.svc },
    { key: 'cost', header: 'Costo del mes', align: 'r', className: 'num', render: (p) => moneyRaw(p.cost, 'USD'), sort: (p) => p.cost },
    {
      key: 'fc',
      header: 'Proyección',
      align: 'r',
      className: 'num',
      sort: (p) => p.fc,
      render: (p) => <span style={p.fc > p.bud ? { color: 'var(--danger-text)', fontWeight: 700 } : undefined}>{moneyRaw(p.fc, 'USD')}</span>,
    },
    { key: 'bud', header: 'Presupuesto', align: 'r', className: 'num', render: (p) => moneyRaw(p.bud, 'USD'), sort: (p) => p.bud },
    {
      key: 'use',
      header: 'Consumo del presupuesto',
      minWidth: 170,
      sort: (p) => p.cost / p.bud,
      render: (p) => {
        const u = (p.cost / p.bud) * 100;
        const f = (p.fc / p.bud) * 100;
        return (
          <>
            <PctBar p={u} label="Consumo" />
            <small className="num" style={{ fontSize: 12, color: f > 100 ? 'var(--danger-text)' : 'var(--muted)' }}>
              {Math.round(u)} % usado · cierre {Math.round(f)} %
            </small>
          </>
        );
      },
    },
    {
      key: 'act',
      header: 'Acciones',
      align: 'r',
      render: (p) => (
        <button type="button" className="btn sm" onClick={() => budget(p)}>
          Presupuesto
        </button>
      ),
    },
  ];

  return (
    <>
      <PageHead
        crumbs={[['Infraestructura', 'infra'], ['Cloud', 'cloud']]}
        title="Cloud"
        sub="Proyectos y cuentas cloud administradas por cliente, con costo del mes y presupuesto."
        actions={
          <BusyButton className="btn" busy={busy.sync} busyText="Actualizando…" icon="refresh" onClick={sync}>
            Actualizar costos
          </BusyButton>
        }
      />
      <StatLine
        items={[
          { label: 'Costo del mes (al 08/10)', value: moneyRaw(all.reduce((a, p) => a + p.cost, 0), 'USD', 1), to: 'cloud', param: filterParam({}) },
          { label: 'Proyección de cierre', value: moneyRaw(all.reduce((a, p) => a + p.fc, 0), 'USD', 1) },
          { label: 'Presupuesto total', value: moneyRaw(all.reduce((a, p) => a + p.bud, 0), 'USD', 1) },
          { label: 'Superarán el presupuesto', value: over.length, tone: over.length ? 'danger' : '', to: 'cloud', param: filterParam({ over: '1' }) },
        ]}
      />
      <section className="card">
        <Toolbar count={plural(rows.length, 'proyecto', 'proyectos')}>
          <Seg label="Proveedor" value={prov} onChange={setProv} options={[['', 'Todos'], ...PROVS.map((p): [string, string] => [p, p])]} />
          <Seg label="Presupuesto" value={overOnly} onChange={setOverOnly} options={[['', 'Todos'], ['1', 'Superarán el presupuesto']]} />
        </Toolbar>
        <DataTable columns={cols} rows={rows} rowKey={(p) => p.id} empty={<NoRows />} />
      </section>
    </>
  );
}
