# Wikipedia step-change check (ASMR)

Generated 2026-11-25 02:37 UTC. Local report only — `data/*.csv` unchanged; web data not rebuilt.

Sources: `config/wiki_concepts.yaml`, `data/wiki_concept_titles.csv`, `data/wiki_pageviews_monthly.csv` (published series), `web/data/wiki_lang.json` (indexed), live MediaWiki API (`letype=move`, `prop=redirects`), Wikimedia Pageviews API (agent=user; access rollup = desktop+mobile-web+mobile-app, same as `fetch_wiki_pageviews.py` / `build_wiki_lang`).

## (a) Titles

`config/wiki_concepts.yaml` lists published concept **ASMR** only; it does **not** store per-language article titles. Harvest titles live in **`data/wiki_concept_titles.csv`**.

| lang | project | wiki_concept_titles.article_title | canonical (MW API) |
|------|---------|--------------------------------|----------------------|
| en | en.wikipedia | ASMR | ASMR |
| ja | ja.wikipedia | ASMR | ASMR |
| ko | ko.wikipedia | 자율 감각 쾌락 반응 | 자율 감각 쾌락 반응 |
| tr | tr.wikipedia | ASMR | ASMR |
| nl | nl.wikipedia | Autonomous sensory meridian response | Autonomous sensory meridian response |
| es | es.wikipedia | ASMR | ASMR |
| fr | fr.wikipedia | Autonomous sensory meridian response | Autonomous sensory meridian response |

## (b) Move log and redirects

### en

- pageid: 37774663
- **Move events:** none on this pageid
- **Redirects to canonical** (16): `A.S.M.R.`, `ASMR (sensation)`, `ASMR artist`, `ASMR practitioner`, `ASMR video`, `ASMRotica`, `ASMRtist`, `Asmr`, `Auto-Sensory Meridian Response`, `Auto-sensory meridian response`, `Autonomous Sensory Meridian Response`, `Autonomous sensory meridian response`, `Brain orgasm`, `Braingasm`, `Head orgasm`, `User:DevonJamesKing/Autonomous sensory meridian response`

### ja

- pageid: 2858123
- **Move events:** none on this pageid
- **Redirects to canonical** (4): `ASMRist`, `ASMRtist`, `Autonomous sensory meridian response`, `アスマーリスト`

### ko

- pageid: 1423378
- **Move events:** none on this pageid
- **Redirects to canonical** (3): `ASMR`, `자율 감각 쾌감 반응`, `자율감각쾌락반응`

### tr

- pageid: 2173895
- **Move events:** none on this pageid
- **Redirects to canonical** (4): `Beyinsel Orgazm`, `Otonom Duyu Meridyeni Etkisi`, `Otonom duyusal meridyen tepki`, `Otonom duyusal meridyen tepkisi`

### nl

- pageid: 5083247
- **Move events:** none on this pageid
- **Redirects to canonical** (1): `ASMR`

### es

- pageid: 5551413
- **Move events:** none on this pageid
- **Redirects to canonical** (4): `RSMA`, `Respuesta Sensorial Meridiana Autonoma`, `Respuesta Sensorial Meridiana Autónoma`, `Respuesta sensorial meridiana autónoma`

### fr

- pageid: 7237336
- **Move events:** none on this pageid
- **Redirects to canonical** (3): `ASMR`, `Autonomous Sensory Meridian Response`, `Réponse méridienne sensorielle autonome`

## (c) Monthly user pageviews by title

Fetched live 2015-07… via Pageviews API (`access=all` rollup). Tables show total views over the window (not monthly grid).

### en

| title | total views (2015-07…) | first month | last month |
|-------|----------------------:|-------------|------------|
| `A.S.M.R.` | 362 | 2021-05 | 2026-10 |
| `ASMR` (canonical) | 7,580,079 | 2015-07 | 2026-10 |
| `ASMR (sensation)` | 2,521 | 2015-12 | 2026-10 |
| `ASMR artist` | 18 | 2026-06 | 2026-10 |
| `ASMR practitioner` | 4,577 | 2019-03 | 2026-10 |
| `ASMR video` | 2,807 | 2015-07 | 2026-10 |
| `ASMRotica` | 237 | 2023-05 | 2026-10 |
| `ASMRtist` | 1,966 | 2017-04 | 2026-10 |
| `Asmr` | 192,438 | 2015-07 | 2026-10 |
| `Auto-Sensory Meridian Response` | 376 | 2015-07 | 2026-10 |
| `Auto-sensory meridian response` | 569 | 2015-07 | 2026-10 |
| `Autonomous Sensory Meridian Response` | 58,049 | 2015-07 | 2026-10 |
| `Autonomous sensory meridian response` | 12,974,841 | 2015-07 | 2026-10 |
| `Brain orgasm` | 1,255 | 2015-07 | 2026-10 |
| `Braingasm` | 439 | 2015-07 | 2026-10 |
| `Head orgasm` | 230,418 | 2019-10 | 2026-10 |
| `User:DevonJamesKing/Autonomous sensory meridian response` | 57 | 2015-07 | 2026-10 |

### ja

| title | total views (2015-07…) | first month | last month |
|-------|----------------------:|-------------|------------|
| `ASMR` (canonical) | 2,311,763 | 2015-07 | 2026-10 |
| `ASMRist` | 189 | 2019-12 | 2026-10 |
| `ASMRtist` | 1,374 | 2019-12 | 2026-10 |
| `Autonomous sensory meridian response` | 168,752 | 2015-07 | 2026-10 |
| `アスマーリスト` | 328 | 2019-12 | 2026-10 |

### ko

| title | total views (2015-07…) | first month | last month |
|-------|----------------------:|-------------|------------|
| `ASMR` | 143,608 | 2015-07 | 2026-10 |
| `자율 감각 쾌감 반응` | 64 | 2016-05 | 2026-10 |
| `자율 감각 쾌락 반응` (canonical) | 446,020 | 2015-10 | 2026-10 |
| `자율감각쾌락반응` | 59 | 2018-09 | 2026-10 |

### tr

| title | total views (2015-07…) | first month | last month |
|-------|----------------------:|-------------|------------|
| `ASMR` (canonical) | 129,986 | 2016-11 | 2026-10 |
| `Beyinsel Orgazm` | 34 | 2017-01 | 2026-09 |
| `Otonom Duyu Meridyeni Etkisi` | 72 | 2016-11 | 2026-10 |
| `Otonom duyusal meridyen tepki` | 19,587 | 2016-11 | 2026-10 |
| `Otonom duyusal meridyen tepkisi` | 19 | 2016-11 | 2026-09 |

### nl

| title | total views (2015-07…) | first month | last month |
|-------|----------------------:|-------------|------------|
| `ASMR` | 2,342 | 2015-11 | 2026-10 |
| `Autonomous sensory meridian response` (canonical) | 257,255 | 2018-07 | 2026-10 |

### es

| title | total views (2015-07…) | first month | last month |
|-------|----------------------:|-------------|------------|
| `ASMR` (canonical) | 3,322,076 | 2015-07 | 2026-10 |
| `RSMA` | 228 | 2015-07 | 2026-10 |
| `Respuesta Sensorial Meridiana Autonoma` | 545 | 2015-07 | 2026-10 |
| `Respuesta Sensorial Meridiana Autónoma` | 6,977 | 2015-07 | 2026-10 |
| `Respuesta sensorial meridiana autónoma` | 127,696 | 2015-07 | 2026-10 |

### fr

| title | total views (2015-07…) | first month | last month |
|-------|----------------------:|-------------|------------|
| `ASMR` | 73,896 | 2015-07 | 2026-10 |
| `Autonomous Sensory Meridian Response` | 154 | 2020-08 | 2026-10 |
| `Autonomous sensory meridian response` (canonical) | 1,575,507 | 2015-07 | 2026-10 |
| `Réponse méridienne sensorielle autonome` | 974 | 2019-07 | 2026-10 |

## (d) Step jump vs moves / old-title traffic

**Step jump** in the published harvest: month with the largest month-over-month *relative* increase in `data/wiki_pageviews_monthly.csv` (`access=all`, ASMR), requiring prior month ≥ 50 views.

| lang | step jump month | MoM Δ | prev → jump views | move dates (YYYY-MM) | take-off (trail-12>50) | indexed max month |
|------|-----------------|------:|-------------------|----------------------|-------------------------|-------------------|
| en | 2020-05 | 1504.5% | 6412 → 102880 | — | 2021-02 | 2021-08 |
| ja | 2019-04 | 2245.5% | 286 → 6708 | — | 2020-03 | 2020-05 |
| ko | 2018-07 | 258.2% | 1606 → 5752 | — | 2019-03 | 2019-02 |
| tr | 2024-03 | 99.7% | 3394 → 6779 | — | 2024-04 | 2024-03 |
| nl | 2018-08 | 171.2% | 709 → 1923 | — | 2018-12 | 2018-10 |
| es | 2016-05 | 11127.9% | 154 → 17291 | — | 2019-01 | 2019-05 |
| fr | 2024-06 | 59.4% | 9170 → 14615 | — | 2018-01 | 2019-04 |

Narrative check: if the step month is within ~2 months of a move, or combining redirect/old-title views materially shifts era shares (§e), label as a title artefact; if moves/redirects are absent and combined ≈ canonical, treat as real interest.

## (e) Combined series (sum of canonical + redirects + move old titles)

Early share = views in **2015-07…2019-12** ÷ (that era + **2021-01…2026-10**). Compare canonical-only vs combined.

| lang | max month (canonical) | max month (combined) | early share canonical | early share combined | Δ share |
|------|----------------------:|---------------------:|----------------------:|---------------------:|--------:|
| en | 2021-08 | 2018-08 | 0.018 | 0.645 | +0.626 |
| ja | 2020-05 | 2020-05 | 0.180 | 0.250 | +0.070 |
| ko | 2019-02 | 2016-10 | 0.679 | 0.769 | +0.090 |
| tr | 2024-03 | 2024-03 | 0.001 | 0.041 | +0.040 |
| nl | 2018-10 | 2018-10 | 0.433 | 0.440 | +0.008 |
| es | 2019-05 | 2019-05 | 0.648 | 0.667 | +0.019 |
| fr | 2019-04 | 2019-04 | 0.614 | 0.634 | +0.020 |

## Verdict

| lang | verdict |
|------|---------|
| en | **step is a title artefact** |
| ja | **unclear** |
| ko | **step is a title artefact** |
| tr | **unclear** |
| nl | **real** |
| es | **real** |
| fr | **real** |

### Verdict notes

- **en**: step is a title artefact. Step at 2020-05; 16 redirect(s), 0 move(s) on page. The harvest title is `ASMR`, but live API shows **12.97M** views on redirect synonym `Autonomous sensory meridian response` vs **7.58M** on canonical `ASMR`; combined totals shift early-era share from **1.8%** to **64.5%**, matching a consolidation artefact rather than a single-title interest spike.
- **ja**: unclear. Step at 2019-04; 4 redirect(s), 0 move(s) on page.
- **ko**: step is a title artefact. Step at 2018-07; 3 redirect(s), 0 move(s) on page.
- **tr**: unclear. Step at 2024-03; 4 redirect(s), 0 move(s) on page.
- **nl**: real. Step at 2018-08; 1 redirect(s), 0 move(s) on page.
- **es**: real. Step at 2016-05; 4 redirect(s), 0 move(s) on page.
- **fr**: real. Step at 2024-06; 3 redirect(s), 0 move(s) on page.
