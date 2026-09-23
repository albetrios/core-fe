import { describe, expect, it } from 'vitest';

import {
  deriveOnboardingSteps,
  shouldCreateOrganizationOnFinish,
} from '@/pages/onboarding/onboarding-flow.ts';

import { DEFAULT_DEPLOYMENT_FLAGS, resolveDeploymentMode } from './deployment-mode.ts';
import type { MeContext } from './me-context.ts';
import { resolveRootTarget } from './organization-resolver.ts';

const BOTH = DEFAULT_DEPLOYMENT_FLAGS;

function meCtx(
  overrides: Partial<MeContext> & Pick<MeContext, 'activeOrganization'>,
  onboardingCompleted = true,
): MeContext {
  return {
    user: {
      id: 'usr_1',
      email: 'a@b.test',
      isEmailVerified: true,
      isMfaEnabled: false,
      firstName: 'A',
      lastName: null,
      avatarUrl: null,
      status: 'ACTIVE',
      onboardingCompleted,
      createdAt: 't',
      updatedAt: 't',
    },
    // A member landing on a team dashboard can read the org (realistic default).
    myPermissions: ['organization:read'],
    globalRole: null,
    organizations: [],
    deploymentFlags: BOTH,
    personalOrganizationId: 'org_personal',
    ...overrides,
  };
}

describe('deployment-mode — personal-and-team', () => {
  it('resolves dual mode (default flags)', () => {
    expect(resolveDeploymentMode(BOTH)).toBe('personal-and-team');
  });

  it('routes a fresh (not-onboarded) user to /onboarding despite the auto-provisioned personal org', () => {
    expect(
      resolveRootTarget(
        meCtx(
          {
            activeOrganization: {
              id: 'org_p',
              name: 'Personal',
              slug: null,
              type: 'PERSONAL',
              status: 'ACTIVE',
              logoUrl: null,
              createdAt: 't',
              updatedAt: 't',
            },
          },
          false,
        ),
      ),
    ).toEqual({ to: '/onboarding' });
  });

  it('routes personal active org to /dashboard and team active org to slug dashboard', () => {
    expect(
      resolveRootTarget(
        meCtx({
          activeOrganization: {
            id: 'org_p',
            name: 'Personal',
            slug: null,
            type: 'PERSONAL',
            status: 'ACTIVE',
            logoUrl: null,
            createdAt: 't',
            updatedAt: 't',
          },
        }),
      ),
    ).toEqual({ to: '/dashboard' });

    expect(
      resolveRootTarget(
        meCtx({
          activeOrganization: {
            id: 'org_t',
            name: 'Acme',
            slug: 'acme',
            type: 'TEAM',
            status: 'ACTIVE',
            logoUrl: null,
            createdAt: 't',
            updatedAt: 't',
          },
        }),
      ),
    ).toEqual({
      to: '/organization/$organizationSlug/dashboard',
      params: { organizationSlug: 'acme' },
    });
  });

  it('skips onboarding workspace create (personal auto-provisioned; teams from switcher)', () => {
    // The step list is derived from the caller's ORGANIZATIONS, which come from
    // `GET /users/me/organizations` rather than riding along in me/context.
    const organizations = [{ id: 'org_p', type: 'PERSONAL' as const, slug: null }];
    expect(deriveOnboardingSteps(BOTH, organizations)).toEqual([
      'welcome',
      'profile',
      'questions',
      'done',
    ]);
    expect(shouldCreateOrganizationOnFinish(BOTH, organizations)).toBe(false);
  });
});
