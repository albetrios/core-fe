import type { Mutation, Query } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { HTTP } from '@/core/config/constants.ts';
import { HttpError } from '@/shared/errors/HttpError.ts';

import { queryClient } from './queryClient.ts';

vi.mock('@/shared/errors/errorHandler.ts', () => ({
  notifyError: vi.fn(),
  reportError: vi.fn(),
}));

import { notifyError, reportError } from '@/shared/errors/errorHandler.ts';

const unauthorized = new HttpError('nope', 401, '/api/v1/x', 'GET');
const serverError = new HttpError('boom', 500, '/api/v1/x', 'GET');

function fakeQuery(meta?: Record<string, unknown>): Query {
  return {
    queryKey: ['things', 'list'],
    queryHash: '["things","list"]',
    meta,
  } as unknown as Query;
}

function fakeMutation(meta?: Record<string, unknown>): Mutation {
  return {
    options: { mutationKey: ['things', 'create'], meta },
  } as unknown as Mutation;
}

describe('queryClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('query retry policy', () => {
    const retry = queryClient.getDefaultOptions().queries?.retry as (
      failureCount: number,
      error: unknown,
    ) => boolean;

    it('never retries a 401 — the fetch client owns auth recovery', () => {
      expect(retry(0, unauthorized)).toBe(false);
      expect(retry(1, unauthorized)).toBe(false);
    });

    it('retries other errors at most twice', () => {
      expect(retry(0, serverError)).toBe(true);
      expect(retry(1, serverError)).toBe(true);
      expect(retry(2, serverError)).toBe(false);
    });

    it('mutations are never auto-retried', () => {
      expect(queryClient.getDefaultOptions().mutations?.retry).toBe(false);
    });

    it('keeps the tuned cache defaults (staleTime on, focus refetch off)', () => {
      const defaults = queryClient.getDefaultOptions();
      expect(defaults.queries?.staleTime).toBe(HTTP.STALE_TIME);
      expect(defaults.queries?.refetchOnWindowFocus).toBe(false);
    });
  });

  describe('query cache onError', () => {
    const onError = queryClient.getQueryCache().config.onError as (
      error: unknown,
      query: Query,
    ) => void;

    it('reports non-auth errors and toasts only when meta.notifyOnError opts in', () => {
      onError(serverError, fakeQuery({ notifyOnError: true }));

      expect(reportError).toHaveBeenCalledWith(serverError, {
        queryKey: 'things,list',
      });
      expect(notifyError).toHaveBeenCalledWith(serverError, {
        id: 'q:["things","list"]',
      });
    });

    it('stays silent (no toast) for queries that do not opt in', () => {
      onError(serverError, fakeQuery());

      expect(reportError).toHaveBeenCalledTimes(1);
      expect(notifyError).not.toHaveBeenCalled();
    });

    it('ignores 401s entirely — no report, no toast', () => {
      onError(unauthorized, fakeQuery({ notifyOnError: true }));

      expect(reportError).not.toHaveBeenCalled();
      expect(notifyError).not.toHaveBeenCalled();
    });
  });

  describe('mutation cache onError', () => {
    const onError = queryClient.getMutationCache().config.onError as (
      error: unknown,
      variables: unknown,
      context: unknown,
      mutation: Mutation,
    ) => void;

    it('reports non-auth mutation errors and toasts on opt-in', () => {
      onError(serverError, undefined, undefined, fakeMutation({ notifyOnError: true }));

      expect(reportError).toHaveBeenCalledWith(serverError, {
        mutationKey: 'things,create',
      });
      expect(notifyError).toHaveBeenCalledWith(serverError);
    });

    it('does not toast without the opt-in flag', () => {
      onError(serverError, undefined, undefined, fakeMutation());

      expect(reportError).toHaveBeenCalledTimes(1);
      expect(notifyError).not.toHaveBeenCalled();
    });

    it('ignores 401 mutation errors', () => {
      onError(unauthorized, undefined, undefined, fakeMutation({ notifyOnError: true }));

      expect(reportError).not.toHaveBeenCalled();
      expect(notifyError).not.toHaveBeenCalled();
    });
  });
});
