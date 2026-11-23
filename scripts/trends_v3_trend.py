#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Trends v3 trend test (Theil-Sen + Hamed-Rao MK + BH) → docs/TRENDS_V3_TREND.md
and unpublished v3b payloads. Local only.
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import pymannkendall as mk

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import build_web_data as B  # noqa: E402
import build_trends_v3 as V3  # noqa: E402

DATA = ROOT / "data"
UNPUB = DATA / "unpublished" / "v3"
DOCS = ROOT / "docs"
SEED = 42
BOOT_N = 2000
Q_BH = 0.05


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def bh_adjust(pvals: list[float | None], q: float = Q_BH) -> list[float | None]:
    """Benjamini-Hochberg adjusted p-values (same order)."""
    m = len(pvals)
    indexed = [(i, p) for i, p in enumerate(pvals) if p is not None and np.isfinite(p)]
    indexed.sort(key=lambda t: t[1])
    adj = [None] * m
    prev = 1.0
    # from largest rank to smallest for monotone
    running = []
    for rank_desc, (i, p) in enumerate(reversed(indexed), start=0):
        k = m - rank_desc  # 1-based rank among valid? use original n valid
        pass
    n = len(indexed)
    raw_adj = {}
    for rank0, (i, p) in enumerate(indexed):
        rank = rank0 + 1
        raw_adj[i] = min(1.0, p * n / rank)
    # enforce monotonicity from largest p-rank down
    running = 1.0
    for rank0 in range(n - 1, -1, -1):
        i, _ = indexed[rank0]
        running = min(running, raw_adj[i])
        adj[i] = running
    return adj


def partial_spearman(x, y, z, seed=SEED):
    B.require_scipy()
    from scipy import stats
    mask = x.notna() & y.notna() & z.notna()
    n = int(mask.sum())
    if n < 5:
        return {"n": n, "rho": None, "p": None, "ci95_low": None, "ci95_high": None}
    rx = stats.rankdata(x[mask].to_numpy(float))
    ry = stats.rankdata(y[mask].to_numpy(float))
    rz = stats.rankdata(z[mask].to_numpy(float))
    bx = np.polyfit(rz, rx, 1)
    by = np.polyfit(rz, ry, 1)
    ex = rx - (bx[0] * rz + bx[1])
    ey = ry - (by[0] * rz + by[1])
    res = stats.spearmanr(ex, ey)
    rho, p = float(res.statistic), float(res.pvalue)
    rng = np.random.default_rng(seed)
    boots = []
    idx = np.arange(n)
    for _ in range(BOOT_N):
        ii = rng.choice(idx, size=n, replace=True)
        r = stats.spearmanr(ex[ii], ey[ii])
        if np.isfinite(r.statistic):
            boots.append(float(r.statistic))
    lo, hi = np.quantile(boots, [0.025, 0.975]) if len(boots) >= 10 else (None, None)
    return {
        "n": n,
        "rho": B.clean_num(rho),
        "p": B.clean_num(p),
        "ci95_low": B.clean_num(float(lo)) if lo is not None else None,
        "ci95_high": B.clean_num(float(hi)) if hi is not None else None,
    }


def noise_of(complete_raw: pd.Series) -> float:
    diffs = complete_raw.diff().abs().dropna()
    med_abs = float(diffs.median()) if len(diffs) else float("nan")
    med_val = float(complete_raw.median())
    return med_abs / med_val if med_val > 0 else float("nan")


def main() -> int:
    B.require_scipy()
    iso2_to_iso3, iso2_to_name = V3.geo_maps()
    weekly = V3.load_weekly()
    v3 = json.loads((UNPUB / "trends_country_v3.json").read_text())
    v3_rows = {r["geo"]: r for r in v3["rows"]}

    ind = pd.read_csv(DATA / "indicators_country_v3.csv", encoding="utf-8-sig")
    ind["iso3"] = ind["iso3"].astype(str).str.upper()

    def pick(iso3, code):
        hit = ind[(ind["iso3"] == iso3) & (ind["indicator_code"] == code)]
        if hit.empty:
            return None
        v = hit.iloc[0]["value"]
        return None if pd.isna(v) or v == "" else float(v)

    complete_months = [
        m for m in sorted(
            {str(m) for m in weekly["month"].unique()} - set(B.TRENDS_PARTIAL_MONTHS)
        )
        if "2021-11" <= m <= "2026-10"
    ]
    # prefer exact 60
    complete_months = [m for m in complete_months if m >= "2021-11" and m <= "2026-10"]
    print(f"complete months n={len(complete_months)} {complete_months[0]}..{complete_months[-1]}", flush=True)

    records = []
    own_peak_series = {}
    low_volume_flags = []

    for geo, g in weekly.groupby("geo"):
        r0 = v3_rows.get(geo)
        if not r0:
            continue
        iso = r0["iso3"]
        asmr_m = g.groupby("month", sort=True)["value"].mean()
        # align to complete months
        raw = pd.Series({m: float(asmr_m[m]) if m in asmr_m.index else np.nan for m in complete_months})
        raw = raw.dropna()
        if len(raw) < 24:
            continue
        vals = raw.to_numpy(dtype=float)
        # Hamed-Rao MK
        try:
            trend, h, p, z, tau, s, var_s, slope, intercept = mk.hamed_rao_modification_test(vals, alpha=0.05)
            p = float(p)
            slope = float(slope)
        except Exception as e:
            print(f"  MK fail {geo}: {e}", flush=True)
            continue

        first12 = [float(raw[m]) for m in B.WINDOW_FIRST_12 if m in raw.index]
        recent12 = [float(raw[m]) for m in B.WINDOW_RECENT_12 if m in raw.index]
        if len(first12) < 12 or len(recent12) < 12:
            continue
        mean_first = float(np.mean(first12))
        growth = float(np.mean(recent12) / mean_first - 1.0) if mean_first > 0 else float("nan")
        rel_slope = (slope * 12.0 / mean_first * 100.0) if mean_first > 0 else float("nan")

        peak = float(asmr_m.max()) if len(asmr_m) else 0.0
        own = (asmr_m / peak * 100.0) if peak > 0 else asmr_m * 0.0
        own_complete = {m: float(own[m]) if m in own.index else None for m in complete_months}

        zws = float(r0.get("zero_week_share") or 1)
        ndv = int(r0.get("n_distinct_values") or 0)
        quality = r0["quality"]
        strict_ok = bool(quality == "ok" and zws < 0.2 and ndv >= 30)
        noise = noise_of(raw)

        records.append({
            "geo": geo,
            "iso3": iso,
            "name": iso2_to_name.get(geo, geo),
            "quality": quality,
            "strict_ok": strict_ok,
            "slope": B.clean_num(slope),
            "p_mk": B.clean_num(p),
            "growth_ratio": B.clean_num(growth),
            "relative_slope_pct_per_year": B.clean_num(rel_slope),
            "noise": B.clean_num(noise),
            "within_noise_se": bool(r0.get("within_noise")),
            "change_in_window": r0.get("change_in_window"),
            "recent_vs_peak": r0.get("recent_vs_peak"),
            "zero_week_share": zws,
            "n_distinct_values": ndv,
            "internet": pick(iso, "IT.NET.USER.ZS"),
            "youth": pick(iso, "DERIVED.POP.1524.ZS"),
        })
        if quality == "ok":
            own_peak_series[iso] = [B.clean_num(own_complete[m]) for m in complete_months]
        else:
            low_volume_flags.append({"geo": geo, "iso3": iso, "quality": quality})

    df = pd.DataFrame(records)
    ok = df[df["quality"] == "ok"].copy()
    # BH on ok geos only
    p_adj = bh_adjust(ok["p_mk"].tolist(), Q_BH)
    ok = ok.copy()
    ok["p_bh"] = p_adj
    classes = []
    for _, r in ok.iterrows():
        sig = r["p_bh"] is not None and r["p_bh"] <= Q_BH
        if not sig:
            classes.append("flat")
        elif float(r["slope"]) > 0:
            classes.append("rising")
        elif float(r["slope"]) < 0:
            classes.append("falling")
        else:
            classes.append("flat")
    ok["trend_class"] = classes
    # merge class back
    df = df.merge(ok[["geo", "p_bh", "trend_class"]], on="geo", how="left")
    df.loc[df["quality"] != "ok", "trend_class"] = None

    strict = ok[ok["strict_ok"]]

    def counts(frame):
        return {
            "n": int(len(frame)),
            "rising": int((frame["trend_class"] == "rising").sum()),
            "flat": int((frame["trend_class"] == "flat").sum()),
            "falling": int((frame["trend_class"] == "falling").sum()),
        }

    gr = ok["growth_ratio"].astype(float)
    dist = {
        "min": B.clean_num(float(gr.min())),
        "p25": B.clean_num(float(gr.quantile(0.25))),
        "median": B.clean_num(float(gr.median())),
        "p75": B.clean_num(float(gr.quantile(0.75))),
        "max": B.clean_num(float(gr.max())),
    }
    top5 = ok.nlargest(5, "growth_ratio")[["geo", "iso3", "name", "growth_ratio", "trend_class"]]
    bot5 = ok.nsmallest(5, "growth_ratio")[["geo", "iso3", "name", "growth_ratio", "trend_class"]]
    sp_gr_slope = B.spearman(ok["growth_ratio"], ok["relative_slope_pct_per_year"], seed=SEED)
    sign_disagree = ok[
        ((ok["growth_ratio"] > 0) & (ok["relative_slope_pct_per_year"] < 0))
        | ((ok["growth_ratio"] < 0) & (ok["relative_slope_pct_per_year"] > 0))
    ]

    mk_rise_se_within = ok[(ok["trend_class"] == "rising") & (ok["within_noise_se"] == True)]
    se_rise_mk_flat = ok[
        (ok["within_noise_se"] == False)
        & (ok["change_in_window"].astype(float) > 0)
        & (ok["trend_class"] != "rising")
    ]
    # also: MK rising but SE within_noise; and SE beyond-noise rise but MK flat
    se_beyond_rise = ok[(ok["within_noise_se"] == False) & (ok["change_in_window"].astype(float) > 0)]
    mk_flat_se_rise = se_beyond_rise[se_beyond_rise["trend_class"] != "rising"]

    # correlations family: growth_ratio x {internet, youth}
    def family(frame, seed0):
        raw = {
            "growth_vs_internet": B.spearman(frame["growth_ratio"], frame["internet"], seed=seed0),
            "growth_vs_youth": B.spearman(frame["growth_ratio"], frame["youth"], seed=seed0 + 1),
        }
        part = {
            "growth_vs_internet": partial_spearman(frame["growth_ratio"], frame["internet"], frame["noise"], seed0 + 10),
            "growth_vs_youth": partial_spearman(frame["growth_ratio"], frame["youth"], frame["noise"], seed0 + 11),
        }
        keys = list(raw.keys())
        for block in (raw, part):
            holm = B.holm_adjust([block[k].get("p") for k in keys])
            for k, hp in zip(keys, holm):
                block[k]["p_holm"] = hp
        return {"raw": raw, "partial_noise": part}

    families = {
        "ok_with_TWN": family(ok, SEED),
        "ok_excl_TWN": family(ok[ok["iso3"] != "TWN"], SEED + 100),
        "strict_ok_with_TWN": family(strict, SEED + 200),
        "strict_ok_excl_TWN": family(strict[strict["iso3"] != "TWN"], SEED + 300),
    }
    # recent_vs_peak vs noise — docs only
    rvp_noise = B.spearman(ok["recent_vs_peak"], ok["noise"], seed=SEED + 50)

    def clean_cell(v):
        if v is None or (isinstance(v, float) and not np.isfinite(v)):
            return None
        if isinstance(v, (np.floating,)):
            v = float(v)
            return None if not np.isfinite(v) else B.clean_num(v)
        if pd.isna(v):
            return None
        return v

    # write v3b country
    country_rows = []
    for _, r in df.iterrows():
        if r["quality"] not in ("ok", "low_volume"):
            continue
        pbh = r.get("p_bh")
        country_rows.append({
            "iso3": r["iso3"],
            "geo": r["geo"],
            "growth_ratio": clean_cell(r["growth_ratio"]),
            "relative_slope_pct_per_year": clean_cell(r["relative_slope_pct_per_year"]),
            "trend_class": None if pd.isna(r.get("trend_class")) else r["trend_class"],
            "quality": r["quality"],
            "strict_ok": bool(r["strict_ok"]) if r["quality"] == "ok" else False,
            "noise": clean_cell(r["noise"]),
            "p_mk": clean_cell(r.get("p_mk")),
            "p_bh": clean_cell(pbh),
        })
    country_payload = {
        "meta": {
            "generated_at": now_iso(),
            "version": "v3b",
            "n_ok": int(len(ok)),
            "n_strict_ok": int(len(strict)),
            "bh_q": Q_BH,
            "mk": "hamed_rao_modification_test",
            "complete_months": complete_months,
            "caveats": [
                "growth_ratio is the displayed level change; trend_class from MK+BH on monthly raw series.",
                "Not published.",
            ],
        },
        "rows": country_rows,
    }
    B.dump_json(UNPUB / "trends_country_v3b.json", country_payload)

    monthly_payload = {
        "meta": {
            "generated_at": now_iso(),
            "version": "v3b",
            "n_countries_ok": len(own_peak_series),
            "n_months": len(complete_months),
            "series_keys": ["own_peak_asmr"],
            "low_volume_geos": low_volume_flags,
            "caveats": ["ok geos only in series; low_volume listed with flag"],
        },
        "months": complete_months,
        "countries": sorted(own_peak_series.keys()),
        "series": {"own_peak_asmr": own_peak_series},
    }
    B.dump_json(UNPUB / "trends_monthly_v3b.json", monthly_payload)

    def fmt(d):
        return f"n={d.get('n')} ρ={d.get('rho')} p={d.get('p')} CI=[{d.get('ci95_low')},{d.get('ci95_high')}] p_holm={d.get('p_holm')}"

    lines = [
        "# Trends v3 trend test",
        "",
        f"_Generated {now_iso()}. Payloads: `data/unpublished/v3/trends_*_v3b.json` (not published)._",
        "",
        "## 1. Mann–Kendall / Theil–Sen on ok geos",
        "",
        f"Complete months: **{len(complete_months)}** ({complete_months[0]} … {complete_months[-1]}).",
        f"ok counts: {counts(ok)}; strict-ok: {counts(strict)}.",
        "",
        f"growth_ratio distribution (ok): {dist}",
        "",
        "### 5 highest growth_ratio",
        "",
        "| geo | iso3 | name | growth_ratio | class |",
        "|---|---|---|---:|---|",
    ]
    for _, r in top5.iterrows():
        lines.append(f"| {r['geo']} | {r['iso3']} | {r['name']} | {r['growth_ratio']} | {r['trend_class']} |")
    lines += ["", "### 5 lowest growth_ratio", "",
              "| geo | iso3 | name | growth_ratio | class |", "|---|---|---|---:|---|"]
    for _, r in bot5.iterrows():
        lines.append(f"| {r['geo']} | {r['iso3']} | {r['name']} | {r['growth_ratio']} | {r['trend_class']} |")

    lines += [
        "",
        f"Spearman(growth_ratio, relative_slope_pct_per_year): {fmt(sp_gr_slope)}",
        f"Sign disagreements growth vs relative slope: **{len(sign_disagree)}**",
    ]
    mk_list = ", ".join(f"{r.geo}({r.name})" for r in mk_rise_se_within.itertuples())
    se_list = ", ".join(f"{r.geo}({r.name})" for r in list(mk_flat_se_rise.itertuples())[:15])
    lines += [
        f"MK rising ∩ SE within_noise: **{len(mk_rise_se_within)}** → [{mk_list}]",
        f"SE beyond-noise rise ∩ not MK rising: **{len(mk_flat_se_rise)}** → [{se_list}]",
        "",
        "### Why block-bootstrap said 0/104 and SE ignored autocorrelation",
        "",
        "1. The earlier moving-block bootstrap rebuilt `growth_ratio` from **only 24 monthly points** (first12∥recent12) with **block length 3 → ~8 draws of 3**, so each resample still mixes early and late windows weakly and CIs were wide enough to cover 0 for every geo.",
        "2. With so few blocks, between-block variance dominates; the test had almost no power to declare a non-zero 12-vs-12 mean shift.",
        "3. The SE `within_noise` rule uses the variance of 12 own-peak months in each window as if months were independent; it does **not** inflate the SE for lag-1+ serial correlation, so persistent runs look “precise” and more geos look beyond noise than MK+BH allows.",
        "",
        "## 2. Correlations (growth_ratio family)",
        "",
        f"recent_vs_peak vs noise (ok, docs-only): {fmt(rvp_noise)}",
        "",
    ]
    for fam, block in families.items():
        lines.append(f"### {fam}")
        lines.append("")
        lines.append("| pair | raw | partial (control noise) |")
        lines.append("|---|---|---|")
        for k in ("growth_vs_internet", "growth_vs_youth"):
            lines.append(f"| {k} | {fmt(block['raw'][k])} | {fmt(block['partial_noise'][k])} |")
        lines.append("")

    lines += [
        "## 3. Outputs",
        "",
        "- `trends_country_v3b.json`: growth_ratio, relative slope, trend_class, quality, strict_ok, noise",
        "- `trends_monthly_v3b.json`: own_peak series for ok geos only; low_volume listed with flag",
        "",
        "_Do not publish._",
        "",
    ]
    path = DOCS / "TRENDS_V3_TREND.md"
    path.write_text("\n".join(lines), encoding="utf-8")
    print(f"wrote {path} ({len(lines)} lines)", flush=True)
    print("ok counts", counts(ok), "strict", counts(strict), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
