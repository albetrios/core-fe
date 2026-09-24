---
description: Draft a requirement (tree first) for review, then build the production-ready slice
argument-hint: <a direct task — what you want in a line or two — or a filled form / path>
allowed-tools: Bash(pnpm*), Bash(git*)
---

Turn a requirement into a complete, production-ready vertical slice. **The normal input is a direct task** — a line or two of what you want (**$ARGUMENTS**, the conversation, or a path), not a filled form — so you **draft** the full document, get it **reviewed**, then build. The document format is in `docs/getting-started/requirement-format.md` (filled example: `docs/getting-started/requirements/sample-requirement.md`; intake overview: `docs/getting-started/requirement-intake.md`).

## 1. Draft the full requirement, then get it reviewed (you fill it, not the user)

The user normally gives a direct task, not the whole form. Build the document for them:

1. **Draft all sections** of the FE requirement form (`### What`, `### Where`, `### Acceptance criteria`, plus optional `### Data / API`, `### UI / Behavior`, `### Constraints`, `### Out of scope`). Fill sensible defaults from `requirement-intake.md` and infer route path, RBAC permissions, API hooks, UI layout, tests, and the **file tree under `src/pages/` or `src/shared/`** from the prompt.
2. **Mark everything you added** so the user sees exactly what to scrutinize: tag each value _you_ inferred or defaulted (not what the user stated) inline with **`[assumed]`** — e.g. `- Permission: notifications.read  [assumed]` — and lead the draft with an **"Assumptions I added — confirm or change"** list gathering those choices in one place, one line + reason each.
3. **Present the full draft for review** as one fenced block — the assumptions list first, then the **proposed file tree** (layout reviewed first: `pages/<page>/` route island or `shared/components/<Name>/`), then the requirement sections. **Ask** only the **unresolved** items from the Question catalog below — never guess the ★ (structural / irreversible) ones.
4. **Iterate**: apply each "change X", clear the `[assumed]` tag on anything the user confirms or edits, and re-present until they approve. The approved draft is the final document.

### Question catalog (ask only the unresolved items; ★ = never guess)

- **Placement** — ★ new page vs extend existing · ★ URL path (`/organization/$organizationSlug/...`) · ★ layout shell (AuthLayout · AppLayout · hash modal `#settings/...`)
- **Route island** — ★ `kind: 'leaf' | 'layout'` · ★ protected vs public · ★ RBAC permission code(s) · nested children (if layout)
- **Data / API** — ★ HTTP via core-be · endpoint(s) and Zod shape in `<page>.contracts.ts` · TanStack Query hook placement
- **UI / Behavior** — shadcn components (see `agent-os/skills/shadcn/SKILL.md`) · forms (react-hook-form + Zod) · empty/loading/error states · `data-testid` naming
- **Tests** — unit/component (colocated `*.test.tsx`) · page integration (`__tests__/integration/`) · E2E (`tests/e2e/*.e2e.test.ts`) when user-facing flow warrants it
- **Non-functionals** — a11y (vitest-axe) · bundle/preload (no static imports of heavy deferred modules) · semantic tokens only
- **Delivery** — feature branch off `main` (hotfix → fix-forward on `main`) · PR after build (no · yes → `/fe-ship`)

Anything not ★ you may infer and tag `[assumed]`. This catalog is curatable — trim or extend it freely.

Do **not** start the build before the draft — the file tree especially — is approved.

## 2. Run the build pipeline (fe-auto-implement orchestrates existing skills)

Follow **`agent-os/skills/fe-auto-implement/SKILL.md`** end-to-end:

1. **fe-code-structure** — correct layer (`pages/`, `shared/`, `core/`, `lib/`); dependency rule; folder-per-unit.
2. **fe-route-island** + **fe-page-scaffolding** (new pages) — `<page>.route.tsx`, `<page>.manifest.ts`, `<Page>Page.tsx`, `<PAGE>.OVERVIEW.md`, contracts/api/hooks/components as needed.
3. **Register route** in `src/app/routes/routeTree.tsx` and **RBAC** in `src/core/rbac/policies.ts`.
4. **`/fe-routes-sync`** — update `docs/reference/routes-and-ui.md` when routes change.
5. **fe-test-generation** — colocated tests, vitest-axe, data-testid.
6. **fe-e2e-testids** — when interactive UI needs Playwright-ready selectors.
7. **fe-lint-guard** + **fe-code-smells-best-practices** — zero ESLint/TS errors; import and pattern hygiene.
8. **fe-documentation-maintenance** — README / CLAUDE / docs index when structure or routes change.

## 3. Autonomous verify → heal loop

Run the gates; on failure, diagnose, fix, and re-run — until green. **Definition of done:** `/fe-validate` clean + `pnpm test:unit` (and E2E if in scope) + **`/fe-pre-merge-review`** clean. Escalate only on ambiguity, an irreversible/destructive step, a security trade-off, or repeated no-progress failure.

## 4. Emit the reports bundle

Write `docs/builds/<YYYY-MM-DD>-<feature>/`:

- **build-report.md** — files created, decisions, assumptions, any spec deviations.
- **traceability.md** — each intake item → the code + tests that satisfy it.
- **review.md** — the `/fe-pre-merge-review` output.
- **quality.md** — test/coverage + lint/type status; a11y and security notes (tokens, auth boundaries, no secrets in client bundle).

Commit per step so the build is resumable. Do **not** open a PR unless asked — when the slice is green, suggest `/fe-ship`.
