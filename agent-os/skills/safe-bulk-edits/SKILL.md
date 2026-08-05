---
name: safe-bulk-edits
description: Apply many mechanical edits across a codebase without silent misses — assert every replacement matches exactly once, edit JSON packs preserving key order, and keep staging atomic so a failed attempt does not leak into the next commit. Use for sweeps, renames, codemods, or editing locale/config files in bulk.
---

# Safe bulk edits (core-fe)

A 70-site sweep applied by hand or by a loose `sed` fails in the worst possible
way: **quietly**, on the two sites that did not match, leaving the diff looking
complete. These techniques come from a real core-fe sweep that touched 72 call
sites and 33 JSON files in one change.

Related: `pre-pr-sweep` (what to sweep for) · `i18n-constants` (locale packs) ·
`lint-guard` (post-edit cleanup).

Examples below are Python because a throwaway sweep script is not project code —
nothing is committed and no dependency is added. The same discipline in Node
(`node --input-type=module -e`, `JSON.parse`/`JSON.stringify`, which already
preserve key insertion order) is equally correct; **the assertions are the point,
not the language.** Anything committed to `tooling/` must be Node/TypeScript.

---

## 1. Assert every replacement matched exactly once

Never `str.replace(a, b)` in bulk without checking the match count. Write the
edit as data, then fail loudly before writing anything:

```python
REPLACEMENTS = [(old1, new1), (old2, new2), ...]

s = open(path).read()
for i, (old, new) in enumerate(REPLACEMENTS):
    n = s.count(old)
    if n != 1:
        raise SystemExit(f'REPLACEMENT {i} matched {n} times (expected 1):\n{old[:120]}')
    s = s.replace(old, new)
open(path, 'w').write(s)     # only after ALL assertions pass
```

Two properties matter:

- **Fail before writing.** The write happens after the loop, so a bad anchor
  leaves the file untouched — no half-applied sweep to unpick.
- **`!= 1`, not `== 0`.** A pattern matching twice is as wrong as matching zero
  times; you would silently edit an unintended site.

This caught a wrong import anchor on the first run of the real sweep. Without it,
the file would have been written with 3 of 5 edits applied.

## 2. Anchors change under you

Formatters run on commit (`lint-staged` → prettier/eslint `--fix`). An anchor
copied from a file *before* a commit may not exist after — table alignment,
import order and line wrapping all shift.

**Re-read the file and re-derive anchors after any commit or formatter run.**
When an assertion fails, look at the real current text rather than guessing:

```bash
grep -n '<distinctive fragment>' <file>
```

Prefer anchors that formatters do not touch: a full statement or a unique
identifier, not indentation or table padding.

## 3. Editing JSON packs without reformat churn

Naïve `json.dump` reorders keys and drops the trailing newline, producing a diff
where every line changed and the real edit is invisible to reviewers.

```python
import json, collections
raw = open(path).read()
had_newline = raw.endswith('\n')
data = json.loads(raw, object_pairs_hook=collections.OrderedDict)   # preserve order
data['group']['newKey'] = value
out = json.dumps(data, ensure_ascii=False, indent=2)                # keep non-ASCII
open(path, 'w').write(out + ('\n' if had_newline else ''))
```

- `object_pairs_hook=OrderedDict` — keeps existing key order.
- `ensure_ascii=False` — never escape non-Latin text into `\uXXXX`.
- Restore the trailing newline — otherwise every file shows a spurious last-line
  change.

**Verify the diff is what you intended before staging:**

```bash
git diff --stat <paths>          # expect N files, small line counts
git diff <one file> | head -20   # expect ONLY your keys
```

A 33-file locale edit should read as 33 small additions, not 33 rewrites.

## 4. Cross-file consistency before writing

When the same key set must land in many files (locale packs, per-service configs),
validate the shape **first**:

```python
en = set(translations['en'])
for locale, d in translations.items():
    assert set(d) == en, (locale, en ^ set(d))    # symmetric difference names the gap
```

Catching a missing key here is one line; catching it from a parity gate after
writing 11 files is a re-run.

## 5. Keep staging atomic

A failed commit can leave the index populated. If an earlier attempt ran
`git add -A` and the hook rejected the commit, those paths are **still staged** —
the next `git commit` with a narrow `git add` will silently include all of them.

Real consequence: one commit intended to hold 8 files captured all 40, with a
message describing only the first change.

```bash
git status --short          # inspect BEFORE committing
git reset                   # unstage everything, keep the working tree
git add <explicit paths>    # then stage deliberately
git show --stat HEAD        # after: confirm the commit holds what the message claims
```

If a commit did swallow unrelated work: `git reset --soft HEAD~1 && git reset`,
then re-stage in coherent groups. Splitting is cheap; a misleading commit message
survives in the history forever.

## 6. Let the formatter fix formatting

Do not hand-align imports or wrap lines in a scripted edit — insert plausible
text and run the project's fixer:

```bash
npx eslint --fix <paths>     # import order, simple-import-sort
npx prettier --write <paths>
```

Then verify with a **captured** exit code, never a piped one:

```bash
pnpm lint > /tmp/lint.txt 2>&1; echo "EXIT=$?"
```

## Checklist

- [ ] Every replacement asserted to match exactly once, write after all pass
- [ ] Anchors re-derived after any commit/formatter run
- [ ] JSON edited with preserved key order, `ensure_ascii=False`, trailing newline
- [ ] Cross-file key sets validated before writing
- [ ] `git status --short` inspected before every commit
- [ ] `git show --stat HEAD` confirms the commit matches its message
- [ ] Formatter ran; exit codes captured, not piped
