#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Trends v3 trend test (Theil-Sen + modified Mann-Kendall + BH).
Writes docs/TRENDS_V3_TREND.md and data/unpublished/v3/trends_*_v3b.json.
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

DATA = ROOT / "data"
UNPUB = DATA / "unpublished" / "v3"
DOCS = ROOT / "docs"
SEED = 42
BOOT_N = 2000
BH_Q = 0.05


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def dump(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"  wrote {path.relative_to(ROOT)}", flush=True)


def theil_sen_slope(y: np.ndarray) -> float:
    """Slope vs time index 0..n-1 (months)."""
    n = len(y)
    x = np.arange(n, dtype=float)
    slope, _, _, _ = stats.theilslopes(y, x)
    return float(slope)


def bh_adjust(p_values: list[float], q: float = BH_Q) -> list[bool]:
    """Return significance flags at FDR q (Benjamini-Hochberg)."""
    m = len(p_values)
    order = np.argsort(p_values)
    ranked = np.asarray(p_values, dtype=float)[order]
    thresh = q * (np.arange(1, m + 1) / m)
    # largest k with p_(k) <= thresh_k
    below = ranked <= thresh
    sig = np.zeros(m, dtype=bool)
    if below.any():
        kmax = np.where(below)[0].max()
        sig[order[: kmax + 1]] = True
    return sig.tolist()


def partial_spearman(x, y, z, seed: int) -> dict:
    B.require_scipy()
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


def holm2(block: dict, keys: list[str]) -> None:
    holm = B.holm_adjust([block[k].get("p") for k in keys])
    for k, hp in zip(keys, holm):
        block[k]["p_holm"] = hp


def main() -> int:
    B.require_scipy()
    iso2_to_iso3, iso2_to_name = V3.geo_maps()
    weekly = V3.load_weekly()
    v3 = json.loads((UNPUB / "trends_country_v3.json").read_text())
    v3_rows = {r["geo"]: r for r in v3["rows"]}
    monthly_v3 = json.loads((UNPUB / "trends_monthly_v3.json").read_text())

    # indicators
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

    complete_months = [
        m for m in sorted(
            set(weekly["month"].unique()) - set(B.TRENDS_PARTIAL_MONTHS)
        )
        if "2021-11" <= m <= "2026-10"
    ]
    # prefer exactly the 60 months covering windows
    if len(complete_months) > 60:
        # keep those in first..recent span
        complete_months = [m for m in complete_months if B.WINDOW_FIRST_12[0] <= m <= B.WINDOW_RECENT_12[-1]]
    print(f"complete months n={len(complete_months)} {complete_months[0]}..{complete_months[-1]}", flush=True)

    results = []
    own_peak_ok = {}
    low_volume_flags = []

    for geo, g in weekly.groupby("geo"):
        if geo not in v3_rows:
            continue
        meta = v3_rows[geo]
        asmr_m = g.groupby("month", sort=True)["value"].mean()
        # raw monthly series aligned to complete_months
        y = []
        for m in complete_months:
            if m in asmr_m.index and pd.notna(asmr_m.loc[m]):
                y.append(float(asmr_m.loc[m]))
            else:
                y.append(np.nan)
        y = np.asarray(y, dtype=float)
        if np.isnan(y).sum() > 5:
            # fill remaining gaps with 0 for MK only if mostly present
            pass
        if np.isfinite(y).sum() < 24:
            continue

        # growth_ratio on raw
        first = [float(asmr_m.loc[m]) for m in B.WINDOW_FIRST_12 if m in asmr_m.index]
        recent = [float(asmr_m.loc[m]) for m in B.WINDOW_RECENT_12 if m in asmr_m.index]
        if len(first) < 12 or len(recent) < 12 or np.mean(first) <= 0:
            growth = None
        else:
            growth = float(np.mean(recent) / np.mean(first) - 1.0)

        # own_peak for time-lapse
        peak = float(asmr_m.max()) if len(asmr_m) else 0.0
        own = (asmr_m / peak * 100.0) if peak > 0 else asmr_m * 0.0

        # noise (same as fix doc)
        complete_raw = asmr_m.reindex(complete_months).astype(float)
        diffs = complete_raw.diff().abs().dropna()
        med_abs = float(diffs.median()) if len(diffs) else np.nan
        med_val = float(complete_raw.median()) if complete_raw.notna().any() else np.nan
        noise = med_abs / med_val if med_val and med_val > 0 else np.nan

        strict_ok = (
            meta.get("quality") == "ok"
            and float(meta.get("zero_week_share") or 1) < 0.2
            and int(meta.get("n_distinct_values") or 0) >= 30
        )

        if meta.get("quality") == "low_volume":
            low_volume_flags.append({
                "geo": geo,
                "iso3": meta["iso3"],
                "name": iso2_to_name.get(geo, ""),
                "flag": "low_volume",
            })

        if meta.get("quality") != "ok":
            continue

        y_filled = np.where(np.isfinite(y), y, np.nanmedian(y[np.isfinite(y)]))
        slope = theil_sen_slope(y_filled)
        mk_res = mk.hamed_rao_modification_test(y_filled)
        p = float(mk_res.p)
        mean_first = float(np.mean(first)) if first else np.nan
        rel_slope = (slope * 12.0 / mean_first * 100.0) if mean_first and mean_first > 0 else np.nan

        iso3 = meta["iso3"]
        results.append({
            "geo": geo,
            "iso3": iso3,
            "name": iso2_to_name.get(geo, ""),
            "quality": "ok",
            "strict_ok": bool(strict_ok),
            "growth_ratio": B.clean_num(growth) if growth is not None else None,
            "theil_sen_slope_per_month": B.clean_num(slope),
            "relative_slope_pct_per_year": B.clean_num(rel_slope) if np.isfinite(rel_slope) else None,
            "mk_p": B.clean_num(p),
            "mk_tau": B.clean_num(float(mk_res.Tau)),
            "noise": B.clean_num(noise) if np.isfinite(noise) else None,
            "change_in_window": meta.get("change_in_window"),
            "within_noise_se": bool(meta.get("within_noise")),
            "recent_vs_peak": meta.get("recent_vs_peak"),  # docs only
            "internet": pick(iso3, "IT.NET.USER.ZS"),
            "youth": pick(iso3, "DERIVED.POP.1524.ZS"),
            "zero_week_share": meta.get("zero_week_share"),
            "n_distinct_values": meta.get("n_distinct_values"),
        })
        own_peak_ok[iso3] = {str(m): B.clean_num(float(own.loc[m])) if m in own.index else None
                             for m in complete_months}

    rdf = pd.DataFrame(results)
    # BH across ok geos
    sig = bh_adjust(rdf["mk_p"].astype(float).tolist(), BH_Q)
    rdf["bh_sig"] = sig

    def trend_class(row) -> str:
        if not row["bh_sig"]:
            return "flat"
        slope = row["theil_sen_slope_per_month"]
        if slope is None:
            return "flat"
        if float(slope) > 0:
            return "rising"
        if float(slope) < 0:
            return "falling"
        return "flat"

    rdf["class"] = rdf.apply(trend_class, axis=1)

    # counts
    def count_classes(frame):
        return {
            "n": int(len(frame)),
            "rising": int((frame["class"] == "rising").sum()),
            "flat": int((frame["class"] == "flat").sum()),
            "falling": int((frame["class"] == "falling").sum()),
        }

    counts_ok = count_classes(rdf)
    counts_strict = count_classes(rdf[rdf["strict_ok"]])

    gr = rdf["growth_ratio"].dropna().astype(float)
    gr_dist = {
        "min": B.clean_num(float(gr.min())),
        "p25": B.clean_num(float(gr.quantile(0.25))),
        "median": B.clean_num(float(gr.median())),
        "p75": B.clean_num(float(gr.quantile(0.75))),
        "max": B.clean_num(float(gr.max())),
    }
    top5 = rdf.nlargest(5, "growth_ratio")[["geo", "iso3", "name", "growth_ratio", "class"]]
    bot5 = rdf.nsmallest(5, "growth_ratio")[["geo", "iso3", "name", "growth_ratio", "class"]]

    sp_gr_slope = B.spearman(
        rdf["growth_ratio"].astype(float),
        rdf["relative_slope_pct_per_year"].astype(float),
        seed=SEED,
    )
    # sign disagreements growth vs relative slope
    sign_dis = []
    for _, r in rdf.iterrows():
        a, b = r["growth_ratio"], r["relative_slope_pct_per_year"]
        if a is None or b is None or not np.isfinite(a) or not np.isfinite(b):
            continue
        if (a > 0 and b < 0) or (a < 0 and b > 0):
            sign_dis.append({"geo": r["geo"], "iso3": r["iso3"], "name": r["name"],
                             "growth_ratio": a, "relative_slope_pct_per_year": b})

    # MK rising vs SE within_noise cross
    mk_rise_se_within = rdf[(rdf["class"] == "rising") & (rdf["within_noise_se"])]
    se_beyond_mk_flat = rdf[(rdf["class"] == "flat") & (~rdf["within_noise_se"]) &
                            (rdf["change_in_window"].notna()) &
                            (rdf["change_in_window"].astype(float) != 0)]
    # also falling SE beyond
    mk_fall_se_within = rdf[(rdf["class"] == "falling") & (rdf["within_noise_se"])]
    se_rise_mk_flat = rdf[(~rdf["within_noise_se"]) & (rdf["change_in_window"].astype(float) > 0) &
                          (rdf["class"] == "flat")]
    se_fall_mk_flat = rdf[(~rdf["within_noise_se"]) & (rdf["change_in_window"].astype(float) < 0) &
                          (rdf["class"] == "flat")]

    cross = {
        "mk_rising_but_SE_within_noise": int(len(mk_rise_se_within)),
        "mk_falling_but_SE_within_noise": int(len(mk_fall_se_within)),
        "SE_beyond_noise_but_MK_flat_positive_change": int(len(se_rise_mk_flat)),
        "SE_beyond_noise_but_MK_flat_negative_change": int(len(se_fall_mk_flat)),
        "examples_mk_rising_SE_within": mk_rise_se_within[["geo", "name", "growth_ratio", "change_in_window"]].head(8).to_dict("records"),
        "examples_SE_beyond_MK_flat": pd.concat([se_rise_mk_flat, se_fall_mk_flat]).head(8)[
            ["geo", "name", "change_in_window", "class"]
        ].to_dict("records"),
    }

    # correlations family growth x internet/youth
    def family(frame: pd.DataFrame, seed0: int) -> dict:
        raw = {
            "growth_vs_internet": B.spearman(frame["growth_ratio"], frame["internet"], seed=seed0),
            "growth_vs_youth": B.spearman(frame["growth_ratio"], frame["youth"], seed=seed0 + 1),
        }
        part = {
            "growth_vs_internet": partial_spearman(frame["growth_ratio"], frame["internet"], frame["noise"], seed0 + 10),
            "growth_vs_youth": partial_spearman(frame["growth_ratio"], frame["youth"], frame["noise"], seed0 + 11),
        }
        keys = ["growth_vs_internet", "growth_vs_youth"]
        holm2(raw, keys)
        holm2(part, keys)
        return {"raw": raw, "partial_noise": part}

    families = {
        "ok_with_TWN": family(rdf, SEED + 100),
        "ok_excl_TWN": family(rdf[rdf["iso3"] != "TWN"], SEED + 200),
        "strict_ok_with_TWN": family(rdf[rdf["strict_ok"]], SEED + 300),
        "strict_ok_excl_TWN": family(rdf[rdf["strict_ok"] & (rdf["iso3"] != "TWN")], SEED + 400),
    }

    # recent_vs_peak vs noise — docs table only
    rvp_noise = B.spearman(rdf["recent_vs_peak"].astype(float), rdf["noise"].astype(float), seed=SEED + 50)

    # ── write v3b JSON ──
    country_rows = []
    for _, r in rdf.iterrows():
        country_rows.append({
            "iso3": r["iso3"],
            "geo": r["geo"],
            "growth_ratio": r["growth_ratio"],
            "relative_slope_pct_per_year": r["relative_slope_pct_per_year"],
            "class": r["class"],
            "quality": r["quality"],
            "strict_ok": bool(r["strict_ok"]),
            "noise": r["noise"],
            "bh_sig": bool(r["bh_sig"]),
            "mk_p": r["mk_p"],
        })
    dump(UNPUB / "trends_country_v3b.json", {
        "meta": {
            "generated_at": now_iso(),
            "n_ok": counts_ok["n"],
            "n_strict_ok": counts_strict["n"],
            "bh_q": BH_Q,
            "trend_test": "Theil-Sen slope + Hamed-Rao modified Mann-Kendall; BH FDR across ok geos",
            "growth_ratio": "mean(raw monthly latest 12 complete)/mean(first 12)-1",
            "relative_slope_pct_per_year": "theil_sen_slope*12/mean(first12)*100",
            "class_rule": "rising/falling if BH-significant and slope sign; else flat",
            "caveats": [
                "Displayed value on charts should be growth_ratio; class from MK+BH.",
                "Not published.",
            ],
            "counts_ok": counts_ok,
            "counts_strict_ok": counts_strict,
        },
        "rows": country_rows,
    })

    # monthly own_peak ok only
    months = complete_months
    countries = sorted(own_peak_ok.keys())
    dump(UNPUB / "trends_monthly_v3b.json", {
        "meta": {
            "generated_at": now_iso(),
            "n_months": len(months),
            "n_countries_ok": len(countries),
            "series_keys": ["own_peak_asmr"],
            "low_volume_geos": low_volume_flags,
            "note": "ok geos only in series; low_volume listed with flag",
            "version": "v3b",
        },
        "months": months,
        "countries": countries,
        "series": {
            "own_peak_asmr": {
                c: [own_peak_ok[c].get(m) for m in months] for c in countries
            }
        },
    })

    # ── markdown ──
    def fmt_sp(d):
        return (f"n={d.get('n')} ρ={d.get('rho')} p={d.get('p')} "
                f"CI=[{d.get('ci95_low')}, {d.get('ci95_high')}] p_holm={d.get('p_holm')}")

    lines = [
        "# Trends v3 trend test",
        "",
        f"_Generated {now_iso()}. Payloads: `data/unpublished/v3/trends_country_v3b.json`, `trends_monthly_v3b.json` (not published)._",
        "",
        "## 1. Mann-Kendall / Theil-Sen / growth_ratio",
        "",
        f"Complete months used: **{len(complete_months)}** ({complete_months[0]} … {complete_months[-1]}).",
        "",
        f"| set | n | rising | flat | falling |",
        f"|---|---:|---:|---:|---:|",
        f"| ok | {counts_ok['n']} | {counts_ok['rising']} | {counts_ok['flat']} | {counts_ok['falling']} |",
        f"| strict-ok | {counts_strict['n']} | {counts_strict['rising']} | {counts_strict['flat']} | {counts_strict['falling']} |",
        "",
        "### growth_ratio distribution (ok)",
        "",
        f"| min | p25 | median | p75 | max |",
        f"|---:|---:|---:|---:|---:|",
        f"| {gr_dist['min']} | {gr_dist['p25']} | {gr_dist['median']} | {gr_dist['p75']} | {gr_dist['max']} |",
        "",
        "### 5 highest growth_ratio",
        "",
        "| geo | iso3 | name | growth_ratio | class |",
        "|---|---|---|---:|---|",
    ]
    for _, r in top5.iterrows():
        lines.append(f"| {r['geo']} | {r['iso3']} | {r['name']} | {r['growth_ratio']} | {r['class']} |")
    lines += ["", "### 5 lowest growth_ratio", "",
              "| geo | iso3 | name | growth_ratio | class |", "|---|---|---|---:|---|"]
    for _, r in bot5.iterrows():
        lines.append(f"| {r['geo']} | {r['iso3']} | {r['name']} | {r['growth_ratio']} | {r['class']} |")

    lines += [
        "",
        f"Spearman(growth_ratio, relative_slope_pct_per_year): {fmt_sp({**sp_gr_slope, 'p_holm': None})}".replace(" p_holm=None", ""),
        f"Sign disagreements growth vs relative slope: **{len(sign_dis)}**",
        "",
        "### MK vs SE within_noise cross-counts",
        "",
        f"- MK rising but SE within_noise: **{cross['mk_rising_but_SE_within_noise']}**",
        f"- MK falling but SE within_noise: **{cross['mk_falling_but_SE_within_noise']}**",
        f"- SE beyond noise (Δ>0) but MK flat: **{cross['SE_beyond_noise_but_MK_flat_positive_change']}**",
        f"- SE beyond noise (Δ<0) but MK flat: **{cross['SE_beyond_noise_but_MK_flat_negative_change']}**",
        "",
        "### Why block-bootstrap said 0/104 and why SE ignored autocorrelation",
        "",
        "1. The earlier moving-block bootstrap used block length 3 on a **24-point** series (first12‖recent12), i.e. only **~8 blocks** (and effectively ~4 independent 12-month windows if thinking in half-years)—resamples are highly dependent and variance of the ratio estimator is large, so 95% CIs almost always covered 0.",
        "2. That procedure tests a **two-window mean ratio**, not a monotonic trend across 60 months; wide CIs are expected with few effective blocks.",
        "3. The v2/v3 `change_se` treats the 12 first and 12 recent monthly own-peak points as **iid** when forming `sqrt(s1²/12+s2²/12)`; Google Trends series are autocorrelated, so the SE is typically **too small** (over-rejects “within noise”) and does not implement an HAC/Hamed–Rao correction—unlike the modified Mann-Kendall used here.",
        "",
        "## 2. Correlations (growth_ratio × internet / youth)",
        "",
        "Holm over the **2** pairs within each block. `recent_vs_peak` is **not** written to v3b page payloads.",
        "",
        f"Docs-only: Spearman(recent_vs_peak, noise) on ok = n={rvp_noise.get('n')} ρ={rvp_noise.get('rho')} p={rvp_noise.get('p')}",
        "",
    ]
    for fam, block in families.items():
        lines.append(f"### {fam}")
        lines.append("")
        lines.append("| pair | raw | partial (control noise) |")
        lines.append("|---|---|---|")
        for k in ("growth_vs_internet", "growth_vs_youth"):
            lines.append(f"| {k} | {fmt_sp(block['raw'][k])} | {fmt_sp(block['partial_noise'][k])} |")
        lines.append("")

    lines += [
        "## 3. Outputs",
        "",
        "- `data/unpublished/v3/trends_country_v3b.json` — growth_ratio, relative slope, class, quality, strict_ok, noise",
        "- `data/unpublished/v3/trends_monthly_v3b.json` — own_peak time-lapse for **ok** geos; low_volume listed with flag",
        "",
        "_Do not publish._",
        "",
    ]
    path = DOCS / "TRENDS_V3_TREND.md"
    path.write_text("\n".join(lines), encoding="utf-8")
    print(f"  wrote {path.relative_to(ROOT)}", flush=True)
    print("counts_ok", counts_ok, "strict", counts_strict, flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
