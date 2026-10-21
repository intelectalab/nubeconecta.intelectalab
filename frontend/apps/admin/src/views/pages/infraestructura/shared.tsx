/**
 * Utilidades compartidas por las vistas de Infraestructura
 * (infra, monitoreo, proveedores, cloud, correo, bóveda).
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../../../components/Icon';
import { Chip, EmptyState } from '../../../components/ui';

/** Estado vacío estándar de las tablas (tbl() del prototipo). */
export function NoRows({ text }: { text?: string }) {
  return <EmptyState title="Sin registros" text={text || 'No hay datos para los filtros elegidos.'} />;
}

/**
 * Acciones con espera simulada: el botón muestra un spinner y queda
 * deshabilitado hasta que termina el temporizador.
 */
export function useBusy() {
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const run = useCallback((key: string, ms: number, fn: () => void) => {
    setBusy((b) => ({ ...b, [key]: true }));
    window.setTimeout(() => {
      fn();
      if (alive.current) setBusy((b) => ({ ...b, [key]: false }));
    }, ms);
  }, []);
  return { busy, run };
}

/** Botón que muestra «spinner + texto de espera» mientras `busy`. */
export function BusyButton({ busy, busyText, onClick, className = 'btn sm', icon, children, id }: { busy?: boolean; busyText: string; onClick: () => void; className?: string; icon?: string; children: ReactNode; id?: string }) {
  return (
    <button type="button" id={id} className={className} disabled={busy} aria-busy={busy || undefined} onClick={onClick}>
      {busy ? (
        <>
          <span className="spin" aria-hidden="true" />
          {busyText}
        </>
      ) : (
        <>
          {icon ? <Icon name={icon} size="sm" /> : null}
          {children}
        </>
      )}
    </button>
  );
}

/** Chip de estado de monitoreo/respaldos/restauraciones (stc del prototipo). */
export function StateChip({ s }: { s: string }) {
  const k =
    s === 'Operativo' || s === 'Correcto' || s === 'Completada' || s === 'Resuelto'
      ? 'ok'
      : s === 'Degradado' || s === 'Incompleto' || s === 'En curso' || s === 'Aprobada'
        ? 'warn'
        : s === 'Solicitada'
          ? 'info'
          : 'danger';
  return <Chip kind={k}>{s}</Chip>;
}
