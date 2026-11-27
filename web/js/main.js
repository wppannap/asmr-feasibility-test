/* global d3, topojson, scrollama, ISO_NUM_TO_A3, ISO_A3_TO_NAME */
import { attachTableToggle, prefersReducedMotion } from "./charts/util.js?v=20261127k";
import { onSceneEnter } from "./charts/entrance.js?v=20261127k";
import { themeColors } from "./theme.js?v=20261127k";
import {
  ENABLED_DATA,
  ENABLED_SECTIONS,
  MAP_CAPTION_NOTES,
  SECTION_CHART_MODULES,
  applySectionVisibility,
} from "./sections.js?v=20261127k";

/** Populated by loadChartModules() — sequential imports for enabled sections only. */
const ChartModules = {};

const sectionOn = (id) => ENABLED_SECTIONS.includes(id);

async function loadChartModules() {
  for (const [sid, path] of Object.entries(SECTION_CHART_MODULES)) {
    if (!sectionOn(sid)) continue;
    ChartModules[sid] = await import(path);
  }
}

const GROWTH_LABEL = "ASMR search growth (latest 12 months ÷ first 12 months − 1)";
const GROWTH_DOMAIN_PCT = [-50, 150]; // colour only; values clipped
/** Map 1 · 60-month peak playback step (ms per month). */
const MAP1_PLAY_MS = { 1: 150, 2: 85 };
const MAP1_NOTE_TWEEN_MS = 130;
const MAP1_RIPPLE_MS = 650;
const MAP1_RIPPLE_MAX = 36;

/** Editorial KPI callouts — values from trends payload meta only. */
function fillTrendKpis(meta) {
  if (!meta) return;
  const counts = meta.counts || {};
  const mk = meta.counts_by_mk_class || {};
  const growth = meta.growth_ratio_ok || {};
  const measured = document.getElementById("kpi-measured");
  const rising = document.getElementById("kpi-rising");
  const median = document.getElementById("kpi-median");
  if (measured && counts.measured != null) measured.textContent = String(counts.measured);
  if (rising && mk.rising != null) rising.textContent = String(mk.rising);
  if (median && growth.median != null) {
    const pct = (growth.median * 100).toFixed(1);
    median.textContent = `${growth.median >= 0 ? "+" : ""}${pct}%`;
  }
}

function colorSeq(t) {
  const c = themeColors();
  return d3.interpolateRgb(c.nodata, c.accent)(t);
}
function colorDiv(t) {
  // t in [0,1]; 0.5 ≈ zero growth
  const c = themeColors();
  if (t < 0.5) return d3.interpolateRgb(c.neg, c.neutral)(t * 2);
  return d3.interpolateRgb(c.neutral, c.accent)((t - 0.5) * 2);
}

const state = {
  layerMode: "trends", // trends | creators | compare
  map1Mode: "growth", // growth | peak
  map1Filter: "all", // all | east_asia | europe | americas | rising
  monthIndex: 0,
  playing: false,
  map1Playing: false,
  map1PlaySpeed: 1, // 1× → 150ms/mo · 2× → 85ms/mo
  map1PrevPeak: {}, // iso3 → prior month value (crest / threshold detect)
  lands: null,
  countryV2ByIso: new Map(),
  creatorsByIso: new Map(),
  creatorRows: [],
  monthly: null,
  creatorMeta: null,
  trendsMeta: null,
  monthlyMeta: null,
  displayValues: { trends: {}, creators: {}, monthly: {} },
  maps: {},
  tween: null,
  extra: null,
  undrawableGeos: [],
};

const tooltip = d3.select("#tooltip");
const chartApi = {};

function countryName(iso3) {
  return ISO_A3_TO_NAME[iso3] || iso3;
}

function formatNum(v, digits) {
  if (v == null || Number.isNaN(v)) return "—";
  return d3.format(`,.${digits ?? 1}f`)(v);
}

/** Editorial spotlight regions from geographic centroid. */
function spotlightRegion(feature) {
  const c = d3.geoCentroid(feature);
  if (!c || !Number.isFinite(c[0])) return "other";
  const [lon, lat] = c;
  if (lon <= -25) return "americas";
  if (lon >= 95 && lat >= 10 && lat <= 55) return "east_asia";
  if (lon > -25 && lon < 45 && lat >= 34) return "europe";
  return "other";
}

const REGION_LABEL = {
  east_asia: "East Asia",
  europe: "Europe",
  americas: "Americas",
  other: "Other",
};

function applyRegionHover(region, event) {
  state.map1HoverRegion = region || null;
  const pill = document.getElementById("map-region-pill");
  if (pill) {
    if (!region) {
      pill.hidden = true;
    } else {
      pill.hidden = false;
      pill.textContent = REGION_LABEL[region] || region;
      if (event) {
        pill.style.left = event.clientX + 14 + "px";
        pill.style.top = event.clientY + 14 + "px";
      }
    }
  }
  const g = state.maps.trends?.pulseG;
  if (!g) return;
  g.selectAll("g.dorling-node").each(function (d) {
    const on = !region || d.region === region;
    d3.select(this)
      .attr("opacity", on ? 1 : 0.18)
      .style("filter", region && on ? "drop-shadow(0 0 5px rgba(244,162,89,0.85))" : null);
  });
}

function nodeMatchesFilter(node, filter) {
  if (!filter || filter === "all") return true;
  if (filter === "rising") return node.row?.mk_class === "rising";
  return node.region === filter;
}


async function loadAll() {
    const topo = await d3.json(ENABLED_DATA.topo);
    const trends = await d3.json(ENABLED_DATA.trends);
    const monthly = await d3.json(ENABLED_DATA.monthly);
    const ytCreators = sectionOn("scrolly-3") && ENABLED_DATA.yt_creators
      ? await d3.json(ENABLED_DATA.yt_creators)
      : null;
    const ytDuration = sectionOn("scrolly-5") && ENABLED_DATA.yt_duration
      ? await d3.json(ENABLED_DATA.yt_duration)
      : null;
    const ytUpload = sectionOn("scrolly-9") && ENABLED_DATA.yt_upload_clock
      ? await d3.json(ENABLED_DATA.yt_upload_clock)
      : null;

    state.extra = {
      ytCreators,
      ytDuration,
      ytUpload,
    };

    const countries = topojson.feature(topo, topo.objects.countries);
    countries.features.forEach((f) => {
      const num = String(f.id);
      f.properties = f.properties || {};
      f.properties.iso3 = ISO_NUM_TO_A3[num] || ISO_NUM_TO_A3[num.replace(/^0+/, "")] || null;
    });
    // Drop Antarctica from projection fit and drawing
    countries.features = countries.features.filter((f) => f.properties.iso3 !== "ATA");
    state.lands = countries;

    state.trendsMeta = trends.meta;
    fillTrendKpis(trends.meta);
    state.countryV2ByIso = new Map();
    (trends.rows || []).forEach((r) => {
      if (r.iso3) state.countryV2ByIso.set(r.iso3, r);
    });
    // geos present in payload but missing from countries-50m
    const topoIso = new Set(
      countries.features.map((f) => f.properties.iso3).filter(Boolean)
    );
    state.undrawableGeos = [];
    state.countryV2ByIso.forEach((row, iso) => {
      if (!topoIso.has(iso)) {
        state.undrawableGeos.push({
          iso3: iso,
          geo: row.geo,
          name: row.name,
          quality: row.quality,
        });
      }
    });
    (trends.meta?.not_in_v3 || []).forEach((g) => {
      const iso = g.iso3 || g.geo;
      if (iso && !topoIso.has(iso)) {
        state.undrawableGeos.push({ ...g, quality: "not_in_v3" });
      }
    });
    console.info(
      "Trends geos not drawable on countries-50m:",
      state.undrawableGeos.map((g) => g.iso3 || g.geo)
    );

    state.creatorMeta = null;
    state.creatorRows = [];
    state.creatorsByIso = new Map();

    state.monthly = monthly;
    state.monthlyMeta = monthly.meta;
    // Start scrubber at first complete window month (2021-11); 2021-10 is partial.
    const startIdx = (monthly.months || []).indexOf("2021-11");
    state.monthIndex = startIdx >= 0 ? startIdx : 0;

    applyMapCaptions(trends.meta, monthly.meta);
  }

  function syncNotesOpen() {
    const mobile = window.matchMedia("(max-width: 820px)").matches;
    document.querySelectorAll("details.notes-details").forEach((el) => {
      el.open = !mobile;
    });
  }

  function applyMapCaptions(trendsMeta, monthlyMeta) {
    const noteBits = [
      MAP_CAPTION_NOTES.latinAsmrOnly,
      MAP_CAPTION_NOTES.mainlandChina,
    ];
    const win = MAP_CAPTION_NOTES.window;

    const sub1 = document.getElementById("trends-window-subtitle");
    if (sub1) sub1.textContent = win;
    const sub2 = document.getElementById("monthly-window-subtitle");
    if (sub2) sub2.textContent = win;

    const monthCap = document.getElementById("month-caption");
    if (monthCap) {
      const m2 =
        monthlyMeta?.map2_caption || "each region relative to its own peak";
      monthCap.textContent = `${m2} · ${win}`;
    }

    const c1 = document.getElementById("caveat-1");
    if (c1) {
      const base = [...(trendsMeta?.caveats || [])].join(" ");
      c1.textContent = [base, ...noteBits].filter(Boolean).join(" ");
    }
    const c2 = document.getElementById("caveat-2");
    if (c2) {
      const raw = (monthlyMeta?.caveats || []).join(" ");
      const stripped = raw
        .replace(/window is Nov 2021 to Oct 2026[^.]*(?:\.|$)/gi, "")
        .replace(/\s{2,}/g, " ")
        .trim();
      c2.textContent = [stripped, ...noteBits].filter(Boolean).join(" ");
    }
    syncNotesOpen();
  }

  function makeScale(values, { log, diverging } = {}) {
    const clean = values.filter((v) => v != null && Number.isFinite(v));
    if (!clean.length) {
      return {
        scale: () => themeColors().nodata,
        domain: [0, 1],
        log: false,
        diverging: false,
      };
    }
    let domain;
    let scaleFn;
    if (diverging) {
      const absMax = d3.max(clean, (v) => Math.abs(v)) || 1;
      domain = [-absMax, absMax];
      // RdBu: low=red (decline), high=blue (rise) — invert so negative→warm
      scaleFn = d3.scaleSequential((t) => colorDiv(1 - t)).domain(domain).clamp(true);
    } else if (log) {
      const positives = clean.filter((v) => v > 0);
      const lo = positives.length ? d3.min(positives) : 1;
      const hi = d3.max(clean) || 1;
      domain = [lo, hi];
      scaleFn = d3.scaleSequentialLog(colorSeq).domain(domain).clamp(true);
    } else {
      const nonNeg = clean.filter((v) => v >= 0);
      domain = [0, d3.max(nonNeg.length ? nonNeg : clean) || 1];
      scaleFn = d3.scaleSequential(colorSeq).domain(domain).clamp(true);
    }
    return { scale: scaleFn, domain, log: !!log, diverging: !!diverging };
  }

  function anyLowVolumeFlag() {
    for (const row of state.countryV2ByIso.values()) {
      if (row?.quality === "low_volume") return true;
    }
    return false;
  }

  function shouldHatchFlat(row) {
    return row && row.quality === "ok" && row.mk_class === "flat";
  }

  function growthPctForColour(row) {
    if (!row || row.quality !== "ok") return null;
    const clipped =
      row.growth_ratio_clipped != null ? row.growth_ratio_clipped : row.growth_ratio;
    if (clipped == null || !Number.isFinite(clipped)) return null;
    return clipped * 100; // percent for colour domain
  }

  function drawLegend(el, scaleInfo, label, opts = {}) {
    const {
      map1Full,
      hatchNote,
      showMiss,
      showLowVolume,
      growthTicks,
    } = opts;
    const root = d3.select(el);
    root.selectAll("*").remove();
    root.append("span").attr("class", "legend-title").text(label);
    const legendCopy = state.trendsMeta?.map1_legend || {};
    if (map1Full) {
      // Musical-note grammar
      const row = (cls, lab) => {
        const r = root.append("div").attr("class", "legend-swatch-row");
        r.append("span").attr("class", `legend-swatch ${cls}`);
        r.append("span").text(lab);
      };
      row("legend-note-quarter", "Quarter / eighth / sixteenth — rising or falling (significant)");
      row("legend-note-hollow", legendCopy.hatch_flat || "Whole / half — no significant trend");
      row("legend-note-rest", legendCopy.low_volume || "Rest — too few searches to measure");
      row("legend-note-falling", "Teal notes — falling (significant)");
      row(
        "legend-swatch-miss",
        legendCopy.no_data ||
          "No data (including mainland China: Google is not accessible there)"
      );
      row("legend-swatch-smallbase", legendCopy.small_base || "Small base (dashed halo)");
      if (legendCopy.clip_note) {
        root.append("span").attr("class", "legend-hatch-note").text(legendCopy.clip_note);
      }
      root
        .append("span")
        .attr("class", "legend-hatch-note")
        .text("Note size ∝ |clipped growth|; note type is deterministic by region. Toggle Mode for 60-month peak.");
      return;
    }
    const w = 180;
    const h = 10;
    const block = root.append("div").attr("class", "legend-scale");
    const svg = block.append("svg").attr("width", w).attr("height", h + 18);
    const defs = svg.append("defs");
    const id = `lg-${Math.random().toString(36).slice(2, 8)}`;
    const grad = defs.append("linearGradient").attr("id", id);
    d3.range(0, 1.01, 0.05).forEach((t) => {
      const x = scaleInfo.domain[0] + t * (scaleInfo.domain[1] - scaleInfo.domain[0]);
      grad.append("stop").attr("offset", `${t * 100}%`).attr("stop-color", scaleInfo.scale(x));
    });
    svg.append("rect").attr("width", w).attr("height", h).attr("fill", `url(#${id})`).attr("rx", 2);
    const endTicks = growthTicks
      ? [growthTicks[0], growthTicks[growthTicks.length - 1]]
      : [scaleInfo.domain[0], scaleInfo.domain[1]];
    const tickY = h + 12;
    endTicks.forEach((tv, i) => {
      const x = i === 0 ? 0 : w;
      const anchor = i === 0 ? "start" : "end";
      const lab =
        scaleInfo.diverging || growthTicks
          ? `${tv > 0 ? "+" : ""}${tv}%`
          : formatNum(tv, 0);
      svg
        .append("text")
        .attr("x", x)
        .attr("y", tickY)
        .attr("class", "legend-tick")
        .attr("text-anchor", anchor)
        .text(lab);
    });
    if (showMiss) {
      const row = root.append("div").attr("class", "legend-swatch-row");
      row.append("span").attr("class", "legend-swatch legend-swatch-miss");
      row.append("span").text(legendCopy.no_data || "No data");
    }
    if (showLowVolume) {
      const row = root.append("div").attr("class", "legend-swatch-row");
      row.append("span").attr("class", "legend-swatch legend-swatch-lowvol");
      row.append("span").text(legendCopy.low_volume || "Too few searches to measure");
    }
    if (hatchNote) {
      root.append("span").attr("class", "legend-hatch-note").text(hatchNote);
    }
  }

  function createMap(containerSel, key) {
    const wrap = document.querySelector(containerSel);
    const width = 960;
    const height = 520;
    const isDorling = key === "trends";
    const svg = d3
      .select(wrap)
      .append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("role", "img")
      .attr(
        "aria-label",
        isDorling
          ? "World Acoustic Score of ASMR search growth"
          : "World choropleth map"
      );

    const defs = svg.append("defs");
    const pat = defs
      .append("pattern")
      .attr("id", `hatch-${key}`)
      .attr("patternUnits", "userSpaceOnUse")
      .attr("width", 6)
      .attr("height", 6)
      .attr("patternTransform", "rotate(45)");
    pat
      .append("line")
      .attr("x1", 0)
      .attr("y1", 0)
      .attr("x2", 0)
      .attr("y2", 6)
      .attr("stroke", themeColors().ink)
      .attr("stroke-width", 1.5)
      .attr("stroke-opacity", 0.55);
    const dots = defs
      .append("pattern")
      .attr("id", `dots-lowvol-${key}`)
      .attr("patternUnits", "userSpaceOnUse")
      .attr("width", 5)
      .attr("height", 5);
    dots.append("rect").attr("width", 5).attr("height", 5).attr("fill", themeColors().nodata);
    dots
      .append("circle")
      .attr("cx", 1.5)
      .attr("cy", 1.5)
      .attr("r", 0.9)
      .attr("fill", themeColors().muted);

    const projection = d3.geoNaturalEarth1().fitExtent(
      [
        [190, 28],
        [width - 88, height - 32],
      ],
      state.lands
    );
    const path = d3.geoPath(projection);

    // Whisper-quiet five-line staff + treble clef watermark (behind coastlines & notes)
    if (isDorling) {
      const muted = themeColors().muted;
      // Staff frames note belt: N Europe/NA → AUS/NZ (~18% → ~76%)
      const staffTop = height * 0.18;
      const staffBot = height * 0.76;
      const staffSpan = staffBot - staffTop;
      const staffG = svg
        .append("g")
        .attr("class", "score-staff-watermark")
        .attr("aria-hidden", "true")
        .attr("pointer-events", "none");
      for (let i = 0; i < 5; i++) {
        const y = staffTop + (staffSpan * i) / 4;
        staffG
          .append("line")
          .attr("class", "score-staff-line")
          .attr("x1", 16)
          .attr("x2", width - 16)
          .attr("y1", y)
          .attr("y2", y)
          .attr("stroke", themeColors().ink)
          .attr("stroke-width", 0.7)
          .attr("opacity", 0.42);
      }
      // Compact airy G-clef (Apple Symbols U+1D11E) — smaller, raised to note belt
      // Native path ~30.35×80; spiral optical center ≈ y=48
      const CLEF_NATIVE_H = 80;
      const CLEF_G_LINE_Y = 48;
      const CLEF_PATH =
        'M0 46.24Q0 42.45 1.15 39.28Q2.29 36.11 4.24 33.39Q6.19 30.67 8.8 28.27Q11.41 25.87 14.4 23.52Q13.76 19.95 13.71 15.84Q13.71 8.8 15.84 4.48Q17.97 0 21.65 0Q24.21 0 25.79 2.85Q27.36 5.71 27.36 11.15Q27.36 18.08 23.84 22.93Q22.61 24.59 21.07 26.24Q19.52 27.89 17.55 29.55Q18.4 33.6 19.15 38.19Q24.11 38.19 27.2 41.28Q30.35 44.43 30.35 49.55Q30.35 53.65 28.35 56.59Q26.35 59.52 22.99 60.91Q23.36 63.41 23.55 65.63Q23.73 67.84 23.73 69.87Q23.73 75.2 21.25 77.6Q18.77 80 14.72 80Q10.77 80 8.43 77.71Q6.08 75.36 6.08 72.64Q6.03 70.24 7.39 68.69Q8.75 67.15 10.99 67.15Q13.23 67.15 14.45 68.53Q15.68 69.92 15.68 71.95Q15.68 73.07 15.25 73.95Q14.83 74.83 14.08 75.39Q13.33 75.95 12.37 76.13Q11.41 76.32 10.29 76.05Q11.68 78.08 14.83 78.08Q18.35 78.08 20.13 76Q21.92 73.92 21.92 69.92Q21.92 68.05 21.73 65.97Q21.55 63.89 21.23 61.49Q19.36 61.97 17.28 61.97Q13.55 61.97 10.4 60.96Q7.25 59.95 4.93 57.95Q2.61 55.95 1.31 53.01Q0 50.08 0 46.24ZM19.73 52.16Q19.15 48.21 18.45 44.37Q16 44.37 14.37 45.87Q12.75 47.36 12.75 49.92Q12.75 51.57 13.57 52.85Q14.4 54.13 15.89 54.88Q15.68 55.47 15.52 55.89Q13.12 55.25 11.36 53.23Q9.6 51.2 9.6 47.63Q9.6 43.73 12.37 40.96Q14.51 38.93 17.39 38.35Q16.37 33.07 15.89 30.88Q13.71 32.64 11.65 34.53Q9.6 36.43 8 38.51Q6.4 40.59 5.44 42.93Q4.48 45.28 4.48 48Q4.48 51.04 5.49 53.25Q6.51 55.47 8.29 56.91Q10.08 58.35 12.48 59.04Q14.88 59.73 17.65 59.73Q19.41 59.73 20.85 59.31Q20.27 55.79 19.73 52.16ZM16.37 22.19Q20.53 19.15 22.43 16.24Q24.32 13.33 24.32 10.24Q24.32 8.75 23.63 7.63Q22.93 6.51 21.6 6.51Q19.09 6.51 17.6 10.08Q16.11 13.55 16.11 18.61Q16.11 20.27 16.37 22.19ZM26.72 51.25Q26.72 49.76 26.16 48.48Q25.6 47.2 24.69 46.29Q23.79 45.39 22.61 44.88Q21.44 44.37 20.21 44.37Q20.75 46.88 21.33 50.61Q21.87 54.03 22.51 58.61Q24.8 57.39 25.76 55.31Q26.72 53.23 26.72 51.25Z';
      // Slightly smaller clef; same G-line height; nudged right
      const clefH = staffSpan * 0.82;
      const clefScale = clefH / CLEF_NATIVE_H;
      const gLineY = staffTop + staffSpan * 0.42;
      const clefY = gLineY - CLEF_G_LINE_Y * clefScale;
      const clefX = 24;
      staffG
        .append("path")
        .attr("class", "score-clef-watermark")
        .attr("d", CLEF_PATH)
        .attr(
          "transform",
          `translate(${clefX},${clefY}) scale(${clefScale.toFixed(4)})`
        )
        .attr("fill", themeColors().ink)
        .attr("fill-rule", "nonzero")
        .attr("stroke", "none")
        .attr("opacity", 0.55)
        .attr("pointer-events", "none");
      // Double-barline matched to expanded staff
      const barX = width - 28;
      [0, 3].forEach((dx) => {
        staffG
          .append("line")
          .attr("class", "score-barline")
          .attr("x1", barX + dx)
          .attr("x2", barX + dx)
          .attr("y1", staffTop)
          .attr("y2", staffBot)
          .attr("stroke", muted)
          .attr("stroke-width", 0.7)
          .attr("opacity", 0.2);
      });
    }

    // Ultra-minimal light coastline base under the musical score
    const g = svg.append("g").attr("class", "countries");
    let paths = null;
    if (isDorling) {
      paths = g
        .selectAll("path.country")
        .data(state.lands.features)
        .join("path")
        .attr("class", "country coast-only")
        .attr("d", path)
        .attr("aria-hidden", "true")
        .attr("fill", "#1a243d")
        .attr("stroke", "#3c4f78")
        .attr("stroke-width", 0.8)
        .attr("opacity", 1)
        .attr("pointer-events", "all")
        .on("pointerenter", function (event, d) {
          applyRegionHover(spotlightRegion(d), event, d);
        })
        .on("pointermove", function (event, d) {
          applyRegionHover(spotlightRegion(d), event, d);
        })
        .on("pointerleave", () => applyRegionHover(null));
    } else {
      paths = g
        .selectAll("path.country")
        .data(state.lands.features)
        .join("path")
        .attr("class", "country is-miss")
        .attr("d", path)
        .attr("data-iso3", (d) => d.properties.iso3 || "")
        .on("pointerenter", function (event, d) {
          d3.select(this).classed("is-hover", true);
          showTip(event, d, key);
        })
        .on("pointermove", function (event, d) {
          showTip(event, d, key);
        })
        .on("pointerleave", function () {
          d3.select(this).classed("is-hover", false);
          tooltip.attr("hidden", true);
        })
        .on("click", function (event, d) {
          showTip(event, d, key);
        });
    }

    const hatchG = svg.append("g").attr("class", "hatch-overlay").attr("pointer-events", "none");
    const hatchPaths = hatchG
      .selectAll("path")
      .data(isDorling ? [] : state.lands.features)
      .join("path")
      .attr("d", path)
      .attr("fill", "none")
      .attr("opacity", 0);

    const pulseG = svg.append("g").attr("class", "dorling-nodes");

    if (key === "trends") {
      const [cx, cy] = projection([105, 35]);
      const anno = svg.append("g").attr("class", "map-anno").attr("pointer-events", "none");
      // Quiet-zone callout: faint dashed circle at mainland China centroid
      anno
        .append("circle")
        .attr("cx", cx)
        .attr("cy", cy)
        .attr("r", 18)
        .attr("fill", "none")
        .attr("stroke", themeColors().muted)
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", "3 3")
        .attr("opacity", 0.55);
      anno
        .append("circle")
        .attr("cx", cx)
        .attr("cy", cy)
        .attr("r", 2)
        .attr("fill", themeColors().muted)
        .attr("opacity", 0.45);
      // Keep callout fully inside the SVG (right padding for long label)
      const label = "mainland China — not measured";
      const approxLabelW = label.length * 5.15;
      const lx = Math.min(width - approxLabelW - 18, Math.max(8, cx + 36));
      const ly = Math.max(20, Math.min(height - 24, cy - 36));
      anno
        .append("path")
        .attr("class", "anno-leader")
        .attr("d", `M${cx + 18},${cy - 8} C${cx + 28},${cy - 22} ${lx - 12},${ly} ${lx},${ly}`);
      anno
        .append("text")
        .attr("class", "anno-label")
        .attr("x", lx + 2)
        .attr("y", ly + 3)
        .attr("fill", themeColors().muted)
        .text(label);
    }

    state.maps[key] = {
      svg,
      paths,
      hatchPaths,
      pulseG,
      projection,
      path,
      width,
      height,
      dorling: isDorling,
      constellation: isDorling, // legacy flag for paintMap branch
      hatchId: `hatch-${key}`,
      lowvolPatternId: `dots-lowvol-${key}`,
      dorlingCache: null,
    };
    return state.maps[key];
  }

  function tipKind(mapKey) {
    if (mapKey === "monthly") return "monthly";
    if (mapKey === "creators") return "creators";
    return "trends";
  }

  function showTip(event, feature, mapKey) {
    const iso3 = feature.properties.iso3;
    if (!iso3) {
      tooltip.attr("hidden", true);
      return;
    }
    const kind = tipKind(mapKey);
    let html = `<strong>${countryName(iso3)}</strong>`;
    if (kind === "trends") {
      const row = state.countryV2ByIso.get(iso3);
      if (state.map1Mode === "peak") {
        const series = state.monthly?.series?.own_peak_asmr || {};
        const idx = state.monthIndex ?? (state.monthly?.months || []).length - 1;
        const v = series[iso3]?.[idx];
        const month = state.monthly?.months?.[idx] || "—";
        if (row?.quality === "low_volume") {
          html += `<br>Too few searches to measure`;
        } else if (v == null) {
          html += `<br>No data`;
        } else {
          html += `<br>${month} own-peak: <b>${formatNum(v, 1)}</b>`;
          if (row?.mk_class) html += `<br>MK class: <b>${row.mk_class}</b>`;
        }
      } else if (!row) {
        html += `<br>No data`;
      } else if (row.quality === "low_volume") {
        html += `<br>Too few searches to measure`;
      } else if (row.quality === "ok") {
        const g =
          row.growth_ratio != null && Number.isFinite(row.growth_ratio)
            ? `${(row.growth_ratio * 100).toFixed(1)}%`
            : "—";
        html += `<br>Growth: <b>${g}</b>`;
        html += `<br>MK trend: <b>${row.mk_class || "—"}</b>`;
        html += `<br>First-12m base: <b>${formatNum(row.mean_first_12, 1)}</b>`;
        if (row.small_base) html += `<br>Small base`;
      } else {
        html += `<br>No data`;
      }
    } else if (kind === "creators") {
      const row = state.creatorsByIso.get(iso3);
      const v = state.displayValues.creators[iso3];
      html += `Channels: <b>${formatNum(v, 0)}</b>`;
      if (row) {
        html += `<br>Videos in sample: ${formatNum(row.video_count, 0)}`;
        html += `<br>ASMR share: ${formatNum(row.share_asmr * 100, 1)}%`;
      }
    } else if (kind === "monthly") {
      const v = state.displayValues.monthly[iso3];
      const m = state.monthly.months[state.monthIndex];
      html += `${m} · own-peak ASMR: <b>${formatNum(v, 1)}</b>`;
    }
    tooltip.html(html).attr("hidden", null);
    const pad = 12;
    let x = event.clientX + pad;
    let y = event.clientY + pad;
    const rect = tooltip.node().getBoundingClientRect();
    if (x + rect.width > window.innerWidth - 8) x = event.clientX - rect.width - pad;
    if (y + rect.height > window.innerHeight - 8) y = event.clientY - rect.height - pad;
    tooltip.style("left", `${x}px`).style("top", `${y}px`);
  }

  function paintMap(mapKey, valueMap, scaleInfo) {
    const map = state.maps[mapKey];
    if (!map) return;

    if (map.dorling || map.constellation) {
      paintDorling(map, valueMap);
      return;
    }

    map.paths
      .attr("class", (d) => {
        const iso = d.properties.iso3;
        const row = iso ? state.countryV2ByIso.get(iso) : null;
        const bits = ["country"];
        if (mapKey === "monthly") {
          if (row?.quality === "low_volume") bits.push("is-lowvol");
          else {
            const v = iso ? valueMap[iso] : null;
            if (v == null || !Number.isFinite(v)) bits.push("is-miss");
          }
        } else {
          const v = iso ? valueMap[iso] : null;
          if (v == null || !Number.isFinite(v)) bits.push("is-miss");
        }
        return bits.join(" ");
      })
      .attr("fill", (d) => {
        const iso = d.properties.iso3;
        const row = iso ? state.countryV2ByIso.get(iso) : null;
        if (row?.quality === "low_volume") {
          return `url(#${map.lowvolPatternId})`;
        }
        const v = iso ? valueMap[iso] : null;
        if (v == null || !Number.isFinite(v)) return themeColors().nodata;
        if (scaleInfo.log && v <= 0) return scaleInfo.scale(scaleInfo.domain[0]);
        return scaleInfo.scale(v);
      });
  }

  /** Deterministic hash from ISO3 for musical variety. */
  function hashIso(iso) {
    let h = 2166136261;
    const s = String(iso || "");
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function noteTypeFor(d) {
    if (d.kind === "lowvol") return "rest";
    if (d.kind === "flat") return hashIso(d.iso3) % 2 === 0 ? "whole" : "half";
    // rising / falling / peak — rich musical variety
    const types = ["quarter", "eighth", "sixteenth", "eighth", "quarter", "sixteenth"];
    return types[hashIso(d.iso3) % types.length];
  }

  function noteColor(d, c) {
    if (d.kind === "falling") return c.neg;
    if (d.kind === "flat" || d.kind === "lowvol") return c.muted;
    return c.accent; // rising / peak
  }

  /** Draw crisp SVG vector musical notes (no Unicode glyphs). */
  function drawNoteGlyph(g, type, scale, color, c) {
    g.selectAll("*").remove();
    const s = scale;
    const nhx = 0;
    const nhy = 0;
    const rx = 3.2 * s;
    const ry = 2.35 * s;
    const stemH = 11 * s;
    const stemX = nhx + rx * 0.85;
    const stemTop = nhy - stemH;

    function notehead(filled) {
      g.append("ellipse")
        .attr("cx", nhx)
        .attr("cy", nhy)
        .attr("rx", rx)
        .attr("ry", ry)
        .attr("transform", `rotate(-22 ${nhx} ${nhy})`)
        .attr("fill", filled ? color : "none")
        .attr("stroke", color)
        .attr("stroke-width", Math.max(0.9, 1.1 * s));
    }
    function stem() {
      g.append("line")
        .attr("x1", stemX)
        .attr("y1", nhy - ry * 0.15)
        .attr("x2", stemX)
        .attr("y2", stemTop)
        .attr("stroke", color)
        .attr("stroke-width", Math.max(1, 1.15 * s))
        .attr("stroke-linecap", "round");
    }
    function flag() {
      const d = `M${stemX},${stemTop} C${stemX + 5.5 * s},${stemTop + 1.5 * s} ${stemX + 6.2 * s},${stemTop + 6 * s} ${stemX + 1.2 * s},${stemTop + 8.5 * s}`;
      g.append("path")
        .attr("d", d)
        .attr("fill", "none")
        .attr("stroke", color)
        .attr("stroke-width", Math.max(1, 1.2 * s))
        .attr("stroke-linecap", "round");
    }

    if (type === "rest") {
      g.append("circle")
        .attr("cx", 0)
        .attr("cy", 0)
        .attr("r", Math.max(1.4, 1.8 * s))
        .attr("fill", color)
        .attr("opacity", 0.7);
      return;
    }
    if (type === "whole") {
      notehead(false);
      return;
    }
    if (type === "half") {
      notehead(false);
      stem();
      return;
    }
    if (type === "quarter") {
      notehead(true);
      stem();
      return;
    }
    if (type === "eighth") {
      notehead(true);
      stem();
      flag();
      return;
    }
    if (type === "sixteenth") {
      // Beamed pair of sixteenths
      const gap = 7.2 * s;
      [-gap / 2, gap / 2].forEach((dx, i) => {
        const cx = dx;
        g.append("ellipse")
          .attr("cx", cx)
          .attr("cy", nhy)
          .attr("rx", rx * 0.92)
          .attr("ry", ry * 0.92)
          .attr("transform", `rotate(-22 ${cx} ${nhy})`)
          .attr("fill", color)
          .attr("stroke", color)
          .attr("stroke-width", Math.max(0.8, s));
        const sx = cx + rx * 0.8;
        g.append("line")
          .attr("x1", sx)
          .attr("y1", nhy - ry * 0.1)
          .attr("x2", sx)
          .attr("y2", stemTop)
          .attr("stroke", color)
          .attr("stroke-width", Math.max(1, 1.05 * s));
      });
      const left = -gap / 2 + rx * 0.8;
      const right = gap / 2 + rx * 0.8;
      // double beam
      [0, 2.2 * s].forEach((dy) => {
        g.append("line")
          .attr("x1", left)
          .attr("y1", stemTop + dy)
          .attr("x2", right)
          .attr("y2", stemTop + dy)
          .attr("stroke", color)
          .attr("stroke-width", Math.max(1.2, 1.5 * s))
          .attr("stroke-linecap", "round");
      });
      return;
    }
    notehead(true);
    stem();
  }

  const SCORE_LABEL_ISO = new Set([
    "USA", "JPN", "KOR", "TWN", "HKG", "GBR", "DEU", "FRA", "BRA", "AUS",
    "CAN", "IDN", "THA", "IND", "MEX", "ESP", "ITA", "NLD", "SGP", "PHL",
    "VNM", "MYS", "ARG", "CHL", "COL", "POL", "SWE", "NOR", "NZL", "ZAF",
  ]);

  /** World Acoustic Score — SVG musical notes on a light coastline base. */
  function paintDorling(map, valueMap, opts = {}) {
    const c = themeColors();
    const mode = state.map1Mode || "growth";
    const peakSeries = state.monthly?.series?.own_peak_asmr || {};
    const peakIdx =
      mode === "peak"
        ? state.monthIndex ?? (state.monthly?.months || []).length - 1
        : (state.monthly?.months || []).length - 1;
    const reuse = !!(opts.reuseLayout && map.dorlingPositions);

    let nodes = [];
    if (reuse) {
      nodes = (map.dorlingCache || [])
        .map((prev) => {
          const row = prev.row;
          const iso = prev.iso3;
          let r = prev.r;
          let kind = prev.kind;
          let value = prev.value;
          let labelPct = prev.labelPct;
          if (mode === "peak") {
            const v = peakSeries[iso]?.[peakIdx];
            if (row.quality === "low_volume") {
              kind = "lowvol";
              r = 2.4;
              value = null;
              labelPct = null;
            } else if (v == null || !Number.isFinite(v)) {
              kind = "miss";
              r = 0;
              value = null;
              labelPct = null;
            } else {
              kind = "peak";
              value = v;
              r = 3.2 + 18 * Math.sqrt(Math.max(0, v) / 100);
              labelPct = v;
            }
          }
          const pos = map.dorlingPositions.get(iso) || { x: prev.x, y: prev.y };
          return { ...prev, x: pos.x, y: pos.y, r, kind, value, labelPct };
        })
        .filter((d) => d.kind !== "miss" && d.r > 0);
    } else {
      const seenIso = new Set();
      state.lands.features.forEach((f) => {
        const iso = f.properties.iso3;
        if (!iso) return;
        const row = state.countryV2ByIso.get(iso);
        if (!row) return;
        const pt = map.path.centroid(f);
        if (!pt || !Number.isFinite(pt[0]) || !Number.isFinite(pt[1])) return;

        let r = 0;
        let kind = "miss";
        let labelPct = null;
        let value = null;

        if (row.quality === "low_volume") {
          r = 2.4;
          kind = "lowvol";
        } else if (mode === "peak") {
          const v = peakSeries[iso]?.[peakIdx];
          if (v == null || !Number.isFinite(v)) {
            kind = "miss";
            r = 0;
          } else {
            kind = "peak";
            value = v;
            r = 3.2 + 18 * Math.sqrt(Math.max(0, v) / 100);
            labelPct = v;
          }
        } else if (row.quality === "ok") {
          const g =
            row.growth_ratio_clipped != null ? row.growth_ratio_clipped : row.growth_ratio;
          if (g == null || !Number.isFinite(g)) {
            kind = "miss";
            r = 0;
          } else {
            value = g;
            const a = Math.abs(g);
            r = 3.2 + 20 * Math.sqrt(Math.min(1.5, a) / 1.5);
            kind = row.mk_class || "flat";
            labelPct = g * 100;
          }
        } else {
          kind = "miss";
          r = 0;
        }

        if (kind === "miss") return;
        if (seenIso.has(iso)) return; // one note + one label per country
        seenIso.add(iso);
        nodes.push({
          iso3: iso,
          feature: f,
          row,
          region: spotlightRegion(f),
          x: pt[0],
          y: pt[1],
          x0: pt[0],
          y0: pt[1],
          r,
          kind,
          value,
          labelPct,
          noteType: null,
        });
      });

      // Collision-free Dorling layout (extra pad for stems/flags)
      const sim = d3
        .forceSimulation(nodes)
        .force("x", d3.forceX((d) => d.x0).strength(0.72))
        .force("y", d3.forceY((d) => d.y0).strength(0.72))
        .force("collide", d3.forceCollide((d) => d.r + 3.4).iterations(3))
        .stop();
      for (let i = 0; i < 160; i++) sim.tick();

      nodes.forEach((d) => {
        d.x = Math.max(d.r + 10, Math.min(map.width - d.r - 10, d.x));
        d.y = Math.max(d.r + 14, Math.min(map.height - d.r - 8, d.y));
      });
      map.dorlingPositions = new Map(nodes.map((d) => [d.iso3, { x: d.x, y: d.y }]));
    }

    nodes.forEach((d) => {
      d.noteType = noteTypeFor(d);
      d.scale = Math.max(0.55, d.r / 9);
    });

    map.dorlingCache = nodes;
    const filter = state.map1Filter || "all";
    const animatePeak =
      mode === "peak" &&
      !!opts.animate &&
      !prefersReducedMotion() &&
      reuse;
    if (!map.prevPeakScales) map.prevPeakScales = new Map();
    if (!map.prevPeakOps) map.prevPeakOps = new Map();

    // Which notes get external ISO3+% labels
    const byAbs = nodes
      .filter((d) => d.kind !== "lowvol" && d.labelPct != null)
      .slice()
      .sort((a, b) => Math.abs(b.labelPct) - Math.abs(a.labelPct));
    const labelSet = new Set(
      byAbs.slice(0, 18).map((d) => d.iso3).concat([...SCORE_LABEL_ISO])
    );

    const sel = map.pulseG
      .selectAll("g.dorling-node")
      .data(nodes, (d) => d.iso3)
      .join((enter) => {
        const g = enter.append("g").attr("class", "dorling-node score-note");
        g.append("circle").attr("class", "dorling-hover-ring");
        g.append("circle").attr("class", "dorling-focus-ring");
        g.append("circle").attr("class", "peak-halo");
        g.append("circle").attr("class", "dorling-orbit");
        g.append("g").attr("class", "note-glyph");
        g.append("text").attr("class", "dorling-label score-label");
        g.append("circle").attr("class", "dorling-hit").attr("fill", "transparent");
        return g;
      });

    sel.attr("transform", (d) => `translate(${d.x},${d.y})`);

    // First pass: draw glyphs (smooth scale/opacity tween in peak playback)
    sel.each(function (d) {
      const g = d3.select(this);
      const color = noteColor(d, c);
      const match = nodeMatchesFilter(d, filter);
      g.attr("opacity", match ? 1 : 0.18);

      const orbit = g.select(".dorling-orbit");
      const hoverRing = g.select(".dorling-hover-ring");
      const focusRing = g.select(".dorling-focus-ring");
      const halo = g.select(".peak-halo");
      const glyph = g.select(".note-glyph");
      const hit = g.select(".dorling-hit");

      drawNoteGlyph(glyph, d.noteType, d.scale, color, c);

      // Peak: opacity tracks monthly value (0.25→1.0); soft halo above 75
      let targetOp = 1;
      if (d.kind === "peak") {
        const v = Math.max(0, Math.min(100, d.value || 0));
        targetOp = 0.25 + 0.75 * (v / 100);
        if (v >= 75) {
          halo
            .attr("r", d.r + 5)
            .attr("fill", color)
            .attr("stroke", "none")
            .attr("pointer-events", "none");
          const haloOp = 0.08 + 0.14 * ((v - 75) / 25);
          if (animatePeak) {
            halo
              .transition()
              .duration(MAP1_NOTE_TWEEN_MS)
              .ease(d3.easeCubicInOut)
              .attr("opacity", haloOp);
          } else {
            halo.attr("opacity", haloOp);
          }
        } else {
          halo.interrupt().attr("r", 0).attr("opacity", 0);
        }
      } else {
        halo.interrupt().attr("r", 0).attr("opacity", 0);
      }

      glyph.interrupt();
      if (animatePeak && d.kind === "peak") {
        const prevS = map.prevPeakScales.get(d.iso3);
        const prevO = map.prevPeakOps.get(d.iso3);
        const fromRatio =
          prevS != null && d.scale > 0.01 ? prevS / d.scale : 1;
        glyph
          .attr("transform", `scale(${fromRatio})`)
          .attr("opacity", prevO != null ? prevO : targetOp);
        glyph
          .transition()
          .duration(MAP1_NOTE_TWEEN_MS)
          .ease(d3.easeCubicInOut)
          .attr("transform", "scale(1)")
          .attr("opacity", targetOp);
      } else {
        glyph.attr("transform", null).attr("opacity", targetOp);
      }
      map.prevPeakScales.set(d.iso3, d.scale);
      map.prevPeakOps.set(d.iso3, targetOp);

      orbit.attr("r", 0).attr("fill", "none").attr("stroke", "none");
      if (d.row.small_base && d.kind !== "lowvol") {
        orbit
          .attr("r", d.r + 5)
          .attr("fill", "none")
          .attr("stroke", color)
          .attr("stroke-width", 1)
          .attr("stroke-dasharray", "2.5 2")
          .attr("opacity", 0.75);
      }

      hoverRing
        .attr("r", d.r + 7)
        .attr("fill", "none")
        .attr("stroke", c.accent)
        .attr("stroke-width", 1.3)
        .attr("opacity", 0);
      focusRing
        .attr("r", match && filter !== "all" ? d.r + 4.5 : 0)
        .attr("fill", "none")
        .attr("stroke", c.ink)
        .attr("stroke-width", 1)
        .attr("opacity", match && filter !== "all" ? 0.5 : 0);

      hit
        .attr("r", d.r + 8)
        .attr("pointer-events", "all")
        .attr("cursor", "pointer")
        .on("pointerenter", (event) => {
          hoverRing.attr("opacity", 0.9).attr("r", d.r + 9);
          applyRegionHover(d.region, event);
          showTip(event, d.feature, "trends");
        })
        .on("pointermove", (event) => {
          applyRegionHover(d.region, event);
          showTip(event, d.feature, "trends");
        })
        .on("pointerleave", () => {
          hoverRing.attr("opacity", 0).attr("r", d.r + 7);
          applyRegionHover(null);
          tooltip.attr("hidden", true);
        })
        .on("click", (event) => showTip(event, d.feature, "trends"));
    });

    if (mode === "peak" && opts.animate && !prefersReducedMotion()) {
      emitPeakRipples(map, nodes, c.accent);
    } else if (mode !== "peak") {
      clearPeakRipples(map);
      state.map1PrevPeak = {};
    }

    // Collision-aware external labels — keep close to each note's own centroid
    const placed = [];
    const labeledIso = new Set();
    // Prefer short offsets so labels never drift to another region (e.g. AUS→IDN)
    const candidatesRight = [
      [9, -5], [11, 5], [8, -12], [14, 0], [6, 10],
    ];
    const candidatesLeft = [
      [-9, -5], [-11, 5], [-8, -12], [-14, 0], [-6, 10],
    ];

    function overlaps(box, list) {
      return list.some(
        (b) =>
          !(
            box.x2 < b.x1 ||
            box.x1 > b.x2 ||
            box.y2 < b.y1 ||
            box.y1 > b.y2
          )
      );
    }

    // Stable order: larger notes first so major countries keep near-centroid labels
    const labelNodes = nodes
      .slice()
      .filter((d) => labelSet.has(d.iso3) && d.labelPct != null && d.kind !== "lowvol")
      .sort((a, b) => b.r - a.r);

    labelNodes.forEach((d) => {
      if (labeledIso.has(d.iso3)) return;
      if (!nodeMatchesFilter(d, filter) && filter !== "all") return;

      const g = sel.filter((n) => n.iso3 === d.iso3);
      const label = g.select(".dorling-label");
      label.text("");

      const pct =
        mode === "peak"
          ? `${formatNum(d.labelPct, 0)}`
          : `${d.labelPct >= 0 ? "+" : ""}${d.labelPct.toFixed(0)}%`;
      const text = `${d.iso3} ${pct}`;
      const approxW = text.length * 5.2;
      const approxH = 11;
      const preferLeft = d.x > map.width * 0.72; // right-edge countries label inward
      const candidates = preferLeft ? candidatesLeft : candidatesRight;

      let chosen = null;
      for (const [dx, dy] of candidates) {
        const endAnchor = dx < 0;
        const box = endAnchor
          ? {
              x1: d.x + dx - approxW,
              y1: d.y + dy - approxH,
              x2: d.x + dx + 2,
              y2: d.y + dy + 2,
            }
          : {
              x1: d.x + dx - 2,
              y1: d.y + dy - approxH,
              x2: d.x + dx + approxW,
              y2: d.y + dy + 2,
            };
        // keep inside map with right padding for long labels
        if (box.x1 < 10 || box.x2 > map.width - 18 || box.y1 < 10 || box.y2 > map.height - 10) {
          continue;
        }
        const noteBox = {
          x1: d.x - d.r - 2,
          y1: d.y - d.r - 10,
          x2: d.x + d.r + 6,
          y2: d.y + d.r + 4,
        };
        if (overlaps(box, [noteBox])) continue;
        if (overlaps(box, placed)) continue;
        chosen = { dx, dy, box, endAnchor };
        break;
      }
      if (!chosen) return;
      placed.push(chosen.box);
      labeledIso.add(d.iso3);
      label
        .attr("x", chosen.dx)
        .attr("y", chosen.dy)
        .attr("text-anchor", chosen.endAnchor ? "end" : "start")
        .attr("font-size", 9)
        .attr("font-variant-numeric", "tabular-nums")
        .attr("font-weight", 500)
        .attr("fill", c.ink)
        .attr("pointer-events", "none")
        .text(text);
    });

    // Clear labels on nodes that were not labeled this pass
    sel.each(function (d) {
      if (!labeledIso.has(d.iso3)) {
        d3.select(this).select(".dorling-label").text("");
      }
    });

    if (mode !== "peak") armScoreEntrance(map);
  }

  function armScoreEntrance(map) {
    if (map.scoreEntrance === "done" || map.scoreEntrance === "playing") return;
    const svg = map.svg.node();
    const mount = svg.closest(".story-scene") || svg.parentElement;
    const staff = [...svg.querySelectorAll(".score-staff-line")];
    const clef = svg.querySelector(".score-clef-watermark");
    const barlines = [...svg.querySelectorAll(".score-barline")];
    const coasts = [...svg.querySelectorAll("path.country")];
    const anno = svg.querySelector(".map-anno");
    const kpis = document.querySelector("#scrolly-1 > .story-kpis");
    const gsap = window.gsap;
    if (gsap) {
      staff.forEach((line) => {
        const len = Math.abs(+line.getAttribute("x2") - +line.getAttribute("x1")) || 1;
        line.setAttribute("stroke-dasharray", String(len));
        line.setAttribute("stroke-dashoffset", String(len));
      });
      if (clef) clef.dataset.op = clef.getAttribute("opacity") || "0.55";
      barlines.forEach((el) => {
        el.dataset.op = el.getAttribute("opacity") || "0.2";
      });
      if (clef) gsap.set(clef, { opacity: 0 });
      gsap.set(barlines, { opacity: 0 });
      gsap.set(coasts, { opacity: 0 });
      if (anno) gsap.set(anno, { opacity: 0 });
      svg.querySelectorAll("g.dorling-node").forEach((node) => {
        const glyph = node.querySelector(".note-glyph");
        const label = node.querySelector(".dorling-label");
        if (glyph) gsap.set(glyph, { opacity: 0, y: 8, scale: 0.45, transformOrigin: "50% 50%" });
        if (label) gsap.set(label, { opacity: 0 });
      });
    }
    if (map.scoreEntrance === "armed") return;
    map.scoreEntrance = "armed";
    const played = onSceneEnter(mount, (tween) => {
      map.scoreEntrance = "playing";
      const NS = "http://www.w3.org/2000/svg";
      const notes = [...svg.querySelectorAll("g.dorling-node")]
        .map((node) => ({
          node,
          d: node.__data__,
          x: node.__data__ ? node.__data__.x : 0,
          glyph: node.querySelector(".note-glyph"),
          shown: false,
        }))
        .sort((a, b) => a.x - b.x);
      const labels = [...svg.querySelectorAll(".dorling-label")];
      const left = Math.max(16, (notes.length ? notes[0].x : 24) - 18);
      const bar = barlines[0];
      const right = bar ? +bar.getAttribute("x1") : (map.width || 800) - 28;
      const staffYs = staff.map((line) => +line.getAttribute("y1")).filter((y) => Number.isFinite(y));
      const beamTop = staffYs.length ? Math.min(...staffYs) : 24;
      const beamBot = staffYs.length ? Math.max(...staffYs) : (map.height || 400) - 24;

      let defs = svg.querySelector("defs");
      if (!defs) {
        defs = document.createElementNS(NS, "defs");
        svg.insertBefore(defs, svg.firstChild);
      }
      if (!svg.querySelector("#score-playhead-glow")) {
        const filter = document.createElementNS(NS, "filter");
        filter.setAttribute("id", "score-playhead-glow");
        filter.setAttribute("x", "-40%");
        filter.setAttribute("y", "-8%");
        filter.setAttribute("width", "180%");
        filter.setAttribute("height", "116%");
        const blur = document.createElementNS(NS, "feGaussianBlur");
        blur.setAttribute("stdDeviation", "2.2");
        blur.setAttribute("result", "b");
        const merge = document.createElementNS(NS, "feMerge");
        merge.innerHTML = '<feMergeNode in="b"/><feMergeNode in="SourceGraphic"/>';
        filter.append(blur, merge);
        defs.appendChild(filter);
      }
      const beam = document.createElementNS(NS, "line");
      beam.setAttribute("class", "score-playhead");
      beam.setAttribute("x1", String(left));
      beam.setAttribute("x2", String(left));
      beam.setAttribute("y1", String(beamTop));
      beam.setAttribute("y2", String(beamBot));
      beam.setAttribute("stroke", "#f4a259");
      beam.setAttribute("stroke-width", "1.2");
      beam.setAttribute("stroke-linecap", "round");
      beam.setAttribute("filter", "url(#score-playhead-glow)");
      beam.setAttribute("pointer-events", "none");
      svg.appendChild(beam);

      function spring(note) {
        if (!note.glyph || note.shown) return;
        note.shown = true;
        tween.fromTo(note.glyph, { opacity: 0, scale: 0.45, y: 8 }, {
          keyframes: [
            { opacity: 1, scale: 1.14, y: -3, duration: 0.28, ease: "power2.out" },
            { scale: 1, y: 0, duration: 0.16, ease: "power1.out" },
          ],
          transformOrigin: "50% 50%",
          overwrite: "auto",
          onComplete() {
            note.glyph.setAttribute("opacity", "1");
            note.glyph.style.opacity = "";
            note.glyph.style.transform = "";
          },
        });
        const row = note.d && note.d.row;
        if (!row || row.mk_class !== "rising") return;
        const startR = Math.max(4, note.d.r || 4);
        const ripple = document.createElementNS(NS, "circle");
        ripple.setAttribute("class", "note-ripple");
        ripple.setAttribute("cx", "0");
        ripple.setAttribute("cy", "0");
        ripple.setAttribute("r", String(startR));
        ripple.setAttribute("fill", "none");
        ripple.setAttribute("stroke", "#f4a259");
        ripple.setAttribute("stroke-width", "0.8");
        ripple.setAttribute("stroke-opacity", "0.45");
        ripple.setAttribute("pointer-events", "none");
        note.node.insertBefore(ripple, note.node.firstChild);
        tween.to(ripple, {
          attr: { r: startR + 14 },
          strokeOpacity: 0,
          duration: 0.55,
          ease: "power1.out",
          overwrite: "auto",
          onComplete() { ripple.remove(); },
        });
      }

      let cursor = 0;
      function release(beamX) {
        while (cursor < notes.length && notes[cursor].x <= beamX + 0.5) {
          spring(notes[cursor]);
          cursor += 1;
        }
      }

      if (kpis) {
        kpis.dataset.scoreHold = "1";
        tween.set(kpis, { opacity: 0 });
      }
      const tl = tween.timeline({
        onComplete() { map.scoreEntrance = "done"; },
      });
      if (clef) tl.to(clef, { opacity: 0.15, duration: 0.4, ease: "power1.out" }, 0);
      tl.to(staff, {
        attr: { "stroke-dashoffset": 0 },
        duration: 0.38,
        stagger: 0.055,
        ease: "power1.out",
      }, 0);
      tl.to(barlines, {
        opacity: (i, el) => +el.dataset.op || 0.2,
        duration: 0.45,
        ease: "power1.out",
        clearProps: "opacity",
      }, 0.08);
      tl.to(coasts, { opacity: 1, duration: 0.5, ease: "power1.out", clearProps: "opacity" }, 0.05);
      const head = { x: left };
      tl.to(head, {
        x: right,
        duration: 1.1,
        ease: "none",
        onUpdate() {
          const x = head.x.toFixed(1);
          beam.setAttribute("x1", x);
          beam.setAttribute("x2", x);
          release(head.x);
        },
        onComplete() { release(1e9); },
      }, 0.42);
      tl.to(beam, {
        opacity: 0,
        duration: 0.28,
        onComplete() { beam.remove(); },
      }, 1.55);
      tl.to(labels, { opacity: 1, duration: 0.4, clearProps: "opacity" }, 1.55);
      if (anno) tl.to(anno, { opacity: 1, duration: 0.4, clearProps: "opacity" }, 1.55);
      if (kpis) {
        tl.to(kpis, {
          opacity: 1,
          duration: 0.4,
          onComplete() { delete kpis.dataset.scoreHold; },
        }, 1.55);
      }
      if (clef) {
        tl.to(clef, {
          opacity: +clef.dataset.op || 0.55,
          duration: 0.35,
          clearProps: "opacity",
        }, 1.55);
      }
    });
    if (!played) {
      if (gsap) {
        staff.forEach((line) => line.setAttribute("stroke-dashoffset", "0"));
        const reset = [...barlines, ...coasts, ...svg.querySelectorAll(".note-glyph, .dorling-label")];
        if (clef) reset.push(clef);
        if (anno) reset.push(anno);
        gsap.set(reset, { clearProps: "opacity,transform,scale,y" });
      }
      if (kpis) delete kpis.dataset.scoreHold;
      svg.querySelectorAll(".score-playhead, .note-ripple").forEach((el) => el.remove());
      map.scoreEntrance = "done";
    }
  }

  function collectTrendsValues() {
    const out = {};
    state.countryV2ByIso.forEach((row, iso) => {
      const v = growthPctForColour(row);
      if (v != null && Number.isFinite(v)) out[iso] = v;
    });
    return out;
  }

  function collectCreatorValues() {
    const out = {};
    state.creatorsByIso.forEach((row, iso) => {
      out[iso] = row.channel_count;
    });
    return out;
  }

  function updateMap1Caption() {
    const el = document.getElementById("trends-map-caption");
    if (!el) return;
    const cap = state.trendsMeta?.map1_caption;
    el.textContent = cap || "";
  }

  function collectMonthlyValues(idx, fromMap) {
    const out = {};
    const series = state.monthly.series.own_peak_asmr || {};
    Object.keys(series).forEach((iso) => {
      if (fromMap && fromMap[iso] != null) {
        out[iso] = fromMap[iso];
        return;
      }
      const v = series[iso][idx];
      if (v != null) out[iso] = v;
    });
    return out;
  }

  function updateStage1(opts = {}) {
    state.layerMode = "trends";
    const panels = document.getElementById("map-panels-1");
    if (!panels) return;
    const trendsPanel = panels.querySelector('[data-panel="trends"]');
    const creatorsPanel = panels.querySelector('[data-panel="creators"]');
    const titleEl = document.getElementById("trends-panel-title");
    const peakChrome = document.getElementById("map1-peak-controls");

    panels.classList.toggle("is-compare", false);
    if (trendsPanel) trendsPanel.classList.remove("is-hidden");
    if (creatorsPanel) creatorsPanel.classList.add("is-hidden");

    const peakMode = state.map1Mode === "peak";
    if (peakChrome) {
      peakChrome.hidden = !peakMode;
      peakChrome.style.display = peakMode ? "" : "none";
    }
    if (!peakMode) stopMap1Play();

    const peakLabel =
      state.monthlyMeta?.map2_caption ||
      "ASMR relative to each country's own 60-month peak";
    if (titleEl) {
      titleEl.textContent = peakMode ? peakLabel : GROWTH_LABEL;
    }

    if (peakMode && state.monthly?.months) {
      const scrub = document.getElementById("map1-month-scrubber");
      const lab = document.getElementById("map1-month-label");
      if (scrub) {
        scrub.max = String(state.monthly.months.length - 1);
        scrub.value = String(state.monthIndex);
      }
      if (lab) lab.textContent = state.monthly.months[state.monthIndex] || "—";
    }

    state.displayValues.trends = peakMode
      ? collectPeakValues(state.monthIndex)
      : collectTrendsValues();
    state.displayValues.creators = {};

    const tScale = peakMode
      ? {
          scale: d3.scaleSequential(colorSeq).domain([0, 100]).clamp(true),
          domain: [0, 100],
          log: false,
          diverging: false,
        }
      : {
          scale: d3
            .scaleSequential((t) => colorDiv(1 - t))
            .domain(GROWTH_DOMAIN_PCT)
            .clamp(true),
          domain: GROWTH_DOMAIN_PCT.slice(),
          log: false,
          diverging: true,
        };

    if (!state.maps.trends) return;
    const reuse = !!(peakMode && opts.reuseLayout && state.maps.trends.dorlingPositions);
    if (peakMode && !opts.animate) {
      // Seed crest detector so Play doesn't fire a ripple storm on start
      state.map1PrevPeak = { ...state.displayValues.trends };
    }
    paintDorling(state.maps.trends, state.displayValues.trends, {
      reuseLayout: reuse,
      animate: !!(peakMode && opts.animate),
    });
    drawLegend(
      document.getElementById("legend-trends"),
      tScale,
      peakMode ? "60-month peak" : GROWTH_LABEL,
      {
        map1Full: !peakMode,
        showMiss: peakMode,
        showLowVolume: peakMode && anyLowVolumeFlag(),
        growthTicks: peakMode ? null : [-50, 0, 50, 150],
      }
    );
    updateMap1Caption();
    if (!opts.skipTable) renderTrendsTable();
  }

  function collectPeakValues(idx) {
    const out = {};
    const i =
      idx != null ? idx : (state.monthly?.months || []).length - 1;
    const series = state.monthly?.series?.own_peak_asmr || {};
    Object.keys(series).forEach((iso) => {
      const v = series[iso][i];
      if (v != null && Number.isFinite(v)) out[iso] = v;
    });
    return out;
  }

  function renderTrendsTable() {
    const host = document.getElementById("trends-table-host");
    if (host) host.replaceChildren();
    return;
    const rows = [];
    state.countryV2ByIso.forEach((row) => {
      rows.push([
        row.name || row.iso3,
        row.iso3,
        row.growth_ratio != null ? (row.growth_ratio * 100).toFixed(1) + "%" : "—",
        row.mk_class || "—",
        row.mean_first_12 != null ? formatNum(row.mean_first_12, 1) : "—",
        row.state || row.quality || "—",
        row.small_base ? "yes" : "",
      ]);
    });
    (state.undrawableGeos || []).forEach((g) => {
      rows.push([
        g.name || g.iso3 || g.geo,
        g.iso3 || g.geo || "—",
        "—",
        "—",
        "—",
        "not on map",
        "",
      ]);
    });
    rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    attachTableToggle(host, () => ({
      columns: ["region", "iso3", "growth", "mk_class", "mean_first_12", "state", "small_base"],
      rows,
    }));
  }

  function updateStage2(immediate) {
    const month = state.monthly.months[state.monthIndex];
    document.getElementById("month-label").textContent = month;
    document.getElementById("month-scrubber").value = String(state.monthIndex);

    const target = collectMonthlyValues(state.monthIndex);
    // Fixed 0–100 domain: own_peak_series
    const fixed = {
      scale: d3.scaleSequential(colorSeq).domain([0, 100]).clamp(true),
      domain: [0, 100],
      log: false,
    };

    if (
      immediate ||
      prefersReducedMotion() ||
      !state.displayValues.monthly ||
      !Object.keys(state.displayValues.monthly).length
    ) {
      if (state.tween) state.tween.kill();
      state.displayValues.monthly = target;
      paintMap("monthly", state.displayValues.monthly, fixed);
      const cap =
        state.monthlyMeta?.map2_caption ||
        state.trendsMeta?.map2_caption ||
        "each region relative to its own peak";
      const capEl = document.getElementById("month-caption");
      if (capEl) capEl.textContent = cap;
      drawLegend(
        document.getElementById("legend-monthly"),
        fixed,
        cap,
        { showMiss: true, showLowVolume: anyLowVolumeFlag() }
      );
      return;
    }

    if (state.tween) {
      cancelAnimationFrame(state.tween);
      state.tween = null;
    }
    const from = { ...state.displayValues.monthly };
    const t0 = performance.now();
    const dur = prefersReducedMotion() ? 0 : 450;
    const step = (now) => {
      const t = dur <= 0 ? 1 : Math.min(1, (now - t0) / dur);
      const eased = t * (2 - t);
      const blended = {};
      const isos = new Set([...Object.keys(from), ...Object.keys(target)]);
      isos.forEach((iso) => {
        const a = from[iso];
        const b = target[iso];
        if (a == null && b == null) return;
        if (a == null) blended[iso] = b;
        else if (b == null) blended[iso] = a;
        else blended[iso] = a + (b - a) * eased;
      });
      state.displayValues.monthly = blended;
      paintMap("monthly", blended, fixed);
      if (t < 1) state.tween = requestAnimationFrame(step);
      else {
        state.tween = null;
        state.displayValues.monthly = target;
        paintMap("monthly", target, fixed);
      }
    };
    state.tween = requestAnimationFrame(step);
    drawLegend(
      document.getElementById("legend-monthly"),
      fixed,
      "Relative to each country's own peak",
      { showMiss: true }
    );
  }

  let map1PlayTimer = null;

  function map1PlayDelay() {
    if (prefersReducedMotion()) return 900;
    const sp = state.map1PlaySpeed === 2 ? 2 : 1;
    return MAP1_PLAY_MS[sp] || MAP1_PLAY_MS[1];
  }

  function ensureRippleLayer(map) {
    if (!map.rippleG && map.svg) {
      map.rippleG = map.svg
        .append("g")
        .attr("class", "peak-ripples")
        .attr("pointer-events", "none");
    }
    return map.rippleG;
  }

  function clearPeakRipples(map) {
    if (!map?.rippleG) return;
    map.rippleG.selectAll("circle.peak-ripple").interrupt().remove();
  }

  /** Delicate expanding rings on peak crests / ≥85 crossings during playback. */
  function emitPeakRipples(map, nodes, accent) {
    if (!state.map1Playing || prefersReducedMotion()) return;
    const layer = ensureRippleLayer(map);
    if (!layer) return;
    const series = state.monthly?.series?.own_peak_asmr || {};
    const idx = state.monthIndex ?? 0;
    const prevMap = state.map1PrevPeak || {};
    const nextPrev = { ...prevMap };

    nodes.forEach((d) => {
      if (d.kind !== "peak" || d.value == null) return;
      const v = d.value;
      const arr = series[d.iso3];
      const prev = prevMap[d.iso3];
      const next = arr && idx < arr.length - 1 ? arr[idx + 1] : null;
      const crossed85 = prev != null && prev < 85 && v >= 85;
      const hot = v >= 85;
      const localCrest =
        prev != null &&
        next != null &&
        v >= prev &&
        v >= next &&
        v >= 55;
      if (!(crossed85 || (hot && (prev == null || v >= prev)) || localCrest)) {
        nextPrev[d.iso3] = v;
        return;
      }
      // Avoid re-firing every frame on sustained ≥85 — only on rise or crest
      if (hot && !crossed85 && !localCrest && prev != null && v <= prev + 0.01) {
        nextPrev[d.iso3] = v;
        return;
      }

      while (layer.selectAll("circle.peak-ripple").size() >= MAP1_RIPPLE_MAX) {
        layer.select("circle.peak-ripple").interrupt().remove();
      }
      const grow = 18 + ((hashIso(d.iso3) % 7) / 6) * 6;
      layer
        .append("circle")
        .attr("class", "peak-ripple")
        .attr("cx", d.x)
        .attr("cy", d.y)
        .attr("r", Math.max(3, d.r * 0.35))
        .attr("fill", "none")
        .attr("stroke", accent)
        .attr("stroke-width", 1)
        .attr("opacity", 0.55)
        .attr("pointer-events", "none")
        .transition()
        .duration(MAP1_RIPPLE_MS)
        .ease(d3.easeCubicOut)
        .attr("r", Math.max(3, d.r * 0.35) + grow)
        .attr("opacity", 0)
        .on("end", function () {
          d3.select(this).remove();
        });
      nextPrev[d.iso3] = v;
    });
    state.map1PrevPeak = nextPrev;
  }

  function startMap1Play() {
    if (!state.monthly?.months?.length) return;
    state.map1Playing = true;
    const btn = document.getElementById("map1-play-btn");
    if (btn) {
      btn.classList.add("is-playing");
      btn.textContent = "Pause";
      btn.setAttribute("aria-pressed", "true");
      btn.setAttribute("aria-label", "Pause");
    }
    if (map1PlayTimer) clearInterval(map1PlayTimer);
    const delay = map1PlayDelay();
    map1PlayTimer = setInterval(() => {
      state.monthIndex = (state.monthIndex + 1) % state.monthly.months.length;
      updateStage1({ reuseLayout: true, skipTable: true, animate: true });
    }, delay);
  }
  function stopMap1Play() {
    state.map1Playing = false;
    const btn = document.getElementById("map1-play-btn");
    if (btn) {
      btn.classList.remove("is-playing");
      btn.textContent = "Play";
      btn.setAttribute("aria-pressed", "false");
      btn.setAttribute("aria-label", "Play");
    }
    if (map1PlayTimer) clearInterval(map1PlayTimer);
    map1PlayTimer = null;
    if (state.maps.trends) clearPeakRipples(state.maps.trends);
  }

  function wireControls() {
    document.querySelectorAll("#map1-mode button").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#map1-mode button").forEach((b) => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        state.map1Mode = btn.dataset.mode || "growth";
        if (state.map1Mode === "peak" && state.monthly?.months) {
          // start at first month so play visibly pulses forward
          state.monthIndex = 0;
          // seed layout from growth radii then switch
        }
        // Force fresh layout when switching modes
        if (state.maps.trends) state.maps.trends.dorlingPositions = null;
        updateStage1({ reuseLayout: false });
      });
    });

    document.querySelectorAll("#map1-filter button").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#map1-filter button").forEach((b) => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        state.map1Filter = btn.dataset.filter || "all";
        updateStage1({ reuseLayout: true, skipTable: true });
      });
    });

    const map1Scrub = document.getElementById("map1-month-scrubber");
    if (map1Scrub) {
      map1Scrub.addEventListener("input", () => {
        stopMap1Play();
        state.monthIndex = +map1Scrub.value;
        updateStage1({ reuseLayout: true, skipTable: true });
      });
    }
    const map1Play = document.getElementById("map1-play-btn");
    if (map1Play) {
      map1Play.addEventListener("click", () => {
        if (state.map1Playing) stopMap1Play();
        else startMap1Play();
      });
    }

    document.querySelectorAll("#map1-speed button").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#map1-speed button").forEach((b) => {
          b.classList.remove("is-active");
          b.setAttribute("aria-pressed", "false");
        });
        btn.classList.add("is-active");
        btn.setAttribute("aria-pressed", "true");
        state.map1PlaySpeed = btn.dataset.speed === "2" ? 2 : 1;
        if (state.map1Playing) startMap1Play(); // restart interval at new speed
      });
    });

    document.querySelectorAll("#layer-mode button").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#layer-mode button").forEach((b) => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        state.layerMode = btn.dataset.mode;
        updateStage1();
      });
    });

    const scrubber = document.getElementById("month-scrubber");
    if (scrubber && state.monthly?.months) {
      scrubber.max = String(state.monthly.months.length - 1);
      state.monthIndex = 0;
      scrubber.value = String(state.monthIndex);
      scrubber.removeAttribute("readonly");
      scrubber.readOnly = false;
      scrubber.setAttribute("aria-readonly", "false");
      scrubber.addEventListener("input", () => {
        stopPlay();
        state.monthIndex = +scrubber.value;
        updateStage2(false);
      });
    }

    const playBtn = document.getElementById("play-btn");
    if (playBtn) {
      playBtn.addEventListener("click", () => {
        if (state.playing) stopPlay();
        else startPlay();
      });
    }
  }

  let playTimer = null;
  function startPlay() {
    state.playing = true;
    const btn = document.getElementById("play-btn");
    if (!btn) return;
    btn.classList.add("is-playing");
    btn.textContent = "Pause";
    btn.setAttribute("aria-pressed", "true");
    btn.setAttribute("aria-label", "Pause");
    const delay = prefersReducedMotion() ? 1200 : 700;
    playTimer = setInterval(() => {
      state.monthIndex = (state.monthIndex + 1) % state.monthly.months.length;
      updateStage2(prefersReducedMotion());
    }, delay);
  }

  function stopPlay() {
    state.playing = false;
    const btn = document.getElementById("play-btn");
    if (btn) {
      btn.classList.remove("is-playing");
      btn.textContent = "Play";
      btn.setAttribute("aria-pressed", "false");
      btn.setAttribute("aria-label", "Play");
    }
    if (playTimer) clearInterval(playTimer);
    playTimer = null;
  }

function initExtraCharts() {
  const { ytCreators, ytDuration, ytUpload } = state.extra || {};

  function safeRender(sid, label, fn) {
    if (!sectionOn(sid) || !ChartModules[sid]) return;
    try {
      fn(ChartModules[sid]);
    } catch (err) {
      console.error(`[chart ${label}] render failed:`, err);
    }
  }

  safeRender("scrolly-3", "creators", (mod) => {
    if (!ytCreators) return;
    chartApi.creatorsYt = mod.render(document.getElementById("chart-creators-yt"), {
      creators: ytCreators,
      caveatEl: document.getElementById("caveat-3"),
    });
  });
  safeRender("scrolly-4", "scatter", (mod) => {
    if (typeof scatterData === "undefined" || !scatterData) return;
    chartApi.scatter = mod.render(document.getElementById("chart-scatter"), {
      scatter: scatterData,
      scatterPoints: (typeof scatterPoints !== "undefined" && scatterPoints) || { points: [] },
      caveatEl: document.getElementById("caveat-4"),
    });
  });
  safeRender("scrolly-5", "duration", (mod) => {
    if (!ytDuration) return;
    chartApi.durationYt = mod.render(document.getElementById("chart-duration-yt"), {
      duration: ytDuration,
      caveatEl: document.getElementById("caveat-5"),
    });
  });
  safeRender("scrolly-6", "wiki", (mod) => {
    if (typeof wikiData === "undefined" || !wikiData) return;
    chartApi.wiki = mod.render(document.getElementById("chart-wiki"), {
      wiki: wikiData,
      caveatEl: document.getElementById("caveat-6"),
    });
  });
  safeRender("scrolly-onset", "sleep_onset", (mod) => {
    const host = document.getElementById("onset-wave");
    if (host) chartApi.sleepOnset = mod.render(host);
  });
  safeRender("scrolly-phones", "sound_samples", (mod) => {
    const host = document.getElementById("chart-sound-samples");
    if (host) chartApi.soundSamples = mod.render(host);
  });
  safeRender("scrolly-bed", "bedroom", (mod) => {
    const host = document.getElementById("chart-bedroom");
    if (!host) return;
    Promise.resolve(mod.render(host)).catch((err) => {
      host.dataset.bedError = String((err && err.message) || err);
    });
  });
  safeRender("scrolly-kit", "asmr_toolkit", (mod) => {
    const host = document.getElementById("chart-asmr-toolkit");
    if (host) chartApi.asmrToolkit = mod.render(host);
  });
  safeRender("scrolly-west", "west_vs_east", (mod) => {
    const host = document.getElementById("chart-west-east");
    if (host) chartApi.westEast = mod.render(host);
  });
  safeRender("scrolly-gender", "gender_audience", (mod) => {
    const host = document.getElementById("chart-gender");
    if (host) chartApi.genderAudience = mod.render(host);
  });
  safeRender("scrolly-9", "upload_clock", (mod) => {
    if (!ytUpload) return;
    chartApi.uploadClock = mod.render(document.getElementById("chart-upload-clock"), {
      upload_clock: ytUpload,
      caveatEl: document.getElementById("caveat-9"),
    });
  });
}

  function initScrollama() {
    document.querySelectorAll(".scrolly").forEach((section) => {
      if (section.hidden || section.style.display === "none") return;
      const scroller = scrollama();
      const steps = section.querySelectorAll(".step");
      if (!steps.length) return;
      scroller
        .setup({
          step: steps,
          offset: 0.55,
          progress: false,
        })
        .onStepEnter((response) => {
          // Class toggle only — never redraw SVG / forceSim / refresh ScrollTrigger mid-scroll.
          section.querySelectorAll(".step").forEach((el) => el.classList.remove("is-active"));
          response.element.classList.add("is-active");
        });

      window.addEventListener(
        "resize",
        () => {
          scroller.resize();
          syncNotesOpen();
        },
        { passive: true }
      );
    });

    const nav = document.getElementById("site-nav");
    if (nav) nav.style.boxShadow = "none";
    window.addEventListener("resize", syncNotesOpen, { passive: true });
    syncNotesOpen();

    // Debounced redraw for width-dependent chart SVGs (resize only — not on scroll)
    let chartResizeT = 0;
    window.addEventListener(
      "resize",
      () => {
        clearTimeout(chartResizeT);
        chartResizeT = setTimeout(() => {
          Object.entries(ChartModules).forEach(([sid, mod]) => {
            try {
              if (typeof mod?.update === "function") mod.update();
            } catch (err) {
              console.error(`[chart ${sid}] update failed:`, err);
            }
          });
        }, 150);
      },
      { passive: true }
    );
  }

  async function main() {
    applySectionVisibility(document);
    try {
      await loadChartModules();
      await loadAll();
    } catch (err) {
      console.error(err);
      const c1 = document.getElementById("caveat-1");
      if (c1) {
        c1.textContent =
          "Failed to load data. Serve this folder over HTTP (e.g. python3 -m http.server).";
      }
      return;
    }

    if (sectionOn("scrolly-1")) {
      wrapMapWithTable("#map-trends", "trends");
      // Creator map host stays in DOM but is unused while creators payload is unpublished.
    }
    if (sectionOn("scrolly-2")) {
      wrapMapWithTable("#map-monthly", "monthly");
    }

    wireControls();
    try {
      if (sectionOn("scrolly-1")) updateStage1();
    } catch (err) {
      console.error("[chart map1] render failed:", err);
    }
    try {
      if (sectionOn("scrolly-2")) updateStage2(true);
    } catch (err) {
      console.error("[chart map2] render failed:", err);
    }
    initExtraCharts();
    initScrollama();
  }

  function wrapMapWithTable(sel, key) {
    const host = document.querySelector(sel);
    if (!host) return;
    // Move existing empty host into a table-toggle shell
    const parent = host.parentNode;
    const shell = document.createElement("div");
    shell.className = "map-table-shell";
    parent.insertBefore(shell, host);
    // rebuild: attachTableToggle needs empty container
    parent.removeChild(host);
    const api = attachTableToggle(shell, () => mapTableRows(key), { buttons: false });
    api.visual.id = host.id;
    api.visual.className = host.className;
    createMap(`#${host.id}`, key);
    state.mapTables = state.mapTables || {};
    state.mapTables[key] = api;
  }

  function mapTableRows(key) {
    if (key === "trends") {
      const rows = [...state.countryV2ByIso.values()].map((r) => [
        r.name || r.iso3,
        r.iso3,
        r.growth_ratio != null ? `${(r.growth_ratio * 100).toFixed(1)}%` : "—",
        r.mk_class || "—",
        r.mean_first_12,
        r.state || r.quality || "—",
        r.small_base ? "yes" : "",
      ]);
      (state.undrawableGeos || []).forEach((g) => {
        rows.push([
          g.name || g.iso3 || g.geo,
          g.iso3 || g.geo || "—",
          "—",
          "—",
          "—",
          "not on map",
          "",
        ]);
      });
      return {
        columns: ["region", "iso3", "growth", "mk_class", "mean_first_12", "state", "small_base"],
        rows,
      };
    }
    if (key === "creators") {
      return {
        columns: ["iso3", "channel_count", "video_count", "share_asmr", "share_sleep"],
        rows: [...state.creatorsByIso.values()].map((r) => [
          r.iso3,
          r.channel_count,
          r.video_count,
          r.share_asmr,
          r.share_sleep,
        ]),
      };
    }
    const month = state.monthly.months[state.monthIndex];
    const series = state.monthly.series.own_peak_asmr || {};
    return {
      columns: ["iso3", "series", "month", "own_peak"],
      rows: Object.keys(series).map((iso) => [
        iso,
        "own_peak_asmr",
        month,
        series[iso][state.monthIndex],
      ]),
    };
  }

  main();
