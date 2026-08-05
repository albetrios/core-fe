---
name: documentation-maintenance
description: When to update which doc and where docs live. Use when adding/changing docs, adding routes or features that affect README/CLAUDE, or when the user asks where to document something or how docs are organized.
---

# Documentation Maintenance

Use this skill when you need to **add, move, or update documentation** or when **code changes affect existing docs** (e.g. new route, new env var, new deployment step). It defines the docs layout and when to touch which file.

---

## Docs structure (by use case)

All paths are under **`docs/`**. Index: **`docs/README.md`**.

| Use case            | Directory          | Purpose                                                      |
| ------------------- | ------------------ | ------------------------------------------------------------ |
| **Getting started** | `getting-started/` | Local setup, requirement intake, template, sample            |
| **Deployment**      | `deployment/`      | Runbook, CI/CD, Netlify, path-to-production gate, pre-launch |
| **Integrations**    | `integrations/`    | Credentials/env, Sentry source maps, Cursor ↔ backend MCP    |
| **Process**         | `process/`         | Git branch/PR workflow                                       |
| **Reference**       | `reference/`       | Tools/dependencies table, internationalization               |

---

## Key file locations

| Doc                         | Path                                                      | When to update                                                 |
| --------------------------- | --------------------------------------------------------- | -------------------------------------------------------------- |
| **Index**                   | `docs/README.md`                                          | When adding a new doc or new use-case section.                 |
| **Local setup**             | `docs/getting-started/setup.md`                           | New prerequisite, env var, or run step for local dev.          |
| **Requirement intake**      | `docs/getting-started/requirement-intake.md`              | Change in requirement types, skills, or rules.                 |
| **Requirement template**    | `docs/getting-started/requirement-format.md`              | New template section or field guide change.                    |
| **Sample requirement**      | `docs/getting-started/requirements/sample-requirement.md` | Update example to match template or conventions.               |
| **Runbook**                 | `docs/deployment/runbook-local-to-production.md`          | Change in dev → prod steps or order.                           |
| **CI/CD & Netlify**         | `docs/deployment/cicd-and-netlify.md`                     | New env var, GitHub secrets step, or GitHub workflow.          |
| **Full deployment**         | `docs/deployment/deployment-and-pre-launch.md`            | Pre-launch checklist, deploy options, or release workflow.     |
| **Path-to-production gate** | `docs/deployment/path-to-production.md`                   | Only if the gate criteria change (rare).                       |
| **Netlify CLI**             | `docs/deployment/netlify-cli-setup.md`                    | CLI steps, script name, or one-time setup.                     |
| **Credentials/env**         | `docs/integrations/credentials-and-env.md`                | New credential source or env var.                              |
| **Env schema / runbook**    | `docs/deployment/runbooks/environment-variables.md`       | Schema keys, auth switches, deploy overrides, troubleshooting. |
| **Sentry source maps**      | `docs/integrations/sentry-sourcemaps.md`                  | Sentry plugin or credential steps.                             |
| **Cursor ↔ backend MCP**    | `agent-os/docs/cursor-backend-mcp.md`                     | MCP endpoint or Cursor config.                                 |
| **Git workflow**            | `docs/process/trunk-based-workflow.md`                    | Branch strategy or PR flow.                                    |
| **Tools/dependencies**      | `docs/reference/tools-and-usage.md`                       | New package or usage change.                                   |
| **i18n**                    | `docs/reference/internationalization.md`                  | Client-side i18n plan or backend message contract.             |

---

## When code changes affect docs

| Change                                  | Update these                                                                                                                                                                                                                                                                                                           |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **New route or page**                   | README "Documentation" or "Adding a New Page" if we add a new pattern; CLAUDE if conventions change. Usually no new doc file.                                                                                                                                                                                          |
| **New env var**                         | `src/core/config/env-schema.ts`, `.env.example`, `pnpm tool:sync-env-example`, **`agent-os/skills/env-schema-add/SKILL.md`**, `docs/deployment/runbooks/environment-variables.md`, `docs/integrations/credentials-and-env.md`, and optionally `docs/deployment/cicd-and-netlify.md` if used in Netlify/GitHub Secrets. |
| **New deployment step or script**       | `docs/deployment/runbook-local-to-production.md` and/or `docs/deployment/netlify-cli-setup.md` or `cicd-and-netlify.md`.                                                                                                                                                                                               |
| **Pre-launch checklist change**         | `docs/deployment/deployment-and-pre-launch.md` (Pre-launch checklist section).                                                                                                                                                                                                                                         |
| **New dependency or usage**             | `docs/reference/tools-and-usage.md`.                                                                                                                                                                                                                                                                                   |
| **Requirement format or intake change** | `docs/getting-started/requirement-format.md`, `requirement-intake.md`, and `requirements/sample-requirement.md` as needed.                                                                                                                                                                                             |

---

## In-source doc tiers

Every subsystem has a required `<AREA>.OVERVIEW.md`. A **complex** subsystem may
add optional `<AREA>.PATTERNS.md` (idioms), `<AREA>.FLOWS.md` (runtime sequences),
and `<AREA>.POLICIES.md` (invariants) next to the code. Convention + templates:
`docs/reference/documentation-tiers.md`; worked exemplar: `src/shared/tenancy/`.
Add a tier only when it earns its keep — most areas need only OVERVIEW.

## Cross-references

- **README.md** — "Documentation" table must list all user-facing docs; link to `docs/README.md` and the correct path under `docs/`.
- **CLAUDE.md** — "Documentation" section must stay in sync with README and actual paths.
- **CONTRIBUTING.md** — References to requirement format and sample must use `docs/getting-started/...`.
- **Skills** — Any skill that references a doc path must use the paths in this skill (e.g. `docs/getting-started/requirement-format.md`).

---

## Adding a new doc

1. Decide **use case** (getting-started, deployment, integrations, process, reference).
2. Create the file under the right directory with a **lowercase kebab-case** name (e.g. `my-new-guide.md`).
3. Add an entry to **`docs/README.md`** in the matching section.
4. If the doc is linked from README or CLAUDE, add or update the link there.
5. Use **relative links** between docs (e.g. `[setup](getting-started/setup.md)` from within `deployment/` use `../getting-started/setup.md`).

---

## Summary

- **Index:** `docs/README.md` — single entry point by use case.
- **Naming:** Lowercase kebab-case filenames; directories match use case.
- **Sync:** When adding or moving a doc, update README, CLAUDE, and docs/README.md; keep skill references to doc paths correct.

---

## The PR description is a maintained document

A body written when the PR opened describes the **first commit**, not the branch.
On core-fe #217 it still claimed "110 files" (actual: 211), "layout shells are
eager" (a later commit made them lazy), a stale test count, and omitted whole
workstreams added since — a security pin, two new CI gates, three new components.

Before requesting review, reconcile the description against the branch:

```bash
git diff --name-only origin/main...HEAD | wc -l          # file count
git log --oneline origin/main..HEAD                      # workstreams added
git diff --name-only origin/main...HEAD | grep -E '^docs/'   # docs-touched list
```

Fix: file/test counts, any claim a later commit reversed, and missing sections.
**Do not overclaim in the title** — scope the wording to what actually shipped
("11-locale UI translations", not "full UI translations", when catalogs remain).

Also record in the body anything a future refresh would silently drop — e.g. an
edit to a vendored `components/ui/**` file, flagged as "re-apply after a shadcn
refresh".
