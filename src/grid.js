import { GridModel } from "./engine.js";
import { delimited, parseDelimited, xlsx, download } from "./export.js";
import { chart, sparkline } from "./charts.js";
let sequence = 0;
function node(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = String(text);
  return el;
}
function button(label, run, className = "") {
  const el = node("button", className, label);
  el.type = "button";
  el.addEventListener("click", run);
  return el;
}
function option(value, label = value) {
  const el = node("option", "", label);
  el.value = value;
  return el;
}
/** Mounts an original native-DOM grid. All untrusted cell content is text by default. */
export class Grid {
  constructor(container, options) {
    if (!container) throw new Error("A mount element is required");
    this.options = options;
    this.model = new GridModel(options);
    this.id = `aster-${++sequence}`;
    this.rowHeight = options.rowHeight ?? 38;
    this.range = null;
    this.cleanups = [];
    this.remotePage = 0;
    this.remoteTotal = 0;
    this.request = 0;
    this.root = node("section", "aster-grid");
    this.root.dataset.theme = options.theme ?? "light";
    this.root.style.height =
      typeof options.height === "number"
        ? `${options.height}px`
        : (options.height ?? "560px");
    this.toolbar = node("div", "aster-toolbar");
    const brand = node("div", "aster-brand", "✳");
    brand.title = "Aster Grid";
    this.search = node("input", "aster-search");
    this.search.type = "search";
    this.search.placeholder = "Search every column…";
    this.search.setAttribute("aria-label", "Search all rows");
    this.search.addEventListener("input", () =>
      this.updateQuery({ quick: this.search.value, page: 0 }),
    );
    this.toolbar.append(
      brand,
      this.search,
      button("Columns", () => this.showColumns()),
      button("Analyze", () => this.showAnalysis()),
      button("Undo", () => this.model.undo()),
      button("Redo", () => this.model.redo()),
      button("Export", () => this.showExport()),
    );
    this.main = node("div", "aster-main");
    this.viewport = node("div", "aster-viewport");
    this.viewport.tabIndex = 0;
    this.viewport.setAttribute("role", "grid");
    this.viewport.setAttribute("aria-label", options.label ?? "Data grid");
    this.viewport.setAttribute("aria-multiselectable", "true");
    this.header = node("div", "aster-header");
    this.header.setAttribute("role", "row");
    this.canvas = node("div", "aster-canvas");
    this.canvas.setAttribute("role", "rowgroup");
    this.viewport.append(this.header, this.canvas);
    this.panel = node("aside", "aster-panel");
    this.panel.hidden = true;
    this.main.append(this.viewport, this.panel);
    this.status = node("div", "aster-status");
    this.status.setAttribute("role", "status");
    this.footer = node("div", "aster-footer");
    this.footer.append(
      this.status,
      button("Previous", () => this.page(-1)),
      button("Next", () => this.page(1)),
    );
    this.message = node("div", "aster-message");
    this.message.hidden = true;
    this.message.setAttribute("role", "alert");
    this.root.append(this.toolbar, this.main, this.message, this.footer);
    container.replaceChildren(this.root);
    this.viewport.addEventListener("scroll", () => {
      if (!this.frame)
        this.frame = requestAnimationFrame(() => {
          this.frame = null;
          this.renderRows();
        });
    });
    this.viewport.addEventListener("keydown", (e) => this.keydown(e));
    this.viewport.addEventListener("copy", (e) => {
      if (this.editing || !this.range) return;
      e.preventDefault();
      e.clipboardData.setData("text/plain", this.copy());
    });
    this.viewport.addEventListener("paste", (e) => {
      if (this.editing || !this.range) return;
      e.preventDefault();
      this.attempt(() => this.paste(e.clipboardData.getData("text/plain")));
    });
    this.cleanups.push(this.model.on("change", () => this.render()));
    if (typeof ResizeObserver !== "undefined") {
      this.observer = new ResizeObserver(() => this.renderRows());
      this.observer.observe(this.viewport);
    }
    this.render();
    if (options.dataSource) this.loadRemote();
  }
  attempt(fn) {
    try {
      const result = fn();
      if (result?.catch) result.catch((e) => this.error(e));
      return result;
    } catch (error) {
      this.error(error);
    }
  }
  error(error) {
    this.message.hidden = false;
    this.message.replaceChildren(
      node("span", "", error.message ?? error),
      button("Dismiss", () => (this.message.hidden = true)),
    );
    this.options.onError?.(error);
  }
  updateQuery(patch) {
    this.range = null;
    this.viewport.scrollTop = 0;
    this.model.setState(patch);
    if (this.options.dataSource) {
      this.remotePage = 0;
      this.loadRemote();
    }
  }
  async loadRemote() {
    const token = ++this.request;
    this.root.setAttribute("aria-busy", "true");
    this.status.textContent = "Loading records…";
    try {
      const { sort, filters, quick, advancedFilter } = this.model.state;
      const result = await this.options.dataSource.getBlock(this.remotePage, {
        sort,
        filters,
        quick,
        advancedFilter,
      });
      if (token !== this.request || this.destroyed) return;
      this.remoteTotal = result.total;
      this.model.replaceRows(result.rows);
      this.message.hidden = true;
    } catch (error) {
      if (
        token === this.request &&
        !this.destroyed &&
        error.name !== "AbortError"
      ) {
        this.error(error);
        this.status.textContent = "Loading failed";
      }
    } finally {
      if (token === this.request) this.root.removeAttribute("aria-busy");
    }
  }
  page(delta) {
    if (this.options.dataSource) {
      const next = Math.max(
        0,
        Math.min(
          Math.max(
            0,
            Math.ceil(this.remoteTotal / this.options.dataSource.blockSize) - 1,
          ),
          this.remotePage + delta,
        ),
      );
      if (next !== this.remotePage) {
        this.remotePage = next;
        this.viewport.scrollTop = 0;
        this.loadRemote();
      }
    } else if (this.model.state.pageSize) {
      const next = Math.max(
        0,
        Math.min(
          Math.ceil(this.view.total / this.model.state.pageSize) - 1,
          this.view.page + delta,
        ),
      );
      this.updateQuery({ page: next });
    }
  }
  render() {
    if (this.destroyed) return;
    // The server owns filtering and sorting of its returned block.
    if (this.options.dataSource)
      this.view = {
        rows: this.model.rows.map((r) => ({ ...r, kind: "row", depth: 0 })),
        columns: this.model.columns.filter((c) => !c.hidden),
        total: this.remoteTotal,
        filtered: this.remoteTotal,
        aggregates: this.model.aggregate(this.model.rows),
      };
    else this.view = this.model.view();
    this.columns = [
      ...this.view.columns.filter((c) => c.pinned === "left"),
      ...this.view.columns.filter((c) => !c.pinned),
      ...this.view.columns.filter((c) => c.pinned === "right"),
    ];
    this.width =
      44 + this.columns.reduce((sum, c) => sum + (c.width ?? 150), 0);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.view.rows.length * this.rowHeight}px`;
    this.header.style.width = `${this.width}px`;
    this.viewport.setAttribute("aria-rowcount", String(this.view.total + 1));
    this.viewport.setAttribute(
      "aria-colcount",
      String(this.columns.length + 1),
    );
    this.search.value = this.model.state.quick;
    this.renderHeader();
    this.renderRows();
    this.renderStatus();
  }
  positionCell(cell, c, i) {
    cell.style.width = `${c.width ?? 150}px`;
    cell.style.flex = `0 0 ${c.width ?? 150}px`;
    if (c.pinned) {
      cell.classList.add("aster-pinned");
      cell.style.position = "sticky";
      cell.style[c.pinned] = `${
        c.pinned === "left"
          ? 44 +
            this.columns
              .slice(0, i)
              .filter((x) => x.pinned === "left")
              .reduce((s, x) => s + (x.width ?? 150), 0)
          : this.columns
              .slice(i + 1)
              .filter((x) => x.pinned === "right")
              .reduce((s, x) => s + (x.width ?? 150), 0)
      }px`;
    }
  }
  renderHeader() {
    this.header.replaceChildren();
    this.header.setAttribute("aria-rowindex", "1");
    const selection = node("div", "aster-select-cell");
    selection.setAttribute("role", "columnheader");
    const check = node("input");
    check.type = "checkbox";
    check.setAttribute("aria-label", "Select all loaded filtered rows");
    const ids = this.view.rows.filter((r) => r.kind === "row").map((r) => r.id);
    check.checked =
      !!ids.length && ids.every((id) => this.model.selected.has(id));
    check.indeterminate =
      !check.checked && ids.some((id) => this.model.selected.has(id));
    check.addEventListener("change", () => {
      if (check.checked) this.model.select(ids, "add");
      else {
        ids.forEach((id) => this.model.selected.delete(id));
        this.model.select([], "add");
      }
    });
    selection.append(check);
    this.header.append(selection);
    this.columns.forEach((c, i) => {
      const head = node("div", "aster-heading");
      head.setAttribute("role", "columnheader");
      head.setAttribute("aria-colindex", String(i + 2));
      this.positionCell(head, c, i);
      const sort = this.model.state.sort.find((s) => s.id === c.id);
      head.setAttribute(
        "aria-sort",
        sort?.dir === "asc"
          ? "ascending"
          : sort?.dir === "desc"
            ? "descending"
            : "none",
      );
      const title = button(
        `${c.title ?? c.id}${sort ? (sort.dir === "asc" ? " ↑" : " ↓") : ""}`,
        (e) => {
          if (this.model.state.pivot) return;
          const list = e.shiftKey
            ? this.model.state.sort.filter((s) => s.id !== c.id)
            : [];
          if (sort?.dir !== "desc")
            list.push({ id: c.id, dir: sort ? "desc" : "asc" });
          this.updateQuery({ sort: list, page: 0 });
        },
        "aster-title",
      );
      title.title = "Sort; Shift-click to sort multiple columns";
      const menu = button("⋮", () => this.showColumn(c), "aster-menu-button");
      menu.setAttribute("aria-label", `Options for ${c.title ?? c.id}`);
      const resize = node("div", "aster-resize");
      resize.setAttribute("role", "separator");
      resize.setAttribute("aria-label", `Resize ${c.title ?? c.id}`);
      resize.setAttribute("aria-orientation", "vertical");
      resize.tabIndex = 0;
      resize.addEventListener("keydown", (e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          this.model.setColumn(c.id, {
            width: (c.width ?? 150) + (e.key === "ArrowRight" ? 10 : -10),
          });
        }
      });
      resize.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        const x = e.clientX,
          width = c.width ?? 150;
        resize.setPointerCapture(e.pointerId);
        const move = (ev) => {
          head.style.width = `${Math.max(60, width + ev.clientX - x)}px`;
          head.style.flexBasis = head.style.width;
        };
        const up = (ev) => {
          resize.removeEventListener("pointermove", move);
          resize.removeEventListener("pointerup", up);
          this.model.setColumn(c.id, {
            width: Math.max(60, width + ev.clientX - x),
          });
        };
        resize.addEventListener("pointermove", move);
        resize.addEventListener("pointerup", up);
      });
      title.draggable = !this.model.state.pivot;
      title.addEventListener("dragstart", (e) =>
        e.dataTransfer.setData("text/aster-column", c.id),
      );
      head.addEventListener("dragover", (e) => e.preventDefault());
      head.addEventListener("drop", (e) => {
        e.preventDefault();
        this.model.moveColumn(
          e.dataTransfer.getData("text/aster-column"),
          c.id,
        );
      });
      head.append(title, menu, resize);
      this.header.append(head);
    });
  }
  cellValue(row, c) {
    return row.kind === "row"
      ? this.model.value(row, c)
      : row.kind === "group" && row.entry
        ? this.model.value(row.entry, c)
        : row.data[c.id];
  }
  renderRows() {
    if (!this.view || this.destroyed || this.editing) return;
    const start = Math.max(
        0,
        Math.floor((this.viewport.scrollTop - 40) / this.rowHeight) - 5,
      ),
      count =
        Math.ceil((this.viewport.clientHeight || 420) / this.rowHeight) + 12;
    this.canvas.replaceChildren();
    this.viewport.removeAttribute("aria-activedescendant");
    if (!this.view.rows.length) {
      const empty = node("div", "aster-empty", "No matching records");
      this.canvas.append(empty);
      this.canvas.style.height = "160px";
    }
    this.view.rows.slice(start, start + count).forEach((row, offset) => {
      const r = start + offset,
        element = node(
          "div",
          `aster-row ${row.kind === "group" ? "aster-group-row" : ""}`,
        );
      element.style.top = `${r * this.rowHeight}px`;
      element.style.height = `${this.rowHeight}px`;
      element.setAttribute("role", "row");
      element.setAttribute("aria-rowindex", String(r + 2));
      element.setAttribute(
        "aria-selected",
        String(this.model.selected.has(row.id)),
      );
      const select = node("div", "aster-select-cell");
      select.setAttribute("role", "gridcell");
      if (row.kind === "row") {
        const check = node("input");
        check.type = "checkbox";
        check.checked = this.model.selected.has(row.id);
        check.setAttribute("aria-label", `Select row ${row.id}`);
        check.addEventListener("change", () =>
          this.model.select([row.id], "toggle"),
        );
        select.append(check);
      } else select.textContent = "·";
      element.append(select);
      this.columns.forEach((c, col) => {
        const cell = node("div", "aster-cell");
        cell.id = `${this.id}-${r}-${col}`;
        cell.dataset.row = String(r);
        cell.dataset.col = String(col);
        cell.setAttribute("role", "gridcell");
        cell.setAttribute("aria-colindex", String(col + 2));
        this.positionCell(cell, c, col);
        if (this.inRange(r, col)) {
          cell.classList.add("aster-in-range");
          cell.setAttribute("aria-selected", "true");
        }
        if (this.range?.r2 === r && this.range?.c2 === col) {
          cell.classList.add("aster-active");
          this.viewport.setAttribute("aria-activedescendant", cell.id);
        }
        const value = this.cellValue(row, c);
        if (col === 0 && row.kind === "group") {
          cell.style.paddingLeft = `${12 + row.depth * 18}px`;
          const expanded =
            this.model.state.expanded.includes("*") ||
            this.model.state.expanded.includes(row.id);
          const toggle = button(
            `${row.children?.length ? (expanded ? "▾" : "▸") : "·"} ${row.label} (${row.count})`,
            () => this.model.toggleGroup(row.id),
            "aster-group-toggle",
          );
          toggle.setAttribute("aria-expanded", String(expanded));
          cell.append(toggle);
        } else if (c.sparkline && Array.isArray(value))
          cell.append(sparkline(value));
        else if (c.render && row.kind === "row") {
          const result = c.render(value, row.data);
          if (result instanceof Node) cell.append(result);
          else cell.textContent = String(result ?? "");
        } else
          cell.textContent = String(
            c.format ? c.format(value, row.data) : (value ?? ""),
          );
        cell.title = String(value ?? "");
        if (c.type === "number") cell.classList.add("aster-number");
        cell.addEventListener("click", (e) => {
          if (e.target.closest("button,input,select,a")) return;
          this.range =
            e.shiftKey && this.range
              ? { ...this.range, r2: r, c2: col }
              : { r1: r, c1: col, r2: r, c2: col };
          this.viewport.focus({ preventScroll: true });
          this.renderRows();
          this.renderStatus();
        });
        cell.addEventListener("dblclick", () => this.startEdit(r, col));
        cell.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          this.range = { r1: r, c1: col, r2: r, c2: col };
          this.renderRows();
          this.showContext(row, c);
        });
        element.append(cell);
      });
      this.canvas.append(element);
    });
  }
  inRange(r, c) {
    const a = this.range;
    return (
      a &&
      r >= Math.min(a.r1, a.r2) &&
      r <= Math.max(a.r1, a.r2) &&
      c >= Math.min(a.c1, a.c2) &&
      c <= Math.max(a.c1, a.c2)
    );
  }
  bounds() {
    const a = this.range;
    return a
      ? {
          r1: Math.max(0, Math.min(a.r1, a.r2)),
          r2: Math.min(this.view.rows.length - 1, Math.max(a.r1, a.r2)),
          c1: Math.max(0, Math.min(a.c1, a.c2)),
          c2: Math.min(this.columns.length - 1, Math.max(a.c1, a.c2)),
        }
      : null;
  }
  renderStatus() {
    const nums = [],
      b = this.bounds();
    if (b)
      for (let r = b.r1; r <= b.r2; r++)
        for (let c = b.c1; c <= b.c2; c++) {
          const v = this.cellValue(this.view.rows[r], this.columns[c]);
          if (typeof v === "number" && Number.isFinite(v)) nums.push(v);
        }
    const page = this.options.dataSource
      ? ` · Page ${this.remotePage + 1}`
      : this.model.state.pageSize
        ? ` · Page ${this.view.page + 1}`
        : "";
    this.status.textContent = `${this.view.filtered.toLocaleString()} records · ${this.model.selected.size} selected${page}${nums.length ? ` · Sum ${nums.reduce((a, b) => a + b, 0).toLocaleString()} · Avg ${(nums.reduce((a, b) => a + b, 0) / nums.length).toLocaleString()}` : ""}`;
  }
  keydown(e) {
    if (this.editing || e.target !== this.viewport) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      e.shiftKey ? this.model.redo() : this.model.undo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
      e.preventDefault();
      this.model.redo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
      e.preventDefault();
      this.range = {
        r1: 0,
        c1: 0,
        r2: this.view.rows.length - 1,
        c2: this.columns.length - 1,
      };
      this.renderRows();
      this.renderStatus();
      return;
    }
    if (!this.view.rows.length || !this.columns.length) return;
    if (!this.range) this.range = { r1: 0, c1: 0, r2: 0, c2: 0 };
    if (e.key === "Enter" || e.key === "F2") {
      e.preventDefault();
      this.startEdit(this.range.r2, this.range.c2);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
      e.preventDefault();
      this.attempt(() => this.fillDown());
      return;
    }
    const moves = {
      ArrowDown: [1, 0],
      ArrowUp: [-1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
      Tab: [0, e.shiftKey ? -1 : 1],
      PageDown: [Math.floor(this.viewport.clientHeight / this.rowHeight), 0],
      PageUp: [-Math.floor(this.viewport.clientHeight / this.rowHeight), 0],
      Home: [0, -this.columns.length],
      End: [0, this.columns.length],
    };
    if (moves[e.key]) {
      e.preventDefault();
      const [dr, dc] = moves[e.key],
        r = Math.max(
          0,
          Math.min(this.view.rows.length - 1, this.range.r2 + dr),
        ),
        c = Math.max(0, Math.min(this.columns.length - 1, this.range.c2 + dc));
      this.range =
        e.shiftKey && e.key !== "Tab"
          ? { ...this.range, r2: r, c2: c }
          : { r1: r, c1: c, r2: r, c2: c };
      const top = r * this.rowHeight;
      if (top < this.viewport.scrollTop) this.viewport.scrollTop = top;
      else if (
        top + this.rowHeight >
        this.viewport.scrollTop + this.viewport.clientHeight - 40
      )
        this.viewport.scrollTop =
          top + this.rowHeight - this.viewport.clientHeight + 40;
      this.renderRows();
      this.canvas
        .querySelector(`[data-row="${r}"][data-col="${c}"]`)
        ?.scrollIntoView({ block: "nearest", inline: "nearest" });
      this.renderStatus();
    }
  }
  startEdit(r, c) {
    const row = this.view.rows[r],
      col = this.columns[c];
    if (!row || row.kind !== "row" || !col?.editable || col.value) return;
    const cell = this.canvas.querySelector(
      `[data-row="${r}"][data-col="${c}"]`,
    );
    if (!cell) return;
    this.editing = true;
    const input = node(col.options ? "select" : "input", "aster-editor");
    if (col.options)
      col.options.forEach((v) => input.append(option(String(v))));
    else
      input.type =
        col.type === "date"
          ? "date"
          : col.type === "number"
            ? "number"
            : "text";
    input.value = String(this.model.value(row, col) ?? "");
    cell.replaceChildren(input);
    input.focus();
    input.select?.();
    let done = false;
    const finish = (commit) => {
      if (done) return;
      try {
        if (commit) this.model.edit(row.id, col.id, input.value);
        done = true;
        this.editing = false;
        this.render();
        this.viewport.focus({ preventScroll: true });
      } catch (error) {
        this.error(error);
        input.setAttribute("aria-invalid", "true");
        input.focus();
      }
    };
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        e.preventDefault();
        finish(true);
      }
      if (e.key === "Escape") {
        e.preventDefault();
        finish(false);
      }
    });
    input.addEventListener("blur", () => finish(true));
  }
  copy() {
    const b = this.bounds();
    if (!b) return "";
    const rows = [];
    for (let r = b.r1; r <= b.r2; r++)
      rows.push(
        this.columns
          .slice(b.c1, b.c2 + 1)
          .map((c) => this.cellValue(this.view.rows[r], c)),
      );
    return delimited(rows, "\t", { safe: false });
  }
  paste(text) {
    const b = this.bounds();
    if (!b) return;
    const edits = [];
    parseDelimited(text).forEach((values, ri) =>
      values.forEach((value, ci) => {
        const row = this.view.rows[b.r1 + ri],
          col = this.columns[b.c1 + ci];
        if (row?.kind === "row" && col?.editable && !col.value)
          edits.push({ id: row.id, columnId: col.id, value });
      }),
    );
    this.model.editMany(edits);
  }
  fillDown() {
    const b = this.bounds();
    if (!b) return;
    const edits = [];
    for (let r = b.r1 + 1; r <= b.r2; r++)
      for (let c = b.c1; c <= b.c2; c++) {
        const row = this.view.rows[r],
          col = this.columns[c];
        if (row.kind === "row" && col.editable && !col.value)
          edits.push({
            id: row.id,
            columnId: col.id,
            value: this.cellValue(this.view.rows[b.r1], col),
          });
      }
    this.model.editMany(edits);
  }
  openPanel(title) {
    this.panel.hidden = false;
    this.panel.replaceChildren();
    const top = node("div", "aster-panel-top");
    top.append(
      node("h3", "", title),
      button(
        "×",
        () => {
          this.panel.hidden = true;
          this.viewport.focus();
          this.renderRows();
        },
        "aster-close",
      ),
    );
    this.panel.append(top);
    return this.panel;
  }
  showColumns() {
    const panel = this.openPanel("Columns");
    panel.append(
      node(
        "p",
        "aster-hint",
        "Drag headers to reorder. Pin columns to keep them in view.",
      ),
    );
    for (const c of this.model.columns) {
      const row = node("div", "aster-column-control"),
        label = node("label"),
        check = node("input");
      check.type = "checkbox";
      check.checked = !c.hidden;
      check.addEventListener("change", () =>
        this.model.setColumn(c.id, { hidden: !check.checked }),
      );
      label.append(check, document.createTextNode(" " + (c.title ?? c.id)));
      const pin = node("select");
      pin.setAttribute("aria-label", `Pin ${c.title ?? c.id}`);
      pin.append(
        option("", "Unpinned"),
        option("left", "Left"),
        option("right", "Right"),
      );
      pin.value = c.pinned ?? "";
      pin.addEventListener("change", () =>
        this.model.setColumn(c.id, { pinned: pin.value || null }),
      );
      row.append(label, pin);
      panel.append(row);
    }
  }
  showColumn(c) {
    const panel = this.openPanel(c.title ?? c.id);
    if (this.model.state.pivot) {
      panel.append(
        node(
          "p",
          "",
          "Pivot columns are generated. Change the analysis configuration to update them.",
        ),
      );
      return;
    }
    const op = node("select");
    op.setAttribute("aria-label", "Filter operation");
    [
      "contains",
      "eq",
      "ne",
      "gt",
      "gte",
      "lt",
      "lte",
      "blank",
      "notBlank",
    ].forEach((v) => op.append(option(v)));
    const value = node("input");
    value.placeholder = "Filter value";
    value.setAttribute("aria-label", "Filter value");
    const existing = this.model.state.filters[c.id];
    op.value = existing?.op ?? (c.type === "number" ? "gte" : "contains");
    value.value = existing?.value ?? "";
    panel.append(
      node("h4", "", "Filter"),
      op,
      value,
      button("Apply filter", () => {
        const v =
          c.type === "number"
            ? Number(value.value)
            : c.type === "boolean"
              ? value.value === "true"
              : value.value;
        this.updateQuery({
          filters: {
            ...this.model.state.filters,
            [c.id]: { op: op.value, value: v },
          },
          page: 0,
        });
      }),
      button("Clear filter", () => {
        const filters = { ...this.model.state.filters };
        delete filters[c.id];
        this.updateQuery({ filters, page: 0 });
      }),
    );
    const distinct = [
        ...new Set(this.model.rows.map((r) => this.model.value(r, c))),
      ].slice(0, 200),
      selected = new Set(existing?.op === "in" ? existing.values : distinct);
    const list = node("div", "aster-set-list");
    for (const item of distinct) {
      const label = node("label"),
        check = node("input");
      check.type = "checkbox";
      check.checked = selected.has(item);
      check.addEventListener("change", () =>
        check.checked ? selected.add(item) : selected.delete(item),
      );
      label.append(
        check,
        document.createTextNode(" " + String(item ?? "(blank)")),
      );
      list.append(label);
    }
    panel.append(
      node("h4", "", "Value set (first 200 distinct values)"),
      list,
      button("Apply value set", () =>
        this.updateQuery({
          filters: {
            ...this.model.state.filters,
            [c.id]: { op: "in", values: [...selected] },
          },
          page: 0,
        }),
      ),
    );
  }
  showAnalysis() {
    const panel = this.openPanel("Analyze");
    if (this.options.dataSource) {
      panel.append(
        node(
          "p",
          "",
          "Remote mode displays server pages. Use the headless datasource query for server grouping and pivoting.",
        ),
      );
      return;
    }
    const choose = (label, numeric = false) => {
      const select = node("select");
      select.setAttribute("aria-label", label);
      select.append(option("", "None"));
      this.model.columns
        .filter((c) => !numeric || c.type === "number")
        .forEach((c) => select.append(option(c.id, c.title ?? c.id)));
      panel.append(node("label", "", label), select);
      return select;
    };
    const group = choose("Group rows by");
    group.value = this.model.state.groupBy[0] ?? "";
    panel.append(
      button("Group", () =>
        this.updateQuery({
          groupBy: group.value ? [group.value] : [],
          pivot: null,
          expanded: ["*"],
          page: 0,
        }),
      ),
      button("Expand all", () => this.model.setState({ expanded: ["*"] })),
      button("Collapse all", () => this.model.setState({ expanded: [] })),
    );
    const dimension = choose("Pivot columns"),
      metric = choose("Measure", true),
      agg = node("select");
    agg.setAttribute("aria-label", "Aggregation");
    ["sum", "avg", "min", "max", "count"].forEach((v) => agg.append(option(v)));
    panel.append(
      agg,
      button("Build pivot", () => {
        if (!group.value || !dimension.value || !metric.value) {
          this.error(
            new Error("Choose a row group, pivot column, and measure."),
          );
          return;
        }
        this.updateQuery({
          pivot: {
            rows: [group.value],
            columns: [dimension.value],
            values: [{ id: metric.value, aggregate: agg.value }],
          },
          page: 0,
        });
      }),
    );
    panel.append(
      button("Reset analysis", () =>
        this.updateQuery({ pivot: null, groupBy: [], page: 0 }),
      ),
      node("h4", "", "Chart filtered records"),
    );
    const category = choose("Chart category"),
      measure = choose("Chart value", true),
      type = node("select");
    type.append(option("bar"), option("line"));
    type.setAttribute("aria-label", "Chart type");
    panel.append(
      type,
      button("Create chart", () => {
        if (!category.value || !measure.value) {
          this.error(new Error("Choose a chart category and value."));
          return;
        }
        this.showChart(category.value, measure.value, type.value);
      }),
    );
  }
  showChart(category, value, type = "bar") {
    const panel = this.openPanel("Chart · click to filter"),
      map = new Map();
    for (const row of this.model.filteredRows()) {
      const key = this.model.value(row, category);
      map.set(
        key,
        (map.get(key) ?? 0) + (Number(this.model.value(row, value)) || 0),
      );
    }
    const data = [...map].map(([k, v]) => ({ [category]: k, [value]: v }));
    const svg = chart(data, {
      category,
      value,
      type,
      onSelect: (row) =>
        this.updateQuery({
          filters: {
            ...this.model.state.filters,
            [category]: { op: "eq", value: row[category] },
          },
          page: 0,
        }),
    });
    panel.append(
      svg,
      node(
        "p",
        "aster-hint",
        "Sum by category. Up to 50 categories. Snapshot at creation.",
      ),
      button("Save SVG", () =>
        download(
          new XMLSerializer().serializeToString(svg),
          "aster-chart.svg",
          "image/svg+xml",
        ),
      ),
    );
  }
  showContext(row, c) {
    const panel = this.openPanel("Cell actions");
    panel.append(
      button("Copy range", () =>
        this.attempt(async () => {
          await navigator.clipboard.writeText(this.copy());
        }),
      ),
      button("Fill down", () => this.attempt(() => this.fillDown())),
      button("Filter to this value", () =>
        this.updateQuery({
          filters: {
            ...this.model.state.filters,
            [c.id]: { op: "eq", value: this.cellValue(row, c) },
          },
          page: 0,
        }),
      ),
    );
    if (this.options.detail && row.kind === "row")
      panel.append(
        button("Open row details", () => {
          const detail = this.openPanel("Row details"),
            content = this.options.detail(row.data);
          if (content instanceof Node) detail.append(content);
          else detail.append(node("pre", "", content));
        }),
      );
    for (const item of this.options.contextMenu ?? [])
      panel.append(button(item.label, () => item.action(row.data, this)));
  }
  exportRows({ selected = false } = {}) {
    const rows = this.model.state.pivot
      ? this.model.pivot().rows
      : this.model
          .sortedRows(this.model.filteredRows())
          .map((r) => ({ ...r, kind: "row" }));
    return [
      this.columns.map((c) => c.title ?? c.id),
      ...rows
        .filter((r) => !selected || this.model.selected.has(r.id))
        .map((r) => this.columns.map((c) => this.cellValue(r, c))),
    ];
  }
  exportCSV(options = {}) {
    return delimited(this.exportRows(options));
  }
  exportXLSX(options = {}) {
    return xlsx([
      { name: "Data", rows: this.exportRows(options), freezeHeader: true },
    ]);
  }
  showExport() {
    const panel = this.openPanel("Export");
    panel.append(
      node(
        "p",
        "aster-hint",
        this.options.dataSource
          ? "Exports include the loaded block only."
          : "Exports include filtered records across all pages, in current column order.",
      ),
      button("Download CSV", () =>
        download(this.exportCSV(), "aster-data.csv", "text/csv;charset=utf-8"),
      ),
      button("Download Excel", () =>
        download(
          this.exportXLSX(),
          "aster-data.xlsx",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ),
      ),
      button("Selected rows · CSV", () =>
        download(
          this.exportCSV({ selected: true }),
          "aster-selection.csv",
          "text/csv",
        ),
      ),
    );
  }
  setRows(rows) {
    this.range = null;
    this.model.replaceRows(rows);
  }
  getState() {
    return this.model.getState();
  }
  restoreState(state) {
    this.range = null;
    this.model.restoreState(state);
    if (this.options.dataSource) {
      this.remotePage = 0;
      this.loadRemote();
    }
  }
  destroy() {
    this.destroyed = true;
    this.request++;
    if (this.frame) cancelAnimationFrame(this.frame);
    this.observer?.disconnect();
    this.cleanups.forEach((fn) => fn());
    this.root.remove();
  }
}
