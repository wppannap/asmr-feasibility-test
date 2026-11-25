/* Correlation cards/table + growth vs internet/youth scatter (Trends v3c) */
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
  { id: "ok_with_TWN", label: "measured · with TWN" },
  { id: "ok_excl_TWN", label: "measured · without TWN" },
  { id: "strict_ok_with_TWN", label: "strict measured · with TWN" },
  { id: "strict_ok_excl_TWN", label: "strict measured · without TWN" },
];

const X_OPTS = [
  { id: "internet", label: "Internet users %", field: "internet_users_pct", pair: "growth_vs_internet" },
  { id: "youth", label: "Youth share % (15–24)", field: "youth_share_15_24_pct", pair: "growth_vs_youth" },
];

let ctx = null;

export function render(container, data) {
  clear(container);
  const { scatter, scatterPoints, caveatEl } = data;

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

  const xControls = wrap.append("div").attr("class", "control-row chart-controls");
  xControls.append("span").attr("class", "control-label").text("X axis");
  const xSeg = xControls.append("div").attr("class", "seg").attr("id", "scatter-x-toggle");
  X_OPTS.forEach((opt, i) => {
    xSeg
      .append("button")
      .attr("type", "button")
      .attr("data-x", opt.id)
      .classed("is-active", i === 0)
      .text(opt.label);
  });

  const tableHost = wrap.append("div").attr("class", "corr-table-host").node();
  const cardsHost = wrap.append("div").attr("class", "corr-cards-host").node();

  const chrome = wrap.append("div").attr("class", "control-row chart-controls");
  chrome
    .append("button")
    .attr("type", "button")
    .attr("class", "view-chart-btn")
    .attr("id", "scatter-view-toggle")
    .attr("aria-pressed", "true")
    .text("View as table");

  const rhoEl = wrap.append("p").attr("class", "corr-badge");
  const clipNote = wrap
    .append("p")
    .attr("class", "chart-note")
    .text("Y values are clipped for the chart; tooltip shows the true growth ratio.");

  const plotHost = wrap.append("div").attr("class", "scatter-host").node();
  const pointsTableHost = wrap
    .append("div")
    .attr("class", "scatter-table-host")
    .attr("hidden", true)
    .node();

  const points = (scatterPoints && scatterPoints.points) || [];

  ctx = {
    scatter,
    points,
    plotHost,
    pointsTableHost,
    rhoEl,
    caveatEl,
    frame: "ok_with_TWN",
    xMode: "internet",
    showChart: true,
  };

  seg.selectAll("button").on("click", function () {
    seg.selectAll("button").classed("is-active", false);
    d3.select(this).classed("is-active", true);
    ctx.frame = this.dataset.frame;
    renderCorrSummary(tableHost, cardsHost, scatter, ctx.frame);
    redraw();
  });

  xSeg.selectAll("button").on("click", function () {
    xSeg.selectAll("button").classed("is-active", false);
    d3.select(this).classed("is-active", true);
    ctx.xMode = this.dataset.x;
    redraw();
  });

  d3.select("#scatter-view-toggle").on("click", function () {
    ctx.showChart = !ctx.showChart;
    d3.select(this)
      .attr("aria-pressed", ctx.showChart ? "true" : "false")
      .text(ctx.showChart ? "View as table" : "View as chart");
    d3.select(plotHost).attr("hidden", ctx.showChart ? null : true);
    d3.select(rhoEl).attr("hidden", ctx.showChart ? null : true);
    d3.select(clipNote).attr("hidden", ctx.showChart ? null : true);
    d3.select(pointsTableHost).attr("hidden", ctx.showChart ? true : null);
    redraw();
  });

  renderCorrSummary(tableHost, cardsHost, scatter, ctx.frame);
  setCaveat(caveatEl, [
    ...(scatter.meta?.caveats || []),
    ...(scatterPoints?.meta?.caveats || []),
  ]);
  redraw();
  return ctx;
}

function renderCorrSummary(tableHost, cardsHost, scatter, frameId) {
  const fam = (scatter.families || {})[frameId] || {};
  const raw = fam.raw || {};
  const part = fam.partial_noise || {};

  // Desktop / wide: table
  const wrap = d3.select(tableHost);
  wrap.selectAll("*").remove();
  const table = wrap.append("table").attr("class", "corr-table corr-table-wide");
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

  // Mobile: one card per pair (avoids clipping the first column)
  const cards = d3.select(cardsHost);
  cards.selectAll("*").remove();
  PAIR_ROWS.forEach((pr) => {
    const r = raw[pr.key] || {};
    const p = part[pr.key] || {};
    const card = cards.append("article").attr("class", "corr-card");
    card.append("h4").attr("class", "corr-card-title").text(pr.label);
    const dl = card.append("dl").attr("class", "corr-card-dl");
    const rows = [
      ["n", r.n ?? "—"],
      ["ρ", r.rho == null ? "—" : fmt(r.rho, 3)],
      ["95% CI", r.ci95_low == null ? "—" : `[${fmt(r.ci95_low, 3)}, ${fmt(r.ci95_high, 3)}]`],
      ["Holm p", r.p_holm == null ? "—" : fmt(r.p_holm, 3)],
      ["partial ρ", p.rho == null ? "—" : fmt(p.rho, 3)],
      ["partial CI", p.ci95_low == null ? "—" : `[${fmt(p.ci95_low, 3)}, ${fmt(p.ci95_high, 3)}]`],
    ];
    rows.forEach(([k, v]) => {
      dl.append("dt").text(k);
      dl.append("dd").text(v);
    });
  });
}

function filteredPoints() {
  const { points, frame } = ctx;
  return points.filter((d) => {
    if (d.growth_clipped == null && d.growth_ratio == null) return false;
    if (frame.startsWith("strict_ok") && !d.strict_ok) return false;
    if (frame.endsWith("excl_TWN") && d.iso3 === "TWN") return false;
    return true;
  });
}

function xOpt() {
  return X_OPTS.find((o) => o.id === ctx.xMode) || X_OPTS[0];
}

function updateRhoBadge() {
  const { scatter, frame, rhoEl } = ctx;
  const opt = xOpt();
  const fam = (scatter.families || {})[frame] || {};
  const stats = (fam.raw || {})[opt.pair] || {};
  d3.select(rhoEl).text(
    `${opt.label} · n=${stats.n ?? "—"} · ρ=${
      stats.rho == null ? "—" : fmt(stats.rho, 3)
    } · 95% CI ${
      stats.ci95_low == null
        ? "—"
        : `[${fmt(stats.ci95_low, 3)}, ${fmt(stats.ci95_high, 3)}]`
    } · Holm p=${stats.p_holm == null ? "—" : fmt(stats.p_holm, 3)}`
  );
}

function drawScatter() {
  if (!ctx) return;
  const { plotHost } = ctx;
  clear(plotHost);
  updateRhoBadge();

  const opt = xOpt();
  const points = filteredPoints().filter((d) => d[opt.field] != null && d.growth_clipped != null);
  if (!points.length) {
    d3.select(plotHost)
      .append("p")
      .attr("class", "chart-note")
      .text("No points for this frame / axis.");
    return;
  }

  const { width } = sizeOf(plotHost);
  const w = Math.max(Math.min(width - 8, 640), 280);
  const h = 320;
  const margin = { top: 16, right: 16, bottom: 44, left: 52 };
  const svg = appendSvg(
    plotHost,
    w,
    h,
    `Scatter of clipped growth versus ${opt.label}`
  );
  const g = svg
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);
  const innerW = w - margin.left - margin.right;
  const innerH = h - margin.top - margin.bottom;

  const x = d3
    .scaleLinear()
    .domain(d3.extent(points, (d) => d[opt.field]))
    .nice()
    .range([0, innerW]);
  const y = d3
    .scaleLinear()
    .domain(d3.extent(points, (d) => d.growth_clipped))
    .nice()
    .range([innerH, 0]);

  g.append("g")
    .attr("transform", `translate(0,${innerH})`)
    .call(d3.axisBottom(x).ticks(5))
    .attr("aria-hidden", "true");
  g.append("g").call(d3.axisLeft(y).ticks(5)).attr("aria-hidden", "true");

  // Horizontal reference at growth_clipped = 0 (no regression line)
  if (y.domain()[0] <= 0 && y.domain()[1] >= 0) {
    g.append("line")
      .attr("class", "scatter-zero")
      .attr("x1", 0)
      .attr("x2", innerW)
      .attr("y1", y(0))
      .attr("y2", y(0))
      .attr("stroke", "#667788")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "4 3");
  }

  const tip = (d) => {
    const name = countryName(d.iso3) || d.name || d.iso3;
    const trueG = d.growth_ratio == null ? "—" : fmt(d.growth_ratio, 3);
    const clipG = d.growth_clipped == null ? "—" : fmt(d.growth_clipped, 3);
    const xv = d[opt.field] == null ? "—" : fmt(d[opt.field], 1);
    return `${name}: growth=${trueG} (clipped ${clipG}), ${opt.label}=${xv}${
      d.small_base ? "; small base" : ""
    }`;
  };

  const significant = (d) => d.mk_class === "rising" || d.mk_class === "falling";

  const nodes = g
    .selectAll("circle.scatter-pt")
    .data(points, (d) => d.iso3)
    .join("circle")
    .attr("class", "scatter-pt")
    .attr("cx", (d) => x(d[opt.field]))
    .attr("cy", (d) => y(d.growth_clipped))
    .attr("r", 4)
    .attr("tabindex", 0)
    .attr("role", "img")
    .attr("aria-label", tip)
    .attr("fill", (d) => (significant(d) ? "#1b6ca8" : "none"))
    .attr("fill-opacity", (d) => (significant(d) ? 0.85 : 0))
    .attr("stroke", "#1b6ca8")
    .attr("stroke-width", (d) => (d.small_base ? 1.6 : 1.2))
    .attr("stroke-dasharray", (d) => (d.small_base ? "2 1.5" : null));

  nodes.append("title").text(tip);

  // Label TWN
  points
    .filter((d) => d.iso3 === "TWN" || (d.flags || []).includes("TWN"))
    .forEach((d) => {
      g.append("text")
        .attr("class", "scatter-label")
        .attr("x", x(d[opt.field]) + 6)
        .attr("y", y(d.growth_clipped) + 3)
        .attr("font-size", 10)
        .attr("fill", "#1a242c")
        .text("TWN");
    });
}

function drawPointsTable() {
  const { pointsTableHost } = ctx;
  clear(pointsTableHost);
  updateRhoBadge();
  const opt = xOpt();
  const points = filteredPoints();
  const tableApi = attachTableToggle(pointsTableHost, () => ({
    columns: [
      "iso3",
      "name",
      "growth_ratio",
      "growth_clipped",
      "mk_class",
      "strict_ok",
      "small_base",
      opt.field,
    ],
    rows: points.map((d) => [
      d.iso3,
      d.name,
      d.growth_ratio,
      d.growth_clipped,
      d.mk_class,
      d.strict_ok,
      d.small_base,
      d[opt.field],
    ]),
  }));
  // force table view visible
  const btn = tableApi?.visual?.parentElement?.querySelector?.(".table-toggle");
  if (btn && btn.getAttribute("aria-pressed") !== "true") {
    btn.click();
  }
}

function redraw() {
  if (!ctx) return;
  if (ctx.showChart) drawScatter();
  else drawPointsTable();
}

export function update() {
  /* no-op steps */
}
