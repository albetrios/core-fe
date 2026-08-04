import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils.ts';
import {
  DASHBOARD_KEYS,
  DASHBOARD_NS,
  ORG_STATUS_LABEL_KEYS,
} from '@/shared/components/Dashboard/dashboard.constants.ts';
import { Badge } from '@/shared/components/ui/badge.tsx';
import { useDeploymentMode } from '@/shared/hooks/useDeploymentFlags/index.ts';
import { useLocaleFormat } from '@/shared/hooks/useLocaleFormat/index.ts';
import { Building2 } from '@/shared/icons/index.ts';
import type { OrganizationStatusValue } from '@/shared/tenancy/me-context.ts';

function statusDotClass(status: OrganizationStatusValue): string {
  if (status === 'SUSPENDED') return 'bg-destructive';
  if (status === 'ARCHIVED') return 'bg-muted-foreground';
  return 'bg-success';
}

function orgStatusLabel(
  status: OrganizationStatusValue,
  t: (key: string) => string,
): string {
  const key = ORG_STATUS_LABEL_KEYS[status];
  return key ? t(key) : status.toLowerCase();
}

type DashboardHeroProps = {
  firstName: string;
  orgName: string;
  orgType: 'TEAM' | 'PERSONAL';
  orgStatus?: OrganizationStatusValue;
};

/** Atmospheric welcome band — greeting, workspace context, and today's date. */
export function DashboardHero({
  firstName,
  orgName,
  orgType,
  orgStatus,
}: DashboardHeroProps) {
  const { t } = useTranslation(DASHBOARD_NS);
  const { formatDate } = useLocaleFormat();
  const isTeam = orgType === 'TEAM';
  const personalOnly = useDeploymentMode() === 'personal-only';
  const showOrgContext = !personalOnly;
  // Regional locale for the label; "today" is the device local calendar day.
  const todayLabel = formatDate(new Date(), {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <header
      data-testid="dashboard-hero"
      className="border-border/60 from-muted/50 via-card to-card relative overflow-hidden rounded-2xl border bg-gradient-to-br px-5 py-6 sm:px-7 sm:py-8"
    >
      <div
        className="bg-primary/10 pointer-events-none absolute -end-8 -top-16 size-56 rounded-full blur-3xl"
        aria-hidden="true"
      />
      <div
        className="bg-brand/8 pointer-events-none absolute start-1/3 -bottom-20 size-40 rounded-full blur-3xl"
        aria-hidden="true"
      />

      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-2">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            {todayLabel}
          </p>
          <h1
            data-testid="dashboard-greeting"
            className="text-foreground text-2xl font-semibold tracking-tight text-balance sm:text-3xl"
          >
            {t(DASHBOARD_KEYS.greeting, { name: firstName })}
          </h1>
          <p className="text-muted-foreground max-w-prose text-sm text-pretty">
            {t(
              personalOnly
                ? DASHBOARD_KEYS.heroSubtitleSolo
                : DASHBOARD_KEYS.heroSubtitle,
            )}
          </p>

          {showOrgContext ? (
            <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1.5 pt-1 text-sm">
              <Building2 className="size-3.5 shrink-0" aria-hidden="true" />
              <span
                className="text-foreground font-medium"
                data-testid="dashboard-org-name"
              >
                {orgName}
              </span>
              <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                {isTeam
                  ? t(DASHBOARD_KEYS.orgType.team)
                  : t(DASHBOARD_KEYS.orgType.personal)}
              </Badge>
              {orgStatus ? (
                <span
                  className="inline-flex items-center gap-1.5"
                  data-testid="dashboard-org-status"
                >
                  <span
                    className={cn(
                      'inline-flex size-2 rounded-full',
                      statusDotClass(orgStatus),
                    )}
                    aria-hidden="true"
                  />
                  <span>{orgStatusLabel(orgStatus, t)}</span>
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
