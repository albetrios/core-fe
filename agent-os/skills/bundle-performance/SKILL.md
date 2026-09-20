---
name: bundle-performance
description: Keep the core-fe production bundle within size-limit budgets — dynamic-import heavy or deferred modules off the first-paint path, lazy route-island boundaries, code-splitting, and heavy-import triage. Use when acting on a bundle-size-reviewer finding or when a size budget is exceeded.
---

# Bundle performance

The procedural counterpart to the `bundle-size-reviewer` agent: the agent finds,
this skill fixes. Use it when a size budget is exceeded or a chunk regresses.

## Measure first

`pnpm build` then `pnpm size` (size-limit budgets, `tooling/ci/run-size-limit.mjs`);
`pnpm size:check` emits JSON for before/after comparison. Never measure on the
dev server — see `docs/reference/local-production-perf.md`.

## The main levers

1. **Dynamic-import heavy / deferred modules.** `@sentry/react`, `posthog-js`,
   and the SettingsModal / CommandPalette trees must be `import()`-only — a
   single static import drags their chunk onto the first-paint preload path.
   `pnpm build:check` tripwires this; keep them lazy.
   Settings is intentionally warmed with the authenticated outlet while its
   bounded startup splash is held; dynamic splitting does not mean waiting for
   the first settings click. Application notification callers use `notify`, not
   direct Sonner imports; only its deferred runtime/components integrate Sonner.
2. **Lazy route islands.** Every route loads via its `<page>.route.tsx` lazy
   boundary; a route that becomes eagerly imported merges into the entry chunk.
   Keep the boundary intact. If a lazy layout is rendered inside a route wrapper,
   await its TanStack `preload` in the owning route loader before rendering it.
   The router cannot discover that nested layout from the wrapper alone. Preserve
   TanStack's chunk recovery; cover both auth and public layout loaders in route
   tests and check cold-entry browser warnings after router/React upgrades.
3. **Split vendor from entry.** A large new dependency added to a shared,
   eagerly-loaded module inflates the entry. Import it in the leaf that needs
   it, or dynamic-import it; reconsider the dependency (see
   `agent-os/skills/dependency-management/SKILL.md`).
4. **CSP constraint.** `assetsInlineLimit: 0` in `vite.config.ts` is required for
   CSP — do not inline assets to shave requests.

## Module-scope `import()` is eager — it deletes the split

```ts
const sidebarImport = import('./variants/AppLayoutSidebar.tsx'); // fetches NOW
const Shell = lazy(() => sidebarImport.then((m) => ({ default: m.SidebarShell })));
```

A top-level dynamic import executes at **module evaluation**, so loading the
parent fetches every variant even though one renders. This shipped on core-fe and
`pnpm build:check` did **not** catch it — that tripwires the static preload graph,
not runtime fetches.

Use `onceAsync()` (`src/lib/lazy-module.ts`): same shared module promise (so
`React.lazy` and any test preload resolve the identical promise), but nothing is
fetched until first render or an explicit preload. It deliberately does **not**
cache a rejection, so a chunk fetch that fails on a flaky network stays retryable
instead of leaving the surface unrenderable until a full reload.

```bash
# audit for module-scope dynamic imports (column 0 = module scope; indented = in a function)
grep -rnE '^(const|let|var) [^=]*= *(await )?import\(' src --include='*.ts' --include='*.tsx' \
  | grep -v '\.test\.'
```

## Verify

For dependency or loading changes, also follow these checks:

- Compare production builds with the same source and environment when attributing
  dependency growth. Keep experimental configs and output outside the checkout;
  record the installed versions and measured bytes, not only an estimate.
- Use `pnpm size` on the real entry and modulepreload graph. Preserve its budgets;
  moving required work to an unconditional startup `import()` is not a saving.
- Keep ready overlay shells and controls visible. Defer only the content or
  library that is not yet needed; await required translations before showing it.
- A deferred notification renderer must preserve message IDs, replacement,
  dismissal, Undo, promise settlement, and visible feedback if its chunk fails.
- Check a production build in desktop and mobile browsers with delayed and failed
  requests. Measure layout stability and verify settings, appearance, search,
  notifications, and locale changes affected by the patch.
- Final verification uses the actual installed dependency graph and normal hooks,
  not a temporary resolver, probe configuration, or disabled gate.

- `pnpm size` — every budget within limit.
- `pnpm build:check` — no heavy deferred module on the first-paint path.
- The module-scope `import()` audit above — no matches outside tests.

## Related

Check the production resource alias as well as the development loader. Single-locale
builds keep immediate shell labels but defer selected-language page namespaces;
policy tests must exercise the generated module and its emitted chunk boundaries.

Skills: `platform-hygiene` (build env, knip, deploy validators),
`react-best-practices` (re-render / code-split patterns),
`dependency-management` (dependency size). Agent: `bundle-size-reviewer`
(read-only finder). Doc: `docs/reference/local-production-perf.md`.
