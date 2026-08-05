import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  derivedSurfaces,
  findDrift,
  loadIdentity,
  renderProductIdentityModule,
} from '../../tooling/identity/identity.mjs';

/**
 * Locks the product-identity contract: one source of truth
 * (`tooling/setup/setup.config.json` → `project.*`), every other occurrence
 * derived from it, and no brand literal creeping back into app code.
 *
 * This is the guard that makes `pnpm rebrand` durable. The repo already proved
 * the failure mode it prevents: before this landed, `setup.config.json` said the
 * repo was `nikunjmavani/core-fe` while `catalog-info.yaml` said `core/core-fe`
 * — two identity sources silently disagreeing, with only one product in existence.
 */
const ROOT = process.cwd();
const read = (file: string): string => readFileSync(join(ROOT, file), 'utf8');

describe('product identity', () => {
  const identity = loadIdentity(ROOT);

  it('declares every required identity field', () => {
    const missing = Object.entries(identity)
      .filter(([, value]) => typeof value !== 'string' || value.length === 0)
      .map(([key]) => key);
    expect(missing).toEqual([]);
  });

  it('has no derived-surface drift', () => {
    // Mirrors `pnpm validate:identity`. Fix a failure with `pnpm identity:sync`.
    expect(findDrift(identity, ROOT)).toEqual([]);
  });

  it('keeps the generated module byte-identical to its renderer', () => {
    expect(read('src/lib/product-identity.ts')).toBe(
      renderProductIdentityModule(identity),
    );
  });

  it('covers every surface that embeds the product or package name', () => {
    // A new file that hardcodes identity must be added to `derivedSurfaces()`,
    // not left to drift. Locale layouts are counted dynamically (one per locale).
    const files = derivedSurfaces(identity, ROOT).map((surface) => surface.file);
    for (const expected of [
      'src/lib/product-identity.ts',
      'package.json',
      'public/manifest.webmanifest',
      'public/app-icon.svg',
      'catalog-info.yaml',
      '.github/CODEOWNERS',
      'sonar-project.properties',
    ]) {
      expect(files).toContain(expected);
    }
    expect(
      files.filter((file) => file.startsWith('src/locales/')).length,
    ).toBeGreaterThanOrEqual(11);
  });

  it('keeps index.html branding tokenized, never hardcoded', () => {
    // `plugins/product-identity-html.ts` substitutes these at transform time.
    const html = read('index.html');
    expect(html).toContain('<title>{{PRODUCT_NAME}}</title>');
    expect(html).toContain('{{PRODUCT_THEME_COLOR}}');
    expect(html).toContain('class="app-splash-name">{{PRODUCT_NAME}}<');
    expect(html).not.toContain(`<title>${identity.productName}</title>`);
  });

  it('routes app code through the generated module, not a literal', () => {
    // The two files that used to own the brand string.
    expect(read('src/lib/routes/page-head.ts')).toContain(
      "from '@/lib/product-identity.ts'",
    );
    expect(read('src/core/config/app-manifest.ts')).toContain(
      "from '@/lib/product-identity.ts'",
    );
  });

  describe('two-name model', () => {
    it('never invents a platform-name occurrence during a rename', () => {
      // `platformName` names the upstream platform this repo IS. A rebrand must
      // not spread it, or docs/agent-os prose stops being true in a fork and
      // every upstream merge conflicts across ~120 files.
      const platform = identity.platformName;
      const renamed = { ...identity, name: 'acme-fe', productName: 'Acme' };
      const occurrences = (text: string): number => text.split(platform).length - 1;

      for (const surface of derivedSurfaces(identity, ROOT)) {
        // The generated module is rewritten wholesale, so a count comparison
        // against its previous content is not meaningful.
        if (surface.file === 'src/lib/product-identity.ts') continue;
        const before = read(surface.file);
        expect(occurrences(surface.apply(before, renamed))).toBeLessThanOrEqual(
          occurrences(before),
        );
      }
    });

    it('does not list docs/ or agent-os/ prose as a rebrand surface', () => {
      const files = derivedSurfaces(identity, ROOT).map((surface) => surface.file);
      expect(
        files.filter((file) => file.startsWith('docs/') || file.startsWith('agent-os/')),
      ).toEqual([]);
    });
  });
});
