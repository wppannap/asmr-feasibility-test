/* Scroll-scrubbed descending frequency wave. Props anchored on the path. No buttons. */
const STAGES = [
  {
    caption: "01 · Earpick & Picking",
    img: "img/props/stage1_props.jpg?v=20261127c",
    alt: "Bamboo earpick beside a glowing picking pad",
    at: 0.16,
    above: true,
    tone: "#f4a259",
  },
  {
    caption: "02 · Brush & Sponge",
    img: "img/props/stage2_props.jpg?v=20261127c",
    alt: "Fluffy makeup brush beside a soft foam sponge",
    at: 0.5,
    above: false,
    tone: "#c9b59a",
  },
  {
    caption: "03 · Snow Bag & Mic",
    img: "img/props/stage3_props.jpg?v=20261127c",
    alt: "A bag of snow beads beside a microphone with a fluffy windscreen",
    at: 0.84,
    above: true,
    tone: "#56c2d6",
  },
];

function clamp(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function svgEl(name, attrs) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.entries(attrs || {}).forEach(([k, v]) => node.setAttribute(k, String(v)));
  return node;
}

function buildPath(width, midY) {
  const pts = [];
  let phase = 0;
  const steps = 280;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const freq = 22 * Math.exp(-3.1 * t) + 0.55;
    phase += freq * 0.085;
    const jag = Math.sin(phase * 6.2) * 18 * Math.pow(Math.max(0, 1 - t / 0.34), 1.4);
    const roll = Math.sin(phase) * (46 * (1 - t) + 7);
    const calm = Math.sin(t * Math.PI) * 8 * Math.max(0, (t - 0.62) / 0.38);
    const y = midY + roll + jag * (t < 0.66 ? 1 : 0.25) + calm;
    pts.push([20 + t * (width - 40), y]);
  }
  return pts.map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
}

export function render(container) {
  if (!container) return;
  const stage = container.closest(".onset-scroll");
  const pin = container.closest(".onset-pin");
  container.replaceChildren();
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const svg = svgEl("svg", {
    class: "onset-svg",
    viewBox: "0 0 1120 280",
    role: "img",
    "aria-label": "Descending frequency wave from sharp triggers to a calm breath",
  });
  const defs = svgEl("defs");
  defs.innerHTML =
    '<linearGradient id="onset-stroke" x1="0" y1="0" x2="1" y2="0">' +
    '<stop offset="0%" stop-color="#f4a259"/>' +
    '<stop offset="33%" stop-color="#f4a259"/>' +
    '<stop offset="66%" stop-color="#7f93c4"/>' +
    '<stop offset="100%" stop-color="#56c2d6"/>' +
    "</linearGradient>" +
    '<filter id="onset-glow" x="-8%" y="-80%" width="116%" height="260%">' +
    '<feGaussianBlur stdDeviation="3.2" result="b"/>' +
    "<feMerge><feMergeNode in=\"b\"/><feMergeNode in=\"SourceGraphic\"/></feMerge>" +
    "</filter>";
  svg.appendChild(defs);
  const path = svgEl("path", {
    fill: "none",
    stroke: "url(#onset-stroke)",
    "stroke-width": "2.4",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    filter: "url(#onset-glow)",
    d: buildPath(1120, 140),
  });
  svg.appendChild(path);
  const head = svgEl("circle", { r: "5.5", fill: "#f0ece3", filter: "url(#onset-glow)" });
  svg.appendChild(head);

  const rings = STAGES.map((info) => {
    const ring = svgEl("g", { class: "onset-ring" });
    ring.append(
      svgEl("circle", { r: "11", fill: "none", stroke: info.tone, "stroke-width": "1.2", opacity: "0.35" }),
      svgEl("circle", { r: "5.5", fill: "none", stroke: info.tone, "stroke-width": "1.6" }),
      svgEl("circle", { r: "2.2", fill: info.tone })
    );
    ring.style.color = info.tone;
    svg.appendChild(ring);
    return ring;
  });
  container.appendChild(svg);

  const leaders = svgEl("svg", { class: "onset-leaders", "aria-hidden": "true" });
  const stems = STAGES.map((info) => {
    const stem = svgEl("path", {
      class: "onset-stem",
      fill: "none",
      stroke: info.tone,
      "stroke-width": "1",
      "stroke-linecap": "round",
    });
    leaders.appendChild(stem);
    return stem;
  });
  container.appendChild(leaders);

  const blocks = STAGES.map((info) => {
    const block = document.createElement("div");
    block.className = "onset-stage" + (info.above ? " is-above" : " is-below");
    const bloom = document.createElement("div");
    bloom.className = "onset-bloom";
    const fig = document.createElement("figure");
    fig.className = "onset-prop";
    const img = document.createElement("img");
    img.src = info.img;
    img.alt = info.alt;
    img.decoding = "async";
    fig.appendChild(img);
    const caption = document.createElement("p");
    caption.className = "onset-caption";
    caption.textContent = info.caption;
    bloom.append(fig, caption);
    block.appendChild(bloom);
    container.appendChild(block);
    img.addEventListener("load", () => place());
    return { block, bloom };
  });

  const length = path.getTotalLength();
  path.style.strokeDasharray = String(length);
  function pointForT(t) {
    const targetX = 20 + t * (1120 - 40);
    let bestLen = 0;
    let best = path.getPointAtLength(0);
    let bestDist = 1e9;
    for (let i = 0; i <= 420; i++) {
      const len = (length * i) / 420;
      const pt = path.getPointAtLength(len);
      const dist = Math.abs(pt.x - targetX);
      if (dist < bestDist) {
        bestDist = dist;
        best = pt;
        bestLen = len;
      }
    }
    return { pt: best, frac: bestLen / length };
  }
  const anchors = STAGES.map((info) => {
    const hit = pointForT(info.at);
    info.reveal = hit.frac;
    return hit.pt;
  });
  rings.forEach((ring, i) => {
    ring.setAttribute("transform", "translate(" + anchors[i].x.toFixed(1) + " " + anchors[i].y.toFixed(1) + ")");
  });

  let placedW = 0;

  function screenPoint(pt) {
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const p = svg.createSVGPoint();
    p.x = pt.x;
    p.y = pt.y;
    return p.matrixTransform(ctm);
  }

  function place() {
    const box = container.getBoundingClientRect();
    if (box.width < 2 || box.height < 2) return;
    placedW = box.width;
    leaders.setAttribute("viewBox", "0 0 " + box.width.toFixed(1) + " " + box.height.toFixed(1));
    STAGES.forEach((info, i) => {
      const sp = screenPoint(anchors[i]);
      const node = blocks[i].block;
      if (!sp) return;
      const ringX = sp.x - box.left;
      const ringY = sp.y - box.top;
      node.style.top = (info.above ? ringY - 28 : ringY + 28) + "px";
      node.style.left = ringX + "px";
      const half = node.offsetWidth / 2;
      const clamped = Math.max(half + 10, Math.min(box.width - half - 10, ringX));
      node.style.left = clamped + "px";
      const wave = svg.getBoundingClientRect();
      let nb = node.getBoundingClientRect();
      if (info.above && nb.bottom > wave.top - 6) {
        node.style.top = (parseFloat(node.style.top) - (nb.bottom - wave.top) - 8) + "px";
      }
      if (!info.above && nb.top < wave.bottom + 6) {
        node.style.top = (parseFloat(node.style.top) + (wave.bottom - nb.top) + 8) + "px";
      }
      nb = node.getBoundingClientRect();
      if (nb.right > box.right - 8) node.style.left = (parseFloat(node.style.left) - (nb.right - box.right) - 8) + "px";
      if (nb.left < box.left + 8) node.style.left = (parseFloat(node.style.left) + (box.left + 8 - nb.left)) + "px";
      nb = node.getBoundingClientRect();
      const x2 = nb.left + nb.width / 2 - box.left;
      const y2 = info.above ? nb.bottom - box.top : nb.top - box.top;
      const bend = (i === 1 ? -28 : 22) * (x2 > ringX ? 1 : -1);
      stems[i].setAttribute(
        "d",
        "M " + ringX.toFixed(1) + " " + ringY.toFixed(1) +
        " Q " + ((ringX + x2) / 2 + bend).toFixed(1) + " " + ((ringY + y2) / 2).toFixed(1) +
        " " + x2.toFixed(1) + " " + y2.toFixed(1)
      );
    });
  }

  function apply(progress) {
    const p = reduced ? 1 : progress;
    path.style.strokeDashoffset = String(length * (1 - p));
    const tip = path.getPointAtLength(Math.max(0.01, Math.min(length - 0.01, length * p)));
    head.setAttribute("cx", tip.x.toFixed(1));
    head.setAttribute("cy", tip.y.toFixed(1));
    head.style.opacity = p < 0.01 ? "0" : "1";
    if (Math.abs(container.getBoundingClientRect().width - placedW) > 1) place();
    STAGES.forEach((info, i) => {
      const span = Math.min(0.08, Math.max(0.015, 1 - info.reveal));
      const local = reduced ? 1 : clamp((p - info.reveal) / span);
      const ringT = clamp(local / 0.34);
      const stemT = clamp((local - 0.16) / 0.5);
      const propT = clamp((local - 0.42) / 0.58);
      rings[i].style.opacity = String(ringT);
      const stemLen = stems[i].getTotalLength() || 1;
      stems[i].style.strokeDasharray = String(stemLen);
      stems[i].style.strokeDashoffset = String(stemLen * (1 - stemT));
      stems[i].style.opacity = stemT > 0.02 ? "1" : "0";
      blocks[i].bloom.style.opacity = String(propT);
      blocks[i].bloom.style.transform = reduced ? "none" : "scale(" + (0.88 + 0.12 * propT).toFixed(3) + ")";
    });
  }

  function tick() {
    if (!stage) {
      place();
      apply(1);
      return;
    }
    const rect = stage.getBoundingClientRect();
    const total = stage.offsetHeight - window.innerHeight;
    const passed = clamp(-rect.top / Math.max(1, total));
    apply(passed);
  }

  if (container._onsetTick) {
    window.removeEventListener("scroll", container._onsetTick);
    window.removeEventListener("resize", container._onsetTick);
  }
  container._onsetTick = tick;
  window.addEventListener("scroll", tick, { passive: true });
  window.addEventListener("resize", tick, { passive: true });
  place();
  tick();
  if (pin) pin.style.position = "sticky";
  return { update: tick };
}
