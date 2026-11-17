# Aster Grid

An independently written, MIT-licensed JavaScript data grid with an original UI, a headless engine, TypeScript definitions, and no runtime dependencies.

**Version 0.1.0 is an early implementation, not complete AG Grid Enterprise parity or an API-compatible replacement.** See [the feature matrix](docs/FEATURES.md) for implemented behavior, limitations, and missing features. It is not affiliated with AG Grid. No AG Grid package, source code, styles, or assets are included. The package name is a local project name; npm availability and trademark clearance have not been established.

## Try it locally

Requires Node.js 20 or newer for the development commands; the library runs in modern browsers.

```sh
npm install
npm run demo
```

Open http://127.0.0.1:4173. The demo includes 10,000 synthetic records, grouping, a pivot table, hierarchical paths, and a simulated server with paged data. All demo data and saved layouts stay local. The demo server binds only to localhost and is not a production server.

## Install into another application

From this directory, create the distributable archive:

```sh
npm pack
```

Install the resulting archive in your application:

```sh
npm install /path/to/aster-grid-0.1.0.tgz
```

With a bundler:

```js
import { Grid } from "aster-grid";
import "aster-grid/style.css";

const grid = new Grid(document.querySelector("#grid"), {
  height: 520,
  getRowId: (row) => row.id,
  columns: [
    {
      field: "name",
      title: "Name",
      width: 220,
      pinned: "left",
      editable: true,
    },
    { field: "region", title: "Region" },
    {
      field: "revenue",
      title: "Revenue",
      type: "number",
      editable: true,
      aggregate: "sum",
      validate: (value) => (value < 0 ? "Must be nonnegative" : null),
    },
  ],
  rows: [
    { id: "a", name: "Acorn", region: "East", revenue: 1800 },
    { id: "b", name: "Birch", region: "West", revenue: 2400 },
  ],
});

grid.model.on("edit", (changes) => console.log(changes));
// On component unmount:
// grid.destroy();
```

Without a bundler, serve `src/`, link `src/style.css`, and import `Grid` from `src/index.js` in a `<script type="module">`. The demo is a complete example. Opening the HTML through `file://` is not supported because it uses ES modules.

## Data operations

```js
grid.model.setState({
  sort: [
    { id: "region", dir: "asc" },
    { id: "revenue", dir: "desc" },
  ],
  filters: { revenue: { op: "gte", value: 2000 } },
  groupBy: ["region"],
  expanded: ["*"],
});

grid.model.setState({
  advancedFilter: {
    op: "or",
    rules: [
      { column: "region", op: "eq", value: "East" },
      { column: "revenue", op: "between", value: 1000, to: 3000 },
    ],
  },
});

grid.model.setState({
  pivot: {
    rows: ["region"],
    columns: ["name"],
    values: [{ id: "revenue", aggregate: "sum" }],
  },
});

grid.model.editMany([
  { id: "a", columnId: "revenue", value: 1900 },
  { id: "b", columnId: "revenue", value: 2500 },
]);
grid.model.undo();
grid.model.redo();
grid.model.transaction({
  add: [{ id: "c", name: "Cedar", region: "East", revenue: 3200 }],
  update: [{ id: "a", revenue: 2100 }],
  remove: ["b"],
});
```

Stable, unique row IDs are required for reliable selection and transactions. Supply `getRowId` or an `id` field. Index-derived IDs are only suitable for a static array. Do not make row identity fields editable. Column IDs default to `field` and must be unique. Fields are literal property names, not dotted paths; use a `value` callback for nested or derived values. Derived columns are read-only. Row objects are shallow copied; nested values remain shared.

All edits in a batch are parsed and validated before mutation. History holds 100 batches by default. Data replacement and transactions clear history to prevent stale undo. Validators see the pre-batch row, so cross-field batch validation belongs in application code. The `edit` event signals edits, undo, and redo; read the current model for current values. Selection and history apply only to loaded records in remote mode.

Dates use normalized ISO strings; string ordering then matches calendar ordering. Supply `parse`/`validate` for calendar validity or other input formats. Numeric aggregates ignore null and nonnumeric values. Counts include nulls. Empty sums return zero; empty average/min/max return null. Sorting uses native stable sort, locale string comparison, numeric comparison for numbers, and nulls last.

## Hierarchies, custom cells, and details

```js
const tree = new Grid(container, {
  columns,
  rows,
  treePath: (row) => [row.department, row.team, row.name],
  state: { expanded: ["*"] },
});
```

Paths must be unique and nonempty. Missing ancestors are synthesized. Tree records currently render as hierarchical nodes, not editable/selectable normal rows. Filtering happens before hierarchy construction.

Column callbacks include `value`, `format`, `render`, `parse`, `validate`, and `compare`. `render` may return a DOM node or text. `sparkline: true` renders a numeric array as an SVG line. `detail(row)` returns a DOM node or text shown through a right-click cell action. To show a nested grid, return a container containing a grid you create, and manage that nested grid's lifecycle in your application. Custom context actions are configured with `contextMenu: [{label, action(row, grid)}]`.

## Remote data

```js
import { Grid, RemoteDataSource } from "aster-grid";
const source = new RemoteDataSource(
  async ({ start, end, signal, ...query }) => {
    const response = await fetch("/api/records", {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ start, end, ...query }),
    });
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    return response.json(); // { rows: [...], total: 12345 }
  },
  { blockSize: 100, maxBlocks: 10 },
);
const remoteGrid = new Grid(container, { columns, dataSource: source });
// Invalidate after a server write, then refresh:
source.invalidate();
await remoteGrid.loadRemote();
```

The server must apply sort/filter/search before slicing `[start, end)`. The UI provides paginated flat blocks; it does not implement an infinite scrolling or hierarchical server row model. `RemoteDataSource.getBlock(index, query)` accepts additional query fields for application-controlled grouping/pivot requests, but the application owns their server implementation and rendering. The cache deduplicates in-flight requests, evicts least recently used blocks, propagates abort signals, and rejects stale results after invalidation. UI request tokens prevent a late query from replacing a newer result.

Remote editing modifies only the loaded client block: use application code to persist changes, invalidate cache, and reload. Exports and value-set filter choices include only loaded data. The source may be shared; `Grid.destroy()` does not destroy it. Call `source.destroy()` when its owner is done with it. Retry a failed load using `loadRemote()`.

## Selection, clipboard, state, and export

Click cells and Shift-click a second cell to select a rectangular range. Use arrow keys, Home/End, Page Up/Down, or Tab to navigate; Enter/F2 edits; Escape cancels editing. Ctrl/Cmd+C/V uses clipboard events; Ctrl/Cmd+D fills the first selected row downward. Ctrl/Cmd+A selects all cells in the current view. Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z undo/redo. Clipboard action buttons require browser clipboard permission and a secure context. Paste skips read-only cells and rejects the entire editable batch on a validation failure.

```js
grid.model.select(["a", "c"]);
const saved = grid.getState();
localStorage.setItem("my-grid", JSON.stringify(saved));
grid.restoreState(JSON.parse(localStorage.getItem("my-grid")));
const csv = grid.exportCSV({ selected: true });
const excelBytes = grid.exportXLSX();
```

State includes sorting, filters, grouping, expansion, pivot settings, page settings, column order/size/visibility/pinning, and selected row IDs. It does not serialize callbacks, data, charts, cell ranges, undo history, or remote cache.

Exports use visible columns and filtered, sorted records across local pages. Grouping is exported as flat records; pivot mode exports pivot results. Strings that resemble formulas are neutralized in CSV exports. Clipboard copy intentionally preserves literal text. XLSX output is an actual uncompressed ZIP/OOXML workbook, with numeric/boolean cells, inline strings, and a frozen first row. For multiple sheets use `xlsx([{name, rows, freezeHeader}, ...])`. It has no Excel styles, formula calculation, images, or import implementation.

## Theming and integration

Import the CSS once. Use `theme: 'dark'` or set `grid.root.dataset.theme = 'dark'`. Override the original `--ag-bg`, `--ag-ink`, `--ag-muted`, `--ag-line`, `--ag-soft`, `--ag-accent`, and `--ag-selection` CSS variables on `.aster-grid`. Here `ag` abbreviates Aster Grid; these are not AG Grid theme parameters.

Use the same constructor in a React effect, Vue mounted hook, or Angular after-view-init hook, and call `destroy()` on unmount. Dedicated framework wrappers are not included. `GridModel` is usable independently in Node.js or a custom UI.

## Validation

```sh
npm test
npm run check:types
npx playwright install chromium
# In another terminal: npm run demo
npm run test:browser
```

For an installed Edge browser, set `ASTER_BROWSER=msedge` before the browser test. Browser checks save screenshots and an XLSX fixture in `test-results/`; override with `ASTER_TEST_OUTPUT` if needed. See [validation notes](docs/VALIDATION.md) for actual run evidence and remaining limits.

## Contributing and provenance

Contributions must be independently authored and MIT-compatible. Please add a regression test for functional changes and keep the feature matrix accurate. Public feature documentation was consulted; no proprietary implementation was cloned or used. Read [architecture](docs/ARCHITECTURE.md) and [feature status](docs/FEATURES.md) before extending the engine. The code is licensed under [MIT](LICENSE). No npm registry release has been published; install from a local package archive as described above.
