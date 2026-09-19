# CI/CD and Netlify Deployment

Single reference for how Core Frontend is built, tested, and deployed. **Build runs only on GitHub Actions**; Netlify receives the pre-built `dist/` (no build on Netlify). See [deployment-and-pre-launch.md](deployment-and-pre-launch.md) for other static hosts.

```mermaid
flowchart LR
  subgraph ci["GitHub Actions"]
    C1[Push to main]
    C2[Build with GitHub secrets]
    C3[Upload dist/ to Netlify]
    C1 --> C2 --> C3
  end
  subgraph netlify["Netlify"]
    N1[Static host only]
    N2[No build step]
  end
  subgraph env["Env"]
    E1[GitHub Secrets: VITE_*, NETLIFY_*]
  end
  ci --> netlify
  env --> C2
```

---

## Deployment flow diagrams

### Full flow: Push → Env → Build → Deploy

```mermaid
flowchart LR
  subgraph trigger["Trigger"]
    P[Push to main]
  end

  subgraph secrets["Secrets (no code)"]
    GH[GitHub Secrets]
  end

  subgraph build["Build (GitHub only)"]
    GA[GitHub Actions]
    GA --> Build["pnpm build"]
    Build --> dist["dist/"]
  end

  subgraph deploy["Deploy"]
    CLI[Netlify CLI]
    Netlify[Netlify static host]
  end

  P --> GA
  GH --> GA
  dist --> CLI
  CLI --> Netlify
```

### Where env comes from

```mermaid
flowchart TB
  subgraph env_sources["Env sources"]
    GitHubSecrets["GitHub Secrets: VITE_API_BASE_URL, NODE_VERSION, NETLIFY_AUTH_TOKEN, NETLIFY_SITE_ID"]
  end

  subgraph build_time["Build time"]
    ViteBuild["pnpm build → dist/ (VITE_* from secrets)"]
  end

  subgraph deploy_time["Deploy time"]
    NetlifyCLI["netlify deploy --prod --dir=dist"]
  end

  GitHubSecrets --> ViteBuild
  GitHubSecrets --> NetlifyCLI
```

### Secured pipeline (security layers)

```mermaid
flowchart TB
  subgraph code["Code"]
    Repo[Repository]
  end

  subgraph no_secrets["Secrets never in repo"]
    GHS[GitHub Secrets]
  end

  subgraph ci_security["CI security"]
    Gitleaks[Gitleaks: scan for leaked secrets]
    Semgrep[Semgrep: SAST]
    EnvCheck[.env.example required vars check]
  end

  subgraph gate["Deploy gate"]
    Condition["Deploy only if VITE_API_BASE_URL + NETLIFY_* set"]
  end

  subgraph single_build["Single build path"]
    GABuild[Build on GitHub only]
    NoNetlifyBuild[No build on Netlify]
  end

  Repo --> Gitleaks
  Repo --> Semgrep
  Repo --> EnvCheck
  GHS --> Condition
  Condition --> GABuild
  GABuild --> NoNetlifyBuild
```

### End-to-end sequence

```mermaid
sequenceDiagram
  participant Dev as Developer
  participant GH as GitHub
  participant GA as GitHub Actions
  participant Netlify as Netlify

  Dev->>GH: Push to main
  GH->>GA: Trigger Deploy workflow
  GA->>GA: Checkout, pnpm install
  GA->>GA: pnpm build (env from GitHub secrets)
  GA->>GA: dist/ produced
  GA->>Netlify: netlify deploy --prod --dir=dist
  Netlify-->>GA: Deploy OK
  GA->>GH: Job success
```

---

## Setup checklist: what's done vs what you need

### Already done (no action)

- Netlify site linked to this repo (CLI).
- Netlify production env: `VITE_API_BASE_URL=https://your-api-domain.com`.
- Netlify CLI login (browser auth; no token to store).
- `netlify.toml` and deploy scripts in place.

### Required (you do once)

| What                   | Where                                               | Notes                                                                                                                                                                                                                           |
| ---------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Env vars for build** | **GitHub Secrets**                                  | Put `VITE_API_BASE_URL`, `NODE_VERSION` in GitHub → Settings → Secrets and variables → Actions. Build runs on GitHub; these are injected at build time. No build on Netlify.                                                    |
| **GitHub secrets**     | GitHub → Settings → Secrets and variables → Actions | **Required for deploy:** `VITE_API_BASE_URL`, `NODE_VERSION`, `NETLIFY_AUTH_TOKEN` (Netlify → User settings → Applications → Personal access tokens), `NETLIFY_SITE_ID` (Netlify → Site settings → General → Site information). |
| **Netlify: no build**  | Netlify UI                                          | If the site is connected to Git, **disable the build** (e.g. set build command to a no-op or disconnect "Build" so only GitHub deploys). Deploy workflow uploads pre-built `dist/` via CLI.                                     |
| **Backend CORS**       | Your API server                                     | Allow your Netlify site origin (or custom domain) so the browser can call the production API.                                                                                                                                   |

### Optional (tokens / secrets)

| What                       | Where to put it                                                          | When                                                                                                                                        |
| -------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sentry (source maps)**   | **GitHub Secrets:** `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`. | Build runs on GitHub; add these so the build step can upload source maps. See [sentry-sourcemaps.md](../integrations/sentry-sourcemaps.md). |
| **Sentry (client errors)** | **GitHub Secrets:** `VITE_SENTRY_DSN`.                                   | Baked into the client at build time.                                                                                                        |
| **PostHog**                | **GitHub Secrets:** `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST`.             | Baked into the client at build time.                                                                                                        |

### Local development

- **`.env.local`** (gitignored) at project root: `VITE_DEV_API_URL` (e.g. `http://localhost:3000`) if your backend runs locally. No token needed for basic dev.
- **Sentry (local build):** If you run `pnpm build` locally and want source maps uploaded, put `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` in `.env.sentry-build-plugin` (gitignored) or `.env.local`. Optional.

**Summary:** Build runs only on GitHub Actions (Deploy workflow on push to `main`). Set **GitHub secrets** (`VITE_API_BASE_URL`, `NODE_VERSION`, `NETLIFY_AUTH_TOKEN`, `NETLIFY_SITE_ID`). Disable Netlify's Git build so only the workflow deploys. **Backend CORS** must allow your frontend origin.

**CLI-only deploy:** You can still run `pnpm run deploy:netlify:prod` locally (build runs on your machine, then Netlify CLI uploads `dist/`). See [netlify-cli-setup.md](netlify-cli-setup.md).

---

## Production API

| Purpose          | Value                                                                           |
| ---------------- | ------------------------------------------------------------------------------- |
| **API base URL** | `https://your-api-domain.com`                                                   |
| **API path**     | `/api/v1` (set in app; requests go to `https://your-api-domain.com/api/v1/...`) |

Backend must allow CORS from the frontend origin (Netlify site URL / custom domain).

---

## Hosting: Netlify

- **Site:** Netlify hosts the pre-built `dist/` only. No build runs on Netlify.
- **Config:** `netlify.toml` (publish dir, SPA redirect, headers). Build command there is unused when deploying from GitHub (workflow runs build and uploads `dist/`).
- **Deploys:** (1) **GitHub Actions** — `post-merge-ci.yml` deploys the `development` alias on every `main` src push; `release-deploy.yml` deploys `--prod` on a published release (pinned to the tag, reviewer-gated); `rollback-deploy.yml` restores a previous prod deploy instantly. (2) **CLI** — `pnpm run deploy:netlify:prod` for manual deploy.

### Build-time env (GitHub Secrets)

Build runs on GitHub; env comes from **GitHub Secrets**. Set in GitHub → Settings → Secrets and variables → Actions:

| Variable            | Value                         | Notes                                                                                                                                       |
| ------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_API_BASE_URL` | `https://your-api-domain.com` | Production API base; app appends `/api/v1`.                                                                                                 |
| `NODE_VERSION`      | `24`                          | Required in **`.env.<environment>`** and GitHub Actions; must match `package.json` `engines.node` and `netlify.toml` `[build.environment]`. |

Optional (Sentry, PostHog): add to GitHub secrets; they are baked into the client at build time.

### Setting GitHub secrets

**Option A — From `.env.<environment>` (CLI)**

Each environment's deploy values live in a gitignored `.env.<environment>` at the repo root, derived from the committed `.env.example` — that file is the source of truth. Fill it in, then run `pnpm github:sync` after `gh auth login` to push every non-empty deploy key (`VITE_API_BASE_URL`, `NODE_VERSION`, `NETLIFY_AUTH_TOKEN`, `NETLIFY_SITE_ID`, …) to the matching GitHub Environment. Preview with `pnpm github:sync --dry-run`; check drift with `pnpm github:sync --check`.

**Option B — Manual in GitHub UI**

1. Go to GitHub → repo → Settings → Secrets and variables → Actions.
2. Add `VITE_API_BASE_URL`, `NODE_VERSION`, `NETLIFY_AUTH_TOKEN`, `NETLIFY_SITE_ID`.

**Variable names (required):** `VITE_API_BASE_URL`, `NODE_VERSION`. **Optional:** `VITE_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST`.

**Local dev:** Use `.env.local` (gitignored) for `VITE_*` vars.

**Env validation: commit**

| When                    | What runs                                                                                                                   |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Commit (pre-commit)** | **`.env.example` check** — schema ↔ template parity via `pnpm tool:sync-env-example`. Run: `pnpm run validate:env-example`. |

When you add a new env var, follow **`agent-os/skills/env-schema-add/SKILL.md`**:

1. Add the field to **`src/core/config/env-schema.ts`**.
2. Add it to **`.env.example`** under the correct Secrets/Variables half.
3. Run **`pnpm tool:sync-env-example`**.
4. Set its value in **GitHub Secrets** (Settings → Secrets and variables → Actions).

### One-time setup (CLI)

1. **Login:** `pnpm exec netlify login` (browser), or set `NETLIFY_AUTH_TOKEN` (see [netlify-cli-setup.md](netlify-cli-setup.md)).
2. **Link site:** `pnpm exec netlify link --id e158779a-5efb-4f3b-9b0f-8399d3335066`.
3. **Env vars:** Fill `.env.<environment>` and run `pnpm github:sync` (see above), or set the secrets manually in the GitHub UI.

### Deploy commands

| Command                        | What it does                            |
| ------------------------------ | --------------------------------------- |
| `pnpm run deploy:netlify`      | Build + deploy **draft** (preview URL). |
| `pnpm run deploy:netlify:prod` | Build + deploy to **production**.       |

Both run `pnpm build` then `netlify deploy` (with or without `--prod`).

### GitHub → Netlify (deploy only; no build on Netlify)

1. **Do not** rely on Netlify's "Build" from Git. Build runs only in GitHub Actions.
2. In **GitHub**: Settings → Secrets and variables → Actions. Add `VITE_API_BASE_URL`, `NETLIFY_AUTH_TOKEN`, `NETLIFY_SITE_ID`.
3. Every push to `main` runs the **Deploy** workflow: build (with GitHub secrets) → upload `dist/` to Netlify. Netlify serves the uploaded files; it does not run a build.
4. **Optional:** In Netlify, if the site is linked to the repo, disable the build step (e.g. set build command to `echo 'Build on GitHub'` and publish dir to `dist`) so Netlify doesn't run a second build. Or create the site without Git connection and deploy only via the workflow.

---

## CI (GitHub Actions)

| Workflow                                                                   | Trigger                               | What it does                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PR CI** (`.github/workflows/pr-ci.yml`)                                  | PR to `main`                          | Path-filtered parallel lanes: lint, biome, knip, format, type-check, structure/token validators, agent-os evals, unit + security Vitest, build + bundle size, gitleaks, Semgrep, Trivy IaC, dependency review, actionlint; aggregate **Quality gate**.                                                                                                            |
| **Post-merge CI** (`.github/workflows/post-merge-ci.yml`)                  | Push to `main`                        | Single-channel release-please (ungated; CHANGELOG lint-fix + PAT probe), SBOM on releases, and `deploy-development` (`--alias development`) on every src push. **Production deploy moved to Release deploy.** NO redundant re-testing — pr-ci already gated the SHA.                                                                                              |
| **Release deploy** (`.github/workflows/release-deploy.yml`)                | `release: published` + manual `{tag}` | Production deploy (`--prod`) pinned to the release **tag** (never a moving branch SHA), behind the `production` environment reviewer. Re-runnable for any tag via `workflow_dispatch`.                                                                                                                                                                            |
| **Rollback deploy** (`.github/workflows/rollback-deploy.yml`)              | Manual `workflow_dispatch`            | Instant production rollback — restores a previous immutable Netlify deploy (no rebuild), behind the same `production` reviewer gate.                                                                                                                                                                                                                              |
| **Preview** (`.github/workflows/preview.yml`)                              | PR to `main` (src-path-filtered)      | Live per-PR Netlify preview: builds `dist/` with the `development` environment's client env and publishes it to a PR-scoped alias (`pr-<n>--core-fe.netlify.app`), then upserts a sticky PR comment with the URL. Advisory — not a required check; skipped for fork/Dependabot PRs (no environment secrets).                                                      |
| **PR Governance** (`.github/workflows/pr-governance.yml`)                  | PR opened/edited/synchronize/reopened | Single `Checks` job (the second required context): validates the conventional-commits PR title, syncs the size label, guards `.env` files, and auto-applies path labels.                                                                                                                                                                                          |
| **Release-flow guards** (`.github/workflows/scheduled-release-guards.yml`) | Weekly (Mon) schedule + manual        | Weekly GitHub environment protection + ruleset drift check (committed `.github/environments/*.json` + `.github/rulesets/*.json` vs GitHub — the Netlify deploy pre-flight refuses to deploy on drift). (The branch-ancestry canary is gone — single trunk.)                                                                                                       |
| **Dependabot auto-merge** (`.github/workflows/dependabot-auto-merge.yml`)  | PR review submitted                   | Approval-triggered squash auto-merge for the low-risk `npm-non-major` Dependabot group only — the maintainer approval is the manual gate; the PR merges when PR CI goes green (PAT-attributed via `RELEASE_PLEASE_TOKEN` so the merge push triggers post-merge CI). Majors / security / github-actions stay manual. Requires the repo "Allow auto-merge" setting. |

**Build runs only on GitHub.** Netlify never runs a build; it only serves the uploaded `dist/` (every `main` src push → development alias via post-merge CI; a published release → production via `release-deploy.yml`, pinned to the tag). Netlify is the current deploy target of record.

**CI never boots core-be.** Playwright E2E is local-only (`pnpm test:e2e` against a live core-be on `:3000`); CI and CD need only the deployed backend URL (`VITE_API_BASE_URL` secret per environment) — never a full backend.

### Change detection and the aggregate gate

The PR CI `changes` job grants only `contents: read` and `pull-requests: read`.
The latter is required for `dorny/paths-filter` to list changed PR files, including
Dependabot PRs; do not work around a permission failure by skipping detection or
switching to a privileged `pull_request_target` execution of PR code.

`Quality gate` evaluates every dependency, including `changes`. Change detection
must finish with `success`: failure, cancellation, or a skipped detector blocks
the gate even when all downstream jobs are skipped. Downstream path-filter skips
are accepted only after successful detection. Regression tests execute the gate's
actual shell script in `tests/ci/quality-gate.policy.test.ts`.

### Trunk and environments

Single trunk (`main`) drives both GitHub Environments by **purpose**, not by branch:

| Trigger                        | GitHub Environment | Release channel                  | Netlify deploy                                      |
| ------------------------------ | ------------------ | -------------------------------- | --------------------------------------------------- |
| every push to `main`           | `development`      | —                                | Alias deploy: `development--core-fe.netlify.app`    |
| a release (`vX.Y.Z`) on `main` | `production`       | Stable releases (`CHANGELOG.md`) | Production deploy (`--prod`): `core-fe.netlify.app` |

**One Netlify project (`core-fe`) serves both** on the same site via deploy contexts. Both GitHub Environments carry the same `NETLIFY_SITE_ID`; only `VITE_API_BASE_URL` differs.

- Feature PRs target **`main`** and squash-merge. Ship by merging the standing release-please Release PR.
- PR CI (`pr-ci.yml`), PR Governance (`pr-governance.yml`), and Preview (`preview.yml`) run on PRs to `main`.
- Branch protection and required checks: [branch-protection.md](branch-protection.md).
- Full workflow: [trunk-based-workflow.md](../process/trunk-based-workflow.md) and [deployment-and-pre-launch.md](deployment-and-pre-launch.md#branch--environment-flow).

---

## Summary

| Item                | Where / How                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Production API**  | `https://your-api-domain.com` (path `/api/v1` in app).                                                                   |
| **Frontend host**   | Netlify (static host only; no build on Netlify).                                                                         |
| **Build**           | GitHub Actions only (Deploy workflow on push to `main`; Release workflow when release created). Env from GitHub secrets. |
| **Env vars**        | GitHub secrets: `VITE_API_BASE_URL`, `NODE_VERSION`, `NETLIFY_AUTH_TOKEN`, `NETLIFY_SITE_ID`.                            |
| **Deploy (GitHub)** | Deploy workflow: push to `main` → build → upload `dist/` to Netlify.                                                     |
| **Deploy (CLI)**    | `pnpm run deploy:netlify` (draft), `pnpm run deploy:netlify:prod` (production); build runs locally.                      |
| **CI**              | GitHub Actions: lint, type-check, unit + security tests, build (smoke) on push/PR. E2E is local-only.                    |
