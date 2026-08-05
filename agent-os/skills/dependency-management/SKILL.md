---
name: dependency-management
description: Safely add, update, remove, or pin npm dependencies in core-fe — atomic lockfile commits, pnpm.overrides for transitive pins, audit triage, and license plus bundle-impact checks. Use when acting on a dependency-auditor finding or changing package.json / pnpm-lock.yaml.
---

# Dependency management

The procedural counterpart to the `dependency-auditor` agent: the agent finds,
this skill fixes. Use it whenever `package.json` or `pnpm.overrides` changes.

## The one hard rule — atomic lockfile

A `package.json` dependency (or `pnpm.overrides`) change and its
`pnpm-lock.yaml` regeneration are **one commit**. Run `pnpm install` and stage
both together. A desynced lockfile fails every frozen-install CI job
(`ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`) and reds open release-please PRs. The
before-commit guard blocks it locally via `pnpm run validate:lockfile`.

## Procedure

1. **Add / update:** `pnpm add <pkg>` (or edit the version), then `pnpm install`
   to regenerate the lockfile. Never hand-edit `pnpm-lock.yaml`.
2. **Pin a transitive/vulnerable dep:** add a `pnpm.overrides` entry in
   `package.json` (not a direct dependency), then `pnpm install`. This is how a
   CVE in a nested package is resolved without waiting on the parent.
3. **Audit triage:** `pnpm deps:audit` (all) and `pnpm deps:audit:prod`
   (shipped). Fix high/critical; for accepted risk, document why. Vulnerability
   policy and CI wiring live in `agent-os/skills/code-quality-security/SKILL.md`.
4. **License + bundle impact of a new dep:** confirm the license is compatible
   and check the first-paint cost — if it is heavy or client-shipped, prefer a
   dynamic import and defer to `agent-os/skills/bundle-performance/SKILL.md`.
5. **Remove:** `pnpm remove <pkg>` + `pnpm install`; run `pnpm knip` to catch
   now-dead code/exports the removal orphaned.

## Verify

- `pnpm run validate:lockfile` — lockfile in sync with `package.json`.
- `pnpm deps:audit` — no unaccepted high/critical vulnerabilities.
- `pnpm knip` — no dead code left by a removal.

## Related

Skills: `code-quality-security` (audit policy), `platform-hygiene` (knip,
deploy validators), `bundle-performance` (size impact). Agent:
`dependency-auditor` (read-only finder).

---

## Advisory triage — a HIGH in a dev-only transitive dep still fails CI

`pnpm deps:audit` gates on **high+** across the whole tree, not just production
deps. A transitive advisory reached through a dev tool (an MCP server, a test
browser driver) reds the Security audit lane exactly like a runtime one.

Flow:

```bash
pnpm deps:audit                 # read the advisory + the vulnerable range
pnpm why <package>              # find which parent(s) pull it in
```

If no parent has published a fix, pin the transitive dep with a `pnpm.overrides`
entry — **not** a direct dependency, which would misrepresent the dependency graph:

```jsonc
"pnpm": { "overrides": { "ip-address": ">=10.4.0 <11" } }
```

Bound the range (`>=x <major+1`) so the override does not silently absorb a future
breaking major. Then `pnpm install`, and commit `package.json` + `pnpm-lock.yaml`
**in the same commit** — a desynced lockfile fails every frozen-install job and
reds any open release-please PR.

Verify: `pnpm run validate:lockfile` then `pnpm deps:audit` (expect
`none at high+`). If a lockfile error appears while the lockfile is fine, check
the Node version first — see `before-commit-guard`.
