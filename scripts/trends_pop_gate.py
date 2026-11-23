#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Population gate for Trends ok quality: WB SP.POP.TOTL (or Taiwan official) >= 1e6."""
from __future__ import annotations

import json
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
POP_MIN = 1_000_000
REASON = "population < 1M or unknown"
# MOI RIS year-end 2024 total embedded in taiwan_indicators DERIVED.POP notes
TWN_OFFICIAL_POP = 23_400_220


def fetch_wb_pop_all() -> dict[str, float]:
    """iso3 → SP.POP.TOTL (latest non-null)."""
    url = (
        "https://api.worldbank.org/v2/country/all/indicator/SP.POP.TOTL"
        "?format=json&mrnev=1&per_page=400"
    )
    with urllib.request.urlopen(url, timeout=90) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    rows = payload[1] if isinstance(payload, list) and len(payload) > 1 else []
    out: dict[str, float] = {}
    for r in rows or []:
        iso3 = (r.get("countryiso3code") or "").upper()
        val = r.get("value")
        if iso3 and val is not None:
            out[iso3] = float(val)
    return out


def taiwan_official_pop() -> float:
    path = DATA / "taiwan_official" / "taiwan_indicators.csv"
    if path.exists():
        text = path.read_text(encoding="utf-8-sig")
        m = re.search(r"/(\d{7,9})\*100", text)
        if m:
            return float(m.group(1))
    return float(TWN_OFFICIAL_POP)


def load_populations(iso3_list: list[str]) -> dict[str, float | None]:
    wb = fetch_wb_pop_all()
    tw = taiwan_official_pop()
    out: dict[str, float | None] = {}
    for iso3 in iso3_list:
        iso3 = str(iso3).upper()
        if iso3 == "TWN":
            out[iso3] = tw
        else:
            out[iso3] = wb.get(iso3)
    return out


def passes_pop_gate(iso3: str, pops: dict[str, float | None]) -> bool:
    p = pops.get(str(iso3).upper())
    return p is not None and p >= POP_MIN


def downgrade_ok_for_population(
    rows: list[dict],
    *,
    iso3_key: str = "iso3",
    quality_key: str = "quality",
) -> tuple[list[dict], list[dict]]:
    """In-place: ok geos failing pop gate → low_volume + reason. Returns (rows, downgraded)."""
    ok_iso = [r[iso3_key] for r in rows if r.get(quality_key) == "ok"]
    pops = load_populations(ok_iso)
    downgraded = []
    for r in rows:
        if r.get(quality_key) != "ok":
            continue
        iso3 = r[iso3_key]
        pop = pops.get(str(iso3).upper())
        if pop is None or pop < POP_MIN:
            r[quality_key] = "low_volume"
            r["quality_reason"] = REASON
            r["population"] = pop
            r["strict_ok"] = False
            r["mk_class"] = None
            downgraded.append({
                "iso3": iso3,
                "geo": r.get("geo"),
                "name": r.get("name"),
                "population": pop,
                "reason": REASON,
            })
        else:
            r["population"] = pop
            r.pop("quality_reason", None)
    return rows, downgraded
