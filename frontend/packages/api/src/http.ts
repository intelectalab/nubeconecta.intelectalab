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

  async request<T>(method: Method, path: string, body?: unknown, retried = false): Promise<T> {
    const mutating = method !== 'GET';
    if (mutating) await this.ensureCsrf();

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Accept-Language': this.locale,
      'X-Requested-With': 'XMLHttpRequest',
    };
    const xsrf = readCookie('XSRF-TOKEN');
    if (xsrf) headers['X-XSRF-TOKEN'] = xsrf;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    let res: Response;
    try {
      res = await fetch(this.baseUrl + path, {
        method,
        credentials: 'include',
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw networkError();
    }

    // 419: token CSRF caducado o sesión regenerada → renovar y reintentar una vez.
    if (res.status === 419 && !retried) {
      await this.ensureCsrf(true);
      return this.request<T>(method, path, body, true);
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
  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body ?? {});
  }
  delete<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }
}

function networkError(): ProblemError {
  return new ProblemError({ type: 'about:blank', title: 'No se pudo conectar con el servidor.', status: 0, code: 'network_error' });
}
