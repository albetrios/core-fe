import { Outlet } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { ThemeModeToggle } from '@/shared/components/ThemeModeToggle/index.ts';
import { LAYOUT_KEYS, LAYOUT_NS } from '@/shared/layouts/layout.constants.ts';

export function PublicSkipLink() {
  const { t } = useTranslation(LAYOUT_NS);
  return (
    <a
      href="#public-main-content"
      className="focus:bg-background focus:text-foreground sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-4 focus:underline"
    >
      {t(LAYOUT_KEYS.a11y.skipToMain)}
    </a>
  );
}

export function PublicThemeToggle() {
  return (
    <div className="absolute end-4 top-4 sm:end-6 sm:top-6">
      <ThemeModeToggle />
    </div>
  );
}

export type PublicLayoutShellProps = {
  /** Optional wrapper around the routed outlet content. */
  contentClassName?: string;
  /** Extra chrome above the outlet (e.g. brand tagline). */
  header?: ReactNode;
};

export function PublicMain({ contentClassName, header }: PublicLayoutShellProps) {
  return (
    <main id="public-main-content" className={contentClassName ?? 'w-full max-w-md'}>
      {header}
      <Outlet />
    </main>
  );
}
