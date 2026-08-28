# %% [markdown]
# # 01 — Exploratory Data Analysis (EDA) · *The Sentinel* NIDS
#
# **Colab edition** of `nids-backend/notebooks/01_eda.ipynb` — dataset-first
# understanding of the CICIDS2017 benchmark before any model training.
#
# **Dataset** — CICIDS2017 cleaned & consolidated: `2,520,751 rows × 53 columns`
# (52 numeric flow features + `Attack Type` label → 7 classes).
#
# **What this notebook covers**
# 1. Dataset setup from Google Drive
# 2. Structure, dtypes, memory
# 3. Class distribution & imbalance analysis
# 4. Data quality (missing / infinite / duplicates)
# 5. Feature statistics & distributions
# 6. Correlation analysis
# 7. Attack-vs-benign behaviour comparison
#
# > **Runtime:** CPU is enough — no GPU needed here.
# > **Next:** `02_Training_GPU_Colab.ipynb` (T4 GPU training).

# %% [markdown]
# ## 📂 Step 1 — Get the dataset into Colab
#
# The cleaned CICIDS2017 CSV is **685 MB** — too big for a quick upload, so use
# Google Drive (one-time upload, then every notebook session mounts it):
#
# | Option | How |
# |---|---|
# | **A (recommended)** | Upload `cicids2017_cleaned.csv` from `nids-backend/data/raw/` to **Google Drive → `MyDrive/nids_data/`** |
# | **B** | Drag-and-drop the CSV into the Colab file browser (left sidebar) → it lands at `/content/` — slower, re-uploads every session |
# | **C** | Any Kaggle CICIDS2017-cleaned export — it must have the same **52 features + `Attack Type`** schema to stay compatible with this project |
#
# All later notebooks look in the same place, so set it up once here.

# %%
from pathlib import Path

DRIVE_DATA_DIR = "nids_data"   # folder inside MyDrive — edit if you used another
DATA_FILENAME  = "cicids2017_cleaned.csv"

DATA_PATH = None
try:
    from google.colab import drive
    drive.mount("/content/drive")
    cand = Path("/content/drive/MyDrive") / DRIVE_DATA_DIR / DATA_FILENAME
    if cand.exists():
        DATA_PATH = cand
    else:
        print(f"[!] {cand} not found — check the folder name in MyDrive.")
except Exception as e:
    print(f"(Drive unavailable: {e} — falling back to /content)")

if DATA_PATH is None:
    for cand in [Path("/content") / DATA_FILENAME, Path("../data/raw") / DATA_FILENAME]:
        if cand.exists():
            DATA_PATH = cand
            break

assert DATA_PATH is not None, (
    f"Dataset not found! Upload {DATA_FILENAME} to Google Drive → MyDrive/{DRIVE_DATA_DIR}/ "
    "(Option A) or drag it into /content/ (Option B), then re-run this cell."
)
print(f"✔ Dataset: {DATA_PATH}")
print(f"  Size   : {DATA_PATH.stat().st_size / 1024**3:.2f} GB")

# %%
import warnings
warnings.filterwarnings("ignore")

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns

plt.rcParams["figure.figsize"] = (12, 5)
plt.rcParams["axes.spines.top"] = False
plt.rcParams["axes.spines.right"] = False
sns.set_palette("husl")

# output folder for saved plots (also synced to Drive if mounted)
PLOT_DIR = Path("/content/eda_plots"); PLOT_DIR.mkdir(exist_ok=True)
try:
    drive_sync = Path("/content/drive/MyDrive") / "nids_plots"
    drive_sync.mkdir(exist_ok=True)
except Exception:
    drive_sync = None

def save_fig(name):
    """Save the current figure to /content/eda_plots (+ Drive when mounted)."""
    out = PLOT_DIR / name
    plt.savefig(out, dpi=150, bbox_inches="tight")
    if drive_sync:
        try:
            plt.savefig(drive_sync / name, dpi=150, bbox_inches="tight")
        except Exception:
            pass
    print(f"saved → {out}")

print("All libraries imported ✔")

# %% [markdown]
# ## 📥 Step 2 — Load the dataset (memory-aware)
#
# 2.5 M rows × 53 columns in `float64` would need ~1 GB+ — the data is loaded in
# **float32** (half the RAM, no precision loss that matters for flow statistics).

# %%
LABEL_COL = "Attack Type"

# read the header first to build a float32 dtype map
header = pd.read_csv(DATA_PATH, nrows=0).columns.tolist()
dtype_map = {c: ("str" if c.strip() == LABEL_COL else "float32") for c in header}

print("Loading (float32)…")
df = pd.read_csv(DATA_PATH, dtype=dtype_map)
df.columns = df.columns.str.strip()          # CICIDS2017 export quirk: stray spaces

print(f"Shape  : {df.shape[0]:,} rows × {df.shape[1]} columns")
print(f"Memory : {df.memory_usage(deep=True).sum() / 1024**2:.1f} MB")

# %% [markdown]
# ## 👀 Step 3 — First look at the data

# %%
df.head()

# %%
print(f"Total columns: {len(df.columns)}")
for i, col in enumerate(df.columns, 1):
    marker = "  ← label" if col == LABEL_COL else ""
    print(f"  {i:2d}. {col}{marker}")

# %%
df.info()

# %% [markdown]
# ## 🏷️ Step 4 — Identify the label column
#
# > **Fixed here:** the original repo notebook searched only for the literal
# > `"label"` and printed `Label column: None` (README · *Notebook nits*).
# > This version also matches `"attack"` and finds `Attack Type` correctly.

# %%
label_col = next(
    (c for c in df.columns if c.lower() == "attack type"),
    next((c for c in df.columns if "attack" in c.lower() or "label" in c.lower()), None),
)
assert label_col is not None, "No label column found!"

print(f'Label column: "{label_col}"')
print(f"Classes: {df[label_col].nunique()}")
print("\nClass counts:")
for cls, count in df[label_col].value_counts().items():
    print(f"  {cls:<40} {count:>10,}  ({count / len(df) * 100:5.2f}%)")

# %% [markdown]
# ## 📊 Step 5 — Class distribution
#
# The single most important EDA chart: if benign traffic dominates, a model can
# "cheat" by always predicting benign. Colors: green = benign, red = attack.

# %%
class_counts = df[label_col].value_counts()

def _is_benign_name(name) -> bool:
    s = str(name).lower()
    return "normal traffic" in s or "benign" in s or s == "normal"

fig, axes = plt.subplots(1, 2, figsize=(16, 6))

colors = ["#2ecc71" if _is_benign_name(c) else "#e74c3c" for c in class_counts.index]
axes[0].bar(range(len(class_counts)), class_counts.values,
            color=colors, edgecolor="white", linewidth=0.5)
axes[0].set_xticks(range(len(class_counts)))
axes[0].set_xticklabels(class_counts.index, rotation=45, ha="right", fontsize=9)
axes[0].set_title("Class Distribution (Absolute Count)", fontsize=13, fontweight="bold")
axes[0].set_ylabel("Number of Samples")
for i, v in enumerate(class_counts.values):
    axes[0].text(i, v * 1.02, f"{v:,}", ha="center", fontsize=7, rotation=90)

axes[1].pie(class_counts.values, labels=class_counts.index,
            autopct=lambda p: f"{p:.1f}%" if p > 1 else "",
            startangle=90, textprops={"fontsize": 8})
axes[1].set_title("Class Distribution (Percentage)", fontsize=13, fontweight="bold")

plt.tight_layout()
save_fig("eda_class_distribution.png")
plt.show()

# %% [markdown]
# ## ⚖️ Step 6 — Imbalance analysis
#
# > **Benign semantics (project rule):** the model's benign class is
# > **`Normal Traffic`**, not `"BENIGN"` — checked via `BENIGN_LABELS` logic.

# %%
total        = len(df)
benign_count = int(df[label_col].map(_is_benign_name).sum())
attack_count = total - benign_count

print("=" * 52)
print(f"  Total samples  : {total:>12,}")
print(f"  Normal Traffic : {benign_count:>12,}  ({benign_count / total * 100:.1f}%)")
print(f"  Attack traffic : {attack_count:>12,}  ({attack_count / total * 100:.1f}%)")
print("=" * 52)

ratio = benign_count / max(attack_count, 1)
print(f"\nImbalance ratio (Normal : Attack) = {ratio:.2f} : 1")

if ratio > 5:
    print("\n⚠️  HIGH IMBALANCE → use class_weight='balanced' (production choice) or SMOTE")
elif ratio > 2:
    print("\n⚠️  MODERATE IMBALANCE → class_weight='balanced' recommended")
else:
    print("\n✔ Classes are relatively balanced")

# minority classes
minority = class_counts[class_counts.index.map(lambda c: not _is_benign_name(c))].tail(3)
print("\nRarest attack classes:")
for cls, count in minority.items():
    print(f"  {cls:<40} {count:,}")

# %% [markdown]
# ## 🧹 Step 7 — Data quality: missing, infinite, duplicates

# %%
numeric_df = df.select_dtypes(include=[np.number])

print("--- Missing values ---")
missing = df.isnull().sum()
missing = missing[missing > 0]
print("✔ none" if missing.empty else missing.to_string())

print("\n--- Infinite values ---")
inf_counts = np.isinf(numeric_df).sum()
inf_counts = inf_counts[inf_counts > 0]
print("✔ none" if inf_counts.empty else inf_counts.to_string())

print("\n--- Duplicate rows ---")
dup_count = int(df.duplicated().sum())
if dup_count == 0:
    print("✔ none")
else:
    print(f"⚠️  {dup_count:,} duplicates ({dup_count / len(df) * 100:.2f}%)")
    print("→ training pipeline drops them (clean_data: inf→NaN, dropna, drop_duplicates)")

# %% [markdown]
# ## 📈 Step 8 — Statistical summary

# %%
print(f"Numeric features: {len(numeric_df.columns)}")
numeric_df.describe().T.round(3)

# %% [markdown]
# ## 📉 Step 9 — Feature distributions
#
# Key network features, clipped at the 99th percentile so extreme outlier flows
# don't flatten the histograms.

# %%
key_candidates = ["Flow Duration", "Total Fwd Packets", "Total Backward Packets",
                  "Flow Bytes/s", "Flow Packets/s", "Fwd Packet Length Mean",
                  "Bwd Packet Length Mean", "SYN Flag Count"]
key_features = []
for candidate in key_candidates:
    for col in df.columns:
        if col.strip().lower() == candidate.lower():
            key_features.append(col)
            break
if len(key_features) < 4:
    key_features = list(numeric_df.columns[:8])
key_features = key_features[:8]

print(f"Plotting: {key_features}")

fig, axes = plt.subplots(2, 4, figsize=(18, 8))
axes = axes.flatten()
for i, feat in enumerate(key_features):
    data = df[feat].replace([np.inf, -np.inf], np.nan).dropna()
    data = data[data <= data.quantile(0.99)]
    axes[i].hist(data, bins=50, color="#3498db", edgecolor="none", alpha=0.85)
    axes[i].set_title(feat, fontsize=9, fontweight="bold")
    axes[i].set_xlabel("Value")
    axes[i].set_ylabel("Count")
plt.suptitle("Feature Distributions (clipped at p99)", fontsize=14, fontweight="bold")
plt.tight_layout()
save_fig("eda_feature_distributions.png")
plt.show()

# %% [markdown]
# ## 🔥 Step 10 — Correlation heatmap
#
# Features with |r| > 0.95 carry duplicate information. A 50 k sample keeps the
# computation fast; the top-20 variance features keep the plot readable.

# %%
sample = df.sample(min(50_000, len(df)), random_state=42)
numeric_sample = sample.select_dtypes(include=[np.number]).replace([np.inf, -np.inf], np.nan).fillna(0)

top_features = numeric_sample.var().nlargest(20).index
corr_matrix  = numeric_sample[top_features].corr()

plt.figure(figsize=(16, 12))
mask = np.triu(np.ones_like(corr_matrix, dtype=bool))
sns.heatmap(corr_matrix, mask=mask, annot=True, fmt=".2f", annot_kws={"size": 7},
            cmap="RdYlGn", center=0, linewidths=0.5, square=True, vmin=-1, vmax=1)
plt.title("Feature Correlation (Top 20 by Variance)", fontsize=14, fontweight="bold")
plt.tight_layout()
save_fig("eda_correlation_heatmap.png")
plt.show()

# %%
threshold = 0.95
corr_full = numeric_sample.corr().abs()
upper = corr_full.where(np.triu(np.ones(corr_full.shape), k=1).astype(bool))
pairs = [(row, col, corr_full.loc[row, col])
         for col in upper.columns for row in upper.index
         if upper.loc[row, col] > threshold]

print(f"Feature pairs with |r| > {threshold}: {len(pairs)}")
for f1, f2, r in sorted(pairs, key=lambda x: -x[2])[:15]:
    print(f"  {f1:<38} ↔ {f2:<38} r={r:.3f}")
if len(pairs) > 15:
    print(f"  … and {len(pairs) - 15} more")

# %% [markdown]
# ## ⚔️ Step 11 — Attack vs Normal traffic behaviour

# %%
clean = df.replace([np.inf, -np.inf], np.nan).dropna()
clean["is_attack"] = (~clean[label_col].map(_is_benign_name)).astype(int)

compare_features = list(numeric_df.columns[:6])
benign_means = clean[clean["is_attack"] == 0][compare_features].mean()
attack_means = clean[clean["is_attack"] == 1][compare_features].mean()

comparison = pd.DataFrame({"NORMAL": benign_means, "ATTACK": attack_means})
comparison_norm = (comparison - comparison.min()) / (comparison.max() - comparison.min() + 1e-9)

fig, ax = plt.subplots(figsize=(12, 5))
x = np.arange(len(compare_features))
w = 0.35
ax.bar(x - w / 2, comparison_norm["NORMAL"], w, label="Normal", color="#2ecc71", alpha=0.85)
ax.bar(x + w / 2, comparison_norm["ATTACK"], w, label="Attack", color="#e74c3c", alpha=0.85)
ax.set_xticks(x)
ax.set_xticklabels(compare_features, rotation=30, ha="right", fontsize=9)
ax.set_title("Normal vs Attack — Normalized Feature Means", fontsize=13, fontweight="bold")
ax.set_ylabel("Normalized mean (0–1)")
ax.legend()
plt.tight_layout()
save_fig("eda_attack_vs_normal.png")
plt.show()

# %% [markdown]
# ## 📦 Step 12 — Feature spread by class (box plots)

# %%
df_box = clean.sample(min(20_000, len(clean)), random_state=42)
plot_features = list(numeric_df.columns[:4])

fig, axes = plt.subplots(1, 4, figsize=(20, 6))
for i, feat in enumerate(plot_features):
    p95 = df_box[feat].quantile(0.95)
    clipped = df_box[df_box[feat] <= p95]
    classes = clipped[label_col].unique()
    data_by_class = [clipped[clipped[label_col] == cls][feat].values for cls in classes]

    bp = axes[i].boxplot(data_by_class, patch_artist=True,
                         labels=[str(c)[:10] for c in classes])
    for patch, cls in zip(bp["boxes"], classes):
        patch.set_facecolor("#2ecc71" if _is_benign_name(cls) else "#e74c3c")
        patch.set_alpha(0.7)
    axes[i].set_title(feat, fontsize=9, fontweight="bold")
    axes[i].tick_params(axis="x", rotation=90, labelsize=7)

plt.suptitle("Feature Distribution by Class", fontsize=13, fontweight="bold")
plt.tight_layout()
save_fig("eda_boxplots.png")
plt.show()

# %% [markdown]
# ## 🧾 Step 13 — EDA summary & next steps

# %%
print("=" * 64)
print("  EDA SUMMARY — CICIDS2017 (cleaned & consolidated)")
print("=" * 64)
print(f"  Total samples     : {len(df):,}")
print(f"  Total features    : {len(numeric_df.columns)}")
print(f"  Classes           : {df[label_col].nunique()}")
print(f"  Normal Traffic    : {benign_count / len(df) * 100:.1f}% of rows")
print(f"  Missing values    : {int(df.isnull().sum().sum())}")
print(f"  Infinite values   : {int(np.isinf(numeric_df).sum().sum())}")
print(f"  Duplicate rows    : {int(df.duplicated().sum()):,}")
print("=" * 64)
print("""
KEY TAKEAWAYS
  1. Class imbalance is handled in training via class_weight='balanced'
     (production choice); SMOTE stays optional/off by default.
  2. All features are numeric and non-negative — the API rejects negative
     or non-finite vectors at inference time.
  3. Highly correlated features exist but are kept: the deployed model is
     trained on the exact 52-feature CICIDS contract (needed for SHAP).
  4. Training uses chunked stratified sampling (~400k rows) — same as
     src/model/train.py.

NEXT  →  02_Training_GPU_Colab.ipynb  (T4 GPU model training)
""")

# %% [markdown]
# ## 📋 Step 14 — Key numbers (fill into your report)
# Every EDA metric an examiner will ask for, in one place.

# %%
print("=" * 62)
print("  EDA KEY NUMBERS — CICIDS2017 (cleaned & consolidated)")
print("=" * 62)
print(f"  Rows × Columns        : {len(df):,} × {df.shape[1]}")
print(f"  Numeric features      : {len(numeric_df.columns)}")
print(f"  Classes               : {df[label_col].nunique()}")
print(f"  Benign share          : {benign_count / len(df) * 100:.1f}%")
print(f"  Missing values        : {int(df.isnull().sum().sum())}")
print(f"  Infinite values       : {int(np.isinf(numeric_df).sum().sum())}")
print(f"  Duplicate rows        : {int(df.duplicated().sum()):,}")
print(f"  Imbalance ratio       : {ratio:.1f} : 1 (Normal : Attack)")
print(f"  Correlated pairs >0.95: {len(pairs)}")
print("=" * 62)
print("Plots saved to /content/eda_plots/ (+ MyDrive/nids_plots when mounted).")
