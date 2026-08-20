/**
 * Security invariant: the OAuth authorization grant must never reach a third-party
 * telemetry store. `/callback?code=…&state=…` is a SPA URL, and telemetry booted in
 * the same window captures `$current_url` (PostHog) and the pageload URL (Sentry).
 * `code` is a single-use credential; `state` is the single-use CSRF nonce.
 *
 * `CallbackPage` also strips both from the address bar synchronously on mount. This
 * scrubber is the defence-in-depth layer for anything captured before that runs.
 */
import { describe, expect, it } from 'vitest';

import { hasSensitiveParams, scrubSensitiveUrl } from '@/lib/telemetry-scrub.ts';

describe('OAuth grant scrubbing (security)', () => {
  it('filters the authorization grant out of a callback URL', () => {
    const scrubbed = scrubSensitiveUrl(
      'https://app.example.com/callback?code=4/0AVMBsJi-authorization-code&state=e7f92bc4',
    );
    expect(scrubbed).not.toContain('4/0AVMBsJi-authorization-code');
    expect(scrubbed).not.toContain('e7f92bc4');
  });

  it('flags a callback URL as sensitive so the scrub pass runs at all', () => {
    expect(
      hasSensitiveParams(
        'https://app.example.com/callback?code=4/0AVMBsJi&state=e7f92bc4',
      ),
    ).toBe(true);
  });

  it.each([
    ['?code=', 'https://app.example.com/callback?code=secret-grant', 'secret-grant'],
    ['&code=', 'https://app.example.com/callback?x=1&code=secret-grant', 'secret-grant'],
    ['#code=', 'https://app.example.com/callback#code=secret-grant', 'secret-grant'],
    ['?state=', 'https://app.example.com/callback?state=secret-nonce', 'secret-nonce'],
    [
      '&state=',
      'https://app.example.com/callback?x=1&state=secret-nonce',
      'secret-nonce',
    ],
  ])('filters a grant at a %s boundary', (_label, url, secret) => {
    expect(scrubSensitiveUrl(url)).not.toContain(secret);
  });

  it('does not over-match a param that merely ends in `code`', () => {
    expect(scrubSensitiveUrl('https://app.example.com/x?error_code=42')).toContain(
      'error_code=42',
    );
  });

  it('does not over-match a param that merely ends in `state`', () => {
    expect(scrubSensitiveUrl('https://app.example.com/x?estate=sold')).toContain(
      'estate=sold',
    );
  });

  it('leaves a non-sensitive callback URL intact', () => {
    const url = 'https://app.example.com/callback';
    expect(scrubSensitiveUrl(url)).toBe(url);
  });
});
