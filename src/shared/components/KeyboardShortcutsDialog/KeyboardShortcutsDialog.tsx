import { useTranslation } from 'react-i18next';

import { Card } from '@/shared/components/ui/card.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog.tsx';
import { LAYOUT_KEYS, LAYOUT_NS } from '@/shared/layouts/layout.constants.ts';
import { useUIStore } from '@/shared/store/useUIStore/index.ts';

function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return true;
  const uaData = (navigator as { userAgentData?: { platform?: string } }).userAgentData;
  return /Mac|iPhone|iPad|iPod/i.test(uaData?.platform ?? navigator.userAgent);
}

/**
 * Keyboard shortcuts reference — opened via `?` or Cmd/Ctrl+/ from anywhere in the app shell.
 */
export function KeyboardShortcutsDialog() {
  const { t } = useTranslation(LAYOUT_NS);
  const open = useUIStore((s) => s.shortcutsOpen);
  const setOpen = useUIStore((s) => s.setShortcutsOpen);
  const mac = isMacPlatform();
  const sk = LAYOUT_KEYS.app.shortcuts;

  const rows: { labelKey: string; keys: string }[] = [
    { labelKey: sk.commandPalette, keys: mac ? '⌘ K' : 'Ctrl K' },
    { labelKey: sk.showShortcuts, keys: '?' },
    { labelKey: sk.showShortcutsAlt, keys: mac ? '⌘ /' : 'Ctrl /' },
    { labelKey: sk.closeDialog, keys: 'Esc' },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md" data-testid="keyboard-shortcuts-dialog">
        <DialogHeader>
          <DialogTitle>{t(sk.title)}</DialogTitle>
          <DialogDescription>{t(sk.description)}</DialogDescription>
        </DialogHeader>
        <Card className="gap-0 overflow-hidden py-0">
          <ul className="divide-border divide-y">
            {rows.map((row) => (
              <li
                key={row.labelKey}
                className="flex items-center justify-between gap-4 px-4 py-3 text-sm"
              >
                <span>{t(row.labelKey)}</span>
                <kbd
                  data-slot="kbd"
                  className="bg-muted rounded-sm px-2 py-0.5 font-mono text-xs"
                >
                  {row.keys}
                </kbd>
              </li>
            ))}
          </ul>
        </Card>
      </DialogContent>
    </Dialog>
  );
}
