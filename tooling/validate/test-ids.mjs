#!/usr/bin/env node
/**
 * Enforces data-testid contracts on pages, forms, and shell layouts.
 * Scope: test contracts only — not every DOM node.
 *
 * Run from project root: pnpm validate:testids
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '../..');
const PAGES = join(ROOT, 'src/pages');
const ALLOWLIST_PATH = join(ROOT, 'tooling/validate/test-ids-allowlist.txt');

const failures = [];

function fail(message) {
  failures.push(message);
}

function readText(path) {
  return readFileSync(path, 'utf8');
}

function loadAllowlist() {
  try {
    return readText(ALLOWLIST_PATH)
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));
  } catch {
    return [];
  }
}

function isAllowlisted(relPath, rule) {
  const allow = loadAllowlist();
  return allow.some((entry) => {
    const [pathPart, rulePart] = entry.split('#').map((s) => s.trim());
    if (pathPart && !relPath.includes(pathPart)) return false;
    if (rulePart && rulePart !== rule) return false;
    return true;
  });
}

function walk(dir, filter) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry === '__tests__') continue;
      out.push(...walk(full, filter));
      continue;
    }
    if (filter(full)) out.push(full);
  }
  return out;
}

function islandFiles(islandDir) {
  return walk(islandDir, (p) => /\.(ts|tsx)$/.test(p) && !/\.test\.(ts|tsx)$/.test(p));
}

function islandTsxFiles(islandDir) {
  return walk(islandDir, (p) => p.endsWith('.tsx') && !p.endsWith('.test.tsx'));
}

/** Collect `key: 'literal'` pairs from a const object block. */
function extractLiteralMap(block) {
  const map = new Map();
  const re = /(\w+)\s*:\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(block)) !== null) {
    map.set(m[1], m[2]);
  }
  return map;
}

function lookupExportKey(islandDir, exportName, key) {
  for (const file of islandFiles(islandDir)) {
    const content = readText(file);
    const objectRe = new RegExp(
      `export const ${exportName}\\s*=\\s*\\{([\\s\\S]*?)\\}\\s*as const`,
    );
    const objectMatch = objectRe.exec(content);
    if (!objectMatch) continue;

    const keyRe = new RegExp(`${key}\\s*:\\s*([^,\\n]+)`);
    const keyMatch = keyRe.exec(objectMatch[1]);
    if (!keyMatch) continue;

    const raw = keyMatch[1].trim();
    if (/^['"][^'"]+['"]$/.test(raw)) return raw.slice(1, -1);
    if (raw.includes('.')) {
      const [nextRoot, nextKey] = raw.split('.').map((p) => p.trim());
      if (nextRoot && nextKey) return lookupExportKey(islandDir, nextRoot, nextKey);
    }
  }
  return null;
}

/** Resolve manifest `testId: …` to a string id. */
function resolveManifestTestId(manifestPath) {
  const content = readText(manifestPath);
  const islandDir = dirname(manifestPath);
  const match = content.match(/testId:\s*([^,}\n]+)/);
  if (!match) return null;

  const expr = match[1].trim().replace(/,$/, '');
  if (/^['"][^'"]+['"]$/.test(expr)) {
    return expr.slice(1, -1);
  }

  const parts = expr.split('.').map((p) => p.trim());
  if (parts.length >= 2) {
    const root = parts[0];
    const key = parts.slice(1).join('.');
    if (root) return lookupExportKey(islandDir, root, key);
  }

  return null;
}

function constRefsForValue(islandDir, testId) {
  const refs = [];
  for (const file of islandFiles(islandDir)) {
    const content = readText(file);
    const re = /export const (\w+)\s*=\s*\{([\s\S]*?)\}\s*as const/g;
    let m;
    while ((m = re.exec(content)) !== null) {
      const name = m[1];
      const block = m[2];
      const literals = extractLiteralMap(block);
      for (const [key, value] of literals.entries()) {
        if (value === testId) refs.push(`${name}.${key}`);
        if (value.includes('.') && value.split('.')[0]) {
          const [nestedRoot, nestedKey] = value.split('.');
          const nestedRe = new RegExp(
            `export const ${nestedRoot}\\s*=\\s*\\{([\\s\\S]*?)\\}\\s*as const`,
          );
          const nestedMatch = nestedRe.exec(content);
          if (nestedMatch) {
            const nestedVal = extractLiteralMap(nestedMatch[1]).get(nestedKey);
            if (nestedVal === testId) refs.push(`${name}.${key}`);
          }
        }
      }
    }
  }
  return refs;
}

function resolveImportPath(specifier) {
  if (!specifier.startsWith('@/')) return null;
  const base = join(ROOT, 'src', specifier.slice(2));
  const candidates = [
    base,
    `${base}.tsx`,
    `${base}.ts`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
  ];
  for (const c of candidates) {
    try {
      if (statSync(c).isFile()) return c;
    } catch {
      // continue
    }
  }
  return null;
}

function expandResolvedModule(resolved) {
  const files = [resolved];
  if (!/index\.tsx?$/.test(resolved)) return files;
  const dir = dirname(resolved);
  const content = readText(resolved);
  const re = /from '\.\/([^']+)'/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const stem = m[1];
    const candidates = [
      join(dir, stem),
      `${join(dir, stem)}.tsx`,
      `${join(dir, stem)}.ts`,
    ];
    for (const c of candidates) {
      try {
        if (statSync(c).isFile()) files.push(c);
      } catch {
        // skip
      }
    }
  }
  return files;
}

function delegationTargets(islandDir) {
  const targets = new Set();
  const entryFiles = readdirSync(islandDir)
    .filter((f) => /Page\.tsx$/.test(f) || /Layout\.tsx$/.test(f))
    .map((f) => join(islandDir, f));

  const importRe =
    /import\s+(?:\{([^}]+)\}|\*\s+as\s+(\w+)|(\w+))\s+from\s+['"](@\/[^'"]+)['"]/g;

  for (const file of entryFiles) {
    const content = readText(file);
    let m;
    while ((m = importRe.exec(content)) !== null) {
      const named = m[1];
      const namespace = m[2];
      const defaultImport = m[3];
      const spec = m[4];
      const resolved = resolveImportPath(spec);
      if (!resolved) continue;

      const symbols = [];
      if (named) {
        for (const part of named.split(',')) {
          const trimmed = part.trim();
          const asMatch = trimmed.match(/^(\w+)\s+as\s+(\w+)$/);
          const usageName = asMatch ? asMatch[2] : trimmed.split(/\s+/)[0];
          if (usageName) symbols.push(usageName);
        }
      } else if (namespace || defaultImport) {
        symbols.push(namespace ?? defaultImport);
      }

      for (const sym of symbols) {
        const usage = new RegExp(`<${sym}(\\s|>|/)`);
        if (usage.test(content)) {
          for (const expanded of expandResolvedModule(resolved)) targets.add(expanded);
        }
      }
    }
  }
  return [...targets];
}

function fileUsesTestId(filePath, testId, constRefs) {
  const content = readText(filePath);
  if (content.includes(`data-testid="${testId}"`)) return true;
  if (content.includes(`data-testid={'${testId}'}`)) return true;
  if (content.includes(`data-testid={\`${testId}\`}`)) return true;
  for (const ref of constRefs) {
    if (content.includes(`data-testid={${ref}}`)) return true;
  }
  return false;
}

function validatePageManifests() {
  const manifests = walk(PAGES, (p) => p.endsWith('.manifest.ts'));
  for (const manifestPath of manifests) {
    const rel = relative(ROOT, manifestPath);
    const islandDir = dirname(manifestPath);
    const testId = resolveManifestTestId(manifestPath);
    if (!testId) {
      if (!isAllowlisted(rel, 'manifest-testid')) {
        fail(`${rel}: could not resolve manifest testId`);
      }
      continue;
    }

    const constRefs = constRefsForValue(islandDir, testId);
    const scope = [...islandTsxFiles(islandDir), ...delegationTargets(islandDir)];
    const found = scope.some((file) => fileUsesTestId(file, testId, constRefs));
    if (!(found || isAllowlisted(rel, 'page-root'))) {
      fail(
        `${rel}: manifest testId "${testId}" missing on a data-testid in island or delegated shell`,
      );
    }
  }
}

function formSlugFromPath(formPath) {
  const base =
    formPath
      .split('/')
      .pop()
      ?.replace(/Form\.tsx$/, '') ?? 'form';
  return base
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

function validateForms() {
  const formDirs = [join(ROOT, 'src/pages'), join(ROOT, 'src/shared/forms')];

  for (const root of formDirs) {
    const forms = walk(root, (p) => /\/forms\/[^/]+\/[^/]+Form\.tsx$/.test(p));
    for (const formPath of forms) {
      const rel = relative(ROOT, formPath);
      if (isAllowlisted(rel, 'form')) continue;

      const content = readText(formPath);
      const slug = formSlugFromPath(formPath);
      // Accept both the raw `data-testid` attribute and the `testId` prop that
      // shared inputs/buttons (e.g. AuthMethodButton) forward to `data-testid`.
      const testIdAttr = String.raw`(?:data-testid|testId)=\{?[^{}\s]*`;
      const hasFormId =
        new RegExp(`${testIdAttr}form`, 'i').test(content) ||
        content.includes(`"${slug}-form"`) ||
        content.includes(`'${slug}-form'`);

      const hasSubmit =
        new RegExp(`${testIdAttr}submit`, 'i').test(content) ||
        new RegExp(`${testIdAttr}(signIn|dashboard|continue|action)`, 'i').test(
          content,
        ) ||
        content.includes(`"${slug}-submit"`) ||
        content.includes(`'${slug}-submit'`);

      if (!hasFormId) {
        fail(`${rel}: form missing data-testid root (*-form or *_TEST_IDS.form)`);
      }
      if (!hasSubmit) {
        fail(`${rel}: form missing submit data-testid (*-submit or *_TEST_IDS.submit)`);
      }
    }
  }
}

function validateShellContracts() {
  const contracts = [
    {
      file: 'src/shared/layouts/AppLayout/AppLayout.tsx',
      testId: 'app-layout',
      rule: 'app-layout',
    },
    {
      file: 'src/shared/layouts/AuthLayout/variants/AuthLayoutSplit.tsx',
      testId: 'auth-layout',
      rule: 'auth-layout',
    },
    {
      file: 'src/shared/components/SettingsModal/SettingsModal.tsx',
      testId: 'settings-modal',
      rule: 'settings-modal',
    },
  ];

  for (const { file, testId, rule } of contracts) {
    const full = join(ROOT, file);
    const rel = relative(ROOT, full);
    if (isAllowlisted(rel, rule)) continue;
    if (!fileUsesTestId(full, testId, [])) {
      fail(`${rel}: missing required shell data-testid="${testId}"`);
    }
  }
}

function main() {
  validatePageManifests();
  validateForms();
  validateShellContracts();

  if (failures.length > 0) {
    console.error(`Test ID contract: ${failures.length} violation(s):\n`);
    for (const f of failures) console.error(`  FAIL  ${f}`);
    console.error(
      '\nSee docs/reference/e2e-testids-inventory.md and agent-os/skills/fe-e2e-testids/SKILL.md',
    );
    process.exit(1);
  }

  console.log('Test ID contracts OK — page manifests, forms, and shell surfaces tagged.');
}

main();
