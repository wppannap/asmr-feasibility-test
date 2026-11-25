/* Comment themes — share of sampled comments containing theme keywords */
import {
  appendSvg,
  attachTableToggle,
  clear,
  fmt,
  setCaveat,
  sizeOf,
} from "./util.js?v=20261125b";
import {
  formatCheck,
  langCheckLabel,
  checkForLang,
  themeMeta,
  themeVisible,
  verifiedThemeIds,
} from "./config.js?v=20261125b";

const THEME_COLORS = {
  insomnia: "#0b6e4f",
  anxiety_stress: "#1b6ca8",
  gratitude: "#8a6d3b",
  sleep_aid_effectiveness: "#2a9d8f",
};

let ctx = null;

export function render(container, data) {
  clear(container);
  const { comments, caveatEl } = data;
  const verified = comments.meta?.verified_themes;
  const rows = (comments.by_language || []).filter((d) =>
    themeVisible(d.theme, verified)
  );
  const langs = [...new Set(rows.map((d) => d.language_group))];
  const themes = verifiedThemeIds(verified).filter((t) =>
    rows.some((r) => r.theme === t)
  );

  const wrap = d3.select(container);
  wrap
    .append("p")
    .attr("class", "chart-subtitle")
    .text("Share of sampled comments containing theme keywords");

  const note = wrap.append("p").attr("class", "sample-note");
  const totals = {};
  (comments.by_language || []).forEach((d) => {
    totals[d.language_group] = d.total_comments;
  });
  // Also pull totals from full meta n if a lang only appears for hidden themes
  const nSum = comments.meta?.n_comments || d3.sum(Object.values(totals));
  note.html(
    `Sample size n = <strong>${fmt(nSum, 0)}</strong> comments` +
      ` · matching counts shown on each bar` +
      ` · <em>themes can overlap; only verified themes shown</em>`
  );

  const tableApi = attachTableToggle(wrap.node(), () => ({
    columns: [
      "language_group",
      "theme",
      "matching_comments",
      "total_comments",
      "share_of_sampled_comments_containing_theme_keywords",
      "lang_check",
    ],
    rows: rows.map((d) => [
      d.language_group,
      d.theme,
      d.matching_comments,
      d.total_comments,
      d.share,
      langCheckLabel(d.language_group, d.theme, verified),
    ]),
  }));

  const grid = d3
    .select(tableApi.visual)
    .append("div")
    .attr("class", "comments-grid")
    .node();
  const { width } = sizeOf(tableApi.visual);
  const cellW = Math.min(width - 8, 560);
  const rowH = 20;
  const margin = { top: 8, right: 88, bottom: 8, left: 140 };
  const innerW = cellW - margin.left - margin.right;
  const x = d3
    .scaleLinear()
    .domain([0, d3.max(rows, (d) => d.share) * 1.15 || 0.2])
    .range([0, innerW]);

  langs.forEach((lang) => {
    const subset = themes.map((theme) => {
      const hit = rows.find((r) => r.language_group === lang && r.theme === theme);
      return {
        theme,
        share: hit ? hit.share : 0,
        matching: hit ? hit.matching_comments : 0,
        total: hit ? hit.total_comments : totals[lang],
        langCheck: langCheckLabel(lang, theme, verified),
      };
    });
    const cellH = margin.top + margin.bottom + themes.length * rowH;
    const cell = d3.select(grid).append("div").attr("class", "comments-cell");
    cell
      .append("div")
      .attr("class", "comments-lang")
      .text(`${lang} · sampled comments n=${fmt(totals[lang], 0)}`);

    const svg = appendSvg(
      cell.node(),
      cellW,
      cellH,
      `Share of sampled comments containing theme keywords for language group ${lang}`
    );
    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
    const y = d3
      .scaleBand()
      .domain(themes)
      .range([0, themes.length * rowH])
      .padding(0.25);

    g.selectAll("rect")
      .data(subset)
      .join("rect")
      .attr("y", (d) => y(d.theme))
      .attr("height", y.bandwidth())
      .attr("width", (d) => x(d.share))
      .attr("fill", (d) => THEME_COLORS[d.theme] || "#5a6b76")
      .append("title")
      .text(
        (d) =>
          `${d.theme}: share = ${(d.share * 100).toFixed(2)}% · matching = ${
            d.matching
          } of ${d.total} · ${d.langCheck}`
      );

    g.selectAll(".theme-lab")
      .data(subset)
      .join("text")
      .attr("class", "theme-lab")
      .attr("x", -6)
      .attr("y", (d) => y(d.theme) + y.bandwidth() / 2)
      .attr("dy", "0.35em")
      .attr("text-anchor", "end")
      .attr("font-size", 10)
      .attr("fill", "#5a6b76")
      .text((d) => d.theme.replace(/_/g, " "));

    g.selectAll(".share-lab")
      .data(subset)
      .join("text")
      .attr("class", "share-lab")
      .attr("x", (d) => x(d.share) + 4)
      .attr("y", (d) => y(d.theme) + y.bandwidth() / 2)
      .attr("dy", "0.35em")
      .attr("font-size", 10)
      .attr("fill", "#1a242c")
      .text((d) => `${(d.share * 100).toFixed(1)}% · ${d.matching}`);
  });

  // Per-theme check + caveat under the chart (n/n strings only; no %)
  const notes = wrap.append("div").attr("class", "theme-verify-notes");
  themes.forEach((theme) => {
    const m = themeMeta(theme, verified);
    if (!m) return;
    const block = notes.append("p").attr("class", "theme-verify-note");
    block.append("strong").text(theme.replace(/_/g, " "));
    const rb = m.reviewed_by;
    if (m.check && typeof m.check === "object") {
      block.append("span").text(" — check by language:");
      block.append("br");
      Object.entries(m.check).forEach(([lang, text]) => {
        block
          .append("span")
          .attr("class", "theme-langs")
          .text(`${lang}: ${formatCheck(text, rb)}`);
        block.append("br");
      });
    } else {
      block.append("span").text(` — check: ${formatCheck(m.check, rb)}`);
    }
    if (m.caveat) {
      block.append("span").attr("class", "theme-caveat").text(`caveat: ${m.caveat}`);
    }
    const langsChecked = (m.verified_langs || []).join(", ") || "none";
    block.append("br");
    const pooledOnly =
      (m.verified_langs || []).length === 1 &&
      (m.verified_langs || [])[0] === "pooled";
    block
      .append("span")
      .attr("class", "theme-langs")
      .text(
        pooledOnly
          ? "verified_langs: pooled · every language bar: not individually checked"
          : `verified_langs: ${langsChecked} · other languages: not individually checked`
      );
  });

  setCaveat(caveatEl, [
    "Share of sampled comments containing theme keywords; themes can overlap.",
    ...(comments.meta?.caveats || []).slice(0, 1),
  ]);

  ctx = { grid, tableApi };
  return ctx;
}

export function update(step) {
  if (!ctx) return;
  const n = typeof step === "number" ? step : parseInt(String(step).split("-").pop(), 10) || 1;
  d3.select(ctx.grid)
    .selectAll(".comments-cell")
    .style("opacity", (d, i) => (n < 2 ? 1 : i < 3 ? 1 : 0.55));
  ctx.tableApi?.refreshTable();
}
