import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '@/tests/utils/renderWithProviders.tsx';

const { logoutMock } = vi.hoisted(() => ({
  logoutMock: vi.fn(() => new Promise<void>(() => undefined)),
}));
vi.mock('@/shared/auth/service.ts', () => ({ logout: logoutMock }));

import { Component as UnauthorizedPage } from './UnauthorizedPage.tsx';

describe('UnauthorizedPage', () => {
  it('renders the 403 with a Go Home link', async () => {
    renderWithProviders(<UnauthorizedPage />);
    expect(await screen.findByTestId('unauthorized-page')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /go home/i })).toBeInTheDocument();
  });

  it('sends one logout for a double-clicked Sign out', async () => {
    // Two clicks in one frame — `disabled` has not re-rendered yet, so the
    // synchronous ref is what holds. logout() is single-flight underneath too;
    // this keeps the button honest about what it is doing.
    logoutMock.mockClear();
    renderWithProviders(<UnauthorizedPage />);
    const button = await screen.findByTestId('unauthorized-sign-out');

    act(() => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(logoutMock).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
  });

  it('offers a Sign out escape so the page is never a dead-end', async () => {
    // Regression: "Go Home" alone can loop when `/` re-resolves to the target
    // that just denied access — sign-out always breaks out.
    logoutMock.mockClear();
    const user = userEvent.setup();
    renderWithProviders(<UnauthorizedPage />);
    await user.click(await screen.findByTestId('unauthorized-sign-out'));
    expect(logoutMock).toHaveBeenCalledTimes(1);
  });
});
