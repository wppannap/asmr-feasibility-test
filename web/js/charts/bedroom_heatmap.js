/* Light panes for the 20 sampled videos. Values come from bedroom_filter_20.json. */
const SVG_NS = "http://www.w3.org/2000/svg";
const COOL = "#6ec6f5";
const AMBER = "#f4a259";
const DEEP = "#e8823a";
const EMBER = "#c4622e";

function el(name, attrs) {
  const node = document.createElementNS(SVG_NS, name);
  Object.entries(attrs || {}).forEach(([k, v]) => node.setAttribute(k, String(v)));
  return node;
}

function clamp(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function mix(a, b, t) {
  const k = clamp(t);
  const parse = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const pa = parse(a);
  const pb = parse(b);
  return "#" + pa.map((v, i) => Math.round(v + (pb[i] - v) * k).toString(16).padStart(2, "0")).join("");
}

function easeInOutCubic(t) {
  const p = clamp(t);
  return p < 0.5 ? 4 * p * p * p : 1 - ((-2 * p + 2) ** 3) / 2;
}

/* warmth > 0 is warm (17/20). dim is video_lum < 75 (10/20). */
function decorate(rows) {
  return rows.map((row) => ({
    code: row.code,
    warmth: row.warmth,
    video_lum: row.video_lum,
    warm: row.warmth > 0,
    dim: row.video_lum < 75,
  }));
}

function tipLine(row) {
  const warmth = Math.round(row.warmth);
  const lum = Math.round(row.video_lum);
  const warmBit = row.warm ? "Warm (+" + warmth + ")" : "Cool (" + warmth + ")";
  return "Video " + row.code + " · " + warmBit + " · Brightness " + lum + "/255";
}

export async function render(container) {
  if (!container) return;
  if (container._nwStop) container._nwStop();
  container.replaceChildren();
  container.classList.add("nw-stage");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const data = await d3.json("data/bedroom_filter_20.json?v=20261127m");
  const rows = decorate(data.rows);
  const n = rows.length;
  const nWarm = rows.filter((row) => row.warm).length;
  const nDim = rows.filter((row) => row.dim).length;
  const warmMin = Math.min(...rows.map((row) => row.warmth));
  const warmMax = Math.max(...rows.map((row) => row.warmth));
  const lumMax = Math.max(...rows.map((row) => row.video_lum)) || 1;
  const ordered = rows.slice().sort((a, b) => (b.warmth - a.warmth) || (b.video_lum - a.video_lum));

  const svg = el("svg", {
    class: "nw-svg",
    viewBox: "0 0 1100 760",
    preserveAspectRatio: "xMidYMid meet",
    role: "img",
    "aria-label": "Twenty ASMR videos as light panes. Amber is warm, cyan is cool, and the glow follows brightness.",
  });
  const defs = el("defs");
  const blur = el("filter", { id: "nw-glow", x: "-80%", y: "-80%", width: "260%", height: "260%" });
  blur.appendChild(el("feGaussianBlur", { stdDeviation: "10" }));
  defs.appendChild(blur);
  svg.appendChild(defs);

  const cols = 5;
  const paneW = 150;
  const paneH = 112;
  const gapX = 28;
  const gapY = 26;
  const gridW = cols * paneW + (cols - 1) * gapX;
  const gridH = 4 * paneH + 3 * gapY;
  const originX = (1100 - gridW) / 2;
  const originY = 54;

  function tone(warmth, night) {
    let base;
    if (warmth <= 0) {
      const t = warmMin < 0 ? clamp(warmth / warmMin) : 1;
      base = mix("#c5e6fb", COOL, 0.35 + 0.65 * t);
    } else {
      const t = warmMax > 0 ? clamp(warmth / warmMax) : 1;
      base = mix(AMBER, DEEP, t);
    }
    if (warmth > 0) base = mix(base, EMBER, night * 0.42);
    return base;
  }

  const wins = ordered.map((row, i) => {
    const col = i % cols;
    const line = Math.floor(i / cols);
    const x = originX + col * (paneW + gapX);
    const y = originY + line * (paneH + gapY);
    const lumT = clamp(row.video_lum / lumMax);
    const grad = el("radialGradient", { id: "nw-fill-" + row.code, cx: "50%", cy: "46%", r: "75%" });
    const stopCore = el("stop", { offset: "0%" });
    const stopMid = el("stop", { offset: "58%" });
    const stopEdge = el("stop", { offset: "100%" });
    grad.append(stopCore, stopMid, stopEdge);
    defs.appendChild(grad);
    const g = el("g", { class: "nw-pane", transform: "translate(" + x + " " + y + ")" });
    const halo = el("ellipse", {
      class: "nw-halo",
      cx: paneW / 2,
      cy: paneH / 2,
      fill: AMBER,
      filter: "url(#nw-glow)",
      "pointer-events": "none",
    });
    const glass = el("rect", {
      class: "nw-glass",
      width: paneW,
      height: paneH,
      rx: 16,
      fill: "url(#nw-fill-" + row.code + ")",
      stroke: "#f0ece3",
      "stroke-opacity": "0.14",
      "stroke-width": "1",
      "vector-effect": "non-scaling-stroke",
    });
    const code = el("text", {
      class: "nw-code",
      x: paneW - 12,
      y: paneH - 12,
      "text-anchor": "end",
      fill: "#f0ece3",
      "font-size": "11",
      "pointer-events": "none",
    });
    code.textContent = row.code;
    g.append(halo, glass, code);
    svg.appendChild(g);
    return { row, g, halo, glass, code, lumT, stopCore, stopMid, stopEdge };
  });

  const legend = el("text", {
    class: "nw-legend",
    x: 550,
    y: originY + gridH + 58,
    "text-anchor": "middle",
    fill: "#f0ece3",
    "font-size": "15",
  });
  legend.textContent = "Amber = Warm · Cyan = Cool · Brighter = Higher luminance";
  svg.appendChild(legend);

  const tip = document.createElement("div");
  tip.className = "nw-tip";
  tip.hidden = true;

  const table = document.createElement("table");
  table.className = "sr-only";
  const cap = document.createElement("caption");
  cap.textContent = "Brightness and color temperature for twenty ASMR videos";
  const head = document.createElement("thead");
  const hr = document.createElement("tr");
  ["Video", "Warm", "Dim", "Luminance"].forEach((label) => {
    const th = document.createElement("th");
    th.textContent = label;
    hr.appendChild(th);
  });
  head.appendChild(hr);
  const body = document.createElement("tbody");
  ordered.forEach((row) => {
    const tr = document.createElement("tr");
    [row.code, row.warm ? "yes" : "no", row.dim ? "yes" : "no", String(Math.round(row.video_lum))].forEach((cell) => {
      const td = document.createElement("td");
      td.textContent = cell;
      tr.appendChild(td);
    });
    body.appendChild(tr);
  });
  table.append(cap, head, body);
  container.append(svg, tip, table);

  let hot = null;
  function showTip(win, event) {
    hot = win;
    tip.textContent = tipLine(win.row);
    tip.hidden = false;
    const ax = event && event.clientX ? event.clientX : win.g.getBoundingClientRect().right;
    const ay = event && event.clientY ? event.clientY : win.g.getBoundingClientRect().top;
    const tipW = Math.min(320, window.innerWidth - 16);
    let left = ax + 14;
    if (left + tipW > window.innerWidth - 8) left = Math.max(8, ax - tipW - 8);
    tip.style.left = left + "px";
    tip.style.top = Math.max(8, ay - 28) + "px";
    if (reduced) apply(0.5);
  }
  function hideTip() {
    hot = null;
    tip.hidden = true;
    if (reduced) apply(0.5);
  }
  wins.forEach((win) => {
    win.g.addEventListener("pointerenter", (event) => showTip(win, event));
    win.g.addEventListener("pointermove", (event) => showTip(win, event));
    win.g.addEventListener("pointerleave", hideTip);
  });

  const track = container.closest(".bed-scroll");
  let running = true;
  let raf = 0;

  function apply(p) {
    const night = easeInOutCubic(reduced ? 0.5 : p);
    const level = 1 - 0.65 * night;
    wins.forEach((win) => {
      const row = win.row;
      const color = tone(row.warmth, row.warm ? night : night * 0.2);
      const reach = 0.78 + 0.22 * level;
      const rx = (46 + 78 * win.lumT) * reach;
      const ry = (30 + 46 * win.lumT) * reach;
      win.halo.setAttribute("rx", rx.toFixed(1));
      win.halo.setAttribute("ry", ry.toFixed(1));
      win.halo.setAttribute("fill", color);
      win.halo.setAttribute("fill-opacity", ((0.12 + 0.4 * win.lumT) * level).toFixed(3));
      const coreOp = ((0.5 + 0.5 * win.lumT) * level).toFixed(3);
      const midOp = ((0.38 + 0.48 * win.lumT) * level).toFixed(3);
      const edgeOp = ((0.22 + 0.4 * win.lumT) * level).toFixed(3);
      win.stopCore.setAttribute("stop-color", mix(color, row.warm ? "#fff1df" : "#f4fbff", 0.7));
      win.stopCore.setAttribute("stop-opacity", coreOp);
      win.stopMid.setAttribute("stop-color", color);
      win.stopMid.setAttribute("stop-opacity", midOp);
      win.stopEdge.setAttribute("stop-color", color);
      win.stopEdge.setAttribute("stop-opacity", edgeOp);
      win.code.setAttribute("opacity", win === hot ? "0.86" : "0");
    });
  }

  function progress() {
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    const total = track.offsetHeight - window.innerHeight;
    if (total <= 1) return 0;
    return clamp(-rect.top / total);
  }

  function frame() {
    if (!running) return;
    if (track) {
      const rect = track.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      if (rect.bottom < -40 || rect.top > vh + 40) {
        raf = requestAnimationFrame(frame);
        return;
      }
    }
    apply(progress());
    raf = requestAnimationFrame(frame);
  }

  if (reduced) apply(0.5);
  else raf = requestAnimationFrame(frame);
  container._nwStop = () => {
    running = false;
    cancelAnimationFrame(raf);
  };
  return { n, nWarm, nDim };
}
