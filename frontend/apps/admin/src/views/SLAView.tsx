import { useEffect, useRef } from 'react';
import { animate, stagger } from 'animejs';
import { AlertOctagon, AlertTriangle, Info, CheckCircle2 } from 'lucide-react';

export default function SLAView() {
  const tbodyRef = useRef<HTMLTableSectionElement>(null);
  const badgesRef = useRef<(HTMLSpanElement | SVGElement | null)[]>([]);

  const slas = [
    { pri: 'Crítica', fr: '15 min', res: '2 horas', h: '24/7', esc: 'NOC L3 Guardia', open: 0, icon: AlertOctagon, color: '#ef4444', bg: '#fef2f2' },
    { pri: 'Alta', fr: '30 min', res: '6 horas', h: '24/7', esc: 'NOC L2 Especialista', open: 1, icon: AlertTriangle, color: '#f59e0b', bg: '#fffbeb' },
    { pri: 'Media', fr: '60 min', res: '24 horas', h: 'Hábil (L-V 9-18)', esc: 'Soporte General', open: 3, icon: ClockIcon, color: '#3b82f6', bg: '#eff6ff' },
    { pri: 'Baja', fr: '120 min', res: '48 horas', h: 'Hábil (L-V 9-18)', esc: 'Soporte General', open: 0, icon: Info, color: '#10b981', bg: '#ecfdf5' },
  ];

  function ClockIcon({ size, color }: { size: number, color: string }) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    );
  }

  useEffect(() => {
    // Animación de filas de la tabla
    if (tbodyRef.current) {
      animate(tbodyRef.current.children, {
        opacity: [0, 1], translateX: [-20, 0], delay: stagger(100), duration: 600, ease: 'outQuad'
      });
    }
    // Animación de los contadores rojos
    animate(badgesRef.current.filter(Boolean), {
      scale: [0, 1], delay: stagger(150, { start: 400 }), duration: 500, ease: 'easeOutElastic(1, .5)'
    });
  }, []);

  return (
    <div className="card" style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        
        {/* RELOJ ANIMADO CON CSS NATIVO - DISEÑO PREMIUM */}
        <div style={{ width: 40, height: 40, position: 'relative' }}>
          <svg viewBox="0 0 100 100" width="100%" height="100%">
            {/* Círculo base y marcas */}
            <circle cx="50" cy="50" r="45" fill="#eff6ff" stroke="var(--brand-text)" strokeWidth="4" />
            <path d="M50 10 L50 18 M90 50 L82 50 M50 90 L50 82 M10 50 L18 50" stroke="var(--brand-text)" strokeWidth="4" strokeLinecap="round" />
            
            {/* Manecilla Hora (Negra, corta y gruesa) */}
            <line x1="50" y1="50" x2="50" y2="30" stroke="#0f172a" strokeWidth="7" strokeLinecap="round" 
                  style={{ transformOrigin: '50px 50px', animation: 'spinHour 120s linear infinite' }} />
            
            {/* Manecilla Minuto (Negra, más larga) */}
            <line x1="50" y1="50" x2="50" y2="20" stroke="#0f172a" strokeWidth="4" strokeLinecap="round" 
                  style={{ transformOrigin: '50px 50px', animation: 'spinMinute 10s linear infinite' }} />
            
            {/* Manecilla Segundo (Roja, la más larga) */}
            <line x1="50" y1="60" x2="50" y2="15" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" 
                  style={{ transformOrigin: '50px 50px', animation: 'spinSecond 2s linear infinite' }} />
            
            {/* Pin central */}
            <circle cx="50" cy="50" r="5" fill="#ef4444" />
            <circle cx="50" cy="50" r="2" fill="white" />
          </svg>

          {/* CSS para las animaciones del reloj */}
          <style>{`
            @keyframes spinHour { 100% { transform: rotate(360deg); } }
            @keyframes spinMinute { 100% { transform: rotate(360deg); } }
            @keyframes spinSecond { 100% { transform: rotate(360deg); } }
          `}</style>
        </div>
        
        <h2 className="sec" style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Matriz de Cumplimiento de SLA</h2>
      </div>
      
      <div className="tw" style={{ overflowX: 'auto' }}>
        <table className="t" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--muted)', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              <th style={{ padding: '16px', fontWeight: 600 }}>Prioridad</th>
              <th style={{ padding: '16px', fontWeight: 600 }}>1ra Respuesta</th>
              <th style={{ padding: '16px', fontWeight: 600 }}>Resolución Máxima</th>
              <th style={{ padding: '16px', fontWeight: 600 }}>Horario</th>
              <th style={{ padding: '16px', fontWeight: 600 }}>Escalamiento</th>
              <th style={{ padding: '16px', fontWeight: 600, textAlign: 'center' }}>Tickets Abiertos</th>
            </tr>
          </thead>
          <tbody ref={tbodyRef}>
            {slas.map((s, i) => {
              const IconComponent = s.icon;
              return (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.2s' }}>
                  <td style={{ padding: '16px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 20, fontSize: 13, fontWeight: 600, color: s.color, background: s.bg, border: `1px solid ${s.color}30` }}>
                      <IconComponent size={16} color={s.color} />
                      {s.pri}
                    </span>
                  </td>
                  <td style={{ padding: '16px', fontSize: 14, fontWeight: 500 }}>{s.fr}</td>
                  <td style={{ padding: '16px', fontSize: 14, fontWeight: 500 }}>{s.res}</td>
                  <td style={{ padding: '16px', fontSize: 14, color: '#475569' }}>
                    <span style={{ padding: '4px 8px', background: s.h === '24/7' ? '#f1f5f9' : 'transparent', borderRadius: 6, fontWeight: s.h === '24/7' ? 600 : 400 }}>{s.h}</span>
                  </td>
                  <td style={{ padding: '16px', fontSize: 14, color: 'var(--muted)' }}>{s.esc}</td>
                  <td style={{ padding: '16px', textAlign: 'center' }}>
                    {s.open > 0 ? (
                      <span 
                        ref={el => { badgesRef.current[i] = el; }} 
                        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 28, height: 28, borderRadius: '50%', background: '#fef2f2', color: '#ef4444', fontWeight: 700, fontSize: 14, border: '1px solid #fecaca' }}
                      >
                        {s.open}
                      </span>
                    ) : (
                      <CheckCircle2 size={20} color="#10b981" style={{ display: 'inline-block' }} />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
