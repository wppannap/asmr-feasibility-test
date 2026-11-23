/* Correlation table + growth vs internet scatter (Trends v3c) */
import {
  appendSvg,
  attachTableToggle,
  clear,
  countryName,
  fmt,
  setCaveat,
  sizeOf,
} from "./util.js";

const PAIR_ROWS = [
  { key: "growth_vs_internet", label: "Growth vs internet users %" },
  { key: "growth_vs_youth", label: "Growth vs youth share % (15–24)" },
];

const FRAME_OPTS = [
  { id: "ok_with_TWN", label: "ok · with TWN" },
  { id: "ok_excl_TWN", label: "ok · without TWN" },
  { id: "strict_ok_with_TWN", label: "strict-ok · with TWN" },
  { id: "strict_ok_excl_TWN", label: "strict-ok · without TWN" },
];

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
      "Association between a region's search trend and a context indicator; not evidence about who uses ASMR; Trends indices cannot be compared across regions in level"
    );

  const controls = wrap.append("div").attr("class", "control-row chart-controls");
  controls.append("span").attr("class", "control-label").text("Frame");
  const seg = controls.append("div").attr("class", "seg").attr("id", "corr-frame-toggle");
  FRAME_OPTS.forEach((opt, i) => {
    seg
      .append("button")
      .attr("type", "button")
      .attr("data-frame", opt.id)
      .classed("is-active", i === 0)
      .text(opt.label);
  });

  const tableHost = wrap.append("div").attr("class", "corr-table-host").node();

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
    frame: "ok_with_TWN",
    showChart: false,
    tableApi: null,
  };

  seg.selectAll("button").on("click", function () {
    seg.selectAll("button").classed("is-active", false);
    d3.select(this).classed("is-active", true);
    ctx.frame = this.dataset.frame;
    renderCorrTable(tableHost, scatter, ctx.frame);
    if (ctx.showChart) drawScatter();
  });

  d3.select("#scatter-view-toggle").on("click", function () {
    ctx.showChart = !ctx.showChart;
    d3.select(this)
      .attr("aria-pressed", ctx.showChart ? "true" : "false")
      .text(ctx.showChart ? "Hide chart" : "View as chart");
    d3.select(plotHost).attr("hidden", ctx.showChart ? null : true);
    d3.select(rhoEl).attr("hidden", ctx.showChart ? null : true);
    if (ctx.showChart) drawScatter();
  });

  renderCorrTable(tableHost, scatter, ctx.frame);
  setCaveat(caveatEl, scatter.meta?.caveats || []);
  return ctx;
}

function renderCorrTable(host, scatter, frameId) {
  const wrap = d3.select(host);
  wrap.selectAll("*").remove();
  const fam = (scatter.families || {})[frameId] || {};
  const raw = fam.raw || {};
  const part = fam.partial_noise || {};

  const table = wrap.append("table").attr("class", "corr-table");
  table
    .append("thead")
    .append("tr")
    .selectAll("th")
    .data(["Pair", "n", "raw ρ", "95% CI", "Holm p", "partial ρ (noise)", "partial CI", "partial Holm p"])
    .join("th")
    .text((d) => d);

  const tbody = table.append("tbody");
  PAIR_ROWS.forEach((pr) => {
    const r = raw[pr.key] || {};
    const p = part[pr.key] || {};
    const tr = tbody.append("tr");
    tr.append("td").text(pr.label);
    tr.append("td").text(r.n ?? "—");
    tr.append("td").text(r.rho == null ? "—" : fmt(r.rho, 3));
    tr.append("td").text(
      r.ci95_low == null ? "—" : `[${fmt(r.ci95_low, 3)}, ${fmt(r.ci95_high, 3)}]`
    );
    tr.append("td").text(r.p_holm == null ? "—" : fmt(r.p_holm, 3));
    tr.append("td").text(p.rho == null ? "—" : fmt(p.rho, 3));
    tr.append("td").text(
      p.ci95_low == null ? "—" : `[${fmt(p.ci95_low, 3)}, ${fmt(p.ci95_high, 3)}]`
    );
    tr.append("td").text(p.p_holm == null ? "—" : fmt(p.p_holm, 3));
  });

  attachTableToggle(host, () => ({
    columns: [
      "pair",
      "n",
      "raw_rho",
      "raw_ci",
      "raw_holm",
      "partial_rho",
      "partial_ci",
      "partial_holm",
    ],
    rows: PAIR_ROWS.map((pr) => {
      const r = raw[pr.key] || {};
      const p = part[pr.key] || {};
      return [
        pr.label,
        r.n,
        r.rho,
        r.ci95_low == null ? null : [r.ci95_low, r.ci95_high],
        r.p_holm,
        p.rho,
        p.ci95_low == null ? null : [p.ci95_low, p.ci95_high],
        p.p_holm,
      ];
    }),
  }));
}

function drawScatter() {
  if (!ctx) return;
  const { scatter, plotHost, rhoEl, frame } = ctx;
  clear(plotHost);
  const points = (scatter.scatter_points || []).filter((d) => {
    if (d.growth_ratio == null || d.internet == null) return false;
    if (frame.startsWith("strict_ok") && !d.strict_ok) return false;
    if (frame.endsWith("excl_TWN") && d.iso3 === "TWN") return false;
    return true;
  });

  const fam = (scatter.families || {})[frame] || {};
  const stats = (fam.raw || {}).growth_vs_internet || {};
  d3.select(rhoEl)
    .attr("hidden", null)
    .text(
      `growth vs internet · n=${stats.n ?? "—"} · ρ=${
        stats.rho == null ? "—" : fmt(stats.rho, 3)
      } · Holm p=${stats.p_holm == null ? "—" : fmt(stats.p_holm, 3)}`
    );

  const { width } = sizeOf(plotHost);
  const w = Math.min(width - 8, 560);
  const h = 320;
  const margin = { top: 16, right: 16, bottom: 40, left: 48 };
  const svg = appendSvg(
    plotHost,
    w,
    h,
    "Scatter of growth ratio versus internet users percent"
  );
  const g = svg
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);
  const innerW = w - margin.left - margin.right;
  const innerH = h - margin.top - margin.bottom;
  const x = d3
    .scaleLinear()
    .domain(d3.extent(points, (d) => d.internet))
    .nice()
    .range([0, innerW]);
  const y = d3
    .scaleLinear()
    .domain(d3.extent(points, (d) => d.growth_ratio))
    .nice()
    .range([innerH, 0]);
  g.append("g")
    .attr("transform", `translate(0,${innerH})`)
    .call(d3.axisBottom(x).ticks(5))
    .attr("aria-hidden", "true");
  g.append("g").call(d3.axisLeft(y).ticks(5)).attr("aria-hidden", "true");
  g.selectAll("circle")
    .data(points)
    .join("circle")
    .attr("cx", (d) => x(d.internet))
    .attr("cy", (d) => y(d.growth_ratio))
    .attr("r", 3.5)
    .attr("fill", "#1b6ca8")
    .attr("fill-opacity", 0.75)
    .append("title")
    .text((d) => `${countryName(d.iso3)}: growth=${fmt(d.growth_ratio, 3)}, internet=${fmt(d.internet, 1)}`);
}

export function update() {
  /* no-op steps */
}
