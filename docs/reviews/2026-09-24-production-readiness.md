# Production readiness review — 2026-09-24

> Point-in-time snapshot of what is still pending after a production-readiness pass over `main` at
> `6e055a9`. The backend half is core-be's review of the same date, in its `docs/reviews/`
> folder. Add a new dated file for the next review rather than rewriting this one.
>
> **Security and privacy findings are not listed here.** This repository is public, so 6 of them are
> tracked privately and will be recorded here once they are fixed.

## How to read this

- **Blocker:** fix before real users.
- **Needs an operator:** a change outside the repository (hosting, dashboards, GitHub Environments) or a
  decision.
- **Should fix:** can follow soon after launch.
- _Unverified_ marks findings from code review that still need a check against the live setup.

## Done during the review

- [x] The README no longer names an API host that never existed (#364).

## Blockers

- [ ] **Sessions on the hosted development site don't survive a reload** (shared with core-be).
  - **Problem:** the hosted development frontend and API are served from different sites, and the API's
    session cookie is `SameSite=strict` by default. The refresh cookie is then neither stored nor sent,
    so a reload, or the 15-minute access-token expiry, signs the user out. Safari and iOS would block the
    cookie even with `SameSite=None`. _(From config and code; not tested with a sign-in.)_
  - **Fix (frontend half):** serve the frontend from the same site as the API. The intended development
    host is already in the API's allowed origins but has no valid certificate on Netlify: fix the
    certificate and use that host. Keep production same-site as well. core-be's review covers the
    backend half.
- [ ] **The CSP blocks remote images and uploads.**
  - **Problem:** the CSP only allows images from the app itself (`img-src 'self' data: blob:`) and has
    no storage origin in `connect-src`. Google and GitHub avatars and uploaded logos can't display, and
    uploads, a direct PUT to the presigned S3 URL, will fail once storage is configured.
  - **Fix:** pass the storage/media origin and the avatar hosts (`lh3.googleusercontent.com`,
    `avatars.githubusercontent.com`) into the CSP builder (`src/lib/csp-api-origin.ts` and `index.html`).
    Check that S3 CORS allows the frontend origin, and add an upload end-to-end test.

## Needs an operator

- [ ] **The production frontend calls a removed API.** The production site is live, but its build's
      `VITE_API_BASE_URL` (a secret in the production GitHub Environment) points at a production API that
      has been removed. Take the site down, or rebuild it against a live API.
- [ ] **Stale variable.** The development GitHub Environment variable `VITE_APP_ENV=production` is
      unused, because the deploy sets `VITE_APP_ENV` from the environment name, and it is misleading.
      Delete it.

## Should fix

- [ ] **Any refresh hiccup signs the user out.** In `src/core/http/fetch-client.ts`, a timeout, a 502 or
      a load-shedding 503 on refresh all call `forceLogout()`. Log out only when the refresh is rejected
      (401 or 403), and back off otherwise.
- [ ] **Route crashes aren't reported.** `RouteErrorBoundary` doesn't call `reportError`, and it shows the
      raw `error.message` to the user.
- [ ] **Boot failures are silent.** Sentry starts after the splash screen, so an early throw leaves the
      spinner up and goes unreported. The post-deploy smoke test only checks the HTML.
- [ ] **Retries multiply up to 12×** on a failing GET: 4 fetch-client attempts × 3 React Query attempts.
      Turn off React Query retries for 5xx and network errors.
- [ ] **Sentry config.** The release name differs between the source-map upload and `init`, and
      `VITE_SENTRY_DSN` is optional in production.
- [ ] **Placeholder dashboard data.** 16 widgets show "Sample data" (`dashboard.placeholder-data.ts`),
      and `docs/deployment/production-readiness.md` lists this as a launch blocker.
- [ ] **i18n:**
  - Hard-coded English strings in about 10 components: InviteMemberDialog, CreateRoleDialog,
    CreateOrganizationDialog, the DataTable toolbar and column header, OfflineIndicator,
    StripePaymentForm, RateLimitNotice, ConfirmDialog and AppearanceDialog.
  - Production builds English only, because `BUILD_I18N_MODE` is unset. Set it to `multi` if Spanish
    should ship.
- [ ] **Tests that never gate anything.** The 41 Playwright specs, including axe, cross-tab and
      network-resilience, never run in CI. Lighthouse and the cross-browser smoke run weekly and don't
      block.
- [ ] **Mutation testing has failed 5 weeks running.** `.mcp.json` is a tracked symlink to a gitignored
      file, so Stryker's sandbox copy fails. Add `.mcp.json` to `ignorePatterns` in `stryker.config.json`,
      delete the unused duplicate `stryker.config.mjs`, and pin the Stryker install.
- [ ] **Deploy docs describe a laptop / Netlify-build path** that bypasses the release gates and
      environment validation: `docs/deployment/netlify-cli-setup.md`, `deployment-and-pre-launch.md`,
      `runbook-local-to-production.md` and `README.md`.
- [ ] **A latent CORS break.** Sentry's `tracePropagationTargets` matches `https://api.*`, but core-be's
      CORS doesn't allow the `sentry-trace` and `baggage` headers. Derive the target from the API URL, and
      allow both headers in core-be.
- [ ] **Nice to have:**
  - The offline page is never served (the cache key in `sw.ts`).
  - The security headers are set in both `netlify.toml` and `public/_headers`.
  - `Permissions-Policy: payment=()` hides Apple Pay and Google Pay in the Stripe form.
  - The CSP hard-codes the US PostHog hosts, although `VITE_POSTHOG_HOST` is configurable.
  - The root `.size-limit.json` is unused; the real budgets live in `tooling/ci/run-size-limit.mjs`.

## Carried over from earlier

- [ ] **Release** #328 (1.10.0): merge when you mean to release.

SonarQube in PR CI is deferred by decision, so it isn't listed as pending.

## Verified OK

- **CI and dependencies:** CI is green on `main`. There are no open Dependabot or code-scanning alerts,
  and `pnpm audit` is clean.
- **Production switches:** captcha is on; devtools, E2E hooks and debug logging are off.
- **Security headers:** CSP, HSTS with preload, nosniff, frame options, Referrer-Policy,
  Permissions-Policy and COOP are all served.
- **Code:** hidden source maps; access tokens kept in memory only; logout and cross-tab handling;
  redirect safety; error boundaries at app and widget level; PostHog only after consent; en/es key
  parity.
- **Blocking CI checks:** lint, types, unit tests with 90% patch coverage, component-level axe, bundle
  size, gitleaks, Trivy and dependency review.
