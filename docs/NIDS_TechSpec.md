# NIDS_TechSpec — Technical Specification

**Project:** The Sentinel — Network Intrusion Detection System (NIDS)
**Document:** NIDS_TechSpec.md
**Status:** ✅ Complete — **Colab Edition** (2026-08-28). The implementation now lives in 4 Colab notebooks; the original per-file specs (§3, §5) remain as the design contract those notebooks implement, with paths remapped.
**Legend:** ✅ IMPLEMENTED · 🟡 PARTIAL · 🔵 NOTEBOOK-ONLY (Colab) · 🟠 LOCAL-ONLY (removed) · 🔴 NOT IMPLEMENTED · ⚪ FUTURE

---

## 1. System Overview (Colab Edition)

Single-runtime architecture: everything executes inside Google Colab notebooks on the T4 GPU VM.

- **Notebook 01 — EDA:** dataset loading, exploration, data-quality report.
- **Notebook 02 — Training:** sampling → cleaning → encode → split → dual scalers → model arena → **Optuna** → **ROC/AUC** → artifacts (synced to Drive).
- **Notebook 03 — Inference + API:** embedded inference stack + `FlowExtractor` + FastAPI (uvicorn thread) + CSV replay + SHAP deep dive + optional public tunnel & Gemini chatbot.
- **Notebook 04 — Dashboard:** Gradio UI polling the same API + static report PNGs.

```
┌────────────────────────────────────────────────────────────────────┐
│ Google Colab (T4 GPU VM)                                           │
│                                                                    │
│  01_EDA       02_Training_GPU    03_Inference_API    04_Dashboard │
│  dataset ──►  model arena ──►    FastAPI + WS ──►     Gradio UI    │
│  exploration  + Optuna + ROC     + FlowExtractor     + PNG export  │
│               artifacts ──►      + replay + SHAP      (share URL)  │
│                   │                  │                  ▲          │
│                   ▼                  ▼                  │          │
│            MyDrive/nids_artifacts    SQLite (in-VM) ────┘          │
│            MyDrive/nids_data (CSV)  Cloudflare tunnel → browser    │
└────────────────────────────────────────────────────────────────────┘
```

### 1.1 Notebook-to-component mapping
| Original repo component | Colab notebook |
|-------------------------|----------------|
| `src/model/train.py` | 02 (Steps 1–10) |
| `src/model/evaluate.py` | 02 (Steps 9–9.2) |
| `src/model/predict.py` | 03 (Step 2 — `frag_inference.py`) |
| `src/features/extractor.py` | 03 (Step 3) |
| `src/simulation/*` | 03 (Step 4 — synthetic flows) |
| `src/api/*` (main, routes, db, models, schemas, constants) | 03 (Steps 5–6 — `frag_api.py`) |
| `send_attacks.py` | 03 (Step 7) / 04 (Traffic lab) |
| `nids-frontend/` (React) | 04 (Gradio dashboard) |
| `routes/chatbot.py` (LangChain) | 03 (Step 9 — Gemini REST mini-chatbot) |
| `tests/` (pytest) | `_build/smoke_test.py` + notebook 03 smoke cells |

---

## 2. Technology Stack (Colab runtime)

### 2.1 ML / Data (preinstalled on Colab, or `pip install` in notebook 01 cells)
| Technology | Role |
|------------|------|
| Python 3.10+ (Colab VM) | Language |
| pandas / numpy | Data pipeline (float32 reads to halve RAM) |
| scikit-learn | Models, scalers, encoders, metrics |
| **XGBoost** | GPU-accelerated classifier (`device='cuda'`, `tree_method='hist'`) |
| **LightGBM** | CPU classifier (deployed-model family) |
| **PyTorch** | T4 GPU MLP (256-128-64, class-weighted loss, early stopping) |
| **Optuna** | Bayesian hyper-parameter tuning of XGBoost (notebook 02) |
| **SHAP** | TreeExplainer — per-alert top-5 + global & per-class importance |
| imbalanced-learn | SMOTE (optional flag, default off — `class_weight="balanced"` used) |
| matplotlib / seaborn | ROC/AUC, confusion matrices, comparison & summary plots |
| joblib | Artifact (de)serialization |
| scapy | Only for `FlowExtractor`'s packet-dict contract (no live capture) |

### 2.2 Backend / API (embedded in notebook 03)
| Technology | Role |
|------------|------|
| FastAPI + Uvicorn | REST + WebSocket server (background thread) |
| SQLAlchemy | ORM + SQLite session (`/content/nids_colab.db`, WAL) |
| pydantic | Response schemas (mirrors original `schemas.py`) |
| requests / httpx | API smoke tests + CSV replay + tunnel checks |
| starlette `run_in_threadpool` | Blocking ML/DB work off the event loop |
| cloudflared | Public `trycloudflare.com` tunnel (ngrok documented alternative) |
| google-generativelanguage REST | Optional Gemini mini-chatbot (grounded in alert data) |

### 2.3 Dashboard (notebook 04)
| Technology | Role |
|------------|------|
| **Gradio** | Blocks UI: KPI strip, charts, live feed, leaderboard, timeline, SHAP explainer, traffic lab |
| matplotlib (Agg) | Chart figures + static report PNGs |
| requests | Polls the embedded API (identical to React `client.ts`) |

> 🟠 Removed local stack: `nids-frontend/` (React 18, Vite, Tailwind, Recharts, TanStack Query), `requirements.txt` (LangChain, mlflow, redis, psycopg2, scapy capture path), pytest suite, venv.

---

## 3. Backend Components

> 📌 **How to read §3–§5:** these sections preserve the original per-file design contract. In the Colab edition every described component is implemented **inside the notebooks** (mapping in §1.1); file paths refer to the original repo layout, preserved in git history. The API contract in §6 is byte-identical to the notebook-embedded server.

### 3.1 `src/api/main.py` — Application Entry
| Aspect | Detail |
|--------|--------|
| App | `FastAPI(title="NIDS — Network Intrusion Detection API", description=…, version="2.0.0")` |
| Lifespan | `Base.metadata.create_all` → model-load check against the real `_model_loaded` flag (missing/corrupt artifacts log a warning/error; predict degrades to 503) → attach `ws_manager` → auto-start sniffer if `NIDS_CAPTURE ∈ {1,true,yes}` (case-insensitive) → stop sniffer on shutdown |
| CORS | allow_origins: `http://localhost:3000`, `5173`, `8080`, `5174`; credentials True; all methods/headers |
| Security middleware | global body-size cap `NIDS_MAX_BODY_BYTES` (default 1 MB → 413); per-IP rate limit `RATE_LIMIT_PER_MINUTE` (env `NIDS_RATE_LIMIT`, default 120; invalid/empty values fall back with a warning; stale entries evicted to bound memory) → 429; optional API-key gate: if `NIDS_API_SECRET` set, all `/api/*` require `X-API-Key` (constant-time compare, 401 else). Rate limiting/counters are per-process (documented) |
| Routers | `predict.router`, `alerts.router`, `stats.router`, `chatbot.router` under `/api`; `GET /api/system` defined inline |
| WebSocket | `WS /ws/live`: **auth first** — when `NIDS_API_SECRET` is set the client must present `?token=<secret>` or an `X-API-Key` header before any data flows (accept → close **4401** on failure); client cap `NIDS_WS_MAX_CLIENTS` (default 20 → close **1013**); then queries last 50 alerts in the threadpool (`prediction.notin_(BENIGN_LABELS)`, ordered `timestamp DESC, id DESC`) newest-first → sends reversed batch as one JSON array → loop: ping every 10 s + drain of client-sent app messages |
| Sniffer API | `POST /api/sniffer/start` (optional JSON body `{"interface": "Wi-Fi"}` via `SnifferStartRequest`; interface validated against `get_if_list()`; guarded by an `RLock` so concurrent starts create exactly one instance), `POST /api/sniffer/stop` (never instantiates), `GET /api/sniffer/stats` (never instantiates) |
| Health | `GET /health` → `{status, db, model, sniffer, uptime_seconds, ws_clients}`; DB probe cached 10 s; returns `"ok"`/`"error"` only — raw exception text is logged server-side, never returned |
| Root | Index JSON with docs/health/ws/sniffer pointers |

### 3.2 `src/api/connectionmanager` (in main.py)
- `ConnectionManager`: tracks `active: List[WebSocket]` with a `max_clients` cap and `can_accept()`; `broadcast()` sends to all clients **concurrently** with a per-client `asyncio.wait_for` timeout (5 s) — a stalled client cannot block the others; timed-out/dead sockets are evicted immediately (bounded buffering).

### 3.3 `src/api/database.py`
- Engine from `DATABASE_URL`; the **default SQLite path is anchored to the backend project root** (`nids-backend/nids.db`), not the process working directory, so launching uvicorn from another folder cannot silently create a second empty DB. `connect_args={"check_same_thread": False}` for SQLite; `pool_pre_ping=True`.
- SQLite connections set `PRAGMA journal_mode=WAL` and `PRAGMA busy_timeout=5000` (concurrent API threads + sniffer submissions no longer fail with "database is locked").
- `SessionLocal` scoped factory; `Base = declarative_base()`; `get_db()` FastAPI dependency (yield/close).

### 3.4 `src/api/models.py` — `Alert`
| Column | Type | Notes |
|--------|------|-------|
| id | Integer PK | autoincrement, indexed |
| timestamp | DateTime | default `utcnow`, indexed |
| source_ip | String(45) | indexed |
| destination_ip | String(45) | |
| src_port / dst_port | Integer | nullable |
| prediction | String(50) | indexed |
| confidence | Float | |
| severity | String(20) | indexed |
| shap_json | Text | nullable; JSON string of top-5 |
| true_label | String(50) | nullable; unused by routes |
- `to_dict()` method present.

### 3.5 `src/api/schemas.py` (Pydantic v2)
- `SHAPItem(feature, value)`, `PredictResponse(alert_id, prediction, confidence, severity, source_ip, shap_top5[SHAPItem], timestamp, missing_features=0)`
- `AlertResponse(id, timestamp, source_ip, destination_ip, src_port, dst_port, prediction, confidence, severity, shap_json)`
- `StatsResponse(total_flows, total_attacks, benign_count, attacks_by_type, attacks_by_severity, uptime_seconds)`
- `HealthResponse(status, db, model)`
- `ChatRequest(message ≤2000, history: Optional[List[Dict[str,str]]] max_length=50 — structurally bounded before parsing)`, `ChatResponse(reply, tool_used, data_freshness_note)`
- `SnifferStartRequest(interface: Optional[str] ≤128)` — body model for `POST /api/sniffer/start`
- `PredictRequestDoc` exists as documentation schema (raw JSON parsed directly — CICIDS names contain chars like `/`).

### 3.6 Routes

**`routes/predict.py` — POST /api/predict**
- Reads flat JSON; **root must be a JSON object** (arrays/strings/numbers/null → 400); extracts `_source_ip`, `_destination_ip`, `_src_port`, `_dst_port` metadata; iterates `EXPECTED_FEATURES` (52 CICIDS names).
- Metadata IPs validated with Python's `ipaddress` (IPv4/IPv6; literal `"unknown"` allowed; oversized strings, control characters, and non-IP text → 422 — blocks DB bloat, log forging, WS amplification, and data-borne chatbot prompt injection). Strict feature validation (`_validate_features`): zero feature keys → 400; non-numeric / non-finite / negative / |value| > 1e15 → 422 naming the invalid features; 1–8 missing (`MAX_INVALID_FEATURES = 8`) → 0.0 (exposed as `missing_features` in the response and WS broadcast); >8 missing → 422 with count; ports clamped 0–65535 (`_coerce_port` is overflow-safe: `Infinity`/`NaN`/`1e400` never 500).
- Blocking ML + SHAP inference and the DB commit run in FastAPI's threadpool (`run_in_threadpool`) — the event loop stays responsive under attack load.
- Calls inference wrapper (`predict()` enforces 52-key parity + finiteness; `safe_load_artifacts()` degrades gracefully on corrupt artifacts); **persists Alert**; broadcasts via WS when `not is_benign(prediction)` (BENIGN_LABELS) + warning log. SHAP values sanitized (non-finite → 0.0) and serialized with `allow_nan=False` — persisted/broadcast JSON is always browser-safe.
- Timestamps serialized timezone-aware UTC (`…+00:00`) via `models.iso_utc`. Response: PredictResponse. Errors: 400 invalid JSON / non-object / empty payload, 422 malformed features or metadata, 500 with **generic** detail (raw exception logged server-side only), 503 model not loaded.

**`routes/alerts.py` — GET /api/alerts**
- Query params: `limit` (default 50, ge=1 le=500), `offset` (ge=0), `type` (substring; `%`/`_` wildcards escaped, length-bounded), `severity`, `exclude_benign` (default true).
- Order: `timestamp DESC, id DESC` (deterministic pagination on timestamp ties). If exclude_benign: filter `prediction.notin_(BENIGN_LABELS)`.

**`routes/stats.py`**
- `GET /api/stats`: counts from alerts table; `total_attacks` = `prediction.notin_(BENIGN_LABELS)`; uptime from module `_start_time`.
- `GET /api/ip-leaderboard`: `limit` (default 10, **ge=1 le=100** — negative/zero/huge values → 422), group by source_ip, count, max(timestamp), order `count DESC, last_seen DESC`.

**`routes/chatbot.py` — POST /api/chat**
- LangChain `create_tool_calling_agent` + `AgentExecutor`; LLM: **Gemini** (`GEMINI_MODEL` default `gemini-2.5-flash`, `temperature=0.5`, `max_output_tokens=1024`, native system-message support).
- 5 curated DB tools: stats summary, recent alerts (filters, hours window), top attacker IPs, attack-type breakdown, severity breakdown. All LLM-supplied tool arguments are type-coerced and clamped (`_safe_limit`/`_safe_text`/`_safe_bool`); the type filter escapes LIKE wildcards.
- Graceful degradation: ImportError → `_LANGCHAIN_AVAILABLE=False` → agents disabled (503); missing `GOOGLE_API_KEY` → 503 "env var is not set".
- Hardening: `ChatRequest.message` max 2000 chars (schema + route); 60 s LLM timeout (`asyncio.wait_for` → **504**; other failures → generic 502); history structurally bounded (schema: max 50 `Dict[str,str]` entries) and only client `role=="user"` turns trusted (`_filter_history_entries` — assistant-supplied context is ignored so clients cannot pre-seed fake model context); hardened system prompt (declines out-of-scope requests, never reveals hidden instructions, never fabricates stats, **treats tool output as untrusted data — never follows instructions found inside IP/label/timestamp values**). `.env` loaded from the backend root (CWD-independent). Timestamps timezone-aware UTC. Returns `{reply, tool_used[], data_freshness_note}`.

### 3.7 `src/capture/sniffer.py`
| Constant | Value |
|----------|-------|
| FLOW_TIMEOUT_SECONDS | 30 |
| MAX_PACKETS_PER_FLOW | 500 |
| ACTIVE_FLOW_LOG_INTERVAL | 15 |
| API_PREDICT_URL | env `NIDS_PREDICT_URL` (default `http://localhost:8000/api/predict`) |
| API_MAX_RETRIES | 3 |
| API_RETRY_BACKOFF_S | 2.0 (retry windows 2 s → 4 s) |
| Min packets per submitted flow | 3 |

- `Flow` dataclass (key, packets, packet_dicts, start/last_seen, is_closed).
- Two daemon threads: `PacketCapture` (Scapy `sniff(prn=_process_packet, store=False, stop_filter=…)`) and `FlowTimeout` (every 5 s expire).
- Windows interface detection skips only obvious loopback/virtual adapters (Npcap text is NOT treated as a skip signal — real adapter descriptions may contain it); candidates are logged; manual `--interface` override remains the reliable path. Windows Npcap/WinPcap missing → Layer-3 fallback via `conf.L3socket()`.
- `_packet_to_dict` extracts 12 fields incl. `tcp_flags`, `window_size`, `header_len`, `payload_len`, `ttl`.
- Flow finalize: remove → ≥3 packets → extract 52 features → attach `_source_ip/_destination_ip/_src_port/_dst_port` → spawn daemon thread `_call_api` (`requests.post`, timeout 10; up to `API_MAX_RETRIES` attempts with 2 s/4 s backoff on transport errors; 400/401/422/503 treated as permanent → warn + drop; `total_retries`/`total_dropped` counters exposed via `get_stats()`).
- ALERT log line `🚨 ALERT [sev] src → dst pred (conf%)` when `not is_benign(pred)`.
- Standalone CLI: `--interface/-i`, `--api-url`, `--timeout`.

### 3.8 `src/features/extractor.py`
- `CICIDS_FEATURES` = exact 52 names (Destination Port … Idle Min).
- `FlowExtractor.extract_from_dicts(packets, flow_key)`:
  - direction split by `flow_key[0]` (src) vs others (dst); fallback first packet's src.
  - durations in seconds→µs (`*1e6`) to match CICIDS scale.
  - IATs computed on sorted timestamps; Active/Idle via `ACTIVE_TIMEOUT = 5.0 s` gap classification (µs values).
  - Flag counts on `tcp_flags` substring membership; window sizes for Init_Win; `act_data_pkt_fwd` = payload_len>0 count; `min_seg_size_forward` from fwd header lengths.
  - `duration_safe = 1e-6` guard vs zero duration; NaN/Inf final pass → 0.0.
  - Empty packets → all-zero dict.

### 3.9 `src/model/predict.py` — Inference Wrapper
- Paths: `model.pkl`, `scaler.pkl`, `label_encoder.pkl` at backend root.
- Lazy global cache: `_model`, `_scaler`, `_encoder`, `_explainer` (TreeExplainer created once; warning if SHAP unavailable); `_model_loaded` flag.
- **`safe_load_artifacts()`** wraps loading and never raises: missing artifacts log a warning; corrupt/truncated/incompatible ones log an error — the module degrades to the not-loaded state (predict → RuntimeError → route 503) instead of crashing the importing app. Called at import time.
- `predict(features, feature_names)`:
  1. `np.array(list(features.values()), dtype=float64).reshape(1,-1)`
  2. `_scaler.transform` → `_model.predict` → index
  3. `predict_proba` → confidence of predicted class
  4. `_encoder.inverse_transform` → class label
  5. `get_severity(label)` → NONE/CRITICAL/HIGH/MEDIUM/LOW
  6. SHAP: flatten values (handles list & 2D/3D), sort by |v| desc, top-5 `{feature, value}` (negative/positive polarity preserved; **non-finite values coerced to 0.0** so downstream JSON is browser-safe).
- `get_severity`: lowercase substring over `SEVERITY_MAP`; fallback "LOW".
- Parity guards: `predict()` raises `ValueError` on non-52-key input or non-finite values; `_load_artifacts()` asserts model/scaler `n_features_in_ == len(CICIDS_FEATURES)` (52); `_write_manifest()` writes/refreshes `manifest.json` (model type, feature count, class labels, severity-map key count, checks_ok).

### 3.10 `src/model/train.py` — Production Training Pipeline
| Stage | Detail |
|-------|--------|
| Loading | `load_data(raw_dir, n_samples=400_000)`: 2-pass chunked scan (`chunksize=500k/100k`), stratified per-class sampling fraction when total > target; `LABEL_COL = "Attack Type"` with `label/attack` substring fallback |
| Clean | inf→NaN, dropna, drop_duplicates |
| Eng features | 7 engineered ratios (`flow_bytes_per_packet`, `fwd_bwd_packet_ratio`, `fwd_bwd_bytes_ratio`, `packet_size_variance_ratio`, `active_idle_ratio`, `header_to_payload_ratio`, `iat_jitter`) — `ENG_FEATURES`; **comparison-only** (SN)
| Split | stratified 80/20, `random_state=42`; `X_test.npy`/`y_test.npy` persisted |
| Encode | `LabelEncoder` → `label_encoder.pkl` |
| SMOTE | `USE_SMOTE=False`; imbalance handled via `class_weight="balanced"` |
| Scalers | StandardScaler + RobustScaler both fit on balanced train; persisted as `scaler.pkl` & `robust_scaler.pkl` |
| PCA | experimental XGB baseline vs 90/95/99% variance; logged, not deployed |
| Models | 9: LR(fixed) · DT(GridSearchCV) · RF(RandomizedSearchCV) · XGB(RandomizedSearchCV) · LGBM(fixed; graceful fallback) · SVM-RBF(15k slice) · MLP(256-128-64, Adam, early-stop) · Voting(soft, RF+XGB+LGBM/MLP) · Stacking(RF+XGB+LGBM/MLP → LR, cv=3) |
| Scaler cmp | DT/RF/XGB/LGBM/MLP trained on both scalers; standard-vs-robust F1 recorded; best-DT/RF/XGB instance kept |
| CV | 5-fold StratifiedKFold on top-2 models, full standard-scaled train |
| Selection | sort by Macro F1 desc → best → `model.pkl` |

### 3.11 `src/model/evaluate.py`
- `compute_metrics` → accuracy, macro/weighted F1, macro precision/recall, per-class F1.
- `false_positive_rate(y_true, y_pred, benign_label=0)` ⚠️ assumes benign class index 0 — actual encoder class 0 is `Bots` (documented caveat).
- Plots: confusion matrix & top-20 feature importance (matplotlib Agg) to `data/processed/`.
- Standalone re-eval loads test arrays from `data/processed/`.

---

## 4. DB / Storage
| Store | Detail |
|-------|--------|
| `nids.db` (SQLite) | Alert persistence; created at startup via `create_all` (path anchored to the backend root); WAL journal + 5 s busy timeout; 2,001 rows at latest inspection (Normal Traffic 1,803 · Port Scanning 76 · Brute Force 63 · DDoS 20 · Web Attacks 19 · Bots 18 · DoS 2) |
| `data/processed/X_test.npy, y_test.npy` | Evaluation fixtures (33 MB / 320 KB) |
| Artifacts | `model.pkl` (LGBM 52 ftrs), `scaler.pkl` (Standard), `robust_scaler.pkl` (Robust), `label_encoder.pkl` (7 classes) |

---

## 5. Frontend Architecture

### 5.1 Structure
```
src/
 ├ main.tsx            # createRoot + App + index.css
 ├ App.tsx             # QueryClientProvider + TooltipProvider + BrowserRouter; routes / /alerts /reports /network /explain /settings + * → NotFound; Toaster
 ├ PageShell.tsx       # shared shell: Sidebar + StatusBar + footer + Chatbot
 ├ index.css           # theme vars, fonts (Space Grotesk/Inter/JetBrains Mono), grid bg, light-mode
 ├ api/client.ts       # axios instance (baseURL http://localhost:8000, timeout 10_000/30_000 chat); optional X-API-Key header from VITE_NIDS_API_KEY; getSystemStatus/getSnifferStats
 ├ hooks/
 │   ├ useWebSocket.ts # WS /ws/live with ?token= auth (stops reconnecting on 4401), bubble reconnect, normalize alert payloads
 │   ├ use-mobile.tsx  # 768px matchMedia
 │   └ use-toast.ts    # shadcn toast
 ├ test/               # vitest setup (matchMedia polyfill) + test helpers
 ├ components/         # see §5.2 (+ ui/, __tests__ suites)
 ├ pages/              # Index (dashboard), Alerts, Reports, NetworkActivity, Explainability, Settings (+ __tests__)
 └ components/__tests__ # AlertFeed, AttackTimeline, Chatbot, Sidebar, StatusBar suites
```

### 5.2 Components & Data Contracts
| Component | Data source | Poll/freshness | Notable behavior |
|-----------|-------------|----------------|------------------|
| Sidebar | — | static | router-based 6 routes (Dashboard, Alerts, Reports, Network Activity, AI Explainability, Settings); real "Export Alerts CSV" (latest 500 attack alerts); mobile drawer nav; API Docs link |
| StatusBar | `GET /health` | every 10 s (+1 s clock) | real component states: backend/model/DB/sniffer/WS; local-time clock (no misleading UTC label) |
| KPICards | `GET /api/stats` | (implicit poll) | 4 cards; color-coded icons (Activity cyan/AlertTriangle red/Clock blue/Shield purple) |
| TrafficChart | `GET /api/stats` diff + alertHistory | 5 s | AreaChart, last 60 points, flows vs alerts buckets |
| AttackPieChart | `GET /api/stats` attacks_by_type | (poll) | custom elbows + tooltip |
| AlertFeed | WebSocket history / `GET /api/alerts` | push / on filter | live (WS) or archive (server-paginated, type/severity/search filters); CSV export of current view; SHAP drill-down; flash for new IDs |
| AttackTimeline | `GET /api/alerts` | 30 s | 12 hourly buckets of REAL alert counts (`bucketByHour`); honest empty/error states — no synthetic rows |
| IPLeaderboard | `GET /api/ip-leaderboard` | 30 s | real `top_attack_type` badges; link to Network Activity page |
| SHAPExplainer | alert.shap_top5 | on alert | BarChart; panel; color by direction/sign |
| Network Activity | `GET /api/alerts` | on load | real src→dst flow aggregation (count, volume bar, attack types, max severity) |
| Settings | `GET /api/system` | 15 s | backend health, deployed model manifest, sniffer counters (incl. retries/dropped), security flags, refresh button |
| Chatbot | `POST /api/chat` | on send | FAB; markdown rendered with HTML fully escaped (no raw `dangerouslySetInnerHTML`); 2000-char input cap |

### 5.3 WebSocket payload normalization (`useWebSocket.ts`)
- Maps `src_ip|source_ip`, `attack_type|prediction`, `shap_top5[{feature,value|impact}]` → canonical `{id,timestamp,src_ip,attack_type,severity,confidence,shap_top5}`.
- When `VITE_NIDS_API_KEY` is configured it is appended as `?token=` (browsers cannot set WS headers); a close code **4401** stops the reconnect loop (retrying cannot succeed without a valid key); other closes reconnect with 3 s backoff; `alertHistory` accumulates with cap (50 shown in feed).
- Backend timestamps arrive timezone-aware UTC (`…+00:00`) and parse correctly in every browser locale.

### 5.4 Styling System
- Tailwind config: `darkMode: ["class"]`, content paths; CSS vars → colors: `--surface #0a0e19`, `--primary #a1faff`, `--secondary #699cff`, `--tertiary #ac8aff`, `--error #ff716c`, `--on-surface #e8eafb`; severity palette mapped per class.
- index.css: Google-font @import; grid background via layered linear-gradients; `.light-mode` overrides.

---

## 6. API Contract Reference

| Method | Path | Request | Response |
|--------|------|---------|----------|
| POST | `/api/predict` | flat JSON **object**: 52 CICIDS keys (+optional `_source_ip`/`_destination_ip` as validated IPv4/IPv6, `_src_port`, `_dst_port`) | `{alert_id, prediction, confidence, severity, source_ip, shap_top5[], timestamp, missing_features}`; 400 (non-object root / no features) / 422 (malformed features, invalid metadata IP, >8 missing) / 500 (generic detail) / 503 (model not loaded) |
| GET | `/api/alerts?limit&offset&type&severity&exclude_benign` | `limit` 1–500, `offset` ≥0, `type` substring (wildcards escaped) | `AlertResponse[]` ordered `timestamp DESC, id DESC` |
| GET | `/api/stats` | — | StatsResponse |
| GET | `/api/ip-leaderboard?limit` | `limit` 1–100 (default 10) | rank/source_ip/attack_count/last_seen[] |
| POST | `/api/chat` | `{message ≤2000, history[] ≤50 string entries}` | `{reply, tool_used[], data_freshness_note}`; 400 empty, 422 oversize/bad history, 502 model error, 503 w/o key, 504 timeout |
| GET | `/health` | — | status/db/model/sniffer/uptime/ws_clients (db is `"ok"`/`"error"`) |
| POST | `/api/sniffer/start` | optional `{"interface": "Wi-Fi"}` (validated; `"auto"`/absent = auto-detect) | status + stats; `already_running` if active; structured `error` for unknown interface |
| POST | `/api/sniffer/stop` | — | stopped + stats; `not_running` otherwise (never instantiates) |
| GET | `/api/sniffer/stats` | — | interface, counters (packets/flows/API calls/retries/dropped), running |
| GET | `/api/system` | — | health + model manifest (type/features/classes/generator) + sniffer stats + rate limit + API-key flag + NIDS_CAPTURE flag |
| WS | `/ws/live` | `?token=<secret>` (or `X-API-Key` header) when `NIDS_API_SECRET` is set | initial batch array; then objects; 10 s pings; close **4401** unauthorized, **1013** over cap |

All timestamps are timezone-aware UTC ISO-8601 (`…+00:00`). Interactive docs at `http://localhost:8000/docs` (OpenAPI).

---

## 7. Configuration & Environment
| Variable | Default | Used by |
|----------|---------|---------|
| `DATABASE_URL` | SQLite at `nids-backend/nids.db` (repo-root-anchored) | database.py |
| `GOOGLE_API_KEY` | — (required for chat) | chatbot.py (via backend-root `.env`) |
| `GEMINI_MODEL` | `gemini-2.5-flash` | chatbot.py |
| `NIDS_CAPTURE` | unset | main.py lifespan auto-start sniffer (`1`/`true`/`yes`, case-insensitive) |
| `NIDS_API_SECRET` | unset (no auth) | main.py middleware: `/api/*` HTTP require `X-API-Key`; `/ws/live` requires `?token=`/header |
| `NIDS_RATE_LIMIT` | `120` | main.py per-IP rate limit (requests/min); invalid values fall back with a warning; per-process |
| `NIDS_MAX_BODY_BYTES` | `1000000` | main.py global request-body cap (413) |
| `NIDS_WS_MAX_CLIENTS` | `20` | main.py WebSocket client cap (1013 beyond) |
| `NIDS_PREDICT_URL` | `http://localhost:8000/api/predict` | sniffer.py prediction target |
| `VITE_NIDS_API_KEY` | empty | frontend: mirrors `NIDS_API_SECRET` for REST header + WS `?token=` |

---

## 8. Known Technical Caveats (see NIDS_PRD §8 for full list)
1. ✅ **NIDS-ISSUE-06 (FIXED in Colab edition)** — notebook 02 computes the benign index from the encoder (`le.classes_.index("Normal Traffic")`) before FPR; the local `evaluate.py` assumption (class 0 = benign) is gone with the removed local code.
2. ✅ **NIDS-ISSUE-05 (FIXED in Colab edition)** — Colab notebooks 01/02 detect `Attack Type` directly (with `attack`/`label` fallback); no more `Label column: None`.
3. ⚠️ **SEC-02** — the Gemini key that leaked into a historical audit document is treated as compromised: the literal has been redacted, but **rotation in Google Cloud Console remains a manual user action** (NIDS-NFR-08, PH9-10).
4. ⚠️ PostgreSQL path configured in the original `database.py` but only SQLite exercised (and now Colab uses SQLite only).
5. ⚠️ Live packet capture and packet simulators are 🟠 LOCAL-ONLY — Colab replaces them with synthetic flows + CSV replay (notebook 03).
6. ⚠️ The embedded API is demo-grade: no TLS, optional API key, per-IP rate limit 120/min, WS client cap 20 — same hardening semantics as the original, minus the sniffer endpoints.
7. ✅ Resolved (synced): NIDS-ISSUE-01 (BENIGN_LABELS alignment), NIDS-ISSUE-02 (NONE-severity broadcast), NIDS-ISSUE-03 (hardcoded export), NIDS-ISSUE-04 (timeline synthetic noise), chat HTML sanitization, SHAP NaN JSON, naive timestamps.

---

## 9. Ports & URLs (Colab edition)
| Service | URL |
|---------|-----|
| Embedded API (in-VM) | `http://127.0.0.1:8000` (docs `/docs`) |
| Public API (Cloudflare tunnel) | `https://<random>.trycloudflare.com` (printed by notebook 03) |
| WebSocket | `<tunnel-url>/ws/live` (or `wss://…`) |
| Gradio dashboard | `https://<hash>.gradio.live` (printed by notebook 04) |
| Artifacts | `/content/nids_artifacts/` + `MyDrive/nids_artifacts/` |
| Database | `/content/nids_colab.db` (SQLite, WAL) |