---
name: i18n-constants
description: Extract static values into scoped constants files with react-i18next. Use when moving magic strings, test IDs, analytics events, or defaults into constants; adding user-facing copy; or setting up a new route island locale namespace.
---

# i18n + Constants

Extract static values **one route island or module at a time**. User-facing strings go in locale JSON; constants files hold **keys, IDs, and non-copy defaults**.

---

## When to use

- Refactoring inline strings, test ids, toast messages, option lists, or magic numbers
- Scaffolding a new page that will ship copy
- Adding a new i18next namespace

---

## Workflow (per island)

### 1. Audit the island

Find in `.tsx` / `.ts` (not tests):

- UI copy → locale JSON
- `data-testid` → `*_TEST_IDS`
- PostHog / analytics event names → `*_ANALYTICS`
- API defaults / roles → constants (not i18n)
- Storage keys → constants (shared/core layer)

### 2. Create files

```
pages/<page>/
├── <page>.constants.ts          ← keys, test ids, analytics
├── components/<Unit>/
│   └── <Unit>.constants.ts      ← only if single-consumer option keys
src/locales/en/<page>.json       ← English strings
```

Register the namespace in `src/lib/i18n/namespaces.ts` and add explicit loaders
for every locale in `src/lib/i18n/i18n-resources.multi.ts`. The single-locale
generator in `plugins/i18n-build.ts` derives its deferred loaders from the namespace
catalog. Do not eagerly import full feature copy into `i18n.ts`; the owning
surface must await `ensureNamespace` before rendering translated content.

### 3. Constants shape

```ts
import { I18N_NAMESPACES } from '@/lib/i18n/namespaces.ts';

export const ONBOARDING_NS = I18N_NAMESPACES.onboarding;

export const ONBOARDING_KEYS = {
  steps: { welcome: { title: 'steps.welcome.title', description: '…' } },
} as const;

export const ONBOARDING_TEST_IDS = { page: 'onboarding-page' } as const;
```

Manifest imports test id (and title via `i18n.t`). These titles evaluate at module
load, so include their small label subset in both the multi-locale bootstrap and
single-locale generator; keep the rest of the feature namespace deferred:

```ts
import i18n from '@/lib/i18n/i18n.ts';
import {
  ONBOARDING_KEYS,
  ONBOARDING_NS,
  ONBOARDING_TEST_IDS,
} from './onboarding.constants.ts';

export const manifest = {
  title: i18n.t(ONBOARDING_KEYS.manifest.title, { ns: ONBOARDING_NS }),
  testId: ONBOARDING_TEST_IDS.page,
  // …
};
```

### 4. Wire components

```tsx
import { useTranslation } from 'react-i18next';
import {
  ONBOARDING_KEYS,
  ONBOARDING_NS,
  ONBOARDING_TEST_IDS,
} from '../onboarding.constants.ts';

export function ProfileStep() {
  const { t } = useTranslation(ONBOARDING_NS);
  return (
    <Input
      placeholder={t(ONBOARDING_KEYS.profile.firstNamePlaceholder)}
      data-testid={ONBOARDING_TEST_IDS.firstName}
    />
  );
}
```

Island root files use `./onboarding.constants.ts`. Sub-units use `../../onboarding.constants.ts` (ESLint bans `@/pages/**` from page files).

Non-React code (toasts, finish handlers):

```ts
import i18n from '@/lib/i18n/i18n.ts';
notify.success(i18n.t(ONBOARDING_KEYS.toast.finishSuccess, { ns: ONBOARDING_NS }));
```

### 5. Locale JSON

Mirror key paths from `ONBOARDING_KEYS`. Use i18next plural suffixes (`_one`, `_other`) for counts.

### 6. Tests

- `tests/utils/setup.ts` imports the bootstrap and awaits `ensureLocale('en')` in
  `beforeAll`, so ordinary assertions can use English strings from JSON. Importing
  the bootstrap alone does not load full feature namespaces. Loading regressions
  must explicitly control unavailable bundles rather than rely on this warm setup.
- Import `*_TEST_IDS` in tests when querying by test id.
- Do **not** move test-only fixtures into production constants.

### 7. Docs

- List constants file in `<PAGE>.OVERVIEW.md`.
- No change to `docs/reference/routes-and-ui.md` unless routes change.

---

## Rules

| Do                                              | Don't                                                 |
| ----------------------------------------------- | ----------------------------------------------------- |
| `as const` on key objects                       | Put English prose in `.constants.ts`                  |
| One namespace per island                        | One giant `all-strings.json`                          |
| Default import `i18n` from `@/lib/i18n/i18n.ts` | Named `{ i18n }` from `i18n.ts` (only default export) |
| Keep Zod schemas in `*.contracts.ts`            | Duplicate validation in constants                     |
| Platform storage keys in shared/core constants  | Page constants importing stores                       |

---

## Reference implementation

**Pilot:** `pages/onboarding/` — `onboarding.constants.ts`, `QuestionsStep.constants.ts`, `src/locales/en/onboarding.json`.

**Infrastructure:** `src/lib/i18n/`, `src/app/providers/I18nProvider.tsx`.

**Docs:** `docs/reference/constants-and-i18n.md`.

---

## Rollout order (after pilot)

1. Auth family → shared `auth-shell` constants for duplicated copy
2. `organization/` tree
3. `shared/` one module per PR
4. `core/` / `lib/` timing and storage keys

Each wave = one PR, behavior-neutral, `pnpm health` green.

---

## Review-caught rules (do these before the PR, not after)

These are the i18n findings a human reviewer raised on shipped core-fe PRs. See
`agent-os/skills/pre-pr-sweep/SKILL.md` for the full pre-PR sweep.

**Never half-convert a component.** Keying an `aria-label` while the `title` three
lines below stays English means a screen reader says Arabic and the tooltip says
English. After converting one attribute form, grep the siblings across the file
you touched:

```bash
grep -n 'aria-label="\|title="\|placeholder="' <file>
```

If the whole component cannot be finished, convert **whole components** and
declare the boundary in the PR body — a fully untranslated component reads as a
known gap; a half-translated one reads as a bug.

**Every new key lands in all 11 packs.** `validate:i18n-parity` compares each
locale against English, so a *missing* key fails — but a key left **unused in
code** survives in every pack. Deleting a surface means deleting its keys too.

**Constants hold key paths, never prose.** `*.constants.ts` exports dotted paths
(`'appearance.themeTitle'`); the English text lives only in
`src/locales/en/<ns>.json`.

**Do not translate what should not be translated.**

| Kind | Example | Do |
| ---- | ------- | -- |
| Proper nouns | font families (`Inter`, `JetBrains Mono`) | never translate |
| Product nomenclature | theme/accent preset names | keep; needs a product decision |
| Example / technical values | `example.com`, an `acme` slug, a placeholder brand | key it, but one value across locales is correct — say so in the PR |

**Interpolate, never concatenate.** `Page {n} of {m}` must be one key with
`{{page}}` / `{{pages}}` — word order differs per language, so splitting it across
JSX text nodes cannot be translated correctly.

**Hooks go where the string renders.** When a placeholder lives in a
sub-component, `useTranslation` belongs in that sub-component, not in the exported
panel — type-check catches this, but only after the wiring is wrong.
