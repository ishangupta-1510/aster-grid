/** Original data pipeline. No DOM and no runtime dependencies. */
export const aggregates = {
  sum: (values) => {
    const numbers = values.filter(finite);
    return numbers.length ? numbers.reduce((a, b) => a + b, 0) : null;
  },
  count: (values) => values.length,
  min: (values) =>
    values
      .filter(finite)
      .reduce((a, b) => (a == null ? b : Math.min(a, b)), null),
  max: (values) =>
    values
      .filter(finite)
      .reduce((a, b) => (a == null ? b : Math.max(a, b)), null),
  avg: (values) => {
    const nums = values.filter(finite);
    return nums.length ? aggregates.sum(nums) / nums.length : null;
  },
  first: (values) => values[0] ?? null,
  last: (values) => values.at(-1) ?? null,
};
const finite = (value) => typeof value === "number" && Number.isFinite(value);
const clone = (value) => structuredClone(value);
const identity = (value) => JSON.stringify(value);
const text = (value) => String(value ?? "").toLocaleLowerCase();
export function matches(value, filter, type) {
  if (!filter) return true;
  if (filter.op === "and" || filter.op === "or")
    return filter.rules[filter.op === "and" ? "every" : "some"]((f) =>
      matches(value, f, type),
    );
  const target = filter.value;
  // Empty text operands do not match text; use the explicit blank predicate.
  if (
    target === "" &&
    ["contains", "startsWith", "endsWith", "eq"].includes(filter.op)
  )
    return false;
  if (target === "" && filter.op === "ne") return value == null;
  switch (filter.op) {
    case "contains":
      return text(value).includes(text(target));
    case "startsWith":
      return text(value).startsWith(text(target));
    case "endsWith":
      return text(value).endsWith(text(target));
    case "eq":
      return typeof value === "string" && typeof target === "string"
        ? text(value) === text(target)
        : value === target;
    case "ne":
      if ((type === "number" || typeof target === "number") && value == null)
        return false;
      return typeof value === "string" && typeof target === "string"
        ? text(value) !== text(target)
        : value !== target;
    case "gt":
      return value != null && value > target;
    case "gte":
      return value != null && value >= target;
    case "lt":
      return value != null && value < target;
    case "lte":
      return value != null && value <= target;
    case "between":
      return (
        value != null &&
        (filter.inclusive
          ? value >= target && value <= filter.to
          : value > target && value < filter.to)
      );
    case "in":
      return filter.values.includes(value);
    case "blank":
      return value == null || value === "";
    case "notBlank":
      return value != null && value !== "";
    default:
      throw new Error(`Unknown filter operation: ${filter.op}`);
  }
}
export class GridModel {
  constructor(options) {
    this.options = options;
    this.columns = options.columns.map((c) => ({
      width: 150,
      ...c,
      id: c.id ?? c.field,
    }));
    if (
      this.columns.some((c) => !c.id) ||
      new Set(this.columns.map((c) => c.id)).size !== this.columns.length
    )
      throw new Error("Columns need unique IDs");
    this.listeners = new Map();
    this.selected = new Set();
    this.past = [];
    this.future = [];
    this.state = {
      sort: [],
      filters: {},
      quick: "",
      groupBy: [],
      expanded: [],
      pivot: null,
      page: 0,
      pageSize: 0,
      ...options.state,
    };
    this.replaceRows(options.rows ?? [], false);
  }
  on(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(handler);
    return () => this.listeners.get(type)?.delete(handler);
  }
  emit(type, detail) {
    for (const fn of this.listeners.get(type) ?? []) fn(detail);
  }
  rowId(row, index) {
    const id = this.options.getRowId
      ? this.options.getRowId(row)
      : (row.id ?? index);
    return String(id);
  }
  replaceRows(rows, notify = true) {
    const entries = rows.map((data, i) => ({
      id: this.rowId(data, i),
      data: { ...data },
    }));
    if (new Set(entries.map((e) => e.id)).size !== entries.length)
      throw new Error("Duplicate row ID");
    this.rows = entries;
    this.rowOrder = new Map(entries.map((entry, index) => [entry.id, index]));
    this.byId = new Map(entries.map((e) => [e.id, e]));
    this.selected = new Set(
      [...this.selected].filter((id) => this.byId.has(id)),
    );
    this.past = [];
    this.future = [];
    if (notify) this.changed();
  }
  value(entry, column) {
    const c =
      typeof column === "string"
        ? this.columns.find((c) => c.id === column)
        : column;
    return c?.value ? c.value(entry.data) : entry.data[c?.field ?? c?.id];
  }
  test(entry, rule) {
    if (rule.op === "and" || rule.op === "or")
      return rule.rules[rule.op === "and" ? "every" : "some"]((f) =>
        this.test(entry, f),
      );
    return matches(
      this.value(entry, rule.column),
      rule,
      this.columns.find((c) => c.id === rule.column)?.type,
    );
  }
  filteredRows() {
    const quick = text(this.state.quick).split(/\s+/).filter(Boolean);
    return this.rows.filter(
      (row) =>
        (!quick.length ||
          quick.every((term) =>
            this.columns.some(
              (c) => !c.hidden && text(this.value(row, c)).includes(term),
            ),
          )) &&
        Object.entries(this.state.filters).every(([id, filter]) =>
          matches(
            this.value(row, id),
            filter,
            this.columns.find((c) => c.id === id)?.type,
          ),
        ) &&
        (!this.state.advancedFilter ||
          this.test(row, this.state.advancedFilter)) &&
        (!this.options.externalFilter || this.options.externalFilter(row.data)),
    );
  }
  sortedRows(rows) {
    return [...rows].sort((a, b) => {
      for (const s of this.state.sort) {
        const c = this.columns.find((c) => c.id === s.id);
        if (!c) continue;
        const av = this.value(a, c),
          bv = this.value(b, c);
        const direction = s.dir === "desc" ? -1 : 1;
        // Missing values compare equally and sort before present values ascending.
        if (av == null || bv == null) {
          if (av == null && bv == null) continue;
          return (av == null ? -1 : 1) * direction;
        }
        const delta = c.compare
          ? c.compare(av, bv)
          : typeof av === "number" && typeof bv === "number"
            ? av - bv
            : String(av) === String(bv)
              ? 0
              : String(av) > String(bv)
                ? 1
                : -1;
        if (delta) return (s.dir === "desc" ? -1 : 1) * delta;
      }
      return 0;
    });
  }
  aggregate(rows) {
    const out = {};
    for (const c of this.columns)
      if (c.aggregate)
        out[c.id] = (
          typeof c.aggregate === "function"
            ? c.aggregate
            : aggregates[c.aggregate]
        )(rows.map((r) => this.value(r, c)));
    return out;
  }
  group(rows, fields = this.state.groupBy, depth = 0, path = []) {
    if (depth >= fields.length)
      return rows.map((r) => ({ ...r, kind: "row", depth }));
    const buckets = new Map();
    for (const row of rows) {
      const value = this.value(row, fields[depth]);
      const key = identity(value ?? null);
      if (!buckets.has(key)) buckets.set(key, { value, rows: [] });
      buckets.get(key).rows.push(row);
    }
    const groups = [...buckets.values()].map((bucket) => {
      const next = [...path, bucket.value ?? null];
      const original = [...bucket.rows].sort(
        (a, b) => this.rowOrder.get(a.id) - this.rowOrder.get(b.id),
      );
      const node = {
        id: "group:" + identity(next),
        kind: "group",
        depth,
        label: bucket.value ?? "(blank)",
        count: bucket.rows.length,
        data: this.aggregate(original),
        children: this.group(bucket.rows, fields, depth + 1, next),
      };
      return {
        node,
        value: bucket.value,
        order: this.rowOrder.get(original[0].id),
      };
    });
    groups.sort((a, b) => {
      for (const sort of this.state.sort) {
        const column = this.columns.find((c) => c.id === sort.id);
        if (!column || (sort.id !== fields[depth] && !column.aggregate))
          continue;
        const av = sort.id === fields[depth] ? a.value : a.node.data[sort.id];
        const bv = sort.id === fields[depth] ? b.value : b.node.data[sort.id];
        let difference = 0;
        if (av == null || bv == null)
          difference = av == null && bv == null ? 0 : av == null ? -1 : 1;
        else if (column.compare) difference = column.compare(av, bv);
        else difference = av === bv ? 0 : av > bv ? 1 : -1;
        if (difference) return difference * (sort.dir === "desc" ? -1 : 1);
      }
      return a.order - b.order;
    });
    return groups.map((group) => group.node);
  }
  tree(rows) {
    const roots = [],
      nodes = new Map();
    for (const row of rows) {
      const path = this.options.treePath(row.data);
      if (!Array.isArray(path) || !path.length)
        throw new Error("treePath must return a nonempty array");
      let siblings = roots;
      path.forEach((label, depth) => {
        const key = "tree:" + identity(path.slice(0, depth + 1));
        let node = nodes.get(key);
        if (!node) {
          node = {
            id: key,
            kind: "group",
            label,
            depth,
            children: [],
            data: {},
            count: 0,
          };
          nodes.set(key, node);
          siblings.push(node);
        }
        node.count++;
        if (depth === path.length - 1) {
          if (node.entry) throw new Error("Duplicate tree path");
          node.entry = row;
          node.data = row.data;
        }
        siblings = node.children;
      });
    }
    return roots;
  }
  pivot(rows = this.sortedRows(this.filteredRows())) {
    const config = this.state.pivot;
    if (!config) return null;
    const buckets = new Map(),
      keys = new Map();
    for (const row of rows) {
      const groupValues = config.rows.map((id) => this.value(row, id));
      const pivotValues = config.columns.map((id) => this.value(row, id));
      const groupKey = identity(groupValues),
        pivotKey = identity(pivotValues);
      keys.set(pivotKey, pivotValues);
      if (!buckets.has(groupKey))
        buckets.set(groupKey, { groupValues, cells: new Map() });
      const bucket = buckets.get(groupKey);
      if (!bucket.cells.has(pivotKey)) bucket.cells.set(pivotKey, []);
      bucket.cells.get(pivotKey).push(row);
    }
    const columns = config.rows.map((id) => ({
      ...this.columns.find((c) => c.id === id),
      editable: false,
    }));
    for (const [key, values] of keys)
      for (const metric of config.values)
        columns.push({
          id: identity([key, metric.id, metric.aggregate]),
          title: `${values.join(" / ")} · ${metric.id} (${metric.aggregate})`,
          width: 170,
        });
    const result = [...buckets].map(([key, bucket]) => {
      const data = Object.fromEntries(
        config.rows.map((id, i) => [id, bucket.groupValues[i]]),
      );
      for (const [pivotKey] of keys)
        for (const metric of config.values) {
          data[identity([pivotKey, metric.id, metric.aggregate])] = aggregates[
            metric.aggregate
          ](
            (bucket.cells.get(pivotKey) ?? []).map((r) =>
              this.value(r, metric.id),
            ),
          );
        }
      return { id: "pivot:" + key, kind: "pivot", depth: 0, data };
    });
    return { columns, rows: result };
  }
  view() {
    const source = this.sortedRows(this.filteredRows()),
      pivot = this.pivot(source);
    let nodes =
      pivot?.rows ??
      (this.options.treePath ? this.tree(source) : this.group(source));
    const expanded = new Set(this.state.expanded),
      flat = [];
    const visit = (items) =>
      items.forEach((n) => {
        flat.push(n);
        if (n.children && (expanded.has(n.id) || expanded.has("*")))
          visit(n.children);
      });
    visit(nodes);
    const total = flat.length;
    const page = this.state.pageSize
      ? Math.min(
          Math.max(0, this.state.page),
          Math.max(0, Math.ceil(total / this.state.pageSize) - 1),
        )
      : 0;
    if (this.state.pageSize)
      nodes = flat.slice(
        page * this.state.pageSize,
        (page + 1) * this.state.pageSize,
      );
    else nodes = flat;
    return {
      rows: nodes,
      columns: pivot?.columns ?? this.columns.filter((c) => !c.hidden),
      total,
      page,
      filtered: source.length,
      aggregates: this.aggregate(source),
    };
  }
  changed() {
    this.emit("change", this.getState());
  }
  setState(patch) {
    this.state = { ...this.state, ...clone(patch) };
    this.changed();
  }
  getState() {
    return {
      ...clone(this.state),
      columns: this.columns.map(({ id, width, hidden, pinned }) => ({
        id,
        width,
        hidden,
        pinned,
      })),
      selection: [...this.selected],
    };
  }
  restoreState(state) {
    const { columns, selection, ...rest } = state;
    if (columns) {
      const ordered = columns
        .map((c) => {
          const found = this.columns.find((x) => x.id === c.id);
          return found
            ? { ...found, width: c.width, hidden: c.hidden, pinned: c.pinned }
            : null;
        })
        .filter(Boolean);
      this.columns = [
        ...ordered,
        ...this.columns.filter((c) => !ordered.some((x) => x.id === c.id)),
      ];
    }
    if (selection)
      this.selected = new Set(selection.filter((id) => this.byId.has(id)));
    this.setState(rest);
  }
  toggleGroup(id) {
    let expanded = new Set(this.state.expanded);
    if (expanded.has("*")) {
      expanded = new Set(
        this.view()
          .rows.filter((r) => r.children)
          .map((r) => r.id),
      );
    }
    expanded.has(id) ? expanded.delete(id) : expanded.add(id);
    this.setState({ expanded: [...expanded] });
  }
  select(ids, mode = "replace") {
    if (mode === "replace") this.selected.clear();
    for (const value of ids) {
      const id = String(value);
      if (!this.byId.has(id)) continue;
      if (mode === "toggle" && this.selected.has(id)) this.selected.delete(id);
      else this.selected.add(id);
    }
    this.emit("selection", [...this.selected]);
    this.changed();
  }
  prepareEdit(id, columnId, input) {
    const row = this.byId.get(String(id)),
      c = this.columns.find((c) => c.id === columnId);
    if (!row || !c || !c.editable || c.value)
      throw new Error("Cell is not editable");
    let value = c.parse ? c.parse(input, row.data) : input;
    if (!c.parse && c.type === "number") {
      value = input === "" || input == null ? null : Number(input);
      if (value !== null && !Number.isFinite(value))
        throw new Error("Enter a valid number");
    }
    if (!c.parse && c.type === "boolean") {
      if (![true, false, "true", "false", "1", "0"].includes(input))
        throw new Error("Enter true or false");
      value = input === true || input === "true" || input === "1";
    }
    if (c.type === "date" && value && !/^\d{4}-\d{2}-\d{2}$/.test(value))
      throw new Error("Use YYYY-MM-DD");
    if (c.options && !c.options.includes(value))
      throw new Error("Choose a listed value");
    const error = c.validate?.(value, row.data);
    if (error) throw new Error(error);
    return {
      id: row.id,
      field: c.field ?? c.id,
      columnId,
      before: row.data[c.field ?? c.id],
      after: value,
    };
  }
  editMany(edits) {
    // Validate the whole batch before touching any record; duplicate targets collapse.
    const unique = new Map();
    for (const e of edits) {
      const change = this.prepareEdit(e.id, e.columnId, e.value);
      unique.set(identity([change.id, change.field]), change);
    }
    const changes = [...unique.values()].filter(
      (c) => !Object.is(c.before, c.after),
    );
    if (!changes.length) return;
    for (const c of changes) this.byId.get(c.id).data[c.field] = c.after;
    this.past.push(changes);
    if (this.past.length > (this.options.historyLimit ?? 100))
      this.past.shift();
    this.future = [];
    this.emit("edit", changes);
    this.changed();
  }
  edit(id, columnId, value) {
    this.editMany([{ id, columnId, value }]);
  }
  undo() {
    const changes = this.past.pop();
    if (!changes) return;
    for (const c of changes) this.byId.get(c.id).data[c.field] = c.before;
    this.future.push(changes);
    this.emit("edit", changes);
    this.changed();
  }
  redo() {
    const changes = this.future.pop();
    if (!changes) return;
    for (const c of changes) this.byId.get(c.id).data[c.field] = c.after;
    this.past.push(changes);
    this.emit("edit", changes);
    this.changed();
  }
  transaction({ add = [], update = [], remove = [] }) {
    if (!this.options.getRowId && [...add, ...update].some((r) => r.id == null))
      throw new Error("Transactions require stable row IDs");
    const deleted = new Set(remove.map(String)),
      next = new Map(
        this.rows
          .filter((r) => !deleted.has(r.id))
          .map((r) => [r.id, { ...r.data }]),
      );
    for (const row of update) {
      const id = this.rowId(row);
      if (!next.has(id)) throw new Error(`Missing row ${id}`);
      next.set(id, { ...next.get(id), ...row });
    }
    for (const row of add) {
      const id = this.rowId(row);
      if (next.has(id)) throw new Error(`Duplicate row ${id}`);
      next.set(id, row);
    }
    this.replaceRows([...next.values()]);
  }
  setColumn(id, patch) {
    const c = this.columns.find((c) => c.id === id);
    if (!c) throw new Error("Unknown column");
    for (const key of ["hidden", "pinned", "width"])
      if (key in patch)
        c[key] =
          key === "width"
            ? Math.max(60, Number(patch[key]) || 150)
            : patch[key];
    this.changed();
  }
  moveColumn(id, beforeId) {
    const from = this.columns.findIndex((c) => c.id === id),
      to = this.columns.findIndex((c) => c.id === beforeId);
    if (from < 0 || to < 0 || from === to) return;
    const [col] = this.columns.splice(from, 1);
    this.columns.splice(
      this.columns.findIndex((c) => c.id === beforeId),
      0,
      col,
    );
    this.changed();
  }
}

/** Abortable, LRU cached remote blocks. Server implements sort/filter/group/pivot. */
export class RemoteDataSource {
  constructor(fetchRows, { blockSize = 100, maxBlocks = 10 } = {}) {
    if (blockSize < 1 || maxBlocks < 1)
      throw new Error("Positive cache sizes required");
    this.fetchRows = fetchRows;
    this.blockSize = blockSize;
    this.maxBlocks = maxBlocks;
    this.cache = new Map();
    this.pending = new Map();
    this.generation = 0;
  }
  async getBlock(index, query = {}) {
    if (!Number.isInteger(index) || index < 0)
      throw new Error("Invalid block index");
    const key = identity([index, query]);
    if (this.cache.has(key)) {
      const data = this.cache.get(key);
      this.cache.delete(key);
      this.cache.set(key, data);
      return data;
    }
    if (this.pending.has(key)) return this.pending.get(key).promise;
    const controller = new AbortController(),
      generation = this.generation;
    const promise = Promise.resolve()
      .then(() =>
        this.fetchRows({
          ...query,
          start: index * this.blockSize,
          end: (index + 1) * this.blockSize,
          signal: controller.signal,
        }),
      )
      .then((result) => {
        if (generation !== this.generation)
          throw new DOMException("Stale request", "AbortError");
        if (
          !Array.isArray(result.rows) ||
          !Number.isInteger(result.total) ||
          result.total < 0 ||
          result.rows.length > this.blockSize
        )
          throw new Error("Invalid server response");
        this.cache.set(key, result);
        while (this.cache.size > this.maxBlocks)
          this.cache.delete(this.cache.keys().next().value);
        return result;
      })
      .finally(() => {
        if (this.pending.get(key)?.promise === promise)
          this.pending.delete(key);
      });
    this.pending.set(key, { controller, promise });
    return promise;
  }
  invalidate() {
    this.generation++;
    for (const p of this.pending.values()) p.controller.abort();
    this.pending.clear();
    this.cache.clear();
  }
  destroy() {
    this.invalidate();
  }
}
