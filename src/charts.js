const ns = "http://www.w3.org/2000/svg";
function svgElement(tag, attributes = {}) {
  const el = document.createElementNS(ns, tag);
  for (const [k, v] of Object.entries(attributes))
    el.setAttribute(k, String(v));
  return el;
}
export function sparkline(
  values,
  { width = 110, height = 26, color = "currentColor" } = {},
) {
  const nums = values.map(Number).filter(Number.isFinite),
    svg = svgElement("svg", {
      viewBox: `0 0 ${width} ${height}`,
      width,
      height,
      role: "img",
      "aria-label": `Trend: ${nums.join(", ")}`,
    });
  if (!nums.length) return svg;
  const min = Math.min(...nums),
    max = Math.max(...nums),
    range = max - min || 1;
  svg.append(
    svgElement("polyline", {
      points: nums
        .map(
          (v, i) =>
            `${2 + (i / Math.max(1, nums.length - 1)) * (width - 4)},${height - 2 - ((v - min) / range) * (height - 4)}`,
        )
        .join(" "),
      fill: "none",
      stroke: color,
      "stroke-width": 2,
      "stroke-linejoin": "round",
    }),
  );
  return svg;
}
export function chart(
  rows,
  { category, value, type = "bar", onSelect, width = 680, height = 260 } = {},
) {
  const data = rows.slice(0, 50),
    svg = svgElement("svg", {
      viewBox: `0 0 ${width} ${height}`,
      role: "img",
      "aria-label": `${type} chart of ${value} by ${category}`,
      class: "aster-chart",
    });
  const values = data.map((r) => Number(r[value]) || 0),
    max = Math.max(0, ...values),
    min = Math.min(0, ...values),
    span = max - min || 1;
  const y = (v) => 18 + ((max - v) / span) * (height - 60),
    step = (width - 60) / Math.max(1, data.length);
  svg.append(
    svgElement("line", {
      x1: 35,
      y1: y(0),
      x2: width - 15,
      y2: y(0),
      stroke: "var(--ag-line, #ccd5d0)",
    }),
  );
  if (type === "line")
    svg.append(
      svgElement("polyline", {
        points: values
          .map((v, i) => `${35 + step * (i + 0.5)},${y(v)}`)
          .join(" "),
        fill: "none",
        stroke: "var(--ag-accent, #147d65)",
        "stroke-width": 3,
      }),
    );
  data.forEach((row, i) => {
    const v = values[i],
      x = 35 + step * i;
    const shape =
      type === "line"
        ? svgElement("circle", { cx: x + step / 2, cy: y(v), r: 5 })
        : svgElement("rect", {
            x: x + step * 0.15,
            y: Math.min(y(0), y(v)),
            width: step * 0.7,
            height: Math.max(1, Math.abs(y(v) - y(0))),
            rx: 3,
          });
    shape.setAttribute("fill", "var(--ag-accent, #147d65)");
    shape.setAttribute("tabindex", "0");
    shape.setAttribute("role", "button");
    shape.setAttribute("aria-label", `${row[category]}: ${v}`);
    const title = svgElement("title");
    title.textContent = `${row[category]}: ${v}`;
    shape.append(title);
    shape.addEventListener("click", () => onSelect?.(row));
    shape.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onSelect?.(row);
      }
    });
    svg.append(shape);
    if (data.length <= 16) {
      const label = svgElement("text", {
        x: x + step / 2,
        y: height - 16,
        "text-anchor": "middle",
        fill: "currentColor",
        "font-size": 10,
      });
      label.textContent = String(row[category] ?? "").slice(0, 14);
      svg.append(label);
    }
  });
  return svg;
}
