import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SETTINGS_NAV } from './settings-sections.ts';
import { SettingsNav } from './SettingsNav.tsx';

const ACTIVE = { scope: 'account', section: 'profile' } as const;

function renderNav(overrides?: Partial<Parameters<typeof SettingsNav>[0]>) {
  return render(
    <SettingsNav
      groups={SETTINGS_NAV}
      active={ACTIVE}
      onSelect={vi.fn()}
      {...overrides}
    />,
  );
}

describe('SettingsNav', () => {
  it('renders both scopes with their sections', () => {
    renderNav();
    expect(screen.getByTestId('settings-nav-account-profile')).toBeInTheDocument();
    expect(screen.getByTestId('settings-nav-account-security')).toBeInTheDocument();
    expect(screen.getByTestId('settings-nav-account-sessions')).toBeInTheDocument();
    expect(screen.getByTestId('settings-nav-account-billing')).toBeInTheDocument();
    expect(screen.getByTestId('settings-nav-organization-general')).toBeInTheDocument();
    expect(screen.getByTestId('settings-nav-organization-members')).toBeInTheDocument();
  });

  it('insets the search box and the nav by the standard dialog padding', () => {
    // Every other dialog gets 24px from `DialogContent` (`p-6`). The settings
    // modal opts out (`p-0`), and its search box used to sit 12px from the corner
    // next to a content pane inset 32px. `6` is a spacing-scale step, so — like
    // `p-6` — it follows the theme's Density setting; a fixed `[24px]` would not.
    renderNav();

    const search = screen.getByTestId('settings-search');
    const searchPane = search.parentElement?.parentElement;
    expect(searchPane).toHaveClass('px-6', 'pt-6');
    expect(searchPane).not.toHaveClass('p-3');

    // The pills share the search box's edges, so the column reads as one block.
    expect(screen.getByRole('navigation')).toHaveClass('px-6', 'pb-6');
  });

  it('marks the active section with aria-current="page"', () => {
    renderNav({ active: { scope: 'account', section: 'security' } });
    expect(screen.getByTestId('settings-nav-account-security')).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByTestId('settings-nav-account-profile')).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('calls onSelect with the scope + section of the clicked item', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderNav({ onSelect });
    await user.click(screen.getByTestId('settings-nav-organization-members'));
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'organization', section: 'members' }),
    );
  });

  it('filters nav items by the search query', async () => {
    const user = userEvent.setup();
    renderNav();
    await user.type(screen.getByTestId('settings-search'), 'passkey');
    expect(screen.getByTestId('settings-nav-account-security')).toBeInTheDocument();
    expect(
      screen.queryByTestId('settings-nav-account-appearance'),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('settings-nav-account-profile')).not.toBeInTheDocument();
  });

  it('shows an empty state when no items match', async () => {
    const user = userEvent.setup();
    renderNav();
    await user.type(screen.getByTestId('settings-search'), 'zzznomatch');
    expect(screen.getByTestId('settings-nav-empty')).toBeInTheDocument();
  });

  it('renders only the groups it is given (parent owns gating)', () => {
    renderNav({ groups: SETTINGS_NAV.filter((g) => g.scope === 'account') });
    expect(screen.getByTestId('settings-nav-account-profile')).toBeInTheDocument();
    expect(
      screen.queryByTestId('settings-nav-organization-general'),
    ).not.toBeInTheDocument();
  });
});
