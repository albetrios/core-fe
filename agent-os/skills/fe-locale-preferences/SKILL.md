---
name: fe-locale-preferences
description: The locale preference runtime — useLocaleStore persist/migrate, race-safe document apply via the generation guard, the pre-paint locale-init.js FOUC script and its drift test, and single vs multi build modes. Use when changing locale/direction preferences, the apply path, or the i18n build mode.
---

# Locale preferences runtime (core-fe)

Preferences are **device-local** (no backend sync) and live in
`src/shared/store/useLocaleStore/`. This skill covers the runtime around them —
adding a preference, applying it safely, and the pre-paint boot path.

Reference: `docs/reference/internationalization.md`.
Related: `fe-locale-formatting` (consuming prefs) · `fe-i18n-constants` (copy) ·
`fe-rtl-logical-css` (what `dir` flips) · `fe-platform-hygiene` (build env).

---

## Adding a preference

1. Type + `normalize*` coercer in `src/lib/i18n/intl-config.ts` (a typed union and
   a coercer that survives corrupted storage).
2. Field on the store, a `set*` action, and an entry in `partialize`.
3. **Bump `version`** and handle the field in `migrate` — unknown persisted values
   must normalize, never crash hydration.
4. Label key paths in `locale.constants.ts` + values in **all 11** locale packs.
5. UI in the matching Appearance card (`LanguagePrefsCard`, `DateTimePrefsCard`,
   `MoneyPrefsCard`) using the shared `OptionPills`.

## Race-safe apply — every path, not just `setLocale`

`applyDocumentLocale()` awaits `ensureLocale()` (a network fetch for uncached
chunks) **before** mutating `document.documentElement.lang/dir` and calling
`i18n.changeLanguage`. A slow apply can therefore land *after* a faster one and
flip the document back.

Guard with the shared helper and route **every** caller through it:

```ts
function beginLocaleApply(): () => boolean {
  const generation = ++localeApplyGeneration;
  return () => generation !== localeApplyGeneration;
}

await applyDocumentLocale(locale, textDirection, beginLocaleApply());
```

There are **three** apply paths — `setLocale`, `onRehydrateStorage` (boot), and
`applyBuildUiLocaleLock` (single-locale builds). Two of them were missed on the
first pass. After touching any of them:

```bash
grep -rn 'applyDocumentLocale(' src   # every call site must pass a staleness fn
```

The check must sit **inside** `applyDocumentLocale`, before the mutations — a
caller-side check only protects its own store write, not the visible half.

## Pre-paint FOUC script

`public/locale-init.js` sets `lang`/`dir` before first paint, mirroring
`theme-init.js`. It **hand-copies** the RTL locale set and the
`'locale-preference'` storage key, so `src/lib/i18n/locale-init.drift.test.ts`
parses the real shipped file and asserts both match the TS source. Adding an RTL
locale (`he`, `fa`, `ur`) means updating the script *and* watching that test fail
first if you forget.

`index.html` keeps `<html lang="en" dir="ltr">` as a static fallback — the script
overwrites it pre-paint, so nothing is lost, and crawlers / JS-blocked contexts
still get a valid `lang` (WCAG 3.1.1, axe `html-has-lang`).

## Build modes

`BUILD_I18N_MODE` is `single` (inline one locale into JS — white-label default)
or `multi` (lazy JSON per locale). It is schema-validated and read via
`src/lib/i18n/build-env.ts`, one of the three allowlisted raw `import.meta.env`
readers. `.env.example` documents the **production** default (`single`); local
gets `multi` through `envProfiles.local.defaults`, not by editing the example.

In `single` mode the build lock pins the UI language only — regional date/number
prefs stay user-owned.

## Loaders

`load-namespace.ts` uses an explicit `Record<I18nLocale, NamespaceLoaders>` rather
than a template-literal dynamic import. Verbose but deliberate: a missing
locale×namespace is a compile error, and there is no path-injection surface. Keep
it explicit when adding a locale or namespace.

## Verify

```bash
pnpm validate:i18n          # key paths in constants resolve
pnpm validate:i18n-parity   # all 11 packs match English
pnpm test -- useLocaleStore locale-init
```

Manually confirm a cold load with a stored non-English locale, then switch
language mid-load — the document must end on the locale the user last picked.
