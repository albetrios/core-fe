import { ERRORS_KEYS, ERRORS_NS } from '@/lib/i18n/errors.constants.ts';
import i18n from '@/lib/i18n/i18n.ts';
import { AppError } from '@/shared/errors/AppError.ts';
import { isHttpError } from '@/shared/errors/HttpError.ts';
import { resolveKnownFrontendError } from '@/shared/errors/map-frontend-error.ts';
import { notify } from '@/shared/notify/index.ts';
import { useAuthStore } from '@/shared/store/useAuthStore/index.ts';
import { useOrganizationStore } from '@/shared/store/useOrganizationStore/index.ts';

/**
 * Global error handler — reports errors to Sentry with user/organization context.
 * Only sends user.id for identification (no email/PII).
 */
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  const user = useAuthStore.getState().user;
  const organization = useOrganizationStore.getState();

  // Lazy on purpose: a static import would drag the whole Sentry chunk into
  // the entry preload graph. By the time errors flow, the idle bootstrap
  // (main.tsx) has usually loaded it — this resolves from the module cache.
  import('@sentry/react')
    .then((Sentry) => {
      Sentry.withScope((scope) => {
        if (user) {
          // Only send user ID — no PII (email, name) to Sentry
          scope.setUser({ id: user.id });
        }

        if (organization.organizationId) {
          scope.setTag('organization_id', organization.organizationId);
          scope.setTag('organization_slug', organization.organizationSlug ?? 'unknown');
        }

        if (context) {
          scope.setExtras(context);
        }

        if (error instanceof AppError) {
          scope.setTag('error_code', error.code);
          scope.setExtra('status_code', error.statusCode);
        }

        if (isHttpError(error)) {
          scope.setExtra('url', error.url);
          scope.setExtra('method', error.method);
          scope.setExtra('status', error.status);
          // Do NOT log response body — may contain PII
        }

        Sentry.captureException(error);
      });
    })
    .catch(() => {
      /* error reporting must never throw */
    });
}

const HTTP_STATUS_KEYS: Record<number, string> = {
  400: ERRORS_KEYS.api.http400,
  401: ERRORS_KEYS.api.http401,
  403: ERRORS_KEYS.api.http403,
  404: ERRORS_KEYS.api.http404,
  409: ERRORS_KEYS.api.http409,
  422: ERRORS_KEYS.api.http422,
  429: ERRORS_KEYS.api.http429,
  500: ERRORS_KEYS.api.http500,
  502: ERRORS_KEYS.api.http502,
  503: ERRORS_KEYS.api.http503,
};

function tError(key: string): string {
  return i18n.t(key, { ns: ERRORS_NS });
}

function statusFallbackMessage(status: number): string {
  /* eslint-disable security/detect-object-injection -- status is validated HTTP status code */
  const key = HTTP_STATUS_KEYS[status];
  /* eslint-enable security/detect-object-injection */
  return key ? tError(key) : tError(ERRORS_KEYS.api.fallback);
}

const SQL_RE = /\b(select|insert|update|delete|drop|union|where)\b/i;
const PATH_RE = /[/\\]{2,}/;
const STACK_RE = /\.\w{2,4}:\d+/;

/**
 * Sanitize a server-provided error message.
 * Rejects messages that look like leaked internals (SQL, stack traces, file paths).
 */
function sanitizeServerMessage(message: string, status: number): string {
  const fallback = statusFallbackMessage(status);

  if (message.length > 200) return fallback;
  if (SQL_RE.test(message) || PATH_RE.test(message) || STACK_RE.test(message))
    return fallback;
  return message;
}

/** Core-be error envelope fields read from an HttpError response body. */
interface ApiErrorEnvelope {
  /** Machine-readable code for branching (e.g. 'invalid_credentials'). */
  reason?: string;
  /** Human-readable detail safe to surface to the user. */
  detail?: string;
  /** Bare `{ message }` body (non-enveloped responses). */
  message?: string;
}

function readEnvelope(data: unknown): ApiErrorEnvelope {
  if (!data || typeof data !== 'object') return {};
  const body = data as { error?: unknown; message?: unknown };
  const err = (typeof body.error === 'object' && body.error ? body.error : {}) as {
    reason?: unknown;
    detail?: unknown;
  };
  return {
    reason: typeof err.reason === 'string' ? err.reason : undefined,
    detail: typeof err.detail === 'string' ? err.detail : undefined,
    message: typeof body.message === 'string' ? body.message : undefined,
  };
}

/**
 * The machine-readable error `reason` code (core-be error envelope) for
 * branching logic — e.g. mapping a specific failure to a field error. Returns
 * `undefined` when absent or the error is not an HTTP error.
 */
export function apiErrorReason(error: unknown): string | undefined {
  return isHttpError(error) ? readEnvelope(error.data).reason : undefined;
}

/**
 * Map any thrown value to ONE user-facing message — the single source of error
 * wording for `notify` and inline form errors. Prefers the core-be human
 * `error.detail`, then a bare `message`, then a status-based fallback; server
 * strings are sanitized so internals (SQL / stack / paths) never leak.
 */
export function mapApiError(error: unknown): string {
  const known = resolveKnownFrontendError(error);
  if (known) return known;

  if (error instanceof AppError) return error.message;

  if (isHttpError(error)) {
    const env = readEnvelope(error.data);
    const serverMessage = env.detail ?? env.message;
    if (typeof serverMessage === 'string') {
      return sanitizeServerMessage(serverMessage, error.status);
    }
    return statusFallbackMessage(error.status);
  }

  if (error instanceof Error) return error.message;

  return tError(ERRORS_KEYS.api.unexpected);
}

/**
 * Toast a user-facing error through the single `notify` surface, with the
 * message run through {@link mapApiError}. Used by the global query/mutation
 * error handlers (opt-in via `meta.notifyOnError`) and any catch site that wants
 * the standard wording without re-deriving it.
 */
export function notifyError(error: unknown, opts?: { id?: string | number }): void {
  notify.error(mapApiError(error), opts);
}

/**
 * The failure surface for a read that must not move the layout it lives in.
 *
 * App chrome — the org switcher, the verification banner, the nav — cannot be
 * swapped for an error card without reflowing the header around a control the
 * user is mid-reach for. One toast says the same thing beside it and moves
 * nothing, and its action re-runs the query that failed, so the message is
 * something the user can act on rather than just read (X-1).
 */
export function notifyQueryError(
  error: unknown,
  opts: { id: string; onRetry: () => void },
): void {
  notify.error(mapApiError(error), {
    id: opts.id,
    action: {
      label: i18n.t(ERRORS_KEYS.frontend.query.retry, { ns: ERRORS_NS }),
      onClick: opts.onRetry,
    },
  });
}
