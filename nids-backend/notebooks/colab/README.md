# The Sentinel NIDS — Google Colab Edition

Run the entire NIDS project on **Google Colab with a T4 GPU** — from raw
CICIDS2017 data to a live intrusion-detection dashboard — without installing
anything locally.

## Notebooks (run in order)

| # | Notebook | Ports | Runtime | GPU needed |
|---|---|---|---|---|
| 1 | `01_EDA_Colab.ipynb` | `notebooks/01_eda.ipynb` | ~10 min | No |
| 2 | `02_Training_GPU_Colab.ipynb` | `src/model/train.py` | ~45–60 min | **Yes — T4** |
| 3 | `03_Inference_API_Colab.ipynb` | `src/model/predict.py`, `src/features/extractor.py`, `src/api/*`, `send_attacks.py` | ~15 min | Optional |
| 4 | `04_Dashboard_Colab.ipynb` | `nids-frontend/` (React app → Gradio UI) + embedded API | ~10 min | Optional |

Upload any of them to [colab.research.google.com](https://colab.research.google.com)
(File → Upload notebook) and run top-to-bottom. Notebook 02 already carries the
`accelerator: GPU / T4` metadata — Colab will offer to switch the runtime for you.

## One-time setup: the dataset

The training data is the cleaned CICIDS2017 export
(`nids-backend/data/raw/cicids2017_cleaned.csv`, 685 MB, 2,520,751 rows,
52 features + `Attack Type` → 7 classes).

1. Upload that CSV to **Google Drive → `MyDrive/nids_data/`**.
2. Every notebook mounts Drive and finds it there automatically.

> Alternative: drag the CSV into the Colab file browser (`/content/`) — works,
> but re-uploads every session. A Kaggle CICIDS2017-cleaned export also works
> **only if** it has the same 52-feature + `Attack Type` schema.

## How artifacts flow

```
02 Training  ──►  /content/nids_artifacts/  ──►  synced to MyDrive/nids_artifacts/
                  model.pkl · scaler.pkl · robust_scaler.pkl
                  label_encoder.pkl · feature_names.json · manifest.json
                  model_torch.pt · comparison/confusion PNGs
                        │
        03 Inference/API ◄┤   (also accepts nids_artifacts.zip in /content/)
        04 Dashboard     ◄┘
```

Artifacts keep the **production contract** (`model.pkl` = sklearn-compatible
estimator with 52 features, `scaler.pkl` = StandardScaler, manifest mirrors
`src/model/predict.py::_write_manifest`), so anything trained here can be
dropped into `nids-backend/` and served by the local FastAPI app unchanged.

## What each notebook demonstrates

- **01 EDA** — class distribution & imbalance, data quality, feature
  distributions, correlations, attack-vs-normal behaviour, plus a
  **key-numbers summary table** (rows/features/classes/benign share/duplicates)
  for the report. Fixes the repo notebook's `Label column: None` bug (searches
  `Attack Type`, not `label`).
- **02 Training (T4)** — chunked stratified sampling (~400k rows), cleaning,
  label encoding, stratified split, dual scalers, and a 7-model arena ranked by
  Macro F1. **GPU is used three times**: XGBoost (`device='cuda'`, with a live
  CPU-vs-GPU timing bake-off), a PyTorch MLP (256-128-64, class-weighted loss,
  early stopping) replacing sklearn's CPU-bound `MLPClassifier`, and **Optuna
  Bayesian hyper-parameter tuning of XGBoost on the T4**. Deep evaluation adds
  **per-class ROC curves + AUC**, a **normalised confusion matrix**, per-class
  F1 and the benign **FPR** (benign index looked up from the encoder — fixes
  the repo's ISSUE-06), a **T4 GPU benchmark table**, and a final
  **training-summary table** ready to copy into a report.
- **03 Inference + API** — full port of the backend: severity map, cached SHAP
  `TreeExplainer`, the 52-feature `FlowExtractor`, synthetic DDoS / brute-force
  / port-scan / normal flows, a **SHAP deep dive** (global top-15 importance +
  per-class feature importance, saved as PNGs), the FastAPI app (predict,
  alerts, stats, leaderboard, WebSocket) with production validation guards, CSV
  replay, an **API-contract summary table**, a public **Cloudflare tunnel URL**
  (open `/docs` from your laptop; ngrok alternative documented), and the
  grounded Gemini mini-chatbot.
- **04 Dashboard** — Gradio command center over the same API: KPI strip,
  attack pie, severity bars, live alert feed, attacker leaderboard, attack
  timeline, per-alert SHAP explainer, a traffic-injection lab, and a
  **static dashboard-preview PNG exporter** for the report. Public
  `*.gradio.live` URL included.

## What deliberately does NOT run on Colab

| Feature | Why |
|---|---|
| `src/capture/sniffer.py` (live packet capture) | Colab VMs have no raw-socket access to your NIC/Npcap |
| `src/simulation/sim_*.py` (real packet attack generators) | need a real interface + target host; replaced by in-memory packet dicts (notebook 03) and CSV replay |
| React dev server (`npm run dev`) | a Node/Vite server inside Colab adds no value; the dashboard is rebuilt with Gradio over the same API. To use the real React app, expose the Colab API via the notebook-03 tunnel and point `src/api/client.ts` `baseURL` at it |

Everything else — extraction, inference, SHAP, severity, persistence,
broadcast, validation guards — runs identically to the repo.

## Regenerating / editing the notebooks

The `.ipynb` files are built from readable percent-format sources in
`_build/` (`01_EDA.py`, `02_Training_GPU.py`, `03_Inference_API.py`,
`04_Dashboard.py` + shared `frag_*.py` fragments). Edit a source and rebuild:

```bash
cd _build
python pack.py        # rewrites the four .ipynb files (validates syntax + nbformat)
```

## Back to the local project

After training on Colab, download `nids_artifacts.zip` from notebook 02, unzip
into `nids-backend/` (it overwrites `model.pkl`, `scaler.pkl`,
`label_encoder.pkl`, `manifest.json`), then:

```bash
cd nids-backend && uvicorn src.api.main:app --port 8000
cd nids-frontend && npm run dev
```
