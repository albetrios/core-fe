# Organization deployment modes — plan

How core-fe should adapt signup, sign-in, onboarding, routing, and the org
switcher when the backend deployment toggles **personal** and **team**
organizations independently.

> **Status:** Implemented (Phases 0–5). Deployment flags come from core-be `GET /auth/me/context`.
>
> **Implemented naming:** the proposed `capabilities` API shipped as
> `src/shared/tenancy/deployment-mode.ts` (pure `resolveDeploymentMode` /
> `isPersonalOnlyDeployment` / `shouldShowOrganizationSwitcher` …) plus the
> `useDeploymentFlags()` / `useDeploymentMode()` hooks in
> `src/shared/hooks/useDeploymentFlags/`. Read "capabilities" below as those.

---

## What “capabilities” means today (important)

There were **two different** `capabilities` shapes. The FE removed one; the
other is not wired yet.

| Shape                                               | Example fields                                                                                                                        | FE status                                                                                                                                                                                             |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Per-org capabilities** (on each `Organization`)   | `can_invite_members`, `can_manage_members`, `can_manage_billing`, …                                                                   | **Removed from FE** (core-be #795). Team-only UI is gated by `organization.type === 'TEAM'` via `useCan({ teamOrganizationOnly: true })` + `my_permissions` — not by probing org capability flags.    |
| **Deployment flags** (deployment-wide, not per org) | `personal_organizations`, `team_organizations` on the user; backend env `PERSONAL_ORGANIZATION_ENABLED` / `TEAM_ORGANIZATION_ENABLED` | **Wired** in `src/shared/tenancy/deployment-mode.ts` + `me-context.ts`. Parsed from nested `user.capabilities` with top-level fallback. Per-org `active_organization.capabilities` is **not** parsed. |

**Do not** reintroduce per-org `capabilities` parsing. **Do** add a small
deployment-mode layer for the two deployment toggles only (whatever the backend
exposes them as).

---

## Backend switches

| Env (core-be)                   | Intended wire signal                                            | When off                                                                                   |
| ------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `PERSONAL_ORGANIZATION_ENABLED` | `personal_organizations: false` (or equivalent top-level field) | No auto-provisioned personal org; no `switch-to-personal`; `personal_organization_id` null |
| `TEAM_ORGANIZATION_ENABLED`     | `team_organizations: false` (or equivalent)                     | No `POST /tenancy/organizations`; hide create-team UI; team routes 422 on personal org     |

Both flags may be `true` (default product), or exactly one may be `true`. Both
`false` is invalid for a usable deployment.

**Phase 0 (before coding):** confirm with core-be whether deployment flags still
live under `user.capabilities` or moved to top-level fields on `GET /auth/me/context`
— then lock the Zod wire schema. There is **no** frontend public config API for
deployment or auth toggles.

---

## Deployment matrix

| Mode               | `personal_organizations` | `team_organizations` | Product shape                                              |
| ------------------ | ------------------------ | -------------------- | ---------------------------------------------------------- |
| **Personal only**  | ✅                       | ❌                   | Single personal workspace per user; root URLs only         |
| **Team only**      | ❌                       | ✅                   | User must create/join a team org; slug URLs only           |
| **Both (default)** | ✅                       | ✅                   | Personal workspace + optional team orgs; dual-URL switcher |

---

## Frontend capability layer (new)

Introduce a single read-only module consumed everywhere — not scattered env checks.

**Suggested location:** `src/shared/tenancy/deployment-mode.ts` (implemented)

```ts
export type DeploymentCapabilities = {
  personalOrganizations: boolean;
  teamOrganizations: boolean;
};

export type DeploymentMode = 'personal-only' | 'team-only' | 'personal-and-team';

export function resolveDeploymentMode(caps: DeploymentCapabilities): DeploymentMode;
export function useDeploymentCapabilities(): DeploymentCapabilities;
```

**Data sources (priority):**

1. **`GET /auth/me/context`** — parse deployment flags from whatever shape
   core-be exposes on `user` (nested or top-level — confirm in Phase 0).
2. **`GET /users/me`** — fallback: `personal_organization_id` +
   deployment booleans if present on profile.
3. **Build-time defaults** — optional `VITE_*` mirrors for Storybook overrides; never override live API values in production.

**E2E matrix:** run Playwright with core-be toggling `PERSONAL_ORGANIZATION_ENABLED` /
`TEAM_ORGANIZATION_ENABLED` (scheduled workflow) or unit-test `deployment-mode.ts` with
fixture `me/context` payloads in colocated Vitest suites.

---

## Auth method switches (signup / sign-in options)

Separate but related: which **auth methods** appear on `/login` (email OTP,
OAuth providers). These are **deployment-level and env-only** on the frontend.

| Concern      | Source (FE)                   | FE behavior                                                                      |
| ------------ | ----------------------------- | -------------------------------------------------------------------------------- |
| Email OTP    | `VITE_AUTH_EMAIL`             | Hide email panel when `false`                                                    |
| OAuth Google | `VITE_AUTH_OAUTH_GOOGLE`      | Hide Google button; `/callback` still handles returns for enabled providers only |
| OAuth GitHub | `VITE_AUTH_OAUTH_GITHUB`      | Hide GitHub button                                                               |
| OAuth Apple  | `VITE_AUTH_OAUTH_APPLE`       | Hide Apple button (FE may ship before core-be credentials exist)                 |
| Passkey      | `VITE_AUTH_PASSKEY`           | Hide passkey button                                                              |
| Auto Google  | `VITE_AUTH_OAUTH_AUTO_GOOGLE` | Delayed Google redirect when Google OAuth enabled                                |

**Implemented:** `src/core/config/auth-methods.ts` + `useAuthMethods()`. Auth layouts
read one hook and render only enabled options. No runtime fetch from core-be for
provider lists. Disabled methods omit UI; misconfiguration shows an empty state on
`/login` with support guidance.

---

## Flow by deployment mode

> **Onboarding runs once for every mode.** Whether onboarding happens is driven by
> the backend `me/context.user.onboarding_completed` flag — **not** by whether the
> user has a workspace. So a fresh user in _any_ mode is routed to `/onboarding`
> first (even personal deployments, whose personal org is auto-provisioned at
> signup and would otherwise short-circuit to `/dashboard`). Only the wizard
> **steps** differ per mode; `resolveRootTarget` checks onboarding before any
> active-org routing, and the wizard's finish stamps the flag via
> `POST /users/me/onboarding/complete`.

### Personal only (`personal-only`)

| Area                 | Behavior                                                                                                                                       |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Signup / sign-in** | Standard auth; backend auto-provisions one PERSONAL org on account completion                                                                  |
| **Post-auth**        | Fresh user (`onboarding_completed: false`) → `/onboarding`; once onboarded → `/dashboard` (personal org is the active org)                     |
| **Onboarding**       | Runs; shows **welcome / profile / questions** only — skips **workspace** + **invite** steps (no team to create)                                |
| **Org switcher**     | **Hidden** — not in AppLayout, not in build-time chrome. User has one implicit workspace                                                       |
| **Create org**       | **Hidden** — no `CreateOrganizationDialog`, no `/create-organization` nav                                                                      |
| **URLs**             | Root space only (`/dashboard`, …). No `/organization/$slug` tree in nav; guard may still exist for deep links → 404 or redirect home           |
| **Settings**         | Billing under Account (`#settings/account/billing`). Of the Organization group only **Integrations** is shown — the api-key routes are organization-scope `both` on core-be and a personal owner holds `api-key:*`; the panel's webhooks half gates itself on `webhook:read`, which a personal owner does not hold. General / Members / Roles hidden via `sectionsForOrgType('PERSONAL')` |

### Team only (`team-only`)

| Area                 | Behavior                                                                                                                   |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Signup / sign-in** | Standard auth; **no** personal org auto-provision                                                                          |
| **Post-auth**        | Fresh user (`onboarding_completed: false`) → `/onboarding`; once onboarded → active team slug, else `/organization` picker |
| **Onboarding**       | Runs; **required** workspace step — user creates their first TEAM org (name + slug). Invite step included                  |
| **Org switcher**     | Lists **team orgs only** (no Personal section). “Create organization” when allowed                                         |
| **Create org**       | Available (creates TEAM via `POST /tenancy/organizations`)                                                                 |
| **URLs**             | Slug space only (`/organization/$slug/dashboard`, …). Root `/dashboard` redirects into active team slug or onboarding      |
| **Personal flows**   | Hide `switchToPersonal()`, personal section in switcher, any “Personal workspace” copy                                     |

### Both (`personal-and-team`) — current target shape

| Area                 | Behavior                                                                                                                                                        |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Signup / sign-in** | Standard auth; backend auto-provisions **personal workspace** (“Personal” / user name)                                                                          |
| **Post-auth**        | Fresh user (`onboarding_completed: false`) → `/onboarding`; once onboarded, default active org = personal → root `/dashboard`; user may create/join teams       |
| **Onboarding**       | Runs; shows **welcome / profile / questions** (personal workspace auto-provisioned, so **no** workspace-create step); teams are created later from the switcher |
| **Org switcher**     | Personal section + Organizations section + Create team                                                                                                          |
| **URLs**             | Dual-URL: PERSONAL → root; TEAM → `/organization/$slug/…` (existing `resolveRootTarget`)                                                                        |

---

## Resolver & guards (changes)

| Component                                   | Change                                                                                                                                                                                    |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `resolveRootTarget` / `resolveRootRedirect` | **Onboarding first** (`!user.onboarding_completed` → `/onboarding`) for every mode; only then branch on `deploymentMode` + active org (personal → `/dashboard`, team → slug, else picker) |
| `$organizationSlug` org guard               | Team-only: reject/missing personal deep links. Personal-only: slug routes → redirect `/dashboard` or 404                                                                                  |
| `OrganizationSwitcher`                      | Render `null` when `personal-only`; omit personal section when `team-only`; full UI when both                                                                                             |
| `useCan({ teamOrganizationOnly: true })`    | Already uses `organizationType === 'TEAM'` — keep this; AND with deployment `teamOrganizations` flag for create-team entry points                                                         |
| Route manifests                             | Optional `requiresTeamOrganizations: true` alongside `permission` — not a revival of per-org capabilities                                                                                 |

---

## Onboarding step matrix

| Step      | Personal only     | Team only                | Both                                                    |
| --------- | ----------------- | ------------------------ | ------------------------------------------------------- |
| welcome   | ✅                | ✅                       | ✅                                                      |
| profile   | ✅                | ✅                       | ✅                                                      |
| questions | ✅ (optional)     | ✅ (optional)            | ✅ (optional)                                           |
| workspace | ❌ skip           | ✅ **required**          | ❌ skip (personal auto-provisioned; teams via switcher) |
| invite    | ❌ skip           | ✅ optional              | ✅ only when a team org is already active               |
| done      | ✅ → `/dashboard` | ✅ → team slug dashboard | ✅ → resolver target                                    |

Implement via `useOnboardingStore` step list derived from `deploymentMode` +
`me/context` (has personal org? has any team org?).

---

## Build-time vs runtime

| Flag                | Runtime (API)                        | Build-time (optional override)                                     |
| ------------------- | ------------------------------------ | ------------------------------------------------------------------ |
| Org mode            | **Always** from `me/context`         | `VITE_PERSONAL_ORGANIZATIONS` / `VITE_TEAM_ORGANIZATIONS` when set |
| Auth methods        | **Not from API** — env-only on FE    | `VITE_AUTH_*` per method / OAuth provider                          |
| Org switcher chrome | Hidden at runtime when personal-only | Tree-shaking not required — conditional render is enough           |

Do **not** fork separate production builds per mode unless product explicitly
requires it; one bundle reading runtime capabilities is simpler and matches
backend deployment toggles.

---

## Implementation phases

### Phase 1 — Deployment plumbing

- Confirm wire shape with core-be (Phase 0)
- Extend `meContextWire` / `MeContext` with deployment flags + `personalOrganizationId` (not per-org capabilities)
- Add `deployment-mode.ts` + `useDeploymentFlags()` / `useDeploymentMode()` (`src/shared/hooks/useDeploymentFlags/`)
- Mock fixtures for three modes
- Unit tests for `resolveDeploymentMode`

### Phase 2 — Gating surfaces (FE-XX)

- `OrganizationSwitcher`: conditional sections + hide entirely in personal-only
- `AppLayout`: omit switcher slot when hidden
- `useCan` / settings sections / nav: AND `teamOrganizations` flag
- `CreateOrganizationDialog` entry points: team-only + both

### Phase 3 — Onboarding & resolver (FE-XX)

- Dynamic `ONBOARDING_STEPS` from mode + context
- `OnboardingPage.finish()`: team-only creates TEAM; both skips create when personal exists
- Update `resolveRootTarget` for team-only (no personal shortcut)

### Phase 4 — Auth method toggles (FE-XX)

- `useAuthMethods()` + `/login` / callback UI trim
- Docs + `.env.example` for any `VITE_*` auth flags

### Phase 5 — E2E matrix (FE-XX)

- Playwright tagged tests: `@personal-only`, `@team-only`, `@both`
- core-be env toggles per mode (`PERSONAL_ORGANIZATION_ENABLED`, `TEAM_ORGANIZATION_ENABLED`)

---

## Files likely touched

| File                                          | Purpose                           |
| --------------------------------------------- | --------------------------------- |
| `src/shared/tenancy/me-context.ts`            | Wire + domain capabilities        |
| `src/shared/tenancy/deployment-mode.ts`       | Mode resolution + hook            |
| `src/shared/tenancy/organization-resolver.ts` | Root resolver branches            |
| `src/shared/components/OrganizationSwitcher/` | Conditional UI                    |
| `src/shared/layouts/AppLayout/`               | Switcher slot                     |
| `src/pages/onboarding/`                       | Dynamic steps + finish logic      |
| `src/shared/store/useOnboardingStore/`        | Step list derivation              |
| `src/pages/login/`                            | Auth method visibility            |
| `src/core/config/env.ts`                      | Optional auth method env          |
| `src/app/guards/`                             | Slug guard + capability deny      |
| `docs/reference/routing-and-tenancy.md`       | Normative update when implemented |

---

## Acceptance criteria (when implemented)

1. With core-be `personal_organizations: true`, `team_organizations: false` — no
   org switcher, no create-team, onboarding skips workspace, `/` → `/dashboard`.
2. With core-be `personal_organizations: false`, `team_organizations: true` — no
   personal section, onboarding requires workspace create, `/` with no org →
   `/onboarding`.
3. With both `true` — current dual-URL behavior preserved; personal auto-created
   on signup; switcher shows both sections.
4. Disabled auth methods never render on `/login`; enabled methods work
   end-to-end.
5. `pnpm health` green; colocated tests for capability module, resolver, switcher,
   and onboarding step derivation.

---

## Related docs

- [routing-and-tenancy.md](../reference/routing-and-tenancy.md) — dual-URL spec
- [credentials-and-env.md](../integrations/credentials-and-env.md) — credential sources
- [environment-variables.md](../deployment/runbooks/environment-variables.md) — env schema, auth switches, deploy overrides
- [frontend-platform.md](../reference/frontend-platform.md) — platform kernel (session context, modules, gateway)
