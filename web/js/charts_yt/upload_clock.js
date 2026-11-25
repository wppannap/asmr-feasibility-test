/* Upload clock: 24h radial profiles JP/KR/TW/HK (unpublished). */
import { attachTableToggle, clear, fmt, setCaveat } from "../charts/util.js";
import { themeColors } from "../theme.js";
import { renderReviewBanner } from "./review.js";

const RULES = [
  { id: "strict", label: "strict" },
  { id: "title_only", label: "title_only" },
];
const REGIONS = ["JP", "KR", "TW", "HK"];

let ctx = null;

export function render(container, data) {
  clear(container);
  const payload = data.upload_clock || data;
  const meta = payload.meta || {};
  const rows = payload.rows || [];
  const profiles = payload.hourly_profiles || [];
  const caveatEl = data.caveatEl;

  const wrap = d3.select(container);
  wrap.append("h3").attr("class", "chart-section-title").text("Upload clock · local hour");
  wrap
    .append("p")
    .attr("class", "chart-subtitle")
    .text(meta.scope_line || "videos labelled as ASMR (excluding ambient-noise content)");
  const ok = renderReviewBanner(wrap, meta);
  setCaveat(caveatEl, meta.caveats || []);
  if (!ok) return;

  ctx = { rows, profiles, rule: "strict", meta };
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
}

function tableRows() {
  return {
    columns: [
      "region",
      "script_group",
      "n_ch_sleep",
      "n_ch_not",
      "night_sleep_CI",
      "night_not_CI",
      "diff_CI",
      "sleep_gt_not",
    ],
    rows: ctx.rows
      .filter((r) => r.rule === ctx.rule)
      .map((r) => [
        r.region,
        r.script_group,
        r.n_ch_sleep,
        r.n_ch_not,
        fmtCI(r.night_sleep?.ci95 || r.night_sleep_CI),
        fmtCI(r.night_not?.ci95 || r.night_not_CI),
        fmtCI(r.night_diff_sleep_minus_not?.ci95 || r.diff_ci),
        String(r.direction_sleep_gt_not ?? ""),
      ]),
  };
}

function fmtCI(ci) {
  if (!Array.isArray(ci) || ci.length < 2) return "—";
  return `[${fmt(ci[0], 3)}, ${fmt(ci[1], 3)}]`;
}

function draw() {
  const mount = ctx.mount;
  clear(mount);
  const w = Math.max(320, mount.clientWidth || 640);
  const cell = Math.min(280, Math.floor(w / 2) - 8);
  const svg = d3
    .select(mount)
    .append("svg")
    .attr("viewBox", `0 0 ${w} ${cell * 2 + 16}`)
    .attr("width", "100%")
    .attr("role", "img")
    .attr("aria-label", "24-hour upload radial profiles");

  const c = themeColors();
  REGIONS.forEach((region, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const g = svg
      .append("g")
      .attr("transform", `translate(${col * cell + cell / 2},${row * cell + cell / 2 + 8})`);
    g.append("text")
      .attr("text-anchor", "middle")
      .attr("y", -cell / 2 + 14)
      .attr("font-size", 12)
      .attr("font-weight", 700)
      .attr("fill", c.ink)
      .text(region);
    const sleep = ctx.profiles.find(
      (p) => p.rule === ctx.rule && p.region === region && p.arm === "sleep"
    );
    const not = ctx.profiles.find(
      (p) => p.rule === ctx.rule && p.region === region && p.arm === "not"
    );
    drawRadial(g, sleep?.profile, cell * 0.38, c.accent);
    drawRadial(g, not?.profile, cell * 0.38, c.neg, true);
  });
}

function drawRadial(g, profile, R, color, dashed = false) {
  if (!profile?.mean) return;
  const angle = d3.scaleLinear().domain([0, 24]).range([0, 2 * Math.PI]);
  const max = d3.max(profile.mean) || 0.1;
  const r = d3.scaleLinear().domain([0, max]).range([0, R]);
  const line = d3
    .lineRadial()
    .angle((d, i) => angle(i))
    .radius((d) => r(d))
    .curve(d3.curveCardinalClosed);
  // band
  if (profile.ci95_low && profile.ci95_high) {
    const area = d3
      .areaRadial()
      .angle((d, i) => angle(i))
      .innerRadius((d, i) => r(profile.ci95_low[i]))
      .outerRadius((d, i) => r(profile.ci95_high[i]))
      .curve(d3.curveCardinalClosed);
    g.append("path")
      .attr("d", area(profile.mean))
      .attr("fill", color)
      .attr("opacity", 0.15);
  }
  g.append("path")
    .attr("d", line(profile.mean))
    .attr("fill", "none")
    .attr("stroke", color)
    .attr("stroke-width", 1.5)
    .attr("stroke-dasharray", dashed ? "3 2" : null);
  // hour ticks
  for (let h = 0; h < 24; h += 6) {
    const a = angle(h) - Math.PI / 2;
    g.append("text")
      .attr("x", Math.cos(a) * (R + 10))
      .attr("y", Math.sin(a) * (R + 10))
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .attr("font-size", 9)
      .text(`${h}`);
  }
}

export function update() {}
