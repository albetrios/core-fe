import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { LAYOUT_KEYS, LAYOUT_NS } from '@/shared/layouts/layout.constants.ts';
import { useUIStore } from '@/shared/store/useUIStore/index.ts';

import { CommandPaletteContext, type SearchFocus } from './command-palette-context.ts';

/** The dialog and its focus lifecycle survive content loading and retries. */
export function CommandPaletteShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation(LAYOUT_NS);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const searchFocus = useRef<SearchFocus>({ focused: true, start: null, end: null });
  const [previousFocus] = useState(() => document.activeElement as HTMLElement | null);
  const setOpen = useUIStore((s) => s.setCommandPaletteOpen);
  const rememberFocus = useCallback((focused: boolean) => {
    searchFocus.current.focused = focused;
  }, []);
  const rememberSelection = useCallback((input: HTMLInputElement) => {
    searchFocus.current = {
      focused: true,
      start: input.selectionStart,
      end: input.selectionEnd,
    };
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    const focusableSelector = 'input, button, [tabindex]:not([tabindex="-1"])';
    // A failed lazy child removes the focused input without rerendering this shell.
    const focusObserver = new MutationObserver(() => {
      if (dialog?.isConnected && !dialog.contains(document.activeElement)) {
        dialog.querySelector<HTMLElement>(focusableSelector)?.focus();
      }
    });
    if (dialog) focusObserver.observe(dialog, { childList: true, subtree: true });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = dialog?.querySelectorAll<HTMLElement>(focusableSelector);
      if (!focusable?.length) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (!dialog?.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      focusObserver.disconnect();
      document.removeEventListener('keydown', onKeyDown);
      if (!useUIStore.getState().commandPaletteOpen && previousFocus?.isConnected) {
        previousFocus.focus();
      }
    };
  }, [previousFocus, setOpen]);

  return (
    <CommandPaletteContext.Provider
      value={{ query, setQuery, searchFocus, rememberFocus, rememberSelection }}
    >
      <div
        className="fixed inset-0 z-50"
        role="dialog"
        aria-modal="true"
        aria-label={t(LAYOUT_KEYS.app.commandPalette.ariaLabel)}
        ref={dialogRef}
      >
        <div
          className="bg-overlay/50 fixed inset-0 backdrop-blur-sm"
          aria-hidden="true"
          onClick={() => setOpen(false)}
        />
        <div className="fixed top-[20%] left-1/2 w-full max-w-lg -translate-x-1/2">
          <div
            data-slot="popover-content"
            className="bg-popover overflow-hidden rounded-md border"
          >
            {children}
          </div>
        </div>
      </div>
    </CommandPaletteContext.Provider>
  );
}
