import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { LAYOUT_KEYS, LAYOUT_NS } from '@/shared/layouts/layout.constants.ts';
import { useUIStore } from '@/shared/store/useUIStore/index.ts';

import { CommandPaletteContext, type SearchFocus } from './command-palette-context.ts';

/** The dialog and its focus lifecycle survive content loading and retries. */
export function CommandPaletteShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation(LAYOUT_NS);
  const dialogRef = useRef<HTMLDialogElement>(null);
  /**
   * Seeded ONCE, from whatever asked for this opening — a dashboard suggestion
   * chip names something specific ("Invite members"), and a palette that opens
   * blank makes the user restate it. Read through the initializer rather than
   * an effect so the first paint already shows the filtered list, and never
   * read again: typing here must not write back to the store.
   */
  const [query, setQuery] = useState(() => useUIStore.getState().commandPaletteSeed);
  // A seeded palette puts the caret AFTER the seed, so the first keystroke
  // extends the suggestion instead of landing in front of it.
  const seedCaret = query.length === 0 ? null : query.length;
  const searchFocus = useRef<SearchFocus>({
    focused: true,
    start: seedCaret,
    end: seedCaret,
  });
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

  const contextValue = useMemo(
    () => ({ query, setQuery, searchFocus, rememberFocus, rememberSelection }),
    [query, rememberFocus, rememberSelection],
  );

  return (
    <CommandPaletteContext.Provider value={contextValue}>
      <dialog
        open
        className="text-foreground fixed inset-0 z-50 m-0 h-full max-h-none w-full max-w-none border-0 bg-transparent p-0"
        aria-modal="true"
        aria-label={t(LAYOUT_KEYS.app.commandPalette.ariaLabel)}
        ref={dialogRef}
      >
        <div
          className="bg-overlay/50 fixed inset-0 backdrop-blur-sm"
          aria-hidden="true"
          onClick={() => setOpen(false)}
        />
        {/* A gutter on phones: `w-full` under `max-w-lg` ran edge to edge on
            any screen narrower than 32rem. Roomier on big monitors. */}
        <div className="3xl:max-w-xl fixed top-[20%] left-1/2 w-[calc(100%-1.5rem)] max-w-lg -translate-x-1/2">
          <div
            data-slot="popover-content"
            className="bg-popover overflow-hidden rounded-md border"
          >
            {children}
          </div>
        </div>
      </dialog>
    </CommandPaletteContext.Provider>
  );
}
