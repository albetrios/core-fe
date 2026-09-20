# Internationalization (i18n) — Core Frontend

Client-side copy uses **react-i18next** (aligned with core-be's i18next). Backend API messages are still displayed as returned — no client translation layer for API errors.

```mermaid
flowchart LR
  subgraph fe["Frontend"]
    CONST["`<page>`.constants.ts` keys + IDs"]
    JSON["`src/locales/en/<ns>.json`"]
    COMP["Components `t(key)`"]
    CONST --> COMP
    JSON --> COMP
  end
  subgraph be["Backend"]
    BE["i18next API messages"]
  end
  BE -->|as-is| User[User]
  COMP --> User
```

---

## Current status

- **Stack:** `i18next` + `react-i18next` — bootstrap in `src/lib/i18n/i18n.ts`, provider in `AppProviders`.
- **Build modes (`BUILD_I18N_MODE`, build-time only):**
  - **`single`** — Vite plugin inlines one locale's immediate shell copy and regional profile (date/number/currency defaults). Page namespaces ship as deferred JS chunks for that selected language only; owning surfaces await them before rendering. Default locale: `BUILD_I18N_LOCALE=en-US`. Language picker hides (date/timezone still available in Appearance). Schema/prod default is `single`; local gets `multi` via `envProfiles.local.defaults`.
  - **`multi`** uses `load-namespace.ts`. English `common`, `errors`, `layout`, and immediate settings/appearance shell labels are available initially. Auth, dashboard, onboarding, and full settings copy load with the corresponding surface; locale changes await the active namespaces before switching. Other locales load `src/locales/<lang>/*.json` on demand. Set `BUILD_I18N_MODE=multi` in `.env.local` (or use local profile defaults) for the Appearance language picker.
- **Locales:** `src/locales/<lang>/` for every UI language (`en`, `es`, `zh`, `fr`, `de`, `ja`, `pt`, `ar`, `hi`, `ko`, `it`) — namespaces: `common`, `layout`, `auth`, `dashboard`, `settings`, `errors`, `onboarding`.
- **Layout chrome:** `AuthLayout`, `AppLayout`, and `PublicLayout` use `layout.constants.ts` + `useTranslation(LAYOUT_NS)` — nav labels, skip links, auth marketing copy, footer. Prefer **logical CSS** (`ms`/`me`/`ps`/`pe`/`start`/`end`) so RTL mirrors; gated by `pnpm validate:logical`.
- **Regional prefs:** `useLocaleStore` — language, text direction (auto/LTR/RTL), regional format locale (country), timezone, date/time format, hour cycle (12h/24h), number style, and currency display (`locale-preference` v7).
- **Formatting:** `useLocaleFormat()` / `<FormattedDate />` — locale-ordered datetime in the chosen IANA timezone, date-only, time-only, relative time, numbers, currency. Prefer these over `toLocaleDateString` / bare `Intl.DateTimeFormat` so Appearance prefs apply app-wide (`pnpm validate:no-bare-intl`). Civil calendar days (placeholder/event `Date`s) pass `{ civilDay: true }`.
- **Language + date/time + money:** Appearance side panel (`LanguagePrefsCard` + `DateTimePrefsCard` + `MoneyPrefsCard`). Language tiles are multi-locale only; text direction + date/timezone + number/currency always available.
- **Appearance handle:** inline-end floating palette via `FloatingEdgeControls` (theme unlocked only).
- **RTL FOUC:** `public/locale-init.js` sets `lang`/`dir` from `locale-preference` before paint (mirrors `theme-init.js`). Static HTML keeps `lang="en" dir="ltr"` as a no-JS fallback.

---

## Locale switching

Use the shared readiness path for startup, navigation, and language changes.
Storage hydration alone does not establish translation readiness. Keep the current
language usable while the next language loads; include namespaces requested during
that wait before committing the switch. A failed or timed-out startup must recover
to the bundled language without losing regional preferences or leaving a blank page.
Bootstrap route-title labels eagerly because manifests evaluate before route chunks.

Failed or cancelled switches release pending navigation waiters. Namespace requests
that finish after a language change recheck the committed language before resolving,
so readiness cannot describe copy for the previous language. Regression coverage in
`src/lib/i18n/load-namespace.test.ts` exercises both races with deferred promises.

1. User picks **language**, **text direction**, **timezone**, **regional format locale** (country), **date format**, and **number/currency** from Appearance.
2. `setLocale()` (multi builds) lazy-loads that locale's JSON chunks, then `i18n.changeLanguage()`, and snaps region/currency (timezone is left alone — explicit picks and `auto` stay put). Document `dir` follows text-direction preference (Auto → language; LTR/RTL forced). A generation/`isStale` guard prevents a slower earlier switch from overwriting document/i18next.
3. `setTextDirection()` / `setFormatLocale()` / `setTimeZone()` / `setDateFormat()` / money setters update immediately (no extra fetch). `setFormatLocale` snaps currency only — never timezone.
4. Preferences persist in `localStorage` (`locale-preference`). Pre-paint: `locale-init.js` applies `lang`/`dir`.

To add another language:

1. Add `src/locales/<lang>/*.json` and register loaders in `i18n-resources.multi.ts`.
2. Add the code to `I18N_LOCALES` + `INTL_LOCALE` in `locales.ts` / `intl-config.ts`.
3. Add menu label keys under `language.*` in `common.json`.

---

## Key conventions

| Item           | Convention                                                     |
| -------------- | -------------------------------------------------------------- |
| Namespace      | Same name as route island folder (`onboarding`, `login`, …)    |
| Key paths      | Dot-separated, grouped by step/feature (`steps.welcome.title`) |
| Constants file | `<page>.constants.ts` exports `*_KEYS`, `*_TEST_IDS`, `*_NS`   |
| Components     | `useTranslation(ONBOARDING_NS)` + `t(ONBOARDING_KEYS.…)`       |
| Non-React      | `import i18n from '@/lib/i18n/i18n.ts'`                        |
| Rich text      | `<Trans ns={…} i18nKey={…} components={…} />`                  |
| Plurals        | Suffixed keys + `{ count }` in `t()` — categories per language |

**Plural categories are per language, never per English.** A `{ count }` key owes one
entry for every cardinal category the TARGET language selects — exactly
`new Intl.PluralRules('<locale>').resolvedOptions().pluralCategories`. English is
`_one` / `_other` (and may lean on the bare, unsuffixed key to serve `one`); **es, fr, it
and pt add `_many`** (exact millions); **Arabic ships all six** — `_zero`, `_one`, `_two`,
`_few`, `_many`, `_other`; de and hi are `one` / `other`; ja, ko and zh take `_other`
alone. A locale that ships only `_one` / `_other` leaves its own categories unresolved,
i18next walks on to `fallbackLng`, and the user reads English inside a translated UI —
silently, with no crash and no raw key. `_zero` is an i18next extension rather than a
CLDR category (an exact-0 lookup is honoured in every language), so it is always allowed.

---

## Adding strings to an island

1. Add the key to `<page>.constants.ts` under `*_KEYS`.
2. Add the English value to `src/locales/en/<page>.json`.
3. Use `t(key)` in components or `i18n.t(key, { ns })` elsewhere.
4. Agent workflow: **`agent-os/skills/i18n-constants/SKILL.md`**.

---

## White-label / single-locale builds

When `BUILD_I18N_MODE=single`, only the selected locale ships — no runtime language
picker. Keys must still exist in `src/locales/en/<namespace>.json` (or the chosen
build locale) because constants files reference key paths, not inline copy.

**CI:** `pnpm validate:i18n` scans `*.constants.ts` files and fails when a
`*_KEYS` literal path is missing from the matching English namespace JSON.
Fix by adding the key to locale JSON before merging.

`pnpm validate:i18n-parity` complements it on the cross-locale axis: English is
the source of truth and every other locale in `I18N_LOCALES` must carry every
English key in every namespace (and must not hold keys English has dropped).
Plural coverage is judged **per category against `Intl.PluralRules` for the target
language**, not against English's two-form shape — accepting any of bare / `_one` /
`_other` is exactly what let a missing `_many` fall through to English.
`PARTIAL_UI_LOCALES` is reserved for languages that temporarily ship only
`common.json`; it is empty when all languages have full coverage. The locale
sets are read from `src/lib/i18n/locales.ts`, so the gate can't drift from the
app config. Both run in PR CI (`static-sync` job) and in the weekly
`sync-drift-canary` via `pnpm sync:check`.

---

## Related

- [frontend-platform.md](./frontend-platform.md) — boot order, gateway, QueryBoundary, modules
- [constants-and-i18n.md](./constants-and-i18n.md) — file placement, rollout waves, manifest testId rule
- [tools-and-usage.md](./tools-and-usage.md) — package versions
