/**
 * Web: sitios WordPress, shortcodes, promociones, contacto, formularios y
 * apariencia por marca (prototipo l.2004-2034 y l.2401-2470). Datos estáticos.
 * La generación de vistas previas (mwPlanCard, scRender…) la porta la vista WP.
 */
import { BRANDS } from './db';
import { bestFg, mix } from './format';
import type { Appearance, BrandContact, BrandId, WpSite } from './types';

export const SITES: { id: BrandId; host: string; brand: BrandId; main?: boolean }[] = [
  { id: 'ap', host: 'www.alojamientoplus.com', brand: 'ap', main: true },
  { id: 'sc', host: 'www.servercreativo.com', brand: 'sc' },
  { id: 'ha', host: 'www.hostandino.pe', brand: 'ha' },
  { id: 'ns', host: 'www.nubesur.cloud', brand: 'ns' },
];

export const WPS: WpSite[] = [
  { id: 'ap', host: 'alojamientoplus.com', brand: 'ap', ms: 'Multisite · sitio 1 (principal)', st: 'Conectado', tok: 'hub_ro_4f8Qz1Lk92Xa7Vb3', wh: 'https://alojamientoplus.com/wp-json/hub/v1/invalidar', inv: new Date(2026, 9, 8, 10, 12), plugin: '1.4.2', wp: '6.6.2', lat: 142 },
  { id: 'sc', host: 'servercreativo.com', brand: 'sc', ms: 'Multisite · sitio 2', st: 'Conectado', tok: 'hub_ro_9Tq7Hn2Rw5Lm1Ka8', wh: 'https://servercreativo.com/wp-json/hub/v1/invalidar', inv: new Date(2026, 9, 8, 9, 40), plugin: '1.4.2', wp: '6.6.2', lat: 168 },
  { id: 'ha', host: 'hostandino.pe', brand: 'ha', ms: 'Multisite · sitio 3', st: 'Plugin desactualizado', tok: 'hub_ro_2Bv6Yc8Pd3Mx0Js5', wh: 'https://hostandino.pe/wp-json/hub/v1/invalidar', inv: new Date(2026, 9, 7, 18, 5), plugin: '1.3.0', wp: '6.6.1', lat: 211 },
  { id: 'ns', host: 'nubesur.cloud', brand: 'ns', ms: 'Multisite · sitio 4', st: 'Token revocado', tok: '', wh: 'https://nubesur.cloud/wp-json/hub/v1/invalidar', inv: new Date(2026, 9, 1, 8, 0), plugin: '1.4.2', wp: '6.6.2', lat: 0 },
];
export const maskTok = (t: string): string => (t ? t.slice(0, 7) + '•'.repeat(10) + t.slice(-4) : '— sin token —');

/** Opción de shortcode: [nombre, tipo ('sel'|'txt'|'num'|'chk'), valor por defecto]. */
export type ScOpt = [string, 'sel' | 'txt' | 'num' | 'chk', string | number | boolean];
export const SCDEF: Record<string, { d: string; o: ScOpt[] }> = {
  hub_planes: { d: 'Tabla de planes de una categoría', o: [['tipo', 'sel', 'hosting'], ['ids', 'txt', ''], ['ciclo', 'sel', 'mensual'], ['moneda', 'sel', 'auto'], ['columnas', 'num', 3], ['destacados', 'chk', true]] },
  hub_plan: { d: 'Tarjeta de un plan o producto', o: [['id', 'sel', 'HP2'], ['ciclo', 'sel', 'mensual'], ['moneda', 'sel', 'auto']] },
  hub_comparador: { d: 'Comparador de características entre planes', o: [['tipo', 'sel', 'hosting'], ['ids', 'txt', ''], ['moneda', 'sel', 'auto']] },
  hub_paquete: { d: 'Paquete combinado con su descuento', o: [['id', 'sel', 'BD2'], ['moneda', 'sel', 'auto']] },
  hub_dominios: { d: 'Tabla de precios de dominios', o: [['extensiones', 'txt', '.pe,.com.pe,.com,.net'], ['mostrar', 'sel', 'ambos'], ['moneda', 'sel', 'auto']] },
  hub_buscar_dominio: { d: 'Buscador de disponibilidad de dominios', o: [['extensiones', 'txt', '.pe,.com.pe,.com'], ['boton', 'txt', 'Buscar']] },
  hub_boton_contratar: { d: 'Botón que lleva al carrito del portal', o: [['id', 'sel', 'HP2'], ['ciclo', 'sel', 'anual'], ['texto', 'txt', 'Contratar'], ['estilo', 'sel', 'solido']] },
  hub_formulario: { d: 'Formulario creado en este panel', o: [['id', 'sel', 'contacto']] },
  hub_contacto: { d: 'Datos de contacto de la marca', o: [['marca', 'sel', 'ap'], ['mostrar', 'sel', 'todo']] },
  hub_documento_legal: { d: 'Documento legal vigente', o: [['doc', 'sel', 'terminos'], ['marca', 'sel', 'ap'], ['version', 'sel', 'vigente']] },
  hub_libro_reclamaciones: { d: 'Formulario del Libro de Reclamaciones', o: [['marca', 'sel', 'ap']] },
  hub_asistente: { d: 'Asistente que recomienda un plan', o: [['tipo', 'sel', 'hosting'], ['pasos', 'num', 3]] },
  hub_estado_servicios: { d: 'Estado público de los servicios', o: [['grupo', 'sel', 'todos'], ['historial', 'num', 30]] },
  hub_promocion: { d: 'Banner de promoción vigente', o: [['id', 'sel', 'CYBER26'], ['cuenta_regresiva', 'chk', true]] },
  hub_selector_moneda: { d: 'Selector S/ · US$ para toda la página', o: [['estilo', 'sel', 'botones'], ['predeterminada', 'sel', 'PEN']] },
};
/** [código, descripción, vence (ISO)] */
export const PROMOS: [string, string, string][] = [['CYBER26', 'Cyber Days: 40 % en hosting anual', '2026-11-03'], ['VPS15', '15 % en VPS el primer mes', '2026-12-31'], ['MIGRA', 'Migración gratis + 1 mes', '2026-10-31']];
/** Uso de shortcodes en las webs: [marca, shortcode, página, última vista]. */
export const SCUSE: [BrandId, string, string, string][] = [
  ['ap', 'hub_planes tipo="hosting" ciclo="anual"', '/hosting', '08/10/2026'],
  ['ap', 'hub_buscar_dominio', '/ (inicio)', '08/10/2026'],
  ['ap', 'hub_dominios extensiones=".pe,.com.pe,.com"', '/dominios', '07/10/2026'],
  ['ap', 'hub_formulario id="contacto"', '/contacto', '05/10/2026'],
  ['ap', 'hub_libro_reclamaciones marca="ap"', '/libro-de-reclamaciones', '01/10/2026'],
  ['ap', 'hub_estado_servicios', '/estado', '08/10/2026'],
  ['sc', 'hub_planes tipo="vps"', '/vps', '06/10/2026'],
  ['sc', 'hub_boton_contratar id="HP6" ciclo="anual"', '/pyme', '04/10/2026'],
  ['sc', 'hub_contacto marca="sc"', '/contacto', '30/09/2026'],
  ['ha', 'hub_planes tipo="hosting"', '/hosting', '28/09/2026'],
  ['ha', 'hub_documento_legal doc="terminos" marca="ha"', '/terminos', '20/09/2026'],
  ['ns', 'hub_paquete id="BD5"', '/nube-corporativa', '15/09/2026'],
  ['ap', 'hub_whois extensiones=".pe,.com.pe,.com"', '/dominios', '08/10/2026'],
  ['sc', 'hub_servidores tipo="vps" configurador="si"', '/servidores', '07/10/2026'],
];

export const CONTACT: Record<BrandId, BrandContact> = {
  ap: { tel: '(01) 640 2200', tel2: '(01) 640 2210', mail: 'ventas@alojamientoplus.com', mail2: 'soporte@alojamientoplus.com', wa: '+51 987 650 120', dir: 'Av. José Larco 1232, of. 504, Miraflores, Lima', hor: 'Lun–Vie 9:00–19:00 · Sáb 9:00–13:00 · Soporte 24/7' },
  sc: { tel: '(01) 712 4400', tel2: '', mail: 'hola@servercreativo.com', mail2: 'soporte@servercreativo.com', wa: '+51 955 120 330', dir: 'Calle Las Begonias 415, San Isidro, Lima', hor: 'Lun–Vie 9:00–18:00' },
  ha: { tel: '(054) 28 1190', tel2: '', mail: 'ventas@hostandino.pe', mail2: 'ayuda@hostandino.pe', wa: '+51 944 330 118', dir: 'Calle Mercaderes 212, Cercado, Arequipa', hor: 'Lun–Sáb 9:00–18:00' },
  ns: { tel: '(01) 708 3300', tel2: '', mail: 'contacto@nubesur.cloud', mail2: 'soporte@nubesur.cloud', wa: '+51 912 440 770', dir: 'Av. Benavides 1555, Surco, Lima', hor: 'Lun–Vie 8:30–17:30' },
};

/* ---------- Formularios ---------- */
export const FTYP = ['Texto', 'Correo', 'Teléfono', 'Lista', 'Casillas', 'Archivo'];
export const VALS = ['Ninguna', 'Correo válido', 'Teléfono Perú (9 dígitos)', 'RUC (11 dígitos)', 'DNI (8 dígitos)', 'Mín. 20 caracteres'];
export interface FormField { t: string; l: string; req: boolean; v: string; opts?: string }
export interface WebForm { id: string; n: string; fields: FormField[]; consent: boolean; consentTxt: string; captcha: boolean; dest: string; owner: string; msg: string }
export const FORMS: WebForm[] = [
  { id: 'contacto', n: 'Contacto general', fields: [{ t: 'Texto', l: 'Nombre y apellido', req: true, v: 'Ninguna' }, { t: 'Correo', l: 'Correo', req: true, v: 'Correo válido' }, { t: 'Teléfono', l: 'Celular', req: false, v: 'Teléfono Perú (9 dígitos)' }, { t: 'Lista', l: 'Servicio de interés', req: true, v: 'Ninguna', opts: 'Hosting, VPS, Correo corporativo, Página web' }, { t: 'Texto', l: 'Mensaje', req: true, v: 'Mín. 20 caracteres' }], consent: true, consentTxt: 'Acepto la Política de privacidad y el tratamiento de mis datos.', captcha: true, dest: 'Prospecto CRM', owner: 'Lucía Paredes', msg: '¡Gracias! Te contactaremos en menos de 2 horas hábiles.' },
  { id: 'soporte', n: 'Soporte técnico', fields: [{ t: 'Correo', l: 'Correo del titular', req: true, v: 'Correo válido' }, { t: 'Lista', l: 'Servicio afectado', req: true, v: 'Ninguna', opts: 'Hosting, Correo, Dominio, VPS' }, { t: 'Texto', l: 'Descripción', req: true, v: 'Mín. 20 caracteres' }, { t: 'Archivo', l: 'Captura de pantalla', req: false, v: 'Ninguna' }], consent: true, consentTxt: 'Autorizo el acceso temporal a mi servicio para resolver el caso.', captcha: true, dest: 'Ticket', owner: 'Carla Huamán', msg: 'Creamos tu ticket. Te escribiremos al correo indicado.' },
  { id: 'cotizar', n: 'Solicitar cotización', fields: [{ t: 'Texto', l: 'Empresa', req: true, v: 'Ninguna' }, { t: 'Texto', l: 'RUC', req: false, v: 'RUC (11 dígitos)' }, { t: 'Correo', l: 'Correo', req: true, v: 'Correo válido' }, { t: 'Casillas', l: 'Servicios', req: true, v: 'Ninguna', opts: 'Web, Tienda, Moodle, Desarrollo a medida' }], consent: true, consentTxt: 'Acepto ser contactado por un asesor comercial.', captcha: false, dest: 'Prospecto CRM', owner: 'Jorge Quispe', msg: 'Recibimos tu solicitud. Te enviaremos la cotización en 24 horas.' },
];

/* ---------- Apariencia por marca y destino ---------- */
export const TARGETS = ['Portal del cliente', 'Panel interno', 'Correos'];
export const FONTS = ['Poppins', 'Nunito', 'Plus Jakarta Sans', 'Inter', 'Montserrat', 'Sistema'];
export const BASECOL: Record<BrandId, [string, string, string, string]> = {
  ap: ['#0a3fc4', '#5f9a32', '#f2b71a', '#ffffff'],
  sc: ['#1d2b53', '#1f9d63', '#ff7a00', '#ffffff'],
  ha: ['#7a1f2b', '#2f6f4f', '#c9a227', '#fffaf3'],
  ns: ['#0f766e', '#334155', '#f59e0b', '#ffffff'],
};
/** APP[marca][destino] = apariencia vigente. */
export const APP = {} as Record<BrandId, Record<string, Appearance>>;
/** Historial de versiones publicadas. */
export const APPH = {} as Record<BrandId, Record<string, { v: string; date: Date; by: string; snap: Appearance }[]>>;
BRANDS.forEach((b) => {
  APP[b.id] = {};
  APPH[b.id] = {};
  TARGETS.forEach((t) => {
    const c = BASECOL[b.id];
    APP[b.id][t] = { logo: null, primary: c[0], secondary: c[1], accent: c[2], bg: c[3], fh: 'Poppins', fb: 'Plus Jakarta Sans', radius: 10, btn: 'Sólido', status: 'Publicado' };
    APPH[b.id][t] = [{ v: 'v1.0', date: new Date(2026, 6, 1, 9, 30), by: 'Renzo Vargas', snap: { ...APP[b.id][t] } }];
  });
});
export const fontCss = (f: string): string => (f === 'Sistema' ? 'system-ui,sans-serif' : `"${f}",system-ui,sans-serif`);
/** Variables CSS --mw-* para las mini webs de vista previa (devuelve objeto de estilo React). */
export function mwVars(brand: BrandId, target = 'Portal del cliente'): Record<string, string> {
  const a = APP[brand][target];
  return {
    '--mw-p': a.primary, '--mw-pfg': bestFg(a.primary), '--mw-s': a.secondary, '--mw-a': a.accent, '--mw-bg': a.bg, '--mw-fg': bestFg(a.bg),
    '--mw-soft': mix(a.bg, a.primary, 0.08), '--mw-line': mix(a.bg, bestFg(a.bg), 0.14), '--mw-mut': mix(bestFg(a.bg), a.bg, 0.38),
    '--mw-r': a.radius + 'px', '--mw-fh': fontCss(a.fh), '--mw-fb': fontCss(a.fb),
  };
}
export const mwBtnCls = (brand: BrandId, target = 'Portal del cliente'): string =>
  ({ Sólido: 'mw-b', Contorno: 'mw-b o', Píldora: 'mw-b pill' } as Record<string, string>)[APP[brand][target].btn] || 'mw-b';
