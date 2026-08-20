# NIDS_Tracker — Task Tracker

**Project:** The Sentinel — Network Intrusion Detection System (NIDS)
**Document:** NIDS_Tracker.md
**Update cadence:** every milestone / after any code change
**Legend:** ✅ IMPLEMENTED · 🟡 PARTIAL · 🔵 NOTEBOOK-ONLY · 🔴 NOT IMPLEMENTED · ⚪ FUTURE
**Tickbox legend:** `[x]` done · `[/]` partial · `[ ]` not started

> Mirrors NIDS_ImplementationPlan task IDs. New work should continue the numbering (e.g., `PH9-01`).

---

## Phase 0 — Foundations

- [x] PH0-01 Repo structure (backend/frontend/root docs, MIT LICENSE)
- [x] PH0-02 Backend deps (`requirements.txt`)
- [x] PH0-03 Frontend scaffold (Vite + TS + Tailwind + shadcn/ui)
- [x] PH0-04 Env (.env/.env.example) + `.gitignore`
- [x] PH0-05 Route skeleton (`src/api|capture|features|model|simulation`)

## Phase 1 — Data

- [x] PH1-01 CICIDS2017 cleaned CSV in `data/raw/` (~717 MB)
- [/] PH1-02 EDA notebook (29 cells; executed with outputs at dev time — outputs not preserved in repo)
- [x] PH1-03 Holdout arrays saved (`X_test.npy`, `y_test.npy`)

## Phase 2 — ML Pipeline

- [x] PH2-01 Chunked stratified loader (400 k target)
- [x] PH2-02 Cleaning (Inf/NaN/dupes)
- [x] PH2-03 `label_encoder.pkl`
- [x] PH2-04 Stratified 80/20 split
- [x] PH2-05 Dual scalers (`scaler.pkl`, `robust_scaler.pkl`)
- [x] PH2-06 PCA experiment (90/95/99 %) — documented, excluded
- [x] PH2-07 9-model suite + ensembles + balanced weights
- [x] PH2-08 5-fold CV top-2
- [x] PH2-09 Best model → `model.pkl` (LGBM, 52 ftrs)
- [ ] PH2-10b (⚠) Notebook label detection prints `None` — align with `Attack Type` (ISSUE-05) [ ] ⚪
- [x] PH2-10 Notebooks present (`02_training.ipynb`, `02_training_with_nn.ipynb`)

## Phase 3 — Inference

- [x] PH3-01 Lazy artifact cache + loaded flag
- [x] PH3-02 Predict pipeline (order → scale → proba → inverse)
- [x] PH3-03 Severity mapping with LOW fallback
- [x] PH3-03b Add bare `"dos"` keyword to `SEVERITY_MAP` (fixes DoS → LOW fallback bug; DoS now CRITICAL)
- [x] PH3-03c Add `is_benign()` helper (recognizes both "Normal Traffic" and "BENIGN") + SKIP SHAP for benign flows
- [x] PH3-04 Cached SHAP TreeExplainer top-5
- [x] PH3-05 Evaluation utils (metrics/FPR/CM/importance)
- [/] PH3-05b ⚠ FPR `benign_label=0` assumption (class 0 = Bots) — verify/reindex (ISSUE-06) [/]
- [x] PH3-06 Artifact parity guards: `predict()` rejects non-52-key or non-finite vectors; `_load_artifacts()` asserts model/scaler `n_features_in_` == len(`CICIDS_FEATURES`); `manifest.json` written by `check.py` and refreshed by `_write_manifest()` (TMG-04) [x]

## Phase 4 — API & Persistence

- [x] PH4-01 Engine/session/`get_db`
- [x] PH4-02 `Alert` ORM + indexes
- [x] PH4-03 Pydantic schemas
- [x] PH4-04 `POST /api/predict` + persist + WS broadcast
- [x] PH4-05 `GET /api/alerts`
- [x] PH4-06 `GET /api/stats` + `GET /api/ip-leaderboard`
- [x] PH4-07 `main.py` (lifespan, CORS, /health, sniffer API, /ws/live)
- [x] PH4-08 Chatbot route (LangChain + Gemini + 5 tools)
- [x] PH4-09 ✅ RESOLVED ISSUE-01 — benign class alignment: all filters now use `BENIGN_LABELS` (`src/api/constants.py`) via `prediction.notin_(...)` (stats/WS history/chat/alerts) + regression tests [x]
- [x] PH4-09b Optional API-key auth (`NIDS_API_SECRET`) + per-IP rate limiting middleware; 400 on payloads with zero of the 52 features [x]
- [x] PH4-10 Strict `/api/predict` input validation: 400 (no feature keys), 422 (non-numeric/non-finite/negative/>1e15 values; >8 of 52 missing) with named invalid features — no silent 0.0 coercion of malformed data; ports clamped to 0–65535 [x]
- [x] PH4-11 Chatbot hardening: `ChatRequest.message` max 2000 chars (schema + route), 60 s LLM timeout, bounded history (last 20 msgs / 2000 chars each), prompt updated to decline out-of-scope + never reveal hidden instructions + never fabricate stats [x]
- [x] PH4-12 `GET /api/system` aggregation (health + model manifest + sniffer stats + rate limit + API-key flag + NIDS_CAPTURE flag) for the Settings page [x]
- [x] PH4-13 WebSocket session fix: sessions closed in `finally`; history send errors cannot leak DB sessions or kill the endpoint [x]

## Phase 5 — Capture & Features

- [x] PH5-01 Flow assembly (5-tuple, FIN/RST/30 s/500 cap, ≥3 pkts)
- [x] PH5-02 Interface detection (Npcap-aware + L3 fallback)
- [x] PH5-03 Threaded API submission + counters
- [x] PH5-03b Sniffer delivery hardening: 3-attempt retry with 2 s/4 s backoff on transport errors, permanent-error taxonomy (400/401/422/503 logged + dropped), `total_retries`/`total_dropped` counters exposed via `get_stats()` and `/api/system` [x]
- [x] PH5-04 52-feature extractor (µs IATs, active/idle, guards)
- [x] PH5-05 Standalone CLI (`--interface/--api-url/--timeout`)

## Phase 6 — Simulation

- [x] PH6-01 DDoS UDP flood
- [x] PH6-02 Port scan (SYN 20–200)
- [x] PH6-03 Brute force (SYN+RST :22)
- [x] PH6-04 Mixed scenario
- [x] PH6-05 `send_attacks.py` replay harness

## Phase 7 — Frontend

- [x] PH7-01 App shell + router + NotFound + Toaster
- [x] PH7-02 API client (axios)
- [x] PH7-03 WS hook (normalize + reconnect)
- [x] PH7-04 Sidebar + StatusBar + footer
- [x] PH7-05 KPICards
- [x] PH7-06 TrafficChart
- [x] PH7-07 AttackPieChart
- [x] PH7-08 AlertFeed (severity colors, SHAP drill-down, flash)
- [x] PH7-09 AttackTimeline
- [x] PH7-09b ✅ RESOLVED ISSUE-04 — synthetic "dummy background noise" removed; 12-hour buckets of real alert counts only (exported `bucketByHour`), honest empty/error states, Y axis integer-only [x]
- [x] PH7-10 IPLeaderboard
- [x] PH7-11 SHAPExplainer
- [x] PH7-12 Chatbot
- [x] PH7-12b ✅ RESOLVED — chat output rendering now escapes ALL HTML before applying safe markdown transforms (exported `renderMarkdown`); input capped at 2000 chars client-side; error text no longer uses emoji prefix [x]
- [x] PH7-13 Router-based navigation (6 routes via state tabbing removed), mobile drawer nav, real "Export Alerts CSV" (500 latest attack alerts, proper CSV escaping, ISO timestamp filenames) [x]
- [x] PH7-13b ✅ RESOLVED ISSUE-03 — default sidebar export is gone; only real exports remain (Sidebar + per-view CSV in AlertFeed archive) [x]
- [x] PH7-13c ✅ RESOLVED — Settings page wired to `GET /api/system` (backend health, model manifest, sniffer counters, security flags) with live refresh [x]
- [x] PH7-14 Network Activity page — real src→dst flow aggregation with counts, relative volume bars, attack types and max severity from the latest 500 alerts [x]
- [x] PH7-15 Explainability page — alert picker + SHAPExplainer with deep-link support (`/explain?src=&t=`) [x]
- [x] PH7-16 StatusBar shows real component states from `/health` (backend/model/DB/sniffer/ws); removed misleading "UTC" clock label; header has mobile top bar [x]
- [x] PH7-17 Professional polish pass: emojis removed from all states, empty/error/loading states on every data surface, ARIA labels on filters/FAB/nav, real "Historical Archive" links [x]

## Phase 8 — Quality, Tests & Docs

- [x] PH8-01 Unit tests (`tests/`) — 32 passing incl. benign-label regression, DoS severity, 52-feature contract
- [x] PH8-01b Tests realigned to actual extractor contract (CICIDS camelCase names; snake_case expectations removed) [x]
- [x] PH8-02 Integration scripts (in-process + live API)
- [x] PH8-03 `check.py` (now also writes `manifest.json` with checks_ok flag)
- [x] PH8-04 Frontend tests — vitest configured (jsdom, globals, setup with matchMedia polyfill); 17 specs across 6 suites: AlertFeed (rows/empty/CSV/links), AttackTimeline (no-dummy empty/error/bucketing), Chatbot (markdown sanitization), Sidebar (routes/real export/no placeholders), StatusBar (real health states), Settings page [x]
- [x] PH8-05 README ready (runbook/demo/API/changelog/security)
- [x] PH8-06 8-doc set (PRD/TechSpec/AppFlow/Design/Schema/Plan/Tracker/Rules)
- [x] PH8-07 Supporting docs (VIVA guide, mid/final reports, PDF)

## Phase 9 — Backlog (⚪ FUTURE)

- [x] PH9-01 ✅ RESOLVED ISSUE-01 (benign class alignment) — fixed in PH4-09; no longer a backlog item
- [ ] PH9-02 Fix ISSUE-06 (FPR benign index) [ ]
- [x] PH9-03 ✅ RESOLVED — chat HTML sanitization (PH7-12b)
- [x] PH9-04 ✅ RESOLVED — real log export (PH7-13)
- [x] PH9-05 ✅ RESOLVED — real settings panel (PH7-13c)
- [x] PH9-06 ✅ Basic Network Activity page (real src→dst flow aggregation, PH7-14); full live topology visualization remains future
- [ ] PH9-06b Live topology view (graph layout of the aggregated flows) ⚪ [ ]
- [ ] PH9-07 AuthN/AuthZ + TLS [ ]
- [/] PH9-08 ✅ PARTIAL — sniffer now retries with backoff and counts drops (PH5-03b); streaming/queueing + model registry (redis/mlflow/optuna) still FUTURE
- [ ] PH9-09 Alembic migrations [ ]
- [ ] PH9-10 Rotate `.env` Google key 🔒 [ ]

---

## Status Rollup

| Phase | Items | ✅ | 🟡/[/] | 🔴/⚪ |
|-------|-------|----|--------|------|
| 0 Foundations | 5 | 5 | 0 | 0 |
| 1 Data | 3 | 2 | 1 | 0 |
| 2 ML Pipeline | 11 | 10 | 0 | 1 |
| 3 Inference | 9 | 8 | 1 | 0 |
| 4 API & Persistence | 14 | 14 | 0 | 0 |
| 5 Capture & Features | 6 | 6 | 0 | 0 |
| 6 Simulation | 5 | 5 | 0 | 0 |
| 7 Frontend | 21 | 21 | 0 | 0 |
| 8 Quality & Docs | 8 | 8 | 0 | 0 |
| 9 Backlog | 11 | 5 | 1 | 5 |
| **Total** | **93** | **84** | **3** | **6** |

> Final audit recount (every checkbox verified against repo this pass): **93 items | 84 ✅ | 3 🟡/[/] | 6 🔴/⚪**. Corrections vs the prior rollup (92|83|3|6): Phase 3 = 9 items (PH3-03b/03c/06 added), Phase 4 = 14 (PH4-09b/10..13), Phase 7 = 21 (PH7-09b/12b/13b/13c/14..17). Previous pre-audit rollup was 81|64|2|15.

## Verification Checklist (per change)

- [x] `pytest tests/` green (backend) — 32 passing
- [x] `npm run build` / `npm run lint` green (frontend) — 17 specs / 6 suites passing
- [x] `/health` OK: model loaded, DB ok (live smoke on :8011 + /api/system)
- [x] POST one benign + one attack flow → verified stats/alerts/WS
- [x] Docs updated (PRD/TechSpec/… ID referenced if new feature) — final audit pass synced all 8 docs