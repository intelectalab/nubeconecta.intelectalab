/**
 * Vista «tareas» (#tareas) — tablero kanban de trabajo interno (vTareas del prototipo l.2819),
 * con arrastre por puntero (enableDrag), teclado (Alt+←/→) y menú «Mover a…».
 */
import { useEffect, useMemo, useRef, type KeyboardEvent, type PointerEvent as RPointerEvent } from 'react';
import { useApp } from '../../app/context';
import { useViewState } from '../../app/storage';
import { Icon } from '../../components/Icon';
import { PageHead, PrioChip, Select, Toolbar } from '../../components/ui';
import { addD, AGENTS, CBY, diffD, EJEC, fDs, fromIso, inBrand, iso, ME, plural, SEV, TASKS, TCOLS, TODAY } from '../../data';
import type { Sev, Task } from '../../data';

type How = 'arrastre' | 'teclado' | 'menú';
const WHO_OPTS = () => [...new Set([...AGENTS, ...EJEC, 'Rosa Mendoza'])];

export default function TareasView() {
  const { brand, dataVersion, dialogs, toast, refresh } = useApp();
  const [who, setWho] = useViewState('ta.who', '');
  const boardRef = useRef<HTMLDivElement>(null);
  const focusId = useRef<string | null>(null);
  const justDragged = useRef<string | null>(null);

  const all = useMemo(() => TASKS.filter((t) => !t.cid || inBrand(brand, t.cid)), [brand, dataVersion]);
  const rows = all.filter((t) => !who || t.who === who);
  const people = [...new Set(TASKS.map((t) => t.who))];
  const late = rows.filter((t) => t.col !== 'Hecho' && diffD(t.due, TODAY) < 0).length;

  useEffect(() => {
    if (!focusId.current) return;
    const n = boardRef.current?.querySelector<HTMLElement>(`[data-drag="${focusId.current}"]`);
    focusId.current = null;
    n?.focus();
  });

  const move = (t: Task, to: string, how: How) => {
    const from = t.col;
    t.col = to;
    focusId.current = t.id;
    toast(`Tarea movida a «${to}»`, `${t.t.slice(0, 48)} · desde «${from}» (${how})`);
    refresh();
  };

  const moveTo = (t: Task) =>
    dialogs.form({
      title: 'Mover a…',
      sub: `${t.t} · ${t.col}`,
      fields: [{ id: 'to', label: 'Etapa de destino', type: 'select', options: TCOLS, value: t.col, full: true }],
      submit: 'Mover',
      validate: (v) => (v.to === t.col ? 'Elija una etapa distinta de la actual.' : null),
      onSubmit: (v) => move(t, v.to, 'menú'),
    });

  const openTask = (t: Task) => {
    if (justDragged.current === t.id) return;
    dialogs.form({
      title: 'Tarea',
      sub: `${t.id} · origen ${t.orig}`,
      fields: [
        { id: 't', label: 'Título', req: true, full: true, value: t.t },
        { id: 'w', label: 'Responsable', type: 'select', options: WHO_OPTS(), value: t.who },
        { id: 'd', label: 'Fecha límite', type: 'date', value: iso(t.due) },
        { id: 'c', label: 'Columna', type: 'select', options: TCOLS, value: t.col },
      ],
      submit: 'Guardar',
      onSubmit: (v) => {
        Object.assign(t, { t: v.t, who: v.w, due: v.d ? fromIso(v.d) : t.due, col: v.c });
        toast('Tarea actualizada', t.t);
        refresh();
      },
    });
  };

  const newTask = () =>
    dialogs.form({
      title: 'Nueva tarea',
      fields: [
        { id: 't', label: 'Título', req: true, full: true },
        { id: 'w', label: 'Responsable', type: 'select', options: WHO_OPTS(), value: ME },
        { id: 'd', label: 'Fecha límite', type: 'date', value: iso(addD(TODAY, 2)) },
        { id: 'p', label: 'Prioridad', type: 'select', options: Object.entries(SEV).map(([k, v]): [string, string] => [k, v.l]), value: 'media' },
      ],
      submit: 'Crear',
      onSubmit: (v) => {
        TASKS.unshift({ id: 'TA-' + (400 + TASKS.length), t: v.t, cid: null, orig: 'Manual', who: v.w, due: v.d ? fromIso(v.d) : addD(TODAY, 2), col: 'Por hacer', prio: v.p as Sev });
        toast('Tarea creada', v.t);
        refresh();
      },
    });

  const onKey = (e: KeyboardEvent<HTMLElement>, t: Task) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openTask(t);
      return;
    }
    if (e.altKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      e.preventDefault();
      const i = TCOLS.indexOf(t.col) + (e.key === 'ArrowRight' ? 1 : -1);
      if (i < 0 || i >= TCOLS.length) return;
      move(t, TCOLS[i], 'teclado');
    }
  };

  /* Arrastre por puntero (enableDrag del prototipo l.2249). */
  const onPointerDown = (ev: RPointerEvent<HTMLElement>, t: Task) => {
    if (ev.button !== 0) return;
    const target = ev.target as HTMLElement;
    if (target.closest('button:not(.grip),select,input,a')) return;
    if (ev.pointerType !== 'mouse' && !target.closest('.grip')) return;
    const card = ev.currentTarget;
    const board = boardRef.current;
    if (!board) return;
    const sx = ev.clientX, sy = ev.clientY;
    let ghost: HTMLElement | null = null;
    let over: HTMLElement | null = null;
    const mv = (e: PointerEvent) => {
      if (!ghost) {
        if (Math.hypot(e.clientX - sx, e.clientY - sy) < 6) return;
        const r = card.getBoundingClientRect();
        ghost = card.cloneNode(true) as HTMLElement;
        ghost.classList.add('drag-ghost');
        ghost.removeAttribute('id');
        ghost.setAttribute('aria-hidden', 'true');
        ghost.style.width = r.width + 'px';
        document.body.appendChild(ghost);
        card.classList.add('dragging');
      }
      e.preventDefault();
      ghost.style.left = e.clientX - 24 + 'px';
      ghost.style.top = e.clientY - 18 + 'px';
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const col = el ? (el.closest('[data-col]') as HTMLElement | null) : null;
      const inBoard = col && board.contains(col) ? col : null;
      if (over !== inBoard) {
        over?.classList.remove('drop-on');
        over = inBoard;
        over?.classList.add('drop-on');
      }
      const br = board.getBoundingClientRect();
      if (e.clientX > br.right - 50) board.scrollLeft += 14;
      else if (e.clientX < br.left + 50) board.scrollLeft -= 14;
    };
    const up = () => {
      document.removeEventListener('pointermove', mv);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
      if (!ghost) return;
      ghost.remove();
      card.classList.remove('dragging');
      over?.classList.remove('drop-on');
      justDragged.current = t.id;
      window.setTimeout(() => {
        justDragged.current = null;
      }, 80);
      const to = over?.dataset.col;
      if (to && to !== t.col) move(t, to, 'arrastre');
    };
    document.addEventListener('pointermove', mv, { passive: false });
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
  };

  return (
    <>
      <PageHead
        crumbs={[['Operación', 'tareas'], ['Tareas']]}
        title="Tareas"
        sub="Trabajo interno originado en tickets, pedidos, cotizaciones y mantenimiento."
        actions={
          <button type="button" className="btn primary" onClick={newTask}>
            <Icon name="plus" size="sm" />
            Nueva tarea
          </button>
        }
      />
      <section className="card">
        <Toolbar count={`${late} vencidas · ${plural(rows.length, 'tarea', 'tareas')}`}>
          <Select value={who} onChange={setWho} label="Responsable" options={[['', 'Todos los responsables'], ...people.map((w): [string, string] => [w, w])]} />
        </Toolbar>
        <div className="card-b" style={{ paddingTop: 14 }}>
          <p className="kb-help">
            Arrastre para cambiar de columna, o use <kbd>Alt</kbd>+<kbd>←</kbd>/<kbd>→</kbd> con la tarjeta enfocada.
          </p>
          <div className="kb" ref={boardRef}>
            {TCOLS.map((c) => {
              const l = rows.filter((t) => t.col === c);
              return (
                <section key={c} className="kcol" data-col={c} aria-label={c}>
                  <div className="kcol-h">
                    <b>{c}</b>
                    <small>{l.length}</small>
                  </div>
                  <div className="kcol-b">
                    {l.length ? (
                      l.map((t) => {
                        const d = diffD(t.due, TODAY);
                        return (
                          <article
                            key={t.id}
                            className="kcard dcard"
                            tabIndex={0}
                            role="button"
                            data-drag={t.id}
                            aria-roledescription="tarjeta arrastrable"
                            aria-label={`${t.t} · ${t.col}`}
                            onClick={() => openTask(t)}
                            onKeyDown={(e) => onKey(e, t)}
                            onPointerDown={(e) => onPointerDown(e, t)}
                          >
                            <span className="meta" style={{ justifyContent: 'space-between' }}>
                              <PrioChip p={t.prio} />
                              <button type="button" className="grip" aria-hidden="true" tabIndex={-1}>
                                ⠿
                              </button>
                            </span>
                            <span className="t1">{t.t}</span>
                            <span className="meta">
                              {t.cid && CBY[t.cid] ? `${CBY[t.cid].name} · ` : ''}
                              <span className="mono">{t.orig}</span>
                            </span>
                            <span className="meta">
                              <Icon name="user" size="sm" />
                              {t.who} ·{' '}
                              <span style={c !== 'Hecho' && d < 0 ? { color: 'var(--danger-text)', fontWeight: 700 } : undefined}>{d === 0 ? 'hoy' : d < 0 ? `vencida ${-d} d` : fDs(t.due)}</span>
                            </span>
                            <button
                              type="button"
                              className="btn sm ghost kmove"
                              onClick={(e) => {
                                e.stopPropagation();
                                moveTo(t);
                              }}
                            >
                              Mover a…
                            </button>
                          </article>
                        );
                      })
                    ) : (
                      <p className="kb-empty">Suelte aquí</p>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      </section>
    </>
  );
}
