import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';

import { HTTP } from '@/core/config/constants.ts';
import { platformConfig } from '@/core/config/env.ts';
import { isUnauthorized } from '@/core/http/fetch-client.ts';
import {
  notifyError,
  notifyQueryError,
  reportError,
} from '@/shared/errors/errorHandler.ts';

/**
 * TanStack Query client.
 *
 * IMPORTANT: 401 refresh logic lives ONLY in the fetch client (fetch-client.ts).
 * The QueryCache/MutationCache onError callbacks handle non-auth errors
 * (logging, toasts, Sentry reporting) to avoid a race condition with the client.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: HTTP.STALE_TIME,
      retry: (failureCount, error) => {
        // Don't retry 401s — handled by fetch client
        if (isUnauthorized(error)) return false;
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
    },
  },
  queryCache: new QueryCache({
    onError: (error, query) => {
      // Only handle non-auth errors here — fetch client owns 401s
      if (!isUnauthorized(error)) {
        if (platformConfig.debugLogging) {
          console.error(`[Query Error] ${query.queryKey.toString()}:`, error.message);
        }
        reportError(error, { queryKey: query.queryKey.toString() });
        // Queries that set meta.notifyOnError surface ONE toast (de-duped by
        // query hash) carrying a Retry that refetches this exact query. This is
        // the failure surface for anything that must not move the layout it
        // lives in — app chrome above all: the header keeps its switcher, the
        // banner keeps its shape, and the news arrives beside them (X-1).
        if (query.meta?.notifyOnError === true) {
          notifyQueryError(error, {
            id: `q:${query.queryHash}`,
            onRetry: () => {
              void queryClient.refetchQueries({ queryKey: query.queryKey });
            },
          });
        }
      }
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (!isUnauthorized(error)) {
        const key = mutation.options.mutationKey?.toString() ?? 'unknown';
        if (platformConfig.debugLogging) {
          console.error(`[Mutation Error] ${key}:`, error.message);
        }
        reportError(error, { mutationKey: key });
        // Opt-in: mutations that set meta.notifyOnError surface a toast (hooks
        // that already toast inline simply omit the flag — no double toast).
        if (mutation.options.meta?.notifyOnError === true) {
          notifyError(error);
        }
      }
    },
  }),
});
