# Engineering principles (core-fe)

The condensed working agreement for any change in this repo. The always-applied
source of truth is [`agent-os/rules/fe-engineering-principles.mdc`](../rules/fe-engineering-principles.mdc);
this page is the quick reference.

## Before writing code

- Understand the existing architecture ([architecture.md](architecture.md)).
- **Reuse before you create.** Search for the helper, hook, component, service,
  env var or pattern that already does the job and use it; create something new
  only when nothing fits. If an existing one is close but not right, improve it —
  or say in the PR why new is better — **in the same PR**, never leaving old and
  new side by side. Detail and examples in the
  [always-applied rule](../rules/fe-engineering-principles.mdc).
- Keep changes minimal and focused; preserve naming and style.
- Prefer simple over clever.

## Code quality

- Small, single-purpose functions; descriptive names.
- No magic numbers — named constants or config.
- Comments only for non-obvious intent, not narration.
- Remove dead code, unused imports, `console.log`, commented-out code.

## Type safety

- Strict typing always; never `any` — use `unknown` and narrow.
- Define data shapes as Zod schemas in `contracts.ts`; infer TS types from them.

## Architecture habits

- Business logic out of UI — use `api.ts`, hooks, and `core/` services.
- Respect the one-way dependency rule (`ui → lib → core → shared → pages → app`);
  pages never import pages.
- Semantic design tokens only (`bg-background`, `text-muted-foreground`) — never
  raw palette classes. Enforced by `pnpm validate:tokens`.
- shadcn components come via the [`shadcn` skill](../skills/shadcn/SKILL.md) and
  the allowed sources in [`fe-ui-sources` rule](../rules/fe-ui-sources.mdc).

## Dependency policy

Before adding a package: check whether existing code/platform APIs already solve
it; prefer lightweight, maintained libraries; document new deps in
[`docs/reference/tools-and-usage.md`](../../docs/reference/tools-and-usage.md).

## Definition of done

Every implementation includes its dependent work — tests, route registration,
RBAC, `data-testid`, doc updates, and lint/type-check — completed silently
without asking (see [`fe-agent-behavior` rule](../rules/fe-agent-behavior.mdc)). The
gate is `pnpm health` (or the individual checks it runs). Patch coverage on
changed lines must be ≥ 80% in PR CI; the TSDoc and coverage budgets are
ratchets (lower freely, raise only via an intentional re-baseline).

## Anti-patterns to avoid

Massive catch-all modules, deeply nested conditionals/components, unnecessary
hooks/context/global state, premature `memo`/`useMemo`/`useCallback`, duplicated
logic, tight coupling between features, vague naming (`data`, `handler`,
`item`), and hidden side effects in render or shared utilities.

## Final rule

Always leave the codebase cleaner, simpler, safer, and easier to maintain than
before your change.
