# NIDS_Tracker — Task Tracker

**Project:** The Sentinel — Network Intrusion Detection System (NIDS)
**Document:** NIDS_Tracker.md
**Update cadence:** every milestone / after any code change
**Legend:** ✅ IMPLEMENTED · 🟡 PARTIAL · 🔵 NOTEBOOK-ONLY (Colab) · 🟠 LOCAL-ONLY (removed — git history) · 🔴 NOT IMPLEMENTED · ⚪ FUTURE
**Tickbox legend:** `[x]` done · `[/]` partial · `[ ]` not started

> Mirrors NIDS_ImplementationPlan task IDs. Phases 0–10 describe the original local implementation (🟠 removed from the working tree in the Colab-only cleanup); Phases 11–12 document the current Colab edition. New work should continue the numbering (e.g., `PH13-01`).

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

- [x] PH8-01 Unit tests (`tests/`) — 32 passing at Phase-8 close; 78 after the hardening pass (incl. benign-label regression, DoS severity, 52-feature contract)
- [x] PH8-01b Tests realigned to actual extractor contract (CICIDS camelCase names; snake_case expectations removed) [x]
- [x] PH8-02 Integration scripts (in-process + live API)
- [x] PH8-03 `check.py` (now also writes `manifest.json` with checks_ok flag)
- [x] PH8-04 Frontend tests — vitest configured (jsdom, globals, setup with matchMedia polyfill); 21 specs across 7 suites: AlertFeed (rows/empty/CSV/links), AttackTimeline (no-dummy empty/error/bucketing), Chatbot (markdown sanitization), Sidebar (routes/real export/no placeholders), StatusBar (real health states), Settings page, useWebSocket (auth stop/reconnect/normalization) [x]
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
- [ ] PH9-10 Rotate `.env` Google key 🔒 [ ] (the leaked literal has been scrubbed from `NIDS_AuditReport.md`; rotation in Google Cloud Console remains a manual user action)

---

## Phase 10 — Final Security Hardening (Z.ai audit pass)

- [x] PH10-01 Redact leaked Gemini key literal from `NIDS_AuditReport.md`; repo-wide secret scan clean (`.env` holds the runtime key, gitignored; rotation tracked as PH9-10) [x]
- [x] PH10-02 WebSocket `/ws/live` authentication: `?token=`/`X-API-Key` checked before any stream data (close 4401); frontend sends the token from `VITE_NIDS_API_KEY` and stops reconnecting on 4401 [x]
- [x] PH10-03 WebSocket client cap (`NIDS_WS_MAX_CLIENTS`, default 20, close 1013) + concurrent broadcast with 5 s per-client send timeout + dead-client eviction + client-message drain [x]
- [x] PH10-04 Metadata IP validation (`ipaddress`, IPv4/IPv6, `"unknown"` sentinel; oversized/control-char/non-IP → 422) — blocks DB bloat, log forging, WS amplification, chatbot prompt injection [x]
- [x] PH10-05 Global request-body cap (`NIDS_MAX_BODY_BYTES`, default 1 MB → 413) + `ChatRequest.history` structurally bounded (≤50 `Dict[str,str]` entries) [x]
- [x] PH10-06 Event-loop fix: blocking ML/SHAP inference and DB commit off-loaded via `run_in_threadpool` in `/api/predict` [x]
- [x] PH10-07 Rate limiter hardening: safe env parse (empty/invalid → default + warning, never crashes startup), stale-key eviction with hard memory cap, per-process semantics documented [x]
- [x] PH10-08 Predict robustness: non-object JSON root → 400; `Infinity`/`NaN`/`1e400` ports clamp (no OverflowError 500); generic 500 detail (raw exception logged server-side only) [x]
- [x] PH10-09 Sniffer lifecycle: `RLock` around lazy-init/start (concurrent starts → one instance), stop/stats never instantiate, `{"interface": …}` JSON body contract with validation against `get_if_list()` [x]
- [x] PH10-10 Query hardening: `ip-leaderboard` limit bounded 1–100; alerts pagination `timestamp DESC, id DESC`; `type` filter wildcards escaped + length-bounded (API + chat tools) [x]
- [x] PH10-11 Error sanitization: `/health` returns `"ok"`/`"error"` with a 10 s cached DB probe; predict/chat/system failures return generic messages, details only in server logs; constant-time API-key compare [x]
- [x] PH10-12 Config paths: SQLite default anchored to backend root (no second empty DB from repo root); `.env` loaded from backend root in chatbot; `NIDS_PREDICT_URL` env for the sniffer target [x]
- [x] PH10-13 Model startup robustness: `safe_load_artifacts()` never raises (corrupt artifacts → 503 mode); lifespan logs based on the real `_model_loaded` flag [x]
- [x] PH10-14 Timezone-aware UTC timestamps across API/WS/chat/leaderboard (`models.iso_utc`); frontend parses correctly in all locales [x]
- [x] PH10-15 SHAP JSON safety: non-finite values coerced to 0.0 (model + route) and serialized with `allow_nan=False` — browser-safe JSON guaranteed [x]
- [x] PH10-16 `/api/system` reports `capture_auto_start` via the shared `_capture_enabled()` predicate (`NIDS_CAPTURE=0` no longer shows as enabled) [x]
- [x] PH10-17 Chatbot hardening: native Gemini system message, 504 on timeout, only client `user` history turns trusted, tool args type-coerced/clamped, system prompt treats tool output as untrusted data [x]
- [x] PH10-18 Windows interface detection no longer skips adapters whose description contains "npcap"; candidates logged [x]
- [x] PH10-19 Regression suite `tests/test_hardening.py` (46 tests) + `useWebSocket` frontend specs (4) covering every fix above [x]
- [x] PH10-20 Partial-feature transparency: `missing_features` count exposed in predict response + WS broadcast (≤8-missing tolerance preserved and documented) [x]

---

## Phase 11 — Colab Conversion 🔵

- [x] PH11-01 Colab EDA notebook (`01_EDA_Colab.ipynb`) — Drive dataset, float32, ISSUE-05 fixed, key-numbers table
- [x] PH11-02 Colab GPU training notebook (`02_Training_GPU_Colab.ipynb`) — stratified load, dual scalers, arena, PyTorch MLP, artifact export
- [x] PH11-03 Colab inference + FastAPI notebook (`03_Inference_API_Colab.ipynb`) — all routes, validation guards, synthetic flows, replay, tunnel, chatbot
- [x] PH11-04 Colab Gradio dashboard notebook (`04_Dashboard_Colab.ipynb`)
- [x] PH11-05 Percent-format sources + `pack.py` (regenerate + validate)
- [x] PH11-06 `smoke_test.py` end-to-end (notebook 03 cells + API contract) — **PASSED**
- [x] PH11-07 Colab README + local-only cleanup (freed ~1.4 GB)

## Phase 12 — 100/100 Upgrades 🔵

- [x] PH12-01 ROC curves + per-class AUC (notebook 02 Step 9.1)
- [x] PH12-02 Normalized confusion matrix (notebook 02 Step 9.2)
- [x] PH12-03 Optuna Bayesian tuning of XGBoost on T4 (notebook 02 Step 8.5)
- [x] PH12-04 T4 GPU benchmark (CPU→GPU speed-up, per-model times)
- [x] PH12-05 SHAP deep dive — global top-15 + per-class importance (notebook 03 Step 4.5)
- [x] PH12-06 Training summary table (notebook 02 Step 11)
- [x] PH12-07 API contract summary table (notebook 03 Step 6.5)
- [x] PH12-08 EDA key-numbers table (notebook 01 Step 14)
- [x] PH12-09 Static dashboard preview PNGs (notebook 04 Step 4)
- [x] PH12-10 ISSUE-06 fixed — benign FPR index from encoder
- [x] PH12-11 ISSUE-05 fixed — `Attack Type` label detection
- [x] PH12-12 Docs + README synced to Colab edition

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
| 10 Final Hardening | 20 | 20 | 0 | 0 |
| 11 Colab Conversion | 7 | 7 | 0 | 0 |
| 12 100/100 Upgrades | 12 | 12 | 0 | 0 |
| **Total** | **132** | **123** | **3** | **6** |

> Current state (2026-08-28): Phases 0–10 are 🟠 LOCAL-ONLY (removed from the working tree in the Colab-only cleanup; preserved in git history). The live implementation is Phases 11–12 (Colab edition). **132 items | 123 ✅ | 3 🟡/[/] | 6 🔴/⚪** — all 19 Colab-edition items verified by `_build/smoke_test.py` + nbformat validation.

## Verification Checklist (per change)

- [x] `pytest tests/` green (backend) — 78 passing (32 API/extractor + 46 hardening)
- [x] `npm test` / `npm run build` / `npm run lint` green (frontend) — 21 specs / 7 suites passing; lint 0 errors (13 pre-existing shadcn warnings)
- [x] `/health` OK: model loaded, DB ok (live smoke on :8011/:8012 + /api/system)
- [x] POST one benign + one attack flow → verified stats/alerts/WS (WS history batch + `…+00:00` timestamps verified live)
- [x] WS auth verified live (4401 without/with wrong token; valid token streams; 1013 over cap)
- [x] Chatbot fails safely without key (503 verified live)
- [x] Docs updated (PRD/TechSpec/AppFlow/Schema/Design/Rules/Tracker/README/AuditReport) — hardening pass synced all docs