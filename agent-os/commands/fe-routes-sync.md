---
description: Re-sync frontend route registrations and docs after route changes
argument-hint: (no arguments)
allowed-tools: Bash(pnpm validate*), Read, Write
---

After adding, removing, or renaming any frontend route:

1. **Route tree** — register the island in `src/app/routes/routeTree.tsx`:
   - lazy import from `@/pages/<page>/<page>.route.tsx`
   - `beforeLoad` guards (auth, organization context, `requirePermission`) as needed
   - `head: manifestHead(manifest)` from the page manifest
2. **Route docs** — update `docs/reference/routes-and-ui.md` so the URL tree,
   manifest summary, and test ids match disk (`src/pages/` mirrors URLs 1:1).
3. **Structure gate** — run `pnpm validate:structure` (route-island validator).
4. **RBAC** — if the route is protected, confirm `src/core/rbac/policies.ts` and
   the page manifest `permission` field agree.
5. **Overview doc** — ensure the island has `<PAGE>.OVERVIEW.md` (required for
   every page folder).

Report which routes changed and which artifacts were updated.
