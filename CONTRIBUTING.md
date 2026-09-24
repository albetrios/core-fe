# Contributing to Core Frontend

This document is for **humans** working on the project. It explains how the repo is organized, what documentation exists, how AI assistance is configured, and what you can expect to happen automatically.

---

## Documentation You Need

| Document                                                    | Purpose                                                                                                                                            |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **README.md**                                               | Quick start, scripts, code structure, third-party libs, env vars, architecture, how to request changes from AI.                                    |
| **CLAUDE.md**                                               | Single source of truth for conventions: architecture, route marker, imports, state, styling, auth, testing. Read before making changes.            |
| **CONTRIBUTING.md** (this file)                             | For humans: where things live, what runs automatically, how to work with the codebase and with AI.                                                 |
| **docs/getting-started/requirement-format.md**              | Standard format for writing feature requirements (template + field guide). Use so the AI can implement in one pass.                                |
| **docs/getting-started/requirements/sample-requirement.md** | Filled example of the requirement format (Notifications page).                                                                                     |
| **.env.example**                                            | Reference for all environment variables (the only committed env file); `pnpm setup:local` scaffolds the gitignored `.env.local` from it.           |
| **agent-os/docs/cursor-mcp-setup.md**                       | **Onboarding (Cursor users):** Set up MCP locally (Context7, shadcn, Tailwind, core-be-api). Required for AI assistance with docs and backend API. |

---

## Running the Project

- **Where:** All commands from **project root** (the directory containing `package.json`).
- **Install:** `pnpm install`
- **Dev:** `pnpm dev` → app at http://localhost:5173
- **Scripts:** See the "Where to Run & Scripts" table in **README.md**.

---

## Code Structure (Quick Reference)

- **`src/app/`** — Route tree, guards, providers, error boundaries, analytics/observability bootstrap.
- **`src/core/`** — Framework-agnostic platform: HTTP, RBAC, config, data-provider, version (no React components).
- **`src/pages/<name>/`** — One route island per URL segment, 4 mandatory files: `<page>.route.tsx`, `<page>.manifest.ts`, `<Page>Page.tsx`, `<PAGE>.OVERVIEW.md` (plus optional data layer and unit folders).
- **`src/shared/`** — Cross-page components/forms/hooks/layouts, auth runtime (`shared/auth/`), tenancy (`shared/tenancy/`), global Zustand stores (`shared/store/`).
- **`src/lib/`** — Pure utilities (e.g. `cn()`, route builders, animations).

**Dependency rule (one-way):** `ui → lib → core → shared → pages → app`. Pages never import from other pages. `pnpm validate:structure` enforces the island anatomy.

Full layout and diagrams are in **README.md** and **CLAUDE.md**.

---

## Cursor Rules and Skills (AI Behavior)

The project uses **Cursor rules** (`agent-os/rules/*.mdc`) and **skills** (`agent-os/skills/*/SKILL.md`) so that AI assistance follows project conventions and completes dependent work **without asking you**.

**Onboarding (Cursor users):** Set up MCP locally so the AI can use Context7, shadcn, Tailwind, and the backend API. See **[agent-os/docs/cursor-mcp-setup.md](agent-os/docs/cursor-mcp-setup.md)** for step-by-step instructions.

### Always-active rules

These are applied automatically (no need to mention them):

- **fe-project-conventions.mdc** — Architecture, imports, state, file conventions.
- **fe-file-structure.mdc** — Route marker, page directory shape, dialog vs full page.
- **fe-context7-libraries.mdc** — Use Context7 MCP for up-to-date library docs.
- **fe-skill-router.mdc** — Routes your request to the right skill; complete all steps without asking.
- **fe-agent-behavior.mdc** — Complete tests, route registration, RBAC, docs as part of the work; never ask "Do you want me to add tests?" etc.
- **fe-testing-requirements.mdc** — Auto-generate colocated tests when creating/changing source files; no user confirmation.

### Skills (invoked by task type)

When you ask for something (e.g. "add a settings page"), the **fe-skill-router** matches your request to a skill. The master **fe-auto-implement** skill orchestrates the full pipeline: parse requirement → implement → route → RBAC → test → lint → docs → verify. Everything happens **without asking** "Do you need tests?" or "Should I register the route?"

| You say / do                                   | Skill used                             | What gets done (no confirmation asked)                                                                                           |
| ---------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Any requirement** (feature, page, component) | **fe-auto-implement** (master)         | Full pipeline: fe-code-structure → fe-page-scaffolding → fe-test-generation → fe-lint-guard → docs → verify acceptance criteria. |
| Add a page, implement a feature                | fe-code-structure, fe-page-scaffolding | Placement, route.tsx, page, contracts, api, hooks, **tests**, route registration, RBAC if protected, data-testid.                |
| Add a new component/file under src/            | fe-test-generation                     | Colocated test file created automatically.                                                                                       |
| Move component to shared                       | fe-component-promotion                 | Move file + test, update imports; create test if missing.                                                                        |
| Optimize performance, re-renders               | react-best-practices                   | Applied during implementation.                                                                                                   |
| UI review, accessibility                       | web-design-guidelines                  | Review against a11y/form/typography rules.                                                                                       |
| Lint/CI/security changes                       | fe-code-quality-security               | Consistency with existing pipeline.                                                                                              |
| _(after every code change)_                    | **fe-lint-guard** (auto)               | Fix all ESLint + TypeScript errors silently before responding.                                                                   |

Full skill list and triggers: **agent-os/skills/fe-skill-registry/SKILL.md**.

---

## What Happens Without You Asking

When you request a change, the agent runs the **fe-auto-implement** pipeline:

1. **Parse your requirement** — extract What, Where, Acceptance criteria, API, UI, Constraints.
2. **Implement** — place code in the correct layer, scaffold pages, create components/hooks/forms.
3. **Register routes** in `src/app/routes/routeTree.tsx` and add **RBAC** in `src/core/rbac/policies.ts`.
4. **Add or update tests** — colocated test files with vitest-axe and data-testid.
5. **Fix lint + types** — fe-lint-guard ensures zero ESLint errors and zero TypeScript errors.
6. **Update docs** — README.md / CLAUDE.md when the change affects structure or conventions.
7. **Verify acceptance criteria** — each criterion checked before responding.

**None of these steps require confirmation.** The user provides only the requirement.

If you ever see the agent asking for confirmation on tests, routes, RBAC, lint, or docs, point it to **agent-os/rules/fe-agent-behavior.mdc** and **agent-os/skills/fe-auto-implement/SKILL.md**.

---

## How to Request Changes (For Best Results)

### For features or multi-part work: use the requirement format

Use the **standard requirement format** so the agent has everything in one place and implements without back-and-forth:

1. **Template and field guide:** [docs/getting-started/requirement-format.md](docs/getting-started/requirement-format.md) — copy the template and fill in: What, Where, Acceptance criteria, Data/API, UI/Behavior, Constraints (and optional Out of scope).
2. **Filled example:** [docs/getting-started/requirements/sample-requirement.md](docs/getting-started/requirements/sample-requirement.md) — sample "Notifications page" requirement.

Paste your filled requirement into the chat. The agent will parse it and implement fully (tests, route registration, RBAC) without asking. If you give a vague request (e.g. "we need notifications"), the agent will ask you to use this format and point you to the template and sample.

### For small, single-step requests

Be specific about **what** and **where**; the agent will infer the rest and complete dependent tasks.

- **Good:** "Add a notifications page at /notifications with a list and mark-all-read button."
- **Good:** "Add a Settings page with profile form (name, email) and theme toggle."

For a short template and more examples, see "How to Request Changes (Best Format for AI)" in **README.md**.

---

## Adding a New Page (Manual Checklist)

If you prefer to do it yourself or verify after AI:

1. Create `src/pages/<name>/` with the 4 mandatory island files — `<name>.route.tsx`, `<name>.manifest.ts`, `<Name>Page.tsx`, `<NAME>.OVERVIEW.md` — plus optional `<name>.contracts.ts`, `<name>.api.ts`, `hooks/`, `components/`, `forms/` (template: [docs/getting-started/route-island-template.md](docs/getting-started/route-island-template.md)).
2. Register the route in `src/app/routes/routeTree.tsx` (lazy import) and add a row in `docs/reference/routes-and-ui.md`.
3. Add permissions in `src/core/rbac/policies.ts` if the route is protected.
4. Add colocated tests — every component and hook ships a `*.test.ts(x)` (validator-enforced).
5. Use `data-testid` per the convention in fe-testing-requirements, then run `pnpm validate:testids` and `pnpm validate:structure`.

---

## Testing

Full matrix: **[docs/reference/testing.md](docs/reference/testing.md)** and **[tests/README.md](tests/README.md)**.

| Kind                               | Command                 |
| ---------------------------------- | ----------------------- |
| Unit + security (Vitest)           | `pnpm test`             |
| E2E (Playwright, core-be required) | `pnpm test:e2e`         |
| Visual regression                  | `pnpm test:visual`      |
| Patch coverage (PR)                | `pnpm coverage:patch`   |
| Test ID contracts                  | `pnpm validate:testids` |

- Tests are **colocated** under `src/` (`*.test.ts(x)`); strict colocation is `pnpm validate:structure`.
- **E2E** uses hybrid selectors — `data-testid` for actions, `getByRole`/`getByLabel` for a11y guards (`agent-os/skills/fe-playwright-e2e/SKILL.md`, `tests/utils/e2e-hybrid.ts`).
- Component tests must include **vitest-axe**; dialog tests use **`axeForDialog`** (`tests/utils/axe-for-dialog.ts`).
- Templates: **agent-os/skills/fe-test-generation/SKILL.md**.

---

## Branches, Commits, and Releases

- **Branches:** trunk-based — short-lived `feat/`, `fix/`, `chore/`, `docs/`, `ci/` branches off `main`, squash-merged back (branch auto-deletes). Unfinished work ships behind a feature flag, not a branch.
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/) with **lower-case subjects** (commitlint-enforced).
- **Releases:** single-channel Release Please ([post-merge-ci.yml](.github/workflows/post-merge-ci.yml) on `main`) — config in `.github/release-please/` (`config.json` + `manifest.json`). Merging the standing "chore: release X.Y.Z" PR is the ship button → tag + prod deploy (one approval). PR titles must be conventional — PR Governance validates them and auto-applies size/path labels.

---

## Git Hooks and Quality Gates

[Husky](.husky/) runs checks locally. Fix failures rather than skipping hooks (`--no-verify`).

| Hook           | What runs                                                                                                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **pre-commit** | before-commit-guard (env docs, public assets), lint-staged (biome check → eslint --fix → prettier), gitleaks scan, conflict-marker + large-file guards                                     |
| **commit-msg** | commitlint (Conventional Commits, lower-case subject)                                                                                                                                      |
| **pre-push**   | biome check, type-check, build, changed-markdown lint, unit tests (when relevant), API contract drift vs core-be, SonarQube gate on deployed-surface changes (no bypass — fix, don't skip) |

**Full local gate:** `pnpm quality` = `pnpm health` (every phase: format, lint, biome, docs, types, tests, build, size, env, public, tsdoc, structure) + the local SonarQube gate ([docs/reference/quality/sonarqube-local.md](docs/reference/quality/sonarqube-local.md)). CI mirrors these as parallel lanes behind a single required `quality-gate` check.

---

## Code of Conduct and Security

- **[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)** — community expectations.
- **[SECURITY.md](SECURITY.md)** — how to report vulnerabilities privately; dependency-advisory response targets.

---

## Summary

- **README.md** and **CLAUDE.md** are the main docs; **CONTRIBUTING.md** is for humans working on the project.
- **Rules and skills** in `agent-os/rules/` and `agent-os/skills/` drive AI behavior and are **invoked automatically** when your request matches.
- The **fe-auto-implement** skill is the master pipeline: requirement → implement → route → RBAC → test → lint → docs → verify. All dependent tasks (tests, routes, RBAC, lint, docs) are completed **without asking you**.
- **You provide only the requirement.** Everything else is handled in the background.
