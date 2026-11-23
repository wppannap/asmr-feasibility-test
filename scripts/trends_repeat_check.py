#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Re-fetch a small geo set for Trends repeatability (no cache; respect 429).

Writes data/trends_repeat_check.csv and prints per-geo monthly own_peak
correlation vs the existing pull plus Δ change_in_window.
Stops after 6 successful geos if rate-limited (consecutive 429).
"""
from __future__ import annotations

import csv
import json
import random
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(ROOT))

import build_web_data as B  # noqa: E402
import fetch_trends_asmr_all as FTA  # noqa: E402

DATA = ROOT / "data"
UNPUB = DATA / "unpublished" / "v3"
OUT = DATA / "trends_repeat_check.csv"
V3 = UNPUB / "trends_country_v3.json"
WEEKLY = DATA / "trends_asmr_all_geos.csv"

# 4 large ok, 4 medium ok, 4 low_volume — picked from existing v3 results
PICK = [
    # large ok
    "US", "IN", "BR", "JP",
    # medium ok
    "KR", "PL", "CL", "NZ",
    # low_volume
    "MD", "MU", "AL", "ET",
]


class NoCacheClient(FTA.StrictTrendsClient):
    """Same rate-limit behaviour; never read disk cache (true re-fetch)."""

    def _get(self, url: str, params: dict, label: str = ""):
        # Bypass cache read by temporarily renaming cache path logic:
        # call parent but delete cache file first if present after keying.
        import hashlib
        from urllib.parse import urlencode
        import fetch_google_trends as FGT

        cache_key = hashlib.md5(
            f"{url}|{urlencode(sorted(params.items()))}".encode("utf-8")
        ).hexdigest()
        cache = FGT.CACHE_DIR / f"{cache_key}.json"
        if cache.exists():
            cache.unlink()
        return super()._get(url, params, label=label)


def monthly_own_peak(weekly: pd.DataFrame) -> pd.Series:
    g = weekly.copy()
    g["value"] = pd.to_numeric(g["value"], errors="coerce")
    dt = pd.to_datetime(g["date"], errors="coerce", utc=True, dayfirst=True)
    g["dt"] = dt
    g = g[g["dt"].notna()]
    g["month"] = g["dt"].dt.strftime("%Y-%m")
    asmr_m = g.groupby("month", sort=True)["value"].mean()
    peak = float(asmr_m.max()) if len(asmr_m) else 0.0
    if peak > 0:
        return asmr_m / peak * 100.0
    return asmr_m * 0.0


def change_in_window(own_peak: pd.Series) -> float | None:
    first12 = B._mean_own_peak(own_peak, B.WINDOW_FIRST_12)
    recent12 = B._mean_own_peak(own_peak, B.WINDOW_RECENT_12)
    if first12 is None or recent12 is None:
        return None
    return float(recent12 - first12)


def load_original_weekly(geo: str) -> pd.DataFrame:
    df = pd.read_csv(
        WEEKLY, encoding="utf-8-sig", keep_default_na=False, na_values=[""]
    )
    df["geo"] = df["geo"].astype(str).str.strip().str.upper()
    return df[df["geo"] == geo.upper()].copy()


def main() -> int:
    v3 = {r["geo"]: r for r in json.loads(V3.read_text())["rows"]}
    for g in PICK:
        if g not in v3:
            print(f"WARN: {g} not in v3 rows; still attempting re-fetch", flush=True)

    client = NoCacheClient()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    fields = [
        "geo", "quality_v3", "status", "rows", "error",
        "pearson_monthly_own_peak", "n_months_paired",
        "change_v3", "change_repeat", "delta_change",
        "timestamp",
    ]
    results = []
    consec_429 = 0
    n_ok = 0
    stopped_early = False

    for i, geo in enumerate(PICK, 1):
        print(f"\n[{i}/{len(PICK)}] re-fetch {geo}", flush=True)
        rows, err = FTA.fetch_iot(client, geo)
        ts = FTA.utc_now()
        q = (v3.get(geo) or {}).get("quality", "")
        ch_v3 = (v3.get(geo) or {}).get("change_in_window")

        if rows is None and err == "429":
            consec_429 += 1
            results.append({
                "geo": geo, "quality_v3": q, "status": "rate_limited",
                "rows": 0, "error": err,
                "pearson_monthly_own_peak": "", "n_months_paired": "",
                "change_v3": ch_v3 if ch_v3 is not None else "",
                "change_repeat": "", "delta_change": "",
                "timestamp": ts,
            })
            print(f"  429 consecutive={consec_429}", flush=True)
            if consec_429 >= 1 and n_ok >= 6:
                print("STOP: rate-limited after ≥6 successful geos (per brief).", flush=True)
                stopped_early = True
                break
            if consec_429 >= 3 and n_ok < 6:
                # keep trying a bit, but if we already have nothing useful and hit many 429s
                pass
            # User: If rate-limited stop after 6 and say so.
            # Interpret: if we get rate limited once we already have 6, stop; 
            # if rate limited before 6, stop after this 429 once we've attempted — 
            # brief says "stop after 6 and say so" meaning stop when rate-limited having done 6.
            if n_ok >= 6:
                stopped_early = True
                break
            # Before 6: honor backoff already done inside client; continue
            delay = random.uniform(FTA.SLEEP_MIN, FTA.SLEEP_MAX)
            print(f"  sleep {delay:.0f}s", flush=True)
            time.sleep(delay)
            continue

        if rows is None:
            consec_429 = 0
            results.append({
                "geo": geo, "quality_v3": q, "status": "error",
                "rows": 0, "error": err or "unknown",
                "pearson_monthly_own_peak": "", "n_months_paired": "",
                "change_v3": ch_v3 if ch_v3 is not None else "",
                "change_repeat": "", "delta_change": "",
                "timestamp": ts,
            })
            print(f"  ✗ {err}", flush=True)
        else:
            consec_429 = 0
            n_ok += 1
            # compare
            orig = load_original_weekly(geo)
            rep = pd.DataFrame(rows)
            own1 = monthly_own_peak(orig)
            own2 = monthly_own_peak(rep)
            months = sorted(set(own1.index.astype(str)) & set(own2.index.astype(str)))
            months = [m for m in months if m not in B.TRENDS_PARTIAL_MONTHS]
            a = pd.Series({m: float(own1.loc[m]) for m in months if m in own1.index})
            b = pd.Series({m: float(own2.loc[m]) for m in months if m in own2.index})
            paired = a.index.intersection(b.index)
            if len(paired) >= 3:
                pearson = float(a.loc[paired].corr(b.loc[paired], method="pearson"))
            else:
                pearson = float("nan")
            ch_rep = change_in_window(own2)
            delta = (
                (ch_rep - float(ch_v3))
                if ch_rep is not None and ch_v3 is not None
                else None
            )
            results.append({
                "geo": geo,
                "quality_v3": q,
                "status": "ok",
                "rows": len(rows),
                "error": "",
                "pearson_monthly_own_peak": "" if not np.isfinite(pearson) else round(pearson, 6),
                "n_months_paired": len(paired),
                "change_v3": ch_v3 if ch_v3 is not None else "",
                "change_repeat": "" if ch_rep is None else round(ch_rep, 6),
                "delta_change": "" if delta is None else round(delta, 6),
                "timestamp": ts,
            })
            print(
                f"  ✓ rows={len(rows)} pearson={pearson:.4f} "
                f"Δchange={delta}",
                flush=True,
            )

        if i < len(PICK) and not stopped_early:
            delay = random.uniform(FTA.SLEEP_MIN, FTA.SLEEP_MAX)
            print(f"  sleep {delay:.0f}s", flush=True)
            time.sleep(delay)

        # Also stop if rate-limited after reaching 6 oks mid-loop handled above

    with OUT.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for r in results:
            w.writerow(r)

    print(f"\nWrote {OUT} ({len(results)} rows). ok={n_ok} stopped_early={stopped_early}", flush=True)
    if stopped_early:
        print("NOTE: stopped early due to rate limiting after ≥6 successful geos.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
