---
name: fe-code-quality-security
description: Three-layer code quality and security pipeline. Use when adding ESLint rules, configuring pre-commit hooks, debugging CI failures, adding security checks, updating lint config, or reviewing the quality pipeline. Triggers on "add eslint rule", "configure pre-commit", "why is CI failing", "add security check", "update lint config", "what checks run on commit".
---

# Code Quality and Security Pipeline

Three layers of defense: real-time editor feedback, pre-commit hooks, and CI checks on PRs.

## Architecture

```
Layer 1: While Coding (Cursor/IDE)
  ESLint with sonarjs + security + jsx-a11y + import-sort + unused-imports, TypeScript strict, Prettier on save

Layer 2: Pre-Commit (Husky)
  before-commit-guard.sh (env docs -> public assets -> lint-staged -> vite-env ->
  typecheck -> lockfile -> gitleaks -> env-files -> conflict markers -> large files)
  + commitlint (.husky/commit-msg)

Layer 3: CI (GitHub Actions on PRs)
  lint | format-check | typecheck | test | build | gitleaks | semgrep | Lighthouse CI | bundle size | E2E
```

## Layer 1: While Coding

Real-time inline feedback via ESLint plugins. All rules run through the existing ESLint extension.

### Config File

`eslint.config.mjs` (project root)

### Plugins

| Plugin                             | What it catches                                                                                     |
| ---------------------------------- | --------------------------------------------------------------------------------------------------- |
| `eslint-plugin-sonarjs`            | Cognitive complexity, duplicate strings, identical functions, collapsible if, single boolean return |
| `eslint-plugin-security`           | eval detection, unsafe regex, non-literal require/regexp, object injection, timing attacks          |
| `eslint-plugin-jsx-a11y`           | Missing alt text, invalid ARIA, missing labels, keyboard accessibility                              |
| `eslint-plugin-simple-import-sort` | Consistent import ordering (external → internal → relative)                                         |
| `eslint-plugin-unused-imports`     | Dead import detection                                                                               |
| `eslint-plugin-react-hooks`        | Rules of hooks, exhaustive deps                                                                     |
| `eslint-plugin-react-refresh`      | Fast refresh boundary violations                                                                    |

### Built-in Rules

| Rule                               | Value                     | Severity |
| ---------------------------------- | ------------------------- | -------- |
| `max-depth`                        | 4                         | warn     |
| `max-lines-per-function`           | 80 (skip blanks/comments) | warn     |
| `complexity`                       | 15                        | warn     |
| `no-eval`                          | -                         | error    |
| `no-implied-eval`                  | -                         | error    |
| `no-new-func`                      | -                         | error    |
| `no-param-reassign`                | -                         | error    |
| `simple-import-sort/imports`       | -                         | error    |
| `simple-import-sort/exports`       | -                         | error    |
| `unused-imports/no-unused-imports` | -                         | error    |

### How to Add a Rule

1. Open `eslint.config.mjs`
2. Add the rule to the `rules` object inside the main `files: ['**/*.{ts,tsx}']` block
3. Use `'warn'` for style/complexity rules, `'error'` for security rules
4. ESLint extension picks it up immediately (no restart needed)

### How to Add a Plugin

1. Install: `pnpm add -D eslint-plugin-<name>`
2. Import in `eslint.config.mjs`: `import <name> from 'eslint-plugin-<name>';`
3. Add to `extends` array or configure individual rules

## Layer 2: Pre-Commit (Husky)

Checks run on every `git commit` via `.husky/pre-commit` and `.husky/commit-msg`.

### Checks

| #    | Check                   | What it does                                                                                                                | Blocks commit?     |
| ---- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| 1    | **fe-before-commit-guard** | `./tooling/validate/before-commit-guard.sh` — ALL pre-commit steps (1–10) under `set -e`; see the fe-before-commit-guard skill | Yes                |
| 1.7  | ↳ Gitleaks              | Scans staged files for secrets/API keys (step 7)                                                                            | Yes (if installed) |
| 1.8  | ↳ Env-file guard        | Rejects any staged `.env*` except `.env.example` (step 8)                                                                   | Yes                |
| 1.9  | ↳ Conflict markers      | Rejects files containing `<<<<<<<` or `>>>>>>>` (step 9)                                                                    | Yes                |
| 1.10 | ↳ Large file check      | Rejects staged blobs > 1MB via `git cat-file -s` (step 10)                                                                  | Yes                |
| 2    | `commitlint`            | Enforces conventional commit format (`feat:`, `fix:`, etc.) via `.husky/commit-msg`                                         | Yes                |

See **fe-before-commit-guard** skill (`agent-os/skills/fe-before-commit-guard/SKILL.md`) for the full step list (1–10) and failure fixes.

### Config Files

| File                                      | Purpose                                                                                                             |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `.husky/pre-commit`                       | Pre-commit hook — one-liner invoking the guard (all steps live inside it, core-be pattern)                          |
| `tooling/validate/before-commit-guard.sh` | Guard script: env, public, lint-staged, vite-env, type-check, lockfile, gitleaks, env-files, conflicts, large files |
| `.husky/commit-msg`                       | Commit message validation hook                                                                                      |
| `.commitlintrc.json`                      | Conventional commit config                                                                                          |
| `.gitleaks.toml`                          | Gitleaks secret scan allowlist                                                                                      |
| `package.json` `lint-staged`              | Defines which tools run on which file patterns                                                                      |
| `.prettierignore`                         | Excludes vendored `agent-os/skills/**` so formatting never breaks skills-lock hashes                                |

### How to Add a Pre-Commit Check

1. Edit `.husky/pre-commit`
2. Add a new shell command block after the existing checks
3. Use `exit 1` to block the commit on failure
4. For optional tools, wrap in `if command -v <tool> >/dev/null 2>&1; then ... fi`

### Skipping Hooks (emergency)

```bash
git commit --no-verify -m "emergency fix"
```

CI will still catch issues on the PR.

### Installing Gitleaks Locally

```bash
brew install gitleaks
```

## Layer 3: CI (GitHub Actions)

Runs on every PR to `main`. Multiple parallel jobs across several workflows.

### Config Files

| Workflow      | File                                  | Purpose                         |
| ------------- | ------------------------------------- | ------------------------------- |
| CI            | `.github/workflows/pr-ci.yml`         | Core quality + security checks  |
| Preview       | `.github/workflows/preview.yml`       | PR preview builds               |
| Post-merge CI | `.github/workflows/post-merge-ci.yml` | release-please + Netlify deploy |
| Mutation Test | `.github/workflows/mutation-test.yml` | Stryker mutation tests (weekly) |

### CI Jobs

| Job         | Command                        | Category           |
| ----------- | ------------------------------ | ------------------ |
| lint        | `pnpm lint`                    | Quality            |
| format      | `pnpm format:check`            | Quality            |
| typecheck   | `pnpm type-check`              | Quality            |
| test        | `pnpm test:ci` (with coverage) | Quality            |
| build       | `pnpm build`                   | Quality            |
| bundle-size | `pnpm size`                    | Performance        |
| gitleaks    | `gitleaks detect`              | Security           |
| semgrep     | `semgrep ci --config auto`     | Security           |
| e2e         | `pnpm test:e2e`                | E2E                |
| lighthouse  | `lhci autorun`                 | Performance + a11y |

### How to Add a CI Job

1. Edit `.github/workflows/pr-ci.yml`
2. Add a new job under the `jobs:` key
3. Use the same `setup` pattern (checkout, pnpm, node, install)
4. Security jobs don't need `pnpm install`

## Quick Reference: All Config Files

| File                                  | Layer | Purpose                                  |
| ------------------------------------- | ----- | ---------------------------------------- |
| `eslint.config.mjs`                   | 1     | ESLint rules, plugins, overrides         |
| `.vscode/settings.json`               | 1     | Auto-fix on save, format on save         |
| `.husky/pre-commit`                   | 2     | Pre-commit hook script                   |
| `.husky/commit-msg`                   | 2     | Commit message validation                |
| `.commitlintrc.json`                  | 2     | Conventional commit config               |
| `.gitleaks.toml`                      | 2     | Gitleaks secret scan allowlist           |
| `package.json` (lint-staged)          | 2     | Staged file patterns for ESLint/Prettier |
| `.github/workflows/pr-ci.yml`         | 3     | CI workflow with quality + security jobs |
| `.github/workflows/preview.yml`       | 3     | PR preview builds                        |
| `.github/workflows/post-merge-ci.yml` | 3     | release-please + Netlify deploy          |
| `.github/workflows/mutation-test.yml` | 3     | Stryker mutation tests                   |
| `.semgrepignore`                      | 3     | Semgrep ignore patterns for CI           |
| `.lighthouserc.cjs`                   | 3     | Lighthouse CI assertions                 |
| `.size-limit.json`                    | 3     | Bundle size budgets                      |
| `.github/dependabot.yml`              | 3     | Automated dependency updates             |

## Manual Scripts

| Script                    | Command                         | What it does                       |
| ------------------------- | ------------------------------- | ---------------------------------- |
| `pnpm validate`           | lint + type-check + test        | Full local validation              |
| `pnpm security:secrets`   | `gitleaks detect --source . -v` | Full-repo secret scan              |
| `pnpm security:sast`      | `semgrep --config auto .`       | Full-repo SAST scan                |
| `pnpm size`               | `size-limit`                    | Check bundle sizes against budgets |
| `pnpm build:analyze`      | `ANALYZE=true vite build`       | Bundle analysis visualization      |
| `pnpm deps:check`         | `pnpm outdated`                 | Check for outdated dependencies    |
| `pnpm deps:audit`         | `tooling/ci/bulk-audit.mjs`     | Security audit of dependencies     |
| `pnpm test:visual`        | Playwright visual specs         | Visual regression tests            |
| `pnpm test:visual:update` | Update visual snapshots         | Refresh baseline screenshots       |

## Troubleshooting

### "gitleaks: command not found" on commit

Gitleaks is optional locally. Install with `brew install gitleaks`. The pre-commit hook skips the check gracefully if not installed. CI always runs it.

### Semgrep timeout in CI

Semgrep runs only in CI, not locally. If it times out, check `.semgrepignore` to ensure large generated files are excluded. Consider adding `--timeout 300` to the semgrep args in the workflow.

### ESLint plugin conflicts

If `eslint-plugin-sonarjs` or `eslint-plugin-security` conflict with existing rules, disable the specific conflicting rule in the ESLint config rather than removing the entire plugin.

### "max-lines-per-function" too strict

The limit is 80 lines (excluding blanks and comments). If a function legitimately needs more, add an inline disable comment:

```ts
// eslint-disable-next-line max-lines-per-function
export function LargeComponent() { ... }
```

Consider refactoring instead -- extract sub-components or helper functions.

### Bundle size budget exceeded

Run `pnpm build:analyze` to inspect the bundle. Common fixes:

- Lazy load heavy components/pages
- Replace large libraries with smaller alternatives
- Check for accidental full library imports
