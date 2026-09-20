import type { ResponseMeta } from '@/core/http/fetch-client.ts';

/** Camel-cased, UI-friendly page descriptor derived from `meta.pagination`. */
interface PageInfo {
  perPage: number;
  /** Opaque cursor for the next page, or `null` when there are no more. */
  next: string | null;
  hasMore: boolean;
  /** Present only when the backend computed a total (omitted on some lists). */
  estimatedTotal?: number;
}

/** A list payload paired with its cursor-pagination info. */
export interface Paginated<T> {
  items: T[];
  pageInfo: PageInfo;
}

/**
 * Map an `apiClient` list response (`{ data: T[], meta: { pagination } }`) into a
 * UI-friendly {@link Paginated}. When the backend omits `meta.pagination` (some
 * lists return a bare array under `data`), falls back to a single-page descriptor.
 */
export function toPaginated<T>(res: { data: T[]; meta?: ResponseMeta }): Paginated<T> {
  const pagination = res.meta?.pagination;
  const items = Array.isArray(res.data) ? res.data : [];
  return {
    items,
    pageInfo: {
      perPage: pagination?.per_page ?? items.length,
      next: pagination?.next ?? null,
      hasMore: pagination?.has_more ?? false,
      estimatedTotal: pagination?.estimated_total,
    },
  };
}
