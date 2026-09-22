/**
 * Query-key registry for the organization domain. Lives beside the fetchers in
 * `shared/api/` so every resource hook (`useMembers`, `useInvitations`, …)
 * shares one namespace without importing a sibling hook folder.
 */
/**
 * Shared TanStack Query hooks for the organization domain (members, invitations,
 * roles, API keys). Billing hooks live in `useSubscription/` but use `billingQueryKeys`.
 */
/**
 * Keys are scoped by the active organization id so two tenants can never share
 * a cache entry — switching orgs is structural isolation, not a manual cache
 * purge. `all` (the bare `['organization']` prefix) still matches every org for
 * broad invalidation. Pass `organizationId` from `useOrganizationStore`; a
 * `null` id (personal mode) is a distinct, valid scope.
 */
/**
 * Params that scope a windowed (cursor-paginated) list query. Keeping them in the
 * key means each search/sort combination caches independently; the parent
 * `members`/`roles`/`apiKeys` prefix still matches every variant for broad
 * invalidation (and for optimistic patches across all cached pages).
 */
export interface OrgListKeyParams {
  q?: string;
  sort?: string;
  order?: 'asc' | 'desc';
}

export const orgQueryKeys = {
  all: ['organization'] as const,
  org: (organizationId: string | null) => [...orgQueryKeys.all, organizationId] as const,
  members: (organizationId: string | null) =>
    [...orgQueryKeys.org(organizationId), 'members'] as const,
  membersList: (organizationId: string | null, params: OrgListKeyParams) =>
    [...orgQueryKeys.members(organizationId), 'list', params] as const,
  roles: (organizationId: string | null) =>
    [...orgQueryKeys.org(organizationId), 'roles'] as const,
  rolesList: (organizationId: string | null, params: OrgListKeyParams) =>
    [...orgQueryKeys.roles(organizationId), 'list', params] as const,
  apiKeys: (organizationId: string | null) =>
    [...orgQueryKeys.org(organizationId), 'api-keys'] as const,
  apiKeysList: (organizationId: string | null, params: OrgListKeyParams) =>
    [...orgQueryKeys.apiKeys(organizationId), 'list', params] as const,
  /**
   * The permission catalog is platform-wide reference data, not org-scoped — it sits under
   * `all` rather than `org(id)` so switching workspaces does not refetch it.
   */
  permissionCatalog: () => [...orgQueryKeys.all, 'permission-catalog'] as const,
};
