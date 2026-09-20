import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { build, createServer } from 'vite';
import { describe, expect, it } from 'vitest';

import { i18nBuild } from '../../plugins/i18n-build.ts';
import { I18N_NAMESPACES } from '../../src/lib/i18n/namespaces.ts';

const RESOURCE_ID = '\0virtual:core-fe-i18n-resources';

describe('production i18n resource boundaries', () => {
  it.each([
    ['en-US', 'en'],
    ['es-ES', 'es'],
    ['xx-XX', 'en'],
  ])('keeps %s shells ready and awaits deferred %s copy', async (localeFlag, locale) => {
    const server = await createServer({
      configFile: false,
      envFile: false,
      plugins: [i18nBuild({ modeFlag: 'single', localeFlag })],
      server: { middlewareMode: true, watch: null },
    });
    try {
      const resources = await server.ssrLoadModule(RESOURCE_ID);
      const bootstrap = resources.getBootstrapResources();
      expect(Object.keys(bootstrap)).toEqual([locale]);
      expect(resources.getBuildLocaleProfile().locale).toBe(locale);
      expect(bootstrap[locale]).toEqual({
        common: expect.any(Object),
        errors: expect.any(Object),
        layout: expect.any(Object),
        auth: { manifest: expect.any(Object) },
        onboarding: { manifest: expect.any(Object) },
        settings: {
          dialog: expect.any(Object),
          discard: expect.any(Object),
          nav: expect.any(Object),
          panels: { appearance: expect.any(Object) },
        },
      });
      for (const namespace of Object.values(I18N_NAMESPACES)) {
        const expected = JSON.parse(
          readFileSync(resolve(`src/locales/${locale}/${namespace}.json`), 'utf8'),
        );
        await expect(resources.loadLocaleNamespace(locale, namespace)).resolves.toEqual(
          expected,
        );
      }
    } finally {
      await server.close();
    }
  });

  it('emits selected-language namespaces as lazy chunks, not entry imports', async () => {
    const result = await build({
      configFile: false,
      envFile: false,
      logLevel: 'silent',
      plugins: [i18nBuild({ modeFlag: 'single', localeFlag: 'es-ES' })],
      build: {
        write: false,
        minify: false,
        rollupOptions: {
          input: RESOURCE_ID,
          preserveEntrySignatures: 'strict',
        },
      },
    });
    if (!('output' in result)) throw new Error('Expected one Rollup output');
    const chunks = result.output.filter((item) => item.type === 'chunk');
    const entry = chunks.find((chunk) => chunk.isEntry);
    expect(entry?.imports).toEqual([]);
    expect(entry?.dynamicImports).toHaveLength(Object.values(I18N_NAMESPACES).length);
    expect(
      chunks
        .flatMap((chunk) => Object.keys(chunk.modules))
        .filter((id) => id.includes('/locales/')),
    ).toEqual([]);
    expect(chunks.filter((chunk) => !chunk.isEntry)).toHaveLength(
      Object.values(I18N_NAMESPACES).length,
    );
  });

  it('selects the runtime resource loader in multi mode', async () => {
    const server = await createServer({
      configFile: false,
      envFile: false,
      plugins: [i18nBuild({ modeFlag: 'multi' })],
      server: { middlewareMode: true, watch: null },
    });
    try {
      const resolved = await server.pluginContainer.resolveId(
        '@/lib/i18n/i18n-resources.ts',
      );
      expect(resolved?.id).toBe(resolve('src/lib/i18n/i18n-resources.multi.ts'));
    } finally {
      await server.close();
    }
  });
});
