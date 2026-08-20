# NIDS Audit Report — The Sentinel

**Date:** 2026-08-21 · **Scope:** `nids-backend/`, `nids-frontend/`, root docs (8 NIDS_*.md, README, VIVA_GUIDE)
**Method:** Line-by-line code review + artifact inspection (model.pkl, scaler.pkl, label_encoder.pkl, package-lock.json) + live DB queries against `nids-backend/nids.db` (1,998 rows at audit time; 1,999 at latest inspection) + `pytest` (32 tests).
**Status legend:** ✅ FIXED in this pass · 🔴 OPEN · ⚪ DEFERRED/Blocker for publication

> **Follow-up note (2026-08-21, after the full implementation pass):** the fixes below were shipped and are now part of the codebase and docs — CRIT-01/HIGH-03/HIGH-04/HIGH-06 fixed, LOW-03 (placeholder export / placeholder Settings / emojis) resolved via PH7-09b/12b/13b/13c/17, and benign semantics via PH4-09 (single `BENIGN_LABELS`). This report is preserved as the historical audit record; the 8 core docs and NIDS_Tracker now describe the post-fix state.

---

## 1. Executive Summary

The system is functional end-to-end (capture → extract → predict → persist → WS → dashboard) with a real trained artifact. However, the audit found **one correctness bug that invalidated every dashboard statistic** (the benign-label mismatch), **one severity-mapping bug**, **one inference-contract risk** (dual feature lists), plus a cluster of **documentation-vs-reality discrepancies** that would be caught by any informed reviewer: reports claim XGBoost/PostgreSQL/CI-CD that the repo does not contain, and the tracker's status rollup did not add up.

**Both correctness bugs are now fixed with regression tests; the remaining items are disclosure edits in docs (done) or tracked backlog (frontend work, key rotation).**

| Fix class | Count | Status |
|-----------|-------|--------|
| Code correctness (benign filter, DoS severity, extractor floats, feature-list single source) | 4 | ✅ |
| Auth/rate-limiting middleware (defence-in-depth) | 2 | ✅ |
| Tests realigned + regression suite | 2 file rewrites | ✅ 32 passing |
| Docs corrected (Schema, Tracker, TechSpec, PRD, README, VIVA_GUIDE, .env.example) | 7 files | ✅ |
| User-visible audit report | 1 | ✅ this file |

---

## 2. Findings Table

### Critical
| ID | Finding | Status |
|----|---------|--------|
| CRIT-01 | **Benign-label mismatch invalids all stats:** model emits `"Normal Traffic"`; every route filtered `prediction != "BENIGN"` → all 1,998 DB rows counted as attacks | ✅ FIXED |
| CRIT-02 | **Bare `"dos"` missing from `SEVERITY_MAP`** → all DoS predictions fell to LOW fallback (DB evidence: 2 DoS rows at LOW); PRD/README/Schema claimed CRITICAL | ✅ FIXED |

### High
| ID | Finding | Status |
|----|---------|--------|
| HIGH-01 | **Dual 52-feature lists** (`EXPECTED_FEATURES` in route vs `CICIDS_FEATURES` in extractor) — silent total-corruption risk: any drift → all-defaults inference | ✅ FIXED (single source: `CICIDS_FEATURES`) |
| HIGH-02 | Final Report claims **XGBoost "achieved"**; deployed artifact is **LightGBM** (explicitly named in `model.pkl`) | 🔴 docs-owned |
| HIGH-03 | Final Report presents **illustrative metrics as achieved** (e.g., 99%+ confusion tables) with no training logs | 🔴 docs-owned |
| HIGH-04 | **No auth layer**: docs/handout repeatedly present CORS as access control; `allow_origins` localhost-only | ✅ PARTIAL (API-secret middleware; real AuthN/Z backlog) |
| HIGH-05 | Mid & Final Reports claim **PostgreSQL primary**; repo exercises SQLite only (config path exists, never migrated/seeded) | 🔴 docs-owned |
| HIGH-06 | **Chat HTML rendering un-sanitized** (`dangerouslySetInnerHTML` in Chatbot component) | 🔴 frontend backlog |
| HIGH-07 | `.env` contains a **committed-lived Gemini key** (`.env` gitignored but present on disk; history exposure unverified) | 🔴 user action required |

### Medium
| ID | Finding | Status |
|----|---------|--------|
| MED-01 | Tracker Status Rollup arithmetic wrong: Phase 2 = 11 items (10 ✅), Phase 7 = 17 items (13 ✅); Total was 76|58|2|16, should be 78|59|2|17 | ✅ FIXED (now 81|64|2|15 incl. new items) |
| MED-02 | `shap_json` present on benign "Normal Traffic" rows while VIVA_GUIDE/Design claim SHAP only for non-benign | ✅ FIXED (SHAP skip implemented: `predict.py` guard) |
| MED-03 | `flow_duration` etc. as **int** in extractor output vs float contract; route `_src_port`/`_dst_port` int-cast crashes on float input | ✅ FIXED (float coercion; `int(raw.get(...) or 0)`) |
| MED-04 | Mid Report "16 FlowExtractor + 12 API tests (28)" never corroborated; real suite: 32 tests (12 extractor, 20 API) after realignment | ✅ documented in suite |
| MED-05 | 503-vs-400 contract: empty/malformed predict payloads previously fell through to model with all-default zeros; now 400 with explicit message | ✅ FIXED + test |
| MED-06 | Port-scan range inconsistency: papers/presentations say 20–1024; code & docs say 20–200 | 🔴 doc-level note |
| MED-07 | README changelog typo: `lodash: 4.17.23 → 1.18.1` (real: → 4.18.1); TechSpec pinned stale vite 7.3.1 / axios 1.13.6 (real: 7.3.2 / 1.15.0 / lodash 4.18.1) | ✅ FIXED |
| MED-08 | Schema §7 mischaracterized `create_all` ("adds missing tables/columns") — it only creates missing tables, never alters existing ones; Schema §4 severity table had wrong counts (DoS→CRITICAL had 2, Bots split 16/2 — real: DoS→LOW 2, Bots 18 HIGH) | ✅ FIXED |
| MED-09 | VIVA_GUIDE claims: "Infiltration" detected (not in 7-class space), 7 hand-crafted ratio features (never shipped), label example "BENIGN", XGBoost-won narrative, "SQLite/PostgreSQL" | ✅ FIXED (honesty-first rewrite) |
| MED-10 | Chatbot absent from Final Report endpoint count ("eight REST endpoints" — actual REST surface is nine with `/api/chat`) | 🔴 docs-owned |

### Low
| ID | Finding | Status |
|----|---------|--------|
| LOW-01 | `prior_incidents` / `shap_json` "present with 5 items" sample row used `destination=` instead of `destination_ip=` | ✅ FIXED |
| LOW-02 | mlflow / redis / optuna declared but unused in src/ — fine as declared, but reports must not imply usage | ✅ documented |
| LOW-03 | UI polish: placeholder Settings tab, hardcoded CSV export, emojis in production UI | 🔴 frontend backlog |

---

## 3. Detailed Findings — Critical

### CRIT-01 — Benign-label mismatch (INVALIDATES ALL STATS) — ✅ FIXED

**Root cause** — The label encoder artifact maps class `0 → "Normal Traffic"` (verified: `label_encoder.pkl` classes list). Training/eval notebooks and `send_attacks.py` insert "Normal Traffic". The API layer was written against a class named `"BENIGN"` that never exists in the model output space. Every `prediction != "BENIGN"` filter therefore treated **every row as an attack**:

```sql
-- ground truth from nids.db (1,998 rows)
SELECT severity, prediction, COUNT(*) FROM alerts GROUP BY severity, prediction;
-- NONE      | Normal Traffic   | 1800
-- LOW       | Brute Force      |  63
-- LOW       | DoS              |   2   ← CRIT-02 evidence
-- MEDIUM    | Port Scanning    |  76
-- MEDIUM    | Web Attacks      |  19
-- HIGH      | Bots             |  18
-- CRITICAL  | DDoS             |  20
```

**Impact** — Before fix: `benign_count = 0`, `total_attacks = 1,998`, "Normal Traffic" alerts streaming through `/ws/live` and alert feeds. Every downstream statistic, chart, and demo number was wrong.

**Exact change**
- New single source of truth: `src/api/constants.py` → `BENIGN_LABELS = ("Normal Traffic", "BENIGN")`.
- `src/model/predict.py` → `is_benign(label)` helper; SHAP computation now skipped for benign predictions (also resolves MED-02).
- Filters switched to `Alert.prediction.notin_(BENIGN_LABELS)` in: `src/api/routes/stats.py` (total_attacks, attacks_by_type, attacks_by_severity, ip-leaderboard), `src/api/routes/alerts.py` (exclude_benign), `src/api/main.py` (WS history seed, broadcast guard), `src/api/routes/chatbot.py` (4 tools), `src/capture/sniffer.py` (alert log).

**Verification** — `tests/test_api.py`: `test_stats_counts_both_benign_spellings_as_benign` (delta-based: +2 benign, +0 attacks), `test_alerts_default_excludes_normal_traffic`, `test_is_benign_accepts_all_spellings`. **32/32 tests pass.**

**Compatibility** — No schema change. Historically persisted rows remain labeled "Normal Traffic" but are now counted correctly. No migration needed.

### CRIT-02 — Bare "dos" missing from SEVERITY_MAP — ✅ FIXED

**Root cause** — `SEVERITY_MAP` matched `"ddos"` but not the bare `"dos"` class. The model's output space is 7 classes (`Bots, Brute Force, DDoS, DoS, Normal Traffic, Port Scanning, Web Attacks`), so `"Dos"` (correctly lowercased `"dos"`) hit the fallback → LOW. DB evidence: 2 rows `severity=LOW, prediction=DoS`.

**Exact change** — `src/model/predict.py` `SEVERITY_MAP` gains `"dos": "CRITICAL"` (substring match keeps `"ddos"` distinct but adjacent).

**Verification** — `test_dos_family_maps_to_critical`. Schema §4/PRD §7.2/README severity tables corrected to the real achievable 7-class mapping.

---

## 4. Detailed Findings — High

### HIGH-01 — Dual feature lists — ✅ FIXED
`src/api/routes/predict.py` previously owned a second 52-name copy. Inference correctness depends on exact name+order; two lists = silent corruption risk (and was the reason snake_case payloads defaulted to zeros). Fixed by importing `CICIDS_FEATURES` from `src/features/extractor.py` and rebuilding the vector from it. **This is why the old "42/52 features = 0.0" observation existed** — extractor output names never matched the route's expectations for non-CICIDS keys.
Tests: `test_exactly_52_features_in_cicids_order`, `test_predict_with_real_feature_names`, `test_predict_rejects_payload_without_features`.

### HIGH-02/03 — Report claims (XGBoost "achieved", illustrative metrics as achieved) — 🔴 report owner
Artifact says LightGBM. Final Report text must be edited by the report owner to name LightGBM and mark every metric table "illustrative (no saved training logs)". Tracked; disclosed in README security/notes.

### HIGH-04 — CORS ≠ auth — ✅ PARTIAL
CORS is a browser policy, not access control. Backend now supports optional shared-secret auth + per-IP rate limiting via new middleware in `src/api/main.py` (`NIDS_API_SECRET`, `NIDS_RATE_LIMIT`, `X-API-Key` header; 429 on rate exceed; documented in `.env.example`). Full AuthN/AuthZ + TLS unchanged → backlog (PH9-07).

### HIGH-05 — PostgreSQL claim — 🔴 report owner
Only SQLite is configured-by-default and exercised (tests override to SQLite too). Reports must state "SQLite; PostgreSQL path reserved". Schema/VIVA_GUIDE updated; Mid/Final PDFs remain report-owner-owned.

### HIGH-06 — Chat HTML sanitization — 🔴 backlog (PH7-12b)
Chatbot component renders LLM markdown via `dangerouslySetInnerHTML`. Fix: DOMPurify or a markdown lib with raw-HTML disabled.

### HIGH-07 — Key rotation — 🔴 USER ACTION
`.env` contains `GOOGLE_API_KEY=AIzaSyBZSMWo2qULIxELZF-7ABXNe0DXs-bW2vk`. Rotate in Google Cloud Console before any publish. Tracker PH9-10 remains open until done.

---

## 5. Frontend Redesign (backlog driver)

- **AttackTimeline** (PH7-09b): remove synthetic "dummy background noise" rows or label them explicitly.
- **Export Logs** (PH7-13c): replace hardcoded CSV row with real `/api/alerts` export.
- **Settings tab** (PH7-13b): currently placeholder — wire real configuration or remove from nav.
- **AttackPieChart**: verify it excludes benign slice post-fix (it reads `/api/stats` attacks_by_type — now correct server-side).
- Polish: remove random emojis from production UI text.

---

## 6. ML / Inference Fixes

1. SHAP now computed only for non-benign predictions (`predict.py`) — matches VIVA_GUIDE claim, cuts latency on benign traffic.
2. Feature vector rebuilt strictly from `CICIDS_FEATURES` order — removes the only silent-corruption path.
3. `predict()` returns severity per new map; `is_benign()` used at broadcast + persistence filter points.
4. Extractor float contract: `_safe_min/_safe_max` coerce to float (was int → contract violation caught by new test).

---

## 7. DB & Schema

- Verified distribution: NONE 1,800 · LOW 63 (Brute Force) + 2 pre-fix DoS · MEDIUM 95 · HIGH 18 · CRITICAL 20. Schema §4 now states pre/post-fix numbers explicitly.
- `create_all()` note corrected: creates missing tables only; never adds columns to existing tables (no Alembic present).
- Sample row corrected: `destination_ip=` (was `destination=`).
- Queues/streaming (redis/mlflow/optuna) remain declared-but-unused — README/TechSpec noted.

---

## 8. Security

Fixed in this pass: API-secret middleware + rate limiting + benign-broadcast suppression + payload validation (400) + exposing `BENIGN_LABELS` as the single filter constant.
Open: key rotation (user), TLS, real AuthN/AuthZ, input compliance with the model's expected ranges.

---

## 9. Testing & CI

`pytest tests/` — **32 passed, 2 warnings (SQLAlchemy declarative_base deprecation; starlette TestClient/httpx)**, no Python errors.
- Extractor contract: exactly 52 keys, dict order == `CICIDS_FEATURES`, all floats, no NaN/Inf, empty→zeros, fwd/bwd split, DDoS pps, FIN counting, single-packet.
- API: health, alerts (type/severity/pagination), stats keys, ip-leaderboard, predict 503/200/400 paths, benign regression, severity mapping.
CI/CD: no pipeline exists in repo; Mid Report's Docker/CI-CD statements were dropped in Final Report — report owner must reconcile or remove.

---

## 10. Cross-Document Consistency (done this pass)

| Doc | Change |
|-----|--------|
| NIDS_Tracker.md | `BENIGN_LABELS` items PH4-09/PH4-09b, `dos` map PH3-03b, is_benign PH3-03c, test realignment PH8-01b; rollup corrected to 81\|64\|2\|15 with provenance note |
| NIDS_Schema.md | §4 real severity counts + fix notes; §6 query patterns; §7 create_all wording; sample row `destination_ip` |
| NIDS_TechSpec.md | §2.2 vite 7.3.2, axios 1.15.0, +lodash 4.18.1 |
| NIDS_PRD.md | §7.2 achievable-class severity table; §8 ISSUE-01/02 → FIXED |
| README.md | severity table → 7 classes; CORS≠auth note; lodash changelog typo; data-flow note |
| VIVA_GUIDE.md | removed Infiltration/'7 ratio features'/BENIGN/XGBoost/SQLite-claims; severity map fix; honest known-issues Q&A |
| .env.example | NIDS_API_SECRET, NIDS_RATE_LIMIT, NIDS_CAPTURE documentation |

---

## 11. Pre-Publish Checklist (remaining)

- [ ] Rotate Google API key (PH9-10) — user action, blocks any demo/publish
- [ ] Report owner: LightGBM naming, "illustrative" metrics, SQLite-only, 9th endpoint (chat)
- [ ] OR remove CI/CD claims from Mid Report / reconcile with Final
- [ ] Chat sanitization (PH7-12b) before any production exposure
- [ ] AttackTimeline synthetic noise removal (PH7-09b)
- [ ] Practical: `pip install httpx2` to silence TestClient deprecation (optional)

---

*Audited against repo state at commit point 2026-08-21. All code findings re-verified by `pytest` after the fixes were applied.*