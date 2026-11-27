/* Inside the Headphones — three 5-second capsules and a listener pull-quote. */
import { motionApi } from "./entrance.js?v=20261127d";

const SVG_NS = "http://www.w3.org/2000/svg";

const CAPSULES = [
  {
    title: "Material Trigger",
    kind: "Picking & Scratching",
    src: "audio/sample_material.mp3",
    tone: "amber",
    bars: [0.32, 0.48, 0.74, 0.42, 0.9, 0.58, 0.36, 0.8, 1, 0.46, 0.7, 0.38, 0.86, 0.54, 0.3, 0.66, 0.44, 0.28],
  },
  {
    title: "Repeated Whisper",
    kind: "Verbal White Noise · Counting",
    src: "audio/sample_whisper.mp3",
    tone: "bridge",
    bars: [0.28, 0.4, 0.55, 0.7, 0.5, 0.62, 0.84, 0.48, 0.66, 0.92, 0.58, 0.44, 0.76, 0.5, 0.36, 0.6, 0.42, 0.3],
  },
  {
    title: "Layered Sound",
    kind: "Hand Movements + Mouth Sounds",
    src: "audio/sample_layered.mp3",
    tone: "teal",
    bars: [0.34, 0.58, 0.42, 0.78, 0.5, 0.96, 0.64, 0.4, 0.72, 0.46, 0.88, 0.56, 0.36, 0.7, 0.48, 0.82, 0.4, 0.3],
  },
];

function addBars(svg, heights) {
  const n = heights.length;
  const gap = 168 / n;
  const w = Math.min(4.5, gap - 2.2);
  heights.forEach((h, i) => {
    const bh = Math.max(3, h * 32);
    const rect = document.createElementNS(SVG_NS, "rect");
    rect.setAttribute("class", "phones-bar");
    rect.setAttribute("x", (i * gap + (gap - w) / 2).toFixed(2));
    rect.setAttribute("y", ((36 - bh) / 2).toFixed(2));
    rect.setAttribute("width", w.toFixed(2));
    rect.setAttribute("height", bh.toFixed(2));
    rect.setAttribute("rx", (w / 2).toFixed(2));
    rect.style.setProperty("--b", String(i));
    rect.setAttribute("fill", "currentColor");
    svg.appendChild(rect);
  });
}

function pauseHero() {
  const btn = document.getElementById("asmr-play");
  if (btn && btn.classList.contains("is-playing")) btn.click();
}

export function render(container) {
  if (!container) return;
  if (container._phonesStop) container._phonesStop();
  if (container._phonesUnlisten) container._phonesUnlisten();
  container.replaceChildren();
  container.classList.add("phones-root");

  const caps = CAPSULES.map((spec, i) => {
    const root = document.createElement("article");
    root.className = "phones-cap";
    root.dataset.tone = spec.tone;
    root.dataset.i = String(i);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "phones-play";
    btn.setAttribute("aria-pressed", "false");
    btn.setAttribute("aria-label", "Play " + spec.title + ", 5 seconds");
    const ripple = document.createElement("span");
    ripple.className = "phones-ripple";
    ripple.setAttribute("aria-hidden", "true");
    const glyph = document.createElement("span");
    glyph.className = "phones-glyph";
    glyph.setAttribute("aria-hidden", "true");
    btn.append(ripple, glyph);

    const name = document.createElement("p");
    name.className = "phones-name";
    name.textContent = "0" + (i + 1) + " · " + spec.title;

    const kind = document.createElement("p");
    kind.className = "phones-kind";
    kind.textContent = spec.kind;

    const time = document.createElement("p");
    time.className = "phones-time";
    time.textContent = "0:05";

    const wave = document.createElementNS(SVG_NS, "svg");
    wave.setAttribute("class", "phones-wave");
    wave.setAttribute("viewBox", "0 0 168 36");
    wave.setAttribute("aria-hidden", "true");
    addBars(wave, spec.bars);

    const hint = document.createElement("p");
    hint.className = "phones-hint";
    hint.hidden = true;
    hint.textContent = "Add web/audio/" + spec.src.replace("audio/", "");

    const audio = document.createElement("audio");
    audio.className = "phones-audio";
    audio.preload = "none";
    audio.setAttribute("playsinline", "");

    root.append(btn, name, kind, time, wave, hint, audio);
    return { spec, root, btn, hint, audio, live: false, state: "new", timer: 0 };
  });

  const grid = document.createElement("div");
  grid.className = "phones-grid";
  caps.forEach((cap) => grid.appendChild(cap.root));

  const story = document.createElement("aside");
  story.className = "phones-story";
  const rule = document.createElement("span");
  rule.className = "phones-rule";
  rule.setAttribute("aria-hidden", "true");
  const body = document.createElement("div");
  body.className = "phones-story-body";

  const who1 = document.createElement("p");
  who1.className = "phones-who";
  who1.textContent = "Listener 01 · Emily, University Student";
  const quote1 = document.createElement("blockquote");
  quote1.className = "phones-quote";
  quote1.textContent =
    "Since I started listening to ASMR, I’ve never waited for a video to finish. I often fall asleep without realizing it.";
  const context = document.createElement("p");
  context.className = "phones-context";
  context.textContent =
    "Emily prefers No Talking object triggers to quiet academic stress before bed — though unexpected speech can jolt her awake.";
  const who2 = document.createElement("p");
  who2.className = "phones-who";
  who2.textContent = "Listener 02 · TODO: my text";
  const quote2 = document.createElement("blockquote");
  quote2.className = "phones-quote";
  quote2.textContent = "TODO: my text";
  body.append(who1, quote1, context, who2, quote2);
  story.append(rule, body);

  container.append(grid, story);

  function stop(cap) {
    cap.live = false;
    if (cap.timer) {
      clearTimeout(cap.timer);
      cap.timer = 0;
    }
    try { cap.audio.pause(); } catch (e) { /* not playing */ }
    cap.root.classList.remove("is-live");
    cap.btn.setAttribute("aria-pressed", "false");
    cap.btn.setAttribute("aria-label", "Play " + cap.spec.title + ", 5 seconds");
  }

  function stopAll() {
    caps.forEach(stop);
  }

  function preview(cap) {
    stop(cap);
    cap.live = true;
    cap.hint.hidden = false;
    cap.root.classList.add("is-live");
    cap.btn.setAttribute("aria-pressed", "true");
    cap.timer = setTimeout(() => stop(cap), 2000);
  }

  async function ensure(cap) {
    if (cap.state === "ok") return true;
    if (cap.state === "miss") return false;
    try {
      const res = await fetch(cap.spec.src, { method: "HEAD" });
      if (!res.ok) throw new Error("missing");
      cap.audio.src = cap.spec.src;
      cap.state = "ok";
      return true;
    } catch (e) {
      cap.state = "miss";
      cap.hint.hidden = false;
      return false;
    }
  }

  function play(cap) {
    cap.live = true;
    cap.root.classList.add("is-live");
    cap.btn.setAttribute("aria-pressed", "true");
    cap.btn.setAttribute("aria-label", "Pause " + cap.spec.title);
    const pending = cap.audio.play();
    const fail = () => {
      cap.state = "miss";
      cap.hint.hidden = false;
      try { cap.audio.pause(); } catch (e) { /* ignore */ }
      preview(cap);
    };
    if (pending && typeof pending.catch === "function") pending.catch(fail);
    cap.timer = setTimeout(() => stop(cap), 5200);
  }

  let ticket = 0;
  caps.forEach((cap) => {
    cap.audio.addEventListener("ended", () => stop(cap));
    cap.audio.addEventListener("error", () => {
      if (cap.state === "ok") return;
      cap.state = "miss";
      cap.hint.hidden = false;
    });
    cap.btn.addEventListener("click", async () => {
      if (cap.live) {
        stop(cap);
        return;
      }
      const mine = ++ticket;
      stopAll();
      pauseHero();
      const ok = await ensure(cap);
      if (mine !== ticket) return;
      if (!ok) preview(cap);
      else play(cap);
    });
  });

  container._phonesStop = stopAll;
  armEntrance(container, caps.map((c) => c.root), rule, body);
}

function armEntrance(container, cards, rule, body) {
  const api = motionApi();
  if (!api) {
    cards.forEach((el) => {
      el.style.opacity = "1";
      el.style.transform = "none";
    });
    rule.style.transform = "none";
    body.style.opacity = "1";
    body.style.transform = "none";
    return;
  }
  const { gsap } = api;
  gsap.set(cards, { opacity: 0, y: 22 });
  gsap.set(rule, { scaleY: 0, transformOrigin: "top center" });
  gsap.set(body, { opacity: 0, y: 18 });

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
    gsap.to(cards, {
      opacity: 1,
      y: 0,
      duration: 0.55,
      stagger: 0.16,
      ease: "power2.out",
      overwrite: "auto",
    });
    cards.forEach((card, i) => {
      const bars = card.querySelectorAll(".phones-bar");
      gsap.fromTo(
        bars,
        { scaleY: 0.3 },
        {
          scaleY: 1,
          duration: 0.4,
          stagger: 0.028,
          delay: 0.16 * i + 0.12,
          ease: "power1.out",
          transformOrigin: "50% 50%",
          overwrite: "auto",
          clearProps: "transform",
        }
      );
    });
    gsap.to(rule, {
      scaleY: 1,
      duration: 0.7,
      delay: 0.42,
      ease: "power2.out",
      overwrite: "auto",
    });
    gsap.to(body, {
      opacity: 1,
      y: 0,
      duration: 0.65,
      delay: 0.48,
      ease: "power2.out",
      overwrite: "auto",
    });
  }

  function playOut() {
    if (!shown) return;
    shown = false;
    gsap.to(cards, { opacity: 0, y: 14, duration: 0.32, stagger: 0.04, overwrite: "auto" });
    gsap.to(body, { opacity: 0, y: 12, duration: 0.32, overwrite: "auto" });
    gsap.to(rule, { scaleY: 0, duration: 0.28, overwrite: "auto", transformOrigin: "top center" });
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
  container._phonesUnlisten = () => {
    window.removeEventListener("scroll", request);
    window.removeEventListener("resize", request);
  };
  request();
}
