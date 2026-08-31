import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Bar, BarChart, CartesianGrid, XAxis } from 'recharts';

import { iconChipClassName } from '@/lib/icon-surface.ts';
import { cn } from '@/lib/utils.ts';
import {
  DASHBOARD_KEYS,
  DASHBOARD_NS,
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
import { useLocaleFormat } from '@/shared/hooks/useLocaleFormat/index.ts';
import { Boxes } from '@/shared/icons/index.ts';

/**
 * "Weekly usage" — rounded grouped bars of sessions vs API calls per week,
 * aggregated from the same deterministic series as the analytics chart
 * (sample-badged). Bars animate in via recharts' native mount animation.
 */
export function UsageBars() {
  const { t } = useTranslation(DASHBOARD_NS);
  const { formatDate } = useLocaleFormat();

  const data = useMemo(() => {
    const series = buildAnalyticsSeries('30d');
    const weeks: { label: string; sessions: number; apiCalls: number }[] = [];
    for (let start = series.length - 28; start < series.length; start += 7) {
      const chunk = series.slice(Math.max(0, start), start + 7);
      const day = new Date();
      day.setDate(day.getDate() - (series.length - 1 - Math.max(0, start)));
      weeks.push({
        label: formatDate(day, { month: 'short', day: 'numeric' }),
        sessions: chunk.reduce((sum, p) => sum + p.sessions, 0),
        apiCalls: chunk.reduce((sum, p) => sum + p.apiCalls, 0),
      });
    }
    return weeks;
  }, [formatDate]);

  const chartConfig = useMemo(
    () =>
      ({
        sessions: {
          label: t(DASHBOARD_KEYS.analytics.seriesSessions),
          color: 'var(--color-chart-1)',
        },
        apiCalls: {
          label: t(DASHBOARD_KEYS.analytics.seriesApiCalls),
          color: 'var(--color-chart-2)',
        },
      }) satisfies ChartConfig,
    [t],
  );

  return (
    <Card data-testid="dashboard-usage-bars" className="gap-0 py-0">
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
                {t(DASHBOARD_KEYS.usageBars.heading)}
              </CardTitle>
              {/* Same generated series as the analytics chart — keep the
                  sample marker visible so the bars never read as telemetry. */}
              <Badge variant="outline" data-testid="dashboard-usage-bars-sample">
                {t(DASHBOARD_KEYS.sampleBadge)}
              </Badge>
            </div>
            <CardDescription>{t(DASHBOARD_KEYS.usageBars.description)}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 sm:p-5">
        <ChartContainer config={chartConfig} className="aspect-auto h-[220px] w-full">
          <BarChart data={data} margin={{ left: 4, right: 4, top: 8 }} barGap={4}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            <Bar dataKey="sessions" fill="var(--color-sessions)" radius={[6, 6, 0, 0]} />
            <Bar dataKey="apiCalls" fill="var(--color-apiCalls)" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
