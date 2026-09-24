import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HTTP } from '@/core/config/constants.ts';
import { clearAccessToken, setAccessToken } from '@/shared/auth/token.ts';
import { HttpError, isUnauthorized } from '@/shared/errors/HttpError.ts';

// Full stub — no importOriginal. service.ts sits in an import cycle with this
// module (service → queryClient → fetch-client → service), and importOriginal
// would evaluate that cycle while the mock factory is still running, handing
// fetch-client the REAL forceLogout instead of the stub. With a plain factory
// the mock exists before fetch-client evaluates. The single-flight network
// behaviour of refreshAccessToken is service's contract, proven in
// shared/auth/service.test.ts — here we only assert fetch-client DELEGATES.
vi.mock('@/shared/auth/service.ts', () => ({
  forceLogout: vi.fn(),
  refreshAccessToken: vi.fn(),
}));
import { forceLogout, refreshAccessToken } from '@/shared/auth/service.ts';

import { apiClient } from './fetch-client.ts';

/** Helper to create a base64url-encoded JWT */
function makeJwt(payload: Record<string, unknown>): string {
  const encode = (obj: Record<string, unknown>) =>
    btoa(JSON.stringify(obj))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/={1,2}$/, '');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.dGVzdHNpZw`;
}

const VALID_TOKEN = makeJwt({ sub: 'user1', exp: 9999999999 });

/** Shared response fixtures (module-scoped so blocks don't duplicate them). */
const ok = () =>
  new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
const unauthorized = () =>
  new Response(JSON.stringify({ message: 'expired' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });

describe('fetch-client', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetAllMocks();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearAccessToken();
  });

  describe('apiClient.get', () => {
    it('returns parsed JSON data on 200', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ foo: 'bar' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const { data } = await apiClient.get<{ foo: string }>('/test');
      expect(data).toEqual({ foo: 'bar' });
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/test'),
        expect.objectContaining({
          method: 'GET',
          credentials: 'include',
        }),
      );
    });

    it('throws HttpError on non-2xx', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'Not found' }), {
          status: 404,
          statusText: 'Not Found',
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      let err: unknown;
      try {
        await apiClient.get('/test');
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(HttpError);
      expect((err as HttpError).status).toBe(404);
      expect((err as HttpError).data).toEqual({ message: 'Not found' });
    });
  });

  describe('core-be { data, meta } envelope', () => {
    it('unwraps the envelope to the payload and surfaces meta.request_id', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: { foo: 'bar' }, meta: { request_id: 'req_1' } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      // res.data is the PAYLOAD, never the whole envelope (no double-unwrap).
      const res = await apiClient.get<{ foo: string }>('/test');
      expect(res.data).toEqual({ foo: 'bar' });
      expect(res.meta?.request_id).toBe('req_1');
    });

    it('surfaces meta.pagination on list responses', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [{ id: 1 }, { id: 2 }],
            meta: {
              request_id: 'req_2',
              pagination: {
                per_page: 2,
                next: 'cur_2',
                has_more: true,
                estimated_total: 9,
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      const res = await apiClient.get<Array<{ id: number }>>('/things');
      expect(res.data).toEqual([{ id: 1 }, { id: 2 }]);
      expect(res.meta?.pagination).toEqual({
        per_page: 2,
        next: 'cur_2',
        has_more: true,
        estimated_total: 9,
      });
    });

    it('passes a non-enveloped body through unchanged (defensive)', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ foo: 'bar' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const res = await apiClient.get<{ foo: string }>('/test');
      expect(res.data).toEqual({ foo: 'bar' });
      expect(res.meta).toBeUndefined();
    });
  });

  describe('request headers', () => {
    it('adds Authorization when token is set', async () => {
      setAccessToken(VALID_TOKEN);
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      await apiClient.get('/test');

      const call = fetchMock.mock.calls[0];
      const init = call[1] as RequestInit;
      const headers = init.headers as Headers;
      expect(headers.get('Authorization')).toBe(`Bearer ${VALID_TOKEN}`);
    });

    it('NEVER attaches the bearer token to a foreign-origin absolute URL', async () => {
      // Token exfiltration guard: if any code path resolves an absolute URL to a
      // host that is not the API origin, the access token must not ride along.
      setAccessToken(VALID_TOKEN);
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      await apiClient.get('https://evil.example.com/steal');

      const call = fetchMock.mock.calls[0];
      const requestedUrl = call[0] as string;
      const headers = (call[1] as RequestInit).headers as Headers;
      // The absolute URL is used verbatim, but it carries NO Authorization.
      expect(requestedUrl).toBe('https://evil.example.com/steal');
      expect(headers.get('Authorization')).toBeNull();
    });

    it('adds X-Request-ID', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      await apiClient.get('/test');

      const call = fetchMock.mock.calls[0];
      const init = call[1] as RequestInit;
      const headers = init.headers as Headers;
      expect(headers.get('X-Request-ID')).toBeDefined();
      expect(typeof headers.get('X-Request-ID')).toBe('string');
    });

    it('adds Content-Type and X-Requested-With', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      await apiClient.get('/test');

      const call = fetchMock.mock.calls[0];
      const init = call[1] as RequestInit;
      const headers = init.headers as Headers;
      expect(headers.get('Content-Type')).toBe('application/json');
      expect(headers.get('X-Requested-With')).toBe('XMLHttpRequest');
    });
  });

  describe('reactive auth layer', () => {
    it('401 → delegate to the shared refresh → replay succeeds', async () => {
      fetchMock
        .mockResolvedValueOnce(unauthorized()) // original request
        .mockResolvedValueOnce(ok()); // replay (refresh is the service's stub)

      const { data } = await apiClient.get<{ ok: boolean }>('/protected');
      expect(data).toEqual({ ok: true });
      expect(refreshAccessToken).toHaveBeenCalledTimes(1);
      // fetch-client must NEVER call /auth/refresh itself — only via service.
      const urls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(urls.filter((u) => u.includes('/auth/refresh'))).toHaveLength(0);
      expect(forceLogout).not.toHaveBeenCalled();
    });

    it('replay that 401s AGAIN means a dead session: forceLogout, no refresh loop', async () => {
      fetchMock
        .mockResolvedValueOnce(unauthorized()) // original request
        .mockResolvedValueOnce(unauthorized()); // replay STILL 401

      await expect(apiClient.get('/protected')).rejects.toBeInstanceOf(HttpError);
      // never refreshes twice for one request
      expect(refreshAccessToken).toHaveBeenCalledTimes(1);
      expect(forceLogout).toHaveBeenCalledTimes(1);
    });

    it('every concurrent 401 awaits the shared single-flight (no direct refresh fetch)', async () => {
      const seen = new Set<string>();
      // First hit per endpoint 401s, the replay succeeds.
      fetchMock.mockImplementation((url: string) => {
        if (seen.has(String(url))) return Promise.resolve(ok());
        seen.add(String(url));
        return Promise.resolve(unauthorized());
      });

      await Promise.all([apiClient.get('/a'), apiClient.get('/b'), apiClient.get('/c')]);

      // One delegation per 401; collapsing them into ONE network call is
      // refreshAccessToken's own single-flight, proven in service.test.ts.
      expect(refreshAccessToken).toHaveBeenCalledTimes(3);
      const urls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(urls.filter((u) => u.includes('/auth/refresh'))).toHaveLength(0);
      expect(forceLogout).not.toHaveBeenCalled();
    });

    it('refresh failure clears the session via forceLogout', async () => {
      vi.mocked(refreshAccessToken).mockRejectedValueOnce(new Error('session revoked'));
      fetchMock.mockResolvedValueOnce(unauthorized()); // original request

      // The refresh error surfaces to the caller after the local logout.
      await expect(apiClient.get('/protected')).rejects.toThrow('session revoked');
      expect(forceLogout).toHaveBeenCalledTimes(1);
    });
  });

  describe('X-Idempotency-Key', () => {
    const ok = () =>
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

    it('writes carry an auto-generated key; reads do not', async () => {
      // Fresh Response per call — a Response body can only be consumed once.
      fetchMock.mockImplementation(() => Promise.resolve(ok()));

      await apiClient.post('/things', { a: 1 });
      await apiClient.get('/things');

      const postHeaders = (fetchMock.mock.calls[0][1] as RequestInit).headers as Headers;
      const getHeaders = (fetchMock.mock.calls[1][1] as RequestInit).headers as Headers;
      expect(postHeaders.get('X-Idempotency-Key')).toMatch(/[0-9a-f-]{36}/);
      expect(getHeaders.get('X-Idempotency-Key')).toBeNull();
    });

    it('the SAME key survives the 401 refresh replay (server can de-dupe)', async () => {
      fetchMock
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ message: 'expired' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
        .mockResolvedValueOnce(ok()); // replay (refresh is the service's stub)

      await apiClient.post('/things', { a: 1 });

      const first = (fetchMock.mock.calls[0][1] as RequestInit).headers as Headers;
      const replay = (fetchMock.mock.calls[1][1] as RequestInit).headers as Headers;
      expect(first.get('X-Idempotency-Key')).toBe(replay.get('X-Idempotency-Key'));
      expect(first.get('X-Idempotency-Key')).toMatch(/[0-9a-f-]{36}/);
    });
  });

  describe('write methods (PUT / DELETE)', () => {
    it('DELETE and PUT both carry an auto-generated X-Idempotency-Key', async () => {
      fetchMock.mockImplementation(() => Promise.resolve(ok()));

      await apiClient.delete('/things/1');
      await apiClient.put('/things/1', { a: 1 });

      const deleteHeaders = (fetchMock.mock.calls[0][1] as RequestInit)
        .headers as Headers;
      const putHeaders = (fetchMock.mock.calls[1][1] as RequestInit).headers as Headers;
      expect(deleteHeaders.get('X-Idempotency-Key')).toMatch(/[0-9a-f-]{36}/);
      expect(putHeaders.get('X-Idempotency-Key')).toMatch(/[0-9a-f-]{36}/);
    });

    it('DELETE 401 → shared refresh → replay succeeds', async () => {
      fetchMock.mockResolvedValueOnce(unauthorized()).mockResolvedValueOnce(ok());

      const { data } = await apiClient.delete<{ ok: boolean }>('/things/1');

      expect(data).toEqual({ ok: true });
      expect(refreshAccessToken).toHaveBeenCalledTimes(1);
      expect(forceLogout).not.toHaveBeenCalled();
    });

    it('PUT keeps the SAME X-Idempotency-Key across the 401 replay', async () => {
      fetchMock.mockResolvedValueOnce(unauthorized()).mockResolvedValueOnce(ok());

      await apiClient.put('/things/1', { a: 1 });

      const first = (fetchMock.mock.calls[0][1] as RequestInit).headers as Headers;
      const replay = (fetchMock.mock.calls[1][1] as RequestInit).headers as Headers;
      expect(first.get('X-Idempotency-Key')).toBe(replay.get('X-Idempotency-Key'));
      expect(first.get('X-Idempotency-Key')).toMatch(/[0-9a-f-]{36}/);
    });
  });

  describe('organization scoping', () => {
    it('never sends an X-Organization-ID header (org context lives in the URL path)', async () => {
      const { useOrganizationStore } =
        await import('@/shared/store/useOrganizationStore/index.ts');
      useOrganizationStore.getState().setOrganization('org_test1', 'test');
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      await apiClient.get('/api/v1/tenancy/organizations/org_test1');

      const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Headers;
      expect(headers.get('X-Organization-ID')).toBeNull();
      useOrganizationStore.getState().clearOrganization();
    });
  });

  describe('retry budget & rate limiting (audit 3.1–3.3)', () => {
    const errJson = (status: number, headers: Record<string, string> = {}) =>
      new Response(JSON.stringify({ message: 'x' }), {
        status,
        headers: { 'Content-Type': 'application/json', ...headers },
      });

    it('429 with Retry-After retries once, then succeeds (3.1)', async () => {
      fetchMock
        .mockResolvedValueOnce(errJson(429, { 'Retry-After': '0' }))
        .mockResolvedValueOnce(ok());
      const { data } = await apiClient.get<{ ok: boolean }>('/x');
      expect(data).toEqual({ ok: true });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('429 without Retry-After surfaces immediately — no auto-retry (3.1)', async () => {
      fetchMock.mockResolvedValueOnce(errJson(429));
      await expect(apiClient.get('/x')).rejects.toBeInstanceOf(HttpError);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('429 with a Retry-After beyond the cap is not auto-retried (3.1)', async () => {
      fetchMock.mockResolvedValueOnce(errJson(429, { 'Retry-After': '60' }));
      await expect(apiClient.get('/x')).rejects.toBeInstanceOf(HttpError);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('a 503 with Retry-After waits at least that long before retrying', async () => {
      vi.useFakeTimers();
      try {
        fetchMock
          .mockResolvedValueOnce(errJson(503, { 'Retry-After': '5' }))
          .mockResolvedValueOnce(ok());
        const request = apiClient.get<{ ok: boolean }>('/x');
        // The exponential backoff alone would retry after 1 s.
        await vi.advanceTimersByTimeAsync(4_999);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        const { data } = await request;
        expect(data).toEqual({ ok: true });
      } finally {
        vi.useRealTimers();
      }
    });

    it('a 5xx without Retry-After keeps the exponential backoff', async () => {
      vi.useFakeTimers();
      try {
        fetchMock.mockResolvedValueOnce(errJson(503)).mockResolvedValueOnce(ok());
        const request = apiClient.get<{ ok: boolean }>('/x');
        await vi.advanceTimersByTimeAsync(999);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        const { data } = await request;
        expect(data).toEqual({ ok: true });
      } finally {
        vi.useRealTimers();
      }
    });

    it('a 503 with a Retry-After beyond the cap is not auto-retried', async () => {
      fetchMock.mockResolvedValueOnce(errJson(503, { 'Retry-After': '60' }));
      await expect(apiClient.get('/x')).rejects.toBeInstanceOf(HttpError);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('a dropped connection on a GET is retried after the backoff, then succeeds', async () => {
      vi.useFakeTimers();
      try {
        fetchMock
          .mockRejectedValueOnce(new TypeError('network'))
          .mockResolvedValueOnce(ok());
        const request = apiClient.get<{ ok: boolean }>('/x');
        await vi.advanceTimersByTimeAsync(999);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        const { data } = await request;
        expect(data).toEqual({ ok: true });
      } finally {
        vi.useRealTimers();
      }
    });

    it('a dropped connection on a POST is not retried, and surfaces as status 0', async () => {
      fetchMock.mockRejectedValueOnce(new TypeError('network'));
      const failure = await apiClient.post('/x', {}).catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(HttpError);
      expect((failure as HttpError).status).toBe(0);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('a timeout (AbortError) is not retried (3.3)', async () => {
      const abort = Object.assign(new Error('timeout'), { name: 'AbortError' });
      fetchMock.mockRejectedValueOnce(abort);
      await expect(apiClient.get('/slow')).rejects.toBeInstanceOf(HttpError);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('caps total attempts across mixed connection + 5xx failures (3.2)', async () => {
      vi.useFakeTimers();
      try {
        fetchMock
          .mockRejectedValueOnce(new TypeError('network'))
          .mockResolvedValueOnce(errJson(503))
          .mockRejectedValueOnce(new TypeError('network'))
          .mockImplementation(() => Promise.resolve(errJson(503)));
        const assertion = expect(apiClient.get('/x')).rejects.toBeInstanceOf(HttpError);
        await vi.runAllTimersAsync();
        await assertion;
        // Single budget: connection + status retries never exceed MAX_RETRIES + 1.
        expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(HTTP.MAX_RETRIES + 1);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('isUnauthorized', () => {
    it('returns true for HttpError with status 401', () => {
      const error = new HttpError('Unauthorized', 401, '/test', 'GET');
      expect(isUnauthorized(error)).toBe(true);
    });

    it('returns false for HttpError with status 403', () => {
      const error = new HttpError('Forbidden', 403, '/test', 'GET');
      expect(isUnauthorized(error)).toBe(false);
    });

    it('returns false for non-HttpError', () => {
      expect(isUnauthorized(new Error('random'))).toBe(false);
      expect(isUnauthorized('string')).toBe(false);
      expect(isUnauthorized(null)).toBe(false);
    });
  });
});
