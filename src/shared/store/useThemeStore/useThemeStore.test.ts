import { useThemeStore } from './useThemeStore.ts';

describe('useThemeStore', () => {
  beforeEach(() => {
    useThemeStore.setState({
      theme: 'system',
      preset: 'default',
      customTheme: null,
      baseId: 'neutral',
      menu: 'default',
      iconWeight: 'regular',
      iconLibrary: 'lucide',
      authVariant: 0,
      appVariant: 0,
      dashboardVariant: 0,
    });
    const root = document.documentElement;
    delete root.dataset.theme;
    delete root.dataset.base;
    delete root.dataset.menu;
    root.style.removeProperty('--icon-stroke');
    for (const v of [
      '--color-primary',
      '--color-ring',
      '--color-sidebar-primary',
      '--color-sidebar-ring',
      '--color-primary-foreground',
      '--color-sidebar-primary-foreground',
      '--font-sans',
      '--font-heading',
      '--radius-sm',
      '--radius-md',
      '--radius-lg',
      '--radius-xl',
      '--color-chart-1',
      '--color-chart-2',
      '--color-chart-3',
      '--color-chart-4',
      '--color-chart-5',
    ]) {
      root.style.removeProperty(v);
    }
  });

  it('initial state is system', () => {
    expect(useThemeStore.getState().theme).toBe('system');
  });

  it('setTheme("dark") updates theme', () => {
    useThemeStore.getState().setTheme('dark');
    expect(useThemeStore.getState().theme).toBe('dark');
  });

  it('setPreset applies a valid preset via data-theme', () => {
    useThemeStore.getState().setPreset('violet');
    expect(useThemeStore.getState().preset).toBe('violet');
    expect(document.documentElement.dataset.theme).toBe('violet');
  });

  it('setPreset falls back to default for unknown ids (clears data-theme)', () => {
    useThemeStore.getState().setPreset('violet');
    useThemeStore.getState().setPreset('bogus');
    expect(useThemeStore.getState().preset).toBe('default');
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it('shuffleTheme generates a full custom look', () => {
    useThemeStore.getState().setPreset('violet');
    useThemeStore.getState().shuffleTheme();
    const state = useThemeStore.getState();
    expect(state.preset).toBe('custom');
    expect(typeof state.seed).toBe('number');
    expect(state.customTheme).toMatchObject({
      hue: expect.any(Number),
      chartHue: expect.any(Number),
      bodyFontId: expect.any(String),
      headingFontId: expect.any(String),
      radiusId: expect.any(String),
      densityId: expect.any(String),
      motionId: expect.any(String),
      elevationId: expect.any(String),
      contrastId: expect.any(String),
    });
    expect(document.documentElement.dataset.theme).toBeUndefined();
    const style = document.documentElement.style;
    expect(style.getPropertyValue('--color-primary')).toContain('oklch');
    expect(style.getPropertyValue('--font-sans')).not.toBe('');
    expect(style.getPropertyValue('--font-heading')).not.toBe('');
    expect(style.getPropertyValue('--radius-lg')).not.toBe('');
    // experience axes retone the whole app via runtime CSS vars
    expect(style.getPropertyValue('--spacing')).not.toBe('');
    expect(style.getPropertyValue('--default-transition-duration')).not.toBe('');
    // icons ride along the shuffle — values stay valid
    expect(['thin', 'regular', 'bold']).toContain(state.iconWeight);
    expect(['lucide', 'tabler', 'phosphor']).toContain(state.iconLibrary);
    // TEMP preview axes (layout/toast) roll only when their SHUFFLE_TEMP switch is
    // on; either way the stored index stays a valid variant.
    expect([0, 1, 2]).toContain(state.authVariant);
    expect([0, 1, 2]).toContain(state.appVariant);
    expect([0, 1, 2, 3]).toContain(state.dashboardVariant);
  });

  it('setDashboardVariant stores the arrangement index (TEMP preview)', () => {
    useThemeStore.getState().setDashboardVariant(2);
    expect(useThemeStore.getState().dashboardVariant).toBe(2);
  });

  it('applyThemeSeed reproduces a look from its seed and stores it', () => {
    useThemeStore.getState().applyThemeSeed(4821);
    const look = useThemeStore.getState().customTheme;
    expect(useThemeStore.getState().seed).toBe(4821);
    expect(useThemeStore.getState().preset).toBe('custom');
    // switching to a named preset clears the seed…
    useThemeStore.getState().setPreset('default');
    expect(useThemeStore.getState().seed).toBeNull();
    // …and re-applying the same seed reproduces the identical look
    useThemeStore.getState().applyThemeSeed(4821);
    expect(useThemeStore.getState().customTheme).toEqual(look);
  });

  it('updateLook sets one axis and switches to the custom look', () => {
    useThemeStore.getState().updateLook({ hue: 200 });
    const state = useThemeStore.getState();
    expect(state.preset).toBe('custom');
    expect(state.customTheme?.hue).toBe(200);
    expect(document.documentElement.style.getPropertyValue('--color-primary')).toContain(
      '200',
    );
  });

  it('setBaseColor / setMenu / setIconWeight apply orthogonally', () => {
    useThemeStore.getState().setBaseColor('stone');
    expect(useThemeStore.getState().baseId).toBe('stone');
    expect(document.documentElement.dataset.base).toBe('stone');

    useThemeStore.getState().setMenu('translucent');
    expect(useThemeStore.getState().menu).toBe('translucent');
    expect(document.documentElement.dataset.menu).toBe('translucent');

    useThemeStore.getState().setIconWeight('bold');
    expect(useThemeStore.getState().iconWeight).toBe('bold');
    expect(document.documentElement.style.getPropertyValue('--icon-stroke')).toBe('2.5');

    useThemeStore.getState().setIconLibrary('tabler');
    expect(useThemeStore.getState().iconLibrary).toBe('tabler');
  });

  it('shuffleTheme leaves the app shell alone — it is cosmetic, not structural (SHELL-5)', () => {
    // Every other shuffled axis repaints in place. `appVariant` selects a
    // DIFFERENT shell component, each owning its own <main>, so rolling it
    // unmounts the routed island and takes the user's chart range, calendar
    // selection and carousel position with it.
    useThemeStore.setState({ appVariant: 0 });
    for (let i = 0; i < 25; i += 1) useThemeStore.getState().shuffleTheme();
    expect(useThemeStore.getState().appVariant).toBe(0);
    // ...while the cosmetic axes did roll, so this is not a dead shuffle.
    expect(useThemeStore.getState().customTheme).not.toBeNull();
  });

  it('setPreset clears a generated custom look (keeps base/menu)', () => {
    useThemeStore.getState().shuffleTheme();
    useThemeStore.getState().setBaseColor('slate');
    expect(useThemeStore.getState().customTheme).not.toBeNull();
    useThemeStore.getState().setPreset('violet');
    expect(useThemeStore.getState().customTheme).toBeNull();
    expect(useThemeStore.getState().preset).toBe('violet');
    // base colour is orthogonal — survives a preset change
    expect(useThemeStore.getState().baseId).toBe('slate');
  });

  it('setLayoutWidth normalizes layout width ids', () => {
    useThemeStore.getState().setLayoutWidth('reading');
    expect(useThemeStore.getState().layoutWidth).toBe('reading');
    useThemeStore.getState().setLayoutWidth('bogus' as 'contained');
    expect(useThemeStore.getState().layoutWidth).toBe('contained');
  });

  describe('SHELL-9 — what survives a reload is a decision, not an accident', () => {
    /**
     * The persisted key set, spelled out.
     *
     * SHELL-9 reports a chosen dashboard arrangement reverting on reload because
     * `partialize` omitted its axis. No `dashboardVariant` exists on this branch
     * (see the assertion below), so there is nothing to add — but the shape of
     * that bug is "a user-chosen axis was left out of `partialize` and nobody
     * noticed". Pinning the set means the next axis has to be an explicit choice:
     * add it here and it persists, leave it out and this test says so out loud.
     */
    const PERSISTED_KEYS = [
      'baseId',
      'customTheme',
      'iconColor',
      'iconLibrary',
      'iconWeight',
      'layoutWidth',
      'menu',
      'preset',
      'seed',
      'theme',
      'toastPosition',
      'toastVariant',
    ];

    /** Deliberately ephemeral: shuffle-only previews, stripped in `migrate` too. */
    const EPHEMERAL_KEYS = [
      'appVariant',
      'authVariant',
      'publicVariant',
      'dashboardVariant',
    ];

    function persistedKeys(): string[] {
      const raw = window.localStorage.getItem('theme-preference');
      expect(raw).not.toBeNull();
      return Object.keys(JSON.parse(raw ?? '{}').state ?? {}).sort();
    }

    it('persists exactly the axes a user chose, and nothing else', () => {
      useThemeStore.getState().setTheme('dark');
      useThemeStore.getState().setLayoutWidth('reading');
      expect(persistedKeys()).toEqual(PERSISTED_KEYS);
    });

    it('never persists a shuffle-only preview axis', () => {
      useThemeStore.setState({ appVariant: 2, authVariant: 1, publicVariant: 1 });
      useThemeStore.getState().setTheme('light');
      const keys = persistedKeys();
      for (const key of EPHEMERAL_KEYS) expect(keys).not.toContain(key);
    });

    it('treats the dashboard arrangement axis as a preview, not a preference', () => {
      // This assertion used to read "no dashboard axis exists on this branch",
      // as a tripwire: whoever added one had to decide whether it persists.
      // The dashboard shuffle variants added one, so here is that decision.
      // `dashboardVariant` is shuffle-driven exactly like the other preview
      // axes and is absent from `partialize`, so it must not survive a reload.
      expect(Object.keys(useThemeStore.getState())).toContain('dashboardVariant');

      useThemeStore.setState({ dashboardVariant: 2 });
      useThemeStore.getState().setTheme('dark');

      expect(persistedKeys()).not.toContain('dashboardVariant');
      expect(persistedKeys()).toEqual(PERSISTED_KEYS);
    });
  });
});
