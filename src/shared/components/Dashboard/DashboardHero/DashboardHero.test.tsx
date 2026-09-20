import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { useOrganizationStore } from '@/shared/store/useOrganizationStore/index.ts';
import { DEFAULT_DEPLOYMENT_FLAGS } from '@/shared/tenancy/deployment-mode.ts';
import { renderWithProviders } from '@/tests/utils/renderWithProviders.tsx';

import { DashboardHero } from './DashboardHero.tsx';

describe('DashboardHero', () => {
  beforeEach(() => {
    useOrganizationStore.setState({ deploymentFlags: DEFAULT_DEPLOYMENT_FLAGS });
  });

  it('renders greeting and organization context', async () => {
    renderWithProviders(
      <DashboardHero
        firstName="Ada"
        orgName="Acme Inc."
        orgType="TEAM"
        orgStatus="ACTIVE"
      />,
    );

    expect(await screen.findByTestId('dashboard-greeting')).toHaveTextContent('Ada');
    expect(screen.getByTestId('dashboard-org-name')).toHaveTextContent('Acme Inc.');
    expect(screen.getByTestId('dashboard-org-status')).toBeInTheDocument();
  });

  it('hides organization context in personal-only deployment mode', async () => {
    useOrganizationStore.setState({
      deploymentFlags: { personalOrganizations: true, teamOrganizations: false },
    });
    renderWithProviders(
      <DashboardHero
        firstName="Ada"
        orgName="Personal"
        orgType="PERSONAL"
        orgStatus="ACTIVE"
      />,
    );

    expect(await screen.findByTestId('dashboard-greeting')).toHaveTextContent('Ada');
    expect(screen.queryByTestId('dashboard-org-name')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dashboard-org-status')).not.toBeInTheDocument();
  });

  it('lets a name with no break opportunity wrap instead of running off the card', async () => {
    // Regression: the name is user data. An email-derived one has no space to
    // break at, so on a phone it ran past the card's edge and was clipped
    // mid-word by the card's own `overflow-hidden`.
    renderWithProviders(
      <DashboardHero
        firstName="bartholomew.featherstonehaugh.the.third"
        orgName="Acme Inc."
        orgType="TEAM"
        orgStatus="ACTIVE"
      />,
    );

    expect(await screen.findByTestId('dashboard-greeting')).toHaveClass('wrap-anywhere');
  });

  it('is a card to the theme axes — elevation, separation and shape reach it', async () => {
    renderWithProviders(
      <DashboardHero
        firstName="Ada"
        orgName="Acme Inc."
        orgType="TEAM"
        orgStatus="ACTIVE"
      />,
    );

    const greeting = await screen.findByTestId('dashboard-greeting');
    expect(greeting.closest('[data-slot="card"]')).not.toBeNull();
  });

  it('has no accessibility violations', async () => {
    const { container } = renderWithProviders(
      <DashboardHero
        firstName="Ada"
        orgName="Acme Inc."
        orgType="TEAM"
        orgStatus="ACTIVE"
      />,
    );
    await screen.findByTestId('dashboard-greeting');
    expect(await axe(container)).toHaveNoViolations();
  });
});
