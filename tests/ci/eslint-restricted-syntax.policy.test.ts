import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

// Locks the two `no-restricted-syntax` guards in `eslint.config.mjs` against the
// REAL config — wiring (which files they reach) and behaviour (what they flag).
//
// Both were first proven with a throwaway probe file, which shows a rule fired
// once, on the day it was written (agent-os/skills/guard-authoring: "keep the
// probe — make it a test"). Flat config REPLACES a rule's options rather than
// merging them, so the realistic way to lose either guard is a future block that
// declares `no-restricted-syntax` again for the same files: nothing fails, the
// older selector simply stops existing. These tests are what would notice.
const RULE = 'no-restricted-syntax';

let eslint: ESLint;

beforeAll(() => {
  eslint = new ESLint({ cwd: process.cwd() });
});

/** Messages from the guard under test only — other rules have opinions too. */
async function restricted(source: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(source, { filePath });
  return (result?.messages ?? [])
    .filter((message) => message.ruleId === RULE)
    .map((message) => message.message);
}

describe('same-route navigation must state the hash (src)', () => {
  // Settings is a global HASH modal. TanStack Router resolves an OMITTED `hash`
  // to none, so "just patch the search" — `navigate({ to: '.', search })` — also
  // closed the modal: three call sites dropped a customer who had just finished
  // 3DS onto a bare dashboard.
  const FILE = 'src/shared/components/Probe/Probe.tsx';
  const PRELUDE = `
    declare const navigate: (options: Record<string, unknown>) => void;
    declare const router: { navigate: (options: Record<string, unknown>) => void };
  `;

  it.each([
    ['navigate()', "navigate({ to: '.', search: {}, replace: true });"],
    ['router.navigate()', "router.navigate({ to: '.', replace: true });"],
  ])('flags a hash-less same-route %s', async (_label, call) => {
    const messages = await restricted(`${PRELUDE}\n${call}\nexport {};`, FILE);

    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('must state the hash');
  });

  it.each([
    ['keeps the hash', "navigate({ to: '.', search: {}, hash: true, replace: true });"],
    ['clears it on purpose', "navigate({ to: '.', hash: '', replace: true });"],
    ['goes to another route', "navigate({ to: '/dashboard' });"],
    [
      'passes prepared options',
      'navigate(prepared);\ndeclare const prepared: Record<string, unknown>;',
    ],
  ])('allows a navigation that %s', async (_label, call) => {
    expect(await restricted(`${PRELUDE}\n${call}\nexport {};`, FILE)).toEqual([]);
  });

  it('leaves colocated tests alone — they call a mocked navigate', async () => {
    const source = `${PRELUDE}\nnavigate({ to: '.', replace: true });\nexport {};`;

    expect(
      await restricted(source, 'src/shared/components/Probe/Probe.test.tsx'),
    ).toEqual([]);
  });
});

describe('an instantaneous locator check must not swallow its own error (tests/e2e, tests/utils)', () => {
  // `isVisible()` already returns false for no match, so a trailing `.catch()` can
  // only hide a strict-mode violation (the locator matched more than one element).
  // That turned `test.skip(!(await x.isVisible().catch(() => false)))` into a
  // silent, unconditional skip: the org switcher's own specs ran no assertions on
  // any machine, and two product bugs sat behind them.
  const PRELUDE = `
    declare const page: { getByTestId: (id: string) => Locator };
    declare const response: { json: () => Promise<unknown> };
    interface Locator {
      isVisible: () => Promise<boolean>;
      isEnabled: () => Promise<boolean>;
      waitFor: (options: { state: string; timeout: number }) => Promise<void>;
    }
  `;

  it.each([
    ['isVisible()', "await page.getByTestId('x').isVisible().catch(() => false);"],
    ['isEnabled()', "await page.getByTestId('x').isEnabled().catch(() => false);"],
  ])('flags a swallowed %s in a spec and in a helper', async (_label, statement) => {
    const source = `${PRELUDE}\nexport async function probe() {\n  ${statement}\n}`;

    for (const filePath of ['tests/e2e/probe.e2e.test.ts', 'tests/utils/e2e-probe.ts']) {
      const messages = await restricted(source, filePath);
      expect(messages, filePath).toHaveLength(1);
      expect(messages[0]).toContain('silent skip');
    }
  });

  it.each([
    ['a bare check', "await page.getByTestId('x').isVisible();"],
    [
      'a TIMED wait — a timeout is the expected "no"',
      "await page.getByTestId('x').waitFor({ state: 'visible', timeout: 5 }).then(() => true).catch(() => false);",
    ],
    ['an unrelated best-effort catch', 'await response.json().catch(() => null);'],
  ])('allows %s', async (_label, statement) => {
    const source = `${PRELUDE}\nexport async function probe() {\n  ${statement}\n}`;

    expect(await restricted(source, 'tests/e2e/probe.e2e.test.ts')).toEqual([]);
  });
});

describe('the two guards do not reach each other’s files', () => {
  // Each block sets `no-restricted-syntax` for its own globs. If they overlapped,
  // the later one would REPLACE the earlier one for the shared files.
  it('app source is not held to the spec rule, and specs are not held to the app rule', async () => {
    const swallow = `
      declare const locator: { isVisible: () => Promise<boolean> };
      export async function probe() { await locator.isVisible().catch(() => false); }
    `;
    const navigation = `
      declare const navigate: (options: Record<string, unknown>) => void;
      navigate({ to: '.', replace: true });
      export {};
    `;

    expect(await restricted(swallow, 'src/lib/probe.ts')).toEqual([]);
    expect(await restricted(navigation, 'tests/e2e/probe.e2e.test.ts')).toEqual([]);
  });
});
