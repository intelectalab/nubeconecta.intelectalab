/** Selectores compartidos por los formularios de alta y edición de dominios. */
import type { ReactNode } from 'react';
import { CustomerSearch } from '../clientes/CustomerSearch';
import type { useRegistrarAccounts } from './shared';

export function CustomerField({ value, onChange, disabled, error }: { value: string; onChange: (v: string) => void; disabled?: boolean; error?: ReactNode }) {
  return <CustomerSearch value={value} onChange={(id) => onChange(id ?? '')} disabled={disabled} error={error} />;
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
