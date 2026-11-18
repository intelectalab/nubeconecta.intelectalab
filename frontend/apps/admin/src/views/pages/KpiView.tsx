/**
 * Panel de indicadores (#kpi) — prototipo vKpi (l.3026) con sus acciones
 * kTab, kCustom, kPin, kHide, kShow, kMove, kInfo, kGoals (l.3048-3075).
 * Las tarjetas abren el tablero propio de cada indicador (#kpi/<id>).
 */
import { useEffect, useState } from 'react';
import { useApp } from '../../app/context';
import { useViewState } from '../../app/storage';
import type { ViewProps } from '../../app/routes';
import { Icon } from '../../components/Icon';
import { PageHead, Tabs } from '../../components/ui';
import { KBY, KD, kCmpOff, kGroups, kPerLabel, plural } from '../../data';
import { GoalsModal, KCard, KpiFilters, KpiGroupCharts, KpiInfoModal, brandLabel } from './operacion-kpi/parts';
import { respFor, useKpiFilter, useKpiPrefs } from './operacion-kpi/state';
import { hub } from '../../auth/client';
import { useLoad } from './clientes/shared';

export default function KpiView(_props: ViewProps) {
  const { role, toast, navigate, dataVersion } = useApp();
  const { F, setF } = useKpiFilter();
  const [prefs, setPrefs] = useKpiPrefs();
  const kpisLoad = useLoad(() => hub.dashboard.kpis(), []);
  const reals = kpisLoad.data ?? {};
  const gs = kGroups(role);
  const [tabRaw, setTab] = useViewState<string | null>('kpi.tab', null);
  const [custom, setCustom] = useViewState<boolean>('kpi.custom', false);
  const [info, setInfo] = useState<string | null>(null);
  const [goals, setGoals] = useState<string | null>(null);
  const [focusMove, setFocusMove] = useState<string | null>(null);

  const T = tabRaw && gs.some((g) => g[0] === tabRaw) ? tabRaw : gs[0][0];
  const pins = prefs.pins.map((id) => KBY[id]).filter((k) => k && gs.some((g) => g[0] === k.g));
  const ordered = (g: string): string[] => {
    const ids = KD.filter((k) => k.g === g).map((k) => k.id);
    const o = (prefs.order[g] || []).filter((x) => ids.includes(x));
    ids.forEach((x) => {
      if (!o.includes(x)) o.push(x);
    });
    return o;
  };
  const ord = ordered(T).map((id) => KBY[id]);
  const vis = ord.filter((k) => !prefs.hidden.includes(k.id));
  const hid = ord.filter((k) => prefs.hidden.includes(k.id));

  // Tras mover, devolver el foco al botón equivalente (como el prototipo)
  useEffect(() => {
    if (!focusMove) return;
    const [id, d] = focusMove.split('|');
    const b = document.querySelector<HTMLButtonElement>(`[data-move="${id}|${d}"]`);
    if (b && !b.disabled) b.focus();
    else document.querySelector<HTMLButtonElement>(`[data-kid="${id}"] .kc-t`)?.focus();
    setFocusMove(null);
  }, [focusMove]);

  const open = (id: string) => {
    setInfo(null);
    navigate('kpid', id);
  };
  const pin = (id: string) => {
    const on = prefs.pins.includes(id);
    setPrefs({ ...prefs, pins: on ? prefs.pins.filter((x) => x !== id) : [...prefs.pins, id] });
    toast(on ? 'Indicador desfijado' : 'Indicador fijado arriba', KBY[id].n, 'info');
  };
  const hide = (id: string) => {
    setPrefs({ ...prefs, hidden: [...prefs.hidden, id] });
    toast('Indicador oculto', KBY[id].n, 'info');
  };
  const show = (id: string) => setPrefs({ ...prefs, hidden: prefs.hidden.filter((x) => x !== id) });
  const move = (id: string, d: -1 | 1) => {
    const g = KBY[id].g;
    const all = ordered(g);
    const o = all.filter((x) => !prefs.hidden.includes(x));
    const i = o.indexOf(id);
    const j = i + d;
    if (j < 0 || j >= o.length) return;
    [o[i], o[j]] = [o[j], o[i]];
    setPrefs({ ...prefs, order: { ...prefs.order, [g]: [...o, ...all.filter((x) => prefs.hidden.includes(x))] } });
    setFocusMove(`${id}|${d}`);
  };
  void dataVersion;

  const cardProps = { F, onOpen: open, onInfo: setInfo, onPin: pin };
  return (
    <>
      <PageHead
        crumbs={[['Operación', 'kpi'], ['Panel de indicadores', 'kpi']]}
        title="Panel de indicadores"
        sub={`${kPerLabel(F)} vs. ${F.kCmp === 'anual' ? 'mismo periodo del año anterior' : 'periodo anterior'} (${kPerLabel(F, kCmpOff(F))}) · ${brandLabel(F.brand)}`}
        actions={
          <>
            <button type="button" className="btn" aria-pressed={custom} onClick={() => setCustom(!custom)}>
              <Icon name="sliders" size="sm" />
              {custom ? 'Terminar personalización' : 'Personalizar'}
            </button>
            <button type="button" className="btn primary" onClick={() => setGoals(T)}>
              <Icon name="tasks" size="sm" />
              Metas
            </button>
          </>
        }
      />
      <KpiFilters F={F} setF={setF} resp={respFor(T)} label="Filtros" />
      {pins.length ? (
        <section className="kpins" aria-label="Indicadores fijados">
          <h2 className="sec">
            <Icon name="bolt" size="sm" />
            Fijados
          </h2>
          <div className="kgrid">
            {pins.map((k) => (
              <KCard key={k.id} k={k} pinned {...cardProps} real={reals[k.id]?.value} />
            ))}
          </div>
        </section>
      ) : null}
      <Tabs className="ktabs" label="Grupos de indicadores" value={T} onChange={(v) => setTab(v)} tabs={gs.map(([k, l]) => ({ id: k, label: l, count: KD.filter((x) => x.g === k).length }))} />
      <div role="tabpanel" style={{ paddingTop: 14 }}>
        {custom ? (
          <div className="note" style={{ marginBottom: 12 }}>
            <Icon name="info" size="sm" />
            <span>Modo personalización: use ← → para reordenar, ✕ para ocultar y el rayo para fijar arriba. Se guarda en este navegador.</span>
            {hid.length ? (
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {hid.map((k) => (
                  <button key={k.id} type="button" className="btn sm" onClick={() => show(k.id)}>
                    <Icon name="plus" size="sm" />
                    {k.n}
                  </button>
                ))}
              </span>
            ) : null}
          </div>
        ) : hid.length ? (
          <p className="sub" style={{ fontSize: 12.5, color: 'var(--muted)', margin: '0 0 10px' }}>
            {plural(hid.length, 'indicador oculto', 'indicadores ocultos')} ·{' '}
            <button type="button" className="btn sm ghost" onClick={() => setCustom(true)}>
              Mostrar u ordenar
            </button>
          </p>
        ) : null}
        <div className="kgrid">
          {vis.map((k, i) => (
            <KCard key={k.id} k={k} pinned={prefs.pins.includes(k.id)} {...cardProps} real={reals[k.id]?.value} custom={custom ? { idx: i, n: vis.length, onMove: move, onHide: hide } : null} />
          ))}
        </div>
        <KpiGroupCharts g={T} F={F} />
      </div>
      <KpiInfoModal id={info} onClose={() => setInfo(null)} onOpen={open} />
      <GoalsModal open={goals != null} group={goals || T} F={F} onClose={() => setGoals(null)} />
    </>
  );
}
