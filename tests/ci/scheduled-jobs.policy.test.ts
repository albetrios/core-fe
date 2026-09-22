import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

// Keeps the scheduled-jobs registry honest. Every `.github/workflows/*.yml` that
// declares `on: schedule` must appear in the enforced table of
// docs/reference/scheduled-jobs.md with its exact cron expression — and vice
// versa. Without this, the registry is just prose that drifts the moment a cron
// is added, removed, or retimed; the whole reason the registry exists is to be a
// home that can't silently rot.
const WORKFLOWS_DIR = join(process.cwd(), '.github/workflows');
const REGISTRY = join(process.cwd(), 'docs/reference/scheduled-jobs.md');

/** A 5-field cron expression (`m h dom mon dow`), the shape GitHub accepts. */
const CRON_SHAPE = /^(?:\S+\s+){4}\S+$/;

/** Every workflow that declares `on: schedule`, mapped to its sorted crons. */
function scheduledWorkflows(): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const file of readdirSync(WORKFLOWS_DIR)) {
    if (!(file.endsWith('.yml') || file.endsWith('.yaml'))) continue;
    // Drop comment lines so a `# cron:` in prose can't be read as a schedule.
    const lines = readFileSync(join(WORKFLOWS_DIR, file), 'utf8')
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('#'));
    if (!lines.some((line) => /^\s*schedule:/.test(line))) continue;
    const crons = lines
      .flatMap((line) => [...line.matchAll(/cron:\s*['"]([^'"]+)['"]/g)])
      .map((match) => match[1] as string)
      .sort();
    map.set(file, crons);
  }
  return map;
}

/**
 * Jobs registered in the doc table: a row registers one iff it carries a bare
 * workflow filename span (`foo.yml`, no path — so `.github/dependabot.yml` in the
 * informational section is ignored) AND at least one cron-shaped span.
 */
function registeredJobs(): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const line of readFileSync(REGISTRY, 'utf8').split('\n')) {
    if (!line.trimStart().startsWith('|')) continue;
    const spans = [...line.matchAll(/`([^`]+)`/g)].map((match) => match[1] as string);
    const file = spans.find((span) => /^[\w.-]+\.ya?ml$/.test(span));
    const crons = spans
      .filter((span) => CRON_SHAPE.test(span) && /[\d*]/.test(span))
      .sort();
    if (file && crons.length) map.set(file, crons);
  }
  return map;
}

describe('scheduled-jobs registry policy', () => {
  const scheduled = scheduledWorkflows();
  const registered = registeredJobs();

  it('finds scheduled workflows and registry rows (parser sanity)', () => {
    // The repo is known to run scheduled workflows and to register them — zero
    // on either side means a parser broke, not that the repo has none.
    expect(scheduled.size).toBeGreaterThan(0);
    expect(registered.size).toBeGreaterThan(0);
  });

  it('every scheduled workflow is registered in docs/reference/scheduled-jobs.md', () => {
    const missing = [...scheduled.keys()].filter((file) => !registered.has(file));
    expect(
      missing,
      `Scheduled workflow(s) not in the registry — add a row to docs/reference/scheduled-jobs.md:\n${missing.join('\n')}`,
    ).toEqual([]);
  });

  it('every registry row maps to a real scheduled workflow (no phantom rows)', () => {
    const phantom = [...registered.keys()].filter((file) => !scheduled.has(file));
    expect(
      phantom,
      `Registry row(s) with no scheduled workflow — remove them from docs/reference/scheduled-jobs.md:\n${phantom.join('\n')}`,
    ).toEqual([]);
  });

  it('the registered cron matches the workflow cron (cadence cannot drift)', () => {
    const mismatches: string[] = [];
    for (const [file, crons] of scheduled) {
      const doc = registered.get(file);
      if (doc && JSON.stringify(doc) !== JSON.stringify(crons)) {
        mismatches.push(
          `${file}: workflow ${JSON.stringify(crons)} vs registry ${JSON.stringify(doc)}`,
        );
      }
    }
    expect(
      mismatches,
      `Cron mismatch between workflow and registry:\n${mismatches.join('\n')}`,
    ).toEqual([]);
  });
});
