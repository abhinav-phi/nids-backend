"""
pack.py — Assemble Colab-ready .ipynb notebooks from percent-format sources.

Source format (jupytext "percent" style):
    # %% [markdown]     → starts a markdown cell (lines prefixed with "# ")
    # %%                → starts a code cell (raw python)
    # %%include <file>  → inline the cells of another fragment file here

Run:  python pack.py
Output: ../01_EDA_Colab.ipynb etc.
"""
import json
import re
import sys
import uuid
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE.parent

NOTEBOOKS = [
    # (source, output, gpu-accelerator-metadata?)
    ("01_EDA.py", "01_EDA_Colab.ipynb", False),
    ("02_Training_GPU.py", "02_Training_GPU_Colab.ipynb", True),
    ("03_Inference_API.py", "03_Inference_API_Colab.ipynb", True),
    ("04_Dashboard.py", "04_Dashboard_Colab.ipynb", True),
]

MD_RE = re.compile(r"^# %% \[markdown\]\s*$")
CODE_RE = re.compile(r"^# %%\s*$")
INC_RE = re.compile(r"^# %%include\s+(\S+)\s*$")


def parse_file(path: Path):
    """Return a list of {"cell_type": ..., "source": str} cells."""
    cells = []
    kind = None          # "markdown" | "code"
    buf: list[str] = []

    def flush():
        nonlocal kind, buf
        if kind is None:
            return
        text = "\n".join(buf)
        if kind == "markdown":
            out_lines = []
            for line in text.split("\n"):
                if line == "#":
                    out_lines.append("")
                elif line.startswith("# "):
                    out_lines.append(line[2:])
                elif line.startswith("#"):
                    out_lines.append(line[1:])
                else:
                    out_lines.append(line)
            cells.append({"cell_type": "markdown", "source": "\n".join(out_lines).strip("\n")})
        else:
            cells.append({"cell_type": "code", "source": text.strip("\n")})
        kind, buf = None, []

    for line in path.read_text(encoding="utf-8").splitlines():
        md = MD_RE.match(line)
        code = CODE_RE.match(line)
        inc = INC_RE.match(line)
        if md or code or inc:
            flush()
            if md:
                kind = "markdown"
            elif code:
                kind = "code"
            else:
                frag_path = HERE / inc.group(1)
                cells.extend(parse_file(frag_path))
        else:
            if kind is None:
                # top-of-file comment before the first marker → ignore
                if line.strip() and not line.startswith("# !!!!"):
                    raise ValueError(f"{path.name}: stray text before first cell marker: {line!r}")
                continue
            buf.append(line)
    flush()
    return cells


def build(source_name: str, out_name: str, gpu: bool):
    cells = parse_file(HERE / source_name)

    # sanity: syntax-check every code cell (skip Colab-magic cells: `!pip`, `%`)
    for i, c in enumerate(cells):
        if c["cell_type"] == "code":
            if any(re.match(r"^\s*[!%]", ln) for ln in c["source"].split("\n")):
                continue
            try:
                compile(c["source"], f"{out_name}:cell{i}", "exec")
            except SyntaxError as e:
                raise SystemExit(f"SYNTAX ERROR in {out_name} cell {i}: {e}\n{c['source'][:200]}")

    nb_cells = []
    for c in cells:
        src = c["source"].split("\n")
        src = [s + "\n" for s in src[:-1]] + [src[-1]] if src else [""]
        if c["cell_type"] == "code":
            nb_cells.append({
                "cell_type": "code",
                "execution_count": None,
                "id": uuid.uuid4().hex[:12],
                "metadata": {},
                "outputs": [],
                "source": src,
            })
        else:
            nb_cells.append({
                "cell_type": "markdown",
                "id": uuid.uuid4().hex[:12],
                "metadata": {},
                "source": src,
            })

    metadata = {
        "colab": {"provenance": []},
        "kernelspec": {"name": "python3", "display_name": "Python 3"},
        "language_info": {"name": "python"},
    }
    if gpu:
        metadata["accelerator"] = "GPU"
        metadata["colab"]["gpuType"] = "T4"

    nb = {
        "nbformat": 4,
        "nbformat_minor": 5,   # cell ids require 4.5+
        "metadata": metadata,
        "cells": nb_cells,
    }
    out_path = OUT / out_name
    out_path.write_text(json.dumps(nb, indent=1, ensure_ascii=False), encoding="utf-8")

    n_md = sum(1 for c in cells if c["cell_type"] == "markdown")
    n_code = len(cells) - n_md
    print(f"built {out_name:34s} {n_md:2d} md + {n_code:2d} code cells → {out_path}")


def main():
    for src, out, gpu in NOTEBOOKS:
        build(src, out, gpu)
    # optional strict nbformat validation
    try:
        import nbformat  # noqa
        for _, out, _ in NOTEBOOKS:
            nbformat.validate(nbformat.read(OUT / out, as_version=4))
            print(f"nbformat OK: {out}")
    except ImportError:
        print("(nbformat not installed locally — skipped strict validation)")

if __name__ == "__main__":
    main()
