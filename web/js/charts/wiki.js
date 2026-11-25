/* 23 horizon wave strips — borderless joyplot stack (ASMR wiki editions). */
import { attachTableToggle, clear, setCaveat, sizeOf } from "./util.js?v=20261125b";
import { themeColors } from "../theme.js?v=20261125b";

let ctx = null;

export function render(container, data) {
  clear(container);
  const { wiki, caveatEl } = data;
  const concept = "ASMR";
  const months = wiki.months || [];
  const series = wiki.series?.[concept] || {};
  const langs = (wiki.languages || []).filter((l) => series[l]);
  const lowTraffic = new Set(
    (wiki.low_traffic && wiki.low_traffic[concept]) ||
      wiki.meta?.low_traffic_languages_asmr ||
      []
  );

  const wrap = d3.select(container);
  wrap
    .append("p")
    .attr("class", "chart-subtitle")
    .text(
      `Concept: ${concept} · each series is indexed to that language edition’s own max = 100`
    );
  if (lowTraffic.size) {
    wrap
      .append("p")
      .attr("class", "chart-note")
      .text("low traffic: index may exaggerate small changes");
  }

  const chrome = wrap.append("div").attr("class", "control-row chart-controls");
  chrome
    .append("label")
    .attr("class", "toggle-label")
    .html(
      `<input type="checkbox" id="wiki-shared-y" /> shared y-axis <span class="muted">(default off)</span>`
    );

  const host = wrap.append("div").attr("class", "wiki-host wiki-horizon").node();

  ctx = {
    wiki,
    concept,
    months,
    series,
    langs,
    lowTraffic,
    host,
    sharedY: false,
    caveatEl,
  };

  chrome.select("#wiki-shared-y").on("change", function () {
    ctx.sharedY = this.checked;
    draw();
  });

  setCaveat(caveatEl, [
    ...(wiki.meta?.caveats || []),
    "Tooltip shows the indexed value stored in wiki_lang.json (0–100). Absolute monthly pageview counts are not present in this file.",
    lowTraffic.size
      ? `Greyed editions are low_traffic (below 25th percentile of total ASMR views): ${[...lowTraffic].join(", ")}.`
      : null,
  ].filter(Boolean));

  draw();
  return ctx;
}

function draw() {
  const { months, series, langs, lowTraffic, host, sharedY, concept } = ctx;
  clear(host);

  const tableApi = attachTableToggle(host, () => {
    const rows = [];
    langs.forEach((lang) => {
      (series[lang] || []).forEach((v, i) => {
        if (v == null) return;
        rows.push([lang, months[i], v, lowTraffic.has(lang) ? "low_traffic" : ""]);
      });
    });
    return {
      columns: ["language_edition", "month", "indexed_views_0_to_100", "low_traffic"],
      rows,
    };
  });

  const { width } = sizeOf(tableApi.visual);
  const cols = width < 560 ? 1 : 2;
  const colW = Math.floor((width - 12) / cols);
  const rowH = 28;
  const c = themeColors();

  let globalMax = 100;
  if (sharedY) {
    globalMax = d3.max(langs, (lang) => d3.max(series[lang] || [], (v) => v)) || 100;
  }

  const grid = d3
    .select(tableApi.visual)
    .append("div")
    .attr("class", "wiki-horizon-grid")
    .style("display", "grid")
    .style("grid-template-columns", `repeat(${cols}, minmax(0, 1fr))`)
    .style("gap", "2px 16px")
    .node();

  langs.forEach((lang) => {
    const vals = series[lang] || [];
    const isLow = lowTraffic.has(lang);
    const stroke = isLow ? c.muted : c.accent;
    const cell = d3.select(grid).append("div").attr("class", "wiki-strip");
    const row = cell.append("div").attr("class", "wiki-strip-row");
    row
      .append("span")
      .attr("class", "wiki-strip-lang")
      .text(isLow ? `${lang} · low traffic` : lang);

    const svg = row
      .append("svg")
      .attr("viewBox", `0 0 ${Math.max(120, colW - 72)} ${rowH}`)
      .attr("width", "100%")
      .attr("height", rowH)
      .attr("role", "img")
      .attr(
        "aria-label",
        `Indexed Wikipedia pageviews for language edition ${lang}, concept ${concept}`
      );

    const plotW = Math.max(120, colW - 72);
    const x = d3.scalePoint().domain(d3.range(months.length)).range([2, plotW - 2]);
    const yMax = sharedY ? globalMax : 100;
    const y = d3.scaleLinear().domain([0, yMax]).range([rowH - 2, 2]);
    const pts = vals
      .map((v, i) => (v == null ? null : { i, v, month: months[i] }))
      .filter(Boolean);

    const area = d3
      .area()
      .curve(d3.curveBasis)
      .x((d) => x(d.i))
      .y0(rowH - 2)
      .y1((d) => y(d.v));
    svg
      .append("path")
      .datum(pts)
      .attr("d", area)
      .attr("fill", stroke)
      .attr("opacity", 0.22);

    svg
      .append("path")
      .datum(pts)
      .attr("fill", "none")
      .attr("stroke", stroke)
      .attr("stroke-width", 1.2)
      .attr("stroke-dasharray", isLow ? "2.5 2" : null)
      .attr(
        "d",
        d3
          .line()
          .curve(d3.curveBasis)
          .x((d) => x(d.i))
          .y((d) => y(d.v))
      );

    // Glow at peak
    if (pts.length) {
      const peak = pts.reduce((a, b) => (b.v > a.v ? b : a));
      svg
        .append("circle")
        .attr("cx", x(peak.i))
        .attr("cy", y(peak.v))
        .attr("r", 2.4)
        .attr("fill", stroke)
        .attr("opacity", 0.95)
        .append("title")
        .text(
          `${lang} · ${peak.month} · indexed value ${peak.v} (0–100 to this language edition’s own max; absolute monthly views not in wiki_lang.json)`
        );
    }
  });

  ctx.tableApi = tableApi;
}

export function update(step) {
  if (!ctx) return;
  const n = typeof step === "number" ? step : parseInt(String(step).split("-").pop(), 10) || 1;
  const focus = new Set(n >= 2 ? ["en", "ja", "zh", "ko", "es"] : []);
  if (ctx.tableApi?.visual) {
    d3.select(ctx.tableApi.visual)
      .selectAll(".wiki-strip")
      .classed("is-focus", function () {
        if (!focus.size) return false;
        const lab = this.querySelector(".wiki-strip-lang")?.textContent || "";
        return [...focus].some((l) => lab.startsWith(l));
      });
  }
  ctx.tableApi?.refreshTable();
}
