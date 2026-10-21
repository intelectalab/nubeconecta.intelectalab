/**
 * Tabla con orden por columna y paginación (clases .tw / table.t / .pager).
 *
 *   <DataTable
 *     rows={rows} rowKey={(c) => c.id} pageSize={25}
 *     columns={[
 *       { key: 'name', header: 'Cliente', render: (c) => <ClientLink cid={c.id} />, sort: (c) => c.name, minWidth: 220 },
 *       { key: 'mrr', header: 'MRR', align: 'r', render: (c) => m.money(c.mrr, c.cur), sort: (c) => c.mrr },
 *     ]}
 *     empty={<EmptyState title="Sin clientes" />}
 *   />
 *
 * - `sort` en la columna la hace ordenable (botón .th-sort con aria-sort).
 * - Sin `pageSize` no pagina. Página controlada opcional con `page`/`onPage`.
 */
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Pager } from './ui';

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T, index: number) => ReactNode;
  /** Valor para ordenar (habilita el orden en la cabecera) */
  sort?: (row: T) => string | number | Date | null | undefined;
  /** 'r' alinea a la derecha (montos) */
  align?: 'r';
  /** Clase de la celda (p. ej. 'num nw', 'mono strong') */
  className?: string;
  minWidth?: number;
  thStyle?: CSSProperties;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  pageSize?: number;
  page?: number;
  onPage?: (p: number) => void;
  /** Orden inicial */
  defaultSort?: { key: string; dir: 1 | -1 };
  /** Contenido si no hay filas */
  empty?: ReactNode;
  rowClass?: (row: T) => string | undefined;
  rowStyle?: (row: T) => CSSProperties | undefined;
  className?: string;
  /** Pie de tabla (<tfoot>) */
  foot?: ReactNode;
  caption?: string;
}

export function DataTable<T>({ columns, rows, rowKey, pageSize, page, onPage, defaultSort, empty, rowClass, rowStyle, className, foot, caption }: DataTableProps<T>) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(defaultSort || null);
  const [ipage, setIpage] = useState(0);
  const pg = page ?? ipage;
  const setPg = onPage ?? setIpage;

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col || !col.sort) return rows;
    const f = col.sort;
    const val = (r: T) => {
      const v = f(r);
      return v instanceof Date ? v.getTime() : v;
    };
    return rows.slice().sort((a, b) => {
      const x = val(a);
      const y = val(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      if (typeof x === 'number' && typeof y === 'number') return (x - y) * sort.dir;
      return String(x).localeCompare(String(y), 'es') * sort.dir;
    });
  }, [rows, sort, columns]);

  const pages = pageSize ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1;
  const cur = Math.min(pg, pages - 1);
  useEffect(() => {
    if (pg > pages - 1) setPg(pages - 1);
  }, [pg, pages, setPg]);
  const view = pageSize ? sorted.slice(cur * pageSize, (cur + 1) * pageSize) : sorted;

  if (!rows.length && empty) return <>{empty}</>;
  return (
    <>
      <div className="tw">
        <table className={['t', className].filter(Boolean).join(' ')}>
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <thead>
            <tr>
              {columns.map((c) => {
                const active = sort && sort.key === c.key;
                return (
                  <th key={c.key} className={c.align === 'r' ? 'r' : undefined} style={c.thStyle} aria-sort={c.sort ? (active ? (sort!.dir === 1 ? 'ascending' : 'descending') : 'none') : undefined}>
                    {c.sort ? (
                      <button type="button" className="th-sort" onClick={() => setSort(active ? { key: c.key, dir: sort!.dir === 1 ? -1 : 1 } : { key: c.key, dir: 1 })}>
                        {c.header}
                        <span className="ar" aria-hidden="true">
                          {active ? (sort!.dir === 1 ? '▲' : '▼') : '↕'}
                        </span>
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {view.map((r, i) => (
              <tr key={rowKey(r, i)} className={rowClass?.(r)} style={rowStyle?.(r)}>
                {columns.map((c) => (
                  <td key={c.key} className={[c.align === 'r' ? 'r' : '', c.className].filter(Boolean).join(' ') || undefined} style={c.minWidth ? { minWidth: c.minWidth } : undefined}>
                    {c.render(r, i)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {foot ? <tfoot>{foot}</tfoot> : null}
        </table>
      </div>
      {pageSize && sorted.length > pageSize ? <Pager page={cur} total={sorted.length} per={pageSize} onPage={setPg} /> : null}
    </>
  );
}
