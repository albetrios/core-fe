# Routing & Tenancy — spec

**Status: ratified AND implemented 2026-06-11** (phases 0–2: rename sweep, URL-based tenancy +
guards + picker/shell/suspended islands, hash settings modal). Phase 3 — domain islands
(patients, appointments, billing, reports) — is product work scaffolded against these rules
when requirements land. `agent-os/rules/file-structure.mdc` and CLAUDE.md reflect this spec.

---

## 1. Vocabulary — full words only

| Context                                    | Term                                                                                                                                                                      |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| URLs, folders, components, prose           | `organization` (never `org`, `tenant`, `workspace`, `clinic`)                                                                                                             |
| Route param                                | `$organizationSlug` / `params.organizationSlug` (never `orgId`)                                                                                                           |
| Public ID prefix (wire data, Stripe-style) | `org_` — compact prefixes are data format, not names (`org_8fK2x`, `pat_x9Q2m`, `apt_…`, `inv_…`, `usr_…`)                                                                |
| Infra layer term                           | `tenancy` is allowed **only** as the infrastructure module name (`shared/tenancy/`) — it is the industry term for the mechanism; everything user-facing says organization |

All identifiers use full words: `organizationId`, `OrganizationPublicId`, `useOrganizationStore`.
Public ID suffixes must be **random** (`org_8fK2x`), never sequential (`pat_123` leaks patient
volume — a real concern for a clinic app). Internal DB ids never appear in URLs.

## 2. URL scheme

```text
/organization                                                    organization picker
/organization/$organizationSlug/dashboard
/organization/$organizationSlug/patients
/organization/$organizationSlug/patients/$patientId
/organization/$organizationSlug/patients/$patientId/appointments/$appointmentId
/organization/$organizationSlug/appointments                      org-wide calendar (list only)
/organization/$organizationSlug/billing/invoices/$invoiceId
/organization/$organizationSlug/reports
/organization/$organizationSlug/suspended                         blocked-state page (status guard target)
```

- **Do not use:** `/o/…`, `/org/…`, `/app/…`, session-based organization, query-param organization.
- **Canonical-URL rule:** every resource has exactly one detail URL. Appointment detail lives
  **only** under `patients/$patientId/appointments/$appointmentId`; the org-wide appointments list
  links into it. Never add a second detail URL for the same resource.
- **`/` (root):** a resolver route — reads `me/context` and redirects. **Onboarding first:**
  a not-yet-onboarded user (`!user.onboarding_completed`) → `/onboarding` in every deployment
  mode (even personal, whose org is auto-provisioned). Once onboarded: PERSONAL → root
  `/dashboard`, TEAM → `/organization/$organizationSlug/dashboard`, else `/organization` picker.
  Dual-URL: the personal org lives on root URLs (no org param), the team org on its
  `$organizationSlug/` space. The shared `<Dashboard/>` renders in both; `/` keeps no UI.
- Auth islands (`/login`, `/mfa`, `/callback`, …), `/onboarding`, `/accept-invite/$invitationId`
  stay top-level, unchanged.

## 3. Pages tree (mirrors URLs, direct nesting)

`sub-pages/` is **retired** when this lands: children nest directly, because the URL has no
"sub-pages" segment and the mirror must be literal. "Everything between two `*.route.tsx` files
belongs to the parent" still holds.

> **Built today:** only `dashboard/` and `suspended/` exist under `$organizationSlug/`.
> The `patients/`, `appointments/`, `billing/`, and `reports/` islands below are the **Phase 3
> shapes** (planned, not on disk) — scaffold them against these rules when requirements land.

```text
src/pages/
├── login/ … mfa/ … callback/ …      (auth-shell islands)
├── onboarding/        accept-invite/
└── organization/
    ├── ORGANIZATION.OVERVIEW.md
    ├── organization.route.tsx                   ← /organization (picker)
    ├── organization.manifest.ts
    ├── OrganizationPickerPage.tsx
    └── $organizationSlug/
        ├── ORGANIZATION_SLUG.OVERVIEW.md
        ├── organization-slug.route.tsx            ← layout boundary; org guards in beforeLoad/loader
        ├── organization-slug.manifest.ts              kind: 'layout', children: [...]
        ├── OrganizationLayout.tsx               shell UI + <Outlet />
        ├── dashboard/                           4-file island
        ├── patients/
        │   ├── PATIENTS.OVERVIEW.md
        │   ├── patients.route.tsx  patients.manifest.ts  PatientsPage.tsx
        │   └── $patientId/
        │       ├── PATIENT_ID.OVERVIEW.md
        │       ├── patient-id.route.tsx  patient-id.manifest.ts  PatientDetailPage.tsx
        │       └── appointments/
        │           ├── APPOINTMENTS.OVERVIEW.md
        │           ├── appointments.route.tsx  appointments.manifest.ts  AppointmentsPage.tsx
        │           └── $appointmentId/
        │               ├── APPOINTMENT_ID.OVERVIEW.md
        │               ├── appointment-id.route.tsx  appointment-id.manifest.ts
        │               └── AppointmentDetailPage.tsx
        ├── appointments/                        org-wide list (4-file island)
        ├── billing/
        │   ├── BILLING.OVERVIEW.md
        │   ├── billing.route.tsx  billing.manifest.ts  BillingLayout.tsx
        │   └── invoices/
        │       ├── INVOICES.OVERVIEW.md
        │       ├── invoices.route.tsx  invoices.manifest.ts  InvoicesPage.tsx
        │       └── $invoiceId/
        │           ├── INVOICE_ID.OVERVIEW.md
        │           ├── invoice-id.route.tsx  invoice-id.manifest.ts  InvoiceDetailPage.tsx
        ├── reports/                             4-file island
        └── suspended/                           4-file island (status-guard target)
```

### Naming rules (validator-enforced)

1. **Prefix = directory name.** `patients/` → `patients.route.tsx`, `PATIENTS.OVERVIEW.md`.
2. **`$param` folders strip the `$` and kebab-case the param**: `$organizationSlug/` →
   `organization-slug.route.tsx`, `organization-slug.manifest.ts`, `ORGANIZATION_SLUG.OVERVIEW.md`.
   The filename is mechanically derivable from the URL; param names are full words, so derived
   names are too. The UI file alone stays human-named (`PatientDetailPage.tsx`,
   `OrganizationLayout.tsx`) — the validator only requires `*Page.tsx | *Layout.tsx`.
3. **Reserved segment names:** `components`, `hooks`, `forms`, `dialogs`, `store`, `__tests__`
   can never be URL segments / route folders, and a folder with one of those names never contains
   a `*.route.tsx`.
4. **Duplicate prefixes** are allowed only when the same URL segment legitimately repeats at
   different depths (the two `appointments/` islands). The validator reports them as a notice —
   the full path disambiguates. Avoidable collisions (parent/child like
   `organization`/`organization-id`) are designed out by rule 2.
5. **Every URL folder keeps the same 4-file contract** — `<prefix>.route.tsx`, `<prefix>.manifest.ts`,
   `<Page>Page.tsx | <Page>Layout.tsx`, `<PREFIX>.OVERVIEW.md` — plus optional page-prefixed
   role files (`<prefix>.api.ts`, `<prefix>.contracts.ts`, `<prefix>.search.ts`, `<prefix>.fixtures.ts`)
   and unit folders. **There is no `*.layout.tsx` role file**: checks live in `beforeLoad`/`loader`
   inside `<prefix>.route.tsx`; shared section UI is the island's `<Page>Layout.tsx`
   (`kind: 'layout'` in the manifest).
6. **Promotion ladder:** one page → inside the page; the page + its OWN nested children →
   `pages/<parent>/shared/` (family-shared; importable only down that subtree); different
   families or any `src/shared` component → root `src/shared/`. `shared` is a reserved URL
   segment.
7. **No `features/` layer.** Cross-island domain code lives in `shared/` (`shared/api/`,
   `shared/tenancy/`); introduce a new layer only with explicit import rules if cross-island
   domain UI actually emerges.

## 4. Organization context — URL is the single source of truth

- Inside `/organization/$organizationSlug/*`, **`params.organizationSlug` is canonical**.
- `useOrganizationStore` is a **derived cache synced from the route** —
  never the other way around. The `/` resolver picks its redirect target from me/context
  (the active organization); a subdomain, when present, only seeds a boot-time store
  fallback (`resolveOrganizationFromSubdomain`). localStorage plays no role in organization
  context.
- Multi-tab correctness follows automatically: each tab's URL carries its own organization.
- **Permissions are per-organization**: the `$organizationSlug` boundary refetches
  memberships/permissions whenever the param changes (today's once-if-empty bootstrap is not
  enough — switching organizations must invalidate).

## 5. Guards — composable `beforeLoad`/`loader` functions

`src/app/guards/` exports **functions** (`.ts`), not wrapper components (component guards cause
render-then-redirect flicker). Thin components like the existing `RBACGuard` remain only for
in-page gating.

Implemented chain for `/organization/acme/…` (shell guards on `$organizationSlug`, then leaf guards):

1. `requireAuth` (`core/rbac/guards.ts`) — logged in? → else redirect `/login` (carry `returnTo`)
2. `requireTeamDeployment` + `requireProvisionedWorkspace` (`app/guards/org-gates.ts`) — deployment
   mode allows the team space and the workspace is provisioned
3. `resolveActiveOrg` / `requireOrganizationContext` (`app/guards/route-guards.ts`) — slug is
   well-formed; user is a member; switch-on-navigation syncs context → else **404** (don't leak existence)
4. `gatewayFromManifest(manifest)` (`core/security/gateway.ts`) — on the **leaf** route:
   session → module (`requireModuleGate`) → permission (`requirePermissionGate`,
   `manifest.permission`) → else **403** `/unauthorized`
5. `requireOrgStatus` (`app/guards/route-guards.ts`) — runs **after** the gateway on the leaf:
   active / subscription valid → else `…/suspended`
6. **Resource scope is NOT a frontend guard** — the route loader's data fetch _is_ the check:
   the API returns the resource scoped to the organization (and parent resource), and a
   standardized error mapping turns API 404/403 into the NotFound/Unauthorized islands.
   One fetch, no guard-then-fetch waterfall.

Frontend guards are UX only; the backend/RLS enforces authority.

## 6. Tenancy module — `src/shared/tenancy/` (not core)

`core/` stays the app-state-free kernel (`file-structure.mdc` rule). Tenancy needs the Zustand
store, organization APIs, and storage — so it lives in `shared/`, exactly like `shared/auth/`:

```text
src/shared/tenancy/
├── TENANCY.OVERVIEW.md            (+ FLOWS / PATTERNS / POLICIES docs)
├── organization-context.ts        read canonical organization from route → sync store
├── organization-resolver.ts       "/" resolver logic (me/context → my-organizations → onboarding)
├── organization-membership.ts     membership + per-organization permission loading
├── deployment-mode.ts             personal/team deployment-mode model (two flags → three modes)
├── me-context.ts                  GET /auth/me/context schema + query
├── session-context.ts             session hydrate/invalidate
├── switch.ts                      /auth/switch-to-organization (token re-mint, generation guard)
├── tenancy-service.ts             (moved from shared/api/)
└── my-organizations.ts            (moved from shared/api/my-orgs.ts)
```

Slug parsing lives in `lib/routes/params.ts` (`parseOrganizationSlugParam`), not in this module;
contracts are colocated per file (there is no `tenancy-contracts.ts`).

## 7. Settings — one global modal, hash-based

Hash state (`#settings/<scope>/<section>`) replaces the current `/settings/*` chrome routes,
because the modal must overlay **any** page — including deep organization URLs — without
unmounting it (a path change re-runs route matching; a hash change does not). Copy-link
reproduces page + modal, refresh survives, back/Esc closes.

```text
#settings/account/{profile|account|security|notifications|sessions|billing}
#settings/organization/{general|members|roles|integrations}
```

(Source of truth: `settings-sections.ts`. Billing is an **account** section; an
`#settings/organization/billing` hash is not a valid organization section, so
`parseSettingsHash` resolves it to the default (`account/profile`). Appearance is not a
settings section: it is the separate `AppearanceDialog` on the root route.)

- Invalid hash → fall back to `#settings/account/profile` (or close). The fallback is
  **written back to the URL**, so it is only decided once the modal has both answers:
  me/context (which sections exist) **and** the permission set (`useAccessResolved()`).
  Entering an organization clears the store's permissions a beat before the real set
  lands, and an empty _unresolved_ list means "not known yet" — reading it as "not allowed"
  rewrote a valid organization deep link to `account/profile` for good. If me/context settled
  without data there is nothing to derive permissions from, and the modal does not wait.
- **Same-route navigation must state the hash.** The router resolves an _omitted_ `hash` to
  none, so `navigate({ to: '.', search, replace: true })` also closes this modal. Use
  `hash: true` (keep) or `hash: ''` (clear on purpose) — ESLint rejects a same-route
  `navigate()` with neither. Stripe's return params are cleared through
  `stripeReturnCleanupNavigation()` (`lib/billing/stripe-return.ts`).
- Organization scope requires organization context + permission (`settings-permissions.ts`,
  reusing `core/rbac` policies — never forked); outside an organization → "Select organization
  first" / redirect to `/organization`.
- **Route guards never see hashes** — all gating lives inside the modal.
- **Analytics are hash-blind** — fire an explicit PostHog event on open/section change.
- Lives in `src/shared/components/SettingsModal/`, with `settings-hash-grammar.ts`
  (the **dependency-free** hash grammar — `settingsHash` / `isSettingsHash` etc. — kept
  free of runtime imports so entry-resident shell callers don't drag the section registry
  onto first paint) + `settings-hash.ts` (registry-dependent `parseSettingsHash`) +
  `settings-sections.ts` + `settings-permissions.ts`, and panels as **flat files** under
  `account/` + `organization/` (the one sanctioned cohesive flat group —
  exempt from folder-per-unit; see file-structure.mdc).
- **Migration:** delete the 8 inline `/settings/*` routes in `routeTree.tsx`; update the
  "Chrome routes" section in `file-structure.mdc` to describe hash-modal chrome.
- **Escape hatch:** members / roles / billing / integrations may later be promoted to real pages
  (they are table-heavy admin surfaces — expect it). When promoted, keep a
  `#settings/organization/members` → path redirect shim so old links survive.

## 8. IDs and route params

- Branded public-ID types in `core/types/branded.ts` (pure) — `OrganizationPublicId`,
  `PatientPublicId`, `AppointmentPublicId`, `InvoicePublicId`, `UserPublicId`.
- Route params are validated **at the loader boundary** with Zod schemas
  (`lib/routes/params.ts`): malformed param → 404 immediately, before any fetch.

## 9. Route builders — `src/lib/routes/`

```text
src/lib/routes/
├── params.ts        Zod param schemas + parsers (incl. parseOrganizationSlugParam)
├── builders.ts      organizationDashboard(organizationSlug), … (path constants live here — no paths.ts)
├── page-head.ts     manifestHead(manifest) → document title
├── page-manifest.ts manifest types/helpers
└── index.ts
```

Builders return **`{ to, params }` objects consumed by TanStack's typed `Link`/`navigate`** —
not hand-built strings — so the router's type safety stays intact. Raw-string variants only
where the router isn't available (e2e helpers). No hand-built route strings anywhere in app code.

## 10. Rename inventory (full-name sweep over existing code)

Executed as phase 0 of the epic:

| Today                                                         | Becomes                                                                                |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `useOrganizationStore` (`shared/store/useOrganizationStore/`) | `useOrganizationStore` (+ eslint runtime-trio config + `file-structure.mdc` trio text) |
| `OrgPermission` (`core/types/permissions.ts`)                 | `OrganizationPermission`                                                               |
| `shared/api/my-orgs.ts`                                       | `shared/tenancy/my-organizations.ts`                                                   |
| `OrgSwitcher`, `OrgBadges` (`shared/components/`)             | `OrganizationSwitcher`, `OrganizationBadges`                                           |
| `TENANT.*` constants                                          | `ORGANIZATION.*` constants                                                             |
| Settings section id `org-general`                             | scope `organization`, section `general`                                                |

## 11. Phased migration

0. **Rename sweep** (table above) — mechanical, independently verifiable.
1. **Tenancy + URL**: `shared/tenancy/`, `/` resolver, guard functions, `/organization` picker,
   `$organizationSlug` layout island, move dashboard under it, update e2e + every `navigate({ to: '/' })`.
2. **Settings**: hash modal replaces `/settings/*` chrome routes.
3. **Domain islands**: patients / appointments / billing / reports (product work, scaffolded by
   the page-scaffolding skill under the rules above).

## 12. Decision summary

| Decision             | Choice                                                                                    |
| -------------------- | ----------------------------------------------------------------------------------------- |
| Organization URL     | `/organization/$organizationSlug/…`, public IDs only                                      |
| Param naming         | full words: `$organizationSlug`, `$patientId`, `$appointmentId`, `$invoiceId`             |
| Pages layout         | mirrors URLs; `$param` folders; direct nesting (no `sub-pages/`)                          |
| `$param` file naming | strip `$`, kebab-case: `organization-slug.route.tsx`, `ORGANIZATION_SLUG.OVERVIEW.md`     |
| Per-island contract  | 4 files + optional prefixed role files; no `*.layout.tsx`                                 |
| Settings             | one global modal, `#settings/<scope>/<section>`, in `shared/components/SettingsModal/`    |
| Tenancy              | `src/shared/tenancy/` (kernel stays pure); URL is the source of truth                     |
| Guards               | composable `beforeLoad` chain; resource scope = loader fetch + error mapping              |
| Route strings        | `lib/routes/` builders returning `{ to, params }`                                         |
| Not used             | `/o`, `/org`, `/app`, session/query-param organization, settings pages, `features/` layer |
