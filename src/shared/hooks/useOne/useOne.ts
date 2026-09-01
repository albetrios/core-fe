import { dataProvider } from '@/core/data-provider/index.ts';
import { useAppQuery } from '@/shared/hooks/useAppQuery/index.ts';

/**
 * Fetch a single record by id. Disabled when `id` is undefined or empty
 * so route components can pass route params directly without guarding.
 */
export function useOne<T>(resource: string, id: string | undefined) {
  return useAppQuery({
    queryKey: ['resource', resource, 'one', id] as const,
    queryFn: () => dataProvider.getOne<T>(resource, id!),
    enabled: Boolean(id),
  });
}
