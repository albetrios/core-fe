import { dataProvider } from '@/core/data-provider/index.ts';
import { useAppMutation } from '@/shared/hooks/useAppMutation/index.ts';
import type { CrudMutationOptions } from '@/shared/hooks/useCreate/index.ts';

/**
 * Delete a record by id. Invalidates the resource's queries on success.
 *
 * On {@link useAppMutation} for the same reasons as {@link useCreate} — and the
 * single-flight guard matters most here: a double-clicked Delete used to send
 * two DELETEs, the second one against a row that no longer exists (X-4).
 */
export function useDelete(
  resource: string,
  options: CrudMutationOptions<void, string> = {},
) {
  return useAppMutation<void, string>({
    mutationFn: (id: string) => dataProvider.delete(resource, id),
    invalidateKeys: [['resource', resource]],
    ...options,
  });
}
