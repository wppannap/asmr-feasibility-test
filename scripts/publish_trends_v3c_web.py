#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Publish Trends v3c to web/data/ + correlations_v3c.json; archive v2 payloads.
Also regenerates docs/TRENDS_V3_TREND.md via trends_v3_trend (canonical strict_ok=82).
"""
from __future__ import annotations

import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import build_web_data as B  # noqa: E402
import build_trends_v3 as V3  # noqa: E402
from trends_v3_trend import partial_spearman, holm2  # noqa: E402

DATA = ROOT / "data"
UNPUB = DATA / "unpublished" / "v3"
WEB = ROOT / "web" / "data"
ARCHIVE = DATA / "archive_not_published"
SEED = 42
BOOT_N = 2000


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def dump(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"  wrote {path.relative_to(ROOT)} ({path.stat().st_size:,} bytes)", flush=True)


def main() -> int:
    B.require_scipy()
    # 1) rebuild unpublished v3c with population gate, then TREND doc
    print("Re-running build_trends_v3c (pop gate)…", flush=True)
    import build_trends_v3c as V3C
    rc = V3C.main()
    if rc != 0:
        return rc

    print("Re-running trends_v3_trend for TRENDS_V3_TREND.md…", flush=True)
    import trends_v3_trend as T
    rc = T.main()
    if rc != 0:
        return rc

    src = json.loads((UNPUB / "trends_country_v3c.json").read_text())
    monthly = json.loads((UNPUB / "trends_monthly_v3c.json").read_text())

    # Rebuild correlations from v3c rows + indicators
    ind = pd.read_csv(DATA / "indicators_country_v3.csv", encoding="utf-8-sig")
    ind["iso3"] = ind["iso3"].astype(str).str.upper()

    def pick(iso3: str, code: str):
        hit = ind[(ind["iso3"] == iso3) & (ind["indicator_code"] == code)]
        if hit.empty:
            return None
        v = hit.iloc[0]["value"]
        if pd.isna(v) or v == "":
            return None
        return float(v)

    rows = []
    for r in src["rows"]:
        if r.get("quality") != "ok":
            continue
        rows.append({
            **r,
            "internet": pick(r["iso3"], "IT.NET.USER.ZS"),
            "youth": pick(r["iso3"], "DERIVED.POP.1524.ZS"),
        })
    rdf = pd.DataFrame(rows)

    def family(frame: pd.DataFrame, seed0: int) -> dict:
        raw = {
            "growth_vs_internet": B.spearman(frame["growth_ratio"], frame["internet"], seed=seed0),
            "growth_vs_youth": B.spearman(frame["growth_ratio"], frame["youth"], seed=seed0 + 1),
        }
        part = {
            "growth_vs_internet": partial_spearman(
                frame["growth_ratio"], frame["internet"], frame["noise"], seed0 + 10
            ),
            "growth_vs_youth": partial_spearman(
                frame["growth_ratio"], frame["youth"], frame["noise"], seed0 + 11
            ),
        }
        keys = ["growth_vs_internet", "growth_vs_youth"]
        holm2(raw, keys)
        holm2(part, keys)
        return {"raw": raw, "partial_noise": part}

    families = {
        "ok_with_TWN": family(rdf, SEED + 100),
        "ok_excl_TWN": family(rdf[rdf["iso3"] != "TWN"], SEED + 200),
        "strict_ok_with_TWN": family(rdf[rdf["strict_ok"] == True], SEED + 300),
        "strict_ok_excl_TWN": family(
            rdf[(rdf["strict_ok"] == True) & (rdf["iso3"] != "TWN")], SEED + 400
        ),
    }

    # Patch TRENDS_V3_TREND.md note about what changed
    doc = ROOT / "docs" / "TRENDS_V3_TREND.md"
    text = doc.read_text(encoding="utf-8")
    note = (
        "\n## Changelog (canonical strict-ok)\n\n"
        "Recomputed with canonical `strict_ok` (no `float(zw or 1)` bug). "
        f"**strict-ok n = {int((rdf['strict_ok']==True).sum())}** (was wrongly 22 in an earlier TREND.md). "
        "MK counts and correlation tables below use this definition. "
        "See `docs/TRENDS_V3C.md` for the 22-vs-82 explanation.\n"
    )
    if "## Changelog (canonical strict-ok)" not in text:
        # insert after first heading block
        lines = text.splitlines()
        # find end of intro
        insert_at = 3
        lines = lines[:insert_at] + note.splitlines() + lines[insert_at:]
        doc.write_text("\n".join(lines) + "\n", encoding="utf-8")
        print("  patched TRENDS_V3_TREND.md changelog", flush=True)

    # Page country payload — slim fields + rich meta
    meta_src = src["meta"]
    mk = meta_src["counts_by_mk_class"]
    gr = meta_src["growth_ratio_ok"]
    page_rows = []
    for r in src["rows"]:
        page_rows.append({
            "iso3": r["iso3"],
            "geo": r.get("geo"),
            "name": r.get("name"),
            "growth_ratio": r.get("growth_ratio"),
            "growth_ratio_clipped": r.get("growth_ratio_clipped"),
            "mk_class": r.get("mk_class"),
            "relative_slope_pct_per_year": r.get("relative_slope_pct_per_year"),
            "quality": r.get("quality"),
            "strict_ok": bool(r.get("strict_ok")),
            "mean_first_12": r.get("mean_first_12"),
            **({"quality_reason": r["quality_reason"]} if r.get("quality_reason") else {}),
        })

    # geos that cannot be drawn on countries-50m — compute vs topo numeric map via iso.js isn't available;
    # use same ISO3 set as verify (fetch_topo) later; here list small territories known missing from world-atlas
    # Defer full list to verify print; store placeholder from meta not_in_v3 + known misses
    page_meta = {
        "source_files": [
            "data/unpublished/v3/trends_country_v3c.json",
            "data/indicators_country_v3.csv",
        ],
        "generated_at": now_iso(),
        "version": "v3c",
        "metric": "growth_ratio",
        "colour_metric": "growth_ratio_clipped",
        "colour_range": [-0.5, 1.5],
        "colour_range_pct": [-50, 150],
        "counts": {
            "ok": meta_src["counts"]["ok"],
            "low_volume": meta_src["counts"]["low_volume"],
            "not_in_v3": meta_src["counts"]["not_in_v3"],
            "china_not_measured": meta_src["counts"]["china_not_measured"],
            "strict_ok": meta_src["counts"]["strict_ok"],
        },
        "counts_by_mk_class": mk,
        "growth_ratio_ok": gr,
        "not_in_v3": meta_src.get("not_in_v3", []),
        "not_measured": meta_src.get("not_measured", []),
        "pop_gate": meta_src.get("pop_gate", {}),
        "map1_caption": (
            f"Measured (ok)={meta_src['counts']['ok']}; "
            f"low volume={meta_src['counts']['low_volume']}; "
            f"not measured (empty series)={meta_src['counts']['not_in_v3']}; "
            f"China not measured={meta_src['counts']['china_not_measured']}. "
            f"Among ok: rising={mk['rising']}, flat={mk['flat']}, falling={mk['falling']}. "
            f"Median growth={gr['median']}; IQR={gr['iqr']}."
        ),
        "map1_legend": {
            "solid": "Measured with significant trend",
            "hatch_flat": "No statistically significant trend (Mann-Kendall, BH q = 0.05)",
            "low_volume": "Too few searches to measure",
            "no_data": "No data",
            "china": "Not measured: Google is not accessible there",
            "clip_note": "Colour uses growth clipped to −50% … +150%; values outside that range are clipped.",
        },
        "caveats": [
            "Growth = average of the latest 12 months divided by the first 12 months of Nov 2021 - Oct 2026, minus 1, from Google Trends values; Trends is a sample; small bases inflate ratios; only the Latin-script term ASMR is measured",
            "Mainland China is not measured: Google is not accessible there.",
            "Colour scale uses growth_ratio_clipped in [-0.5, 1.5]; reported value is growth_ratio.",
            "Ok geos require World Bank (or Taiwan official) population ≥ 1,000,000; smaller or unknown populations are low_volume.",
        ],
        "window": "Nov 2021 to Oct 2026",
    }
    dump(WEB / "trends_country_v3c.json", {"meta": page_meta, "rows": page_rows})

    # monthly — ok only already
    monthly_out = {
        "meta": {
            **monthly["meta"],
            "source_files": ["data/unpublished/v3/trends_monthly_v3c.json"],
            "generated_at": now_iso(),
            "caveats": [
                "Each region relative to its own peak.",
                "ok geos only; low_volume / not measured shown as grey on the map.",
            ],
            "map2_caption": "each region relative to its own peak",
        },
        "months": monthly["months"],
        "countries": monthly["countries"],
        "series": monthly["series"],
    }
    dump(WEB / "trends_monthly_v3c.json", monthly_out)

    corr = {
        "meta": {
            "source_files": [
                "data/unpublished/v3/trends_country_v3c.json",
                "data/indicators_country_v3.csv",
            ],
            "generated_at": now_iso(),
            "pairs": ["growth_vs_internet", "growth_vs_youth"],
            "frames": list(families.keys()),
            "caveats": [
                "Association between a region's search trend and a context indicator; not evidence about who uses ASMR; Trends indices cannot be compared across regions in level",
                "Holm adjustment over the 2 pairs within each block (raw and partial separately).",
                "Partial Spearman controls for noise.",
            ],
            "note": "Pairs are growth versus internet use and growth versus youth share only.",
        },
        "families": families,
        # scatter points for "View as chart" — growth vs internet on ok
        "scatter_points": [
            {
                "iso3": r["iso3"],
                "name": r.get("name"),
                "growth_ratio": r.get("growth_ratio"),
                "internet": r.get("internet"),
                "youth": r.get("youth"),
                "strict_ok": bool(r.get("strict_ok")),
            }
            for r in rows
            if r.get("growth_ratio") is not None
        ],
    }
    dump(WEB / "correlations_v3c.json", corr)

    # archive v2
    ARCHIVE.mkdir(parents=True, exist_ok=True)
    for name in ("trends_country_v2.json", "trends_monthly_v2.json", "insomnia_vs_asmr.json"):
        src_p = WEB / name
        if src_p.exists():
            dest = ARCHIVE / name
            shutil.move(str(src_p), str(dest))
            print(f"  archived {name} → data/archive_not_published/", flush=True)

    print("Publish done.", flush=True)
    print("MK ok", mk, "strict_ok n", page_meta["counts"]["strict_ok"], flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
