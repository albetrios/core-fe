# `pages/organization/$organizationSlug/dashboard` — Dashboard

Route: `/organization/$organizationSlug/dashboard`. The landing surface after
sign-in. Reads the session context (`useMeContext` → `GET /auth/me/context`) and
renders an overview + permission-gated quick actions. **Personal** organizations
show a lighter set (no member/role/billing management); **team** organizations
surface the full toolkit. Quick actions deep-link into the settings modal
(`#settings/<scope>/<section>`).

## Files

| File                    | Responsibility                                                               |
| ----------------------- | ---------------------------------------------------------------------------- |
| `dashboard.route.tsx`   | Route marker — exports `Component` rendering `DashboardPage`.                |
| `dashboard.manifest.ts` | Manifest — `kind: 'leaf'`, permission `organization:read`.                   |
| `DashboardPage.tsx`     | Overview (stat cards) + quick actions + org switcher. Owns `dashboard-page`. |

## Data

`useMeContext()` (`src/shared/hooks/useMeContext/`) — the single source for the
user, active organization (+ status), permissions, global role, and the
org-switcher list. The quick actions are gated by org-scoped permissions + org
type (team-only via `useCan`'s `teamOrganizationOnly`), so personal vs team is
data-driven.

## Test ids

- `dashboard-page`, `dashboard-greeting`, `dashboard-org-name`, `dashboard-org-status`
- `dashboard-stat-{workspaces,permissions,type,billing}`
- `dashboard-action-{invite,roles,billing,org-settings,account}` (permission + team-org gated)
- `dashboard-org-item`, `dashboard-org-open` (org switcher, when >1 org)
- `dashboard-theme-{showcase,label,palette,shuffle,customize}` (theme bar — shared `ThemeShowcase`; reflects accent + chart palette + active font/radius live)
- `dashboard-pulse-{gauge,sample,score,metric-*}` (pulse gauge — non-classic arrangements)
- `dashboard-activity-{feed,sample,item-*}` (recent-activity feed — every arrangement)
- `dashboard-trend-{strip,sample,*}` (sparkline trend cards), `dashboard-source-donut` + `dashboard-donut-{sample,total,segment-*}` (sessions-by-source donut)
- `dashboard-usage-ranking` + `dashboard-ranking-{sample,row-*}` (feature-usage leaderboard), `dashboard-timeline-{strip,sample,event-*}` (month timeline)
- `dashboard-global-map` + `dashboard-map-{sample,region-*,marker-*}` (dotted-world activity map — Bento)
- `dashboard-usage-bars`, `dashboard-heatmap` (+`-week-*`), `dashboard-funnel` (+`-stage-*`), `dashboard-radar` (+`-axis-*`), `dashboard-leaderboard` (+`-row-*`), `dashboard-mini-gantt` (+`dashboard-gantt-bar-*`), `dashboard-focus-{timer,clock,toggle,reset}`, `dashboard-plan-meters` (+`dashboard-meter-*`), `dashboard-billing-{summary,amount}`, `dashboard-ai-{card,prompt,chip-*}` (premium set; each sample-badged widget also has a `-sample` id)

## Arrangement variants (TEMP preview)

The surface renders through one of four arrangement variants
(`shared/components/Dashboard/variants/` — Classic, Command center, Pulse, Bento),
selected by the theme store's `dashboardVariant`. The Appearance Shuffle rolls
it (gated by `SHUFFLE_TEMP.dashboard`) and the Appearance panel's Dashboard
card picks it directly. Every variant renders the same sections and test ids —
only the arrangement and per-variant flair (accent lead KPI tile, framed
insights, tinted actions, pulse gauge) differ.
