---
name: fe-pwa-manifest
description: PWA web manifest, app icon, and install-surface sync for core-fe. Use when changing manifest.webmanifest, app-icon.svg, theme_color, PWA icons, favicon, or APP_MANIFEST_* constants.
---

# PWA manifest and app icon (core-fe)

Use when touching **install metadata**, **browser chrome colors**, **favicon**, or
**PWA icons**. Keeps `public/manifest.webmanifest` aligned with the default theme
preset and `index.html`.

**Reference:** `docs/reference/pwa-manifest-and-app-icon.md`  
**Rule:** `agent-os/rules/fe-pwa-manifest-sync.mdc`

---

## Single source of truth

| Edit first                               | Mirrors                                                     |
| ---------------------------------------- | ----------------------------------------------------------- |
| `src/core/config/app-manifest.ts`        | `public/manifest.webmanifest`                               |
| `APP_ICON_PATHS` + `public/app-icon.svg` | `pwa-192x192.png`, `pwa-512x512.png`                        |
| `APP_MANIFEST_*` colors                  | `index.html` `<meta name="theme-color">`                    |
| `APP_MANIFEST_DESCRIPTION`               | `index.html` description + `page-head.ts` `APP_DESCRIPTION` |
| `APP_TITLE` / short name                 | manifest `name` / `short_name`                              |

**Never** edit `public/manifest.webmanifest` alone — update `app-manifest.ts`, then
sync JSON. `app-manifest.test.ts` fails on drift.

---

## Checklist

1. **Constants** — change `src/core/config/app-manifest.ts` (`buildWebManifest()`).
2. **JSON** — write matching `public/manifest.webmanifest` (pretty-printed JSON).
3. **HTML** — sync `index.html` theme-color, description, favicon href.
4. **Page head** — sync `APP_DESCRIPTION` in `src/lib/routes/page-head.ts`.
5. **Icons** — if SVG changed:

```bash
rsvg-convert -w 192 -h 192 public/app-icon.svg -o public/pwa-192x192.png
rsvg-convert -w 512 -h 512 public/app-icon.svg -o public/pwa-512x512.png
```

6. **VitePWA** — ensure `vite.config.ts` `includeAssets` lists all icon paths.
7. **Inventory** — update `public/README.md` if assets added/removed.
8. **Validate:**

```bash
pnpm validate:public
pnpm test:unit src/core/config/app-manifest.test.ts
pnpm build
```

---

## Color rules

- `background_color` → light `--color-background` default (`#ffffff`).
- `theme_color` → brand shell tile (`#0a0a0a`), same as AuthLayout / splash.
- Preset changes in `src/index.css` or preset docs → update manifest constants in
  the same change.

---

## Icon rules

- Brand mark: Lucide **Boxes** on `#0a0a0a` — `public/app-icon.svg`.
- No `vite.svg` for favicon or manifest.
- Manifest lists PNG 192/512 (+ maskable 512) and SVG `purpose: any`.

---

## VitePWA

- Static manifest file (`manifest: false` in plugin config).
- Do not duplicate manifest object in `vite.config.ts`.

---

## Related skills

- **fe-i18n-constants** — in-app copy only; manifest stays English unless product
  adds localized manifests.
- **fe-platform-hygiene** — if adding env-driven manifest fields (not used today).
- **fe-documentation-maintenance** — update `docs/README.md` when adding this doc’s
  cross-links.
