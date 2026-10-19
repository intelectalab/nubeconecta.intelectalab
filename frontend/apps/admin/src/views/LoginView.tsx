import { useState } from 'react';
import { Mail, Lock, Eye, EyeOff, ShieldCheck, Loader2 } from 'lucide-react';

interface LoginViewProps {
  onLogin: (role: string) => void;
}

export default function LoginView({ onLogin }: LoginViewProps) {
  const [email, setEmail] = useState('admin@alojamientoplus.pe');
  const [password, setPassword] = useState('admin123');
  const [role, setRole] = useState('admin');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setTimeout(() => {
      onLogin(role);
    }, 1500);
  };

  return (
    <div className="login-container">
      <div className="login-card">
        
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginBottom: 32 }}>
          <svg viewBox="0 0 48 36" style={{ width: 48, height: 36 }}>
            <path d="M37.5 31H12.5a9 9 0 0 1-1.6-17.86A12 12 0 0 1 34 10.4a8.6 8.6 0 0 1 3.5 20.6z" fill="none" stroke="#2563eb" strokeWidth="3.2" strokeLinejoin="round" />
            <path d="M25.6 9.5 17.8 21h6l-2.2 9.5L31 17.6h-6.2l2.6-8.1z" fill="#f2b71a" stroke="#f2b71a" strokeWidth="1" strokeLinejoin="round" />
          </svg>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', margin: 0 }}>
            Alojamiento<span style={{ color: '#2563eb' }}>Plus</span>
          </h1>
        </div>

        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1e293b', textAlign: 'center', marginBottom: 8 }}>Bienvenido de nuevo</h2>
        <p style={{ fontSize: 14, color: '#64748b', textAlign: 'center', marginBottom: 32 }}>Ingresa tus credenciales para acceder.</p>

        <form onSubmit={handleSubmit}>
          <div className="login-input-group">
            <Mail className="login-input-icon" size={20} />
            <input type="email" placeholder="Correo corporativo" className="login-input" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>

          <div className="login-input-group">
            <Lock className="login-input-icon" size={20} />
            <input type={showPassword ? 'text' : 'password'} placeholder="Contraseña" className="login-input" value={password} onChange={e => setPassword(e.target.value)} required />
            <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>

          <div className="login-input-group">
            <ShieldCheck className="login-input-icon" size={20} />
            <select className="login-input" value={role} onChange={e => setRole(e.target.value)} style={{ cursor: 'pointer', appearance: 'none' }}>
              <option value="admin">Administrador General</option>
              <option value="sales">Ventas (CRM)</option>
              <option value="finance">Finanzas (Cobranzas)</option>
              <option value="support">Soporte Técnico (NOC)</option>
            </select>
          </div>

          <button type="submit" className="login-btn" disabled={isLoading}>
            {isLoading ? (
              <><Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} /> Validando...</>
            ) : ('Iniciar Sesión')}
          </button>
        </form>
      </div>
    </div>
  );
}
