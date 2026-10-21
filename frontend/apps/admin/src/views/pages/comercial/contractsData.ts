/**
 * Estado complementario de contratos (prototipo l.3136-3146): HTML de cada
 * borrador, cláusulas elegidas, introducción de plantillas y texto
 * enriquecido de las cláusulas. Vive en memoria junto a CONTRACTS/CTPL/CLAUSES.
 */
import { CLAUSES, CTPL, esc } from '../../../data';

export const ORD = ['PRIMERA', 'SEGUNDA', 'TERCERA', 'CUARTA', 'QUINTA', 'SEXTA', 'SÉPTIMA', 'OCTAVA', 'NOVENA', 'DÉCIMA', 'UNDÉCIMA'];
export const DEFAULT_INTRO =
  '<p>Conste por el presente documento el contrato que celebran, de una parte, el PROVEEDOR, y de la otra, {{cliente.nombre}} con RUC {{cliente.ruc}}, en adelante el CLIENTE, en los términos siguientes:</p>';

/** HTML enriquecido por cláusula (si se editó). */
export const CL_HTML: Record<string, string> = {};
/** Introducción por plantilla (si se editó). */
export const TPL_INTRO: Record<string, string> = {};
/** Borradores: cláusulas elegidas y HTML por contrato. */
export const CT_DOC: Record<string, { sel: string[]; html: string }> = {};

export const clHtml = (k: string): string => CL_HTML[k] || `<p>${esc(CLAUSES[k][2])}</p>`;

export function ctHtml(tplId: string, sel?: string[]): string {
  const t = CTPL.find((x) => x.id === tplId) || CTPL[0];
  return (
    `<h2>${esc(t.n.toUpperCase())}</h2>${TPL_INTRO[t.id] || DEFAULT_INTRO}` +
    (sel || t.cl).map((k, i) => `<h3>CLÁUSULA ${ORD[i] || i + 1}. ${esc(CLAUSES[k][0].toUpperCase())}</h3>${clHtml(k)}`).join('') +
    '<p><i>(Texto de ejemplo; revisar con asesoría legal.)</i></p>'
  );
}

/** Documento del contrato (lo crea a partir de la plantilla la primera vez). */
export function ctDoc(id: string, tplId: string): { sel: string[]; html: string } {
  if (!CT_DOC[id]) {
    const t = CTPL.find((x) => x.id === tplId) || CTPL[0];
    const sel = t.cl.slice();
    CT_DOC[id] = { sel, html: ctHtml(tplId, sel) };
  }
  return CT_DOC[id];
}
