# NIDS_Schema — Database Schema

**Project:** The Sentinel — Network Intrusion Detection System (NIDS)
**Document:** NIDS_Schema.md
**Status:** ✅ Complete (derived from `models.py`, live DB inspection, artifacts)
**Legend:** ✅ IMPLEMENTED · 🟡 PARTIAL · 🔵 NOTEBOOK-ONLY · 🔴 NOT IMPLEMENTED · ⚪ FUTURE

---

## 1. Overview

Persistence is managed by SQLAlchemy 2.0 (ORM) with a default **SQLite** backend (`sqlite:///./nids.db`, `check_same_thread=False`, `pool_pre_ping=True`). PostgreSQL is supported by configuration (`DATABASE_URL`), though all repository evidence uses SQLite.

Tables are created automatically at startup (`Base.metadata.create_all` in the lifespan).

**Currently only ONE table exists: `alerts`.**

---

## 2. Table: `alerts`

| Column | Type (SQLAlchemy) | SQLite DDL | Constraints | Notes |
|--------|-------------------|------------|-------------|-------|
| `id` | Integer PK | INTEGER NOT NULL PRIMARY KEY | autoincrement; indexed | |
| `timestamp` | DateTime | DATETIME | default `datetime.utcnow`; indexed | Alert creation time (UTC) |
| `source_ip` | String(45) | VARCHAR(45) | indexed | IPv4/IPv6 sized |
| `destination_ip` | String(45) | VARCHAR(45) | | |
| `src_port` | Integer | INTEGER | NULL allowed | 0 for ICMP/etc. |
| `dst_port` | Integer | INTEGER | NULL allowed | 0 for ICMP/etc. |
| `prediction` | String(50) | VARCHAR(50) | indexed | Class label (see §3) |
| `confidence` | Float | FLOAT | | probability of predicted class |
| `severity` | String(20) | VARCHAR(20) | indexed | CRITICAL/HIGH/MEDIUM/LOW/NONE |
| `shap_json` | Text | TEXT | NULL allowed | JSON string of SHAP top-5 |
| `true_label` | String(50) | VARCHAR(50) | NULL allowed | (reserved; not populated by routes) |

**Indexes (as declared in `models.py`):** `id`, `timestamp`, `source_ip`, `prediction`, `severity`.

### Entity Relationship (only entity)

```
          ╔═══════════════════════════════════════╗
          ║            alerts                     ║
          ╠═══════════════════════════════════════╣
          ║ PK  id            INTEGER             ║
          ║ IX  timestamp     DATETIME  (utcnow)  ║
          ║ IX  source_ip     VARCHAR(45)         ║
          ║     destination_ip VARCHAR(45)        ║
          ║     src_port      INTEGER  (nullable) ║
          ║     dst_port      INTEGER  (nullable) ║
          ║ IX  prediction    VARCHAR(50)         ║
          ║     confidence    FLOAT               ║
          ║ IX  severity      VARCHAR(20)         ║
          ║     shap_json     TEXT     (nullable) ║
          ║     true_label    VARCHAR(50)(nullable)║
          ╚═══════════════════════════════════════╝
```

No relationships/FKs — the system stores flat alert rows only.

---

## 3. Data Dictionary (Production Values)

### prediction values (7 model classes from `label_encoder.pkl`)
`Bots`, `Brute Force`, `DDoS`, `DoS`, `Normal Traffic`, `Port Scanning`, `Web Attacks`

### severity values (get from `SEVERITY_MAP` in `predict.py`)
| Severity | Mapped predictions (substring) |
|----------|-------------------------------|
| `NONE` | benign / normal / normal traffic |
| `CRITICAL` | ddos, dos hulk, dos goldeneye, dos slowloris, dos slowhttptest, heartbleed |
| `HIGH` | bot, ftp-patator, ssh-patator, infiltration |
| `MEDIUM` | port scanning, portscan, web attack*, web attack – brute force / – xss / – sql injection |
| `LOW` | brute force, fallback (anything unmatched) |

### shap_json format
```json
[{"feature": "Flow Bytes/s", "value": 1.2345}, {"feature": "...", "value": -0.9}]
```
Top 5 by |value| descending (sign preserved).

---

## 4. Observed Database State (Inspection Snapshot)

From live inspection of `nids.db`:

**Row count:** 1,999

**prediction distribution:**
| prediction | count |
|------------|-------|
| Normal Traffic | 1,801 |
| Port Scanning | 76 |
| Brute Force | 63 |
| DDoS | 20 |
| Web Attacks | 19 |
| Bots | 18 |
| DoS | 2 |

**severity distribution** — counts as produced by the current `SEVERITY_MAP` (post-fix; earlier DB rows persisted the pre-fix values shown in parentheses):

| severity | count |
|----------|-------|
| NONE | 1,801 (all "Normal Traffic") |
| MEDIUM | 95 (Port Scanning 76 + Web Attacks 19) |
| LOW | 63 (Brute Force) — pre-fix DB had 65, incl. 2 "DoS" rows that fell through to the LOW fallback because bare `"dos"` was missing from `SEVERITY_MAP` |
| HIGH | 18 (Bots) |
| CRITICAL | 22 (DDoS 20 + DoS 2 — DoS now maps to CRITICAL via the added `"dos"` keyword) |

*e.g. sample row: `id=1`, `timestamp='2026-04-11 19:32:14'`, `source_ip='10.0.0.1'`, `destination_ip='unknown'`, `src/dst_port=0`, `prediction='Normal Traffic'`, `confidence=1.0`, `severity='NONE'`, `shap_json` present with 5 items.

> ✅ **NIDS-ISSUE-01 (fixed):** Every persisted row has a real label; **zero rows** have `prediction='BENIGN'` — the model emits `"Normal Traffic"`. All aggregation code now filters on `BENIGN_LABELS = ("Normal Traffic", "BENIGN")` via `prediction.notin_(BENIGN_LABELS)` (`src/api/constants.py`), so benign flows are no longer counted as attacks. Rows persisted before the fix need re-flagging only if a historical re-count is desired; live stats now behave correctly. (Separate fix: bare `"dos"` added to `SEVERITY_MAP` so DoS maps to CRITICAL, not LOW.)

---

## 5. Non-DB Artifacts (File-Backed State)

| Artifact | Format | Role |
|----------|--------|------|
| `model.pkl` | joblib (LGBMClassifier) | 52-feature classifier |
| `scaler.pkl` | joblib (StandardScaler) | inference pre-processing |
| `robust_scaler.pkl` | joblib (RobustScaler) | scaler-comparison artifact |
| `label_encoder.pkl` | joblib (LabelEncoder) | index ↔ 7 class labels |
| `manifest.json` | JSON | deployed-model manifest: model type (LGBMClassifier), feature count (52), class labels (7), severity-map key count, `checks_ok` — written by `check.py` and refreshed by `predict._write_manifest()` (TMG-04) |
| `data/processed/X_test.npy` | numpy (33 MB) | evaluation holdout features |
| `data/processed/y_test.npy` | numpy (320 KB) | evaluation holdout labels |
| `data/raw/cicids2017_cleaned.csv` | CSV (~717 MB) | training dataset source |

All model artifacts are gitignored (`*.pkl`), `.env` gitignored, `data/` gitignored, `*.db` gitignored.

---

## 6. Queries Used With the Schema

| Endpoint | Query Pattern |
|----------|---------------|
| `GET /api/stats` | `COUNT(*)` total; `COUNT(prediction NOT IN ('Normal Traffic','BENIGN'))`; `GROUP BY prediction`; `GROUP BY severity` |
| `GET /api/alerts` | `ORDER BY timestamp DESC LIMIT ? OFFSET ?` + optional type/severity filters + `exclude_benign` (`prediction NOT IN ('Normal Traffic','BENIGN')`) |
| `GET /api/ip-leaderboard` | `GROUP BY source_ip COUNT(*) MAX(timestamp) ORDER BY count DESC LIMIT n` |
| `WS /ws/live (initial)` | `WHERE prediction NOT IN ('Normal Traffic','BENIGN') ORDER BY timestamp DESC LIMIT 50` |
| Chat tools | Same aggregations + `ilike` type filter + `hours_back` window (`>= utcnow() - hours`) |

The benign set lives in one place: `BENIGN_LABELS` in `src/api/constants.py`. Any future label drift must be updated there, not re-spelled per query.

---

## 7. Migration / Evolution Notes (⚪ FUTURE / 🟡 PARTIAL)

- No Alembic migration framework present → `Base.metadata.create_all()` only **creates missing tables**; it never adds columns to, or alters, existing tables. Schema changes require manual DDL or a DB recreate. 🟡
- `true_label` column reserved but unused — intended for offline evaluation rows. 🔵
- PostgreSQL path exists in config but no migration/seed evidence in repo. 🟡
- ✅ Resolved (PH4-09): benign alignment is done in code via `BENIGN_LABELS` (`prediction.notin_(...)`) — schema unchanged and compatible; historically-inserted "Normal Traffic" rows would only need re-flagging if a historical re-count is ever desired. ⚪