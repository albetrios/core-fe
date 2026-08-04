import { useUIStore } from './useUIStore.ts';

describe('useUIStore', () => {
  beforeEach(() => {
    useUIStore.setState({
      sidebarOpen: true,
      commandPaletteOpen: false,
      shortcutsOpen: false,
    });
  });

  it('initial state: sidebarOpen=true, commandPaletteOpen=false', () => {
    const state = useUIStore.getState();
    expect(state.sidebarOpen).toBe(true);
    expect(state.commandPaletteOpen).toBe(false);
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
});
