/* Midnight-centered 24h upload waves — dusk-to-midnight sky backdrop. */
import { attachTableToggle, clear, fmt, setCaveat } from "../charts/util.js?v=20261126a";
import { themeColors } from "../theme.js?v=20261126a";
import { renderReviewBanner } from "./review.js?v=20261126a";

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

/** Decorative 1px stroked sun (no fill). */
function drawSunIcon(parent, cx, cy, r, stroke) {
  const g = parent.append("g").attr("class", "sky-icon sky-sun").attr("aria-hidden", "true");
  g.append("circle")
    .attr("cx", cx)
    .attr("cy", cy)
    .attr("r", r * 0.42)
    .attr("fill", "none")
    .attr("stroke", stroke)
    .attr("stroke-width", 1);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.append("line")
      .attr("x1", cx + Math.cos(a) * r * 0.58)
      .attr("y1", cy + Math.sin(a) * r * 0.58)
      .attr("x2", cx + Math.cos(a) * r)
      .attr("y2", cy + Math.sin(a) * r)
      .attr("stroke", stroke)
      .attr("stroke-width", 1)
      .attr("stroke-linecap", "round");
  }
}

/** Decorative 1px stroked crescent moon (no fill). */
function drawMoonIcon(parent, cx, cy, r, stroke) {
  const g = parent.append("g").attr("class", "sky-icon sky-moon").attr("aria-hidden", "true");
  // Crescent via two arcs (outer then inner cut)
  const d = [
    `M ${cx + r * 0.15} ${cy - r}`,
    `A ${r} ${r} 0 1 0 ${cx + r * 0.15} ${cy + r}`,
    `A ${r * 0.72} ${r * 0.72} 0 1 1 ${cx + r * 0.15} ${cy - r}`,
    "Z",
  ].join(" ");
  g.append("path")
    .attr("d", d)
    .attr("fill", "none")
    .attr("stroke", stroke)
    .attr("stroke-width", 1)
    .attr("stroke-linejoin", "round");
}

function draw() {
  const mount = ctx.mount;
  clear(mount);
  const w = Math.max(300, mount.clientWidth || 640);
  const mobile = w < 520;
  const margin = { top: 28, right: mobile ? 72 : 110, bottom: 40, left: mobile ? 36 : 48 };
  const stripH = mobile ? 78 : 94;
  const gap = 12;
  const n = REGIONS.length;
  const ih = n * stripH + (n - 1) * gap;
  const iw = w - margin.left - margin.right;
  const c = themeColors();
  const paper = c.bg || "#faf8f4";
  const twilightWarm = "#e6dfd6";
  const twilightCool = "#525d73";
  const nightSky = "#1d2432";

  const svg = d3
    .select(mount)
    .append("svg")
    .attr("viewBox", `0 0 ${w} ${ih + margin.top + margin.bottom}`)
    .attr("width", "100%")
    .attr("role", "img")
    .attr("aria-label", "Midnight-centered 24-hour upload waves by region");

  const defs = svg.append("defs");
  // Dusk → Midnight → Dawn sky across the full 24h axis (12→18→00→06→12)
  const sky = defs
    .append("linearGradient")
    .attr("id", "dusk-midnight-sky")
    .attr("gradientUnits", "userSpaceOnUse")
    .attr("x1", 0)
    .attr("x2", iw)
    .attr("y1", 0)
    .attr("y2", 0);
  // display 0 = noon, 6 = dusk 18:00, 8 = 20:00, 12 = midnight, 14 = 02:00, 18 = dawn 06:00, 24 = noon
  sky.append("stop").attr("offset", "0%").attr("stop-color", paper).attr("stop-opacity", 1);
  sky.append("stop").attr("offset", "18%").attr("stop-color", twilightWarm).attr("stop-opacity", 0.2);
  sky.append("stop").attr("offset", "25%").attr("stop-color", twilightCool).attr("stop-opacity", 0.22);
  sky.append("stop").attr("offset", "33%").attr("stop-color", nightSky).attr("stop-opacity", 0.2);
  sky.append("stop").attr("offset", "50%").attr("stop-color", nightSky).attr("stop-opacity", 0.26);
  sky.append("stop").attr("offset", "58%").attr("stop-color", nightSky).attr("stop-opacity", 0.2);
  sky.append("stop").attr("offset", "75%").attr("stop-color", twilightCool).attr("stop-opacity", 0.22);
  sky.append("stop").attr("offset", "82%").attr("stop-color", twilightWarm).attr("stop-opacity", 0.2);
  sky.append("stop").attr("offset", "100%").attr("stop-color", paper).attr("stop-opacity", 1);

  // Warm accent wash only over the 20:00–02:00 night window (sleep_title glow)
  const glow = defs
    .append("linearGradient")
    .attr("id", "night-glow")
    .attr("gradientUnits", "userSpaceOnUse")
    .attr("x1", 0)
    .attr("x2", iw)
    .attr("y1", 0)
    .attr("y2", 0);
  glow.append("stop").attr("offset", "0%").attr("stop-color", c.accent).attr("stop-opacity", 0);
  glow.append("stop").attr("offset", "33%").attr("stop-color", c.accent).attr("stop-opacity", 0.1);
  glow.append("stop").attr("offset", "50%").attr("stop-color", c.accent).attr("stop-opacity", 0.16);
  glow.append("stop").attr("offset", "67%").attr("stop-color", c.accent).attr("stop-opacity", 0.1);
  glow.append("stop").attr("offset", "100%").attr("stop-color", c.accent).attr("stop-opacity", 0);

  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  // X: display 0..24 → hours 12..11..12 with midnight at center (12)
  const x = d3.scaleLinear().domain([0, 24]).range([0, iw]);
  const midX = x(12);

  // Full-width dusk-to-midnight sky behind all tracks
  g.append("rect")
    .attr("class", "sky-backdrop")
    .attr("x", 0)
    .attr("y", -10)
    .attr("width", iw)
    .attr("height", ih + 16)
    .attr("fill", "url(#dusk-midnight-sky)")
    .attr("rx", 2);

  // Soft warm night-window wash (20:00–02:00 → display 8..14)
  const nightX0 = x(8);
  const nightW = x(14) - x(8);
  g.append("rect")
    .attr("class", "night-spotlight")
    .attr("x", nightX0)
    .attr("y", -10)
    .attr("width", nightW)
    .attr("height", ih + 16)
    .attr("fill", "url(#night-glow)")
    .attr("opacity", 0.9);

  // Top time-ruler icons: suns at noon edges, crescent at midnight
  const iconY = -16;
  drawSunIcon(g, x(0), iconY, 6, c.muted);
  drawSunIcon(g, x(24), iconY, 6, c.muted);
  drawMoonIcon(g, midX - 2, iconY, 5.5, c.muted);

  // Crisp midnight rule across all strips
  g.append("line")
    .attr("x1", midX)
    .attr("x2", midX)
    .attr("y1", -4)
    .attr("y2", ih + 4)
    .attr("stroke", c.ink)
    .attr("stroke-width", 1.15)
    .attr("opacity", 0.7);
  g.append("text")
    .attr("x", midX + 8)
    .attr("y", -2)
    .attr("font-size", 10)
    .attr("font-variant-numeric", "tabular-nums")
    .attr("font-weight", 600)
    .attr("fill", c.ink)
    .text("00:00 Midnight");

  // Shared hour ticks
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

    strip
      .append("line")
      .attr("x1", 0)
      .attr("x2", iw)
      .attr("y1", stripH - 8)
      .attr("y2", stripH - 8)
      .attr("stroke", c.line)
      .attr("stroke-width", 0.75);

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

    strip
      .append("path")
      .attr("d", area(sleepPts))
      .attr("fill", c.accent)
      .attr("opacity", 0.32);

    strip
      .append("path")
      .attr("d", line(sleepPts))
      .attr("fill", "none")
      .attr("stroke", c.accent)
      .attr("stroke-width", 1.7);

    strip
      .append("path")
      .attr("d", line(notPts))
      .attr("fill", "none")
      .attr("stroke", c.neg)
      .attr("stroke-width", 1.35)
      .attr("stroke-dasharray", "4 3")
      .attr("opacity", 0.9);

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

      strip
        .append("circle")
        .attr("cx", px)
        .attr("cy", py)
        .attr("r", 7)
        .attr("fill", c.accent)
        .attr("opacity", 0.18);
      strip
        .append("circle")
        .attr("cx", px)
        .attr("cy", py)
        .attr("r", 3.4)
        .attr("fill", c.accent)
        .attr("stroke", c.bg)
        .attr("stroke-width", 1.2);

      const lx = Math.min(iw + margin.right - 18, px + (mobile ? 36 : 54));
      const ly = Math.max(10, py - 16);
      strip
        .append("path")
        .attr("class", "anno-leader")
        .attr(
          "d",
          `M${px + 4},${py - 2} Q${px + 18},${ly} ${lx - 4},${ly}`
        )
        .attr("fill", "none")
        .attr("stroke", c.line)
        .attr("stroke-width", 0.9);
      strip
        .append("text")
        .attr("class", "anno-label")
        .attr("x", lx)
        .attr("y", ly + 3)
        .attr("font-size", 10)
        .attr("font-variant-numeric", "tabular-nums")
        .attr("fill", c.muted)
        .text(`${String(ph).padStart(2, "0")}:00 · ${nightTxt}`);
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
