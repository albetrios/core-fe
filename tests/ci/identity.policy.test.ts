import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  backendDirEnvVar,
  derivedSurfaces,
  findDrift,
  findIncompleteTransforms,
  findPreviousNames,
  loadIdentity,
  planRename,
  renamedFiles,
  renderProductIdentityModule,
  staleBaselines,
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
      // `previousNames` is a list (empty is correct for a never-renamed repo).
      .filter(([key]) => key !== 'previousNames')
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

  describe('total rename', () => {
    const rename = (): Array<{ file: string; count: number; next: string }> =>
      planRename(ROOT, [
        [identity.name, 'zzslug-fe'],
        [identity.productName, 'ZzProduct'],
        [identity.displayName, 'ZzProduct Frontend'],
      ]);

    it('reaches prose that no structural transform can anchor', () => {
      // "core-fe is trunk-based" has nothing to hook, so a rename must sweep text
      // files too. Without this pass a derived product keeps ~200 stale mentions.
      const plan = rename();
      expect(plan.length).toBeGreaterThan(100);
      expect(plan.map((change) => change.file)).toContain(
        'docs/process/trunk-based-workflow.md',
      );
    });

    /**
     * Count a phrase before vs after a rename.
     *
     * Compared as counts rather than by searching the output for a renamed variant,
     * because this very file contains those sentinels as source text — a
     * `not.toMatch(/…-be/)` assertion matches its own regex literal and fails.
     */
    const preservedEverywhere = (phrase: string): void => {
      for (const change of rename()) {
        const before = read(change.file).split(phrase).length - 1;
        const after = change.next.split(phrase).length - 1;
        expect(after, `${phrase} changed in ${change.file}`).toBe(before);
      }
    };

    it('renames the sibling backend with the product', () => {
      // A derived product normally forks the backend too, so the frontend's ~450
      // references must follow — including contracts:drift, which resolves
      // ../<backendName>/docs/routes.txt, and the uppercase env-var spelling, which
      // is a distinct token the slug pass cannot see.
      const plan = planRename(ROOT, [
        [identity.backendName, 'zzslug-be'],
        [backendDirEnvVar(identity.backendName), backendDirEnvVar('zzslug-be')],
      ]);
      const files = plan.map((change) => change.file);
      expect(files).toContain('tooling/ci/check-api-contract-drift.mjs');
      const drift = plan.find(
        (change) => change.file === 'tooling/ci/check-api-contract-drift.mjs',
      );
      expect(drift?.next).toContain('../zzslug-be');
      expect(drift?.next).toContain('ZZSLUG_BE_DIR');
      expect(drift?.next).not.toContain('CORE_BE_DIR');
    });

    it('derives the backend env-var name from the backend slug', () => {
      expect(backendDirEnvVar('core-be')).toBe('CORE_BE_DIR');
      expect(backendDirEnvVar('acme-be')).toBe('ACME_BE_DIR');
    });

    it('preserves phrases that merely contain the product name', () => {
      // "Core Web Vitals" is Google's metric. A blanket rename invented a metric
      // that does not exist, in 14 files.
      preservedEverywhere('Core Web Vitals');
    });

    it('leaves real history and generated artifacts alone', () => {
      const files = rename().map((change) => change.file);
      expect(files).not.toContain('CHANGELOG.md');
      expect(files).not.toContain('pnpm-lock.yaml');
    });

    it('renames files whose NAME embeds the identity', () => {
      // Contents-only rewriting left a derived product with files literally named
      // after the previous product, reddening tool:project-structure-tree:check on
      // every adoption. Nothing renamed files before this.
      expect(renamedFiles(identity, ROOT)).toEqual([]);
      const renamed = { ...identity, backendName: 'zzslug-be' };
      const pending = renamedFiles(renamed, ROOT);
      expect(pending.length).toBeGreaterThan(0);
      expect(pending[0]?.to).toContain('zzslug-be-sample-responses.json');
    });

    it('runs the rebrand script without a scope error', () => {
      // A local `let renamedFiles` once shadowed the imported function for the whole
      // function scope, so the on-disk rename hit a temporal-dead-zone ReferenceError
      // and crashed the whole script. Assert the identifier is not re-bound locally.
      const script = read('tooling/identity/rebrand.mjs');
      expect(script).not.toMatch(/\b(?:let|const|var)\s+renamedFiles\b/);
    });

    it('deletes visual baselines, which no text rewrite can rebrand', () => {
      // The baselines RENDER the brand. Left in place after a rename they fail
      // SILENTLY: at maxDiffPixelRatio 0.02 the light ones still pass while
      // encoding the previous logo, so a derived product fixes the 2 dark failures
      // and ships 3 baselines asserting the old brand is correct. `pnpm rebrand`
      // deletes them so the next `test:visual` fails loudly instead.
      const baselines = staleBaselines(ROOT);
      expect(baselines.length).toBeGreaterThan(0);
      for (const file of baselines) {
        expect(file).toMatch(/^tests\/e2e\/visual\.e2e\.test\.ts-snapshots\/.+\.png$/);
      }
      // Pins the wiring: the helper existing is useless if rebrand never calls it.
      expect(read('tooling/identity/rebrand.mjs')).toContain('staleBaselines(ROOT)');
    });

    it('has no retired name still present', () => {
      // `previousNames` grows on every rename; this must always be empty.
      expect(findPreviousNames(identity, ROOT)).toEqual([]);
      expect(read('tooling/setup/setup.config.json')).toContain('"previousNames"');
    });
  });
});
