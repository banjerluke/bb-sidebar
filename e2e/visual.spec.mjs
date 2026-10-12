import { readFileSync } from "node:fs";
import { expect } from "@playwright/test";
import { test, fixture, cli, rpc, shelf, link, expand, reset, open } from "./helpers.mjs";

async function capture(page, testInfo, name) {
  await page.addStyleTag({ path: "e2e/snapshot.css" });
  const sidebar = page.locator("[data-bb-sidebar-root]");
  await expect(sidebar).toHaveScreenshot(name);
  const actual = await sidebar.screenshot({ animations: "disabled" });
  const baseline = readFileSync(testInfo.snapshotPath(name));
  console.log(`SNAPSHOT ${name}: exact PNG match=${actual.equals(baseline)}`);
}

for (const [name, theme, width] of [
  ["light", "light", 320],
  ["dark", "dark", 320],
  ["narrow", "light", 280],
]) {
  test(`sidebar snapshot ${name}`, async ({ page, request }, testInfo) => {
    test.skip(process.platform !== "darwin", "Reviewed baselines are macOS only; Linux runs all behavior flows");
    await reset(request);
    const [atlas, birch, cedar, delta] = fixture.threads;
    await cli(["thread", "pin", atlas.id]);
    await rpc(request, "snooze", { threadId: cedar.id, snoozedUntil: Date.now() + 7 * 86_400_000 });
    await rpc(request, "settle", { threadId: delta.id });
    await open(page, { theme, width });
    for (const name of ["Pinned", "Snoozed", "Settled"]) await expand(page, name);
    await expect(link(page, atlas.title, "Pinned")).toBeVisible();
    await expect(link(page, birch.title)).toBeVisible();
    await expect(link(page, cedar.title, "Snoozed")).toBeVisible();
    await expect(link(page, delta.title, "Settled")).toBeVisible();
    await page.mouse.move(1000, 750);
    const sidebar = page.locator("[data-bb-sidebar-root]");
    expect(Math.round((await sidebar.boundingBox()).width)).toBe(width);
    await capture(page, testInfo, `${name}.png`);
    await expect(shelf(page, "Active").getByRole("link")).toHaveCount(1);
  });
}

test("sidebar snapshot empty Active", async ({ page, request }, testInfo) => {
  test.skip(process.platform !== "darwin", "Reviewed baselines are macOS only; Linux runs all behavior flows");
  await reset(request);
  for (const { id } of fixture.threads) await rpc(request, "settle", { threadId: id });
  await open(page, { empty: true });
  await expect(page.getByText("All clear. Time to touch some grass.")).toBeVisible();
  await expect(page.locator("[data-bb-sidebar-root]").getByRole("link")).toHaveCount(0);
  await page.mouse.move(1000, 750);
  await capture(page, testInfo, "empty.png");
});
