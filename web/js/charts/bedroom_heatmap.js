/* Bedroom Lighting Spectrum. Codes only, no video ids. No blur field. */
import { motionApi } from "./entrance.js?v=20261127j";

const SVG_NS = "http://www.w3.org/2000/svg";
const VB_W = 760;
const VB_H = 520;
const PAD = { l: 128, r: 28, t: 34, b: 86 };
const X0 = 0;
const X1 = 220;
const Y0 = -80;
const Y1 = 80;

const LABELS = {
  V20: { text: "V20", dx: 14, dy: 16, anchor: "start" },
  V04: { text: "V04", dx: 14, dy: 4, anchor: "start" },
  V14: { text: "V14", dx: 14, dy: -12, anchor: "start" },
  V11: { text: "V11", dx: 14, dy: -12, anchor: "start" },
  V19: { text: "V19", dx: -14, dy: -12, anchor: "end" },
};

const SOURCES = [
  { x: 25, name: "Candlelight", kind: "candle" },
  { x: 65, name: "Bedside Lamp (<75)", kind: "bedside" },
  { x: 125, name: "Room Light", kind: "room" },
  { x: 200, name: "Studio Light", kind: "studio" },
];

function el(name, attrs) {
  const node = document.createElementNS(SVG_NS, name);
  Object.entries(attrs || {}).forEach(([k, v]) => node.setAttribute(k, String(v)));
  return node;
}

function mix(a, b, t) {
  const clamped = Math.max(0, Math.min(1, t));
  const parse = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const pa = parse(a);
  const pb = parse(b);
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * clamped));
  return "rgb(" + c.join(",") + ")";
}

function lampColor(warmth) {
  if (warmth < 0) return "#56c2d6";
  if (warmth < 18) return "#f6cf92";
  if (warmth >= 50) return "#f06a2b";
  return mix("#f4a259", "#f06a2b", (warmth - 18) / 32);
}

function fmt(n) {
  const v = Math.round(n * 10) / 10;
  const body = Number.isInteger(v) ? v.toFixed(1) : String(v);
  return (v > 0 ? "+" : "") + body;
}

function fmtLum(n) {
  const v = Math.round(n * 10) / 10;
  return Number.isInteger(v) ? v.toFixed(1) : String(v);
}

function iconPaths(kind) {
  if (kind === "candle") {
    return ["M12 21.5 V11", "M8.5 21.5 H15.5", "M12 11 C10.2 9.1 10.1 6.6 12 4.2 C13.9 6.6 13.8 9.1 12 11"];
  }
  if (kind === "bedside") {
    return ["M7 8.5 H17 L15.2 13 H8.8 Z", "M12 13 V18.5", "M8 18.5 H16", "M9.2 8.5 V6.2 H14.8 V8.5"];
  }
  if (kind === "room") {
    return ["M12 2.5 V6.5", "M7.5 6.5 H16.5 L14.4 13 H9.6 Z", "M10.2 13 V15.2", "M13.8 13 V15.2"];
  }
  return ["M12 8.2 A3.8 3.8 0 1 0 12 15.8 A3.8 3.8 0 1 0 12 8.2", "M12 3.2 V5.4", "M12 18.6 V20.8", "M4.6 12 H6.8", "M17.2 12 H19.4", "M6.6 6.6 L8.1 8.1", "M15.9 15.9 L17.4 17.4", "M17.4 6.6 L15.9 8.1", "M8.1 15.9 L6.6 17.4"];
}

export async function render(container) {
  if (!container) return;
  if (container._bedUnlisten) container._bedUnlisten();
  const data = await d3.json("data/bedroom_filter_20.json?v=20261127j");
  draw(container, (data && data.rows) || []);
}

function draw(container, rows) {
  container.replaceChildren();
  container.classList.add("bed-root");

  const plotW = VB_W - PAD.l - PAD.r;
  const plotH = VB_H - PAD.t - PAD.b;
  const xOf = (v) => PAD.l + ((v - X0) / (X1 - X0)) * plotW;
  const yOf = (v) => PAD.t + ((Y1 - v) / (Y1 - Y0)) * plotH;
  const axisY = PAD.t + plotH;

  const svg = el("svg", {
    class: "bed-svg",
    viewBox: "0 0 " + VB_W + " " + VB_H,
    role: "img",
    "aria-label": "Bedroom lighting spectrum for twenty anonymized videos",
  });

  const axes = el("g", { class: "bed-axes" });
  const zoneX = xOf(0);
  const zoneY = yOf(80);
  const zone = el("rect", {
    class: "bed-zone-box",
    x: zoneX.toFixed(1),
    y: zoneY.toFixed(1),
    width: (xOf(75) - zoneX).toFixed(1),
    height: (yOf(0) - zoneY).toFixed(1),
  });
  axes.appendChild(zone);
  const zoneLabel = el("text", {
    class: "bed-zone",
    x: (zoneX + 8).toFixed(1),
    y: (zoneY + 16).toFixed(1),
  });
  const zoneA = el("tspan", { x: (zoneX + 8).toFixed(1), dy: "0" });
  zoneA.textContent = "Bedside Sleep Zone";
  const zoneB = el("tspan", { x: (zoneX + 8).toFixed(1), dy: "13" });
  zoneB.textContent = "(50% dim · 85% warm)";
  zoneLabel.append(zoneA, zoneB);
  axes.appendChild(zoneLabel);

  const xAxis = el("line", {
    class: "bed-axis",
    x1: xOf(0).toFixed(1),
    x2: xOf(220).toFixed(1),
    y1: axisY.toFixed(1),
    y2: axisY.toFixed(1),
  });
  const yHair = el("line", {
    class: "bed-hair",
    x1: xOf(0).toFixed(1),
    x2: xOf(220).toFixed(1),
    y1: yOf(0).toFixed(1),
    y2: yOf(0).toFixed(1),
  });
  axes.append(xAxis, yHair);

  const warmLab = el("text", {
    class: "bed-tick bed-warm-lab",
    x: (PAD.l - 12).toFixed(1),
    y: (yOf(80) + 4).toFixed(1),
    "text-anchor": "end",
  });
  warmLab.textContent = "+80 Warm 2700K";
  const zeroLab = el("text", {
    class: "bed-tick",
    x: (PAD.l - 12).toFixed(1),
    y: (yOf(0) + 4).toFixed(1),
    "text-anchor": "end",
  });
  zeroLab.textContent = "0";
  const coolLab = el("text", {
    class: "bed-tick bed-cool-lab",
    x: (PAD.l - 12).toFixed(1),
    y: (yOf(-80) + 4).toFixed(1),
    "text-anchor": "end",
  });
  coolLab.textContent = "−80 Cool 6500K";
  axes.append(warmLab, zeroLab, coolLab);

  SOURCES.forEach((src) => {
    const gx = xOf(src.x);
    const gy = axisY + 14;
    const g = el("g", {
      class: "bed-source",
      transform: "translate(" + (gx - 11).toFixed(1) + " " + gy.toFixed(1) + ")",
    });
    const glyph = el("g", { fill: "none", stroke: "#98a4be", "stroke-width": "1.3", "stroke-linecap": "round", "stroke-linejoin": "round" });
    iconPaths(src.kind).forEach((d) => glyph.appendChild(el("path", { d: d })));
    g.appendChild(glyph);
    const cap = el("text", {
      class: "bed-source-lab",
      x: "11",
      y: src.kind === "bedside" ? "36" : "34",
      "text-anchor": "middle",
    });
    if (src.kind === "bedside") {
      const a = el("tspan", { x: "11", dy: "0" });
      a.textContent = "Bedside Lamp";
      const b = el("tspan", { x: "11", dy: "11" });
      b.textContent = "(<75)";
      cap.append(a, b);
    } else {
      cap.textContent = src.name;
    }
    g.appendChild(cap);
    axes.appendChild(g);
  });

  const dots = el("g", { class: "bed-dots" });
  const ordered = rows.slice().sort((a, b) => a.video_lum - b.video_lum);
  ordered.forEach((row) => {
    const color = lampColor(row.warmth);
    const lumT = Math.max(0, Math.min(1, (row.video_lum - 30) / 175));
    const cx = xOf(row.video_lum);
    const cy = yOf(row.warmth);
    const coreR = 4.5 + 1.5 * lumT;
    const haloR = 12 + 4 * lumT;
    const g = el("g", { class: "bed-lamp", "data-code": row.code });
    const coneBottom = Math.min(cy + 42, axisY - 6);
    const cone = el("polygon", {
      class: "bed-cone",
      points: [
        cx.toFixed(1) + "," + (cy + coreR).toFixed(1),
        (cx - 12).toFixed(1) + "," + coneBottom.toFixed(1),
        (cx + 12).toFixed(1) + "," + coneBottom.toFixed(1),
      ].join(" "),
      fill: color,
    });
    const halo = el("circle", {
      class: "bed-halo",
      cx: cx.toFixed(1),
      cy: cy.toFixed(1),
      r: haloR.toFixed(1),
      fill: color,
    });
    const core = el("circle", {
      class: "bed-core",
      cx: cx.toFixed(1),
      cy: cy.toFixed(1),
      r: coreR.toFixed(1),
      fill: mix(color, "#fff4d6", lumT > 0.75 ? (lumT - 0.75) * 2.1 : lumT * 0.08),
    });
    const glass = el("circle", {
      class: "bed-glass",
      cx: cx.toFixed(1),
      cy: cy.toFixed(1),
      r: (coreR + 1.3).toFixed(1),
      fill: "none",
      stroke: color,
    });
    const filament = el("path", {
      class: "bed-filament",
      d: "M" + cx.toFixed(1) + " " + (cy - coreR * 0.35).toFixed(1) + " v" + (coreR * 0.7).toFixed(1),
      stroke: lumT > 0.65 ? "#fff8e4" : color,
    });
    g.append(cone, halo, glass, core, filament);
    g.dataset.tip = JSON.stringify({
      code: row.code,
      lum: row.video_lum,
      warmth: row.warmth,
      diff: Math.round((row.cover_lum - row.video_lum) * 10) / 10,
    });
    dots.appendChild(g);
  });

  const labels = el("g", { class: "bed-labels" });
  ordered.forEach((row) => {
    const spec = LABELS[row.code];
    if (!spec) return;
    const node = el("text", {
      class: "bed-label",
      x: (xOf(row.video_lum) + spec.dx).toFixed(1),
      y: (yOf(row.warmth) + spec.dy).toFixed(1),
      "text-anchor": spec.anchor,
    });
    node.textContent = spec.text;
    labels.appendChild(node);
  });

  svg.append(axes, dots, labels);
  const tip = document.createElement("div");
  tip.className = "bed-tip";
  tip.hidden = true;

  function hideTip() {
    tip.hidden = true;
    dots.classList.remove("is-hot");
    dots.querySelectorAll(".bed-lamp.is-on").forEach((node) => node.classList.remove("is-on"));
  }

  function showTip(event, group) {
    const info = JSON.parse(group.dataset.tip);
    tip.replaceChildren();
    [
      info.code,
      "Brightness " + fmtLum(info.lum),
      "Warmth " + fmt(info.warmth),
      "Cover vs. video " + fmt(info.diff),
    ].forEach((line, i) => {
      const p = document.createElement("p");
      p.textContent = line;
      if (i === 0) p.className = "bed-tip-code";
      tip.appendChild(p);
    });
    tip.hidden = false;
    tip.style.left = "0px";
    tip.style.top = "0px";
    const rect = tip.getBoundingClientRect();
    let left = event.clientX + 14;
    let top = event.clientY + 14;
    if (left + rect.width > window.innerWidth - 8) left = event.clientX - rect.width - 14;
    if (top + rect.height > window.innerHeight - 8) top = event.clientY - rect.height - 12;
    tip.style.left = Math.max(8, left) + "px";
    tip.style.top = Math.max(8, top) + "px";
    dots.classList.add("is-hot");
    dots.querySelectorAll(".bed-lamp").forEach((node) => node.classList.toggle("is-on", node === group));
  }

  dots.querySelectorAll(".bed-lamp").forEach((group) => {
    group.addEventListener("pointerenter", (event) => showTip(event, group));
    group.addEventListener("pointermove", (event) => showTip(event, group));
    group.addEventListener("pointerleave", hideTip);
  });

  container.append(svg, tip);
  arm(container, { axes, dots, labels, hideTip });
}

function arm(container, parts) {
  const api = motionApi();
  if (!api) {
    [parts.axes, parts.dots, parts.labels].forEach((node) => {
      node.style.opacity = "1";
    });
    return;
  }
  const { gsap } = api;
  gsap.set(parts.axes, { opacity: 0 });
  gsap.set(parts.labels, { opacity: 0 });
  gsap.set(parts.dots.querySelectorAll(".bed-lamp"), { opacity: 0 });

  const trigger = container.closest(".story-scene") || container;
  let shown = false;
  let ticking = false;

  function inView() {
    const r = trigger.getBoundingClientRect();
    const vh = window.innerHeight || 1;
    return r.top < vh * 0.86 && r.bottom > vh * 0.14;
  }

  function playIn() {
    if (shown) return;
    shown = true;
    gsap.set(parts.dots, { opacity: 1 });
    gsap.to(parts.axes, { opacity: 1, duration: 0.4, ease: "power1.out", overwrite: "auto" });
    const lamps = [...parts.dots.querySelectorAll(".bed-lamp")];
    gsap.fromTo(lamps, { opacity: 0 }, {
      opacity: 1,
      duration: 0.22,
      stagger: 0.033,
      delay: 0.4,
      ease: "power1.out",
      overwrite: "auto",
      clearProps: "opacity",
    });
    gsap.to(parts.labels, { opacity: 1, duration: 0.35, delay: 1.05, overwrite: "auto" });
  }

  function playOut() {
    if (!shown) return;
    shown = false;
    parts.hideTip();
    gsap.to([parts.axes, parts.dots, parts.labels], {
      opacity: 0,
      duration: 0.32,
      overwrite: "auto",
    });
  }

  function tick() {
    ticking = false;
    if (inView()) playIn();
    else playOut();
  }
  function request() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(tick);
  }
  window.addEventListener("scroll", request, { passive: true });
  window.addEventListener("resize", request, { passive: true });
  container._bedUnlisten = () => {
    window.removeEventListener("scroll", request);
    window.removeEventListener("resize", request);
  };
  request();
}
