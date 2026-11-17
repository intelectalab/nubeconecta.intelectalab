/**
 * Vista «pedidos» (#pedidos) — aprovisionamiento de pedidos (vPedidos del prototipo l.2791).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../../app/context';
import { useViewState } from '../../app/storage';
import { Icon } from '../../components/Icon';
import { Chip, ClientLink, EmptyState, PageHead, Seg, StatLine, Toolbar } from '../../components/ui';
import { addD, EJEC, fD, fT, inBrand, ORDERS, OSTEPS, plural, TASKS, TODAY } from '../../data';
import type { Order } from '../../data';
import OrderList from './pedidos/OrderList';
import type { ViewProps } from '../../app/routes';
import { filterParam, parseFilterParam } from '../../app/filterParam';
import { LIVE } from './clientes/shared';

type OdFilter = '' | 'En curso' | 'Error' | 'Entregado';
const LAST = OSTEPS.length - 1;

/** Con backend usa la API real de M-ORD (pedidos/OrderList); con VITE_DEMO=1, el prototipo. */
export default function PedidosView({ param }: ViewProps) {
  return LIVE ? <OrderList param={param} /> : <PedidosDemoView param={param} />;
}

function PedidosDemoView({ param }: Pick<ViewProps, 'param'>) {
  const { brand, dataVersion, toast, refresh } = useApp();
  const [f, setF] = useViewState<OdFilter>('ped.st', '');
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const timers = useRef<number[]>([]);
  useEffect(() => {
    const fl = parseFilterParam(param);
    if (!fl) return;
    const st = fl.st ?? '';
    setF(st === 'En curso' || st === 'Error' || st === 'Entregado' ? st : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [param]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const all = useMemo(() => ORDERS.filter((o) => inBrand(brand, o.cid)), [brand, dataVersion]);
  const rows = all.filter((o) => !f || (f === 'Error' ? !!o.err : f === 'En curso' ? !o.err && o.step < LAST : o.step === LAST));

  const next = (o: Order) => {
    o.step++;
    if (o.step === 1) o.pay = 'Pagado';
    toast('Pedido actualizado', `${o.id} · ${OSTEPS[o.step]}`);
    if (o.step === LAST) TASKS.unshift({ id: 'TA-' + (300 + TASKS.length), t: `Confirmar entrega con el cliente: ${o.prod}`, cid: o.cid, orig: o.id, who: EJEC[0], due: addD(TODAY, 1), col: 'Por hacer', prio: 'baja' });
    refresh();
  };
  const retry = (o: Order) => {
    setBusy((b) => ({ ...b, [o.id]: true }));
    timers.current.push(
      window.setTimeout(() => {
        o.err = null;
        o.step = Math.min(LAST, o.step + 1);
        setBusy((b) => ({ ...b, [o.id]: false }));
        toast('Reintento correcto', `${o.id} · ${OSTEPS[o.step]}`);
        refresh();
      }, 1000),
    );
  };

  return (
    <>
      <PageHead crumbs={[['Operación', 'pedidos'], ['Pedidos']]} title="Pedidos" sub="Estado de aprovisionamiento de cada pedido, desde la compra hasta la entrega." />
      <div className="card" style={{ marginBottom: 16 }}>
        <StatLine
          items={[
            { label: 'Pedidos (7 días)', value: all.length, to: 'pedidos', param: filterParam({}) },
            { label: 'En curso', value: all.filter((o) => !o.err && o.step < LAST).length, to: 'pedidos', param: filterParam({ st: 'En curso' }) },
            { label: 'Con error', value: all.filter((o) => o.err).length, tone: 'danger', to: 'pedidos', param: filterParam({ st: 'Error' }) },
            { label: 'Entregados', value: all.filter((o) => o.step === LAST).length, tone: 'ok', to: 'pedidos', param: filterParam({ st: 'Entregado' }) },
          ]}
        />
      </div>
      <section className="card">
        <Toolbar count={plural(rows.length, 'pedido', 'pedidos')}>
          <Seg<OdFilter>
            label="Estado"
            value={f}
            onChange={setF}
            options={[
              ['', 'Todos'],
              ['En curso', 'En curso'],
              ['Error', 'Error'],
              ['Entregado', 'Entregado'],
            ]}
          />
        </Toolbar>
        {rows.length ? (
          <div className="tw">
            <table className="t">
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Cliente</th>
                  <th>Producto</th>
                  <th>Origen</th>
                  <th>Pago</th>
                  <th>Aprovisionamiento</th>
                  <th className="r">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.id}>
                    <td className="nw">
                      <b className="mono">{o.id}</b>
                      <div className="sub">
                        {fD(o.at)} {fT(o.at)}
                      </div>
                    </td>
                    <td style={{ minWidth: 170 }}>
                      <ClientLink cid={o.cid} />
                    </td>
                    <td>{o.prod}</td>
                    <td className="sub nw">{o.orig}</td>
                    <td>
                      <Chip kind={o.pay === 'Pagado' ? 'ok' : 'warn'}>{o.pay}</Chip>
                    </td>
                    <td style={{ minWidth: 300 }}>
                      <ol className="osteps" aria-label={`Progreso: ${OSTEPS[o.step]}${o.err ? ' (con error)' : ''}`}>
                        {OSTEPS.map((s, i) => (
                          <li key={s} className={o.err && i === o.step ? 'err' : i < o.step || o.step === LAST ? 'done' : i === o.step ? 'cur' : ''} title={s} aria-current={i === o.step ? 'step' : undefined}>
                            <span />
                            {s}
                          </li>
                        ))}
                      </ol>
                      {o.err ? (
                        <small style={{ color: 'var(--danger-text)', fontWeight: 600, fontSize: 12 }}>
                          <Icon name="oct" size="sm" /> {o.err}
                        </small>
                      ) : null}
                    </td>
                    <td className="r nw">
                      {o.err ? (
                        <button type="button" className="btn sm primary" disabled={busy[o.id]} onClick={() => retry(o)}>
                          {busy[o.id] ? (
                            <>
                              <span className="spin" aria-hidden="true" />
                              Reintentando…
                            </>
                          ) : (
                            <>
                              <Icon name="refresh" size="sm" />
                              Reintentar
                            </>
                          )}
                        </button>
                      ) : o.step < LAST ? (
                        <button type="button" className="btn sm" onClick={() => next(o)} disabled={o.step === 0 && o.pay === 'Pendiente'} title={o.step === 0 && o.pay === 'Pendiente' ? 'Esperando pago' : undefined}>
                          Avanzar
                        </button>
                      ) : (
                        <span className="sub">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="Sin registros" text="No hay datos para los filtros elegidos." />
        )}
      </section>
    </>
  );
}
