import { useState, useEffect, useRef } from 'react';
import { animate, stagger } from 'animejs';
import { Plus, Trash2, User, Phone, Globe, Users, MessageCircle } from 'lucide-react';

const initialLeads = [
  { id: 2, co: 'Estudio Jurídico Lima', prod: 'Hosting Corporativo cPanel', val: 'S/ 180/mes', ch: 'Landing', stage: 'Contacto inicial', owner: 'María P.' },
  { id: 3, co: 'Constructora Alfa', prod: 'Infraestructura Dedicada', val: 'S/ 1,200/mes', ch: 'Referido', stage: 'Negociación', owner: 'Carlos R.' },
  { id: 4, co: 'Clínica San José', prod: 'Servidor Dedicado', val: 'S/ 2,500/mes', ch: 'Referido', stage: 'Cotización', owner: 'Ana G.' },
];

const COLUMNS = ['Contacto inicial', 'Cotización', 'Negociación'];

const getChannelInfo = (ch: string) => {
  switch(ch) {
    case 'WhatsApp': return { icon: MessageCircle, color: '#25D366' };
    case 'Landing': return { icon: Globe, color: '#3b82f6' };
    case 'Referido': return { icon: Users, color: '#8b5cf6' };
    default: return { icon: Phone, color: '#64748b' };
  }
};

export default function CRMView() {
  const [leads, setLeads] = useState(initialLeads);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({ co: '', prod: '', val: '', ch: 'WhatsApp', owner: 'Admin' });
  const cardsContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (cardsContainerRef.current) {
      animate(cardsContainerRef.current.querySelectorAll('.kanban-card'), {
        opacity: [0, 1], translateY: [15, 0], scale: [0.95, 1], delay: stagger(80), duration: 500, ease: 'outQuad'
      });
    }
  }, []);

  useEffect(() => {
    if (isModalOpen) {
      animate('.modal-backdrop', { opacity: [0, 1], duration: 300, ease: 'linear' });
      animate('.modal-content', { scale: [0.9, 1], opacity: [0, 1], translateY: [30, 0], duration: 800, ease: 'easeOutElastic(1, .6)' });
      animate('.modal-field', { opacity: [0, 1], translateY: [15, 0], delay: stagger(60, { start: 200 }), duration: 500, ease: 'outQuad' });
    }
  }, [isModalOpen]);

  const handleDragStart = (e: React.DragEvent, id: number) => {
    e.dataTransfer.setData('leadId', id.toString());
    e.currentTarget.classList.add('dragging');
  };
  const handleDragEnd = (e: React.DragEvent) => e.currentTarget.classList.remove('dragging');
  const handleDragOver = (e: React.DragEvent) => e.preventDefault(); 
  const handleDrop = (e: React.DragEvent, newStage: string) => {
    const id = parseInt(e.dataTransfer.getData('leadId'));
    setLeads(prevLeads => prevLeads.map(lead => lead.id === id ? { ...lead, stage: newStage } : lead));
  };
  const handleDelete = (id: number) => setLeads(prevLeads => prevLeads.filter(lead => lead.id !== id));
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLeads([...leads, { ...formData, id: Date.now(), stage: 'Contacto inicial' }]);
    setIsModalOpen(false);
    setFormData({ co: '', prod: '', val: '', ch: 'WhatsApp', owner: 'Admin' });
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
        <button className="btn primary" onClick={() => setIsModalOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Plus size={18} /> Nuevo Prospecto
        </button>
      </div>

      <div ref={cardsContainerRef} style={{ display: 'flex', gap: 24, overflowX: 'auto', paddingBottom: 20, alignItems: 'flex-start' }}>
        {COLUMNS.map(col => (
          <div key={col} onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, col)}
               style={{ flex: '1 0 340px', background: '#f1f5f9', borderRadius: 12, border: '2px dashed #cbd5e1', display: 'flex', flexDirection: 'column', minHeight: '150px', maxHeight: 'calc(100vh - 220px)' }}>
            
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#334155' }}>{col}</h3>
              <span style={{ background: '#e2e8f0', padding: '2px 10px', borderRadius: 20, fontSize: 12, color: '#64748b', fontWeight: 600 }}>
                {leads.filter(l => l.stage === col).length}
              </span>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, overflowY: 'auto', padding: 16 }}>
              {leads.filter(l => l.stage === col).map(lead => {
                const channel = getChannelInfo(lead.ch);
                const ChannelIcon = channel.icon;
                
                return (
                  <div key={lead.id} draggable onDragStart={(e) => handleDragStart(e, lead.id)} onDragEnd={handleDragEnd}
                       className="kanban-card"
                       style={{ 
                         padding: 16, cursor: 'grab', background: 'white', borderRadius: 8,
                         borderLeft: `4px solid ${channel.color}`, boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                         transition: 'transform 0.2s, box-shadow 0.2s'
                       }}
                       onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 12px rgba(0,0,0,0.1)'; }}
                       onMouseOut={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.05)'; }}>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <b style={{ fontSize: 15, color: '#0f172a', lineHeight: 1.3 }}>{lead.co}</b>
                      <button onClick={() => handleDelete(lead.id)} style={{ background: 'transparent', border: 'none', color: '#cbd5e1', cursor: 'pointer', padding: 4, transition: 'color 0.2s' }} onMouseOver={(e) => e.currentTarget.style.color = '#ef4444'} onMouseOut={(e) => e.currentTarget.style.color = '#cbd5e1'}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                    
                    <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: 13, lineHeight: 1.4 }}>{lead.prod}</p>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
                      <span style={{ fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <User size={14} /> {lead.owner}
                      </span>
                      <strong style={{ color: '#0f172a', fontSize: 14 }}>{lead.val}</strong>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12 }}>
                        <ChannelIcon size={14} color={channel.color} />
                        <span style={{ fontSize: 11, fontWeight: 700, color: channel.color, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{lead.ch}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {isModalOpen && (
        <div className="modal-backdrop" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, opacity: 0 }}>
          <div className="modal-content" style={{ width: 440, padding: '32px', background: 'white', borderRadius: 16, boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', opacity: 0 }}>
            <h2 style={{ marginBottom: 24, fontSize: 22, fontWeight: 700, color: '#0f172a' }}>Nuevo Prospecto</h2>
            <form onSubmit={handleSubmit}>
              
              <div className="modal-field form-group" style={{ opacity: 0 }}>
                <label className="form-label">Empresa</label>
                <input required placeholder="Ej. Tech Solutions SAC" className="form-input" value={formData.co} onChange={e => setFormData({...formData, co: e.target.value})} />
              </div>
              
              <div className="modal-field form-group" style={{ opacity: 0 }}>
                <label className="form-label">Producto</label>
                <input required placeholder="Ej. VPS Cloud 8GB" className="form-input" value={formData.prod} onChange={e => setFormData({...formData, prod: e.target.value})} />
              </div>
              
              <div className="modal-field form-group" style={{ opacity: 0 }}>
                <label className="form-label">Valor</label>
                <input required placeholder="Ej. S/ 450/mes" className="form-input" value={formData.val} onChange={e => setFormData({...formData, val: e.target.value})} />
              </div>
              
              <div className="modal-field form-group" style={{ opacity: 0 }}>
                <label className="form-label">Canal de Adquisición</label>
                <select className="form-input" value={formData.ch} onChange={e => setFormData({...formData, ch: e.target.value})}>
                  <option value="WhatsApp">WhatsApp</option>
                  <option value="Landing">Landing Page</option>
                  <option value="Referido">Referido</option>
                </select>
              </div>

              <div className="modal-field modal-actions" style={{ opacity: 0 }}>
                <button type="button" className="btn-modal btn-cancel" onClick={() => setIsModalOpen(false)}>Cancelar</button>
                <button type="submit" className="btn-modal btn-save">Guardar Prospecto</button>
              </div>
              
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
