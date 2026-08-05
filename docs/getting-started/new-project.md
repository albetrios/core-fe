# Start a new product from this repo

This repo is two things at once: **a platform** (auth, RBAC, multi-tenancy, routing, CI/CD, agent-os, quality gates) and **one product built on it** (Core). This page is for the second case — you want the platform, not the product.

If you are joining work on Core itself, you want [setup.md](setup.md) instead.

```mermaid
flowchart LR
  A[Pick a path] --> B[Clone + rename remote]
  A --> C[Use this template]
  B --> D["pnpm rebrand '<Product>'"]
  C --> D
  D --> E[Manual checklist:<br/>icons, GitHub, Netlify]
  E --> F["pnpm install && pnpm health"]
```

---

## 1. Pick how you derive the repo

The choice matters for exactly one reason: **whether you can pull future platform fixes** (security patches, CI upgrades, agent-os improvements) from upstream.

| Path                                    | Command        | Keeps upstream link | Use when                                                                                                                                     |
| --------------------------------------- | -------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Clone + rename remote** _(supported)_ | see below      | **Yes**             | You want platform updates. This is the path the rest of this doc assumes.                                                                    |
| **Use this template** (GitHub button)   | —              | **No**              | A throwaway spike or a hard fork you will never re-sync.                                                                                     |
| **Fork**                                | `gh repo fork` | Yes                 | You intend to contribute changes _back_ to the platform. Note GitHub marks the repo "forked from" and defaults new PRs to the upstream repo. |

Clone + rename keeps full history and a working `upstream` remote:

```bash
git clone https://github.com/nikunjmavani/core-fe.git acme-portal-fe
cd acme-portal-fe
git remote rename origin upstream
git remote add origin https://github.com/<your-org>/acme-portal-fe.git
```

> **The template button is intentionally a second-class path.** It produces a repo with no history and no upstream remote, so a later "pull the security fix from the platform" is a manual copy-paste. Only choose it if you are certain you never want that.

---

## 2. The two-name model (read this before renaming)

There are **two** names in play, and only one of them changes:

| Name                 | Example                | Changes on rebrand? | Where it appears                                                                               |
| -------------------- | ---------------------- | ------------------- | ---------------------------------------------------------------------------------------------- |
| **Platform name**    | `core-fe`              | **No**              | `docs/`, `agent-os/`, architecture prose — statements _about the platform you are building on_ |
| **Product identity** | `Core` → `Acme Portal` | **Yes**             | Anything a user sees, plus package/repo/CI/deploy identifiers                                  |

After you rebrand, `docs/reference/testing.md` will still say "core-fe". That is correct and deliberate: your product **is** built on the core-fe platform, and those sentences stay true. It also keeps `git merge upstream/main` from conflicting across ~120 documentation files every time you take a platform update.

Only rename the platform if you are hard-forking the platform itself — and then expect to own every future merge by hand.

---

## 3. Rebrand

One command rewrites every derived surface. It is a **dry run by default**:

```bash
pnpm rebrand "Acme Portal"
```

Review the preview, then apply:

```bash
pnpm rebrand "Acme Portal" --apply
```

Options:

| Flag                     | Default                                                    | Purpose                                       |
| ------------------------ | ---------------------------------------------------------- | --------------------------------------------- |
| `--name <repo-name>`     | derived from the product name, preserving the `-fe` suffix | package + repo name                           |
| `--repo <owner/repo>`    | current owner + new name                                   | GitHub slug                                   |
| `--owner <@handle>`      | unchanged                                                  | `CODEOWNERS` handle (`@user` or `@org/team`)  |
| `--description "<text>"` | unchanged                                                  | product description (meta tag + PWA manifest) |
| `--apply`                | off                                                        | actually write files                          |

### What it rewrites

The single source of truth is `tooling/setup/setup.config.json` → `project.*`. Everything below is derived from it, so you never edit these by hand:

- **App-facing** — the generated `src/lib/product-identity.ts` (imported by `page-head.ts` and `app-manifest.ts`), `public/manifest.webmanifest`, `public/app-icon.svg`, and `brand.name` in all 11 `src/locales/*/layout.json` files.
- **Repo + tooling** — `package.json`, `sonar-project.properties`, `typedoc.json`, `context7.json`, `catalog-info.yaml`, `docker-compose.sonar.yml`, `.github/release-please/config.json`, `.github/codeql/codeql-config.yml`.
- **Ownership + deploy** — `.github/CODEOWNERS`, `.github/environments/production.json`, and the build artifact name in `.github/workflows/reusable-netlify-deploy.yml`.

`index.html` is **not** in that list: its title, description, `theme-color`, and boot-splash name are `{{PRODUCT_*}}` tokens substituted at build time by `plugins/product-identity-html.ts`, so they can never drift.

### What it does not cover

| Not covered                                                     | Why                                                                                  | What to do                                                                                                                 |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| **PWA PNG icons** (`public/pwa-192x192.png`, `pwa-512x512.png`) | Binary; needs `rsvg-convert`                                                         | Replace the artwork in `public/app-icon.svg`, then run the two commands the script prints                                  |
| **GitHub repo settings, Environments, secrets**                 | Needs credentials                                                                    | Rename the repo, set description + homepage, then `pnpm github:sync`                                                       |
| **Netlify site, Sentry + PostHog projects**                     | Needs credentials                                                                    | Create each, then set `NETLIFY_SITE_ID` / `SENTRY_*` / `VITE_POSTHOG_*` in GitHub Environments — never in a committed file |
| **`CHANGELOG.md` and git history**                              | It is the upstream platform's real release history                                   | Leave it. Your product's history starts from your first release                                                            |
| **The backend**                                                 | `core-be` carries the product name too (for example the WebAuthn relying-party name) | Rebrand `core-be` separately — a full product rename is a two-repo exercise                                                |
| **`docs/` and `agent-os/` prose**                               | The two-name model — see above                                                       | Nothing                                                                                                                    |

---

## 4. Verify

```bash
pnpm install
pnpm health
pnpm validate:identity
```

`pnpm validate:identity` is the durable half of this system. It runs in `pnpm health`, in `pnpm sync:check`, and as its own PR CI step, and it fails on two things:

1. **Drift** — a derived file no longer matching `setup.config.json`. Fix with `pnpm identity:sync`.
2. **A hardcoded brand literal** — the product or package name written as a string literal in `src/**` or `index.html`. Fix by importing from `@/lib/product-identity.ts`, or — if the occurrence genuinely is not branding — add the path with a reason to `tooling/validate/identity-allowlist.txt`.

That second check exists because this repo already proved the failure mode: before it landed, `setup.config.json` said the repository was `nikunjmavani/core-fe` while `catalog-info.yaml` said `core/core-fe` — two identity sources silently disagreeing, with only one product in existence.

---

## 5. Decide what to keep

The platform is everything under `src/core/`, `src/app/`, `src/shared/{auth,tenancy,errors,components/ui}`, `agent-os/`, `tooling/`, and `.github/`. Keep all of it.

`src/pages/` is a mix: the login/MFA/callback/onboarding/organization islands are the platform's own flows, while the dashboard's placeholder data and the billing surface are **sample product code** you will likely replace. Module-level switches live in `VITE_DISABLED_MODULES` (see `src/core/config/env-schema.ts`).

> A fuller "keep vs replace vs demo" inventory — the wrapper contract — is planned as a follow-up. Until it lands, `pnpm knip` and `pnpm validate:structure` are the practical guardrails: delete an island, run both, and they will tell you what you broke.

---

## 6. Keep receiving platform updates

```bash
git fetch upstream
git merge upstream/main
```

Because the rebrand deliberately leaves platform prose alone, conflicts are limited to the ~26 derived identity surfaces — and `pnpm identity:sync` re-derives all of them in one command after the merge.

---

## Related

- [setup.md](setup.md) — local development setup (running this app)
- [../reference/frontend-platform.md](../reference/frontend-platform.md) — what the platform kernel provides
- [../deployment/cicd-and-netlify.md](../deployment/cicd-and-netlify.md) — deploy pipeline you are inheriting
- [../../CLAUDE.md](../../CLAUDE.md) — project conventions
