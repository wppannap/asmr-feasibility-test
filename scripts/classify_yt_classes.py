#!/usr/bin/env python3
"""Classify yt_master videos into human-ASMR scope classes. Does not modify raw CSVs."""
from __future__ import annotations

import re
from pathlib import Path

import pandas as pd
import yaml

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
CFG = ROOT / "config" / "yt_classes.yaml"


def load_cfg() -> dict:
    with CFG.open(encoding="utf-8") as f:
        return yaml.safe_load(f)


def haystack(row) -> str:
    return " ".join(
        [
            str(row.get("title") or ""),
            str(row.get("tags") or ""),
            str(row.get("description_short") or ""),
            str(row.get("topicCategories") or ""),
        ]
    ).lower()


def has_any_sub(text: str, terms: list[str]) -> bool:
    return any(t.lower() in text for t in terms if t)


def has_sleep_strict(text: str, latin: list[str], substr: list[str]) -> bool:
    if has_any_sub(text, substr):
        return True
    for t in latin:
        t = t.strip().lower()
        if not t:
            continue
        if re.search(rf"(?<![a-z0-9]){re.escape(t)}(?![a-z0-9])", text):
            return True
    return False


def matched_terms(text: str, terms: list[str], *, word_boundary: bool = False) -> list[str]:
    out = []
    for t in terms:
        tl = t.lower().strip()
        if not tl:
            continue
        if word_boundary:
            if re.search(rf"(?<![a-z0-9]){re.escape(tl)}(?![a-z0-9])", text):
                out.append(t)
        elif tl in text:
            out.append(t)
    return out


def classify_row(text: str, cfg: dict) -> dict:
    has_asmr_label = has_any_sub(text, cfg["asmr_label"])
    has_human_trigger = has_any_sub(text, cfg["human_trigger"])
    has_ambient = has_any_sub(text, cfg["ambient_noise"])
    sleep_strict = has_sleep_strict(
        text, cfg.get("sleep_strict_latin", []), cfg.get("sleep_strict_substring", [])
    )
    relax_only = has_any_sub(text, cfg["relax_only"])

    mixed = bool(has_ambient and has_human_trigger)

    if has_asmr_label and (has_human_trigger or not has_ambient):
        klass = "human_asmr"
    elif has_asmr_label and has_ambient and not has_human_trigger:
        klass = "ambient_labelled_asmr"
    elif (not has_asmr_label) and has_ambient:
        klass = "noise_not_asmr"
    else:
        klass = "other"

    return {
        "has_asmr_label": has_asmr_label,
        "has_human_trigger": has_human_trigger,
        "has_ambient": has_ambient,
        "sleep_strict": sleep_strict,
        "relax_only": relax_only,
        "class": klass,
        "mixed": mixed and klass == "human_asmr",
    }


def main() -> int:
    cfg = load_cfg()
    usecols = [
        "videoId",
        "channelId",
        "title",
        "tags",
        "description_short",
        "topicCategories",
        "duration_sec",
        "is_asmr_related",
        "is_sleep_related",
    ]
    yt = pd.read_csv(DATA / "yt_master.csv", encoding="utf-8-sig", usecols=usecols, low_memory=False)
    for col in ("is_asmr_related", "is_sleep_related"):
        yt[col] = yt[col].astype(str).str.strip().str.lower().isin(["1", "true", "yes"])
    yt["duration_sec"] = pd.to_numeric(yt["duration_sec"], errors="coerce")
    yt["channelId"] = yt["channelId"].fillna("").astype(str)
    yt["text"] = yt.apply(haystack, axis=1)

    rows = [classify_row(t, cfg) for t in yt["text"]]
    cls = pd.DataFrame(rows)
    out = pd.concat(
        [
            yt[["videoId"]].reset_index(drop=True),
            cls,
        ],
        axis=1,
    )
    out_path = DATA / "yt_classes.csv"
    out.to_csv(out_path, index=False, encoding="utf-8-sig")
    print(f"wrote {out_path} ({len(out):,} rows)")
    print(out["class"].value_counts().to_string())
    print("mixed among human_asmr:", int(out.loc[out["class"] == "human_asmr", "mixed"].sum()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
