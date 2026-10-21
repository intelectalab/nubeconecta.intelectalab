/**
 * Vista «crm» (#crm) — embudo comercial (vCrm del prototipo l.2524):
 * resumen, embudo en kanban (arrastrar, teclado Alt+←/→ y «Mover a…») o en
 * lista (filtros, orden, selección y acciones en lote), origen por canal y
 * seguimientos del día.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as RPointerEvent } from 'react';
import { useApp, useMoney } from '../../app/context';
import { useViewState } from '../../app/storage';
import { Icon } from '../../components/Icon';
import { BrandTag, Chip, EmptyState, PageHead, SearchBox, Seg, StatLine, Toolbar } from '../../components/ui';
import { BRANDS, CHANNELS, diffD, EJEC, fD, fDL, fDs, fLeads, fromIso, fT, iso, leads, LPROD, norm, plural, STAGES, TODAY } from '../../data';
import type { Lead, LeadStage } from '../../data';

type CrmSort = 'co' | 'stage' | 'val' | 'next';
const isToday = (d: Date) => diffD(d, TODAY) === 0;

export default function CrmView() {
  const { brand, dataVersion, toast, refresh, dialogs } = useApp();
  const m = useMoney();
  const [view, setView] = useViewState<'kanban' | 'lista'>('crm.view', 'kanban');
  const [q, setQ] = useViewState('crm.q', '');
  const [st, setSt] = useViewState('crm.st', '');
  const [ch, setCh] = useViewState('crm.ch', '');
  const [ow, setOw] = useViewState('crm.ow', '');
  const [sort, setSort] = useViewState<CrmSort>('crm.sort', 'next');
  const [dir, setDir] = useViewState<1 | -1>('crm.dir', 1);
  const [sel, setSel] = useState<Set<string>>(() => new Set());
  const [bulkStage, setBulkStage] = useState<string>(STAGES[0]);
  const [bulkOwner, setBulkOwner] = useState<string>(EJEC[0]);
  const focusAfter = useRef<string | null>(null);

  const L = useMemo(() => fLeads(brand), [brand, dataVersion]);
  const openL = L.filter((l) => l.stage !== 'Ganado' && l.stage !== 'Perdido');
  const won = L.filter((l) => l.stage === 'Ganado');
  const lost = L.filter((l) => l.stage === 'Perdido');
  const today = L.filter((l) => isToday(l.next)).sort((a, b) => a.next.getTime() - b.next.getTime());
  const byCh = CHANNELS.map((c) => {
    const l = L.filter((x) => x.ch === c);
    return { ch: c, n: l.length, w: l.filter((x) => x.stage === 'Ganado').length };
  });
  const mx = Math.max(1, ...byCh.map((x) => x.n));
  const sum = (l: Lead[]) => l.reduce((a, x) => a + x.val, 0);

  const rows = useMemo(() => {
    const qq = norm(q);
    const r = L.filter((l) => (!qq || norm(l.co + ' ' + l.contact + ' ' + l.prod).includes(qq)) && (!st || l.stage === st) && (!ch || l.ch === ch) && (!ow || l.owner === ow));
    return r.sort((a, b) => {
      const x = sort === 'val' ? a.val - b.val : sort === 'stage' ? STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage) : sort === 'co' ? a.co.localeCompare(b.co) : a.next.getTime() - b.next.getTime();
      return x * dir;
    });
  }, [L, q, st, ch, ow, sort, dir]);

  /* Al cambiar de marca, la selección puede apuntar a prospectos ocultos: se limpia */
  useEffect(() => setSel(new Set()), [brand]);

  /* Foco tras mover una tarjeta */
  useEffect(() => {
    if (!focusAfter.current) return;
    const n = document.querySelector<HTMLElement>(`[data-drag="${focusAfter.current}"]`);
    focusAfter.current = null;
    n?.focus();
  });

  const move = (id: string, to: LeadStage, how: string) => {
    const l = leads.find((x) => x.id === id);
    if (!l) return;
    const from = l.stage;
    l.stage = to;
    focusAfter.current = id;
    toast(`Movido a «${to}»`, `${l.co} · desde «${from}» (${how})`);
    refresh();
  };
  const moveTo = (l: Lead) =>
    dialogs.form({
      title: 'Mover a…',
      sub: `${l.co} · ${l.stage}`,
      fields: [{ id: 'to', label: 'Etapa de destino', type: 'select', options: STAGES, value: l.stage, full: true }],
      submit: 'Mover',
      validate: (v) => (v.to === l.stage ? 'Elija una etapa distinta de la actual.' : null),
      onSubmit: (v) => move(l.id, v.to as LeadStage, 'menú'),
    });
  const detail = (l: Lead) =>
    dialogs.form({
      title: l.co,
      sub: `${l.contact} · ${l.ch} · ${l.prod}`,
      fields: [
        { id: 'stage', label: 'Etapa', type: 'select', options: STAGES, value: l.stage },
        { id: 'val', label: 'Valor estimado (S/)', type: 'number', min: 0, value: String(l.val) },
        { id: 'owner', label: 'Ejecutivo', type: 'select', options: EJEC, value: l.owner },
        { id: 'next', label: 'Próximo seguimiento', type: 'date', value: iso(l.next) },
        { id: 'act', label: 'Acción', full: true, value: l.act },
      ],
      submit: 'Guardar',
      onSubmit: (v) => {
        const moved = v.stage !== l.stage;
        let next = l.next;
        if (v.next) {
          const d = fromIso(v.next);
          next = new Date(d.getFullYear(), d.getMonth(), d.getDate(), l.next.getHours(), l.next.getMinutes());
        }
        Object.assign(l, { stage: v.stage as LeadStage, val: +v.val || 0, owner: v.owner, act: v.act, next });
        toast(moved ? `Movido a «${v.stage}»` : 'Prospecto actualizado', l.co);
        refresh();
      },
    });
  const newLead = () =>
    dialogs.form({
      title: 'Nuevo prospecto',
      fields: [
        { id: 'co', label: 'Empresa', req: true, full: true },
        { id: 'contact', label: 'Contacto', req: true },
        { id: 'val', label: 'Valor estimado mensual (S/)', type: 'number', min: 0, value: '500', req: true },
        { id: 'ch', label: 'Canal de origen', type: 'select', options: CHANNELS, value: 'WhatsApp' },
        { id: 'prod', label: 'Interés', type: 'select', options: LPROD, value: LPROD[0] },
        { id: 'owner', label: 'Ejecutivo', type: 'select', options: EJEC, value: EJEC[0] },
        { id: 'brand', label: 'Marca', type: 'select', options: BRANDS.map((b) => [b.id, b.n] as [string, string]), value: brand === 'all' ? 'ap' : brand },
      ],
      submit: 'Crear prospecto',
      onSubmit: (v) => {
        leads.unshift({ id: 'LD-' + (880 + leads.length), co: v.co, contact: v.contact, stage: 'Nuevo', val: +v.val || 0, ch: v.ch, owner: v.owner, prod: v.prod, brand: v.brand as Lead['brand'], next: new Date(2026, 9, 8, 16, 0), done: false, act: 'Primer contacto' });
        toast('Prospecto creado', `${v.co} · etapa Nuevo · seguimiento hoy 16:00`);
        refresh();
      },
    });

  /* ---------- Lista ---------- */
  const sortBy = (k: CrmSort) => {
    if (sort === k) setDir(dir === 1 ? -1 : 1);
    else {
      setSort(k);
      setDir(1);
    }
  };
  const sortTh = (k: CrmSort, l: string) => (
    <th aria-sort={sort === k ? (dir > 0 ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="th-sort" onClick={() => sortBy(k)}>
        {l}
        {sort === k ? (dir > 0 ? ' ▲' : ' ▼') : ''}
      </button>
    </th>
  );
  const toggleSel = (id: string, on: boolean) =>
    setSel((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
  const bulkMove = () => {
    const ids = [...sel];
    ids.forEach((id) => {
      const l = leads.find((x) => x.id === id);
      if (l) l.stage = bulkStage as LeadStage;
    });
    setSel(new Set());
    toast(`${ids.length} prospectos movidos`, `a «${bulkStage}»`);
    refresh();
  };
  const bulkAssign = () => {
    const n = sel.size;
    sel.forEach((id) => {
      const l = leads.find((x) => x.id === id);
      if (l) l.owner = bulkOwner;
    });
    setSel(new Set());
    toast(`${n} prospectos asignados`, bulkOwner);
    refresh();
  };
  const clear = () => {
    setQ('');
    setSt('');
    setCh('');
    setOw('');
  };
  const allSel = rows.length > 0 && rows.every((r) => sel.has(r.id));

  const listView = (
    <>
      <Toolbar count={plural(rows.length, 'prospecto', 'prospectos')}>
        <SearchBox value={q} onChange={setQ} placeholder="Empresa, contacto o interés…" label="Buscar prospectos" />
        <select className="select" aria-label="Etapa" value={st} onChange={(e) => setSt(e.target.value)}>
          <option value="">Todas las etapas</option>
          {STAGES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select className="select" aria-label="Canal" value={ch} onChange={(e) => setCh(e.target.value)}>
          <option value="">Todos los canales</option>
          {CHANNELS.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select className="select" aria-label="Ejecutivo" value={ow} onChange={(e) => setOw(e.target.value)}>
          <option value="">Todos los ejecutivos</option>
          {EJEC.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </Toolbar>
      {sel.size ? (
        <div className="bulk" role="region" aria-label="Acciones sobre la selección">
          <b>{sel.size} seleccionados</b>
          <select className="select" aria-label="Mover a etapa" style={{ width: 'auto' }} value={bulkStage} onChange={(e) => setBulkStage(e.target.value)}>
            {STAGES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <button type="button" className="btn sm primary" onClick={bulkMove}>
            Mover
          </button>
          <select className="select" aria-label="Asignar a" style={{ width: 'auto' }} value={bulkOwner} onChange={(e) => setBulkOwner(e.target.value)}>
            {EJEC.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <button type="button" className="btn sm" onClick={bulkAssign}>
            Asignar
          </button>
          <button type="button" className="btn sm ghost" onClick={() => setSel(new Set())}>
            Quitar selección
          </button>
        </div>
      ) : null}
      {rows.length ? (
        <div className="tw">
          <table className="t">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    aria-label="Seleccionar todos"
                    checked={allSel}
                    onChange={(e) => setSel(e.target.checked ? new Set([...sel, ...rows.map((r) => r.id)]) : new Set())}
                  />
                </th>
                {sortTh('co', 'Empresa')}
                <th>Interés</th>
                {sortTh('stage', 'Etapa')}
                <th>Canal</th>
                {sortTh('val', 'Valor')}
                <th>Ejecutivo</th>
                {sortTh('next', 'Próximo seguimiento')}
                <th className="r" />
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.id}>
                  <td>
                    <input type="checkbox" aria-label={`Seleccionar ${l.co}`} checked={sel.has(l.id)} onChange={(e) => toggleSel(l.id, e.target.checked)} />
                  </td>
                  <td style={{ minWidth: 200 }}>
                    <a
                      className="rowlink"
                      href="#crm"
                      onClick={(e) => {
                        e.preventDefault();
                        detail(l);
                      }}
                    >
                      {l.co}
                    </a>
                    <div className="sub">
                      {l.contact} · <BrandTag brand={l.brand} />
                    </div>
                  </td>
                  <td className="sub">{l.prod}</td>
                  <td>
                    <Chip kind={l.stage === 'Ganado' ? 'ok' : l.stage === 'Perdido' ? 'danger' : 'info'}>{l.stage}</Chip>
                  </td>
                  <td>{l.ch}</td>
                  <td className="r num strong">{m.money(l.val, 'PEN', true)}</td>
                  <td className="nw">{l.owner}</td>
                  <td className="nw num">{isToday(l.next) ? <b style={{ color: 'var(--brand-text)' }}>Hoy {fT(l.next)}</b> : fD(l.next)}</td>
                  <td className="r">
                    <button type="button" className="btn sm" onClick={() => moveTo(l)}>
                      Mover a…
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="Sin prospectos"
          text="Ningún prospecto coincide con los filtros."
          action={
            <button type="button" className="btn sm" onClick={clear}>
              Limpiar filtros
            </button>
          }
        />
      )}
    </>
  );

  return (
    <>
      <PageHead
        crumbs={[['Comercial', 'crm'], ['CRM']]}
        title="CRM"
        sub="Embudo comercial, origen de prospectos y seguimientos del día."
        actions={
          <button type="button" className="btn primary" onClick={newLead}>
            <Icon name="plus" size="sm" />
            Nuevo prospecto
          </button>
        }
      />
      <StatLine
        items={[
          { label: 'Embudo abierto', value: m.money(sum(openL), 'PEN', true) },
          { label: 'Prospectos abiertos', value: openL.length },
          { label: 'Ganados (mes)', value: `${won.length} · ${m.money(sum(won), 'PEN', true)}`, tone: 'ok' },
          { label: 'Tasa de cierre', value: `${won.length + lost.length ? Math.round((won.length / (won.length + lost.length)) * 100) : 0} %` },
          { label: 'Seguimientos hoy', value: today.filter((l) => !l.done).length },
        ]}
      />
      <section className="card" style={{ marginBottom: 16 }} aria-labelledby="hFun">
        <div className="card-h">
          <h2 className="sec" id="hFun">
            Embudo
          </h2>
          <Seg<'kanban' | 'lista'>
            label="Vista"
            value={view}
            onChange={setView}
            options={[
              ['kanban', 'Kanban', 'cols'],
              ['lista', 'Lista', 'list'],
            ]}
          />
        </div>
        {view === 'kanban' ? <Board leads={L} money={(v) => m.money(v, 'PEN', true)} onOpen={detail} onMoveTo={moveTo} onMove={move} /> : listView}
      </section>
      <div className="grid g-2e">
        <section className="card" aria-labelledby="hCh">
          <div className="card-h">
            <h2 className="sec" id="hCh">
              Origen por canal
            </h2>
            <span className="sub">prospectos · ganados</span>
          </div>
          <div className="card-b">
            {byCh.map((x) => (
              <div className="hbar" key={x.ch}>
                <span>{x.ch}</span>
                <div className="bar">
                  <i style={{ width: `${(x.n / mx) * 100}%` }} />
                </div>
                <span className="v">
                  {x.n} <small style={{ color: 'var(--ok-text)' }}>· {x.w}</small>
                </span>
              </div>
            ))}
          </div>
        </section>
        <section className="card" aria-labelledby="hFu">
          <div className="card-h">
            <h2 className="sec" id="hFu">
              Seguimientos de hoy
            </h2>
            <span className="sub">{fDL(TODAY)}</span>
          </div>
          {today.length ? (
            <ul className="rows">
              {today.map((l) => (
                <li key={l.id} style={l.done ? { opacity: 0.55 } : undefined}>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={l.done}
                      aria-label={`Marcar seguimiento de ${l.co} como hecho`}
                      onChange={(e) => {
                        l.done = e.target.checked;
                        toast(l.done ? 'Seguimiento completado' : 'Seguimiento reabierto', l.co);
                        refresh();
                      }}
                    />
                  </label>
                  <span className="mono" style={{ color: 'var(--muted)' }}>
                    {fT(l.next)}
                  </span>
                  <div className="grow">
                    <b style={l.done ? { textDecoration: 'line-through' } : undefined}>{l.act}</b>
                    <small>
                      {l.co} · {l.contact} · {l.ch}
                    </small>
                  </div>
                  <Chip kind="outline">{l.stage}</Chip>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Sin seguimientos" text="No hay seguimientos programados para hoy." />
          )}
        </section>
      </div>
    </>
  );
}

/* =================== Tablero kanban con arrastre =================== */
function Board({ leads: L, money, onOpen, onMoveTo, onMove }: { leads: Lead[]; money: (v: number) => string; onOpen: (l: Lead) => void; onMoveTo: (l: Lead) => void; onMove: (id: string, to: LeadStage, how: string) => void }) {
  const board = useRef<HTMLDivElement>(null);
  const justDragged = useRef(false);

  const onPointerDown = (ev: RPointerEvent<HTMLElement>, l: Lead) => {
    if (ev.button !== 0) return;
    const target = ev.target as HTMLElement;
    if (target.closest('button:not(.grip),select,input,a')) return;
    if (ev.pointerType !== 'mouse' && !target.closest('.grip')) return;
    const card = ev.currentTarget;
    const sx = ev.clientX;
    const sy = ev.clientY;
    const from = l.stage;
    let ghost: HTMLElement | null = null;
    let over: HTMLElement | null = null;
    const mv = (e: PointerEvent) => {
      if (!ghost) {
        if (Math.hypot(e.clientX - sx, e.clientY - sy) < 6) return;
        const r = card.getBoundingClientRect();
        ghost = card.cloneNode(true) as HTMLElement;
        ghost.classList.add('drag-ghost');
        ghost.removeAttribute('id');
        ghost.style.width = r.width + 'px';
        document.body.appendChild(ghost);
        card.classList.add('dragging');
      }
      e.preventDefault();
      ghost.style.left = e.clientX - 24 + 'px';
      ghost.style.top = e.clientY - 18 + 'px';
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const col = (el && board.current && (el.closest('[data-col]') as HTMLElement | null)) || null;
      const inBoard = col && board.current?.contains(col) ? col : null;
      if (over !== inBoard) {
        over?.classList.remove('drop-on');
        over = inBoard;
        over?.classList.add('drop-on');
      }
      const b = board.current;
      if (b) {
        const br = b.getBoundingClientRect();
        if (e.clientX > br.right - 50) b.scrollLeft += 14;
        else if (e.clientX < br.left + 50) b.scrollLeft -= 14;
      }
    };
    const up = () => {
      document.removeEventListener('pointermove', mv);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
      if (!ghost) return;
      ghost.remove();
      card.classList.remove('dragging');
      over?.classList.remove('drop-on');
      justDragged.current = true;
      window.setTimeout(() => (justDragged.current = false), 80);
      const to = over?.dataset.col as LeadStage | undefined;
      if (to && to !== from) onMove(l.id, to, 'arrastre');
    };
    document.addEventListener('pointermove', mv, { passive: false });
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
  };

  const onKey = (e: KeyboardEvent<HTMLElement>, l: Lead) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen(l);
      return;
    }
    if (e.altKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      e.preventDefault();
      const i = STAGES.indexOf(l.stage) + (e.key === 'ArrowRight' ? 1 : -1);
      if (i < 0 || i >= STAGES.length) return;
      onMove(l.id, STAGES[i], 'teclado');
    }
  };

  return (
    <div className="card-b" style={{ paddingTop: 14 }}>
      <p className="kb-help">
        Arrastre las tarjetas entre etapas (en pantallas táctiles, desde el asa ⠿). Con teclado: enfoque una tarjeta y use <kbd>Alt</kbd>+<kbd>←</kbd>/<kbd>→</kbd>, o el botón «Mover a…».
      </p>
      <div className="kb" ref={board}>
        {STAGES.map((st) => {
          const l = L.filter((x) => x.stage === st);
          return (
            <section className="kcol" data-col={st} key={st} aria-label={`${st}: ${l.length} prospectos`}>
              <div className="kcol-h">
                <b>
                  {st} <small>({l.length})</small>
                </b>
                <small>{money(l.reduce((a, x) => a + x.val, 0))}</small>
              </div>
              <div className="kcol-b">
                {l.length ? (
                  l.map((x) => (
                    <article
                      key={x.id}
                      className="kcard dcard"
                      tabIndex={0}
                      role="button"
                      data-drag={x.id}
                      aria-roledescription="tarjeta arrastrable"
                      aria-label={`${x.co}, ${money(x.val)}, etapa ${st}`}
                      onPointerDown={(e) => onPointerDown(e, x)}
                      onKeyDown={(e) => onKey(e, x)}
                      onClick={(e) => {
                        if (justDragged.current) return;
                        if ((e.target as HTMLElement).closest('.kmove')) return;
                        onOpen(x);
                      }}
                    >
                      <span className="meta" style={{ justifyContent: 'space-between' }}>
                        <span className="t1" style={{ color: 'var(--text)' }}>
                          {x.co}
                        </span>
                        <button type="button" className="grip" aria-hidden="true" tabIndex={-1} title="Arrastrar">
                          ⠿
                        </button>
                      </span>
                      <span className="meta">{x.prod}</span>
                      <span className="meta">
                        <b className="num" style={{ color: 'var(--text)' }}>
                          {money(x.val)}
                        </b>
                        <Chip kind="outline">{x.ch}</Chip>
                      </span>
                      <span className="meta">
                        <Icon name="user" size="sm" />
                        {x.owner} · {isToday(x.next) ? <b style={{ color: 'var(--brand-text)' }}>hoy {fT(x.next)}</b> : fDs(x.next)}
                      </span>
                      <button
                        type="button"
                        className="btn sm ghost kmove"
                        onClick={(e) => {
                          e.stopPropagation();
                          onMoveTo(x);
                        }}
                      >
                        Mover a…
                      </button>
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
