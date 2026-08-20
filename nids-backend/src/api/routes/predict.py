"""
routes/predict.py — POST /api/predict (PRODUCTION)
====================================================
Accepts feature vectors with CICIDS2017 column names directly from
the FlowExtractor/sniffer pipeline or from manual API calls.
After running inference:
  1. Saves result to database
  2. Broadcasts attack alerts via WebSocket to all connected dashboards
"""
import json
import logging
import math
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from src.api.database import get_db
from src.api.models import Alert
from src.api.schemas import PredictResponse, SHAPItem
from src.features.extractor import CICIDS_FEATURES
from src.model.predict import is_benign
log = logging.getLogger(__name__)
router = APIRouter()
_predict_fn = None
def _get_predict():
    global _predict_fn
    if _predict_fn is None:
        try:
            from src.model.predict import predict
            _predict_fn = predict
        except Exception as e:
            log.warning(f"Could not load model: {e}")
    return _predict_fn
# Single source of truth: the extractor defines the exact 52 CICIDS2017
# names AND their order. Inference correctness depends on dict order ==
# trained column order, so the route must never maintain its own copy.
EXPECTED_FEATURES = list(CICIDS_FEATURES)
MAX_INVALID_FEATURES = 8
MAX_ABS_FEATURE_VALUE = 1e15
def _validate_features(raw: dict):
    """
    Classify each expected feature:
      - valid   : present, numeric, finite, within sane bounds
      - missing : key absent (coerced to 0.0, allowed in small numbers)
      - invalid : non-numeric, non-finite, negative, or absurd magnitude
    Returns (features, missing_count, invalid_names).
    Every CICIDS2017 statistic is non-negative by construction, so
    negatives are treated as malformed rather than silently coerced.
    """
    features = {}
    missing = 0
    invalid = []
    for feat_name in EXPECTED_FEATURES:
        if feat_name not in raw:
            features[feat_name] = 0.0
            missing += 1
            continue
        try:
            value = float(raw[feat_name])
        except (ValueError, TypeError):
            invalid.append(feat_name)
            features[feat_name] = 0.0
            continue
        if (not math.isfinite(value)
                or value < 0
                or abs(value) > MAX_ABS_FEATURE_VALUE):
            invalid.append(feat_name)
            features[feat_name] = 0.0
            continue
        features[feat_name] = value
    return features, missing, invalid
def _coerce_port(value) -> int:
    """Ports must be integers in [0, 65535]; anything else clamps to 0."""
    try:
        port = int(float(value))
    except (ValueError, TypeError):
        return 0
    if not 0 <= port <= 65535:
        return 0
    return port  
@router.post("/predict", response_model=PredictResponse)
async def predict_flow(
    request_obj: Request,
    db: Session = Depends(get_db),
):
    """
    Accept a feature vector and run ML inference.
    The request body is a flat JSON dict. It can contain:
    - CICIDS2017 feature names (e.g. 'Flow Duration', 'Flow Bytes/s')
    - Metadata keys prefixed with '_' (e.g. '_source_ip', '_dst_port')
    Metadata keys are stripped before inference; only the 52 model features
    are passed to the predict function.
    """
    predict_fn = _get_predict()
    if predict_fn is None:
        raise HTTPException(status_code=503, detail="ML model not loaded.")
    try:
        raw = await request_obj.json()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid JSON: {e}")
    source_ip      = str(raw.get("_source_ip", "")).strip() or "unknown"
    destination_ip = str(raw.get("_destination_ip", "")).strip() or "unknown"
    src_port       = _coerce_port(raw.get("_src_port", 0))
    dst_port       = _coerce_port(raw.get("_dst_port", 0))
    features, missing_count, invalid_names = _validate_features(raw)
    if missing_count == len(EXPECTED_FEATURES):
        raise HTTPException(
            status_code=400,
            detail="Invalid request: none of the 52 CICIDS2017 features were provided.",
        )
    if invalid_names:
        log.warning(
            f"Rejecting prediction: {len(invalid_names)} malformed features "
            f"(non-numeric, non-finite, negative, or >1e15): {invalid_names[:10]}"
        )
        raise HTTPException(
            status_code=422,
            detail={
                "message": "Feature values must be finite, non-negative numbers "
                           "within sane bounds. No silent coercion is applied.",
                "invalid_features": invalid_names[:20],
            },
        )
    if missing_count > MAX_INVALID_FEATURES:
        raise HTTPException(
            status_code=422,
            detail={
                "message": (
                    f"{missing_count} of {len(EXPECTED_FEATURES)} features are "
                    f"missing (max tolerated: {MAX_INVALID_FEATURES}). "
                    "Provide a complete CICIDS2017 feature vector."
                ),
                "missing": missing_count,
            },
        )
    if missing_count > 0:
        log.debug(f"Feature vector has {missing_count}/52 missing features (defaulted to 0)")
    try:
        result = predict_fn(features, feature_names=EXPECTED_FEATURES)
    except Exception as e:
        log.error(f"Inference error: {e}")
        raise HTTPException(status_code=500, detail=f"Inference failed: {str(e)}")
    prediction = result["prediction"]
    confidence = result["confidence"]
    severity   = result["severity"]
    shap_top5  = result.get("shap_top5", [])
    alert = Alert(
        timestamp      = datetime.utcnow(),
        source_ip      = source_ip,
        destination_ip = destination_ip,
        src_port       = src_port,
        dst_port       = dst_port,
        prediction     = prediction,
        confidence     = confidence,
        severity       = severity,
        shap_json      = json.dumps(shap_top5),
    )
    db.add(alert)
    db.commit()
    db.refresh(alert)
    if not is_benign(prediction):
        try:
            ws_manager = request_obj.app.state.ws_manager
            await ws_manager.broadcast({
                "id":          alert.id,
                "timestamp":   alert.timestamp.isoformat(),
                "src_ip":      source_ip,
                "source_ip":   source_ip,
                "attack_type": prediction,
                "prediction":  prediction,
                "severity":    severity,
                "confidence":  confidence,
                "shap_top5":   shap_top5,
            })
        except Exception as e:
            log.warning(f"WS broadcast failed: {e}")
        log.warning(
            f"[{severity}] {source_ip} → {destination_ip}  "
            f"{prediction}  ({confidence*100:.1f}%)"
        )
    return PredictResponse(
        alert_id   = alert.id,
        prediction = prediction,
        confidence = confidence,
        severity   = severity,
        source_ip  = source_ip,
        shap_top5  = [SHAPItem(**s) for s in shap_top5],
        timestamp  = alert.timestamp.isoformat(),
    )
