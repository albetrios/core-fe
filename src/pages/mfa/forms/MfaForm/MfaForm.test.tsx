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
      const submit = screen.getByTestId('mfa-submit');
      expect(submit).toBeDisabled();
      expect(submit).toHaveTextContent(/verifying/i);
      // A changed label alone reads as a dead button — something has to move.
      expect(submit).toHaveAttribute('aria-busy', 'true');
      expect(submit.querySelector('.animate-spin')).toBeInTheDocument();
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

  // Regression (LOGIN-8, second site): the shake used to be a bare setTimeout
  // with no id, so a rapid second wrong code could not replay it and leaving the
  // screen inside the window fired setState on an unmounted component.
  describe('wrong-code shake', () => {
    it('replays on a second wrong code instead of being swallowed', async () => {
      mockUseLocation.mockReturnValue({ state: { mfaToken: 'temp-token' } });
      mfaVerifyMock.mockRejectedValue(new Error('bad code'));
      const user = userEvent.setup();
      renderWithRouter();

      const shaking = () => Boolean(document.querySelector('.animate-otp-shake'));

      await user.type(await screen.findByTestId('mfa-code'), '111111');
      await waitFor(() => expect(shaking()).toBe(true));

      // Second failure inside the window: the class must come off and go back
      // on, which is what makes the animation restart.
      await waitFor(() => expect(screen.getByTestId('mfa-code')).not.toBeDisabled());
      await user.type(screen.getByTestId('mfa-code'), '222222');
      await waitFor(() => expect(mfaVerifyMock).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(shaking()).toBe(true));
    });

    it('releases the shake timer when the screen goes away', async () => {
      mockUseLocation.mockReturnValue({ state: { mfaToken: 'temp-token' } });
      mfaVerifyMock.mockRejectedValue(new Error('bad code'));
      const user = userEvent.setup();
      const { unmount } = renderWithRouter();

      await user.type(await screen.findByTestId('mfa-code'), '111111');
      await waitFor(() => expect(mfaVerifyMock).toHaveBeenCalled());

      const cleared: number[] = [];
      const realClear = globalThis.clearTimeout;
      vi.spyOn(globalThis, 'clearTimeout').mockImplementation(((id: number) => {
        cleared.push(id);
        return realClear(id);
      }) as typeof clearTimeout);

      unmount();
      expect(cleared.length).toBeGreaterThan(0);
      vi.mocked(globalThis.clearTimeout).mockRestore();
    });

    // The frame that re-adds the class is owned too. Releasing only the timer left
    // a gap: leave while the frame was still pending and it ran afterwards, starting
    // a timer nobody owned. That timer fired after this file's teardown and failed
    // whole runs with `window is not defined`.
    it('cancels a shake frame that has not run yet when the screen goes away', async () => {
      mockUseLocation.mockReturnValue({ state: { mfaToken: 'temp-token' } });
      // Held open, so the frame queue is ours before the failure lands.
      let rejectVerify: (reason: unknown) => void = () => {};
      mfaVerifyMock.mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectVerify = reject;
          }),
      );
      const user = userEvent.setup();
      const { unmount } = renderWithRouter();
      await user.type(await screen.findByTestId('mfa-code'), '111111');
      await waitFor(() => expect(mfaVerifyMock).toHaveBeenCalled());

      const frames = new Map<number, FrameRequestCallback>();
      const requested: number[] = [];
      const requestFrame = vi
        .spyOn(globalThis, 'requestAnimationFrame')
        .mockImplementation((callback) => {
          const handle = requested.length + 1;
          requested.push(handle);
          frames.set(handle, callback);
          return handle;
        });
      const cancelFrame = vi
        .spyOn(globalThis, 'cancelAnimationFrame')
        .mockImplementation((handle) => {
          frames.delete(handle);
        });
      try {
        await act(async () => {
          rejectVerify(new Error('bad code'));
        });
        // The first frame requested after the failure is the shake's.
        const shakeFrame = requested[0];
        expect(shakeFrame).toBeDefined();

        unmount();

        // Run it if it survived, as the browser would on its next paint: it must
        // not start a timer for a screen that is gone.
        const timer = vi
          .spyOn(globalThis, 'setTimeout')
          .mockImplementation((() => 0) as unknown as typeof setTimeout);
        try {
          frames.get(shakeFrame ?? -1)?.(performance.now());
          expect(timer).not.toHaveBeenCalled();
        } finally {
          timer.mockRestore();
        }
      } finally {
        requestFrame.mockRestore();
        cancelFrame.mockRestore();
      }
    });
  });
});
