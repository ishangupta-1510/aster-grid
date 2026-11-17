# Validation record

Validated on November 17, 2026 with Node.js 22.23.2 on Windows.

- `npm test`: 18 tests passed. Covers sorting, composable filtering, grouping, pivot output, atomic edit/undo batches, transactions, tree construction, state, duplicate IDs, remote deduplication/eviction/stale rejection/retry, delimited text, and XLSX structure.
- `npm run check:types`: passed with strict TypeScript and a typed consumer example.
- `npm run test:browser`: passed in Playwright Chromium against the localhost demo. Exercises 10,000 records, bounded row DOM, search, UI edits, rejected negative numeric edits, undo, arrow/Shift navigation, synthetic browser clipboard events, bulk paste, fill, grouping, pivoting, tree expansion, predicate filters, column pinning, chart cross-filtering, file download, remote page/search changes, scroll virtualization, mobile layout, and destruction. No uncaught page errors were recorded.
- XLSX download: Python `zipfile.testzip()` passed CRC validation, every XML part parsed with ElementTree, and `openpyxl` independently read 10,001 rows (header plus 10,000 records), including the expected numeric revenue value.
- Desktop (1440 px) and mobile (390 px) screenshots were visually inspected. The browser check verifies no page-level horizontal overflow at mobile width. Horizontal scrolling inside the grid is intentional.
- `npm install` reported zero known vulnerabilities in the installed development dependencies at the time of the run.

These checks are not a production-readiness certification. OS clipboard permission UI, screen-reader use, Firefox/Safari, touch dragging, extreme row/column counts, long-running streams, all option combinations, and hostile input fuzzing have not been comprehensively tested. Remote tests use a simulated server. Remote checks do not exercise production backend persistence. Differential comparisons cover selected behavior, not complete feature parity.

The browser test requires the demo server in another process on port 4173. It saves screenshots and a workbook in `test-results/` by default (`ASTER_TEST_OUTPUT` overrides that path). Browser installation is needed once. The package contains no browser binary or runtime dependency.
