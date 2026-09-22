import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

// Locks the deploy-per-purpose workflows: an instant production rollback that
// restores (never rebuilds) behind the production reviewer gate.
const workflow = (name: string): string =>
  readFileSync(join(process.cwd(), '.github/workflows', name), 'utf8');

describe('deploy workflows policy', () => {
  it('rollback-deploy.yml is manual, production-gated, and restores without a rebuild', () => {
    const rollback = workflow('rollback-deploy.yml');
    expect(rollback).toContain('workflow_dispatch:');
    expect(rollback).toContain('environment: production');
    // Instant restore of an immutable deploy — NOT a rebuild.
    expect(rollback).toContain('restoreSiteDeploy');
    expect(rollback).not.toContain('pnpm build');
    expect(rollback).not.toMatch(/netlify\s+deploy\b/);
    // Shares the production concurrency group so it can't race a forward deploy.
    expect(rollback).toContain('group: netlify-deploy-production');
  });

  it('reusable-netlify-deploy.yml attests build provenance for the production bundle', () => {
    const reusable = workflow('reusable-netlify-deploy.yml');
    // The provenance attestation over the shipped bundle, wired into the deploy
    // that builds it — the frontend analog of core-be's release attestation.
    expect(reusable).toContain('actions/attest-build-provenance@');
    // Attestation needs OIDC + write scope on the deploy job.
    expect(reusable).toContain('id-token: write');
    expect(reusable).toContain('attestations: write');
    // Production only — the development alias is not a release surface.
    expect(reusable).toMatch(
      /Attest production build provenance[\s\S]*environment == 'production'/,
    );
  });

  it('every caller of the reusable deploy grants the permissions its jobs request', () => {
    // A reusable workflow's job permissions must be a SUBSET of the caller's
    // grant, validated statically when the run starts — a caller that grants
    // less makes the ENTIRE calling workflow a startup_failure (this broke
    // every post-merge run and release deploy after the provenance job gained
    // id-token/attestations in #101). Each `uses:` job must widen explicitly.
    const requested = ['contents: read', 'id-token: write', 'attestations: write'];
    for (const caller of ['post-merge-ci.yml', 'release-deploy.yml']) {
      const text = workflow(caller);
      expect(text, `${caller} no longer calls the reusable?`).toContain(
        'reusable-netlify-deploy.yml',
      );
      for (const permission of requested) {
        expect(
          text,
          `${caller} must grant "${permission}" on the job calling reusable-netlify-deploy.yml`,
        ).toContain(permission);
      }
    }
  });

  it('release-deploy.yml deploys production on release publish, pinned to the tag', () => {
    const release = workflow('release-deploy.yml');
    // event-driven, and re-runnable for the same tag
    expect(release).toContain('release:');
    expect(release).toMatch(/types:\s*\[published\]/);
    expect(release).toContain('workflow_dispatch:');
    // production reviewer gate (via the reusable) + tag pin, never github.sha
    expect(release).toContain('github_environment: production');
    // biome-ignore lint/suspicious/noTemplateCurlyInString: GitHub Actions expression syntax, asserted verbatim
    expect(release).toContain('ref: ${{ needs.resolve.outputs.tag }}');
    expect(release).not.toContain('github.sha');
    expect(release).toContain('reusable-netlify-deploy.yml');
  });
});
