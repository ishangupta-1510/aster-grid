import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GridModel,
  RemoteDataSource,
  matches,
  aggregates,
  delimited,
  parseDelimited,
  xlsx,
} from "../src/index.js";
const columns = [
  { field: "name", editable: true },
  { field: "region" },
  { field: "quarter" },
  {
    field: "amount",
    type: "number",
    editable: true,
    aggregate: "sum",
    validate: (v) => (v < 0 ? "Negative" : null),
  },
];
const rows = [
  { id: "a", name: "Alpha", region: "West", quarter: "Q1", amount: 10 },
  { id: "b", name: "Beta", region: "East", quarter: "Q1", amount: 20 },
  { id: "c", name: "Gamma", region: "West", quarter: "Q2", amount: 30 },
  { id: "d", name: "Delta", region: "East", quarter: "Q2", amount: null },
];
const model = () => new GridModel({ rows, columns });
test("stable multi-sort, descending nulls last and original data untouched", () => {
  const m = model();
  m.setState({
    sort: [
      { id: "region", dir: "asc" },
      { id: "amount", dir: "desc" },
    ],
  });
  assert.deepEqual(
    m.view().rows.map((r) => r.id),
    ["b", "d", "c", "a"],
  );
  m.edit("a", "amount", "11");
  assert.equal(rows[0].amount, 10);
});
test("set, compound, quick and advanced filters compose", () => {
  const m = model();
  m.setState({
    quick: "a",
    filters: { region: { op: "in", values: ["West"] } },
    advancedFilter: {
      op: "or",
      rules: [
        { column: "amount", op: "gt", value: 20 },
        { column: "name", op: "eq", value: "Missing" },
      ],
    },
  });
  assert.deepEqual(
    m.view().rows.map((r) => r.id),
    ["c"],
  );
  assert(
    matches(12, {
      op: "and",
      rules: [
        { op: "gt", value: 10 },
        { op: "lt", value: 20 },
      ],
    }),
  );
});
test("group IDs distinguish delimiter collisions and aggregate filtered leaves", () => {
  const m = model();
  m.setState({ groupBy: ["region", "quarter"], expanded: ["*"] });
  const view = m.view();
  assert.equal(view.rows[0].data.amount, 40);
  assert.equal(view.rows[0].count, 2);
  m.toggleGroup(view.rows[0].id);
  assert.equal(m.view().rows.length, 6);
  assert.equal(aggregates.avg([10, null, 20]), 15);
  assert.equal(aggregates.min([]), null);
});
test("pivot produces separate sparse measures", () => {
  const m = model();
  m.setState({
    pivot: {
      rows: ["region"],
      columns: ["quarter"],
      values: [
        { id: "amount", aggregate: "sum" },
        { id: "amount", aggregate: "avg" },
      ],
    },
  });
  const p = m.pivot();
  assert.equal(p.rows.length, 2);
  assert.equal(p.columns.length, 5);
  assert.equal(p.rows[0].data[p.columns[1].id], 10);
  assert.equal(p.rows[1].data[p.columns[4].id], null);
});
test("batch editing is atomic, duplicate targets undo correctly", () => {
  const m = model();
  assert.throws(() =>
    m.editMany([
      { id: "a", columnId: "amount", value: 12 },
      { id: "b", columnId: "amount", value: -1 },
    ]),
  );
  assert.equal(m.byId.get("a").data.amount, 10);
  m.editMany([
    { id: "a", columnId: "amount", value: 12 },
    { id: "a", columnId: "amount", value: 15 },
    { id: "b", columnId: "amount", value: 22 },
  ]);
  m.undo();
  assert.equal(m.byId.get("a").data.amount, 10);
  assert.equal(m.byId.get("b").data.amount, 20);
  m.redo();
  assert.equal(m.byId.get("a").data.amount, 15);
});
test("transaction validates before mutation, clears stale history and selection", () => {
  const m = model();
  m.select(["a", "b"]);
  m.edit("a", "amount", 12);
  assert.throws(() => m.transaction({ remove: ["a"], add: [rows[1]] }));
  assert(m.byId.has("a"));
  m.transaction({
    remove: ["a"],
    update: [{ id: "b", amount: 50 }],
    add: [{ id: "e", amount: 60 }],
  });
  m.undo();
  assert.equal(m.byId.get("b").data.amount, 50);
  assert.deepEqual([...m.selected], ["b"]);
});
test("tree synthesizes ancestors, handles parent records in either order", () => {
  const m = new GridModel({
    columns,
    rows: [
      { id: 1, path: ["A", "B"], name: "Child" },
      { id: 2, path: ["A"], name: "Parent" },
    ],
    treePath: (r) => r.path,
    state: { expanded: ["*"] },
  });
  assert.equal(m.view().rows.length, 2);
  assert.equal(m.view().rows[0].entry.data.name, "Parent");
  assert.equal(m.view().rows[1].depth, 1);
});
test("column order, pin, visibility, state and pagination roundtrip", () => {
  const m = model();
  m.moveColumn("amount", "name");
  m.setColumn("amount", { pinned: "left", width: 180 });
  m.setColumn("quarter", { hidden: true });
  m.setState({ pageSize: 2, page: 10 });
  m.select(["b"]);
  const next = model();
  next.restoreState(m.getState());
  assert.deepEqual(next.getState(), m.getState());
  assert.equal(next.view().page, 1);
  assert.equal(next.view().rows.length, 2);
});
test("duplicate IDs rejected without replacing good rows", () => {
  const m = model();
  assert.throws(() => m.replaceRows([{ id: 1 }, { id: 1 }]));
  assert.equal(m.rows.length, 4);
});
test("remote deduplication, cache eviction and stale response rejection", async () => {
  let calls = 0;
  const remote = new RemoteDataSource(
    async ({ start }) => {
      calls++;
      return { rows: [{ id: start }], total: 20 };
    },
    { blockSize: 2, maxBlocks: 1 },
  );
  await Promise.all([remote.getBlock(0), remote.getBlock(0)]);
  assert.equal(calls, 1);
  await remote.getBlock(1);
  await remote.getBlock(0);
  assert.equal(calls, 3);
  let release;
  const stale = new RemoteDataSource(
    () => new Promise((resolve) => (release = resolve)),
  );
  const p = stale.getBlock(0);
  await Promise.resolve();
  stale.invalidate();
  release({ rows: [], total: 0 });
  await assert.rejects(p, { name: "AbortError" });
});
test("failed remote requests can retry", async () => {
  let calls = 0;
  const source = new RemoteDataSource(async () => {
    if (!calls++) throw new Error("offline");
    return { rows: [], total: 0 };
  });
  await assert.rejects(source.getBlock(0));
  assert.equal((await source.getBlock(0)).total, 0);
});
test("quoted TSV/CSV roundtrips multiline, empty and Unicode cells", () => {
  const data = [
    ["hello\tthere", 'a"b', "line\nnext", ""],
    ["é", "", 12, false],
  ];
  assert.deepEqual(
    parseDelimited(delimited(data, "\t", { safe: false })),
    data.map((r) => r.map(String)),
  );
  assert.deepEqual(parseDelimited("a\tb\r\n"), [["a", "b"]]);
  assert.throws(() => parseDelimited('"unfinished'));
  assert.equal(delimited([["=1+1", -5]]), "'=1+1,-5");
});
test("XLSX is a real ZIP with typed inline string and numeric cells", () => {
  const bytes = xlsx([
    { name: "Records", freezeHeader: true, rows: [["=1+1", "<&", 42, true]] },
  ]);
  assert.equal(new DataView(bytes.buffer).getUint32(0, true), 0x04034b50);
  const xml = new TextDecoder().decode(bytes);
  assert(xml.includes('t="inlineStr"'));
  assert(xml.includes("&lt;&amp;"));
  assert(xml.includes("<v>42</v>"));
  assert(xml.includes('state="frozen"'));
  assert.throws(() => xlsx([{ name: "Bad/name", rows: [] }]));
});

test("lexical sorting and missing values have a stable total order", () => {
  const m = new GridModel({
    columns: [{ field: "value" }],
    rows: [
      { id: "null", value: null },
      { id: "missing" },
      { id: "ten", value: "item10" },
      { id: "two", value: "item2" },
      { id: "upper", value: "Alpha" },
      { id: "lower", value: "alpha" },
    ],
  });
  m.setState({ sort: [{ id: "value", dir: "asc" }] });
  assert.deepEqual(
    m.view().rows.map((r) => r.id),
    ["null", "missing", "upper", "lower", "ten", "two"],
  );
  m.setState({ sort: [{ id: "value", dir: "desc" }] });
  assert.deepEqual(
    m.view().rows.map((r) => r.id),
    ["two", "ten", "lower", "upper", "null", "missing"],
  );
});
test("text equality, empty operands, numeric blanks and range endpoints", () => {
  assert(matches("ALPHA", { op: "eq", value: "alpha" }));
  assert(!matches("Alpha", { op: "ne", value: "ALPHA" }));
  assert(!matches(null, { op: "ne", value: 2 }, "number"));
  assert(!matches(undefined, { op: "ne", value: 2 }, "number"));
  for (const op of ["contains", "startsWith", "endsWith", "eq"])
    assert(!matches("anything", { op, value: "" }));
  assert(matches(null, { op: "ne", value: "" }));
  assert(!matches("anything", { op: "ne", value: "" }));
  assert(!matches(10, { op: "between", value: 10, to: 20 }));
  assert(matches(15, { op: "between", value: 10, to: 20 }));
  assert(!matches(20, { op: "between", value: 10, to: 20 }));
  assert(matches(10, { op: "between", value: 10, to: 20, inclusive: true }));
});
test("quick search matches all terms across visible columns", () => {
  const m = new GridModel({
    columns: [
      { field: "name" },
      { field: "region" },
      { field: "secret", hidden: true },
    ],
    rows: [
      { id: "a", name: "Alpha", region: "West", secret: "hidden" },
      { id: "b", name: "Beta", region: "East", secret: "hidden" },
    ],
  });
  m.setState({ quick: "  WEST  alpha  " });
  assert.deepEqual(
    m.view().rows.map((r) => r.id),
    ["a"],
  );
  m.setState({ quick: "hidden" });
  assert.equal(m.view().rows.length, 0);
  m.setState({ quick: " " });
  assert.equal(m.view().rows.length, 2);
});
test("empty sums remain null and sparse pivot intersections do not invent zero", () => {
  assert.equal(aggregates.sum([null, undefined, "3"]), null);
  assert.equal(aggregates.sum([0]), 0);
  const m = new GridModel({
    columns: [
      { field: "region" },
      { field: "quarter" },
      { field: "amount", aggregate: "sum" },
    ],
    rows: [
      { id: 1, region: "A", quarter: "Q1", amount: 3 },
      { id: 2, region: "B", quarter: "Q2", amount: 4 },
    ],
    state: {
      pivot: {
        rows: ["region"],
        columns: ["quarter"],
        values: [{ id: "amount", aggregate: "sum" }],
      },
    },
  });
  const p = m.pivot();
  assert.equal(p.rows[0].data[p.columns[2].id], null);
});
test("groups sort by aggregate independently of leaf values and preserve first source value", () => {
  const m = new GridModel({
    columns: [
      { field: "region" },
      { field: "amount", type: "number", aggregate: "sum" },
      { field: "label", aggregate: "first" },
    ],
    rows: [
      { id: "a", region: "West", amount: 5, label: "first" },
      { id: "b", region: "East", amount: 30, label: "east-first" },
      { id: "c", region: "West", amount: 25, label: "second" },
      { id: "d", region: "East", amount: 2, label: "east-second" },
    ],
    state: {
      groupBy: ["region"],
      expanded: ["*"],
      sort: [{ id: "amount", dir: "asc" }],
    },
  });
  assert.deepEqual(
    m.view().rows.map((n) => (n.kind === "group" ? n.label : n.id)),
    ["West", "a", "c", "East", "d", "b"],
  );
  assert.equal(m.view().rows[3].data.label, "east-first");
});
