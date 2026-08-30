import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const envRef = vi.hoisted(() => ({
  captchaDisabled: false,
  turnstileSiteKey: 'test-site-key' as string | undefined,
}));

vi.mock('@/core/config/env.ts', () => ({
  platformConfig: {
    environment: 'development',
    get captchaDisabled() {
      return envRef.captchaDisabled;
    },
    get turnstileSiteKey() {
      return envRef.turnstileSiteKey;
    },
  },
}));

import { InvisibleTurnstile } from './InvisibleTurnstile.tsx';
import {
  consumeTurnstileToken,
  peekTurnstileToken,
  setTurnstileToken,
} from './turnstile-token-store.ts';

type TurnstileApi = NonNullable<Window['turnstile']>;
type TurnstileRenderOptions = Parameters<TurnstileApi['render']>[1];

/** Installs a `window.turnstile` stub so the widget skips the script load and renders inline. */
function stubTurnstileApi() {
  const rendered: TurnstileRenderOptions[] = [];
  const api = {
    render: vi.fn((_container: HTMLElement, options: TurnstileRenderOptions) => {
      rendered.push(options);
      return 'widget-1';
    }),
    reset: vi.fn(),
    remove: vi.fn(),
  } satisfies TurnstileApi;
  window.turnstile = api;
  return { api, rendered };
}

describe('InvisibleTurnstile', () => {
  afterEach(() => {
    cleanup();
    envRef.captchaDisabled = false;
    setTurnstileToken(undefined);
    delete window.turnstile;
    vi.clearAllMocks();
  });

  it('renders nothing when captcha is disabled', () => {
    envRef.captchaDisabled = true;
    const { container } = render(<InvisibleTurnstile />);
    expect(container).toBeEmptyDOMElement();
  });

  /**
   * Regression guard. Turnstile renders an INTERACTIVE challenge into this container when
   * Cloudflare escalates. At `z-index: auto` that overlay paints beneath the auth card (z-50)
   * and the toast region (z-70), so it cannot be completed: no token is minted and every
   * captcha-gated button spins forever. The container must outrank the app's own scale, which
   * tops out at z-[90].
   */
  it('pins the challenge container above the app top layer', () => {
    stubTurnstileApi();
    render(<InvisibleTurnstile />);

    const container = screen.getByTestId('auth-captcha-widget');
    expect(container.style.position).toBe('fixed');
    expect(Number(container.style.zIndex)).toBeGreaterThan(90);
  });

  it('centers the challenge container on the viewport', () => {
    stubTurnstileApi();
    render(<InvisibleTurnstile />);

    expect(screen.getByTestId('auth-captcha-widget')).toHaveStyle({
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
    });
  });

  it('renders the Turnstile widget into the container and stores minted tokens', async () => {
    const { api, rendered } = stubTurnstileApi();
    render(<InvisibleTurnstile />);

    await waitFor(() => expect(api.render).toHaveBeenCalledTimes(1));
    expect(api.render).toHaveBeenCalledWith(
      screen.getByTestId('auth-captcha-widget'),
      expect.objectContaining({
        sitekey: 'test-site-key',
        appearance: 'interaction-only',
      }),
    );

    rendered[0]?.callback?.('token-abc');
    expect(peekTurnstileToken()).toBe('token-abc');

    rendered[0]?.['expired-callback']?.();
    expect(peekTurnstileToken()).toBeUndefined();
  });

  it('resets the widget for a fresh solve when the token is consumed', async () => {
    const { api, rendered } = stubTurnstileApi();
    render(<InvisibleTurnstile />);

    await waitFor(() => expect(api.render).toHaveBeenCalledTimes(1));
    rendered[0]?.callback?.('token-once');

    expect(consumeTurnstileToken()).toBe('token-once');
    expect(api.reset).toHaveBeenCalledWith('widget-1');
    expect(peekTurnstileToken()).toBeUndefined();
  });

  it('removes the widget and clears the token on unmount', async () => {
    const { api, rendered } = stubTurnstileApi();
    const { unmount } = render(<InvisibleTurnstile />);

    await waitFor(() => expect(api.render).toHaveBeenCalledTimes(1));
    rendered[0]?.callback?.('token-live');

    unmount();
    expect(api.remove).toHaveBeenCalledWith('widget-1');
    expect(peekTurnstileToken()).toBeUndefined();
  });
});
