# Architecture and original algorithms

`engine.js` is independent of the browser. It owns shallow record copies keyed by stable IDs, column metadata, immutable state snapshots, selection, and edit journals. Grid state changes emit one event to a subscribing UI.

Filtering composes global text matching, per-column predicates, optional recursive boolean expressions, and an application callback. Stable sorting walks precedence-ordered comparators and places null values last. Grouping recursively partitions records into insertion-ordered maps keyed by JSON-encoded paths; each bucket aggregates its descendant records. Tree construction indexes prefixes and synthesizes missing parents. Pivoting indexes row tuples and column tuples, then reduces each intersection into the requested measures. JSON tuple keys avoid the delimiter collisions of joined string identifiers.

Group/tree nodes flatten according to an expansion set. The special `*` expands all; collapsing from that state materializes currently expanded IDs. Pagination slices the flattened result. These are full recomputations, not an incremental query planner. Filtering is O(rows × inspected columns), sorting O(rows log rows), grouping O(rows × depth), and pivoting adds the cost of materialized intersections. Very deep paths and very wide pivots are application-controlled and have no automatic complexity limit.

Edits prepare all conversions and validations before applying mutations. Multiple changes to the same target within one batch collapse to a final value while retaining the original undo value. History stores before/after values. Transactions stage a new ID map and only commit after validation, clearing edit history. Client-side edits do not imply persistence; applications own their backend.

`grid.js` renders a fixed-height virtual row window with overscan into a scroll-height canvas. Headers and pinned columns use sticky positioning. The UI only creates DOM nodes and uses text content for raw values, so a string is never implicitly treated as HTML. Render callbacks are trusted application code and can return DOM nodes. The keyboard handler manages a single rectangular range, while clipboard handlers translate range values to/from quoted TSV. Editing keeps the input mounted during scrolling to avoid losing a user's edit. Layout/theme values come from `style.css`.

`RemoteDataSource` indexes a flat block cache by page index and serialized query. Shared in-flight promises deduplicate identical loads; read access updates LRU order. A monotonically increasing generation rejects responses from invalidated requests even if a fetcher ignores abort. UI request IDs independently reject out-of-order view updates. Cache keys assume serializable, consistently ordered query objects.

`export.js` writes delimited text with escaping and optional formula-prefix neutralization. Its XLSX writer implements CRC32, ZIP store records, the central directory, and a small OOXML package containing inline-string/numeric/boolean cells. No copied ZIP or spreadsheet implementation is used. The entire workbook is built in memory; ZIP64, compression, workbook formulas and advanced spreadsheet styling are intentionally absent. `charts.js` draws original SVG geometry for simple chart types.

## Extension points

- Add pure transformations and test their interaction with grouping, filtering and history.
- Extend format writers without coupling export to browser rendering.
- Add component adapters around the core lifecycle instead of duplicating the engine.
- Add chart modules through exported data access, keeping grid data authoritative.
- Keep API gaps explicit; do not alias commercial APIs without matching their semantics.

## Current engineering limits

No broad performance, accessibility, security, localization or cross-browser certification is claimed. Tests cover useful paths, not every option combination. All columns render in each visible row, so wide datasets need horizontal virtualization. DOM re-rendering uses replacement rather than keyed reconciliation; editing freezes the row window temporarily. Selection/state updates recompute the client view. Chart rendering and tree generation use bounded-by-input recursion/arrays and need further robustness work for adversarial sizes. This is an extensible starting codebase, not a completed commercial-scale grid.
