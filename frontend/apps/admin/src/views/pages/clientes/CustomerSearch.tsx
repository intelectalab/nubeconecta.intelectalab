/**
 * Buscador de cliente (escribir nombre / documento / código → elegir), al estilo
 * del buscador de Pedidos. Devuelve el UUID del cliente elegido (o null) por
 * `onChange`; nunca pide el UUID a mano. `value` es el customer_id actual.
 */
import { useEffect, useState, type ReactNode } from 'react';
import type { Customer } from '@hub/api';
import { customersApi, displayName, docOf, useLoad } from './shared';

export function CustomerSearch({ value, onChange, error, label = 'Cliente' }: { value: string; onChange: (id: string | null) => void; error?: ReactNode; label?: string }) {
  const [selected, setSelected] = useState<Customer | null>(null);
  const [cq, setCq] = useState('');
  const [cqDeb, setCqDeb] = useState('');

  // Si llega un value (p. ej. al editar), carga el cliente para mostrar su nombre.
  useEffect(() => {
    if (!value) { setSelected(null); return; }
    if (selected && selected.id === value) return;
    let active = true;
    void customersApi.get(value).then((c) => { if (active) setSelected(c); }).catch(() => { /* se mostrará solo el buscador */ });
    return () => { active = false; };
  }, [value, selected]);

  useEffect(() => {
    const t = setTimeout(() => setCqDeb(cq.trim()), 300);
    return () => clearTimeout(t);
  }, [cq]);

  const found = useLoad(
    () => (selected || !cqDeb ? Promise.resolve([] as Customer[]) : customersApi.list({ q: cqDeb, size: 8 }).then((r) => r.data)),
    [cqDeb, selected],
  );

  return (
    <div className="field full">
      {label}
      {selected ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <b>{displayName(selected)}</b>
          <span className="sub"><span className="mono">{selected.code}</span> · {docOf(selected)}</span>
          <button type="button" className="btn sm" onClick={() => { setSelected(null); setCq(''); setCqDeb(''); onChange(null); }}>Cambiar</button>
        </div>
      ) : (
        <>
          <input className="input" type="search" value={cq} placeholder="Buscar por documento (DNI/RUC), nombre o código…" aria-label="Buscar cliente" onChange={(e) => setCq(e.target.value)} />
          {found.data?.length ? (
            <ul style={{ listStyle: 'none', margin: '6px 0 0', padding: 0, display: 'grid', gap: 4 }}>
              {found.data.map((c) => (
                <li key={c.id}>
                  <button type="button" className="btn sm" style={{ width: '100%', justifyContent: 'flex-start' }} onClick={() => { setSelected(c); onChange(c.id); }}>
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
