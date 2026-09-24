import { type Mock, vi } from 'vitest';

import { PRODUCT_NAMESPACE } from '@/lib/product-identity.ts';
import type * as AuthStoreModule from '@/shared/store/useAuthStore/index.ts';
import type { MeContext } from '@/shared/tenancy/me-context.ts';

import type * as AuthServiceModule from './service.ts';
import type * as TokenModule from './token.ts';

/**
 * Sign-outs that must STAY signed out.
 *
 * `forceLogout()` only clears this tab; the HttpOnly refresh cookie outlives it.
 * Every deliberate end of a live session therefore goes through `logout()`, and
 * when that revoke cannot reach the server (offline — the usual state of a
 * laptop that has just woken past its idle deadline) a marker makes the next
 * boot finish the job instead of silently restoring the session.
 *
 * `startAuthBootstrap` is memoised per module instance, so each test imports a
 * fresh copy of the service (and of everything holding state beside it).
 */
const REVOKE_PENDING_KEY = `${PRODUCT_NAMESPACE}:logout-pending`;
const SKIP_AUTO_GOOGLE_KEY = `${PRODUCT_NAMESPACE}-auth-skip-auto-google`;
const SESSION_STARTED_AT_KEY = `${PRODUCT_NAMESPACE}:session-started-at`;

/** Put the browser in the state a returning, previously signed-in one is in. */
function markPreviouslySignedIn(): void {
  localStorage.setItem(SESSION_STARTED_AT_KEY, String(Date.now()));
}

const { fetchMeContextMock, captureMock } = vi.hoisted(() => ({
  fetchMeContextMock: vi.fn(),
  captureMock: vi.fn(),
}));

vi.mock('@/core/http/queryClient.ts', () => ({
  queryClient: { clear: vi.fn(), setQueryData: vi.fn(), removeQueries: vi.fn() },
}));
vi.mock('@/shared/tenancy/me-context.ts', () => ({
  fetchMeContext: fetchMeContextMock,
  meContextQueryKey: ['auth', 'me-context'],
}));
vi.mock('@/shared/auth/refresh-timer.ts', () => ({
  scheduleTokenRefresh: vi.fn(),
  cancelTokenRefresh: vi.fn(),
}));
vi.mock('@/shared/analytics/capture.ts', () => ({
  captureAnalyticsEvent: captureMock,
}));

const TOKEN = 'header.payload.signature';

const SAMPLE_CTX: MeContext = {
  user: {
    id: 'usr_1',
    email: 'ada@acme.test',
    isEmailVerified: true,
    isMfaEnabled: false,
    firstName: 'Ada',
    lastName: 'Byron',
    avatarUrl: null,
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  activeOrganization: null,
  myPermissions: [],
  globalRole: null,
  organizations: [],
  deploymentFlags: { personalOrganizations: true, teamOrganizations: true },
  personalOrganizationId: null,
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Requests the service made, as `METHOD path` — order is part of the contract. */
function requests(fetchMock: Mock): string[] {
  return fetchMock.mock.calls.map(([url, init]) => {
    const path = String(url).replace(/^.*\/api\/v1/, '');
    return `${(init as RequestInit | undefined)?.method ?? 'GET'} ${path}`;
  });
}

describe('auth/service — sign-outs that stay signed out', () => {
  let service: typeof AuthServiceModule;
  let token: typeof TokenModule;
  let useAuthStore: (typeof AuthStoreModule)['useAuthStore'];
  let fetchMock: Mock;

  beforeEach(async () => {
    vi.resetModules();
    vi.resetAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { href: '', pathname: '/dashboard' },
    });
    service = await import('./service.ts');
    token = await import('./token.ts');
    ({ useAuthStore } = await import('@/shared/store/useAuthStore/index.ts'));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    sessionStorage.clear();
  });

  describe('logout()', () => {
    it('leaves no marker once the server confirms the revoke', async () => {
      fetchMock.mockResolvedValueOnce(json({}));
      token.setAccessToken(TOKEN);

      await service.logout();

      expect(localStorage.getItem(REVOKE_PENDING_KEY)).toBeNull();
      expect(window.location.href).toBe('/login');
    });

    it('marks the revoke pending when the request never reaches the server', async () => {
      // A laptop waking past its idle deadline: the timer fires before Wi-Fi is
      // back. Without the marker the next load restores the session.
      fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      token.setAccessToken(TOKEN);

      await service.logout({ reason: 'idle_timeout' });

      expect(localStorage.getItem(REVOKE_PENDING_KEY)).toBe('1');
      expect(token.getAccessToken()).toBeNull();
      expect(window.location.href).toBe('/login');
    });

    it('marks the revoke pending when the server refuses it', async () => {
      fetchMock.mockResolvedValueOnce(json({ error: { detail: 'unauthorized' } }, 401));

      await service.logout();

      expect(localStorage.getItem(REVOKE_PENDING_KEY)).toBe('1');
    });

    it.each(['logout', 'idle_timeout', 'session_expired'] as const)(
      'labels the session_ended event "%s"',
      async (reason) => {
        fetchMock.mockResolvedValueOnce(json({}));

        await service.logout({ reason });

        expect(captureMock).toHaveBeenCalledWith('session_ended', { reason });
      },
    );
  });

  describe('boot with a pending revoke', () => {
    beforeEach(() => {
      localStorage.setItem(REVOKE_PENDING_KEY, '1');
    });

    it('mints a token, spends it on the revoke, and stays a guest', async () => {
      fetchMock
        .mockResolvedValueOnce(json({ data: { access_token: TOKEN } }))
        .mockResolvedValueOnce(json({}));

      await service.startAuthBootstrap();

      expect(requests(fetchMock)).toEqual(['POST /auth/refresh', 'POST /auth/logout']);
      expect(fetchMock.mock.calls[1]?.[1]).toEqual(
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: `Bearer ${TOKEN}` }),
        }),
      );
      // The session is never hydrated — no me/context, no user, no token left.
      expect(fetchMeContextMock).not.toHaveBeenCalled();
      expect(token.getAccessToken()).toBeNull();
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
      expect(useAuthStore.getState().isLoading).toBe(false);
      expect(localStorage.getItem(REVOKE_PENDING_KEY)).toBeNull();
    });

    it('clears the marker when the server says there is no session left', async () => {
      fetchMock.mockResolvedValueOnce(json({ error: { detail: 'no session' } }, 401));

      await service.startAuthBootstrap();

      expect(requests(fetchMock)).toEqual(['POST /auth/refresh']);
      expect(localStorage.getItem(REVOKE_PENDING_KEY)).toBeNull();
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });

    it('keeps the marker while the outcome is unknown (still offline)', async () => {
      fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      await service.startAuthBootstrap();

      expect(localStorage.getItem(REVOKE_PENDING_KEY)).toBe('1');
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
      expect(useAuthStore.getState().isLoading).toBe(false);
    });

    it('keeps the marker, and stays a guest, when the revoke itself fails', async () => {
      fetchMock
        .mockResolvedValueOnce(json({ data: { access_token: TOKEN } }))
        .mockResolvedValueOnce(json({ error: { detail: 'try later' } }, 503));

      await service.startAuthBootstrap();

      expect(localStorage.getItem(REVOKE_PENDING_KEY)).toBe('1');
      expect(token.getAccessToken()).toBeNull();
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });

    it('is dropped by an interactive sign-in — it must not revoke the NEW session', async () => {
      fetchMeContextMock.mockResolvedValueOnce(SAMPLE_CTX);

      await service.establishSession(TOKEN);

      expect(localStorage.getItem(REVOKE_PENDING_KEY)).toBeNull();
      expect(token.getAccessToken()).toBe(TOKEN);
    });
  });

  it('boots normally when nothing is pending', async () => {
    markPreviouslySignedIn();
    fetchMock.mockResolvedValueOnce(json({ data: { access_token: TOKEN } }));
    fetchMeContextMock.mockResolvedValueOnce(SAMPLE_CTX);

    await service.startAuthBootstrap();

    expect(requests(fetchMock)).toEqual(['POST /auth/refresh']);
    expect(token.getAccessToken()).toBe(TOKEN);
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  describe('a browser with no session to restore', () => {
    // The refresh is the only backend call the login screen makes on a cold
    // load, and for these two visitors it can only ever answer 401. Asking
    // anyway costs a cross-origin round trip on the critical path.
    it('asks nothing of the server on a first-ever visit', async () => {
      await service.startAuthBootstrap();

      expect(fetchMock).not.toHaveBeenCalled();
      expect(fetchMeContextMock).not.toHaveBeenCalled();
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
      // Still resolved, not stuck behind a splash that never lifts.
      expect(useAuthStore.getState().isLoading).toBe(false);
    });

    it('asks nothing of the server after a sign-out', async () => {
      markPreviouslySignedIn();
      fetchMock.mockResolvedValueOnce(json({}));
      token.setAccessToken(TOKEN);
      await service.logout();
      fetchMock.mockClear();

      await service.startAuthBootstrap();

      expect(fetchMock).not.toHaveBeenCalled();
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });

    // The hint says "signed in last we looked" — it may gate the ASK, never
    // the answer. A stale hint must still leave the visitor signed OUT.
    it('still trusts the server, not the hint, when the hint is stale', async () => {
      markPreviouslySignedIn();
      fetchMock.mockResolvedValueOnce(json({ error: { detail: 'no session' } }, 401));

      await service.startAuthBootstrap();

      expect(requests(fetchMock)).toEqual(['POST /auth/refresh']);
      expect(token.getAccessToken()).toBeNull();
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
      expect(useAuthStore.getState().isLoading).toBe(false);
    });
  });

  describe('auto Google sign-in after a sign-out', () => {
    // With auto-Google on, /login starts OAuth by itself — a live Google session
    // would sign the user back in without a click, undoing the sign-out.
    it.each(['logout', 'idle_timeout', 'session_expired'] as const)(
      'is suppressed after a deliberate end (%s)',
      (reason) => {
        service.forceLogout({ reason });

        expect(sessionStorage.getItem(SKIP_AUTO_GOOGLE_KEY)).toBe('1');
      },
    );

    it('is suppressed in sibling tabs that hear the logout broadcast', () => {
      service.handleCrossTabLogout();

      expect(sessionStorage.getItem(SKIP_AUTO_GOOGLE_KEY)).toBe('1');
    });

    it('is kept for a session the server killed — nobody asked to leave', () => {
      service.forceLogout();

      expect(sessionStorage.getItem(SKIP_AUTO_GOOGLE_KEY)).toBeNull();
    });
  });
});
