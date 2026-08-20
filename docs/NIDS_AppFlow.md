# NIDS_AppFlow — Application Flow

**Project:** The Sentinel — Network Intrusion Detection System (NIDS)
**Document:** NIDS_AppFlow.md
**Status:** ✅ Complete (derived from repository code)
**Legend:** ✅ IMPLEMENTED · 🟡 PARTIAL · 🔵 NOTEBOOK-ONLY · 🔴 NOT IMPLEMENTED · ⚪ FUTURE

---

## 1. Flow Map (High Level)

```
 Live network  ──► 1. Capture (Sniffer)  ──► 2. Flow assembly
                                      └────► 3. Feature extraction (52)
                                              └────► 4. Inference (scale→LGBM→SHAP→severity)
                                                      └────► 5. Persist Alert + WS broadcast
                                                               └────► 6. Dashboard render
                                                                       └────► 7. Query/Report/Chat
```

---

## 2. Flow 1 — Startup (Backend)

**Input:** launch command
**Steps:**
1. `uvicorn src.api.main:app --reload --port 8000` (or with `NIDS_CAPTURE=1`).
2. Lifespan `asynccontextmanager`:
   - `Base.metadata.create_all(bind=engine)` → tables ready (SQLite file created if absent).
   - `from src.model.predict import predict` → triggers `_load_artifacts()` (joblib loads model/scaler/encoder + SHAP TreeExplainer). `FileNotFoundError` → warning "Run src/model/train.py first."
   - `app.state.ws_manager = ws_manager`.
   - If `NIDS_CAPTURE` ∈ ("1","true","yes") → lazy-create `NetworkSniffer(interface="auto")` → `.start()`.
3. MEDIUM/POST paths registered, CORS middleware active.
4. `GET /health` → `{status: "ok", db, model, sniffer, uptime_seconds, ws_clients}`.

**Outputs:** API listening on :8000; DB schema; model cached; optional sniffer threads.
**Errors:** missing artifacts → model "not loaded", predict requests → HTTP 503.

---

## 3. Flow 2 — Live Packet Capture & Flow Assembly (Sniffer)

**Input:** raw packets on interface (auto-detected or `--interface`).
**Steps:**
1. `NetworkSniffer._capture_loop()` → Scapy `sniff(prn=_process_packet, store=False, stop_filter=not running)`.
   - Windows: if Npcap/WinPcap missing → Layer-3 fallback (`conf.L3socket()`).
2. `_process_packet`:
   - `total_packets += 1`; skip non-IP.
   - `_get_flow_key(pkt)` → 5-tuple `(src_ip, dst_ip, src_port, dst_port, protocol)`; protocol = TCP/UDP/ICMP else `str(proto)`.
   - Existing flow? append packet + `packet_dict` (`_packet_to_dict`: 12 fields — src/dst IP, ports, protocol, size, payload_len, header_len, time, tcp_flags, window_size, ttl). New flow → create `Flow`.
   - TCP FIN or RST (`_is_flow_terminator`) → `flow.is_closed = True` → finalize immediately.
   - `len(packets) >= MAX_PACKETS_PER_FLOW (500)` → finalize early.
3. `FlowTimeout` thread (every 5 s): flows idle ≥ `FLOW_TIMEOUT_SECONDS (30)` → finalize.
4. `_finalize_flow`:
   - Pop flow; skip if <3 packet_dicts.
   - `FlowExtractor.extract_from_dicts(packet_dicts, flow_key)` → 52-feature dict (NaN/Inf→0.0).
   - Attach metadata: `_source_ip`, `_destination_ip`, `_src_port`, `_dst_port` (floats).
   - Spawn daemon thread `_call_api(features, src_ip, dst_ip)` → `requests.post(API_PREDICT_URL, json=features, timeout=10)`; on transport errors retried up to `API_MAX_RETRIES` (3) with 2 s/4 s backoff.
   - Response 200: pred/conf/sev; `not is_benign(pred)` → `total_alerts += 1` + 🚨 log; else debug "✓ benign".
   - 400/401/422/503 responses treated as permanent → warn + drop (counted in `total_dropped`); `total_retries` counts re-attempts.

**Outputs:** HTTP POST per completed flow to `/api/predict`; counters (packets/flows/API calls/alerts/retries/dropped).
**Errors:** Scapy missing → refuses start; interface not found / permission denied → capture thread stops, logs error; API down → retries with backoff; permanent rejection → drop + count.

---

## 4. Flow 3 — Feature Extraction (52 CICIDS2017 features)

**Input:** `packets: List[dict]` (same 5-tuple) + optional `flow_key`.
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

## 5. Flow 4 — Inference Pipeline (API `/api/predict`)

**Input:** flat JSON dict (52 CICIDS keys + optional `_source_ip/_destination_ip/_src_port/_dst_port`).
**Steps:**
1. `_get_predict()` → lazy import wrapper (cached); `predict_fn is None` → 503 "ML model not loaded."
2. Parse `raw = await request.json()`; invalid → 400.
3. Metadata → `source_ip/destination_ip` (default "unknown"), ports (default 0).
4. Strict validation (`_validate_features`): no feature keys → 400; non-numeric/non-finite/negative/>1e15 values → 422 (named); 1–8 missing → 0.0; >8 missing → 422 with count; ports clamped 0–65535. Build `features` dict in `EXPECTED_FEATURES` order.
5. `predict_fn(features, feature_names=EXPECTED_FEATURES)`:
   - array reshape (1, 52) → `scaler.transform` → `model.predict` → index
   - `predict_proba` → confidence; `encoder.inverse_transform` → label
   - `get_severity(label)` → NONE/CRITICAL/HIGH/MEDIUM/LOW (substring map, fallback LOW)
   - SHAP TreeExplainer → flatten (list/3D/2D) → sort by |v| → top-5 `{feature, value}`
6. Create `Alert(timestamp=utcnow, IPs, ports, prediction, confidence, severity, shap_json=json.dumps(top5))` → `db.add → commit → refresh`.
7. `not is_benign(prediction)` → `ws_manager.broadcast({id, timestamp, src_ip, source_ip, attack_type, prediction, severity, confidence, shap_top5})` + warning log.
8. Return `PredictResponse`.

**Errors:** 400 invalid JSON/empty payload · 422 malformed features · 500 `Inference failed` · 503 model not loaded · WS broadcast failures swallowed (warning only).

---

## 6. Flow 5 — WebSocket Live Stream `/ws/live`

**Input:** client connect (`ws://localhost:8000/ws/live`).
**Steps:**
1. `ws_manager.connect` → accept, append, log count.
2. Initial batch: `SELECT * FROM alerts WHERE prediction NOT IN ('Normal Traffic','BENIGN') ORDER BY timestamp DESC LIMIT 50`; then reversed list → one `send_text(array)`.
3. Loop: `asyncio.sleep(10)` → ping `{"type": "ping"}`.
4. New attack predictions → broadcast pushes to all clients.
5. Client disconnect → `WebSocketDisconnect` → remove.

**Outputs:** dashboard receives history + live alerts.
**Errors:** history query failure → warning "Could not send history", stream continues.

---

## 7. Flow 6 — Dashboard Rendering (Frontend)

**Input:** WS messages + REST polls.
**Steps:**
1. `useWebSocket` connects; normalizes payloads (`src_ip`, `attack_type`, `confidence`, `shap_top5`); reconnects on drop (~3 s backoff).
2. Router-based pages (react-router):
   - **`/` Dashboard:** KPICards · TrafficChart (8 cols) · AttackPieChart (4 cols) · AlertFeed (9 cols) · IPLeaderboard (3 cols) · AttackTimeline (full width).
   - **`/alerts`** Archive AlertFeed (server-paginated, type/severity/search filters, CSV export).
   - **`/reports`** AttackPieChart + IPLeaderboard + AttackTimeline.
   - **`/network`** Network Activity: real src→dst flow aggregation from latest 500 alerts.
   - **`/explain`** Alert picker → SHAPExplainer (supports `?src=&t=` deep link).
   - **`/settings`** Real system status via `GET /api/system` (health, model manifest, sniffer counters, security flags).
3. Per-component polling: TrafficChart 5 s; AttackTimeline/IPLeaderboard 30 s; StatusBar /health 10 s; Settings /api/system 15 s; KPICards getStats.
4. New alert in `alertHistory` → AlertFeed append (cap 50 shown), severity color coding, flash highlight; SHAPExplainer opens for selected.

**Outputs:** live-updating DOM.
**Errors:** Backend offline → axios interceptor console `[API] Backend offline`; WS disconnected indicator; chat errors surfaced as text bubble (no emoji).

---

## 8. Flow 7 — Query & Reporting

| Query | Endpoint | Processing |
|-------|----------|------------|
| Statistics | `GET /api/stats` | total_flows; total_attacks (excludes `BENIGN_LABELS`); benign = diff; grouped by type & severity; uptime |
| Alert history | `GET /api/alerts` | filters limit/offset/type/severity/exclude_benign, desc |
| Top attackers | `GET /api/ip-leaderboard` | GROUP BY source_ip COUNT MAX(ts) ORDER BY count DESC LIMIT n |
| Health | `GET /health` | db SELECT 1; model `_model_loaded`; sniffer `is_running()`; uptime; ws_clients |
| System status | `GET /api/system` | health + manifest.json (model type/52 features/7 classes) + sniffer stats + rate-limit/API-key/NIDS_CAPTURE flags |
| Chat | `POST /api/chat` | LangChain agent (Gemini) + 5 tools → reply, tool_used, freshness note; 2000-char cap, 60 s timeout, bounded history |

---

## 9. Flow 8 — Attack Simulation & Dataset Replay

**Input:** user command.
| Script | Steps | Output |
|--------|-------|--------|
| `sim_ddos.py` | Random src IPs → UDP flood to target:port (default 127.0.0.1:80), ~300 pkts, small delay | raw packets on loopback |
| `sim_portscan.py` | SYN → ports 20–200 from 10.0.0.99 | raw packets |
| `sim_bruteforce.py` | Per attempt sends SYN → PA (fake SSH banner `SSH-2.0-OpenSSH_8.0`) → RST to port 22 from 10.0.0.77, ~100 attempts | raw packets |
| `sim_mixed.py` | Runs DDoS → (pause 8 s) → PortScan → BruteForce sequence | mixed traffic |
| `send_attacks.py` | Reads `cicids2017_cleaned.csv`; per-`Attack Type` balanced sampling; POSTs rows to `/api/predict` | DB alerts + dashboard events |

**Verification:** alerts appear on dashboard without a real adversary. ⚠️ Sim only: keep targets loopback; elevated privileges not required for API replay (`send_attacks.py`).

---

## 10. Flow 9 — Training Pipeline (Offline)

**Input:** CSVs in `data/raw/`.
**Steps:**
1. Pass-1 count; Pass-2 stratified chunk sampling (target 400,000).
2. Clean (inf → NaN, dropna, drop_duplicates).
3. Optionally engineer 7 ratio features (`ENG_FEATURES`) — baseline comparison only.
4. Split label `Attack Type`; `LabelEncoder` → `label_encoder.pkl`.
5. Stratified 80/20 train/test → `X_test.npy`, `y_test.npy`.
6. Dual scalers fit → `scaler.pkl`, `robust_scaler.pkl`.
7. PCA experiment → logged.
8. Train 9 models (incl. dual-scaler clones for DT/RF/XGB/LGBM/MLP).
9. 5-fold CV top-2; comparison table; best (Macro F1) → `model.pkl`.
10. Log artifact paths; exit.

**Errors:** no CSV → exit(1) with error; LightGBM absent → graceful skip (requirement now lists it, so expected present).

---

## 11. Flow 10 — Model Evaluation (Offline, `evaluate.py`)

**Input:** artifacts + `X_test.npy/y_test.npy`.
**Steps:** load → predict → `compute_metrics` → print + per-class F1 bars → FPR (⚠️ benign_label=0 assumption) → confusion matrix PNG → feature importance PNG.

---

## 12. Error-Handling Matrix

| Layer | Failure | Behavior |
|-------|---------|----------|
| API | bad JSON / no feature keys / malformed features / missing model / inference error | 400 / 400 / 422 / 503 / 500 |
| WS | dead client | eviction on next broadcast; session closed in `finally` |
| Sniffer | no Scapy / no Npcap / iface missing / permission | refuses to start OR L3 fallback OR logs & stops |
| API call from sniffer | connection refused/timeout | 3 attempts with 2 s/4 s backoff; 400/401/422/503 treated as permanent (warn + drop); `total_retries`/`total_dropped` counters |
| Chat | no LangChain / no API key / model error / timeout / oversize message | 503 / 502 with explicit detail / 504-style timeout / 422 (>2000 chars) |
| Frontend | backend down | offline status chips + WS reconnect attempts; explicit error panels on data surfaces |
| Data | NaN/Inf/empty | extractor coerces to 0.0 |
| Training | no CSVs | exit(1) |