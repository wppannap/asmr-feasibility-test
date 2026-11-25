/* global d3, topojson, scrollama, ISO_NUM_TO_A3, ISO_A3_TO_NAME */
import { attachTableToggle, prefersReducedMotion } from "./charts/util.js";
import { themeColors } from "./theme.js";
import {
  ENABLED_DATA,
  ENABLED_SECTIONS,
  MAP_CAPTION_NOTES,
  SECTION_CHART_MODULES,
  applySectionVisibility,
} from "./sections.js";

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
  monthIndex: 0,
  playing: false,
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

async function loadAll() {
    const topo = await d3.json(ENABLED_DATA.topo);
    const trends = await d3.json(ENABLED_DATA.trends);
    const monthly = await d3.json(ENABLED_DATA.monthly);
    const scatterData = sectionOn("scrolly-4") ? await d3.json(ENABLED_DATA.scatter) : null;
    const scatterPoints = sectionOn("scrolly-4") && ENABLED_DATA.scatter_points
      ? await d3.json(ENABLED_DATA.scatter_points)
      : null;
    const wikiData = sectionOn("scrolly-6") ? await d3.json(ENABLED_DATA.wiki) : null;
    const ytCreators = sectionOn("scrolly-3") && ENABLED_DATA.yt_creators
      ? await d3.json(ENABLED_DATA.yt_creators)
      : null;
    const ytDuration = sectionOn("scrolly-5") && ENABLED_DATA.yt_duration
      ? await d3.json(ENABLED_DATA.yt_duration)
      : null;
    const ytUpload = sectionOn("scrolly-9") && ENABLED_DATA.yt_upload_clock
      ? await d3.json(ENABLED_DATA.yt_upload_clock)
      : null;

    // Unpublished / disabled payloads — never fetch while sections are off.
    const creators = null;
    const tiktok = null;
    const youtube = null;
    const douyinData = null;
    const commentsData = null;

    state.extra = {
      tiktok,
      scatterData,
      scatterPoints,
      youtube,
      wikiData,
      douyinData,
      commentsData,
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
    // End labels only, under the ramp (never over the colour band).
    const endTicks = growthTicks
      ? [growthTicks[0], growthTicks[growthTicks.length - 1]]
      : [scaleInfo.domain[0], scaleInfo.domain[1]];
    const tickY = h + 12;
    endTicks.forEach((tv, i) => {
      const x = i === 0 ? 0 : w;
      const anchor = i === 0 ? "start" : "end";
      const label =
        scaleInfo.diverging || growthTicks
          ? `${tv > 0 ? "+" : ""}${tv}%`
          : formatNum(tv, 0);
      svg
        .append("text")
        .attr("x", x)
        .attr("y", tickY)
        .attr("class", "legend-tick")
        .attr("text-anchor", anchor)
        .text(label);
    });
    const legendCopy = state.trendsMeta?.map1_legend || {};
    if (map1Full) {
      if (legendCopy.ramp) {
        root.append("span").attr("class", "legend-hatch-note").text(legendCopy.ramp);
      }
      // Mid-ramp colour (0% growth) so swatches match the map ramp, not a fixed green.
      const midRamp =
        scaleInfo?.scale && Number.isFinite(scaleInfo.scale(0))
          ? scaleInfo.scale(0)
          : themeColors().neutral;
      const solid = root.append("div").attr("class", "legend-swatch-row");
      solid
        .append("span")
        .attr("class", "legend-swatch legend-swatch-solid")
        .style("background", midRamp);
      solid.append("span").text(legendCopy.solid || "Statistically significant trend");
      const hatch = root.append("div").attr("class", "legend-swatch-row");
      const ink = themeColors().ink;
      hatch
        .append("span")
        .attr("class", "legend-swatch legend-swatch-hatch")
        .style(
          "background",
          `repeating-linear-gradient(45deg, ${midRamp}, ${midRamp} 2px, ${ink} 2px, ${ink} 3.2px)`
        );
      hatch.append("span").text(
        legendCopy.hatch_flat || "Estimated growth shown; no statistically significant trend"
      );
      const low = root.append("div").attr("class", "legend-swatch-row");
      low.append("span").attr("class", "legend-swatch legend-swatch-lowvol");
      low.append("span").text(legendCopy.low_volume || "Too few searches to measure");
      const miss = root.append("div").attr("class", "legend-swatch-row");
      miss.append("span").attr("class", "legend-swatch legend-swatch-miss");
      miss.append("span").text(
        legendCopy.no_data ||
          "No data (including mainland China: Google is not accessible there)"
      );
      const small = root.append("div").attr("class", "legend-swatch-row");
      small.append("span").attr("class", "legend-swatch legend-swatch-smallbase");
      small.append("span").text(legendCopy.small_base || "Small base");
      if (legendCopy.clip_note) {
        root.append("span").attr("class", "legend-hatch-note").text(legendCopy.clip_note);
      }
      return;
    }
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
    const height = 480;
    const svg = d3
      .select(wrap)
      .append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("role", "img")
      .attr("aria-label", "World choropleth map");

    // Hatch (flat MK) + dotted fill (low_volume) patterns
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

    const projection = d3.geoNaturalEarth1().fitSize([width, height], state.lands);
    const path = d3.geoPath(projection);

    const g = svg.append("g").attr("class", "countries");
    const paths = g
      .selectAll("path.country")
      .data(state.lands.features)
      .join("path")
      .attr("class", "country is-miss")
      .attr("d", path)
      .attr("aria-hidden", "true")
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

    const hatchG = svg.append("g").attr("class", "hatch-overlay").attr("pointer-events", "none");
    const hatchPaths = hatchG
      .selectAll("path")
      .data(state.lands.features)
      .join("path")
      .attr("d", path)
      .attr("fill", "none")
      .attr("opacity", 0);

    if (key === "trends") {
      const [cx, cy] = projection([105, 35]);
      const lx = Math.min(width - 8, cx + 48);
      const ly = Math.max(14, cy - 28);
      const anno = svg.append("g").attr("class", "map-anno").attr("pointer-events", "none");
      anno
        .append("path")
        .attr("class", "anno-leader")
        .attr("d", `M${cx},${cy} C${cx + 18},${cy - 18} ${lx - 12},${ly} ${lx},${ly}`);
      anno
        .append("text")
        .attr("class", "anno-label")
        .attr("x", lx + 2)
        .attr("y", ly + 3)
        .attr("fill", themeColors().muted)
        .text("mainland China — not measured");
    }

    state.maps[key] = {
      svg,
      paths,
      hatchPaths,
      projection,
      path,
      width,
      height,
      hatchId: `hatch-${key}`,
      lowvolPatternId: `dots-lowvol-${key}`,
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
      if (!row) {
        html += `<br>No data`;
      } else if (row.quality === "low_volume") {
        html += `<br>Too few searches to measure`;
      } else if (row.quality === "ok") {
        const g =
          row.growth_ratio != null && Number.isFinite(row.growth_ratio)
            ? `${(row.growth_ratio * 100).toFixed(1)}%`
            : "—";
        html += `<br>Growth: <b>${g}</b>`;
        html += `<br>MK class: <b>${row.mk_class || "—"}</b>`;
        html += `<br>First-12-month mean: <b>${formatNum(row.mean_first_12, 1)}</b>`;
        html += `<br>State: <b>${row.state || "measured"}</b>`;
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
    map.paths
      .attr("class", (d) => {
        const iso = d.properties.iso3;
        const row = iso ? state.countryV2ByIso.get(iso) : null;
        const bits = ["country"];
        if (mapKey === "trends" || mapKey === "monthly") {
          if (row?.quality === "low_volume") bits.push("is-lowvol");
          else {
            const v = iso ? valueMap[iso] : null;
            if (v == null || !Number.isFinite(v)) bits.push("is-miss");
          }
          if (mapKey === "trends" && row?.small_base && row?.quality === "ok") {
            bits.push("is-smallbase");
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
    if (map.hatchPaths) {
      map.hatchPaths
        .attr("fill", (d) => {
          const iso = d.properties.iso3;
          const row = iso ? state.countryV2ByIso.get(iso) : null;
          const v = iso ? valueMap[iso] : null;
          if (
            mapKey === "trends" &&
            shouldHatchFlat(row) &&
            v != null &&
            Number.isFinite(v)
          ) {
            return `url(#${map.hatchId})`;
          }
          return "none";
        })
        .attr("opacity", (d) => {
          const iso = d.properties.iso3;
          const row = iso ? state.countryV2ByIso.get(iso) : null;
          const v = iso ? valueMap[iso] : null;
          return mapKey === "trends" &&
            shouldHatchFlat(row) &&
            v != null &&
            Number.isFinite(v)
            ? 1
            : 0;
        });
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

  function updateStage1() {
    // Creator-country payload is unpublished until videos labelled as ASMR (excluding ambient-noise content) are verified.
    state.layerMode = "trends";
    const panels = document.getElementById("map-panels-1");
    if (!panels) return;
    const trendsPanel = panels.querySelector('[data-panel="trends"]');
    const creatorsPanel = panels.querySelector('[data-panel="creators"]');
    const titleEl = document.getElementById("trends-panel-title");

    panels.classList.toggle("is-compare", false);
    if (trendsPanel) trendsPanel.classList.remove("is-hidden");
    if (creatorsPanel) creatorsPanel.classList.add("is-hidden");

    if (titleEl) titleEl.textContent = GROWTH_LABEL;

    state.displayValues.trends = collectTrendsValues();
    state.displayValues.creators = {};

    const tScale = {
      scale: d3
        .scaleSequential((t) => colorDiv(1 - t))
        .domain(GROWTH_DOMAIN_PCT)
        .clamp(true),
      domain: GROWTH_DOMAIN_PCT.slice(),
      log: false,
      diverging: true,
    };

    if (!state.maps.trends) return;
    paintMap("trends", state.displayValues.trends, tScale);
    drawLegend(document.getElementById("legend-trends"), tScale, GROWTH_LABEL, {
      map1Full: true,
      growthTicks: [-50, 0, 50, 150],
    });
    updateMap1Caption();
    renderTrendsTable();
  }

  function renderTrendsTable() {
    const host = document.getElementById("trends-table-host");
    if (!host) return;
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

  function wireControls() {
    document.querySelectorAll("#layer-mode button").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#layer-mode button").forEach((b) => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        state.layerMode = btn.dataset.mode;
        updateStage1();
      });
    });

    const scrubber = document.getElementById("month-scrubber");
    scrubber.max = String(state.monthly.months.length - 1);
    // start at first complete month (2021-11)
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

    const playBtn = document.getElementById("play-btn");
    playBtn.addEventListener("click", () => {
      if (state.playing) stopPlay();
      else startPlay();
    });
  }

  let playTimer = null;
  function startPlay() {
    state.playing = true;
    const btn = document.getElementById("play-btn");
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
    btn.classList.remove("is-playing");
    btn.textContent = "Play";
    btn.setAttribute("aria-pressed", "false");
    btn.setAttribute("aria-label", "Play");
    if (playTimer) clearInterval(playTimer);
    playTimer = null;
  }

function initExtraCharts() {
  const { scatterData, scatterPoints, wikiData, ytCreators, ytDuration, ytUpload } = state.extra;

  if (sectionOn("scrolly-3") && ChartModules["scrolly-3"] && ytCreators) {
    chartApi.creatorsYt = ChartModules["scrolly-3"].render(
      document.getElementById("chart-creators-yt"),
      { creators: ytCreators, caveatEl: document.getElementById("caveat-3") }
    );
  }
  if (sectionOn("scrolly-4") && ChartModules["scrolly-4"] && scatterData) {
    chartApi.scatter = ChartModules["scrolly-4"].render(
      document.getElementById("chart-scatter"),
      {
        scatter: scatterData,
        scatterPoints: scatterPoints || { points: [] },
        caveatEl: document.getElementById("caveat-4"),
      }
    );
  }
  if (sectionOn("scrolly-5") && ChartModules["scrolly-5"] && ytDuration) {
    chartApi.durationYt = ChartModules["scrolly-5"].render(
      document.getElementById("chart-duration-yt"),
      { duration: ytDuration, caveatEl: document.getElementById("caveat-5") }
    );
  }
  if (sectionOn("scrolly-6") && ChartModules["scrolly-6"] && wikiData) {
    chartApi.wiki = ChartModules["scrolly-6"].render(
      document.getElementById("chart-wiki"),
      { wiki: wikiData, caveatEl: document.getElementById("caveat-6") }
    );
  }
  if (sectionOn("scrolly-9") && ChartModules["scrolly-9"] && ytUpload) {
    chartApi.uploadClock = ChartModules["scrolly-9"].render(
      document.getElementById("chart-upload-clock"),
      { upload_clock: ytUpload, caveatEl: document.getElementById("caveat-9") }
    );
  }
}

  function initScrollama() {
    document.querySelectorAll(".scrolly").forEach((section) => {
      if (section.hidden || section.style.display === "none") return;
      const scroller = scrollama();
      const chartKey = section.dataset.chart;
      const steps = section.querySelectorAll(".step");
      if (!steps.length) return;
      scroller
        .setup({
          step: steps,
          offset: 0.55,
          progress: false,
        })
        .onStepEnter((response) => {
          section.querySelectorAll(".step").forEach((el) => el.classList.remove("is-active"));
          response.element.classList.add("is-active");
          const mod =
            ChartModules[section.id] ||
            (chartKey ? ChartModules[chartKey] : null);
          if (mod?.update) {
            mod.update(response.element.dataset.step || response.index + 1);
          }
        });

      window.addEventListener("resize", () => {
        scroller.resize();
        syncNotesOpen();
      });
    });

    const nav = document.getElementById("site-nav");
    window.addEventListener(
      "scroll",
      () => {
        nav.style.boxShadow = window.scrollY > 8 ? "0 4px 16px rgba(26,36,44,0.08)" : "none";
      },
      { passive: true }
    );
    window.addEventListener("resize", syncNotesOpen);
    syncNotesOpen();
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
    if (sectionOn("scrolly-1")) updateStage1();
    if (sectionOn("scrolly-2")) updateStage2(true);
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
    const api = attachTableToggle(shell, () => mapTableRows(key));
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
