---
name: fe-env-schema-add
description: Walk through adding, renaming, or removing an env var safely in core-fe. Decides Secret vs Variable, picks the correct .env.example sub-section, keeps schema, template, validators, and GitHub Environments in sync. Use when src/core/config/env-schema.ts or .env.example changes.
---

# Env schema add (core-fe)

Use this skill whenever you **add, rename, or remove** an environment variable in core-fe.

Adding a key is **two aligned decisions**: its **classification** (GitHub Secret vs Variable) and — wherever a workflow consumes it — its **access context** (`secrets.NAME` vs `vars.NAME`).

## Core principle — one behavior, one variable

Each behavior is owned by **exactly one** env variable, and `platform-config.ts` reads that
variable **1:1** — no umbrella, alias, or `A || B` derived-from-another-flag logic:

```ts
// ✅ one key, read directly
devtools: resolveBooleanFlag(get('DEVTOOLS'), false),
// ❌ never — a second key silently overrides the first ("own value ignored")
devtools: resolveBooleanFlag(get('DEVTOOLS'), false) || testMode,
```

Never introduce a second variable that also drives a behavior another key already owns — two
keys for one thing means ambiguous precedence and two sources of truth. When several flags
must move together for a context (the test runner, a given deploy), set **each one's own key**
at the **env layer** — `plugins/test-env.ts`, `.env.<environment>`, or GitHub Environments —
not by combining them in code. Conditions live in env; code stays 1:1.

## The two-half rule

`.env.example` has exactly two top-level halves, marked by `# ###...###` banners:

```text
# ############################################################
# GitHub Secrets (Netlify / GitHub Actions — sensitive)
# ############################################################

# --- Build / deploy ---
SENTRY_AUTH_TOKEN=...

# ############################################################
# GitHub Variables (public or operational knobs)
# ############################################################

# --- API ---
VITE_API_BASE_URL=...
```

Every key sits under exactly one half. Sub-sections (`# --- Title ---`) group related keys.

## Decision tree — Secret or Variable

1. **Credential or signing material?** → **Secret** (`*_TOKEN`, `*_AUTH_TOKEN`, `SENTRY_AUTH_TOKEN`, …).
2. **Leak would grant unauthorized access?** → **Secret**.
3. **Public identifier or operational knob?** → **Variable** (`VITE_*` client flags, `NODE_VERSION`, `NETLIFY_SITE_ID`, public DSN/site keys).
4. **Still unsure?** → default **Secret**.

## FE-specific prefixes

| Prefix    | Where to add in schema              | Bundled to client? |
| --------- | ----------------------------------- | ------------------ |
| `VITE_*`  | `envSchemaBase` + `clientEnvSchema` | Yes                |
| `BUILD_*` | `envSchemaBase` only                | No (build plugins) |
| No prefix | `envSchemaBase` only                | No (CI/scripts)    |

**Platform-facing `VITE_*` keys** also need wiring in:

- `src/core/config/env-resolvers.ts` (if parsed/transformed)
- `src/core/config/platform-config.ts` (if exposed on `PlatformConfig`)
- `src/core/config/auth-methods.ts` (if auth surface)

## Checklist — add a key

1. **Schema** — add Zod field to `src/core/config/env-schema.ts`.
2. **Runtime** — wire `env.config.ts` / `platform-config.ts` if app reads it.
   - **Behavior flag?** Read it via `platformConfig` (never `import.meta.env.DEV/PROD/MODE`).
3. **Per-environment allowed values (strict) — MANDATORY for security/behaviour flags.**
   Any new (or newly-security-relevant existing) flag whose weakened value would loosen a
   guard MUST pin its production-safe value in `envProfiles.production.allowed` in
   `env-schema.ts`, so a production deploy setting the unsafe value **hard-fails**
   `pnpm validate:client-env` instead of silently weakening prod (e.g. diagnostics/devtools
   off, version-check on). Development may allow both values (`BOOL`) so typos still fail.
   Cover it in the `envProfiles allowed values (strict per-environment)` block of
   `env-schema.test.ts` (production pins the safe value). Doc/URL/tuning-only keys are exempt
   (the test is "does the wrong value weaken a security/behaviour guard"). Two deploy
   environments only: `development`, `production` (`local`/`test` modes are not deploy targets —
   no `envProfile` gates them). This mirrors core-be's Category-B `.refine()` rule.
4. **Template** — add to `.env.example` under correct half + sub-section; use `# OPTIONAL — <condition>` when conditionally required.
5. **Sync** — run `pnpm tool:sync-env-example --fix` then `pnpm tool:sync-env-example`.
6. **Types** — extend `src/vite-env.d.ts` for new `VITE_*` keys if needed.
7. **Tests** — colocated tests in `env-schema.test.ts`, `env-resolvers.test.ts`, or `platform-config.test.ts`.
8. **Docs** — update `docs/deployment/runbooks/environment-variables.md` if operator-facing.
9. **GitHub** — update local `.env.<environment>`; `pnpm github:sync <env> --dry-run`.
10. **PR** — include "Environment variable changes" block in description.

## Remove or rename a key

1. Remove from schema + all resolvers/consumers.
2. Remove from `.env.example`.
3. Run `pnpm tool:sync-env-example`.
4. Grep repo for old name; update workflows and docs.
5. Leave a release note if deploy envs must drop the old key.

## Auth vs modules (do not mix)

- **Auth** = individual `VITE_AUTH_*` booleans (never `VITE_DISABLED_MODULES`).
- **Modules** = `VITE_DISABLED_MODULES` comma list (`billing`, `members`, …).

## config.js contract

Runtime deploy overrides use `window.__CONFIG__` with keys **without** `VITE_` prefix. Document new public keys in `public/config.js` header comment when operators may override at deploy. See [csp-trusted-types-production.md](../../../docs/deployment/runbooks/csp-trusted-types-production.md) for SRI promotion.

## Netlify / GitHub Actions deploy

- **Build-time `VITE_*`:** set in GitHub Environment Variables/Secrets; GHA bakes them into `dist/` at build. Do not expect Netlify UI env to apply unless you build on Netlify (this repo does not).
- **Post-deploy override:** inject `public/config.js` with stripped key names (no `VITE_` prefix).
- **Sync hosted env:** `pnpm github:sync <environment>` after updating local `.env.<environment>`.

## Related

- Runbook: `docs/deployment/runbooks/environment-variables.md`
- Rule: `agent-os/rules/fe-env-schema-add-sync.mdc`
- Skill: `agent-os/skills/fe-platform-hygiene/SKILL.md` (validators + read paths)
- Platform config: `docs/reference/frontend-platform.md`
