#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Build trends_country_v3c.json + trends_monthly_v3c.json and docs/TRENDS_V3C.md.

Canonical strict_ok (used here):
  quality == 'ok'
  AND zero_week_share is not None AND float(zero_week_share) < 0.2
  AND int(n_distinct_values) >= 30

Do NOT use `float(x or 1)` — that treats a true zero share as missing and under-counts
strict_ok (22 instead of 82). See docs/TRENDS_V3C.md.
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import pymannkendall as mk
from scipy import stats

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import build_web_data as B  # noqa: E402
import build_trends_v3 as V3  # noqa: E402
from trends_v3_trend import theil_sen_slope, bh_adjust  # noqa: E402
from trends_pop_gate import load_populations, passes_pop_gate, REASON as POP_REASON  # noqa: E402

DATA = ROOT / "data"
UNPUB = DATA / "unpublished" / "v3"
DOCS = ROOT / "docs"
BH_Q = 0.05
CLIP_LO, CLIP_HI = -0.5, 1.5


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def dump(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"  wrote {path.relative_to(ROOT)}", flush=True)


def is_strict_ok(meta: dict) -> bool:
    """Canonical definition — never coerce 0.0 via `or 1`."""
    if meta.get("quality") != "ok":
        return False
    zw = meta.get("zero_week_share")
    if zw is None:
        return False
    try:
        zw_f = float(zw)
    except (TypeError, ValueError):
        return False
    nd = meta.get("n_distinct_values")
    try:
        nd_i = int(nd) if nd is not None else 0
    except (TypeError, ValueError):
        nd_i = 0
    return zw_f < 0.2 and nd_i >= 30


def buggy_strict_ok(meta: dict) -> bool:
    """The TREND.md bug: float(zero_week_share or 1) treats 0.0 as missing."""
    return (
        meta.get("quality") == "ok"
        and float(meta.get("zero_week_share") or 1) < 0.2
        and int(meta.get("n_distinct_values") or 0) >= 30
    )


def main() -> int:
    B.require_scipy()
    iso2_to_iso3, iso2_to_name = V3.geo_maps()
    weekly = V3.load_weekly()
    v3 = json.loads((UNPUB / "trends_country_v3.json").read_text())
    v3_rows = {r["geo"]: r for r in v3["rows"]}
    complete_months = [
        m for m in sorted(set(weekly["month"].astype(str).unique()) - set(B.TRENDS_PARTIAL_MONTHS))
        if "2021-11" <= m <= "2026-10"
    ]
    if len(complete_months) > 60:
        complete_months = [
            m for m in complete_months
            if B.WINDOW_FIRST_12[0] <= m <= B.WINDOW_RECENT_12[-1]
        ]

    # geos in fetch config but not in v3 rows (empty series)
    geo_cfg = json.loads((ROOT / "config" / "trends_asmr_geos.json").read_text())
    cfg_geos = []
    for g in geo_cfg.get("geos", []):
        if isinstance(g, dict):
            cfg_geos.append(g.get("iso2") or g.get("geo"))
        else:
            cfg_geos.append(g)
    not_in_v3 = sorted({
        str(g) for g in cfg_geos
        if g and str(g) not in v3_rows and str(g) != "CN"
    })

    # China not measured
    china = {"geo": "CN", "iso3": "CHN", "name": iso2_to_name.get("CN", "China"),
             "status": "not_measured", "reason": "Google Trends not accessible in mainland China"}

    results_ok = []
    all_rows = []
    own_peak_ok = {}
    low_volume = []
    pop_downgraded = []

    print("Loading populations for ok-gate (WB SP.POP.TOTL + Taiwan official)…", flush=True)
    pops = load_populations([m["iso3"] for m in v3_rows.values()])

    for geo, meta in v3_rows.items():
        iso3 = meta["iso3"]
        name = iso2_to_name.get(geo, meta.get("name") or "")
        quality = meta.get("quality")
        quality_reason = None
        # Population gate: ok requires known pop >= 1e6
        if quality == "ok" and not passes_pop_gate(iso3, pops):
            pop_downgraded.append({
                "geo": geo,
                "iso3": iso3,
                "name": name,
                "population": pops.get(str(iso3).upper()),
                "reason": POP_REASON,
            })
            quality = "low_volume"
            quality_reason = POP_REASON
        # Rebuild a meta view for strict_ok after possible downgrade
        meta_eff = dict(meta)
        meta_eff["quality"] = quality
        strict = is_strict_ok(meta_eff)
        noise = meta.get("noise")

        gdf = weekly[weekly["geo"].astype(str) == str(geo)]
        asmr_m = gdf.groupby("month", sort=True)["value"].mean() if len(gdf) else pd.Series(dtype=float)

        first = [float(asmr_m.loc[m]) for m in B.WINDOW_FIRST_12 if m in asmr_m.index]
        recent = [float(asmr_m.loc[m]) for m in B.WINDOW_RECENT_12 if m in asmr_m.index]
        mean_first = float(np.mean(first)) if len(first) == 12 else None
        if len(first) == 12 and len(recent) == 12 and mean_first and mean_first > 0:
            growth = float(np.mean(recent) / mean_first - 1.0)
        else:
            growth = None
        growth_clipped = None if growth is None else float(np.clip(growth, CLIP_LO, CLIP_HI))

        rel_slope = None
        mk_p = None
        slope = None

        if quality == "ok" and len(asmr_m):
            y = np.array([
                float(asmr_m.loc[m]) if m in asmr_m.index and pd.notna(asmr_m.loc[m]) else np.nan
                for m in complete_months
            ], float)
            if np.isfinite(y).sum() >= 24:
                y_filled = np.where(np.isfinite(y), y, np.nanmedian(y[np.isfinite(y)]))
                slope = theil_sen_slope(y_filled)
                mk_res = mk.hamed_rao_modification_test(y_filled)
                mk_p = float(mk_res.p)
                if mean_first and mean_first > 0:
                    rel_slope = slope * 12.0 / mean_first * 100.0
            peak = float(asmr_m.max()) if len(asmr_m) else 0.0
            own = (asmr_m / peak * 100.0) if peak > 0 else asmr_m * 0.0
            own_peak_ok[iso3] = {
                str(m): B.clean_num(float(own.loc[m])) if m in own.index else None
                for m in complete_months
            }
            if noise is None:
                complete_raw = asmr_m.reindex(complete_months).astype(float)
                diffs = complete_raw.diff().abs().dropna()
                med_abs = float(diffs.median()) if len(diffs) else np.nan
                med_val = float(complete_raw.median()) if complete_raw.notna().any() else np.nan
                noise = med_abs / med_val if med_val and med_val > 0 else None
            results_ok.append({"geo": geo, "iso3": iso3, "mk_p": mk_p, "slope": slope})
        elif quality == "low_volume":
            low_volume.append({
                "geo": geo, "iso3": iso3, "name": name,
                **({"quality_reason": quality_reason} if quality_reason else {}),
            })

        row = {
            "geo": geo,
            "iso3": iso3,
            "name": name,
            "growth_ratio": B.clean_num(growth) if growth is not None else None,
            "growth_ratio_clipped": B.clean_num(growth_clipped) if growth_clipped is not None else None,
            "mean_first_12": B.clean_num(mean_first) if mean_first is not None else None,
            "mk_class": None,  # filled after BH for ok
            "relative_slope_pct_per_year": B.clean_num(rel_slope) if rel_slope is not None and np.isfinite(rel_slope) else None,
            "quality": quality,
            "strict_ok": bool(strict),
            "noise": B.clean_num(noise) if noise is not None and np.isfinite(float(noise)) else None,
            "mk_p": B.clean_num(mk_p) if mk_p is not None else None,
            "theil_sen_slope_per_month": B.clean_num(slope) if slope is not None else None,
            "population": pops.get(str(iso3).upper()),
        }
        if quality_reason:
            row["quality_reason"] = quality_reason
        all_rows.append(row)

    # BH on ok only
    ok_idx = [i for i, r in enumerate(all_rows) if r["quality"] == "ok" and r["mk_p"] is not None]
    pvals = [float(all_rows[i]["mk_p"]) for i in ok_idx]
    sig = bh_adjust(pvals, BH_Q) if pvals else []
    for i, sflag in zip(ok_idx, sig):
        slope = all_rows[i]["theil_sen_slope_per_month"]
        if not sflag or slope is None:
            all_rows[i]["mk_class"] = "flat"
        elif float(slope) > 0:
            all_rows[i]["mk_class"] = "rising"
        elif float(slope) < 0:
            all_rows[i]["mk_class"] = "falling"
        else:
            all_rows[i]["mk_class"] = "flat"

    ok_rows = [r for r in all_rows if r["quality"] == "ok"]
    gr = pd.Series([r["growth_ratio"] for r in ok_rows if r["growth_ratio"] is not None], dtype=float)
    mk_counts = {
        "rising": sum(1 for r in ok_rows if r["mk_class"] == "rising"),
        "flat": sum(1 for r in ok_rows if r["mk_class"] == "flat"),
        "falling": sum(1 for r in ok_rows if r["mk_class"] == "falling"),
    }
    n_strict = sum(1 for r in all_rows if r["strict_ok"])
    n_strict_buggy = sum(1 for g, m in v3_rows.items() if buggy_strict_ok(m))

    not_measured = [{"geo": "CN", "iso3": "CHN", "name": china["name"], "reason": china["reason"]}]
    not_in_list = [{"geo": g, "iso3": iso2_to_iso3.get(g, ""), "name": iso2_to_name.get(g, "")}
                   for g in not_in_v3]

    meta = {
        "generated_at": now_iso(),
        "version": "v3c",
        "strict_ok_definition": (
            "quality=='ok' AND zero_week_share is not None AND float(zero_week_share)<0.2 "
            "AND int(n_distinct_values)>=30  "
            "(do NOT use `float(zero_week_share or 1)` — zeros are valid)"
        ),
        "counts": {
            "ok": len(ok_rows),
            "low_volume": len(low_volume),
            "not_in_v3": len(not_in_list),
            "china_not_measured": 1,
            "strict_ok": n_strict,
            "strict_ok_if_buggy_or1": n_strict_buggy,
            "pop_downgraded": len(pop_downgraded),
        },
        "counts_by_mk_class": mk_counts,
        "pop_gate": {
            "min_population": 1_000_000,
            "reason": POP_REASON,
            "downgraded": pop_downgraded,
        },
        "growth_ratio_ok": {
            "median": B.clean_num(float(gr.median())) if len(gr) else None,
            "iqr": [
                B.clean_num(float(gr.quantile(0.25))) if len(gr) else None,
                B.clean_num(float(gr.quantile(0.75))) if len(gr) else None,
            ],
            "min": B.clean_num(float(gr.min())) if len(gr) else None,
            "max": B.clean_num(float(gr.max())) if len(gr) else None,
        },
        "growth_ratio_clipped_range": [CLIP_LO, CLIP_HI],
        "bh_q": BH_Q,
        "caveats": [
            "growth_ratio_clipped is for colour scale only; report growth_ratio as the value.",
            "Mainland China not measured (Google inaccessible).",
            "not_in_v3 geos had empty Trends series at fetch.",
            "mk_class from Hamed-Rao MK + BH q=0.05 across ok geos.",
            "Not published to web/.",
        ],
        "not_in_v3": not_in_list,
        "not_measured": not_measured,
    }

    dump(UNPUB / "trends_country_v3c.json", {"meta": meta, "rows": all_rows})

    months = complete_months
    countries = sorted(own_peak_ok.keys())
    dump(UNPUB / "trends_monthly_v3c.json", {
        "meta": {
            "generated_at": now_iso(),
            "n_months": len(months),
            "n_countries_ok": len(countries),
            "series_keys": ["own_peak_asmr"],
            "version": "v3c",
            "note": "ok geos only; 60 complete months",
        },
        "months": months,
        "countries": countries,
        "series": {
            "own_peak_asmr": {c: [own_peak_ok[c].get(m) for m in months] for c in countries}
        },
    })

    # headline + top5 with mean_first_12
    top5 = sorted(
        [r for r in ok_rows if r["growth_ratio"] is not None],
        key=lambda r: -float(r["growth_ratio"]),
    )[:5]

    lines = [
        "# Trends v3c page payloads",
        "",
        f"_Generated {now_iso()}. Local only: `data/unpublished/v3/trends_country_v3c.json`, `trends_monthly_v3c.json`._",
        "",
        "## 1. Why strict-ok was 22 in TRENDS_V3_TREND.md but 82 in TRENDS_V3_FIX.md",
        "",
        "Same intended definition in both docs:",
        "",
        "> `quality == 'ok'` AND `zero_week_share < 0.2` AND `n_distinct_values >= 30`",
        "",
        "| source | code | n_strict_ok |",
        "|---|---|---:|",
        f"| `scripts/trends_v3_fix.py` (~L310) | `ok_mask & (ndf['zero_week_share'] < 0.2) & (ndf['n_distinct_values'] >= 30)` | **{n_strict}** |",
        f"| `scripts/trends_v3_trend.py` (pre-fix) | `float(meta.get('zero_week_share') or 1) < 0.2` | **{n_strict_buggy}** |",
        "",
        "Among ok geos, **62** have `zero_week_share == 0.0`. In Python, `0.0 or 1` evaluates to `1`, so those geos were wrongly treated as failing the `< 0.2` cut and dropped from strict-ok → **22** left. "
        "Pandas boolean masks in the fix script compare `0.0 < 0.2` correctly → **82**.",
        "",
        f"**Canonical definition (v3c / going forward):** `{meta['strict_ok_definition']}` "
        f"(implemented in `scripts/build_trends_v3c.py` `is_strict_ok`).",
        "",
        "## 2. Headline numbers",
        "",
        f"- ok: **{meta['counts']['ok']}**",
        f"- low_volume: **{meta['counts']['low_volume']}**",
        f"- not in v3 (empty series): **{meta['counts']['not_in_v3']}**",
        f"- China not measured: **{meta['counts']['china_not_measured']}**",
        f"- strict_ok (canonical): **{meta['counts']['strict_ok']}**",
        f"- mk_class (ok): rising/flat/falling = "
        f"**{mk_counts['rising']}/{mk_counts['flat']}/{mk_counts['falling']}**",
        f"- growth_ratio (ok) median: **{meta['growth_ratio_ok']['median']}**; "
        f"IQR: **{meta['growth_ratio_ok']['iqr']}**",
        "",
        "## 3. Five largest growth_ratio (with first-12-month mean)",
        "",
        "| geo | iso3 | name | growth_ratio | mean_first_12 | mk_class |",
        "|---|---|---|---:|---:|---|",
    ]
    for r in top5:
        lines.append(
            f"| {r['geo']} | {r['iso3']} | {r['name']} | {r['growth_ratio']} | "
            f"{r['mean_first_12']} | {r['mk_class']} |"
        )
    lines += [
        "",
        "Small `mean_first_12` bases inflate ratios (colour uses `growth_ratio_clipped` in [-0.5, 1.5]).",
        "",
        "## 4. Outputs",
        "",
        "- `trends_country_v3c.json` — ok + low_volume rows; meta lists not_in_v3 + China not_measured",
        "- `trends_monthly_v3c.json` — own_peak monthly for ok geos, 60 complete months",
        "",
        "_Do not publish._",
        "",
    ]
    path = DOCS / "TRENDS_V3C.md"
    path.write_text("\n".join(lines), encoding="utf-8")
    print(f"  wrote {path.relative_to(ROOT)}", flush=True)
    print("HEADLINE", meta["counts"], "mk", mk_counts, flush=True)
    for r in top5:
        print(f"  top {r['geo']} growth={r['growth_ratio']} mean_first12={r['mean_first_12']}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
