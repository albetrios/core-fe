---
description: Merge a PR once CI is green and approvals are in
argument-hint: <pr-number>
allowed-tools: Bash(git*), Bash(gh*)
---

Merge PR **$ARGUMENTS** safely:

1. Confirm CI is green (both required contexts pass — **`Quality gate`** + **`Checks`**).
2. Confirm there are no merge conflicts with **`main`** (strict-up-to-date is off, so a stale branch is fine unless it conflicts).
3. Merge via `gh pr merge <n> --squash --delete-branch` (squash-only on `main`); the PR title becomes the squash commit.
4. Report the merge result.

Do not merge if any required check is failing or approvals are missing — report what is blocking instead.
