/* Scroll-scrubbed descending frequency wave. No buttons. */
const STAGES = [
  {
    id: "01 · Attention Anchor",
    tags: "Picking · Scratching · Ear Cleaning · Rapid Trigger Switching · Roleplay",
    img: "img/props/stage1_props.jpg?v=20261127c",
    alt: "Bamboo earpick beside a glowing picking pad",
    caption: "Bamboo Earpick · Picking Pad",
    cue: "e.g. 02:44 Picking pad",
    at: 0.12,
  },
  {
    id: "02 · Immersion",
    tags: "Soft Brushing · Foam & Fabric Textures · Binaural Ear-to-Ear Rhythm",
    img: "img/props/stage2_props.jpg?v=20261127c",
    alt: "Fluffy makeup brush beside a soft foam sponge",
    caption: "Fluffy Brush · Soft Foam Sponge",
    cue: "Face & mic brushing",
    at: 0.42,
  },
  {
    id: "03 · Drift Off",
    tags: "Snow Bag / Soft Noise Mix · Trigger Words & Counting · Slow Whispered Goodnight",
    img: "img/props/stage3_props.jpg?v=20261127c",
    alt: "A bag of snow beads beside a microphone with a fluffy windscreen",
    caption: "Snow Bag · Fluffy Windscreen Mic",
    cue: "e.g. 2:39:57 Snow bag · 41:33 Whisper goodbye",
    at: 0.72,
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
    const fig = document.createElement("figure");
    fig.className = "onset-prop";
    const img = document.createElement("img");
    img.src = stageInfo.img;
    img.alt = stageInfo.alt;
    img.decoding = "async";
    fig.appendChild(img);
    const caption = document.createElement("p");
    caption.className = "onset-caption";
    caption.textContent = stageInfo.caption;
    const cue = document.createElement("p");
    cue.className = "onset-cue";
    cue.textContent = stageInfo.cue;
    const tags = document.createElement("p");
    tags.className = "onset-tags";
    tags.textContent = stageInfo.tags;
    block.appendChild(name);
    block.appendChild(fig);
    block.appendChild(caption);
    block.appendChild(cue);
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
      const start = STAGES[i].at;
      const fade = reduced ? 1 : clamp((p - start) / 0.16);
      el.style.opacity = String(fade);
      el.style.transform = reduced ? "none" : "translateY(" + ((1 - fade) * 18).toFixed(1) + "px)";
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
