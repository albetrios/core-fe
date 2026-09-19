import { describe, expect, it } from 'vitest';

import type { MeContext } from '@/shared/tenancy/me-context.ts';

import {
  deriveOnboardingSteps,
  shouldCreateOrganizationOnFinish,
} from './onboarding-flow.ts';

const BOTH_FLAGS = { personalOrganizations: true, teamOrganizations: true };
const PERSONAL_ONLY = { personalOrganizations: true, teamOrganizations: false };
const TEAM_ONLY = { personalOrganizations: false, teamOrganizations: true };

const CTX_WITH_PERSONAL = {
  personalOrganizationId: 'org_personalij0123456789x',
  organizations: [
    {
      id: 'org_personalij0123456789x',
      type: 'PERSONAL',
      slug: null,
    },
  ],
} as unknown as MeContext;

/** A loaded context with no organizations at all — a brand-new team-only user. */
const CTX_EMPTY = {
  personalOrganizationId: null,
  organizations: [],
} as unknown as MeContext;

describe('deriveOnboardingSteps', () => {
  it('skips workspace and invite in personal-only mode', () => {
    expect(deriveOnboardingSteps(PERSONAL_ONLY, CTX_WITH_PERSONAL)).toEqual([
      'welcome',
      'profile',
      'questions',
      'done',
    ]);
  });

  it('requires workspace in team-only mode', () => {
    expect(deriveOnboardingSteps(TEAM_ONLY, CTX_EMPTY)).toEqual([
      'welcome',
      'profile',
      'questions',
      'workspace',
      'invite',
      'done',
    ]);
  });

  it('skips workspace and invite in both mode when personal org already exists', () => {
    expect(deriveOnboardingSteps(BOTH_FLAGS, CTX_WITH_PERSONAL)).toEqual([
      'welcome',
      'profile',
      'questions',
      'done',
    ]);
  });

  it('includes invite in both mode only when a team org exists', () => {
    expect(
      deriveOnboardingSteps(BOTH_FLAGS, {
        ...CTX_WITH_PERSONAL,
        organizations: [
          ...CTX_WITH_PERSONAL.organizations,
          {
            id: 'org_team',
            type: 'TEAM',
            slug: 'acme',
          },
        ],
      } as unknown as MeContext),
    ).toEqual(['welcome', 'profile', 'questions', 'invite', 'done']);
  });
});

/*
 * ONB-9. The step list is derived from me/context, and `useDeploymentFlags`
 * falls back to the permissive defaults when that context is missing — so an
 * absent context used to yield a DIFFERENT, shorter flow that a user could still
 * complete.
 *
 * Enforcement is the non-nullable `ctx` parameter, checked by `pnpm type-check`
 * — NOT by this file, which tsconfig.app.json excludes, so a `@ts-expect-error`
 * here would assert nothing. What this pins is the reason the signature is
 * strict: the two flows below really are different, so deriving one from a
 * context you do not have picks the wrong one silently.
 */
describe('a loaded me/context is required to derive a flow', () => {
  it('gives team-only and personal-and-team users DIFFERENT flows', () => {
    // The exact divergence the missing-context fallback used to hide: the
    // permissive default is personal-and-team, which drops the workspace step.
    expect(deriveOnboardingSteps(TEAM_ONLY, CTX_EMPTY)).toContain('workspace');
    expect(deriveOnboardingSteps(BOTH_FLAGS, CTX_EMPTY)).not.toContain('workspace');
    expect(shouldCreateOrganizationOnFinish(TEAM_ONLY, CTX_EMPTY)).toBe(true);
    expect(shouldCreateOrganizationOnFinish(BOTH_FLAGS, CTX_EMPTY)).toBe(false);
  });
});

describe('shouldCreateOrganizationOnFinish', () => {
  it('never creates in personal-only mode', () => {
    expect(shouldCreateOrganizationOnFinish(PERSONAL_ONLY, CTX_EMPTY)).toBe(false);
  });

  it('always creates in team-only mode', () => {
    expect(shouldCreateOrganizationOnFinish(TEAM_ONLY, CTX_EMPTY)).toBe(true);
  });

  it('never creates in both mode (team orgs come from the switcher)', () => {
    expect(shouldCreateOrganizationOnFinish(BOTH_FLAGS, CTX_EMPTY)).toBe(false);
    expect(shouldCreateOrganizationOnFinish(BOTH_FLAGS, CTX_WITH_PERSONAL)).toBe(false);
  });
});
