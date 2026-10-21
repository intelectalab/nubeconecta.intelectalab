/**
 * Estado compartido entre el Panel de indicadores (#kpi) y el detalle (#kpid):
 * filtros de periodo/comparación/categoría/responsable (S.kPer… del prototipo),
 * preferencias del tablero (KPREF, guardadas en 'ap.kpi') y filtros de la tabla
 * de registros del detalle (S.kd).
 */
import { useMemo } from 'react';
import { useApp } from '../../../app/context';
import { useLocalPref, useViewState } from '../../../app/storage';
import { AGENTS, EJEC, KPI_FILTER_DEFAULT, MESL, kMonth, type KpiFilter } from '../../../data';

export type KpiBase = Omit<KpiFilter, 'brand' | 'cur'>;

/** Filtros del panel: periodo y demás en memoria; marca y moneda del contexto global. */
export function useKpiFilter() {
  const { brand, cur, setBrand, setCur } = useApp();
  const [base, setBase] = useViewState<KpiBase>('kpi.F', () => ({ ...KPI_FILTER_DEFAULT }));
  const F = useMemo<KpiFilter>(() => ({ ...base, brand, cur }), [base, brand, cur]);
  /** Cambia un filtro (mantiene Desde ≤ Hasta como el prototipo, H.kF). */
  const setF = <K extends keyof KpiBase>(k: K, v: KpiBase[K]) => {
    setBase((p) => {
      const n = { ...p, [k]: v };
      if (n.kFrom > n.kTo) {
        if (k === 'kFrom') n.kTo = n.kFrom;
        else n.kFrom = n.kTo;
      }
      return n;
    });
  };
  return { F, setF, setBrand, setCur };
}

export interface KpiPrefs {
  pins: string[];
  hidden: string[];
  order: Record<string, string[]>;
}
export const KPREF_DEFAULT: KpiPrefs = { pins: ['mrr', 'vencido', 'sla', 'uptime'], hidden: [], order: {} };

/** Preferencias del tablero (fijados, ocultos y orden) persistidas en este navegador. */
export function useKpiPrefs() {
  const [raw, setRaw] = useLocalPref<KpiPrefs>('ap.kpi', KPREF_DEFAULT);
  const prefs: KpiPrefs = {
    pins: Array.isArray(raw?.pins) ? raw.pins : KPREF_DEFAULT.pins,
    hidden: Array.isArray(raw?.hidden) ? raw.hidden : [],
    order: raw && typeof raw.order === 'object' && raw.order ? raw.order : {},
  };
  return [prefs, setRaw] as const;
}

/** Meses seleccionables en «Rango» (índices 24..47). */
export const RANGE_MONTHS: [number, string][] = Array.from({ length: 24 }, (_, j) => {
  const i = 24 + j;
  return [i, `${MESL[kMonth(i).getMonth()]} ${kMonth(i).getFullYear()}`];
});
export const PER_OPTS: [KpiFilter['kPer'], string][] = [['mes', 'Mes'], ['trimestre', 'Trimestre'], ['año', 'Año (12 meses)'], ['rango', 'Rango']];
export const CAT_OPTS: [string, string][] = [['', 'Todas'], ['hosting', 'Hosting'], ['vps', 'VPS'], ['correo', 'Correo'], ['dominios', 'Dominios'], ['ssl', 'SSL'], ['web', 'Páginas y tiendas'], ['otros', 'Otros']];
export const CUR_OPTS: [string, string][] = [['orig', 'Original (S/ y US$)'], ['PEN', 'Todo en S/'], ['USD', 'Todo en US$']];
/** Responsables según el grupo (técnicos en Soporte, ejecutivos en Comercial/CRM). */
export const respFor = (g: string): string[] => (g === 'soporte' ? AGENTS : ['comercial', 'crm'].includes(g) ? EJEC : [...EJEC, ...AGENTS]);
export const cmpLabel = (F: KpiFilter): string => (F.kCmp === 'anual' ? 'Año anterior' : 'Periodo anterior');
