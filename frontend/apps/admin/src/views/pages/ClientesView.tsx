/**
 * Vista «clientes» (#clientes) — listado de clientes (vClientes del prototipo l.1700).
 *
 * Con backend (por defecto) usa la API real de M-CUS (clientes/CustomerList);
 * en modo demo (VITE_DEMO=1) sigue con los datos de ejemplo.
 */
import { useMemo } from 'react';
import CustomerList from './clientes/CustomerList';
import { LIVE } from './clientes/shared';
import { useActions } from '../../app/actions';
import { useApp, useMoney } from '../../app/context';
import { useViewState } from '../../app/storage';
import { DataTable, type Column } from '../../components/DataTable';
import { Icon } from '../../components/Icon';
import { BrandSelect, BrandTag, ClientLink, EmptyState, PageHead, SearchBox, Select, StatLine, StatusChip, Toolbar } from '../../components/ui';
import { BR, COUNTRIES, fClients, iso, NF0, norm, plural, saldo, toPEN, TODAY } from '../../data';
import type { Client } from '../../data';

const PER = 25;
const STATES = ['Activo', 'Moroso', 'Suspendido', 'Inactivo'] as const;
const balOf = (c: Client) => c.invoices.filter((v) => v.status === 'Pendiente' || v.status === 'Vencida').reduce((a, v) => a + saldo(v), 0);

export default function ClientesView() {
  return LIVE ? <CustomerList /> : <ClientesDemoView />;
}

function ClientesDemoView() {
  const { brand, dataVersion, toast } = useApp();
  const m = useMoney();
  const act = useActions();
  const [q, setQ] = useViewState('cli.q', '');
  const [st, setSt] = useViewState('cli.st', '');
  const [pais, setPais] = useViewState('cli.pais', '');
  const [page, setPage] = useViewState('cli.page', 0);

  const all = useMemo(() => fClients(brand), [brand, dataVersion]);
  const rows = useMemo(() => {
    const n = norm(q);
    return all.filter((c) => (!n || norm(c.name).includes(n) || norm(c.doc).includes(n) || norm(c.id).includes(n) || norm(c.email).includes(n)) && (!st || c.status === st) && (!pais || c.country === pais));
  }, [all, q, st, pais]);
  const pages = Math.max(1, Math.ceil(rows.length / PER));
  const pg = Math.min(page, pages - 1);

  const upd = (f: (v: string) => void) => (v: string) => {
    f(v);
    setPage(0);
  };
  const clear = () => {
    setQ('');
    setSt('');
    setPais('');
    setPage(0);
  };
  const exportCsv = () => toast('Exportación generada', `${rows.length} clientes · clientes_${iso(TODAY)}.csv (simulado)`);

  const avg = all.reduce((a, c) => a + toPEN(c.mrr, c.cur), 0) / Math.max(1, all.length);

  const columns: Column<Client>[] = [
    {
      key: 'name',
      header: 'Cliente',
      minWidth: 220,
      sort: (c) => c.name,
      render: (c) => (
        <>
          <ClientLink cid={c.id} />
          <div className="sub">
            <span className="mono">{c.id}</span> · {c.doc}
          </div>
        </>
      ),
    },
    { key: 'brand', header: 'Marca', sort: (c) => BR[c.brand].n, render: (c) => <BrandTag brand={c.brand} /> },
    { key: 'country', header: 'País', className: 'nw', sort: (c) => c.country, render: (c) => c.country },
    { key: 'status', header: 'Estado', sort: (c) => c.status, render: (c) => <StatusChip status={c.status} /> },
    { key: 'svc', header: 'Servicios', align: 'r', className: 'num', sort: (c) => c.services.filter((s) => s.st !== 'Cancelado').length, render: (c) => c.services.filter((s) => s.st !== 'Cancelado').length },
    { key: 'mrr', header: 'MRR', align: 'r', sort: (c) => toPEN(c.mrr, c.cur), render: (c) => m.money(c.mrr, c.cur) },
    {
      key: 'bal',
      header: 'Saldo',
      align: 'r',
      sort: (c) => toPEN(balOf(c), c.cur),
      render: (c) => {
        const b = balOf(c);
        return b ? (
          <span className="strong" style={c.status !== 'Activo' ? { color: 'var(--danger-text)' } : undefined}>
            {m.money(b, c.cur)}
          </span>
        ) : (
          '—'
        );
      },
    },
    { key: 'exec', header: 'Ejecutivo', className: 'nw', sort: (c) => c.exec, render: (c) => c.exec },
  ];

  return (
    <>
      <PageHead
        crumbs={[['Operación', 'clientes'], ['Clientes']]}
        title="Clientes"
        sub={`${NF0.format(all.length)} clientes · ${brand === 'all' ? '4 marcas' : BR[brand].n} · un solo RUC emisor`}
        actions={
          <>
            <button type="button" className="btn" onClick={exportCsv}>
              <Icon name="download" size="sm" />
              Exportar
            </button>
            <button type="button" className="btn primary" onClick={act.newClient}>
              <Icon name="plus" size="sm" />
              Nuevo cliente
            </button>
          </>
        }
      />
      <div className="card" style={{ marginBottom: 16 }}>
        <StatLine items={[...STATES.map((s) => ({ label: `${s}s`, value: NF0.format(all.filter((c) => c.status === s).length) })), { label: 'MRR promedio', value: m.money(avg, 'PEN') }]} />
      </div>
      <section className="card">
        <Toolbar count={plural(rows.length, 'resultado', 'resultados')}>
          <SearchBox value={q} onChange={upd(setQ)} placeholder="Nombre, RUC, código o correo…" label="Buscar clientes" />
          <BrandSelect />
          <Select value={st} onChange={upd(setSt)} label="Estado" options={[['', 'Todos los estados'], ...STATES.map((s): [string, string] => [s, s])]} />
          <Select value={pais} onChange={upd(setPais)} label="País" options={[['', 'Todos los países'], ...COUNTRIES.map((c): [string, string] => [c[0], c[0]])]} />
        </Toolbar>
        {rows.length ? (
          <DataTable columns={columns} rows={rows} rowKey={(c) => c.id} pageSize={PER} page={pg} onPage={setPage} />
        ) : (
          <EmptyState
            title="Sin clientes que coincidan"
            text="Ajuste la búsqueda o limpie los filtros."
            action={
              <button type="button" className="btn sm" onClick={clear}>
                Limpiar filtros
              </button>
            }
          />
        )}
      </section>
    </>
  );
}
