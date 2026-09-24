---
description: Ship the current branch — push, open a PR to main, then watch to green
argument-hint: [optional PR title]
allowed-tools: Bash(git*), Bash(gh*), Bash(pnpm*)
---

Ship the current work as one flow (push → PR → watch → merge):

1. **/fe-open-pr** — push the branch and open the PR to **`main`** (title: **$ARGUMENTS** if given).
2. **/fe-watch-pr** — triage CI failures and review comments in a loop until both required contexts — **`Quality gate`** + **`Checks`** — are green.
3. When CI is green and approvals are in, **/fe-merge-pr** (squash) — or stop and report if anything is blocking.

Escalate only on ambiguous review feedback or an irreversible step. Otherwise drive it to merged unattended.
