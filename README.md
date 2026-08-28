# The Sentinel — Network Intrusion Detection System (NIDS)

> **Colab Edition** — ML-powered NIDS fully runnable on Google Colab with T4 GPU.
> Converted from the original local FastAPI + React project into 4 integrated notebooks.

[![Python](https://img.shields.io/badge/Python-3.10+-blue?logo=python)](https://python.org)
[![scikit-learn](https://img.shields.io/badge/scikit--learn-1.4-F7931E?logo=scikit-learn)](https://scikit-learn.org)
[![LightGBM](https://img.shields.io/badge/LightGBM-deployed-00A65A)](https://lightgbm.readthedocs.io)
[![SHAP](https://img.shields.io/badge/SHAP-0.46-FF6F00?logo=shap)](https://shap.readthedocs.io)
[![XGBoost](https://img.shields.io/badge/XGBoost-GPU-FF6600)](https://xgboost.readthedocs.io)
[![PyTorch](https://img.shields.io/badge/PyTorch-T4_GPU-EE4C2C)](https://pytorch.org)
[![Gradio](https://img.shields.io/badge/Gradio-Dashboard-F97316)](https://gradio.app)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## Overview

**The Sentinel** is a real-time, ML-powered Network Intrusion Detection System that classifies bidirectional network flows against the CICIDS2017 attack taxonomy, explains every prediction with SHAP, and streams alerts to a live dashboard. It is designed with an explicit **"no black box"** principle: every alert carries its top-5 contributing features.

The entire project — from data exploration to model training (T4 GPU) to API backend to dashboard — runs inside **4 Google Colab notebooks**. No local installation required.

### Key Features

- **CICIDS2017-based** — 52 flow-level features, 7 attack classes (Bots, Brute Force, DDoS, DoS, Port Scanning, Web Attacks + Normal Traffic)
- **GPU-accelerated training** — XGBoost (`device='cuda'`) + PyTorch MLP (256-128-64) on T4
- **Optuna hyperparameter tuning** — Bayesian optimization over XGBoost params (20 trials)
- **Explainable AI** — SHAP TreeExplainer: per-alert top-5 + global feature importance + per-class heatmap
- **ROC curves + AUC** — per-class one-vs-rest evaluation
- **GPU benchmark** — CPU vs GPU speed comparison (XGBoost speed-up ×5–10)
- **Live FastAPI backend** — predict, alerts, stats, leaderboard, WebSocket — all inside a notebook
- **Gradio command center** — KPI cards, attack pie, live feed, leaderboard, SHAP explainer, traffic injection
- **Public URL** — Cloudflare tunnel exposes the API; Gradio `.live` URL for the dashboard

---

## Repository Structure

```
nids/
├── nids-backend/
│   ├── data/raw/cicids2017_cleaned.csv   [685 MB]   ← CICIDS2017 dataset (upload to Drive)
│   └── notebooks/colab/                             ← ⭐ Core Colab notebooks
│       ├── 01_EDA_Colab.ipynb                       ← Exploratory Data Analysis
│       ├── 02_Training_GPU_Colab.ipynb               ← Model training on T4
│       ├── 03_Inference_API_Colab.ipynb              ← Inference + FastAPI backend
│       ├── 04_Dashboard_Colab.ipynb                  ← Gradio command-center UI
│       ├── README.md                                ← Colab-specific instructions
│       └── _build/                                  ← Editable percent-format sources
├── docs/                                            ← 8-document specification set
│   ├── NIDS_PRD.md, NIDS_TechSpec.md, NIDS_AppFlow.md, NIDS_Design.md,
│   ├── NIDS_Schema.md, NIDS_ImplementationPlan.md, NIDS_Tracker.md, NIDS_Rules.md
├── .gitignore
└── LICENSE
```

---

## Notebooks

| # | Notebook | What it does | GPU | Est. runtime |
|---|----------|-------------|-----|-------------|
| 1 | `01_EDA_Colab.ipynb` | Load CICIDS2017, class distribution, imbalance, feature correlations, attack-vs-normal comparison, key-numbers table | No | ~10 min |
| 2 | `02_Training_GPU_Colab.ipynb` | Chunked stratified sampling (~400k), cleaning, label encoding, dual scalers, 7-model arena + Optuna tuning + PyTorch MLP, ROC/AUC, normalized CM, SHAP, per-class F1/FPR, summary table | **T4** | ~45–60 min |
| 3 | `03_Inference_API_Colab.ipynb` | Inference stack (severity, SHAP), FlowExtractor (52 features), synthetic attack flows, FastAPI (predict/alerts/stats/leaderboard/WS), CSV replay, public tunnel, SHAP deep dive (global + per-class importance), API summary table | Optional | ~15 min |
| 4 | `04_Dashboard_Colab.ipynb` | Gradio UI: KPIs, attack pie, severity bars, live feed, leaderboard, timeline, SHAP explainer, traffic injection, static dashboard PNGs | Optional | ~10 min |

---

## Quick Start

1. **Upload the dataset** — place `nids-backend/data/raw/cicids2017_cleaned.csv` in Google Drive → `MyDrive/nids_data/`
2. **Open in Colab** — go to [colab.research.google.com](https://colab.research.google.com), upload each notebook
3. **Set runtime to T4 GPU** — for notebook 02, Runtime → Change runtime type → T4 GPU
4. **Run sequentially** — notebooks share artifacts via Drive sync:
   - Notebook 02 → trains model, saves to `MyDrive/nids_artifacts/`
   - Notebook 03 → loads artifacts, runs the API, replays traffic
   - Notebook 04 → loads artifacts, launches Gradio dashboard

---

## Training Pipeline (notebook 02)

```
CICIDS2017 CSV (2.5M rows)
  └─ Chunked stratified sampling → ~400k rows
       └─ Clean: inf→NaN, dropna, drop_duplicates
            └─ LabelEncoder (7 classes) + stratified 80/20 split
                 └─ StandardScaler + RobustScaler (dual comparison)
                      └─ Model Arena — ranked by Macro F1:
                           • Logistic Regression (CPU)
                           • Decision Tree (CPU)
                           • Random Forest (CPU)
                           • XGBoost (T4 GPU)
                           • LightGBM (CPU)
                           • PyTorch MLP 256-128-64 (T4 GPU)
                           • XGBoost Optuna-tuned (T4 GPU)
                      └─ ROC curves + AUC (per class)
                      └─ Normalized confusion matrix
                      └─ Per-class F1 + False-Positive Rate (benign)
                      └─ SHAP TreeExplainer smoke test
                      └─ GPU benchmark table
```

**Best model (by Macro F1)** → saved as `model.pkl` (sklearn-compatible). If the PyTorch MLP wins, the best tree-family model is deployed instead (sklearn/SHAP compatibility). The tuned model is exported alongside.

---

## Inference & API (notebook 03)

The notebook rebuilds the entire backend stack:

| Component | Repo equivalent | Notebook implementation |
|-----------|----------------|----------------------|
| Inference | `src/model/predict.py` | Cached artifacts, severity map, SHAP TreeExplainer, `predict_flow()` |
| Feature extraction | `src/features/extractor.py` | `FlowExtractor` class (52 CICIDS features) |
| Synthetic flows | `src/simulation/*` | In-memory DDoS / brute-force / port-scan / normal packet dicts |
| FastAPI server | `src/api/main.py` + routes | `/health`, `/api/predict`, `/api/alerts`, `/api/stats`, `/api/ip-leaderboard`, `/ws/live` |
| Validation | `routes/predict.py` | Same strict contract: ≤8 missing → 0.0, non-finite/negative → 422, IP validation |
| Dataset replay | `send_attacks.py` | Balanced CSV sampling → POST via API |
| Public URL | — | Cloudflare quick tunnel (ngrok alternative documented) |
| Chatbot | `routes/chatbot.py` | Gemini REST API, grounded in alert data (optional) |

---

## Dashboard (notebook 04)

The repo's React frontend is replaced by a **Gradio** command center (same API, identical data):

| Tab | Contents | React page equivalent |
|-----|----------|----------------------|
| 📊 Dashboard | KPI strip, attack pie, severity bars, live alert feed (auto-refresh 3 s) | `/` + `/alerts` |
| 🕵 Threat intel | Attacker leaderboard, attack timeline (last 500 alerts) | `/reports` + `/network` |
| 🧠 Explain | Dropdown → SHAP top-5 bar plot per alert | `/explain` |
| 🧪 Traffic lab | Replay CSV flows through the API with configurable per-class count | `send_attacks.py` |

---

## What was removed from the original repo

The original project shipped a FastAPI backend (`src/`), a React frontend (`nids-frontend/`), attack simulators, unit tests, and a Python venv. For Colab-only deployment, these are not needed:

| Component | Why removed |
|-----------|------------|
| `nids-backend/src/` | All code is embedded in the Colab notebooks |
| `nids-frontend/` | React cannot run on Colab; replaced by Gradio dashboard |
| `venv/` (1.1 GB) | Colab uses its own runtime |
| `model.pkl` + scalers | Notebook 02 trains fresh artifacts |
| `nids.db` | Colab creates its own SQLite database |
| Tests, scripts, docs | Refer to the notebooks for the canonical implementation |

---

## Documentation

The repository ships an 8-document set in `docs/`:

| Document | Scope |
|----------|-------|
| [NIDS_PRD.md](docs/NIDS_PRD.md) | Product requirements, scope, functional & non-functional requirements |
| [NIDS_TechSpec.md](docs/NIDS_TechSpec.md) | Technical specification, architecture, components |
| [NIDS_AppFlow.md](docs/NIDS_AppFlow.md) | Application flows (Colab edition) |
| [NIDS_Design.md](docs/NIDS_Design.md) | UI/UX design specification |
| [NIDS_Schema.md](docs/NIDS_Schema.md) | Database schema, artifacts, data dictionary |
| [NIDS_ImplementationPlan.md](docs/NIDS_ImplementationPlan.md) | Build plan (original + Colab phases) |
| [NIDS_Tracker.md](docs/NIDS_Tracker.md) | Task tracker with status rollup |
| [NIDS_Rules.md](docs/NIDS_Rules.md) | Development rules & standards |

---

## License

Distributed under the [MIT License](LICENSE). Copyright © 2026 Abhinav.

## Acknowledgements

- **[CICIDS2017](https://www.unb.ca/cic/datasets/ids-2017.html)** — Canadian Institute for Cybersecurity benchmark dataset
- **[LightGBM](https://lightgbm.readthedocs.io)** — deployed classifier family
- **[SHAP](https://shap.readthedocs.io)** — model explanations
- **[scikit-learn](https://scikit-learn.org)** — training, scaling, evaluation
- **[XGBoost](https://xgboost.readthedocs.io)** — GPU-accelerated training
- **[PyTorch](https://pytorch.org)** — T4 GPU neural network
- **[Optuna](https://optuna.org)** — hyperparameter optimization
- **[FastAPI](https://fastapi.tiangolo.com)** — API + WebSocket (embedded)
- **[Gradio](https://gradio.app)** — command-center dashboard
- **[Google Colab](https://colab.research.google.com)** — T4 GPU runtime