import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
const output = process.env.ASTER_TEST_OUTPUT ?? "test-results";
await mkdir(output, { recursive: true });
const browser = await chromium.launch(
  process.env.ASTER_BROWSER ? { channel: process.env.ASTER_BROWSER } : {},
);
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } }),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto("http://127.0.0.1:4173");
  await page.locator(".aster-row").first().waitFor();
  assert.equal(await page.evaluate(() => grid.view.total), 10000);
  assert(
    (await page.locator(".aster-row").count()) < 40,
    "DOM virtualization bounds rendered rows",
  );
  await page.screenshot({
    path: join(output, "aster-desktop.png"),
    fullPage: true,
  });
  await page.getByRole("searchbox").fill("Northstar");
  assert.equal(await page.evaluate(() => grid.view.filtered), 1250);
  await page.getByRole("searchbox").fill("");
  await page.locator('[data-row="0"][data-col="0"]').dblclick();
  await page.locator(".aster-editor").fill("Edited account");
  await page.locator(".aster-editor").press("Enter");
  assert.equal(
    await page.evaluate(() => grid.model.rows[0].data.account),
    "Edited account",
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  assert.match(
    await page.evaluate(() => grid.model.rows[0].data.account),
    /Acme/,
  );
  await page.locator('[data-row="0"][data-col="5"]').dblclick();
  await page.locator(".aster-editor").fill("-1");
  await page.locator(".aster-editor").press("Enter");
  assert.equal(
    await page.locator(".aster-editor").getAttribute("aria-invalid"),
    "true",
  );
  assert.equal(
    await page.evaluate(() => grid.model.rows[0].data.revenue),
    18000,
  );
  await page.locator(".aster-editor").press("Escape");
  await page.getByRole("button", { name: "Dismiss", exact: true }).click();
  await page.locator('[data-row="0"][data-col="0"]').click();
  await page.locator(".aster-viewport").press("ArrowRight");
  assert.equal(await page.evaluate(() => grid.range.c2), 1);
  await page.locator(".aster-viewport").press("Shift+ArrowDown");
  assert.equal(await page.evaluate(() => grid.range.r2), 1);
  assert.equal(
    await page.evaluate(() => {
      const data = new DataTransfer();
      const event = new ClipboardEvent("copy", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      });
      grid.viewport.dispatchEvent(event);
      return data.getData("text/plain");
    }),
    "North America\r\nEurope",
  );
  await page.evaluate(() => {
    grid.range = { r1: 0, c1: 5, r2: 0, c2: 5 };
    const data = new DataTransfer();
    data.setData("text/plain", "777");
    grid.viewport.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  assert.equal(await page.evaluate(() => grid.model.rows[0].data.revenue), 777);
  await page.evaluate(() => grid.model.undo());
  await page.evaluate(() => {
    grid.range = { r1: 0, c1: 5, r2: 1, c2: 5 };
    grid.paste("123\n456");
  });
  assert.deepEqual(
    await page.evaluate(() =>
      grid.model.rows.slice(0, 2).map((r) => r.data.revenue),
    ),
    [123, 456],
  );
  await page.evaluate(() => grid.model.undo());
  await page.evaluate(() => {
    grid.range = { r1: 0, c1: 5, r2: 1, c2: 5 };
    grid.fillDown();
  });
  assert.equal(
    await page.evaluate(
      () => grid.model.rows[0].data.revenue === grid.model.rows[1].data.revenue,
    ),
    true,
  );
  await page.getByRole("button", { name: "By market", exact: true }).click();
  assert.equal(await page.locator(".aster-group-row").count(), 8);
  await page.locator(".aster-group-toggle").first().click();
  assert.equal(await page.evaluate(() => grid.view.rows.length), 1258);
  await page
    .getByRole("button", { name: "Revenue pivot", exact: true })
    .click();
  assert.equal(await page.evaluate(() => grid.view.rows.length), 8);
  assert.equal(await page.evaluate(() => grid.columns.length), 4);
  await page
    .getByRole("button", { name: "Organization tree", exact: true })
    .click();
  await page.locator(".aster-group-toggle").first().click();
  assert((await page.locator(".aster-group-row").count()) > 8);
  await page.getByRole("button", { name: "Portfolio", exact: true }).click();
  await page
    .getByRole("button", { name: "Options for Revenue", exact: true })
    .click();
  await page.getByLabel("Filter operation", { exact: true }).selectOption("gt");
  await page.getByLabel("Filter value", { exact: true }).fill("100000");
  await page.getByRole("button", { name: "Apply filter", exact: true }).click();
  assert(
    await page.evaluate(() =>
      grid.view.rows.every((r) => r.data.revenue > 100000),
    ),
  );
  await page.getByRole("button", { name: "Clear filter", exact: true }).click();
  await page.getByRole("button", { name: "Columns", exact: true }).click();
  await page.getByLabel("Pin Revenue", { exact: true }).selectOption("right");
  assert.equal(
    await page.evaluate(
      () => grid.model.columns.find((c) => c.id === "revenue").pinned,
    ),
    "right",
  );
  await page.getByRole("button", { name: "Analyze", exact: true }).click();
  await page
    .getByLabel("Chart category", { exact: true })
    .selectOption("market");
  await page.getByLabel("Chart value", { exact: true }).selectOption("revenue");
  await page.getByRole("button", { name: "Create chart", exact: true }).click();
  assert.equal(await page.locator(".aster-chart rect").count(), 8);
  await page.locator(".aster-chart rect").first().click();
  assert.equal(await page.evaluate(() => grid.view.filtered), 1250);
  await page.getByRole("button", { name: "Portfolio", exact: true }).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download Excel", exact: true })
    .click();
  const downloaded = await downloadPromise;
  await downloaded.saveAs(join(output, "aster-export.xlsx"));
  await page.getByRole("button", { name: "Server pages", exact: true }).click();
  await page.waitForFunction(() => grid.remoteTotal === 10000);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.waitForFunction(() => grid.model.rows[0]?.id === "AC-00101");
  await page.getByRole("searchbox").fill("Northstar");
  await page.waitForFunction(
    () =>
      grid.remoteTotal === 1250 && grid.root.getAttribute("aria-busy") === null,
  );
  assert.equal(await page.evaluate(() => grid.view.rows.length), 100);
  await page.getByRole("button", { name: "Portfolio", exact: true }).click();
  await page.evaluate(() => (grid.viewport.scrollTop = 180000));
  await page.waitForFunction(
    () => Number(document.querySelector(".aster-cell").dataset.row) > 4000,
  );
  assert((await page.locator(".aster-row").count()) < 40);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: join(output, "aster-mobile.png"),
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
    "No page-level horizontal overflow",
  );
  await page.getByRole("button", { name: "Columns", exact: true }).click();
  assert(await page.locator(".aster-panel").isVisible());
  await page.evaluate(() => grid.destroy());
  assert.equal(await page.locator(".aster-grid").count(), 0);
  assert.deepEqual(errors, []);
  console.log(
    "Browser integration checks passed: virtualization, editing, undo, clipboard, fill, grouping, pivot, tree, filters, pinning, charts, XLSX, remote pages, responsive layout, cleanup.",
  );
} finally {
  await browser.close();
}
