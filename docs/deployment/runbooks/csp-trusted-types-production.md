# Runbook — CSP, Trusted Types, and config.js SRI (production)

Operational checklist for promoting security headers beyond the defaults built
into core-fe. Source of truth for policy strings:
[`src/lib/csp-api-origin.ts`](../../../src/lib/csp-api-origin.ts). Narrative:
[`docs/reference/security-model.md`](../../reference/security-model.md).

---

## Pre-flight

- [ ] Production API origin is injected at build (`VITE_*` / `config.js`) and
      appears in header `connect-src`.
- [ ] Analytics origins (PostHog, Sentry ingest) are listed in `connect-src` if
      enabled for the environment.
- [ ] `frame-ancestors 'none'` is present (header — meta CSP cannot carry it).

---

## CSP report URI

1. Create a CSP ingest endpoint (Sentry → **Settings → Security Headers → CSP**,
   or your SIEM).
2. Set `VITE_CSP_REPORT_URI` in the production environment / `config.js` payload.
3. Deploy and verify the build emits:
   - `report-uri` / `report-to` on the **enforcing** CSP header (`dist/_headers`)
   - `Reporting-Endpoints` header when report URI is set
4. Trigger a harmless violation in staging (e.g. blocked inline script in a test
   page) and confirm the report arrives.
5. **Production checklist:**
   - [ ] Reports flowing for 7+ days without noise from first-party scripts
   - [ ] On-call runbook links to the ingest dashboard
   - [ ] Alert on spike (possible XSS attempt or deploy regression)

---

## Trusted Types promotion

Shipped **report-only** today via `Content-Security-Policy-Report-Only`:

```http
require-trusted-types-for 'script'
```

**Precondition — finish [CSP report URI](#csp-report-uri) first.** This header
ships on every deploy whether or not a collector exists, but it carries
`report-uri`/`report-to` only when `VITE_CSP_REPORT_URI` is set. Unset, each
violation goes to that one visitor's DevTools console and is never aggregated,
so step 3 below has nothing to measure. `pnpm validate:client-env` warns (does
not fail) on a deploy environment in that state.

1. Monitor report-only violations through the same `VITE_CSP_REPORT_URI` stream.
2. Triage third-party scripts (Sentry, PostHog) — upgrade or nonce-wrap if they
   emit violations.
3. When the violation rate is **zero sustained** for a release window:
   - Move `require-trusted-types-for 'script'` into the **enforcing** policy in
     `buildContentSecurityPolicy` (`lib/csp-api-origin.ts`)
   - Remove or narrow report-only duplicate after one clean deploy
4. **Rollback:** revert enforcing line; keep report-only until fixed.

Report-only is **header-only** — no `http-equiv` meta fallback.

---

## config.js Subresource Integrity (SRI)

`public/config.js` is a placeholder; production **Docker/Netlify entrypoint**
generates the live file with `window.__CONFIG__`.

**Contract (deploy pipeline — not in app repo):**

1. Generate `config.js` with runtime env (API base URL, feature flags, …).
2. Compute `sha384-<base64>` of the **exact bytes** served.
3. Write `index.html` (or post-process dist) so the script tag includes:

   ```html
   <script src="/config.js" integrity="sha384-…" crossorigin="anonymous"></script>
   ```

4. Cache-bust or immutable-cache only when hash changes together with HTML.

**Do not** add SRI in the Vite source template — the hash is unknown at build
time. Same-origin `script-src 'self'` remains the in-repo baseline.

**Verify after deploy:**

- [ ] View source shows matching `integrity` on `/config.js`
- [ ] Tampering one byte in `config.js` causes browser refusal to execute
- [ ] App still reads `window.__CONFIG__` when hash matches

---

## Related CI / tests

- `tests/security/static-security-config.security.test.ts` — CSP header shape
- `pnpm build` → inspect `dist/_headers` and `index.html` meta fallback
