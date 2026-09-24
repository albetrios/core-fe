---
name: fe-visual-regression
description: Maintain the Playwright screenshot-baseline lane (tests/e2e/visual.e2e.test.ts) — when to add a snapshot, how to update baselines safely, and how the route × theme-axis matrix converts the theme-axis playbook into assertions. Use when a visual test fails, when adding a route or theme axis, or when the user asks for visual regression / snapshot / baseline work.
---

# Visual regression (Playwright screenshot baselines)

Pixel-level regression net for the theming system. One spec —
[`tests/e2e/visual.e2e.test.ts`](../../../tests/e2e/visual.e2e.test.ts) — asserts
`toHaveScreenshot` baselines committed under
`tests/e2e/visual.e2e.test.ts-snapshots/`. This is the **assertable counterpart of
the `fe-theme-axis-audit` playbook**: an axis audited once stays audited, because its
extreme values are pinned as pixels.

## Ground rules

- **Local-only lane.** Baselines are platform-pinned (`*-chromium-darwin.png`);
  the suite needs core-be on `:3000` (Playwright `global-setup` enforces it — env
  steps in `agent-os/skills/fe-playwright-e2e/SKILL.md`). CI never runs it; do not
  wire it into a workflow without a Docker-pinned runner and a fresh baseline set.
- **Determinism is non-negotiable.** Every test inherits
  `page.emulateMedia({ reducedMotion: 'reduce' })` (spec-level `beforeEach`) and
  passes `animations: 'disabled'`. Diff budget: `maxDiffPixelRatio: 0.02` for
  static screens, `0.03` for data-bearing pages (e.g. dashboard). Do not raise a
  budget to make a failure pass — that hides the regression the lane exists to
  catch.
- **A failed visual test is a finding, not an obstacle.** Inspect the
  `test-results/` diff artifacts (`*-diff.png`, `*-actual.png`) before touching
  anything. Only two verdicts exist: the UI change was intentional → update the
  baseline; it was not → fix the code (hand off to `frontend-design` /
  `fe-theme-axis-audit` / `shadcn` per the change).

## Commands

```bash
pnpm test:visual          # run the lane (requires core-be up)
pnpm test:visual:update   # re-record baselines — ONLY after reviewing diffs
```

`test:visual:update` re-records **every** snapshot the run touches; review
`git diff --stat tests/e2e/visual.e2e.test.ts-snapshots/` afterwards and revert
any PNG you did not intend to change. Commit baseline updates in the same commit
as the UI change that caused them, never separately.

## When to add a snapshot (the matrix)

Coverage = **route × color scheme × theme-axis extreme**, kept deliberately lean —
each cell must earn its maintenance cost:

1. **New route island with meaningful UI** → one light + one dark snapshot of the
   settled page (wait for the page testid, not `networkidle`).
2. **New theme axis** (a new `data-<axis>` on `<html>`: today `theme`, `base`,
   `contrast`, `elevation`, `focus`, `icon`, `menu`, `separation`, `shape`) → one
   snapshot pinning its most extreme value on an axis-sensitive route, set via
   `page.evaluate(() => { document.documentElement.dataset.<axis> = '<value>'; })`
   after `gotoApp`.
3. **Axis interactions** only when an audit found a real bug in a combination
   (e.g. `dark + separation:hairline + menu:glass`) — pin the fixed combination.

Do **not** snapshot every axis × every route (matrix explosion), transient states
(toasts, spinners), or pages whose content is nondeterministic without fixtures.

## Authoring pattern

Follow the existing spec: `gotoApp(page, '<path>')` +
`expectAuthScreenReady`/testid wait from `tests/utils/e2e-hybrid.ts`, authenticated
routes via `registerNewUserAndGoToDashboard` from `tests/utils/e2e-auth.ts`,
`fullPage: true`, kebab-case snapshot names (`<route>-<variant>.png`). Selector
conventions stay `fe-playwright-e2e` (hybrid selectors); test ids come from
`fe-e2e-testids`.

## Definition of done

- `pnpm test:visual` green locally with core-be up.
- New/updated PNGs reviewed and committed with the UI change.
- New snapshot names follow `<route>-<variant>.png`; no budget raised.
