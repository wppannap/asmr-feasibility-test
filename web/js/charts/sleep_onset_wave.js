/* Scroll-scrubbed descending frequency wave. No buttons. */
const STAGES = [
  {
    id: "01 · Attention Anchor",
    tags: "Picking · Scratching · Ear Cleaning · Rapid Trigger Switching · Roleplay",
  },
  {
    id: "02 · Immersion",
    tags: "Soft Brushing · Foam & Fabric Textures · Binaural Ear-to-Ear Rhythm",
  },
  {
    id: "03 · Drift Off",
    tags: "Snow Bag / Soft Noise Mix · Trigger Words & Counting · Slow Whispered Goodnight",
  },
];

function clamp(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
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

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "onset-svg");
  svg.setAttribute("viewBox", "0 0 1120 280");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Descending frequency wave from sharp triggers to a calm breath");
  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
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
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "url(#onset-stroke)");
  path.setAttribute("stroke-width", "2.4");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  path.setAttribute("filter", "url(#onset-glow)");
  path.setAttribute("d", buildPath(1120, 140));
  svg.appendChild(path);
  const head = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  head.setAttribute("r", "5.5");
  head.setAttribute("fill", "#f0ece3");
  head.setAttribute("filter", "url(#onset-glow)");
  svg.appendChild(head);
  container.appendChild(svg);

  const labels = document.createElement("div");
  labels.className = "onset-labels";
  STAGES.forEach((stageInfo, i) => {
    const block = document.createElement("div");
    block.className = "onset-stage";
    block.dataset.i = String(i);
    const name = document.createElement("p");
    name.className = "onset-name";
    name.textContent = stageInfo.id;
    const tags = document.createElement("p");
    tags.className = "onset-tags";
    tags.textContent = stageInfo.tags;
    block.appendChild(name);
    block.appendChild(tags);
    labels.appendChild(block);
  });
  container.appendChild(labels);

  const length = path.getTotalLength();
  path.style.strokeDasharray = String(length);

  function apply(progress) {
    const p = reduced ? 1 : progress;
    path.style.strokeDashoffset = String(length * (1 - p));
    const tip = path.getPointAtLength(Math.max(0.01, Math.min(length - 0.01, length * p)));
    head.setAttribute("cx", tip.x.toFixed(1));
    head.setAttribute("cy", tip.y.toFixed(1));
    head.style.opacity = p < 0.01 ? "0" : "1";
    labels.querySelectorAll(".onset-stage").forEach((el, i) => {
      const start = 0.08 + i * 0.28;
      const fade = reduced ? 1 : clamp((p - start) / 0.16);
      const opacity = String(reduced ? 1 : fade);
      el.querySelectorAll(".onset-name, .onset-tags").forEach((node) => {
        node.style.opacity = opacity;
      });
    });
  }

  function tick() {
    if (!stage) {
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
  tick();
  if (pin) pin.style.position = "sticky";
  return { update: tick };
}
