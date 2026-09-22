# Performance tests

## Public-route transfer budgets — `pnpm perf:routes`

Measures what a signed-out visitor actually downloads on every route they can
reach, **one route at a time, each in a fresh browser context**, and asserts it
against [`tooling/perf/public-route-budgets.json`](../../tooling/perf/public-route-budgets.json).

```bash
pnpm perf:routes           # measure + assert (exit 1 on a breach)
pnpm perf:routes:update    # re-pin budgets to what was just measured
pnpm perf:routes --json    # machine-readable
```

### Why it exists next to `pnpm size`

`pnpm size` (`tooling/ci/run-size-limit.mjs`) measures the entry chunk plus the
modulepreloads `index.html` declares — the **first-paint critical path**, and
nothing else. Everything a route pulls dynamically is invisible to it.

On the build this was written against, that gap was large:

| | `pnpm size` reports | actually transferred |
| --- | --- | --- |
| `/login` | 233.67 kB | **792.5 kB** |

The difference is idle-deferred work — Sentry (~150 kB), PostHog (~92 kB), the
deferred icon sets — plus every chunk the route imports dynamically. None of it
blocks first paint, all of it costs the visitor bandwidth and main thread on the
same visit, and none of it was gated.

So the two are complementary and both are worth keeping: `pnpm size` guards what
delays render, `pnpm perf:routes` guards what the visit costs.

### Why a fresh context per route

A visitor arriving at `/accept-invite/…` from an email has none of `/login`'s
chunks warm. Reusing one browser context would report every route after the
first as nearly free, which is the opposite of the number worth knowing.

### Why public routes only

They need no backend. The Playwright E2E suite is local-only because it needs
core-be on `:3000` (see `CLAUDE.md`); guest routes render against nothing, so
this harness runs anywhere — including CI.

### The two numbers

- **first-paint** — transferred before the load event. What delays render.
- **total** — everything after a 3s idle settle. What the visit costs. The
  settle matters: observability registers on an idle callback, so a measurement
  that stops at `networkidle` misses the single largest chunk on the page.

### Budgets are a ratchet

Same philosophy as the coverage thresholds and the TSDoc budget: pinned just
above measured (`headroomPercent`), lowered as routes shrink, **never raised to
absorb growth**. A breach prints the five largest chunks on that route, so it
names its own cause instead of sending you to a bundle analyzer.

## Lighthouse CI

Category scores and resource budgets for public routes —
[`.lighthouserc.cjs`](../../.lighthouserc.cjs), run weekly by
`.github/workflows/lighthouse.yml`.
