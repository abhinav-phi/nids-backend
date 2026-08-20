# NIDS_Rules — Development Rules

**Project:** The Sentinel — Network Intrusion Detection System (NIDS)
**Document:** NIDS_Rules.md
**Status:** ✅ Complete (derived from repository patterns & gaps)
**Legend:** ✅ IMPLEMENTED · 🟡 PARTIAL · 🔵 NOTEBOOK-ONLY · 🔴 NOT IMPLEMENTED · ⚪ FUTURE
**Companion docs:** NIDS_PRD, NIDS_TechSpec, NIDS_AppFlow, NIDS_Design, NIDS_Schema, NIDS_ImplementationPlan, NIDS_Tracker

---

## 1. Security & Secrets

| Rule ID | Rule | Status |
|---------|------|--------|
| SEC-01 | Never commit API keys. `.env` is gitignored; chatbot requires `GOOGLE_API_KEY` at runtime | ✅ (gitignore) |
| SEC-02 | **Immediately rotate the key in the local `.env`** — a live Gemini key exists on this machine (`AIza…`, NIDS-NFR-08). Treat as potentially compromised | 🔴 ACTION REQUIRED |
| SEC-03 | Use `.env.example` + documented env table for all new config | ✅ |
| SEC-04 | Chat output sanitization — `renderMarkdown` escapes ALL HTML before applying markdown-lite transforms (the only `dangerouslySetInnerHTML` call site is escape-first; keep it that way) | ✅ |
| SEC-05 | Restrict CORS `allow_origins` to known dev origins; remove wildcard patterns in production | ✅ (4 explicit origins) |
| SEC-06 | Model artifacts, DB, raw data stay gitignored (`*.pkl`, `*.db`, `data/`) | ✅ |
| SEC-07 | Sniffer requires admin/root; simulation scripts must target loopback in demos | ✅ (documented in README Security Notes) |

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
| TMG-06 | Verify label encoder order before FPR computation — `evaluate.py` hardcodes `benign_label=0` (class 0 is Bots, not benign) — FIXME (ISSUE-06) | 🔴 |

---

## 4. Code Standards & Structure

| Rule ID | Rule | Status |
|---------|------|--------|
| COD-01 | Follow existing layout: API routes under `src/api/routes/`, models in `src/model/`, capture in `src/capture/`, features in `src/features/`; no new top-level folders without PRD update | ✅ |
| COD-02 | Routes only orchestrate: parse → delegate to src/model → persist → broadcast; keep inference logic in `predict.py` | ✅ |
| COD-03 | Preserve logging conventions (`logging.getLogger(__name__)`, INFO+severity markers, `[SNIFFER]`/`[WS]` prefixes) | ✅ |
| COD-04 | Request payload contract: `_`-prefixed metadata stripped; ≤8 missing features → 0.0; >8 missing or malformed values (non-numeric/non-finite/negative/>1e15) → 422 with named features; ports clamped 0–65535 | ✅ |
| COD-05 | Frontend: components in `src/components/`, data hooks in `src/hooks/`, contracts in `src/api/client.ts`; use `cn()` from `lib/utils.ts` | ✅ |
| COD-06 | No inline secrets, no hardcoded/dummy data in production paths — placeholder CSV rows and synthetic chart noise removed (PH7-09b/13b); demo data lives only in `src/simulation` | ✅ |

---

## 5. Validation & Testing Rules

| Rule ID | Rule | Status |
|---------|------|--------|
| TST-01 | Backend: `pytest tests/` before merge; cover extractor fixtures (normal/DDoS/portscan) & API via TestClient | ✅ |
| TST-02 | Integration: `test_pipeline.py` (in-process) must stay green without a server; live scripts (`test_api.py`, `test2_api.py`) require the API running | 🟡 (live tests documented) |
| TST-03 | Artifact sanity: `check.py` must print expected `n_features_in_` (52) and write `manifest.json` after training | ✅ |
| TST-04 | Frontend suites green before UI changes: `npm test` — 17 specs across 6 suites (AlertFeed, AttackTimeline, Chatbot, Sidebar, StatusBar, Settings) | ✅ |
| TST-05 | Every API/UI change: verify `/health`, POST benign + attack flow, WS delivery, stats/DB update | ✅ (checklist in NIDS_Tracker) |

---

## 6. Simulation & Demo Safety

| Rule ID | Rule | Status |
|---------|------|--------|
| SIM-01 | Default simulation targets are loopback (`127.0.0.1`) or private IPs; never target external hosts for demos | ✅ |
| SIM-02 | `send_attacks.py` reads the cleaned CSV and replays POSTs — keep behind rate limits to avoid DB bloat (1,999 rows observed at inspection) | ✅ (documented) |
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
| KIR-05 | Notebook label detection must fall back to `Attack Type` (currently prints `Label column: None`; production `train.py` is correct) | 🔴 (notebook-only) |
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

## 9. Rule Enforcement Summary (Priority)

| Priority | Rule | Type |
|----------|------|------|
| 1 | SEC-02 rotate `.env` Google key | security |
| 2 | TMG-06 fix FPR benign index assumption (ISSUE-06) | correctness |
| 3 | KIR-05 notebook label detection (`Attack Type`) | correctness (notebook-only) |
| 4 | DIL-07 single-source 52-feature list | maintainability |
| 5 | PH9-06b live topology graph | future feature |
| 6 | Playwright E2E suites | quality |
| 7 | Alembic migrations | maintainability |