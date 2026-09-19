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
 * Plural coverage is judged against `Intl.PluralRules` for the TARGET language,
 * never against English's two-form shape. English has `one`/`other`; French,
 * Spanish, Italian and Portuguese also have `many` (exact millions), and Arabic
 * has six. A locale that ships only `_one`/`_other` therefore leaves its own
 * categories unresolved, i18next walks on to `fallbackLng`, and the user reads
 * ENGLISH inside a translated UI — silently, with no crash and no raw key.
 * Accepting "any of bare / `_one` / `_other`" is exactly what let that through.
 *
 * The locale sets are read from `src/lib/i18n/locales.ts` so this gate can never
 * drift from the app config.
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

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;
const pluralBase = (k) => k.replace(PLURAL_SUFFIX, '');
const pluralSuffix = (k) => PLURAL_SUFFIX.exec(k)?.[1] ?? null;

/**
 * The cardinal categories the LANGUAGE actually selects, straight from ICU.
 * This is the gate's whole point: what a locale owes is decided by
 * `Intl.PluralRules`, not by the shape English happens to have.
 */
const categoryCache = new Map();
function requiredCategories(locale) {
  let categories = categoryCache.get(locale);
  if (!categories) {
    try {
      categories = new Set(
        new Intl.PluralRules(locale).resolvedOptions().pluralCategories,
      );
    } catch {
      throw new Error(`'${locale}' is not a locale Intl.PluralRules accepts`);
    }
    categoryCache.set(locale, categories);
  }
  return categories;
}

/**
 * `_zero` is an i18next extension, not a CLDR category: i18next honours an
 * exact-0 lookup in EVERY language, so `_zero` is never unreachable even where
 * CLDR omits it. Everything else must be a category the language can select.
 */
const ALWAYS_SELECTABLE = new Set(['zero']);

/** Group flat keys by plural base → `{ bare, suffixes }`. */
function groupByBase(keys) {
  const bases = new Map();
  for (const key of keys) {
    const base = pluralBase(key);
    let entry = bases.get(base);
    if (!entry) {
      entry = { bare: false, suffixes: new Set() };
      bases.set(base, entry);
    }
    const suffix = pluralSuffix(key);
    if (suffix) entry.suffixes.add(suffix);
    else entry.bare = true;
  }
  return bases;
}

/**
 * Categories English parks on its BARE key. i18next's last-resort lookup is the
 * unsuffixed key, so English writes `passkeysOn` + `passkeysOn_other` and lets
 * the bare one serve `one`. A target locale may lean on its own bare key for
 * exactly those categories — and no others, or a missing `_many` would hide
 * behind the singular wording instead of being reported.
 */
function bareKeyStandsFor(enEntry) {
  if (!enEntry.bare) return [];
  return [...requiredCategories(DEFAULT_LOCALE)].filter((c) => !enEntry.suffixes.has(c));
}

const enNamespaces = readdirSync(join(LOCALES_DIR, DEFAULT_LOCALE))
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''));
const en = Object.fromEntries(enNamespaces.map((ns) => [ns, loadNs(DEFAULT_LOCALE, ns)]));

const failures = [];

for (const locale of ALL_LOCALES) {
  if (locale === DEFAULT_LOCALE) continue;
  const namespaces = PARTIAL.has(locale) ? ['common'] : enNamespaces;
  const locCategories = requiredCategories(locale);
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
    const enBases = groupByBase(Object.keys(enFlat));
    const locBases = groupByBase(Object.keys(locFlat));

    const missing = [];
    for (const [base, enEntry] of enBases) {
      const locEntry = locBases.get(base);
      if (!locEntry) {
        missing.push(base);
        continue;
      }
      if (enEntry.suffixes.size === 0) {
        // Not count-keyed in English — a plain key must exist as a plain key.
        if (!locEntry.bare) missing.push(base);
        continue;
      }
      const bareServes = bareKeyStandsFor(enEntry);
      for (const category of locCategories) {
        const resolvable =
          locEntry.suffixes.has(category) ||
          (locEntry.bare && bareServes.includes(category));
        if (!resolvable) missing.push(`${base}_${category}`);
      }
    }
    if (missing.length) {
      failures.push(
        `${locale}/${ns}.json missing ${missing.length} key(s): ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? ', …' : ''}`,
      );
    }

    // Plural forms this language can never select. Unreachable copy rots in
    // silence: a translator edits it and nothing changes on screen.
    const dead = [];
    for (const [base, locEntry] of locBases) {
      for (const suffix of locEntry.suffixes) {
        const selectable = locCategories.has(suffix) || ALWAYS_SELECTABLE.has(suffix);
        if (!selectable) dead.push(`${base}_${suffix}`);
      }
    }
    if (dead.length) {
      failures.push(
        `${locale}/${ns}.json has ${dead.length} unreachable plural key(s) — '${locale}' selects only ` +
          `${[...locCategories].join('/')}: ${dead.slice(0, 8).join(', ')}${dead.length > 8 ? ', …' : ''}`,
      );
    }

    const stale = [...locBases.keys()].filter((b) => !enBases.has(b));
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
      '\nlocales; partial locales in PARTIAL_UI_LOCALES translate only common.json).' +
      '\nPlural coverage is per LANGUAGE, from Intl.PluralRules — a count-keyed base owes' +
      "\nnew Intl.PluralRules('<locale>').resolvedOptions().pluralCategories, not en's one/other.",
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
