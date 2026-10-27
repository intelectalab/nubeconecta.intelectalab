/**
 * Asistente del portal: botón flotante abajo a la derecha que abre un panel de chat
 * (pantalla completa en móvil). Las respuestas son las mismas reglas locales de antes;
 * aquí solo se cuida la experiencia: burbujas, «escribiendo…», sugerencias, teclado y foco.
 */
import { useEffect, useId, useRef, useState } from 'react';
import type { FC, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Icon } from '@hub/ui';

interface Msg {
  from: 'bot' | 'user';
  text: string;
  at: string;
}

const now = () => new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });

/** Sugerencias rápidas: lo que el portal ya permite hacer. */
const SUGGESTIONS: { label: string; icon: string; text: string }[] = [
  { label: 'Ver mis servicios', icon: 'server', text: '¿Cómo veo mis servicios y entro a cPanel?' },
  { label: 'Facturas y pagos', icon: 'receipt', text: '¿Qué facturas tengo pendientes de pago?' },
  { label: 'Subir voucher', icon: 'card', text: 'Quiero pagar por transferencia y subir mi voucher.' },
  { label: 'Abrir ticket de soporte', icon: 'msg', text: 'Necesito abrir un ticket de soporte.' },
];

/** Reglas de respuesta (sin cambios respecto a la versión anterior). */
function replyFor(userMsg: string): string {
  let reply = 'Gracias por tu consulta. Si necesitas asistencia técnica directa, también puedes abrir un ticket de soporte.';
  if (userMsg.toLowerCase().includes('pagar') || userMsg.toLowerCase().includes('factura')) {
    reply = 'Tienes 1 factura vencida (E001-4498) por US$ 48.00 y 3 pendientes. Puedes pagarlas con tarjeta o transferencia en la sección "Facturas y pagos".';
  } else if (userMsg.toLowerCase().includes('cpanel') || userMsg.toLowerCase().includes('correo')) {
    reply = 'Para acceder a cPanel, ve a "Mis servicios" > "Sitio web principal" y pulsa el botón "Ingresar a cPanel" para iniciar sesión de forma automática sin contraseña.';
  } else if (userMsg.toLowerCase().includes('respaldo') || userMsg.toLowerCase().includes('backup')) {
    reply = 'Tus respaldos automáticos se realizan todas las madrugadas. Puedes solicitar la restauración de cualquier archivo o base de datos de los últimos 30 días en la sección "Respaldos".';
  }
  return reply;
}

function ChatIcon() {
  return (
    <svg className="i" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.3 9.3 0 0 1-3.6-.7L3 21l1.6-4.6A8 8 0 0 1 3 11.5 8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5z" />
      <path d="M8 11.5h.01M12 11.5h.01M16 11.5h.01" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className="i" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg className="i" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4z" />
    </svg>
  );
}

export interface AssistantChatProps {
  /** Nombre de pila para el saludo. */
  userName?: string;
  /** Lleva al centro de soporte para hablar con una persona. */
  onOpenTicket?: () => void;
}

export const AssistantChat: FC<AssistantChatProps> = ({ userName, onOpenTicket }) => {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>(() => [
    { from: 'bot', text: `¡Hola${userName ? `, ${userName}` : ''}! Soy el asistente de AlojamientoPlus. ¿En qué puedo ayudarte hoy?`, at: now() },
  ]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);
  const titleId = useId();
  const panelId = useId();

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  /* Al abrir, foco en el campo de texto. */
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  /* Autoscroll al último mensaje. */
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, typing, open]);

  /* Textarea que crece con el contenido (hasta 4 líneas aprox.). */
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 112)}px`;
  }, [input]);

  const close = () => {
    setOpen(false);
    launcherRef.current?.focus();
  };

  /* Escape también cierra si el foco quedó en el documento (p. ej. tras un clic fuera de un control). */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const a = document.activeElement;
      if (!a || a === document.body || a === launcherRef.current) {
        setOpen(false);
        launcherRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const send = (txt: string) => {
    const userMsg = txt.trim();
    if (!userMsg || typing) return;
    setMsgs((prev) => [...prev, { from: 'user', text: userMsg, at: now() }]);
    setInput('');
    setTyping(true);
    /* Las sugerencias desaparecen al enviar: el foco pasa al campo de texto y no se pierde. */
    inputRef.current?.focus();
    timers.current.push(
      window.setTimeout(() => {
        setMsgs((prev) => [...prev, { from: 'bot', text: replyFor(userMsg), at: now() }]);
        setTyping(false);
      }, 600),
    );
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send(input);
    }
  };

  const empty = !msgs.some((m) => m.from === 'user');

  return (
    <>
      <button
        ref={launcherRef}
        type="button"
        className={`chat-launcher${open ? ' is-open' : ''}`}
        onClick={() => (open ? close() : setOpen(true))}
        aria-label={open ? 'Cerrar asistente' : 'Abrir asistente AlojamientoPlus'}
        aria-expanded={open}
        aria-controls={panelId}
        title="Asistente AlojamientoPlus"
      >
        {open ? <CloseIcon /> : <ChatIcon />}
      </button>

      <section
        id={panelId}
        className={`chat${open ? ' open' : ''}`}
        role="dialog"
        aria-modal="false"
        aria-label="Asistente AlojamientoPlus"
        hidden={!open}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            close();
          }
        }}
      >
        <header className="chat-h">
          <span className="ico" aria-hidden="true">
            <ChatIcon />
          </span>
          <div className="ttl">
            <b id={titleId}>Asistente AlojamientoPlus</b>
            <small>
              <i className="online" aria-hidden="true" /> {typing ? 'Escribiendo…' : 'En línea · responde al instante'}
            </small>
          </div>
          <button type="button" className="x" onClick={close} aria-label="Cerrar asistente">
            <CloseIcon />
          </button>
        </header>

        <div ref={listRef} className="chat-b" role="log" aria-live="polite" aria-relevant="additions" aria-label="Mensajes del asistente">
          {msgs.map((m, idx) => (
            <div key={idx} className={`cmsg ${m.from === 'bot' ? 'bot' : 'me'}`}>
              {m.from === 'bot' ? (
                <span className="av" aria-hidden="true">
                  <ChatIcon />
                </span>
              ) : null}
              <div className="cmsg-c">
                <span className="sr-only">{m.from === 'bot' ? 'Asistente dice:' : 'Tú:'}</span>
                <div className={`bub ${m.from === 'bot' ? 'bot' : 'me'}`}>{m.text}</div>
                <time className="at">{m.at}</time>
              </div>
            </div>
          ))}
          {typing ? (
            <div className="cmsg bot" aria-label="El asistente está escribiendo">
              <span className="av" aria-hidden="true">
                <ChatIcon />
              </span>
              <div className="bub bot typing">
                <span className="dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="sr-only">Escribiendo…</span>
              </div>
            </div>
          ) : null}
          {empty && !typing ? (
            <div className="sugs" role="group" aria-label="Sugerencias">
              <span className="sugs-t">Puedo ayudarte con:</span>
              {SUGGESTIONS.map((s) => (
                <button key={s.label} type="button" onClick={() => send(s.text)}>
                  <Icon name={s.icon} className="sm" />
                  {s.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {onOpenTicket ? (
          <div className="chat-human">
            <button
              type="button"
              onClick={() => {
                close();
                onOpenTicket();
              }}
            >
              <Icon name="user" className="sm" /> ¿Prefieres a una persona? Abre un ticket
            </button>
          </div>
        ) : null}

        <form
          className="chat-f"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <label className="sr-only" htmlFor={`${panelId}-in`}>
            Escribe tu consulta
          </label>
          <textarea
            id={`${panelId}-in`}
            ref={inputRef}
            rows={1}
            placeholder="Escribe tu consulta…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            aria-describedby={`${panelId}-hint`}
          />
          <button type="submit" className="send" disabled={!input.trim() || typing} aria-label="Enviar mensaje">
            <SendIcon />
          </button>
        </form>
        <p className="chat-hint" id={`${panelId}-hint`}>
          Enter para enviar · Shift+Enter para nueva línea
        </p>
      </section>
    </>
  );
};
