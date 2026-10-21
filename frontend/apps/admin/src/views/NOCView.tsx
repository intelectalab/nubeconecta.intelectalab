import { useState, useEffect, useRef } from 'react';
import { animate, createTimeline, stagger } from 'animejs';
import { Plus, Server, Activity, AlertTriangle } from 'lucide-react';

const initialNodes = [
  { id: 'VPS-AP-01', name: 'Nube Producción 01', type: 'VPS Propio (Hetzner)', ip: '198.51.100.12', accounts: '45 / 80', ram: '12 / 16 GB', status: 'OK', stClass: 'ok' },
  { id: 'VPS-AP-02', name: 'Nube Producción 02', type: 'VPS Propio (Contabo)', ip: '198.51.100.15', accounts: '78 / 80', ram: '15.2 / 16 GB', status: 'Carga Alta', stClass: 'warn' },
  { id: 'BH-RES-01', name: 'Reseller BanaHosting', type: 'Revendedor cPanel', ip: '192.0.2.88', accounts: '120 / 150', ram: 'N/A', status: 'En migración', stClass: 'info' },
];

const getPercent = (str: string) => {
  if (!str || str === 'N/A') return 0;
  const parts = str.split('/');
  if (parts.length !== 2) return 0;
  const curr = parseFloat(parts[0]);
  const max = parseFloat(parts[1]);
  return max > 0 ? Math.min((curr / max) * 100, 100) : 0;
};

export default function NOCView() {
  const [nodes, setNodes] = useState(initialNodes);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({ id: '', name: '', type: 'VPS Propio', ip: '', accounts: '0 / 80', ram: '0 / 16 GB' });

  const tableBodyRef = useRef<HTMLTableSectionElement>(null);

  useEffect(() => {
    if (tableBodyRef.current) {
      animate(tableBodyRef.current.children, {
        opacity: [0, 1], translateY: [20, 0], delay: stagger(100), duration: 600, ease: 'outQuad',
      });
    }
    const tl = createTimeline({ defaults: { duration: 1000, ease: 'inOutQuad' } });
    nodes.forEach((node, index) => {
      const accPct = getPercent(node.accounts);
      const ramPct = getPercent(node.ram);
      tl.add(`.progress-acc-${index}`, { width: `${accPct}%` }, 200);
      if (ramPct > 0) tl.add(`.progress-ram-${index}`, { width: `${ramPct}%` }, '<');
    });
    return () => { tl.pause(); };
  }, [nodes]);

  useEffect(() => {
    if (isModalOpen) {
      animate('.modal-backdrop', { opacity: [0, 1], duration: 300, ease: 'linear' });
      animate('.modal-content', { scale: [0.9, 1], opacity: [0, 1], translateY: [30, 0], duration: 800, ease: 'easeOutElastic(1, .6)' });
      animate('.modal-field', { opacity: [0, 1], translateY: [15, 0], delay: stagger(60, { start: 200 }), duration: 500, ease: 'outQuad' });
    }
  }, [isModalOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setNodes([...nodes, { ...formData, status: 'OK', stClass: 'ok' }]);
    setIsModalOpen(false);
    setFormData({ id: '', name: '', type: 'VPS Propio', ip: '', accounts: '0 / 80', ram: '0 / 16 GB' });
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
        <button className="btn primary" onClick={() => setIsModalOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Plus size={18} /> Añadir Nodo
        </button>
      </div>

      <div className="noc-table-container">
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Server size={22} color="var(--brand-text)" />
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a' }}>Servidores en Producción</h2>
          <span style={{ marginLeft: 'auto', fontSize: 13, color: '#64748b', background: '#f1f5f9', padding: '4px 12px', borderRadius: 20 }}>
            {nodes.length} nodos activos
          </span>
        </div>
        
        <div style={{ overflowX: 'auto' }}>
          <table className="noc-table">
            <thead>
              <tr>
                <th>Nodo</th><th>Proveedor</th><th>IP Pública</th><th>Uso de Cuentas</th><th>Uso de RAM</th><th style={{ textAlign: 'center' }}>Estado</th>
              </tr>
            </thead>
            <tbody ref={tableBodyRef}>
              {nodes.map((n, index) => {
                const accPct = getPercent(n.accounts);
                const ramPct = getPercent(n.ram);
                return (
                  <tr key={n.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: '#0f172a', fontSize: 14 }}>{n.name}</div>
                      <div style={{ fontSize: 12, color: '#64748b', fontFamily: 'monospace', marginTop: 4 }}>{n.id}</div>
                    </td>
                    <td style={{ color: '#475569' }}>{n.type}</td>
                    <td>
                      <span style={{ background: '#f1f5f9', padding: '4px 8px', borderRadius: 6, fontFamily: 'monospace', fontSize: 13, color: '#334155' }}>{n.ip}</span>
                    </td>
                    <td style={{ width: '18%' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6, fontWeight: 600 }}>
                        <span>{n.accounts}</span>
                        <span style={{ color: accPct > 85 ? '#ef4444' : '#64748b' }}>{Math.round(accPct)}%</span>
                      </div>
                      <div className="progress-bar-bg">
                        <div className={`progress-bar-fill progress-acc-${index}`} style={{ backgroundColor: accPct > 85 ? '#ef4444' : 'var(--brand-text)' }} />
                      </div>
                    </td>
                    <td style={{ width: '18%' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6, fontWeight: 600 }}>
                        <span>{n.ram}</span>
                        <span style={{ color: ramPct > 85 ? '#ef4444' : '#64748b' }}>{Math.round(ramPct)}%</span>
                      </div>
                      <div className="progress-bar-bg">
                        <div className={`progress-bar-fill progress-ram-${index}`} style={{ backgroundColor: ramPct > 85 ? '#ef4444' : '#10b981' }} />
                      </div>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`chip ${n.stClass}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', fontSize: 12, borderRadius: 20 }}>
                        {n.stClass === 'ok' && <Activity size={14} />}
                        {n.stClass === 'warn' && <AlertTriangle size={14} />}
                        {n.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="modal-backdrop" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, opacity: 0 }}>
          <div className="modal-content" style={{ width: 440, padding: '32px', background: 'white', borderRadius: 16, boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', opacity: 0 }}>
            <h2 style={{ marginBottom: 24, fontSize: 22, fontWeight: 700, color: '#0f172a' }}>Añadir Nuevo Nodo</h2>
            <form onSubmit={handleSubmit}>
              
              <div className="modal-field form-group" style={{ opacity: 0 }}>
                <label className="form-label">ID del Nodo</label>
                <input required placeholder="Ej. VPS-AP-03" className="form-input" value={formData.id} onChange={e => setFormData({...formData, id: e.target.value})} />
              </div>
              
              <div className="modal-field form-group" style={{ opacity: 0 }}>
                <label className="form-label">Nombre Comercial</label>
                <input required placeholder="Ej. Nodo Brasil" className="form-input" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
              </div>
              
              <div className="modal-field form-group" style={{ opacity: 0 }}>
                <label className="form-label">IP Pública</label>
                <input required placeholder="Ej. 192.168.1.1" className="form-input" value={formData.ip} onChange={e => setFormData({...formData, ip: e.target.value})} />
              </div>

              <div className="modal-field modal-actions" style={{ opacity: 0 }}>
                <button type="button" className="btn-modal btn-cancel" onClick={() => setIsModalOpen(false)}>Cancelar</button>
                <button type="submit" className="btn-modal btn-save">Guardar Nodo</button>
              </div>
              
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
