import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/core/config/env.ts', () => ({
  platformConfig: { apiBaseUrl: '' },
}));

import { authApi, MfaRequiredError } from './auth-api.ts';

describe('authApi.mfaVerify second factor', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function captureMfaBody(data: {
    code: string;
    useRecoveryCode?: boolean;
  }): Promise<Record<string, unknown>> {
    let body: Record<string, unknown> = {};
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: unknown, init: RequestInit) => {
        body = JSON.parse(init.body as string) as Record<string, unknown>;
        return new Response(JSON.stringify({ data: { access_token: 'acc' } }), {
          status: 200,
        });
      }),
    );
    await authApi.mfaVerify(data, 'mfa_sess');
    return body;
  }

  it('sends totp_code for an authenticator code', async () => {
    expect(await captureMfaBody({ code: '123456', useRecoveryCode: false })).toEqual({
      mfa_session_token: 'mfa_sess',
      totp_code: '123456',
    });
  });

  it('sends recovery_code when falling back to a recovery code', async () => {
    expect(await captureMfaBody({ code: 'abcd-efgh', useRecoveryCode: true })).toEqual({
      mfa_session_token: 'mfa_sess',
      recovery_code: 'abcd-efgh',
    });
  });
});

describe('authApi.login MFA handoff', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws MfaRequiredError carrying the session token when MFA is required', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              data: { mfa_required: true, mfa_session_token: 'mfa_sess_pw' },
            }),
            { status: 200 },
          ),
      ),
    );
    await expect(
      authApi.login({ email: 'a@b.test', password: 'whatever12' }),
    ).rejects.toBeInstanceOf(MfaRequiredError);
  });
});

describe('authApi.emailLogin MFA handoff', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws MfaRequiredError carrying the session token when MFA is required', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              data: { mfa_required: true, mfa_session_token: 'mfa_sess_123' },
            }),
            { status: 200 },
          ),
      ),
    );
    await expect(
      authApi.emailLogin({ email: 'a@b.test', code: 'AB2CD3' }),
    ).rejects.toMatchObject({
      name: 'MfaRequiredError',
      mfaSessionToken: 'mfa_sess_123',
    });
  });

  it('posts email + code to the email/login route', async () => {
    let body: Record<string, unknown> = {};
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: unknown, init: RequestInit) => {
        body = JSON.parse(init.body as string) as Record<string, unknown>;
        return new Response(JSON.stringify({ data: { access_token: 'acc' } }), {
          status: 200,
        });
      }),
    );
    await authApi.emailLogin({ email: 'a@b.test', code: 'AB2CD3' });
    expect(body).toEqual({ email: 'a@b.test', code: 'AB2CD3' });
  });
});

describe('authApi.emailVerificationCodeSend', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('surfaces debug_verification_code when core-be echoes it (TEST_MODE)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              data: {
                message: 'sent',
                expires_in_minutes: 15,
                debug_verification_code: '135790',
              },
            }),
            { status: 200 },
          ),
      ),
    );
    const result = await authApi.emailVerificationCodeSend('a@b.test');
    expect(result.debug_verification_code).toBe('135790');
  });

  it('resolves without a code on a normal (mail-delivered) response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ data: { message: 'sent', expires_in_minutes: 15 } }),
            { status: 200 },
          ),
      ),
    );
    const result = await authApi.emailVerificationCodeSend('a@b.test');
    expect(result.debug_verification_code).toBeUndefined();
  });

  it('throws on a non-2xx response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { detail: 'rate limited' } }), {
            status: 429,
          }),
      ),
    );
    await expect(authApi.emailVerificationCodeSend('a@b.test')).rejects.toThrow(
      'rate limited',
    );
  });
});

describe('authApi.oauthStart redirect URL', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns redirect_url from the core-be OAuth start envelope', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              data: {
                redirect_url: 'https://github.com/login/oauth/authorize?client_id=x',
              },
            }),
            { status: 200 },
          ),
      ),
    );
    await expect(authApi.oauthStart('github')).resolves.toBe(
      'https://github.com/login/oauth/authorize?client_id=x',
    );
  });

  it('accepts legacy url field when redirect_url is absent', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              data: { url: 'https://accounts.google.com/o/oauth2/v2/auth' },
            }),
            { status: 200 },
          ),
      ),
    );
    await expect(authApi.oauthStart('google')).resolves.toBe(
      'https://accounts.google.com/o/oauth2/v2/auth',
    );
  });
});

describe('authApi.oauthCallback code exchange', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetch(body: unknown, status = 200) {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('sends code and state to the provider callback endpoint with credentials', async () => {
    const fetchMock = stubFetch({ data: { access_token: 'token-value' } });

    await expect(
      authApi.oauthCallback('google', 'auth-code', 'state-token'),
    ).resolves.toEqual(expect.objectContaining({ accessToken: 'token-value' }));

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/auth/oauth/google/callback');
    expect(url).toContain('code=auth-code');
    expect(url).toContain('state=state-token');
    // The httpOnly nonce cookie the API set during oauthStart must ride along.
    expect(init.credentials).toBe('include');
  });

  it('percent-encodes the provider segment', async () => {
    const fetchMock = stubFetch({ data: { access_token: 'token-value' } });
    await authApi.oauthCallback('goo/gle', 'c', 's');
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/auth/oauth/goo%2Fgle/callback');
  });

  it('throws MfaRequiredError carrying the session token when a second factor is due', async () => {
    stubFetch({ data: { mfa_required: true, mfa_session_token: 'mfa-token' } });
    await expect(authApi.oauthCallback('google', 'c', 's')).rejects.toMatchObject({
      name: 'MfaRequiredError',
      mfaSessionToken: 'mfa-token',
    });
  });

  it('surfaces a failed exchange as an error rather than a silent success', async () => {
    stubFetch({ error: { message: 'invalid_grant' } }, 401);
    await expect(authApi.oauthCallback('google', 'bad', 's')).rejects.toThrow();
  });
});

describe('authApi.updateProfile wire mapping', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function captureProfileBody(input: {
    firstName?: string;
    lastName?: string;
    name?: string;
    jobTitle?: string;
  }): Promise<Record<string, unknown>> {
    let body: Record<string, unknown> = {};
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: unknown, init: RequestInit) => {
        body = JSON.parse(init.body as string) as Record<string, unknown>;
        return new Response(null, { status: 200 });
      }),
    );
    await authApi.updateProfile(input, 'token');
    return body;
  }

  it('maps explicit firstName/lastName 1:1 to first_name/last_name', async () => {
    expect(await captureProfileBody({ firstName: 'Ada', lastName: 'Lovelace' })).toEqual({
      first_name: 'Ada',
      last_name: 'Lovelace',
    });
  });

  it('sends last_name null when an explicit lastName is blank', async () => {
    expect(await captureProfileBody({ firstName: 'Ada', lastName: '' })).toEqual({
      first_name: 'Ada',
      last_name: null,
    });
  });

  it('prefers explicit firstName/lastName over a legacy name string', async () => {
    expect(
      await captureProfileBody({
        firstName: 'Ada',
        lastName: 'Lovelace',
        name: 'Ignored',
      }),
    ).toEqual({ first_name: 'Ada', last_name: 'Lovelace' });
  });

  it('splits a legacy full name into first_name/last_name and maps jobTitle → job_title', async () => {
    expect(await captureProfileBody({ name: 'NIK PATEL', jobTitle: 'CEO' })).toEqual({
      first_name: 'NIK',
      last_name: 'PATEL',
      job_title: 'CEO',
    });
  });

  it('keeps a multi-word surname intact after the first space', async () => {
    expect(await captureProfileBody({ name: 'Nik Vijay Patel' })).toEqual({
      first_name: 'Nik',
      last_name: 'Vijay Patel',
    });
  });

  it('sends last_name null for a single-token name', async () => {
    expect(await captureProfileBody({ name: 'Nik' })).toEqual({
      first_name: 'Nik',
      last_name: null,
    });
  });

  it('omits name fields when only jobTitle is provided', async () => {
    expect(await captureProfileBody({ jobTitle: 'CEO' })).toEqual({ job_title: 'CEO' });
  });
});

describe('authApi.completeOnboarding', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs to the onboarding-complete route with the bearer token', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await authApi.completeOnboarding('tok_123');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/users/me/onboarding/complete');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok_123');
  });

  it('throws when the backend rejects the completion', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response(JSON.stringify({ message: 'nope' }), { status: 500 }),
      ),
    );

    await expect(authApi.completeOnboarding('tok_123')).rejects.toThrow();
  });
});

describe('authApi.deleteAccount', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('DELETEs /users/me with the bearer token', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await authApi.deleteAccount('tok_123');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/users/me');
    expect(init.method).toBe('DELETE');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok_123');
  });

  it('throws when the backend rejects the deletion', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { detail: 'boom' } }), { status: 500 }),
      ),
    );

    await expect(authApi.deleteAccount('tok_123')).rejects.toThrow('boom');
  });
});
