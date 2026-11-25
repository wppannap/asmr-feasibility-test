/* Creators · declared country — deep-night starfield constellations. */
import { attachTableToggle, clear, fmt, setCaveat } from "../charts/util.js?v=20261126p";
import { themeColors } from "../theme.js?v=20261126p";
import { renderReviewBanner } from "./review.js?v=20261126p";

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
 * Spread strongly tracks top-5% share so ~50% (TW) is ~2.2–2.5× ~23% (DE).
 * Channel count is only a light densify term.
 */
function clusterSpread(row, mobile) {
  const share = shareOf(row);
  const t = Math.max(0, Math.min(1, (share - 0.22) / (0.5 - 0.22)));
  const mul = 1 + Math.pow(t, 0.85) * 1.55; // ~1.0 @22% → ~2.55 @50%
  const base = mobile ? 30 : 38;
  const channelTerm = Math.sqrt(row.n_channels || 30) * (mobile ? 0.1 : 0.14);
  return base * mul + channelTerm;
}

/** Organic anchors kept inside the opaque sky core so labels never sit on the fade. */
function placeAnchors(rows, iw, ih, mobile) {
  const rand = mulberry32(hashSeed(`sky-anchors-${ctx.rule}-${rows.length}-v4`));
  const slots = [
    [0.28, 0.26],
    [0.58, 0.2],
    [0.78, 0.3],
    [0.36, 0.4],
    [0.68, 0.44],
    [0.22, 0.54],
    [0.5, 0.58],
    [0.76, 0.62],
    [0.32, 0.72],
    [0.56, 0.76],
    [0.72, 0.72],
  ];
  const nodes = rows.map((r, i) => {
    const spread = clusterSpread(r, mobile);
    const slot = slots[i % slots.length];
    let x = iw * (slot[0] + (rand() - 0.5) * 0.08);
    let y = ih * (slot[1] + (rand() - 0.5) * 0.08);
    // Stay inside ~central opaque mask (fade begins ~52% radius)
    x = Math.max(iw * 0.18, Math.min(iw * 0.82, x));
    y = Math.max(ih * 0.18, Math.min(ih * 0.8, y));
    return { row: r, x, y, r: spread * 0.82 + (mobile ? 8 : 10), spread };
  });

  for (let iter = 0; iter < 32; iter++) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.hypot(dx, dy) || 0.01;
        const minD = (a.r + b.r) * 0.72;
        if (dist < minD) {
          const push = ((minD - dist) / dist) * 0.38;
          dx *= push;
          dy *= push;
          a.x -= dx;
          a.y -= dy;
          b.x += dx;
          b.y += dy;
        }
      }
      nodes[i].x = Math.max(iw * 0.18, Math.min(iw * 0.82, nodes[i].x));
      nodes[i].y = Math.max(ih * 0.18, Math.min(ih * 0.8, nodes[i].y));
    }
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

/** Keep labels inside the dark core and separate overlapping boxes. */
function placeLabels(items, iw, ih, mobile) {
  const padX = iw * 0.16;
  const padY = ih * 0.16;
  const approxW = mobile ? 52 : 58;
  const approxH = mobile ? 12 : 13;
  const labels = items.map((it) => ({
    ...it,
    lx: Math.max(padX, Math.min(iw - padX, it.cx)),
    ly: Math.max(padY + 8, Math.min(ih - padY, it.preferY)),
  }));

  for (let iter = 0; iter < 40; iter++) {
    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) {
        const a = labels[i];
        const b = labels[j];
        const dx = b.lx - a.lx;
        const dy = b.ly - a.ly;
        const overlapX = approxW - Math.abs(dx);
        const overlapY = approxH - Math.abs(dy);
        if (overlapX > 0 && overlapY > 0) {
          const push = 0.5;
          if (Math.abs(dy) >= Math.abs(dx)) {
            const s = (overlapY / 2) * push * (dy === 0 ? (i % 2 ? 1 : -1) : Math.sign(dy) || 1);
            a.ly -= s;
            b.ly += s;
          } else {
            const s = (overlapX / 2) * push * (dx === 0 ? (i % 2 ? 1 : -1) : Math.sign(dx) || 1);
            a.lx -= s;
            b.lx += s;
          }
        }
      }
      labels[i].lx = Math.max(padX, Math.min(iw - padX, labels[i].lx));
      labels[i].ly = Math.max(padY + 8, Math.min(ih - padY, labels[i].ly));
    }
  }
  return labels;
}

function draw() {
  const mount = ctx.mount;
  clear(mount);
  const rows = filtered();
  const w = Math.max(320, mount.clientWidth || 640);
  const mobile = w < 560;
  const h = mobile ? 480 : 540;
  const pad = 6;

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

  // Clean deep midnight indigo — no muddy dusk-to-paper colour mix
  const skyGrad = defs
    .append("radialGradient")
    .attr("id", "creators-midnight-sky")
    .attr("cx", "50%")
    .attr("cy", "46%")
    .attr("r", "70%");
  skyGrad.append("stop").attr("offset", "0%").attr("stop-color", "#1a2642");
  skyGrad.append("stop").attr("offset", "100%").attr("stop-color", "#11182b");

  // Alpha mask: fully opaque to 52%, gone by 96% (transparent before SVG edges)
  const feather = defs
    .append("radialGradient")
    .attr("id", "creators-sky-feather-grad")
    .attr("cx", "50%")
    .attr("cy", "48%")
    .attr("r", "72%");
  feather.append("stop").attr("offset", "0%").attr("stop-color", "#fff").attr("stop-opacity", 1);
  feather.append("stop").attr("offset", "52%").attr("stop-color", "#fff").attr("stop-opacity", 1);
  feather.append("stop").attr("offset", "78%").attr("stop-color", "#fff").attr("stop-opacity", 0.45);
  feather.append("stop").attr("offset", "96%").attr("stop-color", "#000").attr("stop-opacity", 0);
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
  glow.append("feGaussianBlur").attr("stdDeviation", 1.5).attr("result", "b");
  const merge = glow.append("feMerge");
  merge.append("feMergeNode").attr("in", "b");
  merge.append("feMergeNode").attr("in", "SourceGraphic");

  // Borderless masked sky — page ivory shows through via alpha only
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

  const fieldRand = mulberry32(0xc0ffee ^ hashSeed(ctx.rule));
  const fieldN = 260;
  for (let i = 0; i < fieldN; i++) {
    g.append("circle")
      .attr("class", "field-star")
      .attr("cx", fieldRand() * iw)
      .attr("cy", fieldRand() * ih)
      .attr("r", 0.35 + fieldRand() * 1.15)
      .attr("fill", "#e8ecf5")
      .attr("opacity", 0.1 + fieldRand() * 0.4);
  }

  [
    { cx: iw * 0.34, cy: ih * 0.55, r: Math.min(iw, ih) * 0.5 },
    { cx: iw * 0.7, cy: ih * 0.4, r: Math.min(iw, ih) * 0.36 },
  ].forEach((arc, i) => {
    g.append("circle")
      .attr("class", "celestial-arc")
      .attr("cx", arc.cx)
      .attr("cy", arc.cy)
      .attr("r", arc.r)
      .attr("fill", "none")
      .attr("stroke", "#e8ecf5")
      .attr("stroke-width", 0.7)
      .attr("opacity", 0.07)
      .attr("stroke-dasharray", i === 0 ? "2 12" : "1 15");
  });

  const anchors = placeAnchors(rows, iw, ih, mobile);
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
    const nStars = Math.round(6 + Math.min(26, Math.sqrt(nCh) * 0.95) + share * 10);
    const rand = mulberry32(hashSeed(`${ctx.rule}-${code}-stars-v4`));
    const stars = buildStars(anchor, nStars, spread, share, rand);

    const xs = stars.map((s) => s.x);
    const ys = stars.map((s) => s.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const hitCx = (minX + maxX) / 2;
    const hitCy = (minY + maxY) / 2;
    const hitR = spread * 1.04 + (mobile ? 4 : 6);

    const cg = constellations
      .append("g")
      .attr("class", `constellation c-${code}`)
      .attr("tabindex", 0)
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

    const label = pct != null ? `${code === "UNKNOWN" ? "unknown" : code} ${pct}%` : code === "UNKNOWN" ? "unknown" : code;
    labelItems.push({
      cg,
      code,
      label,
      cx: hitCx,
      preferY: Math.min(ih * 0.82, maxY + 15),
      tip:
        `${row.country}: ${row.n_channels} channels, ${row.n_videos} videos` +
        (pct != null ? `, top 5% share ${pct}%` : ""),
    });

    groups.push(cg);
  });

  const placed = placeLabels(labelItems, iw, ih, mobile);
  placed.forEach((item) => {
    item.cg
      .append("text")
      .attr("class", "constellation-label")
      .attr("x", item.lx)
      .attr("y", item.ly)
      .attr("text-anchor", "middle")
      .attr("font-size", mobile ? 10 : 11)
      .attr("font-family", 'Georgia, "Times New Roman", serif')
      .attr("letter-spacing", "0.04em")
      .attr("fill", "#eef1f7")
      .attr("opacity", 0.92)
      .attr("pointer-events", "none")
      .text(item.label);
    item.cg.append("title").text(item.tip);
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
