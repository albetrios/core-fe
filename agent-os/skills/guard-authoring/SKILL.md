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
