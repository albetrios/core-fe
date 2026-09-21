import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { useAuthStore } from '@/shared/store/useAuthStore/index.ts';
import { useOrganizationStore } from '@/shared/store/useOrganizationStore/index.ts';
import { useUIStore } from '@/shared/store/useUIStore/index.ts';
import { renderWithProviders } from '@/tests/utils/renderWithProviders.tsx';

const { useMeContextMock } = vi.hoisted(() => ({ useMeContextMock: vi.fn() }));

vi.mock('@/shared/hooks/useMeContext/index.ts', () => ({
  useMeContext: useMeContextMock,
  meContextQueryKey: ['auth', 'me-context'],
}));

import { AiAssistantCard } from './AiAssistantCard.tsx';

describe('AiAssistantCard', () => {
  beforeEach(() => {
    useUIStore.setState({ commandPaletteOpen: false, commandPaletteSeed: '' });
    useAuthStore.setState({ user: null });
    useOrganizationStore.setState({
      organizationId: 'org_acme',
      permissions: ['organization:read', 'membership:read'],
      deploymentFlags: { personalOrganizations: true, teamOrganizations: true },
    });
    useMeContextMock.mockReturnValue({ data: { activeOrganization: { type: 'TEAM' } } });
  });

  it('renders its key surfaces', async () => {
    renderWithProviders(<AiAssistantCard />);

    expect(await screen.findByTestId('dashboard-ai-card')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-ai-prompt')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-ai-chip-usage')).toBeInTheDocument();
  });

  /**
   * DASH-5: every chip called the same blank `open()`, so a user who pressed
   * "Invite members" got an empty palette and had to type the words back in.
   * Each chip now sends the keyword that reaches what it names — the matching
   * side of the contract is pinned in `CommandPalette.test.tsx`.
   */
  it.each([
    ['usage', 'usage'],
    ['members', 'invitations'],
    ['appearance', 'theme'],
  ])('the %s chip opens the palette seeded with "%s"', async (chip, seed) => {
    const user = userEvent.setup();
    renderWithProviders(<AiAssistantCard />);

    await user.click(await screen.findByTestId(`dashboard-ai-chip-${chip}`));

    expect(useUIStore.getState().commandPaletteOpen).toBe(true);
    expect(useUIStore.getState().commandPaletteSeed).toBe(seed);
  });

  it('the prompt box promises nothing specific, so it opens blank', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AiAssistantCard />);

    await user.click(await screen.findByTestId('dashboard-ai-chip-usage'));
    await user.click(screen.getByTestId('dashboard-ai-prompt'));

    expect(useUIStore.getState().commandPaletteOpen).toBe(true);
    expect(useUIStore.getState().commandPaletteSeed).toBe('');
  });

  /**
   * A personal workspace has nobody to invite, and no Members section to land
   * on: a chip that opened the palette on "No results found" would be a louder
   * version of the bug it replaced.
   */
  it('drops "Invite members" on a personal workspace', async () => {
    useMeContextMock.mockReturnValue({
      data: { activeOrganization: { type: 'PERSONAL' } },
    });
    renderWithProviders(<AiAssistantCard />);

    await screen.findByTestId('dashboard-ai-card');
    expect(screen.queryByTestId('dashboard-ai-chip-members')).not.toBeInTheDocument();
    expect(screen.getByTestId('dashboard-ai-chip-usage')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-ai-chip-appearance')).toBeInTheDocument();
  });

  it('keeps the theme chip when no settings section is reachable at all', async () => {
    useOrganizationStore.setState({ organizationId: null, permissions: [] });
    renderWithProviders(<AiAssistantCard />);

    await screen.findByTestId('dashboard-ai-card');
    expect(screen.queryByTestId('dashboard-ai-chip-usage')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dashboard-ai-chip-members')).not.toBeInTheDocument();
    expect(screen.getByTestId('dashboard-ai-chip-appearance')).toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = renderWithProviders(<AiAssistantCard />);
    await screen.findByTestId('dashboard-ai-card');
    expect(await axe(container)).toHaveNoViolations();
  });
});
