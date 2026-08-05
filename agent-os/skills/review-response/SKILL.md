---
name: review-response
description: Work a code-review document to completion — build a resolution matrix, and verify every finding against the code rather than trusting the review's own status labels. Use when handed a review report, a PR review thread, or a list of findings to address.
---

# Review response (core-fe)

A review document is **evidence, not truth**. On core-fe #217 the re-review's own
resolution matrix marked three findings resolved that were not:

| Finding | Review said | Reality |
| ------- | ----------- | ------- |
| G9 (lint gates) | ✅ **Added** | one gate's regex could not match its own target, and neither gate ran in CI — it enforced nothing |
| G7 (calendar wrapper) | ✅ **Fixed** | the wrapper existed; the `no-restricted-imports` guard the same document recommended was never added |
| G5 (placeholders) | "7 files" | actually **14** |

Taking the matrix at face value would have shipped three live defects under a
green checkmark. **Verify each claim yourself before marking it done.**

Related: `pre-pr-sweep` (the sweep before opening) · `guard-authoring` (why "gate
added" is not evidence) · `full-code-review` (producing a review).

---

## 1. Build a resolution matrix first

Enumerate every finding with a stable id before touching code. One row per
finding, and never collapse two findings into one row — they resolve
independently.

| ID | Severity | Claim | Verified? | Action | Commit |
| -- | -------- | ----- | --------- | ------ | ------ |

Reviews often use several id spaces at once (`F1–F12` forward, `G1–G9`
reverse-gap, `N1–N14` re-review). Keep them distinct; a later report frequently
*supersedes* an earlier one's status.

## 2. Verify before you act — and before you agree

For each finding, confirm the claim against the current code:

```bash
grep -n '<the thing>' <file>          # does the described code still exist?
sed -n '<line>,<line+10>p' <file>     # does it do what the review says?
```

Three outcomes, all normal:

- **Confirmed** — fix it.
- **Already fixed** — a later commit resolved it; note that, do not "re-fix".
- **Wrong or understated** — say so with evidence. A review claiming 7 instances
  when there are 14 is not a reason to fix 7.

Reviews marked ✅ deserve the same check as the open ones, especially for gates,
guards and sweeps — the three classes where "present" and "working" diverge.

## 3. When the review suggests a fix, evaluate it

The suggested fix is a hypothesis. On #217 three review suggestions had strictly
better alternatives:

| Review suggested | Chosen instead | Why |
| ---------------- | -------------- | --- |
| `grep -P` lookbehind for the regex bug | drop the redundant group | `-P` is absent from macOS BSD grep → local and CI would diverge |
| rethrow `ENOENT` when ripgrep is missing | remove the ripgrep dependency | the rethrow trades a silent false-pass for a possible hard CI failure |
| increment the counter at the boot call site | extract a `beginLocaleApply()` helper | the helper surfaced a **third** ungated path the review never mentioned |

Diverging is fine — **state the reason in the PR or the reply**, so the reviewer
can judge the substitution rather than wonder if you missed the point.

## 4. Report honestly

For each finding, report what happened, not that work occurred:

- Fixed → the commit, and the evidence (probe output, test name, gate result).
- Not fixed → why, and where it is tracked.
- Review was wrong → the correction, with the check that shows it.

Do not report a finding as resolved because you edited the file it named. That is
the failure mode this whole skill exists to prevent.

## 5. Close the loop on the PR itself

- Resolve GitHub review threads only after the fix is pushed and verified.
- Update the PR description — findings often change scope, and a body written
  before the review no longer describes the branch (see
  `documentation-maintenance`).
- If the review flagged a claim as overreaching (a title, a "full X" statement),
  fix the wording rather than defending it.

## Checklist

- [ ] Every finding has a row and a stable id
- [ ] Each claim verified against the code — including ones marked resolved
- [ ] Gates/guards/sweeps re-verified by probe, not by presence
- [ ] Divergences from the suggested fix explained
- [ ] Incorrect or understated findings corrected with evidence
- [ ] Threads resolved, PR body reconciled
