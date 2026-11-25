/* Creators · declared country — deep-night starfield constellations.
 *
 * System layout: large solid dark core first, full share-based sizes,
 * organic scatter with collision — never shrink the sky to fit.
 */
import { attachTableToggle, clear, fmt, setCaveat } from "../charts/util.js?v=20261126t";
import { themeColors } from "../theme.js?v=20261126t";
import { renderReviewBanner } from "./review.js?v=20261126t";

const RULES = [
  { id: "strict", label: "strict" },
  { id: "title_only", label: "title_only" },
];

/** Harmonious celestial palette; unknown is muted silver. */
const PALETTE = ["#f4a259", "#66c2cf", "#e88d72", "#b4a7e8", "#8fb8ed", "#95c9a8", "#d4a574", "#7eb8c9", "#c9a0dc", "#a8c686"];
const UNKNOWN_COLOR = "#8a94a8";

/** Share → spread: DE~23% ≈ 32px, TW~50% ≈ 78px (~2.4×). Never flattened. */
const SPREAD_LO = 32;
const SPREAD_HI = 78;
const SHARE_LO = 0.23;
const SHARE_HI = 0.5;
const COLLIDE_PAD = 18;
const LABEL_CLEAR = 16;

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

/** Perceptually strong share→radius (full size — never flattened by packing). */
function clusterSpread(row) {
  const share = shareOf(row);
  const t = Math.max(0, Math.min(1, (share - SHARE_LO) / (SHARE_HI - SHARE_LO)));
  // Slight ease so mid-tier (35–39%) still reads larger than DE/US
  return SPREAD_LO + Math.pow(t, 0.88) * (SPREAD_HI - SPREAD_LO);
}

function outerRadius(spread) {
  return spread + LABEL_CLEAR;
}

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

function buildStars(cx, cy, nStars, spread, share, rand) {
  const stars = [];
  const squash = 0.52 + rand() * 0.48;
  const tilt = rand() * Math.PI;
  const cosT = Math.cos(tilt);
  const sinT = Math.sin(tilt);

  const clumps = [];
  const nClumps = 2 + (rand() < 0.5 ? 1 : 0);
  for (let c = 0; c < nClumps; c++) {
    const a = rand() * Math.PI * 2;
    const rr = spread * (0.12 + rand() * 0.45);
    clumps.push({
      x: cx + Math.cos(a) * rr,
      y: cy + Math.sin(a) * rr * squash,
      w: 0.22 + rand() * 0.4,
    });
  }

  const rimN = Math.max(2, Math.round(nStars * (0.22 + share * 0.28)));
  for (let i = 0; i < nStars; i++) {
    let x;
    let y;
    if (i < rimN) {
      const a = (i / rimN) * Math.PI * 2 + rand() * 0.5;
      const rr = spread * (0.76 + rand() * 0.24);
      const lx = Math.cos(a) * rr;
      const ly = Math.sin(a) * rr * squash;
      x = cx + lx * cosT - ly * sinT;
      y = cy + lx * sinT + ly * cosT;
    } else if (rand() < 0.55) {
      const cl = clumps[Math.floor(rand() * clumps.length)];
      const a = rand() * Math.PI * 2;
      const rr = spread * cl.w * (0.2 + rand() * 0.9);
      x = cl.x + Math.cos(a) * rr;
      y = cl.y + Math.sin(a) * rr * (0.6 + rand() * 0.5);
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
    if (d > spread) {
      x = cx + (dx / d) * spread;
      y = cy + (dy / d) * spread;
    }
    stars.push({ x, y, anchor: rand() < 0.12 + share * 0.45 });
  }

  if (share >= 0.35 && !stars.some((s) => s.anchor)) stars[0].anchor = true;
  const want = Math.max(1, Math.round(1 + share * 5));
  let have = stars.filter((s) => s.anchor).length;
  for (let i = 0; have < want && i < stars.length; i++) {
    if (!stars[i].anchor) {
      stars[i].anchor = true;
      have++;
    }
  }
  return stars;
}

function countOverlaps(nodes) {
  let n = 0;
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      const need = a.r + b.r + COLLIDE_PAD * 2;
      if (Math.hypot(a.x - b.x, a.y - b.y) < need - 0.5) n++;
    }
  }
  return n;
}

/**
 * Choose canvas so the solid dark layout box fits all full-size collide disks.
 * Priority: enlarge sky — never shrink constellation radii.
 */
function canvasFor(rows, mobile) {
  const outers = rows.map((r) => outerRadius(clusterSpread(r)));
  const area = outers.reduce((s, o) => s + Math.PI * (o + COLLIDE_PAD) ** 2, 0);
  // Packing efficiency ~0.52 for irregular circles with gaps
  const needSide = Math.sqrt(area / 0.5);
  // Layout uses ~62% of canvas (18–80% band); solid core covers that
  const layoutFrac = 0.62;
  let side = Math.ceil(needSide / layoutFrac + 40);
  side = Math.max(side, mobile ? 520 : 960);
  const w = mobile ? Math.max(440, Math.round(side * 0.72)) : Math.max(960, side);
  const h = mobile ? Math.max(640, Math.round(side * 0.95)) : Math.max(720, Math.round(side * 0.78));
  return { w, h };
}

/**
 * Organic rectangular scatter — no ring, no grid, no size flattening.
 */
function placeAnchors(rows, iw, ih) {
  const rand = mulberry32(hashSeed(`sky-scatter-${ctx.rule}-${rows.length}-v7`));
  const x0 = iw * 0.18;
  const x1 = iw * 0.82;
  const y0 = ih * 0.18;
  const y1 = ih * 0.82;

  const nodes = rows.map((r) => {
    const spread = clusterSpread(r);
    const or = outerRadius(spread);
    // Deterministic irregular scatter across the rectangle
    let x = x0 + rand() * (x1 - x0);
    let y = y0 + rand() * (y1 - y0);
    x += (rand() - 0.5) * iw * 0.08;
    y += (rand() - 0.5) * ih * 0.08;
    return {
      row: r,
      x,
      y,
      spread,
      r: or,
    };
  });

  function clamp() {
    nodes.forEach((d) => {
      const m = d.r * 0.25 + 6;
      d.x = Math.max(x0 + m, Math.min(x1 - m, d.x));
      d.y = Math.max(y0 + m, Math.min(y1 - m, d.y));
    });
  }

  function separate() {
    for (let iter = 0; iter < 160; iter++) {
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let dist = Math.hypot(dx, dy) || 0.01;
          const minD = a.r + b.r + COLLIDE_PAD * 2;
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
      clamp();
    }
  }

  // Collide only — weak / no centering so it never forms a ring
  const sim = d3
    .forceSimulation(nodes)
    .force(
      "collide",
      d3
        .forceCollide((d) => d.r + COLLIDE_PAD)
        .iterations(4)
        .strength(1)
    )
    .stop();
  for (let i = 0; i < 280; i++) {
    sim.tick();
    clamp();
  }
  separate();
  clamp();

  // If still overlapping, jitter and separate again (sizes stay full)
  let guard = 0;
  while (countOverlaps(nodes) > 0 && guard < 8) {
    guard++;
    nodes.forEach((d) => {
      d.x += (rand() - 0.5) * 24;
      d.y += (rand() - 0.5) * 24;
    });
    separate();
    clamp();
  }
  return nodes;
}

function resolveLabelPositions(items, iw, ih) {
  const x0 = iw * 0.18;
  const x1 = iw * 0.82;
  const y0 = ih * 0.18;
  const y1 = ih * 0.82;
  const lw = 56;
  const lh = 14;
  const labels = items.map((it) => ({
    ...it,
    lx: Math.max(x0 + 20, Math.min(x1 - 20, it.cx)),
    ly: Math.max(y0 + 12, Math.min(y1 - 6, it.preferY)),
  }));

  for (let iter = 0; iter < 50; iter++) {
    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) {
        const a = labels[i];
        const b = labels[j];
        const dx = b.lx - a.lx;
        const dy = b.ly - a.ly;
        const ox = lw - Math.abs(dx);
        const oy = lh - Math.abs(dy);
        if (ox > 0 && oy > 0) {
          if (Math.abs(dy) >= Math.abs(dx)) {
            const s = (oy / 2) * 0.55 * (dy === 0 ? (i % 2 ? 1 : -1) : Math.sign(dy));
            a.ly -= s;
            b.ly += s;
          } else {
            const s = (ox / 2) * 0.55 * (dx === 0 ? (i % 2 ? 1 : -1) : Math.sign(dx));
            a.lx -= s;
            b.lx += s;
          }
        }
      }
      // Keep label near its constellation and inside solid core
      const it = labels[i];
      it.lx = Math.max(x0 + 16, Math.min(x1 - 16, it.lx));
      it.ly = Math.max(y0 + 12, Math.min(y1 - 4, it.ly));
      // Soft leash to constellation
      const mdx = it.lx - it.cx;
      const mdy = it.ly - it.cy;
      const md = Math.hypot(mdx, mdy);
      const maxLeash = it.spread + 28;
      if (md > maxLeash) {
        it.lx = it.cx + (mdx / md) * maxLeash;
        it.ly = it.cy + (mdy / md) * maxLeash;
      }
    }
  }
  return labels;
}

function draw() {
  const mount = ctx.mount;
  clear(mount);
  const rows = filtered();
  const mobile = (typeof window !== "undefined" ? window.innerWidth : 1000) < 700;
  const { w, h } = canvasFor(rows, mobile);
  const pad = 16;

  const svg = d3
    .select(mount)
    .append("svg")
    .attr("class", "creators-starfield")
    .attr("viewBox", `0 0 ${w} ${h}`)
    .attr("width", "100%")
    .attr("role", "img")
    .attr("aria-label", "Deep-night starfield of creator constellations by declared country")
    .style("overflow", "visible")
    .style("display", "block");

  const defs = svg.append("defs");

  // Solid midnight indigo — no muddy mix toward paper
  const skyGrad = defs
    .append("radialGradient")
    .attr("id", "creators-midnight-sky")
    .attr("cx", "50%")
    .attr("cy", "48%")
    .attr("r", "75%");
  skyGrad.append("stop").attr("offset", "0%").attr("stop-color", "#1a2642");
  skyGrad.append("stop").attr("offset", "100%").attr("stop-color", "#11182b");

  // Large solid core (0→72%), feather only after layout room (72→97%)
  const feather = defs
    .append("radialGradient")
    .attr("id", "creators-sky-feather-grad")
    .attr("gradientUnits", "userSpaceOnUse")
    .attr("cx", w * 0.5)
    .attr("cy", h * 0.48)
    .attr("r", Math.min(w, h) * 0.72);
  feather.append("stop").attr("offset", "0%").attr("stop-color", "#fff").attr("stop-opacity", 1);
  feather.append("stop").attr("offset", "72%").attr("stop-color", "#fff").attr("stop-opacity", 1);
  feather.append("stop").attr("offset", "84%").attr("stop-color", "#fff").attr("stop-opacity", 0.55);
  feather.append("stop").attr("offset", "92%").attr("stop-color", "#fff").attr("stop-opacity", 0.18);
  feather.append("stop").attr("offset", "97%").attr("stop-color", "#000").attr("stop-opacity", 0);
  feather.append("stop").attr("offset", "100%").attr("stop-color", "#000").attr("stop-opacity", 0);

  defs
    .append("mask")
    .attr("id", "creators-sky-feather")
    .attr("maskUnits", "userSpaceOnUse")
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
  glow.append("feGaussianBlur").attr("stdDeviation", 1.4).attr("result", "b");
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
  const cy0 = ih * 0.48;
  const solidR = Math.min(iw, ih) * 0.58;

  // Field stars — dense in solid core, fade toward rim
  const fieldRand = mulberry32(0xc0ffee ^ hashSeed(ctx.rule));
  let drawn = 0;
  let tries = 0;
  while (drawn < 260 && tries < 1200) {
    tries++;
    const fx = fieldRand() * iw;
    const fy = fieldRand() * ih;
    const dist = Math.hypot(fx - cx0, fy - cy0) / solidR;
    const fade = dist < 0.9 ? 1 : dist > 1.35 ? 0 : 1 - (dist - 0.9) / 0.45;
    if (fade < 0.06) continue;
    g.append("circle")
      .attr("class", "field-star")
      .attr("cx", fx)
      .attr("cy", fy)
      .attr("r", 0.35 + fieldRand() * 1.1)
      .attr("fill", "#e8ecf5")
      .attr("opacity", (0.12 + fieldRand() * 0.38) * fade);
    drawn++;
  }

  [
    { cx: iw * 0.4, cy: ih * 0.5, r: Math.min(iw, ih) * 0.36 },
    { cx: iw * 0.62, cy: ih * 0.42, r: Math.min(iw, ih) * 0.26 },
  ].forEach((arc, i) => {
    g.append("circle")
      .attr("class", "celestial-arc")
      .attr("cx", arc.cx)
      .attr("cy", arc.cy)
      .attr("r", arc.r)
      .attr("fill", "none")
      .attr("stroke", "#e8ecf5")
      .attr("stroke-width", 0.65)
      .attr("opacity", 0.055)
      .attr("stroke-dasharray", i === 0 ? "2 14" : "1 16");
  });

  const anchors = placeAnchors(rows, iw, ih);
  const constellations = g.append("g").attr("class", "constellations");
  const groups = [];
  const labelItems = [];

  anchors.forEach((anchor, idx) => {
    const row = anchor.row;
    const code = String(row.country || "").toUpperCase();
    const color = countryColor(row.country, idx);
    const pct = sharePct(row);
    const nCh = row.n_channels || 30;
    const share = shareOf(row);
    const spread = anchor.spread;
    const nStars = Math.round(7 + Math.min(26, Math.sqrt(nCh) * 0.95) + share * 8);
    const rand = mulberry32(hashSeed(`${ctx.rule}-${code}-stars-v7`));
    const stars = buildStars(anchor.x, anchor.y, nStars, spread, share, rand);

    const cg = constellations
      .append("g")
      .attr("class", `constellation c-${code}`)
      .attr("tabindex", 0)
      .attr("data-spread", spread.toFixed(1))
      .style("outline", "none")
      .style("cursor", "pointer");

    cg.append("circle")
      .attr("class", "constellation-hit")
      .attr("cx", anchor.x)
      .attr("cy", anchor.y)
      .attr("r", spread * 1.05)
      .attr("fill", color)
      .attr("opacity", 0)
      .attr("pointer-events", "all");

    cg.append("circle")
      .attr("class", "constellation-bounds")
      .attr("cx", anchor.x)
      .attr("cy", anchor.y)
      .attr("r", anchor.r)
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
        .attr("opacity", 0.42)
        .attr("pointer-events", "none");
    });

    stars.forEach((s) => {
      const isAnchor = s.anchor;
      const glowBoost = 0.35 + share * 0.55;
      cg.append("circle")
        .attr("class", isAnchor ? "constellation-star anchor-star" : "constellation-star")
        .attr("cx", s.x)
        .attr("cy", s.y)
        .attr("r", isAnchor ? 1.6 + share * 2.2 : 0.85 + rand() * 0.5)
        .attr("fill", color)
        .attr("opacity", isAnchor ? Math.min(0.96, 0.52 + glowBoost * 0.42) : 0.4 + rand() * 0.28)
        .attr("filter", isAnchor ? "url(#star-glow)" : null)
        .attr("pointer-events", "none");
    });

    const label =
      pct != null
        ? `${code === "UNKNOWN" ? "unknown" : code} ${pct}%`
        : code === "UNKNOWN"
          ? "unknown"
          : code;

    labelItems.push({
      cg,
      label,
      cx: anchor.x,
      cy: anchor.y,
      spread,
      preferY: anchor.y + spread * 0.88 + 14,
      tip:
        `${row.country}: ${row.n_channels} channels, ${row.n_videos} videos` +
        (pct != null ? `, top 5% share ${pct}%` : ""),
    });
    groups.push(cg);
  });

  const placed = resolveLabelPositions(labelItems, iw, ih);
  placed.forEach((item) => {
    item.cg
      .append("text")
      .attr("class", "constellation-label")
      .attr("x", item.lx)
      .attr("y", item.ly)
      .attr("text-anchor", "middle")
      .attr("font-size", mobile ? 10 : 12)
      .attr("font-family", 'Georgia, "Times New Roman", serif')
      .attr("letter-spacing", "0.04em")
      .attr("fill", "#eef1f7")
      .attr("opacity", 0.94)
      .attr("pointer-events", "none")
      .text(item.label);
    item.cg.append("title").text(item.tip);
  });

  function setFocus(active) {
    groups.forEach((cg) => {
      const on = !active || cg.node() === active;
      cg.attr("opacity", on ? 1 : 0.22);
      cg.selectAll(".constellation-link").attr("opacity", on ? 0.75 : 0.14);
      cg.selectAll(".anchor-star").attr("opacity", on ? 1 : 0.28);
      cg.selectAll(".constellation-label").attr("opacity", on ? 0.96 : 0.32);
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
