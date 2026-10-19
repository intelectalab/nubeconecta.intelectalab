import { useState } from 'react';
import { LayoutDashboard, Server, Filter, Box, Wallet, Clock, CheckCircle2, MessageSquare } from 'lucide-react';
import './admin.css';
import DashboardView from './views/DashboardView';
import NOCView from './views/NOCView';
import CRMView from './views/CRMView';
import SLAView from './views/SLAView';
import CobranzaView from './views/CobranzaView';
import CatalogView from './views/CatalogView';
import HelpDeskView from './views/HelpDeskView';

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'noc' | 'crm' | 'cobranza' | 'sla' | 'catalog' | 'helpdesk'>('dashboard');

  const getNavClass = (tab: string) => `nav-item ${activeTab === tab ? 'active' : ''}`;

  return (
    <div className="app" id="app">
      <header className="topbar" role="banner">
        <a className="logo" href="#dashboard">
          <svg viewBox="0 0 48 36" aria-hidden="true" style={{ width: 42, height: 32, flex: 'none' }}>
            <path d="M37.5 31H12.5a9 9 0 0 1-1.6-17.86A12 12 0 0 1 34 10.4a8.6 8.6 0 0 1 3.5 20.6z" fill="none" stroke="#4d82ff" strokeWidth="3.2" strokeLinejoin="round" />
            <path d="M25.6 9.5 17.8 21h6l-2.2 9.5L31 17.6h-6.2l2.6-8.1z" fill="#f2b71a" stroke="#f2b71a" strokeWidth="1" strokeLinejoin="round" />
          </svg>
          <b>Alojamiento<span>Plus</span></b>
          <em>Panel Administrativo</em>
        </a>
        <div className="tb-spacer" style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="chip ok"><CheckCircle2 size={14} /> Infraestructura Operativa</span>
          <span className="tb-user" style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>admin@alojamientoplus.pe</span>
        </div>
      </header>

      <nav className="sidebar" aria-label="Navegación backoffice">
        <button onClick={() => setActiveTab('dashboard')} className={getNavClass('dashboard')}>
          <LayoutDashboard size={18} /><span>Dashboard de KPIs</span>
        </button>
        <button onClick={() => setActiveTab('noc')} className={getNavClass('noc')}>
          <Server size={18} /><span>Servidores e Infraestructura</span>
        </button>
        <button onClick={() => setActiveTab('crm')} className={getNavClass('crm')}>
          <Filter size={18} /><span>Embudo Comercial (CRM)</span>
        </button>
        <button onClick={() => setActiveTab('catalog')} className={getNavClass('catalog')}>
          <Box size={18} /><span>Catálogo</span>
        </button>
        <button onClick={() => setActiveTab('helpdesk')} className={getNavClass('helpdesk')}>
          <MessageSquare size={18} /><span>Soporte Técnico (Tickets)</span>
        </button>
        <button onClick={() => setActiveTab('cobranza')} className={getNavClass('cobranza')}>
          <Wallet size={18} /><span>Secuencia de Cobranzas</span>
        </button>
        <button onClick={() => setActiveTab('sla')} className={getNavClass('sla')}>
          <Clock size={18} /><span>Matriz de SLA y Soporte</span>
        </button>
      </nav>

      <main className="main" id="main">
        {/* AQUÍ ESTÁ EL TRUCO: display flex, flexDirection column, height 100% y overflow hidden */}
        <div className="page" style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto', width: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
          
          <div className="phead" style={{ marginBottom: 24, flexShrink: 0 }}>
            <div>
              <h1 style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>
                {activeTab === 'dashboard' && 'Resumen General'}
                {activeTab === 'noc' && 'Infraestructura y Nodos de Servidores'}
                {activeTab === 'crm' && 'Embudo de Oportunidades y Leads'}
                {activeTab === 'catalog' && 'Catálogo de Productos y Servicios'}
                {activeTab === 'helpdesk' && 'Bandeja de Soporte Técnico'}
                {activeTab === 'cobranza' && 'Automatización de Avisos de Cobranza'}
                {activeTab === 'sla' && 'Políticas de SLA y Escalamiento'}
              </h1>
              <p style={{ color: '#64748b', fontSize: 15 }}>
                {activeTab === 'dashboard' && 'Vista rápida del estado financiero y operativo de la empresa.'}
                {activeTab === 'noc' && 'Monitoreo de recursos, nodos cPanel y migración en lotes.'}
                {activeTab === 'crm' && 'Seguimiento de prospectos clasificados por canal de adquisición.'}
                {activeTab === 'catalog' && 'Administración de planes, precios bimoneda y disponibilidad.'}
                {activeTab === 'helpdesk' && 'Gestión de tickets, incidencias y comunicación con clientes.'}
                {activeTab === 'cobranza' && 'Secuencia administrable de suspensiones y recargos automáticos.'}
                {activeTab === 'sla' && 'Tiempos de primera respuesta y resolución por severidad.'}
              </p>
            </div>
          </div>

          {/* El div que envuelve las vistas ahora tiene flex: 1 y minHeight: 0 para que se adapte al hueco */}
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            {activeTab === 'dashboard' && <DashboardView />}
            {activeTab === 'noc' && <NOCView />}
            {activeTab === 'crm' && <CRMView />}
            {activeTab === 'catalog' && <CatalogView />}
            {activeTab === 'helpdesk' && <HelpDeskView />}
            {activeTab === 'sla' && <SLAView />}
            {activeTab === 'cobranza' && <CobranzaView />}
          </div>
        </div>
      </main>
    </div>
  );
}
