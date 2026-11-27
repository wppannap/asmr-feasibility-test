/* The ASMR Toolkit — acoustic-wave word cloud. No buttons. */
import { motionApi } from "./entrance.js?v=20261127f";

const GROUPS = {
  craft: { color: "#f4a259", label: "Visual craft", face: "serif" },
  format: { color: "#f0ece3", label: "Formats", face: "serif" },
  prop: { color: "#56c2d6", label: "Props & triggers", face: "sans" },
};

/* d = desktop percent, m = phone percent. Largest terms sit on the central axis. */
const TERMS = [
  { name: "Warm Lighting", weight: 85, group: "craft", pct: "85%", d: [18, 46], m: [22, 50], note: "85% (17/20) use warm bedside colour temperature" },
  { name: "Brighter Cover", weight: 75, group: "craft", pct: "75%", d: [16, 60], m: [24, 72], note: "75% (15/20) use a brighter thumbnail than in-video frames" },
  { name: "Direct Eye Contact", weight: 65, group: "craft", pct: "65%", d: [16, 33], m: [24, 36], note: "65% (13/20) frame full-face direct gaze for companionship" },
  { name: "Visible Mic", weight: 65, group: "craft", pct: "65%", d: [50, 32], m: [76, 42], note: "65% (13/20) place mics or ear models on-screen to visualize sound" },
  { name: "Locked Camera", weight: 70, group: "craft", pct: "70%", d: [84, 60], m: [26, 86], note: "70% (14/20) lock camera & lighting steady throughout" },
  { name: "Cover Text Hook", weight: 45, group: "craft", pct: "45%", d: [18, 20], m: [30, 14], note: "45% (9/20) use bold cover text to pull clicks, then clear screen" },
  { name: "Faceless Macro", weight: 30, group: "craft", pct: "30%", d: [50, 9], m: [62, 8], note: "30% (6/20) show hands & props only, zero face" },
  { name: "Whispering", weight: 95, group: "format", d: [50, 46], m: [28, 58], note: "55% overall — 80% of Western sample vs. 30% East Asian" },
  { name: "No Talking", weight: 90, group: "format", d: [82, 46], m: [74, 58], note: "45% overall — 70% of East Asian sample vs. 20% Western" },
  { name: "Ear Cleaning", weight: 82, group: "format", d: [50, 61], m: [74, 72], note: "55% of East Asian sample vs. 5% Western" },
  { name: "Personal Attention", weight: 78, group: "format", d: [50, 20], m: [72, 86], note: "35% of Western sample vs. 10% East Asian" },
  { name: "Roleplay", weight: 70, group: "format", d: [50, 74], m: [76, 50], note: "Idealised caregiving scenarios: clinic, salon, skincare" },
  { name: "Fast & Aggressive", weight: 60, group: "format", d: [84, 33], m: [76, 28], note: "25% of Western sample vs. 10% East Asian" },
  { name: "Tapping", weight: 80, group: "prop", d: [18, 74], m: [76, 64], note: "Rhythmic prop tapping — 25% East Asian, 20% Western" },
  { name: "3Dio / Dummy Head", weight: 72, group: "prop", d: [82, 74], m: [28, 78], note: "Silicone binaural ear mic mimicking human skull acoustics" },
  { name: "Makeup Brushes", weight: 70, group: "prop", d: [84, 20], m: [28, 64], note: "Soft facial & mic brushing for tactile immersion" },
  { name: "Silicone Ears", weight: 66, group: "prop", d: [18, 86], m: [24, 42], note: "Close-up ear-canal visual & spatial trigger" },
  { name: "Scratching", weight: 64, group: "prop", d: [50, 86], m: [72, 20], note: "High-frequency texture trigger in early attention-anchor phase" },
  { name: "Bamboo Earpicks", weight: 62, group: "prop", d: [84, 86], m: [30, 92], note: "Signature East Asian ear-care prop" },
  { name: "Lens Touch", weight: 60, group: "prop", d: [82, 95], m: [70, 14], note: "Direct POV hand-to-camera touch for personal attention" },
  { name: "Layered Sounds", weight: 58, group: "prop", d: [84, 8], m: [28, 22], note: "Hand movements layered with mouth sounds for peak retention" },
  { name: "Long Nails", weight: 54, group: "prop", d: [32, 8], m: [38, 6], note: "Crisp nail tapping & scratching on hard surfaces" },
  { name: "Sponges & Foam", weight: 52, group: "prop", d: [18, 95], m: [68, 94], note: "Soft low-frequency tactile cushioning" },
  { name: "Snow Bag / Crinkle", weight: 50, group: "prop", d: [50, 95], m: [72, 36], note: "Soft continuous rustling favoured near sleep onset" },
];

function dist(term, wide) {
  const [x, y] = wide ? term.d : term.m;
  const dx = x - 50;
  const dy = (y - 48) * 1.2;
  return dx * dx + dy * dy;
}

export function render(container) {
  if (!container) return;
  if (container._kitUnlisten) container._kitUnlisten();
  container.replaceChildren();
  container.classList.add("kit-root");

  const cloud = document.createElement("div");
  cloud.className = "kit-cloud";

  const wideQuery = window.matchMedia("(min-width: 721px)");

  TERMS.forEach((term) => {
    const group = GROUPS[term.group];
    const node = document.createElement("span");
    node.className = "kit-term is-" + group.face;
    node.tabIndex = 0;
    node.dataset.group = term.group;
    node.style.setProperty("--s", String(term.weight / 100));
    node.style.color = group.color;
    node.setAttribute("aria-label", term.name + ". " + group.label + ". " + term.note);
    const inner = document.createElement("span");
    inner.className = "kit-term-inner";
    inner.appendChild(document.createTextNode(term.name));
    if (term.pct) {
      const sup = document.createElement("sup");
      sup.className = "kit-pct";
      sup.textContent = term.pct;
      inner.appendChild(sup);
    }
    node.appendChild(inner);
    term.el = node;
    term.inner = inner;
    cloud.appendChild(node);
  });

  const tip = document.createElement("div");
  tip.className = "kit-tip";
  tip.hidden = true;

  function place() {
    const wide = wideQuery.matches;
    TERMS.forEach((term) => {
      const [x, y] = wide ? term.d : term.m;
      term.el.style.left = x + "%";
      term.el.style.top = y + "%";
    });
  }

  function hideTip() {
    tip.hidden = true;
    cloud.classList.remove("is-hot");
    cloud.querySelectorAll(".kit-term.is-on").forEach((el) => el.classList.remove("is-on"));
  }

  function spotlight(node, event) {
    const term = TERMS.find((item) => item.el === node);
    if (!term) return;
    cloud.classList.add("is-hot");
    cloud.querySelectorAll(".kit-term.is-on").forEach((el) => el.classList.remove("is-on"));
    node.classList.add("is-on");
    const group = GROUPS[term.group];
    tip.replaceChildren();
    [term.name, group.label, term.note].forEach((line, i) => {
      const p = document.createElement("p");
      p.textContent = line;
      if (i === 0) p.className = "kit-tip-name";
      tip.appendChild(p);
    });
    tip.hidden = false;
    const point = event && event.clientX ? event : null;
    const anchor = point || node.getBoundingClientRect();
    const ax = point ? point.clientX : anchor.left + anchor.width / 2;
    const ay = point ? point.clientY : anchor.bottom;
    tip.style.left = "0px";
    tip.style.top = "0px";
    const rect = tip.getBoundingClientRect();
    let left = ax + 14;
    let top = ay + 16;
    if (left + rect.width > window.innerWidth - 8) left = ax - rect.width - 14;
    if (top + rect.height > window.innerHeight - 8) top = ay - rect.height - 12;
    tip.style.left = Math.max(8, left) + "px";
    tip.style.top = Math.max(8, top) + "px";
  }

  cloud.querySelectorAll(".kit-term").forEach((node) => {
    node.addEventListener("pointerenter", (event) => spotlight(node, event));
    node.addEventListener("pointermove", (event) => spotlight(node, event));
    node.addEventListener("pointerleave", (event) => {
      const next = event.relatedTarget;
      if (next && next.closest && next.closest(".kit-term")) return;
      hideTip();
    });
    node.addEventListener("focus", (event) => spotlight(node, event));
    node.addEventListener("blur", () => {
      requestAnimationFrame(() => {
        if (!cloud.contains(document.activeElement)) hideTip();
      });
    });
  });

  place();
  container.append(cloud, tip);

  function onResize() {
    place();
  }
  wideQuery.addEventListener("change", onResize);
  window.addEventListener("resize", onResize, { passive: true });

  arm(container, cloud, hideTip);
  container._kitUnlisten = () => {
    wideQuery.removeEventListener("change", onResize);
    window.removeEventListener("resize", onResize);
    if (container._kitScroll) container._kitScroll();
  };
}

function arm(container, cloud, hideTip) {
  const inners = [...cloud.querySelectorAll(".kit-term-inner")];
  const api = motionApi();
  if (!api) {
    cloud.style.opacity = "1";
    inners.forEach((el) => {
      el.style.opacity = "1";
      el.style.transform = "none";
    });
    return;
  }
  const { gsap } = api;
  const wide = window.matchMedia("(min-width: 721px)").matches;
  const ordered = TERMS.slice().sort((a, b) => dist(a, wide) - dist(b, wide));
  const sequence = ordered.map((term) => term.inner);

  gsap.set(cloud, { opacity: 0 });
  gsap.set(sequence, { opacity: 0, scale: 0.88, transformOrigin: "50% 50%" });

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
    gsap.to(cloud, { opacity: 1, duration: 0.25, overwrite: "auto" });
    gsap.fromTo(
      sequence,
      { opacity: 0, scale: 0.88 },
      {
        opacity: 1,
        scale: 1,
        duration: 0.4,
        stagger: 0.022,
        ease: "power2.out",
        transformOrigin: "50% 50%",
        overwrite: "auto",
        clearProps: "opacity,scale,transform",
      }
    );
  }

  function playOut() {
    if (!shown) return;
    shown = false;
    hideTip();
    gsap.killTweensOf(sequence);
    gsap.to(cloud, { opacity: 0, duration: 0.32, overwrite: "auto" });
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
