/* global d3, topojson, scrollama, gsap, ISO_NUM_TO_A3, ISO_A3_TO_NAME */
import { attachTableToggle, prefersReducedMotion } from "./charts/util.js";

/** Populated by loadChartModules() — sequential imports avoid dropped parallel ESM fetches on single-threaded static servers. */
const ChartModules = {
  creatorSymbols: null,
  scatter: null,
  duration: null,
  wiki: null,
  douyin: null,
  comments: null,
};

async function loadChartModules() {
  ChartModules.creatorSymbols = await import("./charts/creator_symbols.js");
  ChartModules.scatter = await import("./charts/scatter.js");
  ChartModules.duration = await import("./charts/duration.js");
  ChartModules.wiki = await import("./charts/wiki.js");
  ChartModules.douyin = await import("./charts/douyin.js");
  ChartModules.comments = await import("./charts/comments.js");
}

const METRIC_LABEL = {
  change_in_window:
    "Change in ASMR search interest, latest 12 months vs first 12 months of the window (points, relative to each country's own peak)",
  recent_vs_peak:
    "Mean ASMR search interest in the latest 12 months of the window (points, relative to each country's own peak)",
};

// Color-blind–safe sequential (cividis via d3.interpolateCividis)
const colorSeq = d3.interpolateCividis;
// Diverging for change_in_window (centred on 0)
const colorDiv = d3.interpolateRdBu;

const state = {
  choroplethMetric: "change_in_window", // default; recent_vs_peak secondary
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
    const [
      topo,
      trends,
      creators,
      monthly,
      tiktok,
      scatterData,
      youtube,
      wikiData,
      douyinData,
      commentsData,
    ] = await Promise.all([
      d3.json("data/countries-50m.json"),
      d3.json("data/trends_country_v2.json"),
      d3.json("data/creator_country.json"),
      d3.json("data/trends_monthly_v2.json"),
      d3.json("data/tiktok_origin.json"),
      d3.json("data/insomnia_vs_asmr.json"),
      d3.json("data/youtube_yearly.json"),
      d3.json("data/wiki_lang.json"),
      d3.json("data/douyin_keywords.json"),
      d3.json("data/comment_themes.json"),
    ]);
    state.extra = { tiktok, scatterData, youtube, wikiData, douyinData, commentsData };

    const countries = topojson.feature(topo, topo.objects.countries);
    countries.features.forEach((f) => {
      const num = String(f.id);
      f.properties = f.properties || {};
      f.properties.iso3 = ISO_NUM_TO_A3[num] || ISO_NUM_TO_A3[num.replace(/^0+/, "")] || null;
    });
    state.lands = countries;

    state.trendsMeta = trends.meta;
    state.countryV2ByIso = new Map();
    (trends.rows || []).forEach((r) => {
      if (r.iso3) state.countryV2ByIso.set(r.iso3, r);
    });

    state.creatorMeta = creators.meta;
    state.creatorRows = creators.countries || [];
    creators.countries.forEach((r) => {
      if (r.iso3 && r.iso3 !== "unknown") state.creatorsByIso.set(r.iso3, r);
    });

    state.monthly = monthly;
    state.monthlyMeta = monthly.meta;
    state.monthIndex = 0;

    document.getElementById("caveat-1").textContent = [
      ...(trends.meta.caveats || []).slice(0, 1),
      ...(creators.meta.caveats || []).slice(0, 1),
    ].join(" ");

    document.getElementById("caveat-2").textContent = (monthly.meta.caveats || []).join(" ");
  }

  function makeScale(values, { log, diverging } = {}) {
    const clean = values.filter((v) => v != null && Number.isFinite(v));
    if (!clean.length) {
      return {
        scale: () => "#aebbc6",
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
      if (row?.flag_low_volume) return true;
    }
    return false;
  }

  function anyWithinNoiseFlag() {
    for (const row of state.countryV2ByIso.values()) {
      if (row?.within_noise) return true;
    }
    return false;
  }

  function shouldHatch(row) {
    if (!row) return false;
    if (state.choroplethMetric === "change_in_window" && row.within_noise) return true;
    if (row.flag_low_volume) return true;
    return false;
  }

  function drawLegend(el, scaleInfo, label, { hatchNote } = {}) {
    const root = d3.select(el);
    root.selectAll("*").remove();
    root.append("span").text(label);
    const w = 140;
    const h = 10;
    const svg = root.append("svg").attr("width", w).attr("height", h);
    const defs = svg.append("defs");
    const id = `lg-${Math.random().toString(36).slice(2, 8)}`;
    const grad = defs.append("linearGradient").attr("id", id);
    d3.range(0, 1.01, 0.05).forEach((t) => {
      const x = scaleInfo.log
        ? scaleInfo.domain[0] * Math.pow(scaleInfo.domain[1] / scaleInfo.domain[0], t)
        : scaleInfo.domain[0] + t * (scaleInfo.domain[1] - scaleInfo.domain[0]);
      grad.append("stop").attr("offset", `${t * 100}%`).attr("stop-color", scaleInfo.scale(x));
    });
    svg.append("rect").attr("width", w).attr("height", h).attr("fill", `url(#${id})`).attr("rx", 2);
    const digits = scaleInfo.diverging ? 1 : scaleInfo.log ? 0 : 1;
    root
      .append("span")
      .text(
        scaleInfo.log
          ? `${formatNum(scaleInfo.domain[0], 0)} – ${formatNum(scaleInfo.domain[1], 0)} (log)`
          : `${formatNum(scaleInfo.domain[0], digits)} – ${formatNum(scaleInfo.domain[1], digits)}`
      );
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

    // Hatch overlay (lines only) for low_volume — sits above coloured fill
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
      .attr("stroke", "#1a242c")
      .attr("stroke-width", 1.5)
      .attr("stroke-opacity", 0.55);

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

    state.maps[key] = {
      svg,
      paths,
      hatchPaths,
      projection,
      path,
      width,
      height,
      hatchId: `hatch-${key}`,
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
      const v = state.displayValues.trends[iso3];
      const row = state.countryV2ByIso.get(iso3);
      if (v == null || !Number.isFinite(v)) {
        html += `<b>無資料</b>`;
      } else if (state.choroplethMetric === "change_in_window") {
        html += `Change in window: <b>${formatNum(v, 1)}</b> own-peak points`;
      } else {
        html += `Recent vs peak: <b>${formatNum(v, 1)}</b>`;
      }
      if (row?.within_noise && state.choroplethMetric === "change_in_window") {
        html += `<br>flag: within_noise (hatched)`;
      }
      if (row?.flag_low_volume) html += `<br>flag: low_volume (hatched)`;
      if (row?.change_se != null && state.choroplethMetric === "change_in_window") {
        html += `<br>change SE ≈ ${formatNum(row.change_se, 2)}`;
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
        const v = iso ? valueMap[iso] : null;
        return v == null || !Number.isFinite(v) ? "country is-miss" : "country";
      })
      .attr("fill", (d) => {
        const iso = d.properties.iso3;
        const v = iso ? valueMap[iso] : null;
        if (v == null || !Number.isFinite(v)) return "#aebbc6";
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
            shouldHatch(row) &&
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
            shouldHatch(row) &&
            v != null &&
            Number.isFinite(v)
            ? 1
            : 0;
        });
    }
  }

  function collectTrendsValues() {
    const out = {};
    const key = state.choroplethMetric;
    state.countryV2ByIso.forEach((row, iso) => {
      const v = row[key];
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

  function updateNoiseCaption() {
    const el = document.getElementById("trends-noise-caption");
    if (!el) return;
    const fc = state.trendsMeta?.flag_counts;
    if (!fc || state.choroplethMetric !== "change_in_window") {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    const rise = fc.rise_beyond_noise;
    const within = fc.within_noise;
    const fall = fc.fall_beyond_noise;
    if (rise == null || within == null || fall == null) {
      el.hidden = true;
      return;
    }
    const auto =
      (state.trendsMeta?.caveats || []).find((c) => /autocorrelat/i.test(c)) ||
      "Monthly values are autocorrelated, so standard errors are optimistic.";
    el.hidden = false;
    el.textContent =
      `${rise} countries rising beyond noise · ${within} within noise · ${fall} falling beyond noise. ${auto}`;
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
    const panels = document.getElementById("map-panels-1");
    const trendsPanel = panels.querySelector('[data-panel="trends"]');
    const creatorsPanel = panels.querySelector('[data-panel="creators"]');
    const titleEl = document.getElementById("trends-panel-title");

    panels.classList.toggle("is-compare", state.layerMode === "compare");

    if (state.layerMode === "trends") {
      trendsPanel.classList.remove("is-hidden");
      creatorsPanel.classList.add("is-hidden");
    } else if (state.layerMode === "creators") {
      trendsPanel.classList.add("is-hidden");
      creatorsPanel.classList.remove("is-hidden");
    } else {
      trendsPanel.classList.remove("is-hidden");
      creatorsPanel.classList.remove("is-hidden");
    }

    if (titleEl) {
      titleEl.textContent = METRIC_LABEL[state.choroplethMetric] || METRIC_LABEL.change_in_window;
    }

    state.displayValues.trends = collectTrendsValues();
    state.displayValues.creators = collectCreatorValues();

    const isChange = state.choroplethMetric === "change_in_window";
    const tScale = makeScale(Object.values(state.displayValues.trends), {
      log: false,
      diverging: isChange,
    });
    const cScale = makeScale(Object.values(state.displayValues.creators), { log: true });

    if (state.layerMode !== "creators") {
      paintMap("trends", state.displayValues.trends, tScale);
      const legendLabel = METRIC_LABEL[state.choroplethMetric] || METRIC_LABEL.change_in_window;
      let hatchNote = null;
      if (state.choroplethMetric === "change_in_window" && anyWithinNoiseFlag()) {
        hatchNote =
          "Change is within noise (smaller than about 2 standard errors of monthly values; Google Trends is a sample)";
      } else if (anyLowVolumeFlag()) {
        hatchNote = "hatched = low_volume";
      }
      drawLegend(document.getElementById("legend-trends"), tScale, legendLabel, {
        hatchNote,
      });
      updateNoiseCaption();
    } else {
      const noiseEl = document.getElementById("trends-noise-caption");
      if (noiseEl) {
        noiseEl.hidden = true;
      }
    }
    if (state.layerMode !== "trends") {
      paintMap("creators", state.displayValues.creators, cScale);
      drawLegend(document.getElementById("legend-creators"), cScale, "Channel count");
    }
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
      drawLegend(
        document.getElementById("legend-monthly"),
        fixed,
        "Relative to each country's own peak"
      );
      return;
    }

    if (state.tween) state.tween.kill();
    const from = { ...state.displayValues.monthly };
    const proxy = { t: 0 };
    state.tween = gsap.to(proxy, {
      t: 1,
      duration: 0.45,
      ease: "power2.out",
      onUpdate: () => {
        const blended = {};
        const isos = new Set([...Object.keys(from), ...Object.keys(target)]);
        isos.forEach((iso) => {
          const a = from[iso];
          const b = target[iso];
          if (a == null && b == null) return;
          if (a == null) blended[iso] = b;
          else if (b == null) blended[iso] = a;
          else blended[iso] = a + (b - a) * proxy.t;
        });
        state.displayValues.monthly = blended;
        paintMap("monthly", blended, fixed);
      },
      onComplete: () => {
        state.displayValues.monthly = target;
        paintMap("monthly", target, fixed);
      },
    });
    drawLegend(
      document.getElementById("legend-monthly"),
      fixed,
      "Relative to each country's own peak"
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

    document.querySelectorAll("#metric-toggle button").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#metric-toggle button").forEach((b) => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        state.choroplethMetric = btn.dataset.metric;
        updateStage1();
      });
    });

    const scrubber = document.getElementById("month-scrubber");
    scrubber.max = String(state.monthly.months.length - 1);
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
  const { tiktok, scatterData, youtube, wikiData, douyinData, commentsData } = state.extra;
  const { creatorSymbols, scatter, duration, wiki, douyin, comments } = ChartModules;

  chartApi.creatorSymbols = creatorSymbols.render(
    document.getElementById("chart-creator-symbols"),
    {
      creators: { meta: state.creatorMeta, countries: state.creatorRows },
      lands: state.lands,
      tiktok,
      caveatEl: document.getElementById("caveat-3"),
    }
  );
  chartApi.scatter = scatter.render(document.getElementById("chart-scatter"), {
    scatter: scatterData,
    caveatEl: document.getElementById("caveat-4"),
  });
  chartApi.duration = duration.render(document.getElementById("chart-duration"), {
    youtube,
    caveatEl: document.getElementById("caveat-5"),
  });
  chartApi.wiki = wiki.render(document.getElementById("chart-wiki"), {
    wiki: wikiData,
    caveatEl: document.getElementById("caveat-6"),
  });
  chartApi.douyin = douyin.render(document.getElementById("chart-douyin"), {
    douyin: douyinData,
    caveatEl: document.getElementById("caveat-7"),
  });
  chartApi.comments = comments.render(document.getElementById("chart-comments"), {
    comments: commentsData,
    caveatEl: document.getElementById("caveat-8"),
  });
}

  function initScrollama() {
    document.querySelectorAll(".scrolly").forEach((section) => {
      const scroller = scrollama();
      const chartKey = section.dataset.chart;
      scroller
        .setup({
          step: section.querySelectorAll(".step"),
          offset: 0.55,
          progress: false,
        })
        .onStepEnter((response) => {
          section.querySelectorAll(".step").forEach((el) => el.classList.remove("is-active"));
          response.element.classList.add("is-active");
          if (chartKey && ChartModules[chartKey]?.update) {
            ChartModules[chartKey].update(response.element.dataset.step || response.index + 1);
          }
        });

      window.addEventListener("resize", () => scroller.resize());
    });

    const nav = document.getElementById("site-nav");
    window.addEventListener(
      "scroll",
      () => {
        nav.style.boxShadow = window.scrollY > 8 ? "0 4px 16px rgba(26,36,44,0.08)" : "none";
      },
      { passive: true }
    );
  }

  async function main() {
    try {
      await loadChartModules();
      await loadAll();
    } catch (err) {
      console.error(err);
      document.getElementById("caveat-1").textContent =
        "Failed to load data. Serve this folder over HTTP (e.g. python3 -m http.server).";
      return;
    }

    wrapMapWithTable("#map-trends", "trends");
    wrapMapWithTable("#map-creators", "creators");
    wrapMapWithTable("#map-monthly", "monthly");

    wireControls();
    updateStage1();
    updateStage2(true);
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
      return {
        columns: [
          "iso3",
          "change_in_window",
          "change_se",
          "within_noise",
          "recent_vs_peak",
          "peak_month",
          "flag_low_volume",
        ],
        rows: [...state.countryV2ByIso.values()].map((r) => [
          r.iso3,
          r.change_in_window,
          r.change_se,
          r.within_noise ? "yes" : "",
          r.recent_vs_peak,
          r.peak_month,
          r.flag_low_volume ? "yes" : "",
        ]),
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
