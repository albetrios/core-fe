/**
 * `pnpm rebrand` — rename the product this repo builds.
 *
 * Rewrites every file that embeds product identity, driven entirely by
 * `tooling/setup/setup.config.json` → `project.*` and the surface list in
 * `./identity.mjs`. Dry-run by default: nothing is written without `--apply`.
 *
 *   pnpm rebrand "Acme Portal"                        preview every change
 *   pnpm rebrand "Acme Portal" --apply                write them
 *   pnpm rebrand "Acme Portal" --repo acme/acme-fe \
 *       --owner @acme/frontend --apply
 *   pnpm identity:sync                                re-derive files, no rename
 *
 * What it deliberately does NOT touch:
 *   - `core-be` — a separate backend SERVICE this app calls, not this product's
 *     name. Renaming it would break `contracts:drift` and describe a backend
 *     that does not exist; point it elsewhere with `$CORE_BE_DIR` instead.
 *   - `CHANGELOG.md` and git history — the release history of the upstream
 *     platform is a fact, not branding.
 *   - Anything requiring credentials (Netlify, GitHub, Sentry, PostHog) or a
 *     binary toolchain (PNG icon regeneration) — those are printed as a
 *     checklist instead of being half-done silently.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { derivedSurfaces, loadIdentity, planRename, ROOT } from './identity.mjs';

const BOLD = '[1m';
const DIM = '[2m';
const GREEN = '[32m';
const YELLOW = '[33m';
const RESET = '[0m';

/** Parse `--flag value` pairs and bare `--flag` switches. */
function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      flags[key] = next;
      i += 1;
    } else {
      flags[key] = true;
    }
  }
  return { positional, flags };
}

/** "Acme Portal" → "acme-portal" */
const kebab = (value) =>
  value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\dA-Za-z]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

/**
 * Default repo/package name for a product, preserving the current suffix
 * convention (`core-fe` → `acme-portal-fe`).
 */
function defaultRepoName(productName, currentName) {
  const slug = kebab(productName);
  const suffix = /-(fe|ui|web|app)$/.exec(currentName);
  return suffix && !slug.endsWith(suffix[0]) ? `${slug}${suffix[0]}` : slug;
}

/** First differing line of each side, for a compact dry-run preview. */
function previewChange(before, after) {
  const a = before.split('\n');
  const b = after.split('\n');
  const changes = [];
  for (let i = 0; i < Math.max(a.length, b.length) && changes.length < 3; i += 1) {
    if (a[i] !== b[i]) changes.push({ line: i + 1, before: a[i], after: b[i] });
  }
  return changes;
}

function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const sync = Boolean(flags.sync);
  const apply = Boolean(flags.apply);
  const current = loadIdentity();

  if (!sync && positional.length === 0) {
    console.error(`${BOLD}pnpm rebrand "<Product Name>" [options]${RESET}

  --name <repo-name>      package + repo name       (default: derived from product name)
  --repo <owner/repo>     GitHub slug               (default: keep current owner)
  --owner <@handle>       CODEOWNERS handle         (default: keep current)
  --description "<text>"  product description       (default: keep current)
  --apply                 write changes (default is a dry run)

Current identity: ${current.productName} (${current.name}) — ${current.repository}
See docs/getting-started/new-project.md.`);
    process.exitCode = 1;
    return;
  }

  const productName = sync ? current.productName : positional[0];
  const name =
    typeof flags.name === 'string'
      ? flags.name
      : sync
        ? current.name
        : defaultRepoName(productName, current.name);
  const repository =
    typeof flags.repo === 'string'
      ? flags.repo
      : `${current.repository.split('/')[0]}/${name}`;
  const codeowner = typeof flags.owner === 'string' ? flags.owner : current.codeowner;
  const productDescription =
    typeof flags.description === 'string'
      ? flags.description
      : current.productDescription;

  const next = {
    ...current,
    name,
    displayName: sync ? current.displayName : `${productName} Frontend`,
    productName,
    productDescription,
    codeowner: codeowner.startsWith('@') ? codeowner : `@${codeowner}`,
    repository,
  };

  console.log(
    `\n${BOLD}${sync ? 'Identity sync' : 'Rebrand'}${RESET} — ${
      apply
        ? `${GREEN}applying${RESET}`
        : `${YELLOW}dry run${RESET} (pass --apply to write)`
    }\n`,
  );

  if (!sync) {
    console.log(
      `  product      ${current.productName}  →  ${BOLD}${next.productName}${RESET}`,
    );
    console.log(`  package/repo ${current.name}  →  ${BOLD}${next.name}${RESET}`);
    console.log(
      `  github       ${current.repository}  →  ${BOLD}${next.repository}${RESET}`,
    );
    console.log(
      `  codeowner    ${current.codeowner}  →  ${BOLD}${next.codeowner}${RESET}`,
    );
    console.log('');
  }

  // The identity block must land first: every surface derives from it.
  //
  // Edited structurally rather than via a JSON round-trip — `JSON.stringify`
  // expands short arrays that Prettier keeps inline (`"protectedBranches":
  // ["main"]`), so a round-trip would reformat unrelated config on every run and
  // fight `pnpm format:check`.
  const configPath = join(ROOT, 'tooling/setup/setup.config.json');
  const configText = readFileSync(configPath, 'utf8');
  const setString = (text, key, value) =>
    text.replace(
      new RegExp(`("${key}":\\s*)"[^"]*"`),
      (_match, prefix) => `${prefix}${JSON.stringify(value)}`,
    );

  const nextConfigText = configText
    .replace(
      /("project":\s*\{)([\S\s]*?)(\n {2}\},)/,
      (_match, open, body, close) => {
        let block = body;
        block = setString(block, 'name', next.name);
        block = setString(block, 'displayName', next.displayName);
        block = setString(block, 'productName', next.productName);
        block = setString(block, 'productDescription', next.productDescription);
        block = setString(block, 'codeowner', next.codeowner);
        return `${open}${block}${close}`;
      },
      // `repository` lives under `providers.github` and is a unique key, so it is
      // safe to set outside the project block.
    )
    .replace(/("repository":\s*)"[^"]*"/, `$1${JSON.stringify(next.repository)}`);

  let changed = 0;
  if (nextConfigText !== configText) {
    changed += 1;
    console.log(
      `  ${GREEN}✓${RESET} tooling/setup/setup.config.json  ${DIM}(identity block)${RESET}`,
    );
    if (apply) writeFileSync(configPath, nextConfigText);
  }

  for (const surface of derivedSurfaces(next)) {
    const path = join(ROOT, surface.file);
    const before = readFileSync(path, 'utf8');
    const after = surface.apply(before, next);
    if (after === before) continue;
    changed += 1;
    console.log(`  ${GREEN}✓${RESET} ${surface.file}  ${DIM}(${surface.label})${RESET}`);
    if (apply) {
      writeFileSync(path, after);
    } else {
      for (const change of previewChange(before, after)) {
        console.log(`      ${DIM}${change.line}:${RESET} ${change.before?.trim()}`);
        console.log(
          `      ${DIM}${change.line}:${RESET} ${GREEN}${change.after?.trim()}${RESET}`,
        );
      }
    }
  }

  // Repo-wide prose rename. Structural transforms cannot reach sentences like
  // "core-fe is trunk-based" — there is no anchor to hook — so this pass replaces
  // the old name everywhere, skipping CHANGELOG history and generated artifacts.
  // Not run for `--sync`: no rename happened, so there is no old name to replace.
  let renamedFiles = 0;
  let renamedOccurrences = 0;
  if (!sync) {
    const plan = planRename(ROOT, [
      [current.name, next.name],
      [current.productName, next.productName],
      [current.displayName, next.displayName],
    ]);
    for (const change of plan) {
      renamedFiles += 1;
      renamedOccurrences += change.count;
      if (apply) writeFileSync(join(ROOT, change.file), change.next);
    }
    if (renamedFiles > 0) {
      console.log(
        `  ${GREEN}✓${RESET} ${renamedFiles} more file(s)  ${DIM}(${renamedOccurrences} prose/config occurrences of "${current.name}" / "${current.productName}")${RESET}`,
      );
      changed += renamedFiles;
    }

    // Record the retired names LAST. Written after planRename because the pass
    // above rewrites every occurrence of the old name in every text file — and
    // this list is the one place that must keep it, so the guard can detect the
    // old name coming back through a merge or a copy-paste.
    if (apply) {
      const retired = [
        ...new Set([...(current.previousNames ?? []), current.name, current.productName]),
      ].filter((entry) => entry !== next.name && entry !== next.productName);
      const configNow = readFileSync(configPath, 'utf8');
      writeFileSync(
        configPath,
        configNow.replace(
          /("previousNames":\s*)\[[^\]]*\]/,
          `$1${JSON.stringify(retired)}`,
        ),
      );
      console.log(
        `  ${GREEN}✓${RESET} tooling/setup/setup.config.json  ${DIM}(previousNames: ${retired.join(', ')})${RESET}`,
      );
    }
  }

  if (changed === 0) {
    console.log(
      `  ${DIM}Everything already matches the identity block — nothing to do.${RESET}\n`,
    );
    return;
  }

  console.log(
    `\n  ${BOLD}${changed}${RESET} file(s) ${apply ? 'written' : 'would change'}.`,
  );

  if (!apply) {
    console.log(`  Re-run with ${BOLD}--apply${RESET} to write.\n`);
    return;
  }

  // `--sync` only re-derives files from the CURRENT identity — no rename
  // happened, so the external-systems checklist would be misleading noise.
  if (sync) {
    console.log(`  ${DIM}Run pnpm validate:identity to confirm.${RESET}\n`);
    return;
  }

  console.log(`\n${BOLD}Manual steps this script cannot do${RESET} ${DIM}(credentials or binary tooling)${RESET}

  1. ${BOLD}PWA icons${RESET} — public/app-icon.svg carries the new name, but the PNGs do not.
     Replace the artwork, then regenerate both sizes:
       rsvg-convert -w 192 -h 192 public/app-icon.svg -o public/pwa-192x192.png
       rsvg-convert -w 512 -h 512 public/app-icon.svg -o public/pwa-512x512.png
  2. ${BOLD}GitHub${RESET} — rename the repo, set its description + homepage, then
     re-sync branch protection and environments:  pnpm github:sync
  3. ${BOLD}Deploy + observability${RESET} — create the Netlify site, Sentry project and
     PostHog project, then set NETLIFY_SITE_ID / SENTRY_* / VITE_POSTHOG_* in the
     GitHub Environments (never in a committed file).
  4. ${BOLD}Reinstall + verify${RESET} — the package name changed:
       pnpm install && pnpm health && pnpm validate:identity

  ${DIM}"${current.name}" is now recorded in previousNames, so pnpm validate:identity fails if
  it ever reappears. Note the trade-off you have taken on: prose was rewritten too, so
  a future \`git merge upstream/main\` will conflict across the renamed doc files.
  "core-be" was left alone on purpose — it names the backend service, not this product.${RESET}
`);
}

main();
