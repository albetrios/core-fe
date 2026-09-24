# Documentation Index

Guides are grouped by **use case**. Use this index to find the right doc quickly.

> **Note:** Mermaid diagrams in this repo render as diagrams on GitHub (repo view, PRs, and when browsing `.md` files).

```mermaid
flowchart TB
  subgraph getting_started["Getting started"]
    direction TB
    g0[new-project]
    g1[setup]
    g2[requirement-intake]
    g3[fe-requirement-format]
    g4[sample-requirement]
  end
  subgraph deployment["Deployment"]
    direction TB
    d1[runbook-local-to-production]
    d2[cicd-and-netlify]
    d3[deployment-and-pre-launch]
    d4[path-to-production]
    d5[netlify-cli-setup]
  end
  subgraph integrations["Integrations"]
    i1[credentials-and-env]
    i2[sentry-sourcemaps]
    i3[cursor-mcp-setup]
    i4[cursor-agent-environments]
    i5[cursor-backend-mcp]
  end
  subgraph process["Process"]
    p1[trunk-based-workflow]
  end
  subgraph reference["Reference"]
    r1[tools-and-usage]
    r2[dependency-upgrades]
    r3[internationalization]
  end
```

---

## Getting started

| Doc                                                                                                          | Purpose                                                                       |
| ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| [new-project.md](getting-started/new-project.md)                                                             | Derive a NEW product from this repo: fork path, `pnpm rebrand`, upstream sync |
| [setup.md](getting-started/setup.md)                                                                         | Local development: clone, env, run the app                                    |
| [setup-detailed.md](getting-started/setup-detailed.md)                                                       | Platform-specific detailed setup companion to setup.md                        |
| [requirement-intake.md](getting-started/requirement-intake.md)                                               | How to submit a requirement so the AI can implement it in one go              |
| [requirement-format.md](getting-started/requirement-format.md)                                               | Template and field guide for writing requirements                             |
| [route-island-template.md](getting-started/route-island-template.md)                                         | Copy-paste tree (`<page>.manifest.ts`, colocated tests, direct children)      |
| [requirements/sample-requirement.md](getting-started/requirements/sample-requirement.md)                     | Filled example (Notifications page)                                           |
| [requirements/unified-auth-otp-requirement.md](getting-started/requirements/unified-auth-otp-requirement.md) | **Cross-repo:** email/phone OTP rename, unified login+signup, BE+FE checklist |

---

## Deployment

| Doc                                                                                             | Purpose                                                                              |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| [runbook-local-to-production.md](deployment/runbook-local-to-production.md)                     | Step-by-step: local dev → validate → build → deploy                                  |
| [cicd-and-netlify.md](deployment/cicd-and-netlify.md)                                           | CI/CD, Netlify env, deploy commands, GitHub Actions                                  |
| [deployment-and-pre-launch.md](deployment/deployment-and-pre-launch.md)                         | Full deployment guide and pre-launch checklist                                       |
| [path-to-production.md](deployment/path-to-production.md)                                       | Gate: run runbook + checklist before release                                         |
| [production-readiness.md](deployment/production-readiness.md)                                   | **Go / no-go** — what blocks production, categorized                                 |
| [netlify-cli-setup.md](deployment/netlify-cli-setup.md)                                         | Netlify CLI one-time connect and deploy                                              |
| [branch-protection.md](deployment/branch-protection.md)                                         | Branch protection + required CI checks (as-code: `pnpm github:sync`)                 |
| [runbooks/README.md](deployment/runbooks/README.md)                                             | Production runbooks index (CSP / Trusted Types / config.js)                          |
| [runbooks/environment-variables.md](deployment/runbooks/environment-variables.md)               | **Env schema** — `.env.example`, auth switches, GitHub/Netlify deploy                |
| [runbooks/csp-trusted-types-production.md](deployment/runbooks/csp-trusted-types-production.md) | CSP report URI, Trusted Types, `config.js` SRI contract                              |
| [.github/environments/README.md](../.github/environments/README.md)                             | GitHub Environments IaC: `pnpm github:sync`                                          |
| [reference/env-catalog.md](reference/env-catalog.md)                                            | **Env-var catalog** (generated) — kind, schema default, per-env default, description |

---

## Integrations (credentials & tools)

| Doc                                                                                             | Purpose                                                                                                   |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| [credentials-and-env.md](integrations/credentials-and-env.md)                                   | Where to get credentials and env vars (API, Sentry, PostHog, Netlify, GitHub Secrets)                     |
| [../deployment/runbooks/environment-variables.md](deployment/runbooks/environment-variables.md) | Canonical env runbook — schema, auth switches, module keys, `config.js`                                   |
| [sentry-sourcemaps.md](integrations/sentry-sourcemaps.md)                                       | Sentry source map upload (Vite plugin)                                                                    |
| [sentry-frontend.md](integrations/sentry-frontend.md)                                           | Sentry React SDK — errors, replay, performance, logs, feedback (full data catalog)                        |
| [posthog-frontend.md](integrations/posthog-frontend.md)                                         | PostHog product analytics — events, funnels, flags, Web Vitals (full event catalog)                       |
| [cursor-mcp-setup.md](../agent-os/docs/cursor-mcp-setup.md)                                     | **Local setup:** Cursor MCP servers (Context7, shadcn, Tailwind, core-be-api) — required for Cursor users |
| [cursor-agent-environments.md](../agent-os/docs/cursor-agent-environments.md)                   | Multi-root workspaces and Cursor agent environments (core-fe + core-be)                                   |
| [cursor-backend-mcp.md](../agent-os/docs/cursor-backend-mcp.md)                                 | Connect Cursor to the backend MCP for API discovery                                                       |

---

## Process

| Doc                                                                          | Purpose                                                                                     |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| [trunk-based-workflow.md](process/trunk-based-workflow.md)                   | **Trunk-based** branch naming, squash-merge PR flow, release-please ship, hotfix            |
| [organization-deployment-modes.md](process/organization-deployment-modes.md) | Personal / team / both deployment toggles — signup, onboarding, switcher, **env-only auth** |
| [pr-review.md](process/pr-review.md)                                         | PR review rubric                                                                            |
| [release-versioning.md](process/release-versioning.md)                       | Release and versioning process                                                              |
| [CONTRIBUTING.md](../CONTRIBUTING.md)                                        | For humans: repo layout, hooks/gates, how to work with the AI                               |
| [SECURITY.md](../SECURITY.md)                                                | Vulnerability reporting, dependency-advisory response targets                               |
| [CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md)                                  | Community expectations                                                                      |

---

## Testing

| Doc / location                                                               | Purpose                                                                                      |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **[tests/README.md](../tests/README.md)** (project root)                     | **Global test overview** — commands, folder layout, hybrid E2E                               |
| **[reference/testing.md](reference/testing.md)**                             | **Full test matrix** — every kind, spec inventory, skills, gates                             |
| **[reference/local-production-perf.md](reference/local-production-perf.md)** | **Production build perf** — `pnpm build` + `pnpm preview`, `pnpm size`, Lighthouse (not dev) |
| **[reference/cross-browser-support.md](reference/cross-browser-support.md)** | **Cross-browser matrix** — Chrome/Firefox/Safari status + `pnpm test:cross-browser`          |
| **[reference/scheduled-jobs.md](reference/scheduled-jobs.md)**               | **Scheduled + periodic jobs registry** — every cron, cadence, and signal (enforced)          |
| [e2e-testids-inventory.md](reference/e2e-testids-inventory.md)               | **`data-testid` catalog** for Playwright E2E (by route); keep in sync with UI                |
| [tools-and-usage.md](reference/tools-and-usage.md)                           | Dependency usage (Vitest, Playwright, etc.)                                                  |

---

## Reference

| Doc                                                                          | Purpose                                                                                                          |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| [tools-and-usage.md](reference/tools-and-usage.md)                           | Dependency usage table (what each package is used for)                                                           |
| [documentation-tiers.md](reference/documentation-tiers.md)                   | **In-source doc tiers** — OVERVIEW (required) + optional PATTERNS/FLOWS/POLICIES for complex subsystems          |
| [data-mutations.md](reference/data-mutations.md)                             | **Optimistic updates & write UX** — which mutations are optimistic vs in-progress, the policy, and the inventory |
| [quality/sonarqube-local.md](reference/quality/sonarqube-local.md)           | **SonarQube local quality gate** — Docker server, `pnpm sonar:scan`, pre-push enforcement                        |
| [quality/test-coverage.md](reference/quality/test-coverage.md)               | **Test coverage** — runners, global ratchet thresholds, patch coverage, strict colocation                        |
| [security-model.md](reference/security-model.md)                             | **Frontend security model** — threats covered, CSP delivery, accepted risks, backend's half                      |
| [branch-governance.md](reference/branch-governance.md)                       | **Branch governance mode** — personal ↔ team review posture, one switch keeps ruleset + prod env consistent      |
| [backend-list-pagination-spec.md](reference/backend-list-pagination-spec.md) | **Backend pagination spec** — core-be cursor for invoices + server-side sort/filter; FE follow-ups               |
| [third-party-comparison.md](reference/third-party-comparison.md)             | Keep/swap verdicts for major dependencies (charts, analytics, routing)                                           |
| [ui-components-sourcing.md](reference/ui-components-sourcing.md)             | shadcn-first UI workflow (`pnpm dlx shadcn@latest add`, research sites)                                          |
| [design.md](reference/design.md)                                             | **Design language** — aesthetic POV, typography, colour, motion, themeability principles                         |
| [preset-product-design-rules.md](reference/preset-product-design-rules.md)   | **Preset product rules** — per-axis floors (type, density, contrast, motion, touch) + WCAG/industry refs         |
| [theming.md](reference/theming.md)                                           | **Theming mechanics** — token map, shadcn-create adoption, Shuffle + swappable icon engine                       |
| [theme-axis-audit-playbook.md](reference/theme-axis-audit-playbook.md)       | **Theme axis audit playbook** — full preset catalog + per-axis fix procedure (all 18 axes ✅)                    |
| [dependency-upgrades.md](reference/dependency-upgrades.md)                   | Audits, Dependabot, and intentional version pins                                                                 |
| [route-island-structure.md](reference/route-island-structure.md)             | **Per-route folders** — same layout for every route/sub-route; import boundaries                                 |
| [routes-and-ui.md](reference/routes-and-ui.md)                               | **Live frontend routes** (and backend APIs they use) and **UI** (shadcn component library and primitives)        |
| [routing-and-tenancy.md](reference/routing-and-tenancy.md)                   | **Routing & tenancy (implemented spec)** — URL-driven org context, guard chain, `/` resolver, settings modal     |
| [csrf-mitigation.md](reference/csrf-mitigation.md)                           | **CSRF mitigation strategy** — the three defense layers and the backend contract                                 |
| [theme-axis-follow-up-plan.md](reference/theme-axis-follow-up-plan.md)       | **Theme-axis follow-ups** — post-audit hardening plan (companion to the playbook)                                |
| **docs/api/** — generated by `pnpm docs:api`, not committed                  | Auto-generated TypeDoc API reference; regenerate locally, do not hand-edit                                       |
| [unified-auth-flows.md](reference/unified-auth-flows.md)                     | **Unified login + sign-up** — email/phone OTP, OAuth, route/API matrix, env toggles                              |
| [frontend-platform.md](reference/frontend-platform.md)                       | **Platform kernel** — boot order, gateway, session context, modules, errors, QueryBoundary policy                |
| [pwa-manifest-and-app-icon.md](reference/pwa-manifest-and-app-icon.md)       | **PWA manifest + icon** — `app-manifest.ts` source of truth, preset colors, PNG regen (skill: `fe-pwa-manifest`)    |
| [local-production-perf.md](reference/local-production-perf.md)               | **Local prod perf audit** — build + preview/serve, size limits, Lighthouse workflow                              |
| [e2e-testids-inventory.md](reference/e2e-testids-inventory.md)               | Playwright `data-testid` inventory by route (skill: `agent-os/skills/fe-e2e-testids/`)                              |
| [internationalization.md](reference/internationalization.md)                 | Client-side i18n (react-i18next) + backend message contract                                                      |
| [constants-and-i18n.md](reference/constants-and-i18n.md)                     | Constants file placement, locale namespaces, rollout waves                                                       |
| **[public/README.md](../public/README.md)** (project root)                   | **Static assets** in `public/`: manifest, robots.txt, icons, \_headers; required list and maintenance            |

---

## Reports & audits

| Doc                                                                                                      | Purpose                                                                                                   |
| -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| [reviews/README.md](reviews/README.md)                                                                   | Review artifacts — where generated audit outputs land, naming convention                                  |
| [reviews/2026-06-29-codebase-audit-loop.md](reviews/2026-06-29-codebase-audit-loop.md)                   | Rolling codebase audit log (rotating-perspective review loop; analysis only)                              |
| `reports/code-review/full-code-review-report.md` — generated by `pnpm report:code-review`, not committed | Full code review (security, performance, quality, readability, maintainability, scalability) and findings |

---

## Root-level docs (project root)

- **README.md** — Quick start, scripts, architecture, how to request changes
- **CLAUDE.md** — Conventions (architecture, routes, state, styling, testing)
- **CONTRIBUTING.md** — For humans: where things live, what runs automatically
