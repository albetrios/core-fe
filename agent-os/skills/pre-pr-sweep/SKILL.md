---
name: pre-pr-sweep
description: Catch the defect classes PR review actually finds — half-converted sweeps, incomplete deletions, ungated race paths, eager dynamic imports, stale derived artifacts and drifted PR bodies — before opening the PR. Use after implementation is done and before pushing or opening a pull request.
---

# Pre-PR sweep (core-fe)

Every item below is a defect class that **survived local gates and was caught by a
human reviewer** on a real core-fe PR. They are cheap to find deliberately and
expensive to find in review. Run this after implementation, before opening the PR.

This is a **detection checklist**: each item is a symptom plus the command that
finds it. Where another skill owns the topic, it is named — read that skill for
the fix rather than expecting the full reasoning here, so the two cannot drift
apart.

Related: `guard-authoring` (gates that actually gate) · `before-commit-guard`
(commit-time gate) · `project-health-check` (full audit) · `change-completeness`
rule (docs/tests/rules move with the code).

---

## 1. Half-converted sweeps

The most-repeated finding. A sweep is applied to one attribute or one call site
and stops, leaving the same component internally inconsistent.

Real instances: `aria-label` translated while the `title` three lines below stayed
English (screen reader said Arabic, tooltip said English); 12 of 13 files keyed;
80 physical CSS utilities converted but 8 left; the `ScheduleCalendar` civil-day
fix applied to event rows but not the month dropdown.

**Sweep rule: after converting a pattern, grep for the *sibling* forms of it and
for the *remaining* instances — do not trust the list you started with.**

```bash
# converted aria-label? the same components carry title= and placeholder=
grep -rn 'aria-label="' src --include='*.tsx' | grep -v components/ui/
grep -rn 'title="'      src --include='*.tsx' | grep -v components/ui/
grep -rn 'placeholder="' src --include='*.tsx' | grep -v components/ui/
```

If finishing the sweep is genuinely out of scope, translate/convert **whole
components**, never half of one, and declare the boundary in the PR body. A fully
untranslated component reads as "not done yet"; a half-translated one reads as a
bug.

## 2. Incomplete deletions

Removing a component is not removing a file. When deleting a surface, sweep every
place it was registered:

- `src/app/routes/routeTree.tsx` (lazy mount)
- `src/sw.ts` precache patterns and `vite.config.ts` manual chunk lists
- `src/shared/analytics/analytics.constants.ts` (events)
- store slices that only that surface set (`useUIStore.languageOpen`)
- locale JSON keys + the `*.constants.ts` key paths and test ids
- `docs/reference/project-tree.txt` and any doc describing it as live

`pnpm knip` catches unreferenced exports but **not** an orphaned locale key (the
parity gate compares locales against English, so a key unused in code survives in
all 11 packs) and **not** a constant referenced solely by its own test. A test is
not a consumer.

```bash
grep -rn '<RemovedThing>' src tests docs --include='*.ts' --include='*.tsx' --include='*.md'
pnpm knip
```

## 3. Guards that cover one path

A staleness/generation guard added to the obvious caller usually misses siblings.
`setLocale` got the guard; `onRehydrateStorage` and the single-locale build lock
did not — either could still clobber the document after a newer apply won.

**Rule: extract the guard into a helper and route *every* path through it.** Then
grep for the mutation it protects and confirm each call site goes via the helper.

```bash
grep -rn 'applyDocumentLocale(' src   # every caller must pass the staleness fn
```

The guard belongs at the **mutation boundary**, not in the caller — the caller can
only protect its own writes, not the document/i18next side effects behind an
`await`.

## 4. Module-scope `import()` is eager

A top-level dynamic import executes at module evaluation, so every chunk is
fetched even though one renders — silently deleting the code-split, and
`pnpm build:check` will not catch it. Fix with `onceAsync()`; the reasoning and
the retryability caveat live in **`bundle-performance`** (its owner — do not
restate them here).

```bash
# module-scope dynamic imports (column 0 = module scope; indented = inside a function)
grep -rnE '^(const|let|var) [^=]*= *(await )?import\(' src --include='*.ts' --include='*.tsx' \
  | grep -v '\.test\.'
```

## 5. Derived artifacts regenerated too early

`project-tree.txt`, TSDoc budget and locale parity are computed from the tree. Run
them **after** the last file is added, not before.

CI caught a stale `project-tree.txt` twice on one PR because `pnpm sync:check` ran
before two new constants files existed.

**Rule: `pnpm sync:check` is the last thing before commit, and re-run it after any
new file.**

## 6. Test-timeout pins invert when the suite floor moves

A per-test pin written under a lower default becomes a *reduction* when
`vitest.config.ts` raises `testTimeout` — causing the flakes it was added to
prevent. Owner: **`test-generation`**.

```bash
grep -rnE '\}, *[0-9_]+\);' src tests --include='*.test.ts*'   # audit vs the config floor
```

## 7. TSDoc detached by an interleaved comment

`pnpm tsdoc:check` associates a doc block with the **next** declaration, so an
`// eslint-disable-next-line` between them silently drops the summary while the
comment still looks present. The declare-then-export fix is in
**`test-generation`**.

## 8. i18n specifics

Owner: **`i18n-constants`** (copy) and **`locale-formatting`** (values). Sweep
for: keys missing from a locale pack, English prose leaking into `*.constants.ts`,
proper nouns or product nomenclature that should not be translated, and copy
concatenated across JSX nodes instead of interpolated into one key.

```bash
pnpm validate:i18n && pnpm validate:i18n-parity
```

## 9. Vendored `components/ui/**` edits

Vendored files are exempt from the token/logical/i18n gates, so an edit there is
invisible to them and will be lost on the next `shadcn` refresh. If unavoidable,
keep the original behaviour as the default and **note it in the PR body** as
"re-apply after a shadcn refresh".

## 10. The PR body drifts

A body written at open time describes the first commit, not the branch. Reconcile
it before requesting review — the procedure and the worked example are in
**`documentation-maintenance`**.

```bash
git diff --name-only origin/main...HEAD | wc -l   # vs the count the body claims
git log --oneline origin/main..HEAD               # workstreams added since
```

---

## Run order

```bash
pnpm lint > /tmp/lint.txt 2>&1; echo "EXIT=$?"   # never read a piped exit code
pnpm type-check
pnpm test
pnpm knip
pnpm sync:check            # LAST — after every file exists
pnpm deps:audit
```

Then the sweeps above, then reconcile the PR body.
