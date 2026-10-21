/**
 * Generador pseudoaleatorio determinista (mulberry32) idéntico al del prototipo
 * (prototipo/panel.html l.950-954). Misma semilla => mismos datos.
 *
 * IMPORTANTE: el orden de las llamadas importa. Toda la generación de datos que
 * consume `rnd()` vive en `db.ts` y respeta el orden del prototipo. No llame a
 * estas funciones desde las vistas durante el render (rompería el determinismo
 * de los datos que se generen después); para valores aleatorios en acciones
 * simuladas use `Math.random()` o un generador propio (ver `seededRng`).
 */
let seed = 20261008;

export function rnd(): number {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)];
export const ri = (a: number, b: number): number => a + Math.floor(rnd() * (b - a + 1));

export function wpick<T>(pairs: ReadonlyArray<readonly [T, number]>): T {
  const s = pairs.reduce((a, p) => a + p[1], 0);
  let r = rnd() * s;
  for (const p of pairs) {
    if ((r -= p[1]) <= 0) return p[0];
  }
  return pairs[0][0];
}

/** Hash simple de cadenas usado por el prototipo para series KPI (kHash). */
export function kHash(s: string): number {
  let h = 7;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 100003;
  return h;
}

/** Generador independiente con semilla de texto (equivale a kdRng del prototipo). */
export function seededRng(seedText: string): () => number {
  let s = (kHash(seedText) * 7919 + 13) % 2147483647 || 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}
