/* Creators by declared country + unknown (unpublished). */
import { attachTableToggle, clear, fmt, setCaveat } from "../charts/util.js";
import { themeColors } from "../theme.js";
import { renderReviewBanner } from "./review.js";

const RULES = [
  { id: "strict", label: "strict" },
  { id: "title_only", label: "title_only" },
];

let ctx = null;
let resizeBound = false;

export function render(container, data) {
  clear(container);
  const payload = data.creators || data;
  const meta = payload.meta || {};
  const rows = payload.rows || [];
  const caveatEl = data.caveatEl;

  const wrap = d3.select(container);
  wrap.append("h3").attr("class", "chart-section-title").text("Creators · declared country");
  wrap
    .append("p")
    .attr("class", "chart-subtitle")
    .text(meta.scope_line || "videos labelled as ASMR (excluding ambient-noise content)");
  const ok = renderReviewBanner(wrap, meta);
  setCaveat(caveatEl, meta.caveats || []);
  if (!ok) return;

  ctx = { rows, rule: "title_only" };
  const controls = wrap.append("div").attr("class", "control-row chart-controls");
  controls.append("span").attr("class", "control-label").text("Rule");
  const seg = controls.append("div").attr("class", "seg");
  RULES.forEach((o) => {
    seg
      .append("button")
      .attr("type", "button")
      .classed("is-active", o.id === ctx.rule)
      .text(o.label)
      .on("click", function () {
        ctx.rule = o.id;
        seg.selectAll("button").classed("is-active", false);
        d3.select(this).classed("is-active", true);
        draw();
      });
  });

  const tableApi = attachTableToggle(wrap.node(), () => tableRows());
  ctx.mount = tableApi.visual;
  draw();
  if (!resizeBound) {
    resizeBound = true;
    let t = 0;
    window.addEventListener(
      "resize",
      () => {
        clearTimeout(t);
        t = setTimeout(() => {
          if (ctx?.mount) draw();
        }, 150);
      },
      { passive: true }
    );
  }
}

function filtered() {
  return ctx.rows
    .filter((r) => r.rule === ctx.rule)
    .slice()
    .sort((a, b) => {
      if (a.country === "unknown") return 1;
      if (b.country === "unknown") return -1;
      return (b.n_channels || 0) - (a.n_channels || 0);
    });
}

function tableRows() {
  return {
    columns: ["country", "n_channels", "n_videos", "top5pct_channels", "share_top5pct"],
    rows: filtered().map((r) => [
      r.country,
      r.n_channels,
      r.n_videos,
      r.top5pct_channels,
      r.share_videos_from_top5pct_channels != null
        ? fmt(r.share_videos_from_top5pct_channels * 100, 1) + "%"
        : "—",
    ]),
  };
}

function draw() {
  const mount = ctx.mount;
  clear(mount);
  const data = filtered();
  const w = Math.max(320, mount.clientWidth || 480);
  const barH = 22;
  const h = Math.max(200, 40 + data.length * barH);
  const svg = d3
    .select(mount)
    .append("svg")
    .attr("viewBox", `0 0 ${w} ${h}`)
    .attr("width", "100%")
    .attr("role", "img")
    .attr("aria-label", "Channels by declared country");
  const margin = { top: 8, right: 72, bottom: 8, left: 56 };
  const iw = w - margin.left - margin.right;
  const ih = h - margin.top - margin.bottom;
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
  const y = d3
    .scaleBand()
    .domain(data.map((d) => d.country))
    .range([0, ih])
    .padding(0.15);
  const x = d3
    .scaleLinear()
    .domain([0, d3.max(data, (d) => d.n_channels) || 1])
    .nice()
    .range([0, iw]);
  g.append("g").call(d3.axisLeft(y));
  g.append("g").attr("transform", `translate(0,${ih})`).call(d3.axisBottom(x).ticks(5));
  const c = themeColors();
  g.selectAll("rect")
    .data(data)
    .join("rect")
    .attr("y", (d) => y(d.country))
    .attr("height", y.bandwidth())
    .attr("x", 0)
    .attr("width", (d) => x(d.n_channels || 0))
    .attr("fill", (d) => (d.country === "unknown" ? c.muted : c.accent));
  g.selectAll("text.share")
    .data(data)
    .join("text")
    .attr("class", "share")
    .attr("x", (d) => x(d.n_channels || 0) + 4)
    .attr("y", (d) => y(d.country) + y.bandwidth() / 2)
    .attr("dy", "0.35em")
    .attr("font-size", 11)
    .attr("fill", c.ink)
    .text((d) =>
      d.share_videos_from_top5pct_channels != null
        ? `top5% ${fmt(d.share_videos_from_top5pct_channels * 100, 0)}%`
        : ""
    );
  const known = data.filter((d) => d.country !== "unknown");
  const top = known[0];
  const unk = data.find((d) => d.country === "unknown");
  function annotate(row, text) {
    if (!row) return;
    const yy = y(row.country) + y.bandwidth() / 2;
    const x1 = x(row.n_channels || 0);
    const x2 = Math.min(iw - 4, x1 + 40);
    g.append("path")
      .attr("class", "anno-leader")
      .attr("d", `M${x1},${yy} C${x1 + 14},${yy - 10} ${x2 - 10},${yy - 14} ${x2},${yy - 12}`);
    g.append("text")
      .attr("class", "anno-label")
      .attr("x", x2 + 2)
      .attr("y", yy - 10)
      .attr("fill", c.muted)
      .text(text);
  }
  if (top) annotate(top, top.country);
  if (unk) annotate(unk, "unknown");
}

export function update() {
  if (ctx?.mount) draw();
}
