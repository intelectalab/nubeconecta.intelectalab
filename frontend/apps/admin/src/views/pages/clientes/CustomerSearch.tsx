/**
 * Buscador de cliente (escribir nombre / documento DNI-RUC / código → elegir), al
 * estilo del buscador de Pedidos. Devuelve el UUID del cliente elegido (o null) por
 * `onChange`; nunca pide el UUID a mano. `value` es el customer_id actual.
 *
 * - `onSelect`: además del id, entrega el objeto Customer completo (para quien
 *   necesita moneda, régimen, etc. — p. ej. Pedidos). Se emite al elegir, al
 *   limpiar (null) y al cargar un `value` existente.
 * - `disabled`: muestra el cliente actual en solo lectura (sin buscar ni cambiar).
 * - `activeOnly`: limita la búsqueda a clientes activos.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Customer } from '@hub/api';
import { customersApi, displayName, docOf, useLoad } from './shared';

export function CustomerSearch({ value, onChange, onSelect, error, label = 'Cliente', disabled = false, activeOnly = false }: {
  value: string;
  onChange: (id: string | null) => void;
  onSelect?: (customer: Customer | null) => void;
  error?: ReactNode;
  label?: string;
  disabled?: boolean;
  activeOnly?: boolean;
}) {
  const [selected, setSelected] = useState<Customer | null>(null);
  const [cq, setCq] = useState('');
  const [cqDeb, setCqDeb] = useState('');
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // Si llega un value (p. ej. al editar), carga el cliente para mostrar su nombre.
  useEffect(() => {
    if (!value) { setSelected(null); return; }
    if (selected && selected.id === value) return;
    let active = true;
    void customersApi.get(value).then((c) => { if (active) { setSelected(c); onSelectRef.current?.(c); } }).catch(() => { /* se mostrará solo el buscador */ });
    return () => { active = false; };
  }, [value, selected]);

  useEffect(() => {
    const t = setTimeout(() => setCqDeb(cq.trim()), 300);
    return () => clearTimeout(t);
  }, [cq]);

  const found = useLoad(
    () => (selected || !cqDeb ? Promise.resolve([] as Customer[]) : customersApi.list({ q: cqDeb, size: 8, filter: activeOnly ? { status: 'active' } : undefined }).then((r) => r.data)),
    [cqDeb, selected, activeOnly],
  );

  const pick = (c: Customer) => { setSelected(c); onChange(c.id); onSelectRef.current?.(c); };
  const clear = () => { setSelected(null); setCq(''); setCqDeb(''); onChange(null); onSelectRef.current?.(null); };

  return (
    <div className="field full">
      {label}
      {selected ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <b>{displayName(selected)}</b>
          <span className="sub"><span className="mono">{selected.code}</span> · {docOf(selected)}</span>
          {!disabled ? <button type="button" className="btn sm" onClick={clear}>Cambiar</button> : null}
        </div>
      ) : disabled ? (
        <span className="sub">—</span>
      ) : (
        <>
          <input className="input" type="search" value={cq} placeholder="Buscar por documento (DNI/RUC), nombre o código…" aria-label="Buscar cliente" onChange={(e) => setCq(e.target.value)} />
          {found.data?.length ? (
            <ul style={{ listStyle: 'none', margin: '6px 0 0', padding: 0, display: 'grid', gap: 4 }}>
              {found.data.map((c) => (
                <li key={c.id}>
                  <button type="button" className="btn sm" style={{ width: '100%', justifyContent: 'flex-start' }} onClick={() => pick(c)}>
                    {displayName(c)} · <span className="mono">{c.code}</span> · {docOf(c)}
                  </button>
                </li>
              ))}
            </ul>
          ) : cqDeb && !found.loading ? (
            <small className="hint">Sin clientes que coincidan.</small>
          ) : null}
        </>
      )}
      {error}
    </div>
  );
}
