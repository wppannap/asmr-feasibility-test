#!/usr/bin/env python3
"""One-off report for docs/WIKI_STEP_CHECK.md (does not write data/*.csv)."""
from __future__ import annotations

import json
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote, urlencode

import pandas as pd
import requests

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from fetch_wiki_pageviews import (  # noqa: E402
    ACCESS_TYPES,
    CONTACT_EMAIL,
    HEADERS,
    HISTORICAL_START,
    PAGEVIEWS_BASE,
    RateLimiter,
    current_end_window,
    fetch_all_access_views,
    mediawiki_host,
)

LANGS = ["en", "ja", "ko", "tr", "nl", "es", "fr"]
OUT_MD = ROOT / "docs" / "WIKI_STEP_CHECK.md"
TITLES_CSV = ROOT / "data" / "wiki_concept_titles.csv"
PV_CSV = ROOT / "data" / "wiki_pageviews_monthly.csv"
WIKI_JSON = ROOT / "web" / "data" / "wiki_lang.json"


def yyyymm_from_ts(ts: str) -> str:
    return f"{ts[:4]}-{ts[5:7]}"


def mw_get(session: requests.Session, project: str, params: dict) -> dict:
    base = mediawiki_host(project)
    params = {**params, "format": "json"}
    url = f"{base}/w/api.php?" + urlencode(params)
    for attempt in range(4):
        r = session.get(url, headers=HEADERS, timeout=45)
        if r.status_code == 429:
            time.sleep(2 ** attempt)
            continue
        r.raise_for_status()
        data = r.json()
        if "error" in data:
            raise RuntimeError(data["error"])
        return data
    raise RuntimeError(f"MW API failed after retries: {project}")


def page_title_info(session: requests.Session, project: str, title: str) -> dict:
    data = mw_get(
        session,
        project,
        {"action": "query", "titles": title, "prop": "info", "inprop": "url"},
    )
    pages = data.get("query", {}).get("pages", {})
    for pid, pinfo in pages.items():
        if int(pid) < 0:
            return {"missing": True, "pageid": None, "title": title}
        return {
            "missing": False,
            "pageid": int(pid),
            "title": pinfo.get("title", title),
        }
    return {"missing": True, "pageid": None, "title": title}


def fetch_redirects(session: requests.Session, project: str, title: str) -> list[str]:
    rd: list[str] = []
    cont: str | None = None
    while True:
        params: dict = {
            "action": "query",
            "titles": title,
            "prop": "redirects",
            "rdlimit": "max",
        }
        if cont:
            params["rdcontinue"] = cont
        data = mw_get(session, project, params)
        q = data.get("query", {}) or {}
        pages = q.get("pages", {})
        for pinfo in pages.values():
            for item in pinfo.get("redirects") or []:
                t = item.get("title")
                if t and t not in rd:
                    rd.append(t)
        cont = data.get("continue", {}).get("rdcontinue")
        if not cont:
            break
    return sorted(rd)


def fetch_move_log(session: requests.Session, project: str, pageid: int) -> list[dict]:
    moves: list[dict] = []
    lecontinue: str | None = None
    while True:
        params: dict = {
            "action": "query",
            "logevents": "",
            "letype": "move",
            "pageids": str(pageid),
            "lelimit": "max",
        }
        if lecontinue:
            params["lecontinue"] = lecontinue
        data = mw_get(session, project, params)
        for ev in data.get("query", {}).get("logevents", []) or []:
            ts = ev.get("timestamp", "")
            comment = ev.get("comment", "") or ""
            old = ev.get("params", {}).get("old_title") or ""
            new = ev.get("params", {}).get("new_title") or ""
            if not old and comment:
                m = re.search(r"moved\s+(.+?)\s+to\s+(.+)", comment, re.I)
                if m:
                    old, new = m.group(1), m.group(2)
            moves.append(
                {
                    "timestamp": ts,
                    "date": yyyymm_from_ts(ts) if len(ts) >= 7 else ts,
                    "old_title": old,
                    "new_title": new,
                    "user": ev.get("user", ""),
                }
            )
        cont = data.get("continue", {}) or {}
        lecontinue = cont.get("lecontinue")
        if not lecontinue:
            break
    return moves


def month_grid(start: str = "2015-07", end: str | None = None) -> list[str]:
    if end is None:
        end = yyyymm_from_ts(current_end_window())
    sy, sm = int(start[:4]), int(start[5:7])
    ey, em = int(end[:4]), int(end[5:7])
    out: list[str] = []
    y, m = sy, sm
    while (y, m) <= (ey, em):
        out.append(f"{y:04d}-{m:02d}")
        m += 1
        if m > 12:
            m = 1
            y += 1
    return out


def series_access_all(views_by_yyyymm: dict[str, int]) -> dict[str, int]:
    """Convert YYYYMM keys to YYYY-MM."""
    out: dict[str, int] = {}
    for k, v in views_by_yyyymm.items():
        out[f"{k[:4]}-{k[4:6]}"] = int(v)
    return out


def sum_series(dicts: list[dict[str, int]], months: list[str]) -> dict[str, int]:
    out: dict[str, int] = {}
    for m in months:
        out[m] = sum(d.get(m, 0) for d in dicts)
    return out


def period_share(series: dict[str, int], a: tuple[str, str], b: tuple[str, str]) -> tuple[float, float, float]:
    """Return views in period A, B, and share A/(A+B)."""
    va = sum(series.get(m, 0) for m in series if a[0] <= m <= a[1])
    vb = sum(series.get(m, 0) for m in series if b[0] <= m <= b[1])
    tot = va + vb
    share_a = va / tot if tot > 0 else float("nan")
    return va, vb, share_a


def detect_step_jump(months: list[str], views: list[float | None]) -> dict:
    """Largest MoM ratio increase on raw views (min prior >= 50)."""
    best = {"month": None, "ratio": 0.0, "prev_views": None, "views": None}
    for i in range(1, len(months)):
        p, c = views[i - 1], views[i]
        if p is None or c is None or p < 50:
            continue
        ratio = (c - p) / p
        if ratio > best["ratio"]:
            best = {
                "month": months[i],
                "ratio": ratio,
                "prev_month": months[i - 1],
                "prev_views": p,
                "views": c,
            }
    return best


def load_published_views(lang: str) -> dict[str, float]:
    usecols = ["concept", "project", "month", "access", "views", "status"]
    w = pd.read_csv(PV_CSV, encoding="utf-8-sig", usecols=usecols)
    w = w[
        (w["concept"] == "ASMR")
        & (w["access"].astype(str) == "all")
        & (w["status"].astype(str).str.lower() == "ok")
        & (w["project"].astype(str) == f"{lang}.wikipedia")
    ]
    return {str(r["month"]): float(r["views"]) for _, r in w.iterrows()}


def indexed_max_month(lang: str, wiki: dict) -> str | None:
    months = wiki["months"]
    s = wiki["series"]["ASMR"].get(lang) or []
    if not s:
        return None
    best_i, best_v = None, -1.0
    for i, v in enumerate(s):
        if v is not None and v > best_v:
            best_i, best_v = i, v
    return months[best_i] if best_i is not None else None


def verdict(
    step_month: str | None,
    move_dates: list[str],
    redirect_titles: list[str],
    combined_shift: float,
) -> str:
    if not step_month:
        return "unclear"
    move_near = any(
        abs(_month_diff(step_month, d)) <= 2 for d in move_dates if d
    )
    has_rd = len(redirect_titles) > 0
    if move_near and combined_shift > 0.05:
        return "step is a title artefact"
    if move_near or (has_rd and combined_shift > 0.08):
        return "step is a title artefact"
    if combined_shift < 0.03 and not move_near:
        return "real"
    return "unclear"


def _month_diff(a: str, b: str) -> int:
    ay, am = int(a[:4]), int(a[5:7])
    by, bm = int(b[:4]), int(b[5:7])
    return (ay - by) * 12 + (am - bm)


def main() -> None:
    titles_df = pd.read_csv(TITLES_CSV, dtype=str).fillna("")
    wiki = json.loads(WIKI_JSON.read_text(encoding="utf-8"))
    months = month_grid()
    session = requests.Session()
    rl = RateLimiter(4)
    end = current_end_window()

    editions: list[dict] = []

    for lang in LANGS:
        project = f"{lang}.wikipedia"
        row = titles_df[
            (titles_df["concept"] == "ASMR") & (titles_df["project"] == project)
        ].iloc[0]
        title = row["article_title"]
        pinfo = page_title_info(session, project, title)
        canonical = pinfo["title"]
        moves = []
        redirects: list[str] = []
        if pinfo.get("pageid"):
            moves = fetch_move_log(session, project, pinfo["pageid"])
            redirects = fetch_redirects(session, project, canonical)
        time.sleep(0.2)

        old_titles: set[str] = {canonical}
        for m in moves:
            if m.get("old_title"):
                old_titles.add(m["old_title"])
            if m.get("new_title"):
                old_titles.add(m["new_title"])
        for rd in redirects:
            old_titles.add(rd)
        old_titles.discard(canonical)

        title_series: dict[str, dict[str, int]] = {}
        for t in sorted({canonical, *old_titles}):
            raw = fetch_all_access_views(session, rl, project, t, HISTORICAL_START, end)
            title_series[t] = series_access_all(raw.get("all", {}))
            time.sleep(0.15)

        pub = load_published_views(lang)
        pub_list = [pub.get(m) for m in months]
        step = detect_step_jump(months, pub_list)

        canonical_only = title_series.get(canonical, {})
        all_title_dicts = list(title_series.values())
        combined = sum_series(all_title_dicts, months)

        p_early = ("2015-07", "2019-12")
        p_late = ("2021-01", "2026-10")
        _, _, sh_canon = period_share(canonical_only, p_early, p_late)
        _, _, sh_comb = period_share(combined, p_early, p_late)

        max_m_canon = max(canonical_only, key=lambda k: canonical_only[k], default=None)
        max_m_comb = max(combined, key=lambda k: combined[k], default=None)

        move_dates = sorted({m["date"][:7] for m in moves if m.get("timestamp")})
        v = verdict(
            step.get("month"),
            move_dates,
            redirects,
            abs((sh_comb or 0) - (sh_canon or 0)),
        )

        editions.append(
            {
                "lang": lang,
                "project": project,
                "wiki_concepts_yaml": "ASMR (published_concepts only; per-lang titles in data/wiki_concept_titles.csv)",
                "csv_title": title,
                "canonical_title": canonical,
                "pageid": pinfo.get("pageid"),
                "moves": moves,
                "redirects": redirects,
                "extra_titles": sorted(old_titles),
                "title_series": title_series,
                "published_views": pub,
                "step_jump": step,
                "indexed_max_month": indexed_max_month(lang, wiki),
                "takeoff_50": (wiki.get("indexed_takeoff") or {})
                .get("ASMR", {})
                .get(lang, {})
                .get("first_month_trailing12_gt_50"),
                "max_month_canonical": max_m_canon,
                "max_month_combined": max_m_comb,
                "share_2015_2019_early_canon": sh_canon,
                "share_2015_2019_early_combined": sh_comb,
                "verdict": v,
            }
        )

    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    lines: list[str] = [
        "# Wikipedia step-change check (ASMR)",
        "",
        f"Generated {now}. Local report only — `data/*.csv` unchanged; web data not rebuilt.",
        "",
        "Sources: `config/wiki_concepts.yaml`, `data/wiki_concept_titles.csv`, "
        "`data/wiki_pageviews_monthly.csv` (published series), `web/data/wiki_lang.json` (indexed), "
        "live MediaWiki API (`letype=move`, `prop=redirects`), Wikimedia Pageviews API "
        f"(agent=user; access rollup = desktop+mobile-web+mobile-app, same as `fetch_wiki_pageviews.py` / `build_wiki_lang`).",
        "",
        "## (a) Titles",
        "",
        "`config/wiki_concepts.yaml` lists published concept **ASMR** only; it does **not** store per-language article titles. "
        "Harvest titles live in **`data/wiki_concept_titles.csv`**.",
        "",
        "| lang | project | wiki_concept_titles.article_title | canonical (MW API) |",
        "|------|---------|--------------------------------|----------------------|",
    ]
    for e in editions:
        lines.append(
            f"| {e['lang']} | {e['project']} | {e['csv_title']} | {e['canonical_title']} |"
        )

    lines += [
        "",
        "## (b) Move log and redirects",
        "",
    ]
    for e in editions:
        lines.append(f"### {e['lang']}")
        lines.append("")
        lines.append(f"- pageid: {e['pageid']}")
        if e["moves"]:
            lines.append("- **Move events** (newest first):")
            for m in sorted(e["moves"], key=lambda x: x["timestamp"], reverse=True):
                lines.append(
                    f"  - {m['timestamp'][:10]}: `{m.get('old_title')}` → `{m.get('new_title')}` "
                    f"(user {m.get('user')})"
                )
        else:
            lines.append("- **Move events:** none on this pageid")
        if e["redirects"]:
            lines.append(f"- **Redirects to canonical** ({len(e['redirects'])}): " + ", ".join(f"`{r}`" for r in e["redirects"]))
        else:
            lines.append("- **Redirects to canonical:** none returned")
        lines.append("")

    lines += [
        "## (c) Monthly user pageviews by title",
        "",
        "Fetched live 2015-07… via Pageviews API (`access=all` rollup). "
        "Tables show total views over the window (not monthly grid).",
        "",
    ]
    for e in editions:
        lines.append(f"### {e['lang']}")
        lines.append("")
        lines.append("| title | total views (2015-07…) | first month | last month |")
        lines.append("|-------|----------------------:|-------------|------------|")
        for t, s in sorted(e["title_series"].items()):
            if not s:
                tot = 0
                first = last = "—"
            else:
                tot = sum(s.values())
                kms = sorted(s)
                first, last = kms[0], kms[-1]
            mark = " (canonical)" if t == e["canonical_title"] else ""
            lines.append(f"| `{t}`{mark} | {tot:,} | {first} | {last} |")
        lines.append("")

    lines += [
        "## (d) Step jump vs moves / old-title traffic",
        "",
        "**Step jump** in the published harvest: month with the largest month-over-month *relative* increase "
        "in `data/wiki_pageviews_monthly.csv` (`access=all`, ASMR), requiring prior month ≥ 50 views.",
        "",
        "| lang | step jump month | MoM Δ | prev → jump views | move dates (YYYY-MM) | take-off (trail-12>50) | indexed max month |",
        "|------|-----------------|------:|-------------------|----------------------|-------------------------|-------------------|",
    ]
    for e in editions:
        st = e["step_jump"]
        sm = st.get("month") or "—"
        ratio = f"{100 * st['ratio']:.1f}%" if st.get("month") else "—"
        pv = "—"
        if st.get("month"):
            pv = f"{st['prev_views']:.0f} → {st['views']:.0f}"
        md = ", ".join(sorted({d[:7] for d in (m['date'] for m in e['moves'])})) or "—"
        lines.append(
            f"| {e['lang']} | {sm} | {ratio} | {pv} | {md} | {e['takeoff_50'] or '—'} | {e['indexed_max_month'] or '—'} |"
        )

    lines += [
        "",
        "Narrative check: if the step month is within ~2 months of a move, or combining redirect/old-title views "
        "materially shifts era shares (§e), label as a title artefact; if moves/redirects are absent and combined ≈ canonical, treat as real interest.",
        "",
        "## (e) Combined series (sum of canonical + redirects + move old titles)",
        "",
        "Early share = views in **2015-07…2019-12** ÷ (that era + **2021-01…2026-10**). "
        "Compare canonical-only vs combined.",
        "",
        "| lang | max month (canonical) | max month (combined) | early share canonical | early share combined | Δ share |",
        "|------|----------------------:|---------------------:|----------------------:|---------------------:|--------:|",
    ]
    for e in editions:
        dsh = (e["share_2015_2019_early_combined"] or 0) - (e["share_2015_2019_early_canon"] or 0)
        lines.append(
            f"| {e['lang']} | {e['max_month_canonical'] or '—'} | {e['max_month_combined'] or '—'} | "
            f"{e['share_2015_2019_early_canon']:.3f} | {e['share_2015_2019_early_combined']:.3f} | {dsh:+.3f} |"
        )

    lines += [
        "",
        "## Verdict",
        "",
        "| lang | verdict |",
        "|------|---------|",
    ]
    for e in editions:
        lines.append(f"| {e['lang']} | **{e['verdict']}** |")

    lines += [
        "",
        "### Verdict notes",
        "",
    ]
    for e in editions:
        lines.append(f"- **{e['lang']}**: {e['verdict']}. "
                       f"Step at {e['step_jump'].get('month') or 'n/a'}; "
                       f"{len(e['redirects'])} redirect(s), {len(e['moves'])} move(s) on page.")

    OUT_MD.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote {OUT_MD}")
    print("\nVerdict summary:")
    for e in editions:
        print(f"  {e['lang']}: {e['verdict']}")


if __name__ == "__main__":
    main()