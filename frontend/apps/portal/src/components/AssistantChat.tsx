import { useState } from 'react';
import type { FC } from 'react';
import { Icon } from '@hub/ui';

export const AssistantChat: FC = () => {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Array<{ from: 'bot' | 'user'; text: string }>>([
    { from: 'bot', text: '¡Hola, Lucía! Soy el asistente de AlojamientoPlus. ¿En qué puedo ayudarte hoy?' },
  ]);
  const [input, setInput] = useState('');

  const send = (txt: string) => {
    if (!txt.trim()) return;
    const userMsg = txt;
    setMsgs((prev) => [...prev, { from: 'user', text: userMsg }]);
    setInput('');

    setTimeout(() => {
      let reply = 'Gracias por tu consulta. Si necesitas asistencia técnica directa, también puedes abrir un ticket de soporte.';
      if (userMsg.toLowerCase().includes('pagar') || userMsg.toLowerCase().includes('factura')) {
        reply = 'Tienes 1 factura vencida (E001-4498) por US$ 48.00 y 3 pendientes. Puedes pagarlas con tarjeta o transferencia en la sección "Facturas y pagos".';
      } else if (userMsg.toLowerCase().includes('cpanel') || userMsg.toLowerCase().includes('correo')) {
        reply = 'Para acceder a cPanel, ve a "Mis servicios" > "Sitio web principal" y pulsa el botón "Ingresar a cPanel" para iniciar sesión de forma automática sin contraseña.';
      } else if (userMsg.toLowerCase().includes('respaldo') || userMsg.toLowerCase().includes('backup')) {
        reply = 'Tus respaldos automáticos se realizan todas las madrugadas. Puedes solicitar la restauración de cualquier archivo o base de datos de los últimos 30 días en la sección "Respaldos".';
      }
      setMsgs((prev) => [...prev, { from: 'bot', text: reply }]);
    }, 600);
  };

  return (
    <>
      <button
        className="fab"
        onClick={() => setOpen(!open)}
        aria-label="Abrir asistente"
        style={{
          position: 'fixed',
          right: '24px',
          bottom: '24px',
          zIndex: 90,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          height: '48px',
          padding: '0 18px',
          borderRadius: '999px',
          background: 'var(--brand)',
          color: '#fff',
          border: 'none',
          boxShadow: 'var(--shadow-pop)',
          cursor: 'pointer',
          fontWeight: 700,
          fontSize: '13.5px',
        }}
      >
        <Icon name="msg" />
        <span>Asistente AlojamientoPlus</span>
      </button>

      {open && (
        <section
          className="chat open"
          style={{
            position: 'fixed',
            right: '24px',
            bottom: '84px',
            zIndex: 95,
            width: '360px',
            height: '480px',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '14px',
            boxShadow: 'var(--shadow-pop)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '12px 16px',
              background: 'var(--topbar)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <b style={{ display: 'block', fontSize: '14px' }}>Asistente IA</b>
              <small style={{ color: 'var(--topbar-muted)', fontSize: '11.5px' }}>Disponible 24/7 para consultas rápidas</small>
            </div>
            <button
              onClick={() => setOpen(false)}
              style={{ background: 'transparent', border: 0, color: '#fff', cursor: 'pointer' }}
            >
              ✕
            </button>
          </div>

          <div style={{ flex: 1, padding: '14px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {msgs.map((m, idx) => (
              <div
                key={idx}
                style={{
                  maxWidth: '85%',
                  padding: '9px 12px',
                  borderRadius: '12px',
                  fontSize: '13px',
                  alignSelf: m.from === 'bot' ? 'flex-start' : 'flex-end',
                  background: m.from === 'bot' ? 'var(--surface-2)' : 'var(--brand)',
                  color: m.from === 'bot' ? 'var(--text)' : '#fff',
                  border: m.from === 'bot' ? '1px solid var(--border)' : 'none',
                }}
              >
                {m.text}
              </div>
            ))}
          </div>

          <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)', display: 'flex', gap: '6px' }}>
            <button
              onClick={() => send('¿Cómo pago mis facturas?')}
              style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '12px', border: '1px solid var(--brand-line)', background: 'var(--brand-soft)', color: 'var(--brand-text)', cursor: 'pointer' }}
            >
              Pagar facturas
            </button>
            <button
              onClick={() => send('¿Cómo entro a cPanel?')}
              style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '12px', border: '1px solid var(--brand-line)', background: 'var(--brand-soft)', color: 'var(--brand-text)', cursor: 'pointer' }}
            >
              Entrar a cPanel
            </button>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            style={{ display: 'flex', padding: '10px 12px', borderTop: '1px solid var(--border)', gap: '8px' }}
          >
            <input
              type="text"
              placeholder="Escribe tu consulta..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              style={{ flex: 1, height: '34px', padding: '0 10px', borderRadius: '6px', border: '1px solid var(--border-strong)', fontSize: '13px' }}
            />
            <button type="submit" style={{ padding: '0 14px', background: 'var(--brand)', color: '#fff', border: 0, borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>
              Enviar
            </button>
          </form>
        </section>
      )}
    </>
  );
};
