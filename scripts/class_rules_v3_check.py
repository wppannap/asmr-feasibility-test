#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Classification v3 → v3.1 checks → docs/CLASS_RULES_V3_CHECK.md + class_check_v31_*.csv.

Local data only; does not touch web/. Commits docs/scripts/config only.
"""
from __future__ import annotations

import inspect
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import yaml

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
DOCS = ROOT / "docs"
CFG_PATH = ROOT / "config" / "yt_classes_v3.yaml"
SEED = 42

sys.path.insert(0, str(ROOT / "scripts"))
import classify_yt_classes_v3 as C  # noqa: E402


def load_cfg() -> dict:
    with CFG_PATH.open(encoding="utf-8") as f:
        return yaml.safe_load(f)


def substr_match(text: str, term: str) -> bool:
    return bool(term) and term.lower() in text.lower()


def word_match(text: str, term: str) -> bool:
    return C.term_matches(text.lower(), term)


def demo_latin_false_positives() -> list[str]:
    cases = [
        ("rain", ["rain", "brain", "train", "terrain", "drain", "grain"]),
        ("water", ["water", "waterfall", "underwater"]),
        ("waves", ["waves", "microwaves"]),
        ("regen", ["regen", "regeneration"]),
        ("vacuum", ["vacuum", "vacuum cleaner noise"]),
        ("heartbeat", ["heartbeat", "heartbeat sounds"]),
    ]
    lines = ["### Latin false-positive probes (substring vs whole-word)", ""]
    for term, texts in cases:
        lines.append(f"**`{term}`**")
        for tx in texts:
            s = substr_match(tx, term)
            w = word_match(tx, term)
            lines.append(f"- `{tx}`: substring={s}, whole_word={w}")
        lines.append("")
    return lines


def count_substr_not_word(titles: pd.Series, term: str) -> tuple[int, pd.Series]:
    t = titles.fillna("").astype(str)
    sub = t.map(lambda x: substr_match(x, term))
    word = t.map(lambda x: word_match(x, term))
    only = sub & ~word
    return int(only.sum()), t[only]


def classify_frame(yt: pd.DataFrame, cfg: dict) -> pd.DataFrame:
    rows = []
    for r in yt.itertuples(index=False):
        rows.append(
            C.classify_v3(
                {
                    "title": r.title,
                    "tags": r.tags,
                    "description_short": r.description_short,
                    "topicCategories": getattr(r, "topicCategories", ""),
                    "duration_sec": r.duration_sec,
                },
                cfg,
            )
        )
    cls = pd.DataFrame(rows)
    return pd.concat(
        [
            yt[["videoId", "title", "duration_sec", "defaultLanguage", "title_script"]].reset_index(
                drop=True
            ),
            cls,
        ],
        axis=1,
    )


def v3_ambient_flags_old(title: str, tags: str, desc: str, topics: str, cfg_old: dict) -> dict:
    """Reproduce v3 substring matching with pre-v3.1 term lists for move counts."""
    hay = " ".join([title, tags, desc, topics]).lower()
    title_lc = title.lower()

    def has(terms, text=hay):
        return any(t.lower() in text for t in terms if t)

    has_label = has(cfg_old["asmr_label"])
    has_human = has(cfg_old["human_trigger"])
    has_object = has(cfg_old["object_action_trigger"])
    has_strong = has(cfg_old["strong_ambient"])
    nature_title = has(cfg_old["nature_title_only"], title_lc)
    nature_ambient = bool(nature_title and not has_human and not has_object)
    is_ambient = bool(has_strong or nature_ambient)
    if has_label and not is_ambient:
        klass = "asmr_labelled"
    elif has_label and is_ambient:
        klass = "ambient_labelled_asmr"
    elif (not has_label) and is_ambient:
        klass = "noise_not_asmr"
    else:
        klass = "other"
    return {"class": klass, "has_strong": has_strong, "nature_ambient": nature_ambient}


def old_cfg_from_v3_doc_lists() -> dict:
    """Rebuild pre-v3.1 lists: bare vacuum/heartbeat + 作業用, substring matching implied."""
    cfg = load_cfg()
    # restore removed terms for the "before" side of move counts
    strong = list(cfg["strong_ambient"])
    if "vacuum" not in [s.lower() for s in strong]:
        # insert after vacuum noise if present
        strong = [t for t in strong if t != "vacuum cleaner noise"]
        if "vacuum noise" in strong:
            i = strong.index("vacuum noise")
            strong.insert(i + 1, "vacuum")
        else:
            strong.append("vacuum")
    if "heartbeat" not in [s.lower() for s in strong]:
        strong.append("heartbeat")
    nature = list(cfg["nature_title_only"])
    if "作業用" not in nature:
        # put back near Japanese block
        if "自然音" in nature:
            i = nature.index("自然音")
            # may be Chinese or Japanese; append Japanese 作業用 after last 自然音
            idxs = [j for j, t in enumerate(nature) if t == "自然音"]
            nature.insert(idxs[-1] + 1, "作業用")
        else:
            nature.append("作業用")
    cfg = dict(cfg)
    cfg["strong_ambient"] = strong
    cfg["nature_title_only"] = nature
    return cfg


def sleep_table_lingua(out: pd.DataFrame) -> tuple[list[dict], str]:
    """Recompute sleep table on asmr_labelled (excl long_B) with YT_EXPLORE lingua lang."""
    note = (
        "Doc CLASS_RULES_V3.md used `language_group(defaultLanguage, title_script)` "
        "from `fetch_comments.language_group` on **all** classified rows (not asmr_labelled), "
        "so language n can exceed asmr_labelled and the six language n sum above the labelled frame. "
        "This recompute uses lingua-based `lang` from `explore_yt_v3.detect_languages` "
        "(cache `data/unpublished/v3yt/lang_cache.parquet` or equivalent) on "
        "**asmr_labelled ∩ ¬long_B** only."
    )
    labelled = out[(out["class"] == "asmr_labelled") & (out["long_B"] != True)].copy()
    cache_paths = [
        ROOT / "data" / "unpublished" / "v3yt" / "lang_cache.parquet",
        ROOT / "data" / "unpublished" / "v3" / "lang_cache.parquet",
        ROOT / "data" / "lang_cache.parquet",
    ]
    cache = next((p for p in cache_paths if p.exists()), None)
    if cache is None:
        # try explore OUT
        for p in (ROOT / "data").rglob("lang_cache.parquet"):
            cache = p
            break
    if cache is None:
        return [], note + " **No lang_cache.parquet found; table empty.**"
    lang = pd.read_parquet(cache)
    labelled = labelled.merge(lang[["videoId", "lang"]], on="videoId", how="left")
    labelled["lang"] = labelled["lang"].fillna("und")
    rows = []
    for lg in ["en", "ja", "zh", "ko", "es", "fr"]:
        g = labelled[labelled["lang"] == lg]
        if len(g) == 0:
            continue
        st = int(g["sleep_title"].sum())
        sv = int(g["sleep_v2"].sum())
        only_v2 = int(((g["sleep_v2"] == True) & (g["sleep_title"] == False)).sum())
        rows.append(
            {
                "lang": lg,
                "n": int(len(g)),
                "sleep_title_n": st,
                "sleep_title_share": round(st / len(g), 4),
                "sleep_v2_n": sv,
                "sleep_v2_share": round(sv / len(g), 4),
                "sleep_v2_only": only_v2,
            }
        )
    return rows, note + f" Cache: `{cache.relative_to(ROOT)}`."


def fetch_wb_pop(iso2_list: list[str]) -> dict[str, float]:
    """iso2 → SP.POP.TOTL (latest)."""
    import json
    import urllib.request

    out: dict[str, float] = {}
    # batch via country/all is heavy; use per-iso2 mrnev=1
    for iso2 in iso2_list:
        url = (
            f"https://api.worldbank.org/v2/country/{iso2}/indicator/SP.POP.TOTL"
            f"?format=json&mrnev=1"
        )
        try:
            with urllib.request.urlopen(url, timeout=30) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
            rows = payload[1] if isinstance(payload, list) and len(payload) > 1 else None
            if rows and rows[0].get("value") is not None:
                out[iso2] = float(rows[0]["value"])
        except Exception as exc:  # noqa: BLE001
            print(f"  WB pop fail {iso2}: {exc}", flush=True)
    return out


def small_pop_geos() -> list[str]:
    import json

    lines = ["## Ok Trends geos with population < 1 million", ""]
    raw = json.loads((DATA / "unpublished" / "v3" / "trends_country_v3c.json").read_text())
    tr = pd.DataFrame(raw["rows"] if isinstance(raw, dict) else raw)
    ok = tr[tr["quality"] == "ok"].copy()
    iso2s = sorted({str(g) for g in ok["geo"].dropna().unique()})
    print(f"Fetching WB SP.POP.TOTL for {len(iso2s)} ok geos…", flush=True)
    pops = fetch_wb_pop(iso2s)
    ok["population"] = ok["geo"].map(lambda g: pops.get(str(g)))
    small = ok[ok["population"].notna() & (ok["population"] < 1_000_000)].copy()
    lines.append(
        f"Source: World Bank `SP.POP.TOTL` (mrnev=1). Count ok ∩ pop<1e6: **{len(small)}** "
        f"(pop available for {ok['population'].notna().sum()} / {len(ok)} ok geos)."
    )
    lines.append("")
    lines.append(
        "| iso3 | name | population | quality | mean_first_12 | growth_ratio | mk_class | strict_ok |"
    )
    lines.append("|---|---|---:|---|---:|---:|---|---|")
    for _, r in small.sort_values("population").iterrows():
        lines.append(
            f"| {r['iso3']} | {r.get('name','')} | {int(r['population'])} | {r.get('quality')} | "
            f"{r.get('mean_first_12')} | {r.get('growth_ratio')} | {r.get('mk_class')} | {r.get('strict_ok')} |"
        )

    def headline(frame: pd.DataFrame) -> str:
        mk = frame["mk_class"].value_counts()
        gr = pd.to_numeric(frame["growth_ratio"], errors="coerce")
        med = float(gr.median()) if gr.notna().any() else float("nan")
        return (
            f"n={len(frame)} rising={int(mk.get('rising',0))} flat={int(mk.get('flat',0))} "
            f"falling={int(mk.get('falling',0))} median_growth={med:.4f}"
        )

    with_ = headline(ok)
    without = headline(ok[~ok["iso3"].isin(set(small["iso3"]))])
    lines += [
        "",
        f"- Headline **with** small-pop geos: {with_}",
        f"- Headline **without** small-pop geos: {without}",
        "",
    ]
    return lines

def main() -> int:
    cfg_new = load_cfg()
    cfg_old = old_cfg_from_v3_doc_lists()

    lines: list[str] = [
        "# Classification rules v3 check → v3.1",
        "",
        "## 1. Term-matching code (v3.1)",
        "",
        "```python",
        inspect.getsource(C.term_is_cjk_or_hangul),
        inspect.getsource(C.term_matches),
        inspect.getsource(C.has_any),
        inspect.getsource(C.matched),
        "```",
        "",
    ]
    lines += demo_latin_false_positives()

    print("Loading titles for substring-not-word counts…", flush=True)
    usecols = [
        "videoId",
        "channelId",
        "title",
        "tags",
        "description_short",
        "topicCategories",
        "duration_sec",
        "defaultLanguage",
        "title_script",
    ]
    yt = pd.read_csv(DATA / "yt_master.csv", encoding="utf-8-sig", usecols=usecols, low_memory=False)
    yt["duration_sec"] = pd.to_numeric(yt["duration_sec"], errors="coerce")
    titles = yt["title"]

    lines += ["### Title counts: substring match but not whole-word (Latin probes)", ""]
    lines.append("| term | substr_not_word_n |")
    lines.append("|---|---:|")
    probe_terms = ["rain", "water", "waves", "regen", "vacuum", "heartbeat"]
    rain_only = None
    for term in probe_terms:
        n, ser = count_substr_not_word(titles, term)
        lines.append(f"| {term} | {n} |")
        print(f"  substr_not_word {term}: {n}", flush=True)
        if term == "rain":
            rain_only = ser

    lines += [
        "",
        "v3 used substring (`t.lower() in text.lower()`) for **all** ambient/nature/human lists. "
        "v3.1 switches Latin-script terms to Unicode-aware whole-word matching; "
        "CJK and Hangul keep substring matching.",
        "",
        "## 2. Lexicon edits",
        "",
        "- Removed bare `vacuum` from strong ambient (kept `vacuum noise`, added `vacuum cleaner noise`).",
        "- Removed bare `heartbeat` (kept `heartbeat sounds` / `heartbeat sound`; `womb sounds` unchanged).",
        "- Removed `作業用` from nature title-only (study-BGM cue, not nature).",
        "",
    ]

    # --- classify v3.1 ---
    print("Classifying v3.1…", flush=True)
    out_new = classify_frame(yt, cfg_new)
    out_new_path = DATA / "yt_classes_v3_1.csv"
    out_new.to_csv(out_new_path, index=False, encoding="utf-8-sig")
    print(f"wrote {out_new_path}", flush=True)

    # load v3 for before/after (prefer saved file; else reconstruct with old cfg+substr)
    v3_path = DATA / "yt_classes_v3.csv"
    if v3_path.exists():
        out_old = pd.read_csv(
            v3_path,
            encoding="utf-8-sig",
            usecols=["videoId", "title", "class", "tier", "long_B", "sleep_title", "sleep_v2", "duration_sec"],
            low_memory=False,
        )
        out_old = out_old.rename(columns={"class": "class_v3", "tier": "tier_v3", "long_B": "long_B_v3",
                                          "sleep_title": "sleep_title_v3", "sleep_v2": "sleep_v2_v3"})
    else:
        print("Rebuilding v3 with old lists+substring…", flush=True)
        # temporary monkeypatch
        old_has, old_matched = C.has_any, C.matched

        def has_any_sub(text, terms):
            tl = text.lower()
            return any(t.lower() in tl for t in terms if t)

        def matched_sub(text, terms):
            tl = text.lower()
            return [t for t in terms if t and t.lower() in tl]

        C.has_any = has_any_sub
        C.matched = matched_sub
        rebuilt = classify_frame(yt, cfg_old)
        C.has_any, C.matched = old_has, old_matched
        out_old = rebuilt.rename(
            columns={
                "class": "class_v3",
                "tier": "tier_v3",
                "long_B": "long_B_v3",
                "sleep_title": "sleep_title_v3",
                "sleep_v2": "sleep_v2_v3",
            }
        )[
            ["videoId", "title", "class_v3", "tier_v3", "long_B_v3", "sleep_title_v3", "sleep_v2_v3", "duration_sec"]
        ]

    cmp = out_new.merge(
        out_old[["videoId", "class_v3", "tier_v3", "long_B_v3"]],
        on="videoId",
        how="left",
    )
    cmp["moved"] = cmp["class_v3"].fillna("") != cmp["class"].fillna("")

    print("Computing vacuum/heartbeat/作業用 moves…", flush=True)
    hay = (
        yt["title"].fillna("").astype(str)
        + " "
        + yt["tags"].fillna("").astype(str)
        + " "
        + yt["description_short"].fillna("").astype(str)
        + " "
        + yt["topicCategories"].fillna("").astype(str)
    ).str.lower()
    vac_bare = (
        hay.str.contains("vacuum", regex=False)
        & ~hay.str.contains("vacuum noise", regex=False)
        & ~hay.str.contains("vacuum cleaner noise", regex=False)
    )
    hb_bare = hay.str.contains("heartbeat", regex=False) & ~hay.str.contains(
        "heartbeat sound", regex=False
    )
    sagyo = yt["title"].fillna("").astype(str).str.contains("作業用", regex=False)

    vac_moved = cmp.loc[vac_bare.to_numpy() & cmp["moved"].to_numpy()]
    hb_moved = cmp.loc[hb_bare.to_numpy() & cmp["moved"].to_numpy()]
    sagyo_moved = cmp.loc[sagyo.to_numpy() & cmp["moved"].to_numpy()]

    # also count any class change involving these removals even if other changes co-occur
    lines += [
        "### Move counts (class changed v3 → v3.1 among videos hitting removed terms)",
        "",
        f"- Bare `vacuum` (not `vacuum noise` / `vacuum cleaner noise`) & class moved: **{len(vac_moved)}**",
        f"- Bare `heartbeat` (not `heartbeat sound*`) & class moved: **{len(hb_moved)}**",
        f"- Title contains `作業用` & class moved: **{len(sagyo_moved)}**",
        "",
        "#### 10 example titles — vacuum moves",
        "",
    ]
    for t in vac_moved["title"].head(10).tolist():
        lines.append(f"- {str(t)[:160]}")
    if len(vac_moved) == 0:
        lines.append("- (none)")
    lines += ["", "#### 10 example titles — heartbeat moves", ""]
    for t in hb_moved["title"].head(10).tolist():
        lines.append(f"- {str(t)[:160]}")
    if len(hb_moved) == 0:
        lines.append("- (none)")
    lines += ["", "#### 10 example titles — 作業用 moves", ""]
    for t in sagyo_moved["title"].head(10).tolist():
        lines.append(f"- {str(t)[:160]}")
    if len(sagyo_moved) == 0:
        lines.append("- (none)")

    # direction examples: ambient→labelled and labelled→ambient
    def ten_each_way(sub: pd.DataFrame, label: str) -> list[str]:
        out_l = [f"##### {label}: ambient→asmr_labelled", ""]
        a2l = sub[
            sub["class_v3"].isin(["ambient_labelled_asmr", "noise_not_asmr"])
            & (sub["class"] == "asmr_labelled")
        ]
        for t in a2l["title"].head(10).tolist():
            out_l.append(f"- {str(t)[:160]}")
        if len(a2l) == 0:
            out_l.append("- (none)")
        out_l += ["", f"##### {label}: asmr_labelled→ambient/noise", ""]
        l2a = sub[
            (sub["class_v3"] == "asmr_labelled")
            & sub["class"].isin(["ambient_labelled_asmr", "noise_not_asmr"])
        ]
        for t in l2a["title"].head(10).tolist():
            out_l.append(f"- {str(t)[:160]}")
        if len(l2a) == 0:
            out_l.append("- (none)")
        out_l.append("")
        return out_l

    lines += ten_each_way(vac_moved, "vacuum")
    lines += ten_each_way(hb_moved, "heartbeat")
    lines += ten_each_way(sagyo_moved, "作業用")

    # --- sleep language ---
    lines += ["## 3. Sleep title vs sleep_v2 by language", ""]
    from fetch_comments import language_group as lg_fn

    lines += [
        "### Language-assignment code used in CLASS_RULES_V3.md",
        "",
        "```python",
        inspect.getsource(lg_fn),
        "```",
        "",
        "### Lingua-based assignment (YT_EXPLORE)",
        "",
        "```python",
        # short pointer — full detect_languages is long
        "# from explore_yt_v3 import detect_languages  # lingua + YT hint, conf>=0.8",
        "```",
        "",
    ]
    sleep_rows, sleep_note = sleep_table_lingua(out_new)
    lines += [sleep_note, ""]
    lines += [
        "| lang | n | sleep_title n | share | sleep_v2 n | share | sleep_v2 only |",
        "|---|---:|---:|---:|---:|---:|---:|",
    ]
    for r in sleep_rows:
        lines.append(
            f"| {r['lang']} | {r['n']} | {r['sleep_title_n']} | {r['sleep_title_share']} | "
            f"{r['sleep_v2_n']} | {r['sleep_v2_share']} | {r['sleep_v2_only']} |"
        )
    if sleep_rows:
        lines.append(f"\nSix-language n sum (asmr_labelled excl long_B): **{sum(r['n'] for r in sleep_rows)}**.")

    # --- before/after table ---
    ct_v3 = cmp["class_v3"].value_counts().to_dict()
    ct_v31 = cmp["class"].value_counts().to_dict()
    tiers_v3 = cmp.loc[cmp["class_v3"] == "asmr_labelled", "tier_v3"].value_counts().to_dict()
    tiers_v31 = cmp.loc[cmp["class"] == "asmr_labelled", "tier"].value_counts().to_dict()
    lines += [
        "",
        "## 4. Before / after counts (v3 → v3.1)",
        "",
        f"v3 classes: {ct_v3}",
        f"v3.1 classes: {ct_v31}",
        f"v3 asmr_labelled tiers: {tiers_v3}",
        f"v3.1 asmr_labelled tiers: {tiers_v31}",
        f"rows with class change: **{int(cmp['moved'].sum())}**",
        f"long_B v3.1: **{int(out_new['long_B'].sum())}**",
        "",
    ]

    # samples
    rng = np.random.default_rng(SEED)

    def sample_titles(series: pd.Series, n: int) -> pd.DataFrame:
        s = series.drop_duplicates()
        if len(s) == 0:
            return pd.DataFrame({"title": []})
        idx = rng.choice(len(s), size=min(n, len(s)), replace=False)
        return pd.DataFrame({"title": s.iloc[idx].tolist()})

    rain_df = sample_titles(rain_only, 20) if rain_only is not None else pd.DataFrame({"title": []})
    rain_df.to_csv(DATA / "class_check_v31_rain_word.csv", index=False, encoding="utf-8-sig")
    sample_titles(vac_moved["title"], 10).to_csv(
        DATA / "class_check_v31_vacuum.csv", index=False, encoding="utf-8-sig"
    )
    sample_titles(hb_moved["title"], 10).to_csv(
        DATA / "class_check_v31_heartbeat.csv", index=False, encoding="utf-8-sig"
    )
    print("  wrote class_check_v31_*.csv", flush=True)

    lines += [
        "## Samples (titles only; not judged)",
        "",
        "- `data/class_check_v31_rain_word.csv` — 20 titles matched by `rain` as substring but not whole-word under v3 rules",
        "- `data/class_check_v31_vacuum.csv` — 10 titles (bare vacuum class movers)",
        "- `data/class_check_v31_heartbeat.csv` — 10 titles (bare heartbeat class movers)",
        "",
    ]

    lines += small_pop_geos()

    DOCS.mkdir(exist_ok=True)
    path = DOCS / "CLASS_RULES_V3_CHECK.md"
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"wrote {path}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
