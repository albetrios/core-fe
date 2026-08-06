import type * as SentryReact from '@sentry/react';
import type { AnyRouter } from '@tanstack/react-router';

import { platformConfig } from '@/core/config/env.ts';
import { scrubEventUrls } from '@/lib/telemetry-scrub.ts';
import { HttpError } from '@/shared/errors/HttpError.ts';
import { useAuthStore } from '@/shared/store/useAuthStore/index.ts';
import { useOrganizationStore } from '@/shared/store/useOrganizationStore/index.ts';

type SentryModule = typeof SentryReact;

function syncUserContext(Sentry: SentryModule): void {
  const user = useAuthStore.getState().user;
  if (user) {
    Sentry.setUser({ id: user.id });
  } else {
    Sentry.setUser(null);
  }
}

function syncOrganizationTags(Sentry: SentryModule): void {
  const org = useOrganizationStore.getState();
  if (org.organizationId) {
    Sentry.setTag('organization_id', org.organizationId);
    Sentry.setTag('organization_slug', org.organizationSlug ?? 'unknown');
  } else {
    Sentry.setTag('organization_id', undefined);
    Sentry.setTag('organization_slug', undefined);
  }
}

function buildIntegrations(Sentry: SentryModule, router: AnyRouter) {
  const integrations = [
    Sentry.tanstackRouterBrowserTracingIntegration(router),
    Sentry.httpClientIntegration(),
    Sentry.captureConsoleIntegration({ levels: ['error', 'warn'] }),
    Sentry.reportingObserverIntegration(),
    Sentry.extraErrorDataIntegration({ depth: 5 }),
  ];

  // Replay, profiling, logs, and feedback whenever a DSN is configured —
  // including local `pnpm dev` with `.env.local` for full-flow QA.
  integrations.push(
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
    Sentry.browserProfilingIntegration(),
    Sentry.consoleLoggingIntegration({ levels: ['warn', 'error'] }),
    Sentry.feedbackIntegration({
      colorScheme: 'system',
      showBranding: false,
      autoInject: true,
    }),
  );

  return integrations;
}

/**
 * Initialize Sentry off the critical path.
 *
 * The module is dynamically imported from `main.tsx` during idle time.
 * Active whenever `VITE_SENTRY_DSN` is set (development **and** production).
 * See `docs/integrations/sentry-frontend.md` for the full data catalog.
 *
 * @param router - TanStack Router instance for route-aware tracing.
 */
export async function initSentry(router: AnyRouter): Promise<void> {
  if (!platformConfig.sentryDsn) return;

  const Sentry = await import('@sentry/react');

  Sentry.init({
    dsn: platformConfig.sentryDsn,
    environment: platformConfig.environment,
    release: platformConfig.appVersion,
    enabled: true,
    integrations: buildIntegrations(Sentry, router),

    sendDefaultPii: false,
    attachStacktrace: true,
    maxBreadcrumbs: 100,
    normalizeDepth: 6,

    enableLogs: true,

    tracesSampleRate: platformConfig.sentryTracesSampleRate,
    profilesSampleRate: platformConfig.sentryProfilesSampleRate,
    tracePropagationTargets: ['localhost', /^https:\/\/api\./, /^\/api\//],

    replaysSessionSampleRate: platformConfig.sentryReplaysSessionSampleRate,
    replaysOnErrorSampleRate: platformConfig.sentryReplaysOnErrorSampleRate,

    ignoreErrors: [
      /Object \[object Object\] has no method 'updateFrom'/,
      // Console-captured duplicates of errors already reported through their
      // real paths (HttpError capture, retry logic) — and dev-server HMR noise.
      /^\[Query Error\]/,
      /^\[Mutation Error\]/,
      /^\[HTTP\] Retry attempt/,
      /^\[vite\]/,
    ],

    beforeSend(event, hint) {
      // Expected client outcomes (validation 400/422, auth 401/403, missing
      // 404/409/429) are handled UX states, not defects — only transport
      // failures and 5xx responses are signal.
      const cause = hint?.originalException;
      if (cause instanceof HttpError && cause.status < 500) return null;
      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.map((breadcrumb) => {
          if (breadcrumb.category === 'ui.input') {
            return { ...breadcrumb, message: '[Filtered]' };
          }
          return breadcrumb;
        });
      }
      return scrubEventUrls(event);
    },

    // Transactions skip beforeSend; pageload spans carry the full URL.
    beforeSendTransaction(event) {
      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.map((breadcrumb) => {
          if (breadcrumb.category === 'ui.input') {
            return { ...breadcrumb, message: '[Filtered]' };
          }
          return breadcrumb;
        });
      }
      return scrubEventUrls(event);
    },
  });

  if (platformConfig.appBuildId) {
    Sentry.setTag('app.build_id', platformConfig.appBuildId);
  }

  syncUserContext(Sentry);
  syncOrganizationTags(Sentry);

  useAuthStore.subscribe(() => syncUserContext(Sentry));
  useOrganizationStore.subscribe(() => syncOrganizationTags(Sentry));
}

/**
 * Report a React error boundary failure with component stack linkage.
 * Lazy-imports Sentry to keep the entry preload graph lean.
 */
export function reportReactError(
  error: unknown,
  errorInfo: { componentStack?: string | null },
): void {
  if (!platformConfig.sentryDsn) return;

  import('@sentry/react')
    .then((Sentry) => {
      const user = useAuthStore.getState().user;
      const org = useOrganizationStore.getState();

      Sentry.withScope((scope) => {
        if (user) scope.setUser({ id: user.id });
        if (org.organizationId) {
          scope.setTag('organization_id', org.organizationId);
          scope.setTag('organization_slug', org.organizationSlug ?? 'unknown');
        }
        Sentry.captureReactException(error, {
          componentStack: errorInfo.componentStack ?? '',
        });
      });
    })
    .catch(() => {
      /* error reporting must never throw */
    });
}
