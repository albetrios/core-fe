# Preset product-design rules

**What:** Canonical rules for configuring and consuming Appearance / Shuffle
presets in a **product UI** (admin, dashboards, settings, data tools) — not
marketing landings.

**Why:** Shuffle can combine any axis value. Industry design systems agree on
floors for readability, touch, contrast, and motion. This doc maps those
standards to our axes in `src/shared/theme/presets.ts`.

**Who uses this:** Designers, implementers, and agents touching theme catalogs,
Appearance, dashboard density, or axis audits.

**See also:** [design.md](design.md) (principles), [theming.md](theming.md)
(mechanics), [theme-axis-audit-playbook.md](theme-axis-audit-playbook.md) (compliance passes).

---

## Sources (external)

| Topic             | Reference                                                                                                                                                                                                                                                                                            |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Typography floors | [Atlassian Design — Applying typography](https://atlassian.design/foundations/typography/applying-typography) (12px minimum for fine print; 16px for long-form body)                                                                                                                                 |
| Type scale        | [Material Design — Type scale](https://m3.material.io/styles/typography/type-scale-tokens), modular ratios 1.125–1.333                                                                                                                                                                               |
| Density           | [Cloudscape — Content density](https://cloudscape.design/foundation/visual-foundation/content-density/), [Material density on the web](https://medium.com/google-design/using-material-density-on-the-web-59d85f1918f0), [Salt — Density](https://www.saltdesignsystem.com/salt/foundations/density) |
| Touch targets     | [WCAG 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) (24×24 CSS px AA), [WCAG 2.5.5](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html) (44×44 AAA), Apple HIG / Material 48dp                                                                     |
| Contrast          | [WCAG 1.4.3 Contrast (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) — 4.5:1 normal text, 3:1 large text                                                                                                                                                               |
| Motion            | [WCAG 2.3.3 Animation from Interactions](https://www.w3.org/WAI/WCAG21/Understanding/animation-from-interactions.html), `prefers-reduced-motion`                                                                                                                                                     |
| Text spacing      | [WCAG 1.4.12 Text Spacing](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html)                                                                                                                                                                                                            |
| Zoom              | [WCAG 1.4.4 Resize Text](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html) — use `rem`, not px, for type tokens                                                                                                                                                                          |
| Reading width     | WCAG / UX — ~65–80 characters per line; Claude/ChatGPT chat ~720–768px ([Setproduct AI chat UI](https://www.setproduct.com/blog/ai-chat-interface-ui-design))                                                                                                                                        |
| Admin shell width | Cloudscape / Material — full workspace for data; constrain prose blocks only                                                                                                                                                                                                                         |

---

## Global product defaults

These are the **recommended shipped defaults** for this product (already coded in
`DEFAULT_LOOK` / `DEFAULT_*` constants):

| Axis         | Product default                 | Rationale                                                             |
| ------------ | ------------------------------- | --------------------------------------------------------------------- |
| Named preset | `default`                       | Neutral accent; no inline overrides                                   |
| Mode         | `system`                        | Respects OS light/dark                                                |
| Density      | `cozy` (`0.25rem` spacing unit) | Balanced admin UI; Cloudscape/Material “comfortable/default” analogue |
| Layout width | `contained` (standard 1536px)   | User can switch to full / reading in Appearance → Layout              |
| Type scale   | `default`                       | Stock Tailwind `--text-*`; no global shrink                           |
| Motion       | `calm`                          | Fast transitions; OS reduce → `instant`                               |
| Elevation    | `soft`                          | Subtle depth without heavy shadows                                    |
| Contrast     | `normal`                        | WCAG AA token pairs in both modes                                     |
| Separation   | `border`                        | Predictable edges on data surfaces                                    |
| Focus        | `ring`                          | Visible keyboard focus                                                |
| Radius       | `default`                       | Matches shadcn baseline                                               |

**Rule P-1 — Default to comfortable product density.** Ship new surfaces at
`cozy` or `relaxed`. Use `compact` only for power-user/data-heavy views and
document the accessibility tradeoff.

**Rule P-2 — Default to stock type scale.** `typeScaleId: default` must not
rewrite `--text-*`. Non-default scales are **opt-in** via Appearance, not
shuffle-only outcomes on first paint.

**Rule P-3 — One accent, semantic colour only.** Named presets and Shuffle
change **one** brand hue; status colours stay semantic (`success`, `warning`,
`destructive`, `info`).

---

## Per-axis rules

### Type scale (`typeScaleId` → inline `--text-xs` … `--text-4xl`)

Catalog: `tight`, `compact`, `default`, `grand`, `display`.

| Step                           | Product rule                                                                                                                                                           |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Body (`text-sm` / `text-base`) | **14–16px effective** (0.875–1rem). Primary reading size for forms, tables, nav.                                                                                       |
| Captions / meta (`text-xs`)    | **12px minimum** (0.75rem). Never below 12px on interactive product UI.                                                                                                |
| Headings                       | Must stay **≥ body size**; page title typically `text-2xl`–`text-3xl`.                                                                                                 |
| Modular ratio                  | Prefer **1.125–1.2** (tight/compact/default). Ratios **≥ 1.333** (`grand`, `display`) shrink `--text-xs` below 12px — **marketing / hero only**, not dashboard labels. |

Computed `--text-xs` when scale is applied (base = 1rem):

| `typeScaleId` | `--text-xs`      | Product use                  |
| ------------- | ---------------- | ---------------------------- |
| `default`     | ~0.75rem (stock) | **Standard product UI**      |
| `tight`       | ~0.79rem         | Dense but readable           |
| `compact`     | ~0.76rem         | Dense admin                  |
| `grand`       | ~0.56rem         | **Avoid** for product labels |
| `display`     | ~0.50rem         | **Avoid** for product labels |

**Rule T-1 — Floor:** `--text-xs` ≥ **0.75rem** on product surfaces (future:
enforce in `applyTypeScale`).

**Rule T-2 — Component classes:** Prefer `text-sm` for secondary copy;
`text-xs` only for true meta (timestamps, badges). Never arbitrary sizes below
12px (`text-[0.6875rem]`).

**Rule T-3 — Density does not replace type scale.** Do not shrink fonts to
simulate compact layouts (Salt, Cloudscape, Material all scale **spacing**, not
body type, per density mode).

---

### Density (`densityId` → `--spacing`)

Catalog: `compact` (0.215), `cozy` (0.25), `relaxed` (0.265), `airy` (0.285).

| Mode               | Product rule                                             |
| ------------------ | -------------------------------------------------------- |
| `cozy` / `relaxed` | **Default product** — readable tables, forms, settings.  |
| `compact`          | Data-heavy tables, trading-style UIs. **Desktop-first.** |
| `airy`             | Marketing, onboarding hero, low-data screens.            |

**Rule D-1 — Global axis:** Density applies app-wide via one `--spacing` unit;
do not mix density per component except documented exceptions (e.g. table
`compact` prop pattern).

**Rule D-2 — Touch floor:** Interactive targets stay **≥ 24×24 CSS px** (WCAG
2.5.8) at any density; **≥ 44×44** for primary actions on touch/coarse pointer
(`@media (pointer: coarse)` → prefer `relaxed` / `airy` spacing).

**Rule D-3 — Compact disclaimer:** If offering `compact`, users should be able
to return to `cozy` (Appearance picker — already persisted).

---

### Colour & contrast

Axes: named preset, accent hue, harmony, intensity, base, contrast mode.

**Rule C-1 — WCAG AA:** Every `*-foreground` on its surface must pass **4.5:1**
(normal) / **3:1** (large text) in **both** light and dark. Token pairs in
`index.css` are curated; do not override with raw colours.

**Rule C-2 — Meaning, not decoration:** `success` / `warning` / `info` /
`destructive` for state only. One `primary` accent for brand actions.

**Rule C-3 — Card surfaces:** Use `text-card-foreground` on `bg-card`, not
`text-foreground`, unless contrast is verified.

**Rule C-4 — Contrast modes:** `soft` / `dim` / `amoled` are opt-in; product
QA must re-check tables and muted text when enabling.

---

### Elevation & separation

Axes: `elevationId`, `separationId`.

**Rule E-1 — Token-driven depth:** Surfaces use `data-slot` + axis hooks in
`index.css`; no hardcoded `shadow-lg` on app components (`pnpm validate:theme-axis`).

**Rule E-2 — Admin trust:** Prefer `flat` / `soft` + `border` for data tools;
`floating` + `shadow` sparingly (menus, dialogs).

---

### Radius & shape

Axes: `radiusId`, `shapeId`.

**Rule R-1 — Consistent scale:** All corners derive from one `--radius-lg` base;
controls ≈ `md`/`lg`, cards ≈ `lg`.

**Rule R-2 — Pill/sharp are personality:** `pill` / `sharp` shape languages must
not break hit targets or clip focus rings.

---

### Motion (`motionId`)

Catalog: `instant`, `calm`, `smooth`, `snappy`.

**Rule M-1 — OS reduce wins:** `prefers-reduced-motion: reduce` → `instant`
(already in `applyGeneratedTheme`).

**Rule M-2 — No opacity page fades:** Route/content shells use **transform-only**
`route-rise` — never `opacity: 0` + `animation-fill-mode: both` on primary copy
(see [theming.md § Readability](theming.md#readability--route-motion)).

**Rule M-3 — Essential vs decorative:** Count-up stats, loading skeletons, dialog
enter/exit = OK. Parallax, large spatial slides, auto-playing loops = avoid on
product chrome.

**Rule M-4 — Duration budget:** Micro interactions **≤ 200ms**; page transitions
**≤ 300ms** unless user-controlled.

---

### Focus (`focusId`)

**Rule F-1 — Always visible:** Keyboard users must see focus on every
interactive control. Do not `outline-none` without a replacement ring/underline.

**Rule F-2 — Glow/underline variants** must meet contrast on all base tints.

---

### Typography / fonts (`bodyFontId`, `headingFontId`)

**Rule TY-1 — Web-safe stacks only** (`font-src 'self'`). Use `GENERATED_FONTS`
catalog only.

**Rule TY-2 — Max two roles:** body (`--font-sans`) + heading (`--font-heading`).
Mono is fixed for code.

**Rule TY-3 — Weights:** regular + medium/semibold + bold sparingly; avoid more
than three weights on one screen.

---

### Icons

Axes: weight, colour, library.

**Rule I-1 — Barrel only:** `@/shared/icons` (eslint-enforced).

**Rule I-2 — Label pairing:** Icons with ambiguous meaning need visible text.

**Rule I-3 — Size:** `size-4` (16px) default in dense UI; touch rows may use
`size-5` with matching hit area.

---

## Shuffle & generated looks

Shuffle picks uniformly across axes. **Product policy:**

| Behavior                 | Rule                                                                           |
| ------------------------ | ------------------------------------------------------------------------------ |
| First-time / locked prod | `VITE_THEME_LOCK=true` or pin defaults                                         |
| Shuffle for demos        | Allowed; may pick `grand` / `compact` — not representative of product defaults |
| Persisted user theme     | User choice; still subject to accessibility floors in future gates             |
| Share `?theme=<seed>`    | Treat as cosmetic; document that extreme scales may reduce readability         |

**Rule S-1 — Biased shuffle (future):** Consider weighting shuffle toward
`typeScaleId: default`, `densityId: cozy`, `contrastId: normal` for product
builds.

**Rule S-2 — After shuffle QA checklist:**

1. Dashboard stat labels readable at `text-xs`?
2. Primary buttons ≥ 44px on touch?
3. Settings modal + tables in light **and** dark?
4. Reduced motion: no invisible content, no essential info lost?

---

## Layout & grid (shell vs page vs prose)

This product is a **B2B control surface** (dashboards, tables, settings) — not a
chat/reading product. Layout strategy is **layered**, not one global choice.

### Comparison — what to use when

| Pattern                   | Typical max width               | Best for                                         | Use here?                                                              |
| ------------------------- | ------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------- |
| **Claude / chat column**  | ~768px (`max-w-3xl`)            | Long-form AI replies, single reading stream      | **No** as app shell — wastes horizontal space on dashboards and tables |
| **Prose / measure**       | ~65ch (`max-w-prose` ≈ 680px)   | Paragraphs, descriptions, empty states           | **Yes** — section descriptions, error copy, onboarding hints only      |
| **Form / auth column**    | ~448px (`max-w-md`)             | Login, MFA, narrow wizards                       | **Yes** — auth + public layouts                                        |
| **Contained admin shell** | **1536px** (`max-w-screen-2xl`) | Dashboards, settings, multi-column product UI    | **Yes — default** (`AppMain`)                                          |
| **Full bleed shell**      | 100% viewport                   | Wide data tables, analytics, split views         | **Opt-in** — `VITE_LAYOUT_WIDTH=full`                                  |
| **Free responsive grid**  | Inside shell                    | Dashboards, tiles, card lists, asymmetric panels | **Yes — default** — `grid-cols-1 sm:2 lg:3`, `col-span-2`, `flex-wrap` |
| **12-column page grid**   | Inside shell                    | Fine-grained bento when 3-col is not enough      | **Optional** — only when spans need a 12-track                         |

**Do not** copy Claude’s ~768px shell for the whole app. Claude caps width so
**answers stay readable** (~65–80 characters per line). Admin UI needs **width
for data**; readability is handled with **`max-w-prose` on text blocks**, not
by shrinking the entire workspace.

### Three layout layers (mandatory mental model)

```text
┌─ L1 App shell (AppMain) ─────────────────────────────────────┐
│  contained: mx-auto max-w-screen-2xl (1536px)  OR  full: 100% │
│  ┌─ L2 Page grid (optional) ────────────────────────────────┐ │
│  │  lg:grid-cols-3  ·  col-span-2 / 1  ·  gap-*  ·  flex-wrap  │ │
│  │  ┌─ L3 Content ─────────────────────────────────────────┐ │ │
│  │  │  tables: w-full  ·  headings: full row               │ │ │
│  │  │  descriptions: max-w-prose  ·  forms: max-w-md       │ │ │
│  │  └──────────────────────────────────────────────────────┘ │ │
│  └───────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

### Rules

**Rule L-1 — Default shell:** Ship **`contained`** (Appearance → Layout →
**Standard**, or `layoutWidth` in store). Matches Cloudscape/Material admin
products (~1280–1536px content band), not Claude chat.

**Rule L-2 — Full bleed is user or env opt-in:** Appearance → Layout → **Full width**,
or deploy lock `VITE_LAYOUT_WIDTH=full`. Do not mix contained + full per random page.

**Rule L-3 — Free responsive grid (preferred):** Compose pages with `grid-cols-1`,
`sm:grid-cols-2`, `lg:grid-cols-3`, and occasional `col-span-2` on a **small**
column count — not a global 12-column framework. Use `flex flex-wrap gap-*` for
chip/action rows. Example: dashboard highlights `lg:grid-cols-3` + `lg:col-span-2`.

**Rule L-3b — 12-column (optional):** Only when a design truly needs fine-grained
spans (e.g. 8+4 on a 12-track). Default product pages should not use `grid-cols-12`.

**Rule L-4 — Auto-fit inside sections:** Quick actions, card galleries, and
settings groups use **`repeat(auto-fit, minmax(min(100%, …), 1fr))`** via
`src/lib/responsive-grid.ts` (`autoFitActionsGrid`, `autoFitCardsGrid`) or
equivalent Tailwind arbitrary grids. Asymmetric pairs (highlight + stats) use
`splitMainAsideGrid` (`2fr / 1fr` on `lg+`). Prefer **consistent `gap-*`**
(scales with density axis).

**Rule L-5 — Prose cap for reading only:** Any multi-sentence description,
help text, or marketing blurb uses **`max-w-prose`** (or `max-w-2xl` for short
hero subcopy). Headings and data components stay full column width.

**Rule L-6 — Tables and charts:** Default **`w-full`** within the shell. Never
`max-w-3xl` on data surfaces.

**Rule L-7 — Responsive breakpoints:** Mobile = single column, full bleed with
`p-4` shell padding. `lg` (1024px+) = multi-column page grids (e.g. 3-col +
2+1 split). Sidebar collapse is layout-shell concern (`AppLayout`), not per-page.

### Current implementation map

| Surface              | File                               | Width pattern                                                                         |
| -------------------- | ---------------------------------- | ------------------------------------------------------------------------------------- |
| Authenticated main   | `AppLayout.shared.tsx` → `AppMain` | Appearance → **Layout** (`layoutWidth` store); `data-layout-width` on `#main-content` |
| Dashboard bento      | `Dashboard.tsx`                    | `splitMainAsideGrid` (2fr/1fr) + `autoFitActionsGrid` / `autoFitCardsGrid`            |
| Section descriptions | `Dashboard.tsx` `SectionHeading`   | `max-w-prose`                                                                         |
| Auth forms           | `AuthLayout` variants              | `max-w-md` / `max-w-[400px]`                                                          |
| Public pages         | `PublicLayout`                     | `max-w-md`                                                                            |
| Env override         | `core/config/env.ts`               | `VITE_LAYOUT_WIDTH=contained \| full \| reading` (locks Appearance picker)            |

**Appearance → Layout → Content width:** **Standard** (1536px) · **Full width** · **Reading** (~768px, Claude-style).

### If you add a “reading mode” page later

Single-column docs, release notes, or AI-style threads may use a **nested**
`max-w-3xl mx-auto` **inside** `AppMain` — same as Claude’s chat column — without
changing the global shell. That is **page-local**, not product-wide.

---

## Component authoring (any preset)

When writing UI that must work under **all** axis values:

1. **Semantic tokens only** — `pnpm validate:tokens`.
2. **`data-slot`** on surfaces that participate in elevation/separation/shape.
3. **Relative type** — `text-sm`, `text-base`, not px literals.
4. **Gap not space-\*** — `gap-*` for flex/grid rhythm (scales with density).
5. **No theme logic in components** — axes apply on `<html>`; components stay
   declarative.
6. **Test extremes** — Appearance → set each axis to min/max once per feature.

---

## Quick diagnostic

| Symptom                      | Likely axis                         | Fix                                        |
| ---------------------------- | ----------------------------------- | ------------------------------------------ |
| Tiny labels everywhere       | `typeScaleId` = `grand` / `display` | Appearance → Type scale → **Default**      |
| Cramped padding              | `densityId` = `compact`             | Appearance → Density → **Comfortable**     |
| Invisible text on navigation | Page transition opacity             | Use transform-only `route-rise`            |
| Low contrast muted text      | `contrastId` = `dim` / `soft`       | Return to **normal** or adjust copy weight |
| Faint card copy              | Wrong foreground token              | `text-card-foreground` on cards            |

DevTools:

```js
// Type scale active?
getComputedStyle(document.documentElement).getPropertyValue('--text-xs');
// Density active?
getComputedStyle(document.documentElement).getPropertyValue('--spacing');
// Persisted look
JSON.parse(localStorage.getItem('theme-preference') ?? '{}')?.state?.customTheme;
```

---

## Agent / CI hooks

| Task                     | Read first                                          |
| ------------------------ | --------------------------------------------------- |
| Axis audit cycle         | `agent-os/skills/theme-axis-audit/SKILL.md`         |
| New dashboard / dense UI | This doc § Type scale + Density                     |
| Styling components       | `agent-os/rules/tailwind-styling.mdc`               |
| Catalog change           | Update `presets.ts` + `pnpm validate:theme-catalog` |

**Cursor rule:** `agent-os/rules/preset-product-design.mdc` (auto-attached for
theme/preset files).
