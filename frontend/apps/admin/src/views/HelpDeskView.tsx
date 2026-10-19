import { useState, useEffect, useRef } from 'react';
import { animate, stagger } from 'animejs';
import { MessageSquare, Clock, CheckCircle2, Send, Paperclip, Smile } from 'lucide-react';

const initialTickets = [
  { id: 'TKT-1024', subject: 'Error 500 en cPanel', client: 'Estudio Jurídico Lima', initials: 'EJ', priority: 'Alta', status: 'Abierto', time: 'Hace 10 min', unread: true },
  { id: 'TKT-1025', subject: 'Renovación de dominio .pe', client: 'Constructora Alfa', initials: 'CA', priority: 'Media', status: 'En proceso', time: 'Hace 1 hora', unread: false },
  { id: 'TKT-1026', subject: 'Servidor VPS no responde', client: 'Clínica San José', initials: 'CJ', priority: 'Crítica', status: 'Abierto', time: 'Hace 5 min', unread: true },
  { id: 'TKT-1027', subject: 'Consulta sobre facturación', client: 'Inversiones del Sur', initials: 'IS', priority: 'Baja', status: 'Cerrado', time: 'Ayer', unread: false },
];

const getPriorityStyle = (priority: string) => {
  switch (priority) {
    case 'Crítica': return { bg: '#fef2f2', color: '#ef4444', border: '#fecaca' };
    case 'Alta': return { bg: '#fffbeb', color: '#f59e0b', border: '#fde68a' };
    case 'Media': return { bg: '#eff6ff', color: '#3b82f6', border: '#bfdbfe' };
    default: return { bg: '#f1f5f9', color: '#64748b', border: '#cbd5e1' };
  }
};

export default function HelpDeskView() {
  const [selectedTicket, setSelectedTicket] = useState(initialTickets[2]);
  const ticketsRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ticketsRef.current) {
      animate(ticketsRef.current.children, {
        opacity: [0, 1], translateX: [-20, 0], delay: stagger(80), duration: 500, ease: 'outQuad'
      });
    }
  }, []);

  useEffect(() => {
    if (chatRef.current) {
      animate(chatRef.current.children, {
        opacity: [0, 1], translateY: [20, 0], delay: stagger(100), duration: 600, ease: 'easeOutElastic(1, .8)'
      });
    }
  }, [selectedTicket]);

  return (
    // 100% de altura del contenedor padre, sin calc()
    <div style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: 20, height: '100%', flex: 1, minHeight: 0 }}>
      
      {/* LISTA DE TICKETS (Izquierda) */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0, height: '100%' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
            <MessageSquare size={18} color="var(--brand-text)" /> Bandeja de Entrada
          </h2>
          <span style={{ background: '#ef4444', color: 'white', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>2</span>
        </div>

        <div ref={ticketsRef} style={{ flex: 1, overflowY: 'auto' }}>
          {initialTickets.map((ticket) => (
            <div 
              key={ticket.id} 
              onClick={() => setSelectedTicket(ticket)}
              style={{ 
                padding: '16px 20px', 
                borderBottom: '1px solid #f1f5f9', 
                cursor: 'pointer',
                background: selectedTicket.id === ticket.id ? '#f8fafc' : 'white',
                borderLeft: selectedTicket.id === ticket.id ? '4px solid var(--brand-text)' : '4px solid transparent',
                transition: 'all 0.2s'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>{ticket.id}</span>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>{ticket.time}</span>
              </div>
              <h4 style={{ margin: '0 0 12px 0', fontSize: 14, fontWeight: ticket.unread ? 700 : 500, color: '#0f172a' }}>
                {ticket.subject}
              </h4>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                   <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#475569' }}>{ticket.initials}</div>
                   <span style={{ fontSize: 12, color: '#475569' }}>{ticket.client}</span>
                </div>
                <span style={{ 
                  fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 12,
                  background: getPriorityStyle(ticket.priority).bg, color: getPriorityStyle(ticket.priority).color, border: `1px solid ${getPriorityStyle(ticket.priority).border}`
                }}>
                  {ticket.priority}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* PANEL DE CONVERSACIÓN (Derecha) */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden', height: '100%' }}>
        
        {/* Header del Ticket */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #e2e8f0', background: 'white', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#2563eb' }}>
                {selectedTicket.initials}
              </div>
              <div>
                <h2 style={{ margin: '0 0 4px 0', fontSize: 18, fontWeight: 700, color: '#0f172a' }}>{selectedTicket.subject}</h2>
                <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>
                  Ticket <b>{selectedTicket.id}</b> • {selectedTicket.client}
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" style={{ padding: '8px 12px', border: '1px solid #cbd5e1', background: 'white', borderRadius: 8, fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: '#475569' }}>
                <Clock size={14} /> Pausar SLA
              </button>
              <button className="btn primary" style={{ padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <CheckCircle2 size={14} /> Resolver
              </button>
            </div>
          </div>
        </div>

        {/* Chat (Scroll interno) */}
        <div ref={chatRef} style={{ flex: 1, background: '#f8fafc', padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', gap: 12, maxWidth: '75%' }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 12, fontWeight: 700, color: '#475569' }}>
              {selectedTicket.initials}
            </div>
            <div>
              <div style={{ background: 'white', padding: '12px 16px', borderRadius: '4px 16px 16px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', fontSize: 14, color: '#334155', lineHeight: 1.5 }}>
                Hola, buenas tardes. Desde hace unos minutos nuestro servidor VPS no responde a ping y la web está caída. Es urgente, por favor su ayuda.
              </div>
              <span style={{ fontSize: 11, color: '#94a3b8', marginTop: 6, display: 'block' }}>Hace 5 min</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, maxWidth: '75%', alignSelf: 'flex-end', flexDirection: 'row-reverse' }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--brand-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'white', fontWeight: 700, fontSize: 12 }}>
              A
            </div>
            <div>
              <div style={{ background: 'var(--brand-text)', padding: '12px 16px', borderRadius: '16px 4px 16px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', fontSize: 14, color: 'white', lineHeight: 1.5 }}>
                Hola, buen día. Estamos revisando el nodo en este momento. Parece ser un problema de red en el datacenter. Ya escalamos el caso con el proveedor (Contabo) y te mantendremos informado.
              </div>
              <span style={{ fontSize: 11, color: '#94a3b8', marginTop: 6, display: 'block', textAlign: 'right' }}>Hace 2 min</span>
            </div>
          </div>
          <div style={{ flex: 1 }}></div>
        </div>

        {/* Input (Fijo abajo) */}
        <div style={{ padding: '16px 24px', background: 'white', borderTop: '1px solid #e2e8f0', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', background: '#f8fafc', borderRadius: 24, padding: '6px 12px', border: '1px solid #e2e8f0', transition: 'border-color 0.2s' }} onFocus={(e) => e.currentTarget.style.borderColor = 'var(--brand-text)'} onBlur={(e) => e.currentTarget.style.borderColor = '#e2e8f0'}>
            <button style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4 }}><Paperclip size={20} /></button>
            <input 
              type="text" 
              placeholder="Escribe una respuesta..." 
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 14, color: '#0f172a' }} 
            />
            <button style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4 }}><Smile size={20} /></button>
            <button className="btn primary" style={{ padding: '8px 16px', borderRadius: 20, display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 13 }}>
              <Send size={16} /> Enviar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
