# `pages/organization/$organizationSlug/suspended` — Suspended organization

Route: `/organization/$organizationSlug/suspended`. Blocked state rendered when
`requireActiveOrganization` finds the organization suspended / subscription lapsed.
Offers switching organization via the picker.

Guarded by `requireSuspendedOrgStatus`, the inverse of the guard that sends users
here: an organization that is **not** suspended is redirected to its dashboard
rather than shown this page. The route stays outside `requireOrgStatus` so a
suspended organization can render without looping, and the inverse guard keeps
that exemption from meaning "unguarded in both directions".

## Files

| File                    | Responsibility                                                |
| ----------------------- | ------------------------------------------------------------- |
| `suspended.route.tsx`   | Route marker — exports `Component` rendering `SuspendedPage`. |
| `suspended.manifest.ts` | Manifest — `kind: 'leaf'`, no permission.                     |
| `SuspendedPage.tsx`     | Blocked-state UI. Owns `data-testid="suspended-page"`.        |
