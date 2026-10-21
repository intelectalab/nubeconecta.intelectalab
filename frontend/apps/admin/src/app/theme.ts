/**
 * Color principal del panel interno aplicado en vivo (applyPanelColor del
 * prototipo, l.2022). Lo usa la vista Apariencia; App.tsx lo aplica al iniciar
 * si hay un color guardado en localStorage ('ap.panelColor').
 */
import { bestFg, contrast, hexOk, mix } from '../data/format';
import { lsGet, lsSet } from './storage';

export function applyPanelColor(hex: string | null): void {
  let st = document.getElementById('panelTheme') as HTMLStyleElement | null;
  if (!hex || !hexOk(hex)) {
    st?.remove();
    return;
  }
  if (!st) {
    st = document.createElement('style');
    st.id = 'panelTheme';
    document.body.appendChild(st);
  }
  const dk = mix(hex, '#000000', 0.12);
  const dk2 = mix(hex, '#000000', 0.22);
  const txt = contrast(hex, '#ffffff') >= 4.5 ? hex : mix(hex, '#000000', 0.45);
  const L = `--brand:${hex};--brand-hover:${dk};--brand-text:${txt};--brand-soft:${mix(hex, '#ffffff', 0.88)};--brand-line:${mix(hex, '#ffffff', 0.55)};--topbar:${hex};--topbar-2:${dk};--topbar-field:${dk2};--chart-line:${hex};--chart-bar:${mix(hex, '#ffffff', 0.62)};--info:${hex};--info-text:${txt};--info-bg:${mix(hex, '#ffffff', 0.88)};--topbar-ink:${bestFg(hex)};--topbar-muted:${bestFg(hex) === '#ffffff' ? mix(hex, '#ffffff', 0.75) : mix(hex, '#000000', 0.6)};--brand-ink:${bestFg(hex)}`;
  const lt = mix(hex, '#ffffff', 0.3);
  const D = `--brand:${lt};--brand-hover:${mix(hex, '#ffffff', 0.45)};--brand-text:${mix(hex, '#ffffff', 0.55)};--brand-soft:${mix(hex, '#111a2a', 0.78)};--brand-line:${mix(hex, '#111a2a', 0.45)};--topbar:${mix(hex, '#000000', 0.35)};--topbar-2:${mix(hex, '#000000', 0.25)};--topbar-field:${mix(hex, '#000000', 0.5)};--chart-line:${mix(hex, '#ffffff', 0.55)};--chart-bar:${mix(hex, '#111a2a', 0.5)};--info:${lt};--info-text:${mix(hex, '#ffffff', 0.6)};--info-bg:${mix(hex, '#111a2a', 0.78)};--topbar-ink:#ffffff;--brand-ink:${bestFg(lt)}`;
  st.textContent = `:root{${L}}@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${D}}}:root[data-theme="dark"]{${D}}`;
}

/** Guarda (o borra con null) el color del panel y lo aplica. */
export function savePanelColor(hex: string | null): void {
  lsSet('ap.panelColor', hex || '');
  applyPanelColor(hex);
}
export const storedPanelColor = (): string | null => {
  const pc = lsGet('ap.panelColor');
  return pc && hexOk(pc) ? pc : null;
};

/** URL del portal del cliente (app hermana en el puerto 3001). */
export const PORTAL_URL = 'http://localhost:3001/';
