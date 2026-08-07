/**
 * Types for `identity.mjs`. The module is plain JS (it runs under bare `node` in
 * `pnpm rebrand` / `pnpm validate:identity`, with no tsx step), so its contract
 * is declared here for the TypeScript consumers — `tests/ci/identity.policy.test.ts`.
 */

/** The product identity block from `tooling/setup/setup.config.json` → `project.*`. */
export interface Identity {
  /** Repo + package name (`core-fe`). */
  name: string;
  /** Human repo label ("Core Frontend"). */
  displayName: string;
  /** Owning organization slug. */
  organization: string;
  /** User-visible product name ("Core"). */
  productName: string;
  /** One-line product description. */
  productDescription: string;
  /** PWA / browser-chrome theme colour. */
  themeColor: string;
  /** PWA splash background colour. */
  backgroundColor: string;
  /** Default CODEOWNERS handle (`@user` or `@org/team`). */
  codeowner: string;
  /** GitHub `owner/repo` slug. */
  repository: string;
  /** Sibling backend repo this app calls (`core-be`) — renamed with the product. */
  backendName: string;
  /** Prefix for storage keys / channel names (`core`). */
  namespace: string;
  /** Every name this repo has carried; `validate:identity` fails if one reappears. */
  previousNames: string[];
}

/** A file whose content is derived from the identity block. */
export interface DerivedSurface {
  /** Repo-relative path. */
  file: string;
  /** Human label used in CLI output and failure messages. */
  label: string;
  /**
   * Idempotent, structurally anchored rewrite — a no-op when already in sync.
   *
   * Closes over the identity passed to `derivedSurfaces()`, so to simulate a
   * rename you rebuild the surfaces from the new identity rather than passing it
   * here.
   */
  apply: (text: string) => string;
}

/** Repo root resolved from this module's location. */
export const ROOT: string;

/** Load and validate the identity block from `setup.config.json`. */
export function loadIdentity(root?: string): Identity;

/** Render the generated `src/lib/product-identity.ts` source. */
export function renderProductIdentityModule(identity: Identity): string;

/** Every file whose content is derived from the identity block. */
export function derivedSurfaces(identity: Identity, root?: string): DerivedSurface[];

/** `core-be` → `CORE_BE_DIR` — the env var that relocates the sibling checkout. */
export function backendDirEnvVar(backendName: string): string;

/** Case-insensitive slug matcher — catches a sentence-capitalised slug. */
export function slugWordCI(value: string): RegExp;

/** Match an UPPER_SNAKE token plus suffixes (`<SLUG>_BE` hits `<SLUG>_BE_DIR`). */
export function upperSnakePrefix(value: string): RegExp;

/** Match a camelCase identifier prefix — `<slug>Fe` hits `__<slug>FeRouter`. */
export function camelPrefix(value: string): RegExp;

/** Kebab slug to its camelCase spelling. */
export function kebabToCamel(value: string): string;

/** Kebab slug to its UPPER_SNAKE spelling. */
export function kebabToUpperSnake(value: string): string;

/** Pick the matcher for a token by its shape. */
export function patternFor(from: string): { regex: RegExp; preserveCase: boolean };

/** Match a name as a whole word, bounded by ASCII word characters only. */
export function wholeWord(value: string): RegExp;

/** Match a hyphenated slug, treating `-` as a boundary (`core-fe-dist` matches). */
export function slugWord(value: string): RegExp;

/** Every text file eligible for a repo-wide rename (history/generated excluded). */
export function renameableFiles(root?: string): string[];

/** Plan a repo-wide rename: `[from, to]` pairs applied to every renameable file. */
export function planRename(
  root: string,
  replacements: Array<[string, string]>,
): Array<{ file: string; count: number; next: string }>;

/** Occurrences of a name this repo used to carry — must always be empty. */
export function findPreviousNames(
  identity: Identity,
  root?: string,
): Array<{ file: string; name: string; count: number }>;

/** Surfaces whose transform leaves the old name behind after a rename. */
export function findIncompleteTransforms(
  identity: Identity,
  root?: string,
): Array<{ file: string; label: string; stale: string; count: number }>;

/** Surfaces whose on-disk content disagrees with the identity block. */
export function findDrift(
  identity: Identity,
  root?: string,
): Array<{ file: string; label: string }>;
