/* Creators · declared country — deep-night starfield constellations. */
import { attachTableToggle, clear, fmt, setCaveat } from "../charts/util.js?v=20261126r";
import { themeColors } from "../theme.js?v=20261126r";
import { renderReviewBanner } from "./review.js?v=20261126r";

const RULES = [
  { id: "strict", label: "strict" },
  { id: "title_only", label: "title_only" },
];

/** Harmonious celestial palette; unknown is muted silver. */
const PALETTE = ["#f4a259", "#66c2cf", "#e88d72", "#b4a7e8", "#8fb8ed", "#95c9a8", "#d4a574", "#7eb8c9", "#c9a0dc", "#a8c686"];
const UNKNOWN_COLOR = "#8a94a8";

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
    .text(
      "Constellation size & bright stars = top 5% creators’ video share; star count = channels."
    );
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
  return ctx.rows
    .filter((r) => r.rule === ctx.rule)
    .slice()
    .sort((a, b) => (b.n_channels || 0) - (a.n_channels || 0));
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

function countryColor(code, index) {
  if (String(code).toLowerCase() === "unknown") return UNKNOWN_COLOR;
  return PALETTE[index % PALETTE.length];
}

function sharePct(row) {
  const s = row?.share_videos_from_top5pct_channels;
  if (s == null || !Number.isFinite(s)) return null;
  return Math.round(s * 100);
}

function shareOf(row) {
  const s = row?.share_videos_from_top5pct_channels;
  return s != null && Number.isFinite(s) ? s : 0.28;
}

/** Sparse, irregular edges — not a neat spanning tree. */
function constellationEdges(stars, rand) {
  const edges = [];
  const used = new Set();
  stars.forEach((a, i) => {
    const dist = stars
      .map((b, j) => ({ j, d: (a.x - b.x) ** 2 + (a.y - b.y) ** 2 }))
      .filter((o) => o.j !== i)
      .sort((u, v) => u.d - v.d);
    const k = rand() < 0.35 ? 2 : 1;
    for (let n = 0; n < k && n < dist.length; n++) {
      const pick =
        n === 0 && rand() < 0.22 && dist.length > 2
          ? dist[1 + Math.floor(rand() * Math.min(2, dist.length - 1))]
          : dist[n];
      const j = pick.j;
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (used.has(key)) continue;
      used.add(key);
      edges.push([i, j]);
    }
  });
  return edges;
}

/**
 * Dramatic share→radius map: DE~23% ≈ 30px, TW~50% ≈ 73px (~2.4×).
 */
function clusterSpread(row, mobile) {
  const share = shareOf(row);
  const t = Math.max(0, Math.min(1, (share - 0.22) / (0.5 - 0.22)));
  const lo = mobile ? 22 : 30;
  const hi = mobile ? 54 : 76;
  const channelTerm = Math.sqrt(row.n_channels || 30) * (mobile ? 0.03 : 0.06);
  return lo + Math.pow(t, 0.92) * (hi - lo) + channelTerm;
}

/** Outer radius including star envelope + label clearance under the cloud. */
function outerRadius(spread, mobile) {
  return spread * 1.02 + (mobile ? 12 : 14);
}

function countClusterOverlaps(nodes) {
  let n = 0;
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      // collide radius = outerRadius + 20 each
      const need = a.outerRadius + b.outerRadius + 40;
      if (Math.hypot(a.x - b.x, a.y - b.y) < need - 0.5) n++;
    }
  }
  return n;
}

/**
 * Asymmetric random seeds in the solid dark rectangle + forceCollide.
 * No radial ring / strong centering — only rectangular bounds clamps.
 */
function placeAnchors(rows, iw, ih, mobile) {
  const rand = mulberry32(hashSeed(`sky-anchors-${ctx.rule}-${rows.length}-v6`));
  const x0 = iw * 0.2;
  const x1 = iw * 0.8;
  const y0 = ih * 0.2;
  const y1 = ih * 0.8;

  const nodes = rows.map((r) => {
    const spread = clusterSpread(r, mobile);
    const or = outerRadius(spread, mobile);
    // True scatter across the inner rectangle (not a circle/ring)
    let x = x0 + rand() * (x1 - x0);
    let y = y0 + rand() * (y1 - y0);
    // Extra corner/gap jitter so it never reads as a lattice
    x += (rand() - 0.5) * iw * 0.06;
    y += (rand() - 0.5) * ih * 0.06;
    x = Math.max(x0 + or * 0.35, Math.min(x1 - or * 0.35, x));
    y = Math.max(y0 + or * 0.35, Math.min(y1 - or * 0.35, y));
    return { row: r, x, y, spread, outerRadius: or };
  });

  function clampRect() {
    nodes.forEach((d) => {
      const m = Math.max(8, d.outerRadius * 0.2);
      d.x = Math.max(x0 + m, Math.min(x1 - m, d.x));
      d.y = Math.max(y0 + m, Math.min(y1 - m, d.y));
    });
  }

  function hardSeparate() {
    for (let iter = 0; iter < 140; iter++) {
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let dist = Math.hypot(dx, dy) || 0.01;
          const minD = a.outerRadius + b.outerRadius + 40;
          if (dist < minD) {
            const push = ((minD - dist) / dist) * 0.55;
            dx *= push;
            dy *= push;
            a.x -= dx;
            a.y -= dy;
            b.x += dx;
            b.y += dy;
          }
        }
      }
      clampRect();
    }
  }

  const sim = d3
    .forceSimulation(nodes)
    .force(
      "collide",
      d3
        .forceCollide((d) => d.outerRadius + 20)
        .iterations(4)
        .strength(1)
    )
    .stop();
  for (let i = 0; i < 260; i++) {
    sim.tick();
    clampRect();
  }
  hardSeparate();
  clampRect();

  // If still packed too tight, gently shrink (keep relative share ratios) and re-separate
  let guard = 0;
  let sizeScale = 1;
  while (countClusterOverlaps(nodes) > 0 && guard < 10) {
    guard++;
    sizeScale *= 0.9;
    nodes.forEach((d) => {
      d.spread = clusterSpread(d.row, mobile) * sizeScale;
      d.outerRadius = outerRadius(d.spread, mobile);
    });
    // Re-seed slightly so shrinks can re-flow
    nodes.forEach((d) => {
      d.x += (rand() - 0.5) * 8;
      d.y += (rand() - 0.5) * 8;
    });
    hardSeparate();
    clampRect();
  }
  return nodes;
}

/** Irregular star cloud with rim stars so share-scaled radius reads clearly. */
function buildStars(anchor, nStars, spread, share, rand) {
  const stars = [];
  const cx = anchor.x;
  const cy = anchor.y;
  const squash = 0.5 + rand() * 0.55;
  const tilt = rand() * Math.PI;
  const cosT = Math.cos(tilt);
  const sinT = Math.sin(tilt);

  const clumps = [];
  const nClumps = 2 + (rand() < 0.5 ? 1 : 0);
  for (let c = 0; c < nClumps; c++) {
    const a = rand() * Math.PI * 2;
    const rr = spread * (0.12 + rand() * 0.48);
    clumps.push({
      x: cx + Math.cos(a) * rr,
      y: cy + Math.sin(a) * rr * squash,
      w: 0.22 + rand() * 0.4,
    });
  }

  const rimN = Math.max(2, Math.round(nStars * (0.24 + share * 0.28)));

  for (let i = 0; i < nStars; i++) {
    let x;
    let y;
    if (i < rimN) {
      const a = (i / rimN) * Math.PI * 2 + rand() * 0.45;
      const rr = spread * (0.78 + rand() * 0.22);
      const lx = Math.cos(a) * rr;
      const ly = Math.sin(a) * rr * squash;
      x = cx + lx * cosT - ly * sinT;
      y = cy + lx * sinT + ly * cosT;
    } else if (rand() < 0.55) {
      const cl = clumps[Math.floor(rand() * clumps.length)];
      const a = rand() * Math.PI * 2;
      const rr = spread * cl.w * (0.2 + rand() * 0.9);
      x = cl.x + Math.cos(a) * rr;
      y = cl.y + Math.sin(a) * rr * (0.6 + rand() * 0.55);
    } else {
      const a = rand() * Math.PI * 2;
      const rr = spread * (0.25 + rand() * 0.7);
      const lx = Math.cos(a) * rr;
      const ly = Math.sin(a) * rr * squash;
      x = cx + lx * cosT - ly * sinT;
      y = cy + lx * sinT + ly * cosT;
    }
    const dx = x - cx;
    const dy = y - cy;
    const d = Math.hypot(dx, dy) || 0.01;
    const maxR = spread * 1.02;
    if (d > maxR) {
      x = cx + (dx / d) * maxR;
      y = cy + (dy / d) * maxR;
    }
    stars.push({
      x,
      y,
      anchor: rand() < 0.12 + share * 0.45,
    });
  }

  if (share >= 0.35 && !stars.some((s) => s.anchor)) stars[0].anchor = true;
  const wantAnchors = Math.max(1, Math.round(1 + share * 5));
  let have = stars.filter((s) => s.anchor).length;
  for (let i = 0; have < wantAnchors && i < stars.length; i++) {
    if (!stars[i].anchor) {
      stars[i].anchor = true;
      have++;
    }
  }
  return stars;
}

function draw() {
  const mount = ctx.mount;
  clear(mount);
  const rows = filtered();
  // Sticky chart column is narrow; use viewport width for desktop vs mobile sky room
  const mobile = (typeof window !== "undefined" ? window.innerWidth : 800) < 700;
  // Generous fixed viewBox so the solid dark core has room for all 11 clusters
  const w = mobile ? 420 : 820;
  const h = mobile ? 620 : 660;
  const pad = 14;

  const svg = d3
    .select(mount)
    .append("svg")
    .attr("class", "creators-starfield")
    .attr("viewBox", `0 0 ${w} ${h}`)
    .attr("width", "100%")
    .attr("role", "img")
    .attr("aria-label", "Deep-night starfield of creator constellations by declared country")
    .style("overflow", "visible");

  const defs = svg.append("defs");

  // Clean deep midnight indigo — solid #11182b field
  const skyGrad = defs
    .append("radialGradient")
    .attr("id", "creators-midnight-sky")
    .attr("cx", "50%")
    .attr("cy", "50%")
    .attr("r", "70%");
  skyGrad.append("stop").attr("offset", "0%").attr("stop-color", "#1a2642");
  skyGrad.append("stop").attr("offset", "100%").attr("stop-color", "#11182b");

  // Large solid core (0→62%), soft feather to transparent before edges (62→96%)
  const feather = defs
    .append("radialGradient")
    .attr("id", "creators-sky-feather-grad")
    .attr("cx", "50%")
    .attr("cy", "50%")
    .attr("r", "72%");
  feather.append("stop").attr("offset", "0%").attr("stop-color", "#fff").attr("stop-opacity", 1);
  feather.append("stop").attr("offset", "62%").attr("stop-color", "#fff").attr("stop-opacity", 1);
  feather.append("stop").attr("offset", "78%").attr("stop-color", "#fff").attr("stop-opacity", 0.45);
  feather.append("stop").attr("offset", "88%").attr("stop-color", "#fff").attr("stop-opacity", 0.12);
  feather.append("stop").attr("offset", "96%").attr("stop-color", "#000").attr("stop-opacity", 0);
  feather.append("stop").attr("offset", "100%").attr("stop-color", "#000").attr("stop-opacity", 0);

  const mask = defs
    .append("mask")
    .attr("id", "creators-sky-feather")
    .attr("maskUnits", "userSpaceOnUse");
  mask
    .append("rect")
    .attr("width", w)
    .attr("height", h)
    .attr("fill", "url(#creators-sky-feather-grad)");

  const glow = defs
    .append("filter")
    .attr("id", "star-glow")
    .attr("x", "-80%")
    .attr("y", "-80%")
    .attr("width", "260%")
    .attr("height", "260%");
  glow.append("feGaussianBlur").attr("stdDeviation", 1.5).attr("result", "b");
  const merge = glow.append("feMerge");
  merge.append("feMergeNode").attr("in", "b");
  merge.append("feMergeNode").attr("in", "SourceGraphic");

  const sky = svg
    .append("g")
    .attr("class", "starfield-sky")
    .attr("mask", "url(#creators-sky-feather)");

  sky
    .append("rect")
    .attr("class", "starfield-canvas")
    .attr("x", 0)
    .attr("y", 0)
    .attr("width", w)
    .attr("height", h)
    .attr("fill", "url(#creators-midnight-sky)");

  const g = sky.append("g").attr("transform", `translate(${pad},${pad})`);
  const iw = w - pad * 2;
  const ih = h - pad * 2;
  const cx0 = iw * 0.5;
  const cy0 = ih * 0.5;
  // Solid-core envelope (~62% of mask radius)
  const solidR = Math.min(iw, ih) * 0.55;

  const fieldRand = mulberry32(0xc0ffee ^ hashSeed(ctx.rule));
  let fieldDrawn = 0;
  let attempts = 0;
  while (fieldDrawn < 240 && attempts < 1000) {
    attempts++;
    const fx = fieldRand() * iw;
    const fy = fieldRand() * ih;
    const dist = Math.hypot(fx - cx0, fy - cy0) / solidR;
    const edgeFade = dist < 0.85 ? 1 : dist > 1.25 ? 0 : 1 - (dist - 0.85) / 0.4;
    if (edgeFade <= 0.05) continue;
    g.append("circle")
      .attr("class", "field-star")
      .attr("cx", fx)
      .attr("cy", fy)
      .attr("r", 0.35 + fieldRand() * 1.15)
      .attr("fill", "#e8ecf5")
      .attr("opacity", (0.12 + fieldRand() * 0.38) * edgeFade);
    fieldDrawn++;
  }

  [
    { cx: iw * 0.38, cy: ih * 0.52, r: Math.min(iw, ih) * 0.38 },
    { cx: iw * 0.64, cy: ih * 0.4, r: Math.min(iw, ih) * 0.28 },
  ].forEach((arc, i) => {
    g.append("circle")
      .attr("class", "celestial-arc")
      .attr("cx", arc.cx)
      .attr("cy", arc.cy)
      .attr("r", arc.r)
      .attr("fill", "none")
      .attr("stroke", "#e8ecf5")
      .attr("stroke-width", 0.7)
      .attr("opacity", 0.06)
      .attr("stroke-dasharray", i === 0 ? "2 12" : "1 15");
  });

  const anchors = placeAnchors(rows, iw, ih, mobile);
  const constellations = g.append("g").attr("class", "constellations");
  const groups = [];

  anchors.forEach((anchor, idx) => {
    const row = anchor.row;
    const code = String(row.country || "").toUpperCase();
    const color = countryColor(row.country, idx);
    const pct = sharePct(row);
    const nCh = row.n_channels || 30;
    const share = shareOf(row);
    const spread = anchor.spread;
    const nStars = Math.round(6 + Math.min(26, Math.sqrt(nCh) * 0.95) + share * 10);
    const rand = mulberry32(hashSeed(`${ctx.rule}-${code}-stars-v6`));
    const stars = buildStars(anchor, nStars, spread, share, rand);

    const hitCx = anchor.x;
    const hitCy = anchor.y;
    const hitR = spread * 1.06;

    const cg = constellations
      .append("g")
      .attr("class", `constellation c-${code}`)
      .attr("tabindex", 0)
      .attr("data-outer", anchor.outerRadius)
      .style("outline", "none")
      .style("cursor", "pointer");

    cg.append("circle")
      .attr("class", "constellation-hit")
      .attr("cx", hitCx)
      .attr("cy", hitCy)
      .attr("r", hitR)
      .attr("fill", color)
      .attr("opacity", 0)
      .attr("pointer-events", "all");

    cg.append("circle")
      .attr("class", "constellation-bounds")
      .attr("cx", hitCx)
      .attr("cy", hitCy)
      .attr("r", anchor.outerRadius)
      .attr("fill", "none")
      .attr("stroke", "none")
      .attr("pointer-events", "none");

    constellationEdges(stars, rand).forEach(([i, j]) => {
      cg.append("line")
        .attr("class", "constellation-link")
        .attr("x1", stars[i].x)
        .attr("y1", stars[i].y)
        .attr("x2", stars[j].x)
        .attr("y2", stars[j].y)
        .attr("stroke", color)
        .attr("stroke-width", 0.75)
        .attr("opacity", 0.45)
        .attr("pointer-events", "none");
    });

    stars.forEach((s) => {
      const isAnchor = s.anchor;
      const glowBoost = 0.35 + share * 0.55;
      cg.append("circle")
        .attr("class", isAnchor ? "constellation-star anchor-star" : "constellation-star")
        .attr("cx", s.x)
        .attr("cy", s.y)
        .attr("r", isAnchor ? 1.7 + share * 2.4 : 0.85 + rand() * 0.55)
        .attr("fill", color)
        .attr("opacity", isAnchor ? Math.min(0.96, 0.5 + glowBoost * 0.45) : 0.38 + rand() * 0.28)
        .attr("filter", isAnchor ? "url(#star-glow)" : null)
        .attr("pointer-events", "none");
    });

    const label =
      pct != null
        ? `${code === "UNKNOWN" ? "unknown" : code} ${pct}%`
        : code === "UNKNOWN"
          ? "unknown"
          : code;
    // Keep labels inside the solid dark zone (20%–80%)
    const labelY = Math.max(ih * 0.2 + 10, Math.min(ih * 0.8 - 4, hitCy + spread * 0.9 + 14));
    const labelX = Math.max(iw * 0.2, Math.min(iw * 0.8, hitCx));
    cg.append("text")
      .attr("class", "constellation-label")
      .attr("x", labelX)
      .attr("y", labelY)
      .attr("text-anchor", "middle")
      .attr("font-size", mobile ? 10 : 12)
      .attr("font-family", 'Georgia, "Times New Roman", serif')
      .attr("letter-spacing", "0.04em")
      .attr("fill", "#eef1f7")
      .attr("opacity", 0.94)
      .attr("pointer-events", "none")
      .text(label);

    const tip =
      `${row.country}: ${row.n_channels} channels, ${row.n_videos} videos` +
      (pct != null ? `, top 5% share ${pct}%` : "");
    cg.append("title").text(tip);

    groups.push(cg);
  });

  function setFocus(active) {
    groups.forEach((cg) => {
      const on = !active || cg.node() === active;
      cg.attr("opacity", on ? 1 : 0.22);
      cg.selectAll(".constellation-link").attr("opacity", on ? 0.78 : 0.16);
      cg.selectAll(".anchor-star").attr("opacity", on ? 1 : 0.28);
      cg.selectAll(".constellation-label").attr("opacity", on ? 0.95 : 0.35);
    });
  }

  groups.forEach((cg) => {
    cg.on("pointerenter", function () {
      setFocus(this);
    })
      .on("pointerleave", () => setFocus(null))
      .on("focus", function () {
        setFocus(this);
      })
      .on("blur", () => setFocus(null));
  });
}

export function update() {
  if (ctx?.mount) draw();
}
