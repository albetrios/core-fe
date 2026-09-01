import { fireEvent, render, screen } from '@testing-library/react';
import { Command } from 'cmdk';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MeContext } from '@/shared/tenancy/me-context.ts';

import { CommandPaletteOrgGroup } from './CommandPaletteOrgGroup.tsx';

const navigateMock = vi.fn();

function meContext(
  organizations: Array<{
    id: string;
    name: string;
    slug: string | null;
    isActive: boolean;
  }>,
): MeContext {
  return { organizations } as unknown as MeContext;
}

function renderGroup(ctx: MeContext) {
  // Command.Group/Separator require a cmdk <Command> root for context.
  return render(
    <Command>
      <Command.List>
        <CommandPaletteOrgGroup
          meContext={ctx}
          heading="Organizations"
          currentOrganizationLabel={(name) => `Current: ${name}`}
          switchOrganizationLabel={(name) => `Switch to ${name}`}
          runCommand={(command) => command()}
          navigate={navigateMock as never}
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
  });

  it('renders nothing with a single organization', () => {
    const { container } = renderGroup(
      meContext([{ id: 'org_1', name: 'Solo', slug: 'solo', isActive: true }]),
    );
    expect(container.querySelector('[cmdk-group]')).toBeNull();
  });

  it('lists one entry per organization with active/switch labels', () => {
    renderGroup(
      meContext([
        { id: 'org_1', name: 'Acme', slug: 'acme', isActive: true },
        { id: 'org_2', name: 'Globex', slug: 'globex', isActive: false },
      ]),
    );

    expect(screen.getByText('Organizations')).toBeInTheDocument();
    expect(screen.getByText('Current: Acme')).toBeInTheDocument();
    expect(screen.getByText('Switch to Globex')).toBeInTheDocument();
  });

  it('filters out organizations without a slug', () => {
    renderGroup(
      meContext([
        { id: 'org_1', name: 'Acme', slug: 'acme', isActive: true },
        { id: 'org_2', name: 'Pending', slug: null, isActive: false },
        { id: 'org_3', name: 'Globex', slug: 'globex', isActive: false },
      ]),
    );

    expect(screen.queryByText(/Pending/)).not.toBeInTheDocument();
    expect(screen.getByText('Switch to Globex')).toBeInTheDocument();
  });

  it('selecting another organization navigates to its dashboard', () => {
    renderGroup(
      meContext([
        { id: 'org_1', name: 'Acme', slug: 'acme', isActive: true },
        { id: 'org_2', name: 'Globex', slug: 'globex', isActive: false },
      ]),
    );

    fireEvent.click(screen.getByText('Switch to Globex'));

    expect(navigateMock).toHaveBeenCalledWith({
      to: '/organization/$organizationSlug/dashboard',
      params: { organizationSlug: 'globex' },
    });
  });

  it('selecting the active organization is a no-op', () => {
    renderGroup(
      meContext([
        { id: 'org_1', name: 'Acme', slug: 'acme', isActive: true },
        { id: 'org_2', name: 'Globex', slug: 'globex', isActive: false },
      ]),
    );

    fireEvent.click(screen.getByText('Current: Acme'));

    expect(navigateMock).not.toHaveBeenCalled();
  });
});
