/**
 * Vista «cloud» (#cloud) contra la API real: proyectos cloud administrados por cliente,
 * con costo del mes, proyección y presupuesto. Montos en unidades menores (céntimos).
 */
import { useEffect, useMemo, useState } from 'react';
import { isProblem, type CloudPlatform, type CloudProject, type CloudProjectFilters } from '@hub/api';
import { useApp } from '../../app/context';
import type { ViewProps } from '../../app/routes';
import { href } from '../../app/routeMeta';
import { useViewState } from '../../app/storage';
import { filterParam, parseFilterParam } from '../../app/filterParam';
import { hub } from '../../auth/client';
import { DataTable, type Column } from '../../components/DataTable';
import { Icon } from '../../components/Icon';
import { EmptyState, Note, PageHead, PctBar, Seg, StatLine, Toolbar } from '../../components/ui';
import { plural } from '../../data';
import { BusyButton, NoRows } from './infraestructura/shared';
import { errorText, moneyMinor, useCan, useLoad } from './clientes/shared';

const cloudApi = hub.cloud;
const PER = 25;

const PLATFORMS: [CloudPlatform, string][] = [
  ['aws', 'AWS'],
  ['azure', 'Azure'],
  ['gcp', 'Google Cloud'],
  ['ibm', 'IBM Cloud'],
  ['oracle', 'Oracle'],
];
const PLATFORM_LABEL: Record<string, string> = { ...Object.fromEntries(PLATFORMS), other: 'Otro' };

const isOver = (p: CloudProject) => !!p.budget && p.budget.actual_minor >= p.budget.amount_minor;

const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/** Suma por moneda en texto ("US$ 10.00 · S/ 5.00"); «—» si no hay datos. */
const byCurrency = (items: { currency: string; minor: number }[]) => (items.length ? items.map((i) => moneyMinor(i.minor, i.currency)).join(' · ') : '—');

export default function CloudView({ param }: ViewProps) {
  const { toast, dialogs } = useApp();
  const can = useCan();
  const [prov, setProv] = useViewState('cp.prov', '');
  const [overOnly, setOverOnly] = useViewState('cp.over', '');
  const [cursor, setCursor] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const fl = parseFilterParam(param);
    if (!fl) return;
    setProv(PLATFORMS.some(([k]) => k === fl.prov) ? fl.prov : '');
    setOverOnly(fl.over === '1' ? '1' : '');
    setCursor(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [param]);

  const filter = useMemo<CloudProjectFilters>(() => ({ platform: prov as CloudPlatform | '' }), [prov]);
  const res = useLoad(() => cloudApi.projects.list({ filter, size: PER, cursor }), [filter, cursor, nonce]);
  const summary = useLoad(() => cloudApi.summary(), [nonce]);
  const meta = res.data?.meta;
  const all = res.data?.data ?? [];
  // El backend no filtra por presupuesto superado: se filtra en cliente sobre la página cargada.
  const rows = useMemo(() => (overOnly ? all.filter(isOver) : all), [all, overOnly]);
  const s = summary.data;
  const denied = [res.error, summary.error].some((e) => isProblem(e) && e.status === 403);

  const reloadAll = () => {
    res.reload();
    summary.reload();
  };

  const sync = () => {
    setSyncing(true);
    setNonce((n) => n + 1);
    window.setTimeout(() => {
      setSyncing(false);
      toast('Costos actualizados', 'Datos recargados desde el servidor');
    }, 600);
  };

  const budget = (p: CloudProject) =>
    dialogs.form({
      title: 'Presupuesto mensual',
      sub: `${p.customer?.name ?? 'Sin cliente'} · ${p.name}`,
      fields: [{ id: 'b', label: `Presupuesto (${p.cost?.currency ?? p.budget?.currency ?? 'USD'})`, type: 'number', min: 1, step: '0.01', value: p.budget ? p.budget.amount_minor / 100 : '', req: true }],
      submit: 'Guardar',
      validate: (v) => (+v.b > 0 ? null : 'Monto inválido.'),
      onSubmit: (v) => {
        const amount = Math.round(+v.b * 100);
        const cur = p.cost?.currency ?? p.budget?.currency ?? 'USD';
        const month = summary.data?.budget_month ?? currentMonth();
        void (async () => {
          try {
            if (p.budget && p.budget.period_month.startsWith(month)) {
              const b = await cloudApi.budgets.get(p.budget.id);
              await cloudApi.budgets.update(b.id, b.version, { amount_minor: amount, cost_currency: cur });
            } else {
              await cloudApi.budgets.create({ cloud_project_id: p.id, period_month: month, amount_minor: amount, cost_currency: cur });
            }
            toast('Presupuesto actualizado', moneyMinor(amount, cur));
            reloadAll();
          } catch (e) {
            if (isProblem(e) && e.code === 'version_conflict') {
              toast('Presupuesto modificado por otra persona', 'Se recargó el listado; vuelva a intentarlo.', 'info');
              reloadAll();
            } else toast('No se pudo guardar el presupuesto', errorText(e), 'info');
          }
        })();
      },
    });

  const canBudget = can('cloud.cloud_budget.create') || can('cloud.cloud_budget.update');

  const cols: Column<CloudProject>[] = [
    {
      key: 'cli',
      header: 'Cliente',
      minWidth: 180,
      sort: (p) => p.customer?.name,
      render: (p) =>
        p.customer ? (
          <a className="rowlink" href={href('cliente', p.customer.id)}>
            {p.customer.name}
          </a>
        ) : (
          <span className="sub">—</span>
        ),
    },
    {
      key: 'prov',
      header: 'Proveedor · cuenta',
      className: 'nw',
      sort: (p) => p.account?.platform,
      render: (p) => (
        <>
          <b>{p.account ? PLATFORM_LABEL[p.account.platform] ?? p.account.platform : '—'}</b>
          <div className="sub mono">{p.account?.external_account_id ?? p.account?.owner ?? ''}</div>
        </>
      ),
    },
    { key: 'name', header: 'Proyecto', className: 'sub', minWidth: 150, sort: (p) => p.name, render: (p) => p.name },
    { key: 'cost', header: 'Costo del mes', align: 'r', className: 'num', sort: (p) => p.cost?.monthly_minor ?? 0, render: (p) => (p.cost ? moneyMinor(p.cost.monthly_minor, p.cost.currency) : '—') },
    {
      key: 'fc',
      header: 'Proyección',
      align: 'r',
      className: 'num',
      sort: (p) => p.forecast_minor ?? 0,
      render: (p) => {
        if (p.forecast_minor === null) return '—';
        const over = !!p.budget && p.forecast_minor > p.budget.amount_minor;
        return <span style={over ? { color: 'var(--danger-text)', fontWeight: 700 } : undefined}>{moneyMinor(p.forecast_minor, p.cost?.currency ?? p.budget?.currency ?? 'USD')}</span>;
      },
    },
    { key: 'bud', header: 'Presupuesto', align: 'r', className: 'num', sort: (p) => p.budget?.amount_minor ?? 0, render: (p) => (p.budget ? moneyMinor(p.budget.amount_minor, p.budget.currency) : '—') },
    {
      key: 'use',
      header: 'Consumo del presupuesto',
      minWidth: 170,
      sort: (p) => p.budget?.consumption_pct ?? 0,
      render: (p) => {
        if (!p.budget) return <span className="sub">Sin presupuesto</span>;
        const u = p.budget.consumption_pct;
        const f = p.forecast_minor !== null && p.budget.amount_minor > 0 ? (p.forecast_minor / p.budget.amount_minor) * 100 : u;
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
    ...(canBudget
      ? [
          {
            key: 'act',
            header: 'Acciones',
            align: 'r' as const,
            render: (p: CloudProject) =>
              p.budget ? (
                can('cloud.cloud_budget.update') ? (
                  <button type="button" className="btn sm" onClick={() => budget(p)}>
                    Presupuesto
                  </button>
                ) : null
              ) : can('cloud.cloud_budget.create') ? (
                <button type="button" className="btn sm" onClick={() => budget(p)}>
                  Presupuesto
                </button>
              ) : null,
          },
        ]
      : []),
  ];

  const dash = (v: string) => (s ? v : '—');

  return (
    <>
      <PageHead
        crumbs={[['Infraestructura', 'infra'], ['Cloud', 'cloud']]}
        title="Cloud"
        sub="Proyectos y cuentas cloud administradas por cliente, con costo del mes y presupuesto."
        actions={
          <BusyButton className="btn" busy={syncing} busyText="Actualizando…" icon="refresh" onClick={sync}>
            Actualizar costos
          </BusyButton>
        }
      />
      {denied ? (
        <EmptyState title="Sin permiso" text="Su usuario no tiene permiso para ver el módulo Cloud." icon="lock" />
      ) : (
        <>
          {summary.error ? (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-b">
                <Note kind="warn" icon="tri" role="alert">
                  No se pudo cargar el resumen: {errorText(summary.error)}{' '}
                  <button type="button" className="btn sm" onClick={summary.reload}>Reintentar</button>
                </Note>
              </div>
            </div>
          ) : (
            <StatLine
              items={[
                { label: `Costo del mes${s?.budget_month ? ` (${s.budget_month})` : ''}`, value: dash(byCurrency(s?.monthly_cost_by_currency.map((m) => ({ currency: m.currency, minor: m.monthly_minor })) ?? [])), to: 'cloud', param: filterParam({}) },
                { label: 'Presupuesto total', value: dash(byCurrency(s?.budget_by_currency.map((b) => ({ currency: b.currency, minor: b.budget_minor })) ?? [])) },
                { label: 'Superarán el presupuesto', value: s ? s.over_budget_projects : '—', tone: s && s.over_budget_projects ? 'danger' : '', to: 'cloud', param: filterParam({ over: '1' }) },
              ]}
            />
          )}
          <section className="card">
            <Toolbar count={res.loading ? 'Cargando…' : `${plural(rows.length, 'proyecto', 'proyectos')}${meta?.has_more ? '+' : ''} en esta página`}>
              <Seg label="Proveedor" value={prov} onChange={(v) => { setProv(v); setCursor(null); }} options={[['', 'Todos'], ...PLATFORMS.map(([k, l]): [string, string] => [k, l])]} />
              <Seg label="Presupuesto" value={overOnly} onChange={setOverOnly} options={[['', 'Todos'], ['1', 'Superarán el presupuesto']]} />
            </Toolbar>
            {res.error ? (
              <div className="card-b">
                <Note kind="warn" icon="tri" role="alert">
                  No se pudo cargar el listado: {errorText(res.error)}{' '}
                  <button type="button" className="btn sm" onClick={res.reload}>Reintentar</button>
                </Note>
              </div>
            ) : !res.data && res.loading ? (
              <div className="card-b">Cargando proyectos…</div>
            ) : (
              <>
                <DataTable columns={cols} rows={rows} rowKey={(p) => p.id} empty={<NoRows />} />
                <div className="card-b" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button type="button" className="btn sm" disabled={res.loading || !meta?.prev_cursor} onClick={() => setCursor(meta?.prev_cursor ?? null)}>
                    <Icon name="cl" size="sm" />
                    Anterior
                  </button>
                  <button type="button" className="btn sm" disabled={res.loading || !meta?.next_cursor} onClick={() => setCursor(meta?.next_cursor ?? null)}>
                    Siguiente
                    <Icon name="cr" size="sm" />
                  </button>
                </div>
              </>
            )}
          </section>
        </>
      )}
    </>
  );
}
