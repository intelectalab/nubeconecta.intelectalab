/**
 * Contexto global del panel: marca, moneda, rol simulado, tema, navegación por
 * hash, toasts, versión de datos (refresh) y diálogos imperativos.
 *
 * Uso típico en una vista:
 *
 *   const { brand, role, navigate, toast, refresh, dialogs } = useApp();
 *   const m = useMoney();                 // m.money(v, 'PEN'), m.dual(pair)…
 *   …mutar datos en memoria…; refresh(); toast('Pago registrado', 'F001-…');
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { roleAllows } from '../data/config';
import { conv, dualMoneyText, money as fmtMoney, moneyRaw, NF0, NF2, SYM, TC } from '../data/format';
import type { BrandFilter, Cur, CurView, MoneyPair, RoleName } from '../data/types';
import { href as mkHref, parseHash, ROUTE_META, type RouteId } from './routeMeta';
import { lsGet, lsSet } from './storage';

/* ---------- Toasts ---------- */
export type ToastKind = 'ok' | 'info' | 'warn' | 'err';
export interface ToastItem {
  id: number;
  t: string;
  s?: string;
  kind: ToastKind;
}

/* ---------- Diálogos imperativos ---------- */
export interface ConfirmOpts {
  title: ReactNode;
  /** Cuerpo (texto o nodos) */
  body?: ReactNode;
  /** Texto del botón de confirmación (por defecto "Confirmar") */
  okLabel?: string;
  /** Botón rojo (acción destructiva) */
  danger?: boolean;
  onOk: () => void;
}
export interface FormField {
  id: string;
  label: string;
  type?: 'text' | 'number' | 'email' | 'date' | 'select' | 'textarea' | 'tel' | 'url';
  /** Para type='select': valores o pares [valor, etiqueta] */
  options?: (string | [string, string])[];
  value?: string | number;
  req?: boolean;
  /** Ocupa las 2 columnas */
  full?: boolean;
  ph?: string;
  min?: number;
  step?: string;
  /** id de <datalist> para autocompletar (p. ej. 'dlClients') */
  list?: string;
}
export interface FormOpts {
  title: ReactNode;
  sub?: ReactNode;
  fields: FormField[];
  /** Contenido antes del formulario (p. ej. una <div className="note">) */
  pre?: ReactNode;
  /** Texto del botón (por defecto "Guardar") */
  submit?: string;
  wide?: boolean;
  /** Devuelve un mensaje de error o null */
  validate?: (v: Record<string, string>) => string | null;
  onSubmit: (v: Record<string, string>) => void;
}
export interface ModalOpts {
  title?: ReactNode;
  sub?: ReactNode;
  label?: string;
  wide?: boolean;
  footer?: ReactNode;
  className?: string;
}
export type DialogState =
  | { kind: 'confirm'; o: ConfirmOpts }
  | { kind: 'form'; o: FormOpts }
  | { kind: 'node'; o: ModalOpts; node: ReactNode };

export interface Dialogs {
  /** Diálogo de confirmación (confirmDlg del prototipo). */
  confirm: (o: ConfirmOpts) => void;
  /** Formulario genérico con validación (formDlg del prototipo). */
  form: (o: FormOpts) => void;
  /** Abre un modal con contenido libre (va dentro de .modal-b). */
  open: (node: ReactNode, o?: ModalOpts) => void;
  /** Cierra el diálogo imperativo abierto. */
  close: () => void;
}

/* ---------- Estado global ---------- */
export type Theme = 'light' | 'dark';
export interface AppState {
  brand: BrandFilter;
  setBrand: (b: BrandFilter) => void;
  /** Moneda de visualización */
  cur: CurView;
  setCur: (c: CurView) => void;
  /** Rol simulado (vista previa de permisos) */
  role: RoleName;
  setRole: (r: RoleName) => void;
  /** ¿El rol actual puede ver la ruta? */
  allowed: (r: RouteId) => boolean;
  theme: Theme;
  toggleTheme: () => void;
  /** Ruta activa y parámetro (#ruta/param) */
  route: RouteId;
  param: string | null;
  /** Se incrementa en cada navegación (incluso a la misma ruta). */
  navSeq: number;
  /** Navega a una ruta (si ya está en ella, vuelve a cargarla). */
  navigate: (r: RouteId, param?: string | null) => void;
  /** Construye el href: href('cliente','CL-1001') => '#cliente/CL-1001' */
  href: (r: RouteId, param?: string | null) => string;
  /** Abre la ficha 360 de un cliente. */
  openClient: (cid: string) => void;
  /** Contador que cambia con cada refresh(); úselo en deps de useMemo. */
  dataVersion: number;
  /** Vuelve a renderizar tras mutar los datos en memoria. */
  refresh: () => void;
  toasts: ToastItem[];
  /** Aviso flotante (sustituye a alert). kind: 'ok' (defecto) | 'info' | 'warn' | 'err'. */
  toast: (t: string, s?: string, kind?: ToastKind) => void;
  dismissToast: (id: number) => void;
  dialogs: Dialogs;
  /** Estado interno del host de diálogos (lo usa App.tsx). */
  dialog: DialogState | null;
}

const Ctx = createContext<AppState | null>(null);

function initialTheme(): Theme {
  const t = lsGet('ap.theme');
  if (t === 'dark' || t === 'light') return t;
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [brand, setBrand] = useState<BrandFilter>('all');
  const [cur, setCur] = useState<CurView>('orig');
  const [role, setRoleS] = useState<RoleName>('Administrador');
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [explicitTheme, setExplicitTheme] = useState<boolean>(() => {
    const t = lsGet('ap.theme');
    return t === 'dark' || t === 'light';
  });
  const [loc, setLoc] = useState<{ route: RouteId; param: string | null; n: number }>(() => ({ ...(parseHash(location.hash) || { route: 'inicio' as RouteId, param: null }), n: 0 }));
  const [dataVersion, setDataVersion] = useState(0);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const toastId = useRef(0);
  const roleRef = useRef(role);
  roleRef.current = role;

  const dismissToast = useCallback((id: number) => setToasts((l) => l.filter((x) => x.id !== id)), []);
  const toast = useCallback(
    (t: string, s?: string, kind: ToastKind = 'ok') => {
      const id = ++toastId.current;
      setToasts((l) => [...l, { id, t, s, kind }].slice(-3));
      window.setTimeout(() => dismissToast(id), 4200);
    },
    [dismissToast],
  );

  /* Tema */
  useEffect(() => {
    if (explicitTheme) document.documentElement.setAttribute('data-theme', theme);
  }, [theme, explicitTheme]);
  useEffect(() => {
    if (explicitTheme) return;
    let mq: MediaQueryList | null = null;
    try {
      mq = window.matchMedia('(prefers-color-scheme: dark)');
    } catch {
      return;
    }
    const on = () => setTheme(mq && mq.matches ? 'dark' : 'light');
    mq.addEventListener?.('change', on);
    return () => mq?.removeEventListener?.('change', on);
  }, [explicitTheme]);
  const toggleTheme = useCallback(() => {
    setTheme((t) => {
      const n: Theme = t === 'dark' ? 'light' : 'dark';
      lsSet('ap.theme', n);
      return n;
    });
    setExplicitTheme(true);
  }, []);

  /* Router por hash */
  const applyHash = useCallback(() => {
    const p = parseHash(location.hash);
    if (!p) {
      history.replaceState(null, '', '#inicio');
      setLoc((l) => ({ route: 'inicio', param: null, n: l.n + 1 }));
      return;
    }
    if (!roleAllows(roleRef.current, p.route)) {
      toast('Acceso restringido', `El rol ${roleRef.current} no tiene acceso a ${ROUTE_META[p.route].t}.`, 'warn');
      history.replaceState(null, '', '#inicio');
      setLoc((l) => ({ route: 'inicio', param: null, n: l.n + 1 }));
      return;
    }
    setLoc((l) => ({ ...p, n: l.n + 1 }));
  }, [toast]);
  useEffect(() => {
    window.addEventListener('hashchange', applyHash);
    applyHash();
    return () => window.removeEventListener('hashchange', applyHash);
  }, [applyHash]);
  const navigate = useCallback(
    (r: RouteId, param?: string | null) => {
      const h = mkHref(r, param);
      if (location.hash === h) applyHash();
      else location.hash = h.slice(1);
    },
    [applyHash],
  );
  const openClient = useCallback((cid: string) => navigate('cliente', cid), [navigate]);

  /* Rol */
  const setRole = useCallback(
    (r: RoleName) => {
      setRoleS(r);
      roleRef.current = r;
      toast('Rol cambiado', `Vista previa como ${r}. El menú muestra solo las pantallas permitidas.`, 'info');
      const p = parseHash(location.hash);
      if (p && !roleAllows(r, p.route)) navigate('inicio');
    },
    [toast, navigate],
  );
  const allowed = useCallback((r: RouteId) => roleAllows(role, r), [role]);

  const refresh = useCallback(() => setDataVersion((v) => v + 1), []);

  const dialogs = useMemo<Dialogs>(
    () => ({
      confirm: (o) => setDialog({ kind: 'confirm', o }),
      form: (o) => setDialog({ kind: 'form', o }),
      open: (node, o) => setDialog({ kind: 'node', o: o || {}, node }),
      close: () => setDialog(null),
    }),
    [],
  );

  const value = useMemo<AppState>(
    () => ({
      brand, setBrand, cur, setCur, role, setRole, allowed, theme, toggleTheme,
      route: loc.route, param: loc.param, navSeq: loc.n, navigate, href: mkHref, openClient,
      dataVersion, refresh, toasts, toast, dismissToast, dialogs, dialog,
    }),
    [brand, cur, role, setRole, allowed, theme, toggleTheme, loc, navigate, openClient, dataVersion, refresh, toasts, toast, dismissToast, dialogs, dialog],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Acceso al estado global. Debe usarse dentro de <AppProvider>. */
export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp debe usarse dentro de <AppProvider>');
  return v;
}

/** Atajo: función toast. */
export const useToast = () => useApp().toast;

/**
 * Formateadores de dinero enlazados a la moneda de visualización activa.
 *
 *   const m = useMoney();
 *   m.money(349, 'PEN')            // "S/ 349.00" o "US$ 93.07" según la moneda elegida
 *   m.money(349, 'PEN', true)      // sin decimales
 *   m.raw(10, 'USD')               // sin conversión
 *   m.dual({PEN: 100, USD: 20})    // "S/ 100.00 + US$ 20.00" (o total convertido)
 *   m.total({PEN, USD}, 'PEN')     // suma convertida a una moneda
 */
export function useMoney() {
  const { cur } = useApp();
  return useMemo(
    () => ({
      cur,
      /** Moneda efectiva para totales: PEN salvo que la vista sea USD */
      target: (cur === 'USD' ? 'USD' : 'PEN') as Cur,
      sym: (c: Cur) => SYM[c],
      conv: (v: number, from: Cur) => conv(v, from, cur),
      money: (v: number, from: Cur, int?: boolean) => fmtMoney(v, from, cur, { int }),
      raw: (v: number, c: Cur, int?: boolean) => moneyRaw(v, c, int),
      dual: (r: MoneyPair, int?: boolean) => dualMoneyText(r, cur, int),
      total: (r: MoneyPair, to: Cur) => (to === 'PEN' ? r.PEN + r.USD * TC : r.USD + r.PEN / TC),
      n0: (v: number) => NF0.format(v),
      n2: (v: number) => NF2.format(v),
    }),
    [cur],
  );
}
