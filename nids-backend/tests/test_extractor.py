"""
test_extractor.py — Unit tests for FlowExtractor
Run with:  pytest tests/test_extractor.py -v
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import time
import pytest
from src.features.extractor import FlowExtractor, CICIDS_FEATURES

@pytest.fixture
def extractor():
    return FlowExtractor()

@pytest.fixture
def normal_flow():
    """Simulate a normal HTTPS browsing flow."""
    now = time.time()
    return [
        {"src_ip": "192.168.1.10", "size": 60,   "time": now + 0.000, "tcp_flags": "S"},
        {"src_ip": "10.0.0.1",     "size": 60,   "time": now + 0.001, "tcp_flags": "SA"},
        {"src_ip": "192.168.1.10", "size": 52,   "time": now + 0.002, "tcp_flags": "A"},
        {"src_ip": "192.168.1.10", "size": 512,  "time": now + 0.003, "tcp_flags": "PA"},
        {"src_ip": "10.0.0.1",     "size": 1460, "time": now + 0.050, "tcp_flags": "PA"},
        {"src_ip": "10.0.0.1",     "size": 1460, "time": now + 0.051, "tcp_flags": "PA"},
        {"src_ip": "192.168.1.10", "size": 52,   "time": now + 0.052, "tcp_flags": "A"},
        {"src_ip": "192.168.1.10", "size": 52,   "time": now + 0.060, "tcp_flags": "F"},
        {"src_ip": "10.0.0.1",     "size": 52,   "time": now + 0.061, "tcp_flags": "FA"},
    ]

@pytest.fixture
def ddos_flow():
    """Simulate a DDoS-like flow: many tiny packets from one source."""
    now = time.time()
    return [
        {"src_ip": "1.2.3.4", "size": 64, "time": now + i*0.0001, "tcp_flags": "S"}
        for i in range(200)
    ]

@pytest.fixture
def portscan_flow():
    """Simulate a port scan: SYN to many ports, no responses."""
    now = time.time()
    return [
        {"src_ip": "5.5.5.5", "size": 60, "time": now + i*0.01, "tcp_flags": "S"}
        for i in range(30)
    ]


# ── Contract: output is EXACTLY the 52 CICIDS2017 columns, in order ──
# The route rebuilds the inference vector from CICIDS_FEATURES, so dict
# key order is the trained column order. Any change here silently breaks
# inference (all features would default to 0.0).

def test_returns_dict(extractor, normal_flow):
    features = extractor.extract_from_dicts(normal_flow)
    assert isinstance(features, dict)

def test_exactly_52_features_in_cicids_order(extractor, normal_flow):
    features = extractor.extract_from_dicts(normal_flow)
    assert list(features.keys()) == CICIDS_FEATURES
    assert len(features) == 52

def test_all_values_are_float(extractor, normal_flow):
    features = extractor.extract_from_dicts(normal_flow)
    for k, v in features.items():
        assert isinstance(v, float), f"{k} is not a float: {type(v)}"

def test_no_nan_or_inf(extractor, normal_flow):
    import math
    features = extractor.extract_from_dicts(normal_flow)
    for k, v in features.items():
        assert not math.isnan(v),  f"{k} is NaN"
        assert not math.isinf(v),  f"{k} is Inf"

def test_empty_packets_returns_zeros(extractor):
    features = extractor.extract_from_dicts([])
    assert features["Flow Duration"] == 0.0
    assert features["Total Fwd Packets"] == 0.0

def test_fwd_bwd_packet_split(extractor, normal_flow):
    features = extractor.extract_from_dicts(normal_flow)
    assert features["Total Fwd Packets"] == 5.0
    assert features["Bwd Packet Length Max"] > 0.0

def test_ddos_has_high_pps(extractor, ddos_flow):
    features = extractor.extract_from_dicts(ddos_flow)
    assert features["Flow Packets/s"] > 1000

def test_ddos_small_packets(extractor, ddos_flow):
    features = extractor.extract_from_dicts(ddos_flow)
    assert features["Packet Length Mean"] < 100

def test_portscan_has_no_fin(extractor, portscan_flow):
    features = extractor.extract_from_dicts(portscan_flow)
    assert features["FIN Flag Count"] == 0.0
    assert features["Packet Length Mean"] < 200

def test_normal_flow_has_fin(extractor, normal_flow):
    features = extractor.extract_from_dicts(normal_flow)
    assert features["FIN Flag Count"] > 0

def test_single_packet_no_crash(extractor):
    single = [{"src_ip": "1.1.1.1", "size": 100, "time": time.time(), "tcp_flags": "S"}]
    features = extractor.extract_from_dicts(single)
    assert features["Total Fwd Packets"] == 1.0
    assert features["Flow IAT Mean"] == 0.0