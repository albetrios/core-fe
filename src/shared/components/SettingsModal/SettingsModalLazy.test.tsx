import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Stub the heavy modal: this suite tests the lazy SHELL (hash gating + chunk
// mounting), not the panels — SettingsModal.test.tsx covers those.
const { transport, reportErrorMock } = vi.hoisted(() => ({
  transport: { failuresLeft: 1, throwOnRender: false },
  reportErrorMock: vi.fn(),
}));
vi.mock('./SettingsModal.tsx', async () => {
  if (transport.failuresLeft > 0) {
    transport.failuresLeft -= 1;
    throw new Error('Settings chunk unavailable');
  }
  return {
    SettingsModal: () => {
      if (transport.throwOnRender) throw new Error('Settings render failed');
      return <div data-testid="settings-modal-stub" />;
    },
  };
});
vi.mock('@/shared/errors/errorHandler.ts', () => ({ reportError: reportErrorMock }));

const navigateMock = vi.fn();
const routerState = { hash: '', pathname: '/dashboard' };
const authState = { isAuthenticated: true, isLoading: false };
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  Outlet: () => <div data-testid="route-outlet" />,
  useNavigate: () => navigateMock,
  useRouterState: ({ select }: { select: (s: unknown) => unknown }) =>
    select({ location: { hash: routerState.hash, pathname: routerState.pathname } }),
}));
vi.mock('@/shared/store/useAuthStore/index.ts', () => ({
  useAuthStore: (selector: (s: typeof authState) => unknown) => selector(authState),
}));

import { SettingsModalLazy } from './SettingsModalLazy.tsx';

describe('SettingsModalLazy', () => {
  beforeEach(() => {
    routerState.hash = '';
    routerState.pathname = '/dashboard';
    authState.isAuthenticated = true;
    authState.isLoading = false;
    navigateMock.mockReset();
  });

  it('keeps the outlet mounted when preload fails and settings is retried', async () => {
    const { rerender } = render(<SettingsModalLazy />);
    const outlet = screen.getByTestId('route-outlet');
    await waitFor(() =>
      expect(reportErrorMock).toHaveBeenCalledWith(expect.any(Error), {
        scope: 'settings-preload',
      }),
    );
    expect(outlet).toBeVisible();
    routerState.hash = 'settings/account/profile';
    rerender(<SettingsModalLazy />);
    expect(await screen.findByTestId('settings-modal-stub')).toBeInTheDocument();
    expect(screen.getByTestId('route-outlet')).toBe(outlet);
    routerState.hash = '';
    rerender(<SettingsModalLazy />);
    expect(screen.getByTestId('route-outlet')).toBe(outlet);
  });

  it('contains a settings render failure without discarding the page', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { rerender } = render(<SettingsModalLazy />);
    const outlet = screen.getByTestId('route-outlet');
    transport.throwOnRender = true;
    routerState.hash = 'settings/account/profile';
    try {
      rerender(<SettingsModalLazy />);
      expect(await screen.findByTestId('settings-modal-load-error')).toBeInTheDocument();
      expect(screen.getByTestId('route-outlet')).toBe(outlet);
    } finally {
      transport.throwOnRender = false;
      consoleError.mockRestore();
    }
  });

  it('readies settings with the app even before a settings hash is present', async () => {
    routerState.hash = '';
    render(<SettingsModalLazy />);
    expect(await screen.findByTestId('route-outlet')).toBeInTheDocument();
    expect(screen.queryByTestId('settings-modal-stub')).not.toBeInTheDocument();
  });

  it('renders the app without a modal for unrelated hashes', async () => {
    routerState.hash = 'some-anchor';
    render(<SettingsModalLazy />);
    expect(await screen.findByTestId('route-outlet')).toBeInTheDocument();
    expect(screen.queryByTestId('settings-modal-stub')).not.toBeInTheDocument();
  });

  it('mounts the modal chunk when a settings hash is present on an allowed path', async () => {
    routerState.hash = 'settings/account/profile';
    routerState.pathname = '/dashboard';
    render(<SettingsModalLazy />);
    expect(await screen.findByTestId('settings-modal-stub')).toBeInTheDocument();
  });

  it('does not mount on onboarding and strips the settings hash', async () => {
    routerState.hash = 'settings/account/profile';
    routerState.pathname = '/onboarding';
    render(<SettingsModalLazy />);
    expect(screen.getByTestId('route-outlet')).toBeInTheDocument();
    expect(screen.queryByTestId('settings-modal-stub')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith(
        expect.objectContaining({ hash: '', replace: true }),
      ),
    );
  });

  it('does not mount for signed-out users and strips the settings hash', async () => {
    authState.isAuthenticated = false;
    routerState.hash = 'settings/account/profile';
    render(<SettingsModalLazy />);
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith(
        expect.objectContaining({ hash: '', replace: true }),
      ),
    );
  });

  it('waits for auth bootstrap before stripping or mounting', () => {
    authState.isLoading = true;
    authState.isAuthenticated = false;
    routerState.hash = 'settings/account/profile';
    render(<SettingsModalLazy />);
    expect(screen.getByTestId('route-outlet')).toBeInTheDocument();
    expect(screen.queryByTestId('settings-modal-stub')).not.toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
