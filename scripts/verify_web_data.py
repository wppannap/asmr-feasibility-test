#!/usr/bin/env python3
"""Verify web/data/*.json against raw sources and privacy / topology rules."""
from __future__ import annotations

import json
import math
import random
import re
import sys
import urllib.request
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
WEB = ROOT / "web" / "data"
MAX_BYTES = 2 * 1024 * 1024

EXPECTED_FILES = [
    "trends_country_v2.json",
    "trends_monthly_v2.json",
    "insomnia_vs_asmr.json",
    "creator_country.json",
    "tiktok_origin.json",
    "youtube_yearly.json",
    "wiki_lang.json",
    "douyin_keywords.json",
    "comment_themes.json",
]

# Forbidden content patterns (authors / ids / urls / free text fields)
FORBIDDEN_KEY_RE = re.compile(
    r"(author|caption|title|text|nickname|channelid|channel_id|url|aweme_id|"
    r"videoid|commentid|creator_hash|description|cover_url|download_url)",
    re.I,
)
URL_RE = re.compile(r"https?://", re.I)
# channel-like / long hex hashes that look like ids accidentally left in
CHANNEL_ID_RE = re.compile(r"\bUC[\w-]{20,}\b")

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
ISO3_TO_ISO2 = {v: k for k, v in ISO2_TO_ISO3.items()}


def load_json(name: str):
    path = WEB / name
    with path.open(encoding="utf-8") as f:
        return json.load(f), path


def walk_numbers(obj, path="$"):
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield from walk_numbers(v, f"{path}.{k}")
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from walk_numbers(v, f"{path}[{i}]")
    elif isinstance(obj, float):
        yield path, obj


def walk_strings(obj, path="$"):
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield path, "key", k
            yield from walk_strings(v, f"{path}.{k}")
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from walk_strings(v, f"{path}[{i}]")
    elif isinstance(obj, str):
        yield path, "value", obj


def fetch_topo_iso3() -> set[str]:
    """world-atlas countries-50m uses numeric ISO ids; map via a static ISO3 set check.

    We also try to load properties if present. Fallback: download and collect ids,
    then map numeric→alpha3 via a bundled table derived from the same atlas.
    """
    url = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json"
    topo = None
    try:
        with urllib.request.urlopen(url, timeout=30) as resp:
            topo = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        # macOS Python often lacks certs; fall back to curl
        try:
            import subprocess
            raw = subprocess.check_output(["curl", "-fsSL", url], timeout=60)
            topo = json.loads(raw.decode("utf-8"))
        except Exception as e2:
            print(f"WARNING: could not fetch TopoJSON ({e} / {e2}); using offline ISO numeric map only")
            topo = None

    # ISO 3166-1 numeric → alpha-3 (subset covering our data + common extras)
    NUM_TO_ISO3 = {
        "032": "ARG", "36": "AUS", "56": "BEL", "76": "BRA", "124": "CAN",
        "152": "CHL", "156": "CHN", "170": "COL", "203": "CZE", "208": "DNK",
        "818": "EGY", "246": "FIN", "250": "FRA", "276": "DEU", "300": "GRC",
        "344": "HKG", "348": "HUN", "356": "IND", "360": "IDN", "372": "IRL",
        "376": "ISR", "380": "ITA", "392": "JPN", "410": "KOR", "458": "MYS",
        "484": "MEX", "528": "NLD", "554": "NZL", "566": "NGA", "578": "NOR",
        "586": "PAK", "604": "PER", "608": "PHL", "616": "POL", "620": "PRT",
        "642": "ROU", "643": "RUS", "682": "SAU", "702": "SGP", "710": "ZAF",
        "724": "ESP", "752": "SWE", "756": "CHE", "158": "TWN", "764": "THA",
        "792": "TUR", "804": "UKR", "784": "ARE", "826": "GBR", "840": "USA",
        "862": "VEN", "704": "VNM", "40": "AUT", "4": "AFG", "51": "ARM",
        "31": "AZE", "50": "BGD", "112": "BLR", "100": "BGR", "196": "CYP",
        "233": "EST", "288": "GHA", "320": "GTM", "352": "ISL", "404": "KEN",
        "116": "KHM", "428": "LVA", "504": "MAR", "104": "MMR", "446": "MAC",
        "470": "MLT", "524": "NPL", "688": "SRB", "703": "SVK", "788": "TUN",
        "660": "AIA", "32": "ARG",
    }
    present = set()
    if topo:
        geoms = topo.get("objects", {}).get("countries", {}).get("geometries", [])
        for g in geoms:
            gid = str(g.get("id", ""))
            candidates = {gid, gid.lstrip("0") or "0", gid.zfill(3)}
            for c in candidates:
                if c in NUM_TO_ISO3:
                    present.add(NUM_TO_ISO3[c])
                    break
            props = g.get("properties") or {}
            for key in ("iso_a3", "ISO_A3", "iso3", "adm0_a3"):
                if props.get(key):
                    present.add(str(props[key]).upper())
    else:
        present = set(NUM_TO_ISO3.values())
    return present


def collect_iso3(obj) -> set[str]:
    found = set()
    if isinstance(obj, dict):
        if "iso3" in obj and isinstance(obj["iso3"], str):
            found.add(obj["iso3"])
        if "countries" in obj and isinstance(obj["countries"], list):
            if obj["countries"] and isinstance(obj["countries"][0], str):
                found.update(obj["countries"])
        for v in obj.values():
            found |= collect_iso3(v)
    elif isinstance(obj, list):
        for v in obj:
            found |= collect_iso3(v)
    return found


def check_meta(obj, name: str) -> list[str]:
    errs = []
    meta = obj.get("meta")
    if not isinstance(meta, dict):
        return ["missing meta object"]
    for key in ("source_files", "generated_at", "caveats"):
        if key not in meta:
            errs.append(f"meta missing {key}")
    if "caveats" in meta and not isinstance(meta["caveats"], list):
        errs.append("meta.caveats must be a list")
    return errs


def check_finite(obj, name: str) -> list[str]:
    bad = []
    for path, val in walk_numbers(obj):
        if math.isnan(val) or math.isinf(val):
            bad.append(path)
            if len(bad) >= 5:
                break
    return [f"NaN/Inf at {p}" for p in bad]


def check_privacy(obj, name: str) -> list[str]:
    errs = []
    for path, kind, s in walk_strings(obj):
        if kind == "key" and FORBIDDEN_KEY_RE.search(s):
            # allow harmless keys like 'title_type' equivalents — block strong ones
            if s.lower() in {
                "author", "caption", "title", "text", "nickname", "channelid",
                "channel_id", "url", "aweme_id", "videoid", "commentid",
                "creator_hash", "description", "cover_url",
            }:
                errs.append(f"forbidden key {s!r} at {path}")
        if kind == "value":
            if URL_RE.search(s):
                errs.append(f"URL-like string at {path}")
            if CHANNEL_ID_RE.search(s):
                errs.append(f"channel-id-like string at {path}")
        if len(errs) >= 8:
            break
    return errs


def totals_checks(loaded: dict[str, dict]) -> list[tuple[str, bool, str]]:
    rows = []
    yt = loaded["youtube_yearly.json"]
    ok = yt["meta"].get("n") == 342423
    rows.append(("YouTube n=342423", ok, f"meta.n={yt['meta'].get('n')}"))
    year_sum = sum(r["count"] for r in yt["years"])
    rows.append(("YouTube year counts sum", year_sum == 342423, f"sum={year_sum}"))
    null_year = next((r for r in yt["years"] if r.get("year") is None), None)
    rows.append((
        "YouTube unknown-year bucket if needed",
        year_sum == 342423,
        f"unknown_year_count={null_year['count'] if null_year else 0}",
    ))

    tt = loaded["tiktok_origin.json"]
    ok = tt["meta"].get("n") == 168
    rows.append(("TikTok n=168", ok, f"meta.n={tt['meta'].get('n')}"))
    csum = sum(r["count"] for r in tt["countries"])
    rows.append(("TikTok country counts sum", csum == 168, f"sum={csum}"))

    dy = loaded["douyin_keywords.json"]
    ok = dy["meta"].get("n") == 528
    rows.append(("Douyin n=528", ok, f"meta.n={dy['meta'].get('n')}"))
    ksum = sum(r["count"] for r in dy["keywords"])
    rows.append(("Douyin keyword counts sum", ksum == 528, f"sum={ksum}"))

    cm = loaded["comment_themes.json"]
    n_comments_csv = int(
        pd.read_csv(DATA / "yt_comments_sample.csv", usecols=["commentId"], encoding="utf-8-sig")[
            "commentId"
        ].nunique()
    )
    ok = cm["meta"].get("n_comments") == n_comments_csv
    rows.append((
        f"Comments n={n_comments_csv}",
        ok,
        f"meta.n_comments={cm['meta'].get('n_comments')}",
    ))
    # totals per language should match theme totals (same total_comments per lang)
    by = cm["by_language"]
    # pick one theme per lang and sum unique language totals
    seen = {}
    for r in by:
        seen[r["language_group"]] = r["total_comments"]
    lang_sum = sum(seen.values())
    rows.append((
        "Comment language totals sum",
        lang_sum == n_comments_csv,
        f"sum={lang_sum}",
    ))
    # ALL must not appear in by_language
    has_all = any(r["language_group"] == "ALL" for r in by)
    rows.append(("No ALL in by_language", not has_all, f"has_ALL={has_all}"))
    rows.append(("pooled present", bool(cm.get("pooled", {}).get("rows")), "pooled.rows"))

    cr = loaded["creator_country.json"]
    ok = cr["meta"].get("n_channels") == 5205
    rows.append(("Channels n=5205", ok, f"n_channels={cr['meta'].get('n_channels')}"))
    ok = cr["meta"].get("n_videos") == 342423
    rows.append(("Creator-country videos n=342423", ok, f"n_videos={cr['meta'].get('n_videos')}"))
    vsum = sum(r["video_count"] for r in cr["countries"])
    rows.append(("Creator-country video sum", vsum == 342423, f"sum={vsum}"))

    # Taiwan filled from official Taiwan stats (not World Bank)
    inv = loaded["insomnia_vs_asmr.json"]
    tw = [c for c in inv["countries"] if c["iso3"] == "TWN"]
    tw_ok = (
        bool(tw)
        and tw[0].get("indicators_status") == "ok_tw_official"
        and tw[0].get("internet_users_pct") == 87.6
        and tw[0].get("youth_share_pct") == 11.796
    )
    rows.append(("Taiwan indicators from official TW stats", tw_ok, tw[0] if tw else "TWN absent"))
    # no silent drop: TWN present
    rows.append(("Taiwan kept in insomnia_vs_asmr", bool(tw), f"n_TWN={len(tw)}"))

    # precision_note
    prec = cm["meta"].get("precision_note") or ""
    rows.append((
        "comment precision_note set",
        "keyword matching" in prec,
        repr(prec),
    ))
    themes_web = {r["theme"] for r in cm.get("by_language") or []}
    rows.append((
        "loneliness/companionship excluded from web comment_themes",
        "loneliness" not in themes_web and "companionship_care" not in themes_web,
        f"themes={sorted(themes_web)}",
    ))
    vt = (cm.get("meta") or {}).get("verified_themes")
    need = {"insomnia", "gratitude", "anxiety_stress", "sleep_aid_effectiveness"}
    vt_ok = isinstance(vt, dict) and need <= set(vt.keys())
    rows.append((
        "verified_themes object includes insomnia+gratitude+anxiety+sleep_aid",
        vt_ok,
        repr(sorted(vt.keys()) if isinstance(vt, dict) else vt),
    ))
    rows.append((
        "web comment_themes only verified themes",
        themes_web <= set(vt.keys()) if isinstance(vt, dict) else False,
        f"themes={sorted(themes_web)}",
    ))
    sample_caveat = any(
        "highest-viewed sleep-related ASMR" in str(c)
        for c in ((cm.get("meta") or {}).get("caveats") or [])
    )
    rows.append((
        "comment sample caveat present",
        sample_caveat,
        "ok" if sample_caveat else "missing sample caveat",
    ))
    inv = loaded["insomnia_vs_asmr.json"]
    excl = inv.get("correlations_excluding_twn") or {}
    corr = inv.get("correlations") or {}
    rows.append((
        "correlations_excluding_twn present",
        isinstance(excl, dict) and "change_vs_internet" in excl,
        list(excl.keys())[:3],
    ))
    sample_pair = corr.get("change_vs_internet") or {}
    spearman_fields = {"rho", "n", "p", "ci95_low", "ci95_high", "p_holm"}
    rows.append((
        "spearman pair has rho/n/p/ci95/p_holm",
        spearman_fields <= set(sample_pair.keys()),
        sorted(sample_pair.keys()),
    ))
    rows.append((
        "insomnia_vs_asmr uses own-peak change metrics",
        (inv.get("meta") or {}).get("metric") == "change_in_window_and_recent_vs_peak",
        (inv.get("meta") or {}).get("metric"),
    ))
    v2 = loaded.get("trends_country_v2.json") or {}
    v2_rows = v2.get("rows") or []
    rows.append((
        "trends_country_v2 has change_in_window",
        len(v2_rows) >= 30 and "change_in_window" in (v2_rows[0] or {}),
        f"keys={sorted((v2_rows[0] or {}).keys())[:8]}",
    ))
    rows.append((
        "asmr_share_of_batch not in trends_country_v2 rows",
        all("asmr_share_of_batch" not in (r or {}) for r in v2_rows),
        "ok" if v2_rows else "no rows",
    ))
    rows.append((
        "take_off / threshold_disagree not in published rows",
        all(
            "take_off_year" not in (r or {})
            and "flag_threshold_disagree" not in (r or {})
            and "flag_peak_before_2010" not in (r or {})
            for r in v2_rows
        ),
        "ok" if v2_rows else "no rows",
    ))
    corr = (loaded.get("insomnia_vs_asmr.json") or {}).get("correlations") or {}
    need = {
        "change_vs_internet",
        "change_vs_youth",
        "recent_vs_internet",
        "recent_vs_youth",
    }
    rows.append((
        "Holm family has exactly 4 ASMR pairs",
        set(corr.keys()) == need,
        f"keys={sorted(corr.keys())}",
    ))
    desc = (loaded.get("insomnia_vs_asmr.json") or {}).get("correlations_descriptive") or {}
    rows.append((
        "descriptive internet_vs_youth outside Holm",
        "internet_vs_youth" in desc
        and (desc.get("internet_vs_youth") or {}).get("holm_family") is False
        and (desc.get("internet_vs_youth") or {}).get("label") == "not about ASMR",
        list(desc.keys()),
    ))
    inv_row0 = ((loaded.get("insomnia_vs_asmr.json") or {}).get("countries") or [{}])[0]
    rows.append((
        "published countries lack share/insomnia fields",
        "asmr_share_of_batch" not in inv_row0 and "insomnia_index" not in inv_row0,
        sorted(inv_row0.keys())[:10],
    ))
    wiki = loaded.get("wiki_lang.json") or {}
    rows.append((
        "wiki_lang has low_traffic",
        isinstance((wiki.get("low_traffic") or {}).get("ASMR"), list),
        (wiki.get("meta") or {}).get("low_traffic_languages_asmr"),
    ))
    return rows


def spot_checks(rng: random.Random) -> None:
    print("\n=== Spot checks (3 random web rows ↔ source) ===\n")

    # 1) trends_country_v2
    web, _ = load_json("trends_country_v2.json")
    ts = pd.read_csv(DATA / "trends_timeseries.csv", encoding="utf-8-sig")
    ts = ts[ts["geo"].fillna("").astype(str).str.strip() != ""]
    samples = rng.sample(web["rows"], min(3, len(web["rows"])))
    print("— trends_country_v2.json —")
    for row in samples:
        iso3 = row["iso3"]
        iso2 = ISO3_TO_ISO2.get(iso3)
        print(f"  WEB: { {k: row.get(k) for k in ('iso3','change_in_window','recent_vs_peak','flag_low_volume')} }")
        if iso2:
            src = ts[ts["geo"] == iso2].head(2)
            print(f"  SRC sample geo={iso2}:\n{src[['keyword','geo','date','interest']].to_string(index=False)}")
        print()

    # 2) tiktok
    web, _ = load_json("tiktok_origin.json")
    tk = pd.read_csv(DATA / "tiktok_trial/tiktok_asmr_master.csv", encoding="utf-8-sig")
    samples = rng.sample(web["countries"], min(3, len(web["countries"])))
    print("— tiktok_origin.json —")
    for row in samples:
        print(f"  WEB: {row}")
        iso2 = ISO3_TO_ISO2.get(row["iso3"])
        loc = tk["location_created"].fillna("").astype(str).str.strip().str.upper()
        if row["iso3"] == "UNKNOWN":
            src = tk[loc.isin(["", "UNKNOWN", "NAN"])].head(2)
        else:
            src = tk[loc == (iso2 or "")].head(2)
        cols = [c for c in ("location_created", "plays", "saves") if c in src.columns]
        print(f"  SRC (no authors/urls):\n{src[cols].to_string(index=False)}")
        print()

    # 3) douyin
    web, _ = load_json("douyin_keywords.json")
    dy = pd.read_csv(DATA / "douyin_trial/douyin_asmr_master.csv", encoding="utf-8-sig")
    samples = rng.sample(web["keywords"], min(3, len(web["keywords"])))
    print("— douyin_keywords.json —")
    for row in samples:
        print(f"  WEB: {row}")
        src = dy[dy["source_keyword"].astype(str) == row["keyword"]]
        print(
            f"  SRC n={len(src)} median liked={src['liked_count'].median()} "
            f"median collected={src['collected_count'].median()}"
        )
        print()

    # 4) youtube yearly
    web, _ = load_json("youtube_yearly.json")
    samples = rng.sample(web["years"], min(3, len(web["years"])))
    print("— youtube_yearly.json —")
    yt = pd.read_csv(
        DATA / "yt_master.csv",
        encoding="utf-8-sig",
        usecols=["publishedAt", "is_asmr_related", "viewCount"],
    )
    yt["year"] = pd.to_datetime(yt["publishedAt"], errors="coerce", utc=True).dt.year
    for row in samples:
        src = yt[yt["year"] == row["year"]]
        print(f"  WEB: {row}")
        print(f"  SRC count={len(src)} median views={src['viewCount'].median()}")
        print()

    # 5) comment themes
    web, _ = load_json("comment_themes.json")
    ct = pd.read_csv(DATA / "comment_theme_counts.csv", encoding="utf-8-sig")
    samples = rng.sample(web["by_language"], min(3, len(web["by_language"])))
    print("— comment_themes.json —")
    for row in samples:
        print(f"  WEB: {row}")
        src = ct[(ct.language_group == row["language_group"]) & (ct.theme == row["theme"])]
        print(f"  SRC:\n{src.to_string(index=False)}")
        print()

    # 6) insomnia_vs_asmr
    web, _ = load_json("insomnia_vs_asmr.json")
    samples = rng.sample(web["countries"], min(3, len(web["countries"])))
    ind = pd.read_csv(DATA / "indicators_country.csv", encoding="utf-8-sig")
    print("— insomnia_vs_asmr.json —")
    for row in samples:
        print(f"  WEB: {row}")
        iso2 = ISO3_TO_ISO2.get(row["iso3"])
        src = ind[ind["iso2"].astype(str).str.upper() == (iso2 or "")]
        print(f"  SRC indicators:\n{src[['iso2','iso3','indicator_code','value','year']].to_string(index=False)}")
        print()

    # 7) creator_country
    web, _ = load_json("creator_country.json")
    samples = rng.sample(web["countries"], min(3, len(web["countries"])))
    print("— creator_country.json —")
    for row in samples:
        print(f"  WEB: {row}")
    print(f"  META coverage channels%={web['meta'].get('coverage_channels_pct')} "
          f"videos%={web['meta'].get('coverage_videos_pct')} "
          f"chinese_query_share={web['meta'].get('chinese_query_share')}")
    print()

    # 8) wiki + trends_monthly (structure only + 1 cell)
    web, _ = load_json("wiki_lang.json")
    concept = rng.choice(web["concepts"])
    lang = rng.choice(list(web["series"][concept].keys()))
    series = web["series"][concept][lang]
    nonempty = [(i, v) for i, v in enumerate(series) if v is not None]
    pick = rng.choice(nonempty) if nonempty else (0, None)
    print("— wiki_lang.json —")
    print(f"  WEB sample: concept={concept} lang={lang} month={web['months'][pick[0]]} index={pick[1]}")
    print()

    web, _ = load_json("trends_monthly_v2.json")
    country = rng.choice(web["countries"])
    series = web["series"]["own_peak_asmr"][country]
    nonempty = [(i, v) for i, v in enumerate(series) if v is not None]
    pick = rng.choice(nonempty) if nonempty else (0, None)
    print("— trends_monthly_v2.json —")
    print(f"  WEB sample: iso3={country} month={web['months'][pick[0]]} own_peak={pick[1]}")
    print()


def main() -> int:
    if not WEB.exists():
        print("FAIL: web/data missing — run build_web_data.py first")
        return 1

    loaded = {}
    results: list[tuple[str, bool, str]] = []

    # file presence + size
    for name in EXPECTED_FILES:
        path = WEB / name
        if not path.exists():
            results.append((f"exists {name}", False, "missing"))
            continue
        size = path.stat().st_size
        results.append((f"size<2MB {name}", size < MAX_BYTES, f"{size:,} bytes"))
        obj, _ = load_json(name)
        loaded[name] = obj
        for err in check_meta(obj, name):
            results.append((f"meta {name}", False, err))
        fin = check_finite(obj, name)
        results.append((f"finite {name}", len(fin) == 0, "; ".join(fin) or "ok"))
        priv = check_privacy(obj, name)
        results.append((f"privacy {name}", len(priv) == 0, "; ".join(priv) or "ok"))

    if len(loaded) == len(EXPECTED_FILES):
        results.extend(totals_checks(loaded))

    # TopoJSON country codes
    topo = fetch_topo_iso3()
    all_codes: set[str] = set()
    for obj in loaded.values():
        all_codes |= collect_iso3(obj)
    skip = {"UNKNOWN", "unknown"}
    geo_codes = {c for c in all_codes if c not in skip}
    missing = sorted(c for c in geo_codes if c not in topo)
    # Informational: front-end maps may lack small territories; always surface the list.
    results.append((
        "TopoJSON ISO3 report (info)",
        True,
        f"missing_from_topo={missing or 'none'}; checked={len(geo_codes)}; "
        f"TWN_in_topo={('TWN' in topo)}; HKG_in_topo={('HKG' in topo)}",
    ))
    print(
        "TopoJSON check (world-atlas countries-50m): "
        f"TWN={'yes' if 'TWN' in topo else 'NO'}, HKG={'yes' if 'HKG' in topo else 'NO'}."
    )
    if missing:
        print("ISO3 present in web/data but NOT in that TopoJSON:", ", ".join(missing))
    else:
        print("All output ISO3 codes found in that TopoJSON.")

    # Pass/fail table
    print("\n=== Pass/fail ===\n")
    width = max(len(n) for n, _, _ in results)
    fails = 0
    for name, ok, detail in results:
        status = "PASS" if ok else "FAIL"
        if not ok:
            fails += 1
        print(f"{status:4}  {name:<{width}}  {detail}")

    rng = random.Random(42)
    spot_checks(rng)

    print(f"\nSummary: {len(results) - fails} passed, {fails} failed")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
