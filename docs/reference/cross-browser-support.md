# Cross-browser support

Status of **Chrome**, **Firefox**, and **Safari** (WebKit) for recent platform work:
version-update notification, toast dismiss, PWA manifest, and local production preview.

**Automated gate (static preview):** `pnpm test:cross-browser` (Chromium + Firefox + WebKit against `pnpm preview`).  
**CI:** `.github/workflows/cross-browser.yml` — weekly + `workflow_dispatch`.

**Live integration (core-be + DATABASE_URL):** `pnpm test:e2e:integration:cross-browser` runs `routes-integration` + `org-switching` on all three engines.  
**CI:** not run on CI — core-be is never booted on CI runners, so this integration lane is local-only.

---

## Correction plan status

| #     | Item                                           | Status                                                                |
| ----- | ---------------------------------------------- | --------------------------------------------------------------------- |
| P0-1  | Verify HTTPS deploy (Netlify)                  | Manual — meta CSP fix unblocks local Safari; prod uses `_headers` CSP |
| P0-2  | Omit `upgrade-insecure-requests` from meta CSP | ✅ Done — Safari local preview works                                  |
| P0-3  | Document Safari / local preview                | ✅ `local-production-perf.md`                                         |
| P1-4  | Update toast + Refresh now                     | ✅ Chrome, Firefox, Safari                                            |
| P1-5  | Safari retest after CSP fix                    | ✅ 15/15 cross-browser tests                                          |
| P1-6  | Faster initial version poll (2s)               | ✅ `VERSION_CHECK_INITIAL_DELAY_MS`                                   |
| P1-7  | Snooze on dismiss (15 min)                     | ✅ `version-update-snooze.ts`                                         |
| P1-8  | Cross-browser CI                               | ✅ `cross-browser.yml`                                                |
| P2-9  | Toast dismiss cross-browser test               | ✅ in `version-update.cross-browser.test.ts`                          |
| P2-10 | iOS touch / Sonner swipe                       | Documented below — manual spot-check on device                        |

---

## Test matrix (automated)

| Feature                     | Chrome | Firefox | Safari (WebKit) |
| --------------------------- | ------ | ------- | --------------- |
| Login shell (prod build)    | ✅     | ✅      | ✅              |
| PWA manifest + icons        | ✅     | ✅      | ✅              |
| Update available toast      | ✅     | ✅      | ✅              |
| Refresh now                 | ✅     | ✅      | ✅              |
| Dismiss snoozes (no reload) | ✅     | ✅      | ✅              |
| Live routes integration     | ✅     | ✅      | ✅              |
| Org switcher dual-URL       | ✅     | ✅      | ✅              |

Run locally (static preview smoke):

```bash
pnpm build
pnpm preview --port 4173 --strictPort
pnpm test:cross-browser
```

Live integration (requires core-be on `:3000` and `DATABASE_URL`):

```bash
pnpm build
DATABASE_URL=postgresql://core:core@localhost:5432/core pnpm test:e2e:integration:cross-browser
```

Optional HTTPS local QA (closer to Netlify):

```bash
pnpm preview:https --port 4173 --strictPort
```

(Self-signed cert — accept browser warning once.)

---

## Safari / WebKit notes

### Meta CSP vs header CSP

- **`index.html` meta CSP** — no `upgrade-insecure-requests` (breaks `http://localhost` preview).
- **`dist/_headers`** — full policy including `upgrade-insecure-requests` on HTTPS deploys.

### Sonner toasts on iOS

- Dismiss / action buttons use `onPointerDown` + `stopPropagation` so Sonner swipe handlers do not steal taps.
- `touch-auto` on dismiss control for reliable touch targets.
- **Manual check:** on iPhone/iPad Safari, verify update toast **Refresh now** and **×** after a deploy.

### PWA on Safari

- Add to Home Screen supported; Web Push and background sync are limited vs Chrome.
- Service worker eviction is aggressive — offline page is best-effort.

### sessionStorage

- Version reload guard and snooze use `sessionStorage`; private browsing fails open (no loop, snooze may not persist).

---

## Known platform limits (not bugs)

| Area                           | Chrome / Firefox | Safari                          |
| ------------------------------ | ---------------- | ------------------------------- |
| PWA install prompt             | Full             | iOS: Share → Add to Home Screen |
| Silent reload on hidden tab    | ✅               | ✅                              |
| `navigator.locks` auth refresh | ✅               | ✅ 15.4+ (fallback exists)      |
| OKLCH theme tokens             | ✅               | ✅ modern Safari                |

---

## Related

- [local-production-perf.md](./local-production-perf.md)
- [pwa-manifest-and-app-icon.md](./pwa-manifest-and-app-icon.md)
- [frontend-platform.md](./frontend-platform.md) — version reload + toast
- [testing.md](./testing.md)
