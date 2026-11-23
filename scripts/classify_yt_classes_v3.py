#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Classify yt_master with v3 rules → data/yt_classes_v3.csv + class_check_v3_*.csv
+ docs/CLASS_RULES_V3.md. Local data; no web/.
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
CFG = ROOT / "config" / "yt_classes_v3.yaml"
DOCS = ROOT / "docs"
SEED = 42
LONG_B_SEC = 10800


def load_cfg(path: Path) -> dict:
    with path.open(encoding="utf-8") as f:
        return yaml.safe_load(f)


def has_any(text: str, terms: list[str]) -> bool:
    tl = text.lower()
    return any(t.lower() in tl for t in terms if t)


def matched(text: str, terms: list[str]) -> list[str]:
    tl = text.lower()
    return [t for t in terms if t and t.lower() in tl]


def sleep_hits(text: str, cfg: dict) -> list[str]:
    latin = cfg.get("sleep_strict_latin", [])
    substr = cfg.get("sleep_strict_substring", [])
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


def sleep_v2_flag(title: str, tags: str, desc: str, cfg: dict) -> tuple[bool, list[str]]:
    title_h = sleep_hits(title, cfg)
    tags_h = sleep_hits(tags, cfg)
    desc_h = sleep_hits(desc, cfg)
    if title_h or tags_h:
        return True, sorted(set(title_h + tags_h + desc_h))
    if len(set(desc_h)) >= 2:
        return True, sorted(set(desc_h))
    return False, desc_h


def sleep_title_flag(title: str, cfg: dict) -> tuple[bool, list[str]]:
    h = sleep_hits(title, cfg)
    return bool(h), sorted(set(h))


def classify_v3(row, cfg: dict) -> dict:
    title = str(row.get("title") or "").lower()
    tags = str(row.get("tags") or "").lower()
    desc = str(row.get("description_short") or "").lower()
    topics = str(row.get("topicCategories") or "").lower()
    hay = " ".join([title, tags, desc, topics])
    dur = row.get("duration_sec")
    try:
        dur_f = float(dur) if dur is not None and str(dur) != "" and not (isinstance(dur, float) and np.isnan(dur)) else np.nan
    except (TypeError, ValueError):
        dur_f = np.nan

    has_label = has_any(hay, cfg["asmr_label"])
    has_human = has_any(hay, cfg["human_trigger"])
    has_object = has_any(hay, cfg["object_action_trigger"])
    has_strong = has_any(hay, cfg["strong_ambient"])
    nature_title = has_any(title, cfg["nature_title_only"])
    nature_ambient = bool(nature_title and not has_human and not has_object)

    is_ambient = bool(has_strong or nature_ambient)
    sleep_v2, sleep_terms = sleep_v2_flag(title, tags, desc, cfg)
    sleep_title, sleep_title_terms = sleep_title_flag(title, cfg)

    if has_label and not is_ambient:
        klass = "asmr_labelled"
        ambient_words = has_any(hay, cfg["nature_title_only"]) or has_any(hay, cfg["strong_ambient"])
        if not has_human:
            tier = "B"
        elif ambient_words:
            tier = "C"
        else:
            tier = "A"
    elif has_label and is_ambient:
        klass = "ambient_labelled_asmr"
        tier = ""
    elif (not has_label) and is_ambient:
        klass = "noise_not_asmr"
        tier = ""
    else:
        klass = "other"
        tier = ""

    long_b = bool(klass == "asmr_labelled" and tier == "B" and np.isfinite(dur_f) and dur_f >= LONG_B_SEC)

    return {
        "has_asmr_label": has_label,
        "has_human_trigger": has_human,
        "has_strong_ambient": has_strong,
        "nature_title_ambient": nature_ambient,
        "is_ambient_v3": is_ambient,
        "sleep_title": sleep_title,
        "sleep_title_terms": "|".join(sleep_title_terms),
        "sleep_v2": sleep_v2,
        "sleep_terms": "|".join(sleep_terms),
        "class": klass,
        "tier": tier,
        "long_B": long_b,
        "matched_human": "|".join(matched(hay, cfg["human_trigger"])[:12]),
        "matched_ambient": "|".join(
            matched(hay, cfg["strong_ambient"]) + matched(title, cfg["nature_title_only"])
        )[:200],
        "matched_nature_anywhere": "|".join(matched(hay, cfg["nature_title_only"]))[:200],
    }


def lang_group(dl, ts) -> str:
    sys.path.insert(0, str(ROOT / "scripts"))
    from fetch_comments import language_group
    return language_group(str(dl or ""), str(ts or ""))


def main() -> int:
    cfg = load_cfg(CFG)
    global LONG_B_SEC
    LONG_B_SEC = int(cfg.get("long_b_duration_sec", 10800))

    usecols = [
        "videoId", "channelId", "title", "tags", "description_short",
        "topicCategories", "duration_sec", "defaultLanguage", "title_script",
    ]
    print("Loading yt_master…", flush=True)
    yt = pd.read_csv(DATA / "yt_master.csv", encoding="utf-8-sig", usecols=usecols, low_memory=False)
    yt["duration_sec"] = pd.to_numeric(yt["duration_sec"], errors="coerce")

    print("Classifying v3…", flush=True)
    rows = []
    for r in yt.itertuples(index=False):
        rows.append(classify_v3({
            "title": r.title, "tags": r.tags, "description_short": r.description_short,
            "topicCategories": getattr(r, "topicCategories", ""),
            "duration_sec": r.duration_sec,
        }, cfg))
    cls = pd.DataFrame(rows)
    out = pd.concat(
        [yt[["videoId", "title", "duration_sec", "defaultLanguage", "title_script"]].reset_index(drop=True), cls],
        axis=1,
    )

    v2_path = DATA / "yt_classes_v2.csv"
    if v2_path.exists():
        v2 = pd.read_csv(
            v2_path, encoding="utf-8-sig",
            usecols=["videoId", "class", "tier", "sleep_strict"],
        )
        v2 = v2.rename(columns={"class": "class_v2", "tier": "tier_v2", "sleep_strict": "sleep_v2_file"})
        out = out.merge(v2, on="videoId", how="left")
    else:
        out["class_v2"] = ""
        out["tier_v2"] = ""

    out_path = DATA / "yt_classes_v3.csv"
    out.to_csv(out_path, index=False, encoding="utf-8-sig")
    print(f"wrote {out_path} ({len(out):,})", flush=True)
    print("v3 class:\n", out["class"].value_counts().to_string())
    print("tiers:\n", out.loc[out["class"] == "asmr_labelled", "tier"].value_counts().to_string())
    print(f"long_B: {int(out['long_B'].sum())}", flush=True)

    ct_v2 = out["class_v2"].value_counts().to_dict() if "class_v2" in out else {}
    ct_v3 = out["class"].value_counts().to_dict()
    tiers_v2 = out.loc[out["class_v2"] == "asmr_labelled", "tier_v2"].value_counts().to_dict() if "tier_v2" in out else {}
    tiers_v3 = out.loc[out["class"] == "asmr_labelled", "tier"].value_counts().to_dict()

    # moves v2 → v3
    changed = out[out["class_v2"].fillna("") != out["class"].fillna("")].copy()
    changed["move"] = changed["class_v2"].astype(str) + "→" + changed["class"].astype(str)
    top_moves = changed.nlargest(20, "duration_sec")[
        ["title", "move", "tier", "duration_sec", "matched_human", "matched_ambient"]
    ]

    # Korean rain videos from v2 largest-moves list (titles containing 빗소리)
    v2_doc = (DOCS / "CLASS_RULES_V2.md").read_text(encoding="utf-8") if (DOCS / "CLASS_RULES_V2.md").exists() else ""
    kr_rain_titles = []
    for line in v2_doc.splitlines():
        if "빗소리" in line and "→" in line:
            # table row: | title | move | ...
            parts = line.split("|")
            if len(parts) >= 3:
                kr_rain_titles.append(parts[1].strip())
    kr_now_ambient = 0
    for t in kr_rain_titles:
        hit = out[out["title"].fillna("").str.contains(re.escape(t[:40]), regex=True, na=False)]
        if len(hit) and (hit.iloc[0]["class"] == "ambient_labelled_asmr" or hit.iloc[0]["class"] == "noise_not_asmr"):
            kr_now_ambient += 1
    # also count by 빗소리 in changed from asmr_labelled v2
    bit = out[out["title"].fillna("").str.contains("빗소리", na=False)]
    bit_v2_asmr = bit[bit["class_v2"] == "asmr_labelled"] if "class_v2" in bit else bit.iloc[0:0]
    bit_now_amb = int((bit_v2_asmr["class"] == "ambient_labelled_asmr").sum()) if len(bit_v2_asmr) else 0

    out["lang"] = [
        lang_group(a, b) for a, b in zip(out["defaultLanguage"], out["title_script"])
    ]
    sleep_tbl = []
    for lg in ["en", "ja", "zh", "ko", "es", "fr"]:
        g = out[out["lang"] == lg]
        if len(g) == 0:
            continue
        st = int(g["sleep_title"].sum())
        sv = int(g["sleep_v2"].sum())
        only_v2 = int(((g["sleep_v2"] == True) & (g["sleep_title"] == False)).sum())
        sleep_tbl.append({
            "lang": lg, "n": int(len(g)),
            "sleep_title_n": st, "sleep_title_share": round(st / len(g), 4),
            "sleep_v2_n": sv, "sleep_v2_share": round(sv / len(g), 4),
            "sleep_v2_only": only_v2,
        })

    # samples
    rng = np.random.default_rng(SEED)

    def sample_df(frame, n, cols):
        if len(frame) == 0:
            return pd.DataFrame(columns=cols)
        idx = rng.choice(len(frame), size=min(n, len(frame)), replace=False)
        return frame.iloc[idx][cols]

    labelled = out[out["class"] == "asmr_labelled"]
    amb = out[out["class"] == "ambient_labelled_asmr"]
    sample_df(amb, 20, ["title", "class", "matched_ambient", "duration_sec"]).to_csv(
        DATA / "class_check_v3_ambient.csv", index=False, encoding="utf-8-sig"
    )

    # non-Latin nature word anywhere among asmr_labelled
    nonlatin_nature = [
        t for t in cfg["nature_title_only"]
        if any(ord(ch) > 127 for ch in t)
    ]
    def has_nonlatin_nature(hay: str) -> bool:
        return has_any(hay, nonlatin_nature)

    labelled_hay = (
        labelled["title"].fillna("") + " " + out.set_index("videoId").reindex(labelled["videoId"])["matched_nature_anywhere"].fillna("")
    )
    # rebuild hay from out
    nonlat = labelled[labelled["matched_nature_anywhere"].fillna("").astype(str).str.len() > 0].copy()
    # filter to rows whose matched_nature includes a non-latin term
    def row_nonlatin(s: str) -> bool:
        if not s:
            return False
        parts = str(s).split("|")
        return any(any(ord(ch) > 127 for ch in p) for p in parts if p)

    nonlat = labelled[labelled["matched_nature_anywhere"].map(row_nonlatin)]
    sample_df(nonlat, 20, ["title", "class", "tier", "matched_nature_anywhere", "duration_sec"]).to_csv(
        DATA / "class_check_v3_nonlatin_nature.csv", index=False, encoding="utf-8-sig"
    )

    longb = labelled[labelled["long_B"] == True]
    sample_df(longb, 20, ["title", "class", "tier", "duration_sec", "matched_human"]).to_csv(
        DATA / "class_check_v3_longB.csv", index=False, encoding="utf-8-sig"
    )

    st_pos = out[out["sleep_title"] == True]
    st_only_v2 = out[(out["sleep_v2"] == True) & (out["sleep_title"] == False)]
    s1 = sample_df(st_pos, 20, ["title", "sleep_title", "sleep_v2", "sleep_title_terms", "sleep_terms", "duration_sec"])
    s1["bucket"] = "sleep_title"
    s2 = sample_df(st_only_v2, 10, ["title", "sleep_title", "sleep_v2", "sleep_title_terms", "sleep_terms", "duration_sec"])
    s2["bucket"] = "sleep_v2_not_title"
    pd.concat([s1, s2], ignore_index=True).to_csv(
        DATA / "class_check_v3_sleep_title.csv", index=False, encoding="utf-8-sig"
    )

    sample_df(
        labelled[labelled["tier"] == "A"], 10,
        ["title", "class", "tier", "matched_human", "matched_ambient", "duration_sec"],
    ).to_csv(DATA / "class_check_v3_A.csv", index=False, encoding="utf-8-sig")
    print("  wrote class_check_v3_*.csv samples", flush=True)

    # docs
    def fmt_list(xs):
        return ", ".join(f"`{x}`" for x in xs)

    lines = [
        "# Classification rules v3",
        "",
        "## Definitions",
        "",
        "- **asmr_labelled**: ASMR/ear-care label and not ambient under v3.",
        "- **Tier A**: label + human trigger + no strong/nature ambient words in haystack.",
        "- **Tier B**: label only (no human trigger).",
        "- **Tier C**: label + human trigger + ambient/nature words present (but not ambient-classified).",
        "- **ambient_labelled_asmr**: label + (strong ambient anywhere **or** nature in **title** with no human/object trigger).",
        "- **noise_not_asmr**: ambient rule without ASMR label.",
        "- **long_B**: tier B AND duration ≥ 3 hours (10800 s). Flag only; not reclassified; **excluded from duration charts**.",
        "- **sleep_title**: sleep term in the **TITLE** only (primary).",
        "- **sleep_v2**: title/tags, or ≥2 distinct terms in description (secondary robustness).",
        "",
        "Bare microphone words (`binaural`, `3dio`, `雙耳`/`双耳`) are **not** strong ambient; keep `binaural beats`, `isochronic`, brainwave/脑波/腦波, `432 hz`.",
        "",
        "## Strong ambient list (final)",
        "",
        fmt_list(cfg["strong_ambient"]),
        "",
        "## Nature title-only list (final)",
        "",
        fmt_list(cfg["nature_title_only"]),
        "",
        "## Before / after counts (v2 → v3)",
        "",
        f"v2 classes: {ct_v2}",
        f"v3 classes: {ct_v3}",
        f"v2 asmr_labelled tiers: {tiers_v2}",
        f"v3 asmr_labelled tiers: {tiers_v3}",
        f"long_B count: **{int(out['long_B'].sum())}**",
        "",
        "## 20 largest moves (v2 → v3, by duration)",
        "",
        "| title | move | tier | duration |",
        "|---|---|---|---:|",
    ]
    for _, r in top_moves.iterrows():
        title = str(r["title"]).replace("|", "/")[:120]
        lines.append(f"| {title} | {r['move']} | {r['tier']} | {r['duration_sec']} |")

    lines += [
        "",
        f"Korean `빗소리` titles from v2 largest-moves list parsed: n={len(kr_rain_titles)}; "
        f"now ambient among those: **{kr_now_ambient}**. "
        f"All title-containing `빗소리` that were asmr_labelled in v2 and ambient in v3: **{bit_now_amb}**.",
        "",
        "## Sleep title vs sleep_v2 by language",
        "",
        "Note: lexicon coverage differs by script (Hangul has very few terms); "
        "**cross-language sleep shares are not comparable**.",
        "",
        "| lang | n | sleep_title n | share | sleep_v2 n | share | sleep_v2 only |",
        "|---|---:|---:|---:|---:|---:|---:|",
    ]
    for r in sleep_tbl:
        lines.append(
            f"| {r['lang']} | {r['n']} | {r['sleep_title_n']} | {r['sleep_title_share']} | "
            f"{r['sleep_v2_n']} | {r['sleep_v2_share']} | {r['sleep_v2_only']} |"
        )
    lines += [
        "",
        "## Samples (for manual judgement; not judged here)",
        "",
        "- `data/class_check_v3_ambient.csv` (20)",
        "- `data/class_check_v3_nonlatin_nature.csv` (20)",
        "- `data/class_check_v3_longB.csv` (20)",
        "- `data/class_check_v3_sleep_title.csv` (20 sleep_title + 10 sleep_v2-not-title)",
        "- `data/class_check_v3_A.csv` (10)",
        "",
    ]
    (DOCS / "CLASS_RULES_V3.md").write_text("\n".join(lines), encoding="utf-8")
    print(f"wrote {DOCS / 'CLASS_RULES_V3.md'}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
