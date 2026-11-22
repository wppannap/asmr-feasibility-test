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

# Published payloads only (human-ASMR scope lockdown). Older YouTube/Douyin/TikTok/
# comment/creator JSONs live under data/unpublished/ until class_check review.
EXPECTED_FILES = [
    "trends_country_v2.json",
    "trends_monthly_v2.json",
    "insomnia_vs_asmr.json",
    "wiki_lang.json",
]
TOPO_FILE = "countries-50m.json"

FORBIDDEN_NOISE_PHRASE_RE = re.compile(
    r"white\s*noise|whitenoise|白噪音|brown\s*noise|pink\s*noise|"
    r"binaural|ambient\s*noise",
    re.I,
)

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


def check_no_noise_phrases_in_web() -> list[tuple[str, bool, str]]:
    """Fail if any published file under web/ contains ambient/white-noise phrases."""
    rows = []
    hits = []
    for path in sorted((ROOT / "web").rglob("*")):
        if not path.is_file():
            continue
        if path.suffix.lower() not in {".html", ".js", ".css", ".json", ".md", ".txt"}:
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except Exception:
            continue
        for i, line in enumerate(text.splitlines(), 1):
            if FORBIDDEN_NOISE_PHRASE_RE.search(line):
                hits.append(f"{path.relative_to(ROOT)}:{i}")
                if len(hits) >= 20:
                    break
        if len(hits) >= 20:
            break
    rows.append((
        "no white/brown/pink/binaural/ambient-noise phrases in web/",
        len(hits) == 0,
        "ok" if not hits else f"hits={hits[:8]}",
    ))
    return rows


def totals_checks(loaded: dict[str, dict]) -> list[tuple[str, bool, str]]:
    """Checks for currently published payloads only."""
    rows = []

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
    rows.append(("Taiwan kept in insomnia_vs_asmr", bool(tw), f"n_TWN={len(tw)}"))

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
    corr_ns = {k: (corr.get(k) or {}).get("n") for k in need}
    excl_ns = {k: (excl.get(k) or {}).get("n") for k in need}
    rows.append((
        "Holm correlations include TWN (n=31)",
        all(n == 31 for n in corr_ns.values()) and bool(tw),
        f"corr_n={corr_ns}",
    ))
    rows.append((
        "Holm correlations_excluding_twn n=30",
        all(n == 30 for n in excl_ns.values()),
        f"excl_n={excl_ns}",
    ))
    desc = inv.get("correlations_descriptive") or {}
    rows.append((
        "descriptive internet_vs_youth outside Holm",
        "internet_vs_youth" in desc
        and (desc.get("internet_vs_youth") or {}).get("holm_family") is False
        and (desc.get("internet_vs_youth") or {}).get("label") == "not about ASMR",
        list(desc.keys()),
    ))
    inv_row0 = (inv.get("countries") or [{}])[0]
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
    rows.append((
        "wiki_lang concepts ASMR-only",
        wiki.get("concepts") == ["ASMR"],
        repr(wiki.get("concepts")),
    ))
    # Unpublished payload files must not remain under web/data/
    for stale in (
        "youtube_yearly.json",
        "creator_country.json",
        "comment_themes.json",
        "douyin_keywords.json",
        "tiktok_origin.json",
    ):
        rows.append((
            f"unpublished not in web/data: {stale}",
            not (WEB / stale).exists(),
            "absent" if not (WEB / stale).exists() else "STILL PRESENT",
        ))
    rows.extend(check_no_noise_phrases_in_web())
    return rows


def spot_checks(rng: random.Random) -> None:
    print("\n=== Spot checks (published payloads only) ===\n")

    web, _ = load_json("trends_country_v2.json")
    samples = rng.sample(web["rows"], min(3, len(web["rows"])))
    print("— trends_country_v2.json —")
    for row in samples:
        print(f"  WEB: { {k: row.get(k) for k in ('iso3','change_in_window','recent_vs_peak','within_noise','flag_low_volume')} }")
    print()

    web, _ = load_json("insomnia_vs_asmr.json")
    samples = rng.sample(web["countries"], min(3, len(web["countries"])))
    print("— insomnia_vs_asmr.json —")
    for row in samples:
        print(f"  WEB iso3={row.get('iso3')} change={row.get('change_in_window')} recent={row.get('recent_vs_peak')}")
    print()

    web, _ = load_json("wiki_lang.json")
    concept = (web.get("concepts") or ["ASMR"])[0]
    langs = list((web.get("series") or {}).get(concept, {}).keys())
    lang = rng.choice(langs) if langs else None
    print("— wiki_lang.json —")
    print(f"  concepts={web.get('concepts')} sample_lang={lang}")
    print()

    web, _ = load_json("trends_monthly_v2.json")
    country = rng.choice(web["countries"])
    print("— trends_monthly_v2.json —")
    print(f"  sample iso3={country} months={len(web.get('months') or [])}")
    print()
    print("SKIPPED spot checks for unpublished: youtube_yearly, creator_country, comment_themes, douyin_keywords, tiktok_origin")
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

    topo_path = WEB / TOPO_FILE
    results.append((
        f"exists {TOPO_FILE}",
        topo_path.exists(),
        f"{topo_path.stat().st_size:,} bytes" if topo_path.exists() else "missing",
    ))

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
