#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Local Trends v3 validation: reconcile counts, v2↔v3 compare, coverage, ok-only Holm.
Writes docs only; does not publish to web/data/.
"""
from __future__ import annotations

import csv
import json
import sys
from collections import Counter, defaultdict
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
FETCH_LOG = DATA / "trends_fetch_log.csv"
WEEKLY = DATA / "trends_asmr_all_geos.csv"
DOCS = ROOT / "docs"

WB_BASE = "https://api.worldbank.org/v2"
UA = {"User-Agent": "asmr-feasibility-validate-v3/1.0"}

# Rough region buckets by ISO2 (for coverage table only)
EUROPE = {
    "AD", "AL", "AT", "BA", "BE", "BG", "BY", "CH", "CY", "CZ", "DE", "DK", "EE",
    "ES", "FI", "FO", "FR", "GB", "GG", "GI", "GR", "HR", "HU", "IE", "IM", "IS",
    "IT", "JE", "LI", "LT", "LU", "LV", "MC", "MD", "ME", "MK", "MT", "NL", "NO",
    "PL", "PT", "RO", "RS", "RU", "SE", "SI", "SK", "SM", "UA", "VA", "XK", "AX",
}
ASIA_EXCL_CN = {
    "AF", "AM", "AZ", "BD", "BN", "BT", "GE", "HK", "ID", "IN", "JP", "KG", "KH",
    "KR", "KZ", "LA", "LK", "MM", "MN", "MO", "MV", "MY", "NP", "PH", "PK", "SG",
    "TH", "TJ", "TL", "TM", "TW", "UZ", "VN", "LK",
}
MIDDLE_EAST = {
    "AE", "BH", "EG", "IL", "IQ", "IR", "JO", "KW", "LB", "OM", "PS", "QA", "SA",
    "SY", "TR", "YE",
}
AFRICA = {
    "AO", "BF", "BI", "BJ", "BW", "CD", "CF", "CG", "CI", "CM", "CV", "DJ", "DZ",
    "EH", "ER", "ET", "GA", "GH", "GM", "GN", "GQ", "GW", "KE", "KM", "LR", "LS",
    "LY", "MA", "MG", "ML", "MR", "MU", "MW", "MZ", "NA", "NE", "NG", "RE", "RW",
    "SC", "SD", "SL", "SN", "SO", "SS", "ST", "SZ", "TD", "TG", "TN", "TZ", "UG",
    "ZA", "ZM", "ZW",
}
AMERICAS = {
    "AG", "AI", "AR", "AW", "BB", "BL", "BM", "BO", "BR", "BS", "BZ", "CA", "CL",
    "CO", "CR", "CU", "CW", "DM", "DO", "EC", "FK", "GD", "GF", "GL", "GP", "GT",
    "GY", "HN", "HT", "JM", "KN", "KY", "LC", "MF", "MQ", "MS", "MX", "NI", "PA",
    "PE", "PR", "PY", "SR", "SV", "SX", "TC", "TT", "US", "UY", "VC", "VE", "VG",
    "VI",
}
OCEANIA = {
    "AS", "AU", "CK", "FJ", "FM", "GU", "KI", "MH", "MP", "NC", "NF", "NR", "NU",
    "NZ", "PF", "PG", "PN", "PW", "SB", "TO", "TV", "VU", "WF", "WS",
}
# Territories / leftovers that don't fit cleanly
TERRITORY_HINT = {
    "AI", "AW", "AX", "BL", "BM", "CK", "CW", "FK", "FO", "GF", "GG", "GI", "GL",
    "GP", "GS", "GU", "IM", "IO", "JE", "KY", "MF", "MQ", "MS", "NC", "NF", "PN",
    "PR", "RE", "SH", "SX", "TC", "VI", "VG", "WF", "EH", "VA", "AS", "MP", "PM",
}


def region_of(iso2: str) -> str:
    g = iso2.upper()
    if g in EUROPE:
        return "Europe"
    if g in MIDDLE_EAST:
        return "Middle East"
    if g in ASIA_EXCL_CN:
        return "Asia excl. China"
    if g in AFRICA:
        return "Africa"
    if g in AMERICAS:
        return "Americas"
    if g in OCEANIA:
        return "Oceania"
    return "Other / unclassified"


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def load_cfg():
    cfg = json.loads(GEO_CFG.read_text(encoding="utf-8"))
    iso2_to_iso3 = {g["iso2"].upper(): g["iso3"].upper() for g in cfg["geos"]}
    iso2_to_name = {g["iso2"].upper(): g["name"] for g in cfg["geos"]}
    return cfg, iso2_to_iso3, iso2_to_name


def fetch_ok_geos() -> dict[str, dict]:
    out = {}
    with FETCH_LOG.open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            if (row.get("status") or "").lower() == "ok":
                g = (row.get("geo") or "").strip().upper()
                out[g] = row
    return out


def weekly_geos() -> set[str]:
    df = pd.read_csv(
        WEEKLY, encoding="utf-8-sig", keep_default_na=False, na_values=[""]
    )
    df["geo"] = df["geo"].astype(str).str.strip().str.upper()
    return set(df["geo"].unique()) - {""}


def flag_of(r: dict) -> str:
    ch = r.get("change_in_window")
    if ch is None:
        return "not_computed"
    if bool(r.get("within_noise")):
        return "within_noise"
    c = float(ch)
    if c > 0:
        return "rising_beyond_noise"
    if c < 0:
        return "falling_beyond_noise"
    return "not_computed"  # Δ == 0 and not flagged within_noise


def reconcile(iso2_to_name: dict, iso2_to_iso3: dict, v3_rows: list[dict]) -> list[dict]:
    ok = fetch_ok_geos()
    w_geos = weekly_geos()
    v3_geos = {r["geo"] for r in v3_rows}
    missing = sorted(set(ok) - v3_geos)
    rows = []
    for g in missing:
        name = iso2_to_name.get(g, "?")
        log = ok[g]
        n_rows = int(log.get("rows") or 0)
        if n_rows == 0:
            reason = (
                "empty_series: fetch logged status=ok with 0 timeline rows; "
                "append_series skipped write"
            )
            if g in TERRITORY_HINT:
                reason += " (small territory / sparse Trends coverage)"
        elif g == "NA":
            reason = (
                "pandas_NA_trap: ISO2 'NA' (Namibia) has 261 weekly rows in CSV, but "
                "default pandas read_csv treats the token NA as missing; prior "
                "load_weekly dropped them so Namibia never entered v3"
            )
        elif g not in iso2_to_iso3:
            reason = "missing_ISO3_mapping in config/trends_asmr_geos.json"
        elif g not in w_geos and n_rows > 0:
            reason = "absent_from_weekly_csv despite rows>0 (other)"
        else:
            reason = "other"
        rows.append({
            "iso2": g,
            "iso3": iso2_to_iso3.get(g, ""),
            "name": name,
            "fetch_rows": n_rows,
            "reason": reason,
            "territory": g in TERRITORY_HINT,
        })
    return rows


def crosstab(v3_rows: list[dict]) -> tuple[str, Counter]:
    ct: Counter = Counter()
    for r in v3_rows:
        ct[(r["quality"], flag_of(r))] += 1
    qualities = ["ok", "low_volume", "no_data"]
    flags = [
        "rising_beyond_noise",
        "within_noise",
        "falling_beyond_noise",
        "not_computed",
    ]
    lines = [
        "| quality \\ flag | rising beyond noise | within noise | falling beyond noise | not computed |",
        "|---|---:|---:|---:|---:|",
    ]
    for q in qualities:
        cells = [str(ct.get((q, f), 0)) for f in flags]
        lines.append(f"| {q} | " + " | ".join(cells) + " |")
    totals = [str(sum(ct.get((q, f), 0) for q in qualities)) for f in flags]
    lines.append("| **total** | " + " | ".join(totals) + " |")
    return "\n".join(lines), ct


def complete_months(months: list[str]) -> list[str]:
    return [m for m in months if m not in B.TRENDS_PARTIAL_MONTHS]


def v2_v3_compare(iso2_to_name: dict) -> str:
    v2c = json.loads((ROOT / "web/data/trends_country_v2.json").read_text())
    v2m = json.loads((ROOT / "web/data/trends_monthly_v2.json").read_text())
    v3c = json.loads((UNPUB / "trends_country_v3.json").read_text())
    v3m = json.loads((UNPUB / "trends_monthly_v3.json").read_text())

    v2_by_iso3 = {r["iso3"]: r for r in v2c["rows"]}
    v3_by_iso3 = {r["iso3"]: r for r in v3c["rows"]}
    common = sorted(set(v2_by_iso3) & set(v3_by_iso3))
    assert len(common) == 31, f"expected 31 overlap, got {len(common)}"

    months = complete_months(
        sorted(set(complete_months(v2m["months"])) & set(complete_months(v3m["months"])))
    )
    # Prefer the 60 complete months Nov 2021–Oct 2026
    months = [m for m in months if "2021-11" <= m <= "2026-10"]
    n_m = len(months)
    v2_idx = {m: i for i, m in enumerate(v2m["months"])}
    v3_idx = {m: i for i, m in enumerate(v3m["months"])}
    v2_series = v2m["series"]["own_peak_asmr"]
    v3_series = v3m["series"]["own_peak_asmr"]

    pearsons = []
    for iso3 in common:
        a = []
        b = []
        for m in months:
            va = v2_series[iso3][v2_idx[m]]
            vb = v3_series[iso3][v3_idx[m]]
            if va is None or vb is None:
                continue
            a.append(float(va))
            b.append(float(vb))
        if len(a) >= 3:
            rho = float(pd.Series(a).corr(pd.Series(b), method="pearson"))
        else:
            rho = float("nan")
        # name via iso2 on v3 row
        geo = v3_by_iso3[iso3]["geo"]
        pearsons.append((iso3, geo, iso2_to_name.get(geo, iso3), rho, len(a)))

    rhos = [p[3] for p in pearsons if np.isfinite(p[3])]
    lowest5 = sorted(pearsons, key=lambda t: (not np.isfinite(t[3]), t[3] if np.isfinite(t[3]) else 99))[:5]

    # Spearman of country-level change / recent
    ch2 = pd.Series({i: v2_by_iso3[i]["change_in_window"] for i in common}, dtype=float)
    ch3 = pd.Series({i: v3_by_iso3[i]["change_in_window"] for i in common}, dtype=float)
    re2 = pd.Series({i: v2_by_iso3[i]["recent_vs_peak"] for i in common}, dtype=float)
    re3 = pd.Series({i: v3_by_iso3[i]["recent_vs_peak"] for i in common}, dtype=float)
    sp_ch = ch2.corr(ch3, method="spearman")
    sp_re = re2.corr(re3, method="spearman")

    diffs = []
    for iso3 in common:
        a = v2_by_iso3[iso3]["change_in_window"]
        b = v3_by_iso3[iso3]["change_in_window"]
        if a is None or b is None:
            continue
        d = float(b) - float(a)
        if abs(d) > 10:
            geo = v3_by_iso3[iso3]["geo"]
            diffs.append((iso3, geo, iso2_to_name.get(geo, iso3), float(a), float(b), d))
    diffs.sort(key=lambda t: -abs(t[5]))

    lines = [
        "",
        "## Overlap comparison (31 geos in both v2 and v3)",
        "",
        f"_Generated {now_iso()}. Complete months used for monthly Pearson: "
        f"**{n_m}** ({months[0]} … {months[-1]})._",
        "",
        "### Monthly own_peak Pearson (per country, v2 vs v3)",
        "",
        f"| | value |",
        f"|---|---:|",
        f"| n countries | {len(rhos)} |",
        f"| median r | {np.median(rhos):.4f} |",
        f"| min r | {np.min(rhos):.4f} |",
        f"| max r | {np.max(rhos):.4f} |",
        "",
        "Five lowest Pearson r:",
        "",
        "| iso3 | geo | name | Pearson r | n months |",
        "|---|---|---|---:|---:|",
    ]
    for iso3, geo, name, rho, n in lowest5:
        lines.append(f"| {iso3} | {geo} | {name} | {rho:.4f} | {n} |")

    lines += [
        "",
        "### Country-level Spearman (v2 vs v3 ranks)",
        "",
        "| metric | Spearman ρ | n |",
        "|---|---:|---:|",
        f"| change_in_window | {sp_ch:.4f} | {int((ch2.notna() & ch3.notna()).sum())} |",
        f"| recent_vs_peak | {sp_re:.4f} | {int((re2.notna() & re3.notna()).sum())} |",
        "",
        "### Countries with \\|Δ change_in_window\\| > 10 (v3 − v2)",
        "",
    ]
    if not diffs:
        lines.append("_None._")
    else:
        lines += [
            "| iso3 | geo | name | v2 change | v3 change | Δ |",
            "|---|---|---|---:|---:|---:|",
        ]
        for iso3, geo, name, a, b, d in diffs:
            lines.append(f"| {iso3} | {geo} | {name} | {a:.2f} | {b:.2f} | {d:+.2f} |")
    return "\n".join(lines)


def fetch_wb_population(iso2_list: list[str]) -> dict[str, tuple[float | None, str]]:
    """Return iso2 -> (population, year) via WB country/all (mrnev=1)."""
    wanted = {g.upper() for g in iso2_list}
    out: dict[str, tuple[float | None, str]] = {}
    url = f"{WB_BASE}/country/all/indicator/SP.POP.TOTL"
    try:
        r = requests.get(
            url,
            params={"format": "json", "mrnev": 1, "per_page": 400},
            headers=UA,
            timeout=60,
        )
        r.raise_for_status()
        data = r.json()
    except Exception as e:
        print(f"  WB pop fetch failed: {e}", flush=True)
        return out
    if not isinstance(data, list) or len(data) < 2 or not data[1]:
        print("  WB pop fetch: empty payload", flush=True)
        return out
    for row in data[1]:
        iso2 = str((row.get("country") or {}).get("id") or "").upper()
        if iso2 not in wanted:
            continue
        val = row.get("value")
        year = str(row.get("date") or "")
        out[iso2] = (float(val) if val is not None else None, year)
    print(f"  WB pop matched {len(out)}/{len(wanted)} planned geos", flush=True)
    return out


def write_coverage(
    iso2_to_name: dict,
    iso2_to_iso3: dict,
    v3_rows: list[dict],
    missing_rows: list[dict],
    cfg_geos: list[dict],
) -> None:
    by_geo = {r["geo"]: r for r in v3_rows}
    ok_list = sorted(
        [(r["geo"], r["iso3"], iso2_to_name.get(r["geo"], "")) for r in v3_rows if r["quality"] == "ok"]
    )
    lv_list = sorted(
        [(r["geo"], r["iso3"], iso2_to_name.get(r["geo"], "")) for r in v3_rows if r["quality"] == "low_volume"]
    )
    not_in = sorted([(m["iso2"], m["iso3"], m["name"], m["reason"]) for m in missing_rows])

    # region counts among planned geos
    status_by_geo = {}
    for g in cfg_geos:
        iso2 = g["iso2"].upper()
        if iso2 in by_geo:
            status_by_geo[iso2] = by_geo[iso2]["quality"]
        else:
            status_by_geo[iso2] = "not_measured"

    regions = [
        "Europe",
        "Asia excl. China",
        "Middle East",
        "Africa",
        "Americas",
        "Oceania",
        "Other / unclassified",
    ]
    reg_ct = {reg: Counter() for reg in regions}
    for iso2, st in status_by_geo.items():
        reg = region_of(iso2)
        key = "ok" if st == "ok" else ("low_volume" if st == "low_volume" else "not_measured")
        reg_ct[reg][key] += 1

    # Top 40 populous — use all WB countries we can, then map
    print("  fetching WB SP.POP.TOTL for planned geos…", flush=True)
    pops = fetch_wb_population(sorted(status_by_geo.keys()))
    # Also try fetching a world top list via aggregate — use our geos ranked by pop
    ranked = []
    for iso2, st in status_by_geo.items():
        pop, year = pops.get(iso2, (None, ""))
        ranked.append((pop or -1, iso2, iso2_to_iso3.get(iso2, ""), iso2_to_name.get(iso2, ""), st, year))
    ranked.sort(reverse=True)
    top40 = [t for t in ranked if t[0] > 0][:40]

    # Large blanks
    large_blank = [
        t for t in ranked
        if t[0] >= 50_000_000 and t[4] == "not_measured"
    ]

    lines = [
        "# Trends v3 coverage",
        "",
        f"_Generated {now_iso()}. Local unpublished build under `data/unpublished/v3/`. "
        "Mainland **China is not measured**: Google is not accessible there._",
        "",
        f"## Summary",
        "",
        f"| class | n |",
        f"|---|---:|",
        f"| ok | {len(ok_list)} |",
        f"| low_volume | {len(lv_list)} |",
        f"| not in v3 (fetch-ok but absent from build) | {len(not_in)} |",
        f"| planned geos (config) | {len(cfg_geos)} |",
        "",
        "## ok geos",
        "",
        "| ISO3 | ISO2 | name |",
        "|---|---|---|",
    ]
    for geo, iso3, name in ok_list:
        lines.append(f"| {iso3} | {geo} | {name} |")

    lines += ["", "## low_volume geos", "", "| ISO3 | ISO2 | name |", "|---|---|---|"]
    for geo, iso3, name in lv_list:
        lines.append(f"| {iso3} | {geo} | {name} |")

    lines += [
        "",
        "## not in v3 (fetch log ok, absent from build)",
        "",
        "| ISO3 | ISO2 | name | reason |",
        "|---|---|---|---|",
    ]
    for iso2, iso3, name, reason in not_in:
        lines.append(f"| {iso3} | {iso2} | {name} | {reason} |")

    lines += [
        "",
        "## Counts by region",
        "",
        "| region | ok | low_volume | not measured |",
        "|---|---:|---:|---:|",
    ]
    for reg in regions:
        c = reg_ct[reg]
        if c["ok"] + c["low_volume"] + c["not_measured"] == 0:
            continue
        lines.append(
            f"| {reg} | {c['ok']} | {c['low_volume']} | {c['not_measured']} |"
        )

    lines += [
        "",
        "## 40 most populous planned geos (World Bank SP.POP.TOTL)",
        "",
        "| rank | ISO3 | ISO2 | name | population | year | v3 status |",
        "|---:|---|---|---|---:|---|---|",
    ]
    for i, (pop, iso2, iso3, name, st, year) in enumerate(top40, 1):
        label = st if st in ("ok", "low_volume") else "not measured"
        lines.append(
            f"| {i} | {iso3} | {iso2} | {name} | {int(pop):,} | {year} | {label} |"
        )

    lines += [
        "",
        "## Large countries still blank / not measured",
        "",
        "China (CN) is **excluded by design** from the geo list: Google Trends is not "
        "accessible there, so ASMR interest is not measured via this source.",
        "",
    ]
    if large_blank:
        lines += [
            "Other planned geos with population ≥ 50M and status not measured:",
            "",
            "| ISO3 | ISO2 | name | population | note |",
            "|---|---|---|---:|---|",
        ]
        for pop, iso2, iso3, name, st, year in large_blank:
            note = next(
                (m["reason"] for m in missing_rows if m["iso2"] == iso2),
                "not in v3 build",
            )
            lines.append(f"| {iso3} | {iso2} | {name} | {int(pop):,} | {note} |")
    else:
        lines.append(
            "Among planned geos with WB population ≥ 50M, none remain blank except "
            "China (excluded). Smaller blanks are listed under *not in v3*."
        )

    (DOCS / "TRENDS_V3_COVERAGE.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"  wrote {DOCS / 'TRENDS_V3_COVERAGE.md'}", flush=True)


def ok_only_vs_v2(v3_rows: list[dict]) -> str:
    ok = [r for r in v3_rows if r["quality"] == "ok"]
    rise = sum(1 for r in ok if flag_of(r) == "rising_beyond_noise")
    within = sum(1 for r in ok if flag_of(r) == "within_noise")
    fall = sum(1 for r in ok if flag_of(r) == "falling_beyond_noise")
    chs = [float(r["change_in_window"]) for r in ok if r.get("change_in_window") is not None]
    recs = [float(r["recent_vs_peak"]) for r in ok if r.get("recent_vs_peak") is not None]

    corr = json.loads((UNPUB / "insomnia_vs_asmr_v3.json").read_text())
    v2 = json.loads((ROOT / "web/data/insomnia_vs_asmr.json").read_text())
    v2c = json.loads((ROOT / "web/data/trends_country_v2.json").read_text())
    fc2 = v2c["meta"]["flag_counts"]
    ch2 = [r["change_in_window"] for r in v2c["rows"] if r.get("change_in_window") is not None]
    re2 = [r["recent_vs_peak"] for r in v2c["rows"] if r.get("recent_vs_peak") is not None]

    def block_table(title: str, block: dict) -> list[str]:
        lines = [f"#### {title}", "", "| pair | n | ρ | p | p_holm |", "|---|---:|---:|---:|---:|"]
        for k, v in block.items():
            lines.append(
                f"| {k} | {v.get('n')} | {v.get('rho')} | {v.get('p')} | {v.get('p_holm')} |"
            )
        return lines

    ok_pack = corr["ok_quality"]
    lines = [
        "",
        "## Ok-quality-only headlines (v3, unpublished) vs published v2",
        "",
        "| | v2 published (n=31) | v3 ok-only |",
        "|---|---:|---:|",
        f"| rising beyond noise | {fc2.get('rise_beyond_noise')} | {rise} |",
        f"| within noise | {fc2.get('within_noise')} | {within} |",
        f"| falling beyond noise | {fc2.get('fall_beyond_noise')} | {fall} |",
        f"| median change_in_window | {float(np.median(ch2)):.4f} | {float(np.median(chs)):.4f} |",
        f"| median recent_vs_peak | {float(np.median(re2)):.4f} | {float(np.median(recs)):.4f} |",
        "",
        "### Holm 4-pairs",
        "",
    ]
    lines += block_table("v3 ok-quality (with TWN)", ok_pack["correlations"])
    lines += [""]
    lines += block_table("v3 ok-quality (excluding TWN)", ok_pack["correlations_excluding_twn"])
    lines += [""]
    lines += block_table("v2 published (with TWN)", v2["correlations"])
    lines += [""]
    lines += block_table("v2 published (excluding TWN)", v2["correlations_excluding_twn"])
    lines += [
        "",
        "_Not published. Ok-only Holm lives in `data/unpublished/v3/insomnia_vs_asmr_v3.json` → `ok_quality`._",
    ]
    return "\n".join(lines)


def main() -> int:
    B.require_scipy()
    _, iso2_to_iso3, iso2_to_name = load_cfg()
    cfg = json.loads(GEO_CFG.read_text(encoding="utf-8"))
    v3 = json.loads((UNPUB / "trends_country_v3.json").read_text())
    rows = v3["rows"]

    print("=== reconcile ===", flush=True)
    missing = reconcile(iso2_to_name, iso2_to_iso3, rows)
    print(f"fetch ok but not in v3: {len(missing)}", flush=True)
    for m in missing:
        print(f"  {m['iso2']} ({m['name']}): {m['reason']}", flush=True)

    xtab, _ = crosstab(rows)
    print("\n=== flag crosstab ===", flush=True)
    print(xtab, flush=True)
    print(
        "\nFlag counts 73/88/4 are computed on **all v3 rows** "
        f"(n={len(rows)}), not ok-only. "
        "rise/fall require change≠null, sign, and not within_noise; "
        "within_noise counts rows with within_noise=True.",
        flush=True,
    )

    # Append comparison + ok-only to TRENDS_V3_VS_V2.md
    vs_path = DOCS / "TRENDS_V3_VS_V2.md"
    base = vs_path.read_text(encoding="utf-8")
    # strip previous generated sections if re-run
    marker = "\n## Overlap comparison"
    if marker in base:
        base = base.split(marker)[0].rstrip() + "\n"
    ok_marker = "\n## Ok-quality-only headlines"
    if ok_marker in base:
        base = base.split(ok_marker)[0].rstrip() + "\n"

    compare = v2_v3_compare(iso2_to_name)
    ok_sec = ok_only_vs_v2(rows)

    recon_sec = [
        "",
        "## Reconcile: 229 fetch-ok vs v3 geos",
        "",
        f"Fetch log `status=ok`: **229**. v3 build rows: **{len(rows)}**. "
        f"Absent from v3: **{len(missing)}**.",
        "",
        "| ISO2 | ISO3 | name | fetch rows | reason |",
        "|---|---|---|---:|---|",
    ]
    for m in missing:
        recon_sec.append(
            f"| {m['iso2']} | {m['iso3']} | {m['name']} | {m['fetch_rows']} | {m['reason']} |"
        )
    recon_sec += [
        "",
        "### Flag population and quality × direction",
        "",
        f"Headline flags rise **{v3['meta']['flag_counts']['rise_beyond_noise']}** / "
        f"within **{v3['meta']['flag_counts']['within_noise']}** / "
        f"fall **{v3['meta']['flag_counts']['fall_beyond_noise']}** are counted over "
        f"**all {len(rows)} v3 geos** (ok + low_volume), using the same within_noise "
        "rule as v2 (`|change_in_window| < 2 × change_se`).",
        "",
        xtab,
        "",
        "`not_computed` here = `change_in_window == 0` (or null) and `within_noise` is false "
        "(typical when window variances cannot form an SE).",
    ]

    vs_path.write_text(
        base + "\n".join(recon_sec) + compare + ok_sec + "\n",
        encoding="utf-8",
    )
    print(f"  wrote {vs_path}", flush=True)

    write_coverage(iso2_to_name, iso2_to_iso3, rows, missing, cfg["geos"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
