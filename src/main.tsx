import './index.css';
import '@/lib/i18n/i18n.ts';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { initSentry } from '@/app/observability/sentry.ts';
import { preloadBootRoutes, router } from '@/app/routes/routeTree.tsx';
import { showUpdateAvailableToast } from '@/app/version/show-update-available-toast.ts';
import { platformConfig } from '@/core/config/env.ts';
import { bootstrapResources } from '@/core/resources/index.ts';
import { startVersionCheck } from '@/core/version/check.ts';
import {
  afterPaint,
  dismissAppSplash,
  markAppContentPending,
  markAppContentSettled,
  onAppSplashDismissed,
} from '@/lib/app-splash.ts';
import { IDLE_PREFETCH_TIMEOUT_MS } from '@/lib/chunk-prefetch.ts';
import { subscribeToAuthBroadcast } from '@/shared/auth/auth-channel.ts';
import { peekTurnstileToken } from '@/shared/auth/captcha/turnstile-token-store.ts';
import {
  establishSession,
  handleCrossTabLogout,
  startAuthBootstrap,
} from '@/shared/auth/service.ts';
import { hasSessionHint } from '@/shared/auth/session-lifetime.ts';
import { initDeferredIconSets } from '@/shared/icons/icon-registry.ts';
import {
  hasAnalyticsConsent,
  useConsentStore,
} from '@/shared/store/useConsentStore/index.ts';
import { useThemeStore } from '@/shared/store/useThemeStore/index.ts';
import { resolveOrganizationFromSubdomain } from '@/shared/tenancy/tenancy-service.ts';

import App from './App.tsx';

/**
 * Start cookie-setting analytics (PostHog + web-vitals → PostHog). Idempotent
 * and gated by consent — only ever runs after the user has granted it (boot
 * for returning users, or the moment they Accept the ConsentBanner). Sentry is
 * NOT here: error monitoring runs under legitimate interest (no tracking
 * cookies, masked replay).
 */
let analyticsStarted = false;
function startAnalytics(): void {
  if (analyticsStarted || !hasAnalyticsConsent()) return;
  analyticsStarted = true;
  import('@/app/analytics/posthog.ts')
    .then((m) => m.initPostHog(router))
    .catch(() => undefined);
  import('@/app/observability/performance.ts')
    .then((m) => m.initPerformanceMonitoring())
    .catch(() => undefined);
}

/**
 * Initialize observability lazily after splash dismiss + idle. Sentry always;
 * analytics only with consent. Keeps auth funnels off the critical path.
 */
function initObservabilityWhenIdle(): void {
  useConsentStore.subscribe((state) => {
    if (state.analyticsConsent === 'granted') startAnalytics();
  });

  const run = () => {
    // sentry.ts is already entry-resident (App.tsx imports reportReactError);
    // the heavy @sentry/react SDK stays lazy behind an import() inside initSentry.
    initSentry(router).catch(() => undefined);
    startAnalytics();
  };

  const scheduleAfterSplash = () => {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(run, { timeout: IDLE_PREFETCH_TIMEOUT_MS });
    } else {
      globalThis.setTimeout(run, 2000);
    }
  };

  afterPaint(() => {
    onAppSplashDismissed(scheduleAfterSplash);
  });
}

// ── 1. Bootstrap: resolve organization → mount React immediately → silent auth in background ──
const root = createRoot(document.getElementById('root')!);

// Resolve organization from subdomain (SYNC — just parses hostname). Seeds the
// derived organization store before anything renders; the URL/guards take over
// once routing starts.
resolveOrganizationFromSubdomain();
bootstrapResources();

// Apply a shared theme seed (?theme=<seed>) before render, then strip the param so
// it never reaches the router's search validation. Reproduces any shared look.
const themeSeedParam = new URLSearchParams(window.location.search).get('theme');
if (themeSeedParam && /^\d+$/.test(themeSeedParam)) {
  useThemeStore.getState().applyThemeSeed(Number(themeSeedParam));
  const url = new URL(window.location.href);
  url.searchParams.delete('theme');
  window.history.replaceState(null, '', url.toString());
}

// Playwright E2E hooks (`navigateInApp`, `establishSession`, Turnstile readiness).
// Env-gated (VITE_E2E_HOOKS) — on locally, off in every deployed build.
if (platformConfig.e2eHooks) {
  // service.ts and turnstile-token-store.ts are already entry-resident (imported
  // statically by fetch-client / InvisibleTurnstile), so assign directly — no
  // dynamic import() needed (they emitted INEFFECTIVE_DYNAMIC_IMPORT warnings).
  Object.assign(
    globalThis as typeof globalThis & {
      __coreFeRouter?: typeof router;
      __coreFeEstablishSession?: (accessToken: string) => Promise<void>;
      __coreFePeekTurnstileToken?: () => string | undefined;
    },
    {
      __coreFeRouter: router,
      __coreFeEstablishSession: establishSession,
      __coreFePeekTurnstileToken: peekTurnstileToken,
    },
  );
}

// Mount React immediately so user sees app (spinner or login) instead of blank screen.
// Silent refresh runs in background; when it fails, clearAuth() updates store and router reacts.
root.render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Ease out the HTML boot splash once React has painted underneath (no hard cut).
afterPaint(() => dismissAppSplash());

// …and let it go the moment the router has settled on a destination, instead of
// sitting out a fixed grace window over a page that is already rendered. While a
// navigation is in flight (a redirect, the OAuth handoff) the conservative
// window still applies. Both subscriptions end with the splash.
const stopSettled = router.subscribe('onResolved', markAppContentSettled);
const stopPending = router.subscribe('onBeforeNavigate', markAppContentPending);
onAppSplashDismissed(() => {
  stopSettled();
  stopPending();
});

// Attempt silent refresh in background (no backend = fast fail → login screen).
void startAuthBootstrap();

// Warm the destination's chunks WHILE that refresh is in flight — every entry
// route awaits it before the router will load a single component.
preloadBootRoutes({ likelySignedIn: hasSessionHint() });

// Initialize observability/analytics after splash dismiss + idle (auth funnels stay lean).
initObservabilityWhenIdle();

// Alt icon libraries (Phosphor/Tabler) load after auth — Lucide covers first paint.
initDeferredIconSets();

// Start version check — notify + deferred reload when a new deployment ships (prod only)
startVersionCheck({
  onUpdateAvailable: ({ buildId, reloadNow, snooze }) =>
    showUpdateAvailableToast({ buildId, reloadNow, snooze }),
});

// Cross-tab logout: when any tab's session dies (admin-suspend, logout-all,
// expiry), every open tab clears its in-memory token and returns to login.
subscribeToAuthBroadcast(handleCrossTabLogout);
