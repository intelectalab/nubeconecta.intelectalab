import { useState, useEffect, useRef } from 'react';
import { animate, stagger } from 'animejs';
import { Plus, Search, Edit2, Trash2, Box, Globe, Server, Shield } from 'lucide-react';

const initialProducts = [
  { id: 'PRD-001', name: 'Hosting Básico cPanel', category: 'Hosting', pen: 'S/ 150.00', usd: '$ 40.00', status: 'Activo', type: 'hosting' },
  { id: 'PRD-002', name: 'VPS Cloud 8GB RAM', category: 'VPS', pen: 'S/ 450.00', usd: '$ 120.00', status: 'Activo', type: 'vps' },
  { id: 'PRD-003', name: 'Dominio .com', category: 'Dominios', pen: 'S/ 45.00', usd: '$ 12.00', status: 'Activo', type: 'domain' },
  { id: 'PRD-004', name: 'SSL Wildcard', category: 'Seguridad', pen: 'S/ 300.00', usd: '$ 80.00', status: 'Inactivo', type: 'ssl' },
  { id: 'PRD-005', name: 'Correo Corporativo (10 cuentas)', category: 'Correo', pen: 'S/ 100.00', usd: '$ 25.00', status: 'Activo', type: 'email' },
];

const getCategoryIcon = (type: string) => {
  switch(type) {
    case 'hosting': return <Box size={18} color="#3b82f6" />;
    case 'vps': return <Server size={18} color="#8b5cf6" />;
    case 'domain': return <Globe size={18} color="#10b981" />;
    case 'ssl': return <Shield size={18} color="#f59e0b" />;
    default: return <Box size={18} color="#64748b" />;
  }
};

export default function CatalogView() {
  const [products] = useState(initialProducts);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const tableBodyRef = useRef<HTMLTableSectionElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Animación de la tabla al cargar o buscar
  useEffect(() => {
    if (tableBodyRef.current) {
      animate(tableBodyRef.current.children, {
        opacity: [0, 1], 
        translateX: [-20, 0], // Se deslizan desde la izquierda
        delay: stagger(60), 
        duration: 500, 
        ease: 'outQuad'
      });
    }
  }, [searchTerm, products]);

  // Animación del Modal
  useEffect(() => {
    if (isModalOpen) {
      animate('.modal-backdrop', { opacity: [0, 1], duration: 300, ease: 'linear' });
      animate('.modal-content', { scale: [0.9, 1], opacity: [0, 1], translateY: [30, 0], duration: 800, ease: 'easeOutElastic(1, .6)' });
      animate('.modal-field', { opacity: [0, 1], translateY: [15, 0], delay: stagger(60, { start: 200 }), duration: 500, ease: 'outQuad' });
    }
  }, [isModalOpen]);

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }} ref={containerRef}>
      
      {/* Header del Catálogo */}
      <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Box size={20} color="var(--brand-text)" /> Catálogo de Productos
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>Gestión de planes de hosting, VPS, dominios y servicios.</p>
        </div>
        
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ position: 'relative' }}>
            <Search size={18} color="#94a3b8" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
            <input 
              type="text" 
              placeholder="Buscar producto..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ padding: '10px 16px 10px 40px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14, width: 250, outline: 'none', transition: 'border-color 0.2s' }}
              onFocus={(e) => e.target.style.borderColor = 'var(--brand-text)'}
              onBlur={(e) => e.target.style.borderColor = '#cbd5e1'}
            />
          </div>
          
          <button className="btn primary" onClick={() => setIsModalOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 8, height: '42px' }}>
            <Plus size={18} /> Nuevo Producto
          </button>
        </div>
      </div>

      {/* Tabla de Productos */}
      <div style={{ overflowX: 'auto' }}>
        <table className="noc-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th>ID</th>
              <th>Producto</th>
              <th>Categoría</th>
              <th>Precio (PEN)</th>
              <th>Precio (USD)</th>
              <th>Estado</th>
              <th style={{ textAlign: 'center' }}>Acciones</th>
            </tr>
          </thead>
          <tbody ref={tableBodyRef}>
            {filteredProducts.map((p) => (
              <tr key={p.id} style={{ opacity: 0 }}>
                <td style={{ fontFamily: 'monospace', fontSize: 13, color: '#64748b' }}>{p.id}</td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #e2e8f0' }}>
                      {getCategoryIcon(p.type)}
                    </div>
                    <span style={{ fontWeight: 600, color: '#0f172a' }}>{p.name}</span>
                  </div>
                </td>
                <td style={{ color: '#475569', fontSize: 14 }}>{p.category}</td>
                <td style={{ fontWeight: 600, color: '#0f172a' }}>{p.pen}</td>
                <td style={{ fontWeight: 600, color: '#0f172a' }}>{p.usd}</td>
                <td>
                  <span style={{ 
                    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                    background: p.status === 'Activo' ? '#ecfdf5' : '#f1f5f9',
                    color: p.status === 'Activo' ? '#10b981' : '#64748b'
                  }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: p.status === 'Activo' ? '#10b981' : '#64748b' }} />
                    {p.status}
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
                    <button style={{ background: 'transparent', border: 'none', color: '#3b82f6', cursor: 'pointer', padding: 6, borderRadius: 6, transition: 'background 0.2s' }} onMouseOver={e => e.currentTarget.style.background = '#eff6ff'} onMouseOut={e => e.currentTarget.style.background = 'transparent'} title="Editar">
                      <Edit2 size={16} />
                    </button>
                    <button style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 6, borderRadius: 6, transition: 'background 0.2s' }} onMouseOver={e => e.currentTarget.style.background = '#fef2f2'} onMouseOut={e => e.currentTarget.style.background = 'transparent'} title="Eliminar">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* MODAL CON ANIMACIONES */}
      {isModalOpen && (
        <div className="modal-backdrop" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, opacity: 0 }}>
          <div className="modal-content" style={{ width: 440, padding: '32px', background: 'white', borderRadius: 16, boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', opacity: 0 }}>
            <h2 style={{ marginBottom: 24, fontSize: 22, fontWeight: 700, color: '#0f172a' }}>Nuevo Producto</h2>
            
            <div className="modal-field form-group" style={{ opacity: 0 }}>
              <label className="form-label">Nombre del Producto</label>
              <input type="text" className="form-input" placeholder="Ej. VPS Cloud 16GB" />
            </div>
            
            <div className="modal-field form-group" style={{ opacity: 0 }}>
              <label className="form-label">Categoría</label>
              <select className="form-input">
                <option>Hosting</option>
                <option>VPS</option>
                <option>Dominios</option>
                <option>Seguridad</option>
                <option>Correo</option>
              </select>
            </div>
            
            <div className="modal-field" style={{ display: 'flex', gap: 16, opacity: 0 }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Precio PEN (S/)</label>
                <input type="text" className="form-input" placeholder="S/ 0.00" />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Precio USD ($)</label>
                <input type="text" className="form-input" placeholder="$ 0.00" />
              </div>
            </div>
            
            <div className="modal-field modal-actions" style={{ opacity: 0 }}>
              <button type="button" className="btn-modal btn-cancel" onClick={() => setIsModalOpen(false)}>Cancelar</button>
              <button type="button" className="btn-modal btn-save" onClick={() => setIsModalOpen(false)}>Guardar Producto</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
