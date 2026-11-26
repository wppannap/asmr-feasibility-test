/* Hero play control. Missing mp3 stays quiet — no thrown errors. */
(function () {
  const audio = document.getElementById("asmr-audio");
  const btn = document.getElementById("asmr-play");
  const label = btn && btn.querySelector(".asmr-play-label");
  const hint = document.getElementById("asmr-audio-hint");
  if (!audio || !btn) return;

  const TARGET = 0.8;
  let fadeRaf = 0;
  let wantPlay = false;
  let missing = false;

  function setLabel(text) {
    if (label) label.textContent = text;
  }

  function showHint() {
    missing = true;
    wantPlay = false;
    cancelAnimationFrame(fadeRaf);
    try { audio.pause(); } catch (e) { /* file not playable */ }
    audio.volume = 0;
    btn.classList.remove("is-playing");
    btn.setAttribute("aria-pressed", "false");
    setLabel("Play ASMR");
    if (hint) hint.hidden = false;
  }

  function fadeTo(target, done) {
    cancelAnimationFrame(fadeRaf);
    const start = audio.volume;
    const t0 = performance.now();
    function step(now) {
      const k = Math.min(1, (now - t0) / 520);
      audio.volume = start + (target - start) * k;
      if (k < 1) fadeRaf = requestAnimationFrame(step);
      else if (done) done();
    }
    fadeRaf = requestAnimationFrame(step);
  }

  audio.volume = 0;
  audio.addEventListener("error", showHint);

  btn.addEventListener("click", function () {
    if (missing) return;
    if (!wantPlay) {
      wantPlay = true;
      audio.volume = 0;
      btn.classList.add("is-playing");
      btn.setAttribute("aria-pressed", "true");
      setLabel("Pause ASMR");
      const pending = audio.play();
      if (pending && typeof pending.catch === "function") pending.catch(showHint);
      fadeTo(TARGET);
      return;
    }
    wantPlay = false;
    btn.classList.remove("is-playing");
    btn.setAttribute("aria-pressed", "false");
    setLabel("Play ASMR");
    fadeTo(0, function () {
      if (!wantPlay) audio.pause();
    });
  });

  document.addEventListener("visibilitychange", function () {
    if (!document.hidden || !wantPlay) return;
    wantPlay = false;
    cancelAnimationFrame(fadeRaf);
    audio.pause();
    audio.volume = 0;
    btn.classList.remove("is-playing");
    btn.setAttribute("aria-pressed", "false");
    setLabel("Play ASMR");
  });
})();
