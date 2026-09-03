import { dataProvider } from '@/core/data-provider/index.ts';
import { useAppMutation } from '@/shared/hooks/useAppMutation/index.ts';
import type { CrudMutationOptions } from '@/shared/hooks/useCreate/index.ts';

/** Vars for an update: which record, and the patch. */
export interface UpdateVars<D> {
  id: string;
  data: D;
}

/**
 * Update an existing record. The mutation accepts `{ id, data }`; on success it
 * invalidates every query for this resource so the cache reflects the patch.
 *
 * On {@link useAppMutation} for the same reasons as {@link useCreate}: one
 * gesture is one PATCH, failures are surfaced, and the submit button is released
 * when the write lands rather than when every dependent list has finished
 * refetching (X-4).
 */
export function useUpdate<T, D = Partial<T>>(
  resource: string,
  options: CrudMutationOptions<T, UpdateVars<D>> = {},
) {
  return useAppMutation<T, UpdateVars<D>>({
    mutationFn: ({ id, data }: UpdateVars<D>) =>
      dataProvider.update<T, D>(resource, id, data),
    invalidateKeys: [['resource', resource]],
    ...options,
  });
}
