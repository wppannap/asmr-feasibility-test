/* Bedroom Filter — brightness × warmth glow field. Codes only, no video ids. */
import { motionApi } from "./entrance.js?v=20261127e";

const SVG_NS = "http://www.w3.org/2000/svg";
const VB_W = 720;
const VB_H = 460;
const PAD = { l: 86, r: 28, t: 28, b: 46 };
const X0 = 0;
const X1 = 220;
const Y0 = -80;
const Y1 = 80;

const LABELS = {
  V20: { text: "V20 · 37", dx: 16, dy: 18, anchor: "start" },
  V04: { text: "V04 · +63", dx: 16, dy: 4, anchor: "start" },
  V14: { text: "V14 · +67", dx: 16, dy: -14, anchor: "start" },
  V11: { text: "V11 · -68", dx: 16, dy: -14, anchor: "start" },
  V19: { text: "V19 · 202", dx: -16, dy: -14, anchor: "end" },
};

function el(name, attrs) {
  const node = document.createElementNS(SVG_NS, name);
  Object.entries(attrs || {}).forEach(([k, v]) => node.setAttribute(k, String(v)));
  return node;
}

function mix(a, b, t) {
  const parse = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const pa = parse(a);
  const pb = parse(b);
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return "rgb(" + c.join(",") + ")";
}

function dotColor(warmth) {
  const t = Math.max(-1, Math.min(1, warmth / 68));
  if (t >= 0) return mix("#f4a259", "#d95f24", t);
  return mix("#b7eef5", "#56c2d6", -t);
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

export async function render(container) {
  if (!container) return;
  if (container._bedUnlisten) container._bedUnlisten();
  const data = await d3.json("data/bedroom_filter_20.json?v=20261127e");
  const rows = (data && data.rows) || [];
  draw(container, rows);
}

function draw(container, rows) {
  container.replaceChildren();
  container.classList.add("bed-root");

  const plotW = VB_W - PAD.l - PAD.r;
  const plotH = VB_H - PAD.t - PAD.b;
  const xOf = (v) => PAD.l + ((v - X0) / (X1 - X0)) * plotW;
  const yOf = (v) => PAD.t + ((Y1 - v) / (Y1 - Y0)) * plotH;

  const svg = el("svg", {
    class: "bed-svg",
    viewBox: "0 0 " + VB_W + " " + VB_H,
    role: "img",
    "aria-label": "Brightness against warmth for twenty anonymized videos",
  });
  const defs = el("defs");
  const warm = el("radialGradient", { id: "bed-warm", cx: "50%", cy: "50%", r: "50%" });
  warm.append(
    el("stop", { offset: "0%", "stop-color": "#f4a259", "stop-opacity": "0.72" }),
    el("stop", { offset: "42%", "stop-color": "#d95f24", "stop-opacity": "0.28" }),
    el("stop", { offset: "100%", "stop-color": "#d95f24", "stop-opacity": "0" })
  );
  defs.appendChild(warm);
  const cool = el("radialGradient", { id: "bed-cool", cx: "50%", cy: "50%", r: "50%" });
  cool.append(
    el("stop", { offset: "0%", "stop-color": "#56c2d6", "stop-opacity": "0.7" }),
    el("stop", { offset: "55%", "stop-color": "#56c2d6", "stop-opacity": "0.16" }),
    el("stop", { offset: "100%", "stop-color": "#56c2d6", "stop-opacity": "0" })
  );
  defs.append(
    cool,
    el("filter", { id: "bed-blur", x: "-35%", y: "-35%", width: "170%", height: "170%" })
  );
  defs.querySelector("#bed-blur").appendChild(el("feGaussianBlur", { stdDeviation: "16" }));
  svg.appendChild(defs);

  const field = el("g", { class: "bed-field", filter: "url(#bed-blur)" });
  const bw = Math.abs(xOf(58) - xOf(0));
  rows.forEach((row) => {
    const mag = Math.min(1, Math.abs(row.warmth) / 70);
    const glow = el("circle", {
      cx: xOf(row.video_lum).toFixed(1),
      cy: yOf(row.warmth).toFixed(1),
      r: (bw * (0.62 + 0.5 * mag)).toFixed(1),
      fill: row.warmth >= 0 ? "url(#bed-warm)" : "url(#bed-cool)",
      opacity: (0.55 + 0.4 * mag).toFixed(2),
    });
    field.appendChild(glow);
  });

  const axes = el("g", { class: "bed-axes" });
  const xHair = el("line", {
    class: "bed-hair",
    x1: xOf(75).toFixed(1),
    x2: xOf(75).toFixed(1),
    y1: PAD.t,
    y2: PAD.t + plotH,
  });
  const yHair = el("line", {
    class: "bed-hair",
    x1: PAD.l,
    x2: PAD.l + plotW,
    y1: yOf(0).toFixed(1),
    y2: yOf(0).toFixed(1),
  });
  axes.append(xHair, yHair);

  const ticks = [
    { x: 0, text: "0 Dark", anchor: "start" },
    { x: 75, text: "75 Dim", anchor: "middle" },
    { x: 150, text: "150 Bright", anchor: "middle" },
    { x: 220, text: "220 Studio", anchor: "end" },
  ];
  ticks.forEach((tick) => {
    const node = el("text", {
      class: "bed-tick",
      x: xOf(tick.x).toFixed(1),
      y: PAD.t + plotH + 22,
      "text-anchor": tick.anchor,
    });
    node.textContent = tick.text;
    axes.appendChild(node);
  });
  const yTicks = [
    { y: 80, text: "+80 Warm" },
    { y: 0, text: "0" },
    { y: -80, text: "−80 Cool" },
  ];
  yTicks.forEach((tick) => {
    const node = el("text", {
      class: "bed-tick",
      x: PAD.l - 10,
      y: yOf(tick.y) + 4,
      "text-anchor": "end",
    });
    node.textContent = tick.text;
    axes.appendChild(node);
  });

  const zone = el("text", {
    class: "bed-zone",
    x: xOf(6).toFixed(1),
    y: yOf(74).toFixed(1),
  });
  zone.textContent = "Dim + Warm Sleep Zone";
  axes.appendChild(zone);
  const zoneLine = el("line", {
    class: "bed-zone-rule",
    x1: xOf(6).toFixed(1),
    x2: xOf(62).toFixed(1),
    y1: (yOf(74) + 6).toFixed(1),
    y2: (yOf(74) + 6).toFixed(1),
  });
  axes.appendChild(zoneLine);

  const dots = el("g", { class: "bed-dots" });
  const ordered = rows.slice().sort((a, b) => a.video_lum - b.video_lum);
  ordered.forEach((row) => {
    const color = dotColor(row.warmth);
    const cx = xOf(row.video_lum);
    const cy = yOf(row.warmth);
    const r = 5.2 + Math.min(2.2, Math.abs(row.warmth) / 40);
    const g = el("g", { class: "bed-dot", "data-code": row.code });
    g.appendChild(el("circle", {
      class: "bed-glow",
      cx: cx.toFixed(1),
      cy: cy.toFixed(1),
      r: (r + 4).toFixed(1),
      fill: color,
      opacity: "0.35",
    }));
    const core = el("circle", {
      class: "bed-core",
      cx: cx.toFixed(1),
      cy: cy.toFixed(1),
      r: r.toFixed(1),
      fill: color,
      "data-r": r.toFixed(2),
    });
    g.appendChild(core);
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

  svg.append(field, axes, dots, labels);
  const tip = document.createElement("div");
  tip.className = "bed-tip";
  tip.hidden = true;

  const halo = el("circle", {
    class: "bed-halo",
    cx: "0",
    cy: "0",
    r: "13",
    fill: "none",
    "stroke-width": "1",
    opacity: "0",
  });
  dots.appendChild(halo);

  function hideTip() {
    tip.hidden = true;
    halo.setAttribute("opacity", "0");
  }

  function showTip(event, group) {
    const info = JSON.parse(group.dataset.tip);
    tip.replaceChildren();
    const lines = [
      info.code,
      "In-video brightness " + fmtLum(info.lum),
      "Warmth (R−B) " + fmt(info.warmth),
      "Cover vs. video " + fmt(info.diff),
    ];
    lines.forEach((line, i) => {
      const p = document.createElement("p");
      p.textContent = line;
      if (i === 0) p.className = "bed-tip-code";
      tip.appendChild(p);
    });
    tip.hidden = false;
    const pad = 14;
    const rect = tip.getBoundingClientRect();
    let left = event.clientX + pad;
    let top = event.clientY + pad;
    if (left + rect.width > window.innerWidth - 8) left = event.clientX - rect.width - pad;
    if (top + rect.height > window.innerHeight - 8) top = event.clientY - rect.height - pad;
    tip.style.left = Math.max(8, left) + "px";
    tip.style.top = Math.max(8, top) + "px";
    const core = group.querySelector(".bed-core");
    halo.setAttribute("cx", core.getAttribute("cx"));
    halo.setAttribute("cy", core.getAttribute("cy"));
    halo.setAttribute("stroke", core.getAttribute("fill"));
    halo.setAttribute("opacity", "0.9");
  }

  dots.querySelectorAll(".bed-dot").forEach((group) => {
    group.addEventListener("pointerenter", (event) => showTip(event, group));
    group.addEventListener("pointermove", (event) => showTip(event, group));
    group.addEventListener("pointerleave", hideTip);
  });

  container.append(svg, tip);
  arm(container, { field, axes, dots, labels, hairs: [xHair, yHair], hideTip });
}

function arm(container, parts) {
  const api = motionApi();
  const groups = [parts.field, parts.axes, parts.dots, parts.labels];
  if (!api) {
    groups.forEach((node) => {
      node.style.opacity = "1";
    });
    parts.hairs.forEach((line) => line.setAttribute("stroke-dashoffset", "0"));
    return;
  }
  const { gsap } = api;
  gsap.set(parts.field, { opacity: 0 });
  gsap.set(parts.dots, { opacity: 0 });
  gsap.set(parts.labels, { opacity: 0 });
  gsap.set(parts.axes, { opacity: 0 });
  parts.hairs.forEach((line) => line.setAttribute("stroke-dashoffset", "80"));

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
    gsap.to(parts.axes, { opacity: 1, duration: 0.45, ease: "power1.out", overwrite: "auto" });
    gsap.to(parts.hairs, {
      attr: { "stroke-dashoffset": 0 },
      duration: 0.45,
      ease: "power1.out",
      overwrite: "auto",
    });
    gsap.to(parts.field, {
      opacity: 1,
      duration: 0.65,
      delay: 0.22,
      ease: "power1.out",
      overwrite: "auto",
    });
    const nodes = [...parts.dots.querySelectorAll(".bed-dot")];
    gsap.fromTo(
      nodes,
      { opacity: 0 },
      { opacity: 1, duration: 0.28, stagger: 0.04, delay: 0.5, overwrite: "auto" }
    );
    const cores = nodes.map((node) => node.querySelector(".bed-core"));
    gsap.fromTo(
      cores,
      { attr: { r: 1.4 } },
      {
        attr: { r: (i, node) => +node.getAttribute("data-r") },
        duration: 0.34,
        stagger: 0.04,
        delay: 0.5,
        ease: "power2.out",
        overwrite: "auto",
      }
    );
    gsap.to(parts.labels, { opacity: 1, duration: 0.4, delay: 0.72, overwrite: "auto" });
    gsap.set(parts.dots, { opacity: 1 });
  }

  function playOut() {
    if (!shown) return;
    shown = false;
    parts.hideTip();
    gsap.to([parts.field, parts.axes, parts.dots, parts.labels], {
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
