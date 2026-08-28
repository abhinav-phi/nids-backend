# NIDS_ImplementationPlan — Implementation Plan

**Project:** The Sentinel — Network Intrusion Detection System (NIDS)
**Document:** NIDS_ImplementationPlan.md
**Status:** ✅ Complete — **Colab Edition** (2026-08-28). The original implementation (Phases 0–10) is 🟠 LOCAL-ONLY (removed from the working tree; preserved in git history). Phases 11–12 document the Colab conversion and the 100/100 upgrades.
**Legend:** ✅ IMPLEMENTED · 🟡 PARTIAL · 🔵 NOTEBOOK-ONLY (Colab) · 🟠 LOCAL-ONLY (removed — see git history) · 🔴 NOT IMPLEMENTED · ⚪ FUTURE

> This plan documents how the repository was (and should be) built — every line traced to real files. Phase order = dependency order (data → model → API → dashboard).

---

## Phase 0 — Foundations & Repo Bootstrap

| Task ID | Task | Deliverable | Status |
|---------|------|-------------|--------|
| PH0-01 | Repo structure: `nids-backend/`, `nids-frontend/`, root docs, license (MIT) | full tree | ✅ |
| PH0-02 | Backend VENV + `requirements.txt` (pinned versions incl. fastapi, uvicorn, sqlalchemy, scapy, sklearn, xgboost, lightgbm, shap, langchain*) | `requirements.txt` | ✅ |
| PH0-03 | Frontend scaffold (Vite React-TS) + Tailwind + shadcn/ui + deps | `package.json`, `vite.config.ts`, `tailwind.config.ts` | ✅ |
| PH0-04 | Env handling: `.env`, `.env.example`, `python-dotenv`; gitignore (venv, data, pkl, db, env) | `.env.example`, `.gitignore` | ✅ (⚠️ `.env` holds live key — see NIDS_Rules SEC-*) |
| PH0-05 | Key route structure: `src/api/`, `src/capture/`, `src/features/`, `src/model/`, `src/simulation/` | directories | ✅ |

---

## Phase 1 — Data Acquisition & Prep

| Task ID | Task | Deliverable | Status |
|---------|------|-------------|--------|
| PH1-01 | Download CICIDS2017 cleaned dataset → `data/raw/cicids2017_cleaned.csv` (~717 MB) | dataset | ✅ |
| PH1-02 | EDA notebook: load, label detection, missing/Inf/duplicates, class distribution, imbalance ratio, correlation (>0.95 pairs), attack-vs-benign means, box plots | `notebooks/01_eda.ipynb` (29 cells) | 🔵 NOTEBOOK-ONLY |
| PH1-03 | Persist evaluation holdout: `X_test.npy`, `y_test.npy` | processed arrays | ✅ |

**Verification:** CSV shape 2,520,751×53; label column `Attack Type`; 7 classes prominently benign-dominated → motivates `class_weight="balanced"`.

---

## Phase 2 — ML Training Pipeline

| Task ID | Task | Deliverable | Status |
|---------|------|-------------|--------|
| PH2-01 | Chunked stratified load (target 400 k) reusable `load_data()` | `train.py` loader | ✅ |
| PH2-02 | Cleaning stage (Inf→NaN, dropna, drop_duplicates) | `clean_data()` | ✅ |
| PH2-03 | Label encode → `label_encoder.pkl` | artifact | ✅ |
| PH2-04 | Stratified 80/20 split (`random_state=42`) | arrays in `data/processed/` | ✅ |
| PH2-05 | Dual scalers (Standard + Robust) → both saved | `scaler.pkl`, `robust_scaler.pkl` | ✅ |
| PH2-06 | PCA experiment at 90/95/99 % (documented, excluded from prod) | logs | ✅ (not deployed) |
| PH2-07 | 9-model suite + Grid/Randomized search + ensembles (Voting/Stacking), `class_weight="balanced"`, SMOTE flag off | `train_all_models()`, `evaluate.py` | ✅ |
| PH2-08 | 5-fold stratified CV on top-2 | `cross_validate_top()` | ✅ |
| PH2-09 | Best-by-Macro-F1 auto-save → `model.pkl` | artifact (LGBM 52-ftr) | ✅ |
| PH2-10 | Notebook walkthroughs (`02_training.ipynb` 6-model + SMOTE; `02_training_with_nn.ipynb` +MLP dual-pipeline) | notebooks | 🔵 NOTEBOOK-ONLY (⚠️ label-col detection prints None — ISSUE-05) |

**Verification:** `python src/model/train.py` completes; `check.py` prints `n_features_in_` = 52. Inspected artifacts confirm LGBM/Standard encoder.

---

## Phase 3 — Inference Wrapper (src/model)

| Task ID | Task | Deliverable | Status |
|---------|------|-------------|--------|
| PH3-01 | Lazy-cached artifact loading + `_model_loaded` flag | `predict.py` | ✅ |
| PH3-02 | CICIDS feature-order guarantee (dict order) + scaling + argmax proba confidence + inverse label | `predict()` | ✅ |
| PH3-03 | `SEVERITY_MAP` substring rules default LOW | `get_severity()` | ✅ |
| PH3-04 | Cached SHAP TreeExplainer + top-5 | `shap_top5` | ✅ |
| PH3-05 | Evaluation utils: metrics, FPR, CM + importance plots | `evaluate.py` | ✅ (⚠️ FPR benign_label=0 assumption — ISSUE-06) |
| PH3-03b | Bare `"dos"` keyword added to `SEVERITY_MAP` (DoS → CRITICAL, not LOW fallback) | `predict.py` | ✅ |
| PH3-03c | `is_benign()` helper (matches "Normal Traffic"/"BENIGN"); SHAP skipped for benign flows | `predict.py` | ✅ |
| PH3-06 | Artifact parity guards: `predict()` rejects non-52-key / non-finite input; `_load_artifacts()` asserts model/scaler `n_features_in_ == 52`; `manifest.json` written by `check.py` and refreshed by `_write_manifest()` (TMG-04) | `predict.py`, `check.py` | ✅ |

**Verification:** `test_pipeline.py` extract→predict round-trip passes.

---

## Phase 4 — API & Persistence

| Task ID | Task | Deliverable | Status |
|---------|------|-------------|--------|
| PH4-01 | Engine/session/`get_db`; SQLite default + PG URL support | `database.py` | ✅ |
| PH4-02 | `Alert` ORM + indexes | `models.py` | ✅ |
| PH4-03 | Pydantic schemas (Predict/Alert/Stats/Health/Chat) | `schemas.py` | ✅ |
| PH4-04 | `POST /api/predict` (flat JSON, `_`-metadata, strict validation: 400 no keys / 422 malformed or >8 missing with named features, ports clamped) + persist + WS broadcast (`BENIGN_LABELS`) + severity logic | `routes/predict.py` | ✅ |
| PH4-09 | ✅ RESOLVED ISSUE-01 — benign class alignment via single `BENIGN_LABELS` in `src/api/constants.py` (stats/WS/chat/alerts) + regression tests | `src/api/constants.py` | ✅ |
| PH4-09b | Optional API-key auth (`NIDS_API_SECRET` → `X-API-Key`) + per-IP rate limiting (`NIDS_RATE_LIMIT`, default 120/min, 429) middleware | `main.py` | ✅ |
| PH4-10 | Strict `/api/predict` input validation (400/422 tiers, named invalid features, `MAX_INVALID_FEATURES=8`, `MAX_ABS_FEATURE_VALUE=1e15`, `_coerce_port`) | `routes/predict.py` | ✅ |
| PH4-11 | Chatbot hardening: 2000-char cap (schema + route), 60 s LLM timeout, bounded history, hardened system prompt | `routes/chatbot.py`, `schemas.py` | ✅ |
| PH4-12 | `GET /api/system` (health + manifest + sniffer stats + rate limit + API-key/CAPTURE flags) | `main.py` | ✅ |
| PH4-13 | WebSocket session hygiene: sessions closed in `finally`; history send errors cannot leak sessions | `main.py` | ✅ |
| PH4-05 | `GET /api/alerts` (limit/offset/type/severity/exclude_benign) | `routes/alerts.py` | ✅ |
| PH4-06 | `GET /api/stats` + `GET /api/ip-leaderboard` | `routes/stats.py` | ✅ |
| PH4-07 | App wiring: lifespan create_all, model load, CORS, routers, `/health`, sniffer control endpoints, `WS /ws/live` (history batch + pings) | `main.py` | ✅ |
| PH4-08 | Chatbot: LangChain agent + 5 DB tools + Gemini lazy singleton + 503 handling | `routes/chatbot.py` | ✅ (needs GOOGLE_API_KEY) |

**Verification:** `pytest tests/` (TestClient + test SQLite), `curl /health`, POST sample flows.

---

## Phase 5 — Live Capture & Features

| Task ID | Task | Deliverable | Status |
|---------|------|-------------|--------|
| PH5-01 | Scapy 5-tuple flow assembly, FIN/RST/30 s/500-pkt close, ≥3-pkt submission | `capture/sniffer.py` | ✅ |
| PH5-02 | Auto interface detection (Windows Npcap-aware + L3 fallback) | `detect_interface()` | ✅ |
| PH5-03 | Threaded non-blocking API submission + counters (`total_retries`/`total_dropped`) | `NetworkSniffer` | ✅ |
| PH5-03b | Delivery hardening: 3-attempt retry with 2 s/4 s backoff; permanent-error taxonomy (400/401/422/503 → warn + drop); counters exposed via `get_stats()` + `/api/system` | `sniffer.py` | ✅ |
| PH5-04 | 52-feature extractor (IAT µs, active/idle 5 s, flags, windows, safe stats, NaN guards) | `features/extractor.py` | ✅ |
| PH5-05 | Standalone CLI mode `--interface/--api-url/--timeout` | sniffer `__main__` | ✅ |

**Verification:** `test_extractor.py` fixtures (normal/ddos/portscan) pass.

---

## Phase 6 — Attack Simulation

| Task ID | Task | Deliverable | Status |
|---------|------|-------------|--------|
| PH6-01 | DDoS UDP flood simulator (random src, ~300 pkts) | `sim_ddos.py` | ✅ |
| PH6-02 | SYN port-scan 20–200 (src 10.0.0.99) | `sim_portscan.py` | ✅ |
| PH6-03 | SYN+RST brute-force vs :22 (src 10.0.0.77) | `sim_bruteforce.py` | ✅ |
| PH6-04 | Mixed sequential scenario (DDoS→PortScan→BruteForce) | `sim_mixed.py` | ✅ |
| PH6-05 | Offline dataset replay (balanced per-class CSV sampling) | `send_attacks.py` | ✅ |

**Verification:** dashboard shows DDoS/PortScan/BruteForce alerts during demos (README Terminal-3 flow).

---

## Phase 7 — Frontend Dashboard

| Task ID | Task | Deliverable | Status |
|---------|------|-------------|--------|
| PH7-01 | App shell: QueryClient/Tooltip providers, Router, Toaster, 404 | `App.tsx`, `NotFound.tsx` | ✅ |
| PH7-02 | API client (axios baseURL :8000, timeouts; offline logging) | `api/client.ts` | ✅ |
| PH7-03 | WS hook (history batch, normalize, auto-reconnect) | `hooks/useWebSocket.ts` | ✅ |
| PH7-04 | Layout: PageShell (Sidebar w/ router nav + real CSV export, StatusBar w/ real health chips, footer) | `PageShell.tsx`, `Sidebar.tsx`, `StatusBar.tsx` | ✅ |
| PH7-05 | KPI strip | `KPICards.tsx` | ✅ |
| PH7-06 | TrafficChart (5 s poll, 60-pt window) | `TrafficChart.tsx` | ✅ |
| PH7-07 | AttackPieChart | `AttackPieChart.tsx` | ✅ |
| PH7-08 | AlertFeed (50-row, severity colors, SHAP drill-down, flash) | `AlertFeed.tsx` | ✅ |
| PH7-09 | AttackTimeline (12 h buckets, 30 s fetch; real counts only — no synthetic noise) | `AttackTimeline.tsx` | ✅ |
| PH7-10 | IPLeaderboard (30 s, top-3 badges) | `IPLeaderboard.tsx` | ✅ |
| PH7-11 | SHAPExplainer panel | `SHAPExplainer.tsx` | ✅ |
| PH7-12 | Chatbot (FAB, window, markdown-lite with HTML-escaped rendering, suggestions, history, 2000-char cap) | `Chatbot.tsx` | ✅ |
| PH7-13 | Router-based navigation — 6 routes incl. real Settings page backed by `GET /api/system` | `App.tsx`, `pages/*` | ✅ |
| PH7-13b | ✅ RESOLVED ISSUE-03 — placeholder CSV export removed; real exports only (Sidebar + AlertFeed archive) | `Sidebar.tsx`, `AlertFeed.tsx` | ✅ |
| PH7-13c | Settings page wired to `GET /api/system` (health, manifest, sniffer counters, security flags) with live refresh | `pages/Settings.tsx` | ✅ |
| PH7-14 | Network Activity page — real src→dst flow aggregation from latest 500 alerts | `pages/NetworkActivity.tsx` | ✅ |
| PH7-15 | Explainability page — alert picker + SHAPExplainer, deep-link support (`/explain?src=&t=`) | `pages/Explainability.tsx` | ✅ |
| PH7-16 | StatusBar real component states from `/health`; local-time clock (no misleading UTC label) | `StatusBar.tsx` | ✅ |
| PH7-17 | Polish pass: no emojis, explicit empty/error/loading states on every data surface, ARIA labels on filters/FAB/nav | all pages/components | ✅ |

**Verification:** `npm run dev` → http://localhost:5173; POST attack via send_attacks → widgets update live.

---

## Phase 8 — Quality, Tests & Docs

| Task ID | Task | Deliverable | Status |
|---------|------|-------------|--------|
| PH8-01 | Extractor & API unit tests (32 passing at Phase-8 close; 78 after the Phase-10 hardening pass incl. benign-label regression, DoS severity, 52-feature contract) | `tests/` | ✅ |
| PH8-01b | Tests realigned to actual extractor contract (CICIDS camelCase names; snake_case expectations removed) | `tests/` | ✅ |
| PH8-02 | Integration scripts (in-process pipeline; live API; 20-flow replay) | `test_pipeline.py`, `test_api.py` (root), `test2_api.py` | ✅ |
| PH8-03 | Model sanity script (now also writes `manifest.json` with `checks_ok` flag) | `check.py` | ✅ |
| PH8-04 | Frontend tests (vitest + Testing Library, jsdom, matchMedia polyfill) — 21 specs across 7 suites after the hardening pass | `src/components/__tests__`, `src/pages/__tests__`, `src/hooks/__tests__` | ✅ |
| PH8-05 | README (full runbook: quick start, demo flow, API table, changelog, security notes) | `README.md` | ✅ |
| PH8-06 | This documentation set (PRD/TechSpec/AppFlow/Design/Schema/Plan/Tracker/Rules) | 8 × docs | ✅ NEW |
| PH8-07 | Value-pack docs (viva guide, mid/final reports, PDFs) | root PDFs/MD | ✅ (gitignored) |

---

## Phase 10 — Final Security Hardening (Z.ai audit pass)

| Task ID | Task | Deliverable | Status |
|---------|------|-------------|--------|
| PH10-01 | Redact leaked Gemini key literal from the audit report; repo-wide secret scan | `docs/NIDS_AuditReport.md` | ✅ (rotation = PH9-10, user action) |
| PH10-02 | WS auth: `?token=`/`X-API-Key` before any stream data (4401); frontend token support + stop-on-4401 | `main.py`, `useWebSocket.ts`, `client.ts` | ✅ |
| PH10-03 | WS client cap (1013) + concurrent broadcast with per-client send timeout + eviction + drain | `main.py` (`ConnectionManager`) | ✅ |
| PH10-04 | Metadata IP validation (`ipaddress`; 422 on invalid/oversized/control-char) | `routes/predict.py` | ✅ |
| PH10-05 | Global body-size cap (413) + structurally bounded chat history | `main.py`, `schemas.py` | ✅ |
| PH10-06 | Event-loop fix: inference + DB commit via `run_in_threadpool` | `routes/predict.py` | ✅ |
| PH10-07 | Rate limiter: safe env parse, stale-key eviction, memory cap, per-process note | `main.py` | ✅ |
| PH10-08 | Predict: non-object root → 400; overflow-safe ports; generic 500 detail | `routes/predict.py` | ✅ |
| PH10-09 | Sniffer race fix (RLock), stop/stats without instantiation, JSON-body interface contract + validation | `main.py`, `schemas.py` | ✅ |
| PH10-10 | Leaderboard limit bounds; deterministic pagination; escaped `type` filter | `routes/stats.py`, `routes/alerts.py`, `routes/chatbot.py` | ✅ |
| PH10-11 | Error sanitization (health, predict, chat, system) + constant-time key compare | `main.py`, `routes/predict.py`, `routes/chatbot.py` | ✅ |
| PH10-12 | Repo-root-anchored SQLite path + WAL/busy_timeout; backend-root `.env`; `NIDS_PREDICT_URL` | `database.py`, `chatbot.py`, `sniffer.py` | ✅ |
| PH10-13 | Corrupt-artifact degradation (`safe_load_artifacts`); truthful model-load logging | `model/predict.py`, `main.py` | ✅ |
| PH10-14 | Timezone-aware UTC timestamps everywhere (`models.iso_utc`/`utcnow`) | `models.py` + all routes | ✅ |
| PH10-15 | SHAP non-finite sanitization + `allow_nan=False` serialization | `model/predict.py`, `routes/predict.py` | ✅ |
| PH10-16 | `NIDS_CAPTURE=0` status fix (shared `_capture_enabled()` predicate) | `main.py` | ✅ |
| PH10-17 | Chatbot: native system message, 504 timeout, user-only history trust, tool-arg coercion, untrusted-tool-output prompt | `routes/chatbot.py` | ✅ |
| PH10-18 | Windows Npcap detection heuristic fix | `capture/sniffer.py` | ✅ |
| PH10-19 | Regression suites: `tests/test_hardening.py` (46) + `useWebSocket.test.tsx` (4) | `tests/`, frontend `__tests__` | ✅ |
| PH10-20 | Partial-feature transparency: `missing_features` in response + broadcast | `routes/predict.py`, `schemas.py` | ✅ |

**Verification:** `pytest tests/` → 78 passing; `npm test` → 21 passing; `npm run lint`/`npm run build` green; live smoke on :8011/:8012 (health, benign+attack flows, WS auth 4401/1013, chat 503 without key).

---

## Phase 11 — Colab Conversion (2026-08-28) 🔵

| Task ID | Task | Deliverable | Status |
|---------|------|-------------|--------|
| PH11-01 | Notebook 01 — EDA Colab edition (Drive dataset, float32 loading, label detection fixed — ISSUE-05, key-numbers table) | `01_EDA_Colab.ipynb` | ✅ |
| PH11-02 | Notebook 02 — GPU training (chunked stratified load, dual scalers, arena, PyTorch MLP, artifact export + Drive sync) | `02_Training_GPU_Colab.ipynb` | ✅ |
| PH11-03 | Notebook 03 — Inference + embedded FastAPI (predict/alerts/stats/leaderboard/WS, validation guards, synthetic flows, CSV replay, tunnel, chatbot) | `03_Inference_API_Colab.ipynb` | ✅ |
| PH11-04 | Notebook 04 — Gradio command center + traffic lab + static previews | `04_Dashboard_Colab.ipynb` | ✅ |
| PH11-05 | Percent-format sources + packer (regenerate notebooks, nbformat + syntax validation) | `_build/pack.py` + `_build/*.py` | ✅ |
| PH11-06 | End-to-end smoke test (executes notebook 03 cells; asserts API + validation contract) | `_build/smoke_test.py` | ✅ |
| PH11-07 | Colab README + cleanup of local-only components (src/, frontend/, venv/, tests/, artifacts) — freed ~1.4 GB | `notebooks/colab/README.md`, working tree | ✅ |

## Phase 12 — 100/100 Upgrades (2026-08-28) 🔵

| Task ID | Task | Deliverable | Status |
|---------|------|-------------|--------|
| PH12-01 | **ROC curves + per-class AUC** (one-vs-rest, macro-average) | notebook 02 Step 9.1 → `roc_curves.png` | ✅ |
| PH12-02 | **Normalized confusion matrix** (rows sum to 1) | notebook 02 Step 9.2 → `confusion_matrix_normalized.png` | ✅ |
| PH12-03 | **Optuna Bayesian tuning** of XGBoost on T4 (20 trials; default vs tuned comparison; winner deployed) | notebook 02 Step 8.5 | ✅ |
| PH12-04 | **T4 GPU benchmark** (per-model times, XGB CPU→GPU speed-up, MLP GPU time) | notebook 02 Step 8.5 | ✅ |
| PH12-05 | **SHAP deep dive** (global top-15 mean-\|SHAP\| + per-class grouped importance) | notebook 03 Step 4.5 → `shap_global_importance.png`, `shap_per_class.png` | ✅ |
| PH12-06 | **Training summary table** (deployed-model-consistent) | notebook 02 Step 11 | ✅ |
| PH12-07 | **API contract summary table** | notebook 03 Step 6.5 | ✅ |
| PH12-08 | **EDA key-numbers table** | notebook 01 Step 14 | ✅ |
| PH12-09 | **Static dashboard preview PNGs** for the report | notebook 04 Step 4 | ✅ |
| PH12-10 | ISSUE-06 fix — benign FPR index looked up from encoder (not hardcoded 0) | notebook 02 Step 9/11 | ✅ |
| PH12-11 | ISSUE-05 fix — `Attack Type` label detection in notebooks | notebooks 01/02 | ✅ |
| PH12-12 | Docs + README synced to Colab edition | `README.md`, `docs/*` | ✅ |

## Dependencies Summary

```
PH0 → PH1 → PH2 → PH3 ─┐
        │              ├→ PH4 ──→ PH5 ──→ PH6 ─┐
        └──────────────┘                        ├→ PH7 ──→ PH8
```

- PH4 depends on PH3 (inference) & PH1 (dataset for replay).
- PH5 depends on PH4 (API target) & PH3 (52-feature contract).
- PH7 depends on PH4 (REST/WS contracts).
- PH8 spans all (final QA + docs).

## Explicit Non-Goals (⚪ FUTURE)
- AuthN/AuthZ (user accounts, roles, multi-tenancy) and TLS termination — API-key auth + rate limiting are in place, but user auth is not.
- Stream-processing (Kafka/Redis usage — libs listed, unused).
- Model registry/retraining automation (mlflow/optuna listed, unused).
- Live topology graph (aggregated Network Activity page ships; graph layout is future).
- Alembic migrations (schema created via `create_all` only).
- Playwright E2E suites (unit coverage via vitest only).