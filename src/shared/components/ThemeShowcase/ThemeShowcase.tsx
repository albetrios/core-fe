import { useTranslation } from 'react-i18next';

import { platformConfig } from '@/core/config/env.ts';
import { iconChipClassName, iconOnPrimarySurface } from '@/lib/icon-surface.ts';
import { cn } from '@/lib/utils.ts';
import {
  DASHBOARD_KEYS,
  DASHBOARD_NS,
} from '@/shared/components/Dashboard/dashboard.constants.ts';
import { Button } from '@/shared/components/ui/button.tsx';
import { Card, CardContent } from '@/shared/components/ui/card.tsx';
import { Palette, Sparkles } from '@/shared/icons/index.ts';
import { notify } from '@/shared/notify/index.ts';
import { useThemeStore } from '@/shared/store/useThemeStore/index.ts';
import { useUIStore } from '@/shared/store/useUIStore/index.ts';
import {
  GENERATED_FONTS,
  GENERATED_PRESET,
  GENERATED_RADII,
  THEME_PRESETS,
} from '@/shared/theme/index.ts';

/** Chart-palette swatches — re-tint with the generated theme (mode-shared tokens). */
const CHART_SWATCHES = [
  'bg-chart-1',
  'bg-chart-2',
  'bg-chart-3',
  'bg-chart-4',
  'bg-chart-5',
] as const;

/**
 * Dashboard "workspace theme" bar — a compact, accent-driven strip that mirrors
 * every shuffled axis at a glance: the accent gradient + glow, the chart-palette
 * swatches, and the active font/radius label. So a theme change (Shuffle or a
 * preset) is immediately visible from the landing surface. Shuffle is inline;
 * named presets + the full picker live in the Appearance dialog. Controls hide
 * when the theme is locked.
 */
export function ThemeShowcase() {
  const { t } = useTranslation(DASHBOARD_NS);
  const preset = useThemeStore((s) => s.preset);
  const customTheme = useThemeStore((s) => s.customTheme);
  const shuffleTheme = useThemeStore((s) => s.shuffleTheme);
  const setAppearanceOpen = useUIStore((s) => s.setAppearanceOpen);

  // Shuffle rolls the toast design too — surface a toast so it's visible.
  const handleShuffle = () => {
    shuffleTheme();
    notify.info(t(DASHBOARD_KEYS.themeShowcase.shuffledTitle), {
      description: t(DASHBOARD_KEYS.themeShowcase.shuffledDescription),
    });
  };

  // Font/radius names come from the theme catalog and stay untranslated for
  // now — only the surrounding chrome is keyed (catalog labels are a follow-up).
  const label =
    preset === GENERATED_PRESET
      ? [
          t(DASHBOARD_KEYS.themeShowcase.custom),
          customTheme && GENERATED_FONTS[customTheme.bodyFontId]?.label,
          customTheme && GENERATED_RADII[customTheme.radiusId]?.label,
        ]
          .filter(Boolean)
          .join(' · ')
      : (THEME_PRESETS.find((p) => p.id === preset)?.label ??
        t(DASHBOARD_KEYS.themeShowcase.default));

  return (
    <Card
      aria-label={t(DASHBOARD_KEYS.themeShowcase.ariaLabel)}
      data-testid="dashboard-theme-showcase"
      className="from-primary/15 via-card to-card border-primary/20 relative gap-0 overflow-hidden bg-gradient-to-br py-0"
    >
      <div
        className="bg-primary/20 pointer-events-none absolute -end-10 -top-12 h-36 w-36 rounded-full blur-3xl"
        aria-hidden="true"
      />
      <CardContent className="relative p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <span
            data-slot="icon-chip"
            className={cn(
              'bg-primary text-primary-foreground shadow-primary/30 size-10',
              iconChipClassName,
            )}
          >
            <Palette className={cn('size-5', iconOnPrimarySurface)} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              {t(DASHBOARD_KEYS.themeShowcase.heading)}
            </p>
            <p className="truncate font-medium" data-testid="dashboard-theme-label">
              {label}
            </p>
          </div>
          <div
            className="flex items-center gap-1.5"
            aria-hidden="true"
            data-testid="dashboard-theme-palette"
          >
            {CHART_SWATCHES.map((swatch) => (
              <span
                key={swatch}
                data-slot="pill"
                className={`ring-border size-4 rounded-full ring-1 ${swatch}`}
              />
            ))}
          </div>
          {platformConfig.themeLock ? null : (
            <Button
              type="button"
              size="sm"
              onClick={handleShuffle}
              data-testid="dashboard-theme-shuffle"
            >
              <Sparkles className="me-2 size-4" aria-hidden="true" />{' '}
              {t(DASHBOARD_KEYS.themeShowcase.shuffle)}
            </Button>
          )}
          <button
            type="button"
            onClick={() => setAppearanceOpen(true)}
            className="text-primary text-sm font-medium hover:underline"
            data-testid="dashboard-theme-customize"
          >
            {t(DASHBOARD_KEYS.themeShowcase.customize)}{' '}
            {/* rotate rather than swap the glyph so RTL points back correctly */}
            <span aria-hidden="true" className="inline-block rtl:rotate-180">
              →
            </span>
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
