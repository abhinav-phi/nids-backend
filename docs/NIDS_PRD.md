# NIDS_PRD — Product Requirements Document

**Project:** The Sentinel — Network Intrusion Detection System (NIDS)
**Document:** NIDS_PRD.md
**Status:** ✅ Complete — **Colab Edition** (2026-08-28): the project runs entirely on Google Colab (T4 GPU) via 4 notebooks. The local FastAPI backend, React frontend, Scapy sniffer and pytest suite have been replaced by notebook-embedded equivalents (`_build/*.py` percent-format sources; rebuild via `_build/pack.py`).
**Source of truth:** `README.md`, `nids-backend/notebooks/colab/01_EDA_Colab.ipynb`, `02_Training_GPU_Colab.ipynb`, `03_Inference_API_Colab.ipynb`, `04_Dashboard_Colab.ipynb`, `docs/`.
**Legend:** ✅ IMPLEMENTED · 🟡 PARTIAL · 🔵 NOTEBOOK-ONLY (Colab) · 🟠 LOCAL-ONLY (removed) · 🔴 NOT IMPLEMENTED · ⚪ FUTURE

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

The Sentinel addresses this with: 52 CICIDS2017-compatible features, a **7-model arena + Optuna-tuned XGBoost + PyTorch MLP on T4 GPU** (best saved automatically), per-alert SHAP explanations (plus global & per-class SHAP deep-dive plots), per-class ROC/AUC evaluation, and a live Gradio command center — all inside Google Colab notebooks.

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

### 4.1 In Scope (Colab Edition)
- CICIDS2017 dataset loading (Google Drive) + EDA (notebook 01).
- 52-feature CICIDS2017-compatible flow feature extraction (`FlowExtractor`, notebook 03).
- GPU-accelerated ML training & evaluation: 7-model arena + Optuna tuning + PyTorch MLP on T4 (notebook 02).
- ROC curves + per-class AUC, normalized confusion matrix, per-class F1, benign FPR (notebook 02).
- Real-time inference with confidence, severity mapping, and SHAP top-5 explanation (notebook 03).
- SHAP deep dive: global top-15 importance + per-class feature importance plots (notebook 03).
- Embedded FastAPI backend (predict, alerts, stats, IP leaderboard, WebSocket) with production validation semantics (notebook 03).
- Dataset replay through the API (CSV → `/api/predict`) — the offline path of `send_attacks.py`.
- Gradio command-center dashboard (KPIs, pie, severity, live feed, leaderboard, timeline, SHAP explainer, traffic injection) + static report PNGs (notebook 04).
- Public Cloudflare tunnel URL + optional Gemini mini-chatbot (notebook 03).
- SQLite persistence inside the Colab VM (`/content/nids_colab.db`).

### 4.2 Out of Scope (current repo evidence)
- Intrusion *prevention* (no IPS, no blocking; detection only).
- Multi-sensor / distributed deployment and stream processing (Kafka/Redis) — not used.
- User authentication / multi-tenant access control — 🔴 NOT IMPLEMENTED.
- TLS/HTTPS termination — public URLs are plain HTTP tunnels (demo-grade).
- **🟠 LOCAL-ONLY (removed):** Scapy live packet capture (`src/capture/sniffer.py`), packet-level attack simulators (`src/simulation/*`), the React dashboard (`nids-frontend/`), and the pytest suite cannot run on a Colab VM (no raw-socket access / no Node). The Colab notebooks replace them with synthetic flows, CSV replay, a Gradio UI, and a notebook-level smoke-test suite (`_build/smoke_test.py`).

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
| NIDS-ML-01 | Train on CICIDS2017 cleaned dataset (2,520,751 rows × 53 cols incl. label `Attack Type`; 7 consolidated classes) | ✅ (notebook 02) |
| NIDS-ML-02 | Compare models (LR, DT, RF, XGBoost, LightGBM, PyTorch MLP + Optuna-tuned XGBoost) on **T4 GPU**; rank by Macro F1; auto-save best as `model.pkl` | ✅ (notebook 02) |
| NIDS-ML-02b | **ROC curves + per-class AUC (one-vs-rest)** and macro-average AUC | ✅ (notebook 02, Step 9.1) |
| NIDS-ML-02c | **Normalized confusion matrix** (rows sum to 1) in addition to raw counts | ✅ (notebook 02, Step 9.2) |
| NIDS-ML-02d | **Optuna Bayesian tuning** of XGBoost (20 trials on T4); tuned model compared vs default and deployed if it wins | ✅ (notebook 02, Step 8.5 — repo `train.py` only used fixed hyper-parameters) |
| NIDS-ML-02e | **T4 GPU benchmark**: per-model training times, XGBoost CPU→GPU speed-up, PyTorch MLP GPU time | ✅ (notebook 02, Step 8.5) |
| NIDS-ML-03 | Handle class imbalance (`class_weight="balanced"`; SMOTE optional flag, default off) | ✅ |
| NIDS-ML-04 | Dual scalers (StandardScaler, RobustScaler) fit & saved; production inference uses `scaler.pkl` (StandardScaler) | ✅ |
| NIDS-ML-05 | Stratified 80/20 split; test arrays persisted (`X_test.npy`, `y_test.npy`) | ✅ |
| NIDS-ML-06 | Inference wrapper: scale → predict → `predict_proba` confidence → inverse label → severity | ✅ (notebook 03) |
| NIDS-ML-07 | SHAP TreeExplainer cached once; per prediction returns top-5 features by |SHAP value| | ✅ |
| NIDS-ML-07b | **SHAP deep dive**: global top-15 mean-|SHAP| bar plot + per-class grouped importance chart, saved as PNGs | ✅ (notebook 03, Step 4.5) |
| NIDS-ML-08 | PCA analysis (90/95/99%) and 7 engineered features evaluated — NOT used in production (SHAP/consistency) | 🟡 PARTIAL (evaluated, deliberately not deployed) |
| NIDS-ML-09 | Colab notebook walkthroughs (EDA → training → inference/API → dashboard) | 🔵 NOTEBOOK-ONLY (4 notebooks) |
| NIDS-ML-10 | Registered/versioned model artifacts in an experiment tracker (mlflow) | 🔴 NOT IMPLEMENTED (mlflow listed only; Optuna IS used in notebook 02) |

**Deployed model evidence (artifact inspection):** `model.pkl` = LightGBM `LGBMClassifier` (boosting=gbdt, class_weight=balanced, learning_rate=0.1, max_depth=6, min_child_samples=20, n_estimators=300, num_leaves=63, n_jobs=-1, random_state=42, subsample=1.0) trained on 52 features. `scaler.pkl` = StandardScaler. `label_encoder.pkl` classes: `Bots, Brute Force, DDoS, DoS, Normal Traffic, Port Scanning, Web Attacks`.

> ⚠️ **Modeled performance:** README documents *typical* CICIDS2017 figures. Notebook 02 produces exact run numbers (comparison table, ROC/AUC, per-class F1, FPR) every time it is executed on Colab — fill the report from its **Step 11 Training Summary** cell.

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
| NIDS-API-01 | `POST /api/predict` | Flat JSON **object** (52 CICIDS names + optional `_`-prefixed metadata; metadata IPs validated as real IPv4/IPv6); strict validation: 400 when the root is not an object or no feature keys, 422 when >8 of 52 missing, any value non-numeric/non-finite/negative/>1e15, or a metadata IP is invalid (invalid features named in response); ≤8 missing default to 0.0 and the count is exposed as `missing_features`; ports (incl. `Infinity`/`NaN` payloads) clamped 0–65535; blocking inference + DB commit off the event loop | ✅ |
| NIDS-API-02 | `GET /api/alerts` | Paginated alert history (limit 1–500, offset), filters (`type` substring with escaped wildcards), deterministic `timestamp DESC, id DESC` ordering | ✅ |
| NIDS-API-03 | `GET /api/stats` | Total flows, total attacks, benign count, attacks by type & severity, uptime | ✅ |
| NIDS-API-04 | `GET /api/ip-leaderboard` | Top N source IPs by attack count (`limit` bounded 1–100) | ✅ |
| NIDS-API-05 | `GET /health` | DB / model / sniffer / uptime / WS client count; cached DB probe; no raw error strings | ✅ |
| NIDS-API-06 | `POST /api/sniffer/start` & `/stop`, `GET /api/sniffer/stats` | Sniffer lifecycle control; start takes an optional validated `{"interface": …}` JSON body and is race-safe (one instance under concurrent starts); stop/stats never instantiate | ✅ |
| NIDS-API-07 | `POST /api/chat` | LangChain+Gemini agent with 5 curated DB tools; returns reply + tool usage; hardened: 2000-char message cap, 60 s LLM timeout (504), structurally bounded history (≤50 string entries, only `user` turns trusted), tool args type-coerced, tool output treated as untrusted data | ✅ (needs `GOOGLE_API_KEY`) |
| NIDS-API-08 | `WS /ws/live` | Authenticated when `NIDS_API_SECRET` is set (`?token=`/header; 4401 on failure); bounded to `NIDS_WS_MAX_CLIENTS` (1013 beyond); on connect sends last 50 alerts as initial batch; then live pushes (concurrent, 5 s per-client send timeout) + 10 s pings | ✅ |
| NIDS-API-09 | CORS | Restricted to localhost:3000/5173/8080/5174 | ✅ |
| NIDS-API-10 | `GET /api/system` | Health + deployed model manifest (family/52 features/7 classes) + sniffer stats (incl. retries/dropped) + rate-limit & API-key & NIDS_CAPTURE flags | ✅ |
| NIDS-API-11 | Global request-body cap | `NIDS_MAX_BODY_BYTES` (default 1 MB → 413) enforced before JSON parsing | ✅ |

### 5.5 Dashboard & Chatbot (NIDS-UI) — Colab Gradio edition

> The original React dashboard (`nids-frontend/`) is 🟠 LOCAL-ONLY (removed). Notebook 04 rebuilds the same views over the same API with Gradio; notebook 03 embeds the Gemini mini-chatbot.

| ID | Requirement | Status |
|----|-------------|--------|
| NIDS-UI-01 | KPI strip: flows, attacks, benign, uptime (poll `/api/stats`) | ✅ (Gradio tab 📊) |
| NIDS-UI-02 | Live alert feed with severity colors (3 s auto-refresh = WS-equivalent) | ✅ |
| NIDS-UI-03 | Attack pie chart (by type) + severity bar chart | ✅ |
| NIDS-UI-04 | Attacker leaderboard (`/api/ip-leaderboard`) | ✅ (tab 🕵) |
| NIDS-UI-05 | Attack timeline (last 500 alerts, hourly buckets, real counts only) | ✅ |
| NIDS-UI-06 | Per-alert SHAP explainer (dropdown picker → top-5 bars) | ✅ (tab 🧠) |
| NIDS-UI-07 | Traffic injection lab (balanced CSV replay, configurable per-class count) | ✅ (tab 🧪) |
| NIDS-UI-08 | Static dashboard preview PNGs for the report | ✅ (notebook 04, Step 4) |
| NIDS-UI-09 | Public `*.gradio.live` share URL | ✅ |

### 5.6 Attack Simulation (NIDS-SIM) — Colab edition

> The raw-packet simulators (`sim_ddos.py`, `sim_portscan.py`, `sim_bruteforce.py`, `sim_mixed.py`) are 🟠 LOCAL-ONLY (removed — Colab VMs have no raw-socket access). Notebook 03 reproduces their attack patterns **in memory** as packet-dict flows through the identical `FlowExtractor → predict` pipeline; notebooks 03/04 replay balanced CICIDS2017 CSV rows through the live API (the `send_attacks.py` path).

| ID | Scenario | Colab equivalent | Status |
|----|----------|------------------|--------|
| NIDS-SIM-01 | DDoS flow — hundreds of tiny one-way SYN packets at line rate | `make_ddos_flow()` (notebook 03, Step 4) | ✅ |
| NIDS-SIM-02 | Port scan burst — many single-SYN flows to sequential ports (majority vote) | `make_portscan_burst()` | ✅ |
| NIDS-SIM-03 | Brute force — payload-bearing PSH/ACK login attempts to `:22` | `make_bruteforce_flow()` | ✅ |
| NIDS-SIM-04 | Normal browsing flow (handshake, bidirectional TLS-like payloads) | `make_normal_flow()` | ✅ |
| NIDS-SIM-05 | Balanced CSV replay through `/api/predict` (per-class sampling) | notebooks 03 (Step 7) + 04 (Traffic lab) | ✅ |

### 5.7 Testing (NIDS-TST) — Colab edition

> The pytest suite (`tests/`, 78 tests) is 🟠 LOCAL-ONLY (removed). Notebook verification is provided by `_build/smoke_test.py` — a local end-to-end harness that executes notebook 03's embedded code (inference, FlowExtractor, FastAPI app, uvicorn server) against throwaway artifacts and asserts the full API + validation contract.

| ID | Artifact | Description | Status |
|----|----------|-------------|--------|
| NIDS-TST-01 | `_build/smoke_test.py` | Executes notebook 03 cells in-process; checks health, predict (normal/DDoS), persistence, alerts/stats/leaderboard, and every validation guard (400/422/NaN/IP) | ✅ |
| NIDS-TST-02 | Notebook 03 smoke-test cell | Live API checks against the running notebook server (health, benign/attack flows, rejection guards, contract summary) | ✅ |
| NIDS-TST-03 | Notebook 02 evaluation cells | Confusion matrix (raw + normalized), classification report, ROC/AUC, per-class F1, benign FPR, Optuna study | ✅ |
| NIDS-TST-04 | `_build/pack.py` | Assembles `.ipynb` from sources and runs nbformat + syntax validation on every rebuild | ✅ |

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
| NIDS-NFR-07 | **Security:** chatbot API key from env (`GOOGLE_API_KEY`); `.env` gitignored; model/artifacts gitignored; optional API-key auth on all `/api/*` HTTP (`NIDS_API_SECRET` → `X-API-Key`, constant-time compare) **and on `/ws/live`** (`?token=`/header, 4401) + per-IP rate limiting (`NIDS_RATE_LIMIT`, default 120/min, invalid values fall back safely, stale entries evicted) + global body cap (`NIDS_MAX_BODY_BYTES`, default 1 MB) + WS client cap (`NIDS_WS_MAX_CLIENTS`, default 20) | ✅ (but see NIDS-NFR-08) |
| NIDS-NFR-08 | **Secret hygiene:** the Gemini key that leaked into a historical audit document is treated as compromised — the literal has been redacted from the repository; **rotation in Google Cloud Console remains a manual user action** | ⚠️ ACTION REQUIRED (rotation) |
| NIDS-NFR-09 | **Availability:** frontend survives backend downtime (axios interceptor logs "Backend offline"; WebSocket auto-reconnects with 3 s delay, stops on 4401 auth rejection); backend survives corrupt model artifacts (503 mode) and invalid rate-limit env (safe fallback); WS fan-out is concurrent with per-client send timeouts so one stalled dashboard cannot stall the rest | ✅ |
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

1. **✅ NIDS-ISSUE-01 — "BENIGN" string mismatch (FIXED):** the model's benign class is **"Normal Traffic"**, but API/WS/stats/chatbot alignment code filtered on `prediction != "BENIGN"`. Fix: single `BENIGN_LABELS = ("Normal Traffic", "BENIGN")` in `src/api/constants.py` + `is_benign()` helper; all filters use `prediction.notin_(BENIGN_LABELS)`. Regression tests added (78 backend tests green). Rows persisted before the fix still carry "Normal Traffic" labels but are now counted correctly.
2. **✅ NIDS-ISSUE-02 — Severity "NONE" still creates alerts (FIXED):** benign flows are persisted (needed for stats) but no longer broadcast over WS or shown in default alert feeds/chatbot tools.
3. **✅ NIDS-ISSUE-03 — Sidebar log export placeholder (FIXED):** hardcoded CSV row removed; only real exports remain (Sidebar + AlertFeed archive, latest 500 attack alerts).
4. **✅ NIDS-ISSUE-04 — AttackTimeline synthetic noise (FIXED):** dummy rows removed; chart shows only real alert counts (`bucketByHour`, 12 hourly buckets) with honest empty/error states.
5. **✅ NIDS-ISSUE-05 — Notebook label detection (FIXED in Colab edition):** the original repo notebooks searched for `"label"` while the CSV column is `Attack Type` (printed `Label column: None`). Colab notebook 01/02 detect `Attack Type` directly (with `attack`/`label` fallback). 🟠 local notebooks removed.
6. **✅ NIDS-ISSUE-06 — `evaluate.py` FPR benign-index assumption (FIXED in Colab edition):** the repo `evaluate.py` assumed benign class index 0 (class 0 is `Bots`). Colab notebook 02 computes the benign index from the encoder (`le.classes_.index("Normal Traffic")`) before FPR — see Step 9 / Step 11. 🟠 `evaluate.py` removed with the local code.
7. **⚠️ SEC-02 — leaked Gemini key must be rotated** — the key literal previously printed in a historical audit document has been scrubbed from the repository; the value itself must be treated as compromised and **rotated in Google Cloud Console** (external account-level action, tracked as PH9-10).
8. **🟠 LOCAL-ONLY removal note:** `src/`, `nids-frontend/`, `venv/`, `tests/`, `model.pkl`, `nids.db` and the original notebooks were deleted in the Colab-only cleanup (freed ~1.4 GB). Everything they provided is available in the notebooks; the git history still contains them.

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
| AC-1 | Live traffic is converted to 52-feature vectors | Notebook 03 synthetic-flow cell: `FlowExtractor.extract_from_dicts` output has exactly 52 keys (asserted); smoke test asserts the same |
| AC-2 | Inference returns prediction + confidence + severity + SHAP top-5 | `POST /api/predict` with a CICIDS row; response shape per `PredictResponse` |
| AC-3 | Alerts persist | `GET /api/alerts` returns rows; `nids.db` contains `alerts` table |
| AC-4 | Live stream reaches dashboard | Open dashboard; `POST /api/predict` with attack features; alert appears without page refresh |
| AC-5 | Stats endpoint summary | `GET /api/stats` returns total_flows, attacks_by_type, attacks_by_severity, uptime_seconds |
| AC-6 | Chatbot answers from data | `POST /api/chat` returns reply with tool_used (API key required) |
| AC-7 | Simulators generate detectable traffic | Run `sim_mixed.py` against backend; dashboard shows DDoS/PortScan/BruteForce alerts |
| AC-8 | Training reproducible | Run notebook 02 on Colab (T4): completes end-to-end and regenerates `model.pkl` / `scaler.pkl` / `label_encoder.pkl` / `manifest.json` in `/content/nids_artifacts/` |
| AC-9 | Predict input validation contract | POST malformed payloads (zero feature keys / >8 missing / negative or non-finite values) → 400/422 with named invalid features; regression-tested in pytest |

---

## 11. Data Requirements

| Item | Detail |
|------|--------|
| Dataset | `cicids2017_cleaned.csv` (uploaded to Google Drive `MyDrive/nids_data/`, 685 MB): 2,520,751 rows × 53 columns, `Attack Type` label, 7 classes |
| Produced artifacts | Written to `/content/nids_artifacts/` (notebook 02): `model.pkl` (best sklearn model, 52 ftrs), `scaler.pkl` (StandardScaler), `robust_scaler.pkl` (RobustScaler), `label_encoder.pkl`, `feature_names.json`, `X_test.npy` / `y_test.npy`, `manifest.json`, `model_torch.pt` (if MLP wins), plus plots (comparison, ROC, confusion matrices, SHAP) — synced to `MyDrive/nids_artifacts/` and zipped |
| Runtime DB | `/content/nids_colab.db` (SQLite, WAL) — created by notebook 03/04's embedded API |
| Public URLs | Cloudflare `trycloudflare.com` tunnel (notebook 03) · Gradio `*.gradio.live` (notebook 04) |
| Env/secrets | `GOOGLE_API_KEY` (optional, notebook 03 chatbot via `getpass` — never persisted) |
| Gitignored | `.env`, `*.pkl`, `*.db`, `data/`, `venv/`, `node_modules/` |

---

## 12. Constraints & Assumptions

1. Detection is per-flow and post-hoc (flow must complete before inference) — not per-packet inline.
2. Model is a static artifact; no incremental learning in the running system.
3. Chatbot requires an external Gemini API key and network egress; unavailable without it (optional cell in notebook 03).
4. 🟠 Packet capture and packet simulators require a local machine (admin/Npcap) — Colab replaces them with synthetic flows and CSV replay.
5. Feature-space contract is fixed at 52 features; the extractor deliberately omits engine-only features (e.g., SYN Flag Count, Total Backward Packets) to keep SHAP/inference consistent.
6. All numbers, rates, and behaviors in this document are derived from repository code/artifacts; exact run metrics are produced fresh every notebook execution (summary tables).