/**
 * Vista «cliente» (#cliente/<CL-id>) — ficha 360 del cliente (vCliente del prototipo l.1760).
 */
import { Fragment, useEffect, useMemo, useState } from 'react';
import { useActions } from '../../app/actions';
import { useApp, useMoney } from '../../app/context';
import { useViewState } from '../../app/storage';
import type { ViewProps } from '../../app/routes';
import { Icon, SevIcon } from '../../components/Icon';
import { DualMoney } from '../../components/Money';
import { BrandTag, Chip, Crumbs, DayChip, EmptyState, Kv, Note, PageHead, PrioChip, Seg, SlaBar, StatusChip, SunatChip, Switch, Tabs } from '../../components/ui';
import { CBY, diffD, fD, fDs, fT, NOW, saldo, sumBy, TODAY } from '../../data';
import type { Client, Service, Ticket } from '../../data';
import { DomTable } from './operacion/DomTable';
import { MapSvg, nodeTitle, projectsOf } from './operacion/clientMap';

type TabId = 'resumen' | 'mapa' | 'servicios' | 'dominios' | 'facturas' | 'tickets' | 'contratos' | 'actividad';

const tkKind = (s: string) => (s === 'Resuelto' ? 'ok' : s === 'Nuevo' ? 'info' : s === 'Esperando cliente' ? '' : 'warn');

export default function ClienteView({ param }: ViewProps) {
  const cid = param || 'CL-1001';
  const c = CBY[cid];
  if (!c) {
    return (
      <>
        <PageHead crumbs={[['Clientes', 'clientes'], ['Cliente']]} title="Cliente no encontrado" />
        <section className="card">
          <EmptyState
            title="No encontramos este cliente"
            text={`No existe un cliente con el código ${cid}.`}
            action={
              <a className="btn primary" href="#clientes">
                Volver a clientes
              </a>
            }
          />
        </section>
      </>
    );
  }
  return <Ficha key={c.id} c={c} />;
}

function Ficha({ c }: { c: Client }) {
  const act = useActions();
  const m = useMoney();
  const [tab, setTab] = useState<TabId>('resumen');

  const open = c.invoices.filter((v) => v.status === 'Pendiente' || v.status === 'Vencida');
  const bal = sumBy(open, (v) => [saldo(v), v.cur]);
  const openTk = c.tickets.filter((t) => t.status !== 'Resuelto');

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: 'resumen', label: 'Resumen' },
    { id: 'mapa', label: 'Mapa de servicios' },
    { id: 'servicios', label: 'Servicios', count: c.services.length },
    { id: 'dominios', label: 'Dominios', count: c.domains.length },
    { id: 'facturas', label: 'Facturas', count: c.invoices.length },
    { id: 'tickets', label: 'Tickets', count: openTk.length },
    { id: 'contratos', label: 'Contratos' },
    { id: 'actividad', label: 'Actividad' },
  ];

  let body: JSX.Element;
  if (tab === 'resumen') body = <Resumen c={c} />;
  else if (tab === 'mapa') body = <Mapa c={c} money={m.money} />;
  else if (tab === 'servicios') body = <Servicios c={c} />;
  else if (tab === 'dominios')
    body = <div className="card">{c.domains.length ? <DomTable list={c.domains} compact /> : <EmptyState title="Sin dominios" text="Este cliente no tiene dominios registrados con nosotros." />}</div>;
  else if (tab === 'facturas') body = <Facturas c={c} />;
  else if (tab === 'tickets') body = <Tickets c={c} />;
  else if (tab === 'contratos') body = <Contratos c={c} />;
  else body = <Actividad />;

  return (
    <>
      <Crumbs items={[['Clientes', 'clientes'], [c.name]]} />
      <section className="card c360" aria-label="Cabecera del cliente" style={{ marginBottom: 14 }}>
        <div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
            <StatusChip status={c.status} />
            <BrandTag brand={c.brand} />
            <span className="mono" style={{ color: 'var(--muted)', fontSize: 12 }}>
              {c.id}
            </span>
          </div>
          <h1 tabIndex={-1} id="ph1">
            {c.name}
          </h1>
          <div className="meta">
            <span>
              <Icon name="file" size="sm" />
              {c.doc}
            </span>
            <span>
              <Icon name="globe" size="sm" />
              {c.country}
            </span>
            <span>
              <Icon name="user" size="sm" />
              Ejecutivo: {c.exec}
            </span>
            <span>
              <Icon name="cal" size="sm" />
              Cliente desde {fD(c.since)}
            </span>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 12, justifyItems: 'end' }}>
          <div className="money">
            <div>
              <small>Saldo pendiente</small>
              <b style={{ color: open.some((v) => v.status === 'Vencida') ? 'var(--danger-text)' : 'var(--text)' }}>
                <DualMoney r={bal} />
              </b>
            </div>
            <div>
              <small>MRR</small>
              <b>{m.money(c.mrr, c.cur)}</b>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn" onClick={() => act.newTicket(c.id)}>
              <Icon name="msg" size="sm" />
              Abrir ticket
            </button>
            <button type="button" className="btn primary" onClick={() => act.payDialog(c.id)}>
              <Icon name="card" size="sm" />
              Registrar pago
            </button>
          </div>
        </div>
      </section>
      <Tabs tabs={tabs} value={tab} onChange={setTab} label="Secciones de la ficha" style={{ marginBottom: 14 }} />
      <div role="tabpanel">{body}</div>
    </>
  );
}

/* ---------- Resumen ---------- */
function Resumen({ c }: { c: Client }) {
  const act = useActions();
  const m = useMoney();
  const nx = c.services
    .filter((s) => s.st === 'Activo')
    .sort((a, b) => a.due.getTime() - b.due.getTime())
    .slice(0, 5);
  const openTk = c.tickets.filter((t) => t.status !== 'Resuelto');
  return (
    <div className="grid g-3">
      <section className="card">
        <div className="card-h">
          <h2 className="sec">Contacto y datos fiscales</h2>
        </div>
        <div className="card-b">
          <Kv
            items={[
              ['Contacto', c.contact],
              ['Correo', <span className="mono">{c.email}</span>],
              ['Teléfono', <span className="mono">{c.phone}</span>],
              ['Documento', c.doc],
              ['País', c.country],
              ['Moneda', c.cur === 'PEN' ? 'Soles (S/)' : 'Dólares (US$)'],
              ['Comprobante', c.person ? 'Boleta' : 'Factura'],
            ]}
          />
        </div>
      </section>
      <section className="card">
        <div className="card-h">
          <h2 className="sec">Próximos vencimientos</h2>
        </div>
        {nx.length ? (
          <ul className="rows">
            {nx.map((s) => (
              <li key={s.id}>
                <Icon name={s.ic} />
                <div className="grow">
                  <b>{s.t}</b>
                  <small>
                    {s.plan} · {m.money(s.price, s.cur)}
                  </small>
                </div>
                <DayChip n={diffD(s.due, TODAY)} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="Sin servicios activos" />
        )}
      </section>
      <section className="card">
        <div className="card-h">
          <h2 className="sec">Soporte</h2>
          <button type="button" className="btn sm" onClick={() => act.newTicket(c.id)}>
            <Icon name="plus" size="sm" />
            Abrir ticket
          </button>
        </div>
        {openTk.length ? (
          <ul className="rows">
            {openTk.map((t) => (
              <li key={t.id}>
                <SevIcon sev={t.prio} />
                <div className="grow">
                  <b>{t.sub}</b>
                  <small className="mono">{t.id}</small> <small>· {t.status}</small>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="card-b">
            <Note icon="check">Sin tickets abiertos.</Note>
          </div>
        )}
      </section>
    </div>
  );
}

/* ---------- Mapa de servicios ---------- */
function Mapa({ c, money }: { c: Client; money: (v: number, cur: 'PEN' | 'USD') => string }) {
  const { toast } = useApp();
  const ps = useMemo(() => projectsOf(c, money), [c, money]);
  const [proj, setProj] = useState(0);
  const [sel, setSel] = useState<string | null>(null);
  const [cv, setCv] = useViewState('cli.clientView', false);

  useEffect(() => {
    if (!sel) return;
    document.getElementById('comp-' + sel)?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  if (!ps.length) return <EmptyState title="Sin componentes" text="Este cliente aún no tiene servicios contratados." />;
  const pi = Math.min(proj, ps.length - 1);
  const p = ps[pi];
  const toggleCv = (v: boolean) => {
    setCv(v);
    toast(v ? 'Vista cliente activada' : 'Vista interna activada', v ? 'Se ocultan proveedores, nodos y costos.' : 'Se muestran proveedores y costos internos.', 'info');
  };
  const stTxt = (s: string) => (s === 'ok' ? 'Operativo' : s === 'warn' ? 'Atención' : 'Incidencia');
  const stKind = (s: string) => (s === 'ok' ? 'ok' : s === 'warn' ? 'warn' : 'danger');
  return (
    <div className="card">
      <div className="toolbar" style={{ justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 600 }}>Proyecto</span>
          <Seg
            label="Proyecto"
            value={String(pi)}
            onChange={(k) => {
              setProj(+k);
              setSel(null);
            }}
            options={ps.map((x, k): [string, string] => [String(k), x.n])}
          />
        </div>
        <Switch checked={cv} onChange={toggleCv}>
          Vista cliente
        </Switch>
      </div>
      <div className="card-b" style={{ paddingTop: 14, display: 'grid', gap: 14 }}>
        <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13 }}>
          {p.d} · {p.nodes.length} componentes ·{' '}
          {cv ? (
            <>
              <b style={{ color: 'var(--text)' }}>Vista cliente:</b> se ocultan proveedores, nodos y costos internos.
            </>
          ) : (
            'Haga clic en un componente para resaltarlo.'
          )}
        </p>
        <div className="mapwrap">
          <MapSvg p={p} sel={sel} clientView={cv} onSel={(k) => setSel((s) => (s === k ? null : k))} />
        </div>
        <p className="maphint" style={{ margin: '-6px 0 0', fontSize: 12, color: 'var(--muted)' }}>
          Deslice horizontalmente para ver el diagrama completo.
        </p>
        <div className="legend">
          <span>
            <i style={{ background: 'var(--ok)', borderRadius: '50%' }} />
            Operativo
          </span>
          <span>
            <i style={{ background: 'var(--warn)', borderRadius: '50%' }} />
            Requiere atención
          </span>
          <span>
            <i style={{ background: 'var(--danger)', borderRadius: '50%' }} />
            Incidencia
          </span>
          <span>Las flechas indican dependencia (de quien sirve a quien consume).</span>
        </div>
        <div className="grid g-4">
          {p.nodes.map((n) => (
            <article key={n.k} className={`comp${sel === n.k ? ' sel' : ''}`} id={`comp-${n.k}`}>
              <div className="comp-h">
                <span className="ico">
                  <Icon name={n.ic} size="sm" />
                </span>
                <b>{nodeTitle(n, cv)}</b>
                <Chip kind={stKind(n.st)}>{stTxt(n.st)}</Chip>
              </div>
              <dl>
                {cv ? null : (
                  <>
                    <dt>Proveedor</dt>
                    <dd>{n.prov}</dd>
                  </>
                )}
                {n.info.map(([a, b]) => (
                  <Fragment key={a}>
                    <dt>{a}</dt>
                    <dd>{b}</dd>
                  </Fragment>
                ))}
                <dt>Tarifa</dt>
                <dd>{n.price}</dd>
                {cv ? null : (
                  <>
                    <dt>Costo interno</dt>
                    <dd>{n.cost}</dd>
                  </>
                )}
              </dl>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- Servicios ---------- */
function Servicios({ c }: { c: Client }) {
  const { dialogs, toast, refresh } = useApp();
  const m = useMoney();
  const toggle = (s: Service) => {
    const to = s.st === 'Activo' ? 'Suspendido' : 'Activo';
    const susp = to === 'Suspendido';
    dialogs.confirm({
      title: susp ? 'Suspender servicio' : 'Reactivar servicio',
      body: (
        <p style={{ margin: 0 }}>
          {susp ? 'Se suspenderá' : 'Se reactivará'}{' '}
          <b>
            {s.t} — {s.plan}
          </b>
          {s.node ? (
            <>
              {' '}
              en <span className="mono">{s.node}</span>
            </>
          ) : null}
          . Se notificará al cliente.
        </p>
      ),
      okLabel: susp ? 'Suspender' : 'Reactivar',
      danger: susp,
      onOk: () => {
        s.st = to;
        toast(susp ? 'Servicio suspendido' : 'Servicio reactivado', `${s.t} · ${c.name}`, susp ? 'warn' : 'ok');
        refresh();
      },
    });
  };
  if (!c.services.length)
    return (
      <div className="card">
        <EmptyState title="Sin servicios" text="Agregue un servicio desde una cotización aprobada." />
      </div>
    );
  return (
    <div className="card">
      <div className="tw">
        <table className="t">
          <thead>
            <tr>
              <th>Servicio</th>
              <th>Plan</th>
              <th>Proveedor / nodo</th>
              <th>Ciclo</th>
              <th className="r">Precio</th>
              <th>Vence</th>
              <th>Estado</th>
              <th className="r">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {c.services.map((s) => (
              <tr key={s.id}>
                <td className="strong nw">
                  <Icon name={s.ic} size="sm" /> {s.t}
                </td>
                <td>{s.plan}</td>
                <td>
                  {s.prov}
                  {s.node ? (
                    <>
                      {' '}
                      · <span className="mono">{s.node}</span>
                    </>
                  ) : null}
                </td>
                <td>{s.cy}</td>
                <td className="r">{m.money(s.price, s.cur)}</td>
                <td className="num nw">
                  {fD(s.due)} <DayChip n={diffD(s.due, TODAY)} />
                </td>
                <td>
                  <StatusChip status={s.st} />
                </td>
                <td className="r">
                  {s.st === 'Activo' ? (
                    <button type="button" className="btn sm" onClick={() => toggle(s)}>
                      <Icon name="pause" size="sm" />
                      Suspender
                    </button>
                  ) : s.st === 'Suspendido' ? (
                    <button type="button" className="btn sm success" onClick={() => toggle(s)}>
                      Reactivar
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------- Facturas ---------- */
function Facturas({ c }: { c: Client }) {
  const { href } = useApp();
  const act = useActions();
  const m = useMoney();
  if (!c.invoices.length)
    return (
      <div className="card">
        <EmptyState title="Sin comprobantes" />
      </div>
    );
  const list = c.invoices.slice().sort((a, b) => b.issue.getTime() - a.issue.getTime());
  return (
    <div className="card">
      <div className="tw">
        <table className="t">
          <thead>
            <tr>
              <th>Comprobante</th>
              <th>Tipo</th>
              <th>Emisión</th>
              <th>Vence</th>
              <th>Mon.</th>
              <th className="r">Total</th>
              <th className="r">Saldo</th>
              <th>Estado</th>
              <th>SUNAT</th>
            </tr>
          </thead>
          <tbody>
            {list.map((v) => (
              <tr key={v.id}>
                <td>
                  <a
                    className="rowlink mono"
                    href={href('facturas', v.id)}
                    onClick={(e) => {
                      e.preventDefault();
                      act.openInvoice(v.id);
                    }}
                  >
                    {v.num}
                  </a>
                  {v.ref ? <div className="sub">ref. {v.ref}</div> : null}
                </td>
                <td className="nw">{v.type}</td>
                <td className="num nw">{fD(v.issue)}</td>
                <td className="num nw">{fD(v.due)}</td>
                <td>{v.cur === 'PEN' ? 'S/' : 'US$'}</td>
                <td className="r">{m.money(v.total, v.cur)}</td>
                <td className={`r ${saldo(v) ? 'strong' : ''}`}>{saldo(v) && v.type !== 'Nota de crédito' ? m.money(saldo(v), v.cur) : '—'}</td>
                <td>
                  <StatusChip status={v.status} />
                </td>
                <td>
                  <SunatChip s={v.sunat} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------- Tickets ---------- */
function Tickets({ c }: { c: Client }) {
  const { href } = useApp();
  const act = useActions();
  if (!c.tickets.length)
    return (
      <div className="card">
        <EmptyState
          title="Sin tickets"
          text="El cliente no ha reportado incidencias."
          action={
            <button type="button" className="btn sm" onClick={() => act.newTicket(c.id)}>
              Abrir ticket
            </button>
          }
        />
      </div>
    );
  return (
    <div className="card">
      <div className="tw">
        <table className="t">
          <thead>
            <tr>
              <th>Ticket</th>
              <th>Prioridad</th>
              <th>Estado</th>
              <th>SLA de resolución</th>
              <th>Agente</th>
              <th>Canal</th>
            </tr>
          </thead>
          <tbody>
            {c.tickets.map((t: Ticket) => (
              <tr key={t.id}>
                <td style={{ minWidth: 220 }}>
                  <a className="rowlink" href={href('tickets', t.id)}>
                    {t.sub}
                  </a>
                  <div className="sub">
                    <span className="mono">{t.id}</span> · abierto {fDs(t.created)} {fT(t.created)}
                  </div>
                </td>
                <td>
                  <PrioChip p={t.prio} />
                </td>
                <td>
                  <Chip kind={tkKind(t.status)}>{t.status}</Chip>
                </td>
                <td>
                  <SlaBar t={t} />
                </td>
                <td className="nw">{t.agent ? t.agent : <span className="sub">Sin asignar</span>}</td>
                <td>{t.ch}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------- Contratos ---------- */
function Contratos({ c }: { c: Client }) {
  const act = useActions();
  const ks: [string, string, Date, string, string][] = [
    ['Contrato marco de servicios TI', 'CT-2021-118', c.since, 'Indefinido', 'Vigente'],
    ['Acuerdo de nivel de servicio (SLA)', 'SLA-2024-031', new Date(2024, 0, 10), fD(new Date(2026, 11, 31)), 'Vigente'],
    ['Anexo: servicios cloud y VPS', 'AX-2025-077', new Date(2025, 4, 2), fD(new Date(2026, 4, 1)), 'Vencido · renovar'],
  ];
  return (
    <div className="card">
      <div className="tw">
        <table className="t">
          <thead>
            <tr>
              <th>Documento</th>
              <th>Código</th>
              <th>Firmado</th>
              <th>Vigencia hasta</th>
              <th>Estado</th>
              <th className="r">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {ks.map((k) => (
              <tr key={k[1]}>
                <td className="strong">
                  <Icon name="contract" size="sm" /> {k[0]}
                </td>
                <td className="mono">{k[1]}</td>
                <td className="num">{fD(k[2])}</td>
                <td className="num">{k[3]}</td>
                <td>
                  <Chip kind={k[4] === 'Vigente' ? 'ok' : 'warn'}>{k[4]}</Chip>
                </td>
                <td className="r">
                  <button type="button" className="btn sm" onClick={() => act.fakeDownload(k[1])} aria-label={`Descargar PDF de ${k[1]}`}>
                    <Icon name="download" size="sm" />
                    PDF
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------- Actividad ---------- */
const EVENTS: [Date, string, string, string][] = [
  [NOW, 'msg', 'Ticket TK-26410 escalado a prioridad alta', 'Diego Rojas'],
  [new Date(2026, 9, 7, 16, 20), 'send', 'Recordatorio automático de pago enviado (7 días antes)', 'Sistema'],
  [new Date(2026, 9, 5, 11, 5), 'globe', 'DNS: nuevo registro CNAME reservas.andestravel.pe', 'Ana Salazar'],
  [new Date(2026, 8, 20, 9, 0), 'file', 'Factura emitida y aceptada por SUNAT', 'Sistema'],
  [new Date(2026, 8, 9, 18, 42), 'card', 'Pago recibido por PayPal (comisión trasladada como línea aparte)', 'Sistema'],
  [new Date(2026, 7, 28, 10, 15), 'cpu', 'Ampliación de VPS a Cloud VPS 20', 'Jorge Quispe'],
  [new Date(2026, 7, 2, 15, 30), 'contract', 'Firma de anexo de soporte para el motor de reservas', 'Lucía Paredes'],
];
function Actividad() {
  return (
    <div className="card">
      <div className="card-b" style={{ paddingTop: 16 }}>
        <ol className="tl">
          {EVENTS.map((e, i) => (
            <li key={i}>
              <span className="nd now" />
              <div className="w">
                <b>{e[2]}</b>
                <span>
                  {fD(e[0])} {fT(e[0])}
                </span>
              </div>
              <small>{e[3]}</small>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
