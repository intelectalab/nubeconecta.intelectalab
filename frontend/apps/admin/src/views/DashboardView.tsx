import { useEffect, useRef } from 'react';
import { animate, stagger } from 'animejs';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { DollarSign, Users, Ticket, Server, ArrowUpRight, ArrowDownRight } from 'lucide-react';

const revenueData = [
  { name: 'Ene', pen: 4000, usd: 1500 },
  { name: 'Feb', pen: 3000, usd: 2000 },
  { name: 'Mar', pen: 5000, usd: 2500 },
  { name: 'Abr', pen: 4500, usd: 3000 },
  { name: 'May', pen: 6000, usd: 3500 },
  { name: 'Jun', pen: 5500, usd: 4000 },
];

const channelData = [
  { name: 'Hosting', value: 400, color: '#3b82f6' },
  { name: 'VPS', value: 300, color: '#10b981' },
  { name: 'Dominios', value: 200, color: '#f59e0b' },
  { name: 'Cloud', value: 100, color: '#8b5cf6' },
];

export default function DashboardView() {
  const kpiRef = useRef<HTMLDivElement>(null);
  const chartsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Animación de tarjetas KPI
    if (kpiRef.current) {
      animate(kpiRef.current.children, {
        opacity: [0, 1],
        translateY: [30, 0],
        scale: [0.95, 1],
        delay: stagger(100),
        duration: 800,
        ease: 'easeOutElastic(1, .6)'
      });
    }
    // Animación de gráficos
    if (chartsRef.current) {
      animate(chartsRef.current.children, {
        opacity: [0, 1],
        translateY: [30, 0],
        delay: stagger(200, { start: 400 }),
        duration: 800,
        ease: 'outQuad'
      });
    }
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* TARJETAS DE KPIs */}
      <div ref={kpiRef} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
        
        <div className="card" style={{ padding: 24, display: 'flex', alignItems: 'center', gap: 16, opacity: 0 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <DollarSign size={24} color="#3b82f6" />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 13, color: '#64748b', fontWeight: 600 }}>Ingresos del Mes</p>
            <h3 style={{ margin: '4px 0 0', fontSize: 24, fontWeight: 800, color: '#0f172a' }}>S/ 24,500</h3>
            <span style={{ fontSize: 12, color: '#10b981', display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, fontWeight: 600 }}>
              <ArrowUpRight size={14} /> +12.5% vs mes anterior
            </span>
          </div>
        </div>

        <div className="card" style={{ padding: 24, display: 'flex', alignItems: 'center', gap: 16, opacity: 0 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Users size={24} color="#10b981" />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 13, color: '#64748b', fontWeight: 600 }}>Clientes Activos</p>
            <h3 style={{ margin: '4px 0 0', fontSize: 24, fontWeight: 800, color: '#0f172a' }}>412</h3>
            <span style={{ fontSize: 12, color: '#10b981', display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, fontWeight: 600 }}>
              <ArrowUpRight size={14} /> +5 nuevos esta semana
            </span>
          </div>
        </div>

        <div className="card" style={{ padding: 24, display: 'flex', alignItems: 'center', gap: 16, opacity: 0 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Ticket size={24} color="#ef4444" />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 13, color: '#64748b', fontWeight: 600 }}>Tickets Abiertos</p>
            <h3 style={{ margin: '4px 0 0', fontSize: 24, fontWeight: 800, color: '#0f172a' }}>14</h3>
            <span style={{ fontSize: 12, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, fontWeight: 600 }}>
              <ArrowDownRight size={14} /> -2 resueltos hoy
            </span>
          </div>
        </div>

        <div className="card" style={{ padding: 24, display: 'flex', alignItems: 'center', gap: 16, opacity: 0 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: '#fffbeb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Server size={24} color="#f59e0b" />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 13, color: '#64748b', fontWeight: 600 }}>Nodos en Línea</p>
            <h3 style={{ margin: '4px 0 0', fontSize: 24, fontWeight: 800, color: '#0f172a' }}>3 / 3</h3>
            <span style={{ fontSize: 12, color: '#64748b', marginTop: 4, fontWeight: 600 }}>Uptime: 99.99%</span>
          </div>
        </div>
      </div>

      {/* GRÁFICOS */}
      <div ref={chartsRef} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
        
        {/* Gráfico de Barras */}
        <div className="card" style={{ padding: 24, opacity: 0 }}>
          <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700, color: '#0f172a' }}>Ingresos Bimoneda (Soles / Dólares)</h3>
          <div style={{ height: 300, width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} />
                <Bar dataKey="pen" name="Soles (PEN)" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={30} />
                <Bar dataKey="usd" name="Dólares (USD)" fill="#10b981" radius={[4, 4, 0, 0]} barSize={30} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Gráfico Circular */}
        <div className="card" style={{ padding: 24, opacity: 0 }}>
          <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700, color: '#0f172a' }}>Servicios Vendidos</h3>
          <div style={{ height: 300, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <ResponsiveContainer width="100%" height="80%">
              <PieChart>
                <Pie data={channelData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                  {channelData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center', marginTop: 10 }}>
              {channelData.map(item => (
                <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569', fontWeight: 600 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: item.color }} />
                  {item.name}
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
