import { create } from 'zustand';

import { ANALYTICS_EVENTS } from '@/shared/analytics/analytics.constants.ts';
import { captureAnalyticsEvent } from '@/shared/analytics/capture.ts';

interface UIStore {
  sidebarOpen: boolean;
  commandPaletteOpen: boolean;
  shortcutsOpen: boolean;
  /** The dedicated Appearance dialog (opened by the floating handle / Customize). */
  appearanceOpen: boolean;

  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  toggleCommandPalette: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
  toggleShortcuts: () => void;
  setShortcutsOpen: (open: boolean) => void;
  setAppearanceOpen: (open: boolean) => void;
  toggleAppearance: () => void;
}

/** Ephemeral, per-tab UI state: which overlays and the navigation drawer are open. */
export const useUIStore = create<UIStore>((set) => ({
  /**
   * Whether the off-canvas navigation DRAWER is open — phones and tablets only.
   * From `lg` up the sidebar is a permanent column and this flag is ignored (the
   * shell pins it with CSS).
   *
   * Always starts closed. It used to be seeded from a `min-width: 768px` media
   * query "so desktop starts open", which made one boolean mean two things: a
   * window loaded wide and then narrowed kept `true`, and the drawer sat open
   * over the content on a screen size where nobody had opened it.
   */
  sidebarOpen: false,
  commandPaletteOpen: false,
  shortcutsOpen: false,
  appearanceOpen: false,

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  toggleCommandPalette: () =>
    set((s) => {
      const next = !s.commandPaletteOpen;
      if (next) captureAnalyticsEvent(ANALYTICS_EVENTS.commandPaletteOpened);
      return { commandPaletteOpen: next };
    }),
  setCommandPaletteOpen: (commandPaletteOpen) => {
    if (commandPaletteOpen) captureAnalyticsEvent(ANALYTICS_EVENTS.commandPaletteOpened);
    set({ commandPaletteOpen });
  },
  toggleShortcuts: () => set((s) => ({ shortcutsOpen: !s.shortcutsOpen })),
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
  setAppearanceOpen: (appearanceOpen) => {
    if (appearanceOpen) captureAnalyticsEvent(ANALYTICS_EVENTS.appearanceDialogOpened);
    set({ appearanceOpen });
  },
  toggleAppearance: () =>
    set((s) => {
      const next = !s.appearanceOpen;
      if (next) captureAnalyticsEvent(ANALYTICS_EVENTS.appearanceDialogOpened);
      return { appearanceOpen: next };
    }),
}));
