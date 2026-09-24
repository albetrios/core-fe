# `src/shared/api/`

Cross-page API helpers and domain schemas. Files here are imported by both `src/pages/*` and `src/shared/components/*`, so they must live outside both layers.

All fetchers call **core-be over HTTP** via `apiClient` (or raw `authFetch` for auth). Local dev proxies `/api` to `VITE_DEV_API_URL` (default `http://localhost:3000`). Test fixtures live under `tests/fixtures/` only.

## Files

| File                                 | What it holds                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth-contracts.ts`                  | Zod schemas for auth — MFA/reset/verify inputs, shared by `pages/mfa`, `auth-api`, …                                                                                                                                                                                                                                                                                                                             |
| `auth-api.ts` (+ .test)              | Auth fetchers (login, register, forgot/reset password, verify email, MFA). Raw `fetch`, not `apiClient`, to avoid interceptor recursion                                                                                                                                                                                                                                                                          |
| `organization-contracts.ts`          | Zod schemas for org-domain entities — `Member`, `MemberInvitation`, `OrgRole`, `RoleSummary`, `ApiKey`, `Plan`, `Subscription`                                                                                                                                                                                                                                                                                   |
| `organization-api.ts`                | Fetcher functions for org-domain resources (members, invitations, roles, api-keys, billing) — will shrink as resource pages adopt `useList<T>()` etc.                                                                                                                                                                                                                                                            |
| `uploads-api.ts` (+ .test)           | The storage flow core-be requires before a file can be attached: `POST /uploads` (presign) → raw `fetch` of the bytes to storage → `POST /uploads/:id/confirm`. Returns the FINAL key the attach routes want. The storage write is the one call that deliberately bypasses `apiClient` — it leaves the API origin, and `isApiOriginUrl` refuses to send the bearer token there                                   |
| `organization-logo-api.ts` (+ .test) | `uploadOrganizationLogo` / `removeOrganizationLogo` — the uploads flow, then `PUT` / `DELETE` on `/tenancy/organization/logo`. Deliberately NOT in `organization-api.ts`: that module is reachable from the entry chunk (`shared/tenancy/organization-membership.ts` resolves the active organization on boot), so importing the uploads client there put it on the first-paint graph and tipped the size budget |
| `notifications-api.ts`               | Notification inbox + preference fetchers                                                                                                                                                                                                                                                                                                                                                                         |
| `notification-contracts.ts`          | Zod schemas for notifications                                                                                                                                                                                                                                                                                                                                                                                    |

Organization/tenancy infrastructure (`my-organizations.ts`, `tenancy-service.ts`,
organization context/membership/resolver) lives in **`src/shared/tenancy/`** — see
`src/shared/tenancy/TENANCY.OVERVIEW.md`.

## Why this exists

Per the dependency rule:

- `shared/components/SettingsModal/organization/OrganizationMembersPanel.tsx` imports `Member` from `organization-contracts.ts`
- a future `pages/organization/$organizationSlug/members/` island also imports `Member`

If the schemas lived in `pages/`, shared components would import from pages (forbidden). If they lived in `shared/components/`, they'd be coupled to a specific component. **`shared/api/` is the cross-layer home for files reached by both `shared/*` and `pages/*`.**

## Boundary with other layers

- **`shared/api/` ≠ `core/`** — core holds framework-agnostic _platform_ services (auth, http, rbac). shared/api holds _domain_ helpers (org members, tenancy bootstrap).
- **`shared/api/` ≠ `shared/hooks/`** — hooks call these api files; they're not the same thing.
- **`shared/api/` ≠ `shared/store/`** — store is Zustand state; api is fetcher functions + schemas.

## What's coming

When resource pages are rewritten to use `useList<Member>('members')`, `useCreate<RoleSummary>('roles')`, etc. (the shared CRUD hooks), `organization-api.ts` shrinks dramatically — most of its functions disappear, leaving only special-case operations (`getMyPermissions`, `acceptInvitation`).
