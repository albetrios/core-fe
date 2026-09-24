import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const GATE = join(ROOT, 'tooling/validate/theme-axis.sh');

/**
 * Run the gate against a throwaway tree holding ONE app file.
 *
 * A gate that has never been watched failing is a green checkmark, not a gate
 * (agent-os/skills/fe-guard-authoring). The fixtures that make it fail cannot live
 * in the real `src/` — the gate would then fail for everybody — so the script
 * takes `THEME_AXIS_ROOT`. The allowlist still comes from beside the script.
 */
function runGateOn(source, relativePath = 'src/shared/components/Probe/Probe.tsx') {
  const root = mkdtempSync(join(tmpdir(), 'theme-axis-'));
  try {
    const file = join(root, relativePath);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${source}\n`);
    const result = spawnSync('sh', [GATE], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, THEME_AXIS_ROOT: root },
    });
    return { status: result.status, output: `${result.stdout}${result.stderr}` };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('validate:theme-axis passes on the current tree', () => {
  const result = spawnSync('sh', [GATE], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(
    result.status,
    0,
    `expected exit 0\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
  );
  assert.match(result.stdout, /Theme axis OK/);
});

// ── Check 5: off-scale corner radius ────────────────────────────────────────
// Neither spelling is driven by the Corner radius axis, so the element stays
// round when the rest of the app goes square.

const OFF_SCALE = [
  ['a bare `rounded`', '<div className="bg-muted rounded p-2" />'],
  ['a bare `rounded` closing the class string', "cn('p-2 rounded')"],
  ['a bare `rounded` opening the class string', "cn('rounded p-2')"],
  ['an arbitrary pixel radius', '<span className="rounded-[3px]" />'],
  ['a side-scoped arbitrary radius', '<span className="rounded-s-[12px]" />'],
  ['an arbitrary rem radius', '<span className="rounded-[0.4rem]" />'],
];

for (const [label, source] of OFF_SCALE) {
  test(`flags ${label}`, () => {
    const { status, output } = runGateOn(`export const probe = ${source};`);
    assert.equal(status, 1, output);
    assert.match(output, /off-scale radius/);
    assert.match(output, /Probe\.tsx/);
  });
}

const ON_SCALE = [
  [
    'every named step',
    '<div className="rounded-xs rounded-sm rounded-md rounded-lg rounded-xl rounded-2xl rounded-3xl rounded-4xl" />',
  ],
  [
    'side-scoped named steps',
    '<div className="rounded-s-2xl rounded-t-lg rounded-ee-md" />',
  ],
  [
    // Slotted, so this stays a check-5 case: an unslotted `rounded-full` is
    // check 6's business, below.
    '`rounded-full` and `rounded-none`',
    '<div data-slot="pill" className="rounded-full sm:rounded-none" />',
  ],
  [
    'an arbitrary radius backed by a token',
    '<div className="rounded-[var(--radius-lg)]" />',
  ],
  ['a calc() over a token', '<div className="rounded-[calc(var(--radius-lg)*9999)]" />'],
  [
    'responsive and state variants of named steps',
    '<div className="sm:rounded-lg hover:rounded-xl" />',
  ],
];

for (const [label, source] of ON_SCALE) {
  test(`allows ${label}`, () => {
    const { status, output } = runGateOn(`export const probe = ${source};`);
    assert.equal(status, 0, output);
  });
}

test('does not read prose as a class — comments say "rounded" too', () => {
  const source = [
    '// the corners are rounded here; a bare `rounded` is described, not used',
    '/* rounded grouped bars */',
    ' * "Weekly usage" — rounded grouped bars of sessions vs API calls per week,',
    'export function Probe() {',
    '  return (',
    '    <>',
    '      {/* rounded on purpose */}',
    '      <div className="rounded-md" />',
    '    </>',
    '  );',
    '}',
  ].join('\n');

  const { status, output } = runGateOn(source);
  assert.equal(status, 0, output);
});

test('exempts vendored ui/, tests and fixtures — like every other check in the gate', () => {
  const violation = 'export const probe = <div className="rounded-[2px] rounded" />;';

  for (const path of [
    'src/shared/components/ui/chart.tsx',
    'src/shared/components/Probe/Probe.test.tsx',
    'src/pages/probe/probe.fixtures.ts',
  ]) {
    const { status, output } = runGateOn(violation, path);
    assert.equal(status, 0, `${path}\n${output}`);
  }
});

// ── Check 6: `rounded-full` the Sharp shape cannot reach ────────────────────
// Round-by-design is a SHAPE decision. Without a slot in the Sharp list the
// element is the one round thing left in a square app.

const UNREACHABLE = [
  [
    'a chip with no slot',
    '<span className="bg-muted rounded-full px-2 py-0.5 text-xs">New</span>',
  ],
  [
    'an icon disc with no slot',
    '<div className="bg-primary/10 flex size-12 items-center justify-center rounded-full" />',
  ],
  ['a track with no slot', '<span className="bg-muted block h-1 w-32 rounded-full" />'],
  [
    'a 12px disc — past the 10px a status dot may be',
    '<span className="bg-success size-3 rounded-full" />',
  ],
  [
    'a `size-20` disc — not a `size-2` dot',
    '<span className="bg-muted size-20 rounded-full" />',
  ],
];

for (const [label, source] of UNREACHABLE) {
  test(`flags ${label}`, () => {
    const { status, output } = runGateOn(`export const probe = ${source};`);
    assert.equal(status, 1, output);
    assert.match(output, /Sharp shape cannot square/);
    assert.match(output, /Probe\.tsx/);
  });
}

const REACHABLE = [
  [
    'its own slot on the line above',
    '<span\n  data-slot="pill"\n  className="bg-muted rounded-full px-2" />',
  ],
  [
    'its own slot on the same line',
    '<span data-slot="pill" className="bg-muted rounded-full px-2" />',
  ],
  [
    'a <Button>, which brings data-slot="button"',
    '<Button\n  size="sm"\n  className="h-9 rounded-full px-4"\n/>',
  ],
  [
    'a <Skeleton>, which brings data-slot="skeleton"',
    '<Skeleton className="h-5 w-8 rounded-full" />',
  ],
  [
    'a <Badge> and an <Avatar>',
    '<><Badge className="rounded-full" /><Avatar className="rounded-full" /></>',
  ],
  ['a status dot of at most 10px', '<span className="bg-primary size-2 rounded-full" />'],
  [
    'a 10px dot spelled `size-2.5`',
    '<span className="ring-border size-2.5 rounded-full ring-1" />',
  ],
  [
    'a dot spelled `h-2 w-2`',
    '<span className="bg-success relative inline-flex h-2 w-2 rounded-full" />',
  ],
  [
    'a blurred glow',
    '<div className="bg-primary/10 absolute size-56 rounded-full blur-3xl" />',
  ],
  [
    'the ping halo behind a dot',
    '<span className="bg-success absolute h-full w-full animate-ping rounded-full" />',
  ],
  [
    'a pseudo-element marker',
    "cn('relative before:absolute before:h-5 before:w-0.5 before:rounded-full')",
  ],
];

for (const [label, source] of REACHABLE) {
  test(`allows ${label}`, () => {
    const { status, output } = runGateOn(`export const probe = ${source};`);
    assert.equal(status, 0, output);
  });
}

test('a slot six lines up is out of reach — the window is the element, not the file', () => {
  const source = [
    'export const probe = (',
    '  <div data-slot="card">',
    '    <p>one</p>',
    '    <p>two</p>',
    '    <p>three</p>',
    '    <p>four</p>',
    '    <p>five</p>',
    '    <span className="bg-muted rounded-full px-2" />',
    '  </div>',
    ');',
  ].join('\n');

  const { status, output } = runGateOn(source);
  assert.equal(status, 1, output);
  assert.match(output, /Sharp shape cannot square/);
});

test('an allowlisted fragment exempts its line and nothing else in the file', () => {
  // The class-constant exceptions are FRAGMENTS for this reason: a file name in
  // the allowlist would switch off every check for the whole file.
  const allowed =
    "const base = 'flex size-7 items-center justify-center rounded-full text-xs transition-all';";
  assert.equal(runGateOn(allowed).status, 0);

  const { status, output } = runGateOn(
    `${allowed}\nexport const probe = <span className="bg-muted rounded-full px-2" />;`,
  );
  assert.equal(status, 1, output);
  assert.match(output, /Probe\.tsx:2:/);
  assert.doesNotMatch(output, /Probe\.tsx:1:/);
});

// ── Check 7: spacing that ignores the Density axis ──────────────────────────
// A scale step is `calc(var(--spacing) * n)` and Density sets `--spacing`. A
// literal is pixel-identical on the default look, which is why nobody notices.

const FIXED_SPACING = [
  ['a fixed padding', '<div className="p-[24px]" />'],
  ['a fixed logical padding', '<div className="ps-[13px] pe-[0.75rem]" />'],
  ['a fixed gap', '<div className="flex gap-[6px]" />'],
  ['a fixed margin behind a variant', '<div className="sm:mt-[18px]" />'],
  ['a negative fixed margin', '<div className="-mx-[12px]" />'],
];

for (const [label, source] of FIXED_SPACING) {
  test(`flags ${label}`, () => {
    const { status, output } = runGateOn(`export const probe = ${source};`);
    assert.equal(status, 1, output);
    assert.match(output, /ignores the Density axis/);
  });
}

const SCALED_SPACING = [
  ['scale steps', '<div className="px-6 pt-6 pb-3 gap-2 sm:mt-4 -mx-3" />'],
  ['spacing built on a variable', '<div className="pb-[calc(var(--floating-bottom-offset)+0.75rem)] p-[var(--gutter)]" />'],
  ['fixed SIZES and OFFSETS — not spacing', '<div className="h-[640px] w-[calc(100%-2rem)] top-[20%] -bottom-[9px] max-w-[960px]" />'],
];

for (const [label, source] of SCALED_SPACING) {
  test(`allows ${label}`, () => {
    const { status, output } = runGateOn(`export const probe = ${source};`);
    assert.equal(status, 0, output);
  });
}

// ── Check 4: card / popover shells need a slot ──────────────────────────────

test('flags a bg-card shell with no data-slot (check 4)', () => {
  const { status, output } = runGateOn(
    'export const probe = <div className="bg-card border p-4" />;',
  );
  assert.equal(status, 1, output);
  assert.match(output, /bg-card\/bg-popover without data-slot/);
});

test('allows a bg-popover shell whose data-slot sits within four lines above', () => {
  const source = [
    'export const probe = (',
    '  <div',
    '    data-slot="surface"',
    '    data-testid="probe"',
    '    className="bg-popover border p-4"',
    '  />',
    ');',
  ].join('\n');

  assert.equal(runGateOn(source).status, 0);
});

// ── The older checks still fire through the injected root ───────────────────

test('still flags a hardcoded shadow (check 1)', () => {
  const { status, output } = runGateOn(
    'export const probe = <div className="shadow-lg" />;',
  );
  assert.equal(status, 1, output);
  assert.match(output, /hardcoded shadow/);
});

test('still flags a direct lucide-react import (check 3)', () => {
  const { status, output } = runGateOn("import { X } from 'lucide-react';");
  assert.equal(status, 1, output);
  assert.match(output, /lucide-react/);
});

test('fails closed when the injected root has no tree to scan', () => {
  const result = spawnSync('sh', [GATE], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, THEME_AXIS_ROOT: join(tmpdir(), 'theme-axis-does-not-exist') },
  });
  assert.notEqual(result.status, 0);
});
