import {
  type QueryKey,
  useQuery,
  type UseQueryOptions,
  type UseQueryResult,
} from '@tanstack/react-query';

export interface AppQueryOptions<TData, TError = Error> extends Omit<
  UseQueryOptions<TData, TError, TData, QueryKey>,
  'meta'
> {
  /**
   * Toast the mapped error on failure (default: **true**). Pass `false` only
   * when this query's failure is already visible in place — a `QueryBoundary`,
   * a `RetryError`, or a boundary the query throws into — and say so in a
   * comment at the call site.
   */
  notifyOnError?: boolean;
}

/**
 * The standard read query — `useQuery` with the house error policy attached.
 *
 * **A failed fetch is loud by default.** The `QueryCache` only toasts when a
 * query sets `meta.notifyOnError`, and across every call site in `src/` exactly
 * zero of them did: a 500 on a list left the panel rendering its *empty* state,
 * so "nothing here" and "we could not load this" looked identical, and nobody
 * outside Sentry ever learned the difference (X-3). Defaulting the flag here
 * inverts that — silence is now something a caller opts into, in code, with a
 * reason next to it.
 *
 * Mirrors {@link useAppMutation}'s `notifyOnError`, so reads and writes answer
 * the same question the same way. The toast is de-duped per query hash by the
 * cache, so a shared query that several panels mount still surfaces once.
 *
 * @example
 *   // loud: nothing else on screen would say this failed
 *   const plans = useAppQuery({ queryKey: k.plans(), queryFn: api.listPlans });
 *
 *   // quiet: the panel renders <RetryError> for exactly this failure
 *   const sessions = useAppQuery({ …, notifyOnError: false });
 */
export function useAppQuery<TData, TError = Error>({
  notifyOnError = true,
  ...options
}: AppQueryOptions<TData, TError>): UseQueryResult<TData, TError> {
  return useQuery({ ...options, meta: { notifyOnError } });
}
