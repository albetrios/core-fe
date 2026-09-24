---
description: Watch a PR — triage CI failures and review comments until it is green
argument-hint: <pr-number>
allowed-tools: Bash(git*), Bash(gh*), Bash(pnpm*)
---

Watch PR **$ARGUMENTS** and keep it merge-ready:

1. Check PR status with `gh pr view <n> --json statusCheckRollup,reviewDecision,mergeable,state` and subscribe to updates (re-check after pushes; do not poll with long `sleep` loops).
2. On a CI failure: inspect the failing lane in the **`Quality gate`** rollup (the second required context, **`Checks`**, aggregates the CodeQL/Trivy checks) (see `.github/workflows/pr-ci.yml`), diagnose root cause, push a fix to the branch, update the status checklist.
3. On a review comment: if the fix is unambiguous, apply + push; if not, ask the user.
4. On a merge conflict or new push: rebase or resolve against **`main`**, then re-verify with `/fe-validate` or `pnpm health`.

Keep going until the PR is MERGED or CLOSED, or the user says stop. Reply only when something needs the user; otherwise let the PR diff be the record.
