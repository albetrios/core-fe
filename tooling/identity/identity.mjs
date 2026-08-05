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
 * Every surface exposes ONE `apply(text, identity)` transform, anchored on file
 * *structure* (`"name": "…"`) rather than on the previous value. That makes it
 * both the rewriter and the checker: applying it to an in-sync file is a no-op,
 * so `apply(text) === text` IS the drift check. A rename therefore needs no
 * knowledge of the old name.
 *
 * ── The two-name model ──────────────────────────────────────────────────────
 * `platformName` ("core-fe") names the upstream platform this repo IS, and is
 * deliberately NOT rewritten on rebrand — docs and agent-os prose describing the
 * platform stay accurate in a derived product, and forks keep clean upstream
 * merges. `name` / `productName` / `codeowner` are the *product*'s identity and
 * are rewritten. See docs/getting-started/new-project.md.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const SETUP_CONFIG = 'tooling/setup/setup.config.json';

/**
 * @typedef {object} Identity
 * @property {string} name            Repo + package name (`core-fe`).
 * @property {string} displayName     Human repo label ("Core Frontend").
 * @property {string} organization    Owning organization slug.
 * @property {string} platformName    Upstream platform name — never rebranded.
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
    platformName: project.platformName,
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
  return identity;
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

/** Replace a whole file with generated content. */
const generated = (render) => (_text, identity) => render(identity);

/**
 * Replace the first capture-group-anchored value. `pattern` must contain exactly
 * one capture group for the prefix; the value that follows is replaced wholesale.
 */
const replaceValue = (pattern, value) => (text) =>
  text.replace(pattern, (match, prefix) => `${prefix}${value(match, prefix)}`);

/** List the locale directories that carry a translated `layout` namespace. */
export function localeLayoutFiles(root = ROOT) {
  const localesDir = join(root, 'src/locales');
  return readdirSync(localesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `src/locales/${entry.name}/layout.json`)
    .sort();
}

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

  /** @type {Array<{ file: string, label: string, apply: (text: string, identity: Identity) => string }>} */
  const surfaces = [
    {
      file: 'src/lib/product-identity.ts',
      label: 'generated product identity module',
      apply: generated(renderProductIdentityModule),
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
      label: 'build artifact name',
      apply: (text) =>
        text
          .replace(/[\w-]+-dist\.tgz/g, `${name}-dist.tgz`)
          .replace(/(--repo\s+)\S+/g, `$1${repository}`),
    },
    {
      file: 'docker-compose.sonar.yml',
      label: 'Sonar container + project key',
      apply: (text) =>
        text
          .replace(/^(\s*container_name:\s*)[\w-]+(-sonarqube)$/m, `$1${name}$2`)
          .replace(/^(\s*container_name:\s*)[\w-]+(-sonar-scanner)$/m, `$1${name}$2`)
          .replace(/(-Dsonar\.projectKey=)\S+/g, `$1${name}`)
          .replace(/(-Dsonar\.projectName=)"[^"]*"/g, `$1"${name}"`),
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

  for (const file of localeLayoutFiles(root)) {
    surfaces.push({
      file,
      label: `locale brand name (${file.split('/')[2]})`,
      apply: replaceValue(
        /("brand":\s*\{\s*"name":\s*)"[^"]*"/,
        () => `"${productName}"`,
      ),
    });
  }

  // `repoOwner` is derived above so a malformed `owner/repo` slug fails loudly here
  // rather than silently producing half-rewritten GitHub URLs.
  if (!repoOwner) {
    throw new Error(
      `providers.github.repository must be "owner/repo" — got "${repository}".`,
    );
  }

  return surfaces;
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
