# Local production performance audit

How to measure **real** bundle size and Lighthouse scores — not dev-server numbers.

---

## Dev vs production build

| Mode           | Command                         | Use for                                                                       |
| -------------- | ------------------------------- | ----------------------------------------------------------------------------- |
| **Dev**        | `pnpm dev` (`:5173`)            | Feature work, HMR, E2E with the configured backend or explicit scenario mocks |
| **Production** | `pnpm build` then serve `dist/` | Bundle size, Lighthouse, PWA precache, TBT/CLS                                |

**Never** run Lighthouse against `pnpm dev`. Vite dev mode ships unminified code,
extra HMR clients, and different chunking — scores are not representative.

---

## Recommended workflow (this repo)

```bash
pnpm build
pnpm preview --port 5173 --strictPort
```

In a second terminal:

```bash
pnpm size                    # gzip limits on dist/ (same as CI)
# Optional — matches .lighthouserc.cjs:
npx @lhci/cli autorun       # needs preview on :5173 (see config)
```

**`pnpm preview`** (`vite preview`) is the canonical local production server:

- Serves the **built** `dist/` with the same asset paths as Netlify
- Used by **Lighthouse CI** (`.lighthouserc.cjs` → `startServerCommand`)
- Default port is `4173`; CI pins `--port 5173` to match E2E proxy habits

### Alternative: `serve`

```bash
pnpm build
npx serve dist -s -l 5173
```

Static `serve` (or `npx http-server dist`) is **acceptable** for manual Lighthouse
runs — you are still serving minified production assets. Prefer **`pnpm preview`**
when comparing to CI or debugging Vite-specific deploy behavior (SPA fallback,
headers from `dist/_headers` may differ).

**Safari / WebKit:** the meta CSP in `index.html` intentionally omits
`upgrade-insecure-requests` (that directive lives in `dist/_headers` for HTTPS
deploys only). Without this split, Safari upgrades `http://localhost` assets to
HTTPS and the app stuck on the boot splash during local preview.

For HTTPS parity with Netlify (optional):

```bash
pnpm build
pnpm preview:https --port 4173 --strictPort
```

Cross-browser smoke: `pnpm test:cross-browser` — see [cross-browser-support.md](./cross-browser-support.md).

---

## What to measure

| Gate                | Command                                                 | Notes                                                          |
| ------------------- | ------------------------------------------------------- | -------------------------------------------------------------- |
| Initial JS budget   | `pnpm size`                                             | Critical path + route chunks (`tooling/ci/run-size-limit.mjs`) |
| Lighthouse perf     | `npx @lhci/cli autorun` or Chrome DevTools → Lighthouse | Production URL only                                            |
| PWA precache weight | Inspect `dist/sw.js` or build log                       | Trimmed in `vite.config.ts` / custom SW                        |
| Unit + security     | `pnpm test`                                             | Regression guard after perf refactors                          |

Historical Phase A-D notes targeted Lighthouse performance **~85+** on `/login`,
TBT **&lt; 200ms**, and initial critical JS **~208 kB** gzip. These are not current
measurements or guarantees. Rerun the commands above on the exact revision and
build environment; the enforced size limits remain the source of truth.

---

## Full health pass

After large perf changes (10+ files):

```bash
pnpm health
```

Skill: `agent-os/skills/project-health-check/SKILL.md`.

---

## Deferred notification rendering

`AppToaster` provides immediate actionable feedback; `notify.ts` owns stable IDs
and queues renderer work until `notify-runtime.tsx` and its Sonner host are ready.
This split is implemented, not a deferred optimization proposal. The handoff must
preserve replacement, dismissal, Undo, promise settlement, and remaining lifetime;
failed chunk loads must leave usable feedback.

Keep direct Sonner imports inside the deferred notification implementation. Verify
both the initial preload graph and runtime fetches, then exercise delayed and
failed renderer loads with the notification regression suites. Re-measure bundle
size after dependency changes instead of relying on earlier reclaim estimates.

---

## Related

- [testing.md](./testing.md) — full test matrix
- [quality/test-coverage.md](./quality/test-coverage.md) — coverage ratchet
- [tools-and-usage.md](./tools-and-usage.md) — size-limit, Lighthouse deps
- [pwa-manifest-and-app-icon.md](./pwa-manifest-and-app-icon.md) — PWA icon/precache assets
- [cross-browser-support.md](./cross-browser-support.md) — Chrome/Firefox/Safari matrix
