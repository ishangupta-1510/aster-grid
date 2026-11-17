# Feature coverage — 0.1.0

This is an honest implementation inventory, not a claim of feature equivalence. “Implemented” means the behavior below exists; it does not mean every variant of the corresponding commercial feature exists.

| Area                                      | Status      | Actual behavior and boundary                                                                                                                                        |
| ----------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Data pipeline                             | Implemented | Headless filter → stable multi-sort → tree/group/pivot → flatten → page                                                                                             |
| Columns                                   | Implemented | Literal fields, calculated callbacks, formatters, custom DOM renderers, visibility, drag reordering, resizing, left/right pinning                                   |
| Grouped column headers                    | Missing     | No nested header bands                                                                                                                                              |
| Sorting                                   | Implemented | Multi-column, locale strings, numeric comparison, custom comparators, nulls last; pivot result sorting is missing                                                   |
| Filters                                   | Implemented | Text/number/date-string/boolean predicates, ranges, sets, AND/OR expressions, quick and external filtering                                                          |
| Filter UI                                 | Partial     | Single column predicate editor and checkboxes for first 200 distinct loaded values; no searchable set lists or visual advanced-expression builder                   |
| Row grouping                              | Implemented | Multiple keys through API, stable path IDs, expansion/collapse, counts and aggregate cells; UI chooses one grouping field                                           |
| Aggregation                               | Implemented | Sum, count, min, max, average, first, last and custom function; no grand-total UI row or percent-of-parent transforms                                               |
| Pivoting                                  | Partial     | Multiple row/column dimensions and measures through API, generated result columns; no totals, nested pivot headers, or pivot-specific editing/sorting               |
| Tree data                                 | Partial     | Unique data paths, synthesized parents, retained parent records, expansion; no parent-ID/nested-input adapter, editing, hierarchy selection, or tree drag           |
| Master/detail                             | Partial     | Custom detail content in a side panel; no automatic inline nested grids, height synchronization, or recursive lifecycle                                             |
| Local pagination                          | Implemented | Page-size API and previous/next controls; pagination slices flattened nodes, not whole group blocks                                                                 |
| Remote data                               | Partial     | Abortable flat page cache, request deduplication, LRU eviction, stale result rejection and retry API                                                                |
| Server hierarchy/infinite/viewport models | Missing     | No automatic server group expansion, infinite-scroll row loading, or live viewport subscription                                                                     |
| Virtualization                            | Partial     | Fixed-height row virtualization with overscan; all visible columns render; no variable-height or horizontal column virtualization                                   |
| Selection                                 | Partial     | Row checkboxes and one rectangular cell range using Shift-click/keyboard; no disjoint ranges or hierarchical selection                                              |
| Editing                                   | Implemented | Text, numeric, ISO date and select controls; boolean parsing; custom parser and validator; atomic multi-edit API                                                    |
| Editing extensions                        | Missing     | No rich autocomplete editor, async validation, full-row editor, drag fill handle, or batch staging UI                                                               |
| Undo/redo                                 | Implemented | Bounded batch history for edits, paste, fill; replacement/transactions clear history                                                                                |
| Clipboard                                 | Implemented | Quoted TSV, multiline cells, selection copy and editable paste; no HTML clipboard, browser cut integration, or spreadsheet import                                   |
| Fill                                      | Partial     | Copy first selected row down through API/Ctrl+D; no series inference or drag handle                                                                                 |
| Transactions                              | Implemented | Atomic validation of add/update/remove IDs; no incremental aggregation or high-frequency scheduling                                                                 |
| Charts                                    | Partial     | Original SVG bar/line, summed categories, click-to-filter, SVG download; 50-category cap, snapshot updates                                                          |
| Sparklines                                | Partial     | SVG numeric line; no area/bar variants, axis configuration or interactive tooltip                                                                                   |
| Chart ecosystem                           | Missing     | No chart designer, financial/statistical/geospatial charts, chart persistence, range chart or pivot chart UI                                                        |
| Tool panels and menus                     | Implemented | Column controls, filter panel, analysis controls, export, contextual cell actions, custom actions, selection summaries                                              |
| Export                                    | Partial     | Safe CSV; real typed XLSX with multiple sheets through API and frozen header; no styling, workbook formulas, images, hyperlinks, Excel tables, encryption or import |
| Formulas                                  | Missing     | Derived value callbacks only; no spreadsheet formula language or reference engine                                                                                   |
| Row features                              | Missing     | Row drag, row pinning, row/cell spans, full-width embedded rows and variable height                                                                                 |
| State                                     | Implemented | Serializable data-view state, columns and row selection; charts, ranges, callbacks and history excluded                                                             |
| Themes                                    | Implemented | Original CSS, light/dark colors, responsive toolbar/panel, CSS variables; no visual theme editor                                                                    |
| Keyboard/ARIA                             | Partial     | Grid/row/cell semantics, row selection, keyboard navigation, edit shortcuts and labels; no audited WCAG/screen-reader certification                                 |
| Localization/RTL                          | Missing     | English UI labels, no full RTL pinning/navigation implementation                                                                                                    |
| Frameworks                                | Partial     | Vanilla DOM API and generic TypeScript definitions; mount/unmount adapters can be authored by consumers                                                             |
| Other integrations                        | Missing     | No PDF export, print layout, Excel import, cell notes, find panel, aligned grids, AI/MCP features or external drop zones                                            |

## Reference and independence

The public [AG Grid feature overview](https://www.ag-grid.com/javascript-data-grid/key-features/) and [Community/Enterprise comparison](https://www.ag-grid.com/javascript-data-grid/community-vs-enterprise/) were consulted on November 17, 2026 to identify feature categories. Documentation also lists capabilities such as formulas and import/export beyond the initial comparison. This matrix describes our own implementation, not a complete or frozen catalog of AG Grid's product. No AG Grid source or styles were copied or inspected for this delivery.

## Next milestones

1. Fix defects discovered by consumer use; add browser interaction and accessibility coverage.
2. Implement horizontal virtualization, incremental data transforms and large-data benchmarks.
3. Build server group/tree protocol and lazy expansion with consistent selection semantics.
4. Add inline detail grids, hierarchical selection and controlled framework adapters.
5. Expand workbook support, formula language and visualization capabilities as independent modules.

Each milestone requires its own design, implementation and testing. There is no implied completion date or assertion that the current code is production-equivalent to AG Grid Enterprise.
