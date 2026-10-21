/**
 * Límite de errores de la vista activa. Con las vistas cargadas por
 * React.lazy, si falla la descarga del chunk (deploy nuevo con otros hashes,
 * red caída) o la vista lanza al renderizar, sin este límite React desmonta
 * TODO el árbol y el panel queda en blanco. Aquí el shell (menú, topbar)
 * sigue vivo y se muestra un aviso con opción de recargar.
 *
 * React.lazy memoriza la promesa rechazada, así que reintentar sin recargar
 * no sirve: el botón recarga la página. App.tsx monta un límite nuevo por
 * ruta (key del contenedor .page), por lo que navegar a otra ruta funciona.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { EmptyState } from './ui';

interface Props {
  /** Título de la ruta, para el h1 del aviso */
  title: string;
  children: ReactNode;
}
interface State {
  error: Error | null;
}

const isChunkError = (e: Error): boolean =>
  /dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError/i.test(`${e.name} ${e.message}`);

export class ViewBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ViewBoundary]', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const chunk = isChunkError(error);
    return (
      <>
        <div className="phead">
          <div>
            <h1 tabIndex={-1} id="ph1">
              {this.props.title}
            </h1>
          </div>
        </div>
        <div role="alert">
          <EmptyState
            icon="tri"
            title={chunk ? 'No se pudo cargar esta sección' : 'Esta sección tuvo un error'}
            text={
              chunk
                ? 'Puede haber una versión nueva del panel o un problema de conexión. Recarga la página para continuar.'
                : 'El resto del panel sigue disponible. Recarga la página o vuelve a intentarlo más tarde.'
            }
            action={
              <button type="button" className="btn primary" onClick={() => window.location.reload()}>
                Recargar página
              </button>
            }
          />
        </div>
      </>
    );
  }
}
