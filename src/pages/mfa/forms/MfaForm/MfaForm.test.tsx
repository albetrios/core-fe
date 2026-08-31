import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { MfaForm } from './MfaForm.tsx';

const { mfaVerifyMock, establishSessionMock } = vi.hoisted(() => ({
  mfaVerifyMock: vi.fn().mockResolvedValue({ accessToken: 'token' }),
  establishSessionMock: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/shared/api/auth-api.ts', () => ({
  authApi: { mfaVerify: mfaVerifyMock },
}));
vi.mock('@/shared/auth/service.ts', () => ({
  establishSession: establishSessionMock,
}));

const mockUseLocation = vi.fn();
// `navigate` is stubbed so a test can hold the route swap open — the window
// between "verify resolved" and "route changed" is where the re-armed button lived.
const mockNavigate = vi.fn<(...args: unknown[]) => Promise<void>>();
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await (importOriginal as () => Promise<Record<string, unknown>>)();
  return {
    ...actual,
    useLocation: (...args: unknown[]) => mockUseLocation(...args),
    useNavigate: () => mockNavigate,
  };
});

function createTestRouter() {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const mfaRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/mfa',
    component: () => <MfaForm />,
  });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <div data-testid="home">home</div>,
  });
  const tree = rootRoute.addChildren([mfaRoute, indexRoute]);
  const history = createMemoryHistory({ initialEntries: ['/mfa'] });
  return createRouter({ routeTree: tree, history });
}

function renderWithRouter() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createTestRouter();
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe('MfaForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mfaVerifyMock.mockResolvedValue({ accessToken: 'token' });
    mockNavigate.mockResolvedValue(undefined);
    mockUseLocation.mockReturnValue({ state: undefined });
  });

  it('renders session expired when no mfaToken in state', async () => {
    renderWithRouter();
    expect(await screen.findByText(/session expired/i)).toBeInTheDocument();
  });

  it('renders code form when mfaToken in state', async () => {
    mockUseLocation.mockReturnValue({ state: { mfaToken: 'temp-token' } });
    renderWithRouter();
    expect(await screen.findByTestId('mfa-form')).toBeInTheDocument();
    expect(screen.getByTestId('mfa-code')).toBeInTheDocument();
    expect(screen.getByTestId('mfa-submit')).toBeInTheDocument();
  });

  it('has no accessibility violations when form shown', async () => {
    mockUseLocation.mockReturnValue({ state: { mfaToken: 'temp-token' } });
    const { container } = renderWithRouter();
    await screen.findByTestId('mfa-form');
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('submits a 6-digit code as a TOTP factor and establishes the session', async () => {
    mockUseLocation.mockReturnValue({ state: { mfaToken: 'temp-token' } });
    const user = userEvent.setup();
    renderWithRouter();

    await user.type(await screen.findByTestId('mfa-code'), '123456');

    await waitFor(() =>
      expect(mfaVerifyMock).toHaveBeenCalledWith(
        { code: '123456', useRecoveryCode: false },
        'temp-token',
      ),
    );
    expect(establishSessionMock).toHaveBeenCalledWith('token');
  });

  it('toggles to a recovery code and submits it as a recovery factor', async () => {
    mockUseLocation.mockReturnValue({ state: { mfaToken: 'temp-token' } });
    const user = userEvent.setup();
    renderWithRouter();

    await user.click(await screen.findByTestId('mfa-toggle-recovery'));
    expect(screen.getByTestId('mfa-toggle-recovery')).toHaveTextContent(
      /authenticator app instead/i,
    );
    await user.type(screen.getByTestId('mfa-code'), 'abcd1234');
    await user.click(screen.getByTestId('mfa-submit'));

    await waitFor(() =>
      expect(mfaVerifyMock).toHaveBeenCalledWith(
        { code: 'abcd1234', useRecoveryCode: true },
        'temp-token',
      ),
    );
  });

  describe('single-flight — one gesture spends one MFA token', () => {
    /**
     * The MFA session token is single use. Every duplicate verify below spends a
     * token core-be has already burned, so the second request does not merely
     * waste a round trip — it fails the sign-in the first request just won.
     */
    function deferredVerify() {
      let release!: (value: { accessToken: string }) => void;
      let reject!: (reason: unknown) => void;
      mfaVerifyMock.mockImplementation(
        () =>
          new Promise<{ accessToken: string }>((res, rej) => {
            release = res;
            reject = rej;
          }),
      );
      return { release: () => release({ accessToken: 'token' }), reject };
    }

    it('sends one verify for a double-click landing in the same frame', async () => {
      mockUseLocation.mockReturnValue({ state: { mfaToken: 'temp-token' } });
      const user = userEvent.setup();
      deferredVerify();
      renderWithRouter();

      await user.click(await screen.findByTestId('mfa-toggle-recovery'));
      await user.type(screen.getByTestId('mfa-code'), 'abcd1234');

      // `fireEvent.click` flushes React between calls, so `disabled` lands and a
      // guardless build still passes. Both clicks go out in ONE act batch — the
      // real window a bouncing touch target or an impatient second tap hits.
      const submit = screen.getByTestId('mfa-submit');
      await act(() => {
        submit.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        submit.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        return Promise.resolve();
      });

      await waitFor(() => expect(mfaVerifyMock).toHaveBeenCalledTimes(1));
      expect(mfaVerifyMock).toHaveBeenCalledTimes(1);
    });

    it('locks the code boxes while the verify is in flight', async () => {
      mockUseLocation.mockReturnValue({ state: { mfaToken: 'temp-token' } });
      const user = userEvent.setup();
      deferredVerify();
      renderWithRouter();

      await user.type(await screen.findByTestId('mfa-code'), '123456');
      await waitFor(() => expect(mfaVerifyMock).toHaveBeenCalledTimes(1));

      // Editable boxes were the bug: clearing one and retyping it re-fired
      // `onComplete`, which posted the spent token again.
      expect(screen.getByTestId('mfa-code')).toBeDisabled();
      expect(screen.getByTestId('mfa-submit')).toBeDisabled();
      expect(screen.getByTestId('mfa-submit')).toHaveTextContent(/verifying/i);
    });

    it('holds the pending state through the post-verify navigation', async () => {
      mockUseLocation.mockReturnValue({ state: { mfaToken: 'temp-token' } });
      const user = userEvent.setup();
      // The route swap never settles: the assertions below all run inside the
      // window the user actually sees between a good code and the next screen.
      mockNavigate.mockImplementation(() => new Promise<void>(() => {}));
      renderWithRouter();

      await user.type(await screen.findByTestId('mfa-code'), '123456');
      await waitFor(() => expect(mockNavigate).toHaveBeenCalled());

      // "Verifying..." must not flip back to an armed "Verify" while the router
      // is still swapping the route — that re-armed button is the duplicate.
      expect(screen.getByTestId('mfa-submit')).toHaveTextContent(/verifying/i);
      expect(screen.getByTestId('mfa-submit')).toBeDisabled();
      expect(screen.getByTestId('mfa-code')).toBeDisabled();
      expect(mfaVerifyMock).toHaveBeenCalledTimes(1);
    });

    it('re-arms the form after a failed verify so a fresh code can be sent', async () => {
      mockUseLocation.mockReturnValue({ state: { mfaToken: 'temp-token' } });
      const user = userEvent.setup();
      mfaVerifyMock.mockRejectedValue(new Error('invalid code'));
      renderWithRouter();

      await user.type(await screen.findByTestId('mfa-code'), '123456');
      await waitFor(() => expect(mfaVerifyMock).toHaveBeenCalledTimes(1));

      // The latch is a single-flight guard, not a one-shot fuse.
      await waitFor(() => expect(screen.getByTestId('mfa-code')).not.toBeDisabled());
      await user.type(screen.getByTestId('mfa-code'), '654321');
      await waitFor(() => expect(mfaVerifyMock).toHaveBeenCalledTimes(2));
    });
  });
});
