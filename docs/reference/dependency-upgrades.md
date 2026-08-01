# Dependency upgrades and audits

Use this as the **operational checklist** when triaging versions and security reports.

## Commands

| Command           | Purpose                                                                                                                 |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `pnpm deps:check` | Lists outdated direct dependencies (`pnpm outdated`). Exit code `1` when anything is outdated — expected during triage. |
| `pnpm deps:audit` | Reports known vulnerabilities (`tooling/ci/bulk-audit.mjs` against npm's bulk advisory endpoint; high+ fails).          |
| `pnpm validate`   | Run after bumping packages: lint, type-check, unit tests.                                                               |

## Dependabot

Weekly npm updates are configured in [`.github/dependabot.yml`](../../.github/dependabot.yml), grouped **by risk** (same shape as core-be):

| Group              | Contents                       | Merge path                                                                                                                                                                                     |
| ------------------ | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm-non-major`    | patch + minor, prod + dev deps | **Approval-triggered auto-merge**: approve the PR and [`dependabot-auto-merge.yml`](../../.github/workflows/dependabot-auto-merge.yml) arms squash auto-merge; it lands when PR CI goes green. |
| `npm-major`        | major upgrades                 | Manual review + merge.                                                                                                                                                                         |
| `security-updates` | Dependabot security PRs        | Manual review + merge (prioritize per `SECURITY.md`).                                                                                                                                          |
| `actions`          | github-actions bumps           | Manual review + merge.                                                                                                                                                                         |

The approval is the manual gate — `main` requires 0 approvals (solo-maintained; an author can't approve their own PRs, but a maintainer can approve Dependabot's), so approving a low-risk group PR is the explicit opt-in signal. Failed CI on any Dependabot PR opens a triage issue via [`dependabot-ci-triage.yml`](../../.github/workflows/dependabot-ci-triage.yml). The `@tanstack/react-router` minor/major pin below is enforced via a Dependabot `ignore` rule.

**Prefer merging Dependabot PRs** over ad-hoc bumps, then run `pnpm validate` on the branch.

## Node.js (runtime)

- **`package.json` → `engines.node`:** `>=24` — **Active LTS** only (currently the **24.x** line). Do not target odd/current non-LTS releases for CI or deploy defaults.
- **`.nvmrc` / `.node-version`:** major `24` — use `nvm install` / your version manager so local patch versions stay on that LTS line.

## pnpm overrides (transitive CVEs)

[`package.json`](../../package.json) defines `pnpm.overrides` to force patched versions where upstream has not yet bumped:

| Override                           | Why                                                                                                                                                                                                                                                                                     |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `protobufjs` **>=7.6.4 <8**        | `posthog-js` → OpenTelemetry OTLP stack pulls it transitively (tree-shaken out of the shipped bundle). Floors past the `<=7.5.7` unbounded-recursion DoS advisory; bounded to the 7.x line (the `<8` ceiling keeps the same-major intent while letting patches flow).                   |
| `basic-ftp` **>=5.3.1 <6**         | `@size-limit/preset-app` → puppeteer → `get-uri` pulled older `basic-ftp` (path traversal / DoS advisories). Bounded floor on the 5.x line — allows patches, not the 6.x major.                                                                                                         |
| `minimatch` **>=10.2.5 <11**       | `eslint-plugin-sonarjs` v3 pulled vulnerable `minimatch@10.1.x` (ReDoS). **v4** of the plugin is now direct; the bounded floor keeps the tree on a patched 10.x line.                                                                                                                   |
| `@opentelemetry/core` **>=2.8.0**  | `netlify-cli` → `@netlify/blobs` → `@netlify/otel` pulled `@opentelemetry/core@2.7.1`, hit by GHSA-8988-4f7v-96qf (unbounded memory allocation). Dev/deploy CLI only — never shipped to clients — and below the `--audit-level=high` gate, so this is a floor rather than an exact pin. |
| `@fastify/static` **>=10.1.2 <11** | `netlify-cli` pulled `@fastify/static@9.1.3`, hit by GHSA-83w8-p2f5-377r (route-guard bypass via path traversal) and GHSA-8pvw-jcv7-9cmj (authorization bypass via non-canonical URL paths — fixed only in **10.1.2**). Dev-only CLI; bounded to the 10.x line.                         |
| `brace-expansion` **>=5.0.8 <6**   | Reached through the `minimatch` override's 10.x line; `<5.0.8` is hit by GHSA-mh99-v99m-4gvg (unbounded expansion → OOM DoS). Bounded floor on the 5.x line.                                                                                                                            |
| `fast-uri` **>=3.1.4 <4**          | `netlify-cli` → `fastify` / `ajv` pulled `fast-uri@3.1.2`–`3.1.3`, hit by GHSA-v2hh-gcrm-f6hx and GHSA-4c8g-83qw-93j6 (host confusion). Bounded to 3.x — the 4.x major is a separate upgrade.                                                                                           |
| `find-my-way` **>=9.7.0 <10**      | `netlify-cli` → `fastify@5` pulled `find-my-way@9.6.0`, hit by GHSA-c96f-x56v-gq3h (HTTP/2 DDoS). Bounded floor on the 9.x line.                                                                                                                                                        |
| `js-yaml@5` **>=5.2.2 <6**         | `markdownlint-cli2` pulled `js-yaml@5.2.1`, hit by GHSA-pm4m-ph32-ghv5 (exponential flow-collection parsing → DoS). Scoped to the **5.x** selector so `cosmiconfig`'s unaffected `js-yaml@4` tree is left alone.                                                                        |
| `postcss` **>=8.5.18 <9**          | A stale `postcss@8.5.14` remained in the dev tree, hit by GHSA-r28c-9q8g-f849 (path traversal in `sourceMappingURL` auto-loading). Bounded floor on the 8.x line.                                                                                                                       |
| `sharp` **>=0.35.1 <0.36**         | `netlify-cli` → `@netlify/images` → `ipx` pulled `sharp@0.34.5`, which inherits the libvips CVEs in GHSA-f88m-g3jw-g9cj. Dev-only image pipeline; bounded to the 0.35.x line.                                                                                                           |
| `svgo` **>=4.0.2 <5**              | `netlify-cli` pulled `svgo@4.0.1`, hit by GHSA-2p49-hgcm-8545 (`removeScripts` leaves executable scripts intact). Bounded floor on the 4.x line.                                                                                                                                        |

Revisit these when Dependabot or direct dependency upgrades remove the need.

## Pins and known constraints

- **`@tanstack/react-router`** is pinned to the **1.170.x** line (`~1.170.17` in [`package.json`](../../package.json)). The earlier **1.169** minors that caused unhandled navigation rejections and maximum update depth in guard tests are resolved as of **1.170.17** — verified against the full guard + unit suite (96 guard tests, 1291 unit tests, build + `build:check` all green) in the 1.160→1.170 bump. Minor/major bumps on this fast-moving router still go through a **deliberate spike** (Dependabot `ignore` keeps them off auto-merge); patches within `~1.170.x` flow normally.
- **React 19**, **Vite 8**, **ESLint 10**, **lucide-react 1.x**, and similar **majors** are intentionally **not** part of routine bumps — schedule separately with full `pnpm validate` and E2E. **`netlify-cli`** is kept current on the **v26** line (dev-only CLI).

## Audit noise

`pnpm deps:audit` (npm bulk advisory endpoint — the legacy `pnpm audit` endpoints
were retired by the registry in July 2026; pnpm ships bulk support only from v11)
should report **no high/critical** after overrides; **moderate** issues may remain
in dev-only trees. Treat **production `dependencies`** first (`pnpm deps:audit:prod`
audits the prod-reachable graph only); document accepted risk for dev-only
transitives if no patched upgrade exists yet.

## Upgrade decisions log

### React 19 + React Compiler (2026-06-12) — ADOPTED

- `react`/`react-dom` 18.3 → 19.2 with `@types/react*` 19: **zero** type or
  test changes needed (plain-function components, no `forwardRef`, strict
  types throughout made the codebase forward-compatible).
- **React Compiler** enabled in `vite.config.ts` via
  `babel-plugin-react-compiler` — automatic memoization at build time;
  verified active (`useMemoCache` present in the production bundle). The
  `eslint-plugin-react-hooks` v7 rules already lint for compiler
  compatibility (`react-hooks/incompatible-library` warnings on TanStack
  Table test harnesses are expected — those components skip compilation).
- **Deliberately NOT enabled in `vitest.config.ts`**: the compiler's
  synthetic memo-cache checks tripled the branch denominator
  (1,240 → 3,750) and made the coverage ratchet measure compiler internals
  instead of source. Unit coverage stays on source semantics; compiled
  output is exercised by the e2e suite (20 specs) and the production build.
- Coverage ratchet raised on the upgrade's real gains: functions 52 → 56,
  lines 57 → 60, statements 57 → 59 (branches hold at 53).
