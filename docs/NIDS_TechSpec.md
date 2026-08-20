# NIDS_TechSpec — Technical Specification

**Project:** The Sentinel — Network Intrusion Detection System (NIDS)
**Document:** NIDS_TechSpec.md
**Status:** ✅ Complete (derived from repository code & artifacts)
**Legend:** ✅ IMPLEMENTED · 🟡 PARTIAL · 🔵 NOTEBOOK-ONLY · 🔴 NOT IMPLEMENTED · ⚪ FUTURE

---

## 1. System Overview

Two-process architecture with an optional third capture component:

- **Backend** — FastAPI (port 8000): REST + WebSocket, ML inference wrapper, SHAP, SQLAlchemy persistence, sniffer lifecycle control, LangChain/Gemini chatbot.
- **Frontend** — React 18 + TypeScript + Vite (dev port 5173): command-center dashboard + floating chatbot.
- **Capture** — Scapy `NetworkSniffer` (embedded in backend process OR standalone `python src/capture/sniffer.py`).

```
┌──────────────────────────────┐
│        LIVE NETWORK          │  raw packets
└──────────────┬───────────────┘
               ▼
┌──────────────────────────────┐
│  NetworkSniffer (Scapy)      │  flows (5-tuple key)
│  → closes on FIN/RST/30s/500 │
└──────────────┬───────────────┘
               ▼ flow packet dicts
┌──────────────────────────────┐
│  FlowExtractor               │  52 CICIDS2017 features
└──────────────┬───────────────┘
               ▼ feature dict (52 keys + _source_ip …)
┌──────────────────────────────┐
│  FastAPI Backend (8000)      │
│  ├ POST /api/predict         │ → StandardScaler → LGBM → SHAP → Alert
│  ├ /api/alerts /stats/…      │ → SQLite / PostgreSQL
│  └ WS /ws/live               │ → JSON alerts → dashboard
└──────────────┬───────────────┘
               ▼ REST / WebSocket
┌──────────────────────────────┐
│  React Dashboard (5173)      │
└──────────────────────────────┘
```

---

## 2. Technology Stack

### 2.1 Backend (nids-backend)
| Technology | Version (requirements.txt) | Role |
|------------|---------------------------|------|
| Python | 3.10+ (README) | Language |
| FastAPI | 0.110.2 | REST + WebSocket framework |
| Uvicorn | 0.29.0 (standard extras) | ASGI server |
| SQLAlchemy | 2.0.29 | ORM + sessions |
| pydantic / pydantic-settings | 2.7.0 / 2.2.1 | Schemas / config |
| psycopg2-binary | 2.9.9 | Optional PostgreSQL driver |
| scikit-learn | 1.4.2 | Models, scalers, encoders, CV |
| xgboost | 2.0.3 | XGBoost classifier |
| lightgbm | present (standard dep per README changelog) | **Deployed model family** |
| imbalanced-learn | 0.12.2 | SMOTE (used in notebooks; disabled in pipeline) |
| shap | 0.45.0 | TreeExplainer; per-alert top-5 |
| joblib | 1.4.0 | Artifact (de)serialization |
| scapy | 2.5.0 | Packet capture |
| requests | (present) | Sniffer → API HTTP client |
| pandas / numpy | 2.2.2 / 1.26.4 | Data pipeline |
| matplotlib / seaborn | (present) | Evaluation plots & notebook graphics |
| optuna / mlflow / redis | 3.6.1 / 2.12.1 / 5.0.3 | Listed in requirements; **not imported in src/** — 🔴 unused in code |
| langchain, langchain-community, langchain-core, langchain-google-genai | (present) | Chatbot agent framework + Gemini |
| python-dotenv | 1.0.1 | `.env` loading |
| pytest / httpx | 8.1.1 / 0.27.0 | Tests / TestClient |

### 2.2 Frontend (nids-frontend)
| Technology | Version | Role |
|------------|---------|------|
| React / React DOM | 18.3.1 | UI |
| TypeScript | 5.8.3 | Typed JS |
| Vite | 7.3.2 | Dev server / build |
| Tailwind CSS | 3.4.17 + tailwindcss-animate, @tailwindcss/typography | Styling |
| shadcn/ui primitives | @radix-ui/* (25+ packages) + components in `src/components/ui/` | Accessible components |
| Recharts | 2.15.4 | Charts (Area, Pie, Bar) |
| TanStack Query | 5.83.0 | Server state |
| Axios | 1.15.0 | HTTP client |
| lodash | 4.18.1 | Utility helpers |
| React Router DOM | 6.30.1 | Routing (`/`, `*`) |
| lucide-react | 0.462.0 | Icons |
| sonner | 1.7.4 | Toasts |
| date-fns | 3.6.0 | Time formatting |
| class-variance-authority + clsx + tailwind-merge | 0.7.1 / 2.1.1 / 2.6.0 | `cn()` helper |
| vitest + @testing-library/react + jsdom | 3.2.4 / 16.0.0 / 29.0.1 | Test tooling — 17 specs across 6 suites (`src/components/__tests__`, `src/pages/__tests__`) |
| @playwright/test | 1.57.0 | E2E tooling (devDependency; no specs found) |

---

## 3. Backend Components

### 3.1 `src/api/main.py` — Application Entry
| Aspect | Detail |
|--------|--------|
| App | `FastAPI(title="NIDS — Network Intrusion Detection API", description=…, version="2.0.0")` |
| Lifespan | `Base.metadata.create_all` → log model load → attach `ws_manager` → auto-start sniffer if `NIDS_CAPTURE ∈ {1,true,yes}` → stop sniffer on shutdown |
| CORS | allow_origins: `http://localhost:3000`, `5173`, `8080`, `5174`; credentials True; all methods/headers |
| Security middleware | optional API-key gate: if `NIDS_API_SECRET` set, all `/api/*` require `X-API-Key` (401/403 else); per-IP rate limit `RATE_LIMIT_PER_MINUTE` (env `NIDS_RATE_LIMIT`, default 120) → 429 |
| Routers | `predict.router`, `alerts.router`, `stats.router`, `chatbot.router` under `/api`; `GET /api/system` defined inline |
| WebSocket | `WS /ws/live`: accepts → queries last 50 alerts (`prediction.notin_(BENIGN_LABELS)`) newest-first → sends reversed batch as one JSON array → loop: ping every 10 s |
| Sniffer API | `POST /api/sniffer/start` (optional `interface`), `POST /api/sniffer/stop`, `GET /api/sniffer/stats` |
| Health | `GET /health` → `{status, db, model, sniffer, uptime_seconds, ws_clients}` |
| Root | Index JSON with docs/health/ws/sniffer pointers |

### 3.2 `src/api/connectionmanager` (in main.py)
- `ConnectionManager`: tracks `active: List[WebSocket]`; `broadcast()` JSON-serializes and sends; evicts dead sockets on failure.

### 3.3 `src/api/database.py`
- Engine from `DATABASE_URL` (default `sqlite:///./nids.db`); `connect_args={"check_same_thread": False}` for SQLite; `pool_pre_ping=True`.
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
- `SHAPItem(feature, value)`, `PredictResponse(alert_id, prediction, confidence, severity, source_ip, shap_top5[SHAPItem], timestamp)`
- `AlertResponse(id, timestamp, source_ip, destination_ip, src_port, dst_port, prediction, confidence, severity, shap_json)`
- `StatsResponse(total_flows, total_attacks, benign_count, attacks_by_type, attacks_by_severity, uptime_seconds)`
- `HealthResponse(status, db, model)`
- `ChatRequest(message, history)`, `ChatResponse(reply, tool_used, data_freshness_note)`
- `PredictRequestDoc` exists as documentation schema (raw JSON parsed directly — CICIDS names contain chars like `/`).

### 3.6 Routes

**`routes/predict.py` — POST /api/predict**
- Reads flat JSON; extracts `_source_ip`, `_destination_ip`, `_src_port`, `_dst_port` metadata; iterates `EXPECTED_FEATURES` (52 CICIDS names).
- Strict validation (`_validate_features`): zero feature keys → 400; non-numeric / non-finite / negative / |value| > 1e15 → 422 naming the invalid features; 1–8 missing (`MAX_INVALID_FEATURES = 8`) → 0.0; >8 missing → 422 with count; ports clamped 0–65535 (`_coerce_port`).
- Calls inference wrapper (`predict()` enforces 52-key parity + finiteness; `_load_artifacts()` asserts model/scaler `n_features_in_ == 52`); **persists Alert**; broadcasts via WS when `not is_benign(prediction)` (BENIGN_LABELS) + warning log.
- Refreshes `manifest.json` via `_write_manifest()` on successful calls. Response: PredictResponse. Errors: 400 invalid JSON/empty payload, 422 malformed features, 500 inference failure, 503 model not loaded.

**`routes/alerts.py` — GET /api/alerts**
- Query params: `limit` (default 50, ge=1 le=500), `offset` (ge=0), `type`, `severity`, `exclude_benign` (default true).
- Order: newest first. If exclude_benign: filter `prediction.notin_(BENIGN_LABELS)`.

**`routes/stats.py`**
- `GET /api/stats`: counts from alerts table; `total_attacks` = `prediction.notin_(BENIGN_LABELS)`; uptime from module `_start_time`.
- `GET /api/ip-leaderboard`: `limit` (default 10), group by source_ip, count, max(timestamp), order desc.

**`routes/chatbot.py` — POST /api/chat**
- LangChain `create_tool_calling_agent` + `AgentExecutor`; GPT: **Gemini** (`GEMINI_MODEL` default `gemini-2.5-flash`, `temperature=0.5`, `max_output_tokens=1024`).
- 5 curated DB tools: stats summary, recent alerts (filters, hours window), top attacker IPs, attack-type breakdown, severity breakdown.
- Graceful degradation: ImportError → `_LANGCHAIN_AVAILABLE=False` → agents disabled (503); missing `GOOGLE_API_KEY` → 503 "env var is not set".
- Hardening: `ChatRequest.message` max 2000 chars (schema + route); 60 s LLM timeout (`asyncio.wait_for`); history bounded (last 20 messages / 2000 chars each); hardened system prompt (declines out-of-scope requests, never reveals hidden instructions, never fabricates stats). Returns `{reply, tool_used[], data_freshness_note}`.

### 3.7 `src/capture/sniffer.py`
| Constant | Value |
|----------|-------|
| FLOW_TIMEOUT_SECONDS | 30 |
| MAX_PACKETS_PER_FLOW | 500 |
| ACTIVE_FLOW_LOG_INTERVAL | 15 |
| API_PREDICT_URL | `http://localhost:8000/api/predict` |
| API_MAX_RETRIES | 3 |
| API_RETRY_BACKOFF_S | 2.0 (retry windows 2 s → 4 s) |
| Min packets per submitted flow | 3 |

- `Flow` dataclass (key, packets, packet_dicts, start/last_seen, is_closed).
- Two daemon threads: `PacketCapture` (Scapy `sniff(prn=_process_packet, store=False, stop_filter=…)`) and `FlowTimeout` (every 5 s expire).
- Windows Npcap/WinPcap missing → Layer-3 fallback via `conf.L3socket()`.
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
- `predict(features, feature_names)`:
  1. `np.array(list(features.values()), dtype=float64).reshape(1,-1)`
  2. `_scaler.transform` → `_model.predict` → index
  3. `predict_proba` → confidence of predicted class
  4. `_encoder.inverse_transform` → class label
  5. `get_severity(label)` → NONE/CRITICAL/HIGH/MEDIUM/LOW
  6. SHAP: flatten values (handles list & 2D/3D), sort by |v| desc, top-5 `{feature, value}` (negative/positive polarity preserved).
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
| `nids.db` (SQLite) | Alert persistence; created at startup via `create_all`; 1,999 rows at latest inspection (Normal Traffic 1,801 · Port Scanning 76 · Brute Force 63 · DDoS 20 · Web Attacks 19 · Bots 18 · DoS 2) |
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
 ├ api/client.ts       # axios instance (baseURL http://localhost:8000, timeout 10_000/30_000 chat); getSystemStatus/getSnifferStats
 ├ hooks/
 │   ├ useWebSocket.ts # WS /ws/live, bubble reconnect, normalize alert payloads
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
- Reconnect with exponential/3 s backoff; `alertHistory` accumulates with cap (50 shown in feed).

### 5.4 Styling System
- Tailwind config: `darkMode: ["class"]`, content paths; CSS vars → colors: `--surface #0a0e19`, `--primary #a1faff`, `--secondary #699cff`, `--tertiary #ac8aff`, `--error #ff716c`, `--on-surface #e8eafb`; severity palette mapped per class.
- index.css: Google-font @import; grid background via layered linear-gradients; `.light-mode` overrides.

---

## 6. API Contract Reference

| Method | Path | Request | Response |
|--------|------|---------|----------|
| POST | `/api/predict` | flat JSON: 52 CICIDS keys (+optional `_source_ip`, `_destination_ip`, `_src_port`, `_dst_port`) | `{alert_id, prediction, confidence, severity, source_ip, shap_top5[], timestamp}`; 400 (no features) / 422 (malformed: non-numeric, non-finite, negative, >1e15, or >8 missing) |
| GET | `/api/alerts?limit&offset&type&severity&exclude_benign` | — | `AlertResponse[]` |
| GET | `/api/stats` | — | StatsResponse |
| GET | `/api/ip-leaderboard?limit` | — | rank/source_ip/attack_count/last_seen[] |
| POST | `/api/chat` | `{message, history[]}` | `{reply, tool_used[], data_freshness_note}` (503 w/o key) |
| GET | `/health` | — | status/db/model/sniffer/uptime/ws_clients |
| POST | `/api/sniffer/start` | `{interface?}` | status + stats; `already_running` if active |
| POST | `/api/sniffer/stop` | — | stopped + stats |
| GET | `/api/sniffer/stats` | — | interface, counters (packets/flows/API calls/retries/dropped), running |
| GET | `/api/system` | — | health + model manifest (type/features/classes/generator) + sniffer stats + rate limit + API-key flag + NIDS_CAPTURE flag |
| WS | `/ws/live` | — | initial batch array; then objects; 10 s pings |

Interactive docs at `http://localhost:8000/docs` (OpenAPI).

---

## 7. Configuration & Environment
| Variable | Default | Used by |
|----------|---------|---------|
| `DATABASE_URL` | `sqlite:///./nids.db` | database.py |
| `GOOGLE_API_KEY` | — (required for chat) | chatbot.py (via `.env`) |
| `GEMINI_MODEL` | `gemini-2.5-flash` | chatbot.py |
| `NIDS_CAPTURE` | unset | main.py lifespan auto-start sniffer |
| `NIDS_API_SECRET` | unset (no auth) | main.py middleware: `/api/*` require `X-API-Key` |
| `NIDS_RATE_LIMIT` | `120` | main.py per-IP rate limit (requests/min) |

---

## 8. Known Technical Caveats (see NIDS_PRD §8 for full list)
1. ⚠️ **NIDS-ISSUE-06** — `evaluate.py` FPR assumes benign class index 0; encoder index 0 is `Bots` (offline evaluation only; not in prod path).
2. ⚠️ **NIDS-ISSUE-05** — notebook label-column detection prints `None` (code searches for "label", CSV column is "Attack Type"; production `train.py` is correct).
3. ⚠️ **SEC-02** — `.env` contains a real Google API key on this working machine — treat as compromised & rotate (NIDS-NFR-08).
4. ⚠️ PostgreSQL path configured (`DATABASE_URL`) but only SQLite exercised in repo evidence.
5. ⚠️ Playwright installed as devDependency; no E2E specs yet (frontend coverage is via vitest).
6. ✅ Resolved (synced): NIDS-ISSUE-01 (BENIGN_LABELS alignment), NIDS-ISSUE-02 (NONE-severity broadcast), NIDS-ISSUE-03 (hardcoded export), NIDS-ISSUE-04 (timeline synthetic noise), chat HTML sanitization.

---

## 9. Ports & URLs
| Service | URL |
|---------|-----|
| Backend | `http://localhost:8000` (docs `/docs`) |
| Frontend dev | `http://localhost:5173` |
| WebSocket | `ws://localhost:8000/ws/live` |
| Inference target (sniffer) | `http://localhost:8000/api/predict` |