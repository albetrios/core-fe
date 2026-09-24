# Constants & i18n — Core Frontend

How static values and user-facing copy are organized. Roll out **one route island or module at a time** — never a repo-wide sweep in a single change.

**Related:** [internationalization.md](./internationalization.md) · [route-island-structure.md](./route-island-structure.md)

---

## Principles

1. **Constants files hold keys and IDs** — not English prose (prose lives in locale JSON).
2. **Hybrid colocation** — island root for cross-unit values; unit folder when a single consumer.
3. **Manifest `testId` imports from constants** — constants are the source of truth.
4. **i18next namespace per island** — `src/locales/en/<namespace>.json` mirrors the route island name.
5. **No circular imports** — constants files are data-only (no React, stores, or API clients).

---

## File placement

| Scope                       | Constants file                          | Locale file                        |
| --------------------------- | --------------------------------------- | ---------------------------------- |
| Route island (2+ consumers) | `pages/<page>/<page>.constants.ts`      | `src/locales/en/<page>.json`       |
| Single sub-unit             | `components/<Unit>/<Unit>.constants.ts` | keys stay in parent namespace JSON |
| Shared module               | `shared/<module>/<module>.constants.ts` | `src/locales/en/<domain>.json`     |
| Core / lib                  | `core/<domain>/<domain>.constants.ts`   | usually N/A (non-UI)               |

---

## Constants file sections (fixed order)

```ts
// 1. Namespace constant (ONBOARDING_NS)
// 2. ONBOARDING_KEYS — i18n key paths (as const)
// 3. ONBOARDING_TEST_IDS
// 4. ONBOARDING_ANALYTICS
// 5. API / non-copy defaults (roles, limits)
```

---

## i18n usage

| Context                      | API                                                                        |
| ---------------------------- | -------------------------------------------------------------------------- |
| React components             | `useTranslation(ONBOARDING_NS)` → `t(ONBOARDING_KEYS.steps.welcome.title)` |
| Non-React (toasts, manifest) | `i18n.t(key, { ns: ONBOARDING_NS })`                                       |
| Rich text (inline markup)    | `<Trans ns={…} i18nKey={…} components={{…}} />`                            |
| Pluralization                | `t(key, { count })` + `_one` / `_other` keys in JSON                       |

Bootstrap: `src/lib/i18n/i18n.ts` (imported from `main.tsx` and `tests/utils/setup.ts`).

Provider: `I18nProvider` in `AppProviders`.

---

## Rollout waves

| Wave | Target                                      | Status  |
| ---- | ------------------------------------------- | ------- |
| 0    | Conventions (this doc + skill)              | Done    |
| 1    | `pages/onboarding/` pilot                   | Done    |
| 2    | Auth family (`login`, `mfa`, `callback`, …) | Done    |
| 3    | `organization/` tree                        | Pending |
| 4    | `shared/` modules (one PR each)             | Pending |
| 5    | `core/` + `lib/` non-UI constants           | Pending |

---

## Adding a new locale

1. Copy `src/locales/en/<namespace>.json` → `src/locales/es/<namespace>.json` (translate values).
2. Register in `src/lib/i18n/i18n.ts` under `resources.es`.
3. Set `lng` from user preference when product adds locale switching.

---

## Skill

Agents: read **`agent-os/skills/fe-i18n-constants/SKILL.md`** before extracting constants or adding copy to any island.
