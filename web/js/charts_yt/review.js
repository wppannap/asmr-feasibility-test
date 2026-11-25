/** Review-label helpers for unpublished YouTube chart modules.

Allowed reviewed_by: human, AI-assisted, script, UNSET.
Front-end labels: "(human review, n-item check)", "(AI-assisted review)",
nothing for script, block for UNSET.
*/

export function reviewLabel(meta) {
  const rev = meta?.review || {};
  const by = rev.reviewed_by;
  if (by === "script") {
    return { ok: true, text: "" };
  }
  if (!rev.gate_ok || by === "UNSET" || rev.label == null) {
    return { ok: false, text: "Review UNSET — chart must stay disabled." };
  }
  return { ok: true, text: rev.label || "" };
}

export function renderReviewBanner(wrap, meta) {
  const info = reviewLabel(meta);
  const el = wrap.append("p").attr("class", "chart-review-label");
  el.text(info.text);
  if (!info.ok) {
    el.classed("is-blocked", true);
    wrap.append("p").attr("class", "chart-note").text(
      "Not in ENABLED_SECTIONS. Resolve UNSET rows in config/review_log.csv before enabling."
    );
  }
  return info.ok;
}
