import { useTranslation } from 'react-i18next';

import { iconChipClassName } from '@/lib/icon-surface.ts';
import { cn } from '@/lib/utils.ts';
import {
  DASHBOARD_KEYS,
  DASHBOARD_NS,
} from '@/shared/components/Dashboard/dashboard.constants.ts';
import {
  DASHBOARD_PULSE_METRICS,
  dashboardPulseRatio,
} from '@/shared/components/Dashboard/dashboard.placeholder-data.ts';
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
import { ShieldCheck } from '@/shared/icons/index.ts';

const RANK_DOTS = ['bg-chart-1', 'bg-chart-2', 'bg-chart-3'] as const;
const RANK_BARS = [
  '[&>div]:bg-chart-1',
  '[&>div]:bg-chart-2',
  '[&>div]:bg-chart-3',
] as const;

/**
 * "Feature usage" — the pulse metrics as a ranked leaderboard with progress
 * bars, sorted by completion so the numbers agree with the pulse gauge. Data
 * is the same placeholder seed, so the card carries the shared sample badge.
 */
export function UsageRanking() {
  const { t } = useTranslation(DASHBOARD_NS);
  const { formatNumber } = useLocaleFormat();
  const ranked = [...DASHBOARD_PULSE_METRICS].sort(
    (a, b) => dashboardPulseRatio(b) - dashboardPulseRatio(a),
  );
  const revealed = useRevealOnMount();

  return (
    <Card data-testid="dashboard-usage-ranking" className="gap-0 py-0">
      <CardHeader className="p-4 pb-0 sm:p-5 sm:pb-0">
        <div className="flex items-center gap-3">
          <span
            data-slot="icon-chip"
            className={cn('bg-primary/10 text-primary size-9', iconChipClassName)}
            aria-hidden="true"
          >
            <ShieldCheck className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">
                {t(DASHBOARD_KEYS.ranking.heading)}
              </CardTitle>
              {/* Same generated metrics as the pulse gauge — keep the sample
                  marker visible so the leaderboard never reads as real usage. */}
              <Badge variant="outline" data-testid="dashboard-ranking-sample">
                {t(DASHBOARD_KEYS.sampleBadge)}
              </Badge>
            </div>
            <CardDescription>{t(DASHBOARD_KEYS.ranking.description)}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 sm:p-5">
        <ol className="space-y-3">
          {ranked.map((metric, index) => {
            const ratio = dashboardPulseRatio(metric);
            return (
              <li
                key={metric.id}
                className={cn(
                  '-mx-2 space-y-1.5 rounded-xl border border-transparent p-2 transition-colors',
                  index === 0
                    ? 'border-chart-1/25 from-chart-1/12 to-card bg-gradient-to-r'
                    : 'hover:bg-muted/40',
                  revealBaseClassName,
                  revealed ? revealShownClassName : revealHiddenClassName,
                  staggerDelay(index),
                )}
                data-testid={`dashboard-ranking-row-${metric.id}`}
              >
                <div className="flex items-center gap-2 text-sm">
                  <span
                    data-slot="pill"
                    className={cn(
                      'text-foreground inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold tabular-nums',
                      RANK_DOTS[index % RANK_DOTS.length],
                      'text-primary-foreground',
                    )}
                  >
                    {formatNumber(index + 1)}
                  </span>
                  <span className="text-foreground min-w-0 flex-1 truncate">
                    {t(metric.labelKey)}
                  </span>
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {formatNumber(metric.value)}/{formatNumber(metric.target)} ·{' '}
                    {formatNumber(ratio * 100, { maximumFractionDigits: 0 })}%
                  </span>
                </div>
                <Progress
                  value={revealed ? ratio * 100 : 0}
                  className={cn(
                    'h-1.5 [&>div]:transition-transform [&>div]:duration-700 [&>div]:ease-out motion-reduce:[&>div]:transition-none',
                    RANK_BARS[index % RANK_BARS.length],
                  )}
                  aria-label={t(metric.labelKey)}
                />
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
