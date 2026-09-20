import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { RTL_LOCALES } from '@/lib/i18n/locales.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('locale-init.js drift', () => {
  const source = readFileSync(join(root, 'public/locale-init.js'), 'utf8');

  it('reads the same persist key as useLocaleStore', () => {
    expect(source).toContain("localStorage.getItem('locale-preference')");
  });

  it('mirrors RTL_LOCALES for the FOUC path', () => {
    for (const locale of RTL_LOCALES) {
      expect(source).toMatch(new RegExp(`${locale}\\s*:\\s*true`));
    }
  });
});

describe('theme-init.js drift', () => {
  const source = readFileSync(join(root, 'public/theme-init.js'), 'utf8');

  it('reads the same persist key as useThemeStore', () => {
    expect(source).toContain("localStorage.getItem('theme-preference')");
  });
});

describe('boot splash shape drift (theme-init.js ↔ index.html ↔ BrandLoader)', () => {
  // Under the Sharp shape nothing in the app is round, and the splash is the
  // first thing on screen. Three files have to agree or the loader changes shape
  // half way through the boot: theme-init.js sets `data-shape` before paint,
  // index.html squares the HTML splash on it, and index.css squares the React
  // BrandLoader's `icon-chip` + `pill` slots on the same attribute.
  const themeInit = readFileSync(join(root, 'public/theme-init.js'), 'utf8');
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const css = readFileSync(join(root, 'src/index.css'), 'utf8');
  const loader = readFileSync(
    join(root, 'src/shared/components/BrandLoader/BrandLoader.tsx'),
    'utf8',
  );

  it('theme-init.js applies the Sharp shape before first paint', () => {
    expect(themeInit).toContain("state.customTheme.shapeId === 'sharp'");
    expect(themeInit).toContain("root.dataset.shape = 'sharp'");
  });

  it('index.html squares every rounded part of the HTML splash under it', () => {
    for (const part of ['.app-splash-mark', '.app-splash-track', '.app-splash-bar']) {
      expect(html).toContain(`html[data-shape='sharp'] ${part}`);
    }
  });

  it('index.css squares the matching React slots', () => {
    expect(css).toContain("[data-shape='sharp'] [data-slot='icon-chip']");
    expect(css).toContain("[data-shape='sharp'] [data-slot='pill']");
  });

  it('BrandLoader renders its mark and track through those slots', () => {
    expect(loader).toContain('data-slot="icon-chip"');
    expect(loader.match(/data-slot="pill"/g)).toHaveLength(2);
  });
});
