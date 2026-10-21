/**
 * Persistencia ligera:
 *  - lsGet/lsSet: localStorage protegido con try/catch (preferencias por navegador).
 *  - useViewState: estado en memoria que sobrevive a cambios de ruta (como S.* del
 *    prototipo: filtros, pestaña activa, página…). Se pierde al recargar.
 *  - useLocalPref: estado persistido en localStorage (JSON).
 */
import { useCallback, useState } from 'react';

export function lsGet(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
export function lsSet(k: string, v: string): void {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* sin almacenamiento */
  }
}

const MEM = new Map<string, unknown>();

/**
 * Igual que useState, pero el valor se conserva en memoria al salir y volver a
 * la vista. Use claves con prefijo de la vista: useViewState('cob.tab', 'pronto').
 */
export function useViewState<T>(key: string, initial: T | (() => T)): [T, (v: T | ((p: T) => T)) => void] {
  const [v, setV] = useState<T>(() => {
    if (MEM.has(key)) return MEM.get(key) as T;
    const x = typeof initial === 'function' ? (initial as () => T)() : initial;
    MEM.set(key, x);
    return x;
  });
  const set = useCallback(
    (n: T | ((p: T) => T)) => {
      setV((p) => {
        const x = typeof n === 'function' ? (n as (p: T) => T)(p) : n;
        MEM.set(key, x);
        return x;
      });
    },
    [key],
  );
  return [v, set];
}

/** Estado persistido en localStorage como JSON (clave con prefijo 'ap.'). */
export function useLocalPref<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void] {
  const [v, setV] = useState<T>(() => {
    const raw = lsGet(key);
    if (raw == null) return initial;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (n: T | ((p: T) => T)) => {
      setV((p) => {
        const x = typeof n === 'function' ? (n as (p: T) => T)(p) : n;
        lsSet(key, JSON.stringify(x));
        return x;
      });
    },
    [key],
  );
  return [v, set];
}
