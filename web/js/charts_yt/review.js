/** Review-label helpers for unpublished YouTube chart modules. */

export function reviewLabel(meta) {
  const rev = meta?.review || {};
  if (!rev.gate_ok || rev.reviewed_by === "UNSET" || !rev.label) {
    return { ok: false, text: "Review UNSET — chart must stay disabled." };
  }
  return { ok: true, text: rev.label };
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
