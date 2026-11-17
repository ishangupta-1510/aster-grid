import { Grid, RemoteDataSource, GridModel } from "../src/index.js";
const markets = [
  "North America",
  "Europe",
  "Asia Pacific",
  "Latin America",
  "Middle East",
  "Africa",
  "Nordics",
  "Oceania",
];
const products = [
  "Atlas Cloud",
  "Beacon Analytics",
  "Cedar Platform",
  "Drift Studio",
  "Ember Connect",
  "Fern Engine",
];
const owners = [
  "Amelia Chen",
  "Noah Williams",
  "Priya Sharma",
  "Leo Martins",
  "Sofia Andersson",
  "Ethan Park",
];
const rows = Array.from({ length: 10000 }, (_, i) => ({
  id: `AC-${String(i + 1).padStart(5, "0")}`,
  account: `${["Acme", "Horizon", "Juniper", "Meridian", "Northstar", "Pinnacle", "Summit", "Vantage"][i % 8]} ${["Labs", "Systems", "Partners", "Works", "Group"][Math.floor(i / 8) % 5]} ${Math.floor(i / 40) + 1}`,
  market: markets[i % 8],
  product: products[i % 6],
  owner: owners[(i * 7) % 6],
  status: ["Active", "Review", "Paused"][
    i % 11 === 0 ? 2 : i % 5 === 0 ? 1 : 0
  ],
  revenue: Math.round(18000 + ((i * 7919) % 96000)),
  growth: (((i * 13) % 380) - 50) / 10,
  trend: Array.from({ length: 10 }, (_, n) => 18 + ((i * 7 + n * 13) % 37)),
}));
const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const columns = [
  {
    field: "account",
    title: "Account",
    width: 220,
    pinned: "left",
    editable: true,
  },
  {
    field: "market",
    title: "Market",
    width: 155,
    editable: true,
    options: markets,
  },
  { field: "product", title: "Product", width: 150 },
  { field: "owner", title: "Account owner", width: 155, editable: true },
  {
    field: "status",
    title: "Status",
    width: 110,
    editable: true,
    options: ["Active", "Review", "Paused"],
    render: (value) => {
      const el = document.createElement("span");
      el.className = "pill " + value.toLowerCase();
      el.textContent = value;
      return el;
    },
  },
  {
    field: "revenue",
    title: "Revenue",
    type: "number",
    width: 140,
    aggregate: "sum",
    editable: true,
    validate: (v) => (v < 0 ? "Revenue cannot be negative" : null),
    format: (v) => (v == null ? "" : currency.format(v)),
  },
  {
    field: "growth",
    title: "Growth",
    type: "number",
    width: 110,
    aggregate: "avg",
    editable: true,
    format: (v) => (v == null ? "" : `${v > 0 ? "+" : ""}${v.toFixed(1)}%`),
  },
  { field: "trend", title: "Last 10 months", width: 145, sparkline: true },
];
let grid,
  theme = "light";
const remote = new RemoteDataSource(
  async ({ start, end, sort, filters, quick, advancedFilter, signal }) => {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, 180);
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(new DOMException("Aborted", "AbortError"));
        },
        { once: true },
      );
    });
    const model = new GridModel({
        rows,
        columns,
        state: { sort, filters, quick, advancedFilter },
      }),
      filtered = model.sortedRows(model.filteredRows());
    return {
      rows: filtered.slice(start, end).map((r) => r.data),
      total: filtered.length,
    };
  },
  { blockSize: 100, maxBlocks: 5 },
);
function mount(mode = "portfolio") {
  grid?.destroy();
  const config = {
    rows,
    columns,
    height: 550,
    theme,
    detail: (row) => {
      const box = document.createElement("div");
      const h = document.createElement("h4");
      h.textContent = row.account;
      const p = document.createElement("p");
      p.textContent = `${row.owner} manages ${row.product} in ${row.market}. Annual revenue: ${currency.format(row.revenue)}.`;
      box.append(h, p);
      return box;
    },
  };
  if (mode === "grouped") config.state = { groupBy: ["market"], expanded: [] };
  if (mode === "pivot")
    config.state = {
      pivot: {
        rows: ["market"],
        columns: ["status"],
        values: [{ id: "revenue", aggregate: "sum" }],
      },
    };
  if (mode === "tree") {
    config.rows = rows.slice(0, 60);
    config.treePath = (row) => [row.market, row.owner, row.account];
    config.state = { expanded: [] };
  }
  if (mode === "remote") {
    config.rows = [];
    config.dataSource = remote;
  }
  grid = new Grid(document.querySelector("#grid"), config);
  window.grid = grid;
}
document.querySelectorAll("[data-mode]").forEach((button) =>
  button.addEventListener("click", () => {
    document
      .querySelectorAll("[data-mode]")
      .forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
    mount(button.dataset.mode);
  }),
);
document.querySelector("#save").addEventListener("click", () => {
  localStorage.setItem("aster-demo-state", JSON.stringify(grid.getState()));
  document.querySelector("#save").textContent = "Saved ✓";
});
document.querySelector("#restore").addEventListener("click", () => {
  const state = localStorage.getItem("aster-demo-state");
  if (state) grid.restoreState(JSON.parse(state));
});
document.querySelector("#theme").addEventListener("click", () => {
  theme = theme === "light" ? "dark" : "light";
  grid.root.dataset.theme = theme;
});
mount();
