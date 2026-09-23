# Scheduled & periodic jobs

Single source of truth for everything that runs on a schedule in this repo. The
**Scheduled workflows** table below is **enforced**: `tests/ci/scheduled-jobs.policy.test.ts`
asserts it matches — bidirectionally, including the exact cron expression — every
`.github/workflows/*.yml` that declares `on: schedule`. So a new cron that skips
registration, a deleted workflow left in the table, or a cron time changed in one
place but not the other all turn red in the fast ci-policy lane. This registry
can't silently drift — which is the whole point (a registry of drift-catchers
that itself drifts is worse than none).

## Where a periodic thing belongs

The one question that decides the home for anything recurring: **what is the
signal when it finds a problem?**

| Signal on problem         | Home                                                                | When                                                                                  | Examples                                                    |
| ------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| **Blocks the merge**      | PR gate — `static-sync` / `agent-os-gate` job, or `pnpm sync:check` | Cheap, deterministic, and a **single commit can break it**                            | route-islands, testids, i18n, project-tree, agent-os wiring |
| **A report / alert**      | weekly cron (test lane)                                             | Too slow, flaky, or environment-heavy for every PR                                    | Lighthouse, cross-browser, mutation, CodeQL                 |
| **A tracked issue**       | weekly cron (**drift canary**)                                      | **No single commit breaks it** — it accretes silently and can't be mechanically gated | env/ruleset/PAT drift, docs↔code drift                      |
| **Nothing (side-effect)** | daily cron (housekeeping)                                           | Pure maintenance, no assertion                                                        | cache cleanup                                               |

The line between a **PR gate** and a **drift canary** is exactly this: if one
commit can break it, gate it; if it only drifts over time across many commits,
canary it. That is why `docs:staleness` is a weekly canary and `project-tree` is
a PR gate, even though both compare docs to code.

## Scheduled workflows (enforced)

| Workflow                       | Cron (UTC)    | Cadence                         | Purpose                                                  | Signal on failure                       |
| ------------------------------ | ------------- | ------------------------------- | -------------------------------------------------------- | --------------------------------------- |
| `cleanup-cache.yml`            | `15 4 * * *`  | daily 04:15                     | GitHub Actions cache cleanup                             | none (housekeeping)                     |
| `lighthouse.yml`               | `0 3 * * 1`   | weekly Mon 03:00                | performance budgets                                      | report                                  |
| `cross-browser.yml`            | `0 4 * * 1`   | weekly Mon 04:00                | Chrome/Firefox/Safari smoke                              | report                                  |
| `codeql.yml`                   | `27 4 * * 1`  | weekly Mon 04:27                | security code scanning                                   | security alert                          |
| `mutation-test.yml`            | `0 5 * * 1`   | weekly Mon 05:00                | Stryker mutation tests                                   | report                                  |
| `scheduled-release-guards.yml` | `30 6 * * 1`  | weekly Mon 06:30                | GitHub env/ruleset drift + `RELEASE_PLEASE_TOKEN` expiry | annotations + hard fail                 |
| `sync-drift-canary.yml`        | `0 7 * * 1`   | weekly Mon 07:00                | docs↔code drift (`sync:check` + `docs:staleness`)        | self-healing tracked `sync-drift` issue |
| `scheduled-deps-audit.yml`     | `30 7 * * 1`  | weekly Mon 07:30                | `pnpm audit` advisory drift (deps unchanged by PRs)      | hard fail (Actions tab)                 |
| `dead-code-audit-reminder.yml` | `0 7 1 */3 *` | quarterly (1st Jan/Apr/Jul/Oct) | reminder to run the barrel-hidden dead-code audit        | tracked `dead-code-audit` issue         |

Times are UTC (GitHub cron is always UTC). Every **weekly** job runs Monday,
staggered across the off-peak window (03:00 → 04:00 → 04:27 → 05:00 → 06:30 →
07:00 → 07:30) so one Monday review covers every weekly signal and no two jobs
contend for runners at the same minute. Off the weekly cadence: `cleanup-cache` runs
daily, and `dead-code-audit-reminder` runs quarterly — it opens a reminder issue
to run the manual barrel-hidden dead-code sweep that per-PR `knip` can't catch.

## Other periodic mechanisms (not workflow crons)

Listed for completeness — these are real periodic behavior but not
`.github/workflows` crons, so the policy test does not enforce them:

- **Dependabot** (`.github/dependabot.yml`) — weekly Monday, `npm` + `github-actions` ecosystems; updates arrive as PRs, then the event-driven `dependabot-ci-triage` + approval-gated `dependabot-auto-merge` workflows take over.
- **Runtime version check** (`src/core/version/check.ts`) — the client polls `/version.json` every 5 min while visible and on tab refocus to detect a new deployment (reload lands via the service-worker handoff); not CI, a different axis (app behavior).
- **Notification polls** (`src/shared/hooks/useNotifications/useNotifications.ts`) — with no realtime channel in core-be yet (FE-63), two client polls at 30 s, both paused while the tab is hidden (TanStack's `refetchIntervalInBackground` default) and both gated on a resolved org scope (SHELL-10). They have **different lifetimes**: the unread badge polls for as long as the app shell is mounted, because that count is what a notification bell exists to show; the inbox list polls only while the bell popover is open, because that is the only place it renders. A future SSE/WebSocket subscription replaces both by invalidating their query keys on push.

## Adding a scheduled job

1. Author the workflow under `.github/workflows/` with `on: schedule` — it must
   declare a top-level `name:`, pin third-party actions to a SHA, and set
   `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` (the `github-actions-hardening` policy
   test enforces those).
2. Pick the home by the **signal** table above — a report lane, a drift canary
   (self-healing tracked issue), or housekeeping.
3. **Add a row to the enforced table** with the exact cron expression. The
   `scheduled-jobs` policy test fails until the workflow and the registry agree.
