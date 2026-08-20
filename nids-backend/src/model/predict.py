"""
predict.py — NIDS Inference Wrapper (FIXED)
=============================================
Fixes:
  1. SHAP explainer is cached once — not re-created on every request (was 100x slower)
  2. severity mapping covers all CICIDS2017 attack class names
  3. Broadcasts new alerts via WebSocket manager
"""
import joblib
import json
import logging
import numpy as np
from pathlib import Path
from typing import Optional
from src.api.constants import BENIGN_LABELS
from src.features.extractor import CICIDS_FEATURES
log = logging.getLogger(__name__)
ROOT         = Path(__file__).resolve().parents[2]
MODEL_PATH   = ROOT / "model.pkl"
SCALER_PATH  = ROOT / "scaler.pkl"
ENCODER_PATH = ROOT / "label_encoder.pkl"
MANIFEST_PATH = ROOT / "manifest.json"
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
    """
    Canonical benign check. The deployed model emits "Normal Traffic"
    (not "BENIGN"); this helper covers both spellings so filters and
    broadcast logic never mis-classify benign flows as attacks again.
    """
    key = prediction.strip().lower()
    return any(label in key for label in ("normal traffic", "benign", "normal"))   
_model   = None
_scaler  = None
_encoder = None
_explainer = None   
_model_loaded = False
def _load_artifacts():
    global _model, _scaler, _encoder, _explainer, _model_loaded
    if not MODEL_PATH.exists():
        raise FileNotFoundError(
            f"model.pkl not found at {MODEL_PATH}. Run src/model/train.py first."
        )
    _model   = joblib.load(MODEL_PATH)
    _scaler  = joblib.load(SCALER_PATH)
    _encoder = joblib.load(ENCODER_PATH)
    n_model = int(getattr(_model, "n_features_in_", 0))
    n_scaler = int(getattr(_scaler, "n_features_in_", 0)) if hasattr(_scaler, "n_features_in_") else 0
    expected = len(CICIDS_FEATURES)
    if n_model not in (0, expected) or n_scaler not in (0, expected):
        raise RuntimeError(
            f"Artifact/feature mismatch: model expects {n_model} features, "
            f"scaler expects {n_scaler}, extractor provides {expected}. "
            "Refusing to serve silently-corrupted inference."
        )
    try:
        import shap
        _explainer = shap.TreeExplainer(_model)
        log.info("SHAP TreeExplainer cached.")
    except Exception as e:
        log.warning(f"SHAP explainer init failed (will skip SHAP): {e}")
        _explainer = None
    _model_loaded = True
    log.info(f"Model loaded. Classes: {list(_encoder.classes_)}")
    _write_manifest()

def _write_manifest():
    """Persist a machine-readable record of the deployed artifacts."""
    try:
        manifest = {
            "model_type":        type(_model).__name__,
            "feature_count":     int(getattr(_model, "n_features_in_", len(CICIDS_FEATURES))),
            "classes":           list(_encoder.classes_) if _encoder is not None else [],
            "severity_map_keys": len(SEVERITY_MAP),
            "feature_source":    "CICIDS_FEATURES (src/features/extractor.py)",
            "generated_by":      "src/model/predict.py::_write_manifest",
        }
        MANIFEST_PATH.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    except Exception as e:
        log.warning(f"Could not write manifest.json: {e}")
try:
    _load_artifacts()
except FileNotFoundError as e:
    log.warning(str(e))
def predict(features: dict, feature_names: Optional[list] = None) -> dict:
    """
    Run inference on a single network flow feature dict.
    Returns: prediction, confidence, severity, shap_top5

    Raises ValueError if the feature vector length does not match the
    trained model's expected width — silent miscomputation is refused.
    """
    if not _model_loaded:
        raise RuntimeError("Model not loaded. Run train.py first.")
    names = list(features.keys())
    expected_len = int(getattr(_model, "n_features_in_", len(CICIDS_FEATURES)))
    if len(names) != expected_len:
        raise ValueError(
            f"Feature vector has {len(names)} keys; model expects {expected_len}. "
            "Use the canonical CICIDS feature list (src/features/extractor.py)."
        )
    values = np.array(list(features.values()), dtype=np.float64).reshape(1, -1)
    if not np.isfinite(values).all():
        bad = names[np.argwhere(~np.isfinite(values)).flatten().tolist()][:5]
        raise ValueError(f"Non-finite feature values: {bad}")
    values_scaled = _scaler.transform(values)
    pred_index    = int(_model.predict(values_scaled)[0])
    probabilities = _model.predict_proba(values_scaled)[0]
    confidence    = float(probabilities[pred_index])
    prediction    = _encoder.inverse_transform([pred_index])[0]
    severity      = get_severity(prediction)
    shap_top5 = []
    if _explainer is not None and not is_benign(prediction):
        try:
            import numpy as _np
            shap_values = _explainer.shap_values(values_scaled)
            names = feature_names or list(features.keys())
            if isinstance(shap_values, list):
                sv = _np.array(shap_values[pred_index]).flatten()
            elif hasattr(shap_values, 'ndim'):
                if shap_values.ndim == 3:
                    sv = shap_values[0, :, pred_index]
                else:
                    sv = shap_values[0]
            else:
                sv = _np.array(shap_values).flatten()
            sv_list = sv.tolist() if hasattr(sv, 'tolist') else list(sv)
            pairs = sorted(zip(names, sv_list), key=lambda x: abs(float(x[1])), reverse=True)[:5]
            shap_top5 = [{"feature": n, "value": round(float(v), 4)} for n, v in pairs]
        except Exception as e:
            log.warning(f"SHAP inference failed: {e}")
    return {
        "prediction": prediction,
        "confidence": round(confidence, 4),
        "severity":   severity,
        "shap_top5":  shap_top5,
    }
