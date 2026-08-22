/**
 * Derive a CSP connect-src origin from VITE_API_BASE_URL.
 * Returns null for empty, invalid, or same-origin-relative URLs.
 */
export function getCspConnectSrcOrigin(apiBaseUrl: string | undefined): string | null {
  const trimmed = apiBaseUrl?.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

/** CSP connect-src fragment to inject after 'self' (leading newline + spaces optional). */
export function formatCspApiConnectSrcFragment(apiBaseUrl: string | undefined): string {
  const origin = getCspConnectSrcOrigin(apiBaseUrl);
  if (!origin) return '';
  return `\n               ${origin}`;
}

/**
 * Third-party origins the app must reach (observability + analytics). Kept in
 * lock step with the connect-src list in index.html's meta CSP — the static
 * security test asserts they agree on shared directives.
 *
 * **`upgrade-insecure-requests`** is header-only (`buildContentSecurityPolicy` →
 * `dist/_headers`). It is omitted from the index.html meta fallback because
 * Safari/WebKit upgrades `http://localhost` subresources to HTTPS and breaks
 * local preview; Netlify always serves over HTTPS where the header applies.
 */
/**
 * Cloudflare Turnstile origin. The invisible captcha widget loads its script from here and
 * renders the challenge in a same-origin iframe, so this host is allowlisted in both
 * `script-src` and `frame-src`. Kept in lock step with the meta CSP in index.html.
 */
const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com';

/** Stripe.js + Payment Element (script, frames, API calls). */
const STRIPE_ORIGINS = [
  'https://js.stripe.com',
  'https://hooks.stripe.com',
  'https://api.stripe.com',
  'https://m.stripe.com',
  'https://m.stripe.network',
] as const;

/**
 * PostHog serves its analytics API from us.i.posthog.com and lazy-loads
 * additional scripts (array/config.js, surveys.js, …) from us-assets — so this
 * host must be in BOTH connect-src and script-src, or the browser blocks the
 * script loads (a real CSP violation seen on the deployed login page).
 */
const POSTHOG_ASSETS_ORIGIN = 'https://us-assets.i.posthog.com';

const CONNECT_SRC_THIRD_PARTY = [
  'https://*.ingest.sentry.io',
  'https://*.sentry.io',
  'https://us.i.posthog.com',
  POSTHOG_ASSETS_ORIGIN,
  // Have I Been Pwned range API — k-anonymity password breach check on the
  // register/reset forms (only a hash prefix is ever sent). See
  // `lib/password-breach.ts`.
  'https://api.pwnedpasswords.com',
  ...STRIPE_ORIGINS,
] as const;

/**
 * The canonical Content-Security-Policy as a single-line header value.
 *
 * This is the authoritative, header-delivered policy (index.html's meta CSP is
 * a parse-time fallback). Header delivery applies before the document parses
 * and — unlike a meta tag — can carry reporting directives. `frame-ancestors`
 * is included here because it only works as a header.
 *
 * @param apiBaseUrl - VITE_API_BASE_URL; its origin is added to connect-src.
 * @param reportUri - optional CSP violation collector; adds report-uri + report-to.
 */
export function buildContentSecurityPolicy(
  apiBaseUrl: string | undefined,
  reportUri?: string,
): string {
  const apiOrigin = getCspConnectSrcOrigin(apiBaseUrl);
  const connectSrc = [
    "'self'",
    ...(apiOrigin ? [apiOrigin] : []),
    ...CONNECT_SRC_THIRD_PARTY,
  ];

  const directives = [
    "default-src 'self'",
    // Cloudflare Turnstile: the challenge script is loaded from challenges.cloudflare.com
    // and renders inside an iframe from the same origin (frame-src below).
    `script-src 'self' ${TURNSTILE_ORIGIN} ${STRIPE_ORIGINS[0]} ${POSTHOG_ASSETS_ORIGIN}`,
    "style-src 'self' 'unsafe-inline'",
    `connect-src ${connectSrc.join(' ')}`,
    "img-src 'self' data: blob:",
    "font-src 'self'",
    // Cloudflare Turnstile runs its challenge in a Web Worker created from a `blob:` URL.
    // With `worker-src 'self'` the browser blocks that worker and the challenge cannot
    // complete, so the widget renders "Verification failed" and never mints a token —
    // every captcha-gated auth request then 401s with `captchaRequired`. Sentry's session
    // replay worker is created the same way.
    "worker-src 'self' blob:",
    `frame-src ${TURNSTILE_ORIGIN} ${STRIPE_ORIGINS[0]} ${STRIPE_ORIGINS[1]}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ];

  if (reportUri) {
    directives.push(`report-uri ${reportUri}`, 'report-to csp');
  }

  return directives.join('; ');
}

/**
 * Trusted Types policy, shipped **report-only** as a staged rollout.
 *
 * `require-trusted-types-for 'script'` makes the browser flag any DOM script
 * sink (`innerHTML`, `eval`, …) that receives a plain string instead of a
 * Trusted Type — a structural DOM-XSS defense layered on top of
 * `script-src 'self'`. Delivered via a `Content-Security-Policy-Report-Only`
 * header (header-only — `http-equiv` can't carry report-only), so violations
 * are COLLECTED, not enforced: React 19 is Trusted-Types-aware, but Sentry /
 * PostHog may use sinks, so we observe first. Flip to the enforcing CSP once
 * the violation stream is clean. `trusted-types` policy names are intentionally
 * unconstrained while reporting — that is what we are here to discover.
 *
 * @param reportUri - optional collector; adds report-uri + report-to.
 */
export function buildTrustedTypesReportOnlyPolicy(reportUri?: string): string {
  const directives = ["require-trusted-types-for 'script'"];
  if (reportUri) {
    directives.push(`report-uri ${reportUri}`, 'report-to csp');
  }
  return directives.join('; ');
}
