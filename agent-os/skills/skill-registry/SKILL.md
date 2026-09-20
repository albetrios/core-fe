---
name: skill-registry
description: Master catalog of all project skills with trigger scenarios, file locations, and decision guidance. Use when the user asks "which skill should I use", "list skills", "what skills exist", "how do I do X", or needs help finding the right approach for a task.
---

# Skill Registry

Complete inventory of project skills. Use this to find the right skill for any task.

## Decision Tree

**"I want to..."**

- ...implement any requirement / build a feature end-to-end (master pipeline) -> **auto-implement** (orchestrates all other skills)
- ...implement a requirement / add a feature / know where to put code -> **code-structure**
- ...submit a requirement in standard format / request is vague or feature-sized -> **requirement-format**
- ...create a new page/route -> **page-scaffolding**
- ...move a component to shared -> **component-promotion**
- ...optimize React performance -> **react-best-practices**
- ...review UI accessibility/design -> **web-design-guidelines**
- ...refactor component API/props -> **composition-patterns**
- ...add lint rules/security checks/CI -> **code-quality-security**
- ...understand commit checks / fix pre-commit failures / run before-commit guard -> **before-commit-guard**
- ...fix lint/type errors after implementation -> **lint-guard** (auto-invoked, never needs user ask)
- ...check/fix code smells and best practices on new or changed code -> **code-smells-best-practices** (live code only)
- ...add tests/write tests/coverage -> **test-generation**
- ...E2E test ids / data-testid / Playwright selectors -> **e2e-testids**
- ...write/refactor Playwright E2E specs -> **playwright-e2e**
- ...visual regression / screenshot baselines / snapshot diff -> **visual-regression** (local-only; needs core-be)
- ...debug a bug / test failure / unexpected behavior (before any fix) -> **systematic-debugging** (root cause first)
- ...route island / self-contained path / nested sub-route folder -> **route-island**
- ...org-scoped route, guards, gateway, session context, settings hash -> **routing-tenancy**
- ...backend resource CRUD (list, URL dialogs, resource manifest) -> **resource-crud**
- ...form mutation errors, 422 mapping, rate limit, QueryBoundary -> **http-forms-errors**
- ...double-submit, a crash escaping its boundary, a toast that outruns the work, a screen guessing its shape -> **resilient-interactions**
- ...platform config, knip, vite-env / client-env validators -> **platform-hygiene**
- ...add a validate gate / lint restriction / static-sync CI step -> **guard-authoring** (prove it fires)
- ...RTL mirroring / logical properties / physical ml-mr-left-right -> **rtl-logical-css**
- ...render a date / time / timezone / number / currency -> **locale-formatting** (never bare Intl)
- ...locale or direction preference, apply path, FOUC init, build mode -> **locale-preferences**
- ...about to open a PR / "is this ready for review" -> **pre-pr-sweep**
- ...sweep / codemod / rename across many files, bulk JSON edits -> **safe-bulk-edits**
- ...add / rename / remove an agent-os skill or rule -> **agent-os-authoring**
- ...handed a review report / PR review threads to address -> **review-response** (verify each claim)
- ...recommend extensions, IDE setup, productivity, workspace settings -> **extension-settings-recommendations**
- ...add/change docs, where to document, keep README/CLAUDE in sync -> **documentation-maintenance**
- ...run a full project health check / verify everything works after major changes -> **project-health-check**
- ...run full code review / generate code review report -> **full-code-review**
- ...add/style/compose a shadcn component, run the shadcn CLI, choose a component -> **shadcn** (`agent-os/skills/shadcn/SKILL.md`)
- ...make a UI distinctive/polished/beautiful -> **frontend-design** (default) + **shadcn** + **web-design-guidelines**
- ...redesign / audit / polish product UI ("impeccable") -> **impeccable** + **shadcn** + **frontend-design** (guardrails win)
- ...implement Anime.js animation -> **animejs** (+ **emil-design-eng** for motion bar)
- ...review animation code in a PR -> **review-animations**
- ...look up design intelligence (styles, palettes, font pairings, UX/stack/chart guidelines) -> **ui-ux-pro-max** (`agent-os/skills/ui-ux-pro-max/SKILL.md`), advisory only
- ...find/install a skill that doesn't exist yet -> **find-skills** (`agent-os/skills/find-skills/SKILL.md`)
- ...audit Appearance/Shuffle theme axes, fix preset compliance, "do elevation" one-by-one -> **theme-axis-audit** (`agent-os/skills/theme-axis-audit/SKILL.md`)
- ...add/rename/remove env var, sync `.env.example`, Secret vs Variable -> **env-schema-add** (`agent-os/skills/env-schema-add/SKILL.md`)

## Task → Required Skills (read in this order)

For each common task, the skills below are required/auto-invoked. `auto-implement` orchestrates the starred (★) chain; `lint-guard` + `code-smells-best-practices` run after **any** code change; `documentation-maintenance` runs when routes/features/docs change.

| Task                                                      | Required skills (in order)                                                                                                                                                                                                  |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Implement a feature / requirement (end-to-end)**        | auto-implement ★ → requirement-format (if vague) → code-structure → page-scaffolding (if new route) → shadcn + frontend-design (UI) → test-generation → lint-guard → code-smells-best-practices → documentation-maintenance |
| **New page / route / sub-route**                          | route-island → page-scaffolding → code-structure → shadcn (UI) → test-generation → e2e-testids → lint-guard → documentation-maintenance                                                                                     |
| **Org-scoped route / guards / gateway**                   | route-island → **routing-tenancy** → test-generation → lint-guard → documentation-maintenance                                                                                                                               |
| **Backend resource CRUD island**                          | route-island → **resource-crud** → **routing-tenancy** (if org-scoped) → **http-forms-errors** (forms) → test-generation → e2e-testids → lint-guard                                                                         |
| **Form + API mutation**                                   | composition-patterns → **http-forms-errors** → **resilient-interactions** → test-generation → lint-guard                                                                                                                                                 |
| **Platform / env hygiene**                                | **platform-hygiene** → env-schema-add (if key changed) → documentation-maintenance → lint-guard                                                                                                                             |
| **New machine-enforced invariant (gate / lint rule)**     | **guard-authoring** (probe both directions) → code-quality-security (CI wiring) → documentation-maintenance                                                                                                                 |
| **Any user-visible date / number / money value**          | **locale-formatting** → i18n-constants (labels) → test-generation                                                                                                                                                           |
| **New / restyled component (RTL correctness)**            | shadcn → frontend-design → **rtl-logical-css** → web-design-guidelines → test-generation                                                                                                                                    |
| **Locale / direction preference or apply path**           | **locale-preferences** → locale-formatting → i18n-constants → test-generation                                                                                                                                               |
| **Opening a PR / requesting review**                      | **pre-pr-sweep** → before-commit-guard → documentation-maintenance (PR body accuracy)                                                                                                                                        |
| **Codemod / sweep / bulk rename across many files**       | **safe-bulk-edits** → lint-guard → pre-pr-sweep                                                                                                                                                                             |
| **Adding / changing an agent-os skill or rule**           | **agent-os-authoring** → documentation-maintenance → `/agent-os-sync`                                                                                                                                                       |
| **Addressing a code review / review report**              | **review-response** → (the skill each finding names) → pre-pr-sweep → documentation-maintenance                                                                                                                             |
| **New / changed UI component**                            | shadcn (add/compose) → frontend-design (craft) → ui-ux-pro-max (guidance, advisory) → web-design-guidelines (a11y) → composition-patterns (API) → test-generation → lint-guard                                              |
| **Design decision (style/palette/font/chart)**            | ui-ux-pro-max (query DB, advisory) → frontend-design (direction) → shadcn (tokens/components) — never override neutral tokens/brand without user ask                                                                        |
| **Add/choose a shadcn component or run the CLI**          | shadcn (single skill: CLI + critical rules + 20 allowed sources)                                                                                                                                                            |
| **Style / beautify / restyle existing UI**                | frontend-design (within tokens/brand) → shadcn (primitives) → web-design-guidelines (a11y) → lint-guard                                                                                                                     |
| **Redesign / audit / polish product UI ("impeccable")**   | shadcn → impeccable → frontend-design → web-design-guidelines → lint-guard                                                                                                                                                  |
| **Add Anime.js motion**                                   | animejs → emil-design-eng (motion bar) → lint-guard                                                                                                                                                                         |
| **Review animation code (PR / diff)**                     | review-animations                                                                                                                                                                                                           |
| **Data table / list / filters**                           | shadcn (Table + DataTable) → react-best-practices (perf) → web-design-guidelines → test-generation → lint-guard                                                                                                             |
| **Promote a component to shared/**                        | component-promotion → code-structure → test-generation → lint-guard                                                                                                                                                         |
| **Refactor a component API / remove boolean-prop sprawl** | composition-patterns → react-best-practices → test-generation → lint-guard                                                                                                                                                  |
| **Fix React performance / re-renders / bundle size**      | react-best-practices → lint-guard                                                                                                                                                                                           |
| **Add or update tests**                                   | test-generation → lint-guard                                                                                                                                                                                                |
| **E2E selectors / data-testid on UI**                     | e2e-testids → test-generation (unit tests) → lint-guard                                                                                                                                                                     |
| **Playwright E2E specs (hybrid selectors)**               | playwright-e2e → e2e-testids → lint-guard                                                                                                                                                                                   |
| **Accessibility / UX audit**                              | web-design-guidelines (→ frontend-design if visual polish also needed)                                                                                                                                                      |
| **Lint / type-check failures**                            | lint-guard (then code-quality-security if config changes)                                                                                                                                                                   |
| **Code smells on changed code**                           | code-smells-best-practices → lint-guard                                                                                                                                                                                     |
| **ESLint / Husky / CI / security pipeline change**        | code-quality-security → before-commit-guard                                                                                                                                                                                 |
| **Before committing**                                     | before-commit-guard (env docs, assets, format, lint, types)                                                                                                                                                                 |
| **Add/rename/remove env var**                             | **platform-hygiene** → env-schema-add → tool:sync-env-example → documentation-maintenance (runbook)                                                                                                                         |
| **PWA manifest / favicon / app icon**                     | **pwa-manifest** → `app-manifest.test.ts` + `validate:public` → documentation-maintenance                                                                                                                                   |
| **Docs change / new route affecting README/CLAUDE**       | documentation-maintenance                                                                                                                                                                                                   |
| **Extensions / IDE setup / new tooling**                  | extension-settings-recommendations                                                                                                                                                                                          |
| **Full project health check**                             | project-health-check (chains docs, tests, lint, build, bundle)                                                                                                                                                              |
| **Full code review report**                               | full-code-review                                                                                                                                                                                                            |
| **Theme axis audit** (appearance/shuffle compliance)      | theme-axis-audit → lint-guard → documentation-maintenance (playbook tracker)                                                                                                                                                |
| **"Which skill do I use?"**                               | skill-registry (this file)                                                                                                                                                                                                  |
| **"Is there a skill for X?" / capability missing**        | find-skills (discover + install, then wire into router/registry/docs)                                                                                                                                                       |

> If a task has **no** matching row here or in `skill-router.mdc`, use **find-skills** to look for one before building from scratch; if none exists, proceed with general capabilities.

## Skill Inventory (50 skills)

### 0a. auto-implement (Master Orchestrator)

**Path:** `agent-os/skills/auto-implement/SKILL.md`
**Purpose:** The master skill that runs the full pipeline from requirement to production-ready code. The user provides only a requirement (standard format, short sentence, or vague request); the agent handles everything else in the background: parse → implement → route → RBAC → test → lint → docs → verify.

**Trigger keywords:** Any requirement, any feature request, "here's my requirement", "implement this", "build this", "add this feature"

**Key behaviors:**

- Orchestrates all other skills in order: code-structure → page-scaffolding → test-generation → lint-guard
- Never asks for confirmation on tests, routes, RBAC, docs, lint — does them all
- If request is vague, delegates to requirement-format skill to get the template first
- Verifies every acceptance criterion before responding
- Ensures zero lint errors and zero type errors before the user sees the result

**Skills it chains:** code-structure, page-scaffolding, test-generation, lint-guard, requirement-format, component-promotion (when relevant)

**Related rules:** agent-behavior, skill-router, testing-requirements

### 0b. theme-axis-audit (Appearance / Shuffle compliance)

**Path:** `agent-os/skills/theme-axis-audit/SKILL.md`
**Playbook:** `docs/reference/theme-axis-audit-playbook.md`
**Rule:** `agent-os/rules/theme-axis-audit.mdc`

**Purpose:** One axis per cycle — inventory violations, extend `index.css` `[data-*]` / `[data-slot]` hooks, fix components, verify, update tracker, deliver detailed report.

**Trigger keywords:** theme axis audit, appearance compliance, shuffle not applying, do elevation, do density, one by one theme

**Key behaviors:**

- Phases 0–4 mandatory; no confirmation prompts
- Paired axes only when playbook says so (elevation + separation)
- Radius/shape already done — same patterns for remaining axes
- **Product floors:** `docs/reference/preset-product-design-rules.md` (type scale ≥12px, density vs fonts, motion)

### 0c. Preset product-design rules (doc + Cursor rule)

**Doc:** `docs/reference/preset-product-design-rules.md`
**Rule:** `agent-os/rules/preset-product-design.mdc`

**Purpose:** Industry-backed floors for every Appearance/Shuffle axis (typography, density, contrast, touch, motion) — not a skill, but mandatory reading when editing `src/shared/theme/presets.ts`, Appearance, or dense product UI.

**Trigger keywords:** preset rules, type scale too small, density guidelines, shuffle policy, product design presets

---

### 0d. lint-guard (Background — Auto-Invoked)

**Path:** `agent-os/skills/lint-guard/SKILL.md`
**Purpose:** Automatically fix all ESLint errors, TypeScript errors, and common code-quality issues after every implementation. Runs in the background — the user never asks for it.

**Trigger keywords:** (None — auto-invoked by auto-implement and agent-behavior rule after every code change)

**Key behaviors:**

- Fixes nested ternaries (extract to helper/if-else)
- Fixes React purity issues (Date.now() in render → state + effect)
- Fixes setState-in-effect (→ queueMicrotask)
- Fixes import ordering, unused imports, type imports
- Fixes void-use, fire-and-forget promises
- Adds ESLint config overrides for known patterns instead of inline disables
- Ensures `pnpm lint` = 0 errors and `pnpm type-check` = 0 errors

**ESLint config overrides reference:** Test files, build plugins, analytics providers, route modules, shadcn/ui — all documented in the skill.

**Related skills:** auto-implement (parent orchestrator), code-quality-security (ESLint config changes)

---

### 0e. code-smells-best-practices (Live Code Only)

**Path:** `agent-os/skills/code-smells-best-practices/SKILL.md`
**Purpose:** When any code is added or changed, check only the **modified/live code** for code smells and best-practice violations and fix them in the same change set. Ensures architecture (app not importing from pages), import conventions, no inline styles, no `any`, apiClient from fetch-client, and form-error testid consistency.

**Trigger keywords:** (Auto-invoked when code is added or changed); "fix code smells", "check best practices", "review my changes", "clean up this code"

**Key behaviors:**

- Scope: only files added or modified in the current change (no full codebase audit unless asked)
- Fix: dependency violations (app → core instead of app → pages), import spacing and apiClient path, replace inline styles with CSS/Tailwind, type tests properly (no any), align form-error testid
- Runs without asking; fixes applied in the same turn

**Related skills:** lint-guard (runs after; handles ESLint/TS), code-structure (placement rules), auto-implement (may chain this)

---

### 0f. code-structure

**Path:** `agent-os/skills/code-structure/SKILL.md`
**Purpose:** Canonical code structure and placement rules for implementing any requirement. Ensures code goes in the right layer (core / pages / shared / lib) and that tests are added automatically without user input.

**Trigger keywords:** "implement requirement", "add feature", "where do I put", "code structure", "new component", "new page", "new API"

**Key behaviors:**

- Defines dependency rule: shared ← pages ← core; pages never import from pages
- Placement cheat sheet: route → pages/<name>/<name>.route.tsx; API → pages/<name>/<name>.api.ts; shared UI → shared/components/
- Requires automatic test generation as part of every implementation (no user ask)
- References test-generation and page-scaffolding for full flow

**Related skills:** page-scaffolding, test-generation, component-promotion, requirement-format, file-structure rule

---

### 0g. requirement-format

**Path:** `agent-os/skills/requirement-format/SKILL.md`
**Purpose:** When the user's request is vague or feature-sized, ask for requirements using the standard format (docs/getting-started/requirement-format.md). When they provide a requirement doc in that format, parse it and implement fully without asking (tests, route, RBAC included).

**Trigger keywords:** "I have a requirement", "here's my requirement", "use the requirement format", "requirement template", vague/feature-sized request (e.g. "we need notifications", "add billing")

**Key documents:**

- Full intake (types, skills, rules): `docs/getting-started/requirement-intake.md`
- Format + template: `docs/getting-started/requirement-format.md`
- Filled example: `docs/getting-started/requirements/sample-requirement.md`

**Key behaviors:**

- If request is vague/feature-sized and no formatted doc given → respond with template/link and ask user to fill it; do not build from one line.
- If user provides doc with What, Where, Acceptance criteria (and optional Data/API, UI/Behavior, Constraints) → parse and implement completely; no confirmation questions.

**Related skills:** code-structure, page-scaffolding, test-generation, agent-behavior rule

---

### 1. page-scaffolding

**Path:** `agent-os/skills/page-scaffolding/SKILL.md`
**Purpose:** Scaffold a complete page directory with all standard files following the page-first architecture. Now includes automatic test generation, `data-testid` placement, and Zod response validation.

**Trigger keywords:** "create page", "new page", "add route", "scaffold page", "add feature page"

**Key files it creates/touches:**

- `src/pages/<name>/<name>.route.tsx` (required route marker)
- `src/pages/<name>/<name>.manifest.ts` (required manifest — path, RBAC, testId, kind, children)
- `src/pages/<name>/<Name>Page.tsx` (main component with `data-testid`)
- `src/pages/<name>/<NAME>.OVERVIEW.md` (required entry doc)
- `src/pages/<name>/<name>.contracts.ts` (Zod schemas)
- `src/pages/<name>/<name>.api.ts` (API functions with Zod validation)
- `src/pages/<name>/hooks/use<Name>/` (folder-per-unit TanStack Query hooks)
- `src/app/routes/routeTree.tsx` (route registration)
- Test files for all of the above (auto-generated)

**Related skills:** component-promotion (if new components need sharing later), test-generation (auto-invoked)

---

### 2. component-promotion

**Path:** `agent-os/skills/component-promotion/SKILL.md`
**Purpose:** Move a component from a page-specific location to the shared layer when used by 2+ page groups.

**Trigger keywords:** "move to shared", "promote component", "make reusable", "extract to shared", "used in multiple pages"

**Key files it touches:**

- Source: `src/pages/<page>/components/<Component>/` (folder-per-unit)
- Target: `src/shared/components/<Component>/` (`<Component>.tsx` + `<Component>.test.tsx` + `index.ts`)
- All consumer files (import path updates to the barrel)
- Corresponding test files (move with the unit folder)

**Rule:** Only promote when used by 2+ different page groups AND contains no page-specific business logic.

**Related skills:** page-scaffolding (often creates the components that later get promoted), test-generation (update test imports)

---

### 3. react-best-practices

**Path:** `agent-os/skills/react-best-practices/SKILL.md`
**Purpose:** React and Next.js performance optimization guidelines from Vercel Engineering. 57 rules across 8 categories.

**Trigger keywords:** "optimize performance", "fix re-renders", "reduce bundle size", "waterfall", "slow rendering", "memo", "lazy loading"

**Key categories (by priority):**

1. Eliminating waterfalls (CRITICAL)
2. Bundle size optimization (CRITICAL)
3. Server-side performance (HIGH)
4. Client-side data fetching (MEDIUM-HIGH)
5. Re-render optimization (MEDIUM)
6. Rendering performance (MEDIUM)
7. JavaScript performance (LOW-MEDIUM)
8. Advanced patterns (LOW)

**Project-specific implementations:**

- `React.memo` on `DataTable` component
- `useMemo` on `DataTableToolbar` computations
- `preconnect`/`dns-prefetch` hints in `index.html`
- Lazy loading via route-level code splitting
- Bundle budgets enforced via `size-limit`

**Related skills:** composition-patterns (component architecture affects performance)

---

### 4. web-design-guidelines

**Path:** `agent-os/skills/web-design-guidelines/SKILL.md`
**Purpose:** Review UI code for Web Interface Guidelines compliance. Fetches latest rules from Vercel's guidelines repo.

**Trigger keywords:** "review UI", "check accessibility", "audit design", "review UX", "check a11y", "ARIA", "focus states", "WCAG"

**Categories covered:**

- Accessibility (aria-labels, semantic HTML, keyboard, skip-nav)
- Focus states (visible focus, focus-visible)
- Forms (autocomplete, validation, errors)
- Animation (prefers-reduced-motion)
- Typography (curly quotes, tabular-nums)
- Images (dimensions, lazy loading, alt text, WebP)
- Dark mode and theming
- Touch and interaction
- WCAG 2.1 AA compliance (Perceivable, Operable, Understandable, Robust)

**Project-specific implementations:**

- Skip-navigation links in AuthLayout and AppLayout
- `aria-sort` on DataTableColumnHeader
- `scope="col"` on TableHead
- `aria-label` on OTP inputs, dialog close buttons, pagination selects
- `role="alert"`, `aria-live="assertive"` on OfflineIndicator and RetryError
- `OptimizedImage` with WebP/lazy/fallback
- `Permissions-Policy` header

**Usage:** Provide file paths for review. The skill fetches fresh guidelines from the source URL before each review.

**Related skills:** composition-patterns (component design affects accessibility), frontend-design (aesthetic quality)

---

### 4b. frontend-design (installed skill)

**Path:** `agent-os/skills/frontend-design/SKILL.md` (installed via `npx skills add https://github.com/anthropics/skills --skill frontend-design`)
**Purpose:** Design-thinking + aesthetic quality for building/styling/beautifying UI — distinctive typography hierarchy, intentional color/theme, high-impact motion, spatial composition, depth/atmosphere, memorable details; avoid generic "AI slop".

**Trigger keywords:** "build a page/component", "style this", "beautify", "make it look better", "polish the UI", "landing page", "dashboard design", "design an interface"

**Precedence (important):** apply _within_ this project's guardrails, which win:

- Components from shadcn (`agent-os/skills/shadcn/SKILL.md`) + the 20 allowed sources (`agent-os/rules/ui-sources.mdc`)
- Colors from neutral semantic tokens in `src/index.css` (no raw colors / no purple-on-white)
- Fonts/brand stay configured unless the user asks to change them
- Accessibility/UX from `web-design-guidelines`
- Use it to elevate craft/polish, **not** to override the component library, tokens, or brand. Standalone artifacts may get more creative latitude.

**Related skills:** web-design-guidelines (a11y/UX), shadcn (components/tokens), ui-ux-pro-max (design DB), composition-patterns (component API)
**Related rules:** ui-sources (allowed sources)

---

### 4c. ui-ux-pro-max (installed skill)

**Path:** `agent-os/skills/ui-ux-pro-max/SKILL.md` (installed via `npx skills add https://github.com/nextlevelbuilder/ui-ux-pro-max-skill --skill ui-ux-pro-max`)
**Purpose:** Searchable design-intelligence database — 50+ styles, 161 color palettes, 57 font pairings, 161 product types, 99 UX guidelines, 25 chart types, and per-stack rules (incl. shadcn). Query it for design recommendations and UX checks.

**How to query (requires `python3`; local-only, no network):**

```bash
python3 agent-os/skills/ui-ux-pro-max/scripts/search.py "<query>" --domain <style|color|ux|typography|chart|product|icons>
python3 agent-os/skills/ui-ux-pro-max/scripts/search.py "<query>" --stack shadcn
```

**Trigger keywords:** "what style for", "color palette", "font pairing", "which chart", "UX guideline", "design system for [product]", "is this UI professional"

**Precedence (advisory only):** project guardrails win — do **not** let its palette/font/style suggestions override the neutral semantic tokens in `src/index.css`, configured fonts/brand, or shadcn component choices. Authoritative skills remain **shadcn** (components/tokens), **frontend-design** (craft), **web-design-guidelines** (a11y). Don't run `--persist` (writes `design-system/` files) unless the user asks.

**Safety note:** flagged "High Risk" by the installer's Gen heuristic, but the bundled Python (`core.py`, `search.py`, `design_system.py`, `data/_sync_all.py`) is a local BM25 search + CSV/markdown generator with **no** network/subprocess/eval/exec — reviewed and safe.

**Related skills:** frontend-design (craft), shadcn (components/tokens), web-design-guidelines (a11y)
**Related rules:** ui-sources (allowed sources)

---

### 4d. impeccable (installed — product UI redesign)

**Path:** `agent-os/skills/impeccable/SKILL.md` (pbakaus/impeccable)
**Purpose:** Full product-register redesign: audit, polish, reshape dashboards/admin/settings with dense, intentional layout — **within** core-fe guardrails.

**Trigger keywords:** "impeccable", "redesign", "audit UI", "polish dashboard", "product register", "reshape", "critique UI"

**Precedence:** Invoke when the **user explicitly** asks for a redesign/audit pass — not on every UI tweak (use **frontend-design** for default polish). Never override semantic tokens, Lucide icons, or shadcn component policy.

**Related skills:** shadcn, frontend-design, web-design-guidelines, theme-axis-audit

---

### 4e. animejs (installed — motion implementation)

**Path:** `agent-os/skills/animejs/SKILL.md`
**Purpose:** Anime.js v4 timelines, object tweens, stagger — **this repo's animation library** (`useAnimeCountUp` on dashboard stats).

**Trigger keywords:** "anime.js", "count up", "timeline animation", "stagger animation"

**Related skills:** emil-design-eng (when/why motion), review-animations (PR review)

---

### 4f. emil-design-eng (installed — motion craft bar)

**Path:** `agent-os/skills/emil-design-eng/SKILL.md` (Emil Kowalski / animations.dev)
**Purpose:** Motion philosophy — justified motion, duration budgets, reduced motion, interruptibility. Read before adding new animation.

**Trigger keywords:** "should this animate", "motion feels wrong", "animation timing", "design engineering"

**Related skills:** animejs (implementation), review-animations (PR review)

---

### 4g. review-animations (installed — motion review only)

**Path:** `agent-os/skills/review-animations/SKILL.md`
**Purpose:** Read-only review of animation diffs against Emil's craft bar. Does not implement features.

**Trigger keywords:** "review animations", "review motion PR", "animation code review"

---

### 5. composition-patterns

**Path:** `agent-os/skills/composition-patterns/SKILL.md`
**Purpose:** React composition patterns for building flexible, maintainable components. Avoid boolean prop proliferation.

**Trigger keywords:** "compound component", "too many boolean props", "render props", "context provider", "component API design", "refactor component"

**Key patterns:**

1. Architecture: avoid boolean props, compound components (HIGH)
2. State: decouple implementation, context interface, lift state (MEDIUM)
3. Implementation: explicit variants, children over render props (MEDIUM)
4. React 19: no forwardRef, `use()` for context — applies (project is on React 19)

**Related skills:** react-best-practices (architecture affects performance), web-design-guidelines (composition affects accessibility)

---

### 6. code-quality-security

**Path:** `agent-os/skills/code-quality-security/SKILL.md`
**Purpose:** Three-layer quality and security pipeline -- ESLint plugins, Husky pre-commit, GitHub Actions CI. Now includes commitlint, bundle budgets, Lighthouse CI, release-please, mutation testing.

**Trigger keywords:** "add eslint rule", "lint config", "pre-commit", "CI failing", "security scan", "gitleaks", "semgrep", "what checks run", "bundle size", "release", "deploy"

**Key files:**

- `eslint.config.mjs` -- ESLint rules and plugins (Layer 1)
- `.husky/pre-commit` -- Pre-commit hook script (Layer 2)
- `.husky/commit-msg` -- Commit message validation (Layer 2)
- `.commitlintrc.json` -- Conventional commit config (Layer 2)
- `.gitleaks.toml` -- Secret scan allowlist (Layer 2)
- `.github/workflows/pr-ci.yml` -- PR CI workflow (Layer 3)
- `.github/workflows/preview.yml` -- PR preview builds (Layer 3)
- `.github/workflows/post-merge-ci.yml` -- post-merge tests, release-please, Netlify deploy (Layer 3)
- `.github/workflows/mutation-test.yml` -- Stryker mutation tests (Layer 3)
- `.lighthouserc.cjs` -- Lighthouse CI assertions (Layer 3)
- `.size-limit.json` -- Bundle size budgets (Layer 3)
- `.github/dependabot.yml` -- Automated dependency updates (Layer 3)
- `.semgrepignore` -- Semgrep ignore patterns for CI (Layer 3)

**Related skills:** before-commit-guard (pre-commit hook invokes it)

---

### 6a. before-commit-guard

**Path:** `agent-os/skills/before-commit-guard/SKILL.md`
**Purpose:** Pre-commit gate that runs on every `git commit`. Ensures env docs, public assets, format, lint, and types pass before code is committed. Invoked automatically by `.husky/pre-commit` when user runs `git commit`.

**Trigger keywords:** "what runs on commit", "pre-commit guard", "before commit checks", "why did my commit fail", "fix commit failure", "commit checks"

**Key behaviors:**

- Runs via `./tooling/validate/before-commit-guard.sh` on every `git commit`
- Checks: validate:env-example, validate:public, lint-staged, type-check
- Plus (in pre-commit): gitleaks, merge conflict markers, large file (>1MB)
- Manual run: `pnpm run before-commit-guard`
- Documents how to fix each failure type

**Related skills:** code-quality-security (pre-commit config), lint-guard (fix patterns for lint/type failures)

---

### 6a1. guard-authoring

**Path:** `agent-os/skills/guard-authoring/SKILL.md`
**Rule:** `agent-os/rules/pr-review-prevention.mdc`

**Purpose:** Author machine-enforced invariants that actually enforce. A gate you have not watched fail is a green checkmark, not a gate — this covers proving it fires, wiring it into PR CI, the ESLint flat-config replacement trap, and external-binary silent passes.

**Trigger keywords:** "add a validate gate", "new lint rule", "no-restricted-imports", "tooling/validate", "static-sync lane", "gate not firing", "eslint flat config", "enforce invariant"

**Key behaviors:**

- Probe both directions — the violation must be flagged, the exempt case must pass
- Probe from every layer glob; flat config REPLACES rule options rather than merging
- A gate in `health-check.sh` only is unenforced — add the `pr-ci.yml` static-sync step
- Prefer a pure-Node scan over shelling to a binary that may be absent
- Capture exit codes; never read one through a pipe

**Related skills:** pre-pr-sweep, code-quality-security, platform-hygiene

---

### 6a2. pre-pr-sweep

**Path:** `agent-os/skills/pre-pr-sweep/SKILL.md`
**Rule:** `agent-os/rules/pr-review-prevention.mdc`

**Purpose:** Catch the defect classes that survive local gates and get found by human reviewers — half-converted sweeps, incomplete deletions, ungated race paths, eager module-scope `import()`, stale derived artifacts, inverted test-timeout pins, and a drifted PR body.

**Trigger keywords:** "before opening a PR", "pre-PR check", "ready for review", "did I miss anything", "review readiness", "PR body accurate", "finish the sweep"

**Key behaviors:**

- Grep sibling attribute forms (`aria-label` → `title` → `placeholder`) before calling a sweep done
- Deleting a surface means deleting its route mount, precache, chunk list, analytics event, store slice and locale keys
- Route every call site through one staleness helper; guards sit at the mutation boundary
- Run `pnpm sync:check` LAST, after the final file exists
- Reconcile the PR body against `git diff --name-only origin/main...HEAD`

**Related skills:** guard-authoring, before-commit-guard, project-health-check, documentation-maintenance

---

### 6a3. rtl-logical-css

**Path:** `agent-os/skills/rtl-logical-css/SKILL.md`
**Reference:** `docs/reference/internationalization.md`

**Purpose:** Keep every surface mirror-correct under RTL — logical Tailwind properties instead of physical `ml/mr/pl/pr/left/right`, `rtl:` variants for transforms and glyphs that do not auto-flip, and the `validate:logical` gate.

**Trigger keywords:** "RTL", "right-to-left", "Arabic layout", "logical properties", "ms-/me-/ps-/pe-", "start-/end-", "mirrored layout", "validate:logical"

**Key behaviors:**

- Full physical → logical conversion map, including negatives (`-mr-1` → `-me-1`)
- Transforms/glyphs need explicit `rtl:` variants — logical properties do not flip them
- If a container's padding is logical, its absolutely-positioned children must be too
- Screenshot-verify one RTL surface; the gate cannot catch a missing `rtl:` transform

**Related skills:** locale-preferences, tailwind-styling rule, guard-authoring

---

### 6a4. locale-formatting

**Path:** `agent-os/skills/locale-formatting/SKILL.md`
**Reference:** `docs/reference/internationalization.md`

**Purpose:** Route every date, time, timezone, number and currency value through `useLocaleFormat` so Appearance prefs apply. Covers the civil-day opt-in, the `LocalizedCalendar` wrapper, chart tooltip formatters, and the `validate:no-bare-intl` gate.

**Trigger keywords:** "format date", "timezone", "toLocaleString", "Intl.NumberFormat", "currency display", "hour cycle", "civil day", "calendar", "validate:no-bare-intl"

**Key behaviors:**

- Never `toLocale*` / `new Intl.*` outside `lib/i18n` and vendored `ui/`
- `{ civilDay: true }` for calendar days; nothing for instants — classify every `formatDate(` caller
- Import `LocalizedCalendar`, never `ui/calendar` (eslint-enforced)
- Inject `valueFormatter` at the call site for vendored chart tooltips

**Related skills:** locale-preferences, i18n-constants, guard-authoring

---

### 6a5. locale-preferences

**Path:** `agent-os/skills/locale-preferences/SKILL.md`
**Reference:** `docs/reference/internationalization.md`

**Purpose:** The locale preference runtime — `useLocaleStore` persist/migrate, race-safe document apply via the generation guard, the pre-paint `locale-init.js` FOUC script and its drift test, and `single` vs `multi` build modes.

**Trigger keywords:** "locale store", "text direction preference", "applyDocumentLocale", "locale-init.js", "FOUC", "BUILD_I18N_MODE", "persist migrate", "language switch race"

**Key behaviors:**

- Bump `version` + handle the field in `migrate` when adding a preference
- Route **all three** apply paths through `beginLocaleApply()`; the check lives inside `applyDocumentLocale`
- `locale-init.drift.test.ts` pins the hand-copied RTL set + storage key to the TS source
- Keep `load-namespace.ts` loaders explicit — a missing locale×namespace must be a compile error

**Related skills:** locale-formatting, i18n-constants, rtl-logical-css, platform-hygiene

---

### 6a6. safe-bulk-edits

**Path:** `agent-os/skills/safe-bulk-edits/SKILL.md`

**Purpose:** Apply many mechanical edits without silent misses — assert every replacement matches exactly once (write only after all pass), edit JSON packs preserving key order and trailing newline, validate cross-file key sets before writing, and keep staging atomic so a rejected commit does not leak into the next one.

**Trigger keywords:** "codemod", "sweep across files", "bulk rename", "replace everywhere", "edit all locales", "mass edit", "scripted refactor"

**Key behaviors:**

- `count(old) != 1` aborts before any write — a pattern matching twice is as wrong as zero
- Re-derive anchors after any commit; formatters move imports, wrapping and table padding
- JSON: `object_pairs_hook=OrderedDict`, `ensure_ascii=False`, restore trailing newline
- `git status --short` before every commit; `git show --stat HEAD` after

**Related skills:** pre-pr-sweep, lint-guard, i18n-constants

---

### 6a7. agent-os-authoring

**Path:** `agent-os/skills/agent-os-authoring/SKILL.md`
**Command:** `/agent-os-sync`

**Purpose:** Add, rename or remove an agent-os skill or rule without breaking the integrity gates — all eight registration surfaces in one checklist, in the order that keeps `agent-os:check`, `triggers:strict` and `generate:check` green.

**Trigger keywords:** "add a skill", "new skill", "rename skill", "remove skill", "new rule", "agent-os check failing", "skill count mismatch", "skill not grouped"

**Key behaviors:**

- Eight surfaces: SKILL.md, inventory count, decision tree, task matrix, inventory entry, cross-reference, `groups.json`, `skill-router.mdc` (+ `chains.json` / `skill-triggers.md` when applicable)
- Frontmatter `name` **must** equal the directory name
- Regenerate `project-tree.txt` **after** the last file — not before
- `name != directory` warnings on vendored skills are expected; do not "fix" them

**Related skills:** documentation-maintenance, guard-authoring

---

### 6a8. review-response

**Path:** `agent-os/skills/review-response/SKILL.md`

**Purpose:** Work a review document to completion — build a resolution matrix, and verify every finding against the code rather than trusting the review's own status labels. A review is evidence, not truth.

**Trigger keywords:** "address the review", "review feedback", "review report", "PR comments", "resolution matrix", "reviewer said", "fix the findings"

**Key behaviors:**

- Verify claims marked ✅ too — "present" and "working" diverge for gates, guards and sweeps
- Report findings that are wrong or understated, with the evidence
- Diverging from a suggested fix is fine; state the reason
- Never report a finding resolved because you edited the file it named

**Related skills:** pre-pr-sweep, guard-authoring, full-code-review, documentation-maintenance

---

### 6b. route-island

**Path:** `agent-os/skills/route-island/SKILL.md`
**Purpose:** Identical directory structure for every route and sub-route (`<page>.manifest.ts`, direct child folders, colocated tests); feature code stays inside the island; `<PAGE>.OVERVIEW.md` as AI entry; import boundaries.

**Trigger keywords:** "route island", "self-contained route", "sub-route folder", "everything under this path", "same directory structure per route"

**Key artifacts:**

- Skill: `agent-os/skills/route-island/SKILL.md`
- Reference: `docs/reference/route-island-structure.md`
- Template: `docs/getting-started/route-island-template.md`
- Examples: `src/pages/organization/$organizationSlug/dashboard/`, `src/pages/login/`

---

### 6c. e2e-testids

**Path:** `agent-os/skills/e2e-testids/SKILL.md`
**Purpose:** Add and maintain `data-testid` attributes for Playwright E2E and stable RTL queries. Naming conventions, per-route checklist, and inventory updates.

**Trigger keywords:** "test id", "data-testid", "e2e selector", "playwright id", "ids for e2e"

**Key artifacts:**

- Skill: `agent-os/skills/e2e-testids/SKILL.md`
- Inventory: `docs/reference/e2e-testids-inventory.md`
- Specs: `tests/e2e/*.{e2e,integration}.test.ts` using `page.getByTestId(...)`

**Auto-invocation:** With page-scaffolding, auto-implement UI, or when user prepares E2E tests.

---

### 6d. playwright-e2e

**Path:** `agent-os/skills/playwright-e2e/SKILL.md`
**Purpose:** Hybrid Playwright E2E — `data-testid` for actions, `getByRole`/`getByLabel` for a11y guards. Helpers in `tests/utils/e2e-hybrid.ts`.

**Trigger keywords:** "playwright e2e", "e2e test", "hybrid selectors", "refactor e2e", "getByTestId"

**Key artifacts:**

- Skill: `agent-os/skills/playwright-e2e/SKILL.md`
- Helpers: `tests/utils/e2e-hybrid.ts`, `tests/utils/e2e-auth.ts`
- Specs: `tests/e2e/*.e2e.test.ts`

**Auto-invocation:** When adding or refactoring E2E specs; pairs with **e2e-testids** for UI testid placement.

---

### 6e. visual-regression

**Path:** `agent-os/skills/visual-regression/SKILL.md`
**Purpose:** Playwright screenshot-baseline lane (`pnpm test:visual`) — snapshot matrix (route × color scheme × theme-axis extreme), safe baseline updates, diff-first triage. Assertable counterpart of the `theme-axis-audit` playbook.

**Trigger keywords:** "visual regression", "screenshot", "snapshot", "baseline", "pixel diff", "toHaveScreenshot"

**Key artifacts:**

- Skill: `agent-os/skills/visual-regression/SKILL.md`
- Spec: `tests/e2e/visual.e2e.test.ts` (+ committed `*-snapshots/` PNGs)
- Commands: `pnpm test:visual`, `pnpm test:visual:update`

**Auto-invocation:** When a visual test fails, when adding a route/theme axis worth pinning, or on `tests/e2e/visual.e2e.test.ts` / snapshot edits. Local-only (needs core-be on `:3000`; darwin-pinned baselines).

---

### 6f. systematic-debugging (installed skill)

**Path:** `agent-os/skills/systematic-debugging/SKILL.md`
**Purpose:** Root-cause-first debugging discipline (vendored from obra/superpowers) — four phases (investigation → pattern analysis → hypothesis testing → implementation), no fixes before root cause, escalation rule after 3 failed attempts. Companions in the skill directory: `root-cause-tracing.md`, `defense-in-depth.md`, `condition-based-waiting.md`.

**Trigger keywords:** "debug", "root cause", "test failure", "flaky", "unexpected behavior", "why is this broken"

**Auto-invocation:** Any bug/test-failure investigation **before** proposing a fix; pairs with `ci-investigator` (CI-shaped failures) and hands implementation to the matching procedural skill afterwards.

---

### 7. test-generation

**Path:** `agent-os/skills/test-generation/SKILL.md`
**Purpose:** Automatically generate colocated test files for new source files. Covers components, forms, pages, stores, services, utilities, and hooks.

**Trigger keywords:** "add test", "write test", "test coverage", "missing tests", "generate test"

**Auto-invocation:** Triggered automatically when new `.tsx`/`.ts` source files are created under `src/` (via testing-requirements rule).

**Key conventions:**

- Colocated tests (same directory as source)
- `vitest-axe` accessibility assertions in all component tests
- `data-testid` selectors for stable element queries
- `userEvent` for realistic interaction testing
- Coverage thresholds: raise-only ratchet in `vitest.config.ts` — pinned just under measured coverage, raised as coverage rises, never lowered (no fixed percentage)

**Test stack:**

- Vitest (unit runner)
- React Testing Library (component rendering)
- vitest-axe (accessibility)
- @testing-library/user-event (interactions)
- Playwright (E2E)
- @axe-core/playwright (E2E accessibility)
- Stryker (mutation testing, CI-only)

**Related skills:** page-scaffolding (creates files that need tests), code-quality-security (CI runs tests)

---

### 8. shadcn (single canonical skill)

**Path:** `agent-os/skills/shadcn/SKILL.md` (installed via `pnpm dlx skills add shadcn/ui`)
**Purpose:** The one skill for **all** shadcn/ui work — _how_ to add/fix/debug/style/compose components (CLI + Critical Rules) **and** _where_ a block comes from (its "Project rules — core-fe" section folds in the 20 allowed sources + selection workflow). The former `shadcn-component-selection` skill is merged into `agent-os/skills/shadcn/SKILL.md`.

**Trigger keywords:** "add/fix/style a shadcn component", "shadcn CLI", "components.json", "preset", "which component for", "pick a component", "use shadcn components only", "best component for [X]", "login form", "sidebar", "data table", "block"

**Key behaviors:**

- CLI-first: `pnpm dlx shadcn@latest info|search|docs|view|add`; check installed components before writing custom markup
- Enforce Critical Rules: semantic tokens (no raw colors / manual `dark:`), `gap-*` not `space-*`, `size-*` for equal w/h, `cn()`, `data-icon` on button icons, full Card/Tabs/Avatar composition
- Selection: first build → pick the single best of the 20 allowed sources and implement; user wants options → present best 3 with direct links and ask
- After `add`: review files, fix imports to `@/shared/components/ui`, swap icons to lucide
- Ask which registry when adding a block and none is specified

**Related skills:** code-structure (placement), composition-patterns (component API)
**Related rules:** ui-sources (canonical list of 20 sources)

---

### 9. extension-settings-recommendations

**Path:** `agent-os/skills/extension-settings-recommendations/SKILL.md`
**Purpose:** Recommends and updates workspace extensions (`.vscode/extensions.json`) and workspace settings (`.vscode/settings.json`) for productivity based on project stack. Does not modify user-level settings (theme, font, keybindings — those stay manual; no skill covers them).

**Trigger keywords:** "recommend extensions", "better productivity", "setup IDE", "which extensions", "cursor settings", "IDE setup", "new tooling"

**Key behaviors:**

- Read current `.vscode/extensions.json` and `.vscode/settings.json`; use curated list in skill's reference.md (category → extension ID → when to recommend)
- Recommend only extensions missing and valuable for stack (React, TypeScript, Vite, Tailwind, Vitest, Playwright, ESLint, Prettier)
- Suggest workspace settings that match project conventions; apply only when user or context implies "apply"
- When adding/changing tooling (new test framework, linter, language), consider invoking to suggest or update extensions/settings

**Related skills:** none (user-level settings — theme, font, keybindings — are out of scope for every skill)

---

### 10. documentation-maintenance

**Path:** `agent-os/skills/documentation-maintenance/SKILL.md`
**Purpose:** When to update which doc and where docs live. Use when adding/changing docs, adding routes or features that affect README/CLAUDE, or when the user asks where to document something or how docs are organized.

**Trigger keywords:** "add doc", "where to document", "update README", "docs structure", "reorganize docs", "documentation index"

**Key behaviors:**

- Docs are organized by use case: getting-started, deployment, integrations, process, reference
- Index: `docs/README.md`; all paths use lowercase kebab-case
- When adding a doc: create in correct directory, add to docs/README.md, update README/CLAUDE if linked
- Keep README "Documentation" section and CLAUDE "Documentation" section in sync with actual paths

**Related rules:** agent-behavior (update docs as part of implementation without asking)

---

### 10a. env-schema-add

**Path:** `agent-os/skills/env-schema-add/SKILL.md`
**Rule:** `agent-os/rules/env-schema-add-sync.mdc`
**Runbook:** `docs/deployment/runbooks/environment-variables.md`

**Purpose:** Add, rename, or remove env vars safely — schema, `.env.example` halves, GitHub Secret vs Variable, platform-config wiring, and deploy sync.

**Trigger keywords:** "add env var", "new VITE\_", "env-schema", ".env.example", "sync-env-example", "platform config env"

**Key behaviors:**

- Edit `src/core/config/env-schema.ts` first; run `pnpm tool:sync-env-example`
- Auth switches use per-provider `VITE_AUTH_OAUTH_*` (not `VITE_DISABLED_MODULES`)
- Update runbook + credentials doc when operator-facing
- Wire `platform-config.ts` / `auth-methods.ts` when platform-facing

**Related skills:** documentation-maintenance, before-commit-guard, **platform-hygiene**

---

### 10b. routing-tenancy

**Path:** `agent-os/skills/routing-tenancy/SKILL.md`
**Rule:** `agent-os/rules/routing-tenancy-sync.mdc`
**Spec:** `docs/reference/routing-and-tenancy.md`

**Purpose:** Org-scoped routing, guard chains, `gatewayFromManifest`, session hydrate/invalidate, settings hash modal, `/` resolver.

**Trigger keywords:** "org route", "organizationSlug", "routeTree guards", "gatewayFromManifest", "session context", "settings hash", "tenancy"

**Key behaviors:**

- Complements `route-island` — does not replace folder scaffolding
- Guard order from `GUARDS.OVERVIEW.md`; unknown org → 404
- Manifest `module` + `permission` via security gateway
- Update route-access-matrix tests when policy changes

**Related skills:** route-island, resource-crud, page-scaffolding

---

### 10c. resource-crud

**Path:** `agent-os/skills/resource-crud/SKILL.md`
**Reference:** `src/core/resources/members.resource.ts`

**Purpose:** Backend resource pages — list, URL-driven create/edit dialogs, `$param` folders, L7 registry bootstrap.

**Trigger keywords:** "resource page", "CRUD", "URL dialog", "ListPage", "resource manifest", "registerResource"

**Key behaviors:**

- Standard URL table (list/create/edit/show/delete)
- List page reads pathname → opens dialog; sub-routes render `null`
- `*.resource.ts` + `registerResource` in bootstrap
- Chain `http-forms-errors` for mutations

**Related skills:** route-island, routing-tenancy, http-forms-errors, e2e-testids

---

### 10d. http-forms-errors

**Path:** `agent-os/skills/http-forms-errors/SKILL.md`
**Platform doc:** `docs/reference/frontend-platform.md` (HTTP errors, QueryBoundary)

**Purpose:** Form mutations + API error UX — `mapValidationErrors`, 429 `RateLimitNotice`, `notifyError`, `QueryBoundary` on reads.

**Trigger keywords:** "422", "validation error", "rate limit", "form mutation", "QueryBoundary", "mapValidationErrors"

**Key behaviors:**

- Never catch 401 in components
- 422 → RHF `setError` before toast
- Read panels use `QueryBoundary` — no duplicate loading/error branches

**Related skills:** composition-patterns, test-generation, resource-crud, resilient-interactions

### 10e. resilient-interactions

**Path:** `agent-os/skills/resilient-interactions/SKILL.md`
**Rule:** `agent-os/rules/resilient-interactions.mdc` (the 30 one-liners, `alwaysApply`)

**Purpose:** The worked reasoning behind the 30 always-on resilience rules — the failure each came from, the fix that looked right and was not, and the code that holds. The rule states them; this explains them.

**Trigger keywords:** "single-flight", "double submit", "error boundary", "optimistic rollback", "loading state", "success toast", "§1", "§6"

**Key behaviors:**

- Section numbers match the rule file and are cited from code — never renumber
- Read before arguing with a rule or applying an unfamiliar one
- Pairs with `http-forms-errors` for the mutation/error wiring itself

**Related skills:** http-forms-errors, composition-patterns, react-best-practices

---

### 10e. platform-hygiene

**Path:** `agent-os/skills/platform-hygiene/SKILL.md`
**Rule:** `agent-os/rules/platform-hygiene-sync.mdc`
**Overview:** `docs/reference/frontend-platform.md`

**Purpose:** `platformConfig` vs raw Vite env, `build-env.ts` allowlist, knip, `validate:vite-env`, `validate:client-env`.

**Trigger keywords:** "platformConfig", "import.meta.env", "knip", "dead code", "validate:vite-env", "validate:client-env", "build-env"

**Key behaviors:**

- App code reads `platformConfig` — not raw `import.meta.env`
- Chain `env-schema-add` for key add/rename/remove
- Run knip after removing deps/exports

**Related skills:** env-schema-add, code-quality-security, documentation-maintenance

---

### 10f. dependency-management

**Path:** `agent-os/skills/dependency-management/SKILL.md`

**Purpose:** Safely add / update / remove / pin npm dependencies — atomic `package.json` ↔ `pnpm-lock.yaml` commits, `pnpm.overrides` for transitive pins, `pnpm deps:audit` triage, license and bundle-impact checks. Procedural counterpart to the `dependency-auditor` agent.

**Trigger keywords:** "add dependency", "update package", "pnpm add", "pnpm.overrides", "audit fix", "lockfile", "bump version", "vulnerability", "CVE"

**Key behaviors:**

- One atomic commit for a `package.json` change + regenerated lockfile
- Pin transitive/vulnerable deps via `pnpm.overrides`, never hand-edit the lockfile
- `pnpm run validate:lockfile`, `pnpm deps:audit`, `pnpm knip` after changes

**Related skills:** code-quality-security, platform-hygiene, bundle-performance

---

### 10g. bundle-performance

**Path:** `agent-os/skills/bundle-performance/SKILL.md`

**Purpose:** Keep the production bundle within size-limit budgets — dynamic-import heavy/deferred modules off the first-paint path, lazy route-island boundaries, code-splitting, heavy-import triage. Procedural counterpart to the `bundle-size-reviewer` agent.

**Trigger keywords:** "bundle size", "size budget", "code splitting", "dynamic import", "first paint", "chunk too big", "size-limit", "pnpm size"

**Key behaviors:**

- Measure with `pnpm build` + `pnpm size` (never the dev server)
- Keep `@sentry/react`, `posthog-js`, SettingsModal/CommandPalette dynamic-import only
- Preserve lazy `<page>.route.tsx` boundaries; split vendor from entry

**Related skills:** platform-hygiene, react-best-practices, dependency-management

---

### 10h. pwa-manifest

**Path:** `agent-os/skills/pwa-manifest/SKILL.md`
**Rule:** `agent-os/rules/pwa-manifest-sync.mdc`
**Reference:** `docs/reference/pwa-manifest-and-app-icon.md`

**Purpose:** PWA install surface — `app-manifest.ts` → `manifest.webmanifest`, Boxes icon, preset-aligned colors, favicon, VitePWA `includeAssets`.

**Trigger keywords:** "PWA manifest", "app icon", "favicon", "theme_color", "manifest.webmanifest", "app-icon.svg", "installable", "Add to Home Screen"

**Key behaviors:**

- Edit `src/core/config/app-manifest.ts` first; sync JSON + `index.html` + `page-head.ts`
- Regenerate PNGs with `rsvg-convert` after SVG changes
- Run `app-manifest.test.ts` (drift guard)

**Related skills:** documentation-maintenance, i18n-constants (in-app copy only)

---

### 10i. i18n-constants

**Path:** `agent-os/skills/i18n-constants/SKILL.md`
**Purpose:** Extract static values into scoped constants files with react-i18next — one route island or module at a time. User-facing strings go in locale JSON; constants files hold keys, test IDs, analytics events, and non-copy defaults.

**Trigger keywords:** "extract magic strings", "constants file", "i18n", "locale namespace", "user-facing copy", "move test ids", "analytics events", "defaults"

**Key behaviors:**

- Split copy (locale JSON) from keys/IDs/defaults (`*.constants.ts`)
- Scope per route island; set up the island's locale namespace
- Keep static values out of components — reference constants and translation keys

**Related skills:** http-forms-errors, resource-crud, documentation-maintenance

---

### 11. project-health-check

**Path:** `agent-os/skills/project-health-check/SKILL.md`
**Purpose:** Full project health audit after major code changes. Verifies docs (links, routes, tools), creates missing colocated tests, fixes lint/type/format errors, ensures build and bundle size pass, runs validation scripts, and reports a summary table.

**Trigger keywords:** "run health check", "check everything", "verify the project", "make sure everything works", "full project health check", "post-major-change audit"

**Key behaviors:**

- Seven phases: doc integrity → missing tests → static analysis (lint, type-check, format) → build → tests (with coverage) → validation (env, public) → summary table
- Fixes broken doc links, creates tests for non-exception source files, applies lint-guard and test-generation patterns
- Does not stop until every check passes; outputs pass/fail table
- CLI counterpart: `pnpm health` (report only), `pnpm health:fix` (auto-fix format + lint, then check)

**Related skills:** documentation-maintenance (Phase 1), lint-guard (Phase 3), test-generation (Phase 2), code-smells-best-practices (optional on modified files)

---

### 12. full-code-review

**Path:** `agent-os/skills/full-code-review/SKILL.md`
**Purpose:** Generate a full code review report covering security, performance, quality, readability, maintainability, and scalability. Writes to `reports/code-review/full-code-review-report.md`.

**Trigger keywords:** "run code review", "generate code review report", "full code review", "code review report"

**Key behaviors:**

- Runs lint, type-check, format check, build, size limit, tests, and coverage
- Greps for architecture violations (app/core/shared importing from pages) and dangerous patterns (dangerouslySetInnerHTML, innerHTML, eval)
- CLI: `pnpm report:code-review` (or `node tooling/reports/code-review-report.mjs`)

**Related skills:** project-health-check (broader audit), code-quality-security (lint/CI), lint-guard (static analysis)

---

### 13. skill-registry (this skill)

**Path:** `agent-os/skills/skill-registry/SKILL.md`
**Purpose:** Master catalog of all skills. Helps find the right skill for any task.

**Trigger keywords:** "which skill", "list skills", "what skills exist", "help me find"

**Maintenance:** Update this file whenever a skill is added, removed, or renamed. Full procedure — all eight surfaces plus the gate order — is **`agent-os/skills/agent-os-authoring/SKILL.md`**. In this file: bump the **Skill Inventory (N skills)** count, then add the skill to the Decision Tree, **Task → Required Skills** matrix, Skill Inventory, and Cross-Reference table; then `groups.json` (exactly one group), `skill-router.mdc`, and — when part of a pipeline — `chains.json` and `agent-os/docs/skill-triggers.md`. **Installed (ecosystem) skills** live in `agent-os/skills/<name>/` and are tracked in `skills-lock.json` (e.g. `shadcn`, `frontend-design`, `find-skills`); **project skills** live in `agent-os/skills/<name>/`.

---

### 14. find-skills (installed skill)

**Path:** `agent-os/skills/find-skills/SKILL.md` (installed via `npx skills add https://github.com/vercel-labs/skills --skill find-skills`)
**Purpose:** Discover and install skills from the open agent-skills ecosystem when a needed capability isn't already covered by this registry or `skill-router.mdc`.

**Trigger keywords:** "is there a skill for X", "find a skill", "can you do X", "extend capabilities", "search skills"

**Key behaviors:**

- Check the [skills.sh](https://skills.sh/) leaderboard, then `npx skills find <query>`
- Prefer reputable, high-install skills (1K+ installs; official sources like `vercel-labs`, `anthropics`)
- Present options (name, what it does, installs, install command) before installing
- Install into `agent-os/skills/` (tracked in `skills-lock.json`); then **wire the new skill into `skill-router.mdc`, this registry, and docs**
- If none exists: proceed with general capabilities or suggest `npx skills init`

**Related skills:** skill-registry (catalog of what's already installed)

## Cross-Reference: Skills by File Area

| Area of Codebase                                      | Relevant Skill(s)                                                                                                                                |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Any new feature / requirement                         | **auto-implement** (master), code-structure, test-generation, code-smells-best-practices, lint-guard (all auto)                                  |
| `src/pages/`                                          | auto-implement, code-structure, page-scaffolding, **route-island**, **routing-tenancy**, **resource-crud**, component-promotion, test-generation |
| `src/app/routes/routeTree.tsx`, `src/app/guards/`     | **routing-tenancy**, test-generation                                                                                                             |
| `src/shared/tenancy/`                                 | **routing-tenancy**, test-generation                                                                                                             |
| `**/*.resource.ts`, `*ListPage.tsx`, `**/dialogs/**`  | **resource-crud**, route-island, e2e-testids                                                                                                     |
| `**/forms/**`, mutation hooks                         | **http-forms-errors**, composition-patterns, test-generation                                                                                     |
| `useAppMutation`, `useDeferredRowRemoval`, boundaries | **resilient-interactions**, http-forms-errors, test-generation                                                                                    |
| `src/core/config/env-schema.ts`, `platform-config.ts` | **platform-hygiene**, **env-schema-add**, documentation-maintenance                                                                              |
| `src/shared/components/`                              | component-promotion, composition-patterns, **shadcn** (`agent-os/skills/shadcn`), test-generation                                                |
| `src/shared/components/ui/`                           | composition-patterns, web-design-guidelines, **shadcn** (`agent-os/skills/shadcn`)                                                               |
| `src/core/`                                           | test-generation                                                                                                                                  |
| `src/lib/`                                            | test-generation                                                                                                                                  |
| `src/shared/store/`                                   | test-generation                                                                                                                                  |
| `src/shared/store/useLocaleStore/`, `public/locale-init.js` | **locale-preferences**, test-generation                                                                                                    |
| `src/lib/i18n/format.ts`, `useLocaleFormat/`          | **locale-formatting**, test-generation                                                                                                           |
| `src/locales/**`                                      | **i18n-constants**, locale-preferences                                                                                                           |
| `package.json`, `pnpm-lock.yaml`, `pnpm.overrides`    | **dependency-management**                                                                                                                        |
| `.size-limit.json`, bundle budgets (`pnpm size`)      | **bundle-performance**                                                                                                                           |
| `eslint.config.mjs`                                   | **guard-authoring**, code-quality-security, lint-guard                                                                                           |
| `tooling/validate/**`                                 | **guard-authoring**, platform-hygiene                                                                                                            |
| `agent-os/skills/**`, `agent-os/rules/**`             | **agent-os-authoring**, documentation-maintenance                                                                                                |
| `.husky/`                                             | code-quality-security                                                                                                                            |
| `.github/workflows/`                                  | **guard-authoring** (static-sync steps), code-quality-security                                                                                   |
| `catalog-info.yaml`                                   | (Backstage integration)                                                                                                                          |
| `.vscode/`                                            | **extension-settings-recommendations**                                                                                                           |
| `docs/`, README, CLAUDE                               | **documentation-maintenance**                                                                                                                    |
| Full project / post-change audit                      | **project-health-check**, lint-guard, test-generation, documentation-maintenance                                                                 |
| Full code review report                               | **full-code-review**                                                                                                                             |
| Any React component                                   | react-best-practices, composition-patterns, web-design-guidelines, test-generation                                                               |
| UI/design decisions (style, palette, font, chart, UX) | **ui-ux-pro-max** (advisory DB), **frontend-design**, **shadcn**, **web-design-guidelines**                                                      |
| Product UI redesign / audit ("impeccable")            | **impeccable**, **shadcn**, **frontend-design**, **web-design-guidelines**                                                                       |
| Animation implementation                              | **animejs**, **emil-design-eng**                                                                                                                 |
| Animation PR review                                   | **review-animations**                                                                                                                            |

## Always-Active Rules (not skills)

These Cursor rules are always loaded and do not need to be invoked:

| Rule                   | File                                        | Purpose                                                                                                   |
| ---------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| project-conventions    | `agent-os/rules/project-conventions.mdc`    | Architecture, imports, state management                                                                   |
| ui-sources             | `agent-os/rules/ui-sources.mdc`             | Allowed 20 shadcn UI sources; for all shadcn work read the single skill `agent-os/skills/shadcn/SKILL.md` |
| file-structure         | `agent-os/rules/file-structure.mdc`         | Directory layout, route.tsx convention                                                                    |
| testing-requirements   | `agent-os/rules/testing-requirements.mdc`   | Test generation auto-trigger, data-testid convention                                                      |
| context7-libraries     | `agent-os/rules/context7-libraries.mdc`     | Library doc lookup via Context7 MCP                                                                       |
| skill-router           | `agent-os/rules/skill-router.mdc`           | Auto-routes tasks to the right skill; complete all steps without asking                                   |
| routing-tenancy-sync   | `agent-os/rules/routing-tenancy-sync.mdc`   | Org routes, guards, gateway — read routing-tenancy skill                                                  |
| platform-hygiene-sync  | `agent-os/rules/platform-hygiene-sync.mdc`  | Env/platform config — read platform-hygiene skill                                                         |
| pwa-manifest-sync      | `agent-os/rules/pwa-manifest-sync.mdc`      | PWA manifest/icon — read pwa-manifest skill                                                               |
| env-schema-add-sync    | `agent-os/rules/env-schema-add-sync.mdc`    | Env schema / `.env.example` — read env-schema-add skill                                                   |
| agent-behavior         | `agent-os/rules/agent-behavior.mdc`         | Complete tests, route reg, RBAC, docs without asking; never ask "Do you want X?"                          |
| resilient-interactions | `agent-os/rules/resilient-interactions.mdc` | 30 UI-resilience rules: single-flight writes, contained crashes, honest loading/empty/error states        |

## Orchestration manifests (machine-readable)

The relationships above are also declared as data, eval-gated by
`agent-os/evals/check.ts` so they cannot drift:

| Manifest                          | Declares                                                                     |
| --------------------------------- | ---------------------------------------------------------------------------- |
| `agent-os/skills/chains.json`     | Named ordered skill sequences (page-change, resource-crud, form-mutation, …) |
| `agent-os/skills/groups.json`     | Every skill in exactly one group (ui-design, quality, platform, …)           |
| `agent-os/agents/pipelines.json`  | Reviewer-agent pipelines (`pre-merge-review`, `prod-readiness`) + handoffs   |
| `agent-os/docs/skill-triggers.md` | File-pattern → skill routing (Tier-2 tested via `evals/cases/triggers.json`) |

Read-only reviewer agents are catalogued in `agent-os/docs/agents-catalog.md`.

## Enterprise Platform Integration

| Tool           | Config File                                                                        | Purpose                                   |
| -------------- | ---------------------------------------------------------------------------------- | ----------------------------------------- |
| Backstage      | `catalog-info.yaml`                                                                | Service catalog registration              |
| Netlify        | `netlify.toml`, `dist/_headers`, `.github/workflows/reusable-netlify-deploy.yml`   | SPA serving, caching, security headers    |
| PWA            | `src/core/config/app-manifest.ts`, `public/manifest.webmanifest`, `vite.config.ts` | Install surface; skill **pwa-manifest**   |
| release-please | `.github/release-please/config.json`, `.github/release-please/manifest.json`       | Human-gated releases                      |
| Sentry         | `src/app/observability/sentry.ts`                                                  | Error tracking + PII scrubbing            |
| PostHog        | `src/app/analytics/posthog.ts`                                                     | Product analytics                         |
| Web Vitals     | `src/app/observability/performance.ts`                                             | Performance monitoring → PostHog + Sentry |
