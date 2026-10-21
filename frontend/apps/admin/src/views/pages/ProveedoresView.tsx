/**
 * Vista «proveedores» (#proveedores): cuentas por proveedor, costos mensuales,
 * renovaciones y saldos prepago. Guía: vProveedores del prototipo.
 */
import { useMemo } from 'react';
import { useApp } from '../../app/context';
import { useViewState } from '../../app/storage';
import { DataTable, type Column } from '../../components/DataTable';
import { Icon } from '../../components/Icon';
import { Chip, DayChip, PageHead, Select, StatLine, Toolbar } from '../../components/ui';
import { addD, diffD, fD, fromIso, iso, moneyRaw, PACC, plural, TODAY } from '../../data';
import type { Cur, ProviderAccount } from '../../data';
import { NoRows } from './infraestructura/shared';

const TYPES = ['Reseller', 'VPS', 'Cloud', 'Registrador', 'CDN', 'Mailing', 'Correo', 'Licencias'];
const balCur = (a: ProviderAccount): Cur => (a.p === 'PoloDomains' ? 'PEN' : 'USD');

export default function ProveedoresView() {
  const { dataVersion, refresh, toast, dialogs } = useApp();
  const [type, setType] = useViewState('pv.type', '');

  const rows = useMemo(() => PACC.filter((a) => !type || a.type === type), [type, dataVersion]);
  const types = useMemo(() => [...new Set(PACC.map((a) => a.type))], [dataVersion]);
  const tot = PACC.reduce((a, x) => a + x.cost, 0);
  const ren = PACC.filter((a) => a.ren && diffD(a.ren, TODAY) <= 30);
  const low = PACC.filter((a) => a.bal != null && a.bal < 100);

  const topup = (a: ProviderAccount) =>
    dialogs.form({
      title: 'Recargar saldo',
      sub: `${a.p} · ${a.acc}`,
      fields: [{ id: 'm', label: 'Monto', type: 'number', min: 1, value: '200', req: true }],
      submit: 'Registrar recarga',
      validate: (v) => (+v.m > 0 ? null : 'Monto inválido.'),
      onSubmit: (v) => {
        a.bal = (a.bal ?? 0) + +v.m;
        a.st = 'Activa';
        toast('Recarga registrada', `${a.p} · nuevo saldo ${moneyRaw(a.bal, balCur(a))}`);
        refresh();
      },
    });

  const paid = (a: ProviderAccount) => {
    const next = addD(a.ren || TODAY, 30);
    dialogs.confirm({
      title: 'Registrar pago al proveedor',
      body: (
        <p style={{ margin: 0 }}>
          {a.p} · {a.acc} · {moneyRaw(a.cost, 'USD')}. La próxima renovación pasará a {fD(next)}.
        </p>
      ),
      okLabel: 'Registrar',
      onOk: () => {
        a.ren = next;
        toast('Pago registrado', a.p);
        refresh();
      },
    });
  };

  const add = () =>
    dialogs.form({
      title: 'Agregar cuenta de proveedor',
      fields: [
        { id: 'p', label: 'Proveedor', req: true },
        { id: 'a', label: 'Cuenta / alias', req: true },
        { id: 't', label: 'Tipo', type: 'select', options: TYPES, value: 'Cloud' },
        { id: 'c', label: 'Costo mensual (US$)', type: 'number', min: 0, value: '0' },
        { id: 'r', label: 'Próxima renovación', type: 'date', value: iso(addD(TODAY, 30)) },
      ],
      submit: 'Agregar',
      onSubmit: (v) => {
        PACC.push({ id: 'PV' + PACC.length, p: v.p, acc: v.a, type: v.t, pay: 'Por definir', cost: +v.c || 0, ren: v.r ? fromIso(v.r) : null, bal: null, st: 'Activa' });
        toast('Cuenta agregada', `${v.p} · ${v.a}`);
        refresh();
      },
    });

  const cols: Column<ProviderAccount>[] = [
    { key: 'p', header: 'Proveedor', className: 'strong nw', render: (a) => a.p, sort: (a) => a.p },
    { key: 'acc', header: 'Cuenta', render: (a) => a.acc },
    { key: 'type', header: 'Tipo', render: (a) => <Chip kind="outline">{a.type}</Chip>, sort: (a) => a.type },
    { key: 'pay', header: 'Medio de pago', className: 'sub nw', render: (a) => a.pay },
    { key: 'cost', header: 'Costo mensual', align: 'r', className: 'num', render: (a) => (a.cost ? moneyRaw(a.cost, 'USD') : '—'), sort: (a) => a.cost },
    {
      key: 'ren',
      header: 'Renovación',
      className: 'nw',
      sort: (a) => a.ren,
      render: (a) =>
        a.ren ? (
          <>
            {fD(a.ren)} <DayChip n={diffD(a.ren, TODAY)} />
          </>
        ) : (
          <span className="sub">Prepago</span>
        ),
    },
    {
      key: 'bal',
      header: 'Saldo',
      align: 'r',
      sort: (a) => a.bal,
      render: (a) => {
        if (a.bal == null) return <span className="num">—</span>;
        const lowB = a.bal < 100;
        return (
          <span className={`num${lowB ? ' strong' : ''}`} style={lowB ? { color: 'var(--danger-text)' } : undefined}>
            {moneyRaw(a.bal, balCur(a))}
          </span>
        );
      },
    },
    { key: 'st', header: 'Estado', render: (a) => <Chip kind={a.st === 'Activa' ? 'ok' : 'warn'}>{a.st}</Chip>, sort: (a) => a.st },
    {
      key: 'act',
      header: 'Acciones',
      align: 'r',
      className: 'nw',
      render: (a) =>
        a.bal != null ? (
          <button type="button" className="btn sm" onClick={() => topup(a)}>
            <Icon name="card" size="sm" />
            Recargar
          </button>
        ) : (
          <button type="button" className="btn sm" onClick={() => paid(a)}>
            <Icon name="check" size="sm" />
            Registrar pago
          </button>
        ),
    },
  ];

  return (
    <>
      <PageHead
        crumbs={[['Infraestructura', 'infra'], ['Proveedores', 'proveedores']]}
        title="Proveedores"
        sub="Cuentas por proveedor, costos mensuales, renovaciones y saldos prepago."
        actions={
          <button type="button" className="btn primary" onClick={add}>
            <Icon name="plus" size="sm" />
            Agregar cuenta
          </button>
        }
      />
      <StatLine
        items={[
          { label: 'Costo mensual', value: moneyRaw(tot, 'USD', 1) },
          { label: 'Cuentas', value: PACC.length },
          { label: 'Renuevan en 30 días', value: ren.length, tone: 'warn' },
          { label: 'Saldos bajos (< US$ 100)', value: low.length, tone: low.length ? 'danger' : '' },
        ]}
      />
      <section className="card">
        <Toolbar count={plural(rows.length, 'cuenta', 'cuentas')}>
          <Select label="Tipo" value={type} onChange={setType} options={[['', 'Todos los tipos'], ...types.map((t): [string, string] => [t, t])]} />
        </Toolbar>
        <DataTable columns={cols} rows={rows} rowKey={(a) => a.id} empty={<NoRows />} />
      </section>
    </>
  );
}
