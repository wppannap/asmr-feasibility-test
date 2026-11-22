#!/usr/bin/env python3
"""Build minified JSON payloads under web/data/ for the front-end (read-only on data/)."""
from __future__ import annotations

import json
import math
import re
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
OUT = ROOT / "web" / "data"
MAX_BYTES = 2 * 1024 * 1024

ISO2_TO_ISO3 = {
    "AE": "ARE", "AF": "AFG", "AI": "AIA", "AM": "ARM", "AR": "ARG",
    "AT": "AUT", "AU": "AUS", "AZ": "AZE", "BD": "BGD", "BE": "BEL",
    "BG": "BGR", "BR": "BRA", "BY": "BLR", "CA": "CAN", "CH": "CHE",
    "CL": "CHL", "CN": "CHN", "CO": "COL", "CY": "CYP", "CZ": "CZE",
    "DE": "DEU", "DK": "DNK", "EE": "EST", "EG": "EGY", "ES": "ESP",
    "FI": "FIN", "FR": "FRA", "GB": "GBR", "GH": "GHA", "GR": "GRC",
    "GT": "GTM", "HK": "HKG", "HU": "HUN", "ID": "IDN", "IE": "IRL",
    "IL": "ISR", "IN": "IND", "IS": "ISL", "IT": "ITA", "JP": "JPN",
    "KE": "KEN", "KH": "KHM", "KR": "KOR", "LV": "LVA", "MA": "MAR",
    "MM": "MMR", "MO": "MAC", "MT": "MLT", "MX": "MEX", "MY": "MYS",
    "NG": "NGA", "NL": "NLD", "NO": "NOR", "NP": "NPL", "NZ": "NZL",
    "PE": "PER", "PH": "PHL", "PK": "PAK", "PL": "POL", "PT": "PRT",
    "RO": "ROU", "RS": "SRB", "RU": "RUS", "SA": "SAU", "SE": "SWE",
    "SG": "SGP", "SK": "SVK", "TH": "THA", "TN": "TUN", "TR": "TUR",
    "TW": "TWN", "UA": "UKR", "US": "USA", "VE": "VEN", "VN": "VNM",
    "ZA": "ZAF",
}

# Keyword → theme (4 main themes used for map time-lapse; meditation kept for country summary)
KEYWORD_THEME: dict[str, str] = {
    "ASMR": "asmr",
    "ear cleaning": "asmr",
    "tapping": "asmr",
    "whispering": "asmr",
    "採耳": "asmr",
    "敲擊": "asmr",
    "氣音": "asmr",
    "耳語": "asmr",
    "耳かき": "asmr",
    "耳そうじ": "asmr",
    "まばたき": "asmr",
    "翻書": "asmr",
    "귀청소": "asmr",
    "속삭임": "asmr",
    "insomnia": "insomnia",
    "Schlaflosigkeit": "insomnia",
    "uykusuzluk": "insomnia",
    "bezsenność": "insomnia",
    "insônia": "insomnia",
    "slapeloosheid": "insomnia",
    "sömnlöshet": "insomnia",
    "insomnio": "insomnia",
    "insonnia": "insomnia",
    "insomnie": "insomnia",
    "mất ngủ": "insomnia",
    "бессонница": "insomnia",
    "นอนไม่หลับ": "insomnia",
    "不眠症": "insomnia",
    "失眠": "insomnia",
    "불면": "insomnia",
    "sleep": "sleep",
    "Schlaf": "sleep",
    "uyku": "sleep",
    "sen": "sleep",
    "sono": "sleep",
    "slaap": "sleep",
    "sömn": "sleep",
    "sueño": "sleep",
    "sonno": "sleep",
    "sommeil": "sleep",
    "tidur": "sleep",
    "ngủ": "sleep",
    "сон": "sleep",
    "นอน": "sleep",
    "眠り": "sleep",
    "睡眠": "sleep",
    "助眠": "sleep",
    "哄睡": "sleep",
    "深度睡眠": "sleep",
    "수면": "sleep",
    "white noise": "white_noise",
    "Rauschen": "white_noise",
    "beyaz gürültü": "white_noise",
    "szum biały": "white_noise",
    "ruído branco": "white_noise",
    "ruis wit": "white_noise",
    "vitt brus": "white_noise",
    "ruido blanco": "white_noise",
    "rumore bianco": "white_noise",
    "bruit blanc": "white_noise",
    "tiếng ồn trắng": "white_noise",
    "белый шум": "white_noise",
    "เสียงรบกวน": "white_noise",
    "ホワイトノイズ": "white_noise",
    "白噪音": "white_noise",
    "雨聲": "white_noise",
    "화이트 노이즈": "white_noise",
    "meditation": "meditation",
    "Meditation": "meditation",
    "meditasyon": "meditation",
    "medytacja": "meditation",
    "meditação": "meditation",
    "meditatie": "meditation",
    "meditación": "meditation",
    "meditazione": "meditation",
    "méditation": "meditation",
    "meditasi": "meditation",
    "thiền": "meditation",
    "медитация": "meditation",
    "สมาธิ": "meditation",
    "瞑想": "meditation",
    "冥想": "meditation",
    "명상": "meditation",
}

MAIN_THEMES = ["asmr", "insomnia", "sleep", "white_noise"]
INSOMNIA_KEYWORDS = frozenset(k for k, t in KEYWORD_THEME.items() if t == "insomnia")
HAN_RE = re.compile(r"[\u4e00-\u9fff]")
V2_CAVEATS = [
    "Relative to each country's own peak within a Trends request; Google Trends is a sample and can be noisy; window is Nov 2021 to Oct 2026 (Google Trends 5-year window), so nothing before Nov 2021 is shown.",
]

# Partial months at the edges of the monthly grid (incomplete Google Trends weeks).
TRENDS_PARTIAL_MONTHS = frozenset({"2021-10", "2026-11"})
# Complete-month windows for within-country change metrics (own_peak points).
WINDOW_FIRST_12 = [f"{y}-{m:02d}" for y, m in [(2021, m) for m in range(11, 13)] + [(2022, m) for m in range(1, 11)]]
WINDOW_RECENT_12 = [f"{y}-{m:02d}" for y, m in [(2025, m) for m in range(11, 13)] + [(2026, m) for m in range(1, 11)]]
WINDOW_FIRST_6 = [f"{y}-{m:02d}" for y, m in [(2021, 11), (2021, 12), (2022, 1), (2022, 2), (2022, 3), (2022, 4)]]
WINDOW_RECENT_6 = [f"{y}-{m:02d}" for y, m in [(2026, m) for m in range(5, 11)]]
TAKE_OFF_NOT_PUBLISHABLE = "left-censored; not publishable"

# Code that mixes batches into published theme means (legacy trends_country / monthly):
#   build_trends_country: groupby(["iso3","theme"]) then mean interest — no comparison_group filter
#   build_trends_monthly: same, theme-level monthly mean across all batches
MERGE_BATCHES_QUOTE = (
    'build_trends_country: for (iso, theme), g in df.groupby(["iso3", "theme"]): '
    'by_ts = g.groupby("dt")["interest"].mean(); mean_idx = by_ts["interest"].mean() '
    "— all comparison_groups for that theme are pooled. "
    'build_trends_monthly: sub.groupby(["month","iso3","theme"])["interest"].mean() — same mixing.'
)


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def clean_num(x):
    if x is None or (isinstance(x, float) and (math.isnan(x) or math.isinf(x))):
        return None
    if isinstance(x, (np.floating, float)):
        if math.isnan(float(x)) or math.isinf(float(x)):
            return None
        return round(float(x), 4)
    if isinstance(x, (np.integer, int)):
        return int(x)
    return x


def dump_json(path: Path, obj: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    raw = json.dumps(obj, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    data = raw.encode("utf-8")
    if len(data) >= MAX_BYTES:
        raise SystemExit(f"{path.name} is {len(data)} bytes (>= 2 MB)")
    path.write_bytes(data)
    print(f"  wrote {path.relative_to(ROOT)} ({len(data):,} bytes)")


def iso3(iso2: str | None) -> str | None:
    if iso2 is None or (isinstance(iso2, float) and math.isnan(iso2)):
        return None
    s = str(iso2).strip().upper()
    if not s:
        return None
    if len(s) == 3:
        return s
    return ISO2_TO_ISO3.get(s)


def _attach_time_cols(df: pd.DataFrame) -> pd.DataFrame:
    ts = pd.to_datetime(df["timestamp"], unit="s", errors="coerce", utc=True)
    bad = ts.isna()
    if bad.any():
        ts.loc[bad] = pd.to_datetime(df.loc[bad, "date"], dayfirst=True, errors="coerce", utc=True)
    df = df.copy()
    df["dt"] = ts
    df = df[df["dt"].notna()].copy()
    df["month"] = df["dt"].dt.strftime("%Y-%m")
    df["year"] = df["dt"].dt.year.astype(int)
    df["interest"] = pd.to_numeric(df["interest"], errors="coerce")
    df = df[df["interest"].notna()]
    return df


def load_trends_raw() -> pd.DataFrame:
    """All Trends rows with time cols (keeps every keyword in each comparison_group)."""
    df = pd.read_csv(DATA / "trends_timeseries.csv", encoding="utf-8-sig")
    df["geo"] = df["geo"].fillna("").astype(str).str.strip()
    df = df[df["geo"] != ""].copy()
    df["iso3"] = df["geo"].map(lambda g: iso3(g))
    df = df[df["iso3"].notna()].copy()
    df["comparison_group"] = df["comparison_group"].fillna("").astype(str)
    df["keyword"] = df["keyword"].fillna("").astype(str)
    return _attach_time_cols(df)


def load_trends() -> pd.DataFrame:
    df = load_trends_raw()
    df["theme"] = df["keyword"].map(KEYWORD_THEME)
    df = df[df["theme"].notna()].copy()
    return df


def primary_batch_info(raw: pd.DataFrame) -> dict[str, dict]:
    """Per geo: primary comparison_group containing ASMR + local insomnia keyword."""
    out: dict[str, dict] = {}
    for geo, g in raw.groupby("geo", sort=True):
        groups: dict[str, set[str]] = {}
        for cg, sub in g.groupby("comparison_group"):
            groups[str(cg)] = set(sub["keyword"].unique())
        primary = None
        insomnia_kw = None
        for cg, kws in groups.items():
            hit = sorted(kws & INSOMNIA_KEYWORDS)
            if "ASMR" in kws and hit:
                primary = cg
                insomnia_kw = hit[0]
                break
        out[str(geo)] = {
            "iso3": iso3(str(geo)),
            "groups": groups,
            "primary": primary,
            "insomnia_keyword": insomnia_kw,
        }
    return out


def write_trends_batches_csv(raw: pd.DataFrame) -> Path:
    """Inventory comparison_groups vs published (mixed) theme sources."""
    info = primary_batch_info(raw)
    # Which groups contribute to legacy published ASMR / insomnia means?
    themed = raw.copy()
    themed["theme"] = themed["keyword"].map(KEYWORD_THEME)
    themed = themed[themed["theme"].notna()]

    rows_out: list[dict] = []
    flagged: list[str] = []
    for geo, meta in sorted(info.items()):
        iso = meta["iso3"]
        primary = meta["primary"]
        ins_kw = meta["insomnia_keyword"]
        g_theme = themed[themed["geo"] == geo]
        asmr_groups = sorted(
            g_theme[g_theme["theme"] == "asmr"]["comparison_group"].unique()
        )
        ins_groups = sorted(
            g_theme[g_theme["theme"] == "insomnia"]["comparison_group"].unique()
        )
        # Published ASMR mixes all asmr_groups; insomnia usually one group
        asmr_differs = set(asmr_groups) != set(ins_groups) or (
            primary is not None and set(asmr_groups) != {primary}
        )
        if asmr_differs:
            flagged.append(str(geo))
        for cg, kws in sorted(meta["groups"].items()):
            rows_out.append({
                "geo": geo,
                "iso3": iso or "",
                "comparison_group": cg,
                "keywords": "|".join(sorted(kws)),
                "is_primary_asmr_insomnia_batch": int(cg == primary),
                "insomnia_keyword_in_batch": next(
                    (k for k in sorted(kws) if k in INSOMNIA_KEYWORDS), ""
                ),
                "published_asmr_includes_this_batch": int(cg in asmr_groups),
                "published_insomnia_includes_this_batch": int(cg in ins_groups),
                "flag_published_asmr_batch_differs_from_insomnia": int(asmr_differs),
                "published_asmr_comparison_groups": "|".join(asmr_groups),
                "published_insomnia_comparison_groups": "|".join(ins_groups),
                "merge_batches_code": MERGE_BATCHES_QUOTE if cg == primary else "",
            })

    path = ROOT / "config" / "trends_batches.csv"
    path.parent.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(rows_out).to_csv(path, index=False, encoding="utf-8-sig")
    print(f"  wrote {path.relative_to(ROOT)} ({len(rows_out)} rows)")
    print(
        f"  flagged geos (published ASMR mixes ≠ insomnia batch): "
        f"{', '.join(flagged) if flagged else '(none)'}"
    )
    print(f"  merge-batches code quote: {MERGE_BATCHES_QUOTE}")
    return path


def _centred_rolling_mean(series: pd.Series, window: int = 12) -> pd.Series:
    """12-month centred rolling mean; edges are partial (min_periods=1)."""
    s = series.sort_index()
    return s.rolling(window=window, center=True, min_periods=1).mean()


def _take_off_from_smoothed(smoothed: pd.Series, threshold: float) -> int | None:
    """First calendar year whose mean of smoothed own_peak exceeds threshold."""
    if smoothed.empty:
        return None
    df = smoothed.rename("v").reset_index()
    # index may be named 'month'
    month_col = df.columns[0]
    df["year"] = df[month_col].astype(str).str.slice(0, 4).astype(int)
    yearly = df.groupby("year")["v"].mean().sort_index()
    for y, v in yearly.items():
        if float(v) > threshold:
            return int(y)
    return None


def _mean_own_peak(own_peak: pd.Series, months: list[str]) -> float | None:
    """Mean of own_peak over listed months; drop NaN; None if no values."""
    vals = []
    for m in months:
        if m in own_peak.index:
            v = own_peak.loc[m]
            if pd.notna(v):
                vals.append(float(v))
    if not vals:
        return None
    return float(sum(vals) / len(vals))


def build_trends_v2(raw: pd.DataFrame) -> tuple[dict, dict]:
    """Primary-batch-only country + monthly metrics (no cross-batch mixing)."""
    info = primary_batch_info(raw)
    country_rows: list[dict] = []
    share_notes: list[dict] = []
    months_all: set[str] = set()
    own_peak_by_iso: dict[str, dict[str, float]] = {}
    sens_rows: list[dict] = []

    for geo, meta in sorted(info.items()):
        iso = meta["iso3"]
        primary = meta["primary"]
        ins_kw = meta["insomnia_keyword"]
        if not iso or not primary or not ins_kw:
            continue
        g = raw[(raw["geo"] == geo) & (raw["comparison_group"] == primary)]
        asmr = g[g["keyword"] == "ASMR"]
        insomnia = g[g["keyword"] == ins_kw]
        asmr_m = asmr.groupby("month", sort=True)["interest"].mean()
        ins_m = insomnia.groupby("month", sort=True)["interest"].mean()
        common = asmr_m.index.intersection(ins_m.index)
        if len(common) == 0:
            continue
        mean_a = float(asmr_m.loc[common].mean())
        mean_i = float(ins_m.loc[common].mean())
        denom = mean_a + mean_i
        share = (mean_a / denom) if denom > 0 else None
        peak = float(asmr_m.max()) if len(asmr_m) else 0.0
        own_peak = (asmr_m / peak * 100.0) if peak > 0 else asmr_m * 0.0
        months_all.update(own_peak.index.astype(str))
        own_peak_by_iso[iso] = {str(m): float(v) for m, v in own_peak.items()}

        # take_off kept ONLY in sensitivity CSV (not published on web)
        smoothed = _centred_rolling_mean(own_peak, 12)
        t30 = _take_off_from_smoothed(smoothed, 30.0)
        t50 = _take_off_from_smoothed(smoothed, 50.0)
        t70 = _take_off_from_smoothed(smoothed, 70.0)

        years_present = [y for y in (t30, t50, t70) if y is not None]
        thresh_disagree = False
        if len(years_present) >= 2:
            thresh_disagree = (max(years_present) - min(years_present)) > 2
        elif sum(y is None for y in (t30, t50, t70)) and years_present:
            thresh_disagree = True

        # Flags use complete months only for zero-share (drop partial edges)
        complete = own_peak[
            ~own_peak.index.astype(str).isin(TRENDS_PARTIAL_MONTHS)
        ]
        n_months = int(len(complete))
        n_zero = int((complete == 0).sum()) if n_months else 0
        share_zero = (n_zero / n_months) if n_months else 0.0
        low_volume = share_zero > 0.5

        peak_month = str(own_peak.idxmax()) if len(own_peak) else None
        peak_before_2010 = bool(
            peak_month and int(str(peak_month)[:4]) < 2010
        )

        first12 = _mean_own_peak(own_peak, WINDOW_FIRST_12)
        recent12 = _mean_own_peak(own_peak, WINDOW_RECENT_12)
        first6 = _mean_own_peak(own_peak, WINDOW_FIRST_6)
        recent6 = _mean_own_peak(own_peak, WINDOW_RECENT_6)
        ch12 = (recent12 - first12) if first12 is not None and recent12 is not None else None
        ch6 = (recent6 - first6) if first6 is not None and recent6 is not None else None

        # Noise of change_in_window: SE of difference of two 12-month means
        # (optimistic — ignores monthly autocorrelation)
        first_vals = [
            float(own_peak.loc[m])
            for m in WINDOW_FIRST_12
            if m in own_peak.index and pd.notna(own_peak.loc[m])
        ]
        recent_vals = [
            float(own_peak.loc[m])
            for m in WINDOW_RECENT_12
            if m in own_peak.index and pd.notna(own_peak.loc[m])
        ]
        change_se = None
        within_noise = False
        if len(first_vals) >= 2 and len(recent_vals) >= 2 and ch12 is not None:
            v1 = float(np.var(first_vals, ddof=1))
            v2 = float(np.var(recent_vals, ddof=1))
            change_se = float(np.sqrt(v1 / 12.0 + v2 / 12.0))
            within_noise = abs(float(ch12)) < 2.0 * change_se

        sens_rows.append({
            "iso3": iso,
            "geo": geo,
            "take_off_year_30": t30 if t30 is not None else "",
            "take_off_year_50": t50 if t50 is not None else "",
            "take_off_year_70": t70 if t70 is not None else "",
            "threshold_disagree_gt2": int(thresh_disagree),
            "share_months_index_0": round(share_zero, 6),
            "low_volume": int(low_volume),
            "peak_month": peak_month or "",
            "peak_before_2010": int(peak_before_2010),
            "note": TAKE_OFF_NOT_PUBLISHABLE,
        })

        # share / insomnia means kept for notes CSV only (not published — part-whole / cross-country invalid)
        share_notes.append({
            "iso3": iso,
            "geo": geo,
            "primary_comparison_group": primary,
            "insomnia_keyword": ins_kw,
            "asmr_share_of_batch": clean_num(share),
            "asmr_mean_primary": clean_num(mean_a),
            "insomnia_mean_primary": clean_num(mean_i),
            "note": "not publishable cross-country; asmr_share has insomnia in denominator; insomnia index is request-normalised",
        })

        country_rows.append({
            "iso3": iso,
            "geo": geo,
            "primary_comparison_group": primary,
            "peak_month": peak_month,
            "change_in_window": clean_num(ch12),
            "recent_vs_peak": clean_num(recent12),
            "change_in_window_6m": clean_num(ch6),
            "recent_vs_peak_6m": clean_num(recent6),
            "change_se": clean_num(change_se),
            "within_noise": bool(within_noise),
            "n_months_shared": int(len(common)),
            "n_months_complete": n_months,
            "share_months_index_0": clean_num(share_zero),
            "flag_low_volume": low_volume,
        })

    sens_df = pd.DataFrame(sens_rows)
    corr_meta: dict[str, dict] = {}
    for a, b, label in (
        ("take_off_year_30", "take_off_year_50", "rho_30_vs_50"),
        ("take_off_year_50", "take_off_year_70", "rho_50_vs_70"),
        ("take_off_year_30", "take_off_year_70", "rho_30_vs_70"),
    ):
        aa = pd.to_numeric(sens_df[a], errors="coerce")
        bb = pd.to_numeric(sens_df[b], errors="coerce")
        mask = aa.notna() & bb.notna()
        if int(mask.sum()) >= 3:
            rho = float(aa[mask].corr(bb[mask], method="spearman"))
            corr_meta[label] = {"n": int(mask.sum()), "rho": clean_num(rho)}
        else:
            corr_meta[label] = {"n": int(mask.sum()), "rho": None}

    # Window robustness Spearman (paired by iso3 from country_rows)
    cr_df = pd.DataFrame(country_rows)
    window_spearman: dict[str, dict] = {}
    for col12, col6, label in (
        ("change_in_window", "change_in_window_6m", "change_in_window_12_vs_6"),
        ("recent_vs_peak", "recent_vs_peak_6m", "recent_vs_peak_12_vs_6"),
    ):
        aa = pd.to_numeric(cr_df[col12], errors="coerce")
        bb = pd.to_numeric(cr_df[col6], errors="coerce")
        mask = aa.notna() & bb.notna()
        n = int(mask.sum())
        if n >= 3:
            rho = float(aa[mask].corr(bb[mask], method="spearman"))
            window_spearman[label] = {"n": n, "rho": clean_num(rho)}
        else:
            window_spearman[label] = {"n": n, "rho": None}

    sens_path = DATA / "take_off_sensitivity.csv"
    extra = [{
        "iso3": "_NOTE",
        "geo": "",
        "take_off_year_30": "",
        "take_off_year_50": "",
        "take_off_year_70": "",
        "threshold_disagree_gt2": "",
        "share_months_index_0": "",
        "low_volume": "",
        "peak_month": "",
        "peak_before_2010": "",
        "note": TAKE_OFF_NOT_PUBLISHABLE,
    }]
    for label, meta in corr_meta.items():
        extra.append({
            "iso3": f"_spearman_{label}",
            "geo": "",
            "take_off_year_30": "",
            "take_off_year_50": "",
            "take_off_year_70": "",
            "threshold_disagree_gt2": "",
            "share_months_index_0": "",
            "low_volume": "",
            "peak_month": "",
            "peak_before_2010": "",
            "note": f"{label}: n={meta['n']} rho={meta['rho']}",
        })
    out_sens = pd.concat([sens_df, pd.DataFrame(extra)], ignore_index=True)
    out_sens.to_csv(sens_path, index=False, encoding="utf-8-sig")
    print(f"  wrote {sens_path.relative_to(ROOT)} ({TAKE_OFF_NOT_PUBLISHABLE})")
    for label, meta in corr_meta.items():
        print(f"  {label}: n={meta['n']} rho={meta['rho']}")
    for label, meta in window_spearman.items():
        print(f"  window Spearman {label}: n={meta['n']} rho={meta['rho']}")

    notes_path = DATA / "trends_share_notes.csv"
    pd.DataFrame(share_notes).to_csv(notes_path, index=False, encoding="utf-8-sig")
    print(f"  wrote {notes_path.relative_to(ROOT)} (asmr_share/insomnia means — notes only)")

    n_low = int(sum(1 for r in country_rows if r["flag_low_volume"]))
    n_noise = int(sum(1 for r in country_rows if r.get("within_noise")))
    n_rise = int(
        sum(
            1
            for r in country_rows
            if r.get("change_in_window") is not None
            and float(r["change_in_window"]) > 0
            and not r.get("within_noise")
        )
    )
    n_fall = int(
        sum(
            1
            for r in country_rows
            if r.get("change_in_window") is not None
            and float(r["change_in_window"]) < 0
            and not r.get("within_noise")
        )
    )
    print(
        f"  flags: low_volume={n_low} within_noise={n_noise} "
        f"rise_beyond_noise={n_rise} fall_beyond_noise={n_fall}"
    )

    months = sorted(months_all)
    countries = sorted(own_peak_by_iso.keys())
    series = {
        "own_peak_asmr": {
            c: [clean_num(own_peak_by_iso[c].get(m)) for m in months] for c in countries
        }
    }
    country_payload = {
        "meta": {
            "source_files": [
                "trends_timeseries.csv",
                "config/trends_batches.csv",
            ],
            "generated_at": now_iso(),
            "n": len(country_rows),
            "metric": "own_peak_within_country",
            "complete_months_dropped_partial": sorted(TRENDS_PARTIAL_MONTHS),
            "window_first_12": WINDOW_FIRST_12,
            "window_recent_12": WINDOW_RECENT_12,
            "window_first_6": WINDOW_FIRST_6,
            "window_recent_6": WINDOW_RECENT_6,
            "window_spearman_12_vs_6": window_spearman,
            "flag_counts": {
                "low_volume": n_low,
                "within_noise": n_noise,
                "rise_beyond_noise": n_rise,
                "fall_beyond_noise": n_fall,
            },
            "caveats": list(V2_CAVEATS) + [
                "change_in_window = mean(own_peak, 2025-11..2026-10) − mean(own_peak, 2021-11..2022-10); partial months 2021-10 and 2026-11 dropped.",
                "recent_vs_peak = mean(own_peak, 2025-11..2026-10).",
                "change_in_window_6m / recent_vs_peak_6m use first/last 6 complete months; Spearman rank corr vs 12-month versions is in meta.window_spearman_12_vs_6.",
                "asmr_share_of_batch and insomnia index are not published (part-whole / cross-country invalid); see data/trends_share_notes.csv.",
                "within_noise: |change_in_window| < 2 × change_se, where change_se = sqrt(var(first-12)/12 + var(last-12)/12); map hatches these countries.",
                "Monthly values are autocorrelated, so standard errors are optimistic.",
                "flag_low_volume: >50% of complete months have own_peak index 0.",
            ],
        },
        "rows": country_rows,
    }
    monthly_payload = {
        "meta": {
            "source_files": ["trends_timeseries.csv", "config/trends_batches.csv"],
            "generated_at": now_iso(),
            "n": sum(len(v) for v in series["own_peak_asmr"].values()),
            "n_months": len(months),
            "n_countries": len(countries),
            "series_keys": ["own_peak_asmr"],
            "caveats": list(V2_CAVEATS) + [
                "Time-lapse uses own_peak_series: monthly ASMR from the primary batch ÷ that country's own max × 100.",
            ],
        },
        "months": months,
        "countries": countries,
        "series": series,
    }
    return country_payload, monthly_payload


def build_trends_country(df: pd.DataFrame) -> dict:
    rows = []
    for (iso, theme), g in df.groupby(["iso3", "theme"], sort=True):
        # Mean across keywords in theme at each timestamp, then overall mean
        by_ts = g.groupby("dt", as_index=False)["interest"].mean()
        mean_idx = float(by_ts["interest"].mean())
        by_month = g.groupby("month")["interest"].mean()
        peak_month = str(by_month.idxmax()) if len(by_month) else None
        yearly = {
            str(int(y)): clean_num(v)
            for y, v in g.groupby("year")["interest"].mean().items()
        }
        rows.append({
            "iso3": iso,
            "theme": theme,
            "mean_index": clean_num(mean_idx),
            "peak_month": peak_month,
            "yearly": yearly,
            "n_points": int(len(g)),
        })
    return {
        "meta": {
            "source_files": ["trends_timeseries.csv"],
            "generated_at": now_iso(),
            "n": len(rows),
            "themes": sorted(df["theme"].unique().tolist()),
            "main_themes": MAIN_THEMES,
            "caveats": [
                "Google Trends interest is a relative 0–100 index scaled within each country (and keyword batch), not absolute search volume.",
                "Values are not comparable across countries in absolute terms — only within-country shape or rank.",
                "Keywords in different languages are mapped into shared themes (asmr / insomnia / sleep / white_noise / meditation).",
            ],
        },
        "rows": rows,
    }


def build_trends_monthly(df: pd.DataFrame) -> dict:
    sub = df[df["theme"].isin(MAIN_THEMES)].copy()
    # Average keywords within theme per country-month
    agg = (
        sub.groupby(["month", "iso3", "theme"], as_index=False)["interest"]
        .mean()
        .sort_values(["month", "iso3", "theme"])
    )
    months = sorted(agg["month"].unique().tolist())
    countries = sorted(agg["iso3"].unique().tolist())
    # Dense series: theme -> iso3 -> list aligned to months (null if missing)
    pivot = {
        theme: {c: [None] * len(months) for c in countries}
        for theme in MAIN_THEMES
    }
    month_index = {m: i for i, m in enumerate(months)}
    for _, r in agg.iterrows():
        pivot[r["theme"]][r["iso3"]][month_index[r["month"]]] = clean_num(r["interest"])
    return {
        "meta": {
            "source_files": ["trends_timeseries.csv"],
            "generated_at": now_iso(),
            "n": int(len(agg)),
            "n_months": len(months),
            "n_countries": len(countries),
            "themes": MAIN_THEMES,
            "caveats": [
                "Map time-lapse uses monthly mean interest by theme; index is relative within each country/batch.",
                "Absolute levels are not comparable across countries.",
                "Four themes: asmr, insomnia, sleep, white_noise (localized keywords folded into each).",
            ],
        },
        "months": months,
        "countries": countries,
        "series": pivot,
    }


BOOTSTRAP_N = 2000
BOOTSTRAP_SEED = 42


def spearman(a: pd.Series, b: pd.Series, *, seed: int = BOOTSTRAP_SEED) -> dict:
    """Spearman rho, exact two-sided p, and 95% bootstrap CI (BOOTSTRAP_N resamples)."""
    from scipy import stats

    mask = a.notna() & b.notna()
    n = int(mask.sum())
    if n < 3:
        return {
            "n": n,
            "rho": None,
            "p": None,
            "ci95_low": None,
            "ci95_high": None,
            "note": "too few paired observations",
        }
    x = a[mask].to_numpy(dtype=float)
    y = b[mask].to_numpy(dtype=float)
    res = stats.spearmanr(x, y)
    rho = float(res.statistic)
    p = float(res.pvalue)

    rng = np.random.default_rng(seed)
    boots = []
    for _ in range(BOOTSTRAP_N):
        idx = rng.integers(0, n, size=n)
        br = stats.spearmanr(x[idx], y[idx])
        val = float(br.statistic)
        if np.isfinite(val):
            boots.append(val)
    if len(boots) >= 10:
        lo, hi = np.quantile(np.asarray(boots, dtype=float), [0.025, 0.975])
        ci_lo, ci_hi = clean_num(float(lo)), clean_num(float(hi))
    else:
        ci_lo, ci_hi = None, None
    return {
        "n": n,
        "rho": clean_num(rho) if pd.notna(rho) else None,
        "p": clean_num(p) if pd.notna(p) else None,
        "ci95_low": ci_lo,
        "ci95_high": ci_hi,
    }


def holm_adjust(p_values: list[float | None]) -> list[float | None]:
    """Holm–Bonferroni adjusted p-values (same order as input)."""
    m = len(p_values)
    indexed = [(i, p) for i, p in enumerate(p_values)]
    # None stays None
    valid = [(i, p) for i, p in indexed if p is not None and pd.notna(p)]
    valid.sort(key=lambda t: t[1])
    adj = [None] * m
    running = 0.0
    for rank, (i, p) in enumerate(valid):
        # Holm: (m - rank) * p, monotone non-decreasing, capped at 1
        raw = (m - rank) * float(p)
        running = max(running, raw)
        adj[i] = clean_num(min(1.0, running))
    return adj


def _load_indicators() -> pd.DataFrame:
    ind = pd.read_csv(DATA / "indicators_country.csv", encoding="utf-8-sig")
    ind["iso2"] = ind["iso2"].astype(str).str.strip().str.upper()
    ind["iso3"] = ind.apply(
        lambda r: (
            str(r["iso3"]).strip().upper()
            if pd.notna(r["iso3"]) and str(r["iso3"]).strip()
            else iso3(r["iso2"])
        ),
        axis=1,
    )
    return ind


def _spearman_blocks(rdf: pd.DataFrame, pair_specs: list[tuple[str, str, str]]) -> tuple[dict, dict]:
    def pack_block(frame: pd.DataFrame, seed: int) -> dict:
        block = {k: spearman(frame[a], frame[b], seed=seed) for k, a, b in pair_specs}
        keys = [k for k, _, _ in pair_specs]
        holm = holm_adjust([block[k].get("p") for k in keys])
        for k, hp in zip(keys, holm):
            block[k]["p_holm"] = hp
        return block

    correlations = pack_block(rdf, BOOTSTRAP_SEED)
    rdf_no_tw = rdf[rdf["iso3"] != "TWN"]
    correlations_excluding_twn = pack_block(rdf_no_tw, BOOTSTRAP_SEED + 1)
    return correlations, correlations_excluding_twn


def build_insomnia_vs_asmr_raw_mean(trends: pd.DataFrame) -> dict:
    """Legacy: mixed-batch theme means (kept for comparison only)."""
    theme_mean = (
        trends[trends["theme"].isin(["asmr", "insomnia"])]
        .groupby(["iso3", "theme"])["interest"]
        .mean()
        .unstack("theme")
    )
    ind = _load_indicators()
    countries = sorted(set(theme_mean.index) | set(ind["iso3"].dropna().unique()))
    rows = []
    for c in countries:
        asmr = (
            float(theme_mean.loc[c, "asmr"])
            if c in theme_mean.index and "asmr" in theme_mean.columns and pd.notna(theme_mean.loc[c].get("asmr"))
            else None
        )
        ins = (
            float(theme_mean.loc[c, "insomnia"])
            if c in theme_mean.index
            and "insomnia" in theme_mean.columns
            and pd.notna(theme_mean.loc[c].get("insomnia"))
            else None
        )
        sub = ind[ind["iso3"] == c]

        def pick(code: str):
            hit = sub[sub["indicator_code"] == code]
            if hit.empty:
                return None, None, "absent"
            v = hit.iloc[0]["value"]
            y = hit.iloc[0]["year"]
            src = str(hit.iloc[0].get("source_url") or "")
            if pd.isna(v):
                return None, None, "missing"
            st = (
                "ok_tw_official"
                if c == "TWN" or "moda.gov.tw" in src or "ris.gov.tw" in src
                else "ok"
            )
            return clean_num(float(v)), (int(y) if pd.notna(y) else None), st

        inet, inet_y, inet_st = pick("IT.NET.USER.ZS")
        youth, youth_y, youth_st = pick("DERIVED.POP.1524.ZS")
        if inet_st in ("missing", "absent") or youth_st in ("missing", "absent"):
            status = "missing"
        elif inet_st == "ok_tw_official" or youth_st == "ok_tw_official":
            status = "ok_tw_official"
        else:
            status = "ok"
        rows.append({
            "iso3": c,
            "asmr_index": clean_num(asmr) if asmr is not None else None,
            "insomnia_index": clean_num(ins) if ins is not None else None,
            "internet_users_pct": inet,
            "internet_users_year": inet_y,
            "youth_share_pct": youth,
            "youth_share_year": youth_y,
            "indicators_status": status,
        })

    rdf = pd.DataFrame(rows)
    pair_specs = [
        ("insomnia_vs_asmr", "insomnia_index", "asmr_index"),
        ("insomnia_vs_internet", "insomnia_index", "internet_users_pct"),
        ("asmr_vs_internet", "asmr_index", "internet_users_pct"),
        ("insomnia_vs_youth", "insomnia_index", "youth_share_pct"),
        ("asmr_vs_youth", "asmr_index", "youth_share_pct"),
        ("internet_vs_youth", "internet_users_pct", "youth_share_pct"),
    ]
    correlations, correlations_excluding_twn = _spearman_blocks(rdf, pair_specs)
    return {
        "meta": {
            "source_files": [
                "trends_timeseries.csv",
                "indicators_country.csv",
                "taiwan_official/taiwan_indicators.csv",
            ],
            "generated_at": now_iso(),
            "n": len(rows),
            "metric": "raw_mixed_batch_means",
            "n_missing_indicators": int((rdf["indicators_status"] == "missing").sum()),
            "youth_share_indicator": "DERIVED.POP.1524.ZS",
            "youth_share_age_band": "15-24",
            "spearman_bootstrap_n": BOOTSTRAP_N,
            "spearman_bootstrap_seed": BOOTSTRAP_SEED,
            "caveats": [
                "LEGACY comparison file: ASMR/insomnia means may mix multiple comparison_groups within a country.",
                "Kept only so share-based Spearman can be compared side by side.",
                f"Each Spearman entry includes rho, n, exact two-sided p, 95% bootstrap CI ({BOOTSTRAP_N} resamples), Holm p across six pairs.",
            ],
        },
        "correlations": correlations,
        "correlations_excluding_twn": correlations_excluding_twn,
        "countries": rows,
    }


def build_insomnia_vs_asmr(country_v2: dict) -> dict:
    """Country-level associations: own-peak Trends change metrics vs context indicators.

    Filename kept for continuity. asmr_share_of_batch / insomnia index are NOT published
    (part-whole artefact / request-normalised — see data/trends_share_notes.csv).
    """
    v2_by = {r["iso3"]: r for r in country_v2["rows"]}
    ind = _load_indicators()
    countries = sorted(set(v2_by.keys()) | set(ind["iso3"].dropna().unique()))
    rows = []
    for c in countries:
        v2 = v2_by.get(c) or {}
        sub = ind[ind["iso3"] == c]

        def pick(code: str):
            hit = sub[sub["indicator_code"] == code]
            if hit.empty:
                return None, None, "absent"
            v = hit.iloc[0]["value"]
            y = hit.iloc[0]["year"]
            src = str(hit.iloc[0].get("source_url") or "")
            if pd.isna(v):
                return None, None, "missing"
            st = (
                "ok_tw_official"
                if c == "TWN" or "moda.gov.tw" in src or "ris.gov.tw" in src
                else "ok"
            )
            return clean_num(float(v)), (int(y) if pd.notna(y) else None), st

        inet, inet_y, inet_st = pick("IT.NET.USER.ZS")
        youth, youth_y, youth_st = pick("DERIVED.POP.1524.ZS")
        if inet_st in ("missing", "absent") or youth_st in ("missing", "absent"):
            status = "missing"
        elif inet_st == "ok_tw_official" or youth_st == "ok_tw_official":
            status = "ok_tw_official"
        else:
            status = "ok"
        rows.append({
            "iso3": c,
            "change_in_window": v2.get("change_in_window"),
            "recent_vs_peak": v2.get("recent_vs_peak"),
            "internet_users_pct": inet,
            "internet_users_year": inet_y,
            "youth_share_pct": youth,
            "youth_share_year": youth_y,
            "flag_low_volume": bool(v2.get("flag_low_volume")),
            "indicators_status": status,
        })

    rdf = pd.DataFrame(rows)
    # Holm family: exactly these 4 pairs
    holm_specs = [
        ("change_vs_internet", "change_in_window", "internet_users_pct"),
        ("change_vs_youth", "change_in_window", "youth_share_pct"),
        ("recent_vs_internet", "recent_vs_peak", "internet_users_pct"),
        ("recent_vs_youth", "recent_vs_peak", "youth_share_pct"),
    ]
    correlations, correlations_excluding_twn = _spearman_blocks(rdf, holm_specs)
    for block in (correlations, correlations_excluding_twn):
        for v in block.values():
            v["exploratory"] = False
            v["holm_family"] = True

    # Descriptive context pair — outside Holm family
    def _pack_desc(frame: pd.DataFrame, seed: int) -> dict:
        d = spearman(frame["internet_users_pct"], frame["youth_share_pct"], seed=seed)
        d["exploratory"] = False
        d["holm_family"] = False
        d["p_holm"] = None
        d["label"] = "not about ASMR"
        return d

    descriptive = {
        "internet_vs_youth": _pack_desc(rdf, BOOTSTRAP_SEED + 10),
    }
    descriptive_excluding_twn = {
        "internet_vs_youth": _pack_desc(rdf[rdf["iso3"] != "TWN"], BOOTSTRAP_SEED + 11),
    }

    return {
        "meta": {
            "source_files": [
                "trends_timeseries.csv",
                "indicators_country.csv",
                "taiwan_official/taiwan_indicators.csv",
                "web/data/trends_country_v2.json",
            ],
            "generated_at": now_iso(),
            "n": len(rows),
            "metric": "change_in_window_and_recent_vs_peak",
            "n_missing_indicators": int((rdf["indicators_status"] == "missing").sum()),
            "youth_share_indicator": "DERIVED.POP.1524.ZS",
            "youth_share_age_band": "15-24",
            "spearman_bootstrap_n": BOOTSTRAP_N,
            "spearman_bootstrap_seed": BOOTSTRAP_SEED,
            "spearman_holm_n_pairs": 4,
            "spearman_descriptive_n_pairs": 1,
            "caveats": list(V2_CAVEATS) + [
                "Why no insomnia comparison? Google Trends indices are normalised within each request, so search levels of different terms cannot be compared across countries.",
                "asmr_share_of_batch is not used (insomnia term is in its denominator — part-whole artefact).",
                "Holm adjustment applies only to the 4 ASMR own-peak × context pairs.",
                "internet_vs_youth is a descriptive context pair (not about ASMR) and is outside the Holm family.",
                "Indicator years differ (internet often 2024, youth share 2025) — not a same-year snapshot.",
                "TWN indicators come from official Taiwan statistics; internet use is 12+ individuals (denominator excludes children).",
                "Youth-share column uses ages 15–24 (DERIVED.POP.1524.ZS).",
                "Spearman reported with and without TWN; each pair uses non-missing countries only.",
                f"Each Holm-family entry: rho, n, exact two-sided p, 95% bootstrap CI ({BOOTSTRAP_N} resamples), Holm p across the 4 pairs.",
            ],
        },
        "correlations": correlations,
        "correlations_excluding_twn": correlations_excluding_twn,
        "correlations_descriptive": descriptive,
        "correlations_descriptive_excluding_twn": descriptive_excluding_twn,
        "countries": rows,
    }


def chinese_query_share() -> tuple[float, int, int]:
    q = pd.read_csv(DATA / "yt_query_log.csv", encoding="utf-8-sig")
    terms = q["term"].fillna("").astype(str)
    n = len(terms)
    n_han = int(terms.map(lambda t: bool(HAN_RE.search(t))).sum())
    return (n_han / n if n else 0.0), n_han, n


SAMPLE_EXPANSION_CAVEAT = (
    "Videos come from the catalogues of channels we found through ASMR/sleep searches "
    "(95.9% of videos entered through channel expansion, which pages each channel's "
    "uploads playlist newest-first, typically up to 100 videos per pass); recent uploads "
    "dominate (60.7% from 2025-26), so this sample says nothing about growth over time."
)

DURATION_TAG_FOOTNOTE = (
    "Tags come from keywords in title, tags, description or topic categories "
    "(a creator's own labelling, often added for search); not a judgement of the content."
)

DURATION_MARKERS = [
    {"sec": 3600, "label": "1 hour"},
    {"sec": 28800, "label": "8 hours"},
]


def build_creator_country() -> dict:
    ch = pd.read_csv(DATA / "yt_channel_country.csv", encoding="utf-8-sig")
    yt = pd.read_csv(
        DATA / "yt_master.csv",
        encoding="utf-8-sig",
        usecols=[
            "videoId", "channelId", "viewCount",
            "is_asmr_related", "is_sleep_related",
        ],
        dtype={"channelId": "string"},
    )
    yt["viewCount"] = pd.to_numeric(yt["viewCount"], errors="coerce")
    for col in ("is_asmr_related", "is_sleep_related"):
        yt[col] = yt[col].astype(str).str.strip().str.lower().isin(["1", "true", "yes"])

    ch["country"] = ch["country"].fillna("").astype(str).str.strip().str.upper()
    ch["has_country"] = ch["country"] != ""
    ch["iso3"] = ch["country"].map(lambda c: iso3(c) if c else None)
    # Unmapped but declared countries stay identifiable (should be rare after ISO table)
    unmapped = ch["has_country"] & ch["iso3"].isna()
    if unmapped.any():
        missing = sorted(ch.loc[unmapped, "country"].unique())
        raise SystemExit(f"Unmapped channel country codes: {missing}")

    n_ch = len(ch)
    # Coverage = declared country present (matches DATA_AUDIT), not TopoJSON membership
    n_ch_known = int(ch["has_country"].sum())
    cov_ch = n_ch_known / n_ch if n_ch else 0.0

    merged = yt.merge(ch[["channelId", "iso3", "has_country"]], on="channelId", how="left")
    merged["has_country"] = merged["has_country"].fillna(False)
    n_vid = len(merged)
    n_vid_known = int(merged["has_country"].sum())
    cov_vid = n_vid_known / n_vid if n_vid else 0.0

    vpc = yt.groupby("channelId").size()
    median_vpc = float(vpc.median()) if len(vpc) else None
    p90_vpc = float(vpc.quantile(0.9)) if len(vpc) else None

    han_share, n_han, n_q = chinese_query_share()

    def bucket(label: str, g: pd.DataFrame) -> dict:
        return {
            "iso3": label,
            "video_count": int(len(g)),
            "channel_count": int(g["channelId"].nunique()),
            "share_asmr": clean_num(float(g["is_asmr_related"].mean())) if len(g) else None,
            "share_sleep": clean_num(float(g["is_sleep_related"].mean())) if len(g) else None,
            "median_views": clean_num(float(g["viewCount"].median())) if g["viewCount"].notna().any() else None,
        }

    rows = []
    known = merged[merged["iso3"].notna()]
    for c, g in known.groupby("iso3", sort=True):
        rows.append(bucket(c, g))
    unknown = merged[merged["iso3"].isna()]
    rows.append(bucket("unknown", unknown))

    return {
        "meta": {
            "source_files": [
                "yt_master.csv",
                "yt_channel_country.csv",
                "yt_query_log.csv",
            ],
            "generated_at": now_iso(),
            "n_videos": n_vid,
            "n_channels": n_ch,
            "coverage_channels_pct": clean_num(100 * cov_ch),
            "coverage_videos_pct": clean_num(100 * cov_vid),
            "median_videos_per_channel": clean_num(median_vpc),
            "p90_videos_per_channel": clean_num(p90_vpc),
            "chinese_query_share": clean_num(han_share),
            "chinese_query_n": n_han,
            "chinese_query_denom": n_q,
            "caveats": [
                SAMPLE_EXPANSION_CAVEAT,
                f"Search-log bias: {n_han}/{n_q} ({han_share*100:.1f}%) of yt_query_log calls used Chinese-character terms "
                f"(regions TW/HK/MY/SG only in that log).",
                "Country is the channel's self-declared countryCode, not audience location.",
                f"Coverage: {cov_ch*100:.1f}% of channels and {cov_vid*100:.1f}% of videos (video-weighted) have a known country; "
                "remainder are in the unknown bucket.",
                f"Videos per channel in this sample: median {median_vpc:.0f}, p90 {p90_vpc:.0f} (map symbols use channel counts).",
            ],
        },
        "countries": rows,
    }


def build_tiktok_origin() -> dict:
    df = pd.read_csv(DATA / "tiktok_trial" / "tiktok_asmr_master.csv", encoding="utf-8-sig")
    df["location_created"] = df["location_created"].fillna("").astype(str).str.strip().str.upper()
    df.loc[df["location_created"] == "", "location_created"] = "UNKNOWN"
    df["iso3"] = df["location_created"].map(lambda c: iso3(c) if c != "UNKNOWN" else "UNKNOWN")
    df.loc[df["iso3"].isna(), "iso3"] = "UNKNOWN"
    for col in ("plays", "saves"):
        df[col] = pd.to_numeric(df[col], errors="coerce")

    rows = []
    for c, g in df.groupby("iso3", sort=True):
        rows.append({
            "iso3": c,
            "count": int(len(g)),
            "total_plays": clean_num(float(g["plays"].sum())),
            "median_plays": clean_num(float(g["plays"].median())),
            "total_saves": clean_num(float(g["saves"].sum())),
        })
    return {
        "meta": {
            "source_files": ["tiktok_trial/tiktok_asmr_master.csv"],
            "generated_at": now_iso(),
            "n": int(len(df)),
            "caveats": [
                "Validation sample only (n=168) — not a representative global TikTok census.",
                "location_created is TikTok's creation-location field; coverage and accuracy vary.",
            ],
        },
        "countries": rows,
    }


def log_bins(values: np.ndarray, edges: np.ndarray) -> list[dict]:
    values = values[np.isfinite(values) & (values > 0)]
    counts, _ = np.histogram(values, bins=edges)
    out = []
    for i, c in enumerate(counts):
        out.append({
            "bin_lo": clean_num(float(edges[i])),
            "bin_hi": clean_num(float(edges[i + 1])),
            "count": int(c),
        })
    return out


def _weighted_median(durs: np.ndarray, weights: np.ndarray) -> float | None:
    ok = np.isfinite(durs) & (durs > 0) & np.isfinite(weights) & (weights > 0)
    d = durs[ok]
    w = weights[ok]
    if len(d) == 0:
        return None
    order = np.argsort(d)
    d = d[order]
    w = w[order]
    cw = np.cumsum(w)
    cw = cw / cw[-1]
    return float(d[min(int(np.searchsorted(cw, 0.5, side="left")), len(d) - 1)])


def _duration_group_payload(
    g: pd.DataFrame,
    *,
    label: str,
    edges: np.ndarray,
    n_videos_by_channel: pd.Series,
) -> dict:
    """Build one duration-histogram group with plot coverage + weighting medians."""
    n = int(len(g))
    durs = g["duration_sec"].to_numpy(dtype=float)
    plot_min = float(edges[0])
    plot_max = float(edges[-1])
    valid = np.isfinite(durs) & (durs > 0)
    below = valid & (durs < plot_min)
    above = valid & (durs > plot_max)
    in_range = valid & (durs >= plot_min) & (durs <= plot_max)
    n_invalid = int((~valid).sum())
    n_below = int(below.sum())
    n_above = int(above.sum())
    n_plotted = int(in_range.sum())

    # Video-level weights
    w_video = np.ones(len(g), dtype=float)
    # Channel-equal: 1/n_videos of that channel (across whole master)
    ch = g["channelId"].astype(str)
    w_chan = ch.map(lambda c: 1.0 / float(n_videos_by_channel.get(c, 1))).to_numpy(dtype=float)

    # Capped to 20 most recent per channel within this group
    g2 = g.dropna(subset=["publishedAt"]).sort_values(
        ["channelId", "publishedAt"], ascending=[True, False]
    ).copy()
    g2["rn"] = g2.groupby("channelId").cumcount()
    capped = g2[g2["rn"] < 20]
    d_cap = capped["duration_sec"].to_numpy(dtype=float)
    w_cap = np.ones(len(capped), dtype=float)

    med_video = _weighted_median(durs, w_video)
    med_chan = _weighted_median(durs, w_chan)
    med_cap = _weighted_median(d_cap, w_cap)
    medians = [m for m in (med_video, med_chan, med_cap) if m is not None and m > 0]
    if len(medians) >= 2:
        weighting_sensitive = (max(medians) / min(medians)) > 3.0
    else:
        weighting_sensitive = False

    d_ok = durs[valid]
    share_1h = float((d_ok >= 3600).mean()) if len(d_ok) else None
    share_8h = float((d_ok >= 28800).mean()) if len(d_ok) else None

    return {
        "label": label,
        "bins": log_bins(durs, edges),
        "n": n,
        "n_plotted": n_plotted,
        "n_invalid_duration": n_invalid,
        "n_below_plot_min": n_below,
        "n_above_plot_max": n_above,
        "plot_min_sec": clean_num(plot_min),
        "plot_max_sec": clean_num(plot_max),
        "median_sec_video": clean_num(med_video),
        "median_sec_channel_equal": clean_num(med_chan),
        "median_sec_capped20": clean_num(med_cap),
        "share_ge_1h": clean_num(share_1h),
        "share_ge_8h": clean_num(share_8h),
        "weighting_sensitive": bool(weighting_sensitive),
    }


def build_youtube_yearly() -> dict:
    usecols = [
        "videoId", "channelId", "duration_sec", "viewCount", "publishedAt",
        "is_asmr_related", "is_sleep_related",
    ]
    yt = pd.read_csv(
        DATA / "yt_master.csv", encoding="utf-8-sig", usecols=usecols, low_memory=False
    )
    yt["duration_sec"] = pd.to_numeric(yt["duration_sec"], errors="coerce")
    yt["viewCount"] = pd.to_numeric(yt["viewCount"], errors="coerce")
    yt["publishedAt"] = pd.to_datetime(yt["publishedAt"], errors="coerce", utc=True)
    yt["year"] = yt["publishedAt"].dt.year
    yt["channelId"] = yt["channelId"].fillna("").astype(str)
    for col in ("is_asmr_related", "is_sleep_related"):
        yt[col] = yt[col].astype(str).str.strip().str.lower().isin(["1", "true", "yes"])

    years = []
    yt_y = yt.dropna(subset=["year"]).copy()
    yt_y["year"] = yt_y["year"].astype(int)
    for y, g in yt_y.groupby("year", sort=True):
        years.append({
            "year": int(y),
            "count": int(len(g)),
            "share_asmr": clean_num(float(g["is_asmr_related"].mean())),
            "share_sleep": clean_num(float(g["is_sleep_related"].mean())),
            "median_duration_sec": clean_num(float(g["duration_sec"].median())),
            "median_views": clean_num(float(g["viewCount"].median())),
        })
    unknown_year = yt[yt["year"].isna()]
    if len(unknown_year):
        years.append({
            "year": None,
            "count": int(len(unknown_year)),
            "share_asmr": clean_num(float(unknown_year["is_asmr_related"].mean())),
            "share_sleep": clean_num(float(unknown_year["is_sleep_related"].mean())),
            "median_duration_sec": clean_num(float(unknown_year["duration_sec"].median())),
            "median_views": clean_num(float(unknown_year["viewCount"].median())),
        })

    # Log-spaced duration bins (seconds), shared across tag groups
    edges = np.unique(np.round(np.logspace(0, 5.2, 24), 3))  # ~1s to ~1.6e5s
    n_by_ch = yt.groupby("channelId").size()

    g_both = yt[yt["is_asmr_related"] & yt["is_sleep_related"]]
    g_asmr = yt[yt["is_asmr_related"] & ~yt["is_sleep_related"]]
    g_sleep = yt[~yt["is_asmr_related"] & yt["is_sleep_related"]]

    groups = {
        "asmr_and_sleep": _duration_group_payload(
            g_both,
            label="ASMR-tagged and sleep-tagged",
            edges=edges,
            n_videos_by_channel=n_by_ch,
        ),
        "asmr_not_sleep": _duration_group_payload(
            g_asmr,
            label="ASMR-tagged, not sleep-tagged",
            edges=edges,
            n_videos_by_channel=n_by_ch,
        ),
        "sleep_not_asmr": _duration_group_payload(
            g_sleep,
            label="Sleep-tagged, not ASMR-tagged (e.g. white noise or sleep music)",
            edges=edges,
            n_videos_by_channel=n_by_ch,
        ),
    }

    # Direction: ASMR∩sleep vs ASMR∩¬sleep medians under all three weightings
    a = groups["asmr_and_sleep"]
    b = groups["asmr_not_sleep"]
    pairs = [
        (a.get("median_sec_video"), b.get("median_sec_video")),
        (a.get("median_sec_channel_equal"), b.get("median_sec_channel_equal")),
        (a.get("median_sec_capped20"), b.get("median_sec_capped20")),
    ]
    direction_same = all(
        x is not None and y is not None and float(x) > float(y) for x, y in pairs
    )
    caption = (
        "Median duration of tagged videos under three weightings; "
        "the direction between the first two groups is the same under all of them."
        if direction_same
        else None
    )

    return {
        "meta": {
            "source_files": ["yt_master.csv"],
            "generated_at": now_iso(),
            "n": int(len(yt)),
            "duration_markers_sec": DURATION_MARKERS,
            "duration_tag_footnote": DURATION_TAG_FOOTNOTE,
            "duration_weighting_caption": caption,
            "duration_direction_same_across_weightings": bool(direction_same),
            "caveats": [
                SAMPLE_EXPANSION_CAVEAT,
                DURATION_TAG_FOOTNOTE,
                "Year is from video publishedAt; 2025–2026 dominate due to harvest timing and uploads-playlist paging.",
                "Group n counts all tagged videos (matches the 2×2 in docs/YOUTUBE_DURATION_CHECK.md). "
                "Histogram bins only include finite duration_sec within plot_min_sec…plot_max_sec; "
                "n_invalid_duration / n_below_plot_min / n_above_plot_max explain the rest.",
            ],
        },
        "years": years,
        "duration_histogram": {
            "edges_sec": [clean_num(float(e)) for e in edges],
            "plot_min_sec": clean_num(float(edges[0])),
            "plot_max_sec": clean_num(float(edges[-1])),
            "groups": groups,
        },
    }


def build_wiki_lang() -> dict:
    usecols = ["concept", "project", "month", "access", "views", "status"]
    w = pd.read_csv(DATA / "wiki_pageviews_monthly.csv", encoding="utf-8-sig", usecols=usecols)
    # Use agent=user rollup stored as access=="all" (avoid double-counting desktop+mobile+all).
    w = w[w["access"].astype(str) == "all"].copy()
    w = w[w["status"].astype(str).str.lower() == "ok"].copy()
    w["views"] = pd.to_numeric(w["views"], errors="coerce").fillna(0)
    w["lang"] = w["project"].astype(str).str.split(".").str[0]
    agg = (
        w.groupby(["concept", "lang", "month"], as_index=False)["views"]
        .sum()
        .sort_values(["concept", "lang", "month"])
    )
    months = sorted(agg["month"].unique().tolist())
    month_i = {m: i for i, m in enumerate(months)}
    concepts = sorted(agg["concept"].unique().tolist())
    langs = sorted(agg["lang"].unique().tolist())

    series: dict[str, dict[str, list]] = {}
    totals: dict[str, dict[str, float]] = {}
    takeoff: dict[str, dict[str, dict]] = {}
    for concept, cg in agg.groupby("concept"):
        series[concept] = {}
        totals[concept] = {}
        takeoff[concept] = {}
        for lang, lg in cg.groupby("lang"):
            vals = [None] * len(months)
            for _, r in lg.iterrows():
                vals[month_i[r["month"]]] = float(r["views"])
            total_views = float(sum(v for v in vals if v is not None))
            totals[concept][lang] = clean_num(total_views)
            mx = max((v for v in vals if v is not None), default=0.0)
            if mx <= 0:
                indexed = [None if v is None else 0.0 for v in vals]
            else:
                indexed = [
                    None if v is None else clean_num(100.0 * v / mx)
                    for v in vals
                ]
            series[concept][lang] = indexed

            # First month trailing-12 mean of indexed series exceeds 50
            s = pd.Series(
                [np.nan if v is None else float(v) for v in indexed],
                index=pd.Index(months, name="month"),
            )
            trail = s.rolling(window=12, min_periods=1).mean()
            first_m = None
            for m, v in trail.items():
                if pd.notna(v) and float(v) > 50.0:
                    first_m = str(m)
                    break
            # Left-censored if first exceedance is within first 12 months that have any data
            data_months = [months[i] for i, v in enumerate(indexed) if v is not None]
            left_cens = False
            if first_m and data_months:
                first12 = set(data_months[:12])
                left_cens = first_m in first12
            takeoff[concept][lang] = {
                "first_month_trailing12_gt_50": first_m,
                "left_censored": left_cens,
            }

    # low_traffic: below 25th percentile of total views for concept ASMR (primary UI concept)
    asmr_totals = totals.get("ASMR") or {}
    low_traffic_langs: list[str] = []
    p25 = None
    if asmr_totals:
        vals = sorted(float(v) for v in asmr_totals.values() if v is not None)
        if vals:
            p25 = float(pd.Series(vals).quantile(0.25))
            low_traffic_langs = sorted(
                lang for lang, tot in asmr_totals.items()
                if tot is not None and float(tot) < p25
            )

    return {
        "meta": {
            "source_files": ["wiki_pageviews_monthly.csv"],
            "generated_at": now_iso(),
            "n": int(len(agg)),
            "n_concepts": len(concepts),
            "n_languages": len(langs),
            "access_used": "all",
            "agent_filter": "user",
            "low_traffic_percentile": 25,
            "low_traffic_total_views_p25": clean_num(p25) if p25 is not None else None,
            "low_traffic_languages_asmr": low_traffic_langs,
            "caveats": [
                "Views use access=all (Pageviews API agent=user rollup); desktop/mobile-web/mobile-app are not re-summed.",
                "Each language series is indexed to that language's own max = 100 for the concept — not comparable across languages as absolute traffic.",
                "Wikipedia language ≠ country; do not map these directly onto choropleths.",
                "Language edition is not country. The Chinese edition is not accessible from mainland China, so its counts do not measure Chinese-language interest. Each series is indexed to its own maximum, so small editions and single-month spikes can distort the shape. Article pageviews also depend on search-engine features.",
                "low_traffic: language editions below the 25th percentile of total ASMR views; index may exaggerate small changes.",
            ],
        },
        "months": months,
        "concepts": concepts,
        "languages": langs,
        "series": series,
        "total_views": totals,
        "low_traffic": {"ASMR": low_traffic_langs},
        "indexed_takeoff": takeoff,
    }


def build_douyin_keywords() -> dict:
    df = pd.read_csv(DATA / "douyin_trial" / "douyin_asmr_master.csv", encoding="utf-8-sig")
    for col in ("liked_count", "collected_count", "comment_count", "share_count"):
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df["source_keyword"] = df["source_keyword"].fillna("UNKNOWN").astype(str)
    rows = []
    for kw, g in df.groupby("source_keyword", sort=True):
        likes = g["liked_count"]
        collects = g["collected_count"]
        ratio = (collects / likes).replace([np.inf, -np.inf], np.nan)
        rows.append({
            "keyword": kw,
            "count": int(len(g)),
            "mean_likes": clean_num(float(likes.mean())),
            "median_likes": clean_num(float(likes.median())),
            "mean_collects": clean_num(float(collects.mean())),
            "median_collects": clean_num(float(collects.median())),
            "mean_comments": clean_num(float(g["comment_count"].mean())),
            "median_comments": clean_num(float(g["comment_count"].median())),
            "mean_shares": clean_num(float(g["share_count"].mean())),
            "median_shares": clean_num(float(g["share_count"].median())),
            "mean_collect_to_like": clean_num(float(ratio.mean())),
            "median_collect_to_like": clean_num(float(ratio.median())),
        })
    return {
        "meta": {
            "source_files": ["douyin_trial/douyin_asmr_master.csv"],
            "generated_at": now_iso(),
            "n": int(len(df)),
            "caveats": [
                "No play counts or region fields are available in this Douyin harvest.",
                "Engagement metrics are from a search-keyword crawl (n=528); not a platform-wide sample.",
            ],
        },
        "keywords": rows,
    }


WEB_EXCLUDE_THEMES = frozenset({"loneliness", "companionship_care"})


def load_verified_themes() -> dict:
    """Map theme → {verified_langs, check, caveat}. Keys are the only themes shown in the UI."""
    path = ROOT / "config" / "verified_themes.json"
    if not path.exists():
        return {
            "insomnia": {
                "verified_langs": ["zh", "ko", "en", "ja", "fr", "es"],
                "check": {
                    "zh": "n=20, 19 judged relevant",
                    "ko": "n=20, 19",
                    "en": "n=10, 9",
                    "ja": "n=10, 10",
                    "fr": "n=10, 8",
                    "es": "n=10, 10",
                },
                "caveat": "keyword hits; includes a few sarcastic or joking uses (e.g. 'so good I can't sleep')",
            }
        }
    raw = json.loads(path.read_text(encoding="utf-8"))
    # Legacy: {"verified": ["insomnia"], ...}
    if isinstance(raw, dict) and "verified" in raw and all(
        not isinstance(v, dict) for k, v in raw.items() if k != "notes"
    ):
        return {str(t): {"verified_langs": [], "check": "", "caveat": ""} for t in (raw.get("verified") or [])}
    out: dict = {}
    for theme, meta in raw.items():
        if not isinstance(meta, dict):
            continue
        check = meta.get("check")
        # check may be a string or per-language object
        if isinstance(check, dict):
            check_out = {str(k): str(v) for k, v in check.items()}
        else:
            check_out = str(check or "")
        out[str(theme)] = {
            "verified_langs": [str(x) for x in (meta.get("verified_langs") or [])],
            "check": check_out,
            "caveat": str(meta.get("caveat") or ""),
        }
    return out


def build_comment_themes() -> dict:
    ct = pd.read_csv(DATA / "comment_theme_counts.csv", encoding="utf-8-sig")
    # Keep loneliness / companionship_care in the CSV for notes; drop from web payload.
    ct = ct[~ct["theme"].astype(str).isin(WEB_EXCLUDE_THEMES)].copy()
    by_lang = ct[ct["language_group"].astype(str) != "ALL"].copy()
    pooled = ct[ct["language_group"].astype(str) == "ALL"].copy()
    verified = load_verified_themes()
    # Web payload only includes verified themes (plus still excludes loneliness/companionship).
    verified_ids = set(verified.keys())
    by_lang = by_lang[by_lang["theme"].astype(str).isin(verified_ids)].copy()
    pooled = pooled[pooled["theme"].astype(str).isin(verified_ids)].copy()

    def pack(frame: pd.DataFrame) -> list[dict]:
        out = []
        for _, r in frame.iterrows():
            out.append({
                "language_group": str(r["language_group"]),
                "theme": str(r["theme"]),
                "matching_comments": int(r["matching_comments"]),
                "total_comments": int(r["total_comments"]),
                "share": clean_num(float(r["share"])),
            })
        return out

    return {
        "meta": {
            "source_files": [
                "comment_theme_counts.csv",
                "yt_comments_sample.csv",
                "config/verified_themes.json",
            ],
            "generated_at": now_iso(),
            "n_comments": int(
                pd.read_csv(
                    DATA / "yt_comments_sample.csv",
                    usecols=["commentId"],
                    encoding="utf-8-sig",
                )["commentId"]
                .nunique()
            ),
            "precision_note": "keyword matching; see verified_themes check/caveat per theme",
            "verified_themes": verified,
            "excluded_themes": sorted(WEB_EXCLUDE_THEMES),
            "caveats": [
                "Theme hits are keyword matches; precision notes live under each verified theme (check / caveat).",
                "Sample: highest-viewed sleep-related ASMR videos per language, first 100 comments per video in YouTube's relevance ranking (not a random sample of comments). Shares are keyword hits among those comments and cannot be read as how many viewers feel this way.",
                "Language groups were sampled equally by design (~150 videos per language); do not treat pooled rates as organic language mix.",
                "The pooled (ALL) block is for reference only — do not use it as a headline statistic.",
                "loneliness and companionship_care are omitted from this web payload (precision not publishable); they remain in comment_theme_counts.csv.",
                "Front end shows only themes present in config/verified_themes.json; languages not in verified_langs (including all langs when verified_langs is pooled) are marked not individually checked.",
            ],
        },
        "by_language": pack(by_lang),
        "pooled": {
            "caveat": "Groups were sampled equally by design (150 videos per language); pooled share is not a natural language-weighted average.",
            "rows": pack(pooled),
        },
    }


def main() -> None:
    print("Building web/data …")
    OUT.mkdir(parents=True, exist_ok=True)
    archive = DATA / "archive_not_published"
    archive.mkdir(parents=True, exist_ok=True)
    raw = load_trends_raw()
    trends = load_trends()

    write_trends_batches_csv(raw)
    country_v2, monthly_v2 = build_trends_v2(raw)
    dump_json(OUT / "trends_country_v2.json", country_v2)
    dump_json(OUT / "trends_monthly_v2.json", monthly_v2)

    # Legacy mixed-batch payloads → archive only (not served from web/data)
    dump_json(archive / "trends_country.json", build_trends_country(trends))
    dump_json(archive / "trends_monthly.json", build_trends_monthly(trends))
    dump_json(
        archive / "insomnia_vs_asmr_raw_mean.json",
        build_insomnia_vs_asmr_raw_mean(trends),
    )
    for legacy in (
        "trends_country.json",
        "trends_monthly.json",
        "insomnia_vs_asmr_raw_mean.json",
    ):
        stale = OUT / legacy
        if stale.exists():
            stale.unlink()
            print(f"  removed stale web/data/{legacy}")

    dump_json(OUT / "insomnia_vs_asmr.json", build_insomnia_vs_asmr(country_v2))
    dump_json(OUT / "creator_country.json", build_creator_country())
    dump_json(OUT / "tiktok_origin.json", build_tiktok_origin())
    dump_json(OUT / "youtube_yearly.json", build_youtube_yearly())
    dump_json(OUT / "wiki_lang.json", build_wiki_lang())
    dump_json(OUT / "douyin_keywords.json", build_douyin_keywords())
    dump_json(OUT / "comment_themes.json", build_comment_themes())
    print("Done.")


if __name__ == "__main__":
    main()
