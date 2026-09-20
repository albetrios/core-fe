import { type Mock, vi } from 'vitest';

import { PRODUCT_NAMESPACE } from '@/lib/product-identity.ts';
import { useAuthStore } from '@/shared/store/useAuthStore/index.ts';
import { useOnboardingStore } from '@/shared/store/useOnboardingStore/index.ts';
import { useOrganizationStore } from '@/shared/store/useOrganizationStore/index.ts';
import type { MeContext } from '@/shared/tenancy/me-context.ts';
import { hydrateSessionContext } from '@/shared/tenancy/session-context.ts';

import { clearAccessToken, getAccessToken, setAccessToken } from './token.ts';
import type { AuthUser } from './types.ts';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

// Mock global fetch
let fetchMock: ReturnType<typeof vi.fn>;

const { fetchMeContextMock, setQueryDataMock } = vi.hoisted(() => ({
  fetchMeContextMock: vi.fn(),
  setQueryDataMock: vi.fn(),
}));

vi.mock('@/core/http/queryClient.ts', () => ({
  queryClient: { clear: vi.fn(), setQueryData: setQueryDataMock, removeQueries: vi.fn() },
}));

vi.mock('@/shared/tenancy/me-context.ts', () => ({
  fetchMeContext: fetchMeContextMock,
  meContextQueryKey: ['auth', 'me-context'],
}));

vi.mock('@/shared/auth/refresh-timer.ts', () => ({
  scheduleTokenRefresh: vi.fn(),
  cancelTokenRefresh: vi.fn(),
}));

/** Helper to create a minimal JWT (base64url) */
function makeJwt(payload: Record<string, unknown>): string {
  const encode = (obj: Record<string, unknown>) =>
    btoa(JSON.stringify(obj))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/={1,2}$/, '');
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const body = encode(payload);
  return `${header}.${body}.dGVzdHNpZw`;
}

const VALID_TOKEN = makeJwt({ sub: 'user1', exp: 9999999999 });
const MOCK_USER: AuthUser = {
  id: 'user-1',
  email: 'test@example.com',
  role: 'admin',
  organizationId: 'org_test1',
  name: 'Test User',
};

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
  activeOrganization: {
    id: 'org_1',
    name: 'Acme',
    slug: 'acme',
    type: 'TEAM',
    status: 'ACTIVE',
    logoUrl: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  myPermissions: ['organization:read'],
  globalRole: null,
  organizations: [],
  deploymentFlags: { personalOrganizations: true, teamOrganizations: true },
  personalOrganizationId: null,
};

function mockFetchResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

import type * as AuthServiceModule from './service.ts';

describe('auth/service', () => {
  let silentRefresh: AuthServiceModule['silentRefresh'];
  let forceLogout: AuthServiceModule['forceLogout'];
  let handleCrossTabLogout: AuthServiceModule['handleCrossTabLogout'];
  let logout: AuthServiceModule['logout'];
  let refreshAccessToken: AuthServiceModule['refreshAccessToken'];
  let establishSession: AuthServiceModule['establishSession'];
  let startAuthBootstrap: AuthServiceModule['startAuthBootstrap'];

  beforeAll(async () => {
    const mod = await import('./service.ts');
    silentRefresh = mod.silentRefresh;
    forceLogout = mod.forceLogout;
    handleCrossTabLogout = mod.handleCrossTabLogout;
    logout = mod.logout;
    refreshAccessToken = mod.refreshAccessToken;
    establishSession = mod.establishSession;
    startAuthBootstrap = mod.startAuthBootstrap;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    clearAccessToken();
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      isLoading: true,
    });
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { href: '' },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('forceLogout', () => {
    it('clears token, auth store, and redirects to /login', () => {
      setAccessToken(VALID_TOKEN);
      useAuthStore.getState().setUser(MOCK_USER);

      forceLogout();

      expect(getAccessToken()).toBeNull();
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
      expect(useAuthStore.getState().user).toBeNull();
      expect(window.location.href).toBe('/login');
    });

    it('wipes the active-org context + RBAC permissions (no privilege bleed to next sign-in)', () => {
      setAccessToken(VALID_TOKEN);
      useAuthStore.getState().setUser(MOCK_USER);
      // Seed an org context with elevated grants, as if a session were active.
      useOrganizationStore.getState().setOrganization('org_prev', 'acme', 'active');
      useOrganizationStore.setState({ permissions: ['membership:manage'] });

      forceLogout();

      // Must not rely on the post-logout reload — the store is cleared inline,
      // so a non-reloading logout path can't leave one user's grants behind.
      expect(useOrganizationStore.getState().organizationId).toBeNull();
      expect(useOrganizationStore.getState().permissions).toEqual([]);
    });

    it('wipes persisted onboarding progress (no wizard/PII leak to the next user)', () => {
      setAccessToken(VALID_TOKEN);
      // Simulate a user mid-wizard: owner bound, name typed, step advanced.
      const onboarding = useOnboardingStore.getState();
      onboarding.claimForUser('usr_prev');
      onboarding.patch({ firstName: 'Prev', lastName: 'User' });
      onboarding.setStepIndex(3);

      forceLogout();

      // The NEXT user on this browser must start the wizard from scratch —
      // otherwise their finish step submits the PREVIOUS user's name.
      const state = useOnboardingStore.getState();
      expect(state.stepIndex).toBe(0);
      expect(state.data.firstName).toBe('');
      expect(state.data.lastName).toBe('');
      expect(state.forUserId).toBeNull();
    });
  });

  describe('silentRefresh', () => {
    it('sets token and user on success', async () => {
      fetchMeContextMock.mockResolvedValueOnce(SAMPLE_CTX);
      (fetchMock as Mock).mockResolvedValueOnce(
        mockFetchResponse({ data: { access_token: VALID_TOKEN } }),
      );

      await silentRefresh();

      expect(getAccessToken()).toBe(VALID_TOKEN);
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
      expect(useAuthStore.getState().user?.email).toBe('ada@acme.test');
    });

    it('rolls back token if context fetch fails', async () => {
      (fetchMock as Mock).mockResolvedValueOnce(
        mockFetchResponse({ data: { access_token: VALID_TOKEN } }),
      );
      fetchMeContextMock.mockRejectedValueOnce(new Error('Network error'));

      await expect(silentRefresh()).rejects.toThrow('Network error');
      expect(getAccessToken()).toBeNull();
    });

    it('rejects if refresh endpoint fails', async () => {
      (fetchMock as Mock).mockRejectedValueOnce(new Error('401'));

      await expect(silentRefresh()).rejects.toThrow('401');
      expect(getAccessToken()).toBeNull();
    });

    it('deduplicates concurrent calls (mutex)', async () => {
      fetchMeContextMock.mockResolvedValue(SAMPLE_CTX);
      (fetchMock as Mock).mockResolvedValue(
        mockFetchResponse({ data: { access_token: VALID_TOKEN } }),
      );

      const [r1, r2] = await Promise.all([silentRefresh(), silentRefresh()]);

      expect(r1).toBeUndefined();
      expect(r2).toBeUndefined();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('refreshAccessToken (the ONE single-flight)', () => {
    it('concurrent calls share ONE /auth/refresh request', async () => {
      (fetchMock as Mock).mockResolvedValueOnce(
        mockFetchResponse({ data: { access_token: VALID_TOKEN } }),
      );

      // jsdom has no navigator.locks, so this also covers the fallback path.
      await Promise.all([refreshAccessToken(), refreshAccessToken()]);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/auth/refresh');
      expect(getAccessToken()).toBe(VALID_TOKEN);
    });

    it('a failed refresh clears the in-flight slot so the next call retries', async () => {
      (fetchMock as Mock)
        .mockResolvedValueOnce(mockFetchResponse({ message: 'session revoked' }, 401))
        .mockResolvedValueOnce(
          mockFetchResponse({ data: { access_token: VALID_TOKEN } }),
        );

      await expect(refreshAccessToken()).rejects.toThrow('session revoked');
      await refreshAccessToken();

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(getAccessToken()).toBe(VALID_TOKEN);
    });

    it('serializes through the cross-tab Web Lock when navigator.locks exists', async () => {
      const lockRequest = vi.fn(
        (_name: string, cb: () => Promise<unknown>): Promise<unknown> => cb(),
      );
      Object.defineProperty(navigator, 'locks', {
        configurable: true,
        value: { request: lockRequest },
      });
      try {
        (fetchMock as Mock).mockResolvedValueOnce(
          mockFetchResponse({ accessToken: VALID_TOKEN }),
        );

        await refreshAccessToken();

        expect(lockRequest).toHaveBeenCalledTimes(1);
        expect(lockRequest.mock.calls[0]?.[0]).toBe(`${PRODUCT_NAMESPACE}-auth:refresh`);
        expect(getAccessToken()).toBe(VALID_TOKEN);
      } finally {
        delete (navigator as { locks?: unknown }).locks;
      }
    });
  });

  describe('logout', () => {
    it('calls logout endpoint and then forceLogout', async () => {
      (fetchMock as Mock).mockResolvedValueOnce(mockFetchResponse({}));
      setAccessToken(VALID_TOKEN);
      useAuthStore.getState().setUser(MOCK_USER);

      await logout();

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/auth/logout'),
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
        }),
      );
      expect(getAccessToken()).toBeNull();
      expect(window.location.href).toBe('/login');
    });

    it('revokes once for a double-clicked Sign out', async () => {
      // The menu item is a bare async onClick — two clicks in one frame both
      // get through. The second POST would go out AFTER the first cleared the
      // token, i.e. unauthenticated, against a backend that treats refresh
      // reuse as an attack.
      (fetchMock as Mock).mockResolvedValue(mockFetchResponse({}));
      setAccessToken(VALID_TOKEN);
      const logoutCalls = () =>
        (fetchMock as Mock).mock.calls.filter(([url]) =>
          String(url).includes('/auth/logout'),
        ).length;

      await Promise.all([logout(), logout()]);

      expect(logoutCalls()).toBe(1);
    });

    it('sends the current access token as the Authorization bearer', async () => {
      // Regression: core-be revokes the session BY the bearer token and 401s
      // without one. logout() used to omit the header, so the server session
      // and refresh cookie survived and the /login bootstrap silently signed
      // the user straight back in — "Log out" was a visible no-op.
      (fetchMock as Mock).mockResolvedValueOnce(mockFetchResponse({}));
      setAccessToken(VALID_TOKEN);

      await logout();

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/auth/logout'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${VALID_TOKEN}`,
          }),
        }),
      );
    });

    it('omits the Authorization header when no token is in memory', async () => {
      (fetchMock as Mock).mockResolvedValueOnce(mockFetchResponse({}));

      await logout();

      const headers = (fetchMock as Mock).mock.calls[0]?.[1]?.headers as Record<
        string,
        string
      >;
      expect(headers.Authorization).toBeUndefined();
      expect(window.location.href).toBe('/login');
    });

    it('still clears local state when the server refuses the revoke (non-2xx)', async () => {
      (fetchMock as Mock).mockResolvedValueOnce(
        mockFetchResponse({ error: { message: 'unauthorized' } }, 401),
      );
      setAccessToken(VALID_TOKEN);

      await logout();

      expect(getAccessToken()).toBeNull();
      expect(window.location.href).toBe('/login');
    });

    it('still clears state even if logout endpoint fails', async () => {
      (fetchMock as Mock).mockRejectedValueOnce(new Error('Network down'));
      setAccessToken(VALID_TOKEN);

      await logout();

      expect(getAccessToken()).toBeNull();
      expect(window.location.href).toBe('/login');
    });
  });

  describe('establishSession', () => {
    it('seeds the me/context cache + header user from one canonical read', async () => {
      fetchMeContextMock.mockResolvedValueOnce(SAMPLE_CTX);

      await establishSession(VALID_TOKEN);

      expect(getAccessToken()).toBe(VALID_TOKEN);
      expect(setQueryDataMock).toHaveBeenCalledWith(['auth', 'me-context'], SAMPLE_CTX);
      const user = useAuthStore.getState().user;
      expect(user?.email).toBe('ada@acme.test');
      expect(user?.name).toBe('Ada Byron');
      expect(user?.organizationId).toBe('org_1');
    });

    it('rolls the token back if the context load fails', async () => {
      fetchMeContextMock.mockRejectedValueOnce(new Error('500'));

      await expect(establishSession(VALID_TOKEN)).rejects.toThrow('500');
      expect(getAccessToken()).toBeNull();
    });
  });
  describe('auth completion ordering', () => {
    const NEXT_TOKEN = makeJwt({ sub: 'next-user', exp: 9999999999 });
    const NEXT_CTX: MeContext = {
      ...SAMPLE_CTX,
      user: { ...SAMPLE_CTX.user, id: 'next-user' },
      activeOrganization: { ...SAMPLE_CTX.activeOrganization!, id: 'next-org' },
    };

    beforeEach(() => {
      forceLogout();
      fetchMeContextMock.mockReset().mockResolvedValue(SAMPLE_CTX);
      setQueryDataMock.mockClear();
      window.location.pathname = '/login';
    });

    it.each(['logout', 'new login'])(
      'invalidates default context readers on %s',
      async (change) => {
        const context = deferred<MeContext>();
        fetchMeContextMock
          .mockReturnValueOnce(context.promise)
          .mockResolvedValueOnce(NEXT_CTX);
        const pending = hydrateSessionContext();
        const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
        if (change === 'logout') handleCrossTabLogout();
        else await establishSession(NEXT_TOKEN);
        setQueryDataMock.mockClear();
        context.resolve(SAMPLE_CTX);
        await rejected;
        expect(setQueryDataMock).not.toHaveBeenCalled();
        expect(useOrganizationStore.getState().organizationId).toBe(
          change === 'logout' ? null : 'next-org',
        );
        expect(getAccessToken()).toBe(change === 'logout' ? null : NEXT_TOKEN);
      },
    );

    it('does not restore a token when refresh finishes after cross-tab logout', async () => {
      const response = deferred<Response>();
      fetchMock.mockReturnValueOnce(response.promise);
      const refresh = refreshAccessToken();
      handleCrossTabLogout();
      response.resolve(mockFetchResponse({ data: { access_token: VALID_TOKEN } }));
      await refresh;
      expect(getAccessToken()).toBeNull();
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });

    it('does not restore user, organization, or cache after cross-tab logout during context loading', async () => {
      const context = deferred<MeContext>();
      fetchMock.mockResolvedValueOnce(
        mockFetchResponse({ data: { access_token: VALID_TOKEN } }),
      );
      fetchMeContextMock.mockReturnValueOnce(context.promise);
      const refresh = silentRefresh();
      await vi.waitFor(() => expect(fetchMeContextMock).toHaveBeenCalledOnce());
      handleCrossTabLogout();
      context.resolve(SAMPLE_CTX);
      await refresh;
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
      expect(useOrganizationStore.getState().organizationId).toBeNull();
      expect(setQueryDataMock).not.toHaveBeenCalled();
      expect(getAccessToken()).toBeNull();
    });

    it('does not send refresh after logout while waiting for the cross-tab lock', async () => {
      let grant!: () => Promise<void>;
      const lock = deferred<void>();
      Object.defineProperty(navigator, 'locks', {
        configurable: true,
        value: {
          request: vi.fn((_name: string, callback: () => Promise<void>) => {
            grant = callback;
            return lock.promise;
          }),
        },
      });
      fetchMock.mockResolvedValue(
        mockFetchResponse({ data: { access_token: VALID_TOKEN } }),
      );
      try {
        const refresh = refreshAccessToken();
        handleCrossTabLogout();
        await grant();
        lock.resolve();
        await refresh;
        expect(fetchMock).not.toHaveBeenCalled();
        expect(getAccessToken()).toBeNull();
      } finally {
        delete (navigator as Navigator & { locks?: unknown }).locks;
      }
    });

    it('preserves a newer login when an old refresh returns a token', async () => {
      const response = deferred<Response>();
      fetchMock.mockReturnValueOnce(response.promise);
      const refresh = refreshAccessToken();
      await establishSession(NEXT_TOKEN);
      response.resolve(mockFetchResponse({ data: { access_token: VALID_TOKEN } }));
      await refresh;
      expect(getAccessToken()).toBe(NEXT_TOKEN);
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
    });

    it('ignores a stale refresh rejection after newer login', async () => {
      const response = deferred<Response>();
      fetchMock.mockReturnValueOnce(response.promise);
      const refresh = refreshAccessToken().then(
        () => 'settled',
        () => 'rejected',
      );
      await establishSession(NEXT_TOKEN);
      response.reject(new Error('old transport failed'));
      expect(await refresh).toBe('settled');
      expect(getAccessToken()).toBe(NEXT_TOKEN);
    });

    it('does not clear a newer login when old context hydration fails', async () => {
      const context = deferred<MeContext>();
      fetchMeContextMock
        .mockReturnValueOnce(context.promise)
        .mockResolvedValueOnce(NEXT_CTX);
      const older = establishSession(VALID_TOKEN).then(
        () => 'settled',
        () => 'rejected',
      );
      await establishSession(NEXT_TOKEN);
      context.reject(new Error('old context failed'));
      expect(await older).toBe('settled');
      expect(getAccessToken()).toBe(NEXT_TOKEN);
      expect(useAuthStore.getState().user?.id).toBe('next-user');
    });

    it('does not overwrite a newer login when old context hydration succeeds', async () => {
      const context = deferred<MeContext>();
      fetchMeContextMock
        .mockReturnValueOnce(context.promise)
        .mockResolvedValueOnce(NEXT_CTX);
      const older = establishSession(VALID_TOKEN);
      await establishSession(NEXT_TOKEN);
      setQueryDataMock.mockClear();
      context.resolve(SAMPLE_CTX);
      await older;
      expect(useAuthStore.getState().user?.id).toBe('next-user');
      expect(useOrganizationStore.getState().organizationId).toBe('next-org');
      expect(setQueryDataMock).not.toHaveBeenCalled();
      expect(getAccessToken()).toBe(NEXT_TOKEN);
    });

    it('keeps the newer refresh single-flight when stale work settles', async () => {
      const first = deferred<Response>();
      const second = deferred<Response>();
      fetchMock
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise)
        .mockResolvedValue(mockFetchResponse({ data: { access_token: NEXT_TOKEN } }));
      const older = refreshAccessToken();
      handleCrossTabLogout();
      await establishSession(NEXT_TOKEN);
      const newer = refreshAccessToken();
      first.resolve(mockFetchResponse({ data: { access_token: VALID_TOKEN } }));
      await older;
      const joined = refreshAccessToken();
      second.resolve(mockFetchResponse({ data: { access_token: NEXT_TOKEN } }));
      await Promise.all([newer, joined]);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(getAccessToken()).toBe(NEXT_TOKEN);
    });

    it('shares startup work and preserves newer login readiness after stale context rejection', async () => {
      useAuthStore.getState().setLoading(true);
      const initial = deferred<MeContext>();
      const next = deferred<MeContext>();
      fetchMock.mockResolvedValueOnce(
        mockFetchResponse({ data: { access_token: VALID_TOKEN } }),
      );
      fetchMeContextMock
        .mockReturnValueOnce(initial.promise)
        .mockReturnValueOnce(next.promise);
      const bootstrap = startAuthBootstrap();
      expect(startAuthBootstrap()).toBe(bootstrap);
      await vi.waitFor(() => expect(fetchMeContextMock).toHaveBeenCalledOnce());
      const login = establishSession(NEXT_TOKEN);
      initial.reject(new Error('superseded startup'));
      await bootstrap;
      expect(useAuthStore.getState().isLoading).toBe(true);
      expect(getAccessToken()).toBe(NEXT_TOKEN);
      next.resolve(NEXT_CTX);
      await login;
      expect(useAuthStore.getState().user?.id).toBe('next-user');
      expect(fetchMock).toHaveBeenCalledOnce();
    });
  });
});
