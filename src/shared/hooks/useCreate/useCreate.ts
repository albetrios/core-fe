import { dataProvider } from '@/core/data-provider/index.ts';
import { useAppMutation } from '@/shared/hooks/useAppMutation/index.ts';

/** Shared shape for the standard CRUD writes — everything `useAppMutation` offers. */
export interface CrudMutationOptions<TData, TVars> {
  /** Success toast — a string or a fn of (data, vars). Omit for no toast. */
  successMessage?: string | ((data: TData, vars: TVars) => string);
  /** Toast the mapped error on failure (default: true). */
  notifyOnError?: boolean;
  /** Extra success side effect (e.g. close a dialog). */
  onSuccess?: (data: TData, vars: TVars) => void | Promise<void>;
}

/**
 * Create a new record. Invalidates every query for this resource on success so
 * lists refresh immediately.
 *
 * Built on {@link useAppMutation}, which is where the behaviour every write in
 * this app is expected to have actually lives: a **synchronous single-flight
 * guard** (a double-clicked Create sends one POST, not two), an error toast, the
 * optional success toast, and cache invalidation that does **not** hold
 * `isPending` open while the refetch runs. Hand-rolling `useMutation` here gave
 * the first resource page built on these hooks none of it — and CLAUDE.md points
 * new work straight at them (X-4).
 */
export function useCreate<T, D = Partial<T>>(
  resource: string,
  options: CrudMutationOptions<T, D> = {},
) {
  return useAppMutation<T, D>({
    mutationFn: (data: D) => dataProvider.create<T, D>(resource, data),
    invalidateKeys: [['resource', resource]],
    ...options,
  });
}
