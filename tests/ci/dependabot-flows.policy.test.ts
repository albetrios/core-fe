import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

const autoMerge = readFileSync(
  join(ROOT, '.github/workflows/dependabot-auto-merge.yml'),
  'utf8',
);
const triage = readFileSync(
  join(ROOT, '.github/workflows/dependabot-ci-triage.yml'),
  'utf8',
);
const dependabotConfig = readFileSync(join(ROOT, '.github/dependabot.yml'), 'utf8');

// The approval IS the manual gate: only the low-risk npm-non-major group may
// auto-merge, and only after a maintainer approves. Everything else is manual.
describe('dependabot auto-merge policy', () => {
  it('arms only on a submitted approval review', () => {
    expect(autoMerge).toContain('pull_request_review:');
    expect(autoMerge).toContain('types: [submitted]');
    expect(autoMerge).toContain("github.event.review.state == 'approved'");
    expect(autoMerge).not.toContain('pull_request_target');
  });

  it('matches only Dependabot-authored PRs in the npm-non-major group', () => {
    expect(autoMerge).toContain(
      "github.event.pull_request.user.login == 'dependabot[bot]'",
    );
    expect(autoMerge).toContain("'npm-non-major'");
    expect(autoMerge).not.toContain("'npm-major'");
  });

  it('uses squash auto-merge with no third-party actions', () => {
    expect(autoMerge).toContain('gh pr merge --auto --squash');
    expect(autoMerge).not.toContain('uses:');
  });

  it('merges with the PAT (github.token fallback) so the merge push triggers post-merge CI', () => {
    // A GITHUB_TOKEN-attributed merge starts no workflows (no post-merge run for
    // that commit). The PAT is an ENVIRONMENT secret, so the job selects the
    // `development` environment to read it — an environment with no protection
    // rules. It must never select `production`: this job runs on Dependabot PR
    // branches, which production's protectedBranches policy would reject.
    expect(autoMerge).toMatch(
      /GH_TOKEN:\s*\$\{\{\s*secrets\.RELEASE_PLEASE_TOKEN \|\| secrets\.GITHUB_TOKEN\s*\}\}/,
    );
    expect(autoMerge).toContain('environment: development');
    expect(autoMerge).not.toContain('environment: production');
  });
});

describe('dependabot CI triage policy', () => {
  it('listens for PR CI completion and never merges anything', () => {
    expect(triage).toContain('workflow_run:');
    expect(triage).toContain("workflows: ['PR CI']");
    expect(triage).toContain('dependabot-ci-failed-pr:');
    expect(triage).not.toContain('gh pr merge');
  });
});

describe('dependabot grouping policy', () => {
  it('defines the risk groups the auto-merge classification depends on', () => {
    expect(dependabotConfig).toContain('npm-non-major:');
    expect(dependabotConfig).toContain('npm-major:');
    expect(dependabotConfig).toContain('security-updates:');
  });

  it('keeps npm-non-major scoped to patch + minor only', () => {
    const nonMajorBlock =
      dependabotConfig.match(/npm-non-major:\n([\s\S]*?)\n {6}\S/)?.[1] ?? '';
    expect(nonMajorBlock).not.toBe('');
    expect(nonMajorBlock).toContain('- patch');
    expect(nonMajorBlock).toContain('- minor');
    expect(nonMajorBlock).not.toContain('- major');
  });

  it('keeps the @tanstack/react-router minor/major ignore that enforces the documented 1.170.x pin', () => {
    expect(dependabotConfig).toContain("dependency-name: '@tanstack/react-router'");
    const routerIgnoreBlock =
      dependabotConfig.match(/@tanstack\/react-router'\n([\s\S]*?)\n {4}\S/)?.[1] ?? '';
    expect(routerIgnoreBlock).toContain('version-update:semver-minor');
    expect(routerIgnoreBlock).toContain('version-update:semver-major');
  });
});
