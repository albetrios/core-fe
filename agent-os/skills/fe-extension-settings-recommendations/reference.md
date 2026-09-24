# Curated Extensions by Stack

Use this list when recommending extensions. Only suggest extensions that are **missing** from `.vscode/extensions.json` and that add clear value for the project stack.

## Project stack (core-fe)

React 19, TypeScript, Vite, Tailwind CSS v4, Vitest, Playwright, ESLint (flat config), Prettier, Zod, TanStack Query, react-hook-form, Zustand, shadcn/ui.

## Curated extensions (category → ID → when to recommend)

| Category       | Extension ID                            | When to recommend                                      |
| -------------- | --------------------------------------- | ------------------------------------------------------ |
| **Formatting** | `esbenp.prettier-vscode`                | Default formatter; always recommend if missing.        |
| **Lint**       | `dbaeumer.vscode-eslint`                | ESLint flat config; always if missing.                 |
| **Tailwind**   | `bradlc.vscode-tailwindcss`             | Tailwind v4, classRegex for cn/cva; always if missing. |
| **TypeScript** | `ms-vscode.vscode-typescript-next`      | Workspace TS; always if missing.                       |
| **React**      | `dsznajder.es7-react-js-snippets`       | TS/React snippets; optional DX.                        |
| **Testing**    | `vitest.explorer`                       | Vitest UI; when Vitest is in use.                      |
| **Testing**    | `ms-playwright.playwright`              | Playwright E2E; when Playwright is in use.             |
| **DX**         | `formulahendry.auto-rename-tag`         | JSX tag rename; optional.                              |
| **DX**         | `christian-kohler.path-intellisense`    | Path autocomplete; optional.                           |
| **DX**         | `streetsidesoftware.code-spell-checker` | Spell check; optional.                                 |
| **DX**         | `usernamehw.errorlens`                  | Inline errors; high value.                             |
| **DX**         | `gruntfuggly.todo-tree`                 | TODO/FIXME tree; optional.                             |
| **Git**        | `eamodio.gitlens`                       | Blame, history; optional.                              |
| **Git**        | `mhutchie.git-graph`                    | Branch graph; optional.                                |

## Optional extras (suggest only if clearly beneficial)

| Extension ID                                 | Reason                                                              |
| -------------------------------------------- | ------------------------------------------------------------------- |
| `bradlc.vscode-tailwindcss`                  | Already in recommendations; ensure Tailwind classRegex in settings. |
| `Zignd.html-css-class-completion`            | CSS class completion; overlaps with Tailwind extension.             |
| `styled-components.vscode-styled-components` | Only if project used styled-components (this project does not).     |

## Workspace settings to align with project conventions

When suggesting workspace settings, prefer `.vscode/settings.json` and match project conventions (see `agent-os/rules/fe-project-conventions.mdc`):

- `editor.formatOnSave`, `editor.codeActionsOnSave` (fixAll ESLint).
- `typescript.*`: workspace TS SDK, non-relative imports, `.ts`/`.tsx` extension in imports.
- `eslint.useFlatConfig`, `eslint.validate` including typescriptreact.
- `tailwindCSS.experimental.classRegex` for `cn()`, `cva()`, `clsx()`.
- `files.associations`: `*.css` → tailwindcss.
- `explorer.fileNesting.patterns` for package.json, tsconfig, vite.config, .env.

Do not duplicate existing keys; only suggest additions or fixes.
