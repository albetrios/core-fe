import { keepPreviousData } from '@tanstack/react-query';

import type { ListParams } from '@/core/data-provider/dataProvider.ts';
import { dataProvider } from '@/core/data-provider/index.ts';
import { useAppQuery } from '@/shared/hooks/useAppQuery/index.ts';

/**
 * Fetch a paginated/filtered/sorted list of records for any resource.
 * Wraps {@link dataProvider.getList} in a TanStack Query.
 *
 * Query key shape: `['resource', <name>, 'list', <params>]` — mutations
 * (`useCreate`, `useUpdate`, `useDelete`) invalidate the `<name>` prefix.
 *
 * `params` are part of the key, so a search/sort/filter change is a *new* query.
 * `keepPreviousData` holds the current rows on screen while it loads instead of
 * blanking the list to a skeleton and refilling it on every keystroke (X-2);
 * `isPlaceholderData` marks them as belonging to the previous params.
 */
export function useList<T>(resource: string, params?: ListParams) {
  return useAppQuery({
    queryKey: ['resource', resource, 'list', params] as const,
    queryFn: () => dataProvider.getList<T>(resource, params),
    placeholderData: keepPreviousData,
  });
}
