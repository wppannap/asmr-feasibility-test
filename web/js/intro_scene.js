/* Scene 0 — 3 AM insomnia. Scroll fills the night with late-night thoughts. */
(function () {
  const root = document.getElementById("intro-night");
  const pin = root && root.querySelector(".intro-pin");
  const fig = root && root.querySelector(".intro-sleeper");
  const host = document.getElementById("intro-danmaku");
  const cue = document.getElementById("intro-cue");
  if (!root || !pin || !host || !fig) return;

  const lines = [
    "I'm so tired but I can't sleep.",
    "I have an exam tomorrow, help 😭",
    "Please let me fall asleep tonight.",
    "I can't sleep without ASMR anymore.",
    "This is the only thing that helps me sleep.",
    "My mind won't stop thinking.",
    "I'm so stressed. I just want to sleep.",
    "It's 3 AM and I'm still awake...",
    "One more video and I promise I'll sleep.",
    "Anyone else can't sleep without listening to this?",
    "Why is my brain loudest at 2 AM?",
    "Just 10 more minutes of rain and whispering...",
    "Counting sheep hasn't worked since 2016.",
    "Exhausted all day, wide awake the second I hit the pillow.",
    "Tapping sounds are literally my lullaby now.",
    "6 hours of sleep if I fall asleep right now...",
    "5 hours and 42 minutes if I fall asleep right now...",
    "Earphones in, world off.",
    "Please brain, shut down.",
    "Why am I replaying a conversation from 2019?",
    "ASMR is doing more for my sleep than melatonin.",
    "Everyone's asleep and I'm still staring at the ceiling.",
    "Soft spoken voices are the only thing that calms me down.",
    "Promised myself I'd sleep at 11. It's 3:14 AM.",
    "Just let me drift off already...",
    "Thank you for keeping me company at 3 AM.",
  ];

  const nodes = lines.map((text, i) => {
    const p = document.createElement("p");
    p.className = "thought" + (text.length < 34 ? " is-lg" : text.length > 52 ? " is-sm" : "");
    p.textContent = text;
    p.dataset.i = String(i);
    host.appendChild(p);
    return p;
  });

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function place() {
    const w = pin.clientWidth;
    const h = pin.clientHeight;
    if (!w || !h) return;
    const narrow = w < 720;
    nodes.forEach((el, i) => {
      const colN = narrow ? 2 : 4;
      const rowN = Math.ceil(nodes.length / colN);
      const col = i % colN;
      const row = Math.floor(i / colN);
      const jitterX = ((i * 17) % 7) - 3;
      const jitterY = ((i * 13) % 5) - 2;
      el.style.maxWidth = (100 / colN - (narrow ? 3 : 2.2)).toFixed(2) + "%";
      el.style.left = (col * (100 / colN) + (narrow ? 1.5 : 1) + jitterX * 0.35) + "%";
      el.style.top = (row * (100 / rowN) + 1.2 + jitterY * 0.4) + "%";
    });
    const origin = pin.getBoundingClientRect();
    const boxes = nodes.map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height };
    });
    for (let pass = 0; pass < 18; pass++) {
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i];
          const b = boxes[j];
          const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
          const iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
          if (ix > 2 && iy > 2) {
            const push = (iy + 6) / 2;
            if (a.y <= b.y) {
              a.y -= push;
              b.y += push;
            } else {
              b.y -= push;
              a.y += push;
            }
          }
        }
        const a = boxes[i];
        a.x = Math.max(4, Math.min(w - a.w - 4, a.x));
        a.y = Math.max(4, Math.min(h - a.h - 8, a.y));
      }
    }
    nodes.forEach((el, i) => {
      el.style.left = boxes[i].x + "px";
      el.style.top = boxes[i].y + "px";
    });
  }

  function tick() {
    const rect = root.getBoundingClientRect();
    const total = root.offsetHeight - window.innerHeight;
    const passed = Math.min(Math.max(-rect.top, 0), total);
    const t = total > 0 ? passed / total : 0;
    const fadeOut = t > 0.86 ? Math.max(0, 1 - (t - 0.86) / 0.12) : 1;
    fig.style.opacity = String(Math.min(1, t / 0.1) * fadeOut);
    if (cue) cue.style.opacity = String(t < 0.06 ? 0.85 : Math.max(0, 0.85 - (t - 0.06) / 0.06));
    nodes.forEach((el, i) => {
      const start = 0.04 + (i / (nodes.length - 1)) * 0.68;
      const local = Math.min(1, Math.max(0, (t - start) / 0.045));
      const weight = el.classList.contains("is-sm") ? 0.78 : el.classList.contains("is-lg") ? 1 : 0.9;
      el.style.opacity = String(local * fadeOut * weight);
      if (!reduce) {
        const drift = Math.sin(t * 5 + i) * 3;
        el.style.transform = "translateY(" + drift + "px)";
      }
    });
  }

  window.addEventListener("scroll", tick, { passive: true });
  window.addEventListener("resize", function () { place(); tick(); }, { passive: true });
  place();
  tick();
})();
