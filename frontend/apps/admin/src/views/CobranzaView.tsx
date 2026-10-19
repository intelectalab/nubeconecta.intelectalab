import { useEffect, useRef } from 'react';
import { animate, createTimeline, stagger } from 'animejs';
import { Mail, Bell, Calendar, AlertTriangle, Ban } from 'lucide-react';

export default function CobranzaView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const stepsRef = useRef<(HTMLDivElement | null)[]>([]);

  const steps = [
    { day: '-5 días', title: 'Aviso Preventivo', desc: 'Correo recordatorio', icon: Mail, color: '#3b82f6' },
    { day: '-1 día', title: 'Vencimiento', desc: 'Aviso por WhatsApp', icon: Bell, color: '#f59e0b' },
    { day: 'Día 0', title: 'Fecha de Pago', desc: 'Se espera confirmación', icon: Calendar, color: '#10b981' },
    { day: '+3 días', title: 'Recargo', desc: 'Mora del 5% aplicada', icon: AlertTriangle, color: '#ef4444' },
    { day: '+5 días', title: 'Suspensión', desc: 'Servicio bloqueado', icon: Ban, color: '#991b1b' },
  ];

  useEffect(() => {
    const tl = createTimeline({ defaults: { ease: 'outExpo' } });

    // 1. La línea conectora crece de izquierda a derecha
    tl.add(lineRef.current, {
      scaleX: [0, 1],
      transformOrigin: ['0 50%', '0 50%'],
      duration: 1000
    });

    // 2. Los iconos y textos aparecen en cascada
    tl.add(stepsRef.current.filter(Boolean), {
      opacity: [0, 1],
      translateY: [20, 0],
      delay: stagger(150),
      duration: 800
    }, '-=600'); // Empieza un poco antes de que termine la línea
  }, []);

  return (
    <div className="card" style={{ padding: 32 }} ref={containerRef}>
      <div style={{ marginBottom: 32 }}>
        <h2 className="sec" style={{ marginBottom: 8, fontSize: 20 }}>Secuencia de Recordatorios y Cortes</h2>
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>Flujo automático del motor de facturación bimoneda.</p>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative', padding: '0 20px' }}>
        {/* Línea de fondo estática */}
        <div style={{ position: 'absolute', top: 24, left: 60, right: 60, height: 2, background: 'var(--border)', zIndex: 0 }} />
        
        {/* Línea animada de color */}
        <div ref={lineRef} style={{ position: 'absolute', top: 24, left: 60, right: 60, height: 2, background: 'var(--brand-text)', zIndex: 0, opacity: 0.5 }} />

        {steps.map((step, i) => {
          const IconComponent = step.icon;
          return (
            <div 
              key={i} 
              ref={el => { stepsRef.current[i] = el; }} 
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 160, zIndex: 1, textAlign: 'center' }}
            >
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'white', border: `2px solid ${step.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                <IconComponent size={22} color={step.color} strokeWidth={2.5} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: step.color, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{step.day}</span>
              <b style={{ fontSize: 14, marginBottom: 6, color: 'var(--text)' }}>{step.title}</b>
              <span style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.4 }}>{step.desc}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
