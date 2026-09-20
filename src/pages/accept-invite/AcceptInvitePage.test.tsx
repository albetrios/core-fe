import { act, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HttpError } from '@/shared/errors/HttpError.ts';
import { renderWithProviders } from '@/tests/utils/renderWithProviders.tsx';

const {
  navigateMock,
  getAccessTokenMock,
  acceptInvitationMock,
  switchToOrganizationMock,
  silentRefreshMock,
  notifyWarningMock,
  reportErrorMock,
  checkIconMock,
} = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  getAccessTokenMock: vi.fn(),
  acceptInvitationMock: vi.fn(),
  switchToOrganizationMock: vi.fn(),
  silentRefreshMock: vi.fn(),
  notifyWarningMock: vi.fn(),
  reportErrorMock: vi.fn(),
  checkIconMock: vi.fn(),
}));

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useParams: () => ({ invitationId: 'inv_test' }),
    useSearch: () => ({ token: 'test-token' }),
    useNavigate: () => navigateMock,
  };
});
vi.mock('@/shared/auth/token.ts', () => ({ getAccessToken: getAccessTokenMock }));
vi.mock('@/shared/api/organization-api.ts', () => ({
  acceptInvitation: acceptInvitationMock,
}));
vi.mock('@/shared/auth/service.ts', () => ({ silentRefresh: silentRefreshMock }));
vi.mock('@/shared/tenancy/switch.ts', () => ({
  switchToOrganization: switchToOrganizationMock,
}));
vi.mock('@/shared/notify/index.ts', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const notify = actual.notify as Record<string, unknown>;
  return { ...actual, notify: { ...notify, warning: notifyWarningMock } };
});
vi.mock('@/shared/errors/errorHandler.ts', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, reportError: reportErrorMock };
});
// Only the success icon is swapped, so a render crash can be injected into the
// card body without touching the rest of the icon surface.
vi.mock('@/shared/icons/index.ts', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    CheckCircle2: (props: Record<string, unknown>) => checkIconMock(props) as unknown,
  };
});

import { ACCEPT_INVITE_REDIRECT_MS } from './accept-invite.constants.ts';
import { AcceptInvitePage } from './AcceptInvitePage.tsx';

const LOGIN_REDIRECT = {
  to: '/login',
  search: { redirect: '/accept-invite/inv_test?token=test-token' },
  replace: true,
};
/** Long enough for the post-success redirect timer to have fired. */
const AFTER_REDIRECT_MS = ACCEPT_INVITE_REDIRECT_MS + 400;

beforeEach(() => {
  vi.clearAllMocks();
  getAccessTokenMock.mockReturnValue('token');
  acceptInvitationMock.mockResolvedValue({
    organizationId: 'org_1',
    organizationName: 'Acme',
    organizationSlug: 'acme',
  });
  switchToOrganizationMock.mockResolvedValue(undefined);
  silentRefreshMock.mockResolvedValue(undefined);
  checkIconMock.mockImplementation((props: Record<string, unknown>) => (
    <svg data-testid={props['data-testid'] as string} />
  ));
});

describe('AcceptInvitePage', () => {
  it('renders the page container while processing the invitation', async () => {
    renderWithProviders(<AcceptInvitePage />);
    expect(await screen.findByTestId('accept-invite-page')).toBeInTheDocument();
  });

  it('sends a signed-out visitor to login with the invite as the redirect', async () => {
    // The email recipient is usually not signed in — that must route to login
    // (deep link + token preserved), NOT render an "Invitation problem" card.
    getAccessTokenMock.mockReturnValue(null);
    renderWithProviders(<AcceptInvitePage />);

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith(LOGIN_REDIRECT));
    expect(acceptInvitationMock).not.toHaveBeenCalled();
  });

  it('accepts immediately when a session is present', async () => {
    renderWithProviders(<AcceptInvitePage />);
    await waitFor(() =>
      expect(acceptInvitationMock).toHaveBeenCalledWith('inv_test', 'test-token'),
    );
    expect(await screen.findByTestId('accept-invite-success')).toBeInTheDocument();
  });

  // ── The way the app really mounts it: inside <StrictMode> (main.tsx) ───────
  // React then mounts → unmounts → re-mounts every component once, in dev and so
  // in every E2E run. A ref survives that; a cleanup that only ever writes `false`
  // to it does not un-write itself.
  //
  // Plain `render`, on purpose: `renderWithProviders` mounts the page through the
  // router AFTER the first commit, and StrictMode's simulated remount never
  // reaches it — a StrictMode test written on that helper passes against the bug
  // (it did; the mutation check is what caught it). The success path renders no
  // `<Link>`, so it needs no router context.

  it('reaches success under StrictMode — the page is not "gone" after the double mount', async () => {
    // Regression: `aliveRef` was set to false by the simulated unmount and never
    // set back, so the finished accept hit `if (!aliveRef.current) return` and the
    // card sat on "Accepting your invitation…" forever — no success, no error, no
    // redirect. Every other test here mounts once, and passed.
    render(
      <StrictMode>
        <AcceptInvitePage />
      </StrictMode>,
    );

    expect(await screen.findByTestId('accept-invite-success')).toBeInTheDocument();
    expect(screen.queryByTestId('accept-invite-loading')).not.toBeInTheDocument();
    // The double mount must not double the WRITE either.
    expect(acceptInvitationMock).toHaveBeenCalledTimes(1);
  });

  it('recovers through login when the accept call itself 401s', async () => {
    // Session died between boot and accept — the invitation is still fine.
    acceptInvitationMock.mockRejectedValue(
      new HttpError('Unauthorized', 401, '/x', 'POST'),
    );
    renderWithProviders(<AcceptInvitePage />);

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith(LOGIN_REDIRECT));
    expect(screen.queryByTestId('accept-invite-error')).not.toBeInTheDocument();
  });

  it('keeps the error card for non-auth failures (expired / mismatch)', async () => {
    acceptInvitationMock.mockRejectedValue(
      new HttpError('Forbidden', 403, '/x', 'POST', {
        error: { detail: 'Invitee email mismatch' },
      }),
    );
    renderWithProviders(<AcceptInvitePage />);

    expect(await screen.findByTestId('accept-invite-error')).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalledWith(LOGIN_REDIRECT);
  });

  describe('when the accept succeeds but opening the organization fails (INV-1)', () => {
    it('stays signed in, explains it, and lands on the resolver — never /login', async () => {
      switchToOrganizationMock.mockRejectedValue(new Error('switch exploded'));
      renderWithProviders(<AcceptInvitePage />);

      // The membership was created, so this is still a success…
      expect(await screen.findByTestId('accept-invite-success')).toBeInTheDocument();
      // …but the user is told the workspace could not be opened, and the
      // swallowed error is reported instead of vanishing.
      await waitFor(() => expect(notifyWarningMock).toHaveBeenCalledTimes(1));
      expect(reportErrorMock).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          scope: 'accept-invite.switch',
          invitation_id: 'inv_test',
          organization_id: 'org_1',
        }),
      );

      await waitFor(
        () => expect(navigateMock).toHaveBeenCalledWith({ to: '/', replace: true }),
        { timeout: AFTER_REDIRECT_MS },
      );
      // The bug: a green check followed by the sign-in page.
      expect(navigateMock).not.toHaveBeenCalledWith(
        expect.objectContaining({ to: '/login' }),
      );
    });

    it('still opens the dashboard when the switch succeeds', async () => {
      renderWithProviders(<AcceptInvitePage />);

      expect(await screen.findByTestId('accept-invite-success')).toBeInTheDocument();
      await waitFor(
        () =>
          expect(navigateMock).toHaveBeenCalledWith(
            expect.objectContaining({
              to: '/organization/$organizationSlug/dashboard',
              params: { organizationSlug: 'acme' },
              replace: true,
            }),
          ),
        { timeout: AFTER_REDIRECT_MS },
      );
      expect(notifyWarningMock).not.toHaveBeenCalled();
    });
  });

  describe('retrying a failed accept', () => {
    beforeEach(() => {
      acceptInvitationMock.mockRejectedValue(
        new HttpError('Server error', 500, '/x', 'POST'),
      );
    });

    it('retries the accept from the error card', async () => {
      renderWithProviders(<AcceptInvitePage />);

      const retry = await screen.findByTestId('accept-invite-retry');
      expect(acceptInvitationMock).toHaveBeenCalledTimes(1);

      acceptInvitationMock.mockResolvedValue({
        organizationId: 'org_1',
        organizationName: 'Acme',
        organizationSlug: 'acme',
      });
      act(() => {
        retry.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(await screen.findByTestId('accept-invite-success')).toBeInTheDocument();
      expect(acceptInvitationMock).toHaveBeenCalledTimes(2);
    });

    it('never fires two accepts for one double-click', async () => {
      // Both clicks land in the same batch — the window `disabled={isRetrying}`
      // cannot close, because the disable only takes effect a render later.
      renderWithProviders(<AcceptInvitePage />);

      const retry = await screen.findByTestId('accept-invite-retry');
      expect(acceptInvitationMock).toHaveBeenCalledTimes(1);

      act(() => {
        retry.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        retry.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      await waitFor(() => expect(acceptInvitationMock).toHaveBeenCalledTimes(2));
      // A third call would be the second write this guard exists to stop.
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(acceptInvitationMock).toHaveBeenCalledTimes(2);
    });
  });

  // Regression (INV-2): the accept is a chain of long awaits, and the branches
  // after them set state, fire toasts and navigate. The redirect timer was
  // already released on unmount, so the navigation was covered — the toast was
  // not. Leaving mid-flight still popped a warning about a workspace the user
  // was no longer looking at.
  describe('when the user leaves while the accept is still running', () => {
    it('does not toast about a page the user has already left', async () => {
      let settleAccept: ((v: unknown) => void) | undefined;
      acceptInvitationMock.mockImplementation(
        () =>
          new Promise((resolve) => {
            settleAccept = resolve;
          }),
      );
      // The switch fails, which is the branch that surfaces a warning toast.
      switchToOrganizationMock.mockRejectedValue(new Error('switch exploded'));

      const { unmount } = renderWithProviders(<AcceptInvitePage />);
      await waitFor(() => expect(acceptInvitationMock).toHaveBeenCalled());

      unmount();
      settleAccept?.({ organizationId: 'org_1', organizationSlug: 'acme' });
      await waitFor(() => expect(switchToOrganizationMock).toHaveBeenCalled());
      await new Promise((r) => setTimeout(r, 50));

      expect(notifyWarningMock).not.toHaveBeenCalled();
      expect(navigateMock).not.toHaveBeenCalled();
    });

    it('still reports the swallowed switch error, because the join was real', async () => {
      let settleAccept: ((v: unknown) => void) | undefined;
      acceptInvitationMock.mockImplementation(
        () =>
          new Promise((resolve) => {
            settleAccept = resolve;
          }),
      );
      switchToOrganizationMock.mockRejectedValue(new Error('switch exploded'));

      const { unmount } = renderWithProviders(<AcceptInvitePage />);
      await waitFor(() => expect(acceptInvitationMock).toHaveBeenCalled());

      unmount();
      settleAccept?.({ organizationId: 'org_1', organizationSlug: 'acme' });

      // Silence for the user, but not for the logs — the membership exists.
      await waitFor(() => expect(reportErrorMock).toHaveBeenCalled());
    });
  });

  describe('when the status card throws', () => {
    // The boundary logs through react-error-boundary; React also logs the caught
    // error. Silence both so the failure path does not spam the suite output.
    let consoleError: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => {
      consoleError.mockRestore();
    });

    it('contains the crash to the card and keeps the page shell mounted', async () => {
      checkIconMock.mockImplementation(() => {
        throw new Error('status card exploded');
      });

      renderWithProviders(<AcceptInvitePage />);

      expect(await screen.findByTestId('accept-invite-card-error')).toBeInTheDocument();
      expect(screen.getByTestId('accept-invite-page')).toBeInTheDocument();
    });
  });
});
