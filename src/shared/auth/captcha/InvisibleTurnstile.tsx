import type { CSSProperties, ReactElement } from 'react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

import { platformConfig } from '@/core/config/env.ts';

import { isCaptchaEnabled, resolveCaptchaProvider } from './captcha-config.ts';
import { getCaptchaSlot, subscribeCaptchaSlot } from './captcha-slot.ts';
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
  // Whether the current token came from a completed interactive solve. Cloudflare's
  // `interaction-only` appearance auto-hides the widget BEFORE a solve, but after one it
  // leaves a persistent "Success!" receipt on screen — so we hide the container ourselves
  // the moment the token is minted and show it again whenever a fresh solve may need
  // interaction (expiry, error, reset).
  const [challengeSolved, setChallengeSolved] = useState(false);
  // Inline anchor registered by the auth form ({@link CaptchaSlot}). When present the
  // container portals into it so a challenge appears inside the form; otherwise it falls
  // back to a viewport-centered overlay for captcha-gated actions outside auth screens.
  const slot = useSyncExternalStore(subscribeCaptchaSlot, getCaptchaSlot, () => null);

  useEffect(() => {
    if (!(isInvisibleTurnstileActive() && TURNSTILE_SITE_KEY)) return;
    let cancelled = false;

    loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          appearance: 'interaction-only',
          callback: (token) => {
            setTurnstileToken(token);
            setChallengeSolved(true);
          },
          'expired-callback': () => {
            setTurnstileToken(undefined);
            setChallengeSolved(false);
          },
          'error-callback': () => {
            setTurnstileToken(undefined);
            setChallengeSolved(false);
          },
        });
        setTurnstileResetHandler(() => {
          setTurnstileToken(undefined);
          setChallengeSolved(false);
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
      setChallengeSolved(false);
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
      widgetIdRef.current = null;
    };
    // The widget cannot survive its container moving in the DOM (the challenge iframe
    // resets on reparent), so a slot change tears the widget down and renders a fresh one
    // into the new container; the replacement mints a fresh token in the background.
  }, [slot]);

  if (!isInvisibleTurnstileActive()) return null;
  // `interaction-only` manages its own visibility; the container is empty (zero-size) until a
  // challenge is required.
  //
  // Placement: the container portals into the registered slot and an interactive challenge
  // renders inline where the user is already looking — in plain flow, matching the surface's
  // own alignment (and mirroring correctly under RTL); solved, the slot collapses (height 0)
  // so the layout keeps no dead gap.
  //
  // Without a slot the container stays hidden and inert (no floating pins or overlays):
  // an escalated challenge is DEFERRED until a surface mounts a {@link CaptchaSlot}, at which
  // point the widget re-renders into it and re-issues the challenge. The invariant this rests
  // on: every surface with a captcha-gated action (the auth form, the email-verification
  // banner) and every long-lived slotless screen a user can sit on (403/404) mounts a slot —
  // a gated action on a slotless surface would leave its challenge invisible and the gate
  // stuck.
  const hiddenInert: CSSProperties = {
    visibility: 'hidden',
    height: 0,
    overflow: 'hidden',
  };
  const style: CSSProperties | undefined =
    !slot || challengeSolved ? hiddenInert : undefined;
  const container = (
    <div
      ref={containerRef}
      aria-hidden="true"
      data-testid="auth-captcha-widget"
      style={style}
    />
  );
  return slot ? createPortal(container, slot) : container;
}
