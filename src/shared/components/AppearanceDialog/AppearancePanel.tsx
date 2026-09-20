import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { platformConfig } from '@/core/config/env.ts';
import {
  appearanceChoiceClassName,
  appearanceModeCardClassName,
  appearancePreviewWellClassName,
  appearanceTileActiveClassName,
  appearanceTileIdleClassName,
} from '@/lib/appearance-surface.ts';
import { ERRORS_KEYS, ERRORS_NS } from '@/lib/i18n/errors.constants.ts';
import i18n from '@/lib/i18n/i18n.ts';
import { LOCALE_KEYS, LOCALE_NS } from '@/lib/i18n/locale.constants.ts';
import { closeControlClassName } from '@/lib/icon-surface.ts';
import { cn } from '@/lib/utils.ts';
import {
  APPEARANCE_KEYS,
  APPEARANCE_NS,
} from '@/shared/components/AppearanceDialog/appearance.constants.ts';
import { DateTimePrefsCard } from '@/shared/components/DateTimePrefsCard/index.ts';
import { LanguagePrefsCard } from '@/shared/components/LanguagePrefsCard/index.ts';
import { MoneyPrefsCard } from '@/shared/components/MoneyPrefsCard/index.ts';
import { Button } from '@/shared/components/ui/button.tsx';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card.tsx';
import { Input } from '@/shared/components/ui/input.tsx';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select.tsx';
import { Separator } from '@/shared/components/ui/separator.tsx';
import { Check, Monitor, Moon, Sparkles, Sun } from '@/shared/icons/index.ts';
import { notify } from '@/shared/notify/index.ts';
import { useThemeStore } from '@/shared/store/useThemeStore/index.ts';
import {
  ACCENT_COLORS,
  ACCENT_INTENSITIES,
  BASE_COLORS,
  CONTRAST_MODES,
  DASHBOARD_VARIANTS_CATALOG,
  DENSITY_SCALES,
  ELEVATION_LEVELS,
  FOCUS_RINGS,
  GENERATED_FONTS,
  GENERATED_PRESET,
  GENERATED_RADII,
  HARMONY_RULES,
  hexToHue,
  ICON_COLORS,
  ICON_LIBRARIES,
  ICON_WEIGHTS,
  LAYOUT_WIDTHS,
  MENU_STYLES,
  MOTION_PRESETS,
  nextDashboardVariant,
  nextToastVariant,
  normalizeLook,
  oklchToHex,
  rollColour,
  rollSurface,
  rollTypography,
  SEPARATION_STRATEGIES,
  SHAPE_LANGUAGES,
  THEME_PRESETS,
  TOAST_POSITION_LABELS,
  TOAST_POSITIONS,
  TOAST_VARIANTS,
  type ToastPosition,
  type ToastVariant,
  TYPE_SCALES,
} from '@/shared/theme/index.ts';

import { lookFields } from './appearance-look.ts';

const THEMES = [
  { id: 'light' as const, label: 'Light', description: 'Bright theme.', icon: Sun },
  { id: 'dark' as const, label: 'Dark', description: 'Dimmed for night.', icon: Moon },
  {
    id: 'system' as const,
    label: 'System',
    description: 'Follow your OS.',
    icon: Monitor,
  },
];

const RADIUS_OPTIONS = Object.entries(GENERATED_RADII).map(([id, r]) => ({
  id,
  label: r.label,
}));

/** Record<{label}> → the {id,label}[] shape the Choices picker expects. */
const toOptions = (rec: Record<string, { label: string }>) =>
  Object.entries(rec).map(([id, v]) => ({ id, label: v.label }));
const DENSITY_OPTIONS = toOptions(DENSITY_SCALES);
const MOTION_OPTIONS = toOptions(MOTION_PRESETS);
const HARMONY_OPTIONS = toOptions(HARMONY_RULES);
const INTENSITY_OPTIONS = toOptions(ACCENT_INTENSITIES);
const TYPE_SCALE_OPTIONS = toOptions(TYPE_SCALES);

/** TEMP: toast-design choices for the preview picker. */
const TOAST_VARIANT_OPTIONS = TOAST_VARIANTS.map((id) => ({
  id,
  label: id.charAt(0).toUpperCase() + id.slice(1),
}));

/** Toast-position choices for the preview picker. */
const TOAST_POSITION_OPTIONS = TOAST_POSITIONS.map((id) => ({
  id,
  label: TOAST_POSITION_LABELS[id],
}));

/** Inline swatches — each variant uses live semantic tokens (success tone as sample). */
function ToastVariantSwatches({
  activeIndex,
  onPick,
}: {
  activeIndex: number;
  onPick: (index: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" data-testid="toast-variant-swatches">
      {TOAST_VARIANTS.map((variant, index) => (
        <button
          key={variant}
          type="button"
          data-slot="button"
          aria-label={`${variant} toast style`}
          aria-pressed={index === activeIndex}
          data-testid={`toast-swatch-${variant}`}
          onClick={() => onPick(index)}
          className={cn(
            'relative flex h-9 min-w-[4.25rem] flex-1 items-center justify-center rounded-lg border text-[10px] font-semibold capitalize transition',
            variant === 'tint' &&
              'border-success/25 bg-success/10 text-success border-transparent',
            variant === 'solid' &&
              'bg-success text-success-foreground border-transparent',
            variant === 'outline' &&
              'bg-popover text-popover-foreground border-success/50',
            variant === 'accent' &&
              'border-border bg-popover text-popover-foreground ps-3',
            variant === 'minimal' &&
              'border-border/60 bg-background/80 text-foreground border-dashed',
            variant === 'glass' &&
              'border-border/40 bg-popover/55 text-popover-foreground backdrop-blur-md',
            index === activeIndex &&
              'ring-ring ring-offset-background ring-2 ring-offset-2',
          )}
        >
          {variant === 'accent' ? (
            <span
              className="bg-success absolute inset-y-1 start-0 w-1 rounded-full"
              aria-hidden="true"
            />
          ) : null}
          {variant}
        </button>
      ))}
    </div>
  );
}

/**
 * Colour field: a native colour "snippet" for any hue, plus the preset swatches as
 * quick suggestions. The look stores an OKLCH hue, so a custom pick is mapped via
 * hexToHue and the snippet reflects the applied accent (oklchToHex).
 */
function ColourField({
  ariaLabel,
  selectedId,
  currentHex,
  onPickHue,
  testPrefix,
}: {
  ariaLabel: string;
  selectedId: string | null;
  currentHex: string;
  onPickHue: (hue: number) => void;
  testPrefix: string;
}) {
  const { t: tColour } = useTranslation(APPEARANCE_NS);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="color"
        value={currentHex}
        onChange={(e) => onPickHue(hexToHue(e.target.value))}
        aria-label={`${ariaLabel} — custom`}
        title={tColour(APPEARANCE_KEYS.pickAnyColour)}
        data-testid={`${testPrefix}-custom`}
        data-slot="pill"
        className="border-border size-7 cursor-pointer rounded-full border bg-transparent p-0 outline-none"
      />
      <span className="bg-border mx-1 h-6 w-px" aria-hidden="true" />
      <div role="radiogroup" aria-label={ariaLabel} className="flex flex-wrap gap-2">
        {ACCENT_COLORS.map((c) => {
          const active = selectedId === c.id;
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              data-slot="button"
              aria-checked={active}
              aria-label={c.label}
              title={c.label}
              onClick={() => onPickHue(c.hue)}
              data-testid={`${testPrefix}-${c.id}`}
              className={cn(
                'size-7 rounded-full transition outline-none focus-visible:outline-hidden',
                `theme-dot-${c.id}`,
                active
                  ? 'ring-foreground ring-offset-background ring-2 ring-offset-2'
                  : 'hover:scale-110',
              )}
            />
          );
        })}
      </div>
    </div>
  );
}

/** Generic pill radiogroup for base colour / radius / menu style. */
function Choices({
  ariaLabel,
  value,
  options,
  onPick,
  testPrefix,
}: {
  ariaLabel: string;
  value: string;
  options: readonly { id: string; label: string }[];
  onPick: (id: string) => void;
  testPrefix: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            data-slot="button"
            aria-checked={active}
            onClick={() => onPick(o.id)}
            data-testid={`${testPrefix}-${o.id}`}
            className={cn(
              appearanceChoiceClassName,
              active
                ? 'border-primary bg-primary/10 text-foreground'
                : 'border-border text-muted-foreground hover:border-primary/50',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Font dropdown (body / heading) over the web-safe catalog. */
function FontSelect({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <p id={`${id}-label`} className="text-sm font-medium">
        {label}
      </p>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger
          className="w-full"
          aria-labelledby={`${id}-label`}
          data-testid={id}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="z-[90]">
          {Object.entries(GENERATED_FONTS).map(([fid, f]) => (
            <SelectItem key={fid} value={fid}>
              {f.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function FieldLabel({ children }: { children: string }) {
  return <p className="text-sm font-medium">{children}</p>;
}

/** A small per-section shuffle button (re-rolls just one card's axes). */
function SectionShuffle({
  onClick,
  label,
  testId,
}: {
  onClick: () => void;
  label: string;
  testId: string;
}) {
  const { t: tShuffle } = useTranslation(APPEARANCE_NS);
  return (
    <button
      type="button"
      data-slot="button"
      onClick={onClick}
      aria-label={tShuffle(APPEARANCE_KEYS.shuffleSection, { section: label })}
      title={tShuffle(APPEARANCE_KEYS.shuffleSection, { section: label })}
      data-testid={testId}
      className={cn(
        'text-muted-foreground hover:bg-accent hover:text-foreground rounded-md p-1.5 transition',
        closeControlClassName,
      )}
    >
      <Sparkles className="size-4" aria-hidden="true" />
    </button>
  );
}

/**
 * Appearance controls — a shadcn-create-style theme studio: light/dark/system
 * mode plus per-axis pickers (colour, fonts, radius, density, motion, …), each
 * section re-rollable via its own shuffle. Rendered inside the dedicated
 * AppearanceDialog, persisted via {@link useThemeStore}. The GLOBAL shuffle lives
 * in the dialog header. When `platformConfig.themeLock` is set the controls are hidden.
 */
export function AppearancePanel() {
  const { t: tCommon } = useTranslation(LOCALE_NS);
  const { t: tAppearance } = useTranslation(APPEARANCE_NS);
  const { t } = useTranslation(ERRORS_NS);
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const preset = useThemeStore((s) => s.preset);
  const setPreset = useThemeStore((s) => s.setPreset);
  const customTheme = useThemeStore((s) => s.customTheme);
  const baseId = useThemeStore((s) => s.baseId);
  const menu = useThemeStore((s) => s.menu);
  const iconWeight = useThemeStore((s) => s.iconWeight);
  const iconColor = useThemeStore((s) => s.iconColor);
  const iconLibrary = useThemeStore((s) => s.iconLibrary);
  const updateLook = useThemeStore((s) => s.updateLook);
  const setBaseColor = useThemeStore((s) => s.setBaseColor);
  const setMenu = useThemeStore((s) => s.setMenu);
  const setIconWeight = useThemeStore((s) => s.setIconWeight);
  const setIconColor = useThemeStore((s) => s.setIconColor);
  const setIconLibrary = useThemeStore((s) => s.setIconLibrary);
  const toastVariant = useThemeStore((s) => s.toastVariant);
  const setToastVariant = useThemeStore((s) => s.setToastVariant);
  const toastPosition = useThemeStore((s) => s.toastPosition);
  const setToastPosition = useThemeStore((s) => s.setToastPosition);
  const layoutWidth = useThemeStore((s) => s.layoutWidth);
  const setLayoutWidth = useThemeStore((s) => s.setLayoutWidth);
  const dashboardVariant = useThemeStore((s) => s.dashboardVariant);
  const setDashboardVariant = useThemeStore((s) => s.setDashboardVariant);
  const seed = useThemeStore((s) => s.seed);
  const applyThemeSeed = useThemeStore((s) => s.applyThemeSeed);
  const [seedInput, setSeedInput] = useState('');

  // Per-section shuffle — re-roll just one card's axes. (The global Shuffle in the
  // dialog header rolls everything, incl. the orthogonal base/menu/icons.)
  const shuffleColour = () => updateLook(rollColour());
  const shuffleTypography = () => updateLook(rollTypography());
  const shuffleSurface = () => updateLook(rollSurface());
  const shuffleDashboard = () =>
    setDashboardVariant(nextDashboardVariant(dashboardVariant));
  const shuffleNotifications = () => {
    const next = nextToastVariant(toastVariant);
    setToastVariant(next);
    const name = TOAST_VARIANTS[next] ?? 'tint';
    notify.success(
      i18n.t(ERRORS_KEYS.frontend.account.notificationStylePreview, { ns: ERRORS_NS }),
      {
        description: i18n.t(
          ERRORS_KEYS.frontend.account.notificationStylePreviewDescription,
          {
            ns: ERRORS_NS,
            variant: `${name.charAt(0).toUpperCase() + name.slice(1)}`,
          },
        ),
      },
    );
  };

  // Copy a shareable link that reproduces the current look (?theme=<seed>).
  const handleCopyLink = () => {
    if (seed == null) return;
    const url = `${window.location.origin}?theme=${seed}`;
    navigator.clipboard?.writeText(url).catch(() => undefined);
    notify.success(
      i18n.t(ERRORS_KEYS.frontend.account.themeLinkCopied, { ns: ERRORS_NS }),
      { description: url },
    );
  };

  // Apply a pasted theme code (seed) — reproduces that exact look.
  const handleApplySeed = () => {
    const trimmed = seedInput.trim();
    const value = Number(trimmed);
    if (trimmed === '' || !Number.isFinite(value)) {
      notify.error(
        i18n.t(ERRORS_KEYS.frontend.account.themeCodeNumeric, { ns: ERRORS_NS }),
      );
      return;
    }
    applyThemeSeed(value >>> 0);
    setSeedInput('');
  };

  if (platformConfig.themeLock) {
    return (
      <div className="flex flex-col gap-4" data-testid="appearance-panel">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {tAppearance(APPEARANCE_KEYS.themeTitle)}
            </CardTitle>
            <CardDescription data-testid="theme-locked">
              {tAppearance(APPEARANCE_KEYS.themeLocked)}
            </CardDescription>
          </CardHeader>
        </Card>
        <LanguagePrefsCard />
        <DateTimePrefsCard />
        <MoneyPrefsCard />
      </div>
    );
  }

  const { accentId, chartId, bodyFontId, headingFontId, radiusId, customLook } =
    lookFields(customTheme);
  // Fully-defaulted look → current value for every per-axis picker below.
  const look = normalizeLook(customTheme);
  const accentChroma = ACCENT_INTENSITIES[look.intensityId]?.chroma ?? 0.16;
  const accentHex = oklchToHex(0.58, accentChroma, look.hue);
  const chartHex = oklchToHex(0.64, 0.17, look.chartHue);

  return (
    <div className="flex flex-col gap-4" data-testid="appearance-panel">
      <LanguagePrefsCard />
      <DateTimePrefsCard />
      <MoneyPrefsCard />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {tAppearance(APPEARANCE_KEYS.themeTitle)}
          </CardTitle>
          <CardDescription>
            {tAppearance(APPEARANCE_KEYS.themeDescription)}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Choices
            ariaLabel={tAppearance(APPEARANCE_KEYS.presetAria)}
            value={preset === GENERATED_PRESET ? '__none__' : preset}
            options={THEME_PRESETS}
            onPick={setPreset}
            testPrefix="named-preset"
          />
          <Separator />
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCopyLink}
                disabled={seed == null}
                data-testid="theme-copy-link"
              >
                {tAppearance(APPEARANCE_KEYS.copyLink)}
              </Button>
              {seed == null ? (
                <span className="text-muted-foreground text-sm">
                  {tAppearance(APPEARANCE_KEYS.shuffleHint)}
                </span>
              ) : (
                <span className="text-muted-foreground text-sm" data-testid="theme-seed">
                  {tAppearance(APPEARANCE_KEYS.codeLabel, { seed })}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                inputMode="numeric"
                value={seedInput}
                onChange={(e) => setSeedInput(e.target.value)}
                placeholder={tAppearance(APPEARANCE_KEYS.codePlaceholder)}
                aria-label={tCommon(LOCALE_KEYS.themeCode)}
                data-testid="theme-seed-input"
                className="w-44"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleApplySeed}
                data-testid="theme-seed-apply"
              >
                {tAppearance(APPEARANCE_KEYS.apply)}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {tAppearance(APPEARANCE_KEYS.modeTitle)}
          </CardTitle>
          <CardDescription>
            {tAppearance(APPEARANCE_KEYS.modeDescription)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className="grid gap-3 sm:grid-cols-3"
            role="radiogroup"
            aria-label={tCommon(LOCALE_KEYS.mode)}
          >
            {THEMES.map((t) => {
              const active = theme === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  data-slot="button"
                  aria-checked={active}
                  onClick={() => setTheme(t.id)}
                  data-testid={`theme-${t.id}`}
                  className={cn(
                    appearanceModeCardClassName,
                    active ? appearanceTileActiveClassName : appearanceTileIdleClassName,
                  )}
                >
                  <div className="flex w-full items-center justify-between">
                    <t.icon className="text-muted-foreground size-5" aria-hidden />
                    {active && <Check className="text-primary size-4" aria-hidden />}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{t.label}</p>
                    <p className="text-muted-foreground text-xs">{t.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {tAppearance(APPEARANCE_KEYS.colourTitle)}
          </CardTitle>
          <CardDescription>
            {tAppearance(APPEARANCE_KEYS.colourDescription)}
          </CardDescription>
          <CardAction>
            <SectionShuffle
              onClick={shuffleColour}
              label={tAppearance(APPEARANCE_KEYS.sectionColour)}
              testId="shuffle-colour"
            />
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <FieldLabel>{tAppearance(APPEARANCE_KEYS.accentColour)}</FieldLabel>
            <ColourField
              ariaLabel={tAppearance(APPEARANCE_KEYS.accentColour)}
              selectedId={accentId}
              currentHex={accentHex}
              onPickHue={(hue) => updateLook({ hue })}
              testPrefix="accent"
            />
          </div>
          <div className="space-y-2">
            <FieldLabel>{tAppearance(APPEARANCE_KEYS.chartColour)}</FieldLabel>
            <ColourField
              ariaLabel={tAppearance(APPEARANCE_KEYS.chartColour)}
              selectedId={chartId}
              currentHex={chartHex}
              onPickHue={(hue) => updateLook({ chartHue: hue })}
              testPrefix="chart"
            />
          </div>
          <div className="space-y-2">
            <FieldLabel>{tAppearance(APPEARANCE_KEYS.baseColour)}</FieldLabel>
            <Choices
              ariaLabel={tAppearance(APPEARANCE_KEYS.baseColour)}
              value={baseId}
              options={BASE_COLORS}
              onPick={setBaseColor}
              testPrefix="base"
            />
          </div>
          <div className="space-y-2">
            <FieldLabel>{tAppearance(APPEARANCE_KEYS.harmony)}</FieldLabel>
            <Choices
              ariaLabel={tAppearance(APPEARANCE_KEYS.harmonyAria)}
              value={look.harmonyId}
              options={HARMONY_OPTIONS}
              onPick={(value) => updateLook({ harmonyId: value })}
              testPrefix="harmony"
            />
          </div>
          <div className="space-y-2">
            <FieldLabel>{tAppearance(APPEARANCE_KEYS.accentIntensity)}</FieldLabel>
            <Choices
              ariaLabel={tAppearance(APPEARANCE_KEYS.accentIntensity)}
              value={look.intensityId}
              options={INTENSITY_OPTIONS}
              onPick={(value) => updateLook({ intensityId: value })}
              testPrefix="intensity"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {tAppearance(APPEARANCE_KEYS.typeTitle)}
          </CardTitle>
          <CardDescription>
            {tAppearance(APPEARANCE_KEYS.typeDescription)}
          </CardDescription>
          <CardAction>
            <SectionShuffle
              onClick={shuffleTypography}
              label={tAppearance(APPEARANCE_KEYS.sectionType)}
              testId="shuffle-type"
            />
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <FontSelect
              id="font-body"
              label={tAppearance(APPEARANCE_KEYS.bodyFont)}
              value={bodyFontId}
              onChange={(value) => updateLook({ bodyFontId: value })}
            />
            <FontSelect
              id="font-heading"
              label={tAppearance(APPEARANCE_KEYS.headingFont)}
              value={headingFontId}
              onChange={(value) => updateLook({ headingFontId: value })}
            />
          </div>
          <div className="space-y-2">
            <FieldLabel>{tAppearance(APPEARANCE_KEYS.radius)}</FieldLabel>
            <Choices
              ariaLabel={tAppearance(APPEARANCE_KEYS.radius)}
              value={radiusId}
              options={RADIUS_OPTIONS}
              onPick={(value) => updateLook({ radiusId: value })}
              testPrefix="radius"
            />
          </div>
          <div className="space-y-2">
            <FieldLabel>{tAppearance(APPEARANCE_KEYS.shapeLanguage)}</FieldLabel>
            <Choices
              ariaLabel={tAppearance(APPEARANCE_KEYS.shapeLanguage)}
              value={look.shapeId}
              options={SHAPE_LANGUAGES}
              onPick={(value) => updateLook({ shapeId: value })}
              testPrefix="shape"
            />
          </div>
          <div className="space-y-2">
            <FieldLabel>{tAppearance(APPEARANCE_KEYS.typeScale)}</FieldLabel>
            <Choices
              ariaLabel={tAppearance(APPEARANCE_KEYS.typeScale)}
              value={look.typeScaleId}
              options={TYPE_SCALE_OPTIONS}
              onPick={(value) => updateLook({ typeScaleId: value })}
              testPrefix="typescale"
            />
          </div>
          <div className="space-y-2">
            <FieldLabel>{tAppearance(APPEARANCE_KEYS.menu)}</FieldLabel>
            <Choices
              ariaLabel={tAppearance(APPEARANCE_KEYS.menuAria)}
              value={menu}
              options={MENU_STYLES}
              onPick={setMenu}
              testPrefix="menu"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {tAppearance(APPEARANCE_KEYS.iconsTitle)}
          </CardTitle>
          <CardDescription>
            {tAppearance(APPEARANCE_KEYS.iconsDescription)}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className={appearancePreviewWellClassName} aria-hidden>
            <Sparkles className="size-6" data-testid="icon-preview-star" />
            <Sun className="size-6" data-testid="icon-preview-sun" />
            <Moon className="size-6" data-testid="icon-preview-moon" />
          </div>
          <div className="space-y-2">
            <FieldLabel>{tAppearance(APPEARANCE_KEYS.iconWeight)}</FieldLabel>
            <Choices
              ariaLabel={tAppearance(APPEARANCE_KEYS.iconWeight)}
              value={iconWeight}
              options={ICON_WEIGHTS}
              onPick={setIconWeight}
              testPrefix="icon"
            />
          </div>
          <div className="space-y-2">
            <FieldLabel>{tAppearance(APPEARANCE_KEYS.iconColour)}</FieldLabel>
            <Choices
              ariaLabel={tAppearance(APPEARANCE_KEYS.iconColour)}
              value={iconColor}
              options={ICON_COLORS}
              onPick={setIconColor}
              testPrefix="iconcolor"
            />
          </div>
          <div className="space-y-2">
            <FieldLabel>{tAppearance(APPEARANCE_KEYS.iconLibrary)}</FieldLabel>
            <Choices
              ariaLabel={tAppearance(APPEARANCE_KEYS.iconLibrary)}
              value={iconLibrary}
              options={ICON_LIBRARIES}
              onPick={setIconLibrary}
              testPrefix="iconlib"
            />
          </div>
        </CardContent>
      </Card>

      {platformConfig.layoutWidthForced === null ? (
        <Card data-testid="layout-width-card">
          <CardHeader>
            <CardTitle className="text-base">
              {tAppearance(APPEARANCE_KEYS.layoutTitle)}
            </CardTitle>
            <CardDescription>
              {tAppearance(APPEARANCE_KEYS.layoutDescription)}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <FieldLabel>{tAppearance(APPEARANCE_KEYS.contentWidth)}</FieldLabel>
            <Choices
              ariaLabel={tAppearance(APPEARANCE_KEYS.contentWidth)}
              value={layoutWidth}
              options={LAYOUT_WIDTHS.map(({ id, label }) => ({ id, label }))}
              onPick={(value) => setLayoutWidth(value as typeof layoutWidth)}
              testPrefix="layout-width"
            />
            <p className="text-muted-foreground text-xs leading-relaxed">
              {LAYOUT_WIDTHS.find((option) => option.id === layoutWidth)?.description}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card data-testid="dashboard-variant-card">
        <CardHeader>
          <CardTitle className="text-base">
            {tAppearance(APPEARANCE_KEYS.dashboardTitle)}
          </CardTitle>
          <CardDescription>
            {tAppearance(APPEARANCE_KEYS.dashboardDescription)}
          </CardDescription>
          <CardAction>
            <SectionShuffle
              onClick={shuffleDashboard}
              label={tAppearance(APPEARANCE_KEYS.sectionDashboard)}
              testId="shuffle-dashboard"
            />
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-2">
          <FieldLabel>{tAppearance(APPEARANCE_KEYS.dashboardArrangement)}</FieldLabel>
          <Choices
            ariaLabel={tAppearance(APPEARANCE_KEYS.dashboardArrangement)}
            value={
              (
                DASHBOARD_VARIANTS_CATALOG[dashboardVariant] ??
                DASHBOARD_VARIANTS_CATALOG[0]
              ).id
            }
            options={DASHBOARD_VARIANTS_CATALOG.map(({ id, label }) => ({ id, label }))}
            onPick={(value) =>
              setDashboardVariant(
                Math.max(
                  0,
                  DASHBOARD_VARIANTS_CATALOG.findIndex((option) => option.id === value),
                ),
              )
            }
            testPrefix="dashboard-variant"
          />
          <p className="text-muted-foreground text-xs leading-relaxed">
            {
              (
                DASHBOARD_VARIANTS_CATALOG[dashboardVariant] ??
                DASHBOARD_VARIANTS_CATALOG[0]
              ).description
            }
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {tAppearance(APPEARANCE_KEYS.surfaceTitle)}
          </CardTitle>
          <CardDescription>
            {tAppearance(APPEARANCE_KEYS.surfaceDescription)}
          </CardDescription>
          <CardAction>
            <SectionShuffle
              onClick={shuffleSurface}
              label={tAppearance(APPEARANCE_KEYS.sectionSurface)}
              testId="shuffle-surface"
            />
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <FieldLabel>{tAppearance(APPEARANCE_KEYS.density)}</FieldLabel>
            <Choices
              ariaLabel={tAppearance(APPEARANCE_KEYS.density)}
              value={look.densityId}
              options={DENSITY_OPTIONS}
              onPick={(value) => updateLook({ densityId: value })}
              testPrefix="density"
            />
          </div>
          <div className="space-y-2">
            <FieldLabel>{tAppearance(APPEARANCE_KEYS.contrast)}</FieldLabel>
            <Choices
              ariaLabel={tAppearance(APPEARANCE_KEYS.contrast)}
              value={look.contrastId}
              options={CONTRAST_MODES}
              onPick={(value) => updateLook({ contrastId: value })}
              testPrefix="contrast"
            />
          </div>
          <div className="space-y-2">
            <FieldLabel>{tAppearance(APPEARANCE_KEYS.elevation)}</FieldLabel>
            <Choices
              ariaLabel={tAppearance(APPEARANCE_KEYS.elevation)}
              value={look.elevationId}
              options={ELEVATION_LEVELS}
              onPick={(value) => updateLook({ elevationId: value })}
              testPrefix="elevation"
            />
          </div>
          <div className="space-y-2">
            <FieldLabel>{tAppearance(APPEARANCE_KEYS.separation)}</FieldLabel>
            <Choices
              ariaLabel={tAppearance(APPEARANCE_KEYS.separationAria)}
              value={look.separationId}
              options={SEPARATION_STRATEGIES}
              onPick={(value) => updateLook({ separationId: value })}
              testPrefix="separation"
            />
          </div>
          <div className="space-y-2">
            <FieldLabel>{tAppearance(APPEARANCE_KEYS.motion)}</FieldLabel>
            <Choices
              ariaLabel={tAppearance(APPEARANCE_KEYS.motion)}
              value={look.motionId}
              options={MOTION_OPTIONS}
              onPick={(value) => updateLook({ motionId: value })}
              testPrefix="motion"
            />
          </div>
          <div className="space-y-2">
            <FieldLabel>{tAppearance(APPEARANCE_KEYS.focusRing)}</FieldLabel>
            <Choices
              ariaLabel={tAppearance(APPEARANCE_KEYS.focusRing)}
              value={look.focusId}
              options={FOCUS_RINGS}
              onPick={(value) => updateLook({ focusId: value })}
              testPrefix="focus"
            />
          </div>
        </CardContent>
      </Card>

      <Card data-testid="toast-preview-card">
        <CardHeader>
          <CardTitle className="text-base">
            {tAppearance(APPEARANCE_KEYS.notificationsTitle)}
          </CardTitle>
          <CardDescription>
            {tAppearance(APPEARANCE_KEYS.notificationsDescription)}
          </CardDescription>
          <CardAction>
            <SectionShuffle
              onClick={shuffleNotifications}
              label={tAppearance(APPEARANCE_KEYS.sectionNotifications)}
              testId="shuffle-notifications"
            />
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <FieldLabel>{tAppearance(APPEARANCE_KEYS.toastDesign)}</FieldLabel>
            <ToastVariantSwatches activeIndex={toastVariant} onPick={setToastVariant} />
            <Choices
              ariaLabel={tAppearance(APPEARANCE_KEYS.toastDesign)}
              value={TOAST_VARIANTS[toastVariant] ?? TOAST_VARIANTS[0]}
              options={TOAST_VARIANT_OPTIONS}
              onPick={(id) => setToastVariant(TOAST_VARIANTS.indexOf(id as ToastVariant))}
              testPrefix="toast"
            />
          </div>
          <div className="space-y-2">
            <FieldLabel>{tAppearance(APPEARANCE_KEYS.position)}</FieldLabel>
            <Choices
              ariaLabel={tAppearance(APPEARANCE_KEYS.positionAria)}
              value={toastPosition as ToastPosition}
              options={TOAST_POSITION_OPTIONS}
              onPick={setToastPosition}
              testPrefix="toastpos"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                notify.success(t(ERRORS_KEYS.toast.preview.successTitle), {
                  description: t(ERRORS_KEYS.toast.preview.successDescription),
                })
              }
              data-testid="toast-preview-success"
            >
              {tAppearance(APPEARANCE_KEYS.previewSuccess)}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                notify.error(t(ERRORS_KEYS.toast.preview.errorTitle), {
                  description: t(ERRORS_KEYS.toast.preview.errorDescription),
                })
              }
              data-testid="toast-preview-error"
            >
              {tAppearance(APPEARANCE_KEYS.previewError)}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                notify.warning(t(ERRORS_KEYS.toast.preview.warningTitle), {
                  description: t(ERRORS_KEYS.toast.preview.warningDescription),
                })
              }
              data-testid="toast-preview-warning"
            >
              {tAppearance(APPEARANCE_KEYS.previewWarning)}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                notify.info(t(ERRORS_KEYS.toast.preview.infoTitle), {
                  description: t(ERRORS_KEYS.toast.preview.infoDescription),
                })
              }
              data-testid="toast-preview-info"
            >
              {tAppearance(APPEARANCE_KEYS.previewInfo)}
            </Button>
          </div>
        </CardContent>
      </Card>

      {preset === GENERATED_PRESET ? (
        <div
          className="text-muted-foreground mt-2 inline-flex items-center gap-1.5 text-sm"
          data-testid="preset-custom"
        >
          <Check className="text-primary size-4" aria-hidden />
          {customLook
            ? tAppearance(APPEARANCE_KEYS.customWith, { look: customLook })
            : tAppearance(APPEARANCE_KEYS.custom)}
        </div>
      ) : null}
    </div>
  );
}
