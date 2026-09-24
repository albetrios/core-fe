# UI component sourcing

## Primary sources

1. **[ui.shadcn.com](https://ui.shadcn.com)** — primitives, CLI, official blocks
2. **[tablecn.com](https://tablecn.com)** — TanStack Table patterns (see `src/shared/components/DataTable/` + its `DataTableColumnHeader/`/`DataTablePagination/`/`DataTableToolbar/` siblings)

## Research ready-made blocks (in order)

1. [shadcnblocks.com](https://www.shadcnblocks.com/blocks)
2. [shadcn.io](https://shadcn.io)
3. [shadcnstudio.com](https://shadcnstudio.com)
4. [shadcnuikit.com](https://shadcnuikit.com)
5. Official blocks on ui.shadcn.com

Broader gallery: [agent-os/rules/fe-ui-sources.mdc](../../agent-os/rules/fe-ui-sources.mdc) (20 allowed sources).

## Workflow

1. Check primary + research sites for a ready-made block.
2. If it exists → `pnpm dlx shadcn@latest add <url>` (editable code in `src/shared/components/ui/`).
3. Tweak to fit contracts, RBAC, and `data-testid` conventions.
4. **Only if nothing fits** → compose from shadcn primitives yourself.

## Skill

Use `agent-os/skills/shadcn/SKILL.md` when choosing components.

## Stack notes

- Charts: shadcn `chart` (Recharts), lazy-loaded on dashboard.
- Motion: Anime.js for JS-driven motion (dashboard count-up, onboarding steps) + CSS / `tw-animate-css`.
- Tables: TanStack Table + shared data-table toolbar/pagination.
