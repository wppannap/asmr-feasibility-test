/* Correlation table + change_in_window vs internet scatter */
import {
  appendSvg,
  attachTableToggle,
  clear,
  countryName,
  fmt,
  setCaveat,
  sizeOf,
} from "./util.js";

/** Holm-family pairs only (4). Descriptive internet_vs_youth rendered separately. */
const PAIR_ROWS = [
  { key: "change_vs_internet", label: "Change in window vs internet users %" },
  { key: "change_vs_youth", label: "Change in window vs youth share % (15–24)" },
  { key: "recent_vs_internet", label: "Recent vs peak vs internet users %" },
  { key: "recent_vs_youth", label: "Recent vs peak vs youth share % (15–24)" },
];

const NO_INSOMNIA_NOTE =
  "Why no insomnia comparison? Google Trends indices are normalised within each request, so search levels of different terms cannot be compared across countries.";

let ctx = null;

export function render(container, data) {
  clear(container);
  const { scatter, caveatEl } = data;

  const wrap = d3.select(container);
  wrap
    .append("h3")
    .attr("class", "chart-section-title")
    .text("A question with no clear answer");
  wrap
    .append("p")
    .attr("class", "chart-subtitle")
    .text(
      "Country-level associations between each country's own ASMR search trend and context indicators; not evidence about who uses ASMR."
    );
  wrap
    .append("p")
    .attr("class", "chart-note")
    .text(NO_INSOMNIA_NOTE);

  const tableHost = wrap.append("div").attr("class", "corr-table-host").node();
  renderCorrTable(tableHost, scatter);

  const chrome = wrap.append("div").attr("class", "control-row chart-controls");
  chrome
    .append("button")
    .attr("type", "button")
    .attr("class", "view-chart-btn")
    .attr("id", "scatter-view-toggle")
    .attr("aria-pressed", "false")
    .text("View as chart");

  const plotHost = wrap
    .append("div")
    .attr("class", "scatter-host")
    .attr("hidden", true)
    .node();
  const rhoEl = wrap.append("p").attr("class", "corr-badge").attr("hidden", true);

  ctx = {
    scatter,
    plotHost,
    rhoEl,
    caveatEl,
    step: 1,
    showChart: false,
    tableApi: null,
  };

  d3.select("#scatter-view-toggle").on("click", function () {
    ctx.showChart = !ctx.showChart;
    d3.select(this)
      .attr("aria-pressed", ctx.showChart ? "true" : "false")
      .text(ctx.showChart ? "Hide chart" : "View as chart");
    d3.select(plotHost).attr("hidden", ctx.showChart ? null : true);
    d3.select(rhoEl).attr("hidden", ctx.showChart ? null : true);
    if (ctx.showChart) drawScatter();
  });

  setCaveat(caveatEl, scatter.meta?.caveats || []);
  return ctx;
}

function renderCorrTable(host, scatter) {
  const wrap = d3.select(host);
  wrap.selectAll("*").remove();
  const correlations = scatter.correlations || {};
  const descriptive =
    (scatter.correlations_descriptive || {}).internet_vs_youth || null;

  const table = wrap.append("table").attr("class", "corr-table");
  table
    .append("thead")
    .append("tr")
    .selectAll("th")
    .data(["Pair", "n", "ρ", "95% CI", "Holm p"])
    .join("th")
    .text((d) => d);

  const tbody = table.append("tbody");
  PAIR_ROWS.forEach((row) => {
    const c = correlations[row.key] || {};
    const survive =
      c.p_holm != null && Number.isFinite(c.p_holm) && c.p_holm < 0.05;
    const tr = tbody.append("tr").classed("holm-survive", survive);
    const ci =
      c.ci95_low == null || c.ci95_high == null
        ? "—"
        : `[${fmt(c.ci95_low, 3)}, ${fmt(c.ci95_high, 3)}]`;
    [
      row.label,
      c.n ?? "—",
      c.rho == null ? "—" : fmt(c.rho, 3),
      ci,
      c.p_holm == null ? "—" : fmt(c.p_holm, 4),
    ].forEach((val, i) => {
      const td = tr.append("td").text(val);
      if (survive && i >= 2) td.classed("holm-cell", true);
    });
  });

  if (descriptive) {
    wrap
      .append("p")
      .attr("class", "chart-note")
      .text("Context (not about ASMR; outside Holm family):");
    const dtable = wrap.append("table").attr("class", "corr-table corr-table-desc");
    dtable
      .append("thead")
      .append("tr")
      .selectAll("th")
      .data(["Pair", "n", "ρ", "95% CI", "Note"])
      .join("th")
      .text((d) => d);
    const ci =
      descriptive.ci95_low == null || descriptive.ci95_high == null
        ? "—"
        : `[${fmt(descriptive.ci95_low, 3)}, ${fmt(descriptive.ci95_high, 3)}]`;
    const tr = dtable.append("tbody").append("tr").classed("descriptive", true);
    [
      "Internet users % vs youth share % (15–24)",
      descriptive.n ?? "—",
      descriptive.rho == null ? "—" : fmt(descriptive.rho, 3),
      ci,
      "not about ASMR",
    ].forEach((val) => tr.append("td").text(val));
  }
}

function drawScatter() {
  const { scatter, plotHost, rhoEl } = ctx;
  clear(plotHost);

  const corr = scatter.correlations?.change_vs_internet || {};
  rhoEl.html(
    `Change in window vs internet users % · n = <strong>${
      corr.n ?? "—"
    }</strong> · Spearman ρ = <strong>${
      corr.rho == null ? "—" : fmt(corr.rho, 3)
    }</strong> · Holm p = <strong>${
      corr.p_holm == null ? "—" : fmt(corr.p_holm, 4)
    }</strong>`
  );

  const tableApi = attachTableToggle(plotHost, () => ({
    columns: ["iso3", "change_in_window", "internet_users_pct", "indicators_status"],
    rows: (scatter.countries || []).map((d) => [
      d.iso3,
      d.change_in_window,
      d.internet_users_pct,
      d.indicators_status,
    ]),
  }));
  ctx.tableApi = tableApi;

  const plot = tableApi.visual;
  plot.classList.add("chart-plot");

  const { width, height } = sizeOf(plot);
  const margin = { top: 16, right: 16, bottom: 40, left: 48 };
  const w = width - margin.left - margin.right;
  const h = height - margin.top - margin.bottom;
  const svg = appendSvg(
    plot,
    width,
    height,
    "Scatter of change in window versus internet users percent"
  );
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const rows = (scatter.countries || []).map((d) => ({
    ...d,
    x: d.change_in_window,
    y: d.internet_users_pct,
    missing: d.indicators_status === "missing" || d.internet_users_pct == null,
  }));
  const plotted = rows.filter((d) => d.x != null && d.y != null);

  const xExtent = d3.extent(plotted, (d) => d.x);
  const pad = Math.max(1, (xExtent[1] - xExtent[0]) * 0.08 || 1);
  const x = d3
    .scaleLinear()
    .domain([xExtent[0] - pad, xExtent[1] + pad])
    .nice()
    .range([0, w]);
  const y = d3
    .scaleLinear()
    .domain([0, (d3.max(plotted, (d) => d.y) || 100) * 1.05])
    .nice()
    .range([h, 0]);

  g.append("g")
    .attr("transform", `translate(0,${h})`)
    .call(d3.axisBottom(x).ticks(6));
  g.append("g").call(d3.axisLeft(y).ticks(6));

  g.append("text")
    .attr("x", w / 2)
    .attr("y", h + 32)
    .attr("text-anchor", "middle")
    .attr("font-size", 11)
    .attr("fill", "#5a6b76")
    .text("Change in window (own-peak points)");
  g.append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -h / 2)
    .attr("y", -36)
    .attr("text-anchor", "middle")
    .attr("font-size", 11)
    .attr("fill", "#5a6b76")
    .text("Internet users %");

  g.selectAll("circle")
    .data(plotted)
    .join("circle")
    .attr("cx", (d) => x(d.x))
    .attr("cy", (d) => y(d.y))
    .attr("r", 4)
    .attr("fill", "#0b6e4f")
    .attr("fill-opacity", 0.75)
    .append("title")
    .text(
      (d) =>
        `${countryName(d.iso3)}: change ${fmt(d.x, 1)}; internet ${fmt(d.y, 1)}%`
    );
}

export function update() {
  /* no-op: table is static; chart redrawn on toggle */
}
