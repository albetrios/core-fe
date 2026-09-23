import { describe, expect, it } from 'vitest';

import {
  deriveOnboardingSteps,
  shouldCreateOrganizationOnFinish,
} from './onboarding-flow.ts';

const BOTH_FLAGS = { personalOrganizations: true, teamOrganizations: true };
const PERSONAL_ONLY = { personalOrganizations: true, teamOrganizations: false };
const TEAM_ONLY = { personalOrganizations: false, teamOrganizations: true };

/*
 * The step list is derived from the caller's ORGANIZATIONS, which now come from
 * `GET /users/me/organizations` rather than riding along in me/context — so
 * these fixtures are lists, not contexts.
 */
const ORGS_WITH_PERSONAL = [
  { id: 'org_personalij0123456789x', type: 'PERSONAL' as const, slug: null },
];

/** A brand-new team-only user: no organizations at all. */
const ORGS_EMPTY: typeof ORGS_WITH_PERSONAL = [];

describe('deriveOnboardingSteps', () => {
  it('skips workspace and invite in personal-only mode', () => {
    expect(deriveOnboardingSteps(PERSONAL_ONLY, ORGS_WITH_PERSONAL)).toEqual([
      'welcome',
      'profile',
      'questions',
      'done',
    ]);
  });

  it('requires workspace in team-only mode', () => {
    expect(deriveOnboardingSteps(TEAM_ONLY, ORGS_EMPTY)).toEqual([
      'welcome',
      'profile',
      'questions',
      'workspace',
      'invite',
      'done',
    ]);
  });

  it('skips workspace and invite in both mode when personal org already exists', () => {
    expect(deriveOnboardingSteps(BOTH_FLAGS, ORGS_WITH_PERSONAL)).toEqual([
      'welcome',
      'profile',
      'questions',
      'done',
    ]);
  });

  it('includes invite in both mode only when a team org exists', () => {
    expect(
      deriveOnboardingSteps(BOTH_FLAGS, [
        ...ORGS_WITH_PERSONAL,
        { id: 'org_team', type: 'TEAM' as const, slug: 'acme' },
      ]),
    ).toEqual(['welcome', 'profile', 'questions', 'invite', 'done']);
  });
});

/*
 * ONB-9. The step list is derived from the caller's organizations, and
 * `useDeploymentFlags` falls back to the permissive defaults when data is
 * missing — so absent data used to yield a DIFFERENT, shorter flow that a user
 * could still complete.
 *
 * Enforcement is the required `organizations` parameter, checked by `pnpm type-check`
 * — NOT by this file, which tsconfig.app.json excludes, so a `@ts-expect-error`
 * here would assert nothing. What this pins is the reason the signature is
 * strict: the two flows below really are different, so deriving one from a
 * context you do not have picks the wrong one silently.
 */
describe('a loaded me/context is required to derive a flow', () => {
  it('gives team-only and personal-and-team users DIFFERENT flows', () => {
    // The exact divergence the missing-context fallback used to hide: the
    // permissive default is personal-and-team, which drops the workspace step.
    expect(deriveOnboardingSteps(TEAM_ONLY, ORGS_EMPTY)).toContain('workspace');
    expect(deriveOnboardingSteps(BOTH_FLAGS, ORGS_EMPTY)).not.toContain('workspace');
    expect(shouldCreateOrganizationOnFinish(TEAM_ONLY, ORGS_EMPTY)).toBe(true);
    expect(shouldCreateOrganizationOnFinish(BOTH_FLAGS, ORGS_EMPTY)).toBe(false);
  });
});

describe('shouldCreateOrganizationOnFinish', () => {
  it('never creates in personal-only mode', () => {
    expect(shouldCreateOrganizationOnFinish(PERSONAL_ONLY, ORGS_EMPTY)).toBe(false);
  });

  it('always creates in team-only mode', () => {
    expect(shouldCreateOrganizationOnFinish(TEAM_ONLY, ORGS_EMPTY)).toBe(true);
  });

  it('never creates in both mode (team orgs come from the switcher)', () => {
    expect(shouldCreateOrganizationOnFinish(BOTH_FLAGS, ORGS_EMPTY)).toBe(false);
    expect(shouldCreateOrganizationOnFinish(BOTH_FLAGS, ORGS_WITH_PERSONAL)).toBe(false);
  });
});
