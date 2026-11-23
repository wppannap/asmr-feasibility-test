#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Classify yt_master with v2 rules → data/yt_classes_v2.csv + class_check_v2_*.csv
+ docs/CLASS_RULES_V2.md comparison. Local data; no web/.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import yaml

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
CFG = ROOT / "config" / "yt_classes_v2.yaml"
CFG_V1 = ROOT / "config" / "yt_classes.yaml"
DOCS = ROOT / "docs"
SEED = 42


def load_cfg(path: Path) -> dict:
    with path.open(encoding="utf-8") as f:
        return yaml.safe_load(f)


def has_any(text: str, terms: list[str]) -> bool:
    return any(t.lower() in text for t in terms if t)


def matched(text: str, terms: list[str]) -> list[str]:
    return [t for t in terms if t and t.lower() in text]


def sleep_strict_v2(title: str, tags: str, desc: str, cfg: dict) -> tuple[bool, list[str]]:
    latin = cfg.get("sleep_strict_latin", [])
    substr = cfg.get("sleep_strict_substring", [])

    def hits(text: str) -> list[str]:
        out = []
        tl = text.lower()
        for t in substr:
            if t.lower() in tl:
                out.append(t)
        for t in latin:
            t = t.strip().lower()
            if t and re.search(rf"(?<![a-z0-9]){re.escape(t)}(?![a-z0-9])", tl):
                out.append(t)
        return out

    title_h = hits(title)
    tags_h = hits(tags)
    desc_h = hits(desc)
    if title_h or tags_h:
        return True, sorted(set(title_h + tags_h + desc_h))
    # description: need >= 2 distinct terms
    if len(set(desc_h)) >= 2:
        return True, sorted(set(desc_h))
    return False, desc_h


def classify_v2(row, cfg: dict) -> dict:
    title = str(row.get("title") or "").lower()
    tags = str(row.get("tags") or "").lower()
    desc = str(row.get("description_short") or "").lower()
    topics = str(row.get("topicCategories") or "").lower()
    hay = " ".join([title, tags, desc, topics])

    has_label = has_any(hay, cfg["asmr_label"])
    has_human = has_any(hay, cfg["human_trigger"])
    has_object = has_any(hay, cfg["object_action_trigger"])
    has_strong = has_any(hay, cfg["strong_ambient"])
    nature_title = has_any(title, cfg["nature_title_only"])
    nature_ambient = bool(nature_title and not has_human and not has_object)

    is_ambient = bool(has_strong or nature_ambient)
    sleep_ok, sleep_terms = sleep_strict_v2(title, tags, desc, cfg)

    # class
    if has_label and not is_ambient:
        klass = "asmr_labelled"
        # ambient-ish words in haystack (nature family) without being ambient-classified
        ambient_words = has_any(hay, cfg["nature_title_only"])
        if not has_human:
            tier = "B"
        elif ambient_words:
            tier = "C"  # label + trigger + ambient words (mixed)
        else:
            tier = "A"  # label + trigger + no strong/nature ambient
    elif has_label and is_ambient:
        klass = "ambient_labelled_asmr"
        tier = ""
    elif (not has_label) and is_ambient:
        klass = "noise_not_asmr"
        tier = ""
    else:
        klass = "other"
        tier = ""

    return {
        "has_asmr_label": has_label,
        "has_human_trigger": has_human,
        "has_strong_ambient": has_strong,
        "nature_title_ambient": nature_ambient,
        "is_ambient_v2": is_ambient,
        "sleep_strict": sleep_ok,
        "sleep_terms": "|".join(sleep_terms),
        "class": klass,
        "tier": tier,
        "matched_human": "|".join(matched(hay, cfg["human_trigger"])[:12]),
        "matched_ambient": "|".join(
            matched(hay, cfg["strong_ambient"]) + matched(title, cfg["nature_title_only"])
        )[:200],
    }


def classify_v1_quick(hay: str, cfg1: dict) -> str:
    """Minimal v1 class for before/after counts."""
    has_label = has_any(hay, cfg1["asmr_label"])
    has_human = has_any(hay, cfg1["human_trigger"])
    has_ambient = has_any(hay, cfg1["ambient_noise"])
    if has_label and (has_human or not has_ambient):
        return "human_asmr"
    if has_label and has_ambient and not has_human:
        return "ambient_labelled_asmr"
    if (not has_label) and has_ambient:
        return "noise_not_asmr"
    return "other"


def main() -> int:
    cfg = load_cfg(CFG)
    cfg1 = load_cfg(CFG_V1)
    usecols = [
        "videoId", "channelId", "title", "tags", "description_short",
        "topicCategories", "duration_sec", "defaultLanguage", "title_script",
    ]
    print("Loading yt_master…", flush=True)
    yt = pd.read_csv(DATA / "yt_master.csv", encoding="utf-8-sig", usecols=usecols, low_memory=False)
    yt["duration_sec"] = pd.to_numeric(yt["duration_sec"], errors="coerce")
    yt["title_l"] = yt["title"].fillna("").astype(str)
    yt["tags_l"] = yt["tags"].fillna("").astype(str)
    yt["desc_l"] = yt["description_short"].fillna("").astype(str)
    yt["hay"] = (
        yt["title_l"] + " " + yt["tags_l"] + " " + yt["desc_l"] + " " + yt["topicCategories"].fillna("").astype(str)
    ).str.lower()

    print("Classifying v2…", flush=True)
    rows = []
    for r in yt.itertuples(index=False):
        rows.append(classify_v2({
            "title": r.title_l, "tags": r.tags_l, "description_short": r.desc_l,
            "topicCategories": getattr(r, "topicCategories", ""),
        }, cfg))
    cls = pd.DataFrame(rows)
    out = pd.concat([yt[["videoId", "title", "duration_sec", "defaultLanguage", "title_script"]].reset_index(drop=True), cls], axis=1)

    # v1 class for comparison (from existing file if present)
    v1_path = DATA / "yt_classes.csv"
    if v1_path.exists():
        v1 = pd.read_csv(v1_path, encoding="utf-8-sig", usecols=["videoId", "class", "sleep_strict", "has_human_trigger"])
        v1 = v1.rename(columns={"class": "class_v1", "sleep_strict": "sleep_v1", "has_human_trigger": "human_v1"})
        out = out.merge(v1, on="videoId", how="left")
    else:
        out["class_v1"] = [classify_v1_quick(h, cfg1) for h in yt["hay"]]
        out["sleep_v1"] = False
        out["human_v1"] = False

    out_path = DATA / "yt_classes_v2.csv"
    out.to_csv(out_path, index=False, encoding="utf-8-sig")
    print(f"wrote {out_path} ({len(out):,})", flush=True)
    print("v2 class:\n", out["class"].value_counts().to_string())
    print("tiers:\n", out.loc[out["class"] == "asmr_labelled", "tier"].value_counts().to_string())

    # before/after
    ct_v1 = out["class_v1"].value_counts().to_dict()
    ct_v2 = out["class"].value_counts().to_dict()
    # map human_asmr ↔ asmr_labelled for move analysis
    moves = out[out["class_v1"].fillna("") != out["class"].map({
        "asmr_labelled": "human_asmr",
        "ambient_labelled_asmr": "ambient_labelled_asmr",
        "noise_not_asmr": "noise_not_asmr",
        "other": "other",
    })]
    # largest moves: v1 human → not asmr_labelled, or ambient → asmr_labelled
    rescued_patterns = {
        "barber_shampoo": out["title"].fillna("").str.contains("シャンプー|shampoo", case=False, regex=True),
        "nape_tracing": out["title"].fillna("").str.contains("nape tracing", case=False, regex=False),
        "butter_cracking_ocean": out["title"].fillna("").str.contains("butter cracking", case=False, regex=False)
            & out["title"].fillna("").str.contains("ocean", case=False, regex=False),
    }
    rescue_report = {}
    for name, mask in rescued_patterns.items():
        sub = out[mask]
        rescue_report[name] = {
            "n_match_title": int(mask.sum()),
            "n_asmr_labelled_v2": int((sub["class"] == "asmr_labelled").sum()),
            "n_ambient_v2": int((sub["class"] == "ambient_labelled_asmr").sum()),
            "n_was_ambient_v1": int((sub["class_v1"] == "ambient_labelled_asmr").sum()),
            "n_rescued": int(((sub["class_v1"] == "ambient_labelled_asmr") & (sub["class"] == "asmr_labelled")).sum()),
        }

    # 20 largest moves by duration among class changes involving labelled/ambient
    changed = out[
        ((out["class_v1"] == "human_asmr") & (out["class"] != "asmr_labelled"))
        | ((out["class_v1"] == "ambient_labelled_asmr") & (out["class"] == "asmr_labelled"))
        | ((out["class_v1"] == "ambient_labelled_asmr") & (out["class"] != "ambient_labelled_asmr"))
        | ((out["class_v1"] != "ambient_labelled_asmr") & (out["class"] == "ambient_labelled_asmr"))
    ].copy()
    changed["move"] = changed["class_v1"].astype(str) + "→" + changed["class"].astype(str)
    top_moves = changed.nlargest(20, "duration_sec")[["title", "move", "tier", "duration_sec", "matched_human", "matched_ambient"]]

    # sleep share by language
    def lang_group(dl, ts):
        sys.path.insert(0, str(ROOT / "scripts"))
        from fetch_comments import language_group
        return language_group(str(dl or ""), str(ts or ""))

    out["lang"] = [
        lang_group(a, b) for a, b in zip(out["defaultLanguage"], out["title_script"])
    ]
    sleep_tbl = []
    for lg in ["en", "ja", "zh", "ko", "es", "fr"]:
        g = out[out["lang"] == lg]
        if len(g) == 0:
            continue
        v1s = float(g["sleep_v1"].mean()) if "sleep_v1" in g else None
        v2s = float(g["sleep_strict"].mean())
        flip = int(((g["sleep_v1"] == True) & (g["sleep_strict"] == False)).sum()) if "sleep_v1" in g else None
        gain = int(((g["sleep_v1"] == False) & (g["sleep_strict"] == True)).sum()) if "sleep_v1" in g else None
        sleep_tbl.append({
            "lang": lg, "n": int(len(g)), "sleep_share_v1": None if v1s is None else round(v1s, 4),
            "sleep_share_v2": round(v2s, 4), "lost_v1_not_v2": flip, "gained_v2_not_v1": gain,
        })

    # samples
    rng = np.random.default_rng(SEED)

    def sample_df(frame, n, cols):
        if len(frame) == 0:
            return pd.DataFrame(columns=cols)
        idx = rng.choice(len(frame), size=min(n, len(frame)), replace=False)
        return frame.iloc[idx][cols]

    cols_basic = ["title", "class", "tier", "matched_human", "matched_ambient", "duration_sec"]
    labelled = out[out["class"] == "asmr_labelled"]
    for tier, n, path in [("A", 10, "class_check_v2_A.csv"), ("B", 10, "class_check_v2_B.csv"), ("C", 10, "class_check_v2_C.csv")]:
        sample_df(labelled[labelled["tier"] == tier], n, cols_basic).to_csv(
            DATA / path, index=False, encoding="utf-8-sig"
        )
        print(f"  wrote {path}", flush=True)

    amb = out[out["class"] == "ambient_labelled_asmr"]
    sample_df(amb, 20, ["title", "class", "matched_ambient", "duration_sec"]).to_csv(
        DATA / "class_check_v2_ambient.csv", index=False, encoding="utf-8-sig"
    )
    sleep_pos = out[out["sleep_strict"] == True]
    sleep_lost = out[(out["sleep_v1"] == True) & (out["sleep_strict"] == False)] if "sleep_v1" in out else out.iloc[0:0]
    s1 = sample_df(sleep_pos, 20, ["title", "sleep_strict", "sleep_terms", "duration_sec"])
    s1["bucket"] = "sleep_v2"
    s2 = sample_df(sleep_lost, 10, ["title", "sleep_strict", "sleep_terms", "duration_sec"])
    s2["bucket"] = "sleep_v1_not_v2"
    pd.concat([s1, s2], ignore_index=True).to_csv(DATA / "class_check_v2_sleep.csv", index=False, encoding="utf-8-sig")

    other_ht = out[(out["class"] == "other") & (out["has_human_trigger"] == True) & (out["has_asmr_label"] == False)]
    sample_df(other_ht, 20, ["title", "class", "matched_human", "duration_sec"]).to_csv(
        DATA / "class_check_v2_other.csv", index=False, encoding="utf-8-sig"
    )
    print("  wrote ambient/sleep/other samples", flush=True)

    # docs
    lines = [
        "# Classification rules v2",
        "",
        "## Definitions",
        "",
        "- **asmr_labelled**: ASMR/ear-care label in title/tags/description **and** not ambient under v2.",
        "- **Tier A**: label + human trigger + no strong ambient words.",
        "- **Tier B**: label only (no human trigger).",
        "- **Tier C**: label + human trigger + ambient/nature words present (but not ambient-classified because triggers block nature-title rule; strong ambient still forces ambient class).",
        "- **ambient_labelled_asmr**: has label + (strong ambient anywhere **or** nature words in **title** with no human/object trigger).",
        "- **noise_not_asmr**: ambient rule without ASMR label.",
        "- **Sleep v2**: sleep terms in TITLE or TAGS, or ≥2 distinct terms in description only.",
        "",
        "Generic nature words only in tags/description no longer make a video ambient.",
        "",
        "## Before / after counts",
        "",
        f"v1: {ct_v1}",
        f"v2: {ct_v2}",
        f"asmr_labelled tiers: {out.loc[out['class']=='asmr_labelled','tier'].value_counts().to_dict()}",
        "",
        "## Rescued leak patterns",
        "",
        "| pattern | n title match | asmr_labelled v2 | ambient v2 | was ambient v1 | rescued |",
        "|---|---:|---:|---:|---:|---:|",
    ]
    for k, v in rescue_report.items():
        lines.append(
            f"| {k} | {v['n_match_title']} | {v['n_asmr_labelled_v2']} | {v['n_ambient_v2']} | "
            f"{v['n_was_ambient_v1']} | {v['n_rescued']} |"
        )
    lines += [
        "",
        "## 20 largest moves (by duration)",
        "",
        "| title | move | tier | duration |",
        "|---|---|---|---:|",
    ]
    for _, r in top_moves.iterrows():
        title = str(r["title"]).replace("|", "/")[:120]
        lines.append(f"| {title} | {r['move']} | {r['tier']} | {r['duration_sec']} |")

    lines += [
        "",
        "## Sleep share v1 vs v2 by language",
        "",
        "Note: lexicon coverage differs by script (Hangul has very few terms); "
        "**cross-language sleep shares are not comparable**.",
        "",
        "| lang | n | sleep_share_v1 | sleep_share_v2 | lost v1→not v2 | gained |",
        "|---|---:|---:|---:|---:|---:|",
    ]
    for r in sleep_tbl:
        lines.append(
            f"| {r['lang']} | {r['n']} | {r['sleep_share_v1']} | {r['sleep_share_v2']} | "
            f"{r['lost_v1_not_v2']} | {r['gained_v2_not_v1']} |"
        )
    lines += [
        "",
        "## Samples (for manual judgement; not judged here)",
        "",
        "- `data/class_check_v2_A.csv` / `_B.csv` / `_C.csv` (10 each)",
        "- `data/class_check_v2_ambient.csv` (20)",
        "- `data/class_check_v2_sleep.csv` (20 sleep v2 + 10 v1-not-v2)",
        "- `data/class_check_v2_other.csv` (20 other + human trigger, no label)",
        "",
    ]
    (DOCS / "CLASS_RULES_V2.md").write_text("\n".join(lines), encoding="utf-8")
    print(f"wrote {DOCS / 'CLASS_RULES_V2.md'}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
