import { describe, expect, it, vi } from 'vitest';

const { mockCaptureReactException } = vi.hoisted(() => ({
  mockCaptureReactException: vi.fn(),
}));

vi.mock('@sentry/react', () => ({
  init: vi.fn(),
  setUser: vi.fn(),
  setTag: vi.fn(),
  withScope: vi.fn(
    (cb: (scope: { setUser: typeof vi.fn; setTag: typeof vi.fn }) => void) =>
      cb({ setUser: vi.fn(), setTag: vi.fn() }),
  ),
  captureReactException: mockCaptureReactException,
  tanstackRouterBrowserTracingIntegration: vi.fn(() => ({})),
  browserProfilingIntegration: vi.fn(() => ({})),
  replayIntegration: vi.fn(() => ({})),
  httpClientIntegration: vi.fn(() => ({})),
  captureConsoleIntegration: vi.fn(() => ({})),
  reportingObserverIntegration: vi.fn(() => ({})),
  extraErrorDataIntegration: vi.fn(() => ({})),
  consoleLoggingIntegration: vi.fn(() => ({})),
  feedbackIntegration: vi.fn(() => ({})),
}));

vi.mock('@/shared/store/useAuthStore/index.ts', () => ({
  useAuthStore: {
    subscribe: vi.fn(),
    getState: vi.fn(() => ({ user: { id: 'usr_test' } })),
  },
}));

vi.mock('@/shared/store/useOrganizationStore/index.ts', () => ({
  useOrganizationStore: {
    subscribe: vi.fn(),
    getState: vi.fn(() => ({
      organizationId: 'org_test',
      organizationSlug: 'acme',
    })),
  },
}));

vi.mock('@/core/config/env.ts', () => ({
  platformConfig: {
    sentryDsn: 'https://test@sentry.io/123',
    environment: 'test',
    appVersion: '1.0.0-test',
    appBuildId: 'build_test',
    sentryTracesSampleRate: 0.1,
    sentryReplaysSessionSampleRate: 0.1,
    sentryProfilesSampleRate: 1,
    sentryReplaysOnErrorSampleRate: 1,
  },
}));

import * as Sentry from '@sentry/react';

import { initSentry } from './sentry.ts';

describe('initSentry', () => {
  it('calls Sentry.init when DSN is provided', async () => {
    const mockRouter = {} as Parameters<typeof initSentry>[0];
    await initSentry(mockRouter);
    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        dsn: 'https://test@sentry.io/123',
      }),
    );
  });

  it('beforeSend drops expected 4xx HttpErrors and keeps 5xx', async () => {
    const { HttpError } = await import('@/shared/errors/HttpError.ts');
    const mockRouter = {} as Parameters<typeof initSentry>[0];
    await initSentry(mockRouter);
    const options = vi.mocked(Sentry.init).mock.calls.at(-1)?.[0] as {
      beforeSend: (
        event: Record<string, unknown>,
        hint?: { originalException?: unknown },
      ) => unknown;
    };

    const forbidden = new HttpError('Forbidden', 403, '/api/v1/x', 'GET');
    expect(options.beforeSend({}, { originalException: forbidden })).toBeNull();

    const serverError = new HttpError('Internal', 500, '/api/v1/x', 'GET');
    expect(options.beforeSend({}, { originalException: serverError })).not.toBeNull();

    // Non-HttpError exceptions keep flowing.
    expect(
      options.beforeSend({}, { originalException: new Error('boom') }),
    ).not.toBeNull();
  });

  it('registers full observability integrations when DSN is set', async () => {
    const mockRouter = {} as Parameters<typeof initSentry>[0];
    await initSentry(mockRouter);
    expect(Sentry.httpClientIntegration).toHaveBeenCalled();
    expect(Sentry.captureConsoleIntegration).toHaveBeenCalled();
    expect(Sentry.reportingObserverIntegration).toHaveBeenCalled();
    expect(Sentry.extraErrorDataIntegration).toHaveBeenCalled();
    expect(Sentry.replayIntegration).toHaveBeenCalled();
    expect(Sentry.browserProfilingIntegration).toHaveBeenCalled();
  });

  it('subscribes to auth and organization stores', async () => {
    const { useAuthStore } = vi.mocked(
      await import('@/shared/store/useAuthStore/index.ts'),
    );
    const { useOrganizationStore } = vi.mocked(
      await import('@/shared/store/useOrganizationStore/index.ts'),
    );
    const mockRouter = {} as Parameters<typeof initSentry>[0];
    await initSentry(mockRouter);
    expect(useAuthStore.subscribe).toHaveBeenCalled();
    expect(useOrganizationStore.subscribe).toHaveBeenCalled();
  });

  it('does not call init when DSN is missing', async () => {
    vi.resetModules();
    vi.doMock('@/core/config/env.ts', () => ({
      platformConfig: {
        sentryDsn: undefined,
        environment: 'test',
        sentryTracesSampleRate: 0.1,
        sentryReplaysSessionSampleRate: 0.1,
      },
    }));
    vi.doMock('@sentry/react', () => ({
      init: vi.fn(),
      setUser: vi.fn(),
      setTag: vi.fn(),
      tanstackRouterBrowserTracingIntegration: vi.fn(() => ({})),
      browserProfilingIntegration: vi.fn(() => ({})),
      replayIntegration: vi.fn(() => ({})),
      httpClientIntegration: vi.fn(() => ({})),
      captureConsoleIntegration: vi.fn(() => ({})),
      reportingObserverIntegration: vi.fn(() => ({})),
      extraErrorDataIntegration: vi.fn(() => ({})),
      consoleLoggingIntegration: vi.fn(() => ({})),
      feedbackIntegration: vi.fn(() => ({})),
    }));
    vi.doMock('@/shared/store/useAuthStore/index.ts', () => ({
      useAuthStore: { subscribe: vi.fn(), getState: vi.fn(() => ({ user: null })) },
    }));
    vi.doMock('@/shared/store/useOrganizationStore/index.ts', () => ({
      useOrganizationStore: {
        subscribe: vi.fn(),
        getState: vi.fn(() => ({ organizationId: null, organizationSlug: null })),
      },
    }));

    const { initSentry: initSentryFresh } = await import('./sentry.ts');
    const SentryFresh = await import('@sentry/react');
    await initSentryFresh({} as Parameters<typeof initSentryFresh>[0]);
    expect(SentryFresh.init).not.toHaveBeenCalled();
  });
});
