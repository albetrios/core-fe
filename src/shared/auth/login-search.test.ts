import { describe, expect, it } from 'vitest';

import { LOGIN_ERROR_CODES, toLoginErrorCode } from './login-search.ts';

// The page-level counterpart (src/pages/login/login.search.test.ts) covers
// `validateLoginSearch`'s `redirect` handling; this covers the shared closed
// union it delegates the `error` param to — the reason provider-supplied text
// can never reach the login banner.
describe('toLoginErrorCode', () => {
  it.each(LOGIN_ERROR_CODES)('keeps the known code %s', (code) => {
    expect(toLoginErrorCode(code)).toBe(code);
  });

  it('drops an unrecognised code', () => {
    expect(toLoginErrorCode('oauth_denied')).toBeUndefined();
    expect(toLoginErrorCode('OAUTH_FAILED')).toBeUndefined();
    expect(toLoginErrorCode('oauth_failed ')).toBeUndefined();
  });

  it('drops an empty string', () => {
    expect(toLoginErrorCode('')).toBeUndefined();
  });

  it('drops provider text carrying markup or script', () => {
    expect(toLoginErrorCode('<script>alert(1)</script>')).toBeUndefined();
    expect(toLoginErrorCode('<img src=x onerror=alert(1)>')).toBeUndefined();
    expect(toLoginErrorCode('oauth_failed<script>alert(1)</script>')).toBeUndefined();
    expect(toLoginErrorCode('<b>Sign-in failed at provider</b>')).toBeUndefined();
  });

  it('drops values that are not strings at all', () => {
    expect(toLoginErrorCode(undefined)).toBeUndefined();
    expect(toLoginErrorCode(null)).toBeUndefined();
    expect(toLoginErrorCode(42)).toBeUndefined();
    expect(toLoginErrorCode(['oauth_failed'])).toBeUndefined();
    expect(toLoginErrorCode({ toString: () => 'oauth_failed' })).toBeUndefined();
  });
});
