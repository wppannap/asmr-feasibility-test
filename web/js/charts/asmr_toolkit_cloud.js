/* The ASMR Toolkit — packed editorial word cloud. No buttons, no visible percentages. */
import { motionApi } from "./entrance.js?v=20261127k";

const SVG_NS = "http://www.w3.org/2000/svg";
const GROUPS = {
  craft: { color: "#f4a259", label: "Visual craft" },
  format: { color: "#f0ece3", label: "Formats" },
  prop: { color: "#56c2d6", label: "Props & triggers" },
};

const TERMS = [
  { name: "WHISPERING", size: 70, group: "format", note: "55% overall — 80% of Western sample vs. 30% East Asian" },
  { name: "NO TALKING", size: 62, group: "format", note: "45% overall — 70% of East Asian sample vs. 20% Western" },
  { name: "EAR CLEANING", size: 54, group: "format", note: "55% of East Asian sample vs. 5% Western" },
  { name: "TAPPING", size: 42, group: "prop", vertical: true, note: "Rhythmic prop tapping — 25% East Asian, 20% Western" },
  { name: "ROLEPLAY", size: 40, group: "format", note: "Idealised caregiving scenarios: clinic, salon, skincare" },
  { name: "PERSONAL ATTENTION", size: 38, group: "format", note: "35% of Western sample vs. 10% East Asian" },
  { name: "WARM LIGHTING", size: 36, group: "craft", note: "85% (17/20) use warm bedside colour temperature" },
  { name: "MAKEUP BRUSHES", size: 34, group: "prop", vertical: true, note: "Soft facial & mic brushing for tactile immersion" },
  { name: "3DIO MIC", size: 32, group: "prop", note: "Silicone binaural ear mic mimicking human skull acoustics" },
  { name: "SCRATCHING", size: 30, group: "prop", vertical: true, note: "High-frequency texture trigger in early attention-anchor phase" },
  { name: "EYE CONTACT", size: 28, group: "craft", vertical: true, note: "65% (13/20) frame full-face direct gaze for companionship" },
  { name: "FAST & AGGRESSIVE", size: 24, group: "format", note: "25% of Western sample vs. 10% East Asian" },
  { name: "LOCKED CAMERA", size: 23, group: "craft", note: "70% (14/20) lock camera & lighting steady throughout" },
  { name: "BRIGHTER COVER", size: 22, group: "craft", note: "75% (15/20) use a brighter thumbnail than in-video frames" },
  { name: "COVER TEXT HOOK", size: 21, group: "craft", note: "45% (9/20) use bold cover text to pull clicks, then clear screen" },
  { name: "FACELESS MACRO", size: 20, group: "craft", note: "30% (6/20) show hands & props only, zero face" },
  { name: "SILICONE EARS", size: 20, group: "prop", note: "Close-up ear-canal visual & spatial trigger" },
  { name: "LAYERED SOUNDS", size: 19, group: "prop", note: "Hand movements layered with mouth sounds for peak retention" },
  { name: "SNOW BAG", size: 18, group: "prop", note: "Soft continuous rustling favoured near sleep onset" },
  { name: "SPONGES", size: 17, group: "prop", note: "Soft low-frequency tactile cushioning" },
  { name: "BAMBOO EARPICK", size: 17, group: "prop", note: "Signature East Asian ear-care prop" },
  { name: "LENS TOUCH", size: 16, group: "prop", vertical: true, note: "Direct POV hand-to-camera touch for personal attention" },
  { name: "LONG NAILS", size: 16, group: "prop", vertical: true, note: "Crisp nail tapping & scratching on hard surfaces" },
  { name: "HAIR BRUSHING", size: 15, group: "prop", note: "Soft facial & mic brushing for tactile immersion" },
  { name: "MOUTH SOUNDS", size: 15, group: "format", note: "Hand movements layered with mouth sounds for peak retention" },
  { name: "BEDROOM GLOW", size: 14, group: "craft", note: "85% (17/20) use warm bedside colour temperature" },
  { name: "SOFT SPOKEN", size: 14, group: "format", note: "Quiet speech beside whispering — heavier in the Western sample" },
  { name: "BRUSHING", size: 14, group: "prop", vertical: true, note: "Soft facial & mic brushing for tactile immersion" },
  { name: "WHISPER GOODBYE", size: 13, group: "format", note: "Closing whisper after the main trigger run" },
  { name: "PICKING PAD", size: 13, group: "prop", note: "Early ear-care prop in the attention-anchor phase" },
  { name: "SKINCARE", size: 13, group: "format", vertical: true, note: "Idealised caregiving scenarios: clinic, salon, skincare" },
  { name: "FLUFFY MIC", size: 13, group: "craft", vertical: true, note: "65% (13/20) place mics or ear models on-screen to visualize sound" },
  { name: "FOAM", size: 12, group: "prop", vertical: true, note: "Soft low-frequency tactile cushioning" },
  { name: "CRINKLE", size: 12, group: "prop", vertical: true, note: "Soft continuous rustling favoured near sleep onset" },
  { name: "BINAURAL", size: 12, group: "prop", vertical: true, note: "Dummy-head mic placed for a close spatial ear cue" },
  { name: "COUNTING", size: 12, group: "format", vertical: true, note: "Slow counted cues used as a sleep-onset closer" },
  { name: "VERBAL WHITE NOISE", size: 12, group: "format", note: "Soft spoken texture favoured near sleep onset" },
];

function el(name, attrs) {
  const node = document.createElementNS(SVG_NS, name);
  Object.entries(attrs || {}).forEach(([k, v]) => node.setAttribute(k, String(v)));
  return node;
}

function depth(size) {
  if (size >= 28) return 1;
  if (size >= 18) return 0.92;
  if (size >= 14) return 0.84;
  return 0.72;
}

function hit(a, ax, ay, b, pad) {
  return Math.abs(ax - b.x) < (a.bw + b.bw) / 2 + pad
    && Math.abs(ay - b.y) < (a.bh + b.bh) / 2 + pad;
}

function pack(words) {
  const placed = [];
  words.forEach((word) => {
    if (!placed.length) {
      word.x = 0;
      word.y = 0;
      placed.push(word);
      return;
    }
    let theta = 0;
    let seated = false;
    for (let i = 0; i < 9000; i += 1) {
      theta += 0.16;
      const radius = 0.42 * theta;
      const x = Math.cos(theta) * radius;
      const y = Math.sin(theta) * radius * 0.78;
      if (placed.every((other) => !hit(word, x, y, other, 4))) {
        word.x = x;
        word.y = y;
        seated = true;
        break;
      }
    }
    if (!seated) {
      word.x = 0;
      word.y = placed.length * (word.bh + 8);
    }
    placed.push(word);
  });
}

export function render(container) {
  if (!container) return;
  if (container._kitUnlisten) container._kitUnlisten();
  container.replaceChildren();
  container.classList.add("kit-root");

  const svg = el("svg", {
    class: "kit-svg",
    role: "img",
    "aria-label": "ASMR toolkit terms packed as a word cloud",
  });
  container.appendChild(svg);

  const words = TERMS.map((term) => {
    const text = el("text", {
      class: "kit-label",
      "text-anchor": "middle",
      "dominant-baseline": "middle",
    });
    text.textContent = term.name;
    text.style.fontSize = term.size + "px";
    text.style.fontWeight = term.size >= 28 ? "700" : "500";
    svg.appendChild(text);
    const box = text.getBBox();
    const bw = term.vertical ? box.height : box.width;
    const bh = term.vertical ? box.width : box.height;
    return Object.assign({}, term, { text, bw, bh, x: 0, y: 0 });
  });

  pack(words);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  words.forEach((word) => {
    minX = Math.min(minX, word.x - word.bw / 2);
    minY = Math.min(minY, word.y - word.bh / 2);
    maxX = Math.max(maxX, word.x + word.bw / 2);
    maxY = Math.max(maxY, word.y + word.bh / 2);
  });
  const margin = 10;
  svg.setAttribute("viewBox", [
    (minX - margin).toFixed(1),
    (minY - margin).toFixed(1),
    (maxX - minX + margin * 2).toFixed(1),
    (maxY - minY + margin * 2).toFixed(1),
  ].join(" "));

  const pops = [];
  words.forEach((word) => {
    const color = GROUPS[word.group].color;
    const wrap = el("g", { transform: "translate(" + word.x.toFixed(1) + " " + word.y.toFixed(1) + ")" });
    const pop = el("g", { class: "kit-word" });
    pop.style.setProperty("--o", String(depth(word.size)));
    pop.dataset.note = word.note;
    pop.dataset.name = word.name;
    pop.dataset.group = GROUPS[word.group].label;
    word.text.setAttribute("fill", color);
    word.text.style.color = color;
    if (word.vertical) word.text.setAttribute("transform", "rotate(-90)");
    pop.appendChild(word.text);
    wrap.appendChild(pop);
    svg.appendChild(wrap);
    word.pop = pop;
    pops.push(pop);
  });

  const tip = document.createElement("div");
  tip.className = "kit-tip";
  tip.hidden = true;
  container.appendChild(tip);

  function hideTip() {
    tip.hidden = true;
    svg.classList.remove("is-hot");
    svg.querySelectorAll(".kit-word.is-on").forEach((node) => node.classList.remove("is-on"));
  }

  function spotlight(node, event) {
    svg.classList.add("is-hot");
    svg.querySelectorAll(".kit-word.is-on").forEach((el) => el.classList.remove("is-on"));
    node.classList.add("is-on");
    tip.replaceChildren();
    [node.dataset.name, node.dataset.group, node.dataset.note].forEach((line, i) => {
      const p = document.createElement("p");
      p.textContent = line;
      if (i === 0) p.className = "kit-tip-name";
      tip.appendChild(p);
    });
    tip.hidden = false;
    tip.style.left = "0px";
    tip.style.top = "0px";
    const rect = tip.getBoundingClientRect();
    const ax = event && event.clientX ? event.clientX : node.getBoundingClientRect().left;
    const ay = event && event.clientY ? event.clientY : node.getBoundingClientRect().bottom;
    let left = ax + 14;
    let top = ay + 16;
    if (left + rect.width > window.innerWidth - 8) left = ax - rect.width - 14;
    if (top + rect.height > window.innerHeight - 8) top = ay - rect.height - 12;
    tip.style.left = Math.max(8, left) + "px";
    tip.style.top = Math.max(8, top) + "px";
  }

  pops.forEach((node) => {
    node.addEventListener("pointerenter", (event) => spotlight(node, event));
    node.addEventListener("pointermove", (event) => spotlight(node, event));
    node.addEventListener("pointerleave", hideTip);
  });

  arm(container, svg, words, hideTip);
  container._kitUnlisten = () => {
    if (container._kitScroll) container._kitScroll();
  };
}

function arm(container, svg, words, hideTip) {
  const pops = words.map((word) => word.pop);
  const api = motionApi();
  if (!api) {
    svg.style.opacity = "1";
    pops.forEach((node) => {
      node.style.opacity = "";
      node.style.transform = "";
    });
    return;
  }
  const { gsap } = api;
  const ordered = words.slice().sort((a, b) => (a.x * a.x + a.y * a.y) - (b.x * b.x + b.y * b.y));
  const sequence = ordered.map((word) => word.pop);
  gsap.set(svg, { opacity: 0 });
  gsap.set(sequence, { opacity: 0, scale: 0.85, transformOrigin: "50% 50%" });

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
    gsap.to(svg, { opacity: 1, duration: 0.25, overwrite: "auto" });
    gsap.fromTo(sequence, { opacity: 0, scale: 0.85 }, {
      opacity: 1,
      scale: 1,
      duration: 0.32,
      stagger: 0.014,
      ease: "power2.out",
      transformOrigin: "50% 50%",
      overwrite: "auto",
      clearProps: "opacity,scale,transform",
    });
  }

  function playOut() {
    if (!shown) return;
    shown = false;
    hideTip();
    gsap.killTweensOf(sequence);
    gsap.to(svg, { opacity: 0, duration: 0.32, overwrite: "auto" });
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
  container._kitScroll = () => {
    window.removeEventListener("scroll", request);
    window.removeEventListener("resize", request);
  };
  request();
}
