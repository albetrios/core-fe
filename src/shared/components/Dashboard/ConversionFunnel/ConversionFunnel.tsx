import { useTranslation } from 'react-i18next';

import { iconChipClassName } from '@/lib/icon-surface.ts';
import { cn } from '@/lib/utils.ts';
import {
  DASHBOARD_KEYS,
  DASHBOARD_NS,
} from '@/shared/components/Dashboard/dashboard.constants.ts';
import { DASHBOARD_FUNNEL_STAGES } from '@/shared/components/Dashboard/dashboard.placeholder-data.ts';
import {
  revealBaseClassName,
  revealHiddenClassName,
  revealShownClassName,
  staggerDelay,
  useRevealOnMount,
} from '@/shared/components/Dashboard/dashboard-motion.ts';
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
import { Users } from '@/shared/icons/index.ts';

const STAGE_BARS = [
  '[&>div]:bg-chart-1',
  '[&>div]:bg-chart-2',
  '[&>div]:bg-chart-3',
  '[&>div]:bg-chart-4',
] as const;

/**
 * "Acquisition funnel" — stages from first visit to activated, each an
 * animated bar scaled to the top-of-funnel volume with its conversion share.
 * Seeded placeholder values (sample-badged); bars fill in on mount.
 */
export function ConversionFunnel() {
  const { t } = useTranslation(DASHBOARD_NS);
  const { formatNumber } = useLocaleFormat();
  const revealed = useRevealOnMount();
  const top = DASHBOARD_FUNNEL_STAGES[0]?.value ?? 1;

  return (
    <Card data-testid="dashboard-funnel" className="gap-0 py-0">
      <CardHeader className="p-4 pb-0 sm:p-5 sm:pb-0">
        <div className="flex items-center gap-3">
          <span
            data-slot="icon-chip"
            className={cn('bg-primary/10 text-primary size-9', iconChipClassName)}
            aria-hidden="true"
          >
            <Users className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">
                {t(DASHBOARD_KEYS.funnel.heading)}
              </CardTitle>
              {/* Seeded stages, not real conversion — keep the marker visible. */}
              <Badge variant="outline" data-testid="dashboard-funnel-sample">
                {t(DASHBOARD_KEYS.sampleBadge)}
              </Badge>
            </div>
            <CardDescription>{t(DASHBOARD_KEYS.funnel.description)}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 sm:p-5">
        <ol className="space-y-3">
          {DASHBOARD_FUNNEL_STAGES.map((stage, index) => {
            const share = (stage.value / top) * 100;
            return (
              <li
                key={stage.id}
                data-testid={`dashboard-funnel-stage-${stage.id}`}
                className={cn(
                  'space-y-1.5',
                  revealBaseClassName,
                  revealed ? revealShownClassName : revealHiddenClassName,
                  staggerDelay(index),
                )}
              >
                <div className="flex items-baseline gap-2 text-sm">
                  <span className="text-foreground min-w-0 flex-1 truncate">
                    {t(stage.labelKey)}
                  </span>
                  <span className="text-foreground font-semibold tabular-nums">
                    {formatNumber(stage.value)}
                  </span>
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {formatNumber(share, { maximumFractionDigits: 0 })}%
                  </span>
                </div>
                <Progress
                  value={revealed ? share : 0}
                  className={cn(
                    'h-2.5 [&>div]:transition-transform [&>div]:duration-700 [&>div]:ease-out motion-reduce:[&>div]:transition-none',
                    STAGE_BARS[index % STAGE_BARS.length],
                  )}
                  aria-label={t(stage.labelKey)}
                />
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
