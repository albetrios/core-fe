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
  /** Upstream platform name — never rewritten by a rebrand (the two-name model). */
  platformName: string;
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
}

/** A file whose content is derived from the identity block. */
export interface DerivedSurface {
  /** Repo-relative path. */
  file: string;
  /** Human label used in CLI output and failure messages. */
  label: string;
  /** Idempotent, structurally anchored rewrite — a no-op when already in sync. */
  apply: (text: string, identity: Identity) => string;
}

/** Repo root resolved from this module's location. */
export const ROOT: string;

/** Load and validate the identity block from `setup.config.json`. */
export function loadIdentity(root?: string): Identity;

/** Render the generated `src/lib/product-identity.ts` source. */
export function renderProductIdentityModule(identity: Identity): string;

/** Locale `layout.json` paths, one per locale directory. */
export function localeLayoutFiles(root?: string): string[];

/** Every file whose content is derived from the identity block. */
export function derivedSurfaces(identity: Identity, root?: string): DerivedSurface[];

/** Surfaces whose on-disk content disagrees with the identity block. */
export function findDrift(
  identity: Identity,
  root?: string,
): Array<{ file: string; label: string }>;
