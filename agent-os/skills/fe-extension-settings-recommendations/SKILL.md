---
name: fe-extension-settings-recommendations
description: Recommends and updates workspace extensions and .vscode settings for productivity. Use when the user asks about extensions, setup, or productivity; when adding new tooling (e.g. new test framework, new language, new linter); or when onboarding/setup context is detected.
---

# Extension and Settings Recommendations

Recommend and optionally update **workspace** Cursor/VS Code extensions (`.vscode/extensions.json`) and **workspace** settings (`.vscode/settings.json`) based on project stack and code context. **User-level** settings (theme, font size, keybindings) are out of scope — leave them to the user; this skill does not modify user `settings.json`.

## When to Invoke

- **User asks:** "recommend extensions", "better productivity", "setup IDE", "which extensions", "cursor settings", "IDE setup".
- **Code/tooling change:** New major dependency or config (e.g. new test runner, new framework, new language) that suggests new extensions or workspace settings.
- **Onboarding (optional):** When agent infers first-time setup (e.g. "new to project") — suggest once; do not repeat every message.

## What to Do

1. **Read current state**
   - Read `.vscode/extensions.json` and `.vscode/settings.json` for this workspace.

2. **Extensions**
   - Use the curated list in [reference.md](reference.md) (category → extension ID → when to recommend).
   - Recommend only extensions that are **missing** from `extensions.json` and that add value for the project stack (React, TypeScript, Vite, Tailwind, Vitest, Playwright, ESLint, Prettier).
   - When adding to `extensions.json`, preserve existing comments and structure; add one-line reason in a comment if helpful.

3. **Settings**
   - Suggest workspace settings that match project conventions (`agent-os/rules/fe-project-conventions.mdc`) and do not duplicate what is already in `.vscode/settings.json`.
   - Apply or propose diffs to `.vscode/settings.json` only when clearly beneficial and non-intrusive (e.g. new Tailwind classRegex, new file nesting, new language formatter).

4. **User-level settings**
   - Do not modify user `settings.json`. If the user wants theme, font size, or keybindings, tell them those are user-level settings to change themselves (no skill covers them).

## Output

- **Recommend only:** List recommended extensions (ID + one-line reason) and any suggested workspace settings. Do not edit files unless the user or context implies "apply" or "add".
- **Apply:** If the user or context implies applying (e.g. "add these", "update my workspace"), update `.vscode/extensions.json` and/or `.vscode/settings.json` and confirm.

## Curated List

For the full table (category → extension ID → when to recommend), see [reference.md](reference.md). Prefer extensions already in `extensions.json` as blessed; suggest missing ones when the stack matches.
