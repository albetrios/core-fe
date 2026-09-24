---
name: fe-full-code-review
description: Generate a full code review report across security, performance, code quality, readability, maintainability, and scalability. Use when the user asks to "run code review", "generate code review report", or "full code review".
---

# Full Code Review — Report Generation

Use this skill when the user asks to **generate a full code review report**, **run code review**, **code review report**, or similar. Produces a single markdown report covering all dimensions.

**CLI counterpart:** Run `pnpm report:code-review` from the project root to generate the report to `reports/code-review/full-code-review-report.md`. The script runs automated checks and greps; the AI skill augments with spot reads and nuanced findings when invoked by the user.

---

## When to Invoke

- User says: "run code review", "generate code review report", "full code review", "code review report"
- User asks to produce the same report as previously generated
- User wants a security/performance/quality/maintainability/scalability audit

---

## Option A — User Runs the Script (No AI)

1. User runs: `pnpm report:code-review`
2. Script outputs the report to `reports/code-review/full-code-review-report.md`
3. User reads the file

---

## Option B — AI Invokes the Skill (Full Execution)

When the user asks the AI to generate the report:

1. **Run the script** (or equivalent steps):

   ```bash
   pnpm report:code-review
   ```

   This runs lint, type-check, format, build, size, test, test:coverage, greps for architecture/dangerous patterns, and writes the report.

2. **If the user wants enhancements beyond the script:**
   - Spot-read key files (auth, HTTP, RBAC, sample pages)
   - Add nuanced findings to the report
   - Suggest fixes for any findings

3. **Output:** Point the user to `reports/code-review/full-code-review-report.md` (or paste a summary).

---

## Report Dimensions (from Plan)

| Dimension           | What the script checks                                                                                                              |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Security**        | Token storage (memory only), auth flow, open redirect, sanitization, CSP, env, RBAC, dangerous patterns (grep), gitleaks (optional) |
| **Performance**     | Bundle size, lazy loading, TanStack Query, HTTP config, assets, build warnings                                                      |
| **Code quality**    | Lint, type-check, format, architecture (grep), API client usage, TypeScript, ESLint security                                        |
| **Readability**     | Naming, file length, imports, comments, structure                                                                                   |
| **Maintainability** | Duplication, contracts, colocated tests, test quality, error handling                                                               |
| **Scalability**     | Route scaling, RBAC scaling, tenancy, API surface, state                                                                            |

---

## Reference

- **Plan:** Full Code Review Plan (see `reports/code-review/full-code-review-report.md` header)
- **Report output:** `reports/code-review/full-code-review-report.md`
- **Script:** `tooling/reports/code-review-report.mjs`
