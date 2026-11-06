import type { HttpClient } from './http';

export type FileScanStatus = 'pending' | 'clean' | 'infected' | 'failed';
export type FileVisibility = 'internal' | 'customer';
export type FileAttachableType = 'ticket' | 'ticket_message' | 'customer';

/** Adjunto servido por el backend (módulo Files). `url` solo viene en el detalle. */
export interface FileAttachment {
  id: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  scan_status: FileScanStatus;
  visibility: FileVisibility;
  version: number;
  attachable_type: string | null;
  attachable_id: string | null;
  created_at: string;
  url?: string;
}

export interface FileUploadOptions {
  attachable_type?: FileAttachableType;
  attachable_id?: string;
  visibility?: FileVisibility;
}

interface Envelope<T> {
  data: T;
}

const enc = encodeURIComponent;

/** Cliente del módulo Files: subir, consultar (URL temporal) y borrar adjuntos. */
export function createFilesApi(http: HttpClient) {
  const base = '/api/v1/admin/files';
  return {
    /** Sube un archivo (multipart). Devuelve el adjunto creado (sin URL). */
    upload: (file: File, opts: FileUploadOptions = {}): Promise<FileAttachment> => {
      const form = new FormData();
      form.append('file', file);
      if (opts.attachable_type) form.append('attachable_type', opts.attachable_type);
      if (opts.attachable_id) form.append('attachable_id', opts.attachable_id);
      if (opts.visibility) form.append('visibility', opts.visibility);
      return http.post<Envelope<FileAttachment>>(base, form).then((r) => r.data);
    },
    /** Trae el adjunto con una `url` firmada temporal (5 min) para verlo o descargarlo. */
    get: (id: string): Promise<FileAttachment> => http.get<Envelope<FileAttachment>>(`${base}/${enc(id)}`).then((r) => r.data),
    /** Elimina el adjunto (requiere la versión para el bloqueo optimista). */
    remove: (id: string, version: number): Promise<void> => http.delete<void>(`${base}/${enc(id)}`, { version }),
  };
}
