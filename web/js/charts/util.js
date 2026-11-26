/* shared chart helpers — ESM */

export function sizeOf(el) {
  const r = el.getBoundingClientRect();
  return {
    width: Math.max(280, Math.floor(r.width) || 640),
    height: Math.max(220, Math.floor(r.height) || 360),
  };
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function countryName(iso3) {
  return (window.ISO_A3_TO_NAME && window.ISO_A3_TO_NAME[iso3]) || iso3;
}

export function fmt(v, digits = 1) {
  if (v == null || Number.isNaN(+v)) return "—";
  return d3.format(`,.${digits}f`)(+v);
}

export function appendSvg(container, width, height, ariaLabel = "Chart") {
  return d3
    .select(container)
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("width", "100%")
    .attr("height", "100%")
    .attr("role", "img")
    .attr("aria-label", ariaLabel)
    .attr("focusable", "false");
}

export function setCaveat(el, lines) {
  if (!el) return;
  el.textContent = (lines || []).filter(Boolean).join(" ");
}

export function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Add a "View as table" toggle. `getRows` returns { columns: string[], rows: (string|number)[][] }.
 * Returns { visual, setData } where visual is the chart mount node.
 */
export function attachTableToggle(container, getRows, opts = {}) {
  const root = d3.select(container);
  if (opts.buttons === false) {
    const visual = root.append("div").attr("class", "chart-visual").node();
    return { visual, refreshTable() {} };
  }
  const toolbar = root.append("div").attr("class", "chart-toolbar");
  const btn = toolbar
    .append("button")
    .attr("type", "button")
    .attr("class", "table-toggle")
    .attr("aria-pressed", "false")
    .text("View as table");

  const visual = root.append("div").attr("class", "chart-visual").node();
  const tableWrap = root
    .append("div")
    .attr("class", "chart-table-wrap")
    .attr("hidden", true)
    .node();

  let showingTable = false;

  function renderTable() {
    clear(tableWrap);
    const { columns, rows } = getRows() || { columns: [], rows: [] };
    const table = d3.select(tableWrap).append("table").attr("class", "data-table");
    table
      .append("thead")
      .append("tr")
      .selectAll("th")
      .data(columns)
      .join("th")
      .text((d) => d);
    table
      .append("tbody")
      .selectAll("tr")
      .data(rows)
      .join("tr")
      .selectAll("td")
      .data((d) => d)
      .join("td")
      .text((d) => (d == null ? "—" : d));
  }

  btn.on("click", () => {
    showingTable = !showingTable;
    btn.attr("aria-pressed", showingTable ? "true" : "false");
    btn.text(showingTable ? "View as chart" : "View as table");
    if (showingTable) {
      renderTable();
      tableWrap.removeAttribute("hidden");
      visual.setAttribute("hidden", "true");
    } else {
      tableWrap.setAttribute("hidden", "true");
      visual.removeAttribute("hidden");
    }
  });

  return {
    visual,
    refreshTable: () => {
      if (showingTable) renderTable();
    },
  };
}
