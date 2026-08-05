---
name: pre-pr-sweep
description: Catch the defect classes PR review actually finds — half-converted sweeps, incomplete deletions, ungated race paths, eager dynamic imports, stale derived artifacts and drifted PR bodies — before opening the PR. Use after implementation is done and before pushing or opening a pull request.
---

# Pre-PR sweep (core-fe)

Every item below is a defect class that **survived local gates and was caught by a
human reviewer** on a real core-fe PR. They are cheap to find deliberately and
expensive to find in review. Run this after implementation, before opening the PR.

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

```ts
const sidebarImport = import('./variants/AppLayoutSidebar.tsx');   // fetches NOW
```

A top-level dynamic import executes at module evaluation, so every variant chunk
is fetched even though one renders — silently deleting the code-split. `pnpm
build:check` will not catch it: that tripwires the **static preload graph**, not
runtime fetches.

Use `onceAsync()` (`src/lib/lazy-module.ts`) — same shared module promise, fetch
deferred to first render or an explicit preload, and a rejection is not cached so
a failed chunk fetch stays retryable.

```bash
grep -rn "^const .* = import(" src   # module-scope dynamic imports
```

## 5. Derived artifacts regenerated too early

`project-tree.txt`, TSDoc budget and locale parity are computed from the tree. Run
them **after** the last file is added, not before.

CI caught a stale `project-tree.txt` twice on one PR because `pnpm sync:check` ran
before two new constants files existed.

**Rule: `pnpm sync:check` is the last thing before commit, and re-run it after any
new file.**

## 6. Test-timeout pins invert when the suite floor moves

Per-test pins (`}, 15_000)`) written when the default was 5s became *reductions*
once `vitest.config.ts` raised `testTimeout` to 30s — causing the flakes they were
meant to prevent.

```bash
grep -rnE '\}, *[0-9_]+\);' src tests --include='*.test.ts*'   # audit vs the config floor
```

Prefer the project-level `testTimeout`; delete per-test pins below it.

## 7. TSDoc detached by an interleaved comment

The coverage extractor needs the doc block **adjacent** to the declaration. An
`// eslint-disable-next-line` between them silently drops the summary and busts
the budget.

```ts
/** Summary. */
// eslint-disable-next-line react-refresh/only-export-components  ← detaches it
export const thing = …
```

Declare first with its TSDoc, then export separately inside a block
`/* eslint-disable */ … /* eslint-enable */`.

## 8. i18n specifics

- Every new English key must land in **all 11 locale packs** — `validate:i18n-parity`
  compares against English, so a missing key fails but an *unused* key does not.
- `*.constants.ts` holds **key paths only**, never English prose.
- Do **not** translate proper nouns (font families) or product nomenclature
  (preset/accent names). Keying them is fine; inventing per-locale values is not.
- Example/technical values (`example.com`, an `acme` slug, a placeholder brand)
  should be keyed but may keep one value across locales — say so in the PR.
- Interpolated copy needs one key with `{{placeholders}}`, never string
  concatenation across JSX nodes (word order differs per language).

## 9. Vendored `components/ui/**` edits

Vendored files are exempt from the token/logical/i18n gates, so an edit there is
invisible to them and will be lost on the next `shadcn` refresh. If unavoidable,
keep the original behaviour as the default and **note it in the PR body** as
"re-apply after a shadcn refresh".

## 10. The PR body drifts

A body written at open time describes the first commit, not the branch. Before
requesting review, re-read it against `git diff --name-only origin/main...HEAD`
and fix: file counts, claims that a later commit reversed ("shells are eager"),
stale test numbers, and whole workstreams added since (security pins, new gates,
new components). Overclaiming in the title is a review finding of its own.

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
