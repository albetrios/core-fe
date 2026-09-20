import * as React from 'react';
import * as RechartsPrimitive from 'recharts';

import { isSafeCssColor } from '@/lib/css-safe.ts';
import { cn } from '@/lib/utils.ts';

const THEMES = { light: '', dark: '.dark' } as const;

interface ChartConfigItem {
  label?: React.ReactNode;
  icon?: React.ComponentType;
  color?: string;
  theme?: Record<keyof typeof THEMES, string>;
}

export type ChartConfig = Record<string, ChartConfigItem>;

interface ChartContextProps {
  config: ChartConfig;
}

const ChartContext = React.createContext<ChartContextProps | null>(null);

function useChart(): ChartContextProps {
  const context = React.useContext(ChartContext);
  if (!context) {
    throw new Error('useChart must be used within a <ChartContainer />');
  }
  return context;
}

function ChartContainer({
  id,
  className,
  children,
  config,
  ...props
}: React.ComponentProps<'div'> & {
  config: ChartConfig;
  children: React.ComponentProps<
    typeof RechartsPrimitive.ResponsiveContainer
  >['children'];
}) {
  const uniqueId = React.useId();
  const chartId = `chart-${id ?? uniqueId.replace(/:/g, '')}`;

  const contextValue = React.useMemo(() => ({ config }), [config]);

  return (
    <ChartContext.Provider value={contextValue}>
      <div
        data-slot="chart"
        data-chart={chartId}
        className={cn(
          "[&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted flex aspect-video justify-center text-xs [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-hidden [&_.recharts-sector]:outline-hidden [&_.recharts-sector[stroke='#fff']]:stroke-transparent [&_.recharts-surface]:outline-hidden",
          className,
        )}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        <RechartsPrimitive.ResponsiveContainer>
          {children}
        </RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}

function buildThemeCss(id: string, config: ChartConfig): string {
  const entries = Object.entries(config).filter(([, c]) => c.theme ?? c.color);
  if (!entries.length) return '';

  return Object.entries(THEMES)
    .map(([theme, prefix]) => {
      const vars = entries
        .map(([key, c]) => {
          const color = c.theme?.[theme as keyof typeof THEMES] ?? c.color;
          // Guard the raw `<style>` interpolation against CSS/HTML injection if a
          // config color is ever sourced from data (see lib/css-safe.ts).
          return color && isSafeCssColor(color) ? `  --color-${key}: ${color};` : null;
        })
        .filter(Boolean)
        .join('\n');
      return `${prefix} [data-chart=${id}] {\n${vars}\n}`;
    })
    .join('\n');
}

function ChartStyle({ id, config }: { id: string; config: ChartConfig }) {
  const css = buildThemeCss(id, config);
  if (!css) return null;
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}

const ChartTooltip = RechartsPrimitive.Tooltip;

interface TooltipItem {
  name?: string;
  dataKey?: string;
  value?: number;
  color?: string;
  payload?: Record<string, unknown>;
}

/**
 * Minimal themed tooltip body for charts. Reads labels/colors from the chart
 * config and renders a colored indicator, series label, and formatted value.
 */
function ChartTooltipContent({
  active,
  payload,
  label,
  hideLabel = false,
  className,
  valueFormatter,
}: {
  active?: boolean;
  payload?: TooltipItem[];
  label?: React.ReactNode;
  hideLabel?: boolean;
  className?: string;
  /** Locale-aware number formatter (prefer {@link useLocaleFormat}). */
  valueFormatter?: (value: number) => string;
}) {
  const { config } = useChart();

  if (!(active && payload?.length)) {
    return null;
  }

  return (
    <div
      className={cn(
        'border-border/50 bg-background grid min-w-[8rem] items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl',
        className,
      )}
    >
      {!hideLabel && label != null ? <div className="font-medium">{label}</div> : null}
      <div className="grid gap-1.5">
        {payload.map((item) => {
          const key = item.dataKey ?? item.name ?? 'value';
          const itemConfig = Object.hasOwn(config, key)
            ? // eslint-disable-next-line security/detect-object-injection -- guarded by hasOwnProperty
              config[key]
            : undefined;
          const formatted =
            item.value != null
              ? (valueFormatter?.(Number(item.value)) ??
                Number(item.value).toLocaleString())
              : null;
          return (
            <div
              key={key}
              className="flex w-full items-center justify-between gap-2 leading-none"
            >
              <div className="flex items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-muted-foreground">
                  {itemConfig?.label ?? item.name}
                </span>
              </div>
              {formatted != null ? (
                <span className="text-foreground font-mono font-medium tabular-nums">
                  {formatted}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { ChartContainer, ChartTooltip, ChartTooltipContent };
