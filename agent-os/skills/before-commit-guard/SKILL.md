---
name: before-commit-guard
description: Pre-commit gate that runs on every git commit. Ensures env docs, public assets, format, lint, and types pass before code is committed. Use when user asks about commit checks, pre-commit, path-to-production gates, or fixing commit failures.
---

# Before-Commit Guard — Path-to-Production Gate

This skill runs **automatically when the user runs `git commit`** via the Husky pre-commit hook. It enforces the same quality gates used for path-to-production, at commit time.

## When to Invoke (Agent)

- User asks: "what runs on commit?", "pre-commit guard", "before commit checks", "why did my commit fail?", "fix commit failure"
- User wants to run the guard manually: `pnpm run before-commit-guard`
- Modifying `.husky/pre-commit` or pre-commit checks — read code-quality-security for consistency

## What Runs on `git commit`

The pre-commit hook (`.husky/pre-commit`) is a one-liner: it runs
`./tooling/validate/before-commit-guard.sh`, which owns **all** labeled steps
under `set -e` — so any failing step reliably blocks the commit (the previous
split hook/script layout let a mid-hook failure fall through). Same pattern as
core-be's `pnpm guard:pre-commit` runner.

### Inside before-commit-guard.sh (steps 1–10)

1. **validate:env-example** — `.env.example` documents all keys from `src/core/config/env-schema.ts` (via `pnpm tool:sync-env-example`).
2. **validate:public** — Required public assets exist: config.js, theme-init.js, vite.svg, manifest.webmanifest, \_headers, offline.html, robots.txt.
3. **lint-staged** — ESLint --fix + Prettier on staged `.ts`, `.tsx`, `.css`, `.json`, `.md`, `.yaml`, `.yml`.
4. **validate:vite-env** — env/mode-sniffing gate: no `import.meta.env.DEV/PROD/MODE` or `platformConfig.environment === '<name>'` / `.MODE ===` outside the config-kernel allowlist. Behavior must be driven by named `platformConfig` flags.
5. **type-check** — `tsc --noEmit` for full project.
6. **validate:lockfile** — _only when the commit stages `package.json` or `pnpm-lock.yaml`_ — runs `pnpm install --frozen-lockfile` (the exact check CI runs) to prove the lockfile is in sync. Catches a dependency or `pnpm.overrides` change that forgot to regenerate the lockfile before it can reach main.
7. **Gitleaks** — `gitleaks protect --staged` secret/API-key scan (notice + skip when not installed).
8. **Env-file guard** — reject committing any `.env*` except `.env.example` (mirrors the pr-governance CI guard, locally).
9. **Merge conflict markers** — reject staged files containing `<<<<<<< ` / `>>>>>>> ` / bare `=======` lines (anchored so doc banner lines pass).
10. **Large staged files** — reject staged blobs > 1MB, measured with `git cat-file -s :<path>` (the staged content, not the working tree — rename/partial-stage safe).

## How to Fix Failures

### validate:env-example fails

**Error:** "`.env.example` is missing required var(s): NODE_VERSION"

**Fix:** Add the missing key to `.env.example` (or run `pnpm tool:sync-env-example --fix`). See `agent-os/skills/env-schema-add/SKILL.md`.

### validate:public fails

**Error:** "Missing required files in public/: ..."

**Fix:** Add the missing file to `public/`. See `public/README.md` for the full list.

### lint-staged / ESLint fails

**Fix:** Run `pnpm lint:fix` and fix any remaining errors manually. Common issues:

- Import ordering → `simple-import-sort` (auto-fixed)
- Unused imports → remove or use `_` prefix
- `security/detect-object-injection` → add block disable with justification for safe dynamic access
- React purity / impure in render → move to effect or handler

See **lint-guard** skill for full fix patterns.

### type-check fails

**Fix:** Run `pnpm type-check` to see errors. Fix TypeScript errors (strict mode, no `any`, proper types).

### validate:lockfile fails

**Error:** "`ERR_PNPM_LOCKFILE_CONFIG_MISMATCH` … The current "overrides" configuration doesn't match the value found in the lockfile" (or a lockfile-outdated error).

**Cause:** You changed a dependency or `pnpm.overrides` in `package.json` without regenerating `pnpm-lock.yaml`. A frozen install then fails — which reds **every** CI job on the PR, and any open release-please PR inherits the mismatch and goes all-red too.

**Fix:** Run `pnpm install`, then stage `package.json` **and** `pnpm-lock.yaml` in the same commit. **Rule:** a dependency/override change and its lockfile update are one atomic change — a desynced lockfile must never reach main.

## Manual Run

Run the guard without committing:

```bash
pnpm run before-commit-guard
```

This runs only the before-commit-guard checks (env, public, lint-staged, vite-env, type-check, and lockfile sync when `package.json`/`pnpm-lock.yaml` are staged). The env-file guard, gitleaks, conflict markers, and large file checks run only in the actual pre-commit hook. Run the lockfile check directly any time with `pnpm run validate:lockfile`.

## Relationship to Full Health Check

| Check                | before-commit-guard                | pnpm health     |
| -------------------- | ---------------------------------- | --------------- |
| validate:env-example | ✅                                 | ✅              |
| validate:public      | ✅                                 | ✅              |
| format (Prettier)    | ✅ via lint-staged on staged files | ✅ format:check |
| lint                 | ✅ via lint-staged on staged files | ✅ full lint    |
| type-check           | ✅                                 | ✅              |
| tests                | ❌ (too slow for commit)           | ✅              |
| build                | ❌ (too slow for commit)           | ✅              |
| bundle size          | ❌ (needs build)                   | ✅              |
| gitleaks             | ✅ in pre-commit                   | ❌              |
| conflict markers     | ✅ in pre-commit                   | ❌              |
| large file           | ✅ in pre-commit                   | ❌              |

Use `pnpm health` or `pnpm health:fix` for the full path-to-production flow before release.

## Config Files

| File                                      | Purpose                                                                 |
| ----------------------------------------- | ----------------------------------------------------------------------- |
| `tooling/validate/before-commit-guard.sh` | Main guard script                                                       |
| `tooling/validate/lockfile-sync.sh`       | `validate:lockfile` — frozen-install lockfile ↔ package.json sync check |
| `.husky/pre-commit`                       | Invokes guard + gitleaks + conflict + large file                        |
| `package.json` `lint-staged`              | ESLint + Prettier on staged files                                       |
| `src/core/config/env-schema.ts`           | Schema source of truth for env keys                                     |
| `tooling/validate/sync-env-example.ts`    | Schema ↔ `.env.example` parity                                          |

---

## Traps that make the guard look wrong when it is right

**A "lockfile out of sync" error can actually be a Node version mismatch.**
`.npmrc` sets `engine-strict=true`, and `validate:lockfile` runs
`pnpm install --frozen-lockfile` — which fails on an engine mismatch *before* it
checks the lockfile, while printing the lockfile message. If the lockfile is
genuinely in sync, read the pnpm error body:

```
ERR_PNPM_UNSUPPORTED_ENGINE  Your Node version is incompatible with "<pkg>"
```

Fix the Node version (`nvm use <version>` matching `.nvmrc` and every dependency's
`engines`), not the lockfile. Regenerating a healthy lockfile to chase this
creates real churn.

**A rejected commit leaves the index populated.** If an attempt ran `git add -A`
and the hook failed, those paths are still staged — the next narrowly-scoped
`git add` silently includes them, producing a commit whose message describes a
fraction of its contents.

```bash
git status --short      # before every commit
git show --stat HEAD    # after: does it match the message?
```

`git reset` (mixed) clears the index without touching the working tree. See
`agent-os/skills/safe-bulk-edits/SKILL.md` for the full staging discipline.

**Never conclude a gate passed from a piped command.** `pnpm lint | tail -5`
reports `tail`'s status. Capture it: `cmd > /tmp/out 2>&1; echo $?`.
