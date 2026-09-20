---
name: theme-axis-audit
description: Audit and fix UI so every Appearance/Shuffle theme axis (radius, elevation, density, etc.) applies consistently. Use when the user asks to audit theme config, fix appearance presets, "do elevation", "theme axis one by one", or continue the theme-axis playbook.
---

# Theme axis audit

Make **every UI surface respect Appearance / Shuffle config**. Work **one axis (or paired axes) per cycle**; deliver a **detailed report** after each full cycle before starting the next.

**Canonical playbook (status tracker + catalog):** `docs/reference/theme-axis-audit-playbook.md`  
**CSS hooks:** `src/index.css`  
**Catalogs + apply fns:** `src/shared/theme/presets.ts`

---

## Mandatory rules

1. **Read this skill + the playbook status tracker** before starting an axis.
2. **One axis per cycle** unless the playbook explicitly pairs them (e.g. elevation + separation).
3. **Complete all four phases** (0–4 below) — no partial handoffs.
4. **Do not ask** whether to fix violations, add tests, or update docs — do it.
5. **Update the playbook status tracker** when the axis is done.
6. **Deliver a detailed cycle report** to the user (see Report template).
7. After code changes: `pnpm type-check`, eslint on touched files, colocated tests for touched components.

---

## Phase 0 — Understand the axis

1. Read axis definition in `src/shared/theme/presets.ts` (catalog, default, `applyGeneratedTheme` / `applyDataAxis`).
2. Find CSS in `src/index.css` (`[data-elevation]`, `[data-separation]`, CSS vars, etc.).
3. List which **`data-slot`** values the axis targets.
4. In Appearance, set axis to **each extreme** (e.g. elevation `flat` vs `lifted`, separation `border` vs `shadow`).
5. Note surfaces to verify: login, dashboard, settings modal, command palette, toast, tables.

---

## Phase 1 — Inventory

Run axis-specific greps (adjust per playbook cheatsheet):

```bash
# Elevation — hardcoded shadows on app surfaces (exclude ui/ unless extending slots)
rg 'shadow-(lg|xl|2xl|md|sm|none)' src --glob '*.tsx' --glob '!**/ui/**'

# Surfaces without data-slot that should participate
rg 'bg-card|bg-popover' src --glob '*.tsx' --glob '!**/ui/**' | rg -v 'data-slot'

# Separation — border/shadow fights on cards
rg 'shadow-none|border-transparent' src --glob '*.tsx' --glob '!**/ui/**'
```

Categorize each hit:

| Cat | Meaning                       | Fix                                                     |
| --- | ----------------------------- | ------------------------------------------------------- |
| A   | Should be shadcn primitive    | Use `<Card>`, `<Button>`, etc.                          |
| B   | Missing `data-slot`           | Add `data-slot="card"` / `popover-content` / …          |
| C   | Hardcoded utility fights axis | Remove `shadow-lg`, `shadow-2xl`, etc. from `className` |
| D   | Intentional                   | Document in cycle report (e.g. decorative icon glow)    |
| E   | System gap                    | Extend `[data-*]` selectors in `index.css`              |
| F   | Off-scale radius              | Bare `rounded` / `rounded-[3px]` → a named step (`rounded-sm`, `rounded-xs`); gate check 5 |
| G   | Round by design, no slot      | `rounded-full` on a chip/badge/disc/track → add `data-slot="pill"`; never on dots or glows; gate check 6 |
| H   | Primitive re-slots a `<Button>` | `ui/carousel` arrows carry `data-slot="carousel-previous"`, so the `button` rule misses them → add the primitive's OWN slot to the axis block |
| I   | Pseudo-element draws the shape  | `before:rounded-full` cannot carry a slot → target `[data-slot='…']::before` in `index.css` |
| J   | Fixed-size spacing (Density)    | `p-[24px]` / `gap-[6px]` → a scale step (`p-6`, `gap-1.5`); gate check 7. A `p-0` dialog repeats `DialogContent`'s `6` on each of its panes |

---

## Phase 2 — Fix (priority)

1. **Extend `index.css`** — add missing slots to `[data-elevation]` / `[data-separation]` / other axis blocks.
2. **Remove fighting `className` shadows/borders** on components that already use `data-slot`.
3. **Replace custom shells** with `<Card>` (or add `data-slot`).
4. **Add helpers** only when repeated 3+ times (`src/lib/icon-surface.ts` pattern).
   - **A hole in a token scale is a system gap, not N component fixes.** `rounded-2xl` ignored
     the radius axis because only `sm/md/lg/xl` were themed; deriving the other steps from
     `--radius-lg` in `@theme` fixed every call site at once. Check the scale before the sites.
   - **Check the boot splash for every axis that changes shape or colour.** It is HTML, painted
     before the bundle: `theme-init.js` must set the attribute/var pre-paint and `index.html`
     must style on it, or the loader changes look half way through the boot.
5. Do **not** edit vendored `shared/components/ui/*` unless the axis requires new default slots — prefer index.css overrides.

---

## Phase 3 — Verify

```bash
pnpm type-check
pnpm eslint --fix <changed-files>
pnpm test -- --run <colocated-tests-for-touched-paths>
```

**Radius / shape — measure it.** Reading class strings missed the carousel arrows, the
`lib/animations` skeletons and the nav markers; a computed-style sweep in a browser found
all three in one run (needs core-be on `:3000`):

```bash
pnpm exec playwright test tests/e2e/theme-shape.e2e.test.ts
```

It seeds radius None + Sharp and must return **no** element with a rounded corner (status
dots ≤ 10px, blurred glows and dev tooling are exempt by rule, never by selector). Extend
it when the audit touches a new screen or overlay. For any other axis with a computable
effect, prefer the same shape of test — sweep + a control on the default look — over a
manual toggle.

Manual: toggle axis across **all options** on login, dashboard, settings (`#settings/...`), ⌘K, toast.

---

## Phase 4 — Record

1. Mark axis **Done** in `docs/reference/theme-axis-audit-playbook.md` status table.
2. Add one-line note under playbook if new slots/helpers were introduced.

---

## Audit queue (order)

| #   | Axis                           | Status |
| --- | ------------------------------ | ------ |
| 1–2 | Radius + shape                 | Done   |
| 3   | Elevation + separation         | Done   |
| 4   | **Focus ring**                 | Done   |
| 5   | **Density**                    | Done   |
| 6   | **Type scale**                 | Done   |
| 7   | **Contrast + base colour**     | Done   |
| 8   | **Motion**                     | Done   |
| 9   | **Menu translucent**           | Done   |
| 10  | **Fonts**                      | Done   |
| 11  | **Icons**                      | Done   |
| 12  | **Accent / chart / intensity** | Done   |
| 13  | **Mode + named presets**       | Done   |
| 14  | **Toast + layout TEMP**        | Done   |

---

## Cycle report template (required user deliverable)

```markdown
## Theme axis audit — <Axis name>

### Phase 0 — Axis mechanics

- Mechanism: …
- CSS hooks: …
- data-slot targets: …

### Phase 1 — Violations found

| File | Issue | Category |
| ---- | ----- | -------- |

### Phase 2 — Changes made

- index.css: …
- Components: …

### Phase 3 — Verification

- tsc: pass/fail
- eslint: pass/fail
- tests: …
- Manual surfaces checked: …

### Phase 4 — Status

- Playbook tracker updated: yes
- Exceptions documented: …
- Next axis: …
```

---

## Agent handoff prompt

```
Theme axis audit — axis: <NAME>
Follow agent-os/skills/theme-axis-audit/SKILL.md and docs/reference/theme-axis-audit-playbook.md.
Complete phases 0–4, detailed report, update tracker, no confirmation prompts.
```
