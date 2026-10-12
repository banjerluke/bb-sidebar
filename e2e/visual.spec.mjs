import { expect } from "@playwright/test";
import { test, fixture, cli, rpc, shelf, link, expand, reset, open } from "./helpers.mjs";

for (const [name, theme, width] of [
  ["light", "light", 320],
  ["dark", "dark", 320],
  ["narrow", "light", 280],
]) {
  test(`sidebar snapshot ${name}`, async ({ page, request }) => {
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
    await expect(sidebar).toHaveScreenshot(`${name}.png`, {
      stylePath: "e2e/snapshot.css",
    });
    await expect(shelf(page, "Active").getByRole("link")).toHaveCount(1);
  });
}
