# Theming

The app is themed entirely through CSS custom properties (design tokens) declared
with Tailwind v4's `@theme` directive in `src/index.css`. Every component uses
**semantic tokens** (`bg-background`, `text-primary`, `border-border`, …) and
never raw palette classes — `pnpm validate:tokens` enforces this. A new theme is
therefore just a different set of token values; no component changes.

## shadcn-create compatible

A theme exported from [ui.shadcn.com/create](https://ui.shadcn.com/create) (or
the shadcn theme editors) is a block of CSS variables. Our token set is a
**superset** of shadcn's, with one naming difference: shadcn emits bare
`--background` / `--primary` / `--radius`, while our `@theme` uses the `--color-`
prefix (`--color-background`, `--color-primary`) and `--radius-{sm,md,lg,xl}`.

### Adopting a generated theme

1. Generate/copy the theme (its `:root { … }` light block + `.dark { … }` block).
2. Map names — prefix the color vars with `--color-`:

   | shadcn-create                                | this app                                            |
   | -------------------------------------------- | --------------------------------------------------- |
   | `--background` / `--foreground`              | `--color-background` / `--color-foreground`         |
   | `--primary` / `--primary-foreground`         | `--color-primary` / `--color-primary-foreground`    |
   | `--secondary*` `--muted*` `--accent*`        | `--color-secondary*` `--color-muted*` …             |
   | `--destructive` / `--destructive-foreground` | `--color-destructive*`                              |
   | `--card*` / `--popover*`                     | `--color-card*` / `--color-popover*`                |
   | `--border` / `--input` / `--ring`            | `--color-border` / `--color-input` / `--color-ring` |
   | `--sidebar*` (incl. `--sidebar-primary*`)    | `--color-sidebar*`                                  |
   | `--chart-1` … `--chart-5`                    | `--color-chart-1` … `--color-chart-5`               |
   | `--radius`                                   | `--radius-lg` (sm/md/xl derive around it)           |

3. Paste the mapped values into the `@theme` block (light) and the `.dark`
   override in `src/index.css`. Keep OKLCH — the generators emit it and it is the
   project's color space.
4. Run `pnpm validate:tokens` and do a visual pass in both light and dark.

The app's extra semantic tokens — `success` / `warning` / `info` (+ foregrounds),
`brand`, `overlay` — have no shadcn equivalent; pick values that fit the palette.

## Presets & runtime switching

Named presets are applied via a `data-theme="<id>"` attribute on `<html>`,
composed with the `.dark` class — so light/dark **mode** and the **preset** are
independent axes. A runtime switcher (Settings → Appearance) sets both.

Settings → Appearance is a shadcn-create-style studio with a per-axis picker for
each part of the look. **Generated look** axes (stored in `customTheme`): accent
and chart hue (`ACCENT_COLORS`), harmony (`HARMONY_RULES`), accent intensity
(`ACCENT_INTENSITIES`), body + heading font (`GENERATED_FONTS`), corner radius
(`GENERATED_RADII`), shape language, type scale, density, motion, elevation,
contrast, separation, and focus ring. **Orthogonal** axes (separate store fields):
base colour (`BASE_COLORS`), menu style (`MENU_STYLES`), icon weight, and icon
library — plus light/dark mode and named presets. All catalogs live in
`src/shared/theme/presets.ts`.

The **"Shuffle theme"** action does _not_ cycle the named presets — it
**generates a fresh full look** each click from a 32-bit seed: accent hue, chart
anchor, fonts, radius, and every generated experience axis above, plus optional
rolls on base/menu/icons. The accent drives the same tokens a preset overrides
(`--color-primary` / `--color-ring` / `--color-sidebar-primary` /
`--color-sidebar-ring` + foregrounds) and the chart anchor spreads into
`--color-chart-1..5` using the active harmony rule. Everything is set **inline**
on `<html>` so it works in both light and dark (CSP-safe — no injected `<style>`,
and fonts are **web-safe stacks** only since the CSP is `font-src 'self'`),
mutually exclusive with the `data-theme` presets. The store records it as
`preset: 'custom'` + `customTheme: GeneratedTheme`, so it persists across reloads.
Share via `?theme=<seed>`. Shuffle also rolls the orthogonal **icon axes**
(`shuffleIcons`): ~50% of clicks pick a new icon weight and ~35% swap the icon
library.

**Orthogonal axes** apply on top of any preset or generated look and persist
independently:

- **Base colour** (`data-base`; `neutral` = no attribute): `neutral`, `stone`,
  `slate`, `olive`, `zinc`, `warm` — tints neutral surfaces via mode-correct CSS
  blocks.
- **Menu style** (`data-menu`): `default`, `translucent`, `glass` — glassy
  dropdowns/popovers/selects.
- **Icon weight** (`--icon-stroke`): `thin`, `regular`, `bold` — Lucide/Tabler
  stroke width (Phosphor ignores it).
- **Icon colour** (`data-icon-color`): `default`, `foreground`, `muted`, `primary`,
  `accent`, `destructive` — semantic token mapping for app icons.
- **Icon library**: `lucide`, `tabler`, `phosphor` — lazy-loaded swap via
  `@/shared/icons`.

When `VITE_THEME_LOCK=true`, the switcher and shuffle are hidden and the app is
pinned to the code-defined theme.

### The boot palette is a loan, not a layer

`public/theme-init.js` runs before any bundle and paints the HTML boot splash from
the resolved palette it replays out of `theme-boot-vars` — written **inline on
`<html>`**, and resolved for the mode the document loaded in. An inline custom
property outranks both `:root` and `.dark`, so every one left behind pins its token
to the boot mode for the life of the document: flipping mode afterwards moves only
the tokens the app owns (`--color-card`, `--color-border`,
`--color-muted-foreground`) and the page comes out half dark — black text on a black
card, a light card on a black page — repaired only by a reload, the one thing that
re-runs the boot script.

So `applyMode()` calls `releaseBootThemeVars()` on every mode application (boot
rehydrate, the Appearance/menu switch, an OS `prefers-color-scheme` flip), handing
`--color-background` / `--color-foreground` / `--color-muted` back to the stylesheet.
The accent and radius need no release: the caller re-asserts them in the same tick,
so nothing paints in between. `setTheme` re-applies the active look right after, which
re-takes the snapshot for the mode now on screen — one tagged with the old mode is
skipped at the next cold load and costs the splash its flash-free palette.

`src/shared/theme/boot-theme-vars.drift.test.ts` pins the contract: every property
the boot script can write is either released or re-asserted.

## Icon library (swappable at runtime, lazy-loaded)

Every app icon flows through the `@/shared/icons` barrel (eslint-enforced — see
`eslint.config.mjs`; Lucide/Tabler/Phosphor are banned outside it). Each export
is a thin wrapper that renders the **active** library's version, read from
`useThemeStore().iconLibrary`:

- **Lucide** is the default, statically imported in the barrel → tree-shaken into
  the main bundle (only the ~50 icons we use). So the initial bundle is unchanged
  whether or not the feature exists.
- **Tabler** and **Phosphor** live in `iconset-tabler.ts` / `iconset-phosphor.ts`
  — curated `Record<IconName, AppIcon>` maps that are **dynamically imported**
  (`icon-registry.ts`) only when selected, as their own lazy chunks (~4 KB /
  ~32 KB gz). Until a chunk arrives the barrel falls back to Lucide, so there's
  no flash of missing icons. `ICON_NAMES` is the canonical key list; the
  `Record<IconName, …>` typing guarantees every set covers exactly the same icons.
- Vendored shadcn primitives (`components/ui`) import Lucide directly and **always
  stay Lucide** — only app-code icons swap.

Adding a library: install it, add `iconset-<lib>.ts` (map all `ICON_NAMES`), add
a `loadModule` branch in `icon-registry.ts` and an entry in `ICON_LIBRARIES`.

## Theme axis audit playbook

When making the UI respect every Appearance / Shuffle axis (corner radius, elevation,
density, etc.), follow the repeatable procedure in
**[theme-axis-audit-playbook.md](theme-axis-audit-playbook.md)** — full preset catalog,
status tracker, grep cheatsheet, and the steps used for the radius/shape pass.

**Agents:** read **`agent-os/skills/theme-axis-audit/SKILL.md`** and
**`agent-os/rules/theme-axis-audit.mdc`** before any axis cycle (one axis per cycle,
detailed report required).

**Product-design floors (typography, density, touch, motion):**
**[preset-product-design-rules.md](preset-product-design-rules.md)** — industry-backed
rules mapped to every axis; **`agent-os/rules/preset-product-design.mdc`** for agents.

## Expanded catalog (2025-06 audit)

Full axis list and status: **[theme-axis-audit-playbook.md](theme-axis-audit-playbook.md)**.
Post-audit follow-up: **[theme-axis-follow-up-plan.md](theme-axis-follow-up-plan.md)**.

| Axis             | Attribute / store                            | Options (from `presets.ts`)                                                     |
| ---------------- | -------------------------------------------- | ------------------------------------------------------------------------------- |
| Named preset     | `data-theme` / `preset`                      | default, violet, emerald, rose, ocean, custom                                   |
| Mode             | `.dark` class / `theme`                      | light, dark, system                                                             |
| Accent hue       | inline / `customTheme.hue`                   | rose, orange, amber, lime, emerald, teal, blue, violet, pink (+ continuous hue) |
| Chart harmony    | `harmonyId`                                  | monochromatic, analogous, complementary, split, triadic                         |
| Accent intensity | `intensityId`                                | subtle, muted, balanced, vibrant, max                                           |
| Base neutral     | `data-base` / `baseId`                       | neutral, stone, slate, olive, zinc, warm                                        |
| Menu surface     | `data-menu` / `menu`                         | default, translucent, glass                                                     |
| Radius           | `radiusId`                                   | sharp, default, rounded, round                                                  |
| Shape            | `data-shape` / `shapeId`                     | uniform, mixed, pill, sharp                                                     |
| Type scale       | inline `--text-*` / `typeScaleId`            | tight, compact, default, grand, display                                         |
| Elevation        | `data-elevation` / `elevationId`             | flat, soft, lifted, floating                                                    |
| Contrast         | `data-contrast` / `contrastId`               | normal, soft, crisp, dim, amoled                                                |
| Separation       | `data-separation` / `separationId`           | border, hairline, shadow                                                        |
| Density          | inline `--spacing` / `densityId`             | compact, cozy, relaxed, airy                                                    |
| Layout width     | store `layoutWidth` / `VITE_LAYOUT_WIDTH`    | contained (standard), full, reading                                             |
| Motion           | inline `--default-transition-*` / `motionId` | instant, calm, smooth, snappy (+ OS reduce → instant)                           |
| Focus ring       | `data-focus` / `focusId`                     | ring, glow, offset, underline, inset                                            |
| Toast variant    | store `toastVariant` (index)                 | tint, solid, outline, accent, minimal, glass (TEMP preview)                     |
| Toast position   | store `toastPosition`                        | top-right, top-center, top-left, bottom-right, bottom-center, bottom-left       |
| Icon weight      | `--icon-stroke` / `iconWeight`               | thin, regular, bold                                                             |
| Icon colour      | `data-icon-color` / `iconColor`              | default, foreground, muted, primary, accent, destructive                        |
| Icon library     | lazy chunk / `iconLibrary`                   | lucide, tabler, phosphor                                                        |

Generated / shuffled looks set accent hue, chart harmony, fonts, radius, and all
experience axes via inline CSS vars (`applyGeneratedTheme` in `shared/theme/presets.ts`).
Named presets and generated looks are mutually exclusive (`data-theme` vs inline vars).

`pnpm validate:theme-catalog` fails if `design.md` / `theming.md` drift from
`presets.ts` (assertions in `src/shared/theme/catalog-doc.ts`).

## Compliance gate

`pnpm validate:theme-axis` scans app code (excluding vendored `ui/` and tests) for:

- Hardcoded Tailwind shadows (`shadow-sm` … `shadow-2xl`)
- Hardcoded focus rings (`focus-visible:ring`, `focus:ring`)
- Direct `lucide-react` imports outside the icon barrel
- `bg-card` / `bg-popover` without a nearby `data-slot=` marker
- **Off-scale corner radius** — a bare `rounded`, or an arbitrary `rounded-[3px]`.
  Neither follows the Corner radius axis. Every _named_ step does (`rounded-xs` …
  `rounded-4xl`: `sm/md/lg/xl` are set inline by the axis, the rest derive from
  `--radius-lg` in `index.css`), and so does `rounded-[var(--radius-*)]`.

- **`rounded-full` the Sharp shape cannot reach** — `rounded-full` is a **shape**
  decision rather than a radius one, so the element needs a slot the
  `[data-shape='sharp']` list squares: its own `data-slot=` within 5 lines above
  (usually **`data-slot="pill"`** — chip, count badge, icon disc, track, swatch), or a
  primitive that brings one (`<Button>`, `<Badge>`, `<Avatar>`, `<Skeleton>`).
  **Exempt, because they are indicators and not surfaces:** status dots of at most 10px
  (`size-2.5`, `h-2 w-2`), blurred glows, the `animate-ping` halo, and pseudo-element
  markers (`before:rounded-full` — squared in `index.css` through the `nav-item` that
  draws them).

- **Fixed-size spacing** — a padding / margin / gap written as a literal (`p-[24px]`,
  `gap-[0.5rem]`). Every scale step is `calc(var(--spacing) * n)` and the **Density** axis
  sets `--spacing`, so `p-6` follows the setting and `p-[24px]` — pixel-identical on the
  default look — silently ignores it. `[var(--…)]` and `[calc(…)]` pass; sizes and offsets
  (`h-[640px]`, `top-[20%]`) are not spacing and are not checked.

**One inset for every dialog.** `DialogContent` gives each dialog `p-6`. A surface that opts
out to lay out its own panes (`SettingsModal`, `p-0`) has to put the same step back on
**each** pane — search box, nav and content are all `6` there, and the phone sheet's section
picker starts on the content's `4` gutter. Browser-proven under Compact and Airy in
`theme-shape.e2e.test.ts` (each inset is exactly six spacing units).

Two traps the slot model has, both found by measuring rather than reading:

- **A vendored primitive can re-slot a `<Button>`.** `ui/carousel` renders its arrows as
  `<Button data-slot="carousel-previous">`, so the `button` rule no longer matches them.
  A primitive that is round by design needs **its own** slot in the Sharp list.
- **A placeholder needs the corners of the thing it stands in for.** `lib/animations`
  ships the skeletons the dashboard actually loads with; both carry
  `data-slot="skeleton"` like `ui/skeleton`, or a Sharp app paints round and snaps square.

Allowlisted exceptions live in `tooling/validate/theme-axis-allowlist.txt` — prefer a
class **fragment** over a file name: a fragment exempts one line from one check, a file
name exempts the whole file from every check. The gate runs in `pnpm health` (phase 8b)
after `validate:tokens`, and in the PR `static-sync` job. It is itself under test —
`tooling/validate/theme-axis.test.mjs` runs it against fixture trees (every violating
spelling, every allowed one) via `pnpm test:github-scripts`.

**The gate reads class strings; only a browser can read corners.**
`tests/e2e/theme-shape.e2e.test.ts` seeds radius **None** + shape **Sharp**, then asks
for the computed `border-radius` of every painted element on the sign-in screen, the
dashboard (desktop and phone shell) and the open overlays (settings, appearance,
notifications). It must come back empty; a control test runs the same sweep on the
default look and must find corners, and a third proves the **Round** look grows them.

**Catalog doc sync:** `pnpm validate:theme-catalog` ensures `design.md` and
`theming.md` list the same axis options as `presets.ts` (assertions in
`catalog-doc.ts`). Runs in the same health phase and PR `static-sync` job.

## Readability & route motion

These rules prevent “invisible UI” when themes or motion settings change:

| Rule                                                                   | Where enforced                                                 |
| ---------------------------------------------------------------------- | -------------------------------------------------------------- |
| `text-card-foreground` on card surfaces                                | `Card` primitive + custom dashboard/card markup                |
| Minimum `text-xs` for product labels/hints                             | `agent-os/rules/tailwind-styling.mdc`, `design.md` §2          |
| Page transitions use **transform-only** `route-rise` (no opacity fade) | `src/index.css` (`--animate-fade-in-up`), `PageTransition.tsx` |

Do not add opacity-based entrance animations to layout outlets or `PageTransition` —
`animation-fill-mode: both` can leave primary copy at `opacity: 0` when reduced
motion zeroes duration. See `design.md` §5 Motion.
