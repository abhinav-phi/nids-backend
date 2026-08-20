# NIDS_Design — UI/UX Design Specification

**Project:** The Sentinel — Network Intrusion Detection System (NIDS)
**Document:** NIDS_Design.md
**Status:** ✅ Complete (derived from frontend source)
**Legend:** ✅ IMPLEMENTED · 🟡 PARTIAL · 🔵 NOTEBOOK-ONLY · 🔴 NOT IMPLEMENTED · ⚪ FUTURE

---

## 1. Design Principles

1. **Dark-first command center** — deep navy surface (`#0a0e19`) with neon accent triad (cyan/blue/purple) + red alarms.
2. **Real-time storytelling** — WebSocket push keeps all threat widgets live; no refresh required.
3. **Explainable security** — every alert links to its SHAP top-5 explanation.
4. **Information hierarchy** — KPI strip → charts → feed → drill-downs (f-shape scan).
5. **Consistent severity language** — color-coded severity everywhere (CRITICAL/HIGH/MEDIUM/LOW/NONE).

---

## 2. Global Styling System

### 2.1 CSS Variables (`index.css`)
| Variable | Hex | Usage |
|----------|-----|-------|
| `--surface` | `#0a0e19` | app background |
| `--primary` | `#a1faff` | cyan accent (brand, links, highlights) |
| `--secondary` | `#699cff` | blue accent (trends, secondary) |
| `--tertiary` | `#ac8aff` | purple accent (tertiary / gradients) |
| `--error` | `#ff716c` | alerts, danger |
| `--on-surface` | `#e8eafb` | primary text |

### 2.2 Typography
| Font | Role |
|------|------|
| **Space Grotesk** | headlines / branding (`font-headline`) |
| **Inter** | body / UI |
| **JetBrains Mono** | data & code (chat inline code) |

Loaded via Google Fonts `@import` in `index.css`.

### 2.3 Surfaces & Effects
- Grid background pattern built from two linear-gradient layers (subtle dot/grid on `--surface`).
- Cards: translucent panels, thin `rgba(255,255,255,…)` borders, soft glow shadows (e.g., `0 2px 12px rgba(161,250,255,0.3)`).
- Gradients: brand gradient `linear-gradient(135deg, #a1faff 0%, #699cff 50%, #ac8aff 100%)` (FAB); alert gradient `#ff716c → #e04040`.
- Animations (keyframe-injected in Chatbot): `chatDotBounce` (typing dots), `chatSlideUp` (window), `chatPulseRing` (FAB ring).
- Light mode: `.light-mode` class toggled from Sidebar switches variables to a lighter palette (dark default remains).

---

## 3. Page Layout

### 3.1 `PageShell.tsx` — Master Layout (shared by all routes)

```
┌────────────────────────────────────────────────────────────────────┐
│ Sidebar (fixed w-64, hidden < lg + mobile drawer)  │ StatusBar     │
│   NAV                                  │ System Active · Model OK  │
│   • Dashboard (/)                      │ DB OK · Sniffer · Live    │
│   • Alerts (/alerts)                   │ Local Time · Up 0h 12m    │
│   • Reports (/reports)                 ├───────────────────────────┤
│   • Network Activity (/network)        │ main p-6 max-w-[1600px]   │
│   • AI Explainability (/explain)       │  [page content, §3.2]     │
│   • Settings (/settings)               │                           │
│   [Export Alerts CSV] [v1.0.0] [API]   │ ──────────────────────────│
│                                        │ footer: © 2025 The Sentinel
└────────────────────────────────────────────────────────────────────┘
                    Floating Chatbot FAB (bottom-right)
```

- `App.tsx` (react-router): `/` dashboard, `/alerts`, `/reports`, `/network`, `/explain`, `/settings`, `*` → NotFound; `Toaster` mounted.
- Root: `min-h-screen bg-surface`; content column `lg:ml-64`; `PageShell` wraps every page (Sidebar + StatusBar + footer + Chatbot).
- Footer: "© 2025 The Sentinel — NIDS Command Center v1.0.0".

### 3.2 Route Content Matrix
| Route | Content |
|-------|---------|
| `/` **Dashboard** | KPICards (row) · grid-12: TrafficChart (8) · AttackPieChart (4) · AlertFeed (9, minHeight 440) · IPLeaderboard (3) · AttackTimeline (12) |
| `/alerts` | Historical archive: server-paginated AlertFeed (type/severity/search filters, CSV export of current view) + AttackTimeline (stacked) |
| `/reports` | AttackPieChart + IPLeaderboard + AttackTimeline (2-col → stacked below lg) |
| `/network` | Network Activity: real src→dst flow aggregation (counts, relative volume bars, attack types, max severity) from latest 500 alerts |
| `/explain` | Alert picker → SHAPExplainer (max-w-4xl); deep-link support (`/explain?src=&t=`); fallback "Waiting for live alerts to provide AI explanation…" |
| `/settings` | Real system status from `GET /api/system`: backend health, deployed model manifest, sniffer counters (incl. retries/dropped), security flags; refresh button |

---

## 4. Component Design Specs

### 4.1 Sidebar (`Sidebar.tsx`)
| Element | Spec |
|---------|------|
| Nav items | Router links: Dashboard, Alerts, Reports, Network Activity, AI Explainability, Settings (lucide icons) |
| Active state | `NavLink` highlight: cyan text + 3 px left border on `rgba(161,250,255,0.08)` background |
| Export Alerts CSV | Real export: latest 500 attack alerts (`exclude_benign`), CSV-escaped values, `nids_alerts_<ISO-timestamp>.csv`, "Exporting…" busy state |
| Meta | version `v1.0.0`; "API Docs" link → `http://localhost:8000/docs` |
| Responsive | desktop `hidden lg:flex` fixed w-64; mobile top bar (`lg:hidden`) with hamburger → slide-in drawer (`aria-label="Navigation menu"`) |
| Theme | no theme toggle anymore — `.light-mode` CSS rules remain but are not wired to any control |

### 4.2 StatusBar
- Left: page title (desktop) / brand "The Sentinel" (mobile).
- Health chips (poll `/health` every 10 s): **System Active/Offline** (backend reachability, blinking dot), **Model OK**, **DB OK**, **Sniffer &lt;state&gt;**, WS indicator **Live** or amber "WebSocket reconnecting…".
- Right: **Local Time** clock (updates every 1 s, `toLocaleTimeString`) + **Up Xh Ym** uptime from `/health.uptime_seconds`.
- Sticky header (`sticky top-0`, translucent blur backdrop).

### 4.3 KPICards — KPI Strip
4 cards, each with gradient icon tile + label + value:
| Card | Icon | Color |
|------|------|-------|
| Total Network Flows | Activity | cyan `#a1faff` |
| Attacks Detected | AlertTriangle | red `#ff716c` |
| System Uptime | Clock | blue `#699cff` |
| Benign Traffic | Shield | purple `#ac8aff` |
- Uptime formatted `hh:mm:ss` (`formatUptime`).
- Data from `GET /api/stats` (⚠️ ISSUE-01 skews Attacks/Benign counts).

### 4.4 TrafficChart (Live AreaChart)
- Recharts `AreaChart`; two series: flows (delta per tick) and alerts (bucketed from `alertHistory`).
- Polls `GET /api/stats` every 5 s; keeps **last 60 points** (`prevFlows` diff ref).
- Purpose: show throughput vs threat activity over time.

### 4.5 AttackPieChart (Donut)
- Ignores benign slices; `attacks_by_type` from `/api/stats`.
- Custom labels with elbow connector lines; `CustomTooltip` shows count.
- Color palette `COLORS[]` per attack type.

### 4.6 AlertFeed
| Aspect | Spec |
|--------|------|
| Mode | Live: WS `alertHistory` (initial 50-batch + live pushes); Archive: server-paginated `GET /api/alerts` |
| Rows | max 50 visible (live); pagination for archive |
| Filters (archive) | type, severity, free-text search (id/IP/prediction/severity); CSV export of current view |
| Severity colors | `SEV_STYLES` map for CRITICAL/HIGH/MEDIUM/LOW/NONE (exported) |
| Interactivity | click row → selects → opens embedded `SHAPExplainer` panel |
| Feedback | new alert IDs flash (600 ms highlight transition) |
| Empty state | neutral copy before first alert |

### 4.7 AttackTimeline (BarChart, "24-Hour Threat Trajectory")
- Fetches `GET /api/alerts` every 30 s; builds **12 hourly buckets** from REAL alert counts (`bucketByHour`, exported pure helper — unit-tested).
- Bar color = **max severity present in the bucket** via `SEVERITY_RANK` (CRITICAL 4 … LOW 1) + severity palette; empty buckets render faint cyan.
- Honest empty & error states ("No attack activity in the last 12 hours"); Y axis integer-only.
- No synthetic rows — timeline shows only real traffic.

### 4.8 IPLeaderboard
| Aspect | Spec |
|--------|------|
| Data | `GET /api/ip-leaderboard` (poll 30 s) |
| List | rank, IP, count, last seen (relative time via `relativeTime`) |
| Accent | real `top_attack_type` badge per source; row links to `/network` for the src→dst flow breakdown |

### 4.9 SHAPExplainer
- Props: `alert` (with `shap_top5`); bars per feature with signed values.
- Position: modal/panel; on Dashboard it renders inline for selected alert; in AI Explainability tab featured for latest alert.
- Color by `sevColor(alert.severity)`.

### 4.10 Chatbot
| Aspect | Spec |
|--------|------|
| Launcher | circular FAB (56/60 px), brand gradient, pulsing ring animation; turns red when open |
| Window | 400 px (desktop) / full-width sheet on mobile (`useIsMobile` 768 px); 560 px tall; slide-up animation; gradient header with shield icon |
| Branding | "Sentinel AI — Network Security Assistant" |
| Messages | user bubbles right (blue→purple gradient); assistant left (translucent, mono code spans); typing dots indicator |
| Markdown-lite | `renderMarkdown` (exported): **all HTML escaped first**, then `**bold**`, `` `code` `` (`.chat-inline-code`), bullets, `\n → <br/>` — no raw HTML from the LLM reaches the DOM |
| Suggestions | 4 chips: top attacker IPs · critical alerts summary · explain port scanning · severity levels meaning |
| Input | Enter to send; `maxLength={2000}`; disabled while loading; error text rendered as plain bubble (no emoji prefix) |
| History | full conversation array sent as `history[]` in every `POST /api/chat` |
| Clear | trash icon clears conversation |

---

## 5. Component Hierarchy

```
main.tsx
└─ App.tsx (QueryClientProvider · TooltipProvider · BrowserRouter · Toaster)
   └─ PageShell (Sidebar + StatusBar + footer + Chatbot)
      ├─ /         → Index.tsx (Dashboard)
      │              KPICards · TrafficChart · AttackPieChart
      │              · AlertFeed · IPLeaderboard · AttackTimeline
      ├─ /alerts   → Alerts.tsx (archive AlertFeed + AttackTimeline)
      ├─ /reports  → Reports.tsx (PieChart + Leaderboard + Timeline)
      ├─ /network  → NetworkActivity.tsx (src→dst flow aggregation)
      ├─ /explain  → Explainability.tsx (picker → SHAPExplainer)
      ├─ /settings → Settings.tsx (real /api/system status)
      └─ *         → NotFound.tsx (404)
```

---

## 6. Interaction & Behavioral Notes

1. **WS lifecycle:** first connect fetches last-50 history; subsequent pushes append; `isConnected` drives StatusBar; auto-reconnect (≈3 s delay) after drops.
2. **Offline resilience:** axios interceptor logs `[API] Backend offline` when no response; widgets keep last data; chat shows error bubble.
3. **Empty states:** Explainability / AlertFeed / AttackTimeline / Network Activity show explicit waiting or empty copy — designed, not broken.
4. **Accessibility:** shadcn/ui primitives (dialog, tooltip, toast) ship ARIA; custom widgets (timeline, FAB) rely on native buttons/labels.
5. **Responsive:** dashboard grids collapse from 12-col → stacked below `lg`; sidebar becomes overlay-hidden under `lg`.

## 7. Known Design Caveats
- ⚠️ Live topology graph (node/edge layout of aggregated flows) remains ⚪ FUTURE — `/network` shows aggregated tables, not a graph.
- ⚠️ Playwright installed but no E2E specs yet (unit coverage via vitest).
- ⚠️ `.light-mode` CSS rules exist but are no longer wired to any toggle.
- ✅ Resolved this pass: AttackTimeline synthetic noise (ISSUE-04), placeholder CSV export (ISSUE-03), non-functional Settings placeholder, chat XSS surface, chart-only "Network Map" tab.