import { useTranslation } from 'react-i18next';

import { iconOnBrandSurface } from '@/lib/icon-surface.ts';
import { cn } from '@/lib/utils.ts';
import {
  AUTH_MARKETING_FEATURES,
  AuthControls,
  AuthForm,
  AuthHeroBadge,
  type AuthLayoutShellProps,
  AuthMarketingStats,
  BrandMark,
  MobileBrandMark,
  SkipLink,
} from '@/shared/layouts/AuthLayout/AuthLayout.shared.tsx';
import { LAYOUT_KEYS, LAYOUT_NS } from '@/shared/layouts/layout.constants.ts';

/** Variant 0 — split brand panel + form (default). */
export function SplitAuth({ children }: AuthLayoutShellProps) {
  const { t } = useTranslation(LAYOUT_NS);

  return (
    <div className="flex min-h-screen" data-testid="auth-layout">
      <SkipLink />

      <div className="bg-brand text-brand-foreground relative hidden w-1/2 flex-col overflow-hidden lg:flex xl:w-[55%]">
        <div
          className="from-primary/25 via-primary/5 to-primary/15 absolute inset-0 bg-gradient-to-br"
          aria-hidden="true"
        />
        <svg
          className="text-primary/[0.12] absolute inset-0 h-full w-full"
          aria-hidden="true"
        >
          <defs>
            <pattern id="auth-dots" width="22" height="22" patternUnits="userSpaceOnUse">
              <circle cx="1.5" cy="1.5" r="1.5" fill="currentColor" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#auth-dots)" />
        </svg>
        <div className="bg-primary/30 absolute -start-24 -top-24 h-80 w-80 rounded-full blur-3xl" />
        <div className="bg-primary/20 absolute end-[-10%] bottom-[-15%] h-96 w-96 rounded-full blur-3xl" />
        <div
          className="via-primary/40 absolute inset-y-0 end-0 w-px bg-gradient-to-b from-transparent to-transparent"
          aria-hidden="true"
        />

        {/* `3xl:` / `4xl:` — the big-monitor tier (index.css). Without it the
            hero stayed a 28rem column pinned to the corner of a 1400px panel. */}
        <div className="3xl:p-20 4xl:p-28 relative z-10 flex flex-1 flex-col justify-between p-10 xl:p-14">
          <div className="flex items-center justify-between">
            <BrandMark />
            <span
              data-slot="pill"
              className="border-brand-foreground/15 bg-brand-foreground/5 text-brand-foreground/70 flex items-center gap-2 rounded-full border px-3 py-1 text-xs"
            >
              <span className="relative flex h-2 w-2">
                <span className="bg-success absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" />
                <span className="bg-success relative inline-flex h-2 w-2 rounded-full" />
              </span>
              <span>{t(LAYOUT_KEYS.auth.statusOperational)}</span>
            </span>
          </div>

          <div className="3xl:max-w-xl 4xl:max-w-2xl 3xl:space-y-12 max-w-md space-y-10">
            <div className="space-y-4">
              <AuthHeroBadge />
              <h1 className="3xl:text-6xl 4xl:text-7xl text-4xl leading-[1.1] font-semibold tracking-tight text-balance xl:text-5xl">
                {t(LAYOUT_KEYS.auth.heroTitle)}
              </h1>
              <p className="text-brand-foreground/60 3xl:text-lg 4xl:text-xl">
                {t(LAYOUT_KEYS.auth.heroSubtitle)}
              </p>
            </div>

            <ul className="space-y-4">
              {AUTH_MARKETING_FEATURES.map(({ Icon, title, body }) => (
                <li key={title} className="flex items-start gap-3">
                  <span className="border-brand-foreground/20 bg-brand-foreground/10 text-brand-foreground ring-brand-foreground/20 mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md ring-1">
                    <Icon className={cn('h-4 w-4', iconOnBrandSurface)} />
                  </span>
                  <div>
                    <p className="3xl:text-base text-sm font-medium">{t(title)}</p>
                    <p className="text-brand-foreground/55 3xl:text-base text-sm">
                      {t(body)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <AuthMarketingStats />
        </div>
      </div>

      <div className="bg-background flex w-full flex-col lg:w-1/2 xl:w-[45%]">
        <div className="flex items-center justify-between p-5 sm:p-6 lg:justify-end">
          <MobileBrandMark />
          <AuthControls />
        </div>

        <main
          id="main-content"
          className="flex flex-1 items-center justify-center px-5 pb-12 sm:px-6"
        >
          <div className="3xl:max-w-[480px] w-full max-w-[420px]">
            <AuthForm>{children}</AuthForm>
          </div>
        </main>
      </div>
    </div>
  );
}
