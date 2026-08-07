# Design Language

The **principles** behind Core — the point of view, the feel, and the rules
that keep every screen coherent. This is the _why_; for the _how_ (token names,
adopting a shadcn-create theme, the Shuffle engine internals) see
[theming.md](theming.md), and for accessibility/UX review criteria use the
`web-design-guidelines` skill. Everything here lives **within the guardrails**:
shadcn/ui components, semantic tokens only (no raw palette), the configured
fonts/brand. Craft is elevated inside those rails, never around them.

## 1. Point of view

This product is a **quiet, neutral control surface that turns expressive on
demand.** The default look is monochrome and content-first — the chrome recedes
so data and actions lead. Personality (accent hue, fonts, density, icon set) is
**opt-in** through the Appearance studio and Shuffle, never forced onto a fresh
install.

Three commitments shape every decision:

- **Neutral by default.** The base palette is black/white/grey in OKLCH. Colour
  is a tool for _meaning_ (success, warning, destructive) or _identity_ (one
  accent), not decoration. A screen with no semantic state should read as
  near-grayscale.
- **Semantic, never literal.** Components reference `bg-background`,
  `text-muted-foreground`, `border-border`, `bg-primary` — never `bg-white` or
  `text-zinc-500`. A new theme is then a different set of token _values_ with
  zero component churn. This is enforced (`pnpm validate:tokens`).
- **Themeable to the core.** Light/dark, accent, base tint, radius, menu style,
  and icon set are **orthogonal axes** that compose. The system is designed so a
  single CSS file (or one Shuffle click) can restyle the whole app and still read
  correctly in both modes.

The litmus test for any new UI: _remove the accent and the data — does it still
feel calm, legible, and intentional?_

## 2. Typography

A single, highly-legible sans carries the product; hierarchy comes from **size,
weight, and colour**, not from many typefaces.

| Role      | Token            | Default        | Use                                                                      |
| --------- | ---------------- | -------------- | ------------------------------------------------------------------------ |
| Body / UI | `--font-sans`    | Inter / system | Everything by default (`GENERATED_FONTS.inter`)                          |
| Headings  | `--font-heading` | Inter / system | `h1`–`h6` (own axis, so Shuffle can split it)                            |
| Mono      | `--font-mono`    | JetBrains Mono | Code, IDs, keys, tabular figures (fixed stack in `@theme`, not shuffled) |

Principles:

- **Hierarchy through restraint.** Step sizes deliberately (e.g. page title →
  section → label → body → meta) and lean on `text-muted-foreground` to demote
  secondary text rather than shrinking everything. Two weights (regular +
  medium/semibold) cover most needs.
- **Headings are their own axis.** `--font-heading` is separate from
  `--font-sans` so a theme — or Shuffle — can pair a characterful display face
  with a calm body face without touching markup.
- **Measure and rhythm.** Keep body copy to a comfortable measure; prefer
  consistent vertical rhythm (the spacing scale) over ad-hoc margins.
- **Minimum readable size.** Product UI labels and hints use at least `text-xs`
  (12px). Sub-12px arbitrary sizes are for decorative meta only — not dashboard
  stats, quick actions, or form labels.
- **Fonts are web-safe stacks.** The CSP is `font-src 'self'`, so the Shuffle
  catalog (`GENERATED_FONTS` in `shared/theme`) uses real system-stack families —
  expressive range without a network fetch.

## 3. Colour

The palette is **OKLCH** end to end — perceptually uniform lightness, so tints
and dark-mode variants stay balanced.

- **Foundation (neutral).** `background` / `foreground` / `card` / `popover` /
  `muted` / `border` / `input` and the parallel `sidebar-*` set are pure grey
  ramps. They define the room; everything else is furniture.
- **Card copy.** Each surface has a paired foreground token: `text-card-foreground`
  on `bg-card`, `text-popover-foreground` on popovers, etc. Custom markup on
  cards must use the paired token — not `text-foreground` by default.
- **One accent.** `primary` (with `ring` + `sidebar-primary`) is the single brand
  hue. The Appearance picker offers nine named hues from `ACCENT_COLORS` (rose ·
  orange · amber · lime · emerald · teal · blue · violet · pink) at OKLCH lightness
  `0.58` with chroma driven by the **accent intensity** axis (`subtle` … `max` in
  `ACCENT_INTENSITIES`). Dominant-neutral-plus-one-accent beats an evenly-distributed
  rainbow every time.
- **Semantic state.** `success` (green), `warning` (amber), `info` (blue),
  `destructive` (red) each ship a `*-foreground` pair and are tuned per mode. Use
  them for _meaning only_ — a green button that isn't "success" is a mistake.
- **Special surfaces.** `brand` is the always-dark marketing panel (AuthLayout) —
  constant across light/dark. `overlay` is the scrim, only ever used with opacity
  (`bg-overlay/50`). `chart-1..5` is a monochrome ramp by default; a theme/Shuffle
  spreads it from the accent.
- **Base tint (opt-in).** `data-base` = `stone` · `slate` · `olive` · `zinc` · `warm`
  (`neutral` = no attribute) warms or cools the neutrals by injecting a tiny chroma
  while preserving each token's per-mode lightness — the _one_ sanctioned exception
  to "neutrals stay neutral", shipped as curated sets (not a free picker) so light
  and dark both read right. Full catalog: `BASE_COLORS` in `presets.ts`.

Contrast is non-negotiable: every `*-foreground` token is chosen to clear WCAG AA
on its surface, in both modes.

## 4. Space, layout & shape

- **Spacing scale.** Use Tailwind's spacing steps; compose rhythm from a small
  set (e.g. 2 / 3 / 4 / 6 / 8). Generous, consistent negative space is the
  cheapest way to look considered. Density is intentional, never accidental.
- **Radius scale.** `--radius-sm` `0.25rem` · `md` `0.375` · `lg` `0.5` · `xl`
  `0.75`. Controls and inputs sit around `md`/`lg`; cards and popovers at `lg`.
  The whole scale derives from one base, so Shuffle/themes can go sharp or soft in
  one move while keeping the _relationship_ between elements.
- **Surfaces & elevation.** Depth is communicated with `card`/`popover` surfaces,
  `border`, and restrained shadow — not heavy drop-shadows. The **elevation** axis
  (`flat` · `soft` · `lifted` · `floating`) and **separation** axis (`border` ·
  `hairline` · `shadow`) retone all `[data-slot]` surfaces together. Overlays darken
  with the `overlay` scrim. **Menu style** (`default` · `translucent` · `glass`)
  makes dropdowns/popovers/selects glassy (`color-mix` + `backdrop-blur`) for a
  lighter, layered feel.
- **Composition.** Align to a grid; let related actions cluster and unrelated
  ones breathe. Asymmetry and overlap are welcome _when intentional_ — but an
  admin surface earns trust through predictability first.
- **Layout layers (product default).** Three tiers — do not collapse into one
  max-width:
  1. **App shell** — `contained` → `max-w-screen-2xl` (1536px) centered in
     `AppMain` (default); **Full** and **Reading** (~768px) via Appearance →
     Layout; deploy lock via `VITE_LAYOUT_WIDTH`.
  2. **Page grid** — free responsive grids: `auto-fit` + `minmax()` for tile rows,
     `2fr / 1fr` splits for asymmetric panels (`src/lib/responsive-grid.ts`); see
     dashboard.
  3. **Reading measure** — `max-w-prose` (~65ch) for paragraphs only; **not**
     the whole app. Claude-style ~768px caps belong on reading/chat pages
     locally, not on admin shells.

- **Not Claude-width by default.** Chat products cap ~720–768px for long answers.
  This product is a control surface — width is for tables and panels; constrain
  copy, not chrome. Full rules: [preset-product-design-rules.md § Layout](preset-product-design-rules.md#layout--grid-shell-vs-page-vs-prose).

## 5. Motion

Motion is **subtle, fast, and purposeful** — it orients, it doesn't perform.

- **Vocabulary.** `fade-in` (0.2s) for overlays; **`route-rise`** (0.28s, via the
  `animate-fade-in-up` utility name) for page/route reveals — **transform only, no
  opacity fade** so copy stays visible if animation is skipped or reduced-motion
  short-circuits duration. `accordion` for disclosure; `shimmer` for skeleton
  loading. Overlays use the shadcn enter/exit utilities (`tw-animate-css`).
- **Dashboard / product motion.** Prefer **Anime.js** for intentional numeric or
  timeline motion (`useAnimeCountUp` on stats). Avoid stacking Framer-style page
  fades on content shells.
- **High-impact moments over confetti.** One well-orchestrated reveal on
  navigation reads as more polished than scattered micro-interactions. Prefer a
  single staggered entrance to many competing animations.
- **Honour reduced motion.** A global `prefers-reduced-motion` block neutralises
  animation/transition/scroll for users who ask for it — design so the
  motion-free experience is still complete.
- **Interaction affordance.** Interactive elements show a pointer cursor
  (restored app-wide after Tailwind v4 Preflight); hover/focus states are visible
  and never rely on colour alone.

## 6. Iconography

- **One swappable surface.** Every icon flows through `@/shared/icons` (lint-
  enforced). The default is **Lucide** (in the main bundle); **Tabler** and
  **Phosphor** are lazy-loaded alternatives. Pick icons that read at 16px and
  match the calm tone — line icons, consistent metaphors.
- **Weight is an axis.** `--icon-stroke` drives Lucide/Tabler stroke width so the
  icon weight tracks the overall look (Phosphor uses fixed path weights).
- **Restraint.** Icons clarify; they don't decorate. Pair an icon with a label
  unless the glyph is unambiguous and space-constrained.

## 7. Themeability & Shuffle (the expressive layer)

The neutral foundation exists so the app can flex without breaking. Two surfaces
drive it:

- **Appearance studio** (Settings → Appearance): per-axis pickers for mode,
  named presets, accent/chart hue, base colour, harmony, accent intensity, body +
  heading fonts, radius, shape language, type scale, menu style, icon weight, icon
  library, density, contrast, elevation, separation, motion, and focus ring — plus
  toast preview (temporary). Every option list is imported from `presets.ts`.
- **Shuffle**: generates a fresh _full look_ in one click (rolls generated axes +
  orthogonal base/menu/icons) — the shadcn-create experience, applied inline on
  `<html>` (CSP-safe) and persisted via `customTheme` + shareable `?theme=<seed>`.

Because every axis is orthogonal and token-driven, Shuffle can't produce a broken
screen: contrast rules and slot hooks are fixed; only _personality_ varies. When
`VITE_THEME_LOCK=true`, the pickers and Shuffle hide and the app is pinned to the
code-defined theme.

**Catalog source of truth:** `src/shared/theme/presets.ts` and
[theme-axis-audit-playbook.md](theme-axis-audit-playbook.md). Mechanics:
[theming.md](theming.md).

## 8. Principles checklist

**Do**

- Reach for semantic tokens (`bg-background`, `text-primary`, `border-border`).
- Earn attention with hierarchy and space before colour.
- Use colour for meaning (state) or identity (one accent).
- Verify every change in **both** light and dark, at AA contrast.
- Respect reduced-motion; keep motion fast and few.
- Compose from shadcn/ui primitives; extend via `cn()` + `cva` variants.

**Don't**

- Use raw palette classes (`bg-white`, `text-zinc-500`) or inline styles —
  `pnpm validate:tokens` will fail.
- Introduce a second accent or a rainbow of status colours.
- Add bespoke fonts outside the configured stacks / Shuffle catalog (CSP +
  brand).
- Animate for its own sake, or rely on colour alone to signal state.
- Hand-edit vendored `components/ui/*` — go through the `shadcn` skill.

## See also

- [theming.md](theming.md) — token map, shadcn-create adoption, Shuffle/icon engine.
- [preset-product-design-rules.md](preset-product-design-rules.md) — **per-axis product floors** (type scale, density, WCAG, motion).
- `agent-os/skills/frontend-design/SKILL.md` — making UI distinctive within these rails.
- `agent-os/skills/web-design-guidelines` — accessibility/UX review criteria.
- `agent-os/skills/ui-ux-pro-max` — advisory design intelligence (palettes, pairings).
