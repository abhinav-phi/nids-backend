"""
constants.py — Shared domain constants (single source of truth)
================================================================
The model was trained on a consolidated 7-class CICIDS2017 label set.
The benign class produced by the LabelEncoder is "Normal Traffic".
Historically the code compared against the string "BENIGN" everywhere,
which NEVER matched the real output — inflating all attack statistics.

Any benign/attack classification in API, WS, sniffer, or ML code MUST
use these constants (and the is_benign() helper in src.model.predict).
"""

BENIGN_LABELS = ("Normal Traffic", "BENIGN")