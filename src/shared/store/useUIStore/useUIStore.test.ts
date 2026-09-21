import { vi } from 'vitest';

import { useUIStore } from './useUIStore.ts';

describe('useUIStore', () => {
  beforeEach(() => {
    useUIStore.setState({
      sidebarOpen: true,
      commandPaletteOpen: false,
      commandPaletteSeed: '',
      shortcutsOpen: false,
    });
  });

  it('initial state: every overlay closed — including the navigation drawer', () => {
    // `sidebarOpen` is the off-canvas DRAWER (phones + tablets); from `lg` up the
    // sidebar is a permanent column pinned by CSS. It used to be seeded from a
    // `min-width: 768px` media query, so a window loaded wide and then narrowed
    // kept `true` and the drawer sat open over content nobody had opened it on.
    const initial = useUIStore.getInitialState();
    expect(initial.sidebarOpen).toBe(false);
    expect(initial.commandPaletteOpen).toBe(false);
    expect(initial.commandPaletteSeed).toBe('');
    expect(initial.shortcutsOpen).toBe(false);
    expect(initial.appearanceOpen).toBe(false);
  });

  it('does not consult the viewport for its initial state', () => {
    const matchMedia = vi.spyOn(window, 'matchMedia');
    useUIStore.getInitialState();
    expect(matchMedia).not.toHaveBeenCalled();
    matchMedia.mockRestore();
  });

  it('toggleSidebar toggles sidebarOpen', () => {
    const { toggleSidebar } = useUIStore.getState();
    toggleSidebar();
    expect(useUIStore.getState().sidebarOpen).toBe(false);
    toggleSidebar();
    expect(useUIStore.getState().sidebarOpen).toBe(true);
  });

  it('toggleCommandPalette toggles commandPaletteOpen', () => {
    const { toggleCommandPalette } = useUIStore.getState();
    toggleCommandPalette();
    expect(useUIStore.getState().commandPaletteOpen).toBe(true);
    toggleCommandPalette();
    expect(useUIStore.getState().commandPaletteOpen).toBe(false);
  });

  it('setSidebarOpen sets exact value', () => {
    useUIStore.getState().setSidebarOpen(false);
    expect(useUIStore.getState().sidebarOpen).toBe(false);
    useUIStore.getState().setSidebarOpen(true);
    expect(useUIStore.getState().sidebarOpen).toBe(true);
  });

  it('setCommandPaletteOpen sets exact value', () => {
    useUIStore.getState().setCommandPaletteOpen(true);
    expect(useUIStore.getState().commandPaletteOpen).toBe(true);
    useUIStore.getState().setCommandPaletteOpen(false);
    expect(useUIStore.getState().commandPaletteOpen).toBe(false);
  });

  it('appearance dialog: defaults closed, toggles + sets', () => {
    expect(useUIStore.getState().appearanceOpen).toBe(false);
    useUIStore.getState().toggleAppearance();
    expect(useUIStore.getState().appearanceOpen).toBe(true);
    useUIStore.getState().setAppearanceOpen(false);
    expect(useUIStore.getState().appearanceOpen).toBe(false);
  });

  it('shortcuts dialog: defaults closed, toggles + sets', () => {
    expect(useUIStore.getState().shortcutsOpen).toBe(false);
    useUIStore.getState().toggleShortcuts();
    expect(useUIStore.getState().shortcutsOpen).toBe(true);
    useUIStore.getState().setShortcutsOpen(false);
    expect(useUIStore.getState().shortcutsOpen).toBe(false);
  });

  describe('command-palette seed', () => {
    it('openCommandPaletteWith opens the palette carrying the seed', () => {
      useUIStore.getState().openCommandPaletteWith('invitations');
      expect(useUIStore.getState().commandPaletteOpen).toBe(true);
      expect(useUIStore.getState().commandPaletteSeed).toBe('invitations');
    });

    it('closing drops the seed, so the next plain open starts blank', () => {
      // Without this the palette reopens on whatever a suggestion chip asked
      // for three screens ago, and the user has to clear it by hand.
      useUIStore.getState().openCommandPaletteWith('theme');
      useUIStore.getState().setCommandPaletteOpen(false);
      expect(useUIStore.getState().commandPaletteSeed).toBe('');
    });

    it('⌘K is the blank entry point even straight after a seeded opening', () => {
      useUIStore.getState().openCommandPaletteWith('theme');
      const { toggleCommandPalette } = useUIStore.getState();
      toggleCommandPalette(); // closes
      toggleCommandPalette(); // reopens
      expect(useUIStore.getState().commandPaletteOpen).toBe(true);
      expect(useUIStore.getState().commandPaletteSeed).toBe('');
    });
  });
});
