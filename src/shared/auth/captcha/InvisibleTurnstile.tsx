import type { ReactElement } from 'react';
import { useEffect, useRef } from 'react';

import { platformConfig } from '@/core/config/env.ts';

import { isCaptchaEnabled, resolveCaptchaProvider } from './captcha-config.ts';
import { setTurnstileResetHandler, setTurnstileToken } from './turnstile-token-store.ts';

const TURNSTILE_SCRIPT_SRC =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

interface TurnstileRenderOptions {
  sitekey: string;
  /** `interaction-only` keeps the widget hidden unless Cloudflare requires interaction. */
  appearance?: 'always' | 'execute' | 'interaction-only';
  callback?: (token: string) => void;
  'error-callback'?: () => void;
  'expired-callback'?: () => void;
}

interface TurnstileApi {
  render: (container: HTMLElement, options: TurnstileRenderOptions) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/**
 * Resolved once at import: env/config are fixed for the app's lifetime, so the site key and
 * active-check are module constants rather than reactive component values. This keeps the
 * widget effect dependency-free and avoids the linters disagreeing over a "stable" dependency.
 */
const TURNSTILE_SITE_KEY = platformConfig.turnstileSiteKey;

/** Whether the invisible Turnstile widget should mount (captcha enabled + Turnstile provider). */
function isInvisibleTurnstileActive(): boolean {
  return (
    isCaptchaEnabled() &&
    resolveCaptchaProvider() === 'turnstile' &&
    Boolean(TURNSTILE_SITE_KEY)
  );
}

let scriptPromise: Promise<void> | null = null;

/** Loads the Cloudflare Turnstile script once (explicit-render mode); idempotent. */
function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = TURNSTILE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener('load', () => resolve());
    script.addEventListener('error', () => {
      scriptPromise = null;
      reject(new Error('Failed to load Cloudflare Turnstile script'));
    });
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/**
 * Mounts an invisible Cloudflare Turnstile widget that solves in the background and keeps a
 * fresh token in the token store for {@link authCaptchaHeaders} to attach to public auth
 * requests. Renders nothing unless captcha is enabled and resolved to the `turnstile`
 * provider (a site key is configured). With `appearance: 'interaction-only'` the widget stays
 * hidden unless Cloudflare requires an interactive challenge — so the always-pass test key
 * never shows any UI.
 */
export function InvisibleTurnstile(): ReactElement | null {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!(isInvisibleTurnstileActive() && TURNSTILE_SITE_KEY)) return;
    let cancelled = false;

    loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          appearance: 'interaction-only',
          callback: (token) => setTurnstileToken(token),
          'expired-callback': () => setTurnstileToken(undefined),
          'error-callback': () => setTurnstileToken(undefined),
        });
        setTurnstileResetHandler(() => {
          setTurnstileToken(undefined);
          if (widgetIdRef.current && window.turnstile) {
            window.turnstile.reset(widgetIdRef.current);
          }
        });
      })
      .catch(() => {
        // Network/load failure: leave the token unset. The auth request will surface the
        // captcha error from core-be rather than this widget failing silently on its own.
      });

    return () => {
      cancelled = true;
      setTurnstileResetHandler(undefined);
      setTurnstileToken(undefined);
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
      widgetIdRef.current = null;
    };
  }, []);

  if (!isInvisibleTurnstileActive()) return null;
  // `interaction-only` manages its own visibility; the container is empty (zero-size) until a
  // challenge is required. It sits centered on the viewport (out of the layout flow) so an
  // interactive challenge appears mid-screen rather than tucked in a corner.
  //
  // The z-index is load-bearing, not cosmetic. When Turnstile escalates to an INTERACTIVE
  // challenge it renders that overlay inside this container. With no stacking order the
  // container sits at `z-index: auto`, i.e. beneath the auth card (z-50) and the toast region
  // (z-70): the challenge paints behind the login form, cannot be completed, so no token is
  // ever minted and every captcha-gated button spins indefinitely. 10000 clears both the app's
  // own scale (which tops out at z-[90]) and the Sentry feedback widget (z-9999).
  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      data-testid="auth-captcha-widget"
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 10_000,
      }}
    />
  );
}
