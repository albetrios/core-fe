import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils.ts';
import { Input } from '@/shared/components/ui/input.tsx';
import { Search } from '@/shared/icons/index.ts';

import { SETTINGS_KEYS, SETTINGS_NS } from './settings.constants.ts';
import type { SettingsNavGroup, SettingsSectionRef } from './settings-sections.ts';
import { filterNav } from './settings-sections.ts';

interface SettingsNavProps {
  /** Groups already filtered by context + permission (parent owns gating). */
  groups: readonly SettingsNavGroup[];
  active: SettingsSectionRef;
  onSelect: (next: SettingsSectionRef) => void;
}

/**
 * Left rail of the settings modal — search box + grouped section list.
 * Controlled component: parent owns the active section (sourced from the hash).
 */
export function SettingsNav({ groups, active, onSelect }: SettingsNavProps) {
  const { t } = useTranslation(SETTINGS_NS);
  const [query, setQuery] = useState('');
  const visible = useMemo(
    () => filterNav(groups, query, (key) => t(key)),
    [groups, query, t],
  );

  return (
    <aside
      aria-label={t(SETTINGS_KEYS.nav.ariaSections)}
      data-testid="settings-nav"
      className="bg-muted/30 hidden h-full flex-col border-e sm:flex"
    >
      <div className="p-3">
        <div className="relative">
          <Search
            className="text-muted-foreground absolute start-2.5 top-1/2 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            type="search"
            placeholder={t(SETTINGS_KEYS.nav.searchPlaceholder)}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="bg-background h-9 ps-8"
            aria-label={t(SETTINGS_KEYS.nav.searchAria)}
            data-testid="settings-search"
          />
        </div>
      </div>

      <nav
        className="flex-1 space-y-4 overflow-y-auto px-3 pb-3"
        aria-label={t(SETTINGS_KEYS.nav.ariaSettings)}
      >
        {visible.length === 0 && (
          <p
            className="text-muted-foreground px-2 py-4 text-center text-xs"
            data-testid="settings-nav-empty"
          >
            {t(SETTINGS_KEYS.nav.empty)}
          </p>
        )}
        {visible.map((group) => (
          <div key={group.scope}>
            <p className="text-muted-foreground mb-1.5 px-2 text-xs font-medium tracking-wide uppercase">
              {t(group.labelKey)}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const isActive =
                  item.scope === active.scope && item.section === active.section;
                return (
                  <li key={`${item.scope}/${item.section}`}>
                    <button
                      type="button"
                      data-slot="nav-item"
                      onClick={() => onSelect(item)}
                      aria-current={isActive ? 'page' : undefined}
                      data-testid={`settings-nav-${item.scope}-${item.section}`}
                      className={cn(
                        'flex w-full items-center gap-2 px-2 py-2 text-start text-sm transition-colors',
                        isActive
                          ? 'bg-accent text-accent-foreground font-medium'
                          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                      )}
                    >
                      <item.icon className="size-4 shrink-0" aria-hidden />
                      {t(item.labelKey)}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
