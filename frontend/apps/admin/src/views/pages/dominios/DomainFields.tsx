/** Selectores compartidos por los formularios de alta y edición de dominios. */
import type { ReactNode } from 'react';
import { customersApi, displayName, useLoad } from '../clientes/shared';
import type { useRegistrarAccounts } from './shared';

export function CustomerField({ value, onChange, disabled, error }: { value: string; onChange: (v: string) => void; disabled?: boolean; error?: ReactNode }) {
  const customers = useLoad(() => customersApi.list({ size: 100, sort: 'legal_name' }).then((p) => p.data), []);
  const list = customers.data ?? [];
  return (
    <label className="field">Cliente
      <select className="select" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        <option value="">{customers.loading ? 'Cargando…' : 'Sin cliente'}</option>
        {value && !list.some((c) => c.id === value) && !customers.loading ? <option value={value}>(cliente actual)</option> : null}
        {list.map((c) => <option key={c.id} value={c.id}>{displayName(c)} · {c.code}</option>)}
      </select>
      {error}
    </label>
  );
}

export function RegistrarField({ value, onChange, registrars, error }: { value: string; onChange: (v: string) => void; registrars: ReturnType<typeof useRegistrarAccounts>; error?: ReactNode }) {
  return (
    <label className="field">Registrador
      <select className="select" value={value} disabled={registrars.denied} onChange={(e) => onChange(e.target.value)}>
        <option value="">{registrars.loading ? 'Cargando…' : registrars.denied ? 'No disponible (sin permiso)' : 'Sin registrador'}</option>
        {value && !registrars.loading && !registrars.options.some((o) => o.id === value) ? <option value={value}>(registrador actual)</option> : null}
        {registrars.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
      {error}
    </label>
  );
}
