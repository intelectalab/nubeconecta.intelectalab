/**
 * Vista «tickets» (#tickets, #tickets/<TK-id>) — Bandeja de tickets (prototipo vTickets l.2570).
 * Filtros guardados, vista lista o kanban (arrastrar o Alt+←/→), búsqueda y prioridad.
 * Con param = id de ticket abre el detalle (tkDetailView, ver soporte/TicketDetail).
 */
import { useState, type DragEvent, type KeyboardEvent } from 'react';
import { useApp } from '../../app/context';
import { useActions } from '../../app/actions';
import { useViewState } from '../../app/storage';
import type { ViewProps } from '../../app/routes';
import { Icon } from '../../components/Icon';
import { Chip, EmptyState, PageHead, PrioChip, SearchBox, Select, SlaBar } from '../../components/ui';
import { CBY, ME, SEV, SLA, TBY, TST, fDs, fT, fTk, norm, plural, slaLeft, tkConv, type Sev, type Ticket, type TicketStatus } from '../../data';
import TicketDetail from './soporte/TicketDetail';

type TkFilterFn = (t: Ticket) => boolean;
const TKF: Record<string, [string, TkFilterFn]> = {
  abiertos: ['Abiertos', (t) => t.status !== 'Resuelto'],
  mios: ['Mis tickets', (t) => t.agent === ME && t.status !== 'Resuelto'],
  sin: ['Sin asignar', (t) => !t.agent && t.status !== 'Resuelto'],
  fuera: ['Fuera de SLA', (t) => t.status !== 'Resuelto' && slaLeft(t) < 0],
  espera: ['Esperando cliente', (t) => t.status === 'Esperando cliente'],
  resueltos: ['Resueltos', (t) => t.status === 'Resuelto'],
  todos: ['Todos', () => true],
};
interface SavedFilter {
  id: string;
  n: string;
  prio: string;
  st: string;
  q: string;
}
const stKind = (s: TicketStatus): string => (s === 'Resuelto' ? 'ok' : s === 'Nuevo' ? 'info' : s === 'Esperando cliente' ? '' : 'warn');
const hay = (t: Ticket) => norm(`${t.id} ${t.sub} ${CBY[t.cid]?.name || ''}`);

export default function TicketsView({ param }: ViewProps) {
  const t = param ? TBY[param] : undefined;
  if (t) return <TicketDetail key={t.id} t={t} />;
  return <TicketInbox />;
}

function TicketInbox() {
  const { brand, toast, refresh, navigate, href, dialogs } = useApp();
  const { newTicket } = useActions();
  const [filter, setFilter] = useViewState<string>('tk.filter', 'abiertos');
  const [view, setView] = useViewState<'lista' | 'kanban'>('tk.view', 'lista');
  const [q, setQ] = useViewState<string>('tk.q', '');
  const [prio, setPrio] = useViewState<string>('tk.prio', '');
  const [saved, setSaved] = useViewState<SavedFilter[]>('tk.saved', []);
  const [over, setOver] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const all = fTk(brand);
  const sv = saved.find((x) => x.id === filter);
  const base: TkFilterFn = sv
    ? (t) => (!sv.prio || t.prio === sv.prio) && (!sv.st || t.status === sv.st) && (!sv.q || hay(t).includes(norm(sv.q)))
    : (TKF[filter] || TKF.abiertos)[1];
  const nq = norm(q);
  const rows = all
    .filter(base)
    .filter((t) => (!nq || hay(t).includes(nq)) && (!prio || t.prio === prio))
    .sort((a, b) => Number(a.status === 'Resuelto') - Number(b.status === 'Resuelto') || slaLeft(a) - slaLeft(b));
  const filt: [string, string, number | null][] = [...Object.entries(TKF).map(([k, [n, f]]) => [k, n, all.filter(f).length] as [string, string, number]), ...saved.map((s) => [s.id, s.n, null] as [string, string, null])];

  const open = (id: string) => navigate('tickets', id);
  const move = (id: string, to: TicketStatus, how: string) => {
    const t = TBY[id];
    const from = t.status;
    if (from === to) return;
    t.status = to;
    toast(`Ticket movido a «${to}»`, `${id} · desde «${from}» (${how})`);
    refresh();
  };
  const pickFilter = (k: string) => {
    setFilter(k);
    window.setTimeout(() => document.querySelector<HTMLButtonElement>(`[data-tkf="${k}"]`)?.focus(), 0);
  };
  const saveFilter = () =>
    dialogs.form({
      title: 'Guardar filtro',
      sub: 'Se guarda la búsqueda y la prioridad actuales',
      fields: [
        { id: 'n', label: 'Nombre del filtro', req: true, full: true, ph: 'Ej. Críticos de correo' },
        { id: 'st', label: 'Estado', type: 'select', options: [['', 'Cualquiera'], ...TST.map((s) => [s, s] as [string, string])], value: '' },
      ],
      submit: 'Guardar',
      onSubmit: (v) => {
        const id = 'sv' + (saved.length + 1);
        setSaved([...saved, { id, n: v.n, prio, st: v.st, q }]);
        setFilter(id);
        toast('Filtro guardado', v.n);
      },
    });

  const onCardKey = (e: KeyboardEvent<HTMLElement>, t: Ticket) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open(t.id);
      return;
    }
    if (e.altKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      e.preventDefault();
      const i = TST.indexOf(t.status) + (e.key === 'ArrowRight' ? 1 : -1);
      if (i < 0 || i >= TST.length) return;
      move(t.id, TST[i], 'teclado');
      window.setTimeout(() => document.querySelector<HTMLElement>(`[data-drag="${t.id}"]`)?.focus(), 0);
    }
  };
  const onDrop = (e: DragEvent<HTMLElement>, st: TicketStatus) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain') || dragId;
    setOver(null);
    setDragId(null);
    if (id && TBY[id]) move(id, st, 'arrastre');
  };

  let body;
  if (!rows.length) {
    body = (
      <EmptyState
        title="Bandeja vacía"
        text="No hay tickets en este filtro."
        action={
          <button type="button" className="btn sm" onClick={() => pickFilter('todos')}>
            Ver todos
          </button>
        }
      />
    );
  } else if (view === 'lista') {
    body = (
      <div className="tw">
        <table className="t">
          <thead>
            <tr>
              <th>Ticket</th>
              <th>Cliente</th>
              <th>Prioridad</th>
              <th>Estado</th>
              <th>SLA de resolución</th>
              <th>Agente</th>
              <th>Últ. mensaje</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const m = tkConv(t);
              const lm = m[m.length - 1];
              return (
                <tr key={t.id}>
                  <td style={{ minWidth: 220 }}>
                    <a
                      className="rowlink"
                      href={href('tickets', t.id)}
                      onClick={(e) => {
                        e.preventDefault();
                        open(t.id);
                      }}
                    >
                      {t.sub}
                    </a>
                    <div className="sub">
                      <span className="mono">{t.id}</span> · {t.ch}
                    </div>
                  </td>
                  <td>
                    <a className="rowlink" style={{ fontWeight: 500 }} href={href('cliente', t.cid)}>
                      {CBY[t.cid]?.name}
                    </a>
                  </td>
                  <td>
                    <PrioChip p={t.prio} />
                  </td>
                  <td>
                    <Chip kind={stKind(t.status)}>{t.status}</Chip>
                  </td>
                  <td>
                    <SlaBar t={t} />
                  </td>
                  <td className="nw">{t.agent ? t.agent : <span className="sub">Sin asignar</span>}</td>
                  <td className="sub nw">
                    {lm.k === 'cliente' ? 'Cliente' : lm.k === 'nota' ? 'Nota interna' : 'Agente'} · {fDs(lm.at)} {fT(lm.at)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  } else {
    body = (
      <div className="card-b" style={{ paddingTop: 14 }}>
        <p className="sr-only" id="tkKbHelp">
          Pulse Intro para abrir el ticket. Use Alt + flecha derecha o izquierda para moverlo de columna.
        </p>
        <div className="kb" id="tkBoard">
          {TST.map((st) => {
            const l = rows.filter((t) => t.status === st);
            return (
              <section
                key={st}
                className={`kcol${over === st ? ' drop-on' : ''}`}
                aria-label={st}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (over !== st) setOver(st);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver((o) => (o === st ? null : o));
                }}
                onDrop={(e) => onDrop(e, st)}
              >
                <div className="kcol-h">
                  <b>{st}</b>
                  <small>{l.length}</small>
                </div>
                <div className="kcol-b">
                  {l.length ? (
                    l.map((t) => (
                      <article
                        key={t.id}
                        className={`kcard dcard${dragId === t.id ? ' dragging' : ''}`}
                        tabIndex={0}
                        role="button"
                        draggable
                        data-drag={t.id}
                        aria-roledescription="tarjeta arrastrable"
                        aria-describedby="tkKbHelp"
                        aria-label={`${t.id} · ${t.sub} · ${t.status}`}
                        onClick={() => open(t.id)}
                        onKeyDown={(e) => onCardKey(e, t)}
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', t.id);
                          e.dataTransfer.effectAllowed = 'move';
                          setDragId(t.id);
                        }}
                        onDragEnd={() => {
                          setDragId(null);
                          setOver(null);
                        }}
                      >
                        <span className="meta" style={{ justifyContent: 'space-between' }}>
                          <span className="mono">{t.id}</span>
                          <span className="grip" aria-hidden="true">
                            ⠿
                          </span>
                        </span>
                        <span className="t1">{t.sub}</span>
                        <span className="meta">
                          <PrioChip p={t.prio} /> {CBY[t.cid]?.name}
                        </span>
                        {st !== 'Resuelto' ? <SlaBar t={t} /> : null}
                        <span className="meta">
                          <Icon name="user" size="sm" />
                          {t.agent || 'Sin asignar'}
                        </span>
                      </article>
                    ))
                  ) : (
                    <p className="kb-empty">Suelte aquí</p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <>
      <PageHead
        crumbs={[['Soporte', 'tickets'], ['Tickets', 'tickets']]}
        title="Bandeja de tickets"
        sub={'SLA de resolución: ' + (Object.keys(SLA) as Sev[]).map((k) => `${SEV[k].l} ${SLA[k].res} h`).join(' · ')}
        actions={
          <button type="button" className="btn primary" onClick={() => newTicket()}>
            <Icon name="plus" size="sm" />
            Nuevo ticket
          </button>
        }
      />
      <div className="tk-layout">
        <nav className="card tk-filters" aria-label="Filtros guardados">
          <div className="card-h">
            <h2 className="sec">Filtros</h2>
          </div>
          <ul>
            {filt.map(([k, n, c]) => (
              <li key={k}>
                <button type="button" data-tkf={k} aria-current={filter === k} onClick={() => pickFilter(k)}>
                  <span>{n}</span>
                  {c != null ? <em className={k === 'fuera' && c ? 'hot' : undefined}>{c}</em> : <em aria-label="Filtro guardado">★</em>}
                </button>
              </li>
            ))}
          </ul>
          <div className="card-f" style={{ justifyContent: 'flex-start' }}>
            <button type="button" className="btn sm ghost" onClick={saveFilter}>
              <Icon name="plus" size="sm" />
              Guardar filtro actual
            </button>
          </div>
        </nav>
        <section className="card">
          <div className="toolbar">
            <div className="seg" role="group" aria-label="Tipo de vista">
              <button type="button" aria-pressed={view === 'lista'} onClick={() => setView('lista')}>
                <Icon name="list" size="sm" />
                Lista
              </button>
              <button type="button" aria-pressed={view === 'kanban'} onClick={() => setView('kanban')}>
                <Icon name="cols" size="sm" />
                Kanban
              </button>
            </div>
            <SearchBox value={q} onChange={setQ} placeholder="Código, asunto o cliente…" label="Buscar tickets" />
            <Select value={prio} onChange={setPrio} label="Prioridad" options={[['', 'Todas las prioridades'], ...(Object.keys(SEV) as Sev[]).map((k) => [k, SEV[k].l] as [string, string])]} />
            <span className="count">{plural(rows.length, 'ticket', 'tickets')}</span>
          </div>
          {body}
        </section>
      </div>
    </>
  );
}
