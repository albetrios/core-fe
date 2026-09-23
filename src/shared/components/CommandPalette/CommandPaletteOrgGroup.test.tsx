import { fireEvent, render, screen } from '@testing-library/react';
import { Command } from 'cmdk';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as MyOrganizationSummariesModule from '@/shared/tenancy/my-organization-summaries.ts';

import { CommandPaletteOrgGroup } from './CommandPaletteOrgGroup.tsx';

const navigateMock = vi.fn();
const closePaletteMock = vi.fn();

const { useMyOrganizationSummariesMock } = vi.hoisted(() => ({
  useMyOrganizationSummariesMock: vi.fn(),
}));
// The list comes from `GET /users/me/organizations` now, not from me/context.
vi.mock('@/shared/tenancy/my-organization-summaries.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof MyOrganizationSummariesModule>()),
  useMyOrganizationSummaries: useMyOrganizationSummariesMock,
}));

type OrgRow = { id: string; name: string; slug: string | null; isActive: boolean };

function renderGroup(organizations: OrgRow[]) {
  useMyOrganizationSummariesMock.mockReturnValue({
    data: organizations,
    isPending: false,
  });
  // Command.Group/Separator require a cmdk <Command> root for context.
  return render(
    <Command>
      <Command.List>
        <CommandPaletteOrgGroup
          heading="Organizations"
          currentOrganizationLabel={(name) => `Current: ${name}`}
          switchOrganizationLabel={(name) => `Switch to ${name}`}
          closePalette={closePaletteMock}
          navigate={navigateMock as never}
          personalOrganizationsEnabled={true}
        />
      </Command.List>
    </Command>,
  );
}

describe('CommandPaletteOrgGroup', () => {
  beforeAll(() => {
    // cmdk scrolls the selected item into view; jsdom has no scrollIntoView.
    Element.prototype.scrollIntoView = vi.fn();
  });

  beforeEach(() => {
    navigateMock.mockClear();
    closePaletteMock.mockClear();
  });

  it('renders nothing with a single organization', () => {
    const { container } = renderGroup([
      { id: 'org_1', name: 'Solo', slug: 'solo', isActive: true },
    ]);
    expect(container.querySelector('[cmdk-group]')).toBeNull();
  });

  it('lists one entry per organization with active/switch labels', () => {
    renderGroup([
      { id: 'org_1', name: 'Acme', slug: 'acme', isActive: true },
      { id: 'org_2', name: 'Globex', slug: 'globex', isActive: false },
    ]);

    expect(screen.getByText('Organizations')).toBeInTheDocument();
    expect(screen.getByText('Current: Acme')).toBeInTheDocument();
    expect(screen.getByText('Switch to Globex')).toBeInTheDocument();
  });

  it('filters out organizations without a slug', () => {
    renderGroup([
      { id: 'org_1', name: 'Acme', slug: 'acme', isActive: true },
      { id: 'org_2', name: 'Pending', slug: null, isActive: false },
      { id: 'org_3', name: 'Globex', slug: 'globex', isActive: false },
    ]);

    expect(screen.queryByText(/Pending/)).not.toBeInTheDocument();
    expect(screen.getByText('Switch to Globex')).toBeInTheDocument();
  });

  it('selecting another organization navigates to its dashboard', () => {
    renderGroup([
      { id: 'org_1', name: 'Acme', slug: 'acme', isActive: true },
      { id: 'org_2', name: 'Globex', slug: 'globex', isActive: false },
    ]);

    fireEvent.click(screen.getByText('Switch to Globex'));

    expect(navigateMock).toHaveBeenCalledWith({
      to: '/organization/$organizationSlug/dashboard',
      params: { organizationSlug: 'globex' },
    });
  });

  it('selecting the active organization is a no-op', () => {
    renderGroup([
      { id: 'org_1', name: 'Acme', slug: 'acme', isActive: true },
      { id: 'org_2', name: 'Globex', slug: 'globex', isActive: false },
    ]);

    fireEvent.click(screen.getByText('Current: Acme'));

    expect(navigateMock).not.toHaveBeenCalled();
    expect(closePaletteMock).toHaveBeenCalledTimes(1);
  });
});
