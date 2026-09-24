# Architecture (core-fe)

A condensed map of how the frontend is layered, for agents and humans who need
the shape of the system before touching code. The authoritative, detailed
contracts live in [`agent-os/rules/fe-file-structure.mdc`](../rules/fe-file-structure.mdc)
and [`agent-os/rules/fe-project-conventions.mdc`](../rules/fe-project-conventions.mdc);
this is the orientation pass.

## Stack

React 19 + TypeScript (strict) + Vite, Tailwind CSS v4 (CSS-first tokens in
`src/index.css`), shadcn/ui (new-york, radix, lucide), TanStack Query (server
state) + TanStack Router (routing/URL state) + Zustand (client state),
react-hook-form + Zod (forms/validation).

## Layers

```text
ui → lib → core → shared → pages → app        (one-way dependency rule)
```

| Layer     | Path                        | Responsibility                                                                                                  |
| --------- | --------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `app/`    | `src/app/`                  | Shell: route tree, guards, providers, error boundaries, analytics/observability bootstrap                       |
| `pages/`  | `src/pages/`                | Route islands (feature code). Mirrors the URL tree 1:1. Pages never import pages                                |
| `shared/` | `src/shared/`               | Cross-page components/forms/hooks/layouts, global Zustand store, auth + tenancy runtime, cross-page api helpers |
| `core/`   | `src/core/`                 | Framework-agnostic kernel: http, rbac, config, data-provider, resources, version, types                         |
| `lib/`    | `src/lib/`                  | Pure utilities (`cn()`, animations, route-island helpers) — no side effects                                     |
| `ui`      | `src/shared/components/ui/` | Vendored shadcn primitives (flat) — import only other primitives + `lib`                                        |

**One documented exception:** the core kernel (`core/http`, `core/rbac`) may
import the runtime trio — `shared/auth`, `shared/errors`,
`useAuthStore`/`useOrganizationStore` — because token handling, error reporting,
and permission checks are runtime services that depend on app state/SDKs and
therefore live in `shared`. Enforced by `no-restricted-imports` in
`eslint.config.mjs`.

## Route islands

Every URL maps to a folder under `src/pages/` carrying the same four files:
`<page>.route.tsx` (lazy boundary), `<page>.manifest.ts` (path/title/testId/
permission/kind/children), `<Page>Page.tsx` or `<Page>Layout.tsx` (top-level UI),
and `<PAGE>.OVERVIEW.md` (entry doc). Sub-units (components/forms/hooks/dialogs/
store) are folder-per-unit with a colocated test and `index.ts` barrel. Full
spec: [`fe-route-island` skill](../skills/fe-route-island/SKILL.md).

## State

- **Server state** → TanStack Query (`hooks/use<X>/`). Never in Zustand.
- **Global client state** → Zustand in `src/shared/store/use<X>Store/`.
- **URL state** → TanStack Router (`<page>.search.ts`).
- **Form state** → react-hook-form + Zod, inside the form component.
- **Organization context** travels in the **URL path**
  (`/organization/$organizationSlug`); the backend scopes from it.

## Auth & security

Access token in memory only (`shared/auth/token.ts`); refresh token is an
HttpOnly cookie. A single refresh path (`shared/auth/service.ts`) with
single-flight + Web Lock serialization. CSP ships as a build-generated header
(`dist/_headers`). Full model: [`docs/reference/security-model.md`](../../docs/reference/security-model.md).

## Quality gates

`pnpm health` runs the full local gate (format, lint, biome, docs-lint,
type-check, tests, build, bundle size, env-example, public assets, TSDoc budget,
route-island structure). CI mirrors these as path-filtered lanes behind a single
`quality-gate` required check. See [principles.md](principles.md) and
[`docs/reference/quality/`](../../docs/reference/quality/).
