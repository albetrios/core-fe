import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

// Locks the single-aggregate merge gate: branch protection requires exactly
// { "Quality gate", "Checks" }, and the `quality-gate` job in pr-ci.yml `needs:`
// every merge-gating lane. Adding a lane => edit quality-gate.needs only, never
// the ruleset; a lane dropped from needs (silently un-gating it) fails here.
const ruleset = JSON.parse(
  readFileSync(join(process.cwd(), '.github/rulesets/main.json'), 'utf8'),
) as {
  rules: Array<{
    type: string;
    parameters?: { required_status_checks?: Array<{ context: string }> };
  }>;
};
const prCi = readFileSync(join(process.cwd(), '.github/workflows/pr-ci.yml'), 'utf8');

function requiredContexts(): string[] {
  const rule = ruleset.rules.find((entry) => entry.type === 'required_status_checks');
  return (rule?.parameters?.required_status_checks ?? [])
    .map((check) => check.context)
    .sort();
}

// Line-based extract of the `quality-gate` job's `needs: [ ... ]` list (no
// backtracking regex — mirrors the other ci-policy parsers).
function qualityGateNeeds(): string[] {
  const lines = prCi.split('\n');
  const start = lines.findIndex((line) => line.startsWith('  quality-gate:'));
  const needs: string[] = [];
  let inNeeds = false;
  for (let i = start + 1; i < lines.length; i++) {
    const trimmed = (lines[i] ?? '').trim();
    if (!inNeeds && trimmed.startsWith('needs:')) {
      inNeeds = true;
      continue;
    }
    if (inNeeds) {
      if (trimmed.includes(']')) break;
      const name = trimmed.replace(/[[\],]/g, '').trim();
      if (name) needs.push(name);
    }
  }
  return needs;
}

// Change detection must succeed before downstream skips can be trusted.
const MERGE_GATING_LANES = [
  'changes',
  'agent-os-gate',
  'biome',
  'lint',
  'knip',
  'format',
  'typecheck',
  'static-sync',
  'unit',
  'security-tests',
  'build-verify',
  'security-audit',
  'security-secrets',
  'security-sast',
  'security-iac',
  'dependency-review',
  'actionlint',
];

function qualityGateScalar(key: 'RESULTS' | 'run'): string {
  const lines = prCi.slice(prCi.indexOf('  quality-gate:')).split('\n');
  const start = lines.findIndex((line) => line.trim() === `${key}: |`);
  const header = lines[start] ?? '';
  const indentation = header.length - header.trimStart().length + 2;
  const content: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() && !line.startsWith(' '.repeat(indentation))) break;
    content.push(line.slice(indentation));
  }
  return content.join('\n');
}

describe('quality-gate aggregate policy', () => {
  it('branch protection requires exactly { Quality gate, Checks } — no per-lane contexts', () => {
    expect(requiredContexts()).toEqual(['Checks', 'Quality gate']);
  });

  it('no individual lane (e.g. the unit gate) is a separately-required context', () => {
    expect(requiredContexts()).not.toContain('unit / Unit + global');
  });

  it('quality-gate.needs covers every merge-gating lane', () => {
    const needs = new Set(qualityGateNeeds());
    const missing = MERGE_GATING_LANES.filter((lane) => !needs.has(lane));
    expect(missing).toEqual([]);
  });

  it('change detection has only the read permissions needed for checkout and PR files', () => {
    const job = prCi.split('  changes:')[1]?.split('    outputs:')[0] ?? '';
    expect(job).toContain(
      '    permissions:\n      contents: read\n      pull-requests: read',
    );
    expect(job).not.toContain(': write');
  });

  it('the aggregate evaluates every dependency result, including change detection', () => {
    const results = qualityGateScalar('RESULTS');
    const lanes = results.split('\n').filter(Boolean);
    expect(lanes.map((line) => line.split('=')[0]).sort()).toEqual(
      qualityGateNeeds().sort(),
    );
    for (const lane of qualityGateNeeds()) {
      expect(lanes).toContain(`${lane}=\${{ needs.${lane}.result }}`);
    }
    expect(qualityGateScalar('run')).toContain('while IFS=');
  });

  it.each([
    ['success', 'success', 0],
    ['success', 'skipped', 0],
    ['failure', 'skipped', 1],
    ['cancelled', 'skipped', 1],
    ['skipped', 'skipped', 1],
    ['', 'skipped', 1],
    ['unknown', 'skipped', 1],
    ['success', 'failure', 1],
    ['success', 'cancelled', 1],
    ['success', '', 1],
    ['success', 'unknown', 1],
  ])(
    'evaluates changes=%s and downstream=%s with exit %i',
    (changes, downstream, expected) => {
      const results = qualityGateScalar('RESULTS').replaceAll(
        /\$\{\{ needs\.([\w-]+)\.result \}\}/g,
        (_expression, lane: string) => (lane === 'changes' ? changes : downstream),
      );
      const result = spawnSync(
        '/bin/bash',
        ['-e', '-o', 'pipefail', '-c', qualityGateScalar('run')],
        {
          encoding: 'utf8',
          env: {
            RESULTS: results,
            GITHUB_STEP_SUMMARY: '/dev/null',
          },
        },
      );
      expect(result.error).toBeUndefined();
      expect(result.status, result.stdout + result.stderr).toBe(expected);
    },
  );
});

// A required status check resolves to the NEWEST check suite carrying its name.
// Most PR workflows fire at most once per head sha, so a concurrency
// cancellation can only land on a superseded commit — harmless, and worth the
// saved runner minutes. A workflow that ALSO listens to a non-push activity
// type (`edited`, `labeled`, …) can get two runs for ONE head sha:
// release-please force-pushes the branch and rewrites the PR body in the same
// instant, firing `synchronize` + `edited` together. Cancel between those and
// the live commit keeps a `cancelled` copy of a required context beside its
// successful twin, blocking the PR with every check green and nothing to point
// at (#319 sat blocked until the cancelled run was re-run by hand).
const WORKFLOWS_DIR = join(process.cwd(), '.github/workflows');
const PUSH_SCOPED_TYPES = new Set(['opened', 'synchronize', 'reopened']);

const workflows = readdirSync(WORKFLOWS_DIR)
  .filter((file) => file.endsWith('.yml') || file.endsWith('.yaml'))
  .map((file) => ({
    file,
    content: readFileSync(join(WORKFLOWS_DIR, file), 'utf8'),
  }));

// Job-level `name:` sits at four spaces; a step's is `      - name:`, so this
// cannot pick one up (line-based, like the other ci-policy parsers).
function jobNames(content: string): string[] {
  return [...content.matchAll(/^ {4}name: (.+)$/gm)].map((match) =>
    (match[1] ?? '').trim(),
  );
}

function pullRequestTypes(content: string): string[] {
  const lines = content.split('\n');
  const start = lines.indexOf('  pull_request:');
  if (start === -1) return [];
  for (const line of lines.slice(start + 1)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('types:')) {
      return [...trimmed.matchAll(/[\w-]+/g)]
        .map((match) => match[0])
        .filter((word) => word !== 'types');
    }
    // Any sibling key (another trigger, `branches:`, …) ends the block.
    if (trimmed && !line.startsWith('    ')) break;
  }
  return [];
}

describe('required contexts survive concurrency cancellation', () => {
  const required = new Set(requiredContexts());
  const owners = workflows.filter((workflow) =>
    jobNames(workflow.content).some((name) => required.has(name)),
  );

  it('every required context is owned by exactly one workflow job', () => {
    const owned = owners.flatMap((workflow) =>
      jobNames(workflow.content).filter((name) => required.has(name)),
    );
    expect(owned.sort()).toEqual([...required].sort());
  });

  it('no workflow owning a required context cancels runs when one head sha can produce two', () => {
    const offenders = owners
      .filter((workflow) =>
        pullRequestTypes(workflow.content).some((type) => !PUSH_SCOPED_TYPES.has(type)),
      )
      .filter((workflow) => /cancel-in-progress:\s*true/.test(workflow.content))
      .map((workflow) => workflow.file);
    expect(offenders).toEqual([]);
  });

  it('pr-governance owns `Checks`, listens past the push events, and declares no concurrency', () => {
    const governance = workflows.find((entry) => entry.file === 'pr-governance.yml');
    expect(governance).toBeDefined();
    expect(jobNames(governance?.content ?? '')).toContain('Checks');
    expect(pullRequestTypes(governance?.content ?? '')).toContain('edited');
    expect(governance?.content ?? '').not.toMatch(/^concurrency:/m);
  });

  it('pr-ci keeps its cancellation — it fires once per head sha', () => {
    const prCiWorkflow = workflows.find((entry) => entry.file === 'pr-ci.yml');
    const types = pullRequestTypes(prCiWorkflow?.content ?? '');
    expect(types.every((type) => PUSH_SCOPED_TYPES.has(type))).toBe(true);
    expect(prCiWorkflow?.content ?? '').toContain('cancel-in-progress: true');
  });
});
