import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  requireActiveOrganization,
  requireOrganizationContext,
  requirePersonalOrganizationsDeployment,
  requireProvisionedPersonalDashboard,
  requireProvisionedTeamWorkspace,
  requireTeamOrganizationsDeployment,
} from './route-guards.ts';
import {
  requireOrgStatus,
  requirePersonalDashboardWorkspace,
  requirePersonalDeployment,
  requireProvisionedWorkspace,
  requireTeamDeployment,
  resolveActiveOrg,
} from './org-gates.ts';

vi.mock('./route-guards.ts', () => ({
  requireActiveOrganization: vi.fn(),
  requireOrganizationContext: vi.fn(),
  requirePersonalOrganizationsDeployment: vi.fn(),
  requireProvisionedPersonalDashboard: vi.fn(),
  requireProvisionedTeamWorkspace: vi.fn(),
  requireTeamOrganizationsDeployment: vi.fn(),
}));

describe('org gates — thin wrappers stay faithful to the underlying guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolveActiveOrg forwards the slug param (empty string when absent)', async () => {
    await resolveActiveOrg({ params: { organizationSlug: 'acme' } });
    expect(requireOrganizationContext).toHaveBeenCalledWith('acme');

    await resolveActiveOrg({ params: {} });
    expect(requireOrganizationContext).toHaveBeenLastCalledWith('');
  });

  it('requireOrgStatus forwards the slug param (empty string when absent)', async () => {
    await requireOrgStatus({ params: { organizationSlug: 'acme' } });
    expect(requireActiveOrganization).toHaveBeenCalledWith('acme');

    await requireOrgStatus({ params: {} });
    expect(requireActiveOrganization).toHaveBeenLastCalledWith('');
  });

  it('deployment gates call their mode guards with no context', async () => {
    await requireTeamDeployment({ params: {} });
    expect(requireTeamOrganizationsDeployment).toHaveBeenCalledTimes(1);

    await requirePersonalDeployment(undefined);
    expect(requirePersonalOrganizationsDeployment).toHaveBeenCalledTimes(1);
  });

  it('personal dashboard gate carries the deep link for the onboarding redirect', async () => {
    await requirePersonalDashboardWorkspace({ redirectFrom: '/dashboard?tab=usage' });
    expect(requireProvisionedPersonalDashboard).toHaveBeenCalledWith({
      redirectFrom: '/dashboard?tab=usage',
    });
  });

  it('team workspace gate flags the picker when no slug is in the URL', async () => {
    await requireProvisionedWorkspace({ params: {}, redirectFrom: '/organization' });
    expect(requireProvisionedTeamWorkspace).toHaveBeenCalledWith({
      organizationPicker: true,
      redirectFrom: '/organization',
    });

    await requireProvisionedWorkspace({
      params: { organizationSlug: 'acme' },
      redirectFrom: '/organization/acme/dashboard',
    });
    expect(requireProvisionedTeamWorkspace).toHaveBeenLastCalledWith({
      organizationPicker: false,
      redirectFrom: '/organization/acme/dashboard',
    });
  });

  it('guard failures propagate — gates add no swallowing layer', async () => {
    vi.mocked(requireOrganizationContext).mockRejectedValueOnce(new Error('redirect'));
    await expect(
      resolveActiveOrg({ params: { organizationSlug: 'acme' } }),
    ).rejects.toThrow('redirect');
  });
});
