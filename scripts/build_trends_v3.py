#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Build unpublished Trends v3 payloads from data/trends_asmr_all_geos.csv.

Reuses EXACTLY the monthly aggregation / own_peak / window / change_se /
within_noise definitions from build_trends_v2 in scripts/build_web_data.py
(lines 338–621; windows WINDOW_FIRST_12 / WINDOW_RECENT_12 / *_6;
TRENDS_PARTIAL_MONTHS).

Adds quality class per geo:
  no_data     — all zero/empty
  low_volume  — zero_month_share > 0.5 OR fewer than 10 distinct weekly values
  ok          — otherwise

Also builds data/indicators_country_v3.csv and
data/unpublished/v3/insomnia_vs_asmr_v3.json (Holm ×2: ok-only and all-with-data).

Does NOT write under web/data/.
"""
from __future__ import annotations

import csv
import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import requests

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import build_web_data as B  # noqa: E402

DATA = ROOT / "data"
UNPUB = DATA / "unpublished" / "v3"
GEO_CFG = ROOT / "config" / "trends_asmr_geos.json"
SRC = DATA / "trends_asmr_all_geos.csv"
FETCH_LOG = DATA / "trends_fetch_log.csv"
IND_V3 = DATA / "indicators_country_v3.csv"
IND_V2 = DATA / "indicators_country.csv"

WB_BASE = "https://api.worldbank.org/v2"
UA = {"User-Agent": "asmr-feasibility-worldbank-v3/1.0"}
TIMEOUT = 60

# Populous geos to call out if fetch failed
POPULOUS = {
    "US", "IN", "ID", "PK", "BR", "NG", "BD", "RU", "MX", "JP", "ET", "PH",
    "EG", "VN", "CD", "TR", "IR", "DE", "TH", "GB", "FR", "IT", "ZA", "TZ",
    "KR", "CO", "KE", "ES", "AR", "UA", "DZ", "SD", "IQ", "AF", "PL", "CA",
    "MA", "SA", "UZ", "PE", "MY", "AO", "GH", "MZ", "YE", "NP", "VE", "MG",
    "CM", "CI", "AU", "NE", "LK", "BF", "ML", "RO", "MW", "CL", "KZ", "ZM",
    "GT", "EC", "SN", "KH", "TD", "SO", "ZW", "GN", "RW", "BJ", "BI", "TN",
    "BO", "BE", "HT", "CU", "SS", "DO", "CZ", "GR", "JO", "AZ", "PT", "SE",
    "HN", "AE", "HU", "TJ", "BY", "AT", "CH", "IL", "TG", "SL", "LA", "LY",
    "HK", "SG", "TW",
}


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def geo_maps() -> tuple[dict[str, str], dict[str, str]]:
    cfg = json.loads(GEO_CFG.read_text(encoding="utf-8"))
    iso2_to_iso3 = {g["iso2"].upper(): g["iso3"].upper() for g in cfg["geos"]}
    iso2_to_name = {g["iso2"].upper(): g["name"] for g in cfg["geos"]}
    # also fold build_web_data map
    for k, v in B.ISO2_TO_ISO3.items():
        iso2_to_iso3.setdefault(k.upper(), v)
    return iso2_to_iso3, iso2_to_name


def load_weekly() -> pd.DataFrame:
    if not SRC.exists():
        raise SystemExit(f"missing {SRC} — run fetch_trends_asmr_all.py first")
    df = pd.read_csv(SRC, encoding="utf-8-sig")
    df["geo"] = df["geo"].astype(str).str.strip().str.upper()
    df["value"] = pd.to_numeric(df["value"], errors="coerce")
    # date is Google formattedAxisTime; parse flexibly
    dt = pd.to_datetime(df["date"], errors="coerce", utc=True, dayfirst=True)
    if dt.isna().mean() > 0.5:
        # try US-style
        dt = pd.to_datetime(df["date"], errors="coerce", utc=True)
    df["dt"] = dt
    df = df[df["dt"].notna()].copy()
    df["month"] = df["dt"].dt.strftime("%Y-%m")
    return df


def quality_for(weekly: pd.Series, monthly_own: pd.Series) -> tuple[str, dict]:
    vals = weekly.dropna()
    n_distinct = int(vals.nunique()) if len(vals) else 0
    zero_week_share = float((vals == 0).mean()) if len(vals) else 1.0
    complete = monthly_own[~monthly_own.index.astype(str).isin(B.TRENDS_PARTIAL_MONTHS)]
    n_m = int(len(complete))
    zero_month_share = float((complete == 0).mean()) if n_m else 1.0
    all_empty = len(vals) == 0 or (vals == 0).all()
    if all_empty:
        q = "no_data"
    elif zero_month_share > 0.5 or n_distinct < 10:
        q = "low_volume"
    else:
        q = "ok"
    return q, {
        "n_distinct_values": n_distinct,
        "zero_week_share": round(zero_week_share, 6),
        "zero_month_share": round(zero_month_share, 6),
    }


def build_country_monthly(df: pd.DataFrame, iso2_to_iso3: dict[str, str]) -> tuple[dict, dict]:
    """Mirror build_trends_v2 metrics on ASMR-only weekly → monthly means."""
    country_rows: list[dict] = []
    months_all: set[str] = set()
    own_peak_by_iso: dict[str, dict[str, float]] = {}

    for geo, g in df.groupby("geo", sort=True):
        iso = iso2_to_iso3.get(str(geo))
        if not iso:
            continue
        weekly = g.set_index("dt")["value"].sort_index()
        asmr_m = g.groupby("month", sort=True)["value"].mean()
        peak = float(asmr_m.max()) if len(asmr_m) else 0.0
        own_peak = (asmr_m / peak * 100.0) if peak > 0 else asmr_m * 0.0
        months_all.update(own_peak.index.astype(str))
        own_peak_by_iso[iso] = {str(m): float(v) for m, v in own_peak.items()}

        complete = own_peak[~own_peak.index.astype(str).isin(B.TRENDS_PARTIAL_MONTHS)]
        n_months = int(len(complete))
        n_zero = int((complete == 0).sum()) if n_months else 0
        share_zero = (n_zero / n_months) if n_months else 0.0
        low_volume_flag = share_zero > 0.5

        peak_month = str(own_peak.idxmax()) if len(own_peak) else None

        first12 = B._mean_own_peak(own_peak, B.WINDOW_FIRST_12)
        recent12 = B._mean_own_peak(own_peak, B.WINDOW_RECENT_12)
        first6 = B._mean_own_peak(own_peak, B.WINDOW_FIRST_6)
        recent6 = B._mean_own_peak(own_peak, B.WINDOW_RECENT_6)
        ch12 = (recent12 - first12) if first12 is not None and recent12 is not None else None
        ch6 = (recent6 - first6) if first6 is not None and recent6 is not None else None

        first_vals = [
            float(own_peak.loc[m])
            for m in B.WINDOW_FIRST_12
            if m in own_peak.index and pd.notna(own_peak.loc[m])
        ]
        recent_vals = [
            float(own_peak.loc[m])
            for m in B.WINDOW_RECENT_12
            if m in own_peak.index and pd.notna(own_peak.loc[m])
        ]
        change_se = None
        within_noise = False
        if len(first_vals) >= 2 and len(recent_vals) >= 2 and ch12 is not None:
            v1 = float(np.var(first_vals, ddof=1))
            v2 = float(np.var(recent_vals, ddof=1))
            change_se = float(np.sqrt(v1 / 12.0 + v2 / 12.0))
            within_noise = abs(float(ch12)) < 2.0 * change_se

        q, qmeta = quality_for(weekly, own_peak)

        country_rows.append({
            "iso3": iso,
            "geo": geo,
            "peak_month": peak_month,
            "change_in_window": B.clean_num(ch12),
            "recent_vs_peak": B.clean_num(recent12),
            "change_in_window_6m": B.clean_num(ch6),
            "recent_vs_peak_6m": B.clean_num(recent6),
            "change_se": B.clean_num(change_se),
            "within_noise": bool(within_noise),
            "n_months_complete": n_months,
            "share_months_index_0": B.clean_num(share_zero),
            "flag_low_volume": bool(low_volume_flag),
            "n_distinct_values": qmeta["n_distinct_values"],
            "zero_week_share": qmeta["zero_week_share"],
            "zero_month_share": qmeta["zero_month_share"],
            "quality": q,
        })

    n_low = int(sum(1 for r in country_rows if r["flag_low_volume"]))
    n_noise = int(sum(1 for r in country_rows if r.get("within_noise")))
    n_rise = int(sum(
        1 for r in country_rows
        if r.get("change_in_window") is not None
        and float(r["change_in_window"]) > 0
        and not r.get("within_noise")
    ))
    n_fall = int(sum(
        1 for r in country_rows
        if r.get("change_in_window") is not None
        and float(r["change_in_window"]) < 0
        and not r.get("within_noise")
    ))
    q_counts = {
        "ok": sum(1 for r in country_rows if r["quality"] == "ok"),
        "low_volume": sum(1 for r in country_rows if r["quality"] == "low_volume"),
        "no_data": sum(1 for r in country_rows if r["quality"] == "no_data"),
    }

    months = sorted(months_all)
    countries = sorted(own_peak_by_iso.keys())
    series = {
        "own_peak_asmr": {
            c: [B.clean_num(own_peak_by_iso[c].get(m)) for m in months] for c in countries
        }
    }
    country_payload = {
        "meta": {
            "source_files": ["trends_asmr_all_geos.csv", "config/trends_asmr_geos.json"],
            "generated_at": now_iso(),
            "n": len(country_rows),
            "metric": "own_peak_within_country",
            "version": "v3",
            "keyword": "ASMR",
            "timeframe": "2021-11-01 2026-10-31",
            "complete_months_dropped_partial": sorted(B.TRENDS_PARTIAL_MONTHS),
            "window_first_12": B.WINDOW_FIRST_12,
            "window_recent_12": B.WINDOW_RECENT_12,
            "window_first_6": B.WINDOW_FIRST_6,
            "window_recent_6": B.WINDOW_RECENT_6,
            "flag_counts": {
                "low_volume": n_low,
                "within_noise": n_noise,
                "rise_beyond_noise": n_rise,
                "fall_beyond_noise": n_fall,
            },
            "quality_counts": q_counts,
            "defs_from": "scripts/build_web_data.py build_trends_v2 L338-621",
            "caveats": [
                "ASMR-only (Latin-script term); single-keyword Google Trends series.",
                "change_in_window / recent_vs_peak / change_se / within_noise match v2 definitions.",
                "quality: no_data | low_volume (zero_month_share>0.5 or <10 distinct weekly values) | ok.",
                "Mainland China excluded: Google is not accessible there.",
            ],
        },
        "rows": country_rows,
    }
    monthly_payload = {
        "meta": {
            "source_files": ["trends_asmr_all_geos.csv"],
            "generated_at": now_iso(),
            "n": sum(len(v) for v in series["own_peak_asmr"].values()),
            "n_months": len(months),
            "n_countries": len(countries),
            "series_keys": ["own_peak_asmr"],
            "version": "v3",
            "caveats": [
                "Monthly mean of weekly ASMR index, then ÷ country own max × 100.",
            ],
        },
        "months": months,
        "countries": countries,
        "series": series,
    }
    return country_payload, monthly_payload


def _wb_get(path: str, params: dict | None = None):
    url = f"{WB_BASE}/{path.lstrip('/')}"
    try:
        r = requests.get(url, params=params or {}, headers=UA, timeout=TIMEOUT)
    except requests.RequestException as e:
        return None, str(e)
    if r.status_code != 200:
        return None, f"http {r.status_code}"
    try:
        return r.json(), "ok"
    except ValueError as e:
        return None, str(e)


def _latest_inet(iso2: str) -> dict | None:
    data, err = _wb_get(
        f"country/{iso2}/indicator/IT.NET.USER.ZS",
        {"format": "json", "mrnev": 1, "per_page": 1},
    )
    if data is None or not isinstance(data, list) or len(data) < 2 or not data[1]:
        return None
    row = data[1][0]
    if row.get("value") is None:
        return None
    return {
        "iso3": row.get("countryiso3code") or "",
        "iso2": iso2,
        "indicator_code": "IT.NET.USER.ZS",
        "indicator_name": (row.get("indicator") or {}).get("value") or "Internet users (%)",
        "value": row.get("value"),
        "year": row.get("date"),
        "source_url": f"{WB_BASE}/country/{iso2}/indicator/IT.NET.USER.ZS?format=json&mrnev=1",
    }


def _youth_1524(iso2: str) -> dict | None:
    codes = [
        "SP.POP.TOTL", "SP.POP.1519.FE", "SP.POP.1519.MA",
        "SP.POP.2024.FE", "SP.POP.2024.MA",
    ]
    parts = {}
    year = None
    for code in codes:
        data, _ = _wb_get(
            f"country/{iso2}/indicator/{code}",
            {"format": "json", "mrnev": 1, "per_page": 1},
        )
        if data is None or not isinstance(data, list) or len(data) < 2 or not data[1]:
            return None
        row = data[1][0]
        if row.get("value") is None:
            return None
        parts[code] = float(row["value"])
        year = row.get("date") or year
        iso3 = row.get("countryiso3code") or ""
    total = parts["SP.POP.TOTL"]
    if total <= 0:
        return None
    band = sum(parts[c] for c in codes if c != "SP.POP.TOTL")
    return {
        "iso3": iso3,
        "iso2": iso2,
        "indicator_code": "DERIVED.POP.1524.ZS",
        "indicator_name": "Population ages 15-24 (% of total) [derived]",
        "value": round(100.0 * band / total, 4),
        "year": year,
        "source_url": f"{WB_BASE}/country/{iso2}/indicator/SP.POP.TOTL?format=json&mrnev=1",
    }


def build_indicators_v3(geos: list[str], iso2_to_iso3: dict[str, str]) -> pd.DataFrame:
    """Reuse existing indicators_country.csv rows; fetch missing geos from World Bank; keep TWN official."""
    rows: list[dict] = []
    have: set[str] = set()
    if IND_V2.exists():
        old = pd.read_csv(IND_V2, encoding="utf-8-sig")
        for _, r in old.iterrows():
            iso2 = str(r["iso2"]).strip().upper()
            if iso2 not in geos and iso2 != "TW":
                continue
            rows.append({
                "iso3": str(r["iso3"]).strip().upper(),
                "iso2": iso2,
                "indicator_code": r["indicator_code"],
                "indicator_name": r["indicator_name"],
                "value": r["value"],
                "year": r["year"],
                "source_url": r["source_url"],
            })
            have.add(iso2)

    missing = [g for g in geos if g not in have]
    print(f"  indicators: reuse {len(have)} geos; fetch {len(missing)}", flush=True)
    for i, iso2 in enumerate(missing, 1):
        iso3 = iso2_to_iso3.get(iso2, "")
        print(f"  [{i}/{len(missing)}] WB {iso2}", flush=True)
        inet = _latest_inet(iso2)
        if inet:
            if not inet["iso3"]:
                inet["iso3"] = iso3
            rows.append(inet)
        else:
            rows.append({
                "iso3": iso3 or "NA", "iso2": iso2,
                "indicator_code": "IT.NET.USER.ZS",
                "indicator_name": "Internet users (%)",
                "value": "", "year": "",
                "source_url": f"{WB_BASE}/country/{iso2}/indicator/IT.NET.USER.ZS?format=json&mrnev=1",
            })
        youth = _youth_1524(iso2)
        if youth:
            if not youth["iso3"]:
                youth["iso3"] = iso3
            rows.append(youth)
        else:
            rows.append({
                "iso3": iso3 or "NA", "iso2": iso2,
                "indicator_code": "DERIVED.POP.1524.ZS",
                "indicator_name": "Population ages 15-24 (% of total) [derived]",
                "value": "", "year": "",
                "source_url": f"{WB_BASE}/country/{iso2}/indicator/SP.POP.TOTL?format=json&mrnev=1",
            })
    out = pd.DataFrame(rows)
    out.to_csv(IND_V3, index=False, encoding="utf-8-sig")
    print(f"  wrote {IND_V3.relative_to(ROOT)}", flush=True)
    return out


def _spearman_block(rdf: pd.DataFrame, seed: int) -> dict:
    specs = [
        ("change_vs_internet", "change_in_window", "internet_users_pct"),
        ("change_vs_youth", "change_in_window", "youth_share_pct"),
        ("recent_vs_internet", "recent_vs_peak", "internet_users_pct"),
        ("recent_vs_youth", "recent_vs_peak", "youth_share_pct"),
    ]
    block = {k: B.spearman(rdf[a], rdf[b], seed=seed) for k, a, b in specs}
    keys = [k for k, _, _ in specs]
    holm = B.holm_adjust([block[k].get("p") for k in keys])
    for k, hp in zip(keys, holm):
        block[k]["p_holm"] = hp
        block[k]["holm_family"] = True
        block[k]["exploratory"] = False
    return block


def build_correlations(country: dict, ind: pd.DataFrame) -> dict:
    ind = ind.copy()
    ind["iso3"] = ind["iso3"].astype(str).str.upper()
    v2_by = {r["iso3"]: r for r in country["rows"]}

    def pick(iso3: str, code: str):
        hit = ind[(ind["iso3"] == iso3) & (ind["indicator_code"] == code)]
        if hit.empty:
            return None
        v = hit.iloc[0]["value"]
        if pd.isna(v) or v == "":
            return None
        return float(v)

    rows = []
    for iso3, r in v2_by.items():
        rows.append({
            "iso3": iso3,
            "change_in_window": r.get("change_in_window"),
            "recent_vs_peak": r.get("recent_vs_peak"),
            "internet_users_pct": pick(iso3, "IT.NET.USER.ZS"),
            "youth_share_pct": pick(iso3, "DERIVED.POP.1524.ZS"),
            "quality": r.get("quality"),
            "flag_low_volume": bool(r.get("flag_low_volume")),
        })
    rdf = pd.DataFrame(rows)

    def pack(frame: pd.DataFrame, seed: int) -> dict:
        return {
            "correlations": _spearman_block(frame, seed),
            "correlations_excluding_twn": _spearman_block(frame[frame["iso3"] != "TWN"], seed + 1),
        }

    ok = rdf[rdf["quality"] == "ok"]
    with_data = rdf[rdf["quality"].isin(["ok", "low_volume"])]
    # also require non-null change for "with data"
    with_data = with_data[with_data["change_in_window"].notna()]

    return {
        "meta": {
            "generated_at": now_iso(),
            "source_files": [
                "unpublished/v3/trends_country_v3.json",
                "indicators_country_v3.csv",
            ],
            "spearman_bootstrap_n": B.BOOTSTRAP_N,
            "spearman_bootstrap_seed": B.BOOTSTRAP_SEED,
            "n_ok": int(len(ok)),
            "n_with_data": int(len(with_data)),
            "caveats": [
                "Holm family: 4 pairs (change/recent × internet/youth).",
                "Computed twice: ok-quality only, and all countries with data (ok+low_volume).",
                "Each block also reported excluding TWN.",
            ],
        },
        "ok_quality": pack(ok, B.BOOTSTRAP_SEED),
        "all_with_data": pack(with_data, B.BOOTSTRAP_SEED + 20),
        "countries": rows,
    }


def coverage_report(country: dict, iso2_to_name: dict[str, str]) -> None:
    rows = country["rows"]
    qc = country["meta"]["quality_counts"]
    fc = country["meta"]["flag_counts"]
    changes = [float(r["change_in_window"]) for r in rows if r.get("change_in_window") is not None]
    med = float(np.median(changes)) if changes else None

    failed = []
    if FETCH_LOG.exists():
        with FETCH_LOG.open(encoding="utf-8-sig", newline="") as f:
            for row in csv.DictReader(f):
                st = (row.get("status") or "").lower()
                if st not in ("ok",):
                    g = (row.get("geo") or "").upper()
                    if g in POPULOUS:
                        failed.append(f"{g}/{iso2_to_name.get(g, '?')}")
    failed = sorted(set(failed))

    print("\n=== v3 coverage ===")
    print(f"  quality: ok={qc['ok']} low_volume={qc['low_volume']} no_data={qc['no_data']}")
    print(f"  flags: rise_beyond_noise={fc['rise_beyond_noise']} "
          f"within_noise={fc['within_noise']} fall_beyond_noise={fc['fall_beyond_noise']}")
    print(f"  median change_in_window={med}")
    print(f"  populous fetch failures (latest log): {failed or 'none noted'}")


def main() -> int:
    UNPUB.mkdir(parents=True, exist_ok=True)
    iso2_to_iso3, iso2_to_name = geo_maps()
    df = load_weekly()
    print(f"weekly rows={len(df)} geos={df['geo'].nunique()}", flush=True)

    country, monthly = build_country_monthly(df, iso2_to_iso3)
    B.dump_json(UNPUB / "trends_country_v3.json", country)
    B.dump_json(UNPUB / "trends_monthly_v3.json", monthly)

    geos = sorted(df["geo"].unique().tolist())
    ind = build_indicators_v3(geos, iso2_to_iso3)
    corr = build_correlations(country, ind)
    B.dump_json(UNPUB / "insomnia_vs_asmr_v3.json", corr)

    coverage_report(country, iso2_to_name)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
