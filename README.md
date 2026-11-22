# ASMR feasibility — published site

This repository contains **aggregated results only** for the GitHub Pages site.

Raw data (YouTube/Douyin/TikTok comments, channel ids, creator hashes, scraped social-media records, and API credentials) is **not** included, for privacy and platform-terms reasons. Keep those files only in a private local workspace.

## Site

Static files live under `web/`. GitHub Pages should serve the `web/` folder from the default branch.

## Regenerating payloads (requires private raw data locally)

These scripts read raw CSVs that are **not** in this repo and write aggregated JSON under `web/data/`:

- `scripts/build_web_data.py` — builds all front-end JSON payloads from local `data/`
- `scripts/classify_yt_classes.py` — classifies videos into human-ASMR vs ambient/noise scope classes (`config/yt_classes.yaml`)
- `scripts/verify_web_data.py` — checks payload size, privacy keys, and totals (raw-data checks need local `data/`)

## Docs / config

See `docs/` for methodology notes and `config/` for freeze hashes, theme lists, and class keywords.
