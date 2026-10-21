/**
 * Logo de las mini webs (mwLogo del prototipo l.2020): imagen subida en
 * Apariencia o, si no hay, la nube con rayo en los colores de la marca.
 * Lo usan Soporte (plantillas y reclamos) y Web/Configuración.
 */
import { APP, BR, type BrandId } from '../data';

export function MwLogo({ brand, target = 'Portal del cliente' }: { brand: BrandId; target?: string }) {
  const a = APP[brand][target];
  if (a.logo) return <img src={a.logo} alt={`Logo ${BR[brand].n}`} className="mw-logo-img" />;
  return (
    <span className="mw-logo">
      <svg viewBox="0 0 48 36" aria-hidden="true">
        <path d="M37.5 31H12.5a9 9 0 0 1-1.6-17.86A12 12 0 0 1 34 10.4a8.6 8.6 0 0 1 3.5 20.6z" fill="none" stroke={a.secondary} strokeWidth="3.2" />
        <path d="M25.6 9.5 17.8 21h6l-2.2 9.5L31 17.6h-6.2l2.6-8.1z" fill={a.accent} />
      </svg>
      {BR[brand].n}
    </span>
  );
}
