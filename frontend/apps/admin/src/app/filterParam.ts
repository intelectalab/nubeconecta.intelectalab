/**
 * Filtros en el `param` del hash, de forma aditiva y sin tocar el router.
 *
 * Un tile de resumen enlaza a su lista con un token `f~clave=valor,clave2=valor2`;
 * la vista destino lo parsea al montar y pre-rellena sus filtros. El prefijo `f~`
 * lo distingue de los otros usos del `param` (id de detalle, texto de búsqueda,
 * nombre de pestaña), que se conservan tal cual.
 */

/** Construye el token para un tile: `{ d30: '1', tit: 'company' }` → `"f~d30=1,tit=company"`. */
export function filterParam(filters: Record<string, string | number | boolean | undefined | null>): string {
  const pairs = Object.entries(filters)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
  return 'f~' + pairs.join(',');
}

/** Parsea el token de un `param`: `"f~d30=1,tit=company"` → `{ d30: '1', tit: 'company' }`. Devuelve null si el param no es un token de filtro. */
export function parseFilterParam(param: string | undefined | null): Record<string, string> | null {
  if (!param || !param.startsWith('f~')) return null;
  const out: Record<string, string> = {};
  for (const pair of param.slice(2).split(',')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    if (eq < 0) continue;
    out[pair.slice(0, eq)] = decodeURIComponent(pair.slice(eq + 1));
  }
  return out;
}
