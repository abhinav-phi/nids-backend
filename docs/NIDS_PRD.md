# NIDS_PRD — Product Requirements Document

**Project:** The Sentinel — Network Intrusion Detection System (NIDS)
**Document:** NIDS_PRD.md
**Status:** ✅ Complete (evidence-based, derived from repository contents)
**Source of truth:** `README.md`, `src/model/train.py`, `src/model/predict.py`, `src/api/*`, `src/capture/sniffer.py`, `src/features/extractor.py`, notebooks, database artifacts, `send_attacks.py`, frontend code.
**Legend:** ✅ IMPLEMENTED · 🟡 PARTIAL · 🔵 NOTEBOOK-ONLY · 🔴 NOT IMPLEMENTED · ⚪ FUTURE

---

## 1. Product Vision

**The Sentinel** is a real-time, ML-powered Network Intrusion Detection System that captures live network traffic, classifies each bidirectional flow against the CICIDS2017 attack taxonomy, explains every prediction with SHAP, and streams alerts to a React-based command-center dashboard. It is built for hackathons, research, and production prototyping — with an explicit "no black box" principle: every alert is accompanied by the top-5 most influential features.

> "See every packet. Understand every threat." — README.md

---

## 2. Problem Statement

Traditional intrusion detection is either:
1. **Signature-based** (misses novel attacks) — not used here.
2. **Black-box ML** (detects but doesn't explain) — mitigated here via SHAP.

Additionally, small teams and labs lack an end-to-end, self-contained demonstration platform (capture → features → inference → explanation → dashboard → attack simulation) that works on a single machine without a real adversary.

The Sentinel addresses this with: live Scapy capture, 52 CICIDS2017-compatible features, a 9-model ML suite (best saved automatically), per-alert SHAP explanations, a WebSocket live dashboard, and scripted attack simulators.

---

## 3. Target Users & Use Cases

| User | Use Case | Supported in Repo |
|------|----------|:---:|
| Security analyst / SOC operator | Monitor live traffic; triage alerts by severity; drill into SHAP explanation per alert | ✅ |
| Security researcher / ML engineer | Retrain, compare, and evaluate models (`train.py`, notebooks, `evaluate.py`) | ✅ |
| Student / lecturer (lab demo) | Demonstrate DDoS, Port Scan, Brute Force detection live without real attacks | ✅ |
| Hackathon team | Rapid, reproducible demo pipeline (back+front+sim) on 3 terminals | ✅ |
| AI-assist user | Ask natural-language questions about the NIDS data (stats, top IPs, recent alerts) | ✅ (requires `GOOGLE_API_KEY`) |

---

## 4. Product Scope

### 4.1 In Scope
- Live packet capture (`capture/sniffer.py`) with automatic interface detection.
- 52-feature CICIDS2017-compatible flow feature extraction (`features/extractor.py`).
- Multi-model ML training & evaluation; best model auto-saved (`train.py`, 9 models).
- Real-time inference with confidence, severity mapping, and SHAP top-5 explanation.
- REST API (predict, alerts, stats, IP leaderboard, sniffer control, health).
- WebSocket live alert stream (`/ws/live`).
- React dashboard (KPI cards, traffic chart, attack pie chart, alert feed, IP leaderboard, attack timeline, SHAP explainer, chatbot).
- LangChain + Gemini chatbot grounded in the alerts database.
- Attack simulation scripts and offline dataset replay (`send_attacks.py`).
- SQLite persistence (PostgreSQL optional via `DATABASE_URL`).

### 4.2 Out of Scope (current repo evidence)
- Intrusion *prevention* (no IPS, no blocking; detection only).
- Multi-sensor / distributed deployment and stream processing (e.g., Kafka, Redis) — 🟡 noted only in `requirements.txt` (redis, etc. present but unused in code).
- User authentication / multi-tenant access control — 🔴 NOT IMPLEMENTED (none found in `main.py` or frontend).
- TLS/HTTPS termination, hardened production deployment (README flags CORS env hardening as future work).
- Real-time topology graph of live flows (frontend ships a Network Activity page with real src→dst aggregation; graph layout remains ⚪ FUTURE).

---

## 5. Functional Requirements

### 5.1 Capture & Extraction (NIDS-CAP)

| ID | Requirement | Status |
|----|-------------|--------|
| NIDS-CAP-01 | Sniffer captures live IP packets (TCP/UDP/ICMP) via Scapy on auto-detected or specified interface | ✅ IMPLEMENTED (`sniffer.py`) |
| NIDS-CAP-02 | Packets grouped into bidir flows by 5-tuple `(src_ip, dst_ip, src_port, dst_port, protocol)` | ✅ |
| NIDS-CAP-03 | Flow closes on TCP FIN/RST, after 30 s inactivity, or 500-packet cap; flows with <3 packets are discarded | ✅ |
| NIDS-CAP-04 | Windows fallback to Layer-3 capture when Npcap/WinPcap missing; admin privileges required | 🟡 PARTIAL (fallback implemented; privileges are deployment concern) |
| NIDS-CAP-05 | Extract exactly 52 features matching CICIDS2017 column names, including IATs in microseconds and Active/Idle periods (5 s threshold); NaN/Inf output coerced to 0.0 | ✅ |
| NIDS-CAP-06 | Completed flows POSTed to `POST /api/predict` asynchronously (non-blocking threads) | ✅ |

### 5.2 ML Model & Inference (NIDS-ML)

| ID | Requirement | Status |
|----|-------------|--------|
| NIDS-ML-01 | Train on CICIDS2017 cleaned dataset (2,520,751 rows × 53 cols incl. label `Attack Type`; 7 consolidated classes) | ✅ |
| NIDS-ML-02 | Compare 9 models (LR, DT, RF, XGBoost, LightGBM, SVM-RBF, MLP, Voting, Stacking); rank by Macro F1; auto-save best as `model.pkl` | ✅ (`train.py`) |
| NIDS-ML-03 | Handle class imbalance (`class_weight="balanced"`; SMOTE present but disabled in pipeline) | ✅ |
| NIDS-ML-04 | Dual scalers (StandardScaler, RobustScaler) fit & saved; production inference uses `scaler.pkl` (StandardScaler) | ✅ |
| NIDS-ML-05 | Stratified 80/20 split; test arrays persisted (`data/processed/X_test.npy`, `y_test.npy`) | ✅ |
| NIDS-ML-06 | Inference wrapper: scale → predict → `predict_proba` confidence → inverse label → severity | ✅ |
| NIDS-ML-07 | SHAP TreeExplainer cached once; per prediction returns top-5 features by |SHAP value| | ✅ |
| NIDS-ML-08 | PCA analysis (90/95/99%) and 7 engineered features evaluated — NOT used in production (SHAP/consistency) | 🟡 PARTIAL (evaluated, deliberately not deployed) |
| NIDS-ML-09 | Notebook walkthroughs (EDA, training, NN training) | 🔵 NOTEBOOK-ONLY |
| NIDS-ML-10 | Registered/versioned model artifacts in an experiment tracker | 🔴 NOT IMPLEMENTED (mlflow/optuna in requirements but unused in src) |

**Deployed model evidence (artifact inspection):** `model.pkl` = LightGBM `LGBMClassifier` (boosting=gbdt, class_weight=balanced, learning_rate=0.1, max_depth=6, min_child_samples=20, n_estimators=300, num_leaves=63, n_jobs=-1, random_state=42, subsample=1.0) trained on 52 features. `scaler.pkl` = StandardScaler. `label_encoder.pkl` classes: `Bots, Brute Force, DDoS, DoS, Normal Traffic, Port Scanning, Web Attacks`.

> ⚠️ **Modeled performance:** README documents *typical* CICIDS2017 figures (e.g., XGBoost ~99% accuracy / ~97% Macro F1, NN ~98%/~93%). Notebook output cells with exact run numbers were not preserved in the repository; precise metrics for the saved artifact are **not determinable from repository** without re-running `train.py`.

### 5.3 Severity & Alerts (NIDS-AL)

| ID | Requirement | Status |
|----|-------------|--------|
| NIDS-AL-01 | Severity mapping via lowercase substring match: DDoS/DoS-family → CRITICAL; Bot/FTP/SSH-Patator/Infiltration → HIGH; PortScan/Web-Attack → MEDIUM; Brute-Force → LOW; benign/normal → NONE; fallback LOW | ✅ (`model/predict.py`) |
| NIDS-AL-02 | Every prediction persisted as an `Alert` row (timestamp, IPs, ports, prediction, confidence, severity, SHAP JSON) | ✅ |
| NIDS-AL-03 | Non-benign predictions broadcast over WebSocket to all connected dashboards | ✅ |
| NIDS-AL-04 | Alert history retrievable with pagination + `type`/`severity` filters, `exclude_benign` default true | ✅ (`routes/alerts.py`) |

### 5.4 API & WebSocket (NIDS-API)

| ID | Endpoint | Requirement | Status |
|----|----------|-------------|--------|
| NIDS-API-01 | `POST /api/predict` | Flat JSON feature vector (52 CICIDS names + optional `_`-prefixed metadata); strict validation: 400 when no feature keys, 422 when >8 of 52 missing or any value non-numeric/non-finite/negative/>1e15 (invalid features named in response); ≤8 missing default to 0.0; ports clamped 0–65535 | ✅ |
| NIDS-API-02 | `GET /api/alerts` | Paginated alert history (limit 1–500, offset), filters | ✅ |
| NIDS-API-03 | `GET /api/stats` | Total flows, total attacks, benign count, attacks by type & severity, uptime | ✅ |
| NIDS-API-04 | `GET /api/ip-leaderboard` | Top N source IPs by attack count | ✅ |
| NIDS-API-05 | `GET /health` | DB / model / sniffer / uptime / WS client count | ✅ |
| NIDS-API-06 | `POST /api/sniffer/start` & `/stop`, `GET /api/sniffer/stats` | Sniffer lifecycle control | ✅ |
| NIDS-API-07 | `POST /api/chat` | LangChain+Gemini agent with 5 curated DB tools; returns reply + tool usage; hardened: 2000-char message cap, 60 s LLM timeout, bounded history (last 20 msgs / 2000 chars) | ✅ (needs `GOOGLE_API_KEY`) |
| NIDS-API-08 | `WS /ws/live` | On connect sends last 50 alerts as initial batch; then live pushes + 10 s pings | ✅ |
| NIDS-API-09 | CORS | Restricted to localhost:3000/5173/8080/5174 | ✅ |
| NIDS-API-10 | `GET /api/system` | Health + deployed model manifest (family/52 features/7 classes) + sniffer stats (incl. retries/dropped) + rate-limit & API-key & NIDS_CAPTURE flags | ✅ |

### 5.5 Dashboard & Chatbot (NIDS-UI)

| ID | Requirement | Status |
|----|-------------|--------|
| NIDS-UI-01 | KPI cards: Total Network Flows, Attacks Detected, System Uptime, Benign Traffic (poll `/api/stats`) | ✅ |
| NIDS-UI-02 | Live Traffic Chart (AreaChart; flows & alerts over time; polls every 5 s; last 60 points) | ✅ |
| NIDS-UI-03 | Attack Pie Chart (distribution by attack type from `/api/stats`) | ✅ |
| NIDS-UI-04 | Alert Feed (live, last 50 via WebSocket, severity color-coded) | ✅ |
| NIDS-UI-05 | IP Leaderboard (top 10 attack sources; polls every 30 s) | ✅ |
| NIDS-UI-06 | Attack Timeline (hourly buckets over 12 h; fetches every 30 s) | ✅ |
| NIDS-UI-07 | SHAP Explainer (per-alert top-5 feature bars; dashboard panel + AI Explainability page with alert picker and `?src=&t=` deep-link) | ✅ |
| NIDS-UI-08 | Chatbot (FAB; markdown-lite rendering with HTML escaped before transforms; typing indicator; 4 suggested prompts; 2000-char input cap; conversation history sent with each request) | ✅ |
| NIDS-UI-09 | Router pages: Dashboard / Alerts / Reports / Network Activity / AI Explainability / Settings — all functional, no placeholder tabs | ✅ |
| NIDS-UI-10 | WS connection indicator (StatusBar polls `/health` every 10 s) | ✅ |
| NIDS-UI-11 | Export Alerts CSV (Sidebar + AlertFeed archive view): latest 500 attack alerts, CSV-escaped values, ISO-timestamped filenames | ✅ |
| NIDS-UI-12 | Frontend automated tests (vitest + Testing Library, jsdom) — 17 specs across 6 suites | ✅ |
| NIDS-UI-13 | Settings page wired to `GET /api/system` (backend health, model manifest, sniffer counters incl. retries/dropped, security flags; live refresh) | ✅ |
| NIDS-UI-14 | Network Activity page: real src→dst flow aggregation from latest 500 alerts (counts, volume bars, attack types, max severity) | ✅ |
| NIDS-UI-15 | StatusBar shows real per-component states (System/Model/DB/Sniffer/WS), local-time clock, uptime | ✅ |
| NIDS-UI-16 | AI Explainability page: alert picker + SHAPExplainer with deep-link support (`/explain?src=&t=`) | ✅ |
| NIDS-UI-17 | Professional polish: no emojis, explicit empty/error/loading states on every data surface, ARIA labels on filters/FAB/nav | ✅ |

### 5.6 Attack Simulation (NIDS-SIM)

| ID | Script | Behavior | Status |
|----|--------|----------|--------|
| NIDS-SIM-01 | `sim_ddos.py` | UDP flood, random source IPs, default target `127.0.0.1:80`, ~300 packets, small delay | ✅ |
| NIDS-SIM-02 | `sim_portscan.py` | SYN packets to port range 20–200 from fixed source `10.0.0.99` | ✅ |
| NIDS-SIM-03 | `sim_bruteforce.py` | SYN → PA (fake SSH banner) → RST attempts against port 22 from `10.0.0.77`, ~100 attempts | ✅ |
| NIDS-SIM-04 | `sim_mixed.py` | Sequenced DDoS → PortScan → BruteForce with pauses | ✅ |
| NIDS-SIM-05 | `send_attacks.py` | Balanced sampling of attack rows from the cleaned CSV, replayed to `/api/predict` | ✅ |

### 5.7 Testing (NIDS-TST)

| ID | Artifact | Description | Status |
|----|----------|-------------|--------|
| NIDS-TST-01 | `tests/test_extractor.py` | Feature-extractor sanity tests (normal/DDoS/portscan fixtures) | ✅ |
| NIDS-TST-02 | `tests/test_api.py` | API tests (TestClient + SQLite test DB + dependency override) | ✅ |
| NIDS-TST-03 | `test_pipeline.py` | End-to-end extract → predict (in-process) | ✅ |
| NIDS-TST-04 | `test_api.py` (root) | Live-server integration test (requires running API) | 🟡 |
| NIDS-TST-05 | `test2_api.py` (root) | 20 random flow POSTs against live API | 🟡 |
| NIDS-TST-06 | `check.py` | Loads artifacts, prints `n_features_in_` (52) sanity output, writes `manifest.json` (model family, 52 features, 7 classes, `checks_ok`) | ✅ |
| NIDS-TST-07 | Frontend suites | vitest + Testing Library (jsdom, matchMedia polyfill): AlertFeed, AttackTimeline, Chatbot, Sidebar, StatusBar, Settings — 17 specs | ✅ |

> All runnable via `pytest tests/`; root scripts documented in README.

---

## 6. Non-Functional Requirements

| ID | Requirement | Evidence / Status |
|----|-------------|-------------------|
| NIDS-NFR-01 | **Performance:** single-flow inference must be near-instant; SHAP explainer cached (was per-request; fixed) | ✅ `model/predict.py` |
| NIDS-NFR-02 | **Throughput boundaries:** flow memory bounded by per-flow 500-packet cap and 30 s timeout; API calls made in daemon threads | ✅ |
| NIDS-NFR-03 | **Portability:** Windows (Npcap/WinPcap + L3 fallback) and Linux/macOS interface detection | ✅ |
| NIDS-NFR-04 | **Upgradeability:** PostgreSQL supported via `DATABASE_URL`; SQLite default with concurrent-access settings | 🟡 (PostgreSQL not exercised in repo evidence) |
| NIDS-NFR-05 | **Explainability:** every non-benign alert carries SHAP top-5 | ✅ |
| NIDS-NFR-06 | **Reproducibility:** fixed `random_state=42` throughout training; deterministic SVM 15k slice | ✅ |
| NIDS-NFR-07 | **Security:** chatbot API key from env (`GOOGLE_API_KEY`); `.env` gitignored; model/artifacts gitignored; optional API-key auth on all `/api/*` (`NIDS_API_SECRET` → `X-API-Key` header) + per-IP rate limiting (`NIDS_RATE_LIMIT`, default 120/min) | ✅ (but see NIDS-NFR-08) |
| NIDS-NFR-08 | **Secret hygiene:** local `.env` currently contains a real Google API key; must be rotated/kept out of any repo copy | ⚠️ ACTION REQUIRED |
| NIDS-NFR-09 | **Availability:** frontend survives backend downtime (axios interceptor logs "Backend offline"; WebSocket auto-reconnects with 3 s delay) | ✅ |
| NIDS-NFR-10 | **Scalability:** in-memory flow tables + synchronous SQLite writes; no queueing. Suited to single-host demo/research scale | 🟡 |

---

## 7. Detection Scope

### 7.1 Classes (label encoder artifact)
`Bots`, `Brute Force`, `DDoS`, `DoS`, `Normal Traffic`, `Port Scanning`, `Web Attacks` — consolidation of the raw CICIDS2017 (14 attack + benign) labels into 7 classes during dataset cleaning (per notebook/EDA and encoder artifact).

### 7.2 Severity levels
The model output space is exactly the 7 classes above. Mapped via lowercase substring rules in `predict.py` (`SEVERITY_MAP`):

| Level | Mapped classes (achievable predictions) |
|-------|--------------------------------------------------|
| CRITICAL | DDoS, DoS (bare `"dos"` keyword added — previously fell through to LOW fallback) |
| HIGH | Bots |
| MEDIUM | Port Scanning, Web Attacks |
| LOW | Brute Force, unknown/fallback |
| NONE | Benign / Normal / Normal Traffic |

---

## 8. Known Issues & Discrepancies (must be understood by stakeholders)

1. **✅ NIDS-ISSUE-01 — "BENIGN" string mismatch (FIXED):** the model's benign class is **"Normal Traffic"**, but API/WS/stats/chatbot alignment code filtered on `prediction != "BENIGN"`. Fix: single `BENIGN_LABELS = ("Normal Traffic", "BENIGN")` in `src/api/constants.py` + `is_benign()` helper; all filters use `prediction.notin_(BENIGN_LABELS)`. Regression tests added (32 tests green). Rows persisted before the fix still carry "Normal Traffic" labels but are now counted correctly.
2. **✅ NIDS-ISSUE-02 — Severity "NONE" still creates alerts (FIXED):** benign flows are persisted (needed for stats) but no longer broadcast over WS or shown in default alert feeds/chatbot tools.
3. **✅ NIDS-ISSUE-03 — Sidebar log export placeholder (FIXED):** hardcoded CSV row removed; only real exports remain (Sidebar + AlertFeed archive, latest 500 attack alerts).
4. **✅ NIDS-ISSUE-04 — AttackTimeline synthetic noise (FIXED):** dummy rows removed; chart shows only real alert counts (`bucketByHour`, 12 hourly buckets) with honest empty/error states.
5. **⚠️ NIDS-ISSUE-05 — Notebook label detection** searches for `"label"` in column names, but the CSV label is `Attack Type` (production `train.py` handles this via explicit `LABEL_COL` + fallback; notebooks may print `Label column: None`).
6. **⚠️ NIDS-ISSUE-06 — `evaluate.py` FPR assumes benign class index 0**; encoder index 0 is `Bots` — needs an explicit benign label (offline evaluation only; not in the production path).
7. **⚠️ SEC-02 — local `.env` holds a live Gemini key** — treat as compromised and rotate; never commit anywhere.

---

## 9. MVP vs Future

| Capability | MVP (shipped repo) | Backlog (⚪ FUTURE) |
|------------|:---:|:---:|
| Capture → features → classify → explain → alert | ✅ | |
| Live dashboard + WS | ✅ | |
| Attack simulators | ✅ | |
| Chatbot | ✅ | |
| Multi-class benign filtering (`BENIGN_LABELS`) | ✅ | |
| Real-time topology graph | | ⚪ (Network Activity page ships; live graph layout future) |
| Authentication / authorization | | ⚪ |
| Alert deduplication, suppression rules | | ⚪ |
| Streaming infra (Redis/Kafka) | (libs listed only) | ⚪ |
| Notification (email/Slack) | | ⚪ |
| Model registry / automated retraining | | ⚪ |

---

## 10. Acceptance Criteria (evidence-gated)

| # | Criterion | How to verify |
|---|-----------|---------------|
| AC-1 | Live traffic is converted to 52-feature vectors | Run `test_pipeline.py`; observe `Total Backward Packets`-excluded feature count = 52 in extractor output |
| AC-2 | Inference returns prediction + confidence + severity + SHAP top-5 | `POST /api/predict` with a CICIDS row; response shape per `PredictResponse` |
| AC-3 | Alerts persist | `GET /api/alerts` returns rows; `nids.db` contains `alerts` table |
| AC-4 | Live stream reaches dashboard | Open dashboard; `POST /api/predict` with attack features; alert appears without page refresh |
| AC-5 | Stats endpoint summary | `GET /api/stats` returns total_flows, attacks_by_type, attacks_by_severity, uptime_seconds |
| AC-6 | Chatbot answers from data | `POST /api/chat` returns reply with tool_used (API key required) |
| AC-7 | Simulators generate detectable traffic | Run `sim_mixed.py` against backend; dashboard shows DDoS/PortScan/BruteForce alerts |
| AC-8 | Training reproducible | `python src/model/train.py` completes and regenerates model/scaler/encoder artifacts |
| AC-9 | Predict input validation contract | POST malformed payloads (zero feature keys / >8 missing / negative or non-finite values) → 400/422 with named invalid features; regression-tested in pytest |

---

## 11. Data Requirements

| Item | Detail |
|------|--------|
| Dataset | `cicids2017_cleaned.csv` (in `nids-backend/data/raw/`, ~717 MB): 2,520,751 rows × 53 columns, `Attack Type` label, 7 classes |
| Produced artifacts | `model.pkl` (LGBM, 52 ftrs), `scaler.pkl` (StandardScaler), `robust_scaler.pkl` (RobustScaler), `label_encoder.pkl`, `X_test.npy` (33 MB), `y_test.npy` |
| Runtime DB | `nids.db` (SQLite) — 1,999 alert rows at latest inspection (1,801 Normal Traffic + 198 attack alerts) |
| Env vars | `GOOGLE_API_KEY` (required for chatbot), `GEMINI_MODEL` (default `gemini-2.5-flash`), `DATABASE_URL` (default sqlite), `NIDS_CAPTURE` (1/true/yes auto-starts sniffer), `NIDS_API_SECRET` (optional API-key auth on `/api/*`), `NIDS_RATE_LIMIT` (per-IP requests/min, default 120) |
| Gitignored | `.env`, `*.pkl`, `nids-backend/data/`, `*.db`, node_modules, venv, PDFs, VIVA docs |

---

## 12. Constraints & Assumptions

1. Detection is per-flow and post-hoc (flow must complete before inference) — not per-packet inline.
2. Model is a static artifact; no incremental learning in the running system.
3. Chatbot requires an external Gemini API key and network egress; unavailable without it (route returns 503).
4. Packet capture requires admin/root privileges and, on Windows, Npcap.
5. Feature-space contract is fixed at 52 features; the live extractor deliberately omits engine-only features (e.g., SYN Flag Count, Total Backward Packets) to keep SHAP/inference consistent — engineered 7-feature variant is comparison-only.
6. All numbers, rates, and behaviors in this document are derived from repository code/artifacts; anything not evidenced is marked "Not determinable from repository."