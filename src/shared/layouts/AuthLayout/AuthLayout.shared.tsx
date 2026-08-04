import { Link, useLocation } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { isMultiLocaleBuild } from '@/lib/i18n/build-runtime.ts';
import {
  LOCALE_KEYS,
  LOCALE_LABEL_KEYS,
  LOCALE_NS,
} from '@/lib/i18n/locale.constants.ts';
import {
  I18N_LOCALES,
  type I18nLocale,
  isI18nLocale,
  LOCALE_NATIVE_LABELS,
} from '@/lib/i18n/locales.ts';
import { iconOnBrandSurface, iconOnPrimarySurface } from '@/lib/icon-surface.ts';
import { cn } from '@/lib/utils.ts';
import { ThemeModeToggle } from '@/shared/components/ThemeModeToggle/index.ts';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select.tsx';
import { Boxes, ShieldCheck, Sparkles, Users, Zap } from '@/shared/icons/index.ts';
import {
  AUTH_LAYOUT_STAT_KEYS,
  LAYOUT_KEYS,
  LAYOUT_NS,
} from '@/shared/layouts/layout.constants.ts';
import { useLocaleStore } from '@/shared/store/useLocaleStore/index.ts';

// eslint-disable-next-line react-refresh/only-export-components -- static config colocated with the layout shell
export const AUTH_MARKETING_FEATURES = [
  { ...LAYOUT_KEYS.auth.features.multiOrg, Icon: Users },
  { ...LAYOUT_KEYS.auth.features.secure, Icon: ShieldCheck },
  { ...LAYOUT_KEYS.auth.features.fast, Icon: Zap },
] as const;

export type AuthLayoutShellProps = {
  children: ReactNode;
};

export function SkipLink() {
  const { t } = useTranslation(LAYOUT_NS);
  return (
    <a
      href="#main-content"
      className="focus:bg-background focus:text-foreground sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-4 focus:underline"
    >
      {t(LAYOUT_KEYS.a11y.skipToMain)}
    </a>
  );
}

/** Compact language switcher — sets UI locale (and auto RTL for Arabic) on auth. */
function AuthLocaleSelect() {
  const { t } = useTranslation(LOCALE_NS);
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);

  if (!isMultiLocaleBuild()) return null;

  return (
    <Select
      value={locale}
      onValueChange={(value) => {
        if (isI18nLocale(value)) void setLocale(value as I18nLocale);
      }}
    >
      <SelectTrigger
        size="sm"
        className="min-w-[9.5rem]"
        aria-label={t(LOCALE_KEYS.openAria)}
        data-testid="auth-locale-select"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {I18N_LOCALES.map((code) => (
          <SelectItem key={code} value={code}>
            {/* eslint-disable-next-line security/detect-object-injection -- fixed locale catalog */}
            {t(LOCALE_LABEL_KEYS[code], { defaultValue: LOCALE_NATIVE_LABELS[code] })}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Theme + language controls for auth shell variants (single auth screen). */
export function AuthControls({ surface = 'default' }: { surface?: 'default' | 'brand' }) {
  // Subscribe to the layout namespace so the control re-renders on locale change.
  useTranslation(LAYOUT_NS);
  return (
    <div className="flex items-center gap-3">
      <AuthLocaleSelect />
      <ThemeModeToggle surface={surface === 'brand' ? 'brand' : 'default'} />
    </div>
  );
}

export function BrandMark({ className }: { className?: string }) {
  const { t } = useTranslation(LAYOUT_NS);
  return (
    <Link to="/login" className={cn('flex items-center gap-2.5', className)}>
      <div
        data-slot="icon-chip"
        className="bg-primary text-primary-foreground flex size-9 items-center justify-center"
      >
        <Boxes className={cn('h-5 w-5', iconOnPrimarySurface)} />
      </div>
      <span className="text-lg font-semibold tracking-tight">
        {t(LAYOUT_KEYS.brand.name)}
      </span>
    </Link>
  );
}

/** The animated form slot — owns `auth-form-container`, re-keyed per route. */
export function AuthForm({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <div
      key={pathname}
      className="animate-fade-in-up w-full"
      data-testid="auth-form-container"
    >
      {children}
    </div>
  );
}

export function AuthHeroBadge() {
  const { t } = useTranslation(LAYOUT_NS);
  return (
    <span className="border-brand-foreground/20 bg-brand-foreground/10 text-brand-foreground inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium">
      <Sparkles className={cn('h-3 w-3', iconOnBrandSurface)} aria-hidden="true" />{' '}
      {t(LAYOUT_KEYS.auth.badge)}
    </span>
  );
}

export function MobileBrandMark() {
  const { t } = useTranslation(LAYOUT_NS);
  return (
    <Link
      to="/login"
      className="flex items-center gap-2 lg:hidden"
      data-testid="auth-mobile-logo"
    >
      <div
        data-slot="icon-chip"
        className="bg-primary text-primary-foreground flex size-8 items-center justify-center"
      >
        <Boxes className={cn('h-4 w-4', iconOnPrimarySurface)} />
      </div>
      <span className="text-sm font-semibold">{t(LAYOUT_KEYS.brand.name)}</span>
    </Link>
  );
}

export function AuthMarketingStats() {
  const { t } = useTranslation(LAYOUT_NS);
  return (
    <div className="border-primary/20 flex items-center gap-8 border-t pt-6">
      {AUTH_LAYOUT_STAT_KEYS.map((stat) => (
        <div key={stat.labelKey}>
          <p className="text-xl font-semibold tracking-tight">{stat.value}</p>
          <p className="text-brand-foreground/50 text-xs">{t(stat.labelKey)}</p>
        </div>
      ))}
    </div>
  );
}
