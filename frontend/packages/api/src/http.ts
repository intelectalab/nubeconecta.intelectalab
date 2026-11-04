/**
 * Cliente HTTP base para la API del hub (docs/06-api.md §4).
 *
 * - Autenticación SPA de Sanctum por cookie: `credentials: 'include'`,
 *   GET /sanctum/csrf-cookie antes de la primera petición mutante y cabecera
 *   `X-XSRF-TOKEN` con el valor de la cookie `XSRF-TOKEN`.
 * - Errores RFC 9457 (`application/problem+json`) → `ProblemError`.
 *
 * En desarrollo las apps usan el proxy de Vite (/api y /sanctum), de modo que
 * `baseUrl` queda vacío y las cookies son del mismo origen.
 */

/** Cuerpo RFC 9457 que emite el backend (App\Shared\Http\Problem\ProblemRenderer). */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  code: string;
  detail?: string | null;
  errors?: Record<string, string[]>;
  request_id?: string | null;
}

/** Error tipado para cualquier respuesta no 2xx (o fallo de red: status 0). */
export class ProblemError extends Error {
  readonly status: number;
  readonly type: string;
  readonly title: string;
  readonly code: string;
  readonly detail: string | null;
  readonly errors: Record<string, string[]>;
  readonly requestId: string | null;
  /** Miembros de extensión RFC 9457 (p. ej. `current_version`, `duplicates`). */
  readonly extensions: Record<string, unknown>;

  constructor(p: ProblemDetails) {
    super(p.detail || p.title);
    this.name = 'ProblemError';
    this.status = p.status;
    this.type = p.type;
    this.title = p.title;
    this.code = p.code;
    this.detail = p.detail ?? null;
    this.errors = p.errors ?? {};
    this.requestId = p.request_id ?? null;
    const known = ['type', 'title', 'status', 'code', 'detail', 'errors', 'request_id'];
    this.extensions = Object.fromEntries(Object.entries(p).filter(([k]) => !known.includes(k)));
  }

  /** Primer mensaje de validación de un campo, si lo hay. */
  fieldError(field: string): string | null {
    return this.errors[field]?.[0] ?? null;
  }

  /** Mensaje legible: detalle, primer error de validación o título. */
  get userMessage(): string {
    const first = Object.values(this.errors)[0]?.[0];
    return first || this.detail || this.title;
  }
}

export const isProblem = (e: unknown): e is ProblemError => e instanceof ProblemError;

export interface HttpClientOptions {
  /** Origen del backend; vacío = mismo origen (proxy de Vite / nginx). */
  baseUrl?: string;
  /** Idioma de los títulos de error (lang/{es,en}/problems.php). */
  locale?: string;
  /** Se invoca con cada 401 (sesión ausente o revocada). */
  onUnauthenticated?: (err: ProblemError) => void;
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RequestOptions {
  /** Idempotency-Key (docs/06-api.md): repetir con la misma clave no duplica el efecto. */
  idempotencyKey?: string;
  /** Solo multipart: avance de subida (0-1). Usa XMLHttpRequest porque fetch no informa el progreso. */
  onUploadProgress?: (fraction: number) => void;
}

/** Envío multipart con progreso; devuelve un Response equivalente al de fetch. */
function xhrSend(method: string, url: string, headers: Record<string, string>, body: FormData, onProgress: (f: number) => void): Promise<Response> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    xhr.withCredentials = true;
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      const h = new Headers();
      for (const line of xhr.getAllResponseHeaders().trim().split(/[\r\n]+/)) {
        const i = line.indexOf(':');
        if (i > 0) h.append(line.slice(0, i).trim(), line.slice(i + 1).trim());
      }
      const noBody = xhr.status === 204 || xhr.status === 205 || xhr.status === 304;
      resolve(new Response(noBody ? null : xhr.responseText, { status: xhr.status, statusText: xhr.statusText, headers: h }));
    };
    xhr.onerror = () => reject(new Error('network'));
    xhr.onabort = () => reject(new Error('abort'));
    xhr.send(body);
  });
}

/** Clave aleatoria para Idempotency-Key. */
export function newIdempotencyKey(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return 'k-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
}

/**
 * Query string con la notación del backend: `{ filter: { status: 'active' }, page: { size: 25 } }`
 * → `filter[status]=active&page[size]=25`. Omite null, undefined y ''.
 */
export function toQuery(params: Record<string, unknown>): string {
  const out: string[] = [];
  const walk = (key: string, v: unknown) => {
    if (v === null || v === undefined || v === '') return;
    if (typeof v === 'object' && !Array.isArray(v)) {
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) walk(`${key}[${k}]`, x);
      return;
    }
    out.push(encodeURIComponent(key).replace(/%5B/g, '[').replace(/%5D/g, ']') + '=' + encodeURIComponent(Array.isArray(v) ? v.join(',') : String(v)));
  };
  for (const [k, v] of Object.entries(params)) walk(k, v);
  return out.length ? '?' + out.join('&') : '';
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/[.$?*|{}()[\]\\/+^]/g, '\\$&') + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}

function isProblemBody(x: unknown): x is ProblemDetails {
  return typeof x === 'object' && x !== null && 'status' in x && 'title' in x;
}

export class HttpClient {
  private readonly baseUrl: string;
  private readonly locale: string;
  private readonly onUnauthenticated?: (err: ProblemError) => void;
  private csrfReady: Promise<void> | null = null;

  constructor(opts: HttpClientOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? '').replace(/\/$/, '');
    this.locale = opts.locale ?? 'es';
    this.onUnauthenticated = opts.onUnauthenticated;
  }

  /** GET /sanctum/csrf-cookie (una vez; se repite tras un 419). */
  ensureCsrf(force = false): Promise<void> {
    if (force || !this.csrfReady || !readCookie('XSRF-TOKEN')) {
      this.csrfReady = fetch(this.baseUrl + '/sanctum/csrf-cookie', {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      }).then(
        (r) => {
          if (!r.ok) {
            this.csrfReady = null;
            throw new ProblemError({ type: 'about:blank', title: 'No se pudo iniciar la protección CSRF.', status: r.status, code: 'csrf_unavailable' });
          }
        },
        () => {
          this.csrfReady = null;
          throw networkError();
        },
      );
    }
    return this.csrfReady;
  }

  async request<T>(method: Method, path: string, body?: unknown, retried = false, opts: RequestOptions = {}): Promise<T> {
    const mutating = method !== 'GET';
    if (mutating) await this.ensureCsrf();

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Accept-Language': this.locale,
      'X-Requested-With': 'XMLHttpRequest',
    };
    const xsrf = readCookie('XSRF-TOKEN');
    if (xsrf) headers['X-XSRF-TOKEN'] = xsrf;
    const multipart = typeof FormData !== 'undefined' && body instanceof FormData;
    // FormData: el navegador fija el Content-Type multipart con su boundary.
    if (body !== undefined && !multipart) headers['Content-Type'] = 'application/json';
    if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;

    let res: Response;
    try {
      res =
        multipart && opts.onUploadProgress && typeof XMLHttpRequest !== 'undefined'
          ? await xhrSend(method, this.baseUrl + path, headers, body as FormData, opts.onUploadProgress)
          : await fetch(this.baseUrl + path, {
              method,
              credentials: 'include',
              headers,
              body: body === undefined ? undefined : multipart ? (body as FormData) : JSON.stringify(body),
            });
    } catch {
      throw networkError();
    }

    // 419: token CSRF caducado o sesión regenerada → renovar y reintentar una vez.
    if (res.status === 419 && !retried) {
      await this.ensureCsrf(true);
      return this.request<T>(method, path, body, true, opts);
    }

    if (res.status === 204) return undefined as T;

    const text = await res.text();
    let json: unknown = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }

    if (!res.ok) {
      const err = new ProblemError(
        isProblemBody(json)
          ? json
          : { type: 'about:blank', title: res.statusText || 'Error de servidor', status: res.status, code: 'http_error', request_id: res.headers.get('X-Request-Id') },
      );
      if (res.status === 401) this.onUnauthenticated?.(err);
      throw err;
    }
    return json as T;
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }
  post<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> {
    return this.request<T>('POST', path, body ?? {}, false, opts);
  }
  /** GET que devuelve un archivo (p. ej. comprobante imprimible); errores igual que request(). */
  async getBlob(path: string, accept = 'text/html, application/json', retried = false): Promise<Blob> {
    let res: Response;
    try {
      res = await fetch(this.baseUrl + path, { method: 'GET', credentials: 'include', headers: { Accept: accept, 'Accept-Language': this.locale, 'X-Requested-With': 'XMLHttpRequest' } });
    } catch {
      throw networkError();
    }
    // 419: sesión regenerada → renovar CSRF y reintentar una vez (igual que request()).
    if (res.status === 419 && !retried) {
      await this.ensureCsrf(true);
      return this.getBlob(path, accept, true);
    }
    if (!res.ok) {
      let json: unknown = null;
      try {
        json = await res.json();
      } catch {
        json = null;
      }
      const err = new ProblemError(isProblemBody(json) ? json : { type: 'about:blank', title: res.statusText || 'Error de servidor', status: res.status, code: 'http_error' });
      if (res.status === 401) this.onUnauthenticated?.(err);
      throw err;
    }
    return res.blob();
  }
  /** POST que devuelve un archivo (p. ej. CSV); errores igual que request(). */
  async postBlob(path: string, body: unknown = {}, retried = false): Promise<Blob> {
    await this.ensureCsrf();
    const xsrf = readCookie('XSRF-TOKEN');
    let res: Response;
    try {
      res = await fetch(this.baseUrl + path, {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'text/csv, application/json', 'Accept-Language': this.locale, 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json', ...(xsrf ? { 'X-XSRF-TOKEN': xsrf } : {}) },
        body: JSON.stringify(body),
      });
    } catch {
      throw networkError();
    }
    if (res.status === 419 && !retried) {
      await this.ensureCsrf(true);
      return this.postBlob(path, body, true);
    }
    if (!res.ok) {
      let json: unknown = null;
      try {
        json = await res.json();
      } catch {
        json = null;
      }
      const err = new ProblemError(isProblemBody(json) ? json : { type: 'about:blank', title: res.statusText || 'Error de servidor', status: res.status, code: 'http_error' });
      if (res.status === 401) this.onUnauthenticated?.(err);
      throw err;
    }
    return res.blob();
  }
  patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PATCH', path, body);
  }
  put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PUT', path, body);
  }
  delete<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('DELETE', path, body);
  }
}

function networkError(): ProblemError {
  return new ProblemError({ type: 'about:blank', title: 'No se pudo conectar con el servidor.', status: 0, code: 'network_error' });
}
