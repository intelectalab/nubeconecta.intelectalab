/**
 * Iconos: mapea los ids del prototipo (IC, l.983-1055) a componentes de lucide-react.
 *
 *   <Icon name="wallet" size="sm" />      // clase "i sm" (15 px), aria-hidden
 *   <SevIcon sev="critica" />             // forma + color por severidad
 */
import {
  Activity, AppWindow, ArrowLeftRight, ArrowRight, Bell, BookOpen, Building2, Calendar, ChartLine, Check,
  ChevronDown, ChevronLeft, ChevronRight, Circle, CirclePause, Clock, Cloud, Code, Columns2, CreditCard, Cpu,
  Database, Dot, Download, ExternalLink, Eye, FileCheck, FileText, Funnel, Gauge, Globe, Handshake, House, Info,
  KeyRound, Layers, Link, List, ListFilter, Lock, LogOut, Mail, Menu, MessageCircle, MessageSquare, Moon, Network,
  OctagonAlert, Package, Palette, PanelLeft, Pencil, Phone, Plus, Receipt, RefreshCw, Search, Send, Server, Shield,
  SlidersHorizontal, Square, SquareCheck, Sun, Tag, Trash2, TriangleAlert, Upload, User, Users, Wallet, X, Zap,
} from 'lucide-react';
import type { CSSProperties } from 'react';
import type { Sev } from '../data/types';

// lucide-react se declara como `any` en src/declarations.d.ts
type IconCmp = (props: Record<string, unknown>) => JSX.Element;

export const ICONS = {
  home: House, users: Users, user: User, globe: Globe, server: Server, cloud: Cloud, msg: MessageSquare,
  wallet: Wallet, file: FileText, funnel: Funnel, sliders: SlidersHorizontal, search: Search, bell: Bell, sun: Sun,
  moon: Moon, menu: Menu, panel: PanelLeft, cl: ChevronLeft, cr: ChevronRight, cd: ChevronDown, x: X, check: Check,
  tri: TriangleAlert, oct: OctagonAlert, info: Info, clock: Clock, cal: Calendar, send: Send, plus: Plus, trash: Trash2,
  refresh: RefreshCw, db: Database, cpu: Cpu, mail: Mail, whats: MessageCircle, cols: Columns2, list: List, eye: Eye,
  arrow: ArrowRight, bolt: Zap, shield: Shield, link: Link, logout: LogOut, card: CreditCard, migrate: ArrowLeftRight,
  code: Code, layers: Layers, box: Package, net: Network, contract: FileCheck, activity: Activity, download: Download,
  upload: Upload, phone: Phone, receipt: Receipt, pause: CirclePause, handshake: Handshake, dot: Dot, filter: ListFilter,
  edit: Pencil, building: Building2, sq: Square, gauge: Gauge, lock: Lock, key: KeyRound, chart: ChartLine,
  tasks: SquareCheck, external: ExternalLink, book: BookOpen, palette: Palette, browser: AppWindow, tag: Tag, circ: Circle,
} as const;

/** Ids de icono disponibles (los mismos del prototipo). */
export type IconName = keyof typeof ICONS;

export interface IconProps {
  /** id del prototipo: 'home', 'wallet', 'msg'… (desconocido => 'dot') */
  name: IconName | string;
  /** 'sm' 15 px · 'lg' 22 px · por defecto 18 px */
  size?: 'sm' | 'lg';
  className?: string;
  style?: CSSProperties;
  /** Si se indica, el icono deja de ser decorativo y se anuncia con este texto. */
  label?: string;
}

export function Icon({ name, size, className, style, label }: IconProps) {
  const Cmp = ((ICONS as Record<string, unknown>)[name] || ICONS.dot) as IconCmp;
  const cls = ['i', size, className].filter(Boolean).join(' ');
  return label ? (
    <Cmp className={cls} style={style} role="img" aria-label={label} focusable="false" />
  ) : (
    <Cmp className={cls} style={style} aria-hidden="true" focusable="false" />
  );
}

/** Icono de severidad con forma + color (prototipo sevIcon). */
export function SevIcon({ sev, small }: { sev: Sev; small?: boolean }) {
  const st: CSSProperties | undefined = small ? { width: 16, height: 16 } : undefined;
  const title = { critica: 'Crítica', alta: 'Alta', media: 'Media', baja: 'Baja' }[sev];
  return (
    <span className={`sev ${sev}`} title={`Severidad ${title}`} style={st}>
      {sev === 'critica' ? (
        <svg viewBox="0 0 24 24" aria-hidden="true" style={st}>
          <path d="M7.9 2h8.2L22 7.9v8.2L16.1 22H7.9L2 16.1V7.9z" fill="currentColor" />
          <path d="M12 7.5v5.5M12 16.3v.2" stroke="var(--surface)" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      ) : sev === 'alta' ? (
        <svg viewBox="0 0 24 24" aria-hidden="true" style={st}>
          <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" fill="currentColor" />
          <path d="M12 9v4.5M12 17.2v.2" stroke="var(--surface)" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      ) : sev === 'media' ? (
        <svg viewBox="0 0 24 24" aria-hidden="true" style={st}>
          <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="2.4" />
          <circle cx="12" cy="12" r="3" fill="currentColor" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true" style={st}>
          <rect x="5" y="5" width="14" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="2.4" />
        </svg>
      )}
    </span>
  );
}

/** Logo AlojamientoPlus (nube + rayo) del prototipo. */
export function LogoMark({ cloud = '#5f9a32', bolt = '#f2b71a' }: { cloud?: string; bolt?: string }) {
  return (
    <svg viewBox="0 0 48 36" aria-hidden="true">
      <path d="M37.5 31H12.5a9 9 0 0 1-1.6-17.86A12 12 0 0 1 34 10.4a8.6 8.6 0 0 1 3.5 20.6z" fill="none" stroke={cloud} strokeWidth="3.2" strokeLinejoin="round" />
      <path d="M25.6 9.5 17.8 21h6l-2.2 9.5L31 17.6h-6.2l2.6-8.1z" fill={bolt} stroke={bolt} strokeWidth="1" strokeLinejoin="round" />
    </svg>
  );
}
