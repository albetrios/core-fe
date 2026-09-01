import { Command } from 'cmdk';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils.ts';
import { Loader2 } from '@/shared/icons/index.ts';

export function CommandItem({
  children,
  icon: Icon,
  onSelect,
  keywords,
  destructive = false,
  busy = false,
  disabled = false,
  testId,
}: {
  children: ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  onSelect: () => void;
  /** Extra terms cmdk matches the search query against (beyond the label). */
  keywords?: readonly string[];
  destructive?: boolean;
  /** This row's own work is in flight: swaps the icon for a spinner. */
  busy?: boolean;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <Command.Item
      onSelect={onSelect}
      keywords={keywords ? [...keywords] : undefined}
      disabled={disabled}
      aria-busy={busy || undefined}
      data-testid={testId}
      className={cn(
        'flex cursor-pointer items-center gap-3 px-3 py-2 text-sm transition-colors',
        'aria-selected:bg-accent aria-selected:text-accent-foreground',
        'data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50',
        destructive && 'text-destructive aria-selected:text-destructive',
      )}
      data-slot="menu-item"
    >
      {busy ? (
        <Loader2
          className="h-4 w-4 animate-spin"
          aria-hidden
          data-testid="command-palette-item-spinner"
        />
      ) : (
        <Icon className="h-4 w-4" />
      )}
      {children}
    </Command.Item>
  );
}
