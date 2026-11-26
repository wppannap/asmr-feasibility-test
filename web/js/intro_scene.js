/* Scene 0 — 3 AM insomnia. Scroll reveals a sleepless figure and late-night thoughts. */
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
  ];
  const desktop = [
    [38, 44], [18, 22], [62, 16], [8, 50], [58, 56],
    [20, 68], [66, 72], [6, 30], [52, 32], [30, 84],
  ];
  const mobile = [
    [4, 6], [50, 14], [4, 24], [50, 33], [4, 43],
    [50, 52], [4, 62], [50, 71], [4, 80], [46, 88],
  ];

  const nodes = lines.map((text) => {
    const p = document.createElement("p");
    p.className = "thought";
    p.textContent = text;
    host.appendChild(p);
    return p;
  });

  function place() {
    const spec = window.innerWidth < 720 ? mobile : desktop;
    const narrow = window.innerWidth < 720;
    nodes.forEach((el, i) => {
      el.style.left = spec[i][0] + "%";
      el.style.top = spec[i][1] + "%";
      el.style.maxWidth = narrow ? "46%" : "15rem";
    });
  }
  place();

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function tick() {
    const rect = root.getBoundingClientRect();
    const total = root.offsetHeight - window.innerHeight;
    const passed = Math.min(Math.max(-rect.top, 0), total);
    const t = total > 0 ? passed / total : 0;
    fig.style.opacity = String(Math.min(1, t / 0.12));
    if (cue) cue.style.opacity = String(t < 0.08 ? 1 : Math.max(0, 1 - (t - 0.08) / 0.08));
    nodes.forEach((el, i) => {
      const start = 0.08 + i * 0.07;
      const local = Math.min(1, Math.max(0, (t - start) / 0.06));
      const fadeOut = t > 0.9 ? Math.max(0, 1 - (t - 0.9) / 0.1) : 1;
      el.style.opacity = String(local * fadeOut);
      if (!reduce) {
        const drift = Math.sin(t * 6 + i) * 4;
        el.style.transform = `translateY(${drift}px)`;
      }
    });
  }

  window.addEventListener("scroll", tick, { passive: true });
  window.addEventListener("resize", () => { place(); tick(); }, { passive: true });
  tick();
})();
