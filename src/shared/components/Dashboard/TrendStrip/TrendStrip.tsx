import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils.ts';
import {
  DASHBOARD_KEYS,
  DASHBOARD_NS,
} from '@/shared/components/Dashboard/dashboard.constants.ts';
import {
  buildDashboardTrends,
  type DashboardTrend,
} from '@/shared/components/Dashboard/dashboard.placeholder-data.ts';
import {
  revealBaseClassName,
  revealHiddenClassName,
  revealShownClassName,
  staggerDelay,
  useRevealOnMount,
} from '@/shared/components/Dashboard/dashboard-motion.ts';
import { Badge } from '@/shared/components/ui/badge.tsx';
import { useLocaleFormat } from '@/shared/hooks/useLocaleFormat/index.ts';
import { ArrowDown, ArrowUp } from '@/shared/icons/index.ts';

const TREND_COLORS = [
  { line: 'text-chart-1', wash: 'from-chart-1/10' },
  { line: 'text-chart-2', wash: 'from-chart-2/10' },
  { line: 'text-chart-3', wash: 'from-chart-3/10' },
] as const;

const SPARK_W = 100;
const SPARK_H = 30;

/** Normalize a series into sparkline polyline points within the viewBox. */
function sparkPoints(values: number[]): string {
  if (values.length < 2) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * SPARK_W;
      const y = SPARK_H - 3 - ((value - min) / span) * (SPARK_H - 6);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

function TrendCard({
  trend,
  color,
  revealed,
  delayClassName,
}: {
  trend: DashboardTrend;
  color: (typeof TREND_COLORS)[number];
  revealed: boolean;
  delayClassName: string;
}) {
  const { t } = useTranslation(DASHBOARD_NS);
  const { formatNumber } = useLocaleFormat();
  const up = trend.deltaPct >= 0;
  const points = sparkPoints(trend.points);

  return (
    <article
      data-testid={`dashboard-trend-${trend.id}`}
      data-slot="card"
      className={cn(
        'border-border/70 text-card-foreground via-card to-card relative flex flex-col gap-2 overflow-hidden rounded-xl border bg-gradient-to-br p-4',
        'transition-[transform,opacity] duration-300 hover:-translate-y-0.5 motion-reduce:transition-none',
        color.wash,
        revealBaseClassName,
        revealed ? revealShownClassName : revealHiddenClassName,
        delayClassName,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-muted-foreground text-xs font-medium">{t(trend.labelKey)}</p>
        <span
          className={cn(
            'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums',
            up ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive',
          )}
        >
          {up ? (
            <ArrowUp className="size-3" aria-hidden="true" />
          ) : (
            <ArrowDown className="size-3" aria-hidden="true" />
          )}
          {formatNumber(Math.abs(trend.deltaPct), { maximumFractionDigits: 1 })}%
        </span>
      </div>
      <p className="text-foreground text-2xl font-semibold tracking-tight tabular-nums">
        {formatNumber(trend.value)}
      </p>
      <div className={color.line}>
        <svg
          viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
          preserveAspectRatio="none"
          className="h-9 w-full"
          aria-hidden="true"
          focusable="false"
        >
          <defs>
            <linearGradient id={`spark-${trend.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity={0.35} />
              <stop offset="100%" stopColor="currentColor" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <polygon
            points={`0,${SPARK_H} ${points} ${SPARK_W},${SPARK_H}`}
            fill={`url(#spark-${trend.id})`}
            className="transition-opacity duration-700 motion-reduce:transition-none"
            opacity={revealed ? 1 : 0}
          />
          <polyline
            points={points}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={revealed ? 0 : 1}
            className="transition-[stroke-dashoffset] duration-1000 ease-out motion-reduce:transition-none"
          />
        </svg>
      </div>
    </article>
  );
}

/**
 * "Usage trends" — three mini KPI cards with a week-over-week delta badge and
 * a pure-SVG sparkline, tinted by the shuffled chart palette. Numbers derive
 * from the same deterministic sample series as the analytics chart, so the
 * strip carries the shared sample badge.
 */
export function TrendStrip() {
  const { t } = useTranslation(DASHBOARD_NS);
  const trends = buildDashboardTrends();
  const revealed = useRevealOnMount();

  return (
    <section
      aria-label={t(DASHBOARD_KEYS.trends.heading)}
      className="space-y-3"
      data-testid="dashboard-trend-strip"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-foreground text-base font-semibold tracking-tight">
          {t(DASHBOARD_KEYS.trends.heading)}
        </h2>
        <Badge variant="outline" data-testid="dashboard-trend-sample">
          {t(DASHBOARD_KEYS.sampleBadge)}
        </Badge>
        <p className="text-muted-foreground w-full text-sm text-pretty sm:w-auto">
          {t(DASHBOARD_KEYS.trends.description)}
        </p>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))] gap-3">
        {trends.map((trend, index) => (
          <TrendCard
            key={trend.id}
            trend={trend}
            color={TREND_COLORS[index % TREND_COLORS.length] ?? TREND_COLORS[0]}
            revealed={revealed}
            delayClassName={staggerDelay(index)}
          />
        ))}
      </div>
    </section>
  );
}
