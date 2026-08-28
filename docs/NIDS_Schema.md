# NIDS_Schema — Database Schema

**Project:** The Sentinel — Network Intrusion Detection System (NIDS)
**Document:** NIDS_Schema.md
**Status:** ✅ Complete — **Colab Edition** (2026-08-28). The runtime DB is now `/content/nids_colab.db` (created by notebook 03/04's embedded API). The original `nids.db` is 🟠 LOCAL-ONLY (removed). Artifacts live in `/content/nids_artifacts/` (synced to Drive).
**Legend:** ✅ IMPLEMENTED · 🟡 PARTIAL · 🔵 NOTEBOOK-ONLY (Colab) · 🟠 LOCAL-ONLY (removed) · 🔴 NOT IMPLEMENTED · ⚪ FUTURE

---

## 1. Overview

Persistence is managed by SQLAlchemy 2.0 (ORM) with a **SQLite** backend at `/content/nids_colab.db` (`check_same_thread=False`, `pool_pre_ping=True`, WAL journal + 5 s busy timeout — the same pragmas as the original, created by notebook 03/04's embedded API).

Tables are created automatically when the notebook's API cell runs (`Base.metadata.create_all`).

**Currently only ONE table exists: `alerts`.**

---

## 2. Table: `alerts`

| Column | Type (SQLAlchemy) | SQLite DDL | Constraints | Notes |
|--------|-------------------|------------|-------------|-------|
| `id` | Integer PK | INTEGER NOT NULL PRIMARY KEY | autoincrement; indexed | |
| `timestamp` | DateTime | DATETIME | default timezone-aware `utcnow`; indexed | Alert creation time (UTC). Serialized by all API/WS surfaces as timezone-aware ISO-8601 (`…+00:00`) via `models.iso_utc` — legacy naive rows are treated as UTC |
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
Top 5 by |value| descending (sign preserved). Values are sanitized before persistence/broadcast — non-finite SHAP values become `0.0` and serialization uses `allow_nan=False`, so the JSON never contains bare `NaN`/`Infinity` tokens (browser `JSON.parse`-safe).

---

## 4. Observed Database State (Colab run — example)

After a full replay from notebook 03 (balanced sample, 5 per class): the DB contains rows for each posted flow. The schema is identical to the original; the row count varies by replay configuration.

> The original `nids.db` (2,001 rows: 1,803 Normal Traffic + 198 attacks) is 🟠 LOCAL-ONLY; the Colab notebooks create a fresh database per session.

---

## 5. Non-DB Artifacts (File-Backed State) — Colab edition

| Artifact | Format | Role | Location |
|----------|--------|------|----------|
| `model.pkl` | joblib (best sklearn model) | 52-feature classifier | `/content/nids_artifacts/` |
| `scaler.pkl` | joblib (StandardScaler) | inference pre-processing | `/content/nids_artifacts/` |
| `robust_scaler.pkl` | joblib (RobustScaler) | scaler-comparison artifact | `/content/nids_artifacts/` |
| `label_encoder.pkl` | joblib (LabelEncoder) | index ↔ 7 class labels | `/content/nids_artifacts/` |
| `feature_names.json` | JSON | 52 CICIDS feature names | `/content/nids_artifacts/` |
| `manifest.json` | JSON | model type, feature count, classes, severity-map keys | `/content/nids_artifacts/` — written by notebook 02 (mirrors `predict.py::_write_manifest`) |
| `X_test.npy` / `y_test.npy` | numpy | evaluation holdout | `/content/nids_artifacts/` |
| `data/raw/cicids2017_cleaned.csv` | CSV | training dataset source | `MyDrive/nids_data/` (uploaded) |

All artifacts are synced to `MyDrive/nids_artifacts/` and zipped into `/content/nids_artifacts.zip` for download. The original `nids-backend` model artifacts are 🟠 LOCAL-ONLY (removed).

---

## 6. Queries Used With the Schema

| Endpoint | Query Pattern |
|----------|---------------|
| `GET /api/stats` | `COUNT(*)` total; `COUNT(prediction NOT IN ('Normal Traffic','BENIGN'))`; `GROUP BY prediction`; `GROUP BY severity` |
| `GET /api/alerts` | `ORDER BY timestamp DESC, id DESC LIMIT ? OFFSET ?` + optional type (substring, wildcards escaped)/severity filters + `exclude_benign` (`prediction NOT IN ('Normal Traffic','BENIGN')`) |
| `GET /api/ip-leaderboard` | `GROUP BY source_ip COUNT(*) MAX(timestamp) ORDER BY count DESC, last_seen DESC LIMIT n` (`limit` bounded 1–100) |
| `WS /ws/live (initial)` | `WHERE prediction NOT IN ('Normal Traffic','BENIGN') ORDER BY timestamp DESC, id DESC LIMIT 50` |
| Chat tools | Same aggregations + `ilike` type filter (wildcards escaped) + `hours_back` window (`>= utcnow() - hours`) |

The benign set lives in one place: `BENIGN_LABELS` in `src/api/constants.py`. Any future label drift must be updated there, not re-spelled per query.

---

## 7. Migration / Evolution Notes (⚪ FUTURE / 🟡 PARTIAL)

- No Alembic migration framework present → `Base.metadata.create_all()` only **creates missing tables**; it never adds columns to, or alters, existing tables. Schema changes require manual DDL or a DB recreate. 🟡
- `true_label` column reserved but unused — intended for offline evaluation rows. 🔵
- PostgreSQL path exists in the original config but is **not used** in the Colab edition (SQLite only). 🟡
- ✅ Resolved (PH4-09): benign alignment is done in code via `BENIGN_LABELS` (`prediction.notin_(...)`) — schema unchanged and compatible.