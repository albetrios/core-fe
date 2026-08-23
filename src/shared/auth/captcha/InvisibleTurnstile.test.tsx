import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const envRef = vi.hoisted(() => ({
  captchaDisabled: false,
  turnstileSiteKey: '0xTESTSITEKEY' as string | undefined,
}));

vi.mock('@/core/config/env.ts', () => ({
  platformConfig: {
    get captchaDisabled() {
      return envRef.captchaDisabled;
    },
    get turnstileSiteKey() {
      return envRef.turnstileSiteKey;
    },
  },
}));

vi.mock('./captcha-config.ts', () => ({
  isCaptchaEnabled: () => true,
  resolveCaptchaProvider: () => 'turnstile',
}));

afterEach(() => {
  cleanup();
});

describe('InvisibleTurnstile container stacking', () => {
  /**
   * Regression guard. Turnstile renders an INTERACTIVE challenge into this container when
   * Cloudflare escalates. At `z-index: auto` that overlay paints beneath the auth card (z-50)
   * and the toast region (z-70), so it cannot be completed: no token is minted and every
   * captcha-gated button spins forever. The container must outrank the app's own scale, which
   * tops out at z-[90].
   */
  it('pins the challenge container above the app top layer', async () => {
    const { InvisibleTurnstile } = await import('./InvisibleTurnstile.tsx');
    const { getByTestId } = render(<InvisibleTurnstile />);

    const container = getByTestId('auth-captcha-widget');

    expect(container.style.position).toBe('fixed');
    expect(Number(container.style.zIndex)).toBeGreaterThan(90);
  });
});
