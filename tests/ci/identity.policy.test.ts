import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  derivedSurfaces,
  findDrift,
  findIncompleteTransforms,
  loadIdentity,
  renderProductIdentityModule,
  wholeWord,
} from '../../tooling/identity/identity.mjs';

/**
 * Locks the product-identity contract: one source of truth
 * (`tooling/setup/setup.config.json` → `project.*`), every other occurrence
 * derived from it, and no brand literal creeping back into app code or copy.
 *
 * Two failures already caught here, both of the same shape — a guard that looked
 * green while shipping stale branding:
 *   1. `setup.config.json` said `nikunjmavani/core-fe` while `catalog-info.yaml`
 *      said `core/core-fe` — two identity sources disagreeing.
 *   2. The locale transform covered `brand.name` but not `footerCopyright` or the
 *      onboarding question, leaving 22 stale user-visible strings after a rename.
 * The completeness invariant below is the generic answer to (2).
 */
const ROOT = process.cwd();
const read = (file: string): string => readFileSync(join(ROOT, file), 'utf8');
const LOCALES = ['ar', 'de', 'en', 'es', 'fr', 'hi', 'it', 'ja', 'ko', 'pt', 'zh'];

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

  it('leaves no trace of the old name after a rename', () => {
    // The completeness invariant: a partial transform is worse than none, because
    // drift stays clean and the rename reports success while branding is stale.
    expect(findIncompleteTransforms(identity, ROOT)).toEqual([]);
  });

  it('keeps the generated module byte-identical to its renderer', () => {
    expect(read('src/lib/product-identity.ts')).toBe(
      renderProductIdentityModule(identity),
    );
  });

  it('covers every surface that embeds the product or package name', () => {
    const files = derivedSurfaces(identity, ROOT).map((surface) => surface.file);
    for (const expected of [
      'src/lib/product-identity.ts',
      'package.json',
      'public/manifest.webmanifest',
      'public/app-icon.svg',
      'public/offline.html',
      'public/robots.txt',
      'catalog-info.yaml',
      '.github/CODEOWNERS',
      '.github/workflows/preview.yml',
      '.github/workflows/reusable-netlify-deploy.yml',
      'sonar-project.properties',
      'docker-compose.sonar.yml',
    ]) {
      expect(files).toContain(expected);
    }
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
    expect(read('src/lib/routes/page-head.ts')).toContain(
      "from '@/lib/product-identity.ts'",
    );
    expect(read('src/core/config/app-manifest.ts')).toContain(
      "from '@/lib/product-identity.ts'",
    );
  });

  describe('translated copy carries no brand', () => {
    it('resolves {{productName}} from the identity block', () => {
      // Without this wiring every {{productName}} would render empty.
      const config = read('src/lib/i18n/i18n.ts');
      expect(config).toContain("from '@/lib/product-identity.ts'");
      expect(config).toContain('defaultVariables: { productName: PRODUCT_NAME }');
    });

    it.each(LOCALES)('%s locale uses the variable, not the product name', (locale) => {
      for (const namespace of ['layout', 'onboarding']) {
        const json = read(`src/locales/${locale}/${namespace}.json`);
        expect(json).toContain('{{productName}}');
        // ASCII-bounded, not \b — Korean reads "Core를" with no space and Hangul
        // counts as a Unicode word char, so \b would not match it.
        expect(json.match(wholeWord(identity.productName))).toBeNull();
      }
    });

    it('keeps locale files off the rebrand surface entirely', () => {
      const files = derivedSurfaces(identity, ROOT).map((surface) => surface.file);
      expect(files.filter((file) => file.startsWith('src/locales/'))).toEqual([]);
    });
  });

  describe('two-name model', () => {
    it('does not list docs/ or agent-os/ prose as a rebrand surface', () => {
      const files = derivedSurfaces(identity, ROOT).map((surface) => surface.file);
      expect(
        files.filter((file) => file.startsWith('docs/') || file.startsWith('agent-os/')),
      ).toEqual([]);
    });

    it('keeps the platform name in the identity block', () => {
      // core-fe names the PLATFORM this repo is. A fork keeps it so platform
      // prose stays true and upstream merges do not conflict across ~120 files.
      expect(identity.platformName).toBe('core-fe');
      expect(read('tooling/setup/setup.config.json')).toContain('"platformName"');
    });
  });
});
