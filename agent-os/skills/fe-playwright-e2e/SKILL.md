---
name: fe-playwright-e2e
description: Write and refactor Playwright E2E specs using the hybrid selector strategy — data-testid for actions, getByRole/getByLabel for a11y guards. Use when adding or updating tests/e2e/*.e2e.test.ts.
---

# Playwright E2E (hybrid selectors)

Project convention for **all Playwright specs** in `tests/e2e/*.e2e.test.ts` — UI flows and `*-api.e2e.test.ts` HTTP contracts. See `tests/README.md`.

## Running the suite (required setup — follow this exactly)

Before `pnpm test:e2e`, the environment must be set up per **`docs/reference/testing.md` →
E2E → "Local run — required env & steps"**. Do not improvise other env or a plain `.env`.
All values live in each repo's **`.env.local`** (gitignored dev file, `NODE_ENV=local`):

- **core-be `.env.local`**: `RATE_LIMIT_RELAXED_CAPS=true` (else public-auth caps at
  5 req/min per IP → `429 send-code failed` floods the suite), `DATABASE_TLS_ENFORCED=false`,
  `DATABASE_RLS_SAFETY_ENFORCED=false` (local Docker Postgres), and the
  `PERSONAL_ORGANIZATION_ENABLED` / `TEAM_ORGANIZATION_ENABLED` pair for the mode under test.
- **core-fe `.env.local`**: `VITE_DEV_API_URL=http://localhost:3000`, test Turnstile key
  `VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA` (do **not** set `VITE_CAPTCHA_DISABLED`).

Then: boot core-be (`pnpm dev`, wait for `GET /readyz` → 200), and run `pnpm test:e2e` from
core-fe. `deployment-*.e2e.test.ts` auto-skip unless `me/context` matches their mode pair —
swap the two `*_ORGANIZATION_ENABLED` values in core-be's `.env.local` and restart to
exercise personal-only / team-only. CI does the equivalent with `NODE_ENV=test`.

**Why the env goes in `.env.local` and not a shell prefix:** the DB/rate-limit toggles are
non-secret local-dev flags. Passing `DATABASE_TLS_ENFORCED=false … pnpm dev` on the command
line reads as "disarm safety guards" and is **blocked by the agent safety classifier** (which
also won't let the agent self-add a permission rule to tunnel around it). With the flags in
`.env.local`, boot is a plain `pnpm dev` — no bypass flags in the command, no permission
prompt. So: **never ask to run these flags inline; expect them pre-set in `.env.local`**
and just boot + run. See `docs/reference/testing.md` → "Why these live in `.env.local`".

## Hybrid strategy (required)

| Concern                           | Selector                               | Why                                         |
| --------------------------------- | -------------------------------------- | ------------------------------------------- |
| **Actions** (click, fill, select) | `page.getByTestId('…')`                | Stable when Tailwind/layout/copy changes    |
| **Visibility / a11y guard**       | `getByRole`, `getByLabel`, `getByText` | Proves the control is exposed to users & AT |
| **Never**                         | CSS classes, `nth-child`, DOM depth    | Break on every design pass                  |

```ts
import {
  clickTestId,
  expectLoginFormReady,
  fillTestId,
} from '@/tests/utils/e2e-hybrid.ts';

test('logs in', async ({ page }) => {
  await page.goto('/login');
  await expectLoginFormReady(page); // hybrid: testid + labels/roles
  await fillTestId(page, 'auth-email', 'user@example.com');
  await clickTestId(page, 'auth-email-submit');
});
```

**Helpers:** `tests/utils/e2e-hybrid.ts` — `AUTH_LABELS`, `LAYOUT_LABELS`, `expect*FormReady`, `expectHybridVisible`.

**Auth flows:** `tests/utils/e2e-auth.ts` — `registerNewUserAndGoToDashboard`, `authenticateViaSignup`, `completeOnboardingWizard`, `navigateInApp` (client-side nav; avoids cold-load auth race — see `__coreFeRouter` in `src/main.tsx` dev hook). **All E2E requires core-be** — `tests/e2e/global-setup.ts` fails fast when `/readyz` is down.

## When to use which

- **Always testid** for: page roots, form wrappers, fields, submit, nav items, dialogs, tables (see `fe-e2e-testids` skill).
- **Add role/label assert** when the element has a proper label or `aria-label` (forms, icon buttons, modals).
- **Axe scans** stay in `accessibility.e2e.test.ts` (`@axe-core/playwright`) — not a substitute for hybrid asserts.

## File layout

| File                        | Scope                                   |
| --------------------------- | --------------------------------------- |
| `auth.e2e.test.ts`          | Unified login, OAuth, guards, email OTP |
| `dashboard.e2e.test.ts`     | Shell + placeholder dashboard           |
| `settings.e2e.test.ts`      | Hash modal `#settings/...`              |
| `navigation.e2e.test.ts`    | 404, auth guards                        |
| `organization.e2e.test.ts`  | Picker at `/organization`               |
| `notifications.e2e.test.ts` | Notification center                     |
| `org-switching.e2e.test.ts` | Dual-URL switcher                       |
| `responsive.e2e.test.ts`    | 320px overflow                          |
| `accessibility.e2e.test.ts` | Axe WCAG gate                           |
| `visual.e2e.test.ts`        | Screenshots (reduced motion)            |

## Workflow (new spec)

1. Read **`fe-e2e-testids`** — ensure testids exist; update `docs/reference/e2e-testids-inventory.md`.
2. Use **`e2e-hybrid.ts`** helpers; add labels to `AUTH_LABELS` / `LAYOUT_LABELS` when needed.
3. Run `pnpm validate:testids` after UI testid changes.
4. Run `pnpm test:e2e` or `pnpm exec playwright test tests/e2e/<file>.e2e.test.ts`.
5. Visual baselines: `pnpm test:visual:update` when adding screenshot tests.

## Patterns for things a unit test cannot see

**Timers — use the virtual clock, and reload under it.** A five-minute idle timeout costs
nothing with `page.clock`, but timers that already exist keep running on the real
clock: install first, then reload so the app creates its timers under it.

```ts
await page.clock.install();
await page.reload();
await page.clock.fastForward('05:01'); // jumps; due timers fire at most once
await page.clock.runFor(300); // lets time pass inside a gesture
```

`fastForward` _jumps_ — crossing two thresholds in one call lands on the later state.
Do the arithmetic per step (`session-timeout.e2e.test.ts`).

**Gestures — a real press, when the bug is in the gesture.** `locator.click()` is
down+up with no time between them. If something listens for `mousedown` on `document`,
reproduce the human version and assert in the middle of it:

```ts
await page.mouse.move(x, y);
await page.mouse.down();
await page.clock.runFor(300);
await expect(dialog).toBeVisible(); // it used to be gone by now
await page.mouse.up();
```

**Races that localhost hides — hold the response open.** On loopback the backend
answers before the UI can get into the state you are guarding against, so the test
passes against the bug. Delay the one request that matters, then `continue()` it:

```ts
await page.route('**/api/v1/auth/refresh', async (route) => {
  await new Promise((resolve) => setTimeout(resolve, 1500));
  await route.continue();
});
```

**Invariants over stopwatches.** Wall-clock assertions flake and a dev server says
nothing about production speed. Observe from the first byte with
`page.addInitScript` + a `MutationObserver`, count what must never happen (a fade
that is cancelled, a frame with no content), and assert the counts are zero
(`boot-splash.e2e.test.ts`). Real numbers belong in a measured production build —
`docs/reference/local-production-perf.md` → Cold-load timeline.

**"Signed out" means a fresh load cannot undo it.** Landing on `/login` proves
nothing — a local-only logout lands there too and the silent refresh signs straight
back in. After the redirect, `page.goto('/')` again and assert it is _still_ the
login form.

**A spec that needs a first-time visitor overrides the storage state.** The suite's
shared `storageState` pre-answers cookie consent so the card never sits on another
spec's button. `test.use({ storageState: { cookies: [], origins: [] } })` starts
undecided (`consent-card.e2e.test.ts`).

**CSS contracts — sweep computed styles, and ship a control.** jsdom resolves neither
`@theme` nor `calc()`, so a unit test can only pin the stylesheet's _text_. When the
claim is "nothing on this screen still has X", ask the browser: one `page.evaluate` over
`body *` that returns a description of every offender, asserted `toEqual([])` so the
failure message **is** the to-do list (`theme-shape.e2e.test.ts` — it found three misses
grep had not). Three rules keep such a sweep honest:

- **Exempt by rule, never by selector** ("at most 10px", "blurred", "dev tooling") — a
  selector list is an allowlist nobody reviews.
- **Measure layout, not paint**, where an animation is involved: `offsetWidth` ignores the
  `scale()` of a ping halo; `getBoundingClientRect()` does not.
- **Add a control test** that runs the same sweep where offenders MUST exist. An
  `evaluate` that silently matches nothing passes every other test in the file.

Seed persisted state with `page.addInitScript` (it runs before the app boots, on every
load) rather than clicking through a picker — the spec is about the result, not the UI
that sets it. Never wait on `networkidle` in this app: polling keeps the network busy
and the wait times out; wait for the thing itself (`[data-slot="skeleton"]` count 0).

**A feature check that swallows errors is a silent skip.**
`test.skip(!(await locator.isVisible().catch(() => false)), '…')` reads as "skip where the
feature is off". But `isVisible()` on a locator that matches **two** elements throws a
strict-mode violation, the `.catch` turns it into `false`, and the spec skips forever — on
every machine, green. That is how the org switcher's own specs ran zero assertions: its
test id is mounted twice (sidebar + mobile header; one is only CSS-hidden). Use
`byTestId()` (`visible=true` + `.first()`) for anything that can be mounted per breakpoint.
`isVisible()` already returns `false` for no match, so a trailing `.catch()` can ONLY hide a
strict-mode violation — ESLint now rejects `.catch()` on `isVisible` / `isEnabled` / … in
`tests/e2e` and `tests/utils` (a timed `waitFor(…).then(() => true).catch(() => false)` is
fine: a timeout is the expected "no"). And **read the skipped count** — `--reporter=list` names each `-`; a skip you cannot
explain is a finding. When a spec that never ran starts running, expect it to fail for
reasons that have nothing to do with your change; prove which side they are on by serving
`main` from a scratch worktree on the same port, and park a real product bug with
`test.fixme(true, '<cause>')` plus a tracked follow-up — never by putting the skip back.

**Simulate navigation the way it really happens.** The router owns location: a raw
`history.replaceState` + synthetic `hashchange` opens a hash modal but leaves the router's
cached location stale. A provider return (Stripe) is a full page **load** — `page.goto()`
the URL. Setting `location.hash` repeatedly **pushes** entries, and closing the settings
modal is `history.back()`, so one Escape only steps back a section; leave by loading the
URL without the hash. And after `Escape` on a Radix menu, wait for it to be gone
(`expect(option).toBeHidden()`) before clicking the trigger again — a click that lands
mid-close is swallowed.

**Take the sign-in code from the response, not from a second system.** core-be echoes the
freshly issued code on `send-code` in its local/TEST mode (`debug_verification_code` — the
field the sign-in form itself prefills from). `echoedVerificationCode(response)` in
`tests/utils/e2e-session.ts` returns it, or `null` on a backend that does not echo;
`createSessionViaEmailCode` prefers it and falls back to polling `auth.mail_outbox`. The
outbox is a second system with its own lag: late in a long suite that lag was the MFA spec's
entire 90 s budget, while the backend had answered every request. A spec that needs a
_fresh_ code still loops (the backend has a per-email issue window) — it just reads the
answer it already has.

**The dev server is part of the test.** "Failed to fetch dynamically imported module"
behind a `504 (Outdated Optimize Dep)` is Vite re-optimizing mid-session because a
lazy-only dependency was missing from `optimizeDeps.include` (`vite.config.ts`); every lazy
chunk that pulls a pre-bundled dep then dies until the server restarts. Add the dependency
there and restart with `--force`. The watcher also reloads pages when `coverage/` is
rewritten — do not run a coverage pass while a browser suite is using the same server.

**Prove it bites.** Put the old behaviour back for one run and watch the spec fail.
If it still passes, it is not testing what its title says — that is how the race
above was found.

## Refactoring older specs

Replace testid-only **visibility** checks on labeled controls with hybrid helpers:

```ts
// Before
await expect(page.getByTestId('login-email')).toBeVisible();

// After (login suite)
await expectLoginFormReady(page);
```

Keep **actions** on testid:

```ts
await page.getByTestId('login-submit').click();
```

## Related

| Resource          | Path                                      |
| ----------------- | ----------------------------------------- |
| Test IDs + naming | `agent-os/skills/fe-e2e-testids/SKILL.md`    |
| Hybrid helpers    | `tests/utils/e2e-hybrid.ts`               |
| Auth helper       | `tests/utils/e2e-auth.ts`                 |
| Config            | `playwright.config.ts`                    |
| Inventory         | `docs/reference/e2e-testids-inventory.md` |

## External skills

No third-party Playwright skill is installed — the Skills CLI has no curated `playwright` package at install time. This project skill + `fe-e2e-testids` are the source of truth.
