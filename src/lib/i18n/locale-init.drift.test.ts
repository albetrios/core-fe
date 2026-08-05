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
