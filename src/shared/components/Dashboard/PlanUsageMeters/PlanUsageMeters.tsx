import { useTranslation } from 'react-i18next';

import { iconChipClassName } from '@/lib/icon-surface.ts';
import { cn } from '@/lib/utils.ts';
import {
  DASHBOARD_KEYS,
  DASHBOARD_NS,
} from '@/shared/components/Dashboard/dashboard.constants.ts';
import { DASHBOARD_PLAN_METERS } from '@/shared/components/Dashboard/dashboard.placeholder-data.ts';
import { useRevealOnMount } from '@/shared/components/Dashboard/dashboard-motion.ts';
import { Badge } from '@/shared/components/ui/badge.tsx';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card.tsx';
import { Progress } from '@/shared/components/ui/progress.tsx';
import { useLocaleFormat } from '@/shared/hooks/useLocaleFormat/index.ts';
import { Boxes } from '@/shared/icons/index.ts';

const METER_BARS = [
  '[&>div]:bg-chart-1',
  '[&>div]:bg-chart-2',
  '[&>div]:bg-chart-3',
] as const;

/**
 * "Plan usage" — limit meters for workspaces/members/automations with animated
 * fills; a meter past 80% flips to the destructive tone as a soft warning.
 * Caps are placeholder until billing limits land, so the card is sample-badged.
 */
export function PlanUsageMeters() {
  const { t } = useTranslation(DASHBOARD_NS);
  const { formatNumber } = useLocaleFormat();
  const revealed = useRevealOnMount();

  return (
    <Card data-testid="dashboard-plan-meters" className="gap-0 py-0">
      <CardHeader className="p-4 pb-0 sm:p-5 sm:pb-0">
        <div className="flex items-center gap-3">
          <span
            data-slot="icon-chip"
            className={cn('bg-primary/10 text-primary size-9', iconChipClassName)}
            aria-hidden="true"
          >
            <Boxes className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">
                {t(DASHBOARD_KEYS.meters.heading)}
              </CardTitle>
              {/* Fabricated caps until billing limits land. */}
              <Badge variant="outline" data-testid="dashboard-meters-sample">
                {t(DASHBOARD_KEYS.sampleBadge)}
              </Badge>
            </div>
            <CardDescription>{t(DASHBOARD_KEYS.meters.description)}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-4 sm:p-5">
        {DASHBOARD_PLAN_METERS.map((meter, index) => {
          const pct = (meter.used / meter.max) * 100;
          const nearLimit = pct >= 80;
          return (
            <div
              key={meter.id}
              className="space-y-1.5"
              data-testid={`dashboard-meter-${meter.id}`}
            >
              <div className="flex items-baseline gap-2 text-sm">
                <span className="text-foreground min-w-0 flex-1 truncate">
                  {t(meter.labelKey)}
                </span>
                <span
                  className={cn(
                    'text-xs font-medium tabular-nums',
                    nearLimit ? 'text-destructive' : 'text-muted-foreground',
                  )}
                >
                  {formatNumber(meter.used)}/{formatNumber(meter.max)}
                </span>
              </div>
              <Progress
                value={revealed ? pct : 0}
                className={cn(
                  'h-2 [&>div]:transition-transform [&>div]:duration-700 [&>div]:ease-out motion-reduce:[&>div]:transition-none',
                  nearLimit
                    ? '[&>div]:bg-destructive'
                    : METER_BARS[index % METER_BARS.length],
                )}
                aria-label={t(meter.labelKey)}
              />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
