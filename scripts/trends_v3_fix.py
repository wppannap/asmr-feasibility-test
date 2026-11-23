#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Trends v3 validation metrics → docs/TRENDS_V3_FIX.md + unpublished JSON.
Requires rebuilt data/unpublished/v3/ after Namibia loader fix.
"""
from __future__ import annotations

import csv
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import build_web_data as B  # noqa: E402
import build_trends_v3 as V3  # noqa: E402

DATA = ROOT / "data"
UNPUB = DATA / "unpublished" / "v3"
DOCS = ROOT / "docs"
SEED = 42
BOOT_N = 2000
BLOCK = 3


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def dump(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  wrote {path.relative_to(ROOT)}", flush=True)


def spearman_full(a: pd.Series, b: pd.Series, seed: int = SEED) -> dict:
    return B.spearman(a, b, seed=seed)


def partial_spearman_rank(x: pd.Series, y: pd.Series, z: pd.Series, seed: int = SEED) -> dict:
    """Rank-based partial Spearman: residualize ranks of x,y on ranks of z."""
    B.require_scipy()
    from scipy import stats

    mask = x.notna() & y.notna() & z.notna()
    n = int(mask.sum())
    if n < 5:
        return {"n": n, "rho": None, "p": None, "ci95_low": None, "ci95_high": None, "note": "too few"}
    rx = stats.rankdata(x[mask].to_numpy(dtype=float))
    ry = stats.rankdata(y[mask].to_numpy(dtype=float))
    rz = stats.rankdata(z[mask].to_numpy(dtype=float))
    # residualize
    bx = np.polyfit(rz, rx, 1)
    by = np.polyfit(rz, ry, 1)
    ex = rx - (bx[0] * rz + bx[1])
    ey = ry - (by[0] * rz + by[1])
    res = stats.spearmanr(ex, ey)
    rho = float(res.statistic)
    p = float(res.pvalue)
    rng = np.random.default_rng(seed)
    boots = []
    idx_all = np.arange(n)
    for _ in range(BOOT_N):
        ii = rng.choice(idx_all, size=n, replace=True)
        r = stats.spearmanr(ex[ii], ey[ii])
        if np.isfinite(r.statistic):
            boots.append(float(r.statistic))
    if len(boots) >= 10:
        lo, hi = np.quantile(boots, [0.025, 0.975])
    else:
        lo, hi = None, None
    return {
        "n": n,
        "rho": B.clean_num(rho),
        "p": B.clean_num(p),
        "ci95_low": B.clean_num(float(lo)) if lo is not None else None,
        "ci95_high": B.clean_num(float(hi)) if hi is not None else None,
    }


def moving_block_bootstrap_ci(series: np.ndarray, block: int, n_boot: int, seed: int) -> tuple[float, float, float]:
    """CI for mean(last12)/mean(first12)-1 using moving-block bootstrap on monthly series."""
    # series is full complete monthly raw values in order
    # We bootstrap the monthly series, then recompute growth_ratio on windows
    # Simpler approach matching brief: bootstrap blocks of the concatenated
    # first12+recent12 or the full series then recompute.
    # Use the 24 months (first12 + recent12) as the series to block-bootstrap.
    rng = np.random.default_rng(seed)
    s = np.asarray(series, dtype=float)
    n = len(s)
    if n < block * 2:
        return (float("nan"), float("nan"), float("nan"))
    # Assume first 12 and last 12 of the complete window list used for growth
    # Caller passes concat of first12 and recent12 values (length 24)
    assert n >= 24 or n == len(s)
    first = s[:12]
    recent = s[-12:]
    point = float(np.mean(recent) / np.mean(first) - 1.0) if np.mean(first) > 0 else float("nan")

    # Moving-block bootstrap on the 24-point series
    n_blocks = int(np.ceil(n / block))
    boots = []
    max_start = n - block
    for _ in range(n_boot):
        chunks = []
        for __ in range(n_blocks):
            start = int(rng.integers(0, max_start + 1))
            chunks.append(s[start : start + block])
        samp = np.concatenate(chunks)[:n]
        f = samp[:12]
        r = samp[-12:]
        if np.mean(f) <= 0:
            continue
        boots.append(float(np.mean(r) / np.mean(f) - 1.0))
    if len(boots) < 10:
        return (point, float("nan"), float("nan"))
    lo, hi = np.quantile(boots, [0.025, 0.975])
    return (point, float(lo), float(hi))


def rolling_mean_max(own_peak: pd.Series, window: int = 6) -> float | None:
    complete = own_peak[~own_peak.index.astype(str).isin(B.TRENDS_PARTIAL_MONTHS)].sort_index()
    if len(complete) < window:
        return None
    vals = complete.astype(float).to_numpy()
    rolls = pd.Series(vals).rolling(window, min_periods=window).mean().dropna()
    if len(rolls) == 0:
        return None
    return float(rolls.max())


def main() -> int:
    B.require_scipy()
    iso2_to_iso3, iso2_to_name = V3.geo_maps()
    weekly = V3.load_weekly()
    print(f"weekly geos including NA? {'NA' in set(weekly['geo'].unique())}", flush=True)

    v3 = json.loads((UNPUB / "trends_country_v3.json").read_text())
    rows = {r["geo"]: r for r in v3["rows"]}
    v2 = json.loads((ROOT / "web/data/trends_country_v2.json").read_text())
    v2_by_iso3 = {r["iso3"]: r for r in v2["rows"]}
    v2_geos = set()
    for r in v2["rows"]:
        # map iso3 → geo via v3 or config
        for g, rr in rows.items():
            if rr["iso3"] == r["iso3"]:
                v2_geos.add(g)
                break
    # also from config existing
    cfg = json.loads((ROOT / "config" / "trends_asmr_geos.json").read_text())
    existing = {g["iso2"].upper() for g in cfg["geos"] if g.get("existing")}
    if not v2_geos:
        v2_geos = existing

    # Fetch log ok not in v3
    fetch_ok = set()
    with (DATA / "trends_fetch_log.csv").open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            if (row.get("status") or "").lower() == "ok":
                fetch_ok.add((row.get("geo") or "").strip().upper())
    not_in = sorted(fetch_ok - set(rows))
    qc = v3["meta"]["quality_counts"]
    nam = rows.get("NA")

    # ── b composition ──
    ok_geos = [g for g, r in rows.items() if r["quality"] == "ok"]
    orig31 = sorted(v2_geos & set(rows))
    other_ok = sorted(set(ok_geos) - set(orig31))

    def medians(geos, source="v3"):
        ch, re = [], []
        for g in geos:
            if source == "v3":
                r = rows[g]
                if r.get("change_in_window") is not None:
                    ch.append(float(r["change_in_window"]))
                if r.get("recent_vs_peak") is not None:
                    re.append(float(r["recent_vs_peak"]))
            else:
                iso = rows[g]["iso3"]
                r = v2_by_iso3.get(iso)
                if not r:
                    continue
                if r.get("change_in_window") is not None:
                    ch.append(float(r["change_in_window"]))
                if r.get("recent_vs_peak") is not None:
                    re.append(float(r["recent_vs_peak"]))
        return {
            "n": len(geos),
            "n_with_change": len(ch),
            "median_change_in_window": None if not ch else round(float(np.median(ch)), 4),
            "median_recent_vs_peak": None if not re else round(float(np.median(re)), 4),
        }

    composition = {
        "orig31_v3": medians(orig31, "v3"),
        "orig31_v2": medians(orig31, "v2"),
        "other_ok_v3": medians(other_ok, "v3"),
        "orig31_geos": orig31,
        "other_ok_n": len(other_ok),
    }

    # ── c growth_ratio + recent_vs_peak_robust ──
    growth_rows = []
    sign_disagree = []
    for geo, g in weekly.groupby("geo"):
        if geo not in rows or rows[geo]["quality"] != "ok":
            continue
        asmr_m = g.groupby("month", sort=True)["value"].mean()
        complete_raw = asmr_m[~asmr_m.index.astype(str).isin(B.TRENDS_PARTIAL_MONTHS)].sort_index()
        first_vals = [float(complete_raw.loc[m]) for m in B.WINDOW_FIRST_12 if m in complete_raw.index]
        recent_vals = [float(complete_raw.loc[m]) for m in B.WINDOW_RECENT_12 if m in complete_raw.index]
        if len(first_vals) < 12 or len(recent_vals) < 12:
            continue
        series24 = np.array(first_vals + recent_vals, dtype=float)
        gr, lo, hi = moving_block_bootstrap_ci(series24, BLOCK, BOOT_N, SEED)
        within = bool(np.isfinite(lo) and np.isfinite(hi) and lo <= 0 <= hi)
        # own-peak for robust recent
        peak = float(asmr_m.max()) if len(asmr_m) else 0.0
        own = (asmr_m / peak * 100.0) if peak > 0 else asmr_m * 0.0
        rvr = rolling_mean_max(own, 6)
        ch = rows[geo].get("change_in_window")
        growth_rows.append({
            "geo": geo,
            "iso3": rows[geo]["iso3"],
            "growth_ratio": B.clean_num(gr),
            "growth_ci95": [B.clean_num(lo), B.clean_num(hi)],
            "within_noise_growth": within,
            "change_in_window": ch,
            "recent_vs_peak": rows[geo].get("recent_vs_peak"),
            "recent_vs_peak_robust": B.clean_num(rvr) if rvr is not None else None,
            "zero_week_share": rows[geo].get("zero_week_share"),
            "n_distinct_values": rows[geo].get("n_distinct_values"),
        })
        if ch is not None and np.isfinite(gr):
            if (float(ch) > 0 and gr < 0) or (float(ch) < 0 and gr > 0):
                sign_disagree.append({
                    "geo": geo,
                    "iso3": rows[geo]["iso3"],
                    "name": iso2_to_name.get(geo, ""),
                    "change_in_window": ch,
                    "growth_ratio": B.clean_num(gr),
                })

    gdf = pd.DataFrame(growth_rows)
    sp_gr_ch = spearman_full(
        gdf["growth_ratio"].astype(float),
        gdf["change_in_window"].astype(float),
        seed=SEED,
    )

    # ── d noise artefact ──
    noise_rows = []
    for geo, g in weekly.groupby("geo"):
        if geo not in rows:
            continue
        asmr_m = g.groupby("month", sort=True)["value"].mean()
        complete = asmr_m[~asmr_m.index.astype(str).isin(B.TRENDS_PARTIAL_MONTHS)].sort_index().astype(float)
        if len(complete) < 3:
            continue
        diffs = complete.diff().abs().dropna()
        med_abs = float(diffs.median()) if len(diffs) else float("nan")
        med_val = float(complete.median())
        noise = med_abs / med_val if med_val > 0 else float("nan")
        noise_rows.append({
            "geo": geo,
            "iso3": rows[geo]["iso3"],
            "noise": noise,
            "quality": rows[geo]["quality"],
            "change_in_window": rows[geo].get("change_in_window"),
            "recent_vs_peak": rows[geo].get("recent_vs_peak"),
            "zero_week_share": rows[geo].get("zero_week_share"),
            "n_distinct_values": rows[geo].get("n_distinct_values"),
        })
    ndf = pd.DataFrame(noise_rows).merge(
        gdf[["geo", "growth_ratio", "recent_vs_peak_robust"]],
        on="geo",
        how="left",
    )

    # indicators
    ind = pd.read_csv(DATA / "indicators_country_v3.csv", encoding="utf-8-sig")
    ind["iso3"] = ind["iso3"].astype(str).str.upper()

    def pick_ind(iso3: str, code: str):
        hit = ind[(ind["iso3"] == iso3) & (ind["indicator_code"] == code)]
        if hit.empty:
            return None
        v = hit.iloc[0]["value"]
        if pd.isna(v) or v == "":
            return None
        return float(v)

    ndf["internet"] = ndf["iso3"].map(lambda i: pick_ind(i, "IT.NET.USER.ZS"))
    ndf["youth"] = ndf["iso3"].map(lambda i: pick_ind(i, "DERIVED.POP.1524.ZS"))
    ndf["abs_change"] = ndf["change_in_window"].abs()

    def noise_spearmans(frame: pd.DataFrame) -> dict:
        return {
            "noise_vs_recent_vs_peak": spearman_full(frame["noise"], frame["recent_vs_peak"], SEED),
            "noise_vs_abs_change": spearman_full(frame["noise"], frame["abs_change"], SEED + 1),
            "noise_vs_internet": spearman_full(frame["noise"], frame["internet"], SEED + 2),
        }

    ok_mask = ndf["quality"] == "ok"
    strict_mask = ok_mask & (ndf["zero_week_share"] < 0.2) & (ndf["n_distinct_values"] >= 30)

    outcomes = ["change_in_window", "growth_ratio", "recent_vs_peak_robust"]
    predictors = [("internet", "internet_users_pct"), ("youth", "youth_share_pct")]

    def family_table(frame: pd.DataFrame, seed0: int) -> dict:
        raw_block = {}
        part_block = {}
        keys = []
        for out in outcomes:
            for pred, _lab in predictors:
                k = f"{out}_vs_{pred}"
                keys.append(k)
                raw_block[k] = spearman_full(frame[out], frame[pred], seed0)
                part_block[k] = partial_spearman_rank(frame[out], frame[pred], frame["noise"], seed0 + 10)
        # Holm within family of 6 for raw and partial separately
        for block in (raw_block, part_block):
            holm = B.holm_adjust([block[k].get("p") for k in keys])
            for k, hp in zip(keys, holm):
                block[k]["p_holm"] = hp
        return {"raw": raw_block, "partial_noise": part_block, "keys": keys}

    families = {
        "ok_with_TWN": family_table(ndf[ok_mask], SEED + 100),
        "ok_excl_TWN": family_table(ndf[ok_mask & (ndf["iso3"] != "TWN")], SEED + 200),
        "strict_ok_with_TWN": family_table(ndf[strict_mask], SEED + 300),
        "strict_ok_excl_TWN": family_table(ndf[strict_mask & (ndf["iso3"] != "TWN")], SEED + 400),
    }
    noise_sp = {
        "ok": noise_spearmans(ndf[ok_mask]),
        "strict_ok": noise_spearmans(ndf[strict_mask]),
    }

    # ── e counts rising/within/falling ──
    def flag_counts(frame: pd.DataFrame, col: str, within_col: str | None = None) -> dict:
        rise = within = fall = 0
        for _, r in frame.iterrows():
            v = r.get(col)
            if v is None or (isinstance(v, float) and not np.isfinite(v)):
                continue
            if within_col and bool(r.get(within_col)):
                within += 1
            elif float(v) > 0:
                rise += 1
            elif float(v) < 0:
                fall += 1
            else:
                within += 1  # exactly 0
        return {"rising": rise, "within_noise": within, "falling": fall, "n": int(len(frame))}

    # merge within_noise_growth into ndf via gdf
    gdf_i = gdf.set_index("geo")
    ndf["within_noise_growth"] = ndf["geo"].map(
        lambda g: gdf_i.loc[g, "within_noise_growth"] if g in gdf_i.index else False
    )
    # change within_noise from v3 rows
    ndf["within_noise_change"] = ndf["geo"].map(
        lambda g: bool(rows[g].get("within_noise")) if g in rows else False
    )

    counts = {
        "ok_change_in_window": flag_counts(ndf[ok_mask], "change_in_window", "within_noise_change"),
        "ok_growth_ratio": flag_counts(ndf[ok_mask], "growth_ratio", "within_noise_growth"),
        "strict_ok_change_in_window": flag_counts(ndf[strict_mask], "change_in_window", "within_noise_change"),
        "strict_ok_growth_ratio": flag_counts(ndf[strict_mask], "growth_ratio", "within_noise_growth"),
        "n_ok": int(ok_mask.sum()),
        "n_strict_ok": int(strict_mask.sum()),
    }

    payload = {
        "meta": {
            "generated_at": now_iso(),
            "namibia_in_v3": nam is not None,
            "namibia_quality": None if nam is None else nam.get("quality"),
            "quality_counts": qc,
            "not_in_v3": [{"geo": g, "name": iso2_to_name.get(g, "")} for g in not_in],
            "n_not_in_v3": len(not_in),
            "n_v3": len(rows),
        },
        "composition": composition,
        "growth": {
            "spearman_growth_vs_change": sp_gr_ch,
            "sign_disagreements": sign_disagree,
            "n_ok_with_growth": len(growth_rows),
        },
        "noise": noise_sp,
        "families": {
            k: {
                "raw": v["raw"],
                "partial_noise": v["partial_noise"],
            }
            for k, v in families.items()
        },
        "counts": counts,
        "rows": growth_rows,
    }
    dump(UNPUB / "trends_v3_fix_metrics.json", payload)

    # ── markdown ──
    lines = [
        "# Trends v3 fix notes",
        "",
        f"_Generated {now_iso()}. Local unpublished metrics in `data/unpublished/v3/trends_v3_fix_metrics.json`._",
        "",
        "## a. Namibia / geo loaders",
        "",
        "Pandas reads of geo codes now use `keep_default_na=False, na_values=['']` in:",
        "- `scripts/build_trends_v3.py` `load_weekly`",
        "- `scripts/build_web_data.py` `load_trends_raw`",
        "- `scripts/fetch_worldbank_indicators.py` `load_trend_geos`",
        "- `scripts/validate_trends_v3.py` / `scripts/trends_repeat_check.py` (already)",
        "",
        f"Fetch-ok geos: **{len(fetch_ok)}**. v3 rows: **{len(rows)}**. "
        f"ok={qc.get('ok')} low_volume={qc.get('low_volume')} no_data={qc.get('no_data')}. "
        f"not-in-v3: **{len(not_in)}**.",
        f"Namibia (NA) in v3: **{nam is not None}**"
        + (f" quality={nam.get('quality')} change={nam.get('change_in_window')}" if nam else ""),
        "",
        "Not-in-v3 geos (empty fetch series):",
        "",
        "| geo | name |",
        "|---|---|",
    ]
    for g in not_in:
        lines.append(f"| {g} | {iso2_to_name.get(g, '')} |")

    lines += [
        "",
        "## b. Composition (medians)",
        "",
        "| set | n | median change_in_window | median recent_vs_peak |",
        "|---|---:|---:|---:|",
        f"| 31 original (v3 values) | {composition['orig31_v3']['n']} | {composition['orig31_v3']['median_change_in_window']} | {composition['orig31_v3']['median_recent_vs_peak']} |",
        f"| 31 original (v2 values) | {composition['orig31_v2']['n']} | {composition['orig31_v2']['median_change_in_window']} | {composition['orig31_v2']['median_recent_vs_peak']} |",
        f"| other ok (v3) | {composition['other_ok_v3']['n']} | {composition['other_ok_v3']['median_change_in_window']} | {composition['other_ok_v3']['median_recent_vs_peak']} |",
        "",
        "## c. growth_ratio (ok only)",
        "",
        "growth_ratio = mean(raw monthly, recent 12 complete) / mean(first 12) − 1. "
        "Moving-block bootstrap block=3, n=2000, seed=42. within_noise if CI includes 0. "
        "recent_vs_peak_robust = max of 6-month rolling mean of own-peak series.",
        "",
        f"Spearman(growth_ratio, change_in_window): n={sp_gr_ch.get('n')} ρ={sp_gr_ch.get('rho')} p={sp_gr_ch.get('p')}",
        f"Sign disagreements: **{len(sign_disagree)}**",
        "",
    ]
    if sign_disagree:
        lines += ["| geo | iso3 | name | change | growth_ratio |", "|---|---|---|---:|---:|"]
        for s in sign_disagree:
            lines.append(
                f"| {s['geo']} | {s['iso3']} | {s['name']} | {s['change_in_window']} | {s['growth_ratio']} |"
            )

    def fmt_sp(d: dict) -> str:
        return f"n={d.get('n')} ρ={d.get('rho')} p={d.get('p')} CI=[{d.get('ci95_low')}, {d.get('ci95_high')}]" + (
            f" p_holm={d.get('p_holm')}" if "p_holm" in d else ""
        )

    lines += ["", "## d. Noise artefact + partial Spearman", ""]
    for label, block in noise_sp.items():
        lines.append(f"### Noise Spearman ({label})")
        lines.append("")
        lines.append("| pair | stats |")
        lines.append("|---|---|")
        for k, v in block.items():
            lines.append(f"| {k} | {fmt_sp(v)} |")
        lines.append("")

    for fam_name, fam in families.items():
        lines.append(f"### Family {fam_name} (Holm over 6 pairs)")
        lines.append("")
        lines.append("| pair | raw Spearman | partial Spearman (control noise) |")
        lines.append("|---|---|---|")
        for k in fam["keys"]:
            lines.append(f"| {k} | {fmt_sp(fam['raw'][k])} | {fmt_sp(fam['partial_noise'][k])} |")
        lines.append("")

    lines += [
        "## e. Rising / within / falling",
        "",
        "| set | metric | rising | within_noise | falling | n |",
        "|---|---|---:|---:|---:|---:|",
    ]
    for key, lab in [
        ("ok_change_in_window", "ok · change_in_window"),
        ("ok_growth_ratio", "ok · growth_ratio"),
        ("strict_ok_change_in_window", "strict-ok · change_in_window"),
        ("strict_ok_growth_ratio", "strict-ok · growth_ratio"),
    ]:
        c = counts[key]
        lines.append(
            f"| {lab} | — | {c['rising']} | {c['within_noise']} | {c['falling']} | {c['n']} |"
        )
    lines += [
        "",
        f"n_ok={counts['n_ok']} n_strict_ok={counts['n_strict_ok']} "
        "(strict-ok: quality=ok AND zero_week_share<0.2 AND n_distinct≥30).",
        "",
        "_No interpretation._",
        "",
    ]
    path = DOCS / "TRENDS_V3_FIX.md"
    path.write_text("\n".join(lines), encoding="utf-8")
    print(f"  wrote {path.relative_to(ROOT)} ({len(lines)} lines)", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
