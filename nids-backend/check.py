"""check.py — Artifact sanity check + manifest generation.

Verifies that the deployed ML artifacts are mutually consistent and
writes manifest.json next to model.pkl as a machine-readable record
(ML governance audit item TMG-04).
"""
import json
import sys
from pathlib import Path

from src.features.extractor import CICIDS_FEATURES


def main():
    ROOT = Path(__file__).resolve().parent
    errors = []

    model_path   = ROOT / "model.pkl"
    scaler_path  = ROOT / "scaler.pkl"
    encoder_path = ROOT / "label_encoder.pkl"

    for path, label in [(model_path, "model"), (scaler_path, "scaler"), (encoder_path, "encoder")]:
        if not path.exists():
            errors.append(f"{label}.pkl missing: {path}")

    if errors:
        for e in errors:
            print(f"[FAIL] {e}")
        print("Run src/model/train.py first.")
        sys.exit(1)

    import joblib

    model   = joblib.load(model_path)
    scaler  = joblib.load(scaler_path)
    encoder = joblib.load(encoder_path)

    n_model   = int(getattr(model, "n_features_in_", 0))
    n_scaler  = int(getattr(scaler, "n_features_in_", 0))
    n_feats   = len(CICIDS_FEATURES)

    print(f"Scaler expects:      {n_scaler} features")
    print(f"Model expects:       {n_model} features")
    print(f"Extractor provides:  {n_feats} features (CICIDS_FEATURES)")
    print(f"Encoder classes ({len(encoder.classes_)}): {list(encoder.classes_)}")
    print(f"Model type:          {type(model).__name__}")

    ok = True
    if n_model not in (0, n_feats):
        print(f"[FAIL] model n_features_in_ ({n_model}) != extractor feature count ({n_feats})")
        ok = False
    if n_scaler not in (0, n_feats):
        print(f"[FAIL] scaler n_features_in_ ({n_scaler}) != extractor feature count ({n_feats})")
        ok = False

    manifest = {
        "model_type":        type(model).__name__,
        "feature_count":     n_model or n_feats,
        "classes":           list(encoder.classes_),
        "feature_source":    "CICIDS_FEATURES (src/features/extractor.py)",
        "checks_ok":         ok,
        "generated_by":      "check.py",
    }
    (ROOT / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"\nmanifest.json written (checks_ok={ok})")

    if not ok:
        sys.exit(1)


if __name__ == "__main__":
    main()