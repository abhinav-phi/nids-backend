# %% [markdown]
# ## 🧠 Step 2 — Inference stack (port of `src/model/predict.py`)
#
# This cell embeds the exact production inference contract:
# - `CICIDS_FEATURES` — the 52-feature list from `src/features/extractor.py`
# - `SEVERITY_MAP` / `get_severity()` / `is_benign()` — from `src/model/predict.py`
# - `BENIGN_LABELS` — from `src/api/constants.py`
# - artifact loading with the `n_features_in_` parity guard
# - cached SHAP `TreeExplainer` (created once, not per request)

# %%
import joblib
import numpy as np
import pandas as pd

# ── src/api/constants.py ─────────────────────────────────────────────────
BENIGN_LABELS = ("Normal Traffic", "BENIGN")

# ── src/features/extractor.py::CICIDS_FEATURES (order = model contract) ──
CICIDS_FEATURES = [
    'Destination Port',
    'Flow Duration',
    'Total Fwd Packets',
    'Total Length of Fwd Packets',
    'Fwd Packet Length Max',
    'Fwd Packet Length Min',
    'Fwd Packet Length Mean',
    'Fwd Packet Length Std',
    'Bwd Packet Length Max',
    'Bwd Packet Length Min',
    'Bwd Packet Length Mean',
    'Bwd Packet Length Std',
    'Flow Bytes/s',
    'Flow Packets/s',
    'Flow IAT Mean',
    'Flow IAT Std',
    'Flow IAT Max',
    'Flow IAT Min',
    'Fwd IAT Total',
    'Fwd IAT Mean',
    'Fwd IAT Std',
    'Fwd IAT Max',
    'Fwd IAT Min',
    'Bwd IAT Total',
    'Bwd IAT Mean',
    'Bwd IAT Std',
    'Bwd IAT Max',
    'Bwd IAT Min',
    'Fwd Header Length',
    'Bwd Header Length',
    'Fwd Packets/s',
    'Bwd Packets/s',
    'Min Packet Length',
    'Max Packet Length',
    'Packet Length Mean',
    'Packet Length Std',
    'Packet Length Variance',
    'FIN Flag Count',
    'PSH Flag Count',
    'ACK Flag Count',
    'Average Packet Size',
    'Subflow Fwd Bytes',
    'Init_Win_bytes_forward',
    'Init_Win_bytes_backward',
    'act_data_pkt_fwd',
    'min_seg_size_forward',
    'Active Mean',
    'Active Max',
    'Active Min',
    'Idle Mean',
    'Idle Max',
    'Idle Min',
]

# ── src/model/predict.py::SEVERITY_MAP (21 keys) ─────────────────────────
SEVERITY_MAP = {
    "benign":             "NONE",
    "normal traffic":     "NONE",
    "normal":             "NONE",
    "ddos":               "CRITICAL",
    "dos":                "CRITICAL",
    "dos hulk":           "CRITICAL",
    "dos goldeneye":      "CRITICAL",
    "dos slowloris":      "CRITICAL",
    "dos slowhttptest":   "CRITICAL",
    "heartbleed":         "CRITICAL",
    "bot":                "HIGH",
    "ftp-patator":        "HIGH",
    "ssh-patator":        "HIGH",
    "infiltration":       "HIGH",
    "port scanning":      "MEDIUM",
    "portscan":           "MEDIUM",
    "web attack":         "MEDIUM",
    "web attack – brute force": "MEDIUM",
    "web attack – xss":   "MEDIUM",
    "web attack – sql injection": "MEDIUM",
    "brute force":        "LOW",
}

def get_severity(prediction: str) -> str:
    key = prediction.strip().lower()
    for pattern, sev in SEVERITY_MAP.items():
        if pattern in key:
            return sev
    return "LOW"

def is_benign(prediction: str) -> bool:
    """The model's benign class is 'Normal Traffic' (not 'BENIGN') — this
    helper covers both spellings so stats/broadcast never misclassify."""
    key = prediction.strip().lower()
    return any(label in key for label in ("normal traffic", "benign", "normal"))

# ── Artifact loading with the production parity guard ────────────────────
_model   = None
_scaler  = None
_encoder = None
_explainer = None
_model_loaded = False

def load_artifacts(art_dir: Path):
    """Load model/scaler/encoder and cache a SHAP TreeExplainer.
    Raises if the artifact widths don't match the 52-feature contract —
    silently-corrupted inference is refused (same as production)."""
    global _model, _scaler, _encoder, _explainer, _model_loaded
    _model   = joblib.load(art_dir / "model.pkl")
    _scaler  = joblib.load(art_dir / "scaler.pkl")
    _encoder = joblib.load(art_dir / "label_encoder.pkl")

    n_model  = int(getattr(_model, "n_features_in_", 0))
    n_scaler = int(getattr(_scaler, "n_features_in_", 0)) if hasattr(_scaler, "n_features_in_") else 0
    expected = len(CICIDS_FEATURES)
    if n_model not in (0, expected) or n_scaler not in (0, expected):
        raise RuntimeError(
            f"Artifact/feature mismatch: model expects {n_model}, scaler expects "
            f"{n_scaler}, contract provides {expected}. Refusing to serve."
        )
    try:
        import shap
        _explainer = shap.TreeExplainer(_model)
        print("SHAP TreeExplainer cached.")
    except Exception as e:
        print(f"SHAP explainer init failed (will skip SHAP): {e}")
        _explainer = None
    _model_loaded = True
    print(f"Model loaded: {type(_model).__name__}")
    print(f"Classes     : {list(_encoder.classes_)}")

load_artifacts(ART_DIR)

def predict_flow(features: dict, feature_names: list | None = None) -> dict:
    """Run inference on one flow's 52-feature dict.
    Returns: prediction, confidence, severity, shap_top5 (top-5 for attacks)."""
    if not _model_loaded:
        raise RuntimeError("Model not loaded.")
    names = list(features.keys())
    expected_len = int(getattr(_model, "n_features_in_", len(CICIDS_FEATURES)))
    if len(names) != expected_len:
        raise ValueError(
            f"Feature vector has {len(names)} keys; model expects {expected_len}."
        )
    values = np.array(list(features.values()), dtype=np.float64).reshape(1, -1)
    if not np.isfinite(values).all():
        raise ValueError("Non-finite feature values.")

    values_scaled = _scaler.transform(values)
    pred_index    = int(_model.predict(values_scaled)[0])
    probabilities = _model.predict_proba(values_scaled)[0]
    confidence    = float(probabilities[pred_index])
    prediction    = _encoder.inverse_transform([pred_index])[0]
    severity      = get_severity(prediction)

    shap_top5 = []
    if _explainer is not None and not is_benign(prediction):
        try:
            shap_values = _explainer.shap_values(values_scaled)
            use_names = feature_names or names
            if isinstance(shap_values, list):
                sv = np.array(shap_values[pred_index]).flatten()
            elif hasattr(shap_values, "ndim"):
                if shap_values.ndim == 3:
                    sv = shap_values[0, :, pred_index]
                else:
                    sv = shap_values[0]
            else:
                sv = np.array(shap_values).flatten()
            pairs = sorted(zip(use_names, sv.tolist()),
                           key=lambda x: abs(float(x[1])), reverse=True)[:5]
            shap_top5 = [{"feature": n, "value": round(float(v), 4)} for n, v in pairs]
        except Exception as e:
            print(f"SHAP inference failed: {e}")

    return {
        "prediction": prediction,
        "confidence": round(confidence, 4),
        "severity":   severity,
        "shap_top5":  shap_top5,
    }

print("Inference stack ready ✔")
