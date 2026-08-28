# NIDS_Rules — Development Rules

**Project:** The Sentinel — Network Intrusion Detection System (NIDS)
**Document:** NIDS_Rules.md
**Status:** ✅ Complete — **Colab Edition** (2026-08-28). Rules apply to the notebook-embedded implementation; the original per-file rules remain for the local design (git history).
**Legend:** ✅ IMPLEMENTED · 🟡 PARTIAL · 🔵 NOTEBOOK-ONLY (Colab) · 🟠 LOCAL-ONLY (removed) · 🔴 NOT IMPLEMENTED · ⚪ FUTURE
**Companion docs:** NIDS_PRD, NIDS_TechSpec, NIDS_AppFlow, NIDS_Design, NIDS_Schema, NIDS_ImplementationPlan, NIDS_Tracker

---

## 1. Security & Secrets

| Rule ID | Rule | Status |
|---------|------|--------|
| SEC-01 | Never commit API keys. `.env` is gitignored; chatbot requires `GOOGLE_API_KEY` at runtime | ✅ (gitignore) |
| SEC-02 | **Rotate the leaked Gemini key in Google Cloud Console** — the literal was published in a historical audit document and has been scrubbed from the repo (`NIDS_AuditReport.md` now redacted); the value must be treated as compromised until rotated | 🔴 ACTION REQUIRED (external, PH9-10) |
| SEC-03 | Use `.env.example` + documented env table for all new config | ✅ |
| SEC-04 | Chat output sanitization — `renderMarkdown` escapes ALL HTML before applying markdown-lite transforms (the only `dangerouslySetInnerHTML` call site is escape-first; keep it that way) | ✅ |
| SEC-05 | Restrict CORS `allow_origins` to known dev origins; remove wildcard patterns in production | ✅ (4 explicit origins) |
| SEC-06 | Model artifacts, DB, raw data stay gitignored (`*.pkl`, `*.db`, `data/`) | ✅ |
| SEC-07 | Sniffer requires admin/root; simulation scripts must target loopback in demos | ✅ (documented in README Security Notes) |
| SEC-08 | **WebSocket auth:** when `NIDS_API_SECRET` is set, `/ws/live` clients must present `?token=`/`X-API-Key` before any stream data (close 4401); client count bounded (`NIDS_WS_MAX_CLIENTS`, close 1013); broadcasts concurrent with per-client send timeout | ✅ |
| SEC-09 | **Input hardening:** metadata IPs validated with `ipaddress` (422 otherwise); global body cap `NIDS_MAX_BODY_BYTES`; chat history bounded in schema and only `user` turns trusted; rate-limiter env values parse safely (fallback + warning, never crash startup); rate-limiter memory bounded by stale-key eviction | ✅ |
| SEC-10 | **No internal error leakage:** client-facing failure messages stay generic (raw exceptions only in server logs); `/health` returns `"ok"`/`"error"` with a cached DB probe; API-key compare is constant-time | ✅ |

---

## 2. Data Integrity & No Leakage

| Rule ID | Rule | Status |
|---------|------|--------|
| DIL-01 | **Fit scalers/encoders on training data only.** In `train.py`, scalers fit on `X_train_bal`, test only transformed; encoder fit on full label set | ✅ |
| DIL-02 | **No test-set peeking in preprocessing**: cleaning/engineering applied pre-split; engineered features computed then dropped from production path | ✅ |
| DIL-03 | Stratify splits (`stratify=y`, `random_state=42`) to preserve class ratios | ✅ |
| DIL-04 | SMOTE only on training (disabled in prod pipeline: `USE_SMOTE=False`) | ✅ |
| DIL-05 | Never feed the model engineered CSV-only columns (SYN Flag Count, Total Backward Packets…) — live extractor contract is fixed at 52 features; 7 engineered features exist for comparison only | ✅ (comment-enforced) |
| DIL-06 | Coerce NaN/Inf → 0.0 at the extractor boundary; request validation REJECTS non-finite/malformed values (422, named) instead of silently coercing | ✅ |
| DIL-07 | **Do not duplicate the 52-name list**: `EXPECTED_FEATURES` (routes/predict.py) must stay byte-identical to `CICIDS_FEATURES` (extractor.py). Parity is now runtime-guarded (`_load_artifacts` asserts `n_features_in_ == 52`; validation rejects length mismatch) — single-source refactor still recommended | 🟡 |
| DIL-08 | Retain holdout arrays (`X_test.npy`, `y_test.npy`) with the model for reproducible evaluation | ✅ |

---

## 3. Training & Model Governance

| Rule ID | Rule | Status |
|---------|------|--------|
| TMG-01 | Keep every model's hyperparameters explicit and deterministic (`random_state=42`; deterministic SVM 15k slice) | ✅ |
| TMG-02 | Select the production model by **Macro F1** (comparison table printed; best saved); re-run `train.py` to regenerate metrics | ✅ |
| TMG-03 | Preserve SHAP-compatibility: never deploy PCA/feature-dimension changes (PCA kept experimental only) | ✅ |
| TMG-04 | Record artifact manifest after training (model family, n_features, classes) — scripted: `check.py` + `predict._write_manifest()` write `manifest.json` | ✅ |
| TMG-05 | Monitor classifier `predict_proba` output on novelties; unknown prediction → severity fallback LOW by design | ✅ |
| TMG-06 | Verify label encoder order before FPR computation — **FIXED in Colab edition**: notebook 02 looks up the benign index from the encoder (`le.classes_.index("Normal Traffic")`) instead of hardcoding 0 (the local `evaluate.py` assumed class 0; 🟠 removed) | ✅ (notebook 02) |

---

## 4. Code Standards & Structure

| Rule ID | Rule | Status |
|---------|------|--------|
| COD-01 | Follow existing layout: API routes under `src/api/routes/`, models in `src/model/`, capture in `src/capture/`, features in `src/features/`; no new top-level folders without PRD update | ✅ |
| COD-02 | Routes only orchestrate: parse → delegate to src/model → persist → broadcast; keep inference logic in `predict.py` | ✅ |
| COD-03 | Preserve logging conventions (`logging.getLogger(__name__)`, INFO+severity markers, `[SNIFFER]`/`[WS]` prefixes) | ✅ |
| COD-04 | Request payload contract: JSON root must be an object; `_`-prefixed metadata stripped, IPs validated (IPv4/IPv6); ≤8 missing features → 0.0 with `missing_features` exposed; >8 missing or malformed values (non-numeric/non-finite/negative/>1e15) → 422 with named features; ports clamped 0–65535 (overflow-safe) | ✅ |
| COD-05 | Frontend: components in `src/components/`, data hooks in `src/hooks/`, contracts in `src/api/client.ts`; use `cn()` from `lib/utils.ts` | ✅ |
| COD-06 | No inline secrets, no hardcoded/dummy data in production paths — placeholder CSV rows and synthetic chart noise removed (PH7-09b/13b); demo data lives only in `src/simulation` | ✅ |
| COD-07 | Blocking work (ML/SHAP inference, DB commits) never runs on the async event loop — offload via `run_in_threadpool` or sync routes | ✅ |

---

## 5. Validation & Testing Rules

| Rule ID | Rule | Status |
|---------|------|--------|
| TST-01 | Backend: `pytest tests/` before merge; cover extractor fixtures (normal/DDoS/portscan) & API via TestClient | ✅ (78 tests incl. `tests/test_hardening.py`) |
| TST-02 | Integration: `test_pipeline.py` (in-process) must stay green without a server; live scripts (`test_api.py`, `test2_api.py`) require the API running | 🟡 (live tests documented) |
| TST-03 | Artifact sanity: `check.py` must print expected `n_features_in_` (52) and write `manifest.json` after training | ✅ |
| TST-04 | Frontend suites green before UI changes: `npm test` — 21 specs across 7 suites (AlertFeed, AttackTimeline, Chatbot, Sidebar, StatusBar, Settings, useWebSocket) | ✅ |
| TST-05 | Every API/UI change: verify `/health`, POST benign + attack flow, WS delivery, stats/DB update | ✅ (checklist in NIDS_Tracker) |
| TST-06 | Every confirmed security/regression bug gets a regression test (WS auth, malformed payloads, IP metadata, env parsing, pagination, sanitization, race conditions, corrupt artifacts) | ✅ (`tests/test_hardening.py`) |

---

## 6. Simulation & Demo Safety

| Rule ID | Rule | Status |
|---------|------|--------|
| SIM-01 | Default simulation targets are loopback (`127.0.0.1`) or private IPs; never target external hosts for demos | ✅ |
| SIM-02 | `send_attacks.py` reads the cleaned CSV and replays POSTs — keep behind rate limits to avoid DB bloat (2,001 rows observed at inspection) | ✅ (documented) |
| SIM-03 | Demos require 3 terminals (frontend / API admin / sim admin) as per README Hackathon Flow | ✅ |
| SIM-04 | SNIFFER counters (packets/flows/API calls/alerts) are the demo's truth source — print via `/api/sniffer/stats` during demos | ✅ |

---

## 7. Product Consistency & Known-Issue Rules

| Rule ID | Rule | Status |
|---------|------|--------|
| KIR-01 | ✅ **Benign semantics aligned** — one canonical set `BENIGN_LABELS = ("Normal Traffic", "BENIGN")` in `src/api/constants.py`; every filter uses `prediction.notin_(BENIGN_LABELS)` (ISSUE-01 RESOLVED, PH4-09) | ✅ |
| KIR-02 | ✅ Benign/`NONE` rows excluded from WS broadcast and default feeds, still persisted for stats (ISSUE-02 RESOLVED) | ✅ |
| KIR-03 | ✅ Synthetic "dummy background noise" removed from `AttackTimeline` (ISSUE-04 RESOLVED, PH7-09b) | ✅ |
| KIR-04 | ✅ Hardcoded CSV export replaced with real alert export (ISSUE-03 RESOLVED, PH7-13/13b) | ✅ |
| KIR-05 | Notebook label detection must fall back to `Attack Type` — **FIXED in Colab edition**: notebooks 01/02 detect `Attack Type` (with `attack`/`label` fallback); the original notebooks that printed `Label column: None` are 🟠 removed | ✅ (notebooks 01/02) |
| KIR-06 | Keep this doc + NIDS_Tracker updated with every code change; statuses must match code evidence | ✅ (docs written) |

---

## 8. Documentation Rules

| Rule ID | Rule | Status |
|---------|------|--------|
| DOC-01 | 8-doc set is the single source of truth: PRD (what), TechSpec (how), AppFlow (flows), Design (UI), Schema (data), Plan (phases), Tracker (state), Rules (this file) | ✅ |
| DOC-02 | Every new feature gets an ID (NIDS-XXX-NN) in PRD + task (PHx-NN) in Plan/Tracker | ✅ |
| DOC-03 | Unknowns must be marked **"Not determinable from repository."** — never invent values (metrics of saved model, exact CV numbers, etc.) | ✅ |
| DOC-04 | On merge: update README changelog + any affected doc; mark tasks done in NIDS_Tracker | 🟡 |

---

## 10. Colab-Edition Rules 🔵

| Rule ID | Rule | Status |
|---------|------|--------|
| CLB-01 | **Single source of truth:** edit notebooks via `_build/*.py` percent-format sources, never the `.ipynb` directly; regenerate with `python pack.py` (validates nbformat + syntax) | ✅ |
| CLB-02 | **Every rebuild runs the smoke test:** `_build/smoke_test.py` must PASS (executes notebook 03's embedded inference + API + validation contract) before committing notebook changes | ✅ |
| CLB-03 | **Artifact contract never changes:** `model.pkl` stays an sklearn-compatible estimator with `n_features_in_ == 52`; `scaler.pkl` StandardScaler; `label_encoder.pkl` 7 classes; `manifest.json` mirrors the production format — notebooks 03/04 depend on it | ✅ |
| CLB-04 | **GPU cells degrade gracefully:** XGBoost falls back to CPU when CUDA is unavailable; PyTorch MLP runs on CPU with a warning; notebooks must never hard-crash on a CPU runtime | ✅ |
| CLB-05 | **Determinism:** every random operation uses `random_state=42` (load sampling, splits, SMOTE, torch seed) | ✅ |
| CLB-06 | **Colab-unsafe features stay out:** no raw sockets, no Scapy capture, no system-level installs; synthetic flows + CSV replay are the only traffic sources | ✅ |
| CLB-07 | **Secrets:** API keys (Gemini) are entered via `getpass` per session — never hardcoded, never saved | ✅ |
| CLB-08 | **Report hygiene:** each notebook ends with a summary table / key numbers for the project report; plots are saved under `nids_artifacts/` | ✅ |

---

## 9. Rule Enforcement Summary (Priority)

| Priority | Rule | Type |
|----------|------|------|
| 1 | SEC-02 rotate the leaked Gemini key (Google Cloud Console) | security |
| 2 | ✅ TMG-06 fixed in Colab edition (benign FPR index from encoder) | correctness |
| 3 | ✅ KIR-05 fixed in Colab edition (`Attack Type` label detection) | correctness |
| 4 | DIL-07 single-source 52-feature list (embedded in `frag_inference.py` — parity guards active) | maintainability |
| 5 | CLB-02 smoke test must pass before any notebook change | quality |
| 6 | PH9-06b live topology graph | future feature |
| 7 | Alembic migrations | maintainability |