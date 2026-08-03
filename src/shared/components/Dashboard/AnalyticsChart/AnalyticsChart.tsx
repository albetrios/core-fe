import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Area, AreaChart, CartesianGrid, XAxis } from 'recharts';

import { iconChipClassName } from '@/lib/icon-surface.ts';
import { cn } from '@/lib/utils.ts';
import {
  type AnalyticsRange,
  DASHBOARD_KEYS,
  DASHBOARD_NS,
  DASHBOARD_TEST_IDS,
} from '@/shared/components/Dashboard/dashboard.constants.ts';
import { buildAnalyticsSeries } from '@/shared/components/Dashboard/dashboard.placeholder-data.ts';
import { Badge } from '@/shared/components/ui/badge.tsx';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card.tsx';
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/shared/components/ui/chart.tsx';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select.tsx';
import { useLocaleFormat } from '@/shared/hooks/useLocaleFormat/index.ts';
import { Zap } from '@/shared/icons/index.ts';

/**
 * Interactive workspace-activity area chart — the dashboard's hero analytics
 * surface (sessions + API calls over time, with a 7/30/90-day range selector).
 * Built on the shadcn `Chart` (Recharts); series colours bind to the theme's
 * `--color-chart-*` tokens, so every appearance axis (accent/preset, radius,
 * density, elevation) is reflected here on dense, real-looking time-series data.
 */
export function AnalyticsChart() {
  const { t } = useTranslation(DASHBOARD_NS);
  const { formatDate } = useLocaleFormat();
  const [range, setRange] = useState<AnalyticsRange>('30d');
  const data = useMemo(
    () =>
      buildAnalyticsSeries(range, new Date(), (date) =>
        formatDate(date, { month: 'short', day: 'numeric' }),
      ),
    [range, formatDate],
  );

  const chartConfig = useMemo<ChartConfig>(
    () => ({
      sessions: {
        label: t(DASHBOARD_KEYS.analytics.seriesSessions),
        color: 'var(--color-chart-1)',
      },
      apiCalls: {
        label: t(DASHBOARD_KEYS.analytics.seriesApiCalls),
        color: 'var(--color-chart-2)',
      },
    }),
    [t],
  );

  return (
    <Card data-testid={DASHBOARD_TEST_IDS.analyticsChart}>
      <CardHeader>
        <div className="flex items-center gap-3">
          <span
            data-slot="icon-chip"
            className={cn('bg-primary/10 text-primary size-9', iconChipClassName)}
            aria-hidden="true"
          >
            <Zap className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">
                {t(DASHBOARD_KEYS.analytics.heading)}
              </CardTitle>
              {/* No usage endpoints exist yet — the series is generated. Say so
                  on screen: an unmarked fake curve reads as real telemetry. */}
              <Badge variant="outline" data-testid="dashboard-analytics-sample">
                {t(DASHBOARD_KEYS.sampleBadge)}
              </Badge>
            </div>
            <CardDescription>{t(DASHBOARD_KEYS.analytics.description)}</CardDescription>
          </div>
          <Select
            value={range}
            onValueChange={(value) => setRange(value as AnalyticsRange)}
          >
            <SelectTrigger
              size="sm"
              className="w-36"
              aria-label={t(DASHBOARD_KEYS.analytics.rangeLabel)}
              data-testid={DASHBOARD_TEST_IDS.analyticsRange}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">
                {t(DASHBOARD_KEYS.analytics.range['7d'])}
              </SelectItem>
              <SelectItem value="30d">
                {t(DASHBOARD_KEYS.analytics.range['30d'])}
              </SelectItem>
              <SelectItem value="90d">
                {t(DASHBOARD_KEYS.analytics.range['90d'])}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="aspect-auto h-[260px] w-full">
          <AreaChart data={data} margin={{ left: 4, right: 4, top: 8 }}>
            <defs>
              <linearGradient id="fillSessions" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-sessions)" stopOpacity={0.8} />
                <stop offset="95%" stopColor="var(--color-sessions)" stopOpacity={0.1} />
              </linearGradient>
              <linearGradient id="fillApiCalls" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-apiCalls)" stopOpacity={0.8} />
                <stop offset="95%" stopColor="var(--color-apiCalls)" stopOpacity={0.1} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
            />
            <ChartTooltip cursor content={<ChartTooltipContent />} />
            <Area
              dataKey="apiCalls"
              type="natural"
              fill="url(#fillApiCalls)"
              stroke="var(--color-apiCalls)"
              stackId="a"
            />
            <Area
              dataKey="sessions"
              type="natural"
              fill="url(#fillSessions)"
              stroke="var(--color-sessions)"
              stackId="a"
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
