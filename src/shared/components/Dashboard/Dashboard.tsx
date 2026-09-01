import { useTranslation } from 'react-i18next';

import { SkeletonShimmer } from '@/lib/animations/Skeleton.tsx';
import { dashboardKpiGrid } from '@/lib/responsive-grid.ts';
import { DashboardBento } from '@/shared/components/Dashboard/variants/DashboardBento.tsx';
import { DashboardClassic } from '@/shared/components/Dashboard/variants/DashboardClassic.tsx';
import { DashboardCommandCenter } from '@/shared/components/Dashboard/variants/DashboardCommandCenter.tsx';
import { DashboardPulse } from '@/shared/components/Dashboard/variants/DashboardPulse.tsx';
import { QueryBoundary } from '@/shared/components/QueryBoundary/index.ts';
import { useDeploymentMode } from '@/shared/hooks/useDeploymentFlags/index.ts';
import { useMeContext } from '@/shared/hooks/useMeContext/index.ts';
import { useThemeStore } from '@/shared/store/useThemeStore/index.ts';
import type { MeContext } from '@/shared/tenancy/me-context.ts';

import { DASHBOARD_KEYS, DASHBOARD_NS } from './dashboard.constants.ts';

function DashboardSkeleton() {
  return (
    <div data-testid="dashboard-page" className="flex flex-col gap-6">
      <SkeletonShimmer className="h-36 w-full rounded-2xl" />
      <div className={dashboardKpiGrid}>
        <SkeletonShimmer className="h-28 rounded-xl" />
        <SkeletonShimmer className="h-28 rounded-xl" />
        <SkeletonShimmer className="h-28 rounded-xl" />
        <SkeletonShimmer className="h-28 rounded-xl" />
      </div>
      <SkeletonShimmer className="h-56 rounded-xl" />
    </div>
  );
}

/**
 * Dashboard arrangement variants, indexed by the theme store's
 * `dashboardVariant` (TEMP preview axis — rolled by the Appearance Shuffle,
 * same mechanism as the Auth/App/Public layout previews). All variants render
 * the same sections (and test ids); only the arrangement changes. The variant
 * compositions are static imports on purpose: they are thin arrangements of
 * sections the default variant needs anyway, so a lazy split would save
 * nothing — the heavy widgets stay deferred via `Dashboard.deferred.tsx`.
 */
const DASHBOARD_VARIANTS = [
  DashboardClassic,
  DashboardCommandCenter,
  DashboardPulse,
  DashboardBento,
] as const;

/**
 * Workspace dashboard — the landing surface after sign-in. Reads the session
 * context (`useMeContext`) and renders an overview + capability-gated quick
 * actions. Personal organizations show a lighter set (no member/role/billing
 * management); team organizations surface the full toolkit. Shared so both the
 * personal (`/dashboard`) and team route spaces render the same surface (FE-20).
 */
export function Dashboard() {
  const { t } = useTranslation(DASHBOARD_NS);
  const query = useMeContext();

  return (
    <QueryBoundary
      query={query}
      loading={<DashboardSkeleton />}
      errorMessage={t(DASHBOARD_KEYS.errorLoad)}
    >
      {(ctx) => <DashboardContent ctx={ctx} />}
    </QueryBoundary>
  );
}

function DashboardContent({ ctx }: { ctx: MeContext }) {
  const { t } = useTranslation(DASHBOARD_NS);
  const personalOnly = useDeploymentMode() === 'personal-only';
  const dashboardVariant = useThemeStore((s) => s.dashboardVariant);

  const org = ctx.activeOrganization;
  const isTeam = org?.type === 'TEAM';
  const firstName =
    ctx.user.firstName ??
    ctx.user.email.split('@')[0] ??
    t(DASHBOARD_KEYS.greetingFallback);

  const Variant = DASHBOARD_VARIANTS[dashboardVariant] ?? DashboardClassic;

  return (
    /*
      Per-widget isolation is NOT here any more — it lives one level down, in
      `DeferredSection` (Dashboard.deferred.tsx), which gives the chart, the
      roster and the calendar a boundary each. That is what keeps a throw in one
      of them from taking the other two and the section heading with it (DASH-2),
      and it holds for every arrangement variant rather than just this one.
    */
    <Variant
      ctx={ctx}
      isTeam={isTeam}
      personalOnly={personalOnly}
      hero={{
        firstName,
        orgName: org?.name ?? t(DASHBOARD_KEYS.workspaceFallback),
        orgType: org?.type ?? 'PERSONAL',
        orgStatus: org?.status,
      }}
    />
  );
}
