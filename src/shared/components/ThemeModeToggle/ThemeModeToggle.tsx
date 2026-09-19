import { useTranslation } from 'react-i18next';

import { platformConfig } from '@/core/config/env.ts';
import { LOCALE_KEYS, LOCALE_NS } from '@/lib/i18n/locale.constants.ts';
import { iconOnBrandSurface, iconOnSidebarSurface } from '@/lib/icon-surface.ts';
import { cn } from '@/lib/utils.ts';
import { Button } from '@/shared/components/ui/button.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu.tsx';
import { Monitor, Moon, Sparkles, Sun } from '@/shared/icons/index.ts';
import { LAYOUT_KEYS, LAYOUT_NS } from '@/shared/layouts/layout.constants.ts';
import { useThemeStore } from '@/shared/store/useThemeStore/index.ts';

/**
 * Light / Dark / System mode toggle (shadcn-style ModeToggle). The trigger icon
 * reflects the active mode. Shared so it appears in the app header AND the
 * auth/public layouts — the theme is switchable everywhere, including before
 * sign-in. Accent presets live in Settings → Account → Appearance.
 *
 * TEMP (testing): the menu also exposes a quick "Shuffle theme" item so the
 * random-accent generator can be exercised without opening Settings. It mirrors
 * the Appearance panel's shuffle and is hidden when the theme is locked. Remove
 * the shuffle item once testing is done — the canonical home is the panel.
 */
export function ThemeModeToggle({
  surface = 'default',
  menuSide,
  menuAlign = 'end',
}: {
  /** Tinted shell the trigger sits on — adjusts icon/button contrast. */
  surface?: 'default' | 'brand' | 'sidebar';
  /** Menu placement — `right` keeps the panel inside the viewport on a narrow rail. */
  menuSide?: 'top' | 'right' | 'bottom' | 'left';
  menuAlign?: 'start' | 'center' | 'end';
}) {
  const { t: tLocale } = useTranslation(LOCALE_NS);
  const { t } = useTranslation(LAYOUT_NS);
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const shuffleTheme = useThemeStore((s) => s.shuffleTheme);

  let ThemeIcon = Monitor;
  if (theme === 'dark') ThemeIcon = Moon;
  else if (theme === 'light') ThemeIcon = Sun;

  let surfaceTriggerClass: string | undefined;
  if (surface === 'brand') {
    surfaceTriggerClass =
      'text-brand-foreground/80 hover:bg-brand-foreground/10 hover:text-brand-foreground';
  } else if (surface === 'sidebar') {
    surfaceTriggerClass =
      'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground';
  }

  let surfaceIconClass: string | undefined;
  if (surface === 'brand') {
    surfaceIconClass = iconOnBrandSurface;
  } else if (surface === 'sidebar') {
    surfaceIconClass = iconOnSidebarSurface;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={surfaceTriggerClass}
          aria-label={tLocale(LOCALE_KEYS.toggleTheme)}
          data-testid="theme-toggle"
        >
          <ThemeIcon className={cn('h-4 w-4', surfaceIconClass)} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={menuAlign} side={menuSide}>
        <DropdownMenuItem onClick={() => setTheme('light')} data-testid="theme-light">
          <Sun className="me-2 h-4 w-4" /> {t(LAYOUT_KEYS.app.theme.light)}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('dark')} data-testid="theme-dark">
          <Moon className="me-2 h-4 w-4" /> {t(LAYOUT_KEYS.app.theme.dark)}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('system')} data-testid="theme-system">
          <Monitor className="me-2 h-4 w-4" /> {t(LAYOUT_KEYS.app.theme.system)}
        </DropdownMenuItem>
        {/* DEV-only testing shortcut — canonical shuffle lives in Settings → Appearance. */}
        {platformConfig.devtools && !platformConfig.themeLock ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={shuffleTheme} data-testid="theme-shuffle-menu">
              <Sparkles className="me-2 h-4 w-4" /> {t(LAYOUT_KEYS.app.theme.shuffle)}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
