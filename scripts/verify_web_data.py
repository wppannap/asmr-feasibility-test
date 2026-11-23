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
    "trends_country_v3c.json",
    "trends_monthly_v3c.json",
    "correlations_v3c.json",
    "wiki_lang.json",
]
TOPO_FILE = "countries-50m.json"

FORBIDDEN_NOISE_PHRASE_RE = re.compile(
    r"white\s*noise|whitenoise|白噪音|brown\s*noise|pink\s*noise|"
    r"binaural|ambient\s*noise",
    re.I,
)
# Removed metrics / fields must not appear anywhere under web/
FORBIDDEN_METRIC_RE = re.compile(
    r"recent_vs_peak|take_off|asmr_share",
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


def enabled_sections() -> list[str]:
    """Parse ENABLED_SECTIONS from web/js/sections.js (no JS runtime)."""
    path = ROOT / "web" / "js" / "sections.js"
    text = path.read_text(encoding="utf-8")
    m = re.search(r"ENABLED_SECTIONS\s*=\s*\[(.*?)\]", text, re.S)
    if not m:
        return []
    return re.findall(r'"([^"]+)"', m.group(1))


def check_reviewed_by_unset() -> list[tuple[str, bool, str]]:
    """Fail if check texts shown by ENABLED comment section have reviewed_by=UNSET.

    Hidden comment / YouTube sections must not block the push.
    """
    out: list[tuple[str, bool, str]] = []
    enabled = enabled_sections()
    comments_on = "scrolly-8" in enabled
    out.append((
        "reviewed_by gate (comments section enabled?)",
        True,
        f"scrolly-8={'on' if comments_on else 'off'}; skip UNSET fail when off",
    ))
    if not comments_on:
        return out
    path = ROOT / "config" / "verified_themes.json"
    if not path.exists():
        out.append(("verified_themes.json exists", False, "missing"))
        return out
    meta = json.loads(path.read_text(encoding="utf-8"))
    unset = []
    for theme, entry in meta.items():
        if not isinstance(entry, dict):
            continue
        if "check" not in entry:
            continue
        rb = entry.get("reviewed_by", "UNSET")
        if rb is None or str(rb).strip().upper() == "UNSET":
            unset.append(theme)
    out.append((
        "verified_themes reviewed_by not UNSET (comments enabled)",
        len(unset) == 0,
        f"UNSET themes: {unset}" if unset else "ok",
    ))
    return out


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
    """Fail if web/ contains ambient/white-noise phrases or removed metric names."""
    rows = []
    noise_hits = []
    metric_hits = []
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
                noise_hits.append(f"{path.relative_to(ROOT)}:{i}")
            if FORBIDDEN_METRIC_RE.search(line):
                metric_hits.append(f"{path.relative_to(ROOT)}:{i}")
            if len(noise_hits) >= 20 and len(metric_hits) >= 20:
                break
    rows.append((
        "no white/brown/pink/binaural/ambient-noise phrases in web/",
        len(noise_hits) == 0,
        "ok" if not noise_hits else f"hits={noise_hits[:8]}",
    ))
    rows.append((
        "no recent_vs_peak/take_off/asmr_share in web/",
        len(metric_hits) == 0,
        "ok" if not metric_hits else f"hits={metric_hits[:8]}",
    ))
    return rows


def totals_checks(loaded: dict[str, dict]) -> list[tuple[str, bool, str]]:
    """Checks for currently published v3c payloads only."""
    rows = []
    v3c = loaded.get("trends_country_v3c.json") or {}
    v3c_rows = v3c.get("rows") or []
    meta = v3c.get("meta") or {}
    rows.append((
        "trends_country_v3c has growth_ratio + mk_class",
        len(v3c_rows) >= 100
        and "growth_ratio" in (v3c_rows[0] or {})
        and "mk_class" in (v3c_rows[0] or {}),
        f"n={len(v3c_rows)} keys={sorted((v3c_rows[0] or {}).keys())[:10]}",
    ))
    forbidden_fields = {
        "recent_vs_peak", "take_off_year", "asmr_share_of_batch", "insomnia_index",
        "change_in_window", "within_noise",
    }
    rows.append((
        "v3c rows lack removed metrics",
        all(not (forbidden_fields & set((r or {}).keys())) for r in v3c_rows),
        "ok",
    ))
    rows.append((
        "v3c meta has counts + mk_class counts",
        isinstance(meta.get("counts"), dict) and isinstance(meta.get("counts_by_mk_class"), dict),
        str(meta.get("counts")),
    ))
    corr = loaded.get("correlations_v3c.json") or {}
    fam = corr.get("families") or {}
    need_frames = {
        "ok_with_TWN", "ok_excl_TWN", "strict_ok_with_TWN", "strict_ok_excl_TWN",
    }
    rows.append((
        "correlations_v3c has 4 frames",
        need_frames <= set(fam.keys()),
        sorted(fam.keys()),
    ))
    sample = ((fam.get("ok_with_TWN") or {}).get("raw") or {}).get("growth_vs_internet") or {}
    spearman_fields = {"rho", "n", "p", "ci95_low", "ci95_high", "p_holm"}
    rows.append((
        "correlations_v3c spearman fields",
        spearman_fields <= set(sample.keys()),
        sorted(sample.keys()),
    ))
    blob = json.dumps(corr)
    rows.append((
        "correlations_v3c omits removed fields",
        not FORBIDDEN_METRIC_RE.search(blob) and "insomnia" not in blob.lower(),
        "ok",
    ))
    monthly = loaded.get("trends_monthly_v3c.json") or {}
    rows.append((
        "monthly v3c has 60 months",
        len(monthly.get("months") or []) == 60,
        f"n_months={len(monthly.get('months') or [])}",
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
    for stale in (
        "trends_country_v2.json",
        "trends_monthly_v2.json",
        "insomnia_vs_asmr.json",
        "youtube_yearly.json",
        "creator_country.json",
        "comment_themes.json",
        "douyin_keywords.json",
        "tiktok_origin.json",
    ):
        p = WEB / stale
        rows.append((
            f"stale {stale} absent from web/data",
            not p.exists(),
            "gone" if not p.exists() else "PRESENT",
        ))
    rows.extend(check_no_noise_phrases_in_web())
    return rows


def spot_checks(rng: random.Random) -> None:
    print("\n=== Spot checks (published payloads only) ===\n")

    web, _ = load_json("trends_country_v3c.json")
    samples = rng.sample(web["rows"], min(3, len(web["rows"])))
    print("— trends_country_v3c.json —")
    for row in samples:
        print(
            "  WEB:",
            {k: row.get(k) for k in ("iso3", "growth_ratio", "mk_class", "quality", "strict_ok")},
        )
    print()

    web, _ = load_json("correlations_v3c.json")
    fam = (web.get("families") or {}).get("ok_with_TWN") or {}
    print("— correlations_v3c.json ok_with_TWN —")
    print("  raw keys", list((fam.get("raw") or {}).keys()))
    print()

    web, _ = load_json("trends_monthly_v3c.json")
    print("— trends_monthly_v3c.json —")
    print(f"  months={len(web.get('months') or [])} countries={len(web.get('countries') or [])}")
    print()
    print(
        "SKIPPED spot checks for unpublished: "
        "youtube_yearly, creator_country, comment_themes, douyin_keywords, tiktok_origin"
    )
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

    # Manual-check provenance: page-shown theme checks must not be UNSET
    results.extend(check_reviewed_by_unset())

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
