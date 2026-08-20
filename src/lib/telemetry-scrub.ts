/**
 * Telemetry URL scrubbing — keeps single-use secrets out of third-party
 * stores. Reset/verify links carry `?token=`; the pages strip it from the
 * address bar on mount, but telemetry booted in the same window can capture
 * the URL first (Sentry `request.url` + breadcrumbs, PostHog `$current_url`
 * and `$set_once` person props). Every outgoing event passes through here.
 */

/** Query params whose values are single-use secrets. */
// `token` covers invite / reset / verify-email links. The Stripe
// `*_client_secret` params land in the billing-return URL — Stripe documents
// that they must never be logged or embedded in URLs, and `capture_pageview`
// records `$current_url` before the billing panel strips them, so without this
// they would reach PostHog/Sentry.
const SENSITIVE_QUERY_PARAMS = [
  'token',
  // OAuth authorization grant, on the SPA `/callback` URL. `code` is a single-use
  // credential and `state` the single-use CSRF nonce; telemetry booted in the same
  // window records the URL as `$current_url` / the Sentry pageload URL before the
  // page can strip it.
  'code',
  'state',
  'payment_intent_client_secret',
  'setup_intent_client_secret',
];

const FILTERED = '[Filtered]';

// `[?&#]` anchors a real param boundary (so `access_token=` never matches
// the `token` rule); values never contain `&` or `#`. Bounded character
// classes — no backtracking risk. Literal regexes on purpose; when adding a
// param, add BOTH a pattern here and the name above (the static security
// lint forbids dynamically-built RegExps).
const PARAM_PATTERNS = [
  /([?&#]token=)[^&#]*/gi,
  // The `[?&#]` anchor is what keeps these from over-matching: `error_code=` and
  // `zipcode=` do not start at a param boundary, so neither matches the `code` rule.
  /([?&#]code=)[^&#]*/gi,
  /([?&#]state=)[^&#]*/gi,
  /([?&#]payment_intent_client_secret=)[^&#]*/gi,
  /([?&#]setup_intent_client_secret=)[^&#]*/gi,
];

/** Replace sensitive query-param values in a URL(-ish) string. */
export function scrubSensitiveUrl(url: string): string {
  let out = url;
  for (const pattern of PARAM_PATTERNS) {
    out = out.replace(pattern, `$1${FILTERED}`);
  }
  return out;
}

/** Cheap gate: does this string even mention a sensitive param? */
export function hasSensitiveParams(value: string): boolean {
  return SENSITIVE_QUERY_PARAMS.some((param) => value.includes(`${param}=`));
}

/**
 * Scrub every string value in a JSON-ish record (nested objects included) —
 * the shape of PostHog `event.properties`, where URLs hide in `$current_url`,
 * `$referrer`, and nested `$set_once` person props.
 */
export function scrubObjectUrls(record: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === 'string' && hasSensitiveParams(value)) {
      // Reflect.set instead of record[key]: keys come from Object.entries
      // (never attacker-chosen paths), and this shape keeps the static
      // object-injection lint quiet without a disable.
      Reflect.set(record, key, scrubSensitiveUrl(value));
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      scrubObjectUrls(value as Record<string, unknown>);
    }
  }
}

type ScrubbableBreadcrumb = { data?: Record<string, unknown> };

/**
 * Structural slice of a Sentry event (errors AND transactions both fit).
 * Structural on purpose: `lib/` must never statically import
 * `@sentry/react` — it is a deferred chunk kept off the first-paint path.
 */
type ScrubbableEvent = {
  request?: { url?: string };
  breadcrumbs?: ScrubbableBreadcrumb[];
};

/** Scrub request + breadcrumb URLs on a Sentry-shaped event, in place. */
export function scrubEventUrls<E extends ScrubbableEvent>(event: E): E {
  if (event.request?.url) {
    event.request.url = scrubSensitiveUrl(event.request.url);
  }
  if (event.breadcrumbs) {
    for (const crumb of event.breadcrumbs) {
      if (crumb.data) scrubObjectUrls(crumb.data);
    }
  }
  return event;
}
