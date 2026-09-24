import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
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

import { setCaptchaSlot } from './captcha-slot.ts';
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
    setCaptchaSlot(null);
    delete window.turnstile;
    vi.resetAllMocks();
  });

  it('renders nothing when captcha is disabled', () => {
    envRef.captchaDisabled = true;
    const { container } = render(<InvisibleTurnstile />);
    expect(container).toBeEmptyDOMElement();
  });

  /**
   * Without a registered slot there is no floating pin or overlay: the container stays
   * hidden and inert, deferring any escalated challenge until a surface mounts a slot.
   * (This supersedes the old #258 z-index overlay guard — with no overlay left, stacking
   * cannot bury the challenge; placement correctness is the slot tests' job.)
   */
  it('keeps the no-slot container hidden and inert', () => {
    stubTurnstileApi();
    render(<InvisibleTurnstile />);

    const container = screen.getByTestId('auth-captcha-widget');
    expect(container.style.position).toBe('');
    expect(container).toHaveStyle({ visibility: 'hidden', height: '0px' });
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

    act(() => rendered[0]?.callback?.('token-abc'));
    expect(peekTurnstileToken()).toBe('token-abc');

    act(() => rendered[0]?.['expired-callback']?.());
    expect(peekTurnstileToken()).toBeUndefined();
  });

  it('hides the container after a successful solve and shows it again for the next one', async () => {
    const { api, rendered } = stubTurnstileApi();
    const slot = document.createElement('div');
    document.body.appendChild(slot);
    setCaptchaSlot(slot);
    render(<InvisibleTurnstile />);
    await waitFor(() => expect(api.render).toHaveBeenCalledTimes(1));

    const widget = screen.getByTestId('auth-captcha-widget');
    expect(widget).toHaveStyle({ visibility: 'visible' });

    // Success mints a token; Cloudflare leaves a persistent "Success!" receipt, so the
    // container must hide itself the moment the token lands.
    act(() => rendered[0]?.callback?.('token-solved'));
    expect(widget).toHaveStyle({ visibility: 'hidden' });

    // Expiry may require a new interactive solve — the container must be visible for it.
    act(() => rendered[0]?.['expired-callback']?.());
    expect(widget).toHaveStyle({ visibility: 'visible' });

    // Same cycle via consumption: token spent → reset asks for a fresh solve.
    act(() => rendered[0]?.callback?.('token-spent'));
    expect(widget).toHaveStyle({ visibility: 'hidden' });
    act(() => {
      consumeTurnstileToken();
    });
    expect(widget).toHaveStyle({ visibility: 'visible' });

    slot.remove();
  });

  it('resets the widget for a fresh solve when the token is consumed', async () => {
    const { api, rendered } = stubTurnstileApi();
    render(<InvisibleTurnstile />);

    await waitFor(() => expect(api.render).toHaveBeenCalledTimes(1));
    act(() => rendered[0]?.callback?.('token-once'));

    let consumed: string | undefined;
    act(() => {
      consumed = consumeTurnstileToken();
    });
    expect(consumed).toBe('token-once');
    expect(api.reset).toHaveBeenCalledWith('widget-1');
    expect(peekTurnstileToken()).toBeUndefined();
  });

  it('renders inline inside a registered slot and falls back to the overlay without one', async () => {
    const { api, rendered } = stubTurnstileApi();
    const slot = document.createElement('div');
    document.body.appendChild(slot);
    setCaptchaSlot(slot);

    render(<InvisibleTurnstile />);
    const inline = screen.getByTestId('auth-captcha-widget');
    expect(slot.contains(inline)).toBe(true);
    // Inline placement is plain flow: no fixed pinning, no alignment overrides — the
    // challenge start-aligns with the form's own grain (and mirrors correctly under RTL).
    expect(inline.style.position).toBe('');
    expect(inline.style.display).toBe('');
    await waitFor(() => expect(api.render).toHaveBeenCalledTimes(1));

    // Solved inline, the slot collapses so the form keeps no dead gap.
    act(() => rendered[0]?.callback?.('token-inline'));
    expect(inline).toHaveStyle({ visibility: 'hidden', height: '0px' });

    // Slot unregisters (auth form unmounts): the widget is torn down and re-rendered
    // into the hidden, inert no-slot container — deferred until the next slot mounts.
    act(() => setCaptchaSlot(null));
    await waitFor(() => expect(api.render).toHaveBeenCalledTimes(2));
    expect(api.remove).toHaveBeenCalledWith('widget-1');
    const deferred = screen.getByTestId('auth-captcha-widget');
    expect(slot.contains(deferred)).toBe(false);
    expect(deferred.style.position).toBe('');
    expect(deferred).toHaveStyle({ visibility: 'hidden', height: '0px' });

    slot.remove();
  });

  it('removes the widget and clears the token on unmount', async () => {
    const { api, rendered } = stubTurnstileApi();
    const { unmount } = render(<InvisibleTurnstile />);

    await waitFor(() => expect(api.render).toHaveBeenCalledTimes(1));
    act(() => rendered[0]?.callback?.('token-live'));

    unmount();
    expect(api.remove).toHaveBeenCalledWith('widget-1');
    expect(peekTurnstileToken()).toBeUndefined();
  });
});
