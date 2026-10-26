/**
 * P-CUS-01 · Clientes contra la API real: búsqueda, filtros, orden y
 * paginación por cursor (GET /api/v1/admin/customers).
 */
import { useEffect, useMemo, useState } from 'react';
import type { Customer, CustomerFilters } from '@hub/api';
import { useApp } from '../../../app/context';
import { useViewState } from '../../../app/storage';
import { href } from '../../../app/routeMeta';
import { DataTable, type Column } from '../../../components/DataTable';
import { Icon } from '../../../components/Icon';
import { Chip, EmptyState, Note, PageHead, SearchBox, Select, Toolbar } from '../../../components/ui';
import { CustomerForm } from './CustomerForm';
import { COUNTRY_OPTIONS, countryName, customersApi, docOf, downloadBlob, errorText, moneyMinor, STATUS_LABEL, useCan, useLoad, useLookups } from './shared';

const PER = 25;
const SORTS: [string, string][] = [
  ['legal_name', 'Razón social (A-Z)'],
  ['-created_at', 'Más recientes'],
  ['code', 'Código'],
  ['-updated_at', 'Modificados recientemente'],
];

export default function CustomerList() {
  const { toast, navigate } = useApp();
  const can = useCan();
  const { brands, staff } = useLookups();
  const [q, setQ] = useViewState('cli.api.q', '');
  const [st, setSt] = useViewState('cli.api.st', '');
  const [pais, setPais] = useViewState('cli.api.pais', '');
  const [marca, setMarca] = useViewState('cli.api.marca', '');
  const [resp, setResp] = useViewState('cli.api.resp', '');
  const [deuda, setDeuda] = useViewState('cli.api.deuda', '');
  const [sort, setSort] = useViewState('cli.api.sort', 'legal_name');
  const [cursor, setCursor] = useState<string | null>(null);
  const [qDeb, setQDeb] = useState(q);
  const [creating, setCreating] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      // Sin efectos dentro del updater (React los exige puros): el cursor se reinicia aquí.
      setCursor(null);
      setQDeb(q.trim());
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const filter = useMemo<CustomerFilters>(
    () => ({ status: st as CustomerFilters['status'], country: pais, origin_brand_id: marca, account_manager_id: resp, has_overdue_debt: deuda === '1' }),
    [st, pais, marca, resp, deuda],
  );

  const res = useLoad(() => customersApi.list({ q: qDeb, filter, sort, cursor, size: PER }), [qDeb, filter, sort, cursor]);
  const rows = res.data?.data ?? [];
  const meta = res.data?.meta;
  const brandName = (id: string) => brands.find((b) => b.id === id)?.name ?? '—';
  const staffName = (id: string | null) => (id ? (staff.find((u) => u.id === id)?.name ?? '—') : 'Sin asignar');
  const filtered = !!(q || st || pais || marca || resp || deuda);

  // Cualquier cambio de criterio vuelve a la primera página.
  const upd = (f: (v: string) => void) => (v: string) => {
    f(v);
    setCursor(null);
  };
  const clear = () => {
    setQ('');
    setSt('');
    setPais('');
    setMarca('');
    setResp('');
    setDeuda('');
    setCursor(null);
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const blob = await customersApi.exportCsv({ q: qDeb, filter });
      downloadBlob(blob, `clientes_${new Date().toISOString().slice(0, 10)}.csv`);
      toast('Exportación generada', 'Hasta 10 000 clientes con los filtros actuales.');
    } catch (e) {
      toast('No se pudo exportar', errorText(e), 'err');
    } finally {
      setExporting(false);
    }
  };

  const columns: Column<Customer>[] = [
    {
      key: 'name',
      header: 'Cliente',
      minWidth: 220,
      render: (c) => (
        <>
          <a className="rowlink" href={href('cliente', c.id)}>
            {c.trade_name || c.legal_name}
          </a>
          <div className="sub">
            <span className="mono">{c.code}</span>
            {c.trade_name ? ` · ${c.legal_name}` : ''}
          </div>
        </>
      ),
    },
    { key: 'doc', header: 'Documento', className: 'nw', render: (c) => docOf(c) },
    { key: 'country', header: 'País', className: 'nw', render: (c) => countryName(c.country) },
    { key: 'brand', header: 'Marca', className: 'nw', render: (c) => brandName(c.origin_brand_id) },
    { key: 'exec', header: 'Responsable', className: 'nw', render: (c) => staffName(c.account_manager_id) },
    { key: 'svc', header: 'Servicios activos', align: 'r', className: 'num', render: (c) => c.active_services_count ?? 0 },
    {
      key: 'debt',
      header: 'Deuda vencida',
      align: 'r',
      render: (c) => (c.overdue_balance_minor ? <span style={{ color: 'var(--danger-text)', fontWeight: 600 }}>{moneyMinor(c.overdue_balance_minor, c.currency)}</span> : '—'),
    },
    { key: 'status', header: 'Estado', render: (c) => <Chip kind={c.status === 'active' ? 'ok' : ''}>{STATUS_LABEL[c.status]}</Chip> },
    {
      key: 'tags',
      header: 'Etiquetas',
      render: (c) =>
        c.tags.length ? (
          <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
            {c.tags.map((t) => (
              <Chip key={t.id}>{t.name}</Chip>
            ))}
          </span>
        ) : (
          '—'
        ),
    },
  ];

  const canCreate = can('customers.customer.create');

  return (
    <>
      <PageHead
        crumbs={[['Operación', 'clientes'], ['Clientes']]}
        title="Clientes"
        sub="Cartera única para todas las marcas"
        actions={
          <>
            {can('customers.customer.export') ? (
              <button type="button" className="btn" onClick={() => void exportCsv()} disabled={exporting}>
                <Icon name="download" size="sm" />
                {exporting ? 'Exportando…' : 'Exportar'}
              </button>
            ) : null}
            {canCreate ? (
              <button type="button" className="btn primary" onClick={() => setCreating(true)}>
                <Icon name="plus" size="sm" />
                Nuevo cliente
              </button>
            ) : null}
          </>
        }
      />
      <section className="card">
        <Toolbar count={res.loading ? 'Cargando…' : `${rows.length}${meta?.has_more ? '+' : ''} en esta página`}>
          <SearchBox value={q} onChange={upd(setQ)} placeholder="Nombre, documento, código o correo…" label="Buscar clientes" />
          <Select value={marca} onChange={upd(setMarca)} label="Marca" options={[['', 'Todas las marcas'], ...brands.map((b): [string, string] => [b.id, b.name])]} />
          <Select value={pais} onChange={upd(setPais)} label="País" options={[['', 'Todos los países'], ...COUNTRY_OPTIONS]} />
          <Select value={resp} onChange={upd(setResp)} label="Responsable" options={[['', 'Todos los responsables'], ...staff.map((u): [string, string] => [u.id, u.name])]} />
          <Select value={st} onChange={upd(setSt)} label="Estado" options={[['', 'Todos los estados'], ['active', 'Activos'], ['inactive', 'Inactivos']]} />
          <Select value={deuda} onChange={upd(setDeuda)} label="Deuda" options={[['', 'Con y sin deuda'], ['1', 'Con deuda vencida']]} />
          <Select value={sort} onChange={upd(setSort)} label="Orden" options={SORTS} />
        </Toolbar>
        {/* TODO(filtros-guardados): filtros guardados, etiqueta y campos personalizados filtrables (P-CUS-01). */}
        {res.error ? (
          <div className="card-b">
            <Note kind="warn" icon="tri" role="alert">
              No se pudo cargar el listado: {errorText(res.error)}{' '}
              <button type="button" className="btn sm" onClick={res.reload}>
                Reintentar
              </button>
            </Note>
          </div>
        ) : !res.loading && !rows.length ? (
          <EmptyState
            title={filtered ? 'Sin clientes que coincidan' : 'Aún no hay clientes'}
            text={filtered ? 'Ajuste la búsqueda o limpie los filtros.' : 'Cree el primer cliente para empezar.'}
            action={
              filtered ? (
                <button type="button" className="btn sm" onClick={clear}>
                  Limpiar filtros
                </button>
              ) : canCreate ? (
                <button type="button" className="btn sm primary" onClick={() => setCreating(true)}>
                  Crear cliente
                </button>
              ) : undefined
            }
          />
        ) : (
          <>
            <DataTable columns={columns} rows={rows} rowKey={(c) => c.id} caption="Clientes" />
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
      {creating ? (
        <CustomerForm
          open
          onClose={() => setCreating(false)}
          onSaved={(c) => {
            setCreating(false);
            toast('Cliente creado', `${c.legal_name} · ${c.code}`);
            navigate('cliente', c.id);
          }}
        />
      ) : null}
    </>
  );
}
