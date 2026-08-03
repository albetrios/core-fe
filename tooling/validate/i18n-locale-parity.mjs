#!/usr/bin/env node
/**
 * Cross-locale i18n parity gate. Run: `pnpm validate:i18n-parity`
 *
 * `validate:i18n` proves every *_KEYS constant path exists in the ENGLISH
 * bundle. This complements it on the other axis: every OTHER locale must stay
 * in step with English so no user sees an untranslated key fall through.
 *
 *   - English (`DEFAULT_LOCALE`) is the source of truth.
 *   - Full locales (I18N_LOCALES − PARTIAL_UI_LOCALES − en) must carry every
 *     English key in every namespace.
 *   - Partial locales (PARTIAL_UI_LOCALES) translate only `common`; the rest
 *     deliberately falls back to English, so only `common` is compared.
 *   - No locale may hold a key that English no longer has (stale translation).
 *
 * Plural variants (`key_one` / `key_other`) satisfy a bare `key` and vice
 * versa, matching i18next resolution. The locale sets are read from
 * `src/lib/i18n/locales.ts` so this gate can never drift from the app config.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '../..');
const LOCALES_DIR = join(ROOT, 'src/locales');
const CONFIG = join(ROOT, 'src/lib/i18n/locales.ts');

/** Pull a string-literal array/set body out of the locale config by name. */
function readCodeList(source, declaration) {
  const start = source.indexOf(`export const ${declaration}`);
  if (start === -1) throw new Error(`could not find ${declaration} in locales.ts`);
  // Bound the search to this declaration so an empty `new Set()` does not
  // steal the next array (e.g. RTL_LOCALES).
  const nextExport = source.indexOf('\nexport ', start + 1);
  const slice = nextExport === -1 ? source.slice(start) : source.slice(start, nextExport);
  const open = slice.indexOf('[');
  if (open === -1) return [];
  const close = slice.indexOf(']', open);
  return [...slice.slice(open + 1, close).matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

const config = readFileSync(CONFIG, 'utf8');
const ALL_LOCALES = readCodeList(config, 'I18N_LOCALES');
const PARTIAL = new Set(readCodeList(config, 'PARTIAL_UI_LOCALES'));
const DEFAULT_LOCALE =
  config.match(/DEFAULT_LOCALE:\s*I18nLocale\s*=\s*'([^']+)'/)?.[1] ?? 'en';

const flatten = (obj, prefix = '', out = {}) => {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
};

const loadNs = (locale, ns) => {
  try {
    return flatten(
      JSON.parse(readFileSync(join(LOCALES_DIR, locale, `${ns}.json`), 'utf8')),
    );
  } catch {
    return null;
  }
};

const pluralBase = (k) => k.replace(/_(one|other|zero|two|few|many)$/, '');
const covers = (set, key) => {
  const base = pluralBase(key);
  return (
    set.has(key) || set.has(base) || set.has(`${base}_one`) || set.has(`${base}_other`)
  );
};

const enNamespaces = readdirSync(join(LOCALES_DIR, DEFAULT_LOCALE))
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''));
const en = Object.fromEntries(enNamespaces.map((ns) => [ns, loadNs(DEFAULT_LOCALE, ns)]));

const failures = [];

for (const locale of ALL_LOCALES) {
  if (locale === DEFAULT_LOCALE) continue;
  const namespaces = PARTIAL.has(locale) ? ['common'] : enNamespaces;
  for (const ns of namespaces) {
    const enFlat = en[ns];
    if (!enFlat) continue;
    const locFlat = loadNs(locale, ns);
    if (locFlat === null) {
      failures.push(
        `${locale}/${ns}.json is missing (${Object.keys(enFlat).length} keys expected)`,
      );
      continue;
    }
    const locKeys = new Set(Object.keys(locFlat));
    const missing = Object.keys(enFlat).filter((k) => !covers(locKeys, k));
    if (missing.length) {
      failures.push(
        `${locale}/${ns}.json missing ${missing.length} key(s): ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? ', …' : ''}`,
      );
    }
    const enKeys = new Set(Object.keys(enFlat));
    const stale = Object.keys(locFlat).filter((k) => !covers(enKeys, k));
    if (stale.length) {
      failures.push(
        `${locale}/${ns}.json has ${stale.length} stale key(s) absent from ${DEFAULT_LOCALE}: ${stale.slice(0, 8).join(', ')}${stale.length > 8 ? ', …' : ''}`,
      );
    }
  }
}

if (failures.length > 0) {
  console.error('i18n locale parity failed:\n');
  for (const line of failures) console.error(`  - ${line}`);
  console.error(
    `\nSource of truth: src/locales/${DEFAULT_LOCALE}. Add the missing keys (translate for full` +
      '\nlocales; partial locales in PARTIAL_UI_LOCALES translate only common.json).',
  );
  process.exit(1);
}

const fullCount = ALL_LOCALES.filter(
  (l) => l !== DEFAULT_LOCALE && !PARTIAL.has(l),
).length;
console.log(
  `i18n locale parity OK (${fullCount} full + ${PARTIAL.size} partial locales vs ${DEFAULT_LOCALE}; ` +
    `${enNamespaces.length} namespaces)`,
);
