/**
 * Piezas compartidas de Soporte (Tickets, Libro de Reclamaciones y Plantillas):
 * respuestas predefinidas enriquecidas, plantillas de correo (MAILT l.3164),
 * logo de mini web (mwLogo l.2020), vista previa de correo y carta de respuesta.
 */
import type { CSSProperties } from 'react';
import { MwLogo } from '../../../components/MwLogo';
import { BR, CANNED, CONTACT, EMPRESA, ME, MESL, TODAY, fD, mwVars, type BrandId, type Reclamo, type TicketMsg } from '../../../data';
import { VARS, fillVars, sanitize, txt2html } from './RichText';

/* ---------- Tipos extendidos (campos que el prototipo agrega en memoria) ---------- */
export type MsgX = TicketMsg & { html?: string };
export type ReclX = Reclamo & {
  docT?: string;
  menor?: boolean;
  apod?: string;
  apodDoc?: string;
  bien?: string;
  bienDesc?: string;
  respHtml?: string | null;
  respBy?: string;
  origin?: string;
  at?: Date;
};

/* ---------- Respuestas predefinidas: HTML enriquecido (CANNED c[2] del prototipo) ---------- */
const CANNED_HTML = new WeakMap<[string, string], string>();
export const cannedHtml = (c: [string, string]): string => CANNED_HTML.get(c) ?? txt2html(c[1]);
export const setCannedHtml = (c: [string, string], h: string): void => {
  CANNED_HTML.set(c, h);
};
export { CANNED };

/* ---------- Plantillas de correo y avisos ---------- */
export interface MailTpl {
  id: string;
  n: string;
  ev: string;
  subj: string;
  html: string;
  ch: string;
}
export const MAILT: MailTpl[] = (
  [
    ['rec30', 'Recordatorio 30 días', 'Recordatorio (−30 d)', 'Tu servicio {{servicio.nombre}} vence pronto', '<p>Hola {{cliente.contacto}}:</p><p>Te recordamos que tu servicio <b>{{servicio.nombre}}</b> vence el <b>{{factura.vence}}</b>. Puedes renovarlo desde tu portal en un minuto.</p><p><a href="https://portal.alojamientoplus.com">Ir a mi portal</a></p>'],
    ['rec7', 'Recordatorio 7 días', 'Recordatorio (−7 d)', 'Faltan 7 días para el vencimiento de {{factura.numero}}', '<p>Hola {{cliente.contacto}}:</p><p>Tu factura <b>{{factura.numero}}</b> por <b>{{factura.total}}</b> vence el {{factura.vence}}.</p><ul><li>Tarjeta o PayPal: pago inmediato.</li><li>Transferencia: sube tu voucher en el portal.</li></ul>'],
    ['venc', 'Aviso de vencimiento', 'Aviso de vencimiento (día 0)', 'Hoy vence tu factura {{factura.numero}}', '<p>Hola {{cliente.contacto}}:</p><p>Hoy vence tu factura <b>{{factura.numero}}</b>. Si no registramos el pago, el servicio se suspenderá mañana.</p><p><a href="https://portal.alojamientoplus.com/pagar">Pagar ahora</a></p>'],
    ['susp', 'Suspensión de servicio', 'Suspender servicio (+1 d)', 'Servicio suspendido: {{servicio.nombre}}', '<p>Hola {{cliente.contacto}}:</p><p>Suspendimos <b>{{servicio.nombre}}</b> por falta de pago. Se reactivará automáticamente al registrar el pago.</p><p><b>Importante:</b> a los 10 días de suspensión el servicio se da de baja.</p>'],
    ['mora', 'Nota de débito por mora', 'Emitir nota de débito por mora', 'Recargo por mora aplicado', '<p>Se emitió una nota de débito por recargo de mora asociada a la factura {{factura.numero}}.</p>'],
    ['baja', 'Baja de servicio', 'Dar de baja (+11 d)', 'Baja de {{servicio.nombre}}', '<p>Hola {{cliente.contacto}}:</p><p>Dimos de baja <b>{{servicio.nombre}}</b>. Conservaremos una copia por 15 días por si deseas recuperarlo.</p>'],
    ['bienv', 'Bienvenida', 'Alta de cliente', '¡Bienvenido a {{marca.nombre}}!', '<h2>¡Hola {{cliente.contacto}}!</h2><p>Gracias por confiar en {{marca.nombre}}. Desde tu portal puedes ver tus servicios, pagar y abrir tickets.</p>'],
    ['vouch', 'Voucher validado', 'Validación de voucher', 'Recibimos tu pago', '<p>Validamos tu transferencia por <b>{{factura.total}}</b> para la factura {{factura.numero}}. ¡Gracias!</p>'],
    ['tk', 'Respuesta de ticket', 'Respuesta de agente', '[{{ticket.numero}}] Respuesta de soporte', '<p>Hola {{cliente.contacto}}:</p><p>{{agente.nombre}} respondió tu ticket <b>{{ticket.numero}}</b>.</p>'],
    ['2fa', 'Código de verificación', 'Inicio de sesión (2FA)', 'Tu código de verificación', '<p>Tu código es <b>482 913</b>. Vence en 10 minutos. Si no fuiste tú, cambia tu contraseña.</p>'],
  ] as [string, string, string, string, string][]
).map((r) => ({ id: r[0], n: r[1], ev: r[2], subj: r[3], html: r[4], ch: 'Correo' }));

/* ---------- Logo de mini web ---------- */
export { MwLogo };
export const mwStyle = (brand: BrandId, target?: string): CSSProperties => mwVars(brand, target) as unknown as CSSProperties;

/* ---------- Vista previa de correo (mailPreview l.3177) ---------- */
export function MailPreview({ subj, html, brand }: { subj: string; html: string; brand: BrandId }) {
  const subjTxt = subj.replace(/\{\{\s*([a-z.]+)\s*\}\}/g, (m, k: string) => (VARS.find((x) => x[0] === k) || [])[1] ?? m);
  return (
    <div className="mw mw-mail" style={mwStyle(brand, 'Correos')}>
      <div className="mw-bar">
        <i />
        <i />
        <i />
        <span>Asunto: {subjTxt}</span>
      </div>
      <div className="mm-head">
        <MwLogo brand={brand} target="Correos" />
      </div>
      <div className="mp-main rt-out" dangerouslySetInnerHTML={{ __html: fillVars(sanitize(html), { 'marca.nombre': BR[brand].n, 'marca.telefono': CONTACT[brand].tel }) }} />
      <div className="mw-foot">
        {BR[brand].n} · {CONTACT[brand].tel} · {CONTACT[brand].mail2}
      </div>
    </div>
  );
}

/* ---------- Carta de respuesta del Libro de Reclamaciones (letterHtml l.3192) ---------- */
export const reclVars = (r: ReclX): Record<string, string> => ({
  'cliente.nombre': r.nombre,
  'cliente.contacto': r.nombre,
  'reclamo.numero': r.id,
  'marca.nombre': BR[r.brand].n,
  'marca.telefono': CONTACT[r.brand].tel,
  'agente.nombre': r.respBy || ME,
});
export function Letter({ r, html }: { r: ReclX; html: string }) {
  const d = r.respDate || TODAY;
  return (
    <article className="letter" style={mwStyle(r.brand, 'Correos')}>
      <header>
        <MwLogo brand={r.brand} target="Correos" />
        <small>
          {EMPRESA.rs} · RUC {EMPRESA.ruc}
          <br />
          {EMPRESA.dir}
        </small>
      </header>
      <p className="lt-date">
        Lima, {d.getDate()} de {MESL[d.getMonth()]} de {d.getFullYear()}
      </p>
      <p>
        Señor(a)
        <br />
        <b>{r.nombre}</b>
        <br />
        DNI {r.dni}
        <br />
        {r.dom}
      </p>
      <p>
        <b>Referencia:</b> Hoja de reclamación N.° {r.id} del {fD(r.date)} ({r.tipo.toLowerCase()})
      </p>
      <div className="rt-out" dangerouslySetInnerHTML={{ __html: fillVars(sanitize(html), reclVars(r)) }} />
      <p className="lt-sign">
        Atentamente,
        <br />
        <b>{r.respBy || ME}</b>
        <br />
        Área de Atención al Cliente · {BR[r.brand].n}
      </p>
    </article>
  );
}
