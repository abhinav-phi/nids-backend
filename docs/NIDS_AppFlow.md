# NIDS_AppFlow — Application Flow

**Project:** The Sentinel — Network Intrusion Detection System (NIDS)
**Document:** NIDS_AppFlow.md
**Status:** ✅ Complete — **Colab Edition** (2026-08-28): flows now run inside 4 Colab notebooks on the T4 VM. Raw-packet flows (capture/simulators) are replaced by in-memory synthetic flows + CSV replay (Colab has no raw-socket access).
**Legend:** ✅ IMPLEMENTED · 🟡 PARTIAL · 🔵 NOTEBOOK-ONLY (Colab) · 🟠 LOCAL-ONLY (removed) · 🔴 NOT IMPLEMENTED · ⚪ FUTURE

---

## 1. Flow Map (Colab Edition)

```
 Notebook 01 ──► Notebook 02 ──► Notebook 03 ──► Notebook 04
 EDA               Training          Inference+API      Dashboard
 ─────────         ─────────         ────────────      ──────────
 CSV (Drive)  ──►  stratify/clean ─► artifacts ──────►  Gradio UI
 class dist.       encode/split      FlowExtractor       KPI + feed
 correlations      scalers          synthetic flows     leaderboard
 data quality      model arena      FastAPI + WS        SHAP explain
 key numbers       Optuna           replay + tunnel     traffic lab
                   ROC/AUC          SHAP deep dive      PNG export
                   artifacts ─────────────────────────► Drive sync
```

---

## 2. Flow 1 — Startup (Colab notebook)

**Input:** open notebook 03 on Colab; run cells.
**Steps:**
1. Artifact discovery cell (`frag_discovery.py`): finds `/content/nids_artifacts/` or `MyDrive/nids_artifacts/` (produced by notebook 02).
2. Inference stack cell (`frag_inference.py`): loads `model.pkl`, `scaler.pkl`, `label_encoder.pkl`; caches SHAP TreeExplainer; defines `predict_flow()`, `get_severity()`, `is_benign()`.
3. FastAPI app cell (`frag_api.py`): creates SQLite engine, Alert model, validation helpers, and the FastAPI app with all routes.
4. Server cell (`frag_server.py`): starts uvicorn in a background daemon thread, waits for `/health` to return `{"status": "ok"}`.
5. Optional: public tunnel (cloudflared or ngrok) exposes the API.

**Outputs:** API listening on `127.0.0.1:8000`; DB schema; model cached; WS manager ready.
**Errors:** missing artifacts → assertion error with clear instructions to run notebook 02 first.

---

## 3. Flow 2 — Packet Capture & Flow Assembly 🟠 LOCAL-ONLY (replaced)

> **Not portable to Colab** (no raw-socket access on a VM). The Colab edition replaces live capture with **synthetic packet-dict flows** (notebook 03, Step 4) and **CSV replay** (Steps 7) that exercise the identical extraction → inference → persist → broadcast pipeline.

The original `NetworkSniffer` (Scapy) flow — 5-tuple assembly, FIN/RST/30 s/500-pkt close, ≥3-pkt submission, retry/backoff delivery — is preserved in git history and documented in the pre-Colab version of this file. Notebook 03's `FlowExtractor` (Flow 3) consumes the same packet-dict format the sniffer produced, so `make_ddos_flow()` / `make_portscan_burst()` / `make_bruteforce_flow()` / `make_normal_flow()` reproduce each attack pattern in memory.

---

## 4. Flow 3 — Feature Extraction (52 CICIDS2017 features) 🔵 notebook 03, Step 3

**Input:** `packets: List[dict]` (same 5-tuple) + optional `flow_key` — produced by the synthetic-flow builders in Step 4 (previously: the sniffer).
**Steps (FlowExtractor.extract_from_dicts):**
1. Empty list → all-zero dict.
2. Split fwd/bwd: `p["src_ip"] == flow_key[0]` (else first packet's src_ip).
3. Collect timestamps/sizes, fwd/bwd sizes & payload sizes; totals.
4. Duration (µs): `(max-min)*(1e6)`.
5. IATs: sorted timestamps → diffs, ×1e6; per-direction too.
6. Rates: bytes/s, packets/s, fwd/bwd packets/s with `duration_safe = 1e-6` guard.
7. Header lengths (default 20), FIN/PSH/ACK counts via substring in `tcp_flags`.
8. Window sizes → Init_Win fwd/bwd; `act_data_pkt_fwd` (payload_len>0); `min_seg_size_forward`.
9. Active/Idle: gap < `ACTIVE_TIMEOUT (5.0 s)` = active, else idle; ×1e6.
10. Assemble 52-key dict; final NaN/Inf → 0.0 pass.

**Outputs:** exactly-52 floating features; guaranteed stable column order (`CICIDS_FEATURES`).

---

## 5. Flow 4 — Inference Pipeline (API `/api/predict`) 🔵 notebook 03, Steps 2 + 5

**Input:** flat JSON object (52 CICIDS keys + optional `_source_ip/_destination_ip/_src_port/_dst_port`).
**Steps:** (identical semantics to the original route — validation, threadpool inference, persist, broadcast)
1. `_get_predict()` → lazy import wrapper (cached); `predict_fn is None` → 503 "ML model not loaded."
2. Parse `raw = await request.json()`; invalid JSON or a non-object root (array/string/number/null) → 400.
3. Metadata → `source_ip/destination_ip` validated as real IPv4/IPv6 via `ipaddress` (absent/empty/"unknown" → `"unknown"`; oversized/control-char/non-IP values → 422 — blocks DB bloat, log forging, and data-borne chatbot prompt injection), ports (default 0, overflow-safe clamp to 0–65535).
4. Strict validation (`_validate_features`): no feature keys → 400; non-numeric/non-finite/negative/>1e15 values → 422 (named); 1–8 missing → 0.0 (count exposed as `missing_features`); >8 missing → 422 with count.
5. `predict_fn(features, feature_names=EXPECTED_FEATURES)` runs in the **threadpool** (`run_in_threadpool`) so the event loop is never blocked:
   - array reshape (1, 52) → `scaler.transform` → `model.predict` → index
   - `predict_proba` → confidence; `encoder.inverse_transform` → label
   - `get_severity(label)` → NONE/CRITICAL/HIGH/MEDIUM/LOW (substring map, fallback LOW)
   - SHAP TreeExplainer → flatten (list/3D/2D) → sort by |v| → top-5 `{feature, value}` (non-finite → 0.0)
6. Create `Alert(timestamp=UTC now, IPs, ports, prediction, confidence, severity, shap_json=json.dumps(top5, allow_nan=False))` → `db.add → commit → refresh` in the threadpool.
7. `not is_benign(prediction)` → `ws_manager.broadcast({id, timestamp, src_ip, source_ip, attack_type, prediction, severity, confidence, shap_top5, missing_features})` + warning log.
8. Return `PredictResponse` (timestamp timezone-aware UTC `…+00:00`).

**Errors:** 400 invalid JSON / non-object root / empty payload · 422 malformed features or metadata · 500 **generic** "Inference failed" (raw exception only in server logs) · 503 model not loaded · WS broadcast failures swallowed (warning only).

---

## 6. Flow 5 — WebSocket Live Stream `/ws/live` 🔵 notebook 03, Step 5

**Input:** client connect (`ws://127.0.0.1:8000/ws/live`, or the tunnel URL).
**Steps:** (same contract: last-50 history batch, 10 s pings, bounded client cap 20, concurrent broadcast with 5 s per-client timeout, dead-client eviction; the `NIDS_API_SECRET` token gate is present in code but unset by default in the notebook)
1. **Auth gate (before any data):** when `NIDS_API_SECRET` is set the client must present `?token=<secret>` or an `X-API-Key` header (constant-time compare). Failure → accept + close **4401**. Over `NIDS_WS_MAX_CLIENTS` (default 20) → accept + close **1013**.
2. `ws_manager.connect` → accept, append, log count.
3. Initial batch: `SELECT * FROM alerts WHERE prediction NOT IN ('Normal Traffic','BENIGN') ORDER BY timestamp DESC, id DESC LIMIT 50` (run in the threadpool so the event loop is never blocked); then reversed list → one `send_text(array)` (timestamps `…+00:00`).
4. Loop: `asyncio.sleep(10)` → ping `{"type": "ping"}` → drain (discard) any client-sent app messages.
5. New attack predictions → broadcast pushes to all clients **concurrently** with a 5 s per-client send timeout; stalled/dead clients are evicted so one slow dashboard cannot stall the rest.
6. Client disconnect → `WebSocketDisconnect` → remove.

**Outputs:** dashboard receives history + live alerts.
**Errors:** history query failure → warning "Could not send history", stream continues; unauthorized/over-cap clients closed with 4401/1013 before receiving any stream data.

---

## 7. Flow 6 — Dashboard Rendering 🔵 notebook 04 (Gradio)

**Input:** embedded API (notebook 03) + 3 s polling.
**Steps:**
1. Gradio Blocks UI launches (share=True → public `.gradio.live` URL).
2. `refresh_all()` polls `/api/stats` + `/api/alerts` + `/api/ip-leaderboard` every 3 s (the WebSocket-equivalent freshness) and updates: KPI strip, attack pie, severity bars, live alert feed, leaderboard, timeline.
3. 🧠 Explain tab: alert dropdown → SHAP top-5 bar plot per alert.
4. 🧪 Traffic lab: injects balanced CSV flows through `POST /api/predict`.
5. Step 4 exports static dashboard PNGs (report-ready).

**Outputs:** live-updating UI + static previews in `nids_artifacts/`.
**Errors:** backend offline → "Backend offline" KPI panel; empty data → explicit empty states on every surface.

---

## 8. Flow 7 — Query & Reporting 🔵 notebook 03 (same endpoints)

| Query | Endpoint | Processing |
|-------|----------|------------|
| Statistics | `GET /api/stats` | total_flows; total_attacks (excludes `BENIGN_LABELS`); benign = diff; grouped by type & severity; uptime |
| Alert history | `GET /api/alerts` | filters limit/offset/type/severity/exclude_benign; `ORDER BY timestamp DESC, id DESC` (deterministic); `type` substring with escaped wildcards |
| Top attackers | `GET /api/ip-leaderboard` | `limit` bounded 1–100; GROUP BY source_ip COUNT MAX(ts) ORDER BY count DESC, last_seen DESC LIMIT n |
| Health | `GET /health` | cached (10 s) db SELECT 1 → `"ok"`/`"error"`; model `_model_loaded`; sniffer `is_running()`; uptime; ws_clients |
| System status | `GET /api/system` | health + manifest.json (model type/52 features/7 classes) + sniffer stats + rate-limit/API-key/NIDS_CAPTURE flags |
| Chat | `POST /api/chat` | LangChain agent (Gemini) + 5 tools → reply, tool_used, freshness note; 2000-char cap, 60 s timeout (504), history bounded to ≤50 string entries with only `user` turns trusted |

---

## 9. Flow 8 — Attack Simulation & Dataset Replay 🟠 LOCAL-ONLY → 🔵 Colab edition

**Input:** notebook cells.
| Scenario | Colab implementation (notebook 03, Step 4 / 7) | Output |
|----------|-----------------------------------------------|--------|
| DDoS flow | `make_ddos_flow()` — 300 tiny one-way SYN packets, 0.5 ms IAT | 52-feature vector → predict → CRITICAL |
| Port scan burst | `make_portscan_burst()` — 40 single-SYN flows to sequential ports; majority vote | per-flow predictions → MEDIUM majority |
| Brute force | `make_bruteforce_flow()` — 40 PSH/ACK login attempts to `:22` | → LOW |
| Normal browsing | `make_normal_flow()` — handshake + bidirectional payloads + teardown | → NONE |
| Dataset replay | Balanced per-class CSV sampling → `POST /api/predict` (notebook 03 Step 7, notebook 04 Traffic lab) | DB alerts + dashboard events |

**Verification:** alerts appear in `/api/stats`, the WS feed, and the Gradio dashboard without a real adversary. The original raw-packet simulators (`sim_*.py`) are in git history.

---

## 10. Flow 9 — Training Pipeline 🔵 notebook 02

**Input:** CSV from `MyDrive/nids_data/` (or `/content`).
**Steps:**
1. GPU check (`nvidia-smi` + torch) — T4 required for GPU cells.
2. Pass-1 count; Pass-2 stratified chunk sampling (target 400,000; float32 reads).
3. Clean (inf → NaN, dropna, drop_duplicates).
4. Label `Attack Type`; `LabelEncoder` → `label_encoder.pkl`; stratified 80/20 split → `X_test.npy`, `y_test.npy`, `feature_names.json`.
5. Dual scalers fit → `scaler.pkl`, `robust_scaler.pkl` (SMOTE optional flag, default off).
6. **Model arena:** LR, DT, RF, XGBoost (GPU), LightGBM — ranked by Macro F1.
7. **XGBoost CPU-vs-GPU timing bake-off** (T4 speed-up).
8. **PyTorch MLP (256-128-64)** on T4 — class-weighted loss, early stopping.
9. **Optuna Bayesian tuning** of XGBoost (20 trials on T4) — tuned model enters the arena.
10. **ROC curves + per-class AUC**, normalized confusion matrix, classification report, per-class F1, benign FPR (encoder-lookup benign index).
11. SHAP TreeExplainer smoke test on the deployed model.
12. Artifacts → `/content/nids_artifacts/` + Drive sync + zip download; **Step 11 Training Summary** table.

**Errors:** CSV missing → assertion with upload instructions; GPU missing → warning (CPU still works, slower).

---

## 11. Flow 10 — Model Evaluation 🔵 notebook 02, Steps 9–9.2

**Input:** artifacts + `X_test.npy/y_test.npy` (same cell flow).
**Steps:** best model → confusion matrix (raw + normalized) → classification report → **ROC curves + per-class AUC** → per-class F1 + benign FPR (benign index looked up from encoder — the original `evaluate.py`'s `benign_label=0` assumption is fixed here) → SHAP smoke test. The original `evaluate.py` standalone script is 🟠 LOCAL-ONLY (removed).

---

## 12. Error-Handling Matrix

| Layer | Failure | Behavior |
|-------|---------|----------|
| API | bad JSON / non-object root / no feature keys / malformed features or metadata / missing model / inference error / oversized body | 400 / 400 / 400 / 422 / 503 / 500 (generic detail) / 413 |
| WS | unauthenticated client / over-cap client / dead or stalled client | close 4401 / close 1013 / evicted (5 s send timeout; concurrent fan-out) |
| Sniffer API | concurrent start / unknown interface / stop with no instance | one instance (RLock) / structured error + available list / `not_running` (no instantiation) |
| Sniffer | no Scapy / no Npcap / iface missing / permission | refuses to start OR L3 fallback OR logs & stops |
| API call from sniffer | connection refused/timeout | 3 attempts with 2 s/4 s backoff; 400/401/422/503 treated as permanent (warn + drop); `total_retries`/`total_dropped` counters |
| Chat | no LangChain / no API key / model error / timeout / oversize message or history | 503 / 503 / 502 (generic) / 504 / 400–422 |
| Frontend | backend down / WS auth rejected | offline status chips + WS reconnect attempts (stops on 4401); explicit error panels on data surfaces |
| Data | NaN/Inf/empty | extractor coerces to 0.0 |
| Training | no CSVs | exit(1) |
| Startup | corrupt artifacts / invalid `NIDS_RATE_LIMIT` | model degrades to 503 mode / falls back to default with warning |