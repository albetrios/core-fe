import * as Sentry from '@sentry/react';
import type { AnyRouter } from '@tanstack/react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { platformConfig } from '@/core/config/env.ts';
import type { AuthUser } from '@/shared/auth/types.ts';
import { HttpError } from '@/shared/errors/HttpError.ts';
import { useAuthStore } from '@/shared/store/useAuthStore/index.ts';
import { useOrganizationStore } from '@/shared/store/useOrganizationStore/index.ts';

import { initSentry } from './sentry.ts';

vi.mock('@sentry/react', () => ({
  init: vi.fn(),
  setUser: vi.fn(),
  setTag: vi.fn(),
  tanstackRouterBrowserTracingIntegration: vi.fn(() => ({ name: 'router' })),
  httpClientIntegration: vi.fn(() => ({ name: 'http' })),
  captureConsoleIntegration: vi.fn(() => ({ name: 'console' })),
  reportingObserverIntegration: vi.fn(() => ({ name: 'reporting' })),
  extraErrorDataIntegration: vi.fn(() => ({ name: 'extra' })),
  replayIntegration: vi.fn(() => ({ name: 'replay' })),
  browserProfilingIntegration: vi.fn(() => ({ name: 'profiling' })),
  consoleLoggingIntegration: vi.fn(() => ({ name: 'logs' })),
  feedbackIntegration: vi.fn(() => ({ name: 'feedback' })),
}));

type MutableConfig = { sentryDsn: string | undefined };
const config = platformConfig as unknown as MutableConfig;
const ROUTER = {} as AnyRouter;

function initConfig() {
  return vi.mocked(Sentry.init).mock.calls[0]?.[0] as Parameters<
    typeof Sentry.init
  >[0] & {
    beforeSend: (event: unknown, hint?: unknown) => unknown;
    beforeSendTransaction: (event: unknown) => unknown;
  };
}

describe('initSentry', () => {
  const originalDsn = config.sentryDsn;

  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user: null });
    useOrganizationStore.getState().clearOrganization();
  });

  afterEach(() => {
    config.sentryDsn = originalDsn;
  });

  it('is a no-op without a DSN', async () => {
    config.sentryDsn = undefined;
    await initSentry(ROUTER);
    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it('initializes with the full integration set when a DSN is configured', async () => {
    config.sentryDsn = 'https://key@sentry.example/1';
    await initSentry(ROUTER);

    expect(Sentry.init).toHaveBeenCalledTimes(1);
    const cfg = initConfig();
    expect(cfg.dsn).toBe('https://key@sentry.example/1');
    expect(cfg.sendDefaultPii).toBe(false);
    expect(Sentry.replayIntegration).toHaveBeenCalledWith({
      maskAllText: true,
      blockAllMedia: true,
    });
    // Signed-out boot: user context cleared, org tags cleared.
    expect(Sentry.setUser).toHaveBeenCalledWith(null);
    expect(Sentry.setTag).toHaveBeenCalledWith('organization_id', undefined);
  });

  it('beforeSend drops expected 4xx outcomes and keeps 5xx + filters input breadcrumbs', async () => {
    config.sentryDsn = 'https://key@sentry.example/1';
    await initSentry(ROUTER);
    const { beforeSend } = initConfig();

    const fourOhFour = {
      originalException: new HttpError('missing', 404, '/api/v1/x', 'GET'),
    };
    expect(beforeSend({ breadcrumbs: [] }, fourOhFour)).toBeNull();

    const fiveHundred = {
      originalException: new HttpError('boom', 500, '/api/v1/x', 'GET'),
    };
    const sent = beforeSend(
      {
        breadcrumbs: [
          { category: 'ui.input', message: 'secret text' },
          { category: 'navigation', message: '/dashboard' },
        ],
      },
      fiveHundred,
    ) as { breadcrumbs: Array<{ category: string; message: string }> };

    expect(sent).not.toBeNull();
    expect(sent.breadcrumbs[0]?.message).toBe('[Filtered]');
    expect(sent.breadcrumbs[1]?.message).toBe('/dashboard');
  });

  it('beforeSendTransaction filters typed input from breadcrumbs too', async () => {
    config.sentryDsn = 'https://key@sentry.example/1';
    await initSentry(ROUTER);
    const { beforeSendTransaction } = initConfig();

    const sent = beforeSendTransaction({
      breadcrumbs: [{ category: 'ui.input', message: 'typed password' }],
    }) as { breadcrumbs: Array<{ message: string }> };

    expect(sent.breadcrumbs[0]?.message).toBe('[Filtered]');
  });

  it('keeps user and organization tags in sync with the stores', async () => {
    config.sentryDsn = 'https://key@sentry.example/1';
    await initSentry(ROUTER);
    vi.mocked(Sentry.setUser).mockClear();
    vi.mocked(Sentry.setTag).mockClear();

    useAuthStore.setState({ user: { id: 'usr_9' } as AuthUser });
    expect(Sentry.setUser).toHaveBeenCalledWith({ id: 'usr_9' });

    useOrganizationStore.setState({
      organizationId: 'org_1',
      organizationSlug: 'acme',
    });
    expect(Sentry.setTag).toHaveBeenCalledWith('organization_id', 'org_1');
    expect(Sentry.setTag).toHaveBeenCalledWith('organization_slug', 'acme');
  });
});
