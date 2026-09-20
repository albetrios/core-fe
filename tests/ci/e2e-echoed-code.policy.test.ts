import { describe, expect, it } from 'vitest';

import { echoedVerificationCode } from '@/tests/utils/e2e-verification-code.ts';

// Every browser spec signs in through `createSessionViaEmailCode`, and that now
// takes the code from core-be's `send-code` echo before it falls back to polling
// `auth.mail_outbox`. The echo path is what runs locally, so the FALLBACK half —
// "no echo → null → go and poll" — is the one no local E2E run can exercise. A
// helper that threw there, or returned `''`, would red the whole suite on the
// first backend that does not echo. This pins both halves.
const respond = (body: unknown) => ({ json: () => Promise.resolve(body) });

describe('E2E sign-in code: echo first, outbox as the fallback', () => {
  it('returns the code core-be echoes in its local/TEST mode', async () => {
    const response = respond({
      data: {
        message: 'sent',
        expires_in_minutes: 10,
        debug_verification_code: '4F7K2Q',
      },
      meta: {},
    });

    expect(await echoedVerificationCode(response)).toBe('4F7K2Q');
  });

  it.each([
    ['a backend that does not echo', { data: { message: 'sent' }, meta: {} }],
    ['an empty echo', { data: { debug_verification_code: '' } }],
    ['an echo of the wrong type', { data: { debug_verification_code: 123456 } }],
    ['a body with no data envelope', { message: 'sent' }],
    ['a null body', null],
  ])('returns null for %s — the caller then polls the outbox', async (_label, body) => {
    expect(await echoedVerificationCode(respond(body))).toBeNull();
  });

  it('returns null, not a rejection, when the body is not JSON', async () => {
    const response = {
      json: () => Promise.reject(new SyntaxError('Unexpected token <')),
    };

    await expect(echoedVerificationCode(response)).resolves.toBeNull();
  });
});
