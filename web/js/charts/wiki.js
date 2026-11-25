/* Wikipedia language small multiples — indexed series; shared-y toggle */
import { attachTableToggle, clear, setCaveat, sizeOf } from "./util.js";
import { themeColors } from "../theme.js";

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

  const host = wrap.append("div").attr("class", "wiki-host").node();

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

  const grid = d3.select(tableApi.visual).append("div").attr("class", "wiki-grid").node();
  const { width } = sizeOf(tableApi.visual);
  const cellW = Math.floor((width - 24) / (width < 500 ? 2 : width < 800 ? 3 : 4));
  const cellH = 72;
  const x = d3.scalePoint().domain(d3.range(months.length)).range([4, cellW - 4]);

  let globalMax = 100;
  if (sharedY) {
    globalMax =
      d3.max(langs, (lang) => d3.max(series[lang] || [], (v) => v)) || 100;
  }

  langs.forEach((lang) => {
    const vals = series[lang] || [];
    const isLow = lowTraffic.has(lang);
    const stroke = isLow ? themeColors().muted : themeColors().accent;
    const cell = d3
      .select(grid)
      .append("div")
      .attr("class", isLow ? "wiki-cell is-low-traffic" : "wiki-cell");
    cell
      .append("div")
      .attr("class", "wiki-lang")
      .text(
        isLow
          ? `language edition: ${lang} (low traffic)`
          : `language edition: ${lang}`
      );

    const svg = cell
      .append("svg")
      .attr("viewBox", `0 0 ${cellW} ${cellH}`)
      .attr("width", "100%")
      .attr("height", cellH)
      .attr("role", "img")
      .attr(
        "aria-label",
        `Indexed Wikipedia pageviews for language edition ${lang}, concept ${concept}`
      )
      .attr("focusable", "false");

    const yMax = sharedY ? globalMax : 100;
    const y = d3.scaleLinear().domain([0, yMax]).range([cellH - 6, 8]);
    const pts = vals
      .map((v, i) => (v == null ? null : { i, v, month: months[i] }))
      .filter(Boolean);

    svg
      .append("path")
      .datum(pts)
      .attr("fill", "none")
      .attr("stroke", stroke)
      .attr("stroke-width", 1.4)
      .attr(
        "d",
        d3
          .line()
          .x((d) => x(d.i))
          .y((d) => y(d.v))
      );

    svg
      .selectAll("circle")
      .data(pts)
      .join("circle")
      .attr("cx", (d) => x(d.i))
      .attr("cy", (d) => y(d.v))
      .attr("r", 1.6)
      .attr("fill", stroke)
      .append("title")
      .text(
        (d) =>
          `${lang} · ${d.month} · indexed value ${d.v} (0–100 to this language edition’s own max; absolute monthly views not in wiki_lang.json)`
      );
  });

  ctx.tableApi = tableApi;
}

export function update(step) {
  if (!ctx) return;
  const n = typeof step === "number" ? step : parseInt(String(step).split("-").pop(), 10) || 1;
  const focus = new Set(n >= 2 ? ["en", "ja", "zh", "ko", "es"] : []);
  if (ctx.tableApi?.visual) {
    d3.select(ctx.tableApi.visual)
      .selectAll(".wiki-cell")
      .classed("is-focus", function () {
        if (!focus.size) return false;
        const lab = this.querySelector(".wiki-lang")?.textContent || "";
        return [...focus].some((l) => lab.includes(`: ${l}`));
      });
  }
  ctx.tableApi?.refreshTable();
}
