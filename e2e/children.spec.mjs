import { expect } from "@playwright/test";
import { seededTest as test } from "./seeds.mjs";
import { fixture, cli, shelf, link, menu, reset, open } from "./helpers.mjs";

test("parent child-thread chip expands and collapses its children", async ({ page, request, children }) => {
  await reset(request);
  await open(page);
  const parent = fixture.threads[0];
  for (const child of children) {
    // CLI parenting sends completion reports when stop cancels the empty turn.
    // Assign after stopping via the sidebar so the parent fixture stays idle.
    await (await menu(page, child.title)).getByRole("menuitem", { name: "Parent", exact: true }).hover();
    await page.getByRole("menuitemradio", { name: parent.title, exact: true }).click();
    await expect.poll(async () => (await cli(["thread", "get", child.id])).thread.parentThreadId).toBe(parent.id);
    await expect(link(page, child.title)).toHaveCount(0);
  }
  expect((await cli(["thread", "get", parent.id])).thread.status).toBe("idle");
  const row = shelf(page, "Active")
    .getByRole("listitem")
    .filter({ has: page.getByRole("link", { name: parent.title, exact: true }) });
  const chip = row.getByRole("button", { name: /^2 child threads/ });
  await expect(chip).toBeVisible();
  await expect(chip).toHaveAttribute("aria-expanded", "false");
  await chip.click();
  await expect(chip).toHaveAttribute("aria-expanded", "true");
  const childList = row.getByRole("list", { name: "Child threads", exact: true });
  await expect(childList).toBeVisible();
  await expect(childList.getByRole("button")).toHaveCount(2);
  for (const { title } of children)
    await expect(childList.getByRole("button", { name: new RegExp(title) })).toBeVisible();
  await chip.click();
  await expect(chip).toHaveAttribute("aria-expanded", "false");
  await expect(childList).toBeHidden();
});
