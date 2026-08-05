import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils.ts';
import { preloadCommandPalette } from '@/shared/components/CommandPalette/index.ts';
import { settingsHash } from '@/shared/components/SettingsModal/settings-hash-grammar.ts';
import type { SettingsSection } from '@/shared/components/SettingsModal/settings-sections.ts';
import { Button } from '@/shared/components/ui/button.tsx';
import { useDeploymentMode } from '@/shared/hooks/useDeploymentFlags/index.ts';
import {
  CreditCard,
  MonitorSmartphone,
  Palette,
  Search,
  Shield,
  User,
} from '@/shared/icons/index.ts';
import { LAYOUT_KEYS, LAYOUT_NS } from '@/shared/layouts/layout.constants.ts';
import { useUIStore } from '@/shared/store/useUIStore/index.ts';

type StripItem = {
  id: string;
  labelKey: string;
  icon: typeof User;
  onClick: () => void;
  testId: string;
};

const pillClassName =
  'text-muted-foreground hover:text-foreground hover:bg-muted/60 h-8 shrink-0 gap-1.5 rounded-full px-3 text-xs font-medium';

/**
 * Horizontal launcher under the header — replaces sidebar shortcuts with
 * always-visible account destinations (Focus shell).
 */
export function AppContextStrip({ className }: { className?: string }) {
  const { t } = useTranslation(LAYOUT_NS);
  const navigate = useNavigate();
  const personalOnly = useDeploymentMode() === 'personal-only';
  const openPalette = () => useUIStore.getState().setCommandPaletteOpen(true);
  const openShortcuts = () => useUIStore.getState().setShortcutsOpen(true);

  const goSettings = (scope: 'account', section: SettingsSection) => {
    void navigate({ to: '.', hash: settingsHash(scope, section) });
  };

  const items: StripItem[] = [
    {
      id: 'search',
      labelKey: LAYOUT_KEYS.app.search,
      icon: Search,
      onClick: openPalette,
      testId: 'context-strip-search',
    },
    {
      id: 'profile',
      labelKey: LAYOUT_KEYS.app.contextStrip.profile,
      icon: User,
      onClick: () => goSettings('account', 'profile'),
      testId: 'context-strip-profile',
    },
    {
      id: 'security',
      labelKey: LAYOUT_KEYS.app.contextStrip.security,
      icon: Shield,
      onClick: () => goSettings('account', 'security'),
      testId: 'context-strip-security',
    },
    {
      id: 'billing',
      labelKey: LAYOUT_KEYS.app.contextStrip.billing,
      icon: CreditCard,
      onClick: () => goSettings('account', 'billing'),
      testId: 'context-strip-billing',
    },
    {
      id: 'appearance',
      labelKey: LAYOUT_KEYS.app.contextStrip.appearance,
      icon: Palette,
      onClick: () => useUIStore.getState().setAppearanceOpen(true),
      testId: 'context-strip-appearance',
    },
    {
      id: 'shortcuts',
      labelKey: LAYOUT_KEYS.app.contextStrip.shortcuts,
      icon: MonitorSmartphone,
      onClick: openShortcuts,
      testId: 'context-strip-shortcuts',
    },
  ];

  return (
    <div
      data-testid="app-context-strip"
      className={cn(
        'border-border/60 bg-muted/30 flex items-center gap-1 overflow-x-auto border-t px-3 py-2 sm:px-6',
        className,
      )}
    >
      <p className="text-muted-foreground me-1 hidden shrink-0 text-[11px] font-medium tracking-wide uppercase sm:block">
        {personalOnly
          ? t(LAYOUT_KEYS.app.contextStrip.labelSolo)
          : t(LAYOUT_KEYS.app.contextStrip.label)}
      </p>
      {items.map((item) => (
        <Button
          key={item.id}
          type="button"
          variant="ghost"
          size="sm"
          className={pillClassName}
          data-testid={item.testId}
          onClick={item.onClick}
          onMouseEnter={item.id === 'search' ? preloadCommandPalette : undefined}
          onFocus={item.id === 'search' ? preloadCommandPalette : undefined}
        >
          <item.icon className="size-3.5 shrink-0" aria-hidden="true" />
          {t(item.labelKey)}
        </Button>
      ))}
    </div>
  );
}
