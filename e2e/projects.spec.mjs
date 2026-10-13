import { expect } from "@playwright/test";
import { seededTest as test } from "./seeds.mjs";
import { fixture, rpc, shelf, link, reset, open } from "./helpers.mjs";

test("project filter shows only the chosen project and All projects restores every thread", async ({
  page,
  request,
  secondProject,
}) => {
  await reset(request);
  await open(page);
  await expect(link(page, secondProject.thread.title)).toBeVisible();
  for (const { title } of fixture.threads) await expect(link(page, title)).toBeVisible();
  await page.getByRole("button", { name: "Project scope: All projects", exact: true }).click();
  await page.getByRole("option", { name: secondProject.name, exact: true }).click();
  await expect(page.getByRole("button", { name: `Project scope: ${secondProject.name}`, exact: true })).toBeVisible();
  await expect(shelf(page, "Active").getByRole("link")).toHaveCount(1);
  await expect(link(page, secondProject.thread.title)).toBeVisible();
  for (const { title } of fixture.threads) await expect(link(page, title)).toHaveCount(0);
  await page.getByRole("button", { name: `Project scope: ${secondProject.name}`, exact: true }).click();
  await page.getByRole("option", { name: "All projects", exact: true }).click();
  await expect(shelf(page, "Active").getByRole("link")).toHaveCount(fixture.threads.length + 1);
  for (const { title } of [...fixture.threads, secondProject.thread]) await expect(link(page, title)).toBeVisible();
});

test("custom project color styles persist after reload", async ({ page, request }) => {
  await reset(request);
  await open(page);
  try {
    await page.getByRole("button", { name: /^Settings \(/ }).click();
    await page.getByRole("link", { name: "BB Sidebar", exact: true }).click();
    await page.getByRole("switch", { name: "Project colors", exact: true }).check();
    await page.getByRole("combobox", { name: "Show project stripes in", exact: true }).selectOption("full");
    await expect.poll(async () => (await rpc(request, "getSidebarSettings")).projectColorsEnabled).toBe(true);
    await page.getByRole("combobox", { name: "Project", exact: true }).selectOption(fixture.projectId);
    await page.getByLabel("Project color", { exact: true }).fill("#1f4e79");
    await page.getByRole("button", { name: "Save color", exact: true }).click();
    await expect.poll(async () => (await rpc(request, "getProjectColors")).colors[fixture.projectId]).toBe("#1f4e79");
    await page.getByRole("button", { name: "Home", exact: true }).click();
    const row = shelf(page, "Active")
      .getByRole("listitem")
      .filter({ has: page.getByRole("link", { name: fixture.threads[0].title, exact: true }) });
    for (let pass = 0; pass < 2; pass++) {
      await expect(row.getByText("Sidebar smoke", { exact: true })).toHaveCSS("color", "rgb(31, 78, 121)");
      await expect(row.locator("[data-project-stripe]")).toBeVisible();
      await expect(row.locator("[data-project-stripe]")).toHaveCSS("background-color", "rgb(31, 78, 121)");
      if (pass === 0) await page.reload();
    }
    expect((await rpc(request, "getSidebarSettings")).projectColorsEnabled).toBe(true);
    expect((await rpc(request, "getProjectColors")).colors[fixture.projectId]).toBe("#1f4e79");
  } finally {
    await rpc(request, "setProjectColor", { projectId: fixture.projectId, color: null });
    await rpc(request, "updateSidebarSettings", fixture.defaultSettings);
  }
});
