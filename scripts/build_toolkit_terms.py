#!/usr/bin/env python3
"""Count toolkit terms from the local master + strict classification.

Raw CSVs stay unpublished. Output is rounded counts only: no channel ids or names.
"""
from __future__ import annotations

import json
import math
import re
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import yaml

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
OUT = ROOT / "web" / "data" / "toolkit_terms.json"

STOP = {
    "asmr", "video", "videos", "short", "shorts", "youtube", "youtuber",
    "the", "and", "for", "with", "you", "your", "this", "that", "from",
    "para", "com", "que", "una", "por", "los", "las", "del", "con", "como",
    "mais", "não", "nao", "uma", "dos", "das", "em", "no", "na", "se",
    "und", "der", "die", "das", "mit", "für", "fur", "ein", "eine",
    "les", "des", "une", "dans", "pour", "sur", "est",
    "official", "channel", "subscribe", "new", "amp", "http", "https", "www",
    "hd", "fyp", "viral", "part", "full", "free", "best", "top", "its", "it's",
}
GENERIC_EXACT = {"asmr", "video", "videos", "short", "shorts", "youtube"}
NOISE = re.compile(
    r"white\s*noise|whitenoise|白噪音|白噪声|brown\s*noise|pink\s*noise|green\s*noise|"
    r"binaural|ambient\s*noise|isochronic|brainwave|腦波|脑波|432\s*hz|"
    r"fan noise|womb sound|棕色噪音|棕噪音|粉紅噪音|粉红噪音|백색소음|"
    r"ホワイトノイズ|ブラウンノイズ|ピンクノイズ",
    re.I,
)
EMOJI = re.compile(
    r"[\U0001F000-\U0001FAFF\U00002700-\U000027BF\U0001F1E6-\U0001F1FF]"
)
LATIN_WORD = re.compile(r"[a-z][a-z0-9']{2,}")
CJK_GROUPS = {"Han script (mostly Chinese)", "Japanese script", "Korean script"}


def sig2(n: int) -> int:
    if n < 100:
        return int(n)
    exp = int(math.floor(math.log10(n))) - 1
    base = 10 ** exp
    return int(round(n / base) * base)


def load_alias() -> dict[str, str]:
    doc = yaml.safe_load((ROOT / "config" / "trigger_canonical.yaml").read_text())
    out = {}
    for key, aliases in (doc.get("canonical") or {}).items():
        display = key.replace("_", " ")
        out[display] = display
        for alias in aliases or []:
            out[str(alias).strip().lower()] = display
    return out


def load_groups() -> list[tuple[str, list[str]]]:
    doc = yaml.safe_load((ROOT / "config" / "toolkit_groups.yaml").read_text())
    order = ["props and triggers", "visual craft", "formats"]
    return [(name, [str(x).lower() for x in doc.get(name) or []]) for name in order]


def assign(term: str, groups: list[tuple[str, list[str]]]) -> str:
    padded = f" {term.lower()} "
    for name, kws in groups:
        for kw in kws:
            if f" {kw} " in padded:
                return name
    return "other"


def tokens(text: str) -> list[str]:
    return LATIN_WORD.findall(text.lower())


def keep_token(tok: str) -> bool:
    if tok in STOP or tok in GENERIC_EXACT:
        return False
    if tok.isdigit() or len(tok) < 3:
        return False
    if EMOJI.search(tok) or NOISE.search(tok):
        return False
    return True


def main() -> None:
    classes = pd.read_csv(
        DATA / "yt_classes_v32.csv",
        usecols=["videoId", "channelId", "script_group", "class_strict"],
    )
    classes = classes[classes["class_strict"] == "asmr_labelled"]
    master = pd.read_csv(
        DATA / "yt_master.csv",
        usecols=["videoId", "tags", "title"],
        dtype=str,
    )
    df = classes.merge(master, on="videoId", how="inner")
    alias = load_alias()
    groups = load_groups()
    counts: dict[str, int] = defaultdict(int)
    channels: dict[str, set] = defaultdict(set)

    for row in df.itertuples(index=False):
        latin = row.script_group == "Latin script"
        found = set()
        tags = str(row.tags) if isinstance(row.tags, str) else ""
        for tag in tags.split("|"):
            raw = tag.strip().lower()
            if not raw or EMOJI.search(raw) or NOISE.search(raw):
                continue
            if raw in alias:
                found.add(alias[raw])
                continue
            if row.script_group in CJK_GROUPS or not latin:
                if keep_token(raw) or (len(raw) >= 2 and not LATIN_WORD.fullmatch(raw)):
                    if raw not in GENERIC_EXACT and not NOISE.search(raw):
                        found.add(alias.get(raw, raw))
                continue
            words = [w for w in tokens(raw) if keep_token(w)]
            for w in words:
                found.add(alias.get(w, w))
            for a, b in zip(words, words[1:]):
                phrase = alias.get(f"{a} {b}", f"{a} {b}")
                if not NOISE.search(phrase):
                    found.add(phrase)
        if latin:
            words = [w for w in tokens(str(row.title or "")) if keep_token(w)]
            for w in words:
                found.add(alias.get(w, w))
            for a, b in zip(words, words[1:]):
                phrase = alias.get(f"{a} {b}", f"{a} {b}")
                if not NOISE.search(phrase):
                    found.add(phrase)
        cid = str(row.channelId)
        for term in found:
            if NOISE.search(term) or term in GENERIC_EXACT:
                continue
            counts[term] += 1
            channels[term].add(cid)

    allowed_uni = set(alias.values())
    for _name, kws in groups:
        allowed_uni.update(kws)
    kept = []
    for term, n in counts.items():
        ch = len(channels[term])
        if n < 150 or ch < 20:
            continue
        if EMOJI.search(term) or NOISE.search(term):
            continue
        if " " not in term and term not in allowed_uni:
            continue
        parts = term.split()
        if len(parts) >= 2 and parts[0] == parts[-1]:
            continue
        kept.append((term, n, ch))
    kept.sort(key=lambda item: (-item[1], item[0]))
    if len(kept) > 320:
        kept = kept[:320]
    if not (250 <= len(kept) <= 350):
        print(f"WARNING term count {len(kept)} outside 250-350")
    terms = []
    for term, n, ch in kept:
        terms.append({
            "term": term,
            "n_videos": sig2(n),
            "group": assign(term, groups),
        })
    payload = {
        "meta": {
            "source_files": ["yt_master.csv", "yt_classes_v32.csv"],
            "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "caveats": [
                "Strict rule: class_strict asmr_labelled. Tags for every script; Latin titles add words and 2-grams. CJK uses tags only.",
                "Kept terms have at least 150 videos and 20 channels. If more pass, the 320 with the most videos are kept. n_videos is rounded to 2 significant digits. No channel ids or names.",
                "Aliases merged with config/trigger_canonical.yaml. Ambient-noise lexicon dropped.",
            ],
            "rules": "strict",
            "n_terms": len(terms),
            "min_videos": 150,
            "min_channels": 20,
        },
        "terms": terms,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n")
    from collections import Counter
    print("videos", len(df), "terms", len(terms))
    print(Counter(t["group"] for t in terms))
    print("top", [t["term"] for t in terms[:25]])


if __name__ == "__main__":
    main()
