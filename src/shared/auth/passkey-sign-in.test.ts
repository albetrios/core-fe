import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { isPasskeySignInAvailable, signInWithPasskey } from './passkey-sign-in.ts';

describe('signInWithPasskey', () => {
  const getMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('PublicKeyCredential', class PublicKeyCredential {});
    vi.stubGlobal('navigator', {
      credentials: { get: getMock },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports passkey sign-in as unavailable until the backend is wired', () => {
    expect(isPasskeySignInAvailable()).toBe(false);
  });

  // Regression (LOGIN-7): the ceremony used to run FIRST and the "not wired"
  // error was thrown after it, so the user completed a fingerprint / Face ID
  // challenge and was then told the passkey was cancelled — the product's own
  // gap reported as the user's action. Never prompt for a flow that cannot
  // finish; this asserts the prompt is not reached at all.
  it('does not prompt the user when the flow cannot complete', async () => {
    getMock.mockResolvedValue({ id: 'pk_mock' });

    // 501 is what distinguishes "we have not wired this yet" from "your browser
    // cannot do it" (400) — they share a code, and the message is now that code.
    await expect(signInWithPasskey()).rejects.toMatchObject({
      code: 'AUTH_PASSKEY_UNAVAILABLE',
      statusCode: 501,
    });
    expect(getMock).not.toHaveBeenCalled();
  });

  it('reports an unsupported browser without prompting', async () => {
    vi.stubGlobal('PublicKeyCredential', undefined);

    await expect(signInWithPasskey()).rejects.toMatchObject({
      code: 'AUTH_PASSKEY_UNAVAILABLE',
      statusCode: 400,
    });
    expect(getMock).not.toHaveBeenCalled();
  });
});
