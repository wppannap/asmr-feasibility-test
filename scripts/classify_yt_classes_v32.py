#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Classification v3.2: white-noise title_only vs strict; nature inflections; script groups.

Writes data/yt_classes_v32.csv, docs/CLASS_RULES_V32.md, class_check_v32_*.csv,
data/script_check.csv. Local data only.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import yaml

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import classify_yt_classes_v3 as C  # noqa: E402

DATA = ROOT / "data"
DOCS = ROOT / "docs"
CFG_V3 = ROOT / "config" / "yt_classes_v3.yaml"
CFG_V32 = ROOT / "config" / "yt_classes_v32.yaml"
SEED = 42
LONG_B_SEC = 10800

HANGUL_RE = re.compile(r"[\u1100-\u11FF\uAC00-\uD7AF]")
KANA_RE = re.compile(r"[\u3040-\u30FF\uFF66-\uFF9D]")
HAN_RE = re.compile(r"[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]")
LATIN_RE = re.compile(r"[A-Za-z\u00C0-\u024F]")


def load_cfg() -> dict:
    base = C.load_cfg(CFG_V3)
    extra = yaml.safe_load(CFG_V32.read_text(encoding="utf-8"))
    base["white_noise_family"] = list(extra["white_noise_family"])
    # nature = v3 nature + inflections (dedupe, keep order)
    seen = set()
    nature = []
    for t in list(base["nature_title_only"]) + list(extra.get("nature_inflections") or []):
        if t and t not in seen:
            seen.add(t)
            nature.append(t)
    base["nature_title_only"] = nature
    # strong ambient excluding white-noise family for "other strong" anywhere
    wn = {t.lower() for t in base["white_noise_family"]}
    base["strong_other"] = [t for t in base["strong_ambient"] if t.lower() not in wn]
    return base


def title_script_group(title: str) -> str:
    t = str(title or "")
    has_hangul = bool(HANGUL_RE.search(t))
    has_kana = bool(KANA_RE.search(t))
    has_han = bool(HAN_RE.search(t))
    has_latin = bool(LATIN_RE.search(t))
    if has_hangul:
        return "Korean script"
    if has_kana:
        return "Japanese script"
    if has_han and not has_hangul and not has_kana:
        return "Han script (mostly Chinese)"
    if has_latin and not has_hangul and not has_kana and not has_han:
        return "Latin script"
    return "other"


def classify_v32(row, cfg: dict) -> dict:
    title_raw = str(row.get("title") or "")
    title = title_raw.lower()
    tags = str(row.get("tags") or "").lower()
    desc = str(row.get("description_short") or "").lower()
    topics = str(row.get("topicCategories") or "").lower()
    tags_desc = " ".join([tags, desc, topics])
    hay = " ".join([title, tags_desc])
    dur = row.get("duration_sec")
    try:
        dur_f = float(dur) if dur is not None and str(dur) != "" and not (
            isinstance(dur, float) and np.isnan(dur)
        ) else np.nan
    except (TypeError, ValueError):
        dur_f = np.nan

    has_label = C.has_any(hay, cfg["asmr_label"])
    has_human = C.has_any(hay, cfg["human_trigger"])
    has_object = C.has_any(hay, cfg["object_action_trigger"])

    wn = cfg["white_noise_family"]
    wn_title = C.has_any(title, wn)
    wn_tags = C.has_any(tags_desc, wn) and not wn_title
    other_strong = C.has_any(hay, cfg["strong_other"])
    nature_title = C.has_any(title, cfg["nature_title_only"])
    nature_ambient = bool(nature_title and not has_human and not has_object)

    # STRICT: white-noise family anywhere OR other strong OR nature-title ambient
    is_ambient_strict = bool(wn_title or wn_tags or other_strong or nature_ambient)
    # TITLE_ONLY: white-noise only if in title; tags-only → ambient_tag_only (not ambient)
    ambient_tag_only = bool(has_label and wn_tags and not wn_title and not other_strong and not nature_ambient)
    is_ambient_title = bool(wn_title or other_strong or nature_ambient)

    sleep_v2, sleep_terms = C.sleep_v2_flag(title, tags, desc, cfg)
    sleep_title, sleep_title_terms = C.sleep_title_flag(title, cfg)
    script = title_script_group(title_raw)

    def pack(is_ambient: bool, tag_only: bool) -> tuple[str, str, bool]:
        if has_label and not is_ambient:
            klass = "asmr_labelled"
            ambient_words = (
                C.has_any(hay, cfg["nature_title_only"])
                or C.has_any(hay, cfg["strong_ambient"])
            )
            if not has_human:
                tier = "B"
            elif ambient_words or tag_only:
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
        long_b = bool(
            klass == "asmr_labelled" and tier == "B" and np.isfinite(dur_f) and dur_f >= LONG_B_SEC
        )
        return klass, tier, long_b

    c_s, t_s, lb_s = pack(is_ambient_strict, False)
    c_t, t_t, lb_t = pack(is_ambient_title, ambient_tag_only)

    return {
        "script_group": script,
        "sleep_title": sleep_title,
        "sleep_title_terms": "|".join(sleep_title_terms),
        "sleep_v2": sleep_v2,
        "sleep_terms": "|".join(sleep_terms),
        "wn_title": wn_title,
        "wn_tags_only": wn_tags,
        "ambient_tag_only": ambient_tag_only,
        "nature_title_ambient": nature_ambient,
        "other_strong_ambient": other_strong,
        # strict
        "class_strict": c_s,
        "tier_strict": t_s,
        "long_B_strict": lb_s,
        # title_only
        "class_title_only": c_t,
        "tier_title_only": t_t,
        "long_B_title_only": lb_t,
        # convenience aliases (default = title_only for downstream "v3.2")
        "class": c_t,
        "tier": t_t,
        "long_B": lb_t,
        "matched_wn": "|".join(C.matched(hay, wn)[:12]),
        "matched_nature": "|".join(C.matched(title, cfg["nature_title_only"])[:12]),
        "matched_human": "|".join(C.matched(hay, cfg["human_trigger"])[:12]),
    }


def main() -> int:
    cfg = load_cfg()
    usecols = [
        "videoId", "channelId", "title", "tags", "description_short",
        "topicCategories", "duration_sec", "defaultLanguage", "defaultAudioLanguage",
        "title_script",
    ]
    print("Loading yt_master…", flush=True)
    yt = pd.read_csv(DATA / "yt_master.csv", encoding="utf-8-sig", usecols=lambda c: c in usecols, low_memory=False)
    # ensure columns
    for c in usecols:
        if c not in yt.columns:
            yt[c] = ""
    yt["duration_sec"] = pd.to_numeric(yt["duration_sec"], errors="coerce")

    # baseline v3.1 (current classify_v3 with updated yaml = before inflections/title_only)
    # For inflection move counts: classify with nature WITHOUT inflections vs WITH
    cfg_no_infl = C.load_cfg(CFG_V3)
    extra = yaml.safe_load(CFG_V32.read_text(encoding="utf-8"))
    infl = list(extra.get("nature_inflections") or [])

    print("Classifying v3.2…", flush=True)
    rows = []
    for r in yt.itertuples(index=False):
        rows.append(classify_v32({
            "title": r.title, "tags": r.tags, "description_short": r.description_short,
            "topicCategories": getattr(r, "topicCategories", ""),
            "duration_sec": r.duration_sec,
        }, cfg))
    cls = pd.DataFrame(rows)
    out = pd.concat([
        yt[["videoId", "channelId", "title", "duration_sec",
            "defaultLanguage", "defaultAudioLanguage"]].reset_index(drop=True),
        cls,
    ], axis=1)

    # self-declared language field (separate)
    out["declared_language"] = out["defaultAudioLanguage"].fillna("").astype(str)
    mask = out["declared_language"].str.strip() == ""
    out.loc[mask, "declared_language"] = out.loc[mask, "defaultLanguage"].fillna("").astype(str)
    out.loc[out["declared_language"].str.strip() == "", "declared_language"] = ""

    out_path = DATA / "yt_classes_v32.csv"
    out.to_csv(out_path, index=False, encoding="utf-8-sig")
    print(f"wrote {out_path} ({len(out):,})", flush=True)

    # --- counts ---
    def class_counts(col):
        return out[col].value_counts().to_dict()

    def tier_counts(class_col, tier_col):
        return out.loc[out[class_col] == "asmr_labelled", tier_col].value_counts().to_dict()

    def sleep_share(class_col, long_col):
        lab = out[(out[class_col] == "asmr_labelled") & (out[long_col] != True)]
        if len(lab) == 0:
            return None
        return round(float(lab["sleep_title"].mean()), 4)

    ct_strict = class_counts("class_strict")
    ct_title = class_counts("class_title_only")
    tiers_s = tier_counts("class_strict", "tier_strict")
    tiers_t = tier_counts("class_title_only", "tier_title_only")
    n_tag_only = int(out["ambient_tag_only"].sum())

    # per-tier change strict → title_only among labelled
    def labelled(rule):
        if rule == "strict":
            return out[out["class_strict"] == "asmr_labelled"].copy()
        return out[out["class_title_only"] == "asmr_labelled"].copy()

    # videos newly kept under title_only (ambient under strict, labelled under title_only)
    newly_kept = out[
        (out["class_strict"].isin(["ambient_labelled_asmr", "noise_not_asmr"]))
        & (out["class_title_only"] == "asmr_labelled")
    ]
    print(f"newly kept under title_only: {len(newly_kept)} (ambient_tag_only flag n={n_tag_only})", flush=True)

    # inflection moves: compare nature match with/without inflections on TITLE using v3.1 strong rules
    print("Computing inflection moves…", flush=True)
    titles = yt["title"].fillna("").astype(str)
    nature_base = list(cfg_no_infl["nature_title_only"])
    nature_new = cfg["nature_title_only"]

    def nature_hit(series, terms):
        return series.map(lambda t: C.has_any(t.lower(), terms))

    hit_base = nature_hit(titles, nature_base)
    hit_new = nature_hit(titles, nature_new)
    # Newly excluded: nature inflection causes ambient when base would not
    # Approximate: title hits new nature, not base; and would be ambient under title_only nature rule
    newly_nature = out.loc[hit_new.to_numpy() & ~hit_base.to_numpy()].copy()
    # among these, those that become ambient_labelled / noise due to nature alone
    moved_to_ambient = newly_nature[
        newly_nature["nature_title_ambient"]
        & newly_nature["class_title_only"].isin(["ambient_labelled_asmr", "noise_not_asmr"])
    ]
    # reverse: rare
    print(f"titles with new inflection hits: {int((hit_new & ~hit_base).sum())}", flush=True)
    print(f"moved to ambient via inflections: {len(moved_to_ambient)}", flush=True)

    # samples
    rng = np.random.default_rng(SEED)

    def sample_titles(frame, n, path):
        if len(frame) == 0:
            pd.DataFrame({"title": []}).to_csv(path, index=False, encoding="utf-8-sig")
            return
        idx = rng.choice(len(frame), size=min(n, len(frame)), replace=False)
        frame.iloc[idx][["title"]].to_csv(path, index=False, encoding="utf-8-sig")

    sample_titles(newly_kept, 20, DATA / "class_check_v32_ambient_tag_only.csv")
    sample_titles(moved_to_ambient, 20, DATA / "class_check_v32_inflect.csv")

    # script_check: 30 titles per group over asmr_labelled (title_only, excl long_B)
    lab = out[(out["class_title_only"] == "asmr_labelled") & (out["long_B_title_only"] != True)]
    script_dist = lab["script_group"].value_counts().to_dict()
    parts = []
    for g in ["Korean script", "Japanese script", "Han script (mostly Chinese)", "Latin script", "other"]:
        sub = lab[lab["script_group"] == g]
        if len(sub) == 0:
            continue
        idx = rng.choice(len(sub), size=min(30, len(sub)), replace=False)
        s = sub.iloc[idx][["title"]].copy()
        s.insert(0, "script_group", g)
        parts.append(s)
    pd.concat(parts, ignore_index=True).to_csv(DATA / "script_check.csv", index=False, encoding="utf-8-sig")
    print("wrote script_check.csv + class_check_v32_*.csv", flush=True)

    # 10 titles each way for inflections
    to_amb_ex = moved_to_ambient["title"].head(10).tolist()
    # "other way": labelled that would have matched base rain etc. — skip; show newly kept with inflection? 
    # User: 10 titles each way for moved videos by inflections
    # way1: newly ambient via inflection; way2: if any leave ambient — unlikely. Use titles that hit inflection but stay labelled (human trigger)
    stay_lab = newly_nature[
        newly_nature["class_title_only"] == "asmr_labelled"
    ]
    stay_ex = stay_lab["title"].head(10).tolist()

    # tier change table
    # map videoId → tiers
    merge_t = out[["videoId", "class_strict", "tier_strict", "class_title_only", "tier_title_only"]]
    # among videos labelled in either rule, count tier transitions
    both = merge_t[
        (merge_t["class_strict"] == "asmr_labelled") | (merge_t["class_title_only"] == "asmr_labelled")
    ].copy()
    both["tier_s"] = both["tier_strict"].where(both["class_strict"] == "asmr_labelled", "—")
    both["tier_t"] = both["tier_title_only"].where(both["class_title_only"] == "asmr_labelled", "—")
    tier_moves = both.groupby(["tier_s", "tier_t"]).size().reset_index(name="n")

    lines = [
        "# Classification rules v3.2",
        "",
        "## Rules",
        "",
        "- **White-noise family** (white/brown/pink/green noise, 白噪音, binaural beats, isochronic, brainwave, 432 hz, fan/hair-dryer noise, womb sounds, …):",
        "  - **strict**: exclude (ambient) if the family appears **anywhere** (title/tags/description/topics).",
        "  - **title_only**: exclude only if in the **TITLE**; if only in tags/description → keep in `asmr_labelled` and set `ambient_tag_only`.",
        "- Other strong ambient (vacuum noise, heartbeat sounds, …) still exclude **anywhere** under both rules.",
        "- Nature list remains **title-only**; v3.2 adds inflections (rainy, rainfall, thunderstorm(s), waterfall(s), seaside, …).",
        "- Latin terms: Unicode whole-word; CJK/Hangul: substring (unchanged).",
        "- **Script group** (title-based; replaces lingua for downstream): Hangul→Korean script; kana→Japanese script; Han without kana/Hangul→Han script (mostly Chinese); Latin letters only→Latin script; else→other. `declared_language` = defaultAudioLanguage/defaultLanguage when present.",
        "- Do **not** use da / tl / und language labels.",
        "",
        "## White-noise family list",
        "",
        ", ".join(f"`{t}`" for t in cfg["white_noise_family"]),
        "",
        "## Nature inflections added",
        "",
        ", ".join(f"`{t}`" for t in infl),
        "",
        "## Counts: strict vs title_only",
        "",
        f"strict classes: {ct_strict}",
        f"title_only classes: {ct_title}",
        f"strict asmr_labelled tiers: {tiers_s}",
        f"title_only asmr_labelled tiers: {tiers_t}",
        f"ambient_tag_only flag (title_only rule): **{n_tag_only}**",
        f"videos ambient→asmr_labelled under title_only: **{len(newly_kept)}**",
        f"sleep_title share among asmr_labelled excl long_B — strict: **{sleep_share('class_strict','long_B_strict')}**; title_only: **{sleep_share('class_title_only','long_B_title_only')}**",
        "",
        "### Tier transitions (strict tier → title_only tier; — = not labelled under that rule)",
        "",
        "| tier_strict | tier_title_only | n |",
        "|---|---|---:|",
    ]
    for _, r in tier_moves.sort_values("n", ascending=False).iterrows():
        lines.append(f"| {r['tier_s']} | {r['tier_t']} | {int(r['n'])} |")

    lines += [
        "",
        "## Inflection moves",
        "",
        f"Titles matching a new inflection but not the pre-v3.2 nature list: **{int((hit_new & ~hit_base).sum())}**.",
        f"Of those, nature-ambient classified (→ ambient/noise) under title_only: **{len(moved_to_ambient)}**.",
        f"Of those, remaining asmr_labelled (human/object trigger present): **{len(stay_lab)}**.",
        "",
        "### 10 titles newly ambient via inflections",
        "",
    ]
    for t in to_amb_ex:
        lines.append(f"- {str(t)[:160]}")
    if not to_amb_ex:
        lines.append("- (none)")
    lines += ["", "### 10 titles with new inflection hits that stay asmr_labelled", ""]
    for t in stay_ex:
        lines.append(f"- {str(t)[:160]}")
    if not stay_ex:
        lines.append("- (none)")

    lines += [
        "",
        "## Script groups (asmr_labelled title_only, excl long_B)",
        "",
        f"Distribution: {script_dist}",
        "",
        "Sample: `data/script_check.csv` (30 titles per group; not judged).",
        "",
        "## Samples (titles only; not judged)",
        "",
        "- `data/class_check_v32_ambient_tag_only.csv` (20 newly kept under title_only)",
        "- `data/class_check_v32_inflect.csv` (20 newly excluded by inflections)",
        "",
        f"Output frame: `data/yt_classes_v32.csv` (n={len(out):,}).",
        "",
    ]
    DOCS.mkdir(exist_ok=True)
    (DOCS / "CLASS_RULES_V32.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"wrote {DOCS / 'CLASS_RULES_V32.md'}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
