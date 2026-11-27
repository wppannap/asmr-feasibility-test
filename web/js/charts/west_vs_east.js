/* West vs East Asia — mirror equalizer plus area-scaled orbs. No buttons. */
import { motionApi } from "./entrance.js?v=20261127h";

const ROWS = [
  { name: "Talking", west: 80, east: 30 },
  { name: "Ear Care", west: 5, east: 55 },
  { name: "Personal Care", west: 35, east: 10 },
  { name: "Fast & Aggressive", west: 25, east: 10 },
  { name: "Prop Tapping", west: 20, east: 25 },
];

export function render(container) {
  if (!container) return;
  if (container._weUnlisten) container._weUnlisten();
  container.replaceChildren();
  container.classList.add("we-root");

  const grid = document.createElement("div");
  grid.className = "we-grid";

  const eqCol = document.createElement("div");
  eqCol.className = "we-col";
  const eq = document.createElement("div");
  eq.className = "we-eq";
  const spine = document.createElement("div");
  spine.className = "we-spine";
  spine.setAttribute("aria-hidden", "true");
  const head = document.createElement("div");
  head.className = "we-eq-head";
  ["Western", "", "East Asian"].forEach((label, i) => {
    const span = document.createElement("span");
    span.textContent = label;
    if (i === 0) span.className = "is-west";
    if (i === 2) span.className = "is-east";
    head.appendChild(span);
  });
  eq.append(spine, head);

  const bars = [];
  ROWS.forEach((row) => {
    const line = document.createElement("div");
    line.className = "we-eq-row";
    const westPct = document.createElement("span");
    westPct.className = "we-pct is-west";
    westPct.textContent = row.west + "%";
    const westTrack = document.createElement("span");
    westTrack.className = "we-track is-west";
    const westBar = document.createElement("span");
    westBar.className = "we-bar";
    westBar.style.width = row.west + "%";
    westTrack.appendChild(westBar);
    const name = document.createElement("span");
    name.className = "we-metric";
    name.textContent = row.name;
    const eastTrack = document.createElement("span");
    eastTrack.className = "we-track is-east";
    const eastBar = document.createElement("span");
    eastBar.className = "we-bar";
    eastBar.style.width = row.east + "%";
    eastTrack.appendChild(eastBar);
    const eastPct = document.createElement("span");
    eastPct.className = "we-pct is-east";
    eastPct.textContent = row.east + "%";
    line.append(westPct, westTrack, name, eastTrack, eastPct);
    eq.appendChild(line);
    bars.push(westBar, eastBar);

    line.addEventListener("pointerenter", (event) => spotlight(line, row, event));
    line.addEventListener("pointermove", (event) => spotlight(line, row, event));
    line.addEventListener("pointerleave", hideTip);
  });
  eqCol.appendChild(eq);

  const orbCol = document.createElement("div");
  orbCol.className = "we-col we-orbs";
  const orbRows = [
    {
      title: "Median Length",
      max: 51.9,
      maxPx: 92,
      items: [
        { who: "East Asia", value: 51.9, label: "51.9 min", tone: "east" },
        { who: "Western", value: 34.5, label: "34.5 min", tone: "west" },
      ],
    },
    {
      title: "Median Views · 4.3× gap",
      max: 1.86,
      maxPx: 118,
      items: [
        { who: "East Asia", value: 1.86, label: "1.86M", tone: "east" },
        { who: "Western", value: 0.43, label: "430K", tone: "west" },
      ],
    },
  ];
  const orbs = [];
  orbRows.forEach((row) => {
    const block = document.createElement("div");
    block.className = "we-block";
    const title = document.createElement("p");
    title.className = "we-row-title";
    title.textContent = row.title;
    const pair = document.createElement("div");
    pair.className = "we-pair";
    row.items.forEach((item) => {
      const unit = document.createElement("div");
      unit.className = "we-unit";
      const orb = document.createElement("span");
      const d = row.maxPx * Math.sqrt(item.value / row.max);
      orb.className = "we-orb we-orb-" + item.tone;
      orb.style.width = d.toFixed(1) + "px";
      orb.style.height = d.toFixed(1) + "px";
      const val = document.createElement("span");
      val.className = "we-val";
      val.textContent = item.label;
      const who = document.createElement("span");
      who.className = "we-who";
      who.textContent = item.who;
      unit.append(orb, val, who);
      pair.appendChild(unit);
      orbs.push(orb);
    });
    block.append(title, pair);
    orbCol.appendChild(block);
  });

  const tip = document.createElement("div");
  tip.className = "we-tip";
  tip.hidden = true;

  function hideTip() {
    tip.hidden = true;
    eq.classList.remove("is-hot");
    eq.querySelectorAll(".we-eq-row.is-on").forEach((el) => el.classList.remove("is-on"));
  }

  function spotlight(line, row, event) {
    eq.classList.add("is-hot");
    eq.querySelectorAll(".we-eq-row").forEach((el) => el.classList.toggle("is-on", el === line));
    tip.replaceChildren();
    [row.name, "Western " + row.west + "%", "East Asian " + row.east + "%"].forEach((text, i) => {
      const p = document.createElement("p");
      p.textContent = text;
      if (i === 0) p.className = "we-tip-name";
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
  }

  grid.append(eqCol, orbCol);
  container.append(grid, tip);
  arm(container, { bars, orbs, hideTip });
}

function arm(container, parts) {
  const api = motionApi();
  if (!api) {
    parts.bars.forEach((bar) => { bar.style.transform = "none"; });
    parts.orbs.forEach((orb) => {
      orb.style.opacity = "1";
      orb.style.transform = "none";
    });
    return;
  }
  const { gsap } = api;
  parts.bars.forEach((bar) => {
    const origin = bar.parentElement.classList.contains("is-west") ? "right center" : "left center";
    gsap.set(bar, { scaleX: 0, transformOrigin: origin });
  });
  gsap.set(parts.orbs, { scale: 0, transformOrigin: "50% 50%" });
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
    parts.bars.forEach((bar, i) => {
      const origin = bar.parentElement.classList.contains("is-west") ? "right center" : "left center";
      gsap.fromTo(bar, { scaleX: 0 }, {
        scaleX: 1,
        duration: 0.55,
        delay: 0.08 + Math.floor(i / 2) * 0.08,
        ease: "power2.out",
        transformOrigin: origin,
        overwrite: "auto",
      });
    });
    gsap.fromTo(parts.orbs, { scale: 0, opacity: 0.4 }, {
      scale: 1,
      opacity: 1,
      duration: 0.55,
      stagger: 0.08,
      delay: 0.5,
      ease: "power2.out",
      transformOrigin: "50% 50%",
      overwrite: "auto",
      clearProps: "scale,transform",
    });
  }

  function playOut() {
    if (!shown) return;
    shown = false;
    parts.hideTip();
    gsap.killTweensOf(parts.bars);
    gsap.to(container, { opacity: 0, duration: 0.32, overwrite: "auto" });
  }

  function tick() {
    ticking = false;
    if (inView()) {
      gsap.set(container, { opacity: 1 });
      playIn();
    } else playOut();
  }
  function request() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(tick);
  }
  window.addEventListener("scroll", request, { passive: true });
  window.addEventListener("resize", request, { passive: true });
  container._weUnlisten = () => {
    window.removeEventListener("scroll", request);
    window.removeEventListener("resize", request);
  };
  gsap.set(container, { opacity: 0 });
  request();
}
