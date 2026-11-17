/**
 * Vista «facturas» (#facturas[/número]) — Facturas y pagos.
 * Guía: prototipo/panel.html vFacturas (l.1884), facRows, invTable,
 * emitDocDlg (l.3384) y acciones facPage / clearFac.
 * Param: número de comprobante (abre su detalle) o texto de búsqueda.
 */
import { useEffect, useMemo } from 'react';
import { ClientDatalist, useActions } from '../../app/actions';
import { useApp, useMoney } from '../../app/context';
import type { ViewProps } from '../../app/routes';
import { filterParam, parseFilterParam } from '../../app/filterParam';
import { useViewState } from '../../app/storage';
import { DualMoney } from '../../components/Money';
import { Icon } from '../../components/Icon';
import { EmptyState, PageHead, Pager, SearchBox, Select, StatLine } from '../../components/ui';
import { addD, addInv, CBY, diffD, fInv, findClient, IBY, NF0, norm, plural, sumBy, TODAY } from '../../data';
import type { Cur, InvoiceType } from '../../data';
import { InvTable, pageOf, PER } from './finanzas/shared';
import InvoiceList from './facturas/InvoiceList';
import { LIVE } from './clientes/shared';

const TYPES = ['Factura', 'Boleta', 'Nota de crédito', 'Nota de débito'];
const SUNATS = ['Aceptada', 'Pendiente', 'Rechazada', 'Observada'];
const STATES = ['Pagada', 'Pendiente', 'Vencida', 'Aplicada'];
const opts = (l: string, list: string[]): [string, string][] => [['', `${l}: todos`], ...list.map((o): [string, string] => [o, o])];

/** Con backend usa la API real de M-BIL (facturas/InvoiceList); con VITE_DEMO=1, el prototipo. */
export default function FacturasView({ param }: ViewProps) {
  return LIVE ? <InvoiceList param={param} /> : <FacturasDemoView param={param} />;
}

function FacturasDemoView({ param }: Pick<ViewProps, 'param'>) {
  const { brand, dataVersion, dialogs, toast, refresh } = useApp();
  const m = useMoney();
  const act = useActions();
  const [q, setQ] = useViewState('fac.q', '');
  const [fType, setType] = useViewState('fac.type', '');
  const [fSunat, setSunat] = useViewState('fac.sunat', '');
  const [fSt, setSt] = useViewState('fac.st', '');
  const [page, setPage] = useViewState('fac.page', 0);

  // #facturas/<número>: abre el detalle; otro texto se usa como búsqueda.
  useEffect(() => {
    if (!param) return;
    const fl = parseFilterParam(param);
    if (fl) {
      // Token f~clave=valor de un tile: reemplaza los filtros (type, sunat, st).
      setType(fl.type ?? '');
      setSunat(fl.sunat ?? '');
      setSt(fl.st ?? '');
      setQ('');
      setPage(0);
      return;
    }
    if (IBY[param]) act.openInvoice(param);
    else {
      setQ(param);
      setPage(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [param]);

  const all = useMemo(() => fInv(brand), [brand, dataVersion]);
  const rows = useMemo(() => {
    const qn = norm(q);
    return all
      .filter((v) => (!qn || norm(v.num).includes(qn) || norm(CBY[v.cid]?.name || '').includes(qn)) && (!fType || v.type === fType) && (!fSunat || v.sunat === fSunat) && (!fSt || v.status === fSt))
      .sort((a, b) => b.issue.getTime() - a.issue.getTime() || b.num.localeCompare(a.num));
  }, [all, q, fType, fSunat, fSt, dataVersion]);
  const mon = all.filter((v) => (v.issue.getMonth() === TODAY.getMonth() && v.issue.getFullYear() === 2026) || diffD(TODAY, v.issue) <= 30);
  const pg = pageOf(rows, page);

  const clear = () => {
    setQ('');
    setType('');
    setSunat('');
    setSt('');
    setPage(0);
  };
  const withReset = (fn: (v: string) => void) => (v: string) => {
    fn(v);
    setPage(0);
  };

  const emitDoc = () => {
    dialogs.form({
      title: 'Emitir comprobante',
      sub: 'Se envía a SUNAT al confirmar',
      pre: <ClientDatalist />,
      fields: [
        { id: 'c', label: 'Cliente', req: true, full: true, ph: 'Escriba para buscar…', list: 'dlClients' },
        { id: 'type', label: 'Tipo', type: 'select', options: TYPES, value: 'Factura' },
        { id: 'cur', label: 'Moneda', type: 'select', options: [['PEN', 'S/'], ['USD', 'US$']], value: 'PEN' },
        { id: 'd', label: 'Concepto', req: true, full: true, value: 'Hosting cPanel — Pyme (12 meses)' },
        { id: 'amt', label: 'Valor de venta (sin IGV)', type: 'number', step: '0.01', min: 0, value: '349.00', req: true },
        { id: 'days', label: 'Vence en (días)', type: 'select', options: ['0', '7', '15', '30'], value: '15' },
      ],
      submit: 'Emitir y enviar',
      validate: (v) => (!findClient(v.c) ? 'Seleccione un cliente existente.' : +v.amt > 0 ? null : 'Ingrese un monto válido.'),
      onSubmit: (v) => {
        const c = findClient(v.c);
        if (!c) return;
        const type = v.type as InvoiceType;
        const inv = addInv(c, {
          type,
          cur: v.cur as Cur,
          issue: TODAY,
          due: addD(TODAY, +v.days),
          lines: [{ d: v.d, q: 1, pu: (type === 'Nota de crédito' ? -1 : 1) * +v.amt }],
          sunat: 'Pendiente',
        });
        // Como el prototipo: limpia solo la búsqueda y vuelve a la primera página.
        setQ('');
        setPage(0);
        toast('Comprobante emitido', `${inv.num} · enviando a SUNAT…`, 'info');
        refresh();
        window.setTimeout(() => {
          inv.sunat = 'Aceptada';
          toast('Aceptado por SUNAT', `${inv.num} · CDR recibido`);
          refresh();
        }, 2400);
      },
    });
  };

  return (
    <>
      <PageHead
        crumbs={[['Finanzas', 'facturas'], ['Facturas y pagos']]}
        title="Facturas y pagos"
        sub="Comprobantes electrónicos emitidos con un solo RUC para las 4 marcas."
        actions={
          <button type="button" className="btn primary" onClick={emitDoc}>
            <Icon name="plus" size="sm" />
            Emitir comprobante
          </button>
        }
      />
      <StatLine
        items={[
          { label: 'Emitido (30 días)', value: <DualMoney r={sumBy(mon.filter((v) => v.type !== 'Nota de crédito'), (v) => [v.total, v.cur])} int /> },
          { label: 'Comprobantes', value: NF0.format(all.length), to: 'facturas', param: filterParam({}) },
          { label: 'Pendientes SUNAT', value: all.filter((v) => v.sunat === 'Pendiente').length, tone: 'warn', to: 'facturas', param: filterParam({ sunat: 'Pendiente' }) },
          { label: 'Rechazados / observados', value: all.filter((v) => v.sunat === 'Rechazada' || v.sunat === 'Observada').length, tone: 'danger', to: 'facturas', param: filterParam({ sunat: 'Rechazada' }) },
        ]}
      />
      <section className="card" aria-label="Comprobantes">
        <div className="toolbar">
          <SearchBox value={q} onChange={withReset(setQ)} placeholder="Número o cliente…" label="Buscar comprobantes" />
          <Select value={fType} onChange={withReset(setType)} options={opts('Tipo', TYPES)} label="Tipo" />
          <Select value={fSunat} onChange={withReset(setSunat)} options={opts('SUNAT', SUNATS)} label="SUNAT" />
          <Select value={fSt} onChange={withReset(setSt)} options={opts('Estado', STATES)} label="Estado" />
          <span className="count">{plural(rows.length, 'comprobante', 'comprobantes')}</span>
        </div>
        {rows.length ? (
          <>
            <InvTable list={pg.slice} onOpen={act.openInvoice} money={(v, c) => m.money(v, c)} />
            <Pager
              page={pg.page}
              total={rows.length}
              per={PER}
              onPage={(p) => {
                setPage(p);
                document.getElementById('main')?.scrollTo?.({ top: 0 });
              }}
            />
          </>
        ) : (
          <EmptyState
            title="Sin comprobantes"
            text="Ningún comprobante coincide con los filtros."
            icon="receipt"
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
