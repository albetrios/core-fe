import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import {
  applyBaseColor,
  applyGeneratedTheme,
  applyIconColor,
  applyIconWeight,
  applyMenuStyle,
  applyThemePreset,
  DEFAULT_BASE,
  DEFAULT_ICON_COLOR,
  DEFAULT_ICON_LIBRARY,
  DEFAULT_ICON_WEIGHT,
  DEFAULT_LAYOUT_WIDTH,
  DEFAULT_MENU,
  DEFAULT_PRESET,
  DEFAULT_TOAST_POSITION,
  DEFAULT_TOAST_VARIANT,
  GENERATED_PRESET,
  type GeneratedTheme,
  generateSeededTheme,
  isThemePreset,
  type LayoutWidthId,
  nextAppVariant,
  nextAuthVariant,
  nextDashboardVariant,
  nextPublicVariant,
  nextToastPosition,
  nextToastVariant,
  normalizeLayoutWidthId,
  normalizeLook,
  randomSeed,
  releaseBootThemeVars,
  SHUFFLE_TEMP,
  shuffleIcons,
} from '@/shared/theme/index.ts';

type Mode = 'light' | 'dark' | 'system';

interface ThemeStore {
  /** Light/dark mode. */
  theme: Mode;
  /** Active named accent preset (see `shared/theme`); `custom` when generated. */
  preset: string;
  /** The active generated look (accent + chart + fonts + radius) when custom. */
  customTheme: GeneratedTheme | null;
  /** Neutral base colour (orthogonal — applies under any preset). */
  baseId: string;
  /** Menu surface style (orthogonal). */
  menu: string;
  /** Icon weight — Lucide stroke-width (orthogonal). */
  iconWeight: string;
  /** Icon colour — semantic token via data-icon-color (orthogonal). */
  iconColor: string;
  /** Icon library — lucide (default) | tabler | phosphor (orthogonal). */
  iconLibrary: string;
  /** TEMP: AuthLayout preview design index (0..2); rolled by shuffle. */
  authVariant: number;
  /** TEMP: AppLayout preview shell index (0..2); rolled by shuffle. */
  appVariant: number;
  /** TEMP: PublicLayout preview shell index (0..2); rolled by shuffle. */
  publicVariant: number;
  /** TEMP: Dashboard arrangement index (0..2); rolled by shuffle. */
  dashboardVariant: number;
  /** TEMP: custom-toast design index (0..N-1); rolled by shuffle + the picker. */
  toastVariant: number;
  /** TEMP: toast position (sonner Position subset); rolled by shuffle + the picker. */
  toastPosition: string;
  /** Seed of the active generated look — enables shareable `?theme=<seed>` +
   *  reproducible shuffles. null on a named preset or a hand-tweaked look. */
  seed: number | null;
  /** Main content shell width (orthogonal — Appearance → Layout). */
  layoutWidth: LayoutWidthId;
  setTheme: (theme: Mode) => void;
  setPreset: (preset: string) => void;
  /** Set one axis of the custom look (accent/chart/font/radius); switches to custom. */
  updateLook: (partial: Partial<GeneratedTheme>) => void;
  setBaseColor: (id: string) => void;
  setMenu: (id: string) => void;
  setIconWeight: (id: string) => void;
  setIconColor: (id: string) => void;
  setIconLibrary: (id: string) => void;
  /** TEMP: set the custom-toast design index (Appearance preview). */
  setToastVariant: (index: number) => void;
  /** TEMP: set the toast position (Appearance preview). */
  setToastPosition: (position: string) => void;
  /** TEMP: set the Dashboard arrangement index (Appearance preview). */
  setDashboardVariant: (index: number) => void;
  /** Set app main content width (contained | full | reading). */
  setLayoutWidth: (id: LayoutWidthId) => void;
  /** Apply a specific seed's look (shareable `?theme=<seed>` / reproducible). */
  applyThemeSeed: (seed: number) => void;
  /** Generate + apply a fresh full look from a new random seed. */
  shuffleTheme: () => void;
}

function applyMode(theme: Mode) {
  const root = document.documentElement;
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

  if (theme === 'dark' || (theme === 'system' && systemDark)) {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }

  // The class above is only half the switch. `theme-init.js` pinned the splash
  // palette INLINE on <html> for the mode the document booted in, and an inline
  // custom property outranks `.dark`, so --color-background / --color-foreground
  // / --color-muted would stay on the old mode while every token the app owns
  // flips — a half-dark page that only a reload repairs. This is the one place
  // the mode is ever applied, so it is the one place that has to let them go.
  releaseBootThemeVars();
}

/**
 * Re-assert the active look on `<html>`. Boot and every mode change run the same
 * path so the generated accent — and the boot snapshot `applyGeneratedTheme`
 * leaves for the next cold load — always describes the mode now on screen.
 */
function applyActiveLook(preset: string, customTheme: GeneratedTheme | null): void {
  if (preset === GENERATED_PRESET && customTheme != null) {
    applyGeneratedTheme(customTheme);
  } else {
    applyThemePreset(preset);
  }
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set, get) => ({
      theme: 'system',
      preset: DEFAULT_PRESET,
      customTheme: null,
      baseId: DEFAULT_BASE,
      menu: DEFAULT_MENU,
      iconWeight: DEFAULT_ICON_WEIGHT,
      iconColor: DEFAULT_ICON_COLOR,
      iconLibrary: DEFAULT_ICON_LIBRARY,
      authVariant: 0,
      appVariant: 0,
      publicVariant: 0,
      dashboardVariant: 0,
      toastVariant: DEFAULT_TOAST_VARIANT,
      toastPosition: DEFAULT_TOAST_POSITION,
      seed: null,
      layoutWidth: DEFAULT_LAYOUT_WIDTH,
      setTheme: (theme) => {
        applyMode(theme);
        // Re-taken for the new mode: the snapshot the boot script replays is
        // tagged with the mode it was captured in, so without this the next cold
        // load finds a stale tag, skips the fast path, and the splash paints the
        // base palette until React catches up.
        applyActiveLook(get().preset, get().customTheme);
        set({ theme });
      },
      setPreset: (preset) => {
        const next = isThemePreset(preset) ? preset : DEFAULT_PRESET;
        applyThemePreset(next);
        set({ preset: next, customTheme: null, seed: null });
      },
      updateLook: (partial) => {
        // Change one axis of the current look and switch to custom. A hand-tweaked
        // look no longer maps to a seed, so clear it.
        const next = { ...normalizeLook(get().customTheme), ...partial };
        applyGeneratedTheme(next);
        set({ preset: GENERATED_PRESET, customTheme: next, seed: null });
      },
      setBaseColor: (id) => {
        applyBaseColor(id);
        set({ baseId: id });
      },
      setMenu: (id) => {
        applyMenuStyle(id);
        set({ menu: id });
      },
      setIconWeight: (id) => {
        applyIconWeight(id);
        set({ iconWeight: id });
      },
      setIconColor: (id) => {
        applyIconColor(id);
        set({ iconColor: id });
      },
      setIconLibrary: (id) => {
        // The @/shared/icons barrel subscribes to this and lazy-loads the set.
        set({ iconLibrary: id });
      },
      setToastVariant: (index) => set({ toastVariant: index }),
      setToastPosition: (position) => set({ toastPosition: position }),
      setDashboardVariant: (index) => set({ dashboardVariant: index }),
      setLayoutWidth: (id) => {
        set({ layoutWidth: normalizeLayoutWidthId(id) });
      },
      applyThemeSeed: (seed) => {
        // Reproduce a specific look from its seed (shared link / QA). Icons + TEMP
        // previews are orthogonal to the seed, so they're left as-is.
        const look = generateSeededTheme(seed);
        applyGeneratedTheme(look);
        set({ preset: GENERATED_PRESET, customTheme: look, seed });
      },
      shuffleTheme: () => {
        // A fresh random seed → a fully reproducible look (colour + chart + fonts +
        // radius + density/motion/elevation/contrast). Icons ride along: sometimes
        // a new weight, sometimes a different library.
        const seed = randomSeed();
        const next = generateSeededTheme(seed);
        applyGeneratedTheme(next);
        const icons = shuffleIcons({
          weight: get().iconWeight,
          library: get().iconLibrary,
          color: get().iconColor,
        });
        applyIconWeight(icons.weight);
        applyIconColor(icons.color);
        set({
          preset: GENERATED_PRESET,
          customTheme: next,
          seed,
          iconWeight: icons.weight,
          iconColor: icons.color,
          iconLibrary: icons.library,
          // TEMP previews — each gated by a SHUFFLE_TEMP switch (flip on/off on
          // request); when off, shuffle leaves that axis untouched.
          authVariant: SHUFFLE_TEMP.authLayout
            ? nextAuthVariant(get().authVariant)
            : get().authVariant,
          appVariant: SHUFFLE_TEMP.appLayout
            ? nextAppVariant(get().appVariant)
            : get().appVariant,
          publicVariant: SHUFFLE_TEMP.publicLayout
            ? nextPublicVariant(get().publicVariant)
            : get().publicVariant,
          dashboardVariant: SHUFFLE_TEMP.dashboard
            ? nextDashboardVariant(get().dashboardVariant)
            : get().dashboardVariant,
          toastVariant: SHUFFLE_TEMP.toastVariant
            ? nextToastVariant(get().toastVariant)
            : get().toastVariant,
          toastPosition: SHUFFLE_TEMP.toastPosition
            ? nextToastPosition(get().toastPosition)
            : get().toastPosition,
        });
      },
    }),
    {
      name: 'theme-preference',
      version: 3,
      migrate: (persisted, version) => {
        if (persisted && typeof persisted === 'object') {
          const next: Record<string, unknown> = { ...persisted };
          if (version < 2) {
            next.iconColor = DEFAULT_ICON_COLOR;
          }
          if (version < 3) {
            next.layoutWidth = DEFAULT_LAYOUT_WIDTH;
          }
          delete next.authVariant;
          delete next.appVariant;
          delete next.publicVariant;
          return next as unknown as ThemeStore;
        }
        return persisted as ThemeStore;
      },
      partialize: (state) => ({
        theme: state.theme,
        preset: state.preset,
        customTheme: state.customTheme,
        baseId: state.baseId,
        menu: state.menu,
        iconWeight: state.iconWeight,
        iconColor: state.iconColor,
        iconLibrary: state.iconLibrary,
        toastVariant: state.toastVariant,
        toastPosition: state.toastPosition,
        seed: state.seed,
        layoutWidth: state.layoutWidth,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          applyMode(state.theme);
          applyBaseColor(state.baseId ?? DEFAULT_BASE);
          applyMenuStyle(state.menu ?? DEFAULT_MENU);
          applyIconWeight(state.iconWeight ?? DEFAULT_ICON_WEIGHT);
          applyIconColor(state.iconColor ?? DEFAULT_ICON_COLOR);
          applyActiveLook(state.preset, state.customTheme);
        }
      },
    },
  ),
);

// Listen for system theme changes with proper cleanup via AbortController
const themeListenerController = new AbortController();

if (typeof window !== 'undefined') {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = () => {
    const { theme, preset, customTheme } = useThemeStore.getState();
    if (theme !== 'system') return;
    applyMode('system');
    applyActiveLook(preset, customTheme);
  };

  mediaQuery.addEventListener('change', handler, {
    signal: themeListenerController.signal,
  });

  // Cleanup on HMR
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      themeListenerController.abort();
    });
  }
}
