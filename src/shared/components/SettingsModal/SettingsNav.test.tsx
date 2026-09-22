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
    expect(screen.queryByTestId('settings-nav-account-sessions')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('settings-nav-organization-members'),
    ).not.toBeInTheDocument();
  });

  it('shows an empty state when no items match', async () => {
    const user = userEvent.setup();
    renderNav();
    await user.type(screen.getByTestId('settings-search'), 'zzznomatch');
    expect(screen.getByTestId('settings-nav-empty')).toBeInTheDocument();
  });

  /**
   * QA-9: searching filters the rail but does not navigate, so the pane goes on
   * showing whatever was open. When the filter dropped that section the modal
   * contradicted itself — a Profile form filling the pane under a rail listing
   * only Security, and `aria-current="page"` on nothing at all.
   */
  describe('the open section stays listed while searching', () => {
    it('keeps it, and keeps it marked current, when it does not match', async () => {
      const user = userEvent.setup();
      renderNav(); // active: account/profile
      await user.type(screen.getByTestId('settings-search'), 'passkey');

      // Security matched; Profile did not, and is still there because it is open.
      expect(screen.getByTestId('settings-nav-account-security')).toBeInTheDocument();
      const profile = screen.getByTestId('settings-nav-account-profile');
      expect(profile).toBeInTheDocument();
      expect(profile).toHaveAttribute('aria-current', 'page');
      // Kept, not appended somewhere new: Account still precedes Organization.
      expect(screen.getByRole('navigation').textContent).toMatch(
        /Profile[\s\S]*Security/,
      );
    });

    it('keeps it even when the search matches nothing at all', async () => {
      const user = userEvent.setup();
      renderNav();
      await user.type(screen.getByTestId('settings-search'), 'zzznomatch');

      // "No matches" answers for the SEARCH; the open section answers for the
      // PANE. Both are true and the screen says both.
      expect(screen.getByTestId('settings-nav-empty')).toBeInTheDocument();
      expect(screen.getByTestId('settings-nav-account-profile')).toHaveAttribute(
        'aria-current',
        'page',
      );
    });

    it('does not duplicate it when it matches on its own', async () => {
      const user = userEvent.setup();
      renderNav();
      await user.type(screen.getByTestId('settings-search'), 'profile');

      expect(screen.getAllByTestId('settings-nav-account-profile')).toHaveLength(1);
      expect(screen.queryByTestId('settings-nav-empty')).not.toBeInTheDocument();
    });

    it('does not resurrect a section this user cannot open', async () => {
      const user = userEvent.setup();
      // The parent gates the rail; an active section outside what it hands over
      // is not the rail's to put back.
      renderNav({
        groups: SETTINGS_NAV.filter((group) => group.scope === 'account'),
        active: { scope: 'organization', section: 'members' },
      });
      await user.type(screen.getByTestId('settings-search'), 'passkey');

      expect(
        screen.queryByTestId('settings-nav-organization-members'),
      ).not.toBeInTheDocument();
      expect(screen.getByTestId('settings-nav-account-security')).toBeInTheDocument();
    });
  });

  it('reports how many sections the query matched', async () => {
    const user = userEvent.setup();
    renderNav();
    expect(screen.queryByTestId('settings-search-count')).not.toBeInTheDocument();
    await user.type(screen.getByTestId('settings-search'), 'passkey');
    // One MATCH, even though the rail also still lists the open section.
    expect(screen.getByTestId('settings-search-count')).toHaveTextContent(/\b1\b/);
  });

  // Regression (QA-V3-4): this aside never unmounts, so a query typed on one
  // section stayed up over every section opened afterwards. Keeping the open
  // section listed answers a different half of that report — the rail no longer
  // contradicts the pane — but the query still outlived the visit that typed it.
  it('drops the query when the active section changes', async () => {
    const user = userEvent.setup();
    const { rerender } = renderNav();
    await user.type(screen.getByTestId('settings-search'), 'passkey');
    expect(screen.queryByTestId('settings-nav-account-account')).not.toBeInTheDocument();

    rerender(
      <SettingsNav
        groups={SETTINGS_NAV}
        active={{ scope: 'organization', section: 'roles' }}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByTestId('settings-search')).toHaveValue('');
    expect(screen.getByTestId('settings-nav-account-account')).toBeInTheDocument();
  });

  it('drops the query when a result is picked', async () => {
    const user = userEvent.setup();
    renderNav();
    await user.type(screen.getByTestId('settings-search'), 'passkey');
    await user.click(screen.getByTestId('settings-nav-account-security'));
    expect(screen.getByTestId('settings-search')).toHaveValue('');
    expect(screen.getByTestId('settings-nav-account-account')).toBeInTheDocument();
  });

  it('offers a way out of a no-match search', async () => {
    const user = userEvent.setup();
    renderNav();
    await user.type(screen.getByTestId('settings-search'), 'zzznomatch');
    await user.click(screen.getByTestId('settings-search-clear'));
    expect(screen.getByTestId('settings-search')).toHaveValue('');
    expect(screen.queryByTestId('settings-nav-empty')).not.toBeInTheDocument();
    expect(screen.getByTestId('settings-nav-account-account')).toBeInTheDocument();
  });

  it('renders only the groups it is given (parent owns gating)', () => {
    renderNav({ groups: SETTINGS_NAV.filter((g) => g.scope === 'account') });
    expect(screen.getByTestId('settings-nav-account-profile')).toBeInTheDocument();
    expect(
      screen.queryByTestId('settings-nav-organization-general'),
    ).not.toBeInTheDocument();
  });
});
