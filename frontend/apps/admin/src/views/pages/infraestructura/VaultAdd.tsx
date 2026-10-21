/**
 * Modal «Agregar acceso» de la Bóveda (bvAdd del prototipo). Se implementa
 * aparte del FormDialog compartido porque necesita un campo de contraseña.
 */
import { useEffect, useState, type FormEvent } from 'react';
import { ClientDatalist } from '../../../app/actions';
import { Modal } from '../../../components/Modal';
import { findClient } from '../../../data';

export const VAULT_TYPES = ['cPanel', 'FTP', 'SSH', 'WordPress (admin)', 'Registrador', 'DNS (Route 53)', 'Base de datos'];

export interface VaultAddValues {
  cid: string;
  type: string;
  user: string;
  host: string;
}

export function VaultAddDialog({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: (v: VaultAddValues) => void }) {
  const [c, setC] = useState('');
  const [t, setT] = useState('cPanel');
  const [u, setU] = useState('');
  const [h, setH] = useState('');
  const [p, setP] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    if (open) {
      setC('');
      setT('cPanel');
      setU('');
      setH('');
      setP('');
      setErr('');
    }
  }, [open]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const req: [string, string, string][] = [
      ['Cliente', c.trim(), 'bvC'],
      ['Usuario', u.trim(), 'bvU'],
      ['Host / URL', h.trim(), 'bvH'],
      ['Contraseña', p, 'bvP'],
    ];
    const miss = req.find((x) => !x[1]);
    if (miss) {
      setErr(`Complete el campo «${miss[0]}».`);
      document.getElementById(miss[2])?.focus();
      return;
    }
    const cl = findClient(c.trim());
    if (!cl) {
      setErr('Seleccione un cliente existente.');
      document.getElementById('bvC')?.focus();
      return;
    }
    onClose();
    onSave({ cid: cl.id, type: t, user: u.trim(), host: h.trim() });
  };

  return (
    <Modal open={open} onClose={onClose} title="Agregar acceso" bare initialFocus="#bvC">
      <form onSubmit={submit} noValidate style={{ display: 'contents' }}>
        <div className="modal-b">
          <div className="form-grid">
            <label className="field full" htmlFor="bvC">
              Cliente *
              <input className="input" id="bvC" list="dlClients" placeholder="Escriba para buscar…" value={c} onChange={(e) => { setC(e.target.value); setErr(''); }} autoComplete="off" />
              <ClientDatalist />
            </label>
            <label className="field" htmlFor="bvT">
              Tipo
              <select className="select" id="bvT" value={t} onChange={(e) => setT(e.target.value)}>
                {VAULT_TYPES.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label className="field" htmlFor="bvU">
              Usuario *
              <input className="input" id="bvU" value={u} onChange={(e) => { setU(e.target.value); setErr(''); }} autoComplete="off" />
            </label>
            <label className="field full" htmlFor="bvH">
              Host / URL *
              <input className="input" id="bvH" value={h} onChange={(e) => { setH(e.target.value); setErr(''); }} autoComplete="off" />
            </label>
            <label className="field full" htmlFor="bvP">
              Contraseña *
              <input className="input" id="bvP" type="password" value={p} onChange={(e) => { setP(e.target.value); setErr(''); }} autoComplete="new-password" />
            </label>
          </div>
          <div className="err" role="alert">
            {err}
          </div>
        </div>
        <div className="modal-f">
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn primary">
            Guardar cifrado
          </button>
        </div>
      </form>
    </Modal>
  );
}
