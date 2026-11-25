/* Creators · declared country — constellation star-map on warm paper. */
import { attachTableToggle, clear, fmt, setCaveat } from "../charts/util.js?v=20261126o";
import { themeColors } from "../theme.js?v=20261126o";
import { renderReviewBanner } from "./review.js?v=20261126o";

const RULES = [
  { id: "strict", label: "strict" },
  { id: "title_only", label: "title_only" },
];

/** Display order + muted regional palette (Unknown ignored). */
const REGIONS = [
  { id: "HK", color: "#c4785a", label: "Hong Kong" }, // muted terracotta
  { id: "KR", color: "#7a92a8", label: "South Korea" }, // dusty blue
  { id: "US", color: "#8a9a7b", label: "United States" }, // muted sage
  { id: "JP", color: "#9a8fb0", label: "Japan" }, // soft lavender
  { id: "TW", color: "#c4a35a", label: "Taiwan" }, // muted golden
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
    .attr("class", "chart-subtitle chart-subtitle-plain")
    .text("Top 5% of channels’ share of videos — each region as a quiet constellation.");
  wrap
    .append("p")
    .attr("class", "chart-subtitle")
    .text(meta.scope_line || "videos labelled as ASMR (excluding ambient-noise content)");
  const ok = renderReviewBanner(wrap, meta);
  setCaveat(caveatEl, meta.caveats || []);
  if (!ok) return;

  ctx = { rows, rule: "title_only", meta };
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
  const allow = new Set(REGIONS.map((r) => r.id));
  return ctx.rows
    .filter((r) => r.rule === ctx.rule && allow.has(String(r.country || "").toUpperCase()))
    .slice()
    .sort((a, b) => {
      const ia = REGIONS.findIndex((r) => r.id === String(a.country).toUpperCase());
      const ib = REGIONS.findIndex((r) => r.id === String(b.country).toUpperCase());
      return ia - ib;
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

/** Deterministic PRNG from string seed. */
function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Sparse constellation edges: connect each star to its 1–2 nearest neighbours. */
function constellationEdges(stars) {
  const edges = [];
  const seen = new Set();
  stars.forEach((a, i) => {
    const dist = stars
      .map((b, j) => ({ j, d: (a.x - b.x) ** 2 + (a.y - b.y) ** 2 }))
      .filter((o) => o.j !== i)
      .sort((u, v) => u.d - v.d);
    const k = i % 3 === 0 ? 2 : 1;
    for (let n = 0; n < k && n < dist.length; n++) {
      const j = dist[n].j;
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push([i, j]);
    }
  });
  return edges;
}

function sharePct(row) {
  const s = row?.share_videos_from_top5pct_channels;
  if (s == null || !Number.isFinite(s)) return null;
  return Math.round(s * 100);
}

function draw() {
  const mount = ctx.mount;
  clear(mount);
  const rows = filtered();
  const c = themeColors();
  const paper = c.bg || "#fdfcfa";
  const ink = c.ink || "#121622";
  const muted = c.muted || "#525b70";

  const w = Math.max(320, mount.clientWidth || 640);
  const mobile = w < 560;
  const legendH = mobile ? 118 : 96;
  const skyH = mobile ? 340 : 400;
  const margin = { top: 12, right: 16, bottom: 8, left: 16 };
  const iw = w - margin.left - margin.right;
  const totalH = skyH + legendH + 8;

  const svg = d3
    .select(mount)
    .append("svg")
    .attr("viewBox", `0 0 ${w} ${totalH}`)
    .attr("width", "100%")
    .attr("role", "img")
    .attr("aria-label", "Constellation map of top-5% channel video share by declared country");

  // Soft ivory sky (no dark navy)
  svg
    .append("rect")
    .attr("width", w)
    .attr("height", skyH)
    .attr("fill", paper);

  const sky = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
  const fieldH = skyH - margin.top - 8;

  // Distant field stars — many, tiny, dim
  const fieldRand = mulberry32(0x51a7e);
  const fieldN = Math.round(iw * fieldH * 0.0011);
  for (let i = 0; i < fieldN; i++) {
    sky
      .append("circle")
      .attr("class", "field-star")
      .attr("cx", fieldRand() * iw)
      .attr("cy", fieldRand() * fieldH)
      .attr("r", 0.4 + fieldRand() * 0.7)
      .attr("fill", muted)
      .attr("opacity", 0.08 + fieldRand() * 0.12);
  }

  // Region anchors across a wide landscape
  const anchors = REGIONS.map((reg, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const ax = mobile
      ? iw * (0.22 + col * 0.32)
      : iw * (0.12 + i * 0.19);
    const ay = mobile
      ? fieldH * (0.28 + row * 0.48)
      : fieldH * (0.32 + (i % 2) * 0.28 + (i === 4 ? -0.06 : 0));
    return { ...reg, ax, ay };
  });

  const byId = new Map(rows.map((r) => [String(r.country).toUpperCase(), r]));

  anchors.forEach((reg) => {
    const row = byId.get(reg.id);
    const pct = sharePct(row);
    const nCh = row?.n_channels || 40;
    // Star count: modest, scales gently with share (TW denser, still small)
    const nStars = Math.round(9 + (pct != null ? pct * 0.14 : 8) + Math.min(8, nCh / 80));
    const spread = mobile ? 42 : 52;
    const rand = mulberry32(hashSeed(`${ctx.rule}-${reg.id}-const`));

    const stars = [];
    for (let i = 0; i < nStars; i++) {
      // Organic jitter — avoid neat polygons
      const ang = rand() * Math.PI * 2;
      const rad = spread * (0.25 + rand() * 0.85) * (0.55 + rand() * 0.55);
      const jx = (rand() - 0.5) * spread * 0.35;
      const jy = (rand() - 0.5) * spread * 0.35;
      stars.push({
        x: reg.ax + Math.cos(ang) * rad + jx,
        y: reg.ay + Math.sin(ang) * rad * 0.72 + jy,
        bright: rand() > 0.78,
      });
    }

    const g = sky.append("g").attr("class", `constellation c-${reg.id}`);
    const edges = constellationEdges(stars);

    edges.forEach(([i, j]) => {
      g.append("line")
        .attr("class", "constellation-link")
        .attr("x1", stars[i].x)
        .attr("y1", stars[i].y)
        .attr("x2", stars[j].x)
        .attr("y2", stars[j].y)
        .attr("stroke", reg.color)
        .attr("stroke-width", 0.6)
        .attr("opacity", 0.28);
    });

    stars.forEach((s) => {
      g.append("circle")
        .attr("class", "constellation-star")
        .attr("cx", s.x)
        .attr("cy", s.y)
        .attr("r", s.bright ? 1.65 : 1.05)
        .attr("fill", reg.color)
        .attr("opacity", s.bright ? 0.75 : 0.42);
    });

    // Unobtrusive label near cluster
    const lx = reg.ax;
    const ly = Math.min(fieldH - 4, Math.max(...stars.map((s) => s.y)) + 16);
    const label = pct != null ? `${reg.id}  ${pct}%` : reg.id;
    g.append("text")
      .attr("class", "constellation-label")
      .attr("x", lx)
      .attr("y", ly)
      .attr("text-anchor", "middle")
      .attr("font-size", 11)
      .attr("font-family", 'Georgia, "Times New Roman", serif')
      .attr("letter-spacing", "0.04em")
      .attr("fill", ink)
      .attr("opacity", reg.id === "TW" ? 0.9 : 0.72)
      .attr("font-weight", reg.id === "TW" ? 600 : 400)
      .text(label);

    g.append("title").text(
      `${reg.label}: top 5% of channels account for ${pct != null ? pct + "%" : "—"} of videos` +
        (row ? ` (${row.n_channels} channels)` : "")
    );
  });

  // Compact horizontal bar legend (share comparison)
  const leg = svg
    .append("g")
    .attr("class", "share-legend")
    .attr("transform", `translate(${margin.left},${skyH + 4})`);

  leg
    .append("text")
    .attr("x", 0)
    .attr("y", 12)
    .attr("font-size", 10)
    .attr("fill", muted)
    .attr("letter-spacing", "0.03em")
    .text("Top 5% of channels · share of videos");

  const barMax = iw * (mobile ? 0.55 : 0.62);
  const barX = mobile ? 78 : 88;
  const rowH = mobile ? 16 : 14;
  const maxPct = 50;

  anchors.forEach((reg, i) => {
    const row = byId.get(reg.id);
    const pct = sharePct(row) ?? 0;
    const y0 = 28 + i * rowH;
    const bw = (pct / maxPct) * barMax;
    const isTw = reg.id === "TW";

    leg
      .append("text")
      .attr("x", 0)
      .attr("y", y0 + 9)
      .attr("font-size", 10)
      .attr("font-variant-numeric", "tabular-nums")
      .attr("fill", isTw ? ink : muted)
      .attr("font-weight", isTw ? 600 : 400)
      .text(reg.id);

    leg
      .append("rect")
      .attr("x", barX)
      .attr("y", y0 + 2)
      .attr("width", Math.max(1, bw))
      .attr("height", 7)
      .attr("rx", 1)
      .attr("fill", reg.color)
      .attr("opacity", isTw ? 0.85 : 0.55);

    leg
      .append("text")
      .attr("x", barX + bw + 6)
      .attr("y", y0 + 9)
      .attr("font-size", 10)
      .attr("font-variant-numeric", "tabular-nums")
      .attr("fill", isTw ? ink : muted)
      .attr("font-weight", isTw ? 600 : 400)
      .text(`${pct}%`);
  });
}

export function update() {
  if (ctx?.mount) draw();
}
