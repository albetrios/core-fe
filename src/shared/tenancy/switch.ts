import { z } from 'zod';

import { API_BASE_PATH } from '@/core/config/constants.ts';
import { apiClient } from '@/core/http/fetch-client.ts';
import { queryClient } from '@/core/http/queryClient.ts';
import { ANALYTICS_EVENTS } from '@/shared/analytics/analytics.constants.ts';
import { captureAnalyticsEvent } from '@/shared/analytics/capture.ts';
import { scheduleTokenRefresh } from '@/shared/auth/refresh-timer.ts';
import { setAccessToken } from '@/shared/auth/token.ts';

import {
  type GlobalRole,
  type MeContext,
  meContextQueryKey,
  type OrganizationSummary,
  organizationWire,
  toOrganization,
} from './me-context.ts';
import {
  myOrganizationsQueryKey,
  type MyOrganizationSummary,
} from './my-organization-summaries.ts';
import { deriveOrgContext } from './organization-context.ts';

const switchWire = z.object({
  access_token: z.string().min(1),
  active_organization: organizationWire.nullable(),
  my_permissions: z.array(z.string()),
  global_role: z.enum(['super_admin', 'user']).nullable(),
});

function applyActiveOrg(
  active: OrganizationSummary | null,
  permissions: string[],
  globalRole: GlobalRole | null,
): MeContext | undefined {
  const next = queryClient.setQueryData<MeContext>(meContextQueryKey, (prev) =>
    prev
      ? {
          ...prev,
          activeOrganization: active,
          myPermissions: permissions,
          globalRole: globalRole ?? prev.globalRole,
        }
      : prev,
  );
  // The list lives in its own cache now and carries `isActive`, derived from the
  // context we have just changed — so every row's flag is stale the moment the
  // active organization moves. Re-derive in place rather than refetching: the
  // membership set did not change, only which of them is active.
  queryClient.setQueryData<MyOrganizationSummary[]>(myOrganizationsQueryKey, (prev) =>
    prev?.map((organization) => ({
      ...organization,
      isActive: !!active && organization.id === active.id,
    })),
  );
  return next;
}

/**
 * Monotonic switch generation. Switching re-mints the GLOBAL access token, and
 * switches can overlap — rapid org navigation (the URL guard) or a fast
 * double-click in the switcher fire two `/auth/switch-*` POSTs whose round-trips
 * interleave. Without a guard the LAST response to resolve wins the token
 * regardless of which org the user actually ended on, so a superseded switch
 * resolving late could leave the token pointing at the previous tenant while the
 * URL/store say the new one — org-B-keyed queries would then fetch with org A's
 * token (cross-tenant data confusion). Only the latest-initiated switch may
 * apply its token + context; stale ones are dropped.
 */
let switchGeneration = 0;

async function liveSwitch(
  path: string,
  body: Record<string, unknown>,
): Promise<MeContext | undefined> {
  switchGeneration += 1;
  const generation = switchGeneration;
  const res = await apiClient.post<unknown>(`${API_BASE_PATH}${path}`, body);
  // A newer switch superseded this one while the POST was in flight — discard
  // its token + context so it cannot clobber the active org.
  if (generation !== switchGeneration) return undefined;
  const wire = switchWire.parse(res.data);
  setAccessToken(wire.access_token);
  scheduleTokenRefresh();
  return applyActiveOrg(
    wire.active_organization ? toOrganization(wire.active_organization) : null,
    wire.my_permissions,
    wire.global_role,
  );
}

/**
 * Org isolation is now structural: every org-scoped query key carries the
 * active organization id (`['organization', orgId, …]`, `['org', orgId, …]`,
 * `['billing', 'org', orgId, …]`), so two tenants can never share a cache
 * entry and there is nothing to purge on a switch. Dropping the old
 * `removeQueries` purge also makes switching *back* to a recently-visited org
 * instant — its cache is served immediately and `staleTime` governs any
 * background refetch, instead of forcing a cold reload every time. Access is
 * still re-validated by the org guard chain on entry, so a serving a brief
 * cached view of an org the user belongs to is safe.
 */
export async function switchToOrganization(
  organizationId: string,
): Promise<MeContext | undefined> {
  const result = await liveSwitch('/auth/switch-to-organization', {
    organization_id: organizationId,
  });
  if (result) {
    deriveOrgContext(result);
    captureAnalyticsEvent(ANALYTICS_EVENTS.organizationSwitched, {
      target_organization_id: organizationId,
      target_type: result.activeOrganization?.type ?? null,
      switch_target: 'organization',
    });
  }
  return result;
}

export async function switchToPersonal(): Promise<MeContext | undefined> {
  // `POST /auth/switch-to-personal` resolves the personal org from the token and
  // 404s when the caller has none — a real, reachable state even when personal
  // orgs are *enabled* for the deployment: core-be provisions the personal org
  // best-effort at first verification, so a failed/skipped provision leaves the
  // user permanently flag-on-but-org-missing. me/context models exactly this as
  // `personalOrganizationId: null`. Gate on that concrete id (not the deployment
  // flag) so we never fire a switch we know will 404; callers treat `undefined`
  // as "no personal workspace to switch to".
  const cached = queryClient.getQueryData<MeContext>(meContextQueryKey);
  if (cached && !cached.personalOrganizationId) return undefined;

  const result = await liveSwitch('/auth/switch-to-personal', {});
  if (result) {
    deriveOrgContext(result);
    captureAnalyticsEvent(ANALYTICS_EVENTS.organizationSwitched, {
      target_type: result.activeOrganization?.type ?? 'PERSONAL',
      switch_target: 'personal',
    });
  }
  return result;
}
