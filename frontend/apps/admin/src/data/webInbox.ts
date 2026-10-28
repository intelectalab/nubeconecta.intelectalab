/**
 * Solicitudes web de ejemplo (modo demo): envíos de los formularios de contacto
 * y cotización de las webs WordPress, con la misma forma que la API
 * (/api/v1/admin/web-connector/form-submissions).
 */
import type { WebSubmission, WebSubmissionPayload, WebSubmissionStatus } from '@hub/api';
import { BR } from './db';
import { TODAY } from './format';
import type { BrandFilter, BrandId } from './types';

const at = (daysAgo: number, h: number, m: number) => {
  const d = new Date(TODAY);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

const FORMS = { contacto: 'Contacto', cotizacion: 'Solicitar cotización' } as const;
const HOST: Record<BrandId, string> = { ap: 'www.alojamientoplus.pe', sc: 'www.servercreativo.pe', ha: 'www.hostandino.pe', ns: 'www.nubesur.cloud' };

let seq = 0;
function row(brand: BrandId, form: keyof typeof FORMS, when: string, status: WebSubmissionStatus, payload: WebSubmissionPayload, page: string, utm: Record<string, string> = {}): WebSubmission {
  seq += 1;
  return {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    web_form_id: `00000000-0000-4000-9000-00000000000${form === 'contacto' ? 1 : 2}`,
    form_code: form,
    form_name: FORMS[form],
    brand_id: brand,
    brand_name: BR[brand].n,
    wp_site_id: null,
    payload,
    file_ids: [],
    consent_given: true,
    consent_text: 'Acepto la Política de privacidad y que me contacten sobre mi solicitud.',
    captcha_verified_at: null,
    page_url: `https://${HOST[brand]}${page}`,
    attribution: utm,
    status,
    lead_id: null,
    ticket_id: null,
    emailed_at: null,
    routed_at: status === 'routed' ? when : null,
    last_error: null,
    version: 1,
    created_at: when,
    updated_at: when,
  };
}

export const WEB_SUBMISSIONS: WebSubmission[] = [
  row('ap', 'cotizacion', at(0, 9, 42), 'received', { name: 'Mariela Quispe', email: 'mquispe@andesgourmet.pe', phone: '+51 987 654 321', company: 'Andes Gourmet SAC', message: 'Buen día, necesitamos cotizar hosting para nuestra tienda en línea (WooCommerce, ~2.000 productos) con correo corporativo para 15 usuarios y certificado SSL. ¿Incluyen migración desde nuestro proveedor actual?', source: 'cotizacion' }, '/planes/hosting-negocios/', { source: 'google', medium: 'cpc', campaign: 'hosting-negocios' }),
  row('ap', 'contacto', at(0, 8, 15), 'received', { name: 'Jorge Huamán', email: 'jorge.huaman@gmail.com', phone: '+51 945 112 334', message: '¿El plan Emprende permite instalar WordPress con un dominio .pe que ya tengo registrado en otra empresa?', source: 'contacto' }, '/contacto/'),
  row('sc', 'cotizacion', at(1, 17, 3), 'received', { name: 'Carolina Vega', email: 'cvega@estudiovega.com', phone: '+51 1 444 5566', company: 'Estudio Vega Arquitectos', message: 'Queremos un VPS para alojar renders y un Nextcloud interno. Unos 500 GB de disco y respaldos diarios. Por favor envíen propuesta.', source: 'cotizacion' }, '/vps/', { source: 'facebook', medium: 'social', campaign: 'vps-octubre' }),
  row('ap', 'contacto', at(2, 11, 27), 'routed', { name: 'Luis Rojas', email: 'luis.rojas@ferreteriarojas.pe', phone: '+51 956 778 990', company: 'Ferretería Rojas EIRL', message: 'Necesito ayuda para renovar mi dominio que venció la semana pasada.', source: 'contacto' }, '/dominios/'),
  row('ha', 'cotizacion', at(3, 15, 50), 'received', { name: 'Rosa Mamani', email: 'rosa@cooperativaaltiplano.org', company: 'Cooperativa Altiplano', message: 'Solicitamos cotización de 30 cuentas de correo con 10 GB cada una y antispam.', source: 'cotizacion' }, '/correo-corporativo/', { source: 'newsletter', medium: 'email' }),
  row('ap', 'contacto', at(4, 3, 12), 'spam', { name: 'SEO Expert', email: 'rank1@promo-seo.biz', message: 'We can put your website on first page of Google guaranteed!!! Contact now', source: 'contacto' }, '/contacto/'),
];

export const webInBrand = (brand: BrandFilter, s: WebSubmission) => brand === 'all' || s.brand_id === brand;
