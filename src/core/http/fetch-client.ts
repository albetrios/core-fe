import { API_ENDPOINTS, HTTP } from '@/core/config/constants.ts';
import { platformConfig } from '@/core/config/env.ts';
import { forceLogout, refreshAccessToken } from '@/shared/auth/service.ts';
import { getAccessToken } from '@/shared/auth/token.ts';
import { HttpError } from '@/shared/errors/HttpError.ts';

// ------------------------------------------------------------------
// Request ID
// ------------------------------------------------------------------
let requestCounter = 0;
function generateRequestId(): string {
  requestCounter = (requestCounter + 1) % Number.MAX_SAFE_INTEGER;
  return `${Date.now().toString(36)}-${requestCounter.toString(36)}`;
}

// ------------------------------------------------------------------
// Config and client type
// ------------------------------------------------------------------
interface HttpClientConfig {
  baseURL: string;
  timeout: number;
  credentials: RequestCredentials;
}

const defaultConfig: HttpClientConfig = {
  baseURL: platformConfig.apiBaseUrl,
  timeout: HTTP.TIMEOUT,
  credentials: 'include',
};

// ------------------------------------------------------------------
// Response envelope — core-be wraps every success as { data, meta }
// ------------------------------------------------------------------
/** Cursor-pagination block carried on list responses (inside `meta.pagination`). */
interface PaginationMeta {
  per_page: number;
  next: string | null;
  has_more: boolean;
  estimated_total?: number;
}
/** The `meta` object returned alongside every core-be success response. */
export interface ResponseMeta {
  request_id?: string;
  pagination?: PaginationMeta;
}
/** What every apiClient method resolves to: the unwrapped payload + its meta. */
interface HttpResponse<T> {
  data: T;
  meta?: ResponseMeta;
}

/**
 * core-be envelopes every success body as `{ data, meta }`. Detect that shape
 * so we can unwrap to the payload; anything else passes through untouched
 * (defensive — e.g. a non-enveloped legacy or third-party response).
 */
function isEnvelope(value: unknown): value is { data: unknown; meta?: ResponseMeta } {
  return (
    typeof value === 'object' && value !== null && 'data' in value && 'meta' in value
  );
}

/**
 * The bearer token is a credential, so it must never leave the configured API
 * origin. Pin it: a request only carries `Authorization` when its resolved URL
 * targets the API origin. This stops a stray absolute URL — a future bug, a
 * server-supplied `next` cursor used verbatim, or a compromised dependency that
 * builds a URL — from exfiltrating the access token to a foreign host. (In dev
 * `apiBaseUrl` is empty → the API origin is the app's own origin.)
 */
export function isApiOriginUrl(resolvedUrl: string): boolean {
  const here =
    typeof globalThis.location === 'undefined' ? undefined : globalThis.location.origin;
  try {
    const target = new URL(resolvedUrl, here).origin;
    const apiBase = new URL(defaultConfig.baseURL || '/', here).origin;
    return target === apiBase;
  } catch {
    return false;
  }
}

// No X-Organization-ID header: the backend scopes organization context from the
// signed `org` claim in the access token (set via /auth/switch-to-organization),
// not from a header or URL segment. (The upload domain is the lone server-side
// reader of that header; the SPA never needs to send it.)
function buildHeaders(
  url: string,
  idempotencyKey?: string,
  customHeaders?: HeadersInit,
): Headers {
  const headers = new Headers(customHeaders);
  headers.set('Content-Type', 'application/json');
  headers.set('X-Requested-With', 'XMLHttpRequest');
  headers.set('X-Request-ID', generateRequestId());
  if (idempotencyKey) {
    // core-be requires `X-Idempotency-Key` (min 16 chars) on its write routes.
    headers.set('X-Idempotency-Key', idempotencyKey);
  }

  const accessToken = getAccessToken();
  if (accessToken && isApiOriginUrl(url)) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }
  return headers;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      credentials: defaultConfig.credentials,
    });
    return res;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function parseErrorResponse(
  response: Response,
  url: string,
  method: string,
): Promise<HttpError> {
  let data: unknown;
  const ct = response.headers.get('Content-Type');
  try {
    const text = await response.text();
    if (ct?.includes('application/json') && text) {
      data = JSON.parse(text) as unknown;
    } else {
      data = text;
    }
  } catch {
    data = undefined;
  }
  const message =
    (data as { message?: string } | undefined)?.message ??
    (response.statusText || `HTTP ${response.status}`);
  return new HttpError(message, response.status, url, method, data);
}

/** Idempotent methods: safe to retry on connection/5xx (no body or same body). */
const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE']);

/**
 * Classify a thrown fetch error. Timeouts (the `fetchWithTimeout` deadline) are
 * deliberately distinguished from connection failures so they are NOT retried
 * into piled latency (audit 3.3). Anything else is non-retryable.
 */
function classifyFetchError(err: unknown): 'timeout' | 'connection' | 'other' {
  if ((err as Error)?.name === 'AbortError') return 'timeout';
  if (err instanceof TypeError) return 'connection';
  return 'other';
}

function exponentialDelay(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 30_000);
}

/** Dev-only retry trace (kept out of the hot path to bound its complexity). */
function logRetry(attempt: number, url: string, suffix = ''): void {
  if (platformConfig.debugLogging) {
    console.warn(`[HTTP] Retry attempt ${attempt + 1} for ${url}${suffix}`);
  }
}

/** `Retry-After` header (delta-seconds) → ms, when present and finite. */
function parseRetryAfterMs(response: Response): number | null {
  const header = response.headers.get('Retry-After');
  if (!header) return null;
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : null;
}

/**
 * One unified retry budget for a logical request (audit 3.1–3.3): the delay (ms)
 * before the next attempt, or `null` to stop and surface the error. A single
 * `attempt` counter spans BOTH connection-error and bad-status retries, so the
 * total is always bounded by `MAX_RETRIES`.
 *
 * - **429** → honor `Retry-After` at most ONCE and only within the cap; never
 *   exponential-spam the limiter — otherwise surface to `RateLimitNotice` now.
 * - **timeouts / other errors** → never retried.
 * - **connection errors + 5xx** → exponential backoff, idempotent methods only.
 */
function nextRetryDelay(args: {
  method: string;
  attempt: number;
  status: number | null;
  errorKind: 'timeout' | 'connection' | 'other' | null;
  response?: Response;
}): number | null {
  const { method, attempt, status, errorKind, response } = args;
  if (attempt >= HTTP.MAX_RETRIES) return null;
  if (status === 429) {
    if (attempt >= 1 || !response) return null;
    const retryAfter = parseRetryAfterMs(response);
    return retryAfter !== null && retryAfter <= HTTP.MAX_RETRY_AFTER_MS
      ? retryAfter
      : null;
  }
  if (errorKind === 'timeout' || errorKind === 'other') return null;
  const retryable = errorKind === 'connection' || (status !== null && status >= 500);
  return retryable && IDEMPOTENT_METHODS.has(method) ? exponentialDelay(attempt) : null;
}

function buildRequestUrl(path: string): string {
  if (path.startsWith('http')) return path;
  const base = defaultConfig.baseURL.replace(/\/$/, '');
  const sep = path.startsWith('/') ? '' : '/';
  return `${base}${sep}${path}`;
}

/**
 * 401 handler: refresh once via the SHARED single-flight in shared/auth
 * (the only code path allowed to call /auth/refresh — see
 * `refreshAccessToken`'s remarks on rotation + reuse-detection), then replay
 * the original request. Concurrent 401s all await the same in-flight refresh.
 * A failed refresh means the session is gone: clear local auth and bail.
 */
async function doRefreshAndReplay<T>(
  replay: () => Promise<HttpResponse<T>>,
): Promise<HttpResponse<T>> {
  try {
    await refreshAccessToken();
  } catch (refreshError) {
    forceLogout();
    throw refreshError;
  }
  return replay();
}

/** Parse a 2xx body: empty → undefined; JSON → unwrap the core-be envelope. */
async function parseJsonBody<T>(
  response: Response,
  url: string,
  method: string,
): Promise<HttpResponse<T>> {
  const text = await response.text();
  if (!text) {
    return { data: undefined as T };
  }
  const contentType = response.headers.get('Content-Type') ?? '';
  if (!(contentType.includes('application/json') || contentType.includes('+json'))) {
    throw new HttpError(
      'Expected JSON response',
      response.status,
      url,
      method,
      text.slice(0, 200),
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new HttpError(
      'Invalid JSON response',
      response.status,
      url,
      method,
      text.slice(0, 200),
    );
  }
  // core-be wraps every success as { data, meta }: unwrap to the payload and
  // surface meta (request_id, pagination). Non-enveloped bodies pass through.
  if (isEnvelope(parsed)) {
    return { data: parsed.data as T, meta: parsed.meta };
  }
  return { data: parsed as T };
}

/** Write methods carry an auto-generated X-Idempotency-Key (server de-dupes). */
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options?: { skip401?: boolean },
): Promise<HttpResponse<T>> {
  const url = buildRequestUrl(path);
  const isRefreshUrl =
    path === API_ENDPOINTS.AUTH.REFRESH || url.endsWith(API_ENDPOINTS.AUTH.REFRESH);
  // Minted once per logical request: retries and the post-refresh replay all
  // send the SAME key, so the server can collapse duplicates.
  const idempotencyKey = WRITE_METHODS.has(method) ? crypto.randomUUID() : undefined;

  function fetchOnce(): Promise<Response> {
    const headers = buildHeaders(url, idempotencyKey);
    const init: RequestInit = {
      method,
      headers,
      ...(body !== undefined && { body: JSON.stringify(body) }),
    };
    return fetchWithTimeout(url, init, defaultConfig.timeout);
  }

  // Single attempt budget shared by connection-error AND bad-status retries.
  const run = async (attempt = 0, hasRefreshed = false): Promise<HttpResponse<T>> => {
    let response: Response;
    try {
      response = await fetchOnce();
    } catch (err) {
      const errorKind = classifyFetchError(err);
      const delay = nextRetryDelay({ method, attempt, status: null, errorKind });
      if (delay !== null) {
        await new Promise((r) => setTimeout(r, delay));
        logRetry(attempt, url, `: ${(err as Error)?.message ?? ''}`);
        return run(attempt + 1, hasRefreshed);
      }
      throw new HttpError(
        (err as Error)?.message ?? 'Network error',
        0,
        url,
        method,
        undefined,
      );
    }

    if (response.status === 401 && !options?.skip401 && !isRefreshUrl) {
      if (hasRefreshed) {
        // The replay carried a freshly-minted token and was still rejected:
        // the session is genuinely dead (revoked / logout-all / expiry).
        // Never refresh-loop — clear local auth and surface the error.
        forceLogout();
        throw await parseErrorResponse(response, url, method);
      }
      return doRefreshAndReplay(() => run(0, true));
    }

    if (!response.ok) {
      const delay = nextRetryDelay({
        method,
        attempt,
        status: response.status,
        errorKind: null,
        response,
      });
      if (delay !== null) {
        await new Promise((r) => setTimeout(r, delay));
        logRetry(attempt, url, ` (${response.status})`);
        return run(attempt + 1, hasRefreshed);
      }
      throw await parseErrorResponse(response, url, method);
    }

    return parseJsonBody<T>(response, url, method);
  };

  return run();
}

// ------------------------------------------------------------------
// Public API (axios-like: .get().then(r => r.data))
// ------------------------------------------------------------------
export interface HttpClient {
  get: <T>(url: string, options?: { skip401?: boolean }) => Promise<HttpResponse<T>>;
  post: <T>(
    url: string,
    body?: unknown,
    options?: { skip401?: boolean },
  ) => Promise<HttpResponse<T>>;
  put: <T>(
    url: string,
    body?: unknown,
    options?: { skip401?: boolean },
  ) => Promise<HttpResponse<T>>;
  patch: <T>(
    url: string,
    body?: unknown,
    options?: { skip401?: boolean },
  ) => Promise<HttpResponse<T>>;
  delete: <T>(url: string, options?: { skip401?: boolean }) => Promise<HttpResponse<T>>;
}

function createHttpClient(_overrides?: Partial<HttpClientConfig>): HttpClient {
  return {
    get: <T>(path: string, options?: { skip401?: boolean }) =>
      request<T>('GET', path, undefined, options),
    post: <T>(path: string, body?: unknown, options?: { skip401?: boolean }) =>
      request<T>('POST', path, body, options),
    put: <T>(path: string, body?: unknown, options?: { skip401?: boolean }) =>
      request<T>('PUT', path, body, options),
    patch: <T>(path: string, body?: unknown, options?: { skip401?: boolean }) =>
      request<T>('PATCH', path, body, options),
    delete: <T>(path: string, options?: { skip401?: boolean }) =>
      request<T>('DELETE', path, undefined, options),
  };
}

export const apiClient = createHttpClient();

export { isUnauthorized } from '@/shared/errors/HttpError.ts';
