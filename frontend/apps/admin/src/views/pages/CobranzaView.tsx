/**
 * Vista «cobranza» (#cobranza[/pestaña]) — Bandeja de cobranza.
 * Guía: prototipo/panel.html vCobranza (l.1659) y acciones cobTab, cobSel,
 * remind, commit, commitDone, validate, reject, bulkRemind, clearCob (l.3423-3439).
 */
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useActions } from '../../app/actions';
import { useApp, useMoney } from '../../app/context';
import type { ViewProps } from '../../app/routes';
import { useViewState } from '../../app/storage';
import { DualMoney } from '../../components/Money';
import { Icon } from '../../components/Icon';
import { Chip, ClientLink, DayChip, EmptyState, Link, Note, PageHead, Pager, SearchBox, StatLine, Tabs } from '../../components/ui';
import { addD, CBY, commits, diffD, fD, fDs, fInv, fromIso, fT, IBY, iso, NOW, norm, plural, saldo, SEQ, sumBy, TODAY, vouchers } from '../../data';
import type { Invoice } from '../../data';
import { LIVE } from './clientes/shared';
import CollectionsView from './cobranza/CollectionsView';
import { activeCommit, cobData, InvLink, pageOf, PER, seqFor, SeqTimeline } from './finanzas/shared';

type CobTab = 'pronto' | 'vencidas' | 'vouchers' | 'compromisos' | 'suspensiones';
const TABS: [CobTab, string][] = [
  ['pronto', 'Vence pronto'],
  ['vencidas', 'Vencidas'],
  ['vouchers', 'Vouchers por validar'],
  ['compromisos', 'Compromisos'],
  ['suspensiones', 'Suspensiones programadas'],
];
const isTab = (x: string | null): x is CobTab => !!x && TABS.some(([k]) => k === x);

function CliCell({ cid }: { cid: string }) {
  return CBY[cid] ? <ClientLink cid={cid} sub /> : <span className="sub">—</span>;
}

/** Con backend usa la API real de M-BIL (cobranza/CollectionsView); con VITE_DEMO=1, el prototipo. */
export default function CobranzaView({ param }: ViewProps) {
  return LIVE ? <CollectionsView param={param} /> : <CobranzaDemoView param={param} />;
}

function CobranzaDemoView({ param }: Pick<ViewProps, 'param'>) {
  const { brand, dataVersion, dialogs, toast, refresh } = useApp();
  const m = useMoney();
  const act = useActions();
  const [tab, setTabState] = useViewState<CobTab>('cob.tab', 'pronto');
  const [q, setQ] = useViewState('cob.q', '');
  const [page, setPage] = useViewState('cob.page', 0);
  const [selId, setSel] = useViewState<string | null>('cob.sel', null);
  const seqRef = useRef<HTMLHeadingElement>(null);

  // Pestaña inicial desde la ruta (#cobranza/vouchers)
  useEffect(() => {
    if (isTab(param) && param !== tab) {
      setTabState(param);
      setPage(0);
      setSel(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [param]);

  const setTab = (k: CobTab) => {
    setTabState(k);
    setSel(null);
    setPage(0);
  };

  const D = useMemo(() => cobData(brand), [brand, dataVersion]);
  const open = useMemo(() => fInv(brand).filter((v) => v.status === 'Pendiente' || v.status === 'Vencida'), [brand, dataVersion]);
  const qn = norm(q);
  const match = (cid: string) => !qn || norm(CBY[cid]?.name || '').includes(qn);

  const cnt = (k: CobTab) => (k === 'vouchers' ? D.vouchers.filter((v) => v.st === 'Por validar').length : k === 'compromisos' ? D.compromisos.filter((c) => c.st === 'Vigente').length : D[k].length);
  const suspManana = D.suspensiones.filter((x) => x.kind === 'Suspensión' && !activeCommit(x.v.id)).length;

  /* ---------- Acciones ---------- */
  const remind = (v: Invoice, final?: boolean) => {
    v.remind.push(new Date(NOW));
    toast(final ? 'Aviso final enviado' : 'Recordatorio enviado', `${v.num} · ${CBY[v.cid].name} · correo y WhatsApp`);
    refresh();
  };

  const commitDlg = (v: Invoice) => {
    dialogs.form({
      title: 'Registrar compromiso de pago',
      sub: `${v.num} · ${CBY[v.cid].name}`,
      fields: [
        { id: 'd', label: 'Fecha comprometida', type: 'date', value: iso(addD(TODAY, 3)), req: true },
        { id: 'amt', label: `Monto (${v.cur === 'PEN' ? 'S/' : 'US$'})`, type: 'number', step: '0.01', min: 0, value: saldo(v).toFixed(2), req: true },
        { id: 'by', label: 'Registrado por', type: 'select', options: ['Rosa Mendoza', 'Lucía Paredes', 'Renzo Vargas'], value: 'Rosa Mendoza' },
        { id: 'ch', label: 'Confirmado por', type: 'select', options: ['WhatsApp', 'Llamada', 'Correo'], value: 'WhatsApp' },
        { id: 'note', label: 'Nota', type: 'textarea', full: true, value: '' },
      ],
      pre: <Note icon="handshake">Mientras el compromiso esté vigente se pausan la suspensión y el recargo por mora de este comprobante.</Note>,
      submit: 'Registrar compromiso',
      validate: (x) => {
        if (!x.d) return 'Indique la fecha comprometida.';
        const d = fromIso(x.d);
        if (diffD(d, TODAY) < 0) return 'La fecha no puede ser anterior a hoy.';
        if (diffD(d, TODAY) > 30) return 'El plazo máximo de un compromiso es 30 días.';
        if (!(+x.amt > 0)) return 'Ingrese un monto válido.';
        return null;
      },
      onSubmit: (x) => {
        const d = fromIso(x.d);
        commits.unshift({ id: 'CP-' + (401 + commits.length), inv: v.id, cid: v.cid, date: d, amt: +x.amt, cur: v.cur, note: x.note || `Confirmado por ${x.ch}`, by: x.by, st: 'Vigente' });
        toast('Compromiso registrado', `Suspensión en pausa hasta el ${fD(d)}`);
        refresh();
      },
    });
  };

  const commitDone = (id: string) => {
    const c = commits.find((x) => x.id === id);
    if (!c) return;
    const v = IBY[c.inv];
    dialogs.confirm({
      title: 'Marcar compromiso como cumplido',
      body: (
        <p style={{ margin: 0 }}>
          Se registrará el pago de {m.money(c.amt, c.cur)} del comprobante <b className="mono">{v.num}</b> y se cerrará el compromiso.
        </p>
      ),
      okLabel: 'Confirmar',
      onOk: () => {
        c.st = 'Cumplido';
        v.paid = Math.min(v.total, v.paid + c.amt);
        v.payments.push({ d: TODAY, m: 'Transferencia', amt: c.amt });
        if (saldo(v) <= 0) v.status = 'Pagada';
        toast('Compromiso cumplido', `${v.num} conciliado`);
        refresh();
      },
    });
  };

  const validate = (id: string) => {
    const x = vouchers.find((v) => v.id === id);
    if (!x) return;
    const v = IBY[x.inv];
    const c = CBY[x.cid];
    dialogs.confirm({
      title: 'Validar voucher',
      body: (
        <>
          <div className="voucher">
            <b>
              {x.bank} · Operación <span className="mono">{x.op}</span>
            </b>
            <span>
              Monto: <b className="num">{m.money(x.amt, x.cur)}</b> · recibido {fD(x.at)} {fT(x.at)}
            </span>
            <span>
              Aplicar a: <b className="mono">{v.num}</b> ({c.name}) · saldo {m.money(saldo(v), v.cur)}
            </span>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
            Confirme que la operación aparece en el estado de cuenta bancario. Al validar se concilia el comprobante{c.status === 'Suspendido' ? ' y se reactiva el servicio' : ''}.
          </p>
        </>
      ),
      okLabel: 'Validar pago',
      onOk: () => {
        x.st = 'Validado';
        v.paid = Math.min(v.total, v.paid + x.amt);
        v.payments.push({ d: TODAY, m: 'Transferencia ' + x.bank, amt: x.amt });
        if (saldo(v) <= 0) v.status = 'Pagada';
        toast('Voucher validado', `${x.id} · ${v.num} ${v.status === 'Pagada' ? 'pagada' : 'con pago parcial'}`);
        refresh();
      },
    });
  };

  const reject = (id: string) => {
    const x = vouchers.find((v) => v.id === id);
    if (!x) return;
    dialogs.form({
      title: 'Rechazar voucher',
      sub: `${x.id} · ${x.bank} · ${x.op}`,
      fields: [
        { id: 'r', label: 'Motivo', type: 'select', full: true, options: ['Operación no encontrada en el banco', 'Monto no coincide', 'Imagen ilegible', 'Voucher duplicado'], value: 'Operación no encontrada en el banco' },
        { id: 'n', label: 'Mensaje al cliente', type: 'textarea', full: true, value: 'Hola, no pudimos validar su voucher. ¿Podría enviarnos nuevamente la constancia?' },
      ],
      submit: 'Rechazar y notificar',
      onSubmit: () => {
        x.st = 'Rechazado';
        toast('Voucher rechazado', 'Se notificó al cliente por correo y WhatsApp.', 'warn');
        refresh();
      },
    });
  };

  const bulkRemind = () => {
    const due = fInv(brand).filter((v) => (v.status === 'Pendiente' || v.status === 'Vencida') && SEQ.some((s) => diffD(addD(v.due, s.off), TODAY) === 0));
    dialogs.confirm({
      title: 'Enviar avisos del día',
      body: (
        <p style={{ margin: 0 }}>
          Se enviarán <b>{due.length}</b> avisos programados para hoy ({fD(TODAY)}) según la secuencia configurada.
        </p>
      ),
      okLabel: 'Enviar ahora',
      onOk: () => {
        due.forEach((v) => v.remind.push(new Date(NOW)));
        toast('Avisos enviados', `${due.length} avisos por correo y WhatsApp`);
        refresh();
      },
    });
  };

  const pickSel = (id: string) => {
    setSel(id);
    if (window.matchMedia('(max-width:1360px)').matches) window.setTimeout(() => seqRef.current?.scrollIntoView({ block: 'start' }), 0);
  };

  const onPage = (p: number) => {
    setPage(p);
    setSel(null);
    document.getElementById('main')?.scrollTo?.({ top: 0 });
  };

  /* ---------- Tabla por pestaña ---------- */
  let count = 0;
  let table: ReactNode = null;
  let effSel: Invoice | null = null;
  let curPage = page;

  if (tab === 'pronto' || tab === 'vencidas') {
    const rows = D[tab].filter((v) => match(v.cid) || norm(v.num).includes(qn));
    count = rows.length;
    const pg = pageOf(rows, page);
    curPage = pg.page;
    const selV = (selId && rows.find((v) => v.id === selId)) || rows[0] || null;
    effSel = selV;
    table = (
      <table className="t">
        <thead>
          <tr>
            <th>Comprobante</th>
            <th>Cliente</th>
            <th>{tab === 'pronto' ? 'Vence' : 'Venció'}</th>
            <th className="r">Saldo</th>
            <th>{tab === 'pronto' ? 'Último aviso' : 'Servicio'}</th>
            <th className="r">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {pg.slice.map((v) => {
            const n = diffD(v.due, TODAY);
            const lastAuto = seqFor(v).filter((x) => x.s === 'done').pop();
            const sent = v.remind.length ? `Manual · ${fT(v.remind[v.remind.length - 1])}` : lastAuto ? `${lastAuto.act} · ${fDs(lastAuto.d)}` : '—';
            const cm = activeCommit(v.id);
            const isSel = selV?.id === v.id;
            return (
              <tr key={v.id} style={isSel ? { boxShadow: 'inset 3px 0 0 var(--brand)' } : undefined}>
                <td>
                  <InvLink v={v} onOpen={act.openInvoice} />
                </td>
                <td style={{ minWidth: 170 }}>
                  <CliCell cid={v.cid} />
                </td>
                <td className="num nw">
                  {fD(v.due)}
                  <div style={{ marginTop: 3 }}>
                    <DayChip n={n} />
                  </div>
                </td>
                <td className="r strong">{m.money(saldo(v), v.cur)}</td>
                <td>
                  {tab === 'pronto' ? (
                    <span className="sub">{sent}</span>
                  ) : cm ? (
                    <Chip kind="info" icon="handshake">
                      Compromiso {fDs(cm.date)}
                    </Chip>
                  ) : -n >= 1 ? (
                    <Chip kind="danger" icon="pause">
                      {-n > 10 ? 'Por dar de baja' : 'Suspendido'}
                    </Chip>
                  ) : (
                    <Chip kind="ok">Activo</Chip>
                  )}
                </td>
                <td className="r nw">
                  <button type="button" className="btn sm icon" onClick={() => remind(v)} aria-label={`Enviar recordatorio de ${v.num}`} title="Enviar recordatorio">
                    <Icon name="send" size="sm" />
                  </button>{' '}
                  {tab === 'vencidas' ? (
                    <>
                      <button type="button" className="btn sm" onClick={() => commitDlg(v)}>
                        <Icon name="handshake" size="sm" />
                        Compromiso
                      </button>{' '}
                    </>
                  ) : null}
                  <button
                    type="button"
                    className="btn sm icon"
                    onClick={() => pickSel(v.id)}
                    aria-label={`Ver secuencia de avisos de ${v.num}`}
                    title="Ver secuencia de avisos"
                    aria-pressed={isSel}
                    style={isSel ? { borderColor: 'var(--brand)', color: 'var(--brand-text)' } : undefined}
                  >
                    <Icon name="eye" size="sm" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  } else if (tab === 'vouchers') {
    const rows = D.vouchers.filter((v) => match(v.cid));
    count = rows.length;
    const pg = pageOf(rows, page);
    curPage = pg.page;
    table = (
      <table className="t">
        <thead>
          <tr>
            <th>Voucher</th>
            <th>Cliente</th>
            <th>Comprobante</th>
            <th>Banco · operación</th>
            <th className="r">Monto</th>
            <th>Recibido</th>
            <th className="r">Estado / acciones</th>
          </tr>
        </thead>
        <tbody>
          {pg.slice.map((x) => (
            <tr key={x.id} className={x.st !== 'Por validar' ? 'done' : undefined}>
              <td className="mono">{x.id}</td>
              <td style={{ minWidth: 160 }}>
                <CliCell cid={x.cid} />
              </td>
              <td>{IBY[x.inv] ? <InvLink v={IBY[x.inv]} onOpen={act.openInvoice} /> : '—'}</td>
              <td className="nw">
                {x.bank}
                <div className="sub mono">{x.op}</div>
              </td>
              <td className="r strong">{m.money(x.amt, x.cur)}</td>
              <td className="num nw">
                {fD(x.at)}
                <div className="sub">{fT(x.at)}</div>
              </td>
              <td className="r nw">
                {x.st === 'Por validar' ? (
                  <>
                    <button type="button" className="btn sm success" onClick={() => validate(x.id)}>
                      <Icon name="check" size="sm" />
                      Validar
                    </button>{' '}
                    <button type="button" className="btn sm" onClick={() => reject(x.id)}>
                      Rechazar
                    </button>
                  </>
                ) : (
                  <Chip kind={x.st === 'Validado' ? 'ok' : 'danger'} icon={x.st === 'Validado' ? 'check' : 'x'}>
                    {x.st}
                  </Chip>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  } else if (tab === 'compromisos') {
    const rows = D.compromisos.filter((c) => match(c.cid));
    count = rows.length;
    const pg = pageOf(rows, page);
    curPage = pg.page;
    table = (
      <table className="t">
        <thead>
          <tr>
            <th>Compromiso</th>
            <th>Cliente</th>
            <th>Comprobante</th>
            <th>Fecha comprometida</th>
            <th className="r">Monto</th>
            <th>Nota</th>
            <th>Estado</th>
            <th className="r">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {pg.slice.map((c) => {
            const n = diffD(c.date, TODAY);
            const v = IBY[c.inv];
            return (
              <tr key={c.id}>
                <td className="mono">{c.id}</td>
                <td>
                  <CliCell cid={c.cid} />
                </td>
                <td>{v ? <InvLink v={v} onOpen={act.openInvoice} /> : '—'}</td>
                <td className="nw num">
                  {fD(c.date)} {c.st === 'Vigente' ? <span className="sub">({n === 0 ? 'hoy' : n > 0 ? `en ${n} d` : `hace ${-n} d`})</span> : null}
                </td>
                <td className="r strong">{m.money(c.amt, c.cur)}</td>
                <td style={{ minWidth: 200 }}>
                  <span className="sub">
                    {c.note} · {c.by}
                  </span>
                </td>
                <td>
                  <Chip kind={c.st === 'Cumplido' ? 'ok' : c.st === 'Incumplido' ? 'danger' : 'info'}>{c.st}</Chip>
                </td>
                <td className="r nw">
                  {c.st === 'Vigente' ? (
                    <button type="button" className="btn sm" onClick={() => commitDone(c.id)}>
                      <Icon name="check" size="sm" />
                      Marcar cumplido
                    </button>
                  ) : c.st === 'Incumplido' && v ? (
                    <button type="button" className="btn sm" onClick={() => remind(v)}>
                      <Icon name="send" size="sm" />
                      Recordatorio
                    </button>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  } else {
    const rows = D.suspensiones.filter((x) => match(x.v.cid));
    count = rows.length;
    const pg = pageOf(rows, page);
    curPage = pg.page;
    table = (
      <table className="t">
        <thead>
          <tr>
            <th>Acción programada</th>
            <th>Fecha</th>
            <th>Cliente</th>
            <th>Servicios afectados</th>
            <th>Comprobante</th>
            <th className="r">Saldo</th>
            <th className="r">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {pg.slice.map((x) => {
            const c = CBY[x.v.cid];
            const cm = activeCommit(x.v.id);
            return (
              <tr key={`${x.kind}-${x.v.id}`}>
                <td>
                  {cm ? (
                    <Chip kind="info" icon="handshake">
                      En pausa
                    </Chip>
                  ) : (
                    <Chip kind={x.kind === 'Baja' ? 'danger' : 'high'} icon={x.kind === 'Baja' ? 'trash' : 'pause'}>
                      {x.kind}
                    </Chip>
                  )}
                </td>
                <td className="num nw">
                  {fD(x.d)}
                  {diffD(x.d, TODAY) === 1 ? <span className="sub"> (mañana)</span> : null}
                </td>
                <td>
                  <CliCell cid={x.v.cid} />
                </td>
                <td>
                  <span className="sub">
                    {(c?.services || [])
                      .filter((s) => s.st !== 'Cancelado')
                      .map((s) => s.t)
                      .slice(0, 3)
                      .join(', ')}
                  </span>
                </td>
                <td>
                  <InvLink v={x.v} onOpen={act.openInvoice} />
                </td>
                <td className="r strong">{m.money(saldo(x.v), x.v.cur)}</td>
                <td className="r nw">
                  {cm ? (
                    <span className="sub">Compromiso {fD(cm.date)}</span>
                  ) : (
                    <>
                      <button type="button" className="btn sm" onClick={() => commitDlg(x.v)}>
                        <Icon name="handshake" size="sm" />
                        Registrar compromiso
                      </button>{' '}
                      <button type="button" className="btn sm" onClick={() => remind(x.v, true)}>
                        <Icon name="send" size="sm" />
                        Aviso final
                      </button>
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  const side =
    tab === 'pronto' || tab === 'vencidas' ? (
      <aside className="card" aria-labelledby="hSeq">
        <div className="card-h">
          <h2 className="sec" id="hSeq" ref={seqRef}>
            Secuencia de avisos
          </h2>
          <Link to="ajustes" className="btn ghost sm">
            <Icon name="edit" size="sm" />
            Editar
          </Link>
        </div>
        <div className="card-b">
          {effSel ? (
            <>
              <div style={{ marginBottom: 12 }}>
                <b className="mono">{effSel.num}</b>
                <div className="sub" style={{ color: 'var(--muted)', fontSize: 12.5 }}>
                  {CBY[effSel.cid]?.name} · vence {fD(effSel.due)} · {m.money(saldo(effSel), effSel.cur)}
                </div>
              </div>
              <SeqTimeline inv={effSel} />
            </>
          ) : (
            <EmptyState title="Seleccione un comprobante" text="Use el ícono del ojo en la tabla para ver su secuencia." icon="eye" />
          )}
        </div>
      </aside>
    ) : (
      <aside className="card" aria-label="Reglas vigentes">
        <div className="card-h">
          <h2 className="sec">Reglas vigentes</h2>
        </div>
        <div className="card-b" style={{ display: 'grid', gap: 10, fontSize: 13 }}>
          <Note>Avisos a 30, 15, 7 y 3 días, y el día del vencimiento. Suspensión al día siguiente; baja a los 10 días de suspendido. El recargo por mora se emite como nota de débito.</Note>
          <Note icon="upload">Los vouchers de transferencia los valida Finanzas; al validar se concilia el comprobante y se reactiva el servicio si estaba suspendido.</Note>
          <Link to="ajustes" className="btn sm">
            <Icon name="sliders" size="sm" />
            Configurar secuencia
          </Link>
        </div>
      </aside>
    );

  return (
    <>
      <PageHead
        crumbs={[['Finanzas', 'cobranza'], ['Bandeja de cobranza']]}
        title="Bandeja de cobranza"
        sub="Seguimiento de vencimientos, vouchers, compromisos y suspensiones."
        actions={
          <button type="button" className="btn primary" onClick={bulkRemind}>
            <Icon name="send" size="sm" />
            Enviar avisos del día
          </button>
        }
      />
      <StatLine
        items={[
          { label: 'Por cobrar', to: 'cobranza', param: 'pronto', value: <DualMoney r={sumBy(open, (v) => [saldo(v), v.cur])} int /> },
          { label: 'Vencido', to: 'cobranza', param: 'vencidas', value: <DualMoney r={sumBy(open.filter((v) => v.status === 'Vencida'), (v) => [saldo(v), v.cur])} int />, tone: 'danger' },
          { label: 'Vouchers por validar', value: cnt('vouchers'), to: 'cobranza', param: 'vouchers' },
          { label: 'Compromisos vigentes', value: cnt('compromisos'), to: 'cobranza', param: 'compromisos' },
          { label: 'Suspensiones mañana', value: suspManana, to: 'cobranza', param: 'suspensiones' },
        ]}
      />
      <div className="split">
        <section className="card" aria-label="Bandejas de cobranza">
          <Tabs label="Bandejas de cobranza" value={tab} onChange={setTab} tabs={TABS.map(([id, label]) => ({ id, label, count: cnt(id) }))} />
          <div className="toolbar">
            <SearchBox
              value={q}
              onChange={(v) => {
                setQ(v);
                setPage(0);
              }}
              placeholder="Buscar cliente o comprobante…"
              label="Buscar en la bandeja"
            />
            <span className="count">{plural(count, 'registro', 'registros')}</span>
          </div>
          {count ? (
            <>
              <div className="tw">{table}</div>
              {count > PER ? <Pager page={curPage} total={count} per={PER} onPage={onPage} /> : null}
            </>
          ) : (
            <EmptyState
              title={qn ? 'Sin coincidencias' : 'Bandeja vacía'}
              text={qn ? 'Ningún registro coincide con la búsqueda.' : 'No hay registros en esta bandeja para la marca seleccionada.'}
              icon={qn ? 'search' : 'check'}
              action={
                qn ? (
                  <button type="button" className="btn sm" onClick={() => setQ('')}>
                    Limpiar búsqueda
                  </button>
                ) : undefined
              }
            />
          )}
        </section>
        {side}
      </div>
    </>
  );
}

