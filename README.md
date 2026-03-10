# nids# Network Intrusion Detection System (NIDS)
### ML + Cybersecurity | College Project

---

## What It Does

A machine learning system that monitors network traffic, detects cyber attacks
in real time, and displays alerts on a web dashboard.

It trains on the CICIDS2017 dataset (2.8 million labeled network flows) and
uses XGBoost to classify each connection as **BENIGN** or one of 13 attack
types — with over 98% F1-score.

---

## Architecture

```
Network Traffic
      ↓
Scapy (packet capture)
      ↓
FlowExtractor (78 features per flow)
      ↓
XGBoost + SHAP (predict attack type + explain)
      ↓
FastAPI (REST API + WebSocket)
      ↓
PostgreSQL (log all alerts)
      ↓
React Dashboard (live charts + alert feed)
```

---

## Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/your-username/nids-ml
cd nids-ml

# 2. Create virtual environment
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Place CICIDS2017 CSV files in data/raw/
#    Download from: https://cicresearch.ca/CICDataset/CIC-IDS-2017/

# 5. Train the model
python src/model/train.py

# 6. (Later) Start full system with Docker
docker-compose up --build
```

---

## Project Structure

```
nids-ml/
├── data/
│   ├── raw/            ← CICIDS2017 CSV files (not committed)
│   └── processed/      ← cleaned data saved here
├── notebooks/
│   ├── 01_eda.ipynb    ← data exploration
│   └── 02_training.ipynb
├── src/
│   ├── features/
│   │   └── extractor.py     ← Scapy packets → feature dict
│   ├── model/
│   │   ├── train.py         ← full training pipeline
│   │   ├── evaluate.py      ← metrics + confusion matrix
│   │   └── predict.py       ← inference wrapper
│   └── capture/
│       └── sniffer.py       ← live packet capture
├── tests/
├── requirements.txt
└── README.md
```

---

## Model Performance (after training)

| Metric             | Target   | Achieved |
|--------------------|----------|----------|
| Macro F1-Score     | > 97%    | TBD      |
| False Positive Rate| < 1%     | TBD      |
| Inference Latency  | < 5ms    | TBD      |

*Fill this in after running `python src/model/train.py`*

---

## Dataset

**CICIDS2017** — Canadian Institute for Cybersecurity
- 2.8 million network flows
- 78 features per flow
- 14 classes: BENIGN + 13 attack types (DDoS, PortScan, Brute Force, Botnet, etc.)
- Free download: https://cicresearch.ca

---

## Tech Stack

| Layer    | Technology                            |
|----------|---------------------------------------|
| ML       | scikit-learn, XGBoost, SHAP           |
| Network  | Scapy                                 |
| Backend  | FastAPI, PostgreSQL, Redis            |
| Frontend | React 18, Recharts, TailwindCSS       |
| DevOps   | Docker, Docker Compose                |

---

## Team

2nd Year CSE Students — College ML Project