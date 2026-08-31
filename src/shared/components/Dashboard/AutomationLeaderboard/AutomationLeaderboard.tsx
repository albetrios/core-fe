import { useTranslation } from 'react-i18next';

import { iconChipClassName } from '@/lib/icon-surface.ts';
import { cn } from '@/lib/utils.ts';
import {
  DASHBOARD_KEYS,
  DASHBOARD_NS,
} from '@/shared/components/Dashboard/dashboard.constants.ts';
import { DASHBOARD_AUTOMATION_RANKS } from '@/shared/components/Dashboard/dashboard.placeholder-data.ts';
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
import { useLocaleFormat } from '@/shared/hooks/useLocaleFormat/index.ts';
import { ArrowDown, ArrowUp, Rocket } from '@/shared/icons/index.ts';

const RANK_CHIPS = [
  'bg-chart-1 text-primary-foreground ring-chart-1/35 ring-4',
  'bg-chart-2 text-primary-foreground',
  'bg-chart-3 text-primary-foreground',
  'bg-muted text-muted-foreground',
] as const;

/**
 * "Top automations" — a leaderboard of automation runs (things, not people —
 * fixture people are banned here) with a highlighted leader row, trend badges,
 * and a staggered entrance. Seeded values, so the card carries the sample badge.
 */
export function AutomationLeaderboard() {
  const { t } = useTranslation(DASHBOARD_NS);
  const { formatNumber } = useLocaleFormat();
  const revealed = useRevealOnMount();

  return (
    <Card data-testid="dashboard-leaderboard" className="gap-0 py-0">
      <CardHeader className="p-4 pb-0 sm:p-5 sm:pb-0">
        <div className="flex items-center gap-3">
          <span
            data-slot="icon-chip"
            className={cn('bg-primary/10 text-primary size-9', iconChipClassName)}
            aria-hidden="true"
          >
            <Rocket className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">
                {t(DASHBOARD_KEYS.leaderboard.heading)}
              </CardTitle>
              {/* Seeded runs, not real automation telemetry. */}
              <Badge variant="outline" data-testid="dashboard-leaderboard-sample">
                {t(DASHBOARD_KEYS.sampleBadge)}
              </Badge>
            </div>
            <CardDescription>{t(DASHBOARD_KEYS.leaderboard.description)}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 sm:p-5">
        <ol className="space-y-2">
          {DASHBOARD_AUTOMATION_RANKS.map((item, index) => {
            const up = item.deltaPct >= 0;
            return (
              <li
                key={item.id}
                data-testid={`dashboard-leaderboard-row-${item.id}`}
                className={cn(
                  'flex items-center gap-3 rounded-xl border p-2.5 transition-colors',
                  index === 0
                    ? 'border-chart-1/30 from-chart-1/15 to-card bg-gradient-to-r'
                    : 'hover:bg-muted/40 border-transparent',
                  revealBaseClassName,
                  revealed ? revealShownClassName : revealHiddenClassName,
                  staggerDelay(index),
                )}
              >
                <span
                  className={cn(
                    'inline-flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums',
                    RANK_CHIPS[index % RANK_CHIPS.length],
                  )}
                >
                  {formatNumber(index + 1)}
                </span>
                <span className="text-foreground min-w-0 flex-1 truncate text-sm font-medium">
                  {t(item.labelKey)}
                </span>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {formatNumber(item.runs)} {t(DASHBOARD_KEYS.leaderboard.runs)}
                </span>
                <span
                  className={cn(
                    'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums',
                    up
                      ? 'bg-success/10 text-success'
                      : 'bg-destructive/10 text-destructive',
                  )}
                >
                  {up ? (
                    <ArrowUp className="size-3" aria-hidden="true" />
                  ) : (
                    <ArrowDown className="size-3" aria-hidden="true" />
                  )}
                  {formatNumber(Math.abs(item.deltaPct), { maximumFractionDigits: 1 })}%
                </span>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
