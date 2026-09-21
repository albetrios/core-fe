import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The global setup stubs `matchMedia` with inert listeners, so the store's
 * module-level `change` subscription can never fire. This one records its
 * listeners and can flip the OS preference under them.
 */
function installMatchMedia(initialDark: boolean) {
  const listeners = new Set<() => void>();
  let prefersDark = initialDark;

  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      get matches() {
        return query.includes('prefers-color-scheme: dark') ? prefersDark : false;
      },
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: (_type: string, listener: () => void) => {
        listeners.add(listener);
      },
      removeEventListener: (_type: string, listener: () => void) => {
        listeners.delete(listener);
      },
      dispatchEvent: () => false,
    }),
  });

  return {
    /** Move the OS preference and notify whoever subscribed. */
    flip(nextDark: boolean) {
      prefersDark = nextDark;
      for (const listener of listeners) listener();
    },
  };
}

/** Re-import the store so its module-level listener binds to the stub above. */
async function freshStore() {
  vi.resetModules();
  return (await import('./useThemeStore.ts')).useThemeStore;
}

/** What `public/theme-init.js` leaves inline after painting the splash in light. */
function pinLightBootPalette() {
  const root = document.documentElement;
  root.style.setProperty('--color-background', 'oklch(1 0 0)');
  root.style.setProperty('--color-foreground', 'oklch(0.145 0 0)');
  root.style.setProperty('--color-muted', 'oklch(0.97 0 0)');
}

/**
 * `system` mode follows the OS, so an OS flip is a third way into
 * `applyMode` — and it carried the same half-switched page as the in-app
 * switcher, with no click to blame it on.
 */
describe('useThemeStore — OS colour-scheme changes', () => {
  afterEach(() => {
    const root = document.documentElement;
    for (const name of ['--color-background', '--color-foreground', '--color-muted']) {
      root.style.removeProperty(name);
    }
    root.classList.remove('dark');
    vi.resetModules();
  });

  it('an OS flip to dark switches the page whole, boot palette included', async () => {
    const media = installMatchMedia(false);
    const useThemeStore = await freshStore();
    useThemeStore.setState({ theme: 'system' });
    pinLightBootPalette();

    media.flip(true);

    const root = document.documentElement;
    expect(root.classList.contains('dark')).toBe(true);
    expect(root.style.getPropertyValue('--color-background')).toBe('');
    expect(root.style.getPropertyValue('--color-foreground')).toBe('');
    expect(root.style.getPropertyValue('--color-muted')).toBe('');
  });

  it('leaves a pinned mode alone when the OS flips under it', async () => {
    const media = installMatchMedia(false);
    const useThemeStore = await freshStore();
    useThemeStore.setState({ theme: 'light' });
    pinLightBootPalette();

    media.flip(true);

    const root = document.documentElement;
    expect(root.classList.contains('dark')).toBe(false);
    // Nothing ran, so the boot palette is still where theme-init.js left it.
    expect(root.style.getPropertyValue('--color-background')).toBe('oklch(1 0 0)');
  });
});
