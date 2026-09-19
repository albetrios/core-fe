import { createContext, type RefObject, useContext } from 'react';

/** Keep the pending and resolved search inputs visually identical. */
export const COMMAND_SEARCH_CLASS =
  'placeholder:text-muted-foreground flex h-12 w-full bg-transparent py-3 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50';

/** Selection and focus retained while the deferred command engine arrives. */
export interface SearchFocus {
  focused: boolean;
  start: number | null;
  end: number | null;
}

/** Search state belongs to the persistent shell, not the deferred result list. */
export const CommandPaletteContext = createContext<{
  query: string;
  setQuery: (query: string) => void;
  searchFocus: RefObject<SearchFocus>;
  rememberFocus: (focused: boolean) => void;
  rememberSelection: (input: HTMLInputElement) => void;
} | null>(null);

/** Access the shell-owned query and input focus handoff. */
export function useCommandPaletteSearch() {
  const context = useContext(CommandPaletteContext);
  if (!context) throw new Error('Command palette search requires its shell');
  return context;
}
