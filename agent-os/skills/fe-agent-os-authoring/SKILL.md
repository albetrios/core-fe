---
name: fe-agent-os-authoring
description: Add, rename or remove an agent-os skill or rule without breaking the integrity gates — every registration surface in one checklist, in the order that keeps agent-os:check, triggers:strict and generate:check green. Use when creating or editing anything under agent-os/skills or agent-os/rules.
---

# Agent-os authoring (core-fe)

Adding a skill touches **eight** surfaces. Miss one and `pnpm agent-os:check` or
`pnpm sync:check` fails — usually with a message about a count or a path, not
about the surface you forgot.

The fe-skill-registry's own maintenance note lists only some of them. This is the
complete set.

Command: `/fe-agent-os-sync` · Related: `fe-documentation-maintenance` ·
`fe-guard-authoring` (the gates themselves).

---

**Naming:** every agent-os item this repo owns (skill folder, agent file, command file,
rule file) starts with `fe-`, so names stay unique when core-be (`be-`) is loaded in the
same session. Vendored skills keep their upstream names. `pnpm agent-os:check` enforces
both (`name-prefix`), and a skill's frontmatter `name` must equal its folder.

## Adding a skill — all eight surfaces

| # | Surface | What to add |
| - | ------- | ----------- |
| 1 | `agent-os/skills/<name>/SKILL.md` | frontmatter `name` (**must equal the directory name**) + `description` |
| 2 | `skill-registry/SKILL.md` — heading | bump `## Skill Inventory (N skills)` |
| 3 | `skill-registry/SKILL.md` — Decision Tree | a `- ...<when> -> **<name>**` line |
| 4 | `skill-registry/SKILL.md` — Task → Required Skills matrix | a row naming the chain it belongs to |
| 5 | `skill-registry/SKILL.md` — Skill Inventory | full entry: Path, Purpose, Trigger keywords, Key behaviors, Related skills |
| 6 | `skill-registry/SKILL.md` — Cross-Reference by File Area | map the file globs that should trigger it |
| 7 | `agent-os/skills/groups.json` | exactly **one** group — the check asserts every skill is grouped exactly once |
| 8 | `agent-os/rules/fe-skill-router.mdc` | routing-table row, and a numbered clause if it has an invocation trigger |

Plus, when the skill is part of an ordered pipeline:

- `agent-os/skills/chains.json` — every `steps`/`optional` entry must reference a
  real skill directory.
- `agent-os/docs/skill-triggers.md` — the file→skill map the hooks consult
  (by-intent table and/or file-area table).

**A new rule** (`agent-os/rules/*.mdc`) needs frontmatter `description` plus
`alwaysApply: true` if it should always load; reference it from the skill it
governs and from `fe-skill-router.mdc`.

## Order of operations

Derived artifacts are computed from the tree, so they go **last**:

```bash
# 1. write SKILL.md files and edit the registration surfaces
# 2. gates
pnpm agent-os:check              # frontmatter, names, registry paths, groups, chains
pnpm agent-os:triggers:strict    # routing cases still resolve
pnpm agent-os:generate:check     # per-agent wiring in sync (.claude/.cursor/.codex)
# 3. ONLY NOW regenerate the tree — new files changed it
pnpm tool:project-structure-tree
pnpm sync:check                  # all 9, including project-tree docs
```

Running `sync:check` before the last file exists is how a stale
`project-tree.txt` reaches CI. It happened twice while authoring this very
bundle.

## Reading gate failures

| Message | Actual cause |
| ------- | ------------ |
| `skills: N  skill dirs: M` mismatch | a directory without `SKILL.md`, or a `SKILL.md` missing frontmatter |
| registry path does not resolve | the Inventory entry's `**Path:**` does not match the real directory |
| claimed count mismatch | the `## Skill Inventory (N skills)` heading was not bumped |
| skill not grouped / grouped twice | `groups.json` |
| chain step references unknown skill | `chains.json` typo |
| `project-tree.txt is out of date` | regenerate **after** the last file |

A skill's frontmatter `name` must equal its folder, vendored skills included, and a
mismatch fails `agent-os:check`. The two Vercel skills `composition-patterns` and
`react-best-practices` declared `vercel-…` names upstream; their `name:` lines are set to
the folder, which is also their upstream install id. They are not in `skills-lock.json`.

## Renaming or removing

Removing a skill means removing it from **all** the surfaces above, not just
deleting the directory — a stale registry entry fails the path check and a stale
`groups.json` entry fails the grouping check. Grep first:

```bash
grep -rn '<skill-name>' agent-os/ docs/ CLAUDE.md
```

## Writing the SKILL.md itself

- `description` is what the router matches on — lead with the **trigger
  condition**, not a restatement of the title.
- Prefer a concrete failure the project actually hit over generic advice; a rule
  with a war story behind it survives review.
- Include the verification command. A skill that says what to do but not how to
  check it produces the "looks done" failures `fe-pre-pr-sweep` exists to catch.
- Keep the shape of neighbouring skills: short intro, tables over prose, a
  Verify/Checklist section at the end.

## Verify

```bash
pnpm agent-os:check && pnpm agent-os:triggers:strict && pnpm agent-os:generate:check
pnpm sync:check
```

`pnpm docs:lint` **excludes** `agent-os/**`, so markdown style there is not
linted — match the surrounding files by hand.
