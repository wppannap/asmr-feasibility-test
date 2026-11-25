/* Midnight-centered 24h upload waves — soft pastel dusk-to-midnight sky. */
import { attachTableToggle, clear, fmt, setCaveat } from "../charts/util.js?v=20261126g";
import { themeColors } from "../theme.js?v=20261126g";
import { renderReviewBanner } from "./review.js?v=20261126g";

const RULES = [
  { id: "strict", label: "strict" },
  { id: "title_only", label: "title_only" },
];
/** Display order top → bottom. */
const REGIONS = ["JP", "KR", "TW", "HK"];

/**
 * Shared X axis centered on midnight:
 * display index 0..24 maps to local hours 12,13,…,23,0,1,…,11,12
 */
function hourAt(displayIdx) {
  return (12 + displayIdx) % 24;
}

let ctx = null;
let resizeBound = false;

export function render(container, data) {
  clear(container);
  const payload = data.upload_clock || data;
  const meta = payload.meta || {};
  const rows = payload.rows || [];
  const profiles = payload.hourly_profiles || [];
  const caveatEl = data.caveatEl;

  const wrap = d3.select(container);
  wrap.append("h3").attr("class", "chart-section-title").text("Upload clock · midnight-centered");
  wrap
    .append("p")
    .attr("class", "chart-subtitle chart-subtitle-plain")
    .text(
      "When creators hit publish (local time) — East Asian uploads cluster between 20:00 and 02:00."
    );
  wrap
    .append("p")
    .attr("class", "chart-subtitle")
    .text(meta.scope_line || "videos labelled as ASMR (excluding ambient-noise content)");
  const ok = renderReviewBanner(wrap, meta);
  setCaveat(caveatEl, meta.caveats || []);
  if (!ok) return;

  if (meta.jp_depends_on_rule) {
    wrap
      .append("p")
      .attr("class", "chart-note chart-note-jp badge-jp")
      .text("JP result depends on the classification rule");
  }

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

  wrap
    .append("p")
    .attr("class", "chart-inline-legend")
    .html(
      `<span class="leg-swatch leg-sleep"></span> sleep_title` +
        ` <span class="leg-swatch leg-not"></span> not (dashed)` +
        ` <span class="leg-swatch leg-night"></span> 20:00–02:00`
    );

  const tableApi = attachTableToggle(wrap.node(), () => tableRows());
  ctx.mount = tableApi.visual;
  draw();
  bindResize();
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

function nightShare(region) {
  const row = ctx.rows.find((r) => r.rule === ctx.rule && r.region === region);
  const m = row?.night_sleep?.mean;
  return m != null && Number.isFinite(m) ? m : null;
}

function bindResize() {
  if (resizeBound) return;
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

function profileMeans(region, arm) {
  const p = ctx.profiles.find(
    (row) => row.rule === ctx.rule && row.region === region && row.arm === arm
  );
  return p?.profile?.mean || [];
}

/** Decorative sun (~16px): solid center disk + 1.3px rays. */
function drawSunIcon(parent, cx, cy, r, color) {
  const g = parent.append("g").attr("class", "sky-icon sky-sun").attr("aria-hidden", "true");
  g.append("circle")
    .attr("cx", cx)
    .attr("cy", cy)
    .attr("r", r * 0.38)
    .attr("fill", color)
    .attr("stroke", color)
    .attr("stroke-width", 1.3);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.append("line")
      .attr("x1", cx + Math.cos(a) * r * 0.55)
      .attr("y1", cy + Math.sin(a) * r * 0.55)
      .attr("x2", cx + Math.cos(a) * r)
      .attr("y2", cy + Math.sin(a) * r)
      .attr("stroke", color)
      .attr("stroke-width", 1.3)
      .attr("stroke-linecap", "round");
  }
}

/** Decorative crescent moon (~16px): solid warm fill. */
function drawMoonIcon(parent, cx, cy, r, fill) {
  const g = parent.append("g").attr("class", "sky-icon sky-moon").attr("aria-hidden", "true");
  const d = [
    `M ${cx + r * 0.15} ${cy - r}`,
    `A ${r} ${r} 0 1 0 ${cx + r * 0.15} ${cy + r}`,
    `A ${r * 0.72} ${r * 0.72} 0 1 1 ${cx + r * 0.15} ${cy - r}`,
    "Z",
  ].join(" ");
  g.append("path")
    .attr("d", d)
    .attr("fill", fill)
    .attr("stroke", "none")
    .attr("stroke-linejoin", "round");
}

/** True when a display-x sits inside the 20:00–02:00 night window (display 8..14). */
function inNightWindow(displayX) {
  return displayX >= 8 && displayX <= 14;
}

function draw() {
  const mount = ctx.mount;
  clear(mount);
  const w = Math.max(300, mount.clientWidth || 640);
  const mobile = w < 520;
  // Extra margins so sun/moon icons, peak leaders, and table toggle never clip
  const margin = { top: 34, right: mobile ? 108 : 128, bottom: 40, left: mobile ? 40 : 48 };
  const stripH = mobile ? 78 : 94;
  const gap = 12;
  const n = REGIONS.length;
  const ih = n * stripH + (n - 1) * gap;
  const iw = w - margin.left - margin.right;
  const c = themeColors();
  const paper = "#fdfcfa";
  const ink = c.ink || "#121622";
  const duskInk = "#262e40";
  const nightAccent = c.nightAccent || "#f4a259";
  const curveTeal = "#4db6c7";

  const svg = d3
    .select(mount)
    .append("svg")
    .attr("viewBox", `0 0 ${w} ${ih + margin.top + margin.bottom}`)
    .attr("width", "100%")
    .attr("overflow", "visible")
    .attr("role", "img")
    .attr("aria-label", "Midnight-centered 24-hour upload waves by region");

  const defs = svg.append("defs");
  // Soft pastel dusk → midnight → dawn (no black pillar)
  // 0%=12:00, 16%=16:00, 30%=19:00, 50%=00:00, 70%=05:00, 84%=08:00, 100%=12:00
  const sky = defs
    .append("linearGradient")
    .attr("id", "dusk-midnight-sky")
    .attr("gradientUnits", "userSpaceOnUse")
    .attr("x1", 0)
    .attr("x2", iw)
    .attr("y1", 0)
    .attr("y2", 0);
  const stops = [
    [0, "#fdfcfa"],
    [0.16, "#f6f6f9"],
    [0.3, "#dfe5f1"],
    [0.5, "#b8c5de"],
    [0.7, "#dfe5f1"],
    [0.84, "#f6f6f9"],
    [1, "#fdfcfa"],
  ];
  stops.forEach(([t, color]) => {
    sky
      .append("stop")
      .attr("offset", `${(t * 100).toFixed(2)}%`)
      .attr("stop-color", color)
      .attr("stop-opacity", 1);
  });

  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3.scaleLinear().domain([0, 24]).range([0, iw]);
  const midX = x(12);

  // Full-width soft twilight sky
  g.append("rect")
    .attr("class", "sky-backdrop")
    .attr("x", 0)
    .attr("y", -10)
    .attr("width", iw)
    .attr("height", ih + 16)
    .attr("fill", "url(#dusk-midnight-sky)")
    .attr("rx", 2);

  // Hairline dashed boundary for 20:00–02:00 (display 8..14) — no heavy block
  const nightX0 = x(8);
  const nightX1 = x(14);
  [nightX0, nightX1].forEach((nx) => {
    g.append("line")
      .attr("class", "night-window-edge")
      .attr("x1", nx)
      .attr("x2", nx)
      .attr("y1", -8)
      .attr("y2", ih + 4)
      .attr("stroke", duskInk)
      .attr("stroke-width", 0.7)
      .attr("stroke-dasharray", "2.5 3.5")
      .attr("opacity", 0.28);
  });

  // Top time-ruler icons (~16px) — solid accent for glanceable sun/moon
  const iconY = -14;
  const iconR = 8;
  const iconColor = c.accent || ink;
  drawSunIcon(g, x(0) + iconR + 1, iconY, iconR, iconColor);
  drawSunIcon(g, x(24) - iconR - 1, iconY, iconR, iconColor);
  drawMoonIcon(g, midX - 2, iconY, iconR, iconColor);

  // Midnight rule + label in crisp dark ink over soft twilight
  g.append("line")
    .attr("x1", midX)
    .attr("x2", midX)
    .attr("y1", -4)
    .attr("y2", ih + 4)
    .attr("stroke", ink)
    .attr("stroke-width", 1.15)
    .attr("opacity", 0.85);
  g.append("text")
    .attr("x", midX + 8)
    .attr("y", -2)
    .attr("font-size", 10)
    .attr("font-variant-numeric", "tabular-nums")
    .attr("font-weight", 600)
    .attr("fill", ink)
    .text("00:00 Midnight");

  // Shared hour ticks (bottom axis stays on paper)
  const tickHours = [12, 18, 0, 6, 12];
  const tickDisplay = [0, 6, 12, 18, 24];
  const axisG = g.append("g").attr("transform", `translate(0,${ih + 10})`);
  tickDisplay.forEach((d, i) => {
    const h = tickHours[i];
    const label = h === 0 ? "00:00" : `${String(h).padStart(2, "0")}:00`;
    axisG
      .append("line")
      .attr("x1", x(d))
      .attr("x2", x(d))
      .attr("y1", 0)
      .attr("y2", 4)
      .attr("stroke", c.line);
    axisG
      .append("text")
      .attr("x", x(d))
      .attr("y", 16)
      .attr("text-anchor", "middle")
      .attr("font-size", 10)
      .attr("font-variant-numeric", "tabular-nums")
      .attr("fill", h === 0 ? c.ink : c.muted)
      .attr("font-weight", h === 0 ? 600 : 400)
      .text(label);
  });

  REGIONS.forEach((region, i) => {
    const y0 = i * (stripH + gap);
    const sleep = profileMeans(region, "sleep");
    const not = profileMeans(region, "not");
    const maxY = Math.max(d3.max(sleep) || 0, d3.max(not) || 0, 0.01);
    const y = d3.scaleLinear().domain([0, maxY]).range([stripH - 8, 10]);

    const strip = g.append("g").attr("transform", `translate(0,${y0})`);

    // Baseline: muted on day edges, night-ink hairline in night zone via two segments
    strip
      .append("line")
      .attr("x1", 0)
      .attr("x2", iw)
      .attr("y1", stripH - 8)
      .attr("y2", stripH - 8)
      .attr("stroke", c.line)
      .attr("stroke-width", 0.75)
      .attr("opacity", 0.7);

    const sleepPts = d3.range(0, 25).map((d) => {
      const h = hourAt(d === 24 ? 0 : d);
      return [d, sleep[h] != null ? sleep[h] : 0];
    });
    sleepPts[24] = [24, sleep[12] != null ? sleep[12] : 0];

    const notPts = d3.range(0, 25).map((d) => {
      const h = hourAt(d === 24 ? 0 : d);
      return [d, not[h] != null ? not[h] : 0];
    });
    notPts[24] = [24, not[12] != null ? not[12] : 0];

    const area = d3
      .area()
      .curve(d3.curveMonotoneX)
      .x((p) => x(p[0]))
      .y0(stripH - 8)
      .y1((p) => y(p[1]));
    const line = d3
      .line()
      .curve(d3.curveMonotoneX)
      .x((p) => x(p[0]))
      .y((p) => y(p[1]));

    // sleep_title: soft accent wash + accent stroke on pastel sky
    strip
      .append("path")
      .attr("d", area(sleepPts))
      .attr("fill", nightAccent)
      .attr("opacity", 0.22);

    strip
      .append("path")
      .attr("d", line(sleepPts))
      .attr("fill", "none")
      .attr("stroke", c.accent)
      .attr("stroke-width", 1.85);

    strip
      .append("path")
      .attr("d", line(notPts))
      .attr("fill", "none")
      .attr("stroke", curveTeal)
      .attr("stroke-width", 1.4)
      .attr("stroke-dasharray", "4 3")
      .attr("opacity", 0.95);

    // Peak glowing dot + curved leader
    let peakIdx = 0;
    let peakVal = -1;
    sleepPts.forEach((p, idx) => {
      if (idx === 24) return;
      if (p[1] > peakVal) {
        peakVal = p[1];
        peakIdx = idx;
      }
    });
    if (peakVal > 0) {
      const px = x(peakIdx);
      const py = y(peakVal);
      const ph = hourAt(peakIdx);
      const night = nightShare(region);
      const nightTxt =
        night != null ? `night ${fmt(night * 100, 0)}%` : `share ${fmt(peakVal, 3)}`;
      const peakInNight = inNightWindow(peakIdx);
      // Dark ink on soft twilight — never white-on-white
      const labelFill = peakInNight ? duskInk : c.muted;
      const leaderStroke = peakInNight ? "rgba(38,46,64,0.35)" : c.line;

      strip
        .append("circle")
        .attr("cx", px)
        .attr("cy", py)
        .attr("r", 8)
        .attr("fill", nightAccent)
        .attr("opacity", 0.22);
      strip
        .append("circle")
        .attr("cx", px)
        .attr("cy", py)
        .attr("r", 3.5)
        .attr("fill", nightAccent)
        .attr("stroke", paper)
        .attr("stroke-width", 1.3);

      const label = `${String(ph).padStart(2, "0")}:00 · ${nightTxt}`;
      const approxW = label.length * 5.4;
      const maxLx = iw + margin.right - 10 - approxW;
      const lx = Math.min(maxLx, Math.max(4, px + (mobile ? 32 : 50)));
      const ly = Math.max(10, py - 16);
      strip
        .append("path")
        .attr("class", "anno-leader")
        .attr("d", `M${px + 4},${py - 2} Q${px + 18},${ly} ${lx - 2},${ly}`)
        .attr("fill", "none")
        .attr("stroke", leaderStroke)
        .attr("stroke-width", 0.9);
      strip
        .append("text")
        .attr("class", "anno-label")
        .attr("x", lx)
        .attr("y", ly + 3)
        .attr("font-size", 10)
        .attr("font-variant-numeric", "tabular-nums")
        .attr("font-weight", peakInNight ? 600 : 400)
        .attr("fill", labelFill)
        .text(label);
    }

    strip
      .append("text")
      .attr("x", -8)
      .attr("y", stripH / 2)
      .attr("text-anchor", "end")
      .attr("dominant-baseline", "middle")
      .attr("font-size", 12)
      .attr("font-family", "Georgia, serif")
      .attr("fill", c.ink)
      .text(region);
  });
}

export function update() {
  if (ctx?.mount) draw();
}

/* pages-redeploy: 20261126g */
