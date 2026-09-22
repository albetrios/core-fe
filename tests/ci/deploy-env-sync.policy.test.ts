import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

// Locks the deploy-env seam: the client env a deploy VALIDATES must be the env
// the build MATERIALIZES into `.env.production.local`, in both the reusable
// deploy and the PR preview. Before this guard the two hand-enumerated lists
// drifted silently — diagnostics flags were validated but never shipped, and
// VITE_APP_ENV never reached deployed builds (production self-reported `local`
// to Sentry/PostHog).

const workflow = (name: string): string =>
  readFileSync(join(process.cwd(), '.github/workflows', name), 'utf8');

/** The `for key in <LIST>; do` key list of a materialize-and-build step. */
function materializeList(source: string): string[] {
  const match = /for key in ([\s\S]*?); do/.exec(source);
  if (!match?.[1]) throw new Error('no materialize loop (`for key in …; do`) found');
  return match[1].replaceAll('\\', ' ').split(/\s+/).filter(Boolean);
}

/**
 * Env keys assigned in the `env:` block of the named step. Scopes to the step's
 * own block first (until the next 6-space `- name:`/`- uses:` list item) so it
 * works whether the step declares `env:` before or after `run:`.
 */
function stepEnvKeys(source: string, stepName: string): string[] {
  const step = new RegExp(
    `- name: ${stepName}\\n([\\s\\S]*?)(?=\\n {6}- (?:name|uses):|$)`,
  ).exec(source);
  if (!step?.[1]) throw new Error(`step "${stepName}" not found`);
  const envSection = /(?:^|\n) {8}env:\n((?: {10}.*\n?)+)/.exec(step[1]);
  if (!envSection?.[1]) throw new Error(`no env block found for step "${stepName}"`);
  return [...envSection[1].matchAll(/^ {10}([A-Z0-9_]+):/gm)].map((m) => m[1] ?? '');
}

// Build-time (non-VITE) source-map upload keys plus the client Sentry keys —
// deliberately absent from the PR preview (previews never report to Sentry).
const SENTRY_KEYS = [
  'VITE_SENTRY_DSN',
  'VITE_SENTRY_TRACES_SAMPLE_RATE',
  'VITE_SENTRY_REPLAYS_SESSION_SAMPLE_RATE',
  'VITE_SENTRY_PROFILES_SAMPLE_RATE',
  'VITE_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE',
  'SENTRY_AUTH_TOKEN',
  'SENTRY_ORG',
  'SENTRY_PROJECT',
];

describe('deploy env sync policy', () => {
  const reusable = workflow('reusable-netlify-deploy.yml');
  const preview = workflow('preview.yml');

  it('reusable deploy materializes every key it validates', () => {
    const materialized = materializeList(reusable);
    const validated = stepEnvKeys(
      reusable,
      String.raw`Validate client env \(VITE_\*\)`,
    ).filter((key) => key.startsWith('VITE_'));
    for (const key of validated) {
      expect(materialized, `validated key ${key} must be materialized`).toContain(key);
    }
  });

  it('deployed builds receive VITE_APP_ENV (environment identity)', () => {
    for (const [name, source] of [
      ['reusable-netlify-deploy.yml', reusable],
      ['preview.yml', preview],
    ] as const) {
      expect(materializeList(source), `${name} must materialize VITE_APP_ENV`).toContain(
        'VITE_APP_ENV',
      );
    }
    // The identity comes from the resolved environment, not a hand-set secret.
    expect(reusable).toContain(
      // biome-ignore lint/suspicious/noTemplateCurlyInString: GitHub Actions expression syntax, asserted verbatim
      'VITE_APP_ENV: ${{ needs.resolve-environment.outputs.environment }}',
    );
    expect(preview).toContain('VITE_APP_ENV: development');
  });

  it('every materialized key is supplied by the build step env block', () => {
    for (const [source, stepName] of [
      [reusable, 'Build'],
      [preview, String.raw`Build \(development client env\)`],
    ] as const) {
      const envKeys = stepEnvKeys(source, stepName);
      for (const key of materializeList(source)) {
        expect(envKeys, `materialized key ${key} needs an env: entry`).toContain(key);
      }
    }
  });

  it('preview materializes exactly the reusable list minus the Sentry keys', () => {
    const expected = materializeList(reusable).filter(
      (key) => !SENTRY_KEYS.includes(key),
    );
    expect(materializeList(preview)).toEqual(expected);
  });
});
