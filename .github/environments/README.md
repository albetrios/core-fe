# GitHub Environments (IaC)

Committed JSON under this directory describes **GitHub Environment protection**
(reviewers, deployment branch policy). Deploy **secrets** live in GitHub
Environments and are synced from gitignored `.env.development` /
`.env.production` at the repo root.

## Mapping

Single-trunk model — one branch (`main`) drives both environments by **purpose**,
not by branch:

| Trigger                        | GitHub Environment | Deploy                | Local secrets file |
| ------------------------------ | ------------------ | --------------------- | ------------------ |
| src-path push to `main`        | `development`      | `--alias development` | `.env.development` |
| a release (`vX.Y.Z`) on `main` | `production`       | `--prod`              | `.env.production`  |

Canonical manifest: [`tooling/setup/setup.config.json`](../../tooling/setup/setup.config.json).

## Required deploy secrets

These must be present or post-merge Netlify deploy **fails** (no silent skip):

- `VITE_API_BASE_URL`
- `NETLIFY_AUTH_TOKEN`
- `NETLIFY_SITE_ID`

Optional (warn only): `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST`, `VITE_PRIVACY_POLICY_URL`,
`VITE_TURNSTILE_SITE_KEY` (required by the production **client-env profile** unless
`VITE_CAPTCHA_DISABLED=true`), `VITE_CSP_REPORT_URI`, and the Sentry keys —
`VITE_SENTRY_DSN` (client reporting) plus build-time `SENTRY_AUTH_TOKEN` /
`SENTRY_ORG` / `SENTRY_PROJECT` (source-map upload; the deploy build activates the
upload plugin only when the token is set).

## GitHub Variables (per environment)

Non-secret deploy knobs are GitHub **Variables** on the same environments, read by
the deploy/preview workflows via `${{ vars.* }}` and validated against
`envProfiles.<env>.allowed` (`src/core/config/env-schema.ts`). They are **managed by
`pnpm github:sync`** from the gitignored `.env.<environment>` files — the managed set is
`deployVariables` in [`tooling/setup/setup.config.json`](../../tooling/setup/setup.config.json)
(aligned to the `vars.*` reads in the deploy workflow). Unlike secrets, variables are
**diffed**: a variable is pushed only when missing or changed, and one whose value equals
its **runtime schema default** (the env-independent Zod fallback) is **not pushed and is
pruned** — the runtime falls back to the identical default. Preview an environment with
`pnpm github:sync <env> --diff`; pass `--keep-schema-defaults` to push default-valued
variables verbatim. Full key catalog (kind, default, description):
[`docs/reference/env-catalog.md`](../../docs/reference/env-catalog.md) (`pnpm env:catalog`).

| Variable                               | development          | production           |
| -------------------------------------- | -------------------- | -------------------- |
| `VITE_CAPTCHA_DISABLED`                | `false`              | per captcha rollout  |
| `VITE_DEBUG_LOGGING` / `VITE_DEVTOOLS` | `true` (diagnostics) | `false` (enforced)   |
| `VITE_E2E_HOOKS`                       | `false`              | `false` (enforced)   |
| `VITE_VERSION_CHECK`                   | `true`               | `true` (enforced)    |
| `VITE_SENTRY_*_SAMPLE_RATE` (4 keys)   | optional             | optional             |
| `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24`   | repo-level, optional | repo-level, optional |

An unset variable falls back to the runtime schema default at build time; `VITE_APP_ENV`
is **not** a managed variable — the workflows derive it from the resolved environment
name. `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` is a **repository-level** variable (not
per-environment), so it stays hand-managed.

## Secret placement (repository vs environment)

A secret's **scope must match how the job that reads it is triggered**:

| A secret read by a job that…   | Scope           | Managed by                                                |
| ------------------------------ | --------------- | --------------------------------------------------------- |
| declares `environment: <name>` | **Environment** | `pnpm github:sync` (from `.env.<environment>`)            |
| declares **no** `environment:` | **Repository**  | **manual** — `gh secret set <NAME> --repo …` (no `--env`) |

Deploy/build values (`NETLIFY_*`, `VITE_*`) are read by the environment-gated
deploy job → **environment secrets** (github:sync uploads them).

**There are no repository secrets.** `RELEASE_PLEASE_TOKEN` is an **environment
secret on `development`**, read by `release-please` (post-merge-ci), the
`pat-canary` (scheduled-release-guards), and `dependabot-auto-merge`. All three
jobs therefore declare `environment: development`:

```bash
gh secret set RELEASE_PLEASE_TOKEN --env development --repo nikunjmavani/core-fe
```

Use a fine-grained PAT scoped to this repo (Contents + Pull requests + Workflows,
read/write). `github:sync` reconciles deploy values from `.env.<environment>` and
leaves **unmanaged keys untouched**, so a hand-added `RELEASE_PLEASE_TOKEN` on
`development` survives a sync.

> **`development`, never `production`.** These three are automation jobs, not
> deploys. `development` has an empty `protection` block, so selecting it grants
> secret access without gating anything. `production` carries `requiredReviewers`
> and a `protectedBranches` deployment policy — selecting it would pause
> post-merge CI for approval on every merge to `main`, and would reject
> `dependabot-auto-merge` outright (it runs on unprotected PR branches).
>
> **Consequence to keep in mind:** adding _any_ protection rule to `development`
> now silently blocks all three automation jobs. Pinned by
> `tests/ci/post-merge-ci.policy.test.ts`, `tests/ci/dependabot-flows.policy.test.ts`,
> and `tests/ci/release-guards.policy.test.ts`.

## Commands

| Command                                   | Purpose                                                                                  |
| ----------------------------------------- | ---------------------------------------------------------------------------------------- |
| `pnpm github:sync`                        | Scaffold `.env.*`, sync rulesets, ensure env shells, push secrets + diff/prune variables |
| `pnpm github:sync --check`                | Read-only drift (rulesets, shells, protection, secrets + variables) — fails on any       |
| `pnpm github:sync <env> --diff`           | Per-variable table: schema default vs local vs remote vs decision (read-only)            |
| `pnpm github:sync --dry-run`              | Preview the local-side values plan, no writes (no GitHub query)                          |
| `pnpm github:sync --keep-schema-defaults` | Push variables equal to their schema default instead of pruning                          |
| `pnpm github:sync --yes`                  | Skip the values-push confirmation (automation)                                           |
| `pnpm github:sync --prune`                | Flag rulesets for branches not in config (`--prune --yes` to delete)                     |
| `pnpm env:catalog` / `:check`             | (Re)generate / drift-check `docs/reference/env-catalog.md`                               |
| `pnpm validate:deploy-env`                | Fail if required deploy secrets missing (local, uses GitHub API)                         |

Every `github:sync` (all modes) runs a **consistency pre-flight** first: the
environments in `setup.config.json`, `.github/environments/*.json`, and the
reusable deploy workflow must agree, and `git.protectedBranches` / `defaultBranch`
must match the committed `.github/rulesets/*.json` (single trunk = `main` only).
It fails fast on drift before touching GitHub.

## Governance mode (personal ↔ team)

The production environment's `requiredReviewers` (`users` + `preventSelfReview`)
is one half of the repo's branch-governance mode; the trunk ruleset's
`pull_request` rule is the other. Do not edit them by hand — the coupled review
fields deadlock the maintainer in the wrong combination. Switch both atomically:

```bash
pnpm github:tool:governance-mode          # status
pnpm github:tool:governance-mode team     # four-eyes (needs ≥2 CODEOWNERS users)
pnpm github:sync                          # apply to GitHub
```

Full reference: [docs/reference/branch-governance.md](../../docs/reference/branch-governance.md).

## Protection drift

GitHub does not expose a full “apply protection from JSON” API for all fields.
When [`production.json`](production.json) specifies required reviewers or branch
policies, apply them in **Settings → Environments → production** to match the
committed file, then run `pnpm github:sync --check`.

## CI

[`reusable-netlify-deploy.yml`](../workflows/reusable-netlify-deploy.yml) runs
`validate-github-env.mjs` with `GITHUB_ENV_VALIDATION_SOURCE=runtime` so missing
secrets fail the deploy job instead of skipping quietly.
