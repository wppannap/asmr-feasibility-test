#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Build data/human_review_pack.csv (titles only; local/gitignored)."""
from __future__ import annotations

import csv
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
CLASSES = DATA / "yt_classes_v32.csv"
OUT = DATA / "human_review_pack.csv"
SEED = 42

COLS = [
    "id",
    "block",
    "title",
    "class_v32",
    "tier",
    "matched_terms",
    "duration_sec",
    "my_judgment",
    "note",
]


def sample(df: pd.DataFrame, n: int, rng: np.random.Generator) -> pd.DataFrame:
    if len(df) == 0:
        return df.iloc[0:0]
    k = min(n, len(df))
    idx = rng.choice(len(df), size=k, replace=False)
    return df.iloc[idx]


def main() -> int:
    usecols = [
        "videoId",
        "title",
        "duration_sec",
        "class_title_only",
        "tier_title_only",
        "sleep_title",
        "matched_human",
        "matched_wn",
        "matched_nature",
        "long_B_title_only",
    ]
    df = pd.read_csv(CLASSES, encoding="utf-8-sig", usecols=usecols)
    rng = np.random.default_rng(SEED)
    blocks = []

    ambient = df[df["class_title_only"] == "ambient_labelled_asmr"]
    blocks.append(("ambient_v32", sample(ambient, 10, rng)))

    sleep = df[
        (df["class_title_only"] == "asmr_labelled")
        & (df["sleep_title"] == True)
        & (~df["long_B_title_only"].astype(bool))
    ]
    blocks.append(("sleep_title", sample(sleep, 10, rng)))

    tier_a = df[
        (df["class_title_only"] == "asmr_labelled") & (df["tier_title_only"] == "A")
    ]
    blocks.append(("tierA", sample(tier_a, 10, rng)))

    tier_b = df[
        (df["class_title_only"] == "asmr_labelled") & (df["tier_title_only"] == "B")
    ]
    blocks.append(("tierB", sample(tier_b, 5, rng)))

    other_human = df[
        (df["class_title_only"] == "other")
        & (df["matched_human"].fillna("").astype(str).str.len() > 0)
    ]
    blocks.append(("not_asmr_but_human_trigger", sample(other_human, 5, rng)))

    rows = []
    i = 1
    for block, part in blocks:
        for _, r in part.iterrows():
            terms = "|".join(
                t
                for t in [
                    str(r.get("matched_human") or ""),
                    str(r.get("matched_wn") or ""),
                    str(r.get("matched_nature") or ""),
                ]
                if t and t != "nan"
            )
            rows.append(
                {
                    "id": f"R{i:02d}",
                    "block": block,
                    "title": r.get("title") or "",
                    "class_v32": r.get("class_title_only") or "",
                    "tier": r.get("tier_title_only") or "",
                    "matched_terms": terms,
                    "duration_sec": r.get("duration_sec") if pd.notna(r.get("duration_sec")) else "",
                    "my_judgment": "",
                    "note": "",
                }
            )
            i += 1

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=COLS)
        w.writeheader()
        w.writerows(rows)
    print(f"wrote {OUT.relative_to(ROOT)} n={len(rows)}", flush=True)
    for block, _ in blocks:
        print(f"  {block}: {sum(1 for r in rows if r['block']==block)}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
