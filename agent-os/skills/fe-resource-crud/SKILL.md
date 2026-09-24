---
name: fe-resource-crud
description: Scaffold backend resource pages in core-fe — resource manifest, list page, URL-driven create/edit dialogs, $param folders, bootstrap registry, RBAC permissions. Use when adding a CRUD resource island (members, invoices, patients, etc.).
---

# Resource CRUD (core-fe)

Use this skill when adding a **backend resource** with list + create/edit/show flows.

**Island shape** comes from **`fe-route-island`**; **org guards** from **`fe-routing-tenancy`**
when the resource lives under `$organizationSlug`.

**Contract:** `agent-os/rules/fe-file-structure.mdc` → Resource page + CRUD URL convention  
**Reference manifest:** `src/core/resources/members.resource.ts`  
**Registry:** `src/core/resources/bootstrap.ts`, `docs/reference/frontend-platform.md` (L7)

---

## URL mapping (standard)

| Action | URL                     | Renders                               |
| ------ | ----------------------- | ------------------------------------- |
| List   | `/<resource>`           | `<Resource>ListPage.tsx`              |
| Create | `/<resource>/create`    | Dialog over list (sub-route → `null`) |
| Show   | `/<resource>/[id]`      | Page or dialog over list              |
| Edit   | `/<resource>/[id]/edit` | Dialog over list                      |
| Delete | _(no URL)_              | Inline `AlertDialog` on list          |

On disk, `[id]` is a **full-name `$param` folder** (`$memberId`, `$invoiceId` — never `$id`).

---

## Checklist — new resource

1. **Placement** — under the correct org layout, e.g. `pages/organization/$organizationSlug/<resource>/`.
2. **Resource manifest** — `<resource>.resource.ts`:
   - Zod schema + inferred type in `<resource>.contracts.ts` (shared across CRUD views)
   - `permissions`: list/show/create/update/delete → `OrganizationPermission` codes
   - `ui`: label, icon (from `@/shared/icons`), `showInNav` when applicable
3. **Page manifest** — `kind: 'layout'`, `children: ['create', '$<resource>Id', '$<resource>Id-edit']` (adjust to URL shape).
4. **List page** — `<Resource>ListPage.tsx`:
   - Reads pathname → opens matching dialog when URL implies create/edit/show
   - List stays mounted behind dialog backdrop
   - Mounts `CreateDialog`, `EditDialog`, delete `AlertDialog`
5. **Sub-routes for dialogs** — `create/<page>.route.tsx` exports `Component: () => null`; same for edit segment if URL-driven.
6. **`$<resource>Id/` island** — show page or null route for dialog-only show.
7. **Data layer** — `<resource>.api.ts` (page-private) + `hooks/useList|useOne|useCreate|useUpdate|useDelete/` or shared CRUD hooks.
8. **RBAC** — permissions in `src/core/rbac/policies.ts`; route `beforeLoad` uses `gatewayFromManifest` + `manifest.permission` / `manifest.module`.
9. **Bootstrap** — `registerResource(...)` in `core/resources/bootstrap.ts` when nav/dev-tools need L7 metadata.
10. **Forms** — follow **`fe-http-forms-errors`** for mutation error mapping.
11. **Tests** — colocated unit tests; list + dialog integration in `__tests__/integration/` when flows cross components.
12. **E2E** — `fe-e2e-testids` on list, dialogs, primary actions; update `docs/reference/e2e-testids-inventory.md`.
13. **Docs** — `docs/reference/routes-and-ui.md` + `<RESOURCE>.OVERVIEW.md`.

---

## List page ↔ URL pattern

```tsx
const pathname = useRouterState({ select: (s) => s.location.pathname });
const dialog = pathname.endsWith('/create')
  ? 'create'
  : pathname.endsWith('/edit')
    ? 'edit'
    : null;

return (
  <>
    <ResourceTable … />
    <CreateResourceDialog open={dialog === 'create'} … />
    <EditResourceDialog open={dialog === 'edit'} … />
  </>
);
```

Navigate with TanStack Router `Link` / `useNavigate` so refresh and deep links work.

---

## Promotion: dialog → full page

When create/edit outgrows the modal (>15 fields, wizard, uploads):

1. Keep the **same URL**
2. Replace dialog mount with sub-route `Component` rendering full `<X>Page.tsx`
3. No bookmark break

---

## Module + nav

When `manifest.module` is set, hide nav entries via `isModuleEnabled()` — gateway still 404s direct links.

---

## Anti-patterns

- Local `useState` for create/edit when the action must be shareable or refresh-safe
- `$id` param folder name
- Storing list data in Zustand (TanStack Query owns server state)
- Skipping `registerResource` when the resource appears in nav or command palette
- Page-to-page imports across families

---

## Verify

```bash
pnpm validate:structure
pnpm validate:testids
pnpm type-check
pnpm test -- --run src/pages/<resource-path>/
```

---

## Related

- Skills: `fe-route-island`, `fe-routing-tenancy`, `fe-http-forms-errors`, `fe-test-generation`, `fe-e2e-testids`
- Docs: `docs/reference/route-island-structure.md`, `docs/reference/frontend-platform.md`
