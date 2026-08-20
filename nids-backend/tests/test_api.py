"""
test_api.py — API endpoint tests
Run with:  pytest tests/test_api.py -v
Uses FastAPI's TestClient so no real server needs to be running.
Uses SQLite in-memory DB so no PostgreSQL is needed.
"""
import sys
import os
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ["DATABASE_URL"] = "sqlite:///./test_nids.db"
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from src.api.database import Base, get_db
from src.api.models import Alert
from src.api.main import app
from src.features.extractor import CICIDS_FEATURES
from src.model.predict import get_severity, is_benign
TEST_DB_URL = "sqlite:///./test_nids.db"
test_engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
TestSession  = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)
Base.metadata.create_all(bind=test_engine)
def override_get_db():
    db = TestSession()
    try:
        yield db
    finally:
        db.close()
app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)
SAMPLE_FEATURES = {
    "Destination Port":            80.0,
    "Flow Duration":               1234567.0,
    "Total Fwd Packets":           8.0,
    "Total Length of Fwd Packets": 3456.0,
    "Fwd Packet Length Max":       1460.0,
    "Fwd Packet Length Min":       52.0,
    "Fwd Packet Length Mean":      432.0,
    "Fwd Packet Length Std":       280.0,
    "Bwd Packet Length Max":       800.0,
    "Bwd Packet Length Min":       52.0,
    "Bwd Packet Length Mean":      200.0,
    "Bwd Packet Length Std":       150.0,
    "Flow Bytes/s":                3800.0,
    "Flow Packets/s":              11.4,
    "Flow IAT Mean":               50000.0,
    "Flow IAT Std":                30000.0,
    "Flow IAT Max":                200000.0,
    "Flow IAT Min":                1000.0,
    "Fwd IAT Total":               400000.0,
    "Fwd IAT Mean":                50000.0,
    "Fwd IAT Std":                 30000.0,
    "Fwd IAT Max":                 200000.0,
    "Fwd IAT Min":                 1000.0,
    "Bwd IAT Total":               140000.0,
    "Bwd IAT Mean":                35000.0,
    "Bwd IAT Std":                 20000.0,
    "Bwd IAT Max":                 150000.0,
    "Bwd IAT Min":                 2000.0,
    "Fwd Header Length":           208.0,
    "Bwd Header Length":           208.0,
    "Fwd Packets/s":               6.5,
    "Bwd Packets/s":               4.9,
    "Min Packet Length":           52.0,
    "Max Packet Length":           1460.0,
    "Packet Length Mean":          388.5,
    "Packet Length Std":           220.0,
    "Packet Length Variance":      48400.0,
    "FIN Flag Count":              1.0,
    "PSH Flag Count":              2.0,
    "ACK Flag Count":              6.0,
    "Average Packet Size":         388.5,
    "Subflow Fwd Bytes":           3456.0,
    "Init_Win_bytes_forward":      1024.0,
    "Init_Win_bytes_backward":     2048.0,
    "act_data_pkt_fwd":            4.0,
    "min_seg_size_forward":        52.0,
    "Active Mean":                 61000.0,
    "Active Max":                  61000.0,
    "Active Min":                  61000.0,
    "Idle Mean":                   0.0,
    "Idle Max":                    0.0,
    "Idle Min":                    0.0,
    "_source_ip":                 "192.168.1.50",
    "_destination_ip":            "93.184.216.34",
    "_src_port":                  12345.0,
    "_dst_port":                  80.0,
}
def test_health_returns_ok():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert "db"     in data
    assert "model"  in data
def test_health_db_connected():
    response = client.get("/health")
    data = response.json()
    assert data["db"] == "ok"
def test_get_alerts_returns_list():
    response = client.get("/api/alerts")
    assert response.status_code == 200
    assert isinstance(response.json(), list)
def test_get_alerts_filter_by_type():
    response = client.get("/api/alerts?type=DDoS")
    assert response.status_code == 200
    assert isinstance(response.json(), list)
def test_get_alerts_filter_by_severity():
    response = client.get("/api/alerts?severity=HIGH")
    assert response.status_code == 200
    assert isinstance(response.json(), list)
def test_get_alerts_pagination():
    response = client.get("/api/alerts?limit=5&offset=0")
    assert response.status_code == 200
    assert len(response.json()) <= 5
def test_get_stats_returns_required_keys():
    response = client.get("/api/stats")
    assert response.status_code == 200
    data = response.json()
    required = [
        "total_flows", "total_attacks", "benign_count",
        "attacks_by_type", "attacks_by_severity", "uptime_seconds"
    ]
    for key in required:
        assert key in data, f"Missing key: {key}"
def test_get_stats_counts_are_non_negative():
    response = client.get("/api/stats")
    data = response.json()
    assert data["total_flows"]   >= 0
    assert data["total_attacks"] >= 0
    assert data["benign_count"]  >= 0
def test_ip_leaderboard_returns_list():
    response = client.get("/api/ip-leaderboard")
    assert response.status_code == 200
    assert isinstance(response.json(), list)
def test_predict_returns_503_without_model():
    """
    If no model.pkl exists, /api/predict should return 503 Not Found,
    not a 500 crash.
    """
    response = client.post("/api/predict", json=SAMPLE_FEATURES)
    assert response.status_code in (200, 503)
def test_predict_response_has_required_keys():
    """Only run this if model.pkl exists."""
    response = client.post("/api/predict", json=SAMPLE_FEATURES)
    if response.status_code == 503:
        pytest.skip("model.pkl not found — run train.py first")
    assert response.status_code == 200
    data = response.json()
    for key in ["alert_id", "prediction", "confidence", "severity", "timestamp"]:
        assert key in data, f"Missing key: {key}"
def test_predict_confidence_is_valid_float():
    response = client.post("/api/predict", json=SAMPLE_FEATURES)
    if response.status_code == 503:
        pytest.skip("model.pkl not found")
    data = response.json()
    conf = data["confidence"]
    assert 0.0 <= conf <= 1.0
def test_predict_severity_is_valid():
    response = client.post("/api/predict", json=SAMPLE_FEATURES)
    if response.status_code == 503:
        pytest.skip("model.pkl not found")
    data = response.json()
    assert data["severity"] in ("NONE", "LOW", "MEDIUM", "HIGH", "CRITICAL")
def test_predict_rejects_payload_without_features():
    """Regression: a payload with zero of the 52 features is invalid (400),
    and no longer falls through to the model with all-default zeros."""
    response = client.post("/api/predict", json={"junk": 1.0})
    assert response.status_code == 400

def test_predict_with_real_feature_names():
    """A payload using the real CICIDS column names reaches the model,
    returns 200, and carries the required keys."""
    response = client.post("/api/predict", json=SAMPLE_FEATURES)
    if response.status_code == 503:
        pytest.skip("model.pkl not found — run train.py first")
    assert response.status_code == 200
    data = response.json()
    for key in ["alert_id", "prediction", "confidence", "severity", "timestamp"]:
        assert key in data, f"Missing key: {key}"
    assert data["severity"] in ("NONE", "LOW", "MEDIUM", "HIGH", "CRITICAL")

def test_root_redirects():
    response = client.get("/")
    assert response.status_code == 200
    assert "docs" in response.json()


# ── Regression: ISSUE-01 — benign-label mismatch ──
# The deployed model emits "Normal Traffic", not "BENIGN". Every route
# filter must treat BOTH spellings as benign, otherwise the benign half
# of the dataset is counted as attacks.

def _insert_alert(prediction, severity="NONE", confidence=0.99):
    db = TestSession()
    try:
        db.add(Alert(
            source_ip="203.0.113.7",
            destination_ip="10.0.0.1",
            src_port=443,
            dst_port=80,
            prediction=prediction,
            confidence=confidence,
            severity=severity,
        ))
        db.commit()
    finally:
        db.close()

def test_stats_counts_both_benign_spellings_as_benign():
    before = client.get("/api/stats").json()
    _insert_alert("Normal Traffic")
    _insert_alert("BENIGN")
    after = client.get("/api/stats").json()
    assert after["benign_count"] == before["benign_count"] + 2
    assert after["total_attacks"] == before["total_attacks"]

def test_alerts_default_excludes_normal_traffic():
    response = client.get("/api/alerts")
    predictions = {a["prediction"] for a in response.json()}
    assert "Normal Traffic" not in predictions
    assert "BENIGN" not in predictions

def test_is_benign_accepts_all_spellings():
    for label in ["BENIGN", "Normal Traffic", "benign", "normal traffic"]:
        assert is_benign(label), f"is_benign('{label}') should be True"
    for label in ["DDoS", "Bots", "Port Scanning", "Brute Force", "DoS"]:
        assert not is_benign(label), f"is_benign('{label}') should be False"

def test_dos_family_maps_to_critical():
    assert get_severity("DoS") == "CRITICAL"
    assert get_severity("DDoS") == "CRITICAL"
    assert get_severity("Dos Hulk") == "CRITICAL"

def test_normal_traffic_maps_to_none():
    assert get_severity("Normal Traffic") == "NONE"

def teardown_module(module):
    """Remove SQLite test file after tests complete (best effort on Windows)."""
    import os
    test_engine.dispose()
    try:
        os.remove("test_nids.db")
    except OSError:
        pass