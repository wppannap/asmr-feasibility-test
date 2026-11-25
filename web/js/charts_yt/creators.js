/* Dual-core orbital bubbles — pack layout + spotlight hover. */
import { attachTableToggle, clear, fmt, setCaveat } from "../charts/util.js?v=20261125c";
import { themeColors } from "../theme.js?v=20261125c";
import { renderReviewBanner } from "./review.js?v=20261125c";

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
  const w = Math.max(300, mount.clientWidth || 480);
  const h = Math.max(320, Math.min(520, w * 0.85));
  const c = themeColors();

  const root = {
    children: data.map((d) => ({
      ...d,
      value: Math.max(1, d.n_channels || 1),
    })),
  };

  const pack = d3.pack().size([w - 8, h - 8]).padding(4);
  const hierarchy = pack(d3.hierarchy(root).sum((d) => d.value));
  const leaves = hierarchy.leaves();

  const svg = d3
    .select(mount)
    .append("svg")
    .attr("viewBox", `0 0 ${w} ${h}`)
    .attr("width", "100%")
    .attr("role", "img")
    .attr("aria-label", "Orbital bubbles of creators by declared country");

  const g = svg.append("g").attr("transform", "translate(4,4)");
  const nodes = g
    .selectAll("g.bubble")
    .data(leaves)
    .join("g")
    .attr("class", "bubble")
    .attr("transform", (d) => `translate(${d.x},${d.y})`);

  // Subtle outer orbital rings on major bubbles
  nodes
    .filter((d) => d.r > 22 && d.data.country !== "unknown")
    .append("circle")
    .attr("class", "bubble-orbit")
    .attr("r", (d) => d.r + 5)
    .attr("fill", "none")
    .attr("stroke", c.line)
    .attr("stroke-width", 0.8)
    .attr("stroke-dasharray", "2.5 2.5")
    .attr("opacity", 0.7);

  nodes
    .append("circle")
    .attr("class", "bubble-shell")
    .attr("r", (d) => d.r)
    .attr("fill", (d) => (d.data.country === "unknown" ? "transparent" : c.bg2))
    .attr("stroke", (d) => (d.data.country === "unknown" ? c.muted : c.accent))
    .attr("stroke-width", (d) => (d.data.country === "unknown" ? 1.2 : 1))
    .attr("stroke-dasharray", (d) => (d.data.country === "unknown" ? "3 2.5" : null))
    .attr("opacity", (d) => (d.data.country === "unknown" ? 0.55 : 0.95));

  nodes
    .append("circle")
    .attr("class", "bubble-core")
    .attr("r", (d) => {
      const share = d.data.share_videos_from_top5pct_channels;
      if (share == null) return Math.max(2, d.r * 0.15);
      return Math.max(2.5, d.r * (0.2 + 0.55 * share));
    })
    .attr("fill", (d) => (d.data.country === "unknown" ? c.muted : c.accent))
    .attr("opacity", (d) => (d.data.country === "unknown" ? 0.25 : 0.55));

  // Spotlight ring (hidden until hover)
  nodes
    .append("circle")
    .attr("class", "bubble-spotlight")
    .attr("r", (d) => d.r + 3)
    .attr("fill", "none")
    .attr("stroke", c.accent)
    .attr("stroke-width", 1.6)
    .attr("opacity", 0);

  nodes
    .append("title")
    .text(
      (d) =>
        `${d.data.country}: ${d.data.n_channels} channels` +
        (d.data.share_videos_from_top5pct_channels != null
          ? `, top5% share ${fmt(d.data.share_videos_from_top5pct_channels * 100, 1)}%`
          : "")
    );

  nodes
    .filter((d) => d.r > 18)
    .append("text")
    .attr("text-anchor", "middle")
    .attr("dy", "0.35em")
    .attr("font-size", (d) => Math.min(12, d.r * 0.35))
    .attr("fill", c.ink)
    .attr("pointer-events", "none")
    .text((d) => {
      const share =
        d.data.share_videos_from_top5pct_channels != null
          ? ` ${fmt(d.data.share_videos_from_top5pct_channels * 100, 0)}%`
          : "";
      return `${d.data.country}${share}`;
    });

  // Editorial spotlight hover: highlight + dim others
  nodes
    .style("cursor", "pointer")
    .on("pointerenter", function () {
      nodes.attr("opacity", 0.35);
      d3.select(this).attr("opacity", 1);
      d3.select(this).select(".bubble-spotlight").attr("opacity", 1);
    })
    .on("pointerleave", function () {
      nodes.attr("opacity", 1);
      nodes.select(".bubble-spotlight").attr("opacity", 0);
    });

  const known = leaves.filter((d) => d.data.country !== "unknown");
  const top = known.sort((a, b) => b.data.n_channels - a.data.n_channels)[0];
  const unk = leaves.find((d) => d.data.country === "unknown");
  function callout(node, text) {
    if (!node) return;
    const lx = Math.min(w - 12, node.x + node.r + 18);
    const ly = Math.max(12, node.y - node.r - 6);
    g.append("path")
      .attr("class", "anno-leader")
      .attr(
        "d",
        `M${node.x + node.r * 0.7},${node.y - node.r * 0.7} Q${node.x + node.r + 10},${ly} ${lx},${ly}`
      );
    g.append("text")
      .attr("class", "anno-label")
      .attr("x", lx + 2)
      .attr("y", ly + 3)
      .attr("fill", c.muted)
      .text(text);
  }
  if (top) callout(top, top.data.country);
  if (unk) callout(unk, "unknown");
}

export function update() {
  if (ctx?.mount) draw();
}
