# Testing — full matrix (core-fe)

Single reference for **every test kind** in this repo: where it lives, how to run it, and which skill/doc governs it.

## Two layers

| Layer                  | Tool         | Location               | Pattern              | Command               | Server                                |
| ---------------------- | ------------ | ---------------------- | -------------------- | --------------------- | ------------------------------------- |
| **Unit / component**   | Vitest + RTL | Colocated under `src/` | `*.test.ts(x)`       | `pnpm test:unit`      | None — `vi.mock()` only               |
| **Security tripwires** | Vitest       | `tests/security/`      | `*.security.test.ts` | `pnpm test:security`  | None                                  |
| **CI-flow policy**     | Vitest       | `tests/ci/`            | `*.policy.test.ts`   | `pnpm test:ci-policy` | None — reads workflow/config files    |
| **E2E**                | Playwright   | `tests/e2e/`           | `*.e2e.test.ts`      | `pnpm test:e2e`       | **core-be** on `:3000` (**required**) |

**Never** use `.spec.ts` or the words `real`/`live` in test file names.

## Unit tests

- Colocated beside source: `Component.tsx` → `Component.test.tsx`
- jsdom — no browser, no HTTP server
- Stub with `vi.mock()` (API modules, hooks, `dataProvider`, router)
- `renderWithProviders` from `tests/utils/`
- `vitest-axe` required on components (`toHaveNoViolations()`)

Details: `agent-os/rules/testing-requirements.mdc`, `agent-os/skills/test-generation/SKILL.md`.

## E2E tests (Playwright)

All specs live in `tests/e2e/*.e2e.test.ts`. One command: `pnpm test:e2e`.

**Prerequisite:** **core-be** running on `:3000` (`GET /readyz` must succeed). `tests/e2e/global-setup.ts` fails fast if core-be is down — there is no skip path.

### Local run — required env & steps (authoritative)

Run the suites this way; do not improvise other env. **All values live in each repo's
`.env.local`** (the gitignored dev file, `NODE_ENV=local`) — **never** a plain `.env` or an
ad-hoc shell prefix. `pnpm dev` / `pnpm test:e2e` then work with no extra flags. CI does the
equivalent with `NODE_ENV=test`.

**1. core-be `.env.local`** (in the core-be repo) — required to boot against local Docker
Postgres/Redis and to survive a loopback test flood:

| Key                                                           | Value    | Why                                                                                                                                                                                                                   |
| ------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RATE_LIMIT_RELAXED_CAPS`                                     | `true`   | Public-auth routes (`send-code`, login) cap at **5 req/min per IP** when `false` (hardened default) → a loopback E2E flood produces `429 send-code failed` and authenticated flows fail. `true` lifts it to 5000/min. |
| `DATABASE_TLS_ENFORCED`                                       | `false`  | Local Docker Postgres is plaintext; the TLS guard is fail-closed for hosted only (its own message: acceptable for local docker).                                                                                      |
| `DATABASE_RLS_SAFETY_ENFORCED`                                | `false`  | The Docker `core` role is a superuser (BYPASSRLS); the RLS guard is fail-closed for hosted only.                                                                                                                      |
| `PERSONAL_ORGANIZATION_ENABLED` / `TEAM_ORGANIZATION_ENABLED` | per mode | Pick the deployment mode to exercise (see the matrix below). At least one must be `true`.                                                                                                                             |

**2. core-fe `.env.local`** (this repo):

| Key                       | Value                      | Why                                                                                                 |
| ------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------- |
| `VITE_DEV_API_URL`        | `http://localhost:3000`    | Vite proxies `/api` → local core-be.                                                                |
| `VITE_TURNSTILE_SITE_KEY` | `1x00000000000000000000AA` | Cloudflare always-pass **test** key (already shipped). Do **not** set `VITE_CAPTCHA_DISABLED=true`. |

**3. Run:**

```bash
# terminal 1 — core-be repo (values above are in its .env.local)
pnpm dev                       # boots on :3000; wait for GET /readyz → 200

# terminal 2 — core-fe repo
pnpm test:e2e                  # full Playwright suite (Chrome) against live core-be
```

To swap deployment mode: change the two `*_ORGANIZATION_ENABLED` values in core-be's
`.env.local`, restart core-be (env loads once at boot), and re-run. The
`deployment-*.e2e.test.ts` specs auto-skip unless `me/context` matches their required pair.

#### Why these live in `.env.local` — not a shell prefix (agent-friendly)

`RATE_LIMIT_RELAXED_CAPS`, `DATABASE_TLS_ENFORCED`, `DATABASE_RLS_SAFETY_ENFORCED` are
**non-secret local-dev flags** (no keys/tokens), so they belong in `.env.local`, which
the repo owner maintains. Putting them there — instead of prefixing the boot command with
`DATABASE_TLS_ENFORCED=false … pnpm dev` — matters for **agent-run testing**:

- An automated agent's safety classifier **blocks a command that disables named safety guards
  inline** (`*_ENFORCED=false pnpm dev` reads as "disarm TLS/RLS"), and it will **not** self-add
  a permission rule to tunnel around that. So an agent cannot boot core-be by passing those
  flags on the command line, and shouldn't be asked to.
- With the flags already in `.env.local`, the agent (and CI, and you) boot with a **plain
  `pnpm dev`** — no bypass flags in the command, nothing for the classifier to flag, no
  permission prompt. The human/repo owner made the local-safety decision once, in the file;
  the agent just runs the suite.

**Rule of thumb:** local-dev/test toggles that relax a guard go in `.env.local` (never a
plain `.env`, never an ad-hoc shell prefix). Then no one — human or agent —
needs to pass or approve them per run. Note `env-schema.ts` still pins
`RATE_LIMIT_RELAXED_CAPS=false` (and the DB guards enforced) for **production**, so this only
loosens local Docker.

**CAPTCHA (manual dev + E2E):** core-fe mounts invisible Cloudflare Turnstile when `VITE_TURNSTILE_SITE_KEY` is set (`.env.local` ships the always-pass test key `1x00000000000000000000AA`; do **not** set `VITE_CAPTCHA_DISABLED=true`). Pair with core-be `CAPTCHA_PROVIDER=turnstile` and the matching test secret. Auth buttons wait for a Turnstile token before POST (`useTurnstileReady`). `global-setup` probes core-be and caches working auth headers for E2E (typically `X-Captcha-Bypass: true` in local/test `NODE_ENV`).

| Spec                                               | What it covers                                               |
| -------------------------------------------------- | ------------------------------------------------------------ |
| `auth.e2e.test.ts`                                 | Login UI, redirects, auth flows                              |
| `auth-api.e2e.test.ts`                             | Auth HTTP contracts (`playwright.request` → `:3000`)         |
| `session-api.e2e.test.ts`                          | Session API contracts                                        |
| `tenancy-api.e2e.test.ts`                          | Tenancy API contracts                                        |
| `billing-api.e2e.test.ts`                          | Billing API contracts                                        |
| `deployment-personal-only.e2e.test.ts`             | Personal-only deployment (`TEAM_ORGANIZATION_ENABLED=false`) |
| `deployment-team-only.e2e.test.ts`                 | Team-only deployment (`PERSONAL_ORGANIZATION_ENABLED=false`) |
| `deployment-personal-and-team.e2e.test.ts`         | Dual deployment (both flags true — default local)            |
| `dashboard.e2e.test.ts`, `settings.e2e.test.ts`, … | UI flows through the browser                                 |
| `routes-integration.e2e.test.ts`                   | Full live route matrix (public + auth + journey)             |
| `org-switching.e2e.test.ts`                        | Personal ↔ team org switcher (dual-URL)                      |

**Deployment-mode matrix:** `deployment-personal-only.e2e.test.ts`, `deployment-team-only.e2e.test.ts`, and `deployment-personal-and-team.e2e.test.ts` each probe live `me/context` deployment flags and **skip** unless core-be matches the required env pair. Restart core-be with the matching `PERSONAL_ORGANIZATION_ENABLED` / `TEAM_ORGANIZATION_ENABLED` values to exercise personal-only or team-only locally; default dev (both `true`) runs the dual suite only.

**Local:** Vite serves the FE on `:5173` and proxies `/api` → `http://localhost:3000`. Start core-be, then `pnpm test:e2e`.

**CI:** none — E2E is **local-only**. No workflow boots postgres/redis/core-be (see `pr-ci.yml` header note); run the suite locally against core-be on `:3000`.

**Naming:** UI flows → `<feature>.e2e.test.ts`; HTTP contract suites → `<feature>-api.e2e.test.ts`.

Hybrid selectors: `data-testid` for actions, `getByRole`/`getByLabel` for a11y — `agent-os/skills/playwright-e2e/SKILL.md`, `tests/utils/e2e-hybrid.ts`.

Helpers: `tests/utils/e2e-auth.ts`, `tests/utils/axe-for-dialog.ts`.

## Security specs (Vitest)

| Spec                                       | Focus                              |
| ------------------------------------------ | ---------------------------------- |
| `token-storage.security.test.ts`           | Tokens not in localStorage         |
| `token-egress.security.test.ts`            | Tokens never leave via URL/logs    |
| `static-security-config.security.test.ts`  | CSP / security headers config      |
| `route-access-matrix.security.test.ts`     | Route permission matrix            |
| `settings-access-matrix.security.test.ts`  | Settings-section permission matrix |
| `cross-tenant-query-keys.security.test.ts` | Query keys scoped per organization |
| `redirect-safety.security.test.ts`         | Safe post-auth redirect targets    |
| `xss-sinks.security.test.ts`               | Dangerous sink patterns            |

## Commands

| Command                                   | What runs                                           |
| ----------------------------------------- | --------------------------------------------------- |
| `pnpm test`                               | Vitest all projects — unit + security + ci-policy   |
| `pnpm test:unit`                          | Colocated `src/**/*.test.*` only                    |
| `pnpm test:security`                      | `tests/security/`                                   |
| `pnpm test:e2e`                           | All Playwright specs in `tests/e2e/`                |
| `pnpm test:e2e:integration`               | Routes integration + org-switching only             |
| `pnpm test:e2e:integration:cross-browser` | Same, on Chromium + Firefox + WebKit (live core-be) |
| `pnpm test:visual`                        | Screenshot regression (`visual.e2e.test.ts`)        |
| `pnpm coverage:patch`                     | Changed-lines ≥ 90% (PR CI)                         |

Contract drift (scheduled CI): `pnpm contracts:drift` vs `core-be/docs/routes.txt`.

## Cross-browser smoke (production build)

Playwright runs **Chromium, Firefox, and WebKit** against `pnpm preview` (static shell — no core-be):

```bash
pnpm build && pnpm test:cross-browser
```

Covers login shell, PWA manifest assets, version-update toast, and toast dismiss.  
CI: `.github/workflows/cross-browser.yml` (weekly).

## Cross-browser live integration (core-be required)

**Chromium, Firefox, and WebKit** against the live FE ↔ BE stack (`routes-integration` + `org-switching`):

```bash
# core-be on :3000, DATABASE_URL for email codes
pnpm build   # CI uses preview; local dev can use `pnpm dev` via config reuseExistingServer
DATABASE_URL=postgresql://core:core@localhost:5432/core pnpm test:e2e:integration:cross-browser
```

CI: none — live FE ↔ BE integration runs are local-only (CI never boots core-be).  
Details: **`docs/reference/cross-browser-support.md`**.

## Local production performance

Measure bundle size and Lighthouse on a **production build**, not `pnpm dev`.

```bash
pnpm build
pnpm preview --port 5173 --strictPort   # canonical — same as .lighthouserc.cjs
pnpm size                               # gzip budgets on dist/
```

Static `npx serve dist -s -l 5173` works for manual Lighthouse; prefer `pnpm preview`
when matching CI. Full workflow: **`docs/reference/local-production-perf.md`**.
