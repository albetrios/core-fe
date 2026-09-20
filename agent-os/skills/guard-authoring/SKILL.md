---
name: guard-authoring
description: Author machine-enforced invariants that actually enforce — prove the gate fires, wire it into PR CI, avoid the ESLint flat-config replacement trap and external-binary silent passes. Use when adding or editing anything under tooling/validate/, an eslint.config.mjs restriction, or a static-sync CI step.
---

# Guard authoring (core-fe)

This repo holds its invariants with machine gates (`validate:tokens`,
`validate:testids`, parity gates, ruleset pin tests) rather than convention. That
only works if a new gate **can actually fail**. PR #217 shipped two gates that
looked complete and enforced *nothing*: one regex could not match its own target
string, and neither gate was referenced by any workflow.

**A gate you have not seen fail is not a gate. It is a green checkmark.**

Related: `code-quality-security` (what to enforce) · `platform-hygiene` (deploy
validators) · `pre-pr-sweep` (the pre-PR checklist this feeds).

---

## The four failure modes

### 1. The pattern cannot match its target

A gate whose regex is wrong prints OK forever. Real example — the logical-CSS
gate's alternative was nested inside two separator groups:

```sh
# BROKEN: the outer group consumes the space/quote, then the inner group
# demands a SECOND non-alpha char — which is the `l`/`r` of the utility itself.
'(^|["'\''[:space:]:!])(…|(^|[^a-z-])(left|right)-[0-9]|…)'
```

` left-0`, `"left-3` and `-right-8` never matched. Eight real RTL bugs shipped
under a green gate.

**Rule: every new or edited gate ships with a proof it fires.** Write a throwaway
probe file containing a known violation, run the gate, confirm it is flagged,
delete the probe:

```bash
cat > src/lib/__tmp-probe.tsx <<'EOF'
export const A = <div className="mr-2" />;
EOF
pnpm validate:logical   # MUST report src/lib/__tmp-probe.tsx
rm -f src/lib/__tmp-probe.tsx
pnpm validate:logical   # MUST be green again
```

Probe **both** directions when the gate has an allowlist: the violating case must
fail *and* the exempt case must pass. Paste the probe output into the PR
description — "gate added" is not evidence; "gate flags X, allows Y" is.

**A second way for the pattern to be unmatchable: quoting.** `theme-axis.sh` builds
its grep inside an `eval` that single-quotes the pattern:

```sh
hits=$(eval "grep -rEn '$pattern' src …")
scan "direct lucide-react import" "from 'lucide-react'"   # BROKEN
```

The `'` in the pattern closes that string early, the shell concatenates what is left,
and the regex that actually runs is `from lucide-react` — which matches nothing. That
check was dead from the day it was written, under a green gate, and ESLint's
`no-restricted-imports` was silently carrying the rule alone. Use `.` for the quote
(`from .lucide-react.`), or stop `eval`-ing patterns. It was found the moment the
gate got a test — which is the next rule.

**Keep the probe: make it a test.** A throwaway probe proves the gate fired _once_,
on the day it was written. A shell gate becomes permanently testable if its root is
injectable:

```sh
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
ALLOWLIST="$SCRIPT_DIR/theme-axis-allowlist.txt"   # always the REAL allowlist
cd "${THEME_AXIS_ROOT:-$SCRIPT_DIR/../..}" || exit 2
```

`tooling/validate/theme-axis.test.mjs` then writes ONE fixture file into a temp tree,
runs the gate against it, and asserts the exit code — every violating spelling, every
allowed one, prose in comments, the `ui/`/test/fixture exemptions, and that the OLDER
checks still fire through the same path. It runs in CI via `pnpm test:github-scripts`
(`tooling/validate/*.test.mjs`). Fixtures never go in the real `src/`: the gate would
then fail for everybody.

**Allowlist a fragment, not a file.** A substring allowlist matches the whole hit line
(`path:line:content`), so an entry can be either. A **file name** switches off _every_
check the gate has for that whole file, forever — including the checks added later. A
**class fragment** (`inset-1 rounded-full bg-gradient-to-tl`) exempts one line from one
check and stops matching the day someone edits that line, which is when the exception
deserves a second look anyway. Write the reason above each entry, and test that the
fragment does not leak: the allowed line passes, a second violation in the same file
still fails on its own line number.

**A grep gate reads lines, not data flow — say so in the script.** A look-back window
("a `data-slot=` within 5 lines above") catches the forgotten tag; it cannot follow a
class constant to the element it lands on, and a sibling's slot inside the window vouches
for its neighbor. That is an accepted limit, not a bug: document it next to the helper,
allowlist the class constants with their reason, and put the claim that actually matters
under a test that can measure it (for the theme axes: a computed-style sweep in a
browser — `tests/e2e/theme-shape.e2e.test.ts`).

### 2. The gate runs only locally

`tooling/validate/health-check.sh` is the **local** script. A gate added there and
nowhere else is skippable, which in this repo's posture means unenforced — the
next PR can reintroduce the violation and merge green.

**Rule: a gate is not landed until it appears in `.github/workflows/pr-ci.yml`.**
Add it to the existing `static-sync` lane:

```yaml
      - name: Logical CSS direction contract
        run: pnpm validate:logical
```

Use that lane rather than a new job — it already carries every docs↔code
invariant, is path-filtered on `src/**`, and feeds the required aggregate
`Quality gate` check. A new job would additionally need registering as a required
context in `.github/rulesets/main.json`.

Checklist for a new gate: `package.json` script · `health-check.sh` (local
ergonomics) · `pr-ci.yml` static-sync step (enforcement) · probe evidence.

### 3. ESLint flat config REPLACES rule options — it does not merge them

This one is silent and easy to miss. When two config objects both match a file and
both set the same rule, **the last one wins entirely**. Adding a pattern to the
app-wide block does nothing for files also matched by a later, narrower block.

core-fe declares `no-restricted-imports` in **many** blocks — the app-wide `src/**`
one plus per-layer blocks for `src/lib`, `src/core`, `src/core/http|rbac`,
`src/shared`, `src/shared/components/ui`, `src/pages` and the `LocalizedCalendar`
exemption. A restriction added only to the first is inert for all of
`src/shared/**` and `src/pages/**` — exactly the code most likely to violate it.
Enumerate the real set rather than trusting this list:

```bash
grep -n "'no-restricted-imports'" eslint.config.mjs
```

**Rule: when adding a `no-restricted-imports` entry, hoist the shared options into
a module-level constant and restate them in every block whose glob can reach the
banned import.** Order matters: an exemption block must sit **after** every block
that bans the thing it exempts.

```js
const RESTRICTED_IMPORT_PATHS = [ /* icons, sonner, … */ ];
const RESTRICTED_CALENDAR_PATTERN = { group: [...], message: '…' };

// app-wide
{ files: ['src/**/*.{ts,tsx}'], rules: { 'no-restricted-imports': ['error', {
    paths: RESTRICTED_IMPORT_PATHS, patterns: [RESTRICTED_CALENDAR_PATTERN] }] } },
// …layer blocks restate what they need…
// exemption LAST, or the layer block above overrides it
{ files: ['src/shared/components/LocalizedCalendar/**/*.{ts,tsx}'],
  rules: { 'no-restricted-imports': ['error', { paths: RESTRICTED_IMPORT_PATHS,
    patterns: [SHARED_LAYER_PATTERN] }] } },
```

Probe from **each** layer (`src/shared/…`, `src/pages/…`) plus the exempt path. A
probe placed only in `src/lib` proves nothing about `src/shared`.

**Keep the ESLint probe too.** A lint restriction is a gate like any other, and "I linted a
scratch file once" is the same one-day proof. `tests/ci/eslint-restricted-syntax.policy.test.ts`
lints **virtual file paths against the real config** —
`new ESLint({ cwd }).lintText(source, { filePath: 'src/…/Probe.tsx' })` — and filters the messages
by `ruleId`, so one test pins both halves: the **wiring** (which globs the rule reaches, and that
colocated tests are exempt) and the **behaviour** (what it flags, and the legitimate forms it must
leave alone). It works because this config has no type-aware parsing; a `projectService` config would
need real files. This is also the test that notices the replacement trap above: a later block that
re-declares `no-restricted-syntax` for the same files makes the older selector silently stop
existing, and nothing else fails. Mutation-check it the usual way — switch the rule `'off'` and watch
exactly the "flags" cases go red.

### 4. Shelling out to a binary that may not exist

`execFileSync('rg', …)` inside a `try/catch` that treats every error as "no
matches" cannot distinguish *no violations* from *ripgrep is not installed*. The
gate lies on any machine without it — and CI runners are not guaranteed to have
tools no other job requires.

**Rule: prefer a pure-Node scan over an external binary.** `readdirSync(dir,
{ recursive: true })` plus a per-line regex removes the dependency and the entire
silent-pass class. If a binary is genuinely required, rethrow on `ENOENT` — but
then you have added a CI tooling assumption that must be installed explicitly.

---

## Exit-code hygiene (how the author fools themselves)

```bash
pnpm lint | tail -5        # $? is TAIL's status — always 0
```

This reported a passing lint while 12 errors existed. Piping to `tail`/`grep`/`head`
discards the real status.

```bash
pnpm lint > /tmp/out.txt 2>&1; echo "EXIT=$?"   # capture, then inspect
set -o pipefail                                  # or make the pipe honest
```

**Never report a gate as passing based on a piped command.** Capture the exit code
or read the tool's own summary line.

---

## Filter precision — do not exclude whole lines

A gate that excludes an allowed idiom with a line-level `grep -v` hides any real
violation sharing that line:

```sh
| grep -v 'left-1/2'   # drops the WHOLE line, including an mr-2 next to it
```

Strip the allowed token from the line, then re-test the line:

```sh
| perl -ne 's{-?\b(left|right)-1/2\b}{}g; print if /'"$PATTERN"'/'
```

Probe it: a line containing both the idiom and a violation must still be flagged.

---

## Checklist

- [ ] Probe proves the gate **fails** on a synthetic violation
- [ ] Probe proves the gate **passes** on the exempt/allowed case
- [ ] Probed from every layer glob that can reach the violation
- [ ] Step added to `pr-ci.yml` static-sync (not just `health-check.sh`)
- [ ] `package.json` script added
- [ ] No external binary, or `ENOENT` rethrown and the tool installed in CI
- [ ] Allowed-idiom filtering is token-level, not line-level
- [ ] Exit codes captured, not read through a pipe
- [ ] Probe evidence pasted into the PR description
- [ ] The probe is kept as a `tooling/validate/<gate>.test.mjs` (root injectable; fixtures in a temp tree)
- [ ] No literal quote inside a pattern that is `eval`-ed inside quotes
