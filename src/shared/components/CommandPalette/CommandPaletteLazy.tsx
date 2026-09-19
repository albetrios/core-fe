import { Suspense, useEffect, useLayoutEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { Skeleton } from '@/lib/animations/Skeleton.tsx';
import { ERRORS_KEYS, ERRORS_NS } from '@/lib/i18n/errors.constants.ts';
import { LOCALE_KEYS, LOCALE_NS } from '@/lib/i18n/locale.constants.ts';
import { onceAsync, useRetryableLazy } from '@/lib/lazy-module.ts';
import { SectionErrorBoundary } from '@/shared/components/WidgetErrorBoundary/index.ts';
import { Search } from '@/shared/icons/index.ts';
import { LAYOUT_KEYS, LAYOUT_NS } from '@/shared/layouts/layout.constants.ts';
import { useUIStore } from '@/shared/store/useUIStore/index.ts';

import {
  COMMAND_SEARCH_CLASS,
  useCommandPaletteSearch,
} from './command-palette-context.ts';
import { CommandPaletteShell } from './CommandPaletteShell.tsx';

// cmdk stays behind this import, outside the entry preload graph.
const loadCommandPalette = onceAsync(() =>
  import('./CommandPalette.tsx').then((m) => ({ default: m.CommandPaletteContent })),
);

function CommandPalettePending() {
  const { t } = useTranslation(LAYOUT_NS);
  const { t: tLocale } = useTranslation(LOCALE_NS);
  const { query, setQuery, searchFocus, rememberFocus, rememberSelection } =
    useCommandPaletteSearch();
  const inputRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (searchFocus.current.focused) {
      input?.focus();
      input?.setSelectionRange(searchFocus.current.start, searchFocus.current.end);
    }
    return () => {
      if (input && document.activeElement === input) {
        rememberSelection(input);
      }
    };
  }, [searchFocus, rememberSelection]);

  return (
    <>
      <div className="flex items-center border-b px-3">
        <Search className="text-muted-foreground me-2 h-4 w-4 shrink-0" />
        <input
          ref={inputRef}
          data-slot="input"
          aria-label={t(LAYOUT_KEYS.app.commandPalette.placeholder)}
          placeholder={t(LAYOUT_KEYS.app.commandPalette.placeholder)}
          className={COMMAND_SEARCH_CLASS}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => {
            rememberFocus(true);
          }}
          onBlur={() => {
            rememberFocus(false);
          }}
        />
      </div>
      <div data-testid="command-palette-pending" className="flex flex-col gap-1.5 p-2">
        <span role="status" className="sr-only">
          {tLocale(LOCALE_KEYS.loading)}
        </span>
        <Skeleton aria-hidden="true" className="ms-2 h-3.5 w-20" />
        <Skeleton aria-hidden="true" className="h-9 w-full" />
        <Skeleton aria-hidden="true" className="h-9 w-full" />
        <Skeleton aria-hidden="true" className="ms-2 h-3.5 w-16" />
        <Skeleton aria-hidden="true" className="h-9 w-full" />
        <Skeleton aria-hidden="true" className="h-9 w-full" />
        <Skeleton aria-hidden="true" className="h-9 w-full" />
        <Skeleton aria-hidden="true" className="h-9 w-full" />
      </div>
    </>
  );
}

function CommandPaletteBody() {
  const { t } = useTranslation(ERRORS_NS);
  const { Component: Content, retry } = useRetryableLazy(loadCommandPalette);
  return (
    <SectionErrorBoundary
      title={t(ERRORS_KEYS.widget.commandPalette)}
      onReset={retry}
      testId="command-palette-error"
      variant="inline"
    >
      <Suspense fallback={<CommandPalettePending />}>
        <Content />
      </Suspense>
    </SectionErrorBoundary>
  );
}

/** Eager dialog and keyboard shortcut, deferred command engine and list. */
export function CommandPaletteLazy() {
  const open = useUIStore((s) => s.commandPaletteOpen);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        useUIStore.getState().toggleCommandPalette();
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  if (!open) return null;

  return (
    <CommandPaletteShell>
      <CommandPaletteBody />
    </CommandPaletteShell>
  );
}
