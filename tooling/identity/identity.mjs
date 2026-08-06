/**
 * Product identity — the single source of truth and every surface derived from it.
 *
 * `tooling/setup/setup.config.json` → `project.*` owns the product's identity.
 * This module turns that config into the exact expected content of every file
 * that embeds it, so three consumers share one definition and can never disagree:
 *
 *   - `tooling/identity/rebrand.mjs`      writes the derived state (`pnpm rebrand`)
 *   - `tooling/validate/identity.mjs`     fails when a file drifts (`pnpm validate:identity`)
 *   - `tests/ci/identity.policy.test.ts`  locks the contract in the ci-policy project
 *
 * Every surface exposes ONE `apply(text)` transform, anchored on file
 * *structure* (`"name": "…"`) rather than on the previous value. That makes it
 * both the rewriter and the checker: applying it to an in-sync file is a no-op,
 * so `apply(text) === text` IS the drift check. A rename therefore needs no
 * knowledge of the old name.
 *
 * ── Total rename ─────────────────────────────────────────────────────────────
 * A rebrand rewrites the name EVERYWHERE, prose included: a derived product keeps
 * no trace of the name it came from. That is a deliberate product decision, and it
 * has a cost worth stating — because docs and agent-os prose diverge from upstream,
 * `git merge upstream/main` conflicts across ~120 files on every platform update.
 * The alternative (keeping a separate platform name in prose) was rejected: a repo
 * that half-says the old name reads as a mistake.
 *
 * Three things are still NOT rewritten, for reasons that are not branding:
 *   - `core-be` — a separate backend SERVICE this app calls. Renaming it would
 *     break `contracts:drift` (it reads `../core-be/docs/routes.txt`) and leave
 *     comments describing a backend that does not exist. Point it elsewhere with
 *     `$CORE_BE_DIR`, don't rename it.
 *   - `CHANGELOG.md` — the release history actually happened under the old name.
 *   - {@link PROTECTED_PHRASES} — "Core Web Vitals" is Google's metric, not this
 *     product; a blanket rename invented a metric that does not exist.
 *
 * `previousNames` records every name this repo has carried, and
 * `pnpm validate:identity` fails if any of them reappears — so the old name cannot
 * creep back in through a merge or a copy-paste.
 */
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const SETUP_CONFIG = 'tooling/setup/setup.config.json';

/**
 * @typedef {object} Identity
 * @property {string} name            Repo + package name (`core-fe`).
 * @property {string} displayName     Human repo label ("Core Frontend").
 * @property {string} organization    Owning organization slug.
 * @property {string} productName     User-visible product name ("Core").
 * @property {string} productDescription  One-line product description.
 * @property {string} themeColor      PWA / browser-chrome theme colour.
 * @property {string} backgroundColor PWA splash background colour.
 * @property {string} codeowner       Default CODEOWNERS handle (`@user` or `@org/team`).
 * @property {string} repository      GitHub `owner/repo` slug.
 */

/** Load and validate the identity block from `setup.config.json`. */
export function loadIdentity(root = ROOT) {
  const raw = JSON.parse(readFileSync(join(root, SETUP_CONFIG), 'utf8'));
  const project = raw.project ?? {};
  const identity = {
    name: project.name,
    displayName: project.displayName,
    organization: project.organization,
    productName: project.productName,
    productDescription: project.productDescription,
    themeColor: project.themeColor,
    backgroundColor: project.backgroundColor,
    codeowner: project.codeowner,
    repository: raw.providers?.github?.repository,
  };

  const missing = Object.entries(identity)
    .filter(([, value]) => typeof value !== 'string' || value.length === 0)
    .map(([key]) => key);
  if (missing.length > 0) {
    throw new Error(
      `${SETUP_CONFIG} is missing identity field(s): ${missing.join(', ')}. ` +
        'See docs/getting-started/new-project.md.',
    );
  }
  // Every name this repo has carried. Validated separately from the string fields
  // above because it is a list, and empty is the correct value for a repo that has
  // never been renamed.
  return { ...identity, previousNames: project.previousNames ?? [] };
}

/** Escape a value for safe use inside a single-quoted TypeScript string. */
const tsString = (value) => `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/**
 * Render `src/lib/product-identity.ts` — the ONE module app code imports product
 * identity from. Lives in `lib` because it is the bottom layer: `src/lib/routes/
 * page-head.ts` may import only `lib` and `core/types`, and `core` may import `lib`.
 */
export function renderProductIdentityModule(identity) {
  return `/**
 * GENERATED FILE — do not edit by hand.
 *
 * Source of truth: \`tooling/setup/setup.config.json\` → \`project.*\`.
 * Regenerate:      \`pnpm identity:sync\`
 * Rename product:  \`pnpm rebrand "<Product Name>"\`
 * Guarded by:      \`pnpm validate:identity\` + \`tests/ci/identity.policy.test.ts\`
 *
 * This is the only place app code may read the product name from — a hardcoded
 * brand literal anywhere under \`src/\` fails \`pnpm validate:identity\`.
 */

/** User-visible product name — document titles, PWA manifest, layout brand. */
export const PRODUCT_NAME = ${tsString(identity.productName)};

/** One-line product description — \`<meta name="description">\` and the manifest. */
export const PRODUCT_DESCRIPTION = ${tsString(identity.productDescription)};

/** Browser chrome / PWA \`theme_color\`. */
export const PRODUCT_THEME_COLOR = ${tsString(identity.themeColor)};

/** PWA splash \`background_color\`. */
export const PRODUCT_BACKGROUND_COLOR = ${tsString(identity.backgroundColor)};
`;
}

/**
 * Replace the first capture-group-anchored value. `pattern` must contain exactly
 * one capture group for the prefix; the value that follows is replaced wholesale.
 */
const replaceValue = (pattern, value) => (text) =>
  text.replace(pattern, (match, prefix) => `${prefix}${value(match, prefix)}`);

/**
 * Every file whose content is derived from the identity block.
 *
 * @returns {Array<{ file: string, label: string, apply: (text: string, identity: Identity) => string }>}
 */
export function derivedSurfaces(identity, root = ROOT) {
  const { name, displayName, productName, productDescription, codeowner, repository } =
    identity;
  const themeColor = identity.themeColor;
  const [repoOwner] = repository.split('/');
  const ownerHandle = codeowner.startsWith('@') ? codeowner : `@${codeowner}`;

  /** @type {Array<{ file: string, label: string, apply: (text: string) => string }>} */
  const surfaces = [
    {
      file: 'src/lib/product-identity.ts',
      label: 'generated product identity module',
      apply: () => renderProductIdentityModule(identity),
    },
    {
      file: 'package.json',
      label: 'package name',
      apply: replaceValue(/^(\s*"name":\s*)"[^"]*"/m, () => `"${name}"`),
    },
    {
      file: 'sonar-project.properties',
      label: 'SonarQube project key + name',
      apply: (text) =>
        text
          .replace(/^(sonar\.projectKey=).*$/m, `$1${name}`)
          .replace(/^(sonar\.projectName=).*$/m, `$1${name}`),
    },
    {
      file: 'typedoc.json',
      label: 'API reference title',
      apply: replaceValue(/("name":\s*)"[^"]*"/, () => `"${name} API Reference"`),
    },
    {
      file: '.github/release-please/config.json',
      label: 'release-please package name',
      apply: replaceValue(/("package-name":\s*)"[^"]*"/, () => `"${name}"`),
    },
    {
      file: '.github/codeql/codeql-config.yml',
      label: 'CodeQL config name',
      apply: (text) =>
        text
          .replace(/^(# CodeQL analysis configuration for ).*$/m, `$1${name}.`)
          .replace(/^(name:\s*).*(CodeQL config)$/m, `$1${name} $2`),
    },
    {
      file: 'public/manifest.webmanifest',
      label: 'PWA manifest branding',
      apply: (text) =>
        text
          .replace(/^(\s*"name":\s*)"[^"]*"/m, `$1"${productName}"`)
          .replace(/^(\s*"short_name":\s*)"[^"]*"/m, `$1"${productName}"`)
          .replace(/^(\s*"description":\s*)"[^"]*"/m, `$1"${productDescription}"`)
          .replace(/^(\s*"theme_color":\s*)"[^"]*"/m, `$1"${themeColor}"`)
          .replace(
            /^(\s*"background_color":\s*)"[^"]*"/m,
            `$1"${identity.backgroundColor}"`,
          ),
    },
    {
      file: 'public/app-icon.svg',
      label: 'app icon accessible name',
      apply: replaceValue(/(aria-label=)"[^"]*"/, () => `"${productName}"`),
    },
    {
      file: 'catalog-info.yaml',
      label: 'Backstage catalog entry',
      apply: (text) =>
        text
          .replace(/^(\s*name:\s*).*$/m, `$1${name}`)
          .replace(/^(\s*title:\s*).*$/m, `$1${displayName}`)
          .replace(/^(\s*github\.com\/project-slug:\s*).*$/m, `$1${repository}`)
          .replace(
            /^(\s*backstage\.io\/source-location:\s*url:https:\/\/github\.com\/).*$/m,
            `$1${repository}`,
          )
          .replace(/^(\s*sentry\.io\/project-slug:\s*).*$/m, `$1${name}`)
          .replace(
            /^(\s*- url:\s*https:\/\/github\.com\/).*(\/actions)$/m,
            `$1${repository}$2`,
          ),
    },
    {
      file: '.github/CODEOWNERS',
      label: 'default code owner',
      // Rule lines only — a handle mentioned in a `#` comment is prose, and
      // rewriting it would silently edit the file's own documentation.
      apply: (text) =>
        text
          .split('\n')
          .map((line) =>
            line.trimStart().startsWith('#')
              ? line
              : line.replace(/@[\w-]+(?:\/[\w-]+)?/g, ownerHandle),
          )
          .join('\n'),
    },
    {
      file: '.github/environments/production.json',
      label: 'production reviewer',
      apply: replaceValue(
        /("users":\s*)\[[^\]]*\]/,
        () => `["${ownerHandle.replace(/^@/, '')}"]`,
      ),
    },
    {
      file: '.github/workflows/reusable-netlify-deploy.yml',
      label: 'build artifact + Netlify site names',
      apply: (text) =>
        text
          .replace(/[\w-]+-dist\.tgz/g, `${name}-dist.tgz`)
          .replace(/(--repo\s+)\S+/g, `$1${repository}`)
          // Netlify site + alias hostnames named in the step comments. Left stale
          // these document the PREVIOUS product's deploy target, which is how a
          // forked team ends up looking at the wrong dashboard. The optional
          // `<alias>--` prefix must be preserved, so it is captured rather than
          // swallowed by the site-name match.
          .replace(
            /([\w-]*--)?[\w-]+(\.netlify\.app)/g,
            (_m, prefix, suffix) => `${prefix ?? ''}${name}${suffix}`,
          )
          .replace(/(shared\s+")[\w-]+(")/g, `$1${name}$2`),
    },
    {
      file: 'docker-compose.sonar.yml',
      label: 'Sonar container + project key',
      apply: (text) =>
        text
          .replace(/^(\s*container_name:\s*)[\w-]+(-sonarqube)$/m, `$1${name}$2`)
          .replace(/^(\s*container_name:\s*)[\w-]+(-sonar-scanner)$/m, `$1${name}$2`)
          .replace(/(-Dsonar\.projectKey=)\S+/g, `$1${name}`)
          .replace(/(-Dsonar\.projectName=)"[^"]*"/g, `$1"${name}"`)
          // "…so the gate can mint a <name> token" in the header comment.
          .replace(/(mint a )[\w-]+( token)/g, `$1${name}$2`),
    },
    {
      file: '.github/workflows/preview.yml',
      label: 'PR preview hostname',
      apply: (text) =>
        text.replace(
          /([\w-]*--)?[\w-]+(\.netlify\.app)/g,
          (_m, prefix, suffix) => `${prefix ?? ''}${name}${suffix}`,
        ),
    },
    {
      file: 'public/offline.html',
      label: 'offline page title',
      apply: replaceValue(/(<title>Offline — )[^<]*/, () => productName),
    },
    {
      file: 'public/robots.txt',
      label: 'robots.txt product reference',
      apply: (text) =>
        text.replace(/^(#\s*)\S+( is an authenticated)/m, `$1${productName}$2`),
    },
    {
      file: 'context7.json',
      label: 'Context7 description',
      apply: replaceValue(
        /("description":\s*)"Context7 library IDs for [^"]*"/,
        () =>
          `"Context7 library IDs for ${name} dependencies. Use in prompts: 'use context7 /library/id' or 'use context7' for auto-matching."`,
      ),
    },
  ];

  // NOTE: `src/locales/**` is deliberately NOT a surface. Locale files carry the
  // `{{productName}}` interpolation variable (resolved from this same identity by
  // `interpolation.defaultVariables` in src/lib/i18n/i18n.ts), so translated copy
  // holds no brand at all. Per-key transforms were the original approach and it
  // failed exactly as you'd expect: `brand.name` was covered while
  // `footerCopyright` and the onboarding question were not, leaving 22 stale
  // user-visible strings. Brand-as-variable removes the whole class.

  // `repoOwner` is derived above so a malformed `owner/repo` slug fails loudly here
  // rather than silently producing half-rewritten GitHub URLs.
  if (!repoOwner) {
    throw new Error(
      `providers.github.repository must be "owner/repo" — got "${repository}".`,
    );
  }

  return surfaces;
}

/** Never rewritten by a rename: real history and generated artifacts. */
const RENAME_SKIP_FILES = new Set([
  'CHANGELOG.md',
  'CHANGELOG-dev.md',
  'pnpm-lock.yaml',
  'sbom.cyclonedx.json',
]);

/**
 * Directory names skipped wherever they appear — build output and caches that are
 * never source, at any depth.
 */
const RENAME_SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'coverage',
  '.stryker-tmp',
  '.netlify',
  '.pnpm-store',
  '__pycache__',
]);

/**
 * Directories skipped only at the repo ROOT.
 *
 * Kept separate from the name-based set because `reports/` at the root is generated
 * output while `tooling/reports/` is source — matching on the bare name silently
 * skipped the project-tree generator, leaving a hardcoded name behind after a
 * rename that otherwise reported success.
 */
const RENAME_SKIP_ROOT_DIRS = new Set(['reports', 'test-results']);

/** Extensions treated as text for a repo-wide rename. */
const TEXT_EXTENSIONS = [
  '.ts',
  '.tsx',
  '.mts',
  '.mjs',
  '.cjs',
  '.js',
  '.json',
  '.jsonc',
  '.md',
  '.mdc',
  '.yml',
  '.yaml',
  '.html',
  '.txt',
  '.svg',
  '.css',
  '.sh',
  '.py',
  '.properties',
  '.toml',
  '.webmanifest',
  '.example',
];

/**
 * Match a slug as a whole word where a hyphen counts as a boundary, so
 * `core-fe-dist.tgz` and `development--core-fe.netlify.app` both match while
 * `core-fetch` does not. Distinct from {@link wholeWord}, which treats `-` as part
 * of the word — correct for a display name, wrong for a hyphenated slug.
 */
export function slugWord(value) {
  return new RegExp(
    `(?<!\\w)${value.replace(/[$()*+.?[\\\]^{|}]/g, '\\$&')}(?!\\w)`,
    'g',
  );
}

/**
 * Walk every text file eligible for a repo-wide rename.
 *
 * Symlinks are skipped via `lstatSync`, for two reasons: `.cursor/`, `.claude/` and
 * `.codex/` symlink into `agent-os/`, so following them would rewrite the same file
 * two or three times; and a fresh clone has dangling links whose targets are
 * gitignored, which made `statSync` throw ENOENT and abort the whole rename.
 */
export function renameableFiles(root = ROOT, dir = root, out = []) {
  for (const entry of readdirSync(dir)) {
    if (RENAME_SKIP_DIRS.has(entry)) continue;
    if (dir === root && RENAME_SKIP_ROOT_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stats = lstatSync(full);
    if (stats.isSymbolicLink()) continue;
    if (stats.isDirectory()) {
      renameableFiles(root, full, out);
      continue;
    }
    const rel = relative(root, full);
    if (RENAME_SKIP_FILES.has(rel) || RENAME_SKIP_FILES.has(entry)) continue;
    if (TEXT_EXTENSIONS.some((ext) => entry.endsWith(ext)) || !entry.includes('.')) {
      out.push(rel);
    }
  }
  return out;
}

/**
 * Phrases that contain the product name but are NOT this product.
 *
 * "Core Web Vitals" is Google's metric name, not this product. A blanket rename
 * rewrote it in 14 files, inventing a metric that does not exist. Protected phrases
 * are masked before replacement and restored after, so they survive verbatim. Add
 * to this list rather than weakening the rename.
 */
const PROTECTED_PHRASES = ['Core Web Vitals'];

const PROTECT_SENTINEL = ' PROTECTED';

/** Mask protected phrases so a rename cannot rewrite them. */
function maskProtected(text) {
  return PROTECTED_PHRASES.reduce(
    (acc, phrase, index) => acc.split(phrase).join(`${PROTECT_SENTINEL}${index} `),
    text,
  );
}

/** Restore masked phrases. */
function unmaskProtected(text) {
  return PROTECTED_PHRASES.reduce(
    (acc, phrase, index) => acc.split(`${PROTECT_SENTINEL}${index} `).join(phrase),
    text,
  );
}

/**
 * Rewrite every occurrence of a name across the repo.
 *
 * This is the prose half of a rename — the part no structural transform can cover,
 * because "core-fe is trunk-based" has no anchor to hook. It is deliberately
 * old-value-anchored (unlike the surface transforms), which is why it lives here
 * rather than in {@link derivedSurfaces}: it can only run when the previous name is
 * known, i.e. during an actual rename.
 *
 * @returns {Array<{ file: string, count: number, next: string }>} changed files.
 */
export function planRename(root, replacements) {
  const changes = [];
  for (const file of renameableFiles(root)) {
    const before = readFileSync(join(root, file), 'utf8');
    let next = maskProtected(before);
    let count = 0;
    for (const [from, to] of replacements) {
      if (!from || from === to) continue;
      const pattern = from.includes('-') ? slugWord(from) : wholeWord(from);
      const matches = next.match(pattern);
      if (!matches) continue;
      count += matches.length;
      next = next.replace(pattern, to);
    }
    next = unmaskProtected(next);
    if (count > 0 && next !== before) changes.push({ file, count, next });
  }
  return changes;
}

/**
 * Occurrences of a name this repo used to carry.
 *
 * The permanent guard against the old name returning — through an upstream merge,
 * a copy-paste, or a half-finished sweep.
 *
 * @returns {Array<{ file: string, name: string, count: number }>}
 */
export function findPreviousNames(identity, root = ROOT) {
  const previous = identity.previousNames ?? [];
  if (previous.length === 0) return [];
  const found = [];
  for (const file of renameableFiles(root)) {
    // Two masks before counting, or the guard cries wolf on its own machinery:
    //  - protected phrases ("Core Web Vitals") are preserved BY DESIGN;
    //  - the `previousNames` list itself is the one place that must still hold the
    //    retired names, otherwise the guard erases the evidence it runs on.
    let text = maskProtected(readFileSync(join(root, file), 'utf8'));
    text = text.replace(/("previousNames":\s*)\[[^\]]*\]/, '$1[]');
    for (const name of previous) {
      const pattern = name.includes('-') ? slugWord(name) : wholeWord(name);
      const count = (text.match(pattern) ?? []).length;
      if (count > 0) found.push({ file, name, count });
    }
  }
  return found;
}

/**
 * Match a name as a whole word, bounded by ASCII word characters only.
 *
 * Deliberately not `\b`: Korean copy reads "Core를" with no space, and Hangul is a
 * Unicode word character, so `\bCore\b` silently fails to match it.
 */
export function wholeWord(value) {
  return new RegExp(
    `(?<![\\w-])${value.replace(/[$()*+.?[\\\]^{|}]/g, '\\$&')}(?![\\w-])`,
    'g',
  );
}

/**
 * Completeness invariant: pretend to rename, then assert no surface still holds
 * the OLD name.
 *
 * This is the generic guard for the failure mode that per-surface transforms keep
 * producing — a transform that covers *some* of a file's brand occurrences reads
 * as working (drift is clean, the rename "succeeds") while shipping stale
 * branding. Rather than enumerate the places to check, this applies a fake rename
 * and demands zero survivors.
 *
 * @returns {Array<{ file: string, label: string, stale: string, count: number }>}
 */
export function findIncompleteTransforms(identity, root = ROOT) {
  const renamed = {
    ...identity,
    name: 'zzrenamedpkg',
    productName: 'ZzRenamedProduct',
    displayName: 'ZzRenamedProduct Frontend',
    repository: `${identity.repository.split('/')[0]}/zzrenamedpkg`,
  };
  const incomplete = [];
  // Surfaces must be built FROM the renamed identity: each transform closes over
  // the identity passed to derivedSurfaces() and ignores its own argument, so
  // apply(text, renamed) on a surface built from the current identity is a no-op
  // rename that would silently pass this check.
  for (const surface of derivedSurfaces(renamed, root)) {
    const after = surface.apply(readFileSync(join(root, surface.file), 'utf8'));
    for (const stale of [identity.productName, identity.name]) {
      const count = (after.match(wholeWord(stale)) ?? []).length;
      if (count > 0) {
        incomplete.push({ file: surface.file, label: surface.label, stale, count });
      }
    }
  }
  return incomplete;
}

/**
 * Compare every derived surface against the identity block.
 *
 * @returns {Array<{ file: string, label: string }>} surfaces whose on-disk content
 *   differs from what the identity block implies (empty when in sync).
 */
export function findDrift(identity, root = ROOT) {
  const drifted = [];
  for (const surface of derivedSurfaces(identity, root)) {
    const path = join(root, surface.file);
    const current = readFileSync(path, 'utf8');
    if (surface.apply(current, identity) !== current) {
      drifted.push({ file: surface.file, label: surface.label });
    }
  }
  return drifted;
}
