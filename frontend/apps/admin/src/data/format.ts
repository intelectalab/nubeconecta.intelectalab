/**
 * Helpers de fechas, números y moneda portados del prototipo (l.955-980).
 * Todas las funciones son puras. Las que dependen de la moneda de visualización
 * reciben `view: CurView` ('orig' | 'PEN' | 'USD'); en las vistas use el hook
 * `useMoney()` de `src/app/context.tsx`, que ya las enlaza a la moneda activa.
 */
import type { Cur, CurView, MoneyPair } from './types';

/* ---------- Texto ---------- */
export const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
/** Normaliza para búsquedas: sin tildes y en minúsculas. */
export const norm = (s: unknown): string =>
  String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/* ---------- Fechas ---------- */
/** "Hoy" fijo del prototipo: 08/10/2026. */
export const TODAY = new Date(2026, 9, 8);
/** "Ahora" fijo del prototipo: 08/10/2026 10:30. */
export const NOW = new Date(2026, 9, 8, 10, 30);
export const DAY = 864e5;
export const addD = (d: Date, n: number): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
/** Días calendario a − b (sin horas). */
export const diffD = (a: Date, b: Date): number =>
  Math.round((new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime() - new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime()) / DAY);
export const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];
export const MESL = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'];
export const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export const p2 = (n: number): string => String(n).padStart(2, '0');
/** 08/10/2026 */
export const fD = (d: Date | null | undefined): string => (d ? `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}` : '—');
/** 8 oct */
export const fDs = (d: Date): string => `${d.getDate()} ${MES[d.getMonth()]}`;
/** jueves 8 de octubre */
export const fDL = (d: Date): string => `${DIAS[d.getDay()]} ${d.getDate()} de ${MESL[d.getMonth()]}`;
/** 10:30 */
export const fT = (d: Date): string => `${p2(d.getHours())}:${p2(d.getMinutes())}`;
/** 2026-10-08 */
export const iso = (d: Date): string => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
export const fromIso = (s: string): Date => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const cap = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);
/** Suma n días hábiles (lun-vie). */
export function addBiz(d: Date, n: number): Date {
  let x = new Date(d);
  let k = 0;
  while (k < n) {
    x = addD(x, 1);
    if (x.getDay() % 6 !== 0) k++;
  }
  return x;
}
/** Días hábiles entre a y b (con signo). */
export function bizBetween(a: Date, b: Date): number {
  let n = 0;
  let x = new Date(a);
  const s = a <= b ? 1 : -1;
  while (diffD(x, b) !== 0) {
    x = addD(x, s);
    if (x.getDay() % 6 !== 0) n += s;
  }
  return n;
}
/** Minutos a texto: "45 min", "3 h 20 min", "4 días". */
export const fmtMin = (m: number): string => {
  m = Math.round(m);
  if (m < 60) return m + ' min';
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h < 48 ? `${h} h${r ? ' ' + r + ' min' : ''}` : `${Math.round(h / 24)} días`;
};

/* ---------- Números ---------- */
/** Tipo de cambio fijo del prototipo. */
export const TC = 3.75;
export const NF2 = new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const NF0 = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 0 });
export const SYM: Record<Cur, string> = { PEN: 'S/', USD: 'US$' };
export function compact(v: number): string {
  if (Math.abs(v) >= 1e6) return NF2.format(v / 1e6).replace(/\.?0+$/, '') + ' M';
  if (Math.abs(v) >= 1e3) return NF0.format(v / 1e3) + ' k';
  return NF0.format(v);
}
/** "1 cliente" / "3 clientes" */
export const plural = (n: number, a: string, b: string): string => `${NF0.format(n)} ${n === 1 ? a : b}`;

/* ---------- Moneda ---------- */
/** Convierte v (en `from`) a la moneda de visualización. Devuelve [valor, moneda]. */
export function conv(v: number, from: Cur, view: CurView): [number, Cur] {
  const t: Cur = view === 'orig' ? from : view;
  if (t === from) return [v, t];
  return [t === 'PEN' ? v * TC : v / TC, t];
}
/** Formatea respetando la moneda de visualización: "S/ 1,234.50". `int` sin decimales. */
export function money(v: number, from: Cur, view: CurView, opt?: { int?: boolean }): string {
  const [x, c] = conv(v, from, view);
  return `${SYM[c]} ${(opt && opt.int ? NF0 : NF2).format(x)}`;
}
/** Formatea sin convertir. */
export const moneyRaw = (v: number, c: Cur, int?: boolean | number): string => `${SYM[c]} ${(int ? NF0 : NF2).format(v)}`;
export const toPEN = (v: number, c: Cur): number => (c === 'PEN' ? v : v * TC);
/** Suma por moneda: f devuelve [monto, moneda]. */
export function sumBy<T>(list: readonly T[], f: (x: T) => [number, Cur]): MoneyPair {
  const r: MoneyPair = { PEN: 0, USD: 0 };
  list.forEach((x) => {
    const [v, c] = f(x);
    r[c] += v;
  });
  return r;
}
/**
 * Texto plano equivalente a dualMoney del prototipo.
 * Con vista 'orig' devuelve "S/ x + US$ y" (o solo una si la otra es 0).
 * Para la versión con marcado use el componente <DualMoney>.
 */
export function dualMoneyText(r: MoneyPair, view: CurView, int?: boolean): string {
  if (view !== 'orig') {
    const t = view === 'PEN' ? r.PEN + r.USD * TC : r.USD + r.PEN / TC;
    return moneyRaw(t, view, int);
  }
  if (!r.USD) return moneyRaw(r.PEN, 'PEN', int);
  if (!r.PEN) return moneyRaw(r.USD, 'USD', int);
  return `${moneyRaw(r.PEN, 'PEN', int)} + ${moneyRaw(r.USD, 'USD', int)}`;
}

/** Slug de dominio a partir del nombre (prototipo l.1093). */
export function slug(n: string): string {
  return (
    norm(n)
      .replace(
        /\b(inversiones|corporacion|comercial|consultora|agencia|clinica|estudio|colegio|distribuidora|transportes|constructora|restaurante|hotel|inmobiliaria|laboratorio|ferreteria|textil|agroexportadora|academia|importaciones|notaria|veterinaria|s\.?a\.?c\.?|e\.?i\.?r\.?l\.?|s\.?r\.?l\.?|s\.?a\.?|los|el|de|la)\b/g,
        ' ',
      )
      .replace(/[^a-z0-9]+/g, '')
      .slice(0, 18) || 'cliente'
  );
}

/* ---------- Colores ---------- */
export const hexOk = (h: string): boolean => /^#[0-9a-f]{6}$/i.test(h);
export const rgb = (h: string): number[] => {
  h = h.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.substr(i, 2), 16));
};
export const lum = (h: string): number =>
  rgb(h)
    .map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    })
    .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
export const contrast = (a: string, b: string): number => {
  const x = lum(a);
  const y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
export const bestFg = (bg: string): string => (contrast(bg, '#ffffff') >= contrast(bg, '#111827') ? '#ffffff' : '#111827');
export const mix = (a: string, b: string, t: number): string => {
  const A = rgb(a);
  const B = rgb(b);
  return '#' + A.map((v, i) => Math.round(v * (1 - t) + B[i] * t).toString(16).padStart(2, '0')).join('');
};
