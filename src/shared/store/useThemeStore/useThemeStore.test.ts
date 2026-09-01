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
});
