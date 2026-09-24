# Trunk-Based Workflow

Trunk-based branch naming, PR flow, and release process for core-fe. For setup see
[setup.md](../getting-started/setup.md) and
[netlify-cli-setup.md](../deployment/netlify-cli-setup.md). For CI/CD and deployment, see
[cicd-and-netlify.md](../deployment/cicd-and-netlify.md).

---

## One long-lived branch: `main`

core-fe is **trunk-based** — there is a single long-lived branch, `main`, and short-lived
working branches off it. Unfinished or risky work ships **behind a feature flag, never behind
a long-lived branch**.

| Branch   | GitHub Environment      | Purpose                                                |
| -------- | ----------------------- | ------------------------------------------------------ |
| **main** | `production` (releases) | The trunk. Every PR merges here; releases cut from it. |

`main` also drives the `development` environment — **every src-path push to `main` deploys the
development alias** (`development--core-fe.netlify.app`; post-merge CI's deploy job is
path-filtered, so docs-only pushes skip it), keeping the alias on trunk HEAD. Production
(`core-fe.netlify.app`) serves the latest **release tag** only.

---

## Short-lived working branches (created from `main`)

Use the format **type/short-description**.

### Branch type prefixes

| Type     | Use for          | Example                   |
| -------- | ---------------- | ------------------------- |
| feat     | New feature      | feat/ai-stream-response   |
| fix      | Bug fix          | fix/login-error           |
| refactor | Code improvement | refactor/auth-module      |
| docs     | Documentation    | docs/readme-update        |
| test     | Adding tests     | test/user-service         |
| chore    | Maintenance      | chore/update-dependencies |
| perf     | Performance      | perf/list-virtualization  |

### Accepted type prefixes

`feature` · `feat` · `fix` · `hotfix` · `refactor` · `docs` · `test` · `chore` · `ci` · `perf` ·
`build` · `style` · `revert`

Name the branch after the change: `<type>` is its conventional-commit type, `<short-description>`
is 2–5 kebab-case words (≤ 40 chars) matching the commit subject and PR title —
`docs/american-spelling-organization`, `feat/billing-invoice-route`,
`fix/org-slug-guard-refresh`.

Claude Code web session branches (`claude/*`) are allowlisted as a **fallback**. A web session
boots on a platform-generated `claude/<slug>` that carries no meaning; rename it with
`git branch -m <type>/<short-description>` **before** the first push. The cloud git proxy does
**not** pin a session to that branch — a push under any conventional name succeeds — but it does
refuse every form of branch **delete** (403), so a `claude/*` branch that has already been pushed
cannot be removed from inside the session. One-off bypass of the name check:
`SKIP_BRANCH_CHECK=1 git push`. Enforced by [`.husky/pre-push`](../../.husky/pre-push) and the
[`fe-git-branch-naming`](../../agent-os/rules/fe-git-branch-naming.mdc) rule (parity with core-be).

Hotfixes are **fix-forward on `main`** (no release branches) — see below.

---

## Full workflow

```mermaid
flowchart TB
  subgraph work [Working branches]
    feature[feat/...]
    fix[fix/...]
  end
  subgraph trunk [Trunk]
    main[main]
  end
  releasepr["Release PR (chore: release X.Y.Z)"]
  feature -->|squash-merge| main
  fix -->|squash-merge| main
  main -->|release-please refreshes| releasepr
  releasepr -->|merge = ship ★| main
```

**Integrate often** (merge to `main`), **release on cadence** (merge the Release PR).
A feature merge is not a release — it refreshes the preview + the development alias only.

---

## Step-by-step PR workflow

### 1. Create a branch from `main`

```bash
git switch main && git pull
git switch -c feat/ai-stream-response
```

### 2. Work and commit

Use [Conventional Commits](https://www.conventionalcommits.org/) (enforced in PR checks) —
the PR title becomes the squash commit, so it must be conventional too:

```bash
git add .
git commit -m "feat: add AI streaming response"
```

Unfinished? Hide it behind a **named schema flag** and merge anyway — do **not** hold it on a
long-lived branch. The env schema is a closed set (an undeclared `VITE_` key fails
`pnpm validate:env-example`), so declare the flag properly via
`agent-os/skills/fe-env-schema-add/SKILL.md` — or keep the work on the (short-lived) PR until
it is ready.

### 3. Push and open a PR to `main`

```bash
git push -u origin feat/ai-stream-response
```

- **Target branch:** `main`.
- **PR title = conventional commit** (it becomes the squash commit message subject).
- CI runs the single `quality-gate` (lint, format, types, unit + security tests, build,
  security scans). All must pass.
- **Merge = squash**, and the branch **auto-deletes** on merge.

### 4. Release (on your cadence)

release-please keeps **one standing Release PR** open (`chore: release X.Y.Z`), recomputing
the next version + changelog from all unreleased commits. **Merging it is the ship button:**

- version bump + `CHANGELOG.md` + tag `vX.Y.Z` + GitHub Release + SBOM attach, then
- the **one human gate** — approve the `production` deploy → prod serves `vX.Y.Z`.

Bump rules (highest wins): `fix:` → patch, `feat:` → minor, `feat!:`/`BREAKING CHANGE:` →
major; `chore/docs/refactor/ci/test/build/style/perf` → changelog only.

### Rollback (fast) / redeploy an old tag

Two paths, both behind the `production` reviewer approval:

- **Instant rollback** (no rebuild): Actions → **Rollback deploy** → Run workflow.
  Restores the previous published Netlify deploy (or an explicit `deploy_id`).
- **Redeploy a tag** (clean rebuild): Actions → **Release deploy** → Run workflow →
  `tag=v1.0.0`. Rebuilds that tag's tree and deploys `--prod`.

### Hotfix an already-shipped version (fix-forward)

No release branches — patch on the trunk and cut the next release:

```bash
git switch -c fix/null-user main      # short-lived; squash-merges back to main
# fix, commit, open a `fix:` PR to main → PR CI → squash-merge
# merge the standing release-please Release PR → v1.0.1 tag + GitHub Release
# → release-deploy.yml deploys v1.0.1 to prod ⛔ approval
```

`main` deploys continuously, so ship or flag any in-progress work first — a
fix-forward release carries everything currently on `main`.

---

## Golden rules

**DO:** integrate often; squash-merge to `main`; use lowercase hyphenated `type/short`
branch names; hide unfinished work behind flags.

**DO NOT:** create long-lived branches; use spaces or long sentences in branch names; hold
work on a branch instead of a flag.

---

## Summary

- **One trunk:** `main`. Feature branches squash-merge to it and auto-delete.
- **Deploys:** every src-path `main` push → development alias; releases only → production (one approval).
- **Ship:** merge the standing `chore: release X.Y.Z` Release PR.
- **Rollback:** **Rollback deploy** (instant restore, no rebuild) or **Release deploy** `{tag}` (rebuild).
