<!--
  PR title must follow Conventional Commits (used by release-please + commitlint):
    type(scope): short subject
  Examples: feat(auth), fix(organization), ci, docs, refactor(settings), perf(dashboard)

  Sections marked OPTIONAL: delete the whole section when it does not apply.
  Everything else stays — a section answering "None" is a claim; a missing one
  reads as an oversight.
-->

## Summary

<!-- AI: fill from commits / diff; link the issue (Closes #123) when applicable.
     Quantify scope when a count drove a decision, and give the RATIO, not just the
     total — "250 across 120 files, 193 (77%) prose" is the argument for the design. -->

- **What:** <!-- one line -->
- **Why:** <!-- one line -->
- **Risk:** <!-- low | medium | high — name the blast radius AND what is NOT touched -->

## What was broken

<!-- AI: numbered, most-impactful first. Describe each by CONSEQUENCE, not symptom:
     "a fork inherits the base maintainer as production approver" beats "CODEOWNERS
     was not generated". Write "N/A — new capability" when nothing was broken. -->

## Main design decision <!-- OPTIONAL -->

<!-- AI: include only when a reviewer would otherwise ask "why this way?".
     The alternatives considered and why this one won. End with the principle. -->

| Option | Chosen? | Rationale |
| ------ | ------- | --------- |
|        |         |           |

**Principle:** <!-- one line a reviewer can carry into the next PR -->

## Release type

<!--
  Pick exactly one. This drives release-please's bump on main.
  PR title prefix must match — `feat:` for minor, `fix:`/`perf:`/`refactor:` for patch,
  `<type>!:` (or `BREAKING CHANGE:` footer) for major.
  AI: feat=Minor, fix/perf/refactor=Patch, type!=Major, docs/ci/chore/test/style=No release
-->

- [ ] **Patch** — bug fix / perf / non-breaking refactor (`fix:`, `perf:`, `refactor:`)
- [ ] **Minor** — new feature, backward compatible (`feat:`)
- [ ] **Major (breaking)** — `feat!:` / `fix!:` / `BREAKING CHANGE:` footer
- [ ] **No release** — docs / ci / chore / test / style only

## Expected result

<!-- What you OBSERVED, citing the command or artifact that showed it — not what
     should happen. "Adopted a fresh clone: 6212 occurrences → 0, gates green" beats
     "should rename correctly". A reversible end-to-end trial (apply, verify, restore)
     is the strongest form. Include the reproduce command when one exists. -->

## Test plan

<!-- AI: tick only what actually ran. Leave a box unchecked and give the reason —
     an ambiguous tick is worse than an honest gap. Add measured numbers (coverage %,
     size budget) when the gate reports them; both redden CI after push. -->

- [ ] `pnpm validate` (lint + typecheck + unit tests)
- [ ] `pnpm biome:check` (second lint lane)
- [ ] `pnpm test:e2e` (when UI behavior changed)
- [ ] `pnpm validate:structure` (when pages/ layout changed)
- [ ] `pnpm docs:lint:changed` (when markdown changed)
- [ ] `pnpm sonar:scan` (deployed-surface changes; pre-push runs it automatically)
- [ ] Additional checks specific to this change (visual baselines, manual smoke, etc.)

## Rules this PR establishes <!-- OPTIONAL -->

<!-- AI: invariants a FUTURE change must not break, and where each is pinned
     (test / validator / gate). An unpinned rule is a comment, not a rule. -->

## Reviewer notes

<!-- AI: prefill so reviewers know where to focus; use "none" when not applicable.
     Prefix any field a reviewer must NOT skim with ‼️. -->

- **Architecture:** <!-- none | island/layer change in area X -->
- **Routing:** <!-- none | new route island | guard change -->
- **Security:** <!-- none | auth surface | token handling | redirect logic -->
- **Performance:** <!-- none | bundle impact | render hot path -->
- **Tests:** <!-- none | unit/e2e added | baselines updated -->
- **Docs touched:** <!-- none | list paths -->
- **Exemptions:** <!-- none | each allowlist/skip entry WITH its reason -->
- **Known gaps:** <!-- none | an unwritten test is a finding, not a silence -->

## Look hardest at <!-- OPTIONAL -->

<!-- AI: the one file to open first and the invariant it carries, plus anything that
     looks wrong but is not (why the odd approach is correct). Add a suggested review
     order only when the diff exceeds ~20 files. -->

## Not included (deliberate) <!-- OPTIONAL -->

<!-- AI: out of scope, with the reason for each, so a reviewer does not file them as
     omissions. Include pre-existing issues a reviewer may hit while testing. -->

## Before merge

<!-- The three things CI cannot catch. "None" is a valid answer to each — silence is not. -->

- **Breaking changes:** <!-- None | impact + migration steps (required when Release type = Major) -->
- **Env / secrets to set first:** <!-- None | KEY per environment + who sets it. Deploys inject env from GitHub Environments, so a key merged unset breaks the deploy AFTER CI goes green -->
- **Rollback:** <!-- revert-safe | needs <config or data step> first. -->
