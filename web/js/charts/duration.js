/* Overlaid duration histograms — three tag groups with hide toggles */
import {
  appendSvg,
  attachTableToggle,
  clear,
  fmt,
  setCaveat,
  sizeOf,
} from "./util.js";
import {
  DURATION_MARKERS,
  DURATION_TAG_FOOTNOTE,
  pickExpansionCaveat,
} from "./config.js";

const GROUP_STYLE = {
  asmr_and_sleep: { color: "#0b6e4f", key: "asmr_and_sleep" },
  asmr_not_sleep: { color: "#5a6b76", key: "asmr_not_sleep" },
  sleep_not_asmr: { color: "#b35c00", key: "sleep_not_asmr" },
};

const GROUP_ORDER = ["asmr_and_sleep", "asmr_not_sleep", "sleep_not_asmr"];

let ctx = null;

export function render(container, data) {
  clear(container);
  const { youtube, caveatEl } = data;
  const hist = youtube.duration_histogram || {};
  const groupsMeta = hist.groups || {};
  const meta = youtube.meta || {};
  const plotMin = hist.plot_min_sec ?? groupsMeta.asmr_and_sleep?.plot_min_sec;
  const plotMax = hist.plot_max_sec ?? groupsMeta.asmr_and_sleep?.plot_max_sec;

  const visible = Object.fromEntries(GROUP_ORDER.map((k) => [k, true]));

  const wrap = d3.select(container);
  wrap
    .append("p")
    .attr("class", "chart-subtitle")
    .text("Video duration by creator-applied ASMR / sleep tags (log scale)");

  if (meta.duration_weighting_caption) {
    wrap
      .append("p")
      .attr("class", "chart-note duration-weighting-caption")
      .text(meta.duration_weighting_caption);
  }

  const toggleRow = wrap
    .append("div")
    .attr("class", "control-row duration-toggles")
    .attr("role", "group")
    .attr("aria-label", "Duration groups");

  const tableApi = attachTableToggle(wrap.node(), () => summaryTable(groupsMeta));

  const mount = tableApi.visual;

  function draw() {
    clear(mount);
    const { width, height } = sizeOf(mount);
    const margin = { top: 36, right: 20, bottom: 44, left: 52 };
    const w = Math.max(40, width - margin.left - margin.right);
    const h = Math.max(40, height - margin.top - margin.bottom);

    const active = GROUP_ORDER.filter((k) => visible[k] && groupsMeta[k]?.bins);
    const allBins = active.flatMap((k) => groupsMeta[k].bins || []);
    const xDomain = [
      Math.max(1, d3.min(allBins, (d) => d.bin_lo) || 1),
      d3.max(allBins, (d) => d.bin_hi) || 1e5,
    ];
    const x = d3.scaleLog().domain(xDomain).range([0, w]).clamp(true);
    const yMax = d3.max(allBins, (d) => d.count) || 1;
    const y = d3.scaleLinear().domain([0, yMax * 1.05]).nice().range([h, 0]);

    const svg = appendSvg(
      mount,
      width,
      height,
      "Overlaid duration histograms for ASMR/sleep tag groups"
    );
    const g = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const area = d3
      .area()
      .curve(d3.curveStepAfter)
      .x((d) => x(d.bin_lo))
      .y0(h)
      .y1((d) => y(d.count));

    function withEnd(bins) {
      if (!bins.length) return bins;
      const last = bins[bins.length - 1];
      return bins.concat([{ bin_lo: last.bin_hi, bin_hi: last.bin_hi, count: 0 }]);
    }

    active.forEach((key) => {
      const style = GROUP_STYLE[key];
      const bins = groupsMeta[key].bins || [];
      g.append("path")
        .datum(withEnd(bins))
        .attr("fill", style.color)
        .attr("fill-opacity", 0.32)
        .attr("stroke", style.color)
        .attr("stroke-width", 1.3)
        .attr("d", area);
    });

    const markers =
      meta.duration_markers_sec?.length > 0
        ? meta.duration_markers_sec
        : DURATION_MARKERS;
    markers.forEach((m) => {
      const sec = Number(m.sec);
      if (!Number.isFinite(sec) || sec < xDomain[0] || sec > xDomain[1]) return;
      const xx = x(sec);
      g.append("line")
        .attr("class", "duration-mark")
        .attr("x1", xx)
        .attr("x2", xx)
        .attr("y1", 0)
        .attr("y2", h)
        .attr("stroke", "#6b3a00")
        .attr("stroke-width", 1.5)
        .attr("stroke-dasharray", "4 3");
      g.append("text")
        .attr("x", xx + 4)
        .attr("y", 12)
        .attr("fill", "#6b3a00")
        .attr("font-size", 11)
        .attr("font-weight", 700)
        .text(m.label || `${sec}s`);
    });

    g.append("g")
      .attr("transform", `translate(0,${h})`)
      .call(
        d3
          .axisBottom(x)
          .ticks(6, "~s")
          .tickFormat((d) => {
            if (d >= 3600) return `${d / 3600}h`;
            if (d >= 60) return `${d / 60}m`;
            return `${d}s`;
          })
      )
      .call((s) => s.selectAll("text").attr("font-size", 10));
    g.append("g")
      .call(d3.axisLeft(y).ticks(5).tickFormat(d3.format("~s")))
      .call((s) => s.selectAll("text").attr("font-size", 10));

    g.append("text")
      .attr("x", w / 2)
      .attr("y", h + 36)
      .attr("text-anchor", "middle")
      .attr("font-size", 11)
      .attr("fill", "#5a6b76")
      .text("Duration (log scale, seconds)");

    ctx = { ...(ctx || {}), svg, tableApi };
  }

  GROUP_ORDER.forEach((key) => {
    const g = groupsMeta[key];
    if (!g) return;
    const label = g.label || key;
    const lab = toggleRow.append("label").attr("class", "duration-toggle");
    lab
      .append("input")
      .attr("type", "checkbox")
      .property("checked", true)
      .on("change", function () {
        visible[key] = this.checked;
        draw();
        tableApi.refreshTable();
      });
    lab
      .append("span")
      .attr("class", "duration-swatch")
      .style("background", GROUP_STYLE[key].color);
    lab.append("span").text(`${label} (n=${fmt(g.n, 0)})`);
  });

  wrap.selectAll(".duration-tag-footnote").remove();
  const rangeNote =
    plotMin != null && plotMax != null
      ? `Histogram includes finite durations from ${fmt(plotMin, 1)}s to ${fmt(
          plotMax,
          1
        )}s. Group n matches the tag 2×2; videos with missing/zero duration or outside that range are listed in the table.`
      : "";
  wrap
    .append("p")
    .attr("class", "chart-note duration-tag-footnote")
    .text(
      [meta.duration_tag_footnote || DURATION_TAG_FOOTNOTE, rangeNote]
        .filter(Boolean)
        .join(" ")
    );

  const sensitiveNotes = GROUP_ORDER.map((k) => groupsMeta[k])
    .filter((g) => g?.weighting_sensitive)
    .map(
      (g) =>
        `${g.label}: The median depends strongly on how videos are weighted (a few channels post very long videos); read as indicative.`
    );
  if (sensitiveNotes.length) {
    wrap
      .append("p")
      .attr("class", "chart-note duration-weighting-note")
      .text(sensitiveNotes.join(" "));
  }

  draw();

  setCaveat(caveatEl, [
    pickExpansionCaveat(meta.caveats),
    meta.duration_tag_footnote || DURATION_TAG_FOOTNOTE,
    rangeNote,
    `n = ${fmt(meta.n, 0)} videos in yt_master for this harvest.`,
  ]);

  ctx = { svg: ctx?.svg, tableApi, draw, visible };
  return ctx;
}

function summaryTable(groupsMeta) {
  const columns = [
    "group",
    "n",
    "n_plotted",
    "n_invalid_duration",
    "n_below_plot_min",
    "n_above_plot_max",
    "plot_min_sec",
    "plot_max_sec",
    "median_sec_video",
    "median_sec_channel_equal",
    "median_sec_capped20",
    "share_ge_1h",
    "share_ge_8h",
    "weighting_sensitive",
  ];
  const rows = GROUP_ORDER.map((k) => {
    const g = groupsMeta[k] || {};
    return [
      g.label || k,
      g.n ?? "",
      g.n_plotted ?? "",
      g.n_invalid_duration ?? "",
      g.n_below_plot_min ?? "",
      g.n_above_plot_max ?? "",
      g.plot_min_sec ?? "",
      g.plot_max_sec ?? "",
      g.median_sec_video ?? "",
      g.median_sec_channel_equal ?? "",
      g.median_sec_capped20 ?? "",
      g.share_ge_1h ?? "",
      g.share_ge_8h ?? "",
      g.weighting_sensitive ? "yes" : "",
    ];
  });
  return { columns, rows };
}

export function update(step) {
  if (!ctx) return;
  const n = typeof step === "number" ? step : parseInt(String(step).split("-").pop(), 10) || 1;
  ctx.svg
    ?.selectAll(".duration-mark")
    .attr("stroke-width", n >= 2 ? 2.4 : 1.5)
    .attr("stroke-opacity", n >= 2 ? 1 : 0.85);
  ctx.tableApi?.refreshTable();
}
