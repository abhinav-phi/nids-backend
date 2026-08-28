# %% [markdown]
# ## ⚙️ Step 1 — Config & artifact discovery
#
# The trained artifacts produced by **02_Training_GPU_Colab.ipynb** are the
# deployment contract of this notebook (mirrors `model.pkl` / `scaler.pkl` /
# `label_encoder.pkl` in the repo). They are searched in this order:
#
# 1. `/content/nids_artifacts/` (produced by notebook 02 in this session)
# 2. Google Drive → `MyDrive/nids_artifacts/` (if notebook 02 synced them)
# 3. A `nids_artifacts.zip` you uploaded to `/content/` (fallback)
#
# The raw CSV (`DATA_PATH`) is only needed for the traffic-replay section.

# %%
import json
import shutil
import zipfile
from pathlib import Path

# ── CONFIG ────────────────────────────────────────────────────────────────
DRIVE_ART_DIR   = "nids_artifacts"    # folder inside MyDrive (sync target)
DRIVE_DATA_DIR  = "nids_data"         # folder inside MyDrive (dataset)
DATA_FILENAME   = "cicids2017_cleaned.csv"
API_PORT        = 8000

API_BASE = f"http://127.0.0.1:{API_PORT}"

# ── Locate trained artifacts ─────────────────────────────────────────────
def _find_artifacts() -> Path | None:
    candidates = [
        Path("/content/nids_artifacts"),
        Path("/content/drive/MyDrive") / DRIVE_ART_DIR,
    ]
    for cand in candidates:
        if (cand / "model.pkl").exists():
            return cand
    # optional zip fallback: nids_artifacts.zip in /content
    zpath = Path("/content/nids_artifacts.zip")
    if zpath.exists():
        with zipfile.ZipFile(zpath) as z:
            z.extractall("/content/nids_artifacts")
        return Path("/content/nids_artifacts")
    return None

ART_DIR = _find_artifacts()

if ART_DIR is None:
    # last chance: mount Drive (skipped earlier if it would block)
    try:
        from google.colab import drive
        drive.mount("/content/drive")
        ART_DIR = _find_artifacts()
    except Exception as e:
        print(f"(Drive mount unavailable: {e})")

assert ART_DIR is not None, (
    "Trained artifacts not found!\n"
    "→ Run 02_Training_GPU_Colab.ipynb first (it saves to /content/nids_artifacts\n"
    "  and syncs to MyDrive/nids_artifacts), or upload nids_artifacts.zip to /content."
)
print(f"Artifacts found: {ART_DIR}")
print("Contents:", sorted(p.name for p in ART_DIR.iterdir()))

# ── Locate the dataset (only needed for the replay section) ──────────────
DATA_PATH = None
for cand in [
    Path("/content") / DATA_FILENAME,
    Path("/content/drive/MyDrive") / DRIVE_DATA_DIR / DATA_FILENAME,
]:
    if cand.exists():
        DATA_PATH = cand
        break

if DATA_PATH is None:
    print(f"\n[!] {DATA_FILENAME} not found — the traffic-replay section will be skipped.")
    print("    Put the CSV in MyDrive/nids_data/ to enable it.")
else:
    print(f"Dataset found: {DATA_PATH}")
